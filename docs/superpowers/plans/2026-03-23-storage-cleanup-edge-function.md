# Storage Cleanup Edge Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Supabase Edge Function that daily deletes orphaned map files from Storage whose session IDs no longer exist in the `sessions` table.

**Architecture:** A single Deno edge function (`supabase/functions/cleanup-orphaned-maps/index.ts`) exports a testable `runCleanup(supabase)` function and a thin HTTP handler that enforces POST-only and `CRON_SECRET` auth. Business logic lives in `runCleanup` so it can be unit-tested with a mocked Supabase client. The function is triggered daily at 03:30 UTC via Supabase Scheduled Functions (dashboard).

**Tech Stack:** Deno, Supabase JS v2 (via esm.sh CDN), Deno standard library for assertions in tests.

**Spec:** `docs/superpowers/specs/2026-03-23-storage-cleanup-edge-function-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/functions/cleanup-orphaned-maps/index.ts` | Create | Edge function: HTTP handler + exported `runCleanup` logic |
| `supabase/functions/cleanup-orphaned-maps/index.test.ts` | Create | Deno unit tests for `runCleanup` |

No migrations, no app-layer changes, no new env vars in `.env` (secrets live in Supabase dashboard).

---

## Task 1: Scaffold the edge function with auth + method guards

**Files:**
- Create: `supabase/functions/cleanup-orphaned-maps/index.ts`

- [ ] **Step 1: Create the function file with method guard, auth guard, and a stub handler**

```typescript
// supabase/functions/cleanup-orphaned-maps/index.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface CleanupError {
  prefix: string;
  message: string;
}

export interface CleanupResult {
  checked: number;
  orphaned: number;
  deleted: number;
  files_deleted: number;
  errors: CleanupError[];
}

// Exported so it can be unit-tested with a mock client.
export async function runCleanup(supabase: SupabaseClient): Promise<CleanupResult> {
  // Stub — implemented in Task 2.
  return { checked: 0, orphaned: 0, deleted: 0, files_deleted: 0, errors: [] };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const result = await runCleanup(supabase);
    console.log("cleanup-orphaned-maps:", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cleanup-orphaned-maps error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Commit the scaffold**

```bash
git add supabase/functions/cleanup-orphaned-maps/index.ts
git commit -m "feat: scaffold cleanup-orphaned-maps edge function"
```

---

## Task 2: Write failing tests for `runCleanup`

**Files:**
- Create: `supabase/functions/cleanup-orphaned-maps/index.test.ts`

The tests import `runCleanup` and pass in a mock Supabase client. They do NOT spin up an HTTP server — the HTTP handler guards are thin and verified manually in Task 4.

- [ ] **Step 1: Create the test file**

```typescript
// supabase/functions/cleanup-orphaned-maps/index.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runCleanup } from "./index.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Mock builder
// Each field is the full {data, error} response for that API call.
// ---------------------------------------------------------------------------
function makeMock({
  listRoot = { data: [] as Array<{ name: string }>, error: null },
  sessions = { data: [] as Array<{ id: string }>, error: null },
  listPrefix = { data: [] as Array<{ name: string }>, error: null },
  remove = { error: null },
}: {
  listRoot?: { data: Array<{ name: string }>; error: null | { message: string } };
  sessions?: { data: Array<{ id: string }>; error: null | { message: string } };
  listPrefix?: { data: Array<{ name: string }>; error: null | { message: string } };
  remove?: { error: null | { message: string } };
} = {}): SupabaseClient {
  return {
    storage: {
      from: (_bucket: string) => ({
        list: (prefix: string, _opts?: unknown) =>
          Promise.resolve(prefix === "" ? listRoot : listPrefix),
        remove: (_paths: string[]) => Promise.resolve(remove),
      }),
    },
    from: (_table: string) => ({
      select: (_cols: string) => ({
        in: (_col: string, _vals: string[]) => Promise.resolve(sessions),
      }),
    }),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("empty bucket returns all zeros", async () => {
  const result = await runCleanup(makeMock());
  assertEquals(result, { checked: 0, orphaned: 0, deleted: 0, files_deleted: 0, errors: [] });
});

Deno.test("all prefixes have live sessions — no deletions", async () => {
  const result = await runCleanup(
    makeMock({
      listRoot: { data: [{ name: "sess-1" }, { name: "sess-2" }], error: null },
      sessions: { data: [{ id: "sess-1" }, { id: "sess-2" }], error: null },
    }),
  );
  assertEquals(result, { checked: 2, orphaned: 0, deleted: 0, files_deleted: 0, errors: [] });
});

Deno.test("orphaned prefix with two files — deleted and counted", async () => {
  const result = await runCleanup(
    makeMock({
      listRoot: { data: [{ name: "sess-orphan" }, { name: "sess-live" }], error: null },
      sessions: { data: [{ id: "sess-live" }], error: null },
      listPrefix: { data: [{ name: "map.png" }, { name: "map-old.png" }], error: null },
    }),
  );
  assertEquals(result, {
    checked: 2,
    orphaned: 1,
    deleted: 1,
    files_deleted: 2,
    errors: [],
  });
});

Deno.test("orphaned prefix with no files — skipped, not an error", async () => {
  const result = await runCleanup(
    makeMock({
      listRoot: { data: [{ name: "sess-orphan" }], error: null },
      sessions: { data: [], error: null },
      listPrefix: { data: [], error: null },
    }),
  );
  assertEquals(result, { checked: 1, orphaned: 1, deleted: 0, files_deleted: 0, errors: [] });
});

Deno.test("storage root list fails — throws", async () => {
  let threw = false;
  try {
    await runCleanup(
      makeMock({ listRoot: { data: [], error: { message: "network error" } } }),
    );
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("sessions query fails — throws", async () => {
  let threw = false;
  try {
    await runCleanup(
      makeMock({
        listRoot: { data: [{ name: "sess-1" }], error: null },
        sessions: { data: [], error: { message: "db error" } },
      }),
    );
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("remove fails for one prefix — recorded in errors, others continue", async () => {
  // Two orphaned prefixes; remove always fails.
  // Note: makeMock uses a single shared listPrefix response for all prefix calls.
  const result = await runCleanup(
    makeMock({
      listRoot: { data: [{ name: "orphan-a" }, { name: "orphan-b" }], error: null },
      sessions: { data: [], error: null },
      listPrefix: { data: [{ name: "map.png" }], error: null },
      remove: { error: { message: "storage error" } },
    }),
  );
  assertEquals(result.orphaned, 2);
  assertEquals(result.deleted, 0);
  assertEquals(result.files_deleted, 0);
  assertEquals(result.errors.length, 2);
  assertEquals(result.errors[0].message, "storage error");
});

Deno.test("per-prefix list fails — recorded in errors, prefix not counted as deleted", async () => {
  const result = await runCleanup(
    makeMock({
      listRoot: { data: [{ name: "orphan-a" }], error: null },
      sessions: { data: [], error: null },
      listPrefix: { data: [], error: { message: "list error" } },
    }),
  );
  assertEquals(result.orphaned, 1);
  assertEquals(result.deleted, 0);
  assertEquals(result.files_deleted, 0);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].prefix, "orphan-a");
  assertEquals(result.errors[0].message, "list error");
});
```

- [ ] **Step 2: Run the tests — expect failures because `runCleanup` is still the stub**

```bash
deno test supabase/functions/cleanup-orphaned-maps/index.test.ts --allow-env
```

Expected output: most tests FAIL with assertion errors (stub returns all-zeros regardless of input). "empty bucket returns all zeros" will pass. That is correct.

- [ ] **Step 3: Commit the test file**

```bash
git add supabase/functions/cleanup-orphaned-maps/index.test.ts
git commit -m "test: add unit tests for runCleanup (failing — stub not implemented)"
```

---

## Task 3: Implement `runCleanup` to pass all tests

**Files:**
- Modify: `supabase/functions/cleanup-orphaned-maps/index.ts`

- [ ] **Step 1: Replace the stub body of `runCleanup` with the full implementation**

Replace the entire `runCleanup` function (the stub body only — keep the signature and surrounding file unchanged):

```typescript
export async function runCleanup(supabase: SupabaseClient): Promise<CleanupResult> {
  const result: CleanupResult = {
    checked: 0,
    orphaned: 0,
    deleted: 0,
    files_deleted: 0,
    errors: [],
  };

  // 1. List top-level prefixes (one per session ID) in the maps bucket.
  const { data: prefixEntries, error: listError } = await supabase.storage
    .from("maps")
    .list("", { limit: 1000 });

  if (listError) throw new Error(`Storage list failed: ${listError.message}`);
  if (!prefixEntries || prefixEntries.length === 0) return result;

  const prefixes = prefixEntries.map((e: { name: string }) => e.name);
  result.checked = prefixes.length;

  // 2. Find which prefixes still have a live session row.
  const { data: sessions, error: queryError } = await supabase
    .from("sessions")
    .select("id")
    .in("id", prefixes);

  if (queryError) throw new Error(`Sessions query failed: ${queryError.message}`);

  const liveIds = new Set((sessions ?? []).map((s: { id: string }) => s.id));
  const orphaned = prefixes.filter((p: string) => !liveIds.has(p));
  result.orphaned = orphaned.length;

  // 3. Delete each orphaned prefix's files.
  for (const prefix of orphaned) {
    const { data: files, error: filesError } = await supabase.storage
      .from("maps")
      .list(prefix, { limit: 1000 });

    if (filesError) {
      result.errors.push({ prefix, message: filesError.message });
      continue;
    }

    if (!files || files.length === 0) continue;

    const paths = files.map((f: { name: string }) => `${prefix}/${f.name}`);
    const { error: removeError } = await supabase.storage.from("maps").remove(paths);

    if (removeError) {
      result.errors.push({ prefix, message: removeError.message });
      continue;
    }

    result.deleted += 1;
    result.files_deleted += files.length;
  }

  return result;
}
```

- [ ] **Step 2: Run the tests — all should pass**

```bash
deno test supabase/functions/cleanup-orphaned-maps/index.test.ts --allow-env
```

Expected output:
```
running 7 tests from ./supabase/functions/cleanup-orphaned-maps/index.test.ts
empty bucket returns all zeros ... ok
all prefixes have live sessions — no deletions ... ok
orphaned prefix with two files — deleted and counted ... ok
orphaned prefix with no files — skipped, not an error ... ok
storage root list fails — throws ... ok
sessions query fails — throws ... ok
remove fails for one prefix — recorded in errors, others continue ... ok

ok | 7 passed | 0 failed
```

- [ ] **Step 3: Commit the implementation**

```bash
git add supabase/functions/cleanup-orphaned-maps/index.ts
git commit -m "feat: implement runCleanup logic in cleanup-orphaned-maps edge function"
```

---

## Task 4: Manual integration verification + dashboard setup

This task is performed by a human with access to the Supabase dashboard and a terminal. No code changes.

- [ ] **Step 1: Deploy the edge function**

```bash
npx supabase functions deploy cleanup-orphaned-maps
```

Expected: function appears in Supabase dashboard → Edge Functions.

- [ ] **Step 2: Set the `CRON_SECRET` secret**

In the Supabase dashboard → Edge Functions → `cleanup-orphaned-maps` → Secrets, add:

```
CRON_SECRET = <generate a strong random string, e.g. openssl rand -hex 32>
```

Note the value — you'll need it for the scheduled function and for manual testing.

- [ ] **Step 3: Verify auth guard rejects unauthenticated and wrong-secret requests**

No auth header:
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cleanup-orphaned-maps
```
Expected: `Unauthorized` with HTTP 401.

Wrong secret:
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cleanup-orphaned-maps \
  -H "Authorization: Bearer wrong-secret"
```
Expected: `Unauthorized` with HTTP 401.

- [ ] **Step 4: Verify method guard rejects GET**

```bash
curl -X GET https://<project-ref>.supabase.co/functions/v1/cleanup-orphaned-maps \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Expected response: `Method Not Allowed` with HTTP 405.

- [ ] **Step 5: Trigger a manual cleanup and verify the response**

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cleanup-orphaned-maps \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Expected response (values will vary):
```json
{
  "checked": 5,
  "orphaned": 0,
  "deleted": 0,
  "files_deleted": 0,
  "errors": []
}
```

Check the Supabase dashboard → Edge Functions → Logs to confirm the `console.log` output appears.

- [ ] **Step 6: Configure the daily schedule in the Supabase dashboard**

Navigate to: Supabase dashboard → Edge Functions → `cleanup-orphaned-maps` → Schedule (or via Cron Jobs if your project tier shows it there).

Create a scheduled trigger:
- **Schedule:** `30 3 * * *` (03:30 UTC daily)
- **HTTP method:** POST
- **Headers:** `Authorization: Bearer <CRON_SECRET>`

Save the schedule.

- [ ] **Step 7: Commit a note confirming deployment**

```bash
git commit --allow-empty -m "chore: cleanup-orphaned-maps edge function deployed and scheduled at 03:30 UTC"
```
