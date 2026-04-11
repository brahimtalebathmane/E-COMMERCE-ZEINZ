# E-COMMERCE-ZEINZ

Single-product landing pages with Supabase-backed checkout, private file uploads, Meta Pixel per product, and a password-protected admin area.

## Stack

- Next.js 15 (App Router) + Tailwind CSS
- Supabase (Postgres, Auth, Row Level Security, Storage)
- Netlify (`@netlify/plugin-nextjs`)

## Supabase setup

1. Create a project and run the SQL in `supabase/migrations/001_initial.sql` (SQL editor or CLI).
2. Create a **private** storage bucket named `user-assets` if the migration did not create it (same name as in policies).
3. Under **Authentication → Providers**, configure Email. For internal admin-only use, you can disable public sign-up after creating your first user.
4. Create an admin user (**Authentication → Users** or sign up once), then confirm `profiles.role` is `admin` (the included trigger defaults new users to `admin` — tighten this in production if you enable public sign-up).

## Environment variables

Copy `.env.example` to `.env.local` and fill in values. For Netlify, set the same variables in **Site settings → Environment variables**.

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase **Project Settings → API**.
- `SUPABASE_SERVICE_ROLE_KEY` — **service_role** key (server-only). Used for order creation/updates and storage uploads from API routes.
- `NEXT_PUBLIC_SITE_URL` — canonical public URL.

### WhatsApp (Baileys) + OTP (production note)

Netlify’s Next.js runtime is **serverless** and does **not** support a reliable long-lived WhatsApp Web session.
To deliver OTP messages via WhatsApp in production, you must run the WhatsApp client in an **always-on Node.js service**.

This repo includes that service via `server.js` (Express + Next handler) and `whatsapp.js` (Baileys). Deploy it to a Node host
that supports persistent processes and storage (Railway/Fly/VPS).

Required env vars for the WhatsApp service:

- `WHATSAPP_AUTH_DIR` — path to store Baileys auth state (default `./baileys_auth`). Must be on **persistent disk**.
- `OTP_HASH_SECRET` — secret used to hash OTP codes before storing in Supabase.
- `OTP_TTL_SECONDS` — OTP expiration (default 300).
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — used by the OTP endpoints to store/verify codes.

Netlify frontend/proxy:

- Set `WHATSAPP_SERVICE_URL` on Netlify to the **HTTPS base URL** of the always-on WhatsApp service (no trailing slash). **Required** for post-order WhatsApp messages (`/api/whatsapp/send` → `/api/send-whatsapp`) and for OTP proxy routes.
- The site can call `POST /api/send-otp` and `POST /api/verify-otp` on Netlify; those routes forward to the WhatsApp service.

## Local development

```bash
npm install
npm run dev
```

## Netlify deployment

Connect the repo and use the included `netlify.toml` (build `npm run build`, Next.js plugin). Do **not** set **Publish directory** to `.next` in the Netlify UI (clear it if Netlify shows `publish: .../.next` under “Resolved config”) — `@netlify/plugin-nextjs` controls the output. Use a **patched** Next.js version (see [Netlify advisory](https://ntl.fyi/cve-2025-55182)); this repo pins **Next ≥ 15.2.6** (e.g. 15.2.9). Set all environment variables in the Netlify UI.

## Railway deployment (WhatsApp + OTP service)

Use [Railway](https://railway.app) for the **always-on** WhatsApp (Baileys) + OTP service. Netlify cannot reliably host Baileys.

1. **New project** → **Deploy from GitHub** → select this repo (or **Empty project** → **GitHub repo**).
2. Railway reads **`railway.toml`** and builds with the root **`Dockerfile`** (not Nixpacks), so the image does not hit the Nixpacks `node_modules/.cache` mount that breaks `npm ci` with **EBUSY**. **Start:** `npm run start`.
3. **Volumes** (recommended): open the service → **Settings** → **Volumes** → add a volume (e.g. **Mount path** `/var/data`). Baileys auth must live on persistent storage.
4. **Variables** (service):
   - `NODE_ENV` = `production` (if not already set)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (if your build or runtime needs it)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WHATSAPP_AUTH_DIR=/var/data/baileys_auth` (must be **under** the volume mount)
   - `OTP_HASH_SECRET` (any long random string)
   - `OTP_TTL_SECONDS=300` (optional)

After deploy, open the **public URL** Railway assigns to the service. The WhatsApp dashboard is at `/`. With a volume + `WHATSAPP_AUTH_DIR` under that mount, the session can survive redeploys (until logout or invalid session).

### Connect Netlify → Railway

In Netlify **Environment variables** set:

- `WHATSAPP_SERVICE_URL` = the Railway service **HTTPS** base URL (example: `https://your-service.up.railway.app` — copy from Railway **Settings → Networking → Public networking**), no trailing slash.

If the Next.js API and Baileys run **in the same Railway service** (`server.js`), you can omit `WHATSAPP_SERVICE_URL`; the app resolves the internal `/api/send-whatsapp` via loopback when Railway’s environment is detected.

## Features (short)

- **`/[slug]`** — Product landing (ISR `revalidate = 60`, `generateStaticParams`). Slug is fixed after create; optional `old_slugs` redirects.
- **Checkout** — Simple order form (name + phone + optional address) saved to Supabase, then redirects to `/order-success`.

## Security notes

- Orders are written only through API routes using the **service role**; RLS restricts direct client access.
