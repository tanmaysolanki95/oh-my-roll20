// supabase/functions/cleanup-orphaned-maps/index.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runCleanup } from "./index.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Mock builder
// Each field is the full {data, error} response for that API call.
// Note: listPrefix is a single shared response for ALL per-prefix list calls.
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
