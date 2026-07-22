# E-COMMERCE-ZAINE — Complete Technical Documentation

> Single-product landing-page e-commerce platform for the Mauritanian market.
> Built on Next.js 15 (App Router) + Supabase + a separate Node/Express service that drives WhatsApp Web (Baileys) for OTP and order confirmation messages.

---

## Table of Contents

1. [High-level overview](#1-high-level-overview)
2. [Technology stack](#2-technology-stack)
3. [Repository layout](#3-repository-layout)
4. [Runtime topology and process model](#4-runtime-topology-and-process-model)
5. [Database (Supabase / Postgres)](#5-database-supabase--postgres)
6. [Authentication, authorization, and middleware](#6-authentication-authorization-and-middleware)
7. [Public storefront (catalog + landing pages)](#7-public-storefront-catalog--landing-pages)
8. [Order flow end-to-end](#8-order-flow-end-to-end)
9. [WhatsApp service (Baileys) and OTP system](#9-whatsapp-service-baileys-and-otp-system)
10. [Admin dashboard](#10-admin-dashboard)
11. [API routes (Next.js) — full reference](#11-api-routes-nextjs--full-reference)
12. [Meta Pixel + Meta Conversions API (CAPI)](#12-meta-pixel--meta-conversions-api-capi)
13. [Internationalization (Arabic / French)](#13-internationalization-arabic--french)
14. [Currency, branding, and theming](#14-currency-branding-and-theming)
15. [File and image uploads (Supabase Storage)](#15-file-and-image-uploads-supabase-storage)
16. [Caching, revalidation, and ISR](#16-caching-revalidation-and-isr)
17. [Environment variables — full list](#17-environment-variables--full-list)
18. [Deployment (Netlify + Railway / Single Railway)](#18-deployment-netlify--railway--single-railway)
19. [Security model summary](#19-security-model-summary)
20. [Operational runbook (common issues)](#20-operational-runbook-common-issues)

---

## 1. High-level overview

This project is a niche e-commerce platform designed around **one landing page per product** (rather than a generic shopping cart). It targets **Mauritania**:

- Local currency: **Mauritanian Ouguiya (MRU)**, enforced everywhere by check constraints.
- Local phone format: **+222** with 8 local digits beginning with 2/3/4, validated client- and server-side.
- Default UI language: **Arabic (RTL)**; full French (LTR) translation available per product and toggleable.
- Communication channel with customers: **WhatsApp** (an order confirmation message and 4-digit OTPs).

Customer-facing surfaces:

- `/` — Public **catalog** of all products (ISR, revalidates every 60 seconds).
- `/[slug]` — A fully editable **product landing page** (ISR, revalidate 60 s) with hero, gallery, features, testimonials, FAQ, stats, sticky countdown footer, and contact section.
- `/order-success` — Confirmation page reached after submitting the order form; this page also triggers the WhatsApp confirmation send.

Internal surfaces:

- `/admin/login` — Password login.
- `/admin/products` and `/admin/products/{new,[id]/edit}` — Product CRUD.
- `/admin/orders` — Order list, status changes, deletion.

External operational surfaces (served by `server.js`, not by Netlify):

- `/` (on the Railway service) and `/whatsapp-dashboard/*` — A small HTML dashboard that shows WhatsApp connection status, exposes a QR code for pairing, lets the operator force a reconnect, and prints recent logs.

The whole system is intentionally minimal: only the **product owner** logs in (the seed admin trigger marks every signup as `admin` by default). Customers never log in — they fill an order form (name + WhatsApp number), submit, and receive a WhatsApp confirmation message a few seconds later.

---

## 2. Technology stack

Pulled directly from `package.json`:

- **Framework:** Next.js `^15.2.9` (App Router) with React `^19.2.1` and React DOM `^19.2.1`.
- **Runtime:** Node `>=20.19.0`. Docker image uses `node:22.13-bookworm-slim`.
- **Server framework (for the WhatsApp service):** Express `^5.2.1` wrapping the Next.js handler.
- **Database/Auth/Storage:** Supabase via `@supabase/supabase-js ^2.47.10` and `@supabase/ssr ^0.5.2`.
- **WhatsApp client:** `@whiskeysockets/baileys ^7.0.0-rc.9` (WhatsApp Web protocol implementation, no official API).
- **QR rendering:** `qrcode ^1.5.4` (for pairing QR shown in the dashboard).
- **Video player:** `@mux/mux-player-react ^3.11.7` (also supports plain HLS, MP4, Cloudflare Stream, and Mux playback IDs).
- **Toasts:** `sonner ^1.7.1`.
- **UUID helper:** `uuid ^11.0.3` (currently bundled; in code `crypto.randomUUID` is preferred).
- **Styling:** Tailwind CSS `^3.4.1`, PostCSS, Geist + Tajawal Google Fonts (`src/app/layout.tsx`).
- **Hosting plugin:** `@netlify/plugin-nextjs ^5.9.4` (used when deploying the Next.js front to Netlify).
- **Tooling:** ESLint `^9` with `eslint-config-next`, TypeScript `^5`.

Notable choices and constraints:

- **No shopping cart.** One product per page, one order per submission.
- **No public Supabase writes.** Orders are always inserted via the API route using the **service role key**; RLS only permits reads/updates by admins.
- **No third-party SMS gateway.** OTPs are sent over WhatsApp via Baileys; that service must run somewhere with a persistent disk.
- **All money is MRU.** Two `CHECK` constraints (`orders_currency_mru_check`, `products_currency_mru_check`) reject anything else.

---

## 3. Repository layout

```
/
├── server.js                        # Express + Next.js handler (the production entry on Railway)
├── whatsapp.js                      # Baileys client wrapper (connection, QR, send, reconnect)
├── otp-service.js                   # OTP creation / verification (HMAC + Supabase)
├── whatsapp-dashboard/              # Static HTML/JS dashboard for the WhatsApp service
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── Dockerfile                       # Railway image (Node 22.13 + npm ci + next build)
├── railway.toml                     # Railway config (builder=DOCKERFILE, start=npm run start)
├── nixpacks.toml                    # Alternative Nixpacks config (Dockerfile is preferred)
├── package.json                     # Scripts: dev=node server.js, build=next build, start=node server.js
├── tsconfig.json, eslint.config.mjs, postcss.config.mjs, tailwind.config.ts
│
├── supabase/
│   └── migrations/                  # Idempotent SQL migrations (001 … 023)
│
└── src/
    ├── middleware.ts                # /admin/* gating with Supabase SSR cookies
    │
    ├── app/                         # Next.js App Router
    │   ├── layout.tsx               # Root <html lang="ar"> + Geist/Tajawal fonts
    │   ├── globals.css              # Theme tokens (CSS variables) and storefront button classes
    │   ├── icon.svg                 # Favicon
    │   │
    │   ├── (store)/                 # Public storefront layout group
    │   │   ├── layout.tsx           # LanguageProvider + StoreLayoutHeader + StoreSiteFooter + Sonner toaster
    │   │   ├── page.tsx             # / — catalog (revalidate=60)
    │   │   ├── [slug]/
    │   │   │   ├── page.tsx         # /[slug] — landing page (generateStaticParams + revalidate=60)
    │   │   │   └── not-found.tsx    # Friendly 404 in store frame
    │   │   └── order-success/
    │   │       ├── page.tsx
    │   │       ├── OrderSuccessClient.tsx       # POST /api/whatsapp/send with retries
    │   │       └── OrderSuccessContinueLink.tsx
    │   │
    │   ├── admin/
    │   │   ├── layout.tsx
    │   │   ├── (public)/
    │   │   │   ├── layout.tsx
    │   │   │   └── login/page.tsx               # Email + password Supabase sign-in
    │   │   └── (dashboard)/
    │   │       ├── layout.tsx                   # Top nav: Products / Orders / Storefront
    │   │       ├── page.tsx                     # Redirects to /admin/products
    │   │       ├── products/
    │   │       │   ├── page.tsx                 # Product list
    │   │       │   ├── new/page.tsx             # Create form
    │   │       │   ├── [id]/edit/page.tsx       # Edit form
    │   │       │   └── actions.ts               # Server Actions: create/update/delete product
    │   │       └── orders/
    │   │           ├── page.tsx
    │   │           ├── OrdersAdminView.tsx
    │   │           ├── OrderDetailModal.tsx
    │   │           ├── OrderRowActions.tsx
    │   │           ├── actions.ts               # Server Action: deleteOrderAction
    │   │           └── types.ts
    │   │
    │   └── api/                                  # Route handlers
    │       ├── orders/
    │       │   ├── route.ts                      # POST create order (service role)
    │       │   └── [id]/route.ts                 # PATCH change status (admin)
    │       ├── whatsapp/send/route.ts            # Order confirmation trigger (proxies Railway)
    │       ├── send-otp/route.ts                 # Proxy to Railway /api/send-otp
    │       ├── verify-otp/route.ts               # Proxy to Railway /api/verify-otp
    │       ├── admin/
    │       │   ├── upload-image/route.ts         # Multipart upload to Supabase Storage
    │       │   └── signed-url/route.ts           # 1-hour signed URL for an existing object
    │       └── meta/
    │           ├── lead/route.ts                 # CAPI Lead (server-side dedup)
    │           ├── purchase/route.ts             # CAPI Purchase (fixed value, see §12)
    │           └── cancel/route.ts               # CAPI CancelledLead
    │
    ├── components/
    │   ├── MetaPixel.tsx                         # Lazy fbq init + Lead/InitiateCheckout/Purchase trackers
    │   ├── StoreToaster.tsx                      # Sonner wrapper
    │   ├── SiteLogo.tsx
    │   ├── LanguageSwitcher.tsx
    │   ├── store/                                # Catalog + header/footer
    │   │   ├── CatalogPageClient.tsx
    │   │   ├── CatalogProductCard.tsx
    │   │   ├── CatalogProductMedia.tsx
    │   │   ├── StoreLayoutHeader.tsx
    │   │   ├── StoreHeader.tsx
    │   │   ├── StoreSiteFooter.tsx
    │   │   ├── LoadingFallback.tsx
    │   │   └── NotFoundContent.tsx
    │   ├── landing/                              # Per-product landing UI
    │   │   ├── ProductLanding.tsx                # Top-level composition (hero → features → … → contact)
    │   │   ├── LandingHeader.tsx
    │   │   ├── LandingTopBanner.tsx
    │   │   ├── LandingMedia.tsx                  # Image / native video / Mux / Cloudflare Stream
    │   │   ├── LandingStickyFooter.tsx           # Countdown + pricing pill + CTA
    │   │   └── OrderFormModal.tsx                # Name + WhatsApp + POST /api/orders
    │   └── admin/
    │       ├── ProductForm.tsx                   # Large bilingual edit form
    │       ├── ProductFormListSections.tsx
    │       └── product-form-shared.ts
    │
    ├── contexts/LanguageContext.tsx              # Locale provider (ar default, persisted in localStorage)
    │
    ├── hooks/useInViewOnce.ts                    # Intersection-observer once-shown trigger
    │
    ├── lib/                                      # Pure helpers (server + client)
    │   ├── supabase/{client,server,public,service}.ts  # 4 Supabase clients (browser, SSR, anon, service-role)
    │   ├── products.ts                           # mapProductRow + getProductBySlug/OldSlug/Id + getAllProductSlugs
    │   ├── product-locale.ts                     # ProductRow → LocalizedProductCopy
    │   ├── catalog-media.ts, catalog-rating.ts
    │   ├── i18n.ts + locales/{ar,fr}.json + admin-ar.ts
    │   ├── currency.ts                           # MRU formatting + Pixel USD conversion helper
    │   ├── color.ts, site-branding.ts, site-url.ts, slug.ts, constants.ts
    │   ├── meta-client.ts                        # Browser session event_id (60-min sliding TTL)
    │   ├── meta-pixel-advanced-matching.ts       # Phone normalization + name split → fbq advanced match
    │   ├── meta-purchase-tracking.ts             # Fixed Purchase value/currency for CAPI + Pixel
    │   ├── order-communication-log.ts            # Append-only WhatsApp/order audit log
    │   ├── payment-logo-url.ts, translate-error.ts, upload-validation.ts
    │   └── whatsapp-service-url.ts               # Resolves Railway base URL or loopback
    │
    ├── utils/
    │   ├── meta.ts                               # CAPI sender, SHA-256 hashing, retry logic
    │   └── cookies-client.ts                     # Reads _fbp / _fbc cookies
    │
    ├── types/                                    # TypeScript shapes (ProductRow, OrderRow, …)
    └── locales/                                  # AR/FR JSON for storefront + admin-ar.ts strings
```

The repository also ships a `.next/` build cache in the working tree; that directory is regenerated by every `next build` and is not part of the source.

---

## 4. Runtime topology and process model

There are two distinct ways this app is run; the code supports both with one switch (`WHATSAPP_SERVICE_URL`).

### 4.1 Split deployment (recommended for production)

```
┌────────────────────────────┐              ┌────────────────────────────┐
│         Netlify            │              │          Railway           │
│  (Next.js front + API)     │              │ (server.js: Next + Baileys)│
│                            │  HTTPS POST  │                            │
│  /api/whatsapp/send  ───── │ ───────────► │  /api/send-whatsapp        │
│  /api/send-otp       ───── │ ───────────► │  /api/send-otp             │
│  /api/verify-otp     ───── │ ───────────► │  /api/verify-otp           │
└──────────┬─────────────────┘              └─────────────┬──────────────┘
           │                                              │
           │            both talk to                      │
           ▼                                              ▼
                        ┌──────────────────────────┐
                        │        Supabase          │
                        │ Postgres + Storage + Auth│
                        └──────────────────────────┘
```

- **Netlify** runs the Next.js front (catalog, landing pages, admin, public API routes) using `@netlify/plugin-nextjs`. It cannot host Baileys because the runtime is serverless (no persistent socket / disk).
- **Railway** runs `server.js`, which itself starts Next.js *and* exposes additional Express routes for WhatsApp+OTP. Baileys credentials are stored on a Railway persistent volume mounted at `/var/data` (so the session survives redeploys until the device is logged out remotely).
- Netlify is told where Railway lives via the env var `WHATSAPP_SERVICE_URL`. When that variable is missing on Netlify, `/api/whatsapp/send` returns `{ handled: true, sent: false, skipReason: "whatsapp_service_unconfigured" }`.

### 4.2 Single Railway deployment

Set everything (Next.js, Baileys, OTP) on Railway. `server.js` is the entrypoint and handles all routes, so the Next.js `/api/whatsapp/send` route reaches the Express `/api/send-whatsapp` route over loopback (`http://127.0.0.1:$PORT`). `src/lib/whatsapp-service-url.ts` detects Railway via `RAILWAY_ENVIRONMENT` / `RAILWAY_PROJECT_ID` and automatically falls back to loopback when `WHATSAPP_SERVICE_URL` is unset, so you do **not** need to type the public URL twice.

### 4.3 `server.js` request handling

`server.js`:

1. Boots Next.js (`next({ dev })`) and prepares its request handler.
2. Mounts Express middleware: `express.json({ limit: "1mb" })`.
3. Serves the static dashboard from `/whatsapp-dashboard/*` and the dashboard HTML at `/`.
4. Defines five Express endpoints unique to the WhatsApp service:
   - `GET  /api/status` — returns `{ status, authDir, hasSavedSession, autoReconnectAttempt, lastDisconnectReason }`.
   - `GET  /api/qr` — returns `{ dataUrl }` only when the socket is in QR pairing mode.
   - `POST /api/reconnect` — forces a manual reconnect (resets retry counter).
   - `GET  /api/logs` — last ~200 lines from the Baileys log buffer.
   - `POST /api/send-otp`, `POST /api/verify-otp`, `POST /api/send-whatsapp` — the operational hooks (see §9).
5. Catches every other route with `server.all(/.*/, (req, res) => handle(req, res))`, delegating to Next.js so the same process serves the catalog, landing pages, admin, and Next.js API routes.

That single-process design is what makes the “one Railway service” topology possible.

### 4.4 Baileys connection lifecycle (`whatsapp.js`)

- On first `require("./whatsapp")` the file calls `connectWhatsApp()` (already at the bottom of the file), so the WhatsApp socket starts trying to connect the moment `server.js` boots.
- `useMultiFileAuthState(WHATSAPP_AUTH_DIR)` writes `creds.json` and key files to disk. On Railway you must mount the volume **at or above** that path (e.g. mount `/var/data`, set `WHATSAPP_AUTH_DIR=/var/data/baileys_auth`), otherwise the session is lost on every redeploy.
- The socket emits `connection.update` events:
  - `qr` → caches the QR string, exposes it as a Data URL via `getQrDataUrl()`.
  - `open` → connection healthy; clears retry counter.
  - `close` → records the status code; if it’s a recoverable disconnect (anything that isn’t `loggedOut` or `badSession`), schedules an exponential reconnect (1.2 s, 2.4 s, 4.8 s, … capped at 60 s).
  - On `loggedOut` / `badSession` the user must rescan the QR; auto-retry is disabled to avoid hammering the server.
- `creds.update` is persisted on every change. The connection log buffer keeps the last 200 ISO-timestamped lines and is exposed at `GET /api/logs`.
- `waitForConnected(ms)` is used by `/api/send-otp` and `/api/send-whatsapp` before sending so that cold starts don’t immediately return 503.

---

## 5. Database (Supabase / Postgres)

All schema lives in `supabase/migrations/`. Files apply in numeric order (Supabase CLI or pasted into the SQL editor). They are idempotent (use `if not exists` / `do $$ … $$`) so reapplying is safe.

### 5.1 Tables

#### `public.profiles` (migration 001)

| Column      | Type        | Notes |
|-------------|-------------|-------|
| id          | uuid PK     | References `auth.users(id)` ON DELETE CASCADE |
| email       | text        | Mirrors auth user email |
| role        | text        | Constrained to `'admin'` |
| created_at  | timestamptz | default `now()` |

RLS: enabled. Policy `profiles_select_own` allows a user to read its own row.
Trigger: `on_auth_user_created` (function `handle_new_user`) inserts a profile with `role='admin'` for every new auth user — so on a clean Supabase project, the first signup *is* your admin. Tighten this if you ever open public sign-up.

#### `public.products` (built up across migrations 001, 002, 005, 006, 007, 010, 013, 014, 016, 017, 018, 019, 020, 021, 022, 023)

This is the biggest table — it stores everything a landing page needs. Final shape:

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `default_language` | text `ar`/`fr` | Initial storefront locale for this landing |
| `brand_color` | text | Locked to `#006B0C` by trigger `enforce_product_brand_identity` (migrations 015 → 016 → 020) — kept editable today but defaults to the global green |
| `logo_url` | text | Per-landing header logo (originally locked, now editable) |
| `name_ar`, `name_fr` | text | Product name |
| `hero_subtitle_ar/fr` | text | First-line hero copy |
| `description_ar/fr` | text | Multi-line description (split by `\n` on landing) |
| `cta_text_ar/fr` | text | Primary CTA button label |
| `features_title_ar/fr`, `features_ar/fr` (text[]) | — | Features section title + list |
| `testimonials_title_ar/fr`, `testimonials_ar/fr` (jsonb) | — | Reviews title + array of `{ name, quote, role?, image?, rating?, location? }`. Migration 015 enriches every entry into that exact shape. |
| `faq_title_ar/fr`, `faqs_ar/fr` (jsonb) | — | Array of `{ q, a }` |
| `media_caption_ar/fr` | text | Caption above the secondary media block |
| `media_type` text + `media_url` text | — | Hero media. Type is `'image'` or `'video'`. The video player auto-detects Mux, Cloudflare Stream, HLS, MP4 |
| `secondary_media_type/url`, `tertiary_media_type/url` | — | Two additional media slots |
| `gallery` text[] | — | Optional image grid |
| `slug` text UNIQUE + `old_slugs` text[] | — | Stable URL. Old slugs trigger a 301 to the current one |
| `price` numeric(12,2), `discount_price` numeric(12,2) NULL | — | MRU only |
| `currency` text default `'MRU'` + CHECK | — | Enforces single currency |
| `stats_section_title_ar/fr` text + `stats_ar/fr` text[] | — | “Why customers trust us” band |
| `contact_title_ar/fr` text + `contact_lines_ar/fr` text[] | — | Contact section |
| `header_bar_text_ar/fr` text (+ legacy header_*_ar/fr fields used as fallback) | — | Promo strip above the landing header (migration 022 unified them). |
| `header_bar_max_lines` smallint, `header_bar_font_size_px` smallint NULL | — | Layout controls for the promo strip (migration 023) |
| `header_cta_text_ar/fr` text | — | Small accent line inside the landing header |
| `cta_banner_background_color`, `cta_banner_background_image_url` text + `cta_banner_image_overlay` numeric | — | Pre-contact CTA banner styling (image + dark overlay or solid color) |
| `sticky_footer_offer_ends_at` timestamptz NULL + `sticky_footer_*` color/text fields + `sticky_footer_show_timer` bool | — | Bottom sticky CTA pill with countdown |
| `testimonials_badge_ar/fr` text, `footer_note_ar/fr` text | — | Optional copy lines |
| `meta_pixel_id` text NULL | — | Per-product Meta Pixel ID |
| `whatsapp_message_template` text NULL | — | Per-product template sent after order |
| `created_at` timestamptz | — | default `now()` |

RLS: public **read** is allowed (`products_select_public`). Insert/update/delete only for admins (`products_*_admin` policies). The trigger `enforce_product_brand_identity` runs `BEFORE INSERT OR UPDATE` and forces `brand_color` back to `#006B0C` if blank.

Removed during evolution (handy when reading migration history): legacy `name`, `description`, `features`, `testimonials`, `faqs`, `form_title`, `form_fields` columns (006, 008), hero/offer line copy (021), and the entire form_data system (008).

#### `public.orders` (001, 002, 003, 008, 010, 011, 012)

| Column | Type | Notes |
|---|---|---|
| `id` uuid PK | gen_random_uuid | |
| `product_id` uuid | FK → products(id), ON DELETE RESTRICT |
| `customer_name` text NULL | Migration 003 dropped NOT NULL |
| `phone` text NULL | E.164 (`+222########`) |
| `payment_method`, `payment_number`, `transaction_reference`, `receipt_image_url` text NULL | Legacy fields — orders today never write these |
| `total_price` numeric(12,2) | Snapshot of effective price at submit time |
| `currency` text default `'MRU'` + CHECK | Single currency |
| `status` text | `pending` / `confirmed` / `shipped` / `cancelled` |
| `completion_token` uuid | `gen_random_uuid()`, unique index, kept for forward compatibility |
| `meta_event_id` text NULL | Deduplication id shared with the browser Pixel |
| `meta_event_source_url` text NULL | URL the customer was on (for CAPI) |
| `meta_pixel_id` text NULL | Snapshot of the pixel used |
| `meta_fbp` text NULL, `meta_fbc` text NULL | First-party cookies for Meta matching (migration 012) |
| `meta_lead_sent`, `meta_purchase_sent`, `meta_cancel_sent` bool | Idempotency for CAPI (migration 010) |
| `created_at` timestamptz | default `now()` |

Indexes: `orders_product_id_idx`, `orders_created_at_idx`, `orders_completion_token_key` (unique).

RLS: only admins can `SELECT`, `UPDATE`, and `DELETE`. There is **no INSERT policy** — all inserts come from `createServiceClient()` (service role) inside `POST /api/orders`. Migration 008 added an `orders_delete_admin` policy so admins can prune from the dashboard.

#### `public.payment_methods` (001 + 002_payment_logo_url)

Holds a configurable list of `{ label, account_number, payment_logo_url?, sort_order, active }`. Today this table is **not actively used** by the order flow (post-payment fields were removed in migration 008) but it still exists with its RLS policies (`payment_methods_select_public` for active rows, plus admin CRUD).

#### `public.order_communication_logs` (009)

Append-only audit table:

| order_id uuid | event text | detail text NULL | created_at timestamptz |

Events written by the backend (see `src/lib/order-communication-log.ts`):
`order_created`, `whatsapp_triggered`, `whatsapp_sent`, `whatsapp_skipped`, `whatsapp_failed`.
RLS is enabled with **no policies** — only the service role writes.

#### `public.otp_codes` (created at runtime, expected schema)

Not declared in `supabase/migrations/` but used by `otp-service.js`:

| Column | Type | Notes |
|---|---|---|
| `id` uuid PK | | |
| `phone` text | E.164 |
| `otp_hash` text | HMAC-SHA256(`OTP_HASH_SECRET`, `${phone}:${otp}`) |
| `expires_at` timestamptz | Now + `OTP_TTL_SECONDS` (default 300) |
| `consumed_at` timestamptz NULL | Set when verified |
| `created_at` timestamptz | default `now()` |

You must create this table yourself (and lock it down so only the service role can write) before the OTP service can store codes. The service code only ever writes via the **service role**, so an RLS-enabled empty-policy table is appropriate.

### 5.2 Storage

Bucket: `user-assets`, **private** (`public = false`), created by migration 001.

Policies:
- `user_assets_admin_read` — admins (via JWT) can `SELECT` objects.
- All writes go through the service role inside `/api/admin/upload-image`.
- Customer-facing pages use short-lived signed URLs (max age 5 years for testimonial/CTA images, 1 hour for ad-hoc fetches via `/api/admin/signed-url`).

### 5.3 Functions and triggers

- `public.handle_new_user()` — inserts a profile with `role='admin'` for every new `auth.users` row. Bound to trigger `on_auth_user_created`.
- `public.enforce_product_brand_identity()` — `BEFORE INSERT OR UPDATE` on `products`; defaults `brand_color` to `#006B0C` when blank. Earlier versions (migration 015) also clamped `logo_url`; migration 016 unlocked the logo, and migration 020 made the trigger only enforce the color.

---

## 6. Authentication, authorization, and middleware

Customer-facing pages are anonymous (no login required to view the catalog or place an order). Admin pages require Supabase Auth.

**Supabase clients** (`src/lib/supabase/`):

| File | Purpose |
|---|---|
| `client.ts` | Browser client used by `/admin/login/page.tsx` for `signInWithPassword`. |
| `server.ts` | SSR client using `next/headers` cookies — used inside Server Components and Server Actions to read the logged-in user. |
| `public.ts` | Anonymous client (no cookies) used by ISR-revalidating Server Components and `generateStaticParams`. |
| `service.ts` | Service-role client (bypasses RLS). Used only inside trusted server code (API routes that need to insert orders, upload to Storage, send Meta CAPI). |

**Middleware** (`src/middleware.ts`):

- Runs on every `/admin` and `/admin/*` request (`matcher: ["/admin", "/admin/:path*"]`).
- Creates a Supabase server client with cookie passthrough so the access token is refreshed on the response.
- If the path is `/admin/*` (other than `/admin/login`) and there is no user → redirect to `/admin/login?next=<originalPath>`.
- If the path **is** `/admin/login` and the user is already authenticated → redirect to `/admin`.
- Every other path is passed through untouched.

**`assertAdmin()` helpers** are duplicated inside the privileged server actions (`src/app/admin/(dashboard)/products/actions.ts`, `src/app/admin/(dashboard)/orders/actions.ts`) and inside API routes that need to verify the caller (e.g. `PATCH /api/orders/[id]`, `/api/admin/upload-image`). They each:

1. Read `auth.getUser()` from cookies.
2. Look up `profiles.role` for that user id.
3. Throw `"Unauthorized"` (401) or `"Forbidden"` (403) otherwise.

The login form (`/admin/login/page.tsx`) is a client component that calls `supabase.auth.signInWithPassword({ email, password })` and then `router.replace(next ?? "/admin")`. There is intentionally **no sign-up UI** — admins are provisioned in the Supabase dashboard (or by signing up once and then disabling public sign-up).

---

## 7. Public storefront (catalog + landing pages)

### 7.1 Root layout (`src/app/layout.tsx`)

- Loads Geist Sans (`--font-geist-sans`) and Tajawal Arabic (`--font-arabic`) via `next/font/google`.
- Sets `<html lang="ar" suppressHydrationWarning>`; the actual `dir` and `lang` are mutated at runtime by `LanguageProvider` once the locale resolves from `localStorage`.
- Viewport is `width=device-width, initialScale=1, viewportFit=cover` so the iOS notch area is respected.

### 7.2 Store layout (`src/app/(store)/layout.tsx`)

- Wraps the page in `LanguageProvider`.
- Mounts `StoreLayoutHeader` (renders `StoreHeader` on `/` and `/order-success`, hides it on `/[slug]` so the landing-specific header isn’t doubled).
- Mounts `StoreSiteFooter` and the Sonner toaster.

### 7.3 Catalog `/` (`src/app/(store)/page.tsx`)

- `export const revalidate = 60;` — every page request can refresh from Supabase every 60 s.
- If Supabase isn’t configured (env missing) it renders an empty-state placeholder.
- Otherwise it reads `products` ordered by `created_at desc`, selecting just the columns needed for the card (name, hero subtitle, slug, price, discount, media, testimonials AR/FR for the rating).
- Renders `<CatalogPageClient>` which uses the language context to pick the correct names + subtitle, displays an aggregated star rating computed from `testimonials_*`, and shows the **discounted** price (or full price) as the visible price.
- Each `CatalogProductCard` is a `<li>` containing a `next/link` to `/{slug}` with `prefetch` enabled for snappy navigation.

### 7.4 Landing page `/[slug]` (`src/app/(store)/[slug]/page.tsx`)

- `generateStaticParams()` calls `getAllProductSlugs()`; at build time every product slug is pre-rendered.
- `revalidate = 60` keeps the rendered HTML fresh in production without forcing every request through the DB.
- Resolution order:
  1. `getProductBySlug(slug)` — direct hit.
  2. If null, `getProductByOldSlug(slug)` (uses Postgres `contains(old_slugs, [slug])`). If found, a `redirect()` is issued to the current slug — old marketing links keep working.
  3. Otherwise `notFound()` → friendly 404 (`not-found.tsx`).

The page renders `<ProductLanding product={…} />`, which is a client component (so the rest of this list is browser-side):

- Reads the saved locale from the language context.
- Computes a localized `copy` object via `getLocalizedProductCopy(locale, product)` — this is the single source of truth that picks `_ar` or `_fr` values, falls back AR→FR or FR→AR (whichever is non-empty), and adds defaults for optional badges (testimonials badge, footer note, stats title).
- Sets the CSS variables `--accent`, `--accent-muted`, `--accent-foreground`, `--card`, `--muted` on the root `<div>` from the per-product `brandColor`.
- Renders the Meta Pixel script (per-product `meta_pixel_id`) so PageView is fired even though this is an ISR page.
- Mounts a sticky top region that contains:
  - `LandingTopBanner` (single-line promo strip, `bg-[#0a4d12]`) — only shown if `copy.headerBarText` is non-empty.
  - `LandingHeader` — language switcher (left, RTL-independent), optional accent line in the center, logo (right).
- Composes the page sections in this fixed order:
  1. **Hero** — `heroSubtitle` (`h1`), primary media via `LandingMedia` (full bleed), product name (`h2`), first description line, the *first* testimonial card with name/quote/avatar/stars, primary CTA button, then a “cash-on-delivery” reassurance line (second description line, with French/Arabic fallback).
  2. **Features** — `featuresTitle` and a 2-column (4-column on `lg`) grid of `FeatureCard`s with auto-selected SVG icons. `fixedSlots(copy.features, 4)` always renders exactly four slots, padding with `null` if the admin gave fewer.
  3. **Secondary media band** — `mediaCaption` + `LandingMedia` in `immersive` mode (using `secondary_media_url` or falling back to the hero). Optional bullet list using description lines 4–6.
  4. **Gallery** — if `product.gallery.length > 0`, a 2-/3-column grid of square `next/image` thumbnails.
  5. **Testimonials section** — pill badge (`testimonialsBadge`), then every testimonial rendered with a slide-in animation (`TestimonialReveal`).
  6. **Stats band** — three big animated counters (`AnimatedCounter` runs once on first scroll into view). The “number” part of each entry (e.g. `2500+ زبون`) is parsed for the digits, suffix `+`, and remaining label.
  7. **Tertiary media** — only when `tertiary_media_url` is set; same `immersive` layout.
  8. **FAQ** — first item open by default; click toggles via `openFaqIndex` state.
  9. **Pre-contact CTA banner** — full-bleed strip with admin-controlled background (image + dark overlay, or solid color, or theme gradient) and a centered pill CTA.
  10. **Contact** — for each contact line the icon (`☎ / ✉ / ◉`) and Arabic label are chosen by detecting `@`/`mail` or `whatsapp`/`واتساب`.
  11. **Footer note** — single small line (`footerNote`).
- Sticky bottom — `<LandingStickyFooter>` shows the optional countdown timer (h/m/s, ticks every 1 s while it’s visible), the current price (discounted if available), the original price with strikethrough, an auto-computed `-X%` badge, the savings line, and a big CTA button to open the order modal.
- `<OrderFormModal>` is dynamically imported (`{ ssr: false }`) and only mounted when the user opens the CTA.

### 7.5 Landing media (`src/components/landing/LandingMedia.tsx`)

This component handles every possible media kind:

- **Image** — rendered through `next/image`. The hero variant (`primaryHero`) uses a raw `<img>` that preserves the intrinsic aspect ratio (the only place in the project that bypasses `next/image`).
- **Mux** — when `media_url` matches `stream.mux.com/…`, `player.mux.com/…`, or `watch.mux.com/…`, the playback ID is extracted and rendered with `<MuxPlayer theme="classic" />` (HLS adaptive). A poster image is generated automatically via `image.mux.com/<playbackId>/thumbnail.jpg`.
- **Generic HLS** (`*.m3u8`) — also dispatched to `mux-player`, which falls back to HLS.js.
- **Cloudflare Stream** — `iframe.videodelivery.net` and `*.cloudflarestream.com/iframe` are rendered inside a sandboxed iframe with `autoplay=true&muted=true&preload=auto&playsinline=true`. A user-tap-to-unmute overlay appears until the operator chooses to enable sound.
- **MP4 / native video** — uses a plain `<video>` element with `autoPlay` and `playsInline`; on autoplay rejection it retries with `muted=true` and prompts a tap-to-unmute.
- All branches expose a “Tap for sound” overlay because mobile browsers reject unmuted autoplay.

### 7.6 Order success (`src/app/(store)/order-success/page.tsx`)

- Reads `order_id`, `product_id`, and `total_price` from the query string.
- Loads the matching product (so it can fire the Meta Pixel with the product’s pixel id).
- Renders a centered confirmation card in Arabic + a “browse more products” link that clears the Meta session event id (so the next order isn’t deduplicated against the previous one).
- Mounts `OrderSuccessClient`, which is the entry point for the WhatsApp confirmation send — it `POST`s `/api/whatsapp/send` with `{ order_id }`, retries up to 5 times with backoff `[0, 900, 2200, 4500, 9000] ms`, and stores `whatsapp_handled:{orderId}` in `localStorage` once a terminal outcome is reached (either delivered or non-retryable error). This makes the page idempotent even if the customer reloads.

---

## 8. Order flow end-to-end

A full picture of what happens when a customer clicks the CTA:

1. **CTA → `openCheckout()`** (`ProductLanding.tsx`)
   - Touches the Meta funnel activity timestamp (`touchMetaFunnelActivity()`).
   - Captures `eventId = ensureMetaFunnelSession()` and `eventTimeSec`.
   - Fires browser `InitiateCheckout` with product `content_ids` (Supabase `products.id` UUID).
   - Fires server `InitiateCheckout` CAPI via `POST /api/meta/initiate-checkout` with the **same** `event_id` and `event_time` (deduped via `funnel_meta_dispatches`).
   - Sets `open = true` to mount `<OrderFormModal>`.
2. **Order form** (`OrderFormModal.tsx`)
   - Two fields: full name + 8-digit local phone (the `+222` prefix is enforced visually with a non-input span; only digits 2/3/4 are accepted as first digit).
   - On submit: re-validates locally, then `POST /api/orders` with:
     ```json
     {
       "product_id": "...",
       "customer_name": "...",
       "phone": "+222XXXXXXXX",
       "meta_event_id": "<session id>",
       "event_source_url": "<window.location.href>",
       "meta_fbp": "<_fbp cookie>",
       "meta_fbc": "<_fbc cookie>"
     }
     ```
   - On success, queues Lead payload in `sessionStorage` for the order-success page (does **not** fire Lead here).
   - Clears the funnel session id (next visit is a fresh attribution).
   - Pushes the user to `/order-success?order_id=&product_id=&total_price=`.
3. **`POST /api/orders`** (`src/app/api/orders/route.ts`)
   - Validates required fields and rate-limits by IP.
   - Reads the product (`id`, `discount_price`, `price`, …) via the service role.
   - Computes `total_price = discount_price ?? price`.
   - Keeps the client-provided `meta_event_id` or generates `createMetaEventId()`.
   - Inserts a new order with `status='pending'`, `currency='MRU'`, and snapshots of `meta_event_id`, `meta_event_source_url`, shopper session (`meta_fbp`, `meta_fbc`, IP, UA). **`meta_pixel_id` on the order row is a legacy snapshot only** — routing uses unified env `META_PIXEL_ID`.
   - Does **not** fire Meta CAPI Lead (Lead is hybrid on `/order-success`).
   - Returns `{ success: true, order_id, meta_event_id, total_price, completion_token, action_token }`.
4. **`/order-success`** — hybrid Meta Lead + WhatsApp (`OrderSuccessEffects.tsx`)
   - **`OrderSuccessMetaLead`**: browser `Lead` Pixel first, then CAPI Lead via `POST /api/orders/meta/lead` with shared funnel `event_id` + aligned `event_time`.
   - **`OrderSuccessClient`**: WhatsApp post-order message (same retry semantics as before).
5. **`POST /api/whatsapp/send`** (`src/app/api/whatsapp/send/route.ts`)
   - Pulls the order’s `phone` and `product_id`. Logs `whatsapp_triggered`.
   - If `phone` or `product_id` is missing → `whatsapp_skipped`.
   - Loads `products.whatsapp_message_template` for that product. Empty → `whatsapp_skipped: "no_whatsapp_template"`.
   - Resolves the WhatsApp service base URL via `resolveWhatsAppServiceBase()`. If null → `whatsapp_skipped: "whatsapp_service_unconfigured"` (sets a hint message in the response).
   - Forwards the request (`POST <base>/api/send-whatsapp { phone, message }`) with a 60 s `AbortController` timeout. Maps HTTP errors to retryable / non-retryable. Logs `whatsapp_sent` or `whatsapp_failed`.
6. **Railway side — `POST /api/send-whatsapp`** (`server.js`)
   - Validates the request, normalizes the phone to E.164.
   - Calls `waitForConnected(45 000)`. If Baileys is not connected within 45 s → 503.
   - Calls `sendWhatsAppMessage(phone, text)`. That helper builds the JID (`<digits>@s.whatsapp.net`) and uses `sock.sendMessage(jid, { text })`.
7. **Admin lifecycle** — Later, the operator opens `/admin/orders`, opens the order, and changes status. That fires `PATCH /api/orders/[id] { status }`, which:
   - Re-asserts admin.
   - Updates the row.
   - Calls `processMetaByStatus(...)`:
     - On `confirmed` (and `meta_purchase_sent=false`) → CAPI `Purchase` with the fixed value (see §12). Sets `meta_purchase_sent` if Meta returns `events_received > 0`. Response carries `meta.purchase.state` so the admin UI can show whether Meta accepted, deduped, or failed.
     - On `cancelled` (and `meta_cancel_sent=false`) → CAPI `CancelledLead`.
     - If `confirmed` but already sent → returns `state: skipped, reason: already_sent`.

This entire flow is **safe to retry** at every step: the order row is keyed by id, the WhatsApp send is keyed by `whatsapp_handled:{orderId}` in `localStorage` and by Baileys delivery, and the Meta events are deduplicated by `event_id` + the `meta_*_sent` boolean columns.

---

## 9. WhatsApp service (Baileys) and OTP system

### 9.1 Why this is a separate concern

`@whiskeysockets/baileys` opens a persistent WebSocket to WhatsApp and holds device keys on disk (`creds.json` + key files). Serverless platforms (Netlify Functions, Vercel) tear the process down between invocations, so the session would be lost on every cold start and the device would eventually be marked invalid. The project therefore uses Railway (or any always-on Node host) and persistent disk for the auth directory.

### 9.2 Files

- **`whatsapp.js`** — Baileys client wrapper. Public functions:
  - `getStatus()` / `getLogs()` / `getConnectionInfo()` — for the dashboard.
  - `getQR()` / `getQrDataUrl()` — for the pairing UI.
  - `reconnectWhatsApp({ manual })` — manual reconnect resets the retry counter.
  - `sendWhatsAppMessage(phone, message)` — throws if not connected; otherwise sends a text message.
  - `waitForConnected(ms)` — used by the OTP and order routes to avoid 503s during boot.
  - `logOtpGenerated(phone, expiresAtIso)` — adds a line to the log buffer so operators can audit OTP requests from the dashboard.
- **`otp-service.js`** — small helper module:
  - `normalizeE164(phone)` — strips spaces, accepts existing `+`, otherwise prepends `+` to a digit-only string.
  - `createOtpForPhone(phone)` — generates a 4-digit code with `crypto.randomInt`, hashes it with HMAC-SHA256 using `OTP_HASH_SECRET` (`HMAC("${phone}:${otp}")`), stores `{ phone, otp_hash, expires_at }` in `public.otp_codes`, and returns `{ phone, otp, expires_at, ttl_seconds }`.
  - `verifyOtp(phone, code)` — recomputes the hash, finds the latest **unconsumed** row for `(phone, otp_hash)`, checks `expires_at`, and atomically updates `consumed_at = now()`.
  - The TTL is bounded in `[60, 3600]` seconds via env `OTP_TTL_SECONDS` (default 300 s).
- **`whatsapp-dashboard/`** — three tiny static files served from `/whatsapp-dashboard/*`:
  - `index.html` — the page with status pill, QR area, “Reconnect” button, and a log feed.
  - `app.js` — polls `/api/status`, `/api/qr`, and `/api/logs`.
  - `styles.css` — visual polish.

### 9.3 Endpoints on the WhatsApp service (`server.js`)

| Method | Path | Auth | Behavior |
|---|---|---|---|
| `GET`  | `/api/status` | none | Returns `{ status, authDir, hasSavedSession, autoReconnectAttempt, lastDisconnectReason }`. |
| `GET`  | `/api/qr` | none | 404 unless `status === "qr"`. Otherwise returns a base64 data-URL of the current QR. |
| `POST` | `/api/reconnect` | none | Resets the retry counter and forces a fresh connection. |
| `GET`  | `/api/logs` | none | Last ~200 lines from the Baileys log buffer. |
| `POST` | `/api/send-otp` | none, requires WhatsApp connected | Body `{ phone }`. Waits up to 45 s for the socket, creates an OTP, then sends `Your OTP code is: NNNN`. Returns `{ success, expires_at }`. |
| `POST` | `/api/verify-otp` | none | Body `{ phone, code }`. Returns `{ success: true, ok: boolean }`. |
| `POST` | `/api/send-whatsapp` | none | Body `{ phone, message }`. The Next.js front (`/api/whatsapp/send`) is the only caller in normal operation. |

> **There is no authentication on these routes today.** In production you should put the Railway service behind a private network or a shared secret header before exposing it to the public internet. The repo intentionally keeps them open because both Netlify (server-to-server) and the dashboard call them and the practical exposure surface is whoever knows the URL.

### 9.4 OTP flow (full path)

1. Browser → `POST /api/send-otp` on Netlify with `{ phone }`.
2. Netlify route (`src/app/api/send-otp/route.ts`) resolves the WhatsApp base URL. If `WHATSAPP_SERVICE_URL` is missing → 503 with a clear instructional error.
3. Netlify forwards to Railway `/api/send-otp` (Express).
4. Railway calls `createOtpForPhone(phone)` → inserts into `otp_codes`, returns the OTP.
5. Railway sends a WhatsApp text containing the OTP via Baileys, then responds.
6. Browser → `POST /api/verify-otp { phone, code }`, same proxy chain.
7. Railway calls `verifyOtp(phone, code)` → either `{ ok: true }` (and the row is consumed) or `{ ok: false }`.

> The current codebase does not actually call `/api/send-otp` from the order form (the form goes straight to `/api/orders`). The OTP routes exist so they can be wired into any flow that needs phone verification (e.g. account creation, sensitive operations) — they are first-class building blocks.

### 9.5 Marketing Messages sender (`/send`, `/status`, `marketing-worker.js`)

Added to this same `server.js`/`whatsapp.js` process rather than a second standalone service — deliberately, to avoid a second WhatsApp linked device on the number that also handles order confirmations above. The existing routes in §9.3 are untouched.

| Method | Path | Auth | Behavior |
|---|---|---|---|
| `POST` | `/send` | `x-api-key` header, checked against `SENDER_API_KEY` (timing-safe compare) | Body `{ phone, text, imageUrl? }`. Sends an image+caption if `imageUrl` is set, else plain text. Always returns `200 { success, error? }` — never throws, never crashes the process. |
| `GET`  | `/status` | none | `{ connected: boolean }`, derived from the existing `getStatus()`. |

**`marketing-worker.js`** — background loop started at boot alongside the Baileys connection. Hardcoded, not configurable from the DB/UI/env: 20–45s random delay between sends, 80/day global cap (all campaigns combined), auto-pause after 3 consecutive failures on a campaign. Stateless polling (no in-memory cursor) against `marketing_campaigns`/`marketing_campaign_recipients` — safe to restart mid-campaign. Needs its own Supabase service-role credentials (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`) since this process previously never talked to Supabase. No-ops with a log line if those aren't set.

---

## 10. Admin dashboard

### 10.1 Layout (`src/app/admin/(dashboard)/layout.tsx`)

Right-to-left Arabic frame, top nav with three links:
- `/admin/products` (Products)
- `/admin/orders` (Orders)
- `/` (Storefront)

The header logo uses `SiteLogo` with the global brand logo URL.

### 10.2 Products list (`/admin/products`)

Server-rendered: reads `id, name_ar, slug, price, discount_price, created_at` from `products` ordered by `created_at desc`. Each row shows the name, slug (monospace LTR), effective price (`formatPrice`), and two links — “Edit” and “View”.

### 10.3 Create / edit form (`src/components/admin/ProductForm.tsx`)

This is the most complex client component in the project. Highlights:

- Bilingual inputs (every text field has an `_ar` and `_fr` cousin).
- Default-language toggle (`default_language: "ar" | "fr"`) — sets the initial locale visitors see.
- Brand color picker (`#rrggbb`); blank value defaults back to `BRAND_COLOR` via the DB trigger.
- Header promo strip text (the unified `header_bar_text_ar/fr`); legacy fields are still seeded on load to ease migration.
- Media slots:
  - Primary `media_type/url` (required).
  - Secondary `media_type/url` (gallery).
  - Tertiary `media_type/url` (gallery).
  - Plus a free-form `gallery` (URL list).
  - Per-CTA-banner: solid color + image URL + overlay opacity.
- Pricing: `price` (required > 0) and optional `discount_price`. Both are validated server-side.
- Features list (text rows, AR/FR), testimonials list (objects with name, quote, role, image, rating, location AR/FR), FAQs list (q/a AR/FR), stats (lines AR/FR), contact lines (lines AR/FR). The form requires:
  - ≥ 4 Arabic features.
  - ≥ 4 Arabic testimonials (counted on `name + quote`).
  - ≥ 4 Arabic FAQs (counted on `q + a`).
  - ≥ 3 Arabic stats items.
  - ≥ 3 Arabic contact lines.
  - All required Arabic title/description fields non-empty.
- Sticky footer config:
  - `offer_ends_at` (datetime-local → ISO),
  - `timer_label_*`, `savings_badge_*`,
  - bar/badge/timer/CTA colors,
  - `show_timer` toggle.
- Per-product `meta_pixel_id` (used by both the browser Pixel and CAPI).
- Per-product `whatsapp_message_template` (the message sent after order). The order route ignores requests where this is empty.
- Image upload buttons (testimonial avatars, CTA banner background) use `POST /api/admin/upload-image` and store the returned signed URL into the corresponding field.

On submit the component packages all values into a `ProductPayload` (see `src/app/admin/(dashboard)/products/actions.ts`) and calls `createProductAction` or `updateProductAction` (server actions). Those actions:

1. `validateProductPayload(payload)` — the minimum-content rules listed above.
2. `assertAdmin()` — re-checks auth + role.
3. For create, allocate a unique slug via `slugify(name_ar)` plus a random suffix on collision (max 80 attempts).
4. Insert/update the row.
5. `revalidatePath('/', `/${slug}`, '/admin/products')` so ISR pages get fresh data immediately.

`deleteProductAction(id)` is the third server action; it deletes the row and revalidates the same paths.

### 10.4 Orders list (`/admin/orders`)

Server-rendered: pulls every order plus the joined `products(name_ar, slug, price, discount_price, media_type, media_url)` and renders `OrdersAdminView` (client) with `AdminOrderRow[]`.

- Mobile: vertical cards with the customer phone, status badge, “tap for details” hint, and a delete button.
- Desktop: a table with phone, status, and a delete button.
- Click a row → opens `OrderDetailModal` (not shown in detail here) which lets the admin change status. Status changes call `PATCH /api/orders/[id]`, see §11.
- Delete calls `deleteOrderAction(orderId)` (Server Action), which uses an authed Supabase client and the admin RLS policy on `orders_delete_admin`.

The status-changing UI in `OrderRowActions.tsx` is a `<select>` bound to one of `pending / confirmed / shipped / cancelled`. When the value changes it `POST /api/orders/{id}` with `{ status }` and refreshes the local view.

---

## 11. API routes (Next.js) — full reference

All routes live under `src/app/api/**/route.ts`. Unless stated, they are reachable both on Netlify and Railway (Next.js routes are part of the same app).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/orders` | none (service role inside) | Create a `pending` order. Inserts into `orders`, sends Lead via CAPI, logs `order_created`. |
| PATCH | `/api/orders/[id]` | admin (session cookie) | Update order status. Triggers Meta Purchase / CancelledLead when relevant. Returns `meta.purchase.state` on `confirmed`. |
| POST | `/api/whatsapp/send` | none (service role inside) | Server-to-server bridge that proxies to the WhatsApp service. Idempotent: terminal outcomes mark the order in `order_communication_logs`. |
| POST | `/api/send-otp` | none | Pure proxy to `<WHATSAPP_SERVICE_URL>/api/send-otp`. |
| POST | `/api/verify-otp` | none | Pure proxy to `<WHATSAPP_SERVICE_URL>/api/verify-otp`. |
| POST | `/api/admin/upload-image` | admin | Multipart upload of an image to Supabase Storage. Allowed: `image/jpeg`, `image/png`, `image/webp`, `image/gif`; max 5 MB; path is `${folder}/${Date.now()}-${uuid}.${ext}`; returns the path and a 5-year signed URL. |
| GET | `/api/admin/signed-url?path=...` | admin | Returns a 1-hour signed URL for an existing object in `user-assets`. |
| POST | `/api/meta/lead` | none | Resends Lead CAPI for a given `order_id`. Idempotent via `meta_lead_sent`. |
| POST | `/api/meta/purchase` | none | Resends Purchase CAPI; only when the order is `confirmed` and not yet sent. |
| POST | `/api/meta/cancel` | none | Resends CancelledLead CAPI; only when the order is `cancelled` and not yet sent. |

Common patterns inside route handlers:

- Bodies are parsed once with a try/catch — invalid JSON ⇒ 400.
- Required field checks return a clear English error message; the client maps select strings to Arabic via `mapApiErrorToKey` in `src/lib/i18n.ts`.
- Anything that needs to bypass RLS uses `createServiceClient()`. Anything that needs the logged-in admin uses `createClient()` from `src/lib/supabase/server.ts`.
- All Meta CAPI calls are deduplicated against the order’s `meta_*_sent` booleans using `eq("meta_*_sent", false)` to keep concurrent retries safe.

---

## 12. Meta Pixel + Meta Conversions API (CAPI)

The project uses a **single unified Meta Pixel** for the entire storefront (catalog + all product landings). Per-product separation for Ads Manager is done via **`content_ids`** (Supabase `products.id` UUID) on ViewContent, InitiateCheckout, Lead, Purchase, and CancelledLead — not via separate pixel IDs.

**Env vars (strict, no cross-fallback):**
- Browser Pixel: `NEXT_PUBLIC_META_PIXEL_ID` only (`resolvePublicMetaPixelId()`).
- Server CAPI: `META_PIXEL_ID` only (`resolveServerMetaPixelId()`).
- When **both** are set they **must match** — `GET /api/meta/health` returns `ok: false` with an explicit error on mismatch.

Legacy DB columns `products.meta_pixel_id` and `orders.meta_pixel_id` are retained for historical records but **not used for event routing**.

Monetary values for InitiateCheckout, Lead, and Purchase are converted from MRU to USD via `toMetaPixelPurchaseMoney` (rate from `NEXT_PUBLIC_META_MRU_USD_RATE` or default `0.026`).

Product content fields (`content_type`, `content_ids`, `content_name`, `contents`) are built centrally by `resolveMetaContentData()` in `src/lib/meta-product-custom-data.ts`.

### 12.1 Pixel bootstrap and runtime

- **Bootstrap:** `META_PIXEL_BOOTSTRAP_JS` in `src/app/layout.tsx` loads the `fbq` queue stub inline (non-blocking).
- **Catalog `/`:** generic `PageView` only (listing page — no product `content_ids`).
- **Product landing `/{slug}`:** pre-hydration script fires `PageView` + **`ViewContent`** with product `content_ids`; `MetaPixelRuntime` dedupes the same after hydration.
- **Advanced matching:** merged on pixel init / before Lead; PII stored in `sessionStorage["meta_pixel_am:<pixelId>"]`.
- **Init-once:** unified pixel ID initialized once per page session; `trackSingle` targets that pixel.

### 12.2 Event helpers (`src/components/MetaPixel.tsx`)

- `trackInitiateCheckout(eventId, product)` — browser CTA; paired CAPI via `POST /api/meta/initiate-checkout`.
- `trackLead({ … })` — browser Lead on `/order-success` only; paired CAPI via `POST /api/orders/meta/lead`.
- **No browser Purchase** — Purchase is CAPI-only when admin confirms the order (COD model).
- **No AddToCart** — single-product COD checkout; InitiateCheckout is the correct checkout-intent event.

### 12.3 Funnel session id (`src/lib/meta-client.ts`)

- `meta_event_id_session` in `localStorage` is the canonical `eventID` for **InitiateCheckout and Lead**.
- `ensureMetaFunnelSession()` returns (or creates) this id; reused through checkout until cleared after order submit.
- `meta_event_last_activity_ms` extends a 60-minute sliding TTL.
- `clearMetaSessionEventId()` runs after successful order form submit.

### 12.4 Server CAPI sender (`src/utils/meta.ts`)

- `sendMetaEvent({ pixelId, eventName, eventId, eventSourceUrl, userData, customData, requestHeaders, eventTimeSec })`:
  - Requires `META_CAPI_ACCESS_TOKEN`; endpoint `https://graph.facebook.com/{META_CAPI_VERSION || "v22.0"}/{pixelId}/events`.
  - Resolves `event_source_url` via `resolveEventSourceUrl({ stored: eventSourceUrl, headers })` — same pattern for Lead and InitiateCheckout CAPI.
  - Hashes PII per Meta spec; sends `fbp`/`fbc` verbatim; uses stored shopper IP/UA on order-backed events.
  - Retries up to 3 times; locks `event_time` on first attempt; treats Meta dedup responses as success.

### 12.5 Dispatchers and idempotency

- **Orders:** `dispatchMetaEvent(supabase, orderId, eventType, context)` for `lead`, `purchase`, `cancel` — ledger `order_meta_dispatches` + `meta_*_sent` flags.
- **Pre-order funnel:** `dispatchInitiateCheckoutMetaEvent(...)` — ledger `funnel_meta_dispatches` keyed by `(event_id, 'initiate_checkout')`.
- **Event ids:** InitiateCheckout + Lead share funnel `meta_event_id`; Purchase uses `purchase_{orderId}`; CancelledLead uses `cancelledlead_{orderId}`.

### 12.6 Browser + CAPI hybrid events

- **InitiateCheckout:** browser on CTA, CAPI immediately after (same `event_id`, `event_time` captured before browser fire).
- **Lead:** browser on `/order-success` first, then CAPI (same funnel `event_id`). Admin retry: `POST /api/meta/lead`.

### 12.7 Event matrix

| Event | Browser Pixel fires when | CAPI fires when | Dedup / id key | `content_ids` |
|---|---|---|---|---|
| `PageView` | Catalog + product route load | — | Per-route dedupe | — |
| `ViewContent` | Product landing `/{slug}` | — | Per-route dedupe | ✅ `products.id` |
| `InitiateCheckout` | CTA click | `POST /api/meta/initiate-checkout` | Funnel `event_id` + `funnel_meta_dispatches` | ✅ |
| `Lead` | `/order-success` | `POST /api/orders/meta/lead` | Funnel `event_id` + `meta_lead_sent` | ✅ |
| `Purchase` | — | Admin `confirmed` or `POST /api/meta/purchase` | `purchase_{orderId}` + `meta_purchase_sent` | ✅ |
| `CancelledLead` | — | Admin `cancelled` or `POST /api/meta/cancel` | `cancelledlead_{orderId}` + `meta_cancel_sent` | ✅ |

---

## 13. Internationalization (Arabic / French)

### 13.1 Storefront copy (catalog, header, footer, etc.)

- JSON files in `src/locales/`: `ar.json` (default) and `fr.json`.
- Loaded synchronously by `src/lib/i18n.ts` (`getNested`, `translate`).
- `LanguageProvider` (`src/contexts/LanguageContext.tsx`) chooses the initial locale:
  - On mount, reads `localStorage["zaine-locale"]`. If `"ar"` or `"fr"`, use it; otherwise default to `"ar"`.
  - Whenever the locale changes, it mutates `document.documentElement.lang` and `dir` (`rtl` for Arabic, `ltr` for French).
- `useLanguage()` exposes `{ locale, setLocale, dir, t }` where `t(key, vars)` interpolates `{{var}}` placeholders.
- `LanguageSwitcher` is a tiny segmented control (AR / FR) — visible in the storefront header and in the landing header.

### 13.2 Product copy

- Every text field on `products` has an `_ar` and `_fr` cousin.
- `src/lib/product-locale.ts::getLocalizedProductCopy(locale, product)` picks the right value and falls back:
  - `pickStr` — if `locale === "fr"` and the FR text is non-empty, return FR; otherwise return AR (so a missing French translation just shows Arabic).
  - `pickFeatures`, `pickTestimonials`, `pickFaqs`, `pickOptionalLine` mirror that logic for arrays / objects.
- Optional fields (testimonials badge, stats section title, footer note) provide hard-coded sensible defaults in both languages when both AR and FR are empty.
- The landing page calls `setLocale(product.default_language)` once on mount, so a French-default product opens in French even if the user’s last locale was Arabic — until the user clicks the switcher.

### 13.3 Admin copy

The admin UI uses the `src/locales/admin-ar.ts` strings file directly (no language switcher in admin).

---

## 14. Currency, branding, and theming

### 14.1 Currency

- `src/lib/currency.ts::formatPrice(amount)` returns `"<number> MRU"`. Numbers are rounded to two decimal places and trailing zeros trimmed.
- Two DB CHECK constraints (`products_currency_mru_check`, `orders_currency_mru_check`) ensure no other currency can ever be inserted.
- `toMetaPixelPurchaseMoney(amount, "MRU")` converts MRU to USD for Pixel events using `NEXT_PUBLIC_META_MRU_USD_RATE` (default `0.026`). MRU stays MRU in the database and on the storefront — only the Meta Pixel payload is converted.

### 14.2 Brand identity

- `src/lib/site-branding.ts` exports `BRAND_COLOR = "#006B0C"` and `SITE_LOGO_URL` (a specific PNG hosted on i.postimg.cc).
- DB trigger `enforce_product_brand_identity` re-applies the brand color when blank.
- `SITE_LOGO_FRAME_CLASS` is a viewport-relative frame used by `SiteLogo` so storefront, admin, and landing headers all crop the logo identically.

### 14.3 Theming variables

The landing page composes its accent palette dynamically via CSS variables (`--accent`, `--accent-muted`, `--accent-foreground`, `--card`, `--muted`, `--brand-accent`) set at the root of `<ProductLanding>`. `--accent-muted` is computed with `color-mix(in srgb, var(--accent) 34%, white)` — that is what gives every landing a coordinated light surface from the brand color. Every section uses these variables for borders, backgrounds, and gradients so a brand-color change instantly re-themes the whole page.

`src/app/globals.css` defines storefront button classes (`.store-btn-primary`, `.store-input`) and the Mux player chrome (`.landing-mux-shell` aspect-ratio overrides).

---

## 15. File and image uploads (Supabase Storage)

- Bucket: `user-assets`, private.
- Upload route: `POST /api/admin/upload-image` (multipart `file`, optional `folder`).
  - MIME whitelist: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
  - Size limit: 5 MB.
  - Path: `${folder}/${Date.now()}-${uuid}.${ext}` where `folder` is sanitized to `[a-zA-Z0-9/_-]` (default `testimonials`).
  - Cache-Control: `31536000` (one year) — the file content is keyed by uuid so changing it just uploads a new path.
  - Returns `{ path, signedUrl }` with a 5-year signed URL (`60*60*24*365*5`). The admin form stores that URL on the product row.
- Sign-existing route: `GET /api/admin/signed-url?path=...` — 1-hour signed URL, used by the admin form to refresh a stale link or preview an asset.
- Storage RLS:
  - `user_assets_admin_read` lets logged-in admins read objects directly with the SDK if needed.
  - There is no public bucket and no anonymous policy — public access is always via signed URLs persisted on the row.

The implication: the landing pages can be **fully public** (no auth required) and still display private assets, because each asset URL is signed at admin save time. If you ever shorten the signing TTL, you will need to re-sign assets on read.

---

## 16. Caching, revalidation, and ISR

- `/` and `/[slug]` both export `revalidate = 60`. Next.js serves the cached HTML for up to 60 seconds before re-fetching from Supabase.
- `generateStaticParams` builds all known product slugs at build time, so cold cache hits still get a fast first byte.
- Server actions (`createProductAction`, `updateProductAction`, `deleteProductAction`) call `revalidatePath('/')`, `revalidatePath(`/${slug}`)`, and `revalidatePath('/admin/products')` so changes appear immediately after save (no waiting for the 60-second window).
- Admin pages are marked `export const dynamic = "force-dynamic"` so they always reflect live data.
- The `/order-success` page is server-rendered per request; hybrid Meta Lead runs client-side in `OrderSuccessEffects`.

---

## 17. Environment variables — full list

| Variable | Where used | Required by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Everywhere that talks to Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Public Supabase client (`createPublicClient`), SSR client, middleware. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Order inserts, Storage uploads, OTP storage, Meta CAPI lookups. Never expose to the browser. |
| `NEXT_PUBLIC_SITE_URL` | Server + Pixel CAPI fallback | Canonical production URL used by `resolveEventSourceUrl` when no referer is available. |
| `META_CAPI_ACCESS_TOKEN` | Server | Required for any CAPI event to be sent. Without it `sendMetaEvent` returns `{ ok:false, reason:"missing_access_token" }`. |
| `META_CAPI_VERSION` | Server | Optional; defaults to `v22.0`. |
| `META_PIXEL_ID` | Server CAPI only | **Required** for CAPI. Must match `NEXT_PUBLIC_META_PIXEL_ID` when both are set. No per-product fallback. |
| `NEXT_PUBLIC_META_PIXEL_ID` | Browser Pixel | **Required** for browser events. Baked in at build time on Netlify. |
| `NEXT_PUBLIC_META_MRU_USD_RATE` | Browser | Multiplier MRU → USD for Meta Pixel only. Default `0.026`. |
| `WHATSAPP_SERVICE_URL` | Next.js (Netlify) | HTTPS base URL of the WhatsApp service. Required on Netlify; can be omitted on a single-Railway deploy. |
| `WHATSAPP_AUTH_DIR` | WhatsApp service | Path on disk for Baileys credentials. **Must** live under a persistent volume on Railway, e.g. `/var/data/baileys_auth`. |
| `OTP_HASH_SECRET` | WhatsApp service | HMAC secret for hashing OTPs before storing in `otp_codes`. |
| `OTP_TTL_SECONDS` | WhatsApp service | OTP lifetime, clamped to `[60, 3600]`. Default `300`. |
| `RAILWAY_ENVIRONMENT`, `RAILWAY_PROJECT_ID`, `RENDER`, `WHATSAPP_USE_LOOPBACK` | WhatsApp service | Detected to enable loopback calls on single-host deployments. |
| `NETLIFY`, `NETLIFY_DEV` | Next.js | Detected so `/api/whatsapp/send` refuses to use loopback when running serverless. |
| `PORT`, `HOST` | WhatsApp service | Listen address (defaults `0.0.0.0:3000`). |

---

## 18. Deployment (Netlify + Railway / Single Railway)

### 18.1 Two-service production setup

Front (Netlify):

1. Connect the repo. Netlify auto-detects `next build`. Do **not** set the publish directory manually — `@netlify/plugin-nextjs` controls it.
2. Use a patched Next.js (the repo pins ≥ 15.2.6, see the CVE link in the README).
3. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `META_CAPI_ACCESS_TOKEN`, `NEXT_PUBLIC_META_PIXEL_ID`, `META_PIXEL_ID` (must match), `WHATSAPP_SERVICE_URL`.

WhatsApp service (Railway):

1. New service from the same repo. Railway reads `railway.toml` → `builder = "DOCKERFILE"`. Dockerfile uses `node:22.13-bookworm-slim`, runs `npm ci --include=dev`, `next build`, `npm prune --omit=dev`, exposes 3000, and starts `npm run start` (= `node server.js`).
2. **Add a volume** (e.g. mount `/var/data`).
3. Variables: `NODE_ENV=production`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_AUTH_DIR=/var/data/baileys_auth`, `OTP_HASH_SECRET`, `OTP_TTL_SECONDS=300`.
4. The dashboard at `/` of the Railway URL shows the QR for first-time pairing. Scan it once with the seller’s WhatsApp app.
5. Copy the Railway public URL (e.g. `https://your-service.up.railway.app`, **no trailing slash**) into Netlify `WHATSAPP_SERVICE_URL`. Redeploy Netlify.

### 18.2 Single-Railway setup (smaller / dev)

1. Skip Netlify entirely. Deploy the same Dockerfile to Railway.
2. Do **not** set `WHATSAPP_SERVICE_URL`. The Next.js route auto-detects Railway via `RAILWAY_ENVIRONMENT` and falls back to `http://127.0.0.1:$PORT`.
3. Everything (catalog, landing, admin, API, WhatsApp dashboard) lives at one origin.

### 18.3 Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Meta + WhatsApp service URL
npm run dev                  # equivalent to `node server.js` with dev=true
```

`npm run dev` runs `server.js`, which boots Next.js in dev mode and Baileys at the same time. On the first run a QR will appear on the dashboard (`http://localhost:3000/`).

---

## 19. Security model summary

- **No customer auth.** Customers never authenticate; they cannot enumerate orders. The order-success page only accepts an `order_id` it just received from `/api/orders` and only uses it to trigger a WhatsApp message (no PII is rendered).
- **Admin auth via Supabase.** Login on `/admin/login` issues HTTP-only Supabase cookies. Middleware enforces auth on all `/admin/*` routes server-side.
- **Defense in depth via RLS.** Even if a future bug exposes an anon-keyed client, the `orders` table has no insert policy and admin-only read/update/delete. Storage is private. `order_communication_logs` and `otp_codes` are RLS-enabled with no client policies — only the service role writes them.
- **Service role kept server-side.** `SUPABASE_SERVICE_ROLE_KEY` is never read from `NEXT_PUBLIC_*` env. The only files that read it are `src/lib/supabase/service.ts` and `otp-service.js` — both server-only.
- **Brand identity DB-level lock.** `enforce_product_brand_identity` re-applies the green when an admin tries to save blank.
- **OTP storage is hashed.** The plain code is only ever in transit; only the HMAC is in the database, so a DB leak can’t replay codes.
- **Meta CAPI inputs are hashed.** All `fn`/`ln`/`ph` values go through SHA-256 with normalization per Meta’s spec.
- **Storage URLs are signed and long-lived.** Asset uploads return signed URLs valid for five years — long enough that you don’t need to re-sign on every page render, short enough that the rolling key rotation policy of Supabase can eventually invalidate them.

Known caveats worth tightening before going wide:

- The `handle_new_user` trigger marks every signup as `admin`. Close public sign-up in Supabase Auth or modify the trigger before opening signups.
- The WhatsApp service endpoints have no auth (see §9.3) — keep the service on a private network or add a shared-secret header.
- `OTP_HASH_SECRET` must be set to a strong value; the default fallback `"dev-secret-change-me"` should never reach production.

---

## 20. Operational runbook (common issues)

- **Order created but no WhatsApp message arrives.**
  - Inspect `order_communication_logs` for that `order_id`. You will see `order_created`, `whatsapp_triggered`, and either `whatsapp_sent`, `whatsapp_skipped`, or `whatsapp_failed`.
  - `skipReason: "whatsapp_service_unconfigured"` → set `WHATSAPP_SERVICE_URL` on Netlify.
  - `skipReason: "no_whatsapp_template"` → fill `products.whatsapp_message_template` for that product.
  - `whatsapp_failed` → open the Railway dashboard (`/whatsapp-dashboard`) and check status and logs. If status is `qr`, rescan; if status is `disconnected` with `loggedOut`, the seller logged the device out from WhatsApp — rescan from the dashboard.
- **Meta Purchase event missing.**
  - Confirm `META_CAPI_ACCESS_TOKEN` is set. Without it `processMetaByStatus` short-circuits.
  - Confirm the order has `meta_pixel_id` (or the env fallback is set). Without it, `state: skipped, reason: missing_order_meta`.
  - Confirm the admin changed the status to `confirmed`. Other statuses do not fire Purchase.
  - Resend manually: `POST /api/meta/purchase { order_id }` after fixing config.
- **Catalog or landing page shows stale data.**
  - Wait up to 60 s (ISR cache) or run the matching server action (edit + save the product) to force `revalidatePath`.
- **Admin login redirect loops.**
  - Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in the *same* Netlify build environment as where the middleware runs. The middleware needs both to read cookies.
- **Order form rejects valid Mauritanian numbers.**
  - The validator requires exactly 8 digits starting with 2, 3, or 4. The `+222` prefix is added automatically. Numbers shown with a leading 0 should be entered without it.
- **Sticky footer timer is gone.**
  - It only renders when `sticky_footer_show_timer=true` and `sticky_footer_offer_ends_at` is set in the future. Resetting the date in the admin form re-enables it.
- **`/[slug]` returns 404 after renaming a product.**
  - The product’s `slug` is the URL. Old URLs work only if the old slug is added to `old_slugs[]` (which the admin form preserves but does not auto-fill); a redirect from old to new uses `getProductByOldSlug`.

---

This document mirrors the application as it exists in the repository today (Next.js 15.2.x, Supabase, Baileys 7-rc, Meta CAPI v22.0). Future migrations should append to the same `supabase/migrations/` series and update §5 here when they change tables or constraints. Any new API route should be listed in §11; any new client tracking call should be added to the matrix in §12.5.
