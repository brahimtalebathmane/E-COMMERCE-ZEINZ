# ZEINZ roadmap — follow-ups, inventory, treasury, reconciliation

Single source of truth for the remaining work. Update after every step. A new
session must be able to continue from this file alone.

## How to work (read first)

- Production DB: Supabase `ultlrcfsamyekgeerqcv` (Postgres 17.6). The Supabase
  MCP is connected to it. Read-only queries: run freely. Writes only inside an
  approved migration. Never `supabase db push` / `migration repair`.
- Migrations are numbered by hand (next free: see `supabase/MIGRATIONS_LOG.md`),
  tested on PGlite rebuilt from all repo migrations (harness: see "PGlite" below),
  applied through the MCP after the owner replies **"backup done, apply"**
  for that stage. Log each one in `MIGRATIONS_LOG.md` with its apply date and add
  checks to `supabase/checks/verify_migrations.sql`.
- One branch per stage (`followups`, `phase-b`, `phase-c`, `phase-d`). Merge into
  `main` and push only after the owner approves that stage. A push redeploys
  Netlify and restarts the Railway WhatsApp worker.
- Deploy order per stage: migrations (additive only, old code keeps working) →
  push → post-deploy checks.
- Inventory and treasury: Mauritania only (`hasLocalOperations`), owned products,
  MRU. Never touch SA/KW affiliate orders. All MR sales are manual WhatsApp sales.
- No new Meta events; existing Meta behavior unchanged.
- Before asking for approval: `npx tsc --noEmit`, `npm run lint`, `npm test`,
  `npm run check:server-actions`, `npm run build`, PGlite migration checks.

PGlite harness: `npm i @electric-sql/pglite` in a scratch dir; apply every file in
`supabase/migrations` in name order except `000_manual_migrations_only.sql`,
after creating stand-ins: roles anon/authenticated/service_role, schema `auth`
(`users`, `uid()`), schema `storage` (`buckets`, `objects`), publication
`supabase_realtime`; strip `create extension` from 001; create
`public.is_admin(uuid)` before 058. It lives in `tests/pglite/` — run
`npm run test:migrations` (scenarios in `tests/pglite/scenarios/`, one file per phase).

## Status

| Stage | Branch | Code | Migrations applied | Pushed |
|---|---|---|---|---|
| Phase A (country scoping) | `phase-a` → main | done | 031, 067–069 (2026-10-07) | `6b4ff5f` |
| Phase A close-out | main | done | — | **not yet** (`d389c83`, goes with stage 1) |
| 1. Follow-ups | `followups` → main | done | 070 (2026-10-07 03:18 UTC) | `f374d20` (2026-10-07 03:19 UTC) |
| 2. Phase B inventory | `phase-b` → main | done | 071, 072 (2026-10-07 03:49 UTC) | `30e27f6` (03:49 UTC) |
| 3. Phase C treasury | `phase-c` → main | done | 073, 074 (2026-10-07 ~21:55 UTC) | yes (see log) |
| 4. Phase D reconciliation | `phase-d` | done, awaiting push approval | none (code only) | — |
| 5. Admin redesign (mobile-first) | `stage-5-redesign` | not started — begins after Phase D is live | none planned | — |

## Stage 1 — follow-ups

- [x] 1.1 Orders list loads every order (paged reads), tab counts stay correct
- [x] 1.2 Assistant `get_order` fixed (removed `form_data` column), deleted orders excluded
- [x] 1.3 Link Meta campaigns to affiliate products (SA/KW) from the analytics page; then explain SAR/KWD rates
- [x] 1.4 Owner warning when `orders_country_id_autofill_log` has rows after 2026-10-07 01:54 UTC
- [x] 1.5 Test for `POST /api/orders` (country_id, currency, snapshot) with mocks (`tests/orders-route.test.mts`)
- [x] 070 SAR/KWD rates (owner chose 11.47 / 140), applied 2026-10-07 03:18 UTC
- [x] Merge + push (with `d389c83`) → `f374d20`; Railway redeployed. Netlify: owner to confirm Published (the `.env` site URL is not the live domain).

## Stage 2 — Phase B inventory

- [x] Schema (071): stock_purchases, stock_purchase_lines, inventory_movements (append-only), inventory_settings (go-live, immutable), products.low_stock_threshold, inventory_stock view, orders.shipped_at/returned_at/return_disposition
- [x] change_order_status (072): compare-and-set + history; stock via trg_orders_sync_stock → sync_order_stock (net reconciliation, unique primary (order, product, type))
- [x] All callers go through updateOrderStatusWithEffects → rpc; Meta unchanged, after success
- [x] Rules implemented in sync_order_stock; return choice in the order modal (bulk = resellable)
- [x] Go-live: /admin/inventory/count-sheet, /admin/inventory/opening (inventory_go_live, once)
- [x] UI: /admin/inventory, /admin/inventory/[productId], /admin/inventory/restock; WhatsApp sale picker shows available + warning
- [x] Weighted average cost offered after a restock (applySuggestedCostAction)
- [x] Tests: 36 PGlite checks (tests/pglite/scenarios/phase-b.mjs) + unit tests (inventory, update-status)
- [x] Owner approved; 071 + 072 applied 2026-10-07 03:49 UTC (verified: all objects present, 0 movements, go-live not set, 175 units reserved)
- [x] Push → post-deploy checks
- [ ] Owner: tidy old confirmed orders (ship/cancel) BEFORE the opening count, then print the count sheet and enter the opening count

## Stage 3 — Phase C treasury

- [x] Schema: treasury settings (go-live), accounts (cash/bank/mobile_wallet/person_custody), categories (+ subcategories, direction, counted_in_profit_by), parties (delivery agents, default), transactions (append-only, transfers paired, reversals), settlements, audit log; orders.delivery_agent_id
- [x] Go-live: opening balances; tick still-unpaid recent shipped orders; everything else pre-go-live = settled
- [x] Settlement screen (collected, fees, expected net, received, account, difference with reason); one Sales income per order (unique), Delivery fees expense; return after settlement reverses
- [x] Stock purchase → Stock purchases expense; cash count adjustment
- [x] UI: balances, money held per agent, transaction list + filters, quick add, settlement, party statement
- [x] Tests: settlement math, no double settlement, return after settlement, transfers vs profit, reversals, MR only
- [x] Approval → apply (073 + 074, 2026-10-07 ~21:55 UTC, verified) → push → checks

## Stage 4 — Phase D reconciliation

- [x] Profits page + home: net = order gross profit − opex from treasury (by category, from treasury go-live) — `OpexCard` on /admin/analytics, home KPI caption; categories counted "orders" never subtracted twice
- [x] Reconciliation report (period): /admin/treasury/reconciliation — shipped revenue vs settled / with agents / outside, unlinked sales, profit → cash bridge (exact identity, "unexplained" must be 0), opex by category, agents, flags (no delivery cost, no cost price, no Meta campaign, ads paid ≠ Meta)
- [x] Full-scenario test: tests/phase-d-scenario.test.mts (PGlite + real migrations) + tests/reconciliation.test.ts
- [ ] Approval → push → checks (no migrations in Phase D)
- [x] Final summary + Arabic daily usage guide: docs/DAILY_GUIDE_AR.md

## Stage 5 — Admin redesign: fast, smooth, mobile-first (Apple-level quality)

**Start only after Phase D is live** (pushed and checked). Branch `stage-5-redesign`, delivered in small pushes (navigation shell first, then screen by screen), each one pushed only with the owner's approval.

Goal: the admin feels like a native iPhone app made by a world-class company: clean, calm, organized, fast, and comfortable one-handed on an iPhone. The owner runs the business from the phone, so mobile comes first and desktop must still work well.

### Hard rules
- UI only. No change to business logic, data, database, permissions, Meta events, order status rules, inventory or treasury behavior. No migration unless the owner approves one.
- Arabic RTL everywhere, done properly: logical CSS properties, directional icons mirrored, numbers and amounts aligned correctly.
- Every existing feature and label stays reachable. Nothing disappears; things only get reorganized.
- Every push needs the owner's approval, as usual.

### Step 1 — Audit (no code changes)
- [ ] Measure the current admin on a mobile profile: load time, Web Vitals (LCP, INP, CLS), JavaScript size per page (from `next build` output), slow database queries (Supabase advisors / query logs, read-only).
- [ ] Screenshots of every admin page at 390×844 and 430×932 with WebKit, plus desktop. Sign-in: open a browser window where the owner logs in once, then reuse that session. Never ask for the password in chat. On production: only navigate and take screenshots; never submit a form or change any data.
- [ ] Page-by-page problem list: layout, overflow, tap targets, slowness, inconsistencies.

### Step 2 — Design system (show the owner before applying)
- [ ] Tokens inspired by Apple's HIG: calm neutral grays plus one accent color, typography scale, 4/8 spacing grid, corner radius, shadows. Light and dark mode follow the phone setting.
- [ ] Typography: `system-ui` first (SF Arabic / SF Pro on iPhone), no heavy web fonts. Clear hierarchy: large titles, readable body, quiet secondary text.
- [ ] Components: buttons, inputs, selects, segmented controls, list rows, cards, bottom sheets, dialogs, toasts, order-status badges, empty states, skeleton loaders.
- [ ] Before/after mockups at iPhone size of 3 key screens (orders list, WhatsApp sale form, dashboard home). **Wait for the owner's approval of the direction.**

### Step 3 — Apply, mobile-first
Navigation
- [ ] iPhone: bottom tab bar (Orders, WhatsApp sale, Inventory, Treasury, More), large titles, sticky blurred header.
- [ ] Desktop: a clean sidebar.

iPhone details
- [ ] Safe areas (`viewport-fit=cover`, `env(safe-area-inset-*)`), `dvh` instead of `vh`.
- [ ] Inputs at least 16px (no Safari zoom); touch targets at least 44×44.
- [ ] Bottom sheets instead of centered popups on mobile.
- [ ] The right keyboard per field: numeric for amounts and quantities, `tel` for phones.
- [ ] No horizontal scrolling anywhere; on mobile, tables become clean card lists.

Key workflows, one-handed, in this priority order
1. [ ] Create a WhatsApp sale (all sales happen here, so make it as fast as possible)
2. [ ] Change an order's status (shipped, internal return, cancelled)
3. [ ] Settle with the delivery agent
4. [ ] Add an expense
5. [ ] Restock and inventory count
6. [ ] Today's numbers on the dashboard

Speed
- [ ] Server components where possible, less client JS, lazy-load heavy parts (charts).
- [ ] Virtualized or paginated long lists. The orders list has more than 1,200 orders and already loads them all for the server-side filters (`ab8bc13`), so keep "select all matching" and the count/total correct.
- [ ] Skeleton loaders instead of blank screens, optimistic UI where safe, no layout shift.
- [ ] Fix the slow queries found in the audit.

Motion and feel
- [ ] Subtle 200–300ms transitions, smooth scrolling, respect `prefers-reduced-motion`.

### Step 4 — Install as an app on iPhone (PWA)
- [ ] Web app manifest, apple-touch-icon, `apple-mobile-web-app-capable`, status bar style, splash screens, so the admin opens full screen from the home screen.
- [ ] Service worker: static assets only; never cache orders, money or any admin data. Note: a serwist worker already exists (`/sw.js`, scope `/admin/`). Audit its caching rules first.

### Step 5 — Verify
- [ ] Re-measure Web Vitals and JS size; show before vs after.
- [ ] Screenshots of every page at iPhone sizes in light and dark mode, plus desktop.
- [ ] tsc, lint, tests, build pass.
- [ ] Short Arabic checklist for testing on the owner's iPhone, including adding the app to the home screen.

## Log

- 2026-10-07: connection verified (production `ultlrcfsamyekgeerqcv`, MR/SA/KW present, 1,325 orders / 1,222 live). Branch `followups` created from `d389c83`.
- 2026-10-07: stage 1 code complete on `followups` (no migrations). Checks: tsc, lint (no errors), 36 unit tests, 16 migration checks, check:server-actions, next build. Waiting for push approval.
- 2026-10-07: Phase B code complete on `phase-b`: tsc, lint (no errors), 49 unit tests, 55 migration checks, check:server-actions, next build. Production pre-check: no name clashes; 182 orders currently confirmed (they will show as reserved). Waiting for "backup done, apply".
- 2026-10-07 03:49 UTC: 071 + 072 applied on production; verification query clean.
- 2026-10-07: Phase B pushed (`30e27f6`, 03:49 UTC). Phase C code complete on `phase-c`: tsc, lint, 55 unit tests, 98 migration checks (43 for 073/074), next build. NEXT: owner approval → apply 073 then 074 on production (wrap each file in begin/commit via MCP execute_sql), verify, merge phase-c, push. Then Phase D (reconciliation) — not started.
- 2026-10-07 ~21:55 UTC: 073 + 074 applied on production (first 073 attempt hit a network error, nothing applied, retried). Verified: 9 tables, 3 views, 2 order triggers, orders.delivery_agent_id, 14 MR system categories, 0 transactions, treasury not live, RLS on all 9 tables, functions service_role only. phase-c merged into main and pushed. NEXT: Phase D on branch `phase-d`.
- Owner: open /admin/treasury/setup to go live (accounts + opening balances, default delivery agent, tick shipped orders still unpaid).
- 2026-10-07 ~22:00 UTC: Railway deployment for `ef6168c` succeeded. Phase D code complete on `phase-d` (no migrations): lib src/lib/treasury/reconciliation.ts (pure) + reconciliation-data.ts (loaders), OpexCard, home KPI, reconciliation page + tab, guide. Checks: tsc, lint (no errors), 63 unit tests, 98 migration checks, check:server-actions, next build. NEXT: owner approval → merge phase-d into main → push → check Railway. Then the owner's physical steps (tidy confirmed orders, opening count, treasury go-live).
- 2026-10-07 22:43 UTC: side task — orders list filters (status multi-select, date range + older than 7/30/60 days, product, source; server-side, in the URL, matching count/total, select all matching, chunked bulk actions) pushed as `ab8bc13` from branch `orders-filters` (no migration: existing indexes cover status/product/ordered_at). main merged into `phase-d` (`6ea0ddc`); Phase D still awaiting push approval.
- 2026-10-07: Stage 5 (admin redesign, mobile-first) added to the roadmap at the owner's request; starts only after Phase D is live.
