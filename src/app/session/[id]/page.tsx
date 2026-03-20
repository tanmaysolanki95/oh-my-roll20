export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SessionView from "./SessionView";
import type { Session } from "@/types";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) notFound();

  return <SessionView sessionId={id} initialSession={data as Session} />;
}
