# Deploying oh-my-roll20

## Prerequisites

- The repo pushed to GitHub
- A Supabase project with the schema applied (see README)
- A Vercel account (free)

---

## Step 1 — Vercel: import the project

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. **Import Git Repository** → find `oh-my-roll20` → **Import**
3. Vercel auto-detects Next.js. Leave all framework settings as defaults.

## Step 2 — Vercel: add environment variables

Before clicking Deploy, expand **Environment Variables** and add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon/public JWT key |

Both values are in your Supabase project under **Project Settings → Data API**.

## Step 3 — Deploy

Click **Deploy**. Takes about 60 seconds. You'll receive a URL like `oh-my-roll20.vercel.app`.

## Step 4 — Supabase: allow your production URL

Supabase rejects anonymous auth requests from unknown origins by default.

**Supabase Dashboard → Authentication → URL Configuration:**

- **Site URL**: `https://oh-my-roll20.vercel.app`
- **Redirect URLs**: add `https://oh-my-roll20.vercel.app/**`

Click **Save**.

## Step 5 — Verify

Open your production URL, create a session, and confirm:
- You're redirected to `/session/<id>`
- Tokens can be added and appear on the map
- Opening the same URL in a second browser tab shows both clients in the presence bar

---

## Subsequent deploys

Every push to `main` triggers an automatic Vercel redeploy. No manual steps needed.

## Custom domain (optional)

In Vercel: **Project → Settings → Domains** → add your domain.
Then update the **Site URL** in Supabase to match.

## Environment variables for local dev vs production

Vercel keeps separate env var sets per environment (Production, Preview, Development).
The two `NEXT_PUBLIC_*` vars only need to be set for **Production** (and optionally Preview if you use preview deployments).

Local development uses `.env.local` which is gitignored and never deployed.
