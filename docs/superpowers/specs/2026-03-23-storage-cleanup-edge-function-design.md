# Storage Cleanup Edge Function — Design Spec

**Date:** 2026-03-23
**Status:** Approved

---

## Problem

When the `stale-sessions-ttl` pg_cron job deletes sessions older than 30 days, it cascades to `tokens` and `dice_rolls` via foreign key constraints. However, map image files in the Supabase Storage `maps` bucket are not part of the FK graph and are left behind as orphaned objects. The DM-triggered `cleanupSessionStorage()` function covers explicit session terminations, but not cron-driven deletions. Over time, orphaned files accumulate and waste storage quota.

**Inherited TTL caveat:** The existing pg_cron TTL considers a session "inactive" if no token was *created* in the last 30 days. It does not track last map upload, dice roll, or token move. This means a session can be deleted by the TTL (and its storage cleaned up here) even if it had recent non-token-creation activity. This edge function inherits that behavior — it does not change or fix the TTL definition.

---

## Goal

A Supabase Edge Function that runs daily, identifies storage objects in the `maps` bucket whose session ID prefix no longer exists in the `sessions` table, and deletes them. Reports counts of checked, orphaned, and deleted files in its response and logs.

---

## Architecture

### Function location

```
supabase/functions/cleanup-orphaned-maps/index.ts
```

A single Deno edge function. Uses the auto-injected `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables — no extra secrets configuration required beyond a `CRON_SECRET` (see Auth below).

### Schedule

Triggered daily at **03:30 UTC** via Supabase scheduled functions (dashboard). This runs 30 minutes after the `stale-sessions-ttl` pg_cron job (03:00 UTC), ensuring deleted sessions are committed before the cleanup pass begins.

### Auth

The Supabase scheduler does **not** automatically inject credentials when invoking an edge function. The standard pattern is a dedicated `CRON_SECRET` env var:

1. Set `CRON_SECRET` as an edge function secret in the Supabase dashboard.
2. Configure the scheduled function in the dashboard to send `Authorization: Bearer {CRON_SECRET}` as a request header.
3. The function validates this header on every request and returns `401` if it is absent or incorrect.

This ensures only the scheduler (and authorized operators) can trigger the function.

---

## Execution Flow

Storage paths follow the format `{session_id}/{filename}`. The `maps` bucket is public but the function uses the service-role client to list and delete objects.

1. Create a service-role Supabase client (bypasses RLS).
2. **List top-level prefixes:** Call `storage.from('maps').list('', { limit: 1000 })` at the bucket root. Supabase Storage returns one entry per top-level "folder" (i.e., one per session ID prefix). **Assumption:** this project will not exceed 1000 session prefixes; a single paginated call with `limit: 1000` is sufficient. If this assumption breaks in the future, the list call must be replaced with a paginated loop.
3. Extract session IDs from the returned prefix entries (`entry.name`).
4. If no prefixes are found, return `{ checked: 0, orphaned: 0, deleted: 0, files_deleted: 0, errors: [] }` and exit.
5. **Batch-query sessions:** `SELECT id FROM sessions WHERE id = ANY($prefixes)`. If this query fails, return 500 — do not delete anything without confirming what is orphaned.
6. Compute set difference: prefixes not in the query result are orphaned.
7. For each orphaned prefix:
   a. Call `storage.from('maps').list(prefix, { limit: 1000 })` to get individual file paths within it. **Assumption:** no single session will have more than 1000 uploaded maps. If the prefix has no files (session was created but no map was ever uploaded), skip — this is not an error.
   b. Call `storage.from('maps').remove([...paths])` to delete all files.
   c. On failure: log the error, add `{ prefix, message }` to the errors array, continue. Failed prefixes are counted in `orphaned` but not in `deleted`.
8. Return and log a JSON summary.

The function is **idempotent** — re-running it is safe.

---

## Interface

**Method:** `POST` only. Prevents accidental GET triggers from browsers or bots.

**Response (200):**
```json
{
  "checked": 12,
  "orphaned": 3,
  "deleted": 3,
  "files_deleted": 7,
  "errors": []
}
```

| Field | Description |
|---|---|
| `checked` | Unique session ID prefixes found in storage |
| `orphaned` | Prefixes with no matching row in `sessions` |
| `deleted` | Orphaned prefixes successfully cleaned up (less than `orphaned` when errors occur) |
| `files_deleted` | Total individual files removed across all deleted prefixes |
| `errors` | Array of `{ prefix, message }` for failed deletions |

All fields are also logged to stdout for visibility in the Supabase edge function logs dashboard.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Storage root list fails | Return 500 immediately — nothing to do without the prefix list |
| Sessions query fails | Return 500 — don't delete anything without confirming what's orphaned |
| Individual prefix delete fails | Log error, continue with remaining prefixes, include in `errors` array |
| Prefix exists in storage but session row exists | Skipped — not orphaned |
| Prefix exists in storage but has no files | Skipped — harmless, not an error |
| Empty bucket | Return 200 with all counts at 0 — normal for a fresh project |
| Race: session deleted mid-run | Files remain and are cleaned up on the next daily run — no data loss |

---

## Out of Scope

- Dry-run mode — not needed; the function is idempotent and the logs provide sufficient visibility.
- Fixing the TTL activity signal — the "no tokens created in 30 days" definition is a pre-existing design decision, not addressed here.
- Pagination beyond 1000 prefixes or 1000 files per prefix — out of scope for this project's scale.

## Manual Triggers

Operators can manually trigger a cleanup at any time by sending a `POST` request with `Authorization: Bearer {CRON_SECRET}`. This is useful after a one-off mass session purge or for debugging. The function's response body and logs provide a full summary of what was cleaned.

**Scheduling buffer note:** The 30-minute offset between the pg_cron TTL job (03:00) and this function (03:30) is a practical buffer, not a hard guarantee. If the TTL job takes longer than 30 minutes on an unusually large dataset, some just-deleted sessions may be missed in the same run. They will be caught on the next daily invocation. This is acceptable given the idempotency guarantee.

---

## Free Tier Impact

Supabase free tier allows 500,000 edge function invocations/month. One daily invocation = ~30/month. No concern. Storage quota savings are the motivation for this function, not a cost risk.
