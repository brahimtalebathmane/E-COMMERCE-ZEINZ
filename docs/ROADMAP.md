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
| 1. Follow-ups | `followups` | done, awaiting approval | none needed | — |
| 2. Phase B inventory | `phase-b` | — | — | — |
| 3. Phase C treasury | `phase-c` | — | — | — |
| 4. Phase D reconciliation | `phase-d` | — | — | — |

## Stage 1 — follow-ups

- [x] 1.1 Orders list loads every order (paged reads), tab counts stay correct
- [x] 1.2 Assistant `get_order` fixed (removed `form_data` column), deleted orders excluded
- [x] 1.3 Link Meta campaigns to affiliate products (SA/KW) from the analytics page; then explain SAR/KWD rates
- [x] 1.4 Owner warning when `orders_country_id_autofill_log` has rows after 2026-10-07 01:54 UTC
- [x] 1.5 Test for `POST /api/orders` (country_id, currency, snapshot) with mocks (`tests/orders-route.test.mts`)
- [ ] Checks green → ask "backup done, apply" (no migrations expected) → merge + push (with `d389c83`) → post-deploy checks

## Stage 2 — Phase B inventory

- [ ] Schema: stock_purchases, stock_purchase_lines, inventory_movements (append-only), inventory settings (go-live date), product low-stock threshold, stock view
- [ ] One Postgres function for order status changes: compare-and-set, history row, stock movement, unique (order_id, type)
- [ ] All callers through it (API route, bulk, WhatsApp sale, assistant); Meta side effects only after success, unchanged
- [ ] Rules: confirmed = reserved; shipped = sale_out; internal_return asks resellable/damaged; cancel before ship = nothing; qty edit on shipped = correction; soft-delete/restore of shipped = reverse/re-apply
- [ ] Go-live: printable count sheet, bulk opening-quantity screen; only orders shipped after go-live deduct; returns of pre-go-live orders still add
- [ ] UI: on hand / reserved / available, negative highlight, movement history, restock, adjustment (reason), low-stock threshold + list, stock shown in WhatsApp sale picker with a non-blocking warning
- [ ] Weighted average cost after a purchase, offer (not apply) to update cost_price
- [ ] Tests (PGlite + unit): exactly-once deduction, retries, return resellable/damaged, cancel, qty edit, soft-delete/restore, affiliate untouched, go-live rule
- [ ] Approval → apply → push → checks

## Stage 3 — Phase C treasury

- [ ] Schema: treasury settings (go-live), accounts (cash/bank/mobile_wallet/person_custody), categories (+ subcategories, direction, counted_in_profit_by), parties (delivery agents, default), transactions (append-only, transfers paired, reversals), settlements, audit log; orders.delivery_agent_id
- [ ] Go-live: opening balances; tick still-unpaid recent shipped orders; everything else pre-go-live = settled
- [ ] Settlement screen (collected, fees, expected net, received, account, difference with reason); one Sales income per order (unique), Delivery fees expense; return after settlement reverses
- [ ] Stock purchase → Stock purchases expense; cash count adjustment
- [ ] UI: balances, money held per agent, transaction list + filters, quick add, settlement, party statement
- [ ] Tests: settlement math, no double settlement, return after settlement, transfers vs profit, reversals, MR only
- [ ] Approval → apply → push → checks

## Stage 4 — Phase D reconciliation

- [ ] Profits page + home: net = order gross profit − opex from treasury (by category, from treasury go-live)
- [ ] Reconciliation report (period): shipped revenue vs settled sales, unsettled, unlinked sales, profit vs cash gap explained, data-quality flags
- [ ] Full-scenario test
- [ ] Approval → apply → push → checks
- [ ] Final summary + Arabic daily usage guide

## Log

- 2026-10-07: connection verified (production `ultlrcfsamyekgeerqcv`, MR/SA/KW present, 1,325 orders / 1,222 live). Branch `followups` created from `d389c83`.
- 2026-10-07: stage 1 code complete on `followups` (no migrations). Checks: tsc, lint (no errors), 36 unit tests, 16 migration checks, check:server-actions, next build. Waiting for push approval.
