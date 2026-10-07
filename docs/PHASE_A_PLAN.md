# Phase A — Country scoping

Status (2026-10-07): **done.** Migrations 031 and 067–069 are applied to
production, and the code (`6b4ff5f`) was deployed 2026-10-07 01:52 UTC (see
`supabase/MIGRATIONS_LOG.md`). The SQL files in `supabase/migrations/` are the
source of truth; the SQL quoted below is the approved draft.
Changes made during implementation, on top of this plan:

- 068 also rewrites the 3 `SARL` orders to `SAR` (aborting if any SARL order
  is not a cancelled Saudi storefront order) and adds
  `orders_currency_iso_check` (`^[A-Z]{3}$`), so every Meta Lead / Purchase /
  CancelledLead — which all send `orders.currency` — carries an ISO code.
- 068/069 trigger functions are `security definer`: otherwise a staff member
  with `manage_products` but no order permission sees no orders through RLS
  and could move a product with orders to another country.
- WhatsApp sales: owned products in the local-operations market only
  (decision 4a); the button is hidden elsewhere.
- Deleted orders are also filtered from the main orders list, its live sync
  queries and the assistant's order list (decision 3); RLS is unchanged so the
  live sync still receives the delete.
- 1000-row cap: CTWA ad report, WhatsApp signal coverage, marketing audience
  and shipped-customer exclusion RPCs, and the ad-spend gap check now read
  every row. `fetchAllRows` takes a column list, and every ad-spend read pages
  on `(date, product_id)` — paging on `date` alone could repeat or skip rows.
- 068 creates `orders_country_id_autofill_log` (one row per insert the
  trigger had to fill); step 5 checks it on real orders
  (`supabase/checks/phase_a_step5_autofill.sql`) instead of placing a test
  storefront order, which would send a real Lead to Meta.
- 069 (changed 2026-10-07): NOT NULL, but the trigger keeps filling a missing
  `country_id` from the product permanently and logs it, so a forgotten insert
  path can never block a customer order. The log is kept and should stay empty
  for orders after 2026-10-07 01:54 UTC. An explicit wrong country is still
  rejected.
- `000_manual_migrations_only.sql`: a tripwire that only raises, so any
  `supabase db push` fails before running anything.
- Tested: 45 migration checks on PGlite across 5 scenarios, 31 unit tests,
  type check, lint, `check:server-actions`, `next build`.

Markets: **MR** = owned products, local operations (inventory + treasury).
**SA, KW** = affiliate only (COD Partner holds stock and cash) — no inventory,
no treasury, ever.

---

## 0. Apply order (runbook)

| # | Where | What | Reversible? |
|---|---|---|---|
| 1 | SQL editor | Run `031_admin_panel_performance_indexes.sql` (existing file, unchanged) | yes — `drop index` |
| 2 | SQL editor | Run `067_countries_local_operations.sql` | yes (see §6) |
| 3 | SQL editor | Run `068_orders_country_id.sql` | yes (see §6) |
| 4 | Deploy | Code changes A1–A8 (one deploy) | git revert |
| 5 | Check | Place one storefront test order + one WhatsApp sale; confirm both rows have `country_id` | — |
| 6 | SQL editor | Run `069_orders_country_id_not_null.sql` | yes (see §6) |
| 7 | Repo | Fill the "applied" dates in `supabase/MIGRATIONS_LOG.md`, re-run `verify_migrations.sql` (gains rows for 067–069) | — |

Why 068 and 069 are split: if `orders.country_id` were NOT NULL before the new
code is live, every storefront order would fail between the migration and the
deploy. 068 installs a temporary trigger that fills the column from the
product; 069 removes that safety net once the code sends it explicitly.

Paste each file whole into the SQL editor (no selection) — it runs as one
transaction, so a failed gate rolls the whole file back (verified in the test:
no column is left behind).

---

## 1. Migrations

### 031 — re-run as is
Three `create index if not exists` on `products(created_at)`,
`products(test_status, created_at)`, `orders(status, created_at)`. ~1.3k
orders, so the brief write lock is negligible.

### 067_countries_local_operations.sql

```sql
-- 067_countries_local_operations.sql
-- Single source of truth for "this market has local operations": we hold the
-- stock and the cash there ourselves. Inventory and treasury exist ONLY for
-- such a country. Today that is Mauritania alone; Saudi Arabia and Kuwait are
-- affiliate-only markets where the COD Partner holds both.
--
-- App code reads this flag through hasLocalOperations()
-- (src/lib/local-operations.ts); SQL (RLS / check constraints in the
-- inventory and treasury migrations) reads it through
-- public.is_local_operations_country(). Nothing else may test
-- iso_code = 'MR' to decide whether a market has local operations.

alter table public.countries
  add column if not exists has_local_operations boolean not null default false;

comment on column public.countries.has_local_operations is
  'True only for the market where we hold stock and cash ourselves (Mauritania). Gates inventory and treasury. Not editable from the Countries screen; changing it requires a migration (see countries_local_operations_mr_only).';

-- The flag can only ever be on Mauritania. Turning local operations on for
-- another market must be a deliberate migration that changes this constraint,
-- never a toggle. iso_code is unique, so this also means "at most one".
alter table public.countries
  drop constraint if exists countries_local_operations_mr_only;
alter table public.countries
  add constraint countries_local_operations_mr_only
  check (not has_local_operations or iso_code = 'MR');

update public.countries
set has_local_operations = true
where iso_code = 'MR' and not has_local_operations;

do $$
declare
  flagged int;
begin
  select count(*) into flagged from public.countries where has_local_operations;
  if flagged <> 1 then
    raise exception 'Aborting: expected exactly one local-operations country (MR), found %', flagged;
  end if;
end $$;

-- The admin country scope reads countries_public (059), so the flag has to be
-- exposed there. create or replace view can only append columns, so it goes
-- last; the view keeps its grants and its 060 comment.
create or replace view public.countries_public as
select
  id,
  iso_code,
  name_ar,
  name_fr,
  currency,
  is_active,
  meta_pixel_id_public,
  created_at,
  has_local_operations
from public.countries
where is_active = true;

-- For RLS policies and check constraints on the inventory/treasury tables.
create or replace function public.is_local_operations_country(p_country_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.has_local_operations from public.countries c where c.id = p_country_id),
    false
  );
$$;

revoke all on function public.is_local_operations_country(uuid) from public, anon;
grant execute on function public.is_local_operations_country(uuid) to authenticated, service_role;
```

Tested: MR=true, SA/KW=false; flagging SA fails; renaming MR's iso_code while
flagged fails; view exposes the flag and keeps the 060 comment; re-run is a no-op.

### 068_orders_country_id.sql

```sql
-- 068_orders_country_id.sql
-- Gives every order its own country, copied from its product, following the
-- 051 pattern (add nullable -> backfill -> fail loudly -> constrain).
-- Treasury and reconciliation need to filter orders by market directly;
-- existing pages keep joining through products and are unaffected.
--
-- Two-step rollout. This migration leaves the column NULLABLE and installs a
-- transitional trigger that fills it from the product, so the storefront keeps
-- taking orders between applying this and deploying the code that sends
-- country_id explicitly. 069 (run AFTER that deploy) sets NOT NULL and makes
-- the trigger reject a missing value instead of filling it.

alter table public.orders
  add column if not exists country_id uuid references public.countries(id);

comment on column public.orders.country_id is
  'Market of this order, fixed at creation: always equal to its product''s country_id at insert time (enforced by trg_orders_enforce_country). Set explicitly by every insert path (storefront POST /api/orders, admin WhatsApp sale).';

update public.orders o
set country_id = p.country_id
from public.products p
where p.id = o.product_id
  and o.country_id is null;

-- Fail loudly — never default to Mauritania. An order without a product, or
-- whose product has no country, must be investigated by hand.
do $$
declare
  no_product int;
  no_country int;
begin
  select count(*) into no_product
  from public.orders o
  left join public.products p on p.id = o.product_id
  where p.id is null;

  select count(*) into no_country
  from public.orders
  where country_id is null;

  if no_product > 0 or no_country > 0 then
    raise exception
      'Aborting: % order(s) have no product row, % order(s) have no country_id after backfill',
      no_product, no_country;
  end if;
end $$;

create index if not exists orders_country_id_ordered_at_idx
  on public.orders (country_id, ordered_at desc);

-- An order's country must match its product's country at insert time, and
-- can't be rewritten afterwards to point elsewhere.
create or replace function public.orders_enforce_country()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  product_country uuid;
begin
  select p.country_id into product_country
  from public.products p
  where p.id = new.product_id;

  if new.country_id is null then
    -- TRANSITIONAL — removed by 069. Covers code deployed before this
    -- migration, which does not send country_id yet.
    new.country_id := product_country;
  elsif new.country_id is distinct from product_country then
    raise exception 'orders.country_id (%) does not match the country (%) of product %',
      new.country_id, product_country, new.product_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_enforce_country on public.orders;
create trigger trg_orders_enforce_country
  before insert or update of country_id, product_id on public.orders
  for each row
  execute function public.orders_enforce_country();

-- A product that already has orders can't move to another country: its
-- orders (and their currency) belong to the original market. Selling the
-- same item elsewhere means a new product row.
create or replace function public.products_block_country_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.country_id is distinct from old.country_id
     and exists (select 1 from public.orders o where o.product_id = old.id) then
    raise exception 'Product % has orders; its country cannot be changed', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_block_country_change on public.products;
create trigger trg_products_block_country_change
  before update of country_id on public.products
  for each row
  execute function public.products_block_country_change();
```

Expected on production (from the preflight): 1314 orders backfilled →
MR 1284, SA 28, KW 2; gate passes (0 without product, 0 without country).

Tested: backfill per country; insert without `country_id` filled from the
product; insert with a wrong country rejected; rewriting an existing order's
country rejected; unrelated order updates unaffected; product with orders
can't change country, product without orders can; with an orphan order the
whole file aborts and rolls back.

> **Decision needed — `trg_products_block_country_change`.** Without it, editing
> an affiliate product's country (e.g. SA→KW) silently moves all its past
> orders to KW on every page that joins through products, while
> `orders.country_id` and `orders.currency` stay SA/SAR. I recommend keeping
> it. The product form will show a clear error instead (A2).

### 069_orders_country_id_not_null.sql (after the deploy)

```sql
-- 069_orders_country_id_not_null.sql
-- Step 2 of 068. Apply ONLY after the code that sets orders.country_id on
-- every insert (storefront + WhatsApp sale) is deployed and has taken at least
-- one order of each kind.

-- Catches any row from the deploy window. The 068 trigger already filled
-- them, so this is expected to update 0 rows.
update public.orders o
set country_id = p.country_id
from public.products p
where p.id = o.product_id
  and o.country_id is null;

do $$
declare
  missing int;
begin
  select count(*) into missing from public.orders where country_id is null;
  if missing > 0 then
    raise exception 'Aborting: % order(s) still have no country_id', missing;
  end if;
end $$;

alter table public.orders
  alter column country_id set not null;

-- Strict from now on: a missing country_id is an application bug and must
-- fail the insert instead of being silently filled.
create or replace function public.orders_enforce_country()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  product_country uuid;
begin
  if new.country_id is null then
    raise exception 'orders.country_id is required (product %)', new.product_id
      using errcode = 'not_null_violation';
  end if;

  select p.country_id into product_country
  from public.products p
  where p.id = new.product_id;

  if new.country_id is distinct from product_country then
    raise exception 'orders.country_id (%) does not match the country (%) of product %',
      new.country_id, product_country, new.product_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
```

### Not a migration: no new tables in Phase A
Phase A creates no tables (permissions live in `profiles.permissions` jsonb,
which needs no schema change). Item 7 therefore applies from Phase B on; the
pattern every inventory/treasury table will follow:

```sql
alter table public.<t> enable row level security;
-- reads: permission + local-operations market only
create policy <t>_select on public.<t> for select to authenticated
  using (public.has_panel_permission('<view perm>')
         and public.is_local_operations_country(country_id));
-- no insert/update/delete policies: writes go through server actions on the
-- service-role client, after the app-level permission + country checks.
revoke all on public.<t> from anon;
-- plus: check (public.is_local_operations_country(country_id)) on the table
```

---

## 2. Code changes

### A1 — `hasLocalOperations` (one definition)

**New `src/lib/local-operations.ts`**
```ts
import type { CountryRow } from "@/types";

/**
 * Whether we run local operations (own stock + own cash) in this market —
 * the only gate for inventory and treasury pages, nav links and actions.
 * Reads countries.has_local_operations (migration 067), which a DB check
 * constraint pins to Mauritania. Never test iso_code instead.
 */
export function hasLocalOperations(
  country: Pick<CountryRow, "has_local_operations"> | null | undefined,
): boolean {
  return country?.has_local_operations === true;
}
```
- `src/types/index.ts`: add `has_local_operations: boolean` to `CountryRow`.
- `src/app/admin/(dashboard)/countries/actions.ts`: unchanged on purpose — its
  `normalizeInput` lists fields explicitly, so the Countries screen can't
  toggle the flag.
- Replace the two existing "which country is Mauritania" lookups with the flag
  (owned products are, by definition, the local-operations market):
  - `src/lib/auth/country-scope.ts:35` default country: `countries.find(hasLocalOperations)`.
  - `src/app/admin/(dashboard)/products/actions.ts:358` `resolveMauritaniaCountryId`
    → `resolveLocalOperationsCountryId`, `.eq("has_local_operations", true)`.
- Left alone (not "local operations" decisions): `OWNED_DEFAULT_COUNTRY = "MR"`
  in `src/lib/countries.ts` (phone-picker default on landing pages) and the
  Countries form placeholder.

### A2 — `orders.country_id` set on every insert
There are **two** insert paths. The AI assistant does **not** create orders
(its tools are list/get/update-status only), so there's nothing to change there.
- `src/app/api/orders/route.ts:148` storefront: add `country_id: product.country_id`
  (already selected at line 83).
- `src/app/admin/(dashboard)/orders/actions.ts:733` WhatsApp sale: add
  `country_id: countryId` to each row (products are already filtered to that
  country at line 690, so they match).
- `src/types/index.ts` `OrderRow`: add `country_id: string`.
- `src/app/admin/(dashboard)/products/actions.ts` update path: if `country_id`
  changes and the product has orders, return
  «لا يمكن تغيير بلد منتج لديه طلبات — أنشئ منتجاً جديداً لهذا البلد.» before
  hitting the DB trigger.

### A3 — `requireCountryScope()` (in `src/lib/auth/country-scope.ts`)
```ts
export type RequiredCountryScope = {
  countryId: string;
  currency: string;
  country: CountryRow;
  hasLocalOperations: boolean;
};

/** For server actions: the selected market, or a 403 if none resolves. Never falls back to MRU. */
export async function requireCountryScope(): Promise<RequiredCountryScope> {
  const { selectedCountry } = await getCountryScope();
  if (!selectedCountry) throw new AuthError(403, "No active country selected.");
  return {
    countryId: selectedCountry.id,
    currency: selectedCountry.currency,
    country: selectedCountry,
    hasLocalOperations: hasLocalOperations(selectedCountry),
  };
}

/** Inventory/treasury actions and pages: selected market must have local operations. */
export async function requireLocalOperationsScope(): Promise<RequiredCountryScope> {
  const scope = await requireCountryScope();
  if (!scope.hasLocalOperations) {
    throw new AuthError(403, "Inventory and treasury exist only for the local-operations market.");
  }
  return scope;
}

/** Rejects a record (or client-supplied id) that belongs to another market. */
export function assertInCountryScope(
  scope: Pick<RequiredCountryScope, "countryId">,
  rowCountryId: string | null | undefined,
): void {
  if (!rowCountryId || rowCountryId !== scope.countryId) {
    throw new AuthError(403, "This record belongs to another country.");
  }
}
```
Adopted now in `createWhatsAppSaleAction` and
`listActiveProductsForManualSaleAction` (replaces `getCountryScope()` +
`?? "MRU"` fallback, which today would price a sale in MRU if no country
resolved). Every Phase B/C action starts with `requireLocalOperationsScope()`.

### A4 — Affiliate profits use `countries.currency`
- `src/app/admin/(dashboard)/analytics/data.ts:277`: select `country_id`
  instead of `affiliate_currency`; read `countries_public (id, currency)` once
  (staff with `view_analytics` can't read the base `countries` table — owner-only
  RLS — so no PostgREST join); `currency: currencyByCountry.get(p.country_id)`.
- `affiliate_currency` stays in the DB and in the product form (still written,
  no longer read for money). Retiring the column is a later cleanup.
- **Related, same root cause — include? (recommended):**
  `src/lib/meta/initiate-checkout-dispatch.ts:181` sends
  `currency: "ريال"` / `"د.ك"` to Meta's InitiateCheckout CAPI event for these two
  products today, an invalid ISO code. Same 3-line fix.

**Which displayed numbers change (affiliate section of /admin/analytics only):**
1. The two mismatched products' group label: «ريال» → **SAR**, «د.ك» → **KWD**.
2. If other SA/KW affiliate products already use `SAR`/`KWD`, those were
   **separate groups** until now; they merge, so each country shows **one**
   group total instead of two. The group revenue/COGS/net totals become the
   sum of the old groups. (Follow-up query row 6 shows exactly which products.)
3. Ad spend / net profit for those two products: today their currency
   («ريال», «د.ك») has no `currency_rates` row, so any linked ad spend shows
   «غير متاح» and is left out of the group net. After the fix, it converts
   **only if** a `SAR` / `KWD` rate exists (production seeds only MRU and USD —
   row 7 confirms). With no rate, they still show «غير متاح»; nothing is invented.
4. Per-product revenue, cost, commission and other-costs **values** don't change:
   they were always in the product's own currency, only the label was wrong.
5. Owned/MRU numbers, the dashboard home, and Meta Purchase events: no change.

### A5 — Same product set on both pages; soft-deleted orders out of money totals
| File | Change |
|---|---|
| `src/app/admin/(dashboard)/page.tsx:43` | Drop `.is("deleted_at", null)` from the products query used for totals. The pipeline counts already skip archived products (line 172), so "active products" doesn't change. |
| `src/app/admin/(dashboard)/page.tsx:77` | Add `.is("deleted_at", null)` to the orders query. |
| `src/app/admin/(dashboard)/analytics/data.ts:114` | Add `.is("deleted_at", null)` (owned). |
| `src/app/admin/(dashboard)/analytics/data.ts:317` | Add `.is("deleted_at", null)` (affiliate). |

`/admin/analytics/[productId]` uses the same loader, so it's covered.

Also recommended in A5 (same bug, listing pages, not money):
`orders/page.tsx:36` (main orders list), `useOrdersRealtime.ts:120` (list
reconcile), and the assistant's `listOrders` (`executor.ts:453`, service role,
returns deleted orders today). Say if you want these in Phase A.

**Why not fix it in RLS instead:** `orders_select_admin` is rewritten by 042
without the `deleted_at` filter that 037 had. Putting it back looks right, but
`useOrdersRealtime.ts:189` removes a deleted order from other open tabs by
*receiving* the UPDATE that sets `deleted_at` — with the filter, Realtime would
stop delivering that event and other tabs would keep showing the order until
refresh. Explicit filters in the readers avoid that.

**Numbers that change:**
- Dashboard home: revenue/net profit **rise** by the archived products'
  shipped orders minus their COGS, delivery and ad spend (follow-up row 9
  lists the products). Home and /admin/analytics then show the same MRU totals.
- Both pages: if the 1 soft-deleted order is `shipped` and RLS currently
  lets it through (rows 1–3), its revenue/COGS/delivery leave the totals.

### A6 — Permissions (`src/lib/auth/permissions.ts`)
```ts
manage_inventory: "manage_inventory",
view_treasury: "view_treasury",
manage_treasury: "manage_treasury",

// ROUTE_PERMISSIONS
"/admin/inventory": PERMISSIONS.manage_inventory,
"/admin/treasury": [PERMISSIONS.view_treasury, PERMISSIONS.manage_treasury],
```
`PERMISSION_CATALOG` gains three entries (shown as unchecked boxes on the
staff screen):
- `manage_inventory` — «إدارة المخزون» / «المخزون» — «عرض المخزون وتسجيل المشتريات والتعديلات (موريتانيا فقط).»
- `view_treasury` — «عرض الخزينة» / «الخزينة» — «عرض الحسابات والأرصدة والحركات المالية (موريتانيا فقط).»
- `manage_treasury` — «إدارة الخزينة» / «تسجيل مالي» — «تسجيل المصاريف والتحويلات والتحصيلات (موريتانيا فقط).»

Owners pass every check already (`isOwner`). Existing staff keep their stored
arrays, so they get none of the three until you tick them. No DB change.
Nav links and pages arrive in B/C, gated by permission **and**
`hasLocalOperations(selectedCountry)`; switching to SA/KW hides them.

### A7 — RLS
No new tables in Phase A (see §1). New SQL objects: `is_local_operations_country`
is `security definer`, revoked from `public`/`anon`; trigger functions aren't
callable directly. App-level checks stay the real gate.

### A8 — Migrations log + verification
- **New `supabase/MIGRATIONS_LOG.md`**: one row per file, in apply order, with
  file, commit that added it (date + hash, from git), production status and
  date applied. Historical rows read "present — verified 2026-10-06 with
  verify_migrations.sql (apply date unknown)"; 050/062/063/064 cite the commit
  messages that say they were applied; 005/017 "unverifiable (superseded)";
  015_lock "partial — trigger deliberately not recreated (see below)";
  004/013_meta "applied; file restored from git 2026-10-06". New migrations get
  "pending" in the PR and their date when run.
- `supabase/checks/verify_migrations.sql`: add rows for 067, 068, 069.
- Already done (you asked): `004_product_whatsapp_e164.sql` and
  `013_meta_initiate_checkout.sql` restored from git, byte-identical
  (blob hashes c1b712b / c56c095 match). They now share numbers with
  `013_landing_wireframe_fields.sql`; both 013s are independent, so order doesn't matter.

### Tests (`tests/`)
- `hasLocalOperations` (true/false/null).
- `requireCountryScope` / `requireLocalOperationsScope` / `assertInCountryScope`
  (mocked `getCountryScope`).
- Affiliate rows grouped by `countries.currency`: two products with «ريال» and
  `SAR` in SA end up in one SAR group.
- Profit totals ignore an order with `deleted_at` — the loaders filter it, so
  the test covers the query builder call.
- `npm run check:server-actions`, `npm run lint`, `npm run build` before deploy.

---

## 3. Manual sales on affiliate products (not in Phase A)

**(a) Block them** (small, ~20 lines). `listActiveProductsForManualSaleAction`
adds `.eq("fulfillment_type", "owned")`; `createWhatsAppSaleAction` rejects an
affiliate product server-side; the "WhatsApp sale" button is hidden when the
picker is empty (SA/KW). Result: WhatsApp sales are an MR-only feature.

**(b) Full flow** (medium, ~150 lines + tests). When any line is affiliate the
form shows address / city / country (prefilled with the market's name),
validated like the storefront; the rows store `affiliate_address/city/country`;
after insert, one Sheet row per affiliate line via `after()` with the real
quantity, logging `affiliate_sheet_write_succeeded/failed` so the existing
retry panel covers failures. Affiliate lines would be forced to `pending` so
Meta's Purchase isn't sent before the COD Partner confirms.

Recommendation: **(a)**, unless you actually take SA/KW orders over WhatsApp.
The existing ones are listed by follow-up query row 5 (id, date, product,
country, status, qty, total).

---

## 4. Answers to the verification follow-ups

**015_lock_brand_identity — trigger missing.** 015 forced every product's
`brand_color` **and** `logo_url` to fixed values on every insert/update. 016
deliberately unlocked logos (color still forced); 020 deliberately reduced it
to "if `brand_color` is empty, use #006B0C". No migration ever dropped the
trigger. The function exists because 016/020 use `create or replace`, which
creates it even if 015 never ran — so most likely **015 never ran on
production** (or the trigger was dropped by hand). Risk of leaving it missing:
**none in practice**. The column is NOT NULL with default #006B0C (014),
every write path normalizes to `BRAND_COLOR` (`products/actions.ts:427, 588,
715`, `executor.ts:148`), and every reader falls back (`product-locale.ts:112`).
Follow-up row 11 counts empty colors (expect 0). **Never re-run the 015 file**:
its UPDATE would overwrite every product's color *and logo* with a dead
postimg URL.

**015_testimonial_extended_fields — "no".** It's a data-only migration (a JSON
rewrite); it creates no table, column or function, so no schema check can
prove it either way. The "no" is explained: the product form leaves out
`location` whenever it's empty (`ProductForm.tsx:340`), so any testimonial
saved after 015 fails the check. `location` is optional in the `Testimonial`
type, so nothing is missing. Row 12 checks what the landing actually needs
(`name`, `quote`).

**Why the preflight returned 8 rows.** It is a single `UNION ALL` statement:
Postgres returns all 16 rows or an error, never a prefix. Only part of the
text was executed — the SQL editor runs just the highlighted part when
something is selected. `phase_a_followup.sql` covers the missing rows plus the
lists you asked for; run it with nothing selected.

---

## 5. Spotted, out of scope (not fixed)
- `/admin/orders` loads the whole country with no pagination (`orders/page.tsx:36`).
  MR has 1284 orders; Supabase's default API limit is 1000 rows, so the list
  is likely missing the oldest ~284 (and the "awaiting costs" / "sheet failed"
  panels derived from it).
- The assistant's `get_order` selects `form_data`, dropped in 008 — that tool
  always errors (`executor.ts:484`).

## 6. Rollback
- 069: `alter table orders alter column country_id drop not null;` + re-run 068's function.
- 068: `drop trigger trg_orders_enforce_country on orders; drop trigger trg_products_block_country_change on products; drop function orders_enforce_country(), products_block_country_change(); alter table orders drop column country_id;` (only before any code relies on it).
- 067: recreate `countries_public` from 059, `drop function is_local_operations_country(uuid); alter table countries drop constraint countries_local_operations_mr_only, drop column has_local_operations;`
- Code: one revert commit.
