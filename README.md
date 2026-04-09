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

## Local development

```bash
npm install
npm run dev
```

## Netlify deployment

Connect the repo and use the included `netlify.toml` (build `npm run build`, Next.js plugin). Do **not** set **Publish directory** to `.next` in the Netlify UI (clear it if Netlify shows `publish: .../.next` under “Resolved config”) — `@netlify/plugin-nextjs` controls the output. Use a **patched** Next.js version (see [Netlify advisory](https://ntl.fyi/cve-2025-55182)); this repo pins **Next ≥ 15.2.6** (e.g. 15.2.9). Set all environment variables in the Netlify UI.

## Features (short)

- **`/[slug]`** — Product landing (ISR `revalidate = 60`, `generateStaticParams`). Slug is fixed after create; optional `old_slugs` redirects.
- **Checkout** — Simple order form (name + phone + optional address) saved to Supabase, then redirects to `/order-success`.

## Security notes

- Orders are written only through API routes using the **service role**; RLS restricts direct client access.
