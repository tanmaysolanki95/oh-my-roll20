# Storage Cleanup Edge Function — Design Spec

**Date:** 2026-03-23
**Status:** Approved

---

## Problem

When the `stale-sessions-ttl` pg_cron job deletes sessions older than 30 days, it cascades to `tokens` and `dice_rolls` via foreign key constraints. However, map image files in the Supabase Storage `maps` bucket are not part of the FK graph and are left behind as orphaned objects. The DM-triggered `cleanupSessionStorage()` function covers explicit session terminations, but not cron-driven deletions. Over time, orphaned files accumulate and waste storage quota.

---

## Goal

A Supabase Edge Function that runs daily, identifies storage objects in the `maps` bucket whose session ID prefix no longer exists in the `sessions` table, and deletes them. Reports a count of checked, orphaned, and deleted files in its response and logs.

---

## Architecture

### Function location

```
supabase/functions/cleanup-orphaned-maps/index.ts
```

A single Deno edge function. Uses the auto-injected `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables — no extra secrets configuration required.

### Schedule

Triggered daily at **03:30 UTC** via Supabase scheduled functions (dashboard). This runs 30 minutes after the `stale-sessions-ttl` pg_cron job (03:00 UTC), ensuring deleted sessions are committed before the cleanup pass begins.

### Auth

- The Supabase scheduler invokes the function with the service role automatically.
- For any other caller, the function validates the `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` header and returns `401` if absent. This prevents unauthorized invocations.

---

## Execution Flow

1. Create a service-role Supabase client (bypasses RLS).
2. List all objects in the `maps` bucket (flat list).
3. Extract unique session ID prefixes from object paths (`{session_id}/filename` → `session_id`).
4. Batch-query the `sessions` table: `SELECT id FROM sessions WHERE id = ANY($prefixes)`.
5. Compute set difference: prefixes not in the query result are orphaned.
6. For each orphaned prefix, collect all its object paths and call `storage.from('maps').remove([...paths])`.
7. Return and log a JSON summary.

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
  "errors": []
}
```

| Field | Description |
|---|---|
| `checked` | Unique session ID prefixes found in storage |
| `orphaned` | Prefixes with no matching row in `sessions` |
| `deleted` | Prefixes successfully cleaned up |
| `errors` | Array of `{ prefix, message }` for failed deletions |

All fields are also logged to stdout for visibility in the Supabase edge function logs dashboard.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Storage list fails | Return 500 immediately — nothing to do without the object list |
| Sessions query fails | Return 500 — don't delete anything without confirming what's orphaned |
| Individual prefix delete fails | Log error, continue with remaining prefixes, include in `errors` array |
| Empty bucket | Return 200 with all counts at 0 — normal for a fresh project |
| Race: session deleted mid-run | Files remain and are cleaned up on the next daily run — no data loss |

---

## Out of Scope

- Dry-run mode — not needed; the function is idempotent and the logs provide sufficient visibility.
- Recency guard (skip files uploaded in the last N minutes) — the race window between session creation and storage upload is negligible in practice.
- Schema migrations — no DB changes required.

---

## Free Tier Impact

Supabase free tier allows 500,000 edge function invocations/month. One daily invocation = ~30/month. No concern. Storage quota savings are the motivation for this function, not a cost risk.
