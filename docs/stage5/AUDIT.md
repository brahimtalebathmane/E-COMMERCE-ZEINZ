# Stage 5 — Step 1 audit (2026-10-12)

Production `https://zeinee.com/admin`, signed in by the owner in the built-in browser
(Chromium; iPhone sizes emulated: 390×844 and 430×932). Read-only: pages were only
opened, measured and screenshotted; the WhatsApp sale form was opened and closed
without saving. Screenshots stay out of the repo (they show customer names and phones).

Limits: the built-in browser is Chromium, not WebKit, so this is iPhone *size*, not
Safari rendering. Times are from this network (cold Netlify functions included), so
compare them only with the after-measurement taken the same way.

## Numbers (390×844)

| Page | TTFB ms | Load ms | LCP ms | DOM nodes | Page height px | Main problems |
|---|---|---|---|---|---|---|
| /admin/login | 2129 | 5653 | — | small | 844 | 6 web-font files, inputs 14px |
| /admin (home) | 1636 | 3133 | 3364 | 544 | 1810 | nav links 40px tall |
| **/admin/orders** | 2217 | 4318 | 4208 | **59,039** | **202,346** | every order rendered twice (cards + table), filters fill the first screen, 5 inputs < 16px, chips 36px |
| /admin/analytics | 1039 | 2961 | 2992 | 1,635 | 9,884 | 2.0 MB JS (charts), 18 inputs < 16px, period chips 28px |
| /admin/inventory | 870 | 1230 | — | 702 | 2,495 | stock table scrolls sideways on phone |
| /admin/inventory/restock | 754 | 1284 | — | 480 | 1,307 | all inputs 14px; back link 18px tall |
| /admin/treasury | 1160 | 1632 | 1820 | 635 | 2,570 | 7 inputs < 16px, tab pills 40px, one sideways-scroll area |
| /admin/treasury/settle | 901 | 1252 | — | 424 | 844 | OK; inputs 14px |
| /admin/treasury/transactions | 1081 | 1615 | — | 1,367 | — | filter form fills the first screen; table clipped/scrolls sideways (251 clipped elements) |
| /admin/treasury/reconciliation | 1056 | 1600 | — | 511 | 2,016 | OK (bridge checks out: unexplained 0) |
| /admin/treasury/setup | 759 | 987 | — | 662 | — | 10 inputs < 16px |
| /admin/products | 916 | 1069 | — | 883 | 3,214 | product cards clipped on the left (Delete button cut), status chips 34px |
| /admin/products/new | 928 | 1141 | — | 436 | — | 7 inputs < 16px |
| /admin/orders/deleted | 757 | 1126 | — | 1,234 | — | table scrolls sideways (155 clipped elements) |
| /admin/marketing | 2121 | 2448 | — | 701 | — | table sideways, 2 inputs < 16px |
| /admin/meta | 779 | 1530 | — | 2,205 | — | 2 tables sideways |
| /admin/staff | 876 | 1430 | — | 569 | — | OK |
| /admin/countries | 994 | 1083 | — | 462 | — | table sideways |

JS per route (`next build`, first load): orders 266 kB, analytics 257 kB, meta/login/product
edit ~195 kB, most others 125–145 kB, shared 103 kB. Unpacked JS in the browser: orders
1.85 MB, analytics 2.0 MB, others ~0.75–0.87 MB.

CLS was 0 on every page measured. No page scrolls sideways as a whole (overflow is
clipped or inside tables).

## Cross-cutting problems

1. **Orders list renders everything.** About 1,050 mobile cards and 2,100 table rows sit
   in the DOM at once (64k nodes on desktop, 202,000 px tall on phone). This is the main
   cause of slowness and scroll jank. Fix: render only the visible window (virtualization)
   or real pages, and render only one layout (cards or table) per screen size. Must keep
   "select all matching" and the count/total computed on the full filtered set.
2. **Inputs at 14px everywhere** → iPhone Safari zooms on focus. Fix globally at ≥ 16px.
3. **Tap targets under 44 px**: tab pills (40), chips (28–36), segmented control in the
   WhatsApp form (32), small back links (18).
4. **Tables on phones** (inventory, treasury transactions, deleted orders, marketing,
   meta, countries) scroll sideways or clip → card lists on mobile.
5. **Filter forms take the whole first screen** on orders and treasury transactions →
   collapse into a "تصفية" button that opens a bottom sheet, with active filters as chips.
6. **Fonts**: 6 web-font files (Tajawal + Geist + Geist Mono) on every admin page →
   `system-ui` first (SF Arabic / SF Pro on iPhone), drop web fonts from the admin.
7. **Persistent toast "الإشعارات محظورة…"** (OneSignal) sits over the content above the tab
   bar on every page → show once, as a dismissible banner in Settings/More.
8. **Slow first byte** (0.75–2.2 s). Partly cold functions; the orders page also reads all
   orders with the RLS policies below.
9. **Products page**: cards wider than the screen (buttons cut).

## What already works
- Bottom tab bar on mobile (الرئيسية، المنتجات، الطلبات، الأرباح، المزيد), sticky header,
  `viewport-fit=cover`, manifest, apple-touch-icon, service worker (scope `/admin/`).
- WhatsApp sale form already opens as a full-height sheet; quantity uses a numeric keypad.
- No layout shift (CLS 0).

## Database (Supabase advisors, read-only)
- `orders`: policy `orders_admin_all` re-evaluates `auth.*()` per row, and two permissive
  SELECT policies (`orders_admin_all`, `orders_select_admin`) both run on every read.
  The orders list reads ~1,330 rows → worth a migration (wrap in `(select auth.uid())`,
  merge policies). **Needs owner approval; not part of the UI-only rule.**
- Same per-row pattern on `products`, `profiles`, `admins`, `payment_methods` (small tables).
- Duplicate index on `products` (`products_old_slugs_gin` = `products_old_slugs_idx`).
- 25 foreign keys without an index (mostly small treasury/inventory tables) — low priority.

## Proposed order of work (each push with approval)
1. Design tokens + system font + 16px inputs + 44px targets (global, low risk).
2. Navigation shell: tab bar per the spec (الطلبات، بيع واتساب، المخزون، الخزينة، المزيد),
   large titles, blurred sticky header, desktop sidebar; move the notifications toast.
3. Orders list: virtualized single layout, filters in a bottom sheet.
4. WhatsApp sale form (one-handed, sticky submit, right keyboards).
5. Order status change sheet; settlement; quick expense; restock/count; dashboard.
6. Remaining tables → mobile cards; PWA checks; re-measure.
