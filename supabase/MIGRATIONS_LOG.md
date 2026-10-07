# Migrations log

Every file in `supabase/migrations/`, in the order it applies (file-name
order), with when it reached the repo and its state on **production**
(`ultlrcfsamyekgeerqcv`).

> ## ⚠️ Migrations are applied BY HAND — never with `supabase db push`
>
> Migrations in this repo are pasted into the Supabase SQL editor one file at
> a time, after a backup, in the order below. Do **not** run
> `supabase db push`, `supabase db reset` against production, or
> `supabase migration repair`.
>
> Why: production has a Supabase CLI history table
> (`supabase_migrations.schema_migrations`) with **37 rows**, written when some
> migrations were applied through tooling. Every other migration was applied by
> hand and is not recorded there. `db push` applies every local file whose
> version is not in that table, so it would try to re-run old migrations —
> including `015_lock_brand_identity.sql`, whose UPDATE would overwrite every
> product's brand color and logo — and data-only files like 024/027. Several
> version numbers are also used by two files (002, 013, 015, 027, 063, 064),
> which the CLI cannot represent. `supabase/checks/cli_migration_history.sql`
> (read-only) lists exactly what that table contains.
>
> As a guard, `000_manual_migrations_only.sql` only raises an error. It sorts
> first, so any CLI run fails there before touching anything. Never paste it
> into the SQL editor, never mark it applied, never delete it.
>
> To check what is applied, run `supabase/checks/verify_migrations.sql`
> (read-only) — it inspects the schema itself, not any history table.

## How to add a migration

1. Use the next free number (`070`, `071`, …). Never reuse a number.
2. Add a row below with status `pending`.
3. Back up the database, paste the whole file into the SQL editor (nothing
   selected), run it, and check the expected result stated in the PR.
4. Add rows for it to `supabase/checks/verify_migrations.sql`, re-run that
   script, then set the status to `applied YYYY-MM-DD` and fill the date.

## Log

"Present — verified 2026-10-06" means `verify_migrations.sql` found every
object the file creates on production that day; the original apply date is
not known.

| File | Added to repo | Production status | Applied on |
|---|---|---|---|
| `000_manual_migrations_only.sql` | 2026-10-06, branch `phase-a` | **never apply** — tripwire that makes any `supabase db push` fail before other files run | |
| `001_initial.sql` | 2026-04-03 `90f0b8a` | present — verified 2026-10-06 | |
| `002_currency_mru.sql` | 2026-04-04 `ec1fefa` | present — verified 2026-10-06 | |
| `002_payment_logo_url.sql` | 2026-04-04 `2de27b4` | present — verified 2026-10-06 | |
| `003_orders_completion_token_nullable_contact.sql` | 2026-04-04 `9aa7a7d` | present — verified 2026-10-06 | |
| `004_product_whatsapp_e164.sql` | 2026-04-04 `71aecdc` | present — verified 2026-10-06 · file was deleted from the repo, restored unchanged 2026-10-06 | |
| `005_form_fields_required_backfill.sql` | 2026-04-04 `551073b` | unverifiable — data-only, superseded by 008 | |
| `006_product_bilingual.sql` | 2026-04-04 `4cc9443` | present — verified 2026-10-06 | |
| `007_products_default_language.sql` | 2026-04-09 `c66ada8` | present — verified 2026-10-06 | |
| `008_remove_post_payment_fields.sql` | 2026-04-09 `74f40a0` | present — verified 2026-10-06 | |
| `009_order_communication_logs.sql` | 2026-04-09 `95640d1` | present — verified 2026-10-06 | |
| `010_meta_tracking.sql` | 2026-04-13 `d29d3d6` | present — verified 2026-10-06 | |
| `011_drop_orders_address.sql` | 2026-04-15 `b48c7d5` | present — verified 2026-10-06 | |
| `012_meta_fbp_fbc.sql` | 2026-04-28 `0243b4f` | present — verified 2026-10-06 | |
| `013_landing_wireframe_fields.sql` | 2026-05-08 `19d379b` | present — verified 2026-10-06 | |
| `013_meta_initiate_checkout.sql` | 2026-04-28 `17d01f7` | present — verified 2026-10-06 · file was deleted from the repo, restored unchanged 2026-10-06 | |
| `014_landing_theme_and_sections.sql` | 2026-05-08 `458e2ce` | present — verified 2026-10-06 | |
| `015_lock_brand_identity.sql` | 2026-05-08 `ebb60cd` | PARTIAL — trigger absent, deliberately not recreated. **Never re-run this file** (its UPDATE overwrites every product's brand color and logo) | |
| `015_testimonial_extended_fields.sql` | 2026-05-08 `62969eb` | data-only, no schema to verify — its data check fails only because the form omits empty `location` (expected) | |
| `016_header_dynamic_logo_and_offer_fields.sql` | 2026-05-09 `550e858` | present — verified 2026-10-06 | |
| `017_offer_section_fields.sql` | 2026-05-09 `cdc1e0e` | unverifiable — all columns dropped by 021 | |
| `018_cta_banner_background.sql` | 2026-05-09 `7041e39` | present — verified 2026-10-06 | |
| `019_sticky_footer.sql` | 2026-05-09 `d0eb777` | present — verified 2026-10-06 | |
| `020_landing_admin_alignment.sql` | 2026-05-09 `10b7248` | present — verified 2026-10-06 | |
| `021_drop_hero_offer_line_fields.sql` | 2026-05-10 `56f9344` | present — verified 2026-10-06 | |
| `022_header_bar_unified.sql` | 2026-05-10 `e949387` | present — verified 2026-10-06 | |
| `023_header_bar_layout.sql` | 2026-05-10 `bd78834` | present — verified 2026-10-06 | |
| `024_official_site_logo_url.sql` | 2026-05-13 `97716e2` | present — verified 2026-10-06 | |
| `025_product_testing_pipeline.sql` | 2026-05-20 `dc58670` | present — verified 2026-10-06 | |
| `026_ai_agent_whatsapp.sql` | 2026-05-20 `5b6bff7` | present — verified 2026-10-06 | |
| `027_security_integrity.sql` | 2026-05-29 `a2b47cd` | present — verified 2026-10-06 | |
| `027_zeina_logo_adoption.sql` | 2026-05-24 `af91bca` | present — verified 2026-10-06 | |
| `028_meta_client_session.sql` | 2026-06-07 `fae398c` | present — verified 2026-10-06 | |
| `029_whatsapp_message_template.sql` | 2026-06-08 `d29ed3a` | present — verified 2026-10-06 | |
| `030_remove_whatsapp_ai_agent.sql` | 2026-06-21 `5230e5d` | present — verified 2026-10-06 | |
| `031_admin_panel_performance_indexes.sql` | 2026-06-21 `5b8e003` | applied — was missing on 2026-10-06, run in Phase A step 1 | 2026-10-07 |
| `032_profit_analytics_ad_spend.sql` | 2026-06-21 `5f2aec5` | present — verified 2026-10-06 | |
| `033_product_profit_calculation_start_date.sql` | 2026-06-21 `38bdb77` | present — verified 2026-10-06 | |
| `034_product_soft_delete.sql` | 2026-06-21 `38b2b8c` | present — verified 2026-10-06 | |
| `035_orders_realtime.sql` | 2026-06-26 `565202d` | present — verified 2026-10-06 | |
| `036_rbac_staff_permissions.sql` | 2026-06-26 `8762f06` | present — verified 2026-10-06 | |
| `037_order_security.sql` | 2026-06-29 `428778f` | present — verified 2026-10-06 | |
| `038_order_status_history.sql` | 2026-06-29 `18f91fa` | present — verified 2026-10-06 | |
| `039_drop_otp_codes.sql` | 2026-06-29 `18f91fa` | present — verified 2026-10-06 | |
| `040_orders_soft_delete_rls.sql` | 2026-07-01 `16aa7c1` | present — verified 2026-10-06 | |
| `041_funnel_meta_dispatches.sql` | 2026-07-10 `f3a6b66` | present — verified 2026-10-06 | |
| `042_meta_event_log.sql` | 2026-07-11 `2a34f9b` | present — verified 2026-10-06 | |
| `043_orders_updated_at.sql` | 2026-07-11 `962b566` | present — verified 2026-10-06 | |
| `044_profit_analytics_live_ad_spend.sql` | 2026-07-14 `93ebdcd` | present — verified 2026-10-06 | |
| `045_orders_note.sql` | 2026-07-14 `7a15d48` | present — verified 2026-10-06 | |
| `046_manual_sales_quantity.sql` | 2026-07-17 `e611619` | present — verified 2026-10-06 | |
| `047_manual_sale_channel.sql` | 2026-07-17 `89a35ca` | present — verified 2026-10-06 | |
| `048_marketing_messages.sql` | 2026-07-22 `6b726f9` | present — verified 2026-10-06 | |
| `049_marketing_shipped_exclusion.sql` | 2026-07-24 `573df8b` | present — verified 2026-10-06 | |
| `050_affiliate_products.sql` | 2026-07-25 `03f6c68` | present — verified 2026-10-06 · commit says applied to ultlrcfsamyekgeerqcv | |
| `051_countries.sql` | 2026-07-28 `e52e679` | present — verified 2026-10-06 | |
| `052_marketing_country_scope.sql` | 2026-08-01 `7f10033` | present — verified 2026-10-06 | |
| `053_country_performance_indexes.sql` | 2026-08-01 `7f10033` | present — verified 2026-10-06 | |
| `054_product_specs.sql` | 2026-08-01 `f2135d9` | present — verified 2026-10-06 | |
| `055_product_display_currency.sql` | 2026-08-07 `e85ca52` | present — verified 2026-10-06 | |
| `056_public_assets_bucket.sql` | 2026-08-08 `d6b0d2b` | present — verified 2026-10-06 | |
| `057_products_public_view.sql` | 2026-08-09 `77931cc` | present — verified 2026-10-06 | |
| `058_revoke_definer_execute.sql` | 2026-08-09 `77931cc` | present — verified 2026-10-06 | |
| `059_countries_public_view.sql` | 2026-08-09 `77931cc` | present — verified 2026-10-06 | |
| `060_document_public_views_security_definer.sql` | 2026-08-09 `77931cc` | present — verified 2026-10-06 | |
| `061_hotfix_products_admin_select.sql` | 2026-08-09 `03e64c8` | present — verified 2026-10-06 | |
| `062_ctwa_attribution.sql` | 2026-09-01 `c70d589` | present — verified 2026-10-06 · commit says applied before deploy | |
| `063_ctwa_ad_source.sql` | 2026-09-13 `3f9c5b4` | present — verified 2026-10-06 · commit says applied | |
| `063_order_economics_snapshot.sql` | 2026-09-10 `c822726` | present — verified 2026-10-06 | |
| `064_orders_business_date.sql` | 2026-09-10 `c822726` | present — verified 2026-10-06 | |
| `064_whatsapp_sale.sql` | 2026-09-14 `95dd471` | present — verified 2026-10-06 · commit says applied | |
| `065_ad_spend_currency.sql` | 2026-09-15 `c45b28f` | present — verified 2026-10-06 | |
| `066_whatsapp_dataset_leg.sql` | 2026-09-23 `bd93821` | present — verified 2026-10-06 | |
| `067_countries_local_operations.sql` | 2026-10-06, branch `phase-a` | applied — confirmed 2026-10-07 by the post-068 check | 2026-10-07 |
| `068_orders_country_id.sql` | 2026-10-06, branch `phase-a` | applied — confirmed 2026-10-07 by the post-068 check (creates `orders_country_id_autofill_log`) | 2026-10-07 |
| `069_orders_country_id_not_null.sql` | 2026-10-06, branch `phase-a` | applied — check: NOT NULL, 0 orders without country, log kept, 0 autofills since deploy. Trigger fills a missing `country_id` from the product permanently and logs it | 2026-10-07 |
| `070_currency_rates_sar_kwd.sql` | 2026-10-07, branch `followups` | applied — SAR = 11.47, KWD = 140 MRU (insert-only) | 2026-10-07 03:18 UTC |
