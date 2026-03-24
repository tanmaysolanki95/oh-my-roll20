import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  // 1. Verify caller auth — they must supply a valid Supabase JWT.
  //    The client obtains this from supabase.auth.getSession().
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  // Verify the JWT by asking Supabase to return the user it belongs to.
  // We use the anon key + Authorization override so Supabase validates
  // the JWT signature without accepting arbitrary service-role abuse.
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse multipart form data.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  const sessionId = form.get("sessionId");

  // File extends Blob; Next.js App Router may return Blob rather than File
  // depending on the runtime version, so check for Blob (the common ancestor).
  if (!(file instanceof Blob) || typeof sessionId !== "string" || !sessionId) {
    return NextResponse.json({ error: "Missing file or sessionId" }, { status: 400 });
  }

  // 3. Validate file type and size server-side.
  //    The client also validates, but this is the authoritative check.
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only image files are allowed (PNG, JPG, GIF, WebP, SVG)." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large — maximum 20 MB." },
      { status: 400 }
    );
  }

  // 4. Verify caller is the session owner.
  //    Service client bypasses RLS so we can check ownership
  //    without relying on the potentially restricted user client.
  const service = createServiceClient();
  const { data: session } = await service
    .from("sessions")
    .select("owner_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 5. Upload via service role (bypasses the RLS INSERT restriction).
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${sessionId}/map.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await service.storage
    .from("maps")
    .upload(path, bytes, { upsert: true, contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = service.storage.from("maps").getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}
