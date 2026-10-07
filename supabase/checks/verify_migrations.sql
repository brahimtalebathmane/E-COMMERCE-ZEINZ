-- verify_migrations.sql
-- READ-ONLY. Safe to run in the Supabase SQL editor: it only reads catalog
-- tables (information_schema, pg_*, storage.buckets) and, for a few data-only
-- migrations, runs SELECT count(*) queries. It creates, alters and writes nothing.
--
-- Output: one row per migration file (001–066, both files for each duplicated
-- number) with applied = yes / PARTIAL / no / n/a and the list of objects that
-- are missing. "n/a" means the migration's effect was later undone by another
-- migration (see the note column), so its presence can't be proven.
--
-- Each check verifies the END STATE the migration leaves behind *after* every
-- later migration — e.g. 036's orders_select_admin policy is not checked
-- because 037 and then 042 replaced it.

with c(num, file, kind, obj, detail, extra) as (values
  -- 001
  ('001','001_initial.sql','extension','pgcrypto',null,null),
  ('001','001_initial.sql','table','profiles',null,null),
  ('001','001_initial.sql','table','products',null,null),
  ('001','001_initial.sql','table','orders',null,null),
  ('001','001_initial.sql','table','payment_methods',null,null),
  ('001','001_initial.sql','index','products_slug_idx',null,null),
  ('001','001_initial.sql','index','products_old_slugs_idx',null,null),
  ('001','001_initial.sql','index','orders_product_id_idx',null,null),
  ('001','001_initial.sql','index','orders_created_at_idx',null,null),
  ('001','001_initial.sql','function','handle_new_user',null,null),
  ('001','001_initial.sql','trigger','on_auth_user_created',null,null),
  ('001','001_initial.sql','bucket','user-assets',null,null),
  -- 002 (x2)
  ('002','002_currency_mru.sql','notnull','orders','currency',null),
  ('002','002_currency_mru.sql','notnull','products','currency',null),
  ('002','002_payment_logo_url.sql','column','payment_methods','payment_logo_url',null),
  -- 003
  ('003','003_orders_completion_token_nullable_contact.sql','notnull','orders','completion_token',null),
  ('003','003_orders_completion_token_nullable_contact.sql','index','orders_completion_token_key',null,null),
  ('003','003_orders_completion_token_nullable_contact.sql','nullable','orders','customer_name',null),
  ('003','003_orders_completion_token_nullable_contact.sql','nullable','orders','phone',null),
  -- 004 — deleted from the repo in 9f1bc74, restored unchanged 2026-10-06.
  -- 057's products_public view selects products.whatsapp_e164.
  ('004','004_product_whatsapp_e164.sql','column','products','whatsapp_e164',null),
  -- 005 (data-only on products.form_fields, which 008 dropped)
  ('005','005_form_fields_required_backfill.sql','na',null,null,null),
  -- 006
  ('006','006_product_bilingual.sql','notnull','products','name_ar',null),
  ('006','006_product_bilingual.sql','column','products','name_fr',null),
  ('006','006_product_bilingual.sql','notnull','products','description_ar',null),
  ('006','006_product_bilingual.sql','notnull','products','features_ar',null),
  ('006','006_product_bilingual.sql','notnull','products','testimonials_ar',null),
  ('006','006_product_bilingual.sql','notnull','products','faqs_ar',null),
  ('006','006_product_bilingual.sql','no_column','products','name',null),
  ('006','006_product_bilingual.sql','no_column','products','description',null),
  ('006','006_product_bilingual.sql','no_column','products','features',null),
  ('006','006_product_bilingual.sql','no_column','products','testimonials',null),
  ('006','006_product_bilingual.sql','no_column','products','faqs',null),
  -- 007
  ('007','007_products_default_language.sql','column','products','default_language',null),
  ('007','007_products_default_language.sql','constraint','products','products_default_language_check',null),
  -- 008
  ('008','008_remove_post_payment_fields.sql','no_column','products','form_title_ar',null),
  ('008','008_remove_post_payment_fields.sql','no_column','products','form_fields_ar',null),
  ('008','008_remove_post_payment_fields.sql','no_column','orders','form_data',null),
  -- 009
  ('009','009_order_communication_logs.sql','table','order_communication_logs',null,null),
  ('009','009_order_communication_logs.sql','index','order_communication_logs_order_id_idx',null,null),
  ('009','009_order_communication_logs.sql','index','order_communication_logs_created_at_idx',null,null),
  -- 010
  ('010','010_meta_tracking.sql','column','orders','meta_event_id',null),
  ('010','010_meta_tracking.sql','column','orders','meta_event_source_url',null),
  ('010','010_meta_tracking.sql','column','orders','meta_pixel_id',null),
  ('010','010_meta_tracking.sql','column','orders','meta_lead_sent',null),
  ('010','010_meta_tracking.sql','column','orders','meta_purchase_sent',null),
  ('010','010_meta_tracking.sql','column','orders','meta_cancel_sent',null),
  -- 011
  ('011','011_drop_orders_address.sql','no_column','orders','address',null),
  -- 012
  ('012','012_meta_fbp_fbc.sql','column','orders','meta_fbp',null),
  ('012','012_meta_fbp_fbc.sql','column','orders','meta_fbc',null),
  -- 013
  ('013','013_landing_wireframe_fields.sql','column','products','hero_subtitle_ar',null),
  ('013','013_landing_wireframe_fields.sql','column','products','stats_ar',null),
  ('013','013_landing_wireframe_fields.sql','column','products','contact_lines_fr',null),
  -- 013 (second file) — deleted in 57e88dc, restored unchanged 2026-10-06.
  ('013','013_meta_initiate_checkout.sql','column','orders','meta_initiate_checkout_sent',null),
  -- 014 (hero_badge_* later dropped by 021, so not checked)
  ('014','014_landing_theme_and_sections.sql','column','products','brand_color',null),
  ('014','014_landing_theme_and_sections.sql','column','products','logo_url',null),
  ('014','014_landing_theme_and_sections.sql','column','products','cta_text_ar',null),
  ('014','014_landing_theme_and_sections.sql','column','products','features_title_ar',null),
  ('014','014_landing_theme_and_sections.sql','column','products','faq_title_fr',null),
  ('014','014_landing_theme_and_sections.sql','column','products','secondary_media_url',null),
  ('014','014_landing_theme_and_sections.sql','column','products','tertiary_media_type',null),
  -- 015 (x2)
  ('015','015_lock_brand_identity.sql','function','enforce_product_brand_identity',null,null),
  ('015','015_lock_brand_identity.sql','trigger','trg_products_enforce_brand_identity',null,null),
  ('015','015_testimonial_extended_fields.sql','data_zero','products','testimonials_ar',
     'select count(*) as n from public.products p, jsonb_array_elements(coalesce(p.testimonials_ar, ''[]''::jsonb)) e where jsonb_typeof(e) = ''object'' and not (e ? ''location'')'),
  -- 016 (function body later replaced by 020)
  ('016','016_header_dynamic_logo_and_offer_fields.sql','column','products','header_offer_text_ar',null),
  ('016','016_header_dynamic_logo_and_offer_fields.sql','column','products','header_discount_text_fr',null),
  ('016','016_header_dynamic_logo_and_offer_fields.sql','column','products','header_cta_text_fr',null),
  -- 017 (all its columns were dropped by 021)
  ('017','017_offer_section_fields.sql','na',null,null,null),
  -- 018
  ('018','018_cta_banner_background.sql','column','products','cta_banner_background_color',null),
  ('018','018_cta_banner_background.sql','column','products','cta_banner_background_image_url',null),
  ('018','018_cta_banner_background.sql','column','products','cta_banner_image_overlay',null),
  -- 019
  ('019','019_sticky_footer.sql','column','products','sticky_footer_offer_ends_at',null),
  ('019','019_sticky_footer.sql','column','products','sticky_footer_cta_text_color',null),
  ('019','019_sticky_footer.sql','column','products','sticky_footer_show_timer',null),
  -- 020
  ('020','020_landing_admin_alignment.sql','fn_body','enforce_product_brand_identity',null,'%length(trim(%'),
  ('020','020_landing_admin_alignment.sql','column','products','stats_section_title_ar',null),
  ('020','020_landing_admin_alignment.sql','column','products','testimonials_badge_fr',null),
  ('020','020_landing_admin_alignment.sql','column','products','footer_note_ar',null),
  -- 021
  ('021','021_drop_hero_offer_line_fields.sql','no_column','products','hero_badge_ar',null),
  ('021','021_drop_hero_offer_line_fields.sql','no_column','products','offer_badge_ar',null),
  ('021','021_drop_hero_offer_line_fields.sql','no_column','products','offer_discount_text_ar',null),
  ('021','021_drop_hero_offer_line_fields.sql','no_column','products','offer_limited_text_fr',null),
  -- 022
  ('022','022_header_bar_unified.sql','column','products','header_bar_text_ar',null),
  ('022','022_header_bar_unified.sql','column','products','header_bar_text_fr',null),
  -- 023
  ('023','023_header_bar_layout.sql','column','products','header_bar_max_lines',null),
  ('023','023_header_bar_layout.sql','column','products','header_bar_font_size_px',null),
  -- 024 (data-only)
  ('024','024_official_site_logo_url.sql','data_zero','products','logo_url',
     'select count(*) as n from public.products where logo_url = ''https://i.postimg.cc/pVjBKNCf/tsmym-bdwn-%CA%BFnwan-2026-05-08T170453-280.png'''),
  -- 025
  ('025','025_product_testing_pipeline.sql','type','product_testing_status',null,null),
  ('025','025_product_testing_pipeline.sql','column','products','test_status',null),
  ('025','025_product_testing_pipeline.sql','column','products','sourcing_type',null),
  ('025','025_product_testing_pipeline.sql','column','products','sourcing_link',null),
  ('025','025_product_testing_pipeline.sql','column','products','cost_price',null),
  ('025','025_product_testing_pipeline.sql','constraint','products','products_sourcing_type_check',null),
  ('025','025_product_testing_pipeline.sql','index','products_test_status_idx',null,null),
  -- 026 (its tables were dropped by 030; only the status value survives)
  ('026','026_ai_agent_whatsapp.sql','constraint','orders','orders_status_check','%requires_human_intervention%'),
  -- 027 (x2)
  ('027','027_security_integrity.sql','table','order_meta_dispatches',null,null),
  ('027','027_security_integrity.sql','table','order_whatsapp_dispatches',null,null),
  ('027','027_security_integrity.sql','column','orders','whatsapp_post_order_sent_at',null),
  ('027','027_security_integrity.sql','index','order_communication_logs_one_whatsapp_sent_per_order',null,null),
  ('027','027_zeina_logo_adoption.sql','data_zero','products','logo_url',
     'select count(*) as n from public.products where logo_url like ''https://i.postimg.cc/%'''),
  -- 028
  ('028','028_meta_client_session.sql','column','orders','meta_client_ip_address',null),
  ('028','028_meta_client_session.sql','column','orders','meta_client_user_agent',null),
  -- 029
  ('029','029_whatsapp_message_template.sql','column','products','whatsapp_message_template',null),
  -- 030
  ('030','030_remove_whatsapp_ai_agent.sql','no_table','ai_agent_rules',null,null),
  ('030','030_remove_whatsapp_ai_agent.sql','no_table','whatsapp_chats',null,null),
  -- 031
  ('031','031_admin_panel_performance_indexes.sql','index','products_created_at_idx',null,null),
  ('031','031_admin_panel_performance_indexes.sql','index','products_test_status_created_at_idx',null,null),
  ('031','031_admin_panel_performance_indexes.sql','index','orders_status_created_at_idx',null,null),
  -- 032
  ('032','032_profit_analytics_ad_spend.sql','constraint','orders','orders_status_check','%internal_return%'),
  ('032','032_profit_analytics_ad_spend.sql','table','product_ad_spend',null,null),
  -- 033
  ('033','033_product_profit_calculation_start_date.sql','column','products','profit_calculation_start_date',null),
  -- 034
  ('034','034_product_soft_delete.sql','column','products','deleted_at',null),
  ('034','034_product_soft_delete.sql','index','products_deleted_at_active_idx',null,null),
  -- 035
  ('035','035_orders_realtime.sql','realtime','orders',null,null),
  -- 036
  ('036','036_rbac_staff_permissions.sql','column','profiles','permissions',null),
  ('036','036_rbac_staff_permissions.sql','column','profiles','is_active',null),
  ('036','036_rbac_staff_permissions.sql','column','profiles','display_name',null),
  ('036','036_rbac_staff_permissions.sql','constraint','profiles','profiles_role_check','%owner%'),
  ('036','036_rbac_staff_permissions.sql','function','is_owner_user',null,null),
  ('036','036_rbac_staff_permissions.sql','function','is_active_panel_user',null,null),
  ('036','036_rbac_staff_permissions.sql','function','has_panel_permission',null,null),
  ('036','036_rbac_staff_permissions.sql','fn_body','handle_new_user',null,'%meta_permissions%'),
  ('036','036_rbac_staff_permissions.sql','policy','profiles','profiles_select_owner',null),
  ('036','036_rbac_staff_permissions.sql','policy','product_ad_spend','product_ad_spend_select_admin','%has_panel_permission%'),
  -- 037 (its orders_select_admin was later replaced by 042)
  ('037','037_order_security.sql','column','orders','deleted_at',null),
  ('037','037_order_security.sql','index','orders_active_created_at_idx',null,null),
  ('037','037_order_security.sql','index','orders_phone_product_created_idx',null,null),
  ('037','037_order_security.sql','table','api_rate_limit_buckets',null,null),
  ('037','037_order_security.sql','function','check_api_rate_limit',null,null),
  ('037','037_order_security.sql','no_policy','orders','orders_delete_admin',null),
  -- 038
  ('038','038_order_status_history.sql','table','order_status_history',null,null),
  ('038','038_order_status_history.sql','index','order_status_history_order_id_created_at_idx',null,null),
  -- 039
  ('039','039_drop_otp_codes.sql','no_table','otp_codes',null,null),
  -- 040
  ('040','040_orders_soft_delete_rls.sql','policy_wc','orders','orders_update_admin','%cancel_orders%'),
  -- 041
  ('041','041_funnel_meta_dispatches.sql','table','funnel_meta_dispatches',null,null),
  -- 042
  ('042','042_meta_event_log.sql','table','meta_event_log',null,null),
  ('042','042_meta_event_log.sql','index','meta_event_log_state_created_at_idx',null,null),
  ('042','042_meta_event_log.sql','index','meta_event_log_order_id_idx',null,null),
  ('042','042_meta_event_log.sql','index','meta_event_log_event_id_type_idx',null,null),
  ('042','042_meta_event_log.sql','index','meta_event_log_event_type_created_at_idx',null,null),
  ('042','042_meta_event_log.sql','policy','meta_event_log','meta_event_log_select_monitoring',null),
  ('042','042_meta_event_log.sql','policy','orders','orders_select_admin','%view_meta_monitoring%'),
  -- 043
  ('043','043_orders_updated_at.sql','column','orders','updated_at',null),
  ('043','043_orders_updated_at.sql','function','set_updated_at',null,null),
  ('043','043_orders_updated_at.sql','trigger','trg_orders_set_updated_at',null,null),
  -- 044
  ('044','044_profit_analytics_live_ad_spend.sql','column','orders','delivery_cost',null),
  ('044','044_profit_analytics_live_ad_spend.sql','table','product_ad_campaigns',null,null),
  ('044','044_profit_analytics_live_ad_spend.sql','index','product_ad_campaigns_product_id_idx',null,null),
  ('044','044_profit_analytics_live_ad_spend.sql','table','product_ad_spend_daily',null,null),
  ('044','044_profit_analytics_live_ad_spend.sql','policy','product_ad_spend_daily','product_ad_spend_daily_select',null),
  -- 045
  ('045','045_orders_note.sql','column','orders','note',null),
  -- 046
  ('046','046_manual_sales_quantity.sql','column','orders','quantity',null),
  ('046','046_manual_sales_quantity.sql','column','orders','source',null),
  ('046','046_manual_sales_quantity.sql','column','orders','manual_sale_group_id',null),
  -- 047
  ('047','047_manual_sale_channel.sql','column','orders','manual_sale_channel',null),
  -- 048
  ('048','048_marketing_messages.sql','table','marketing_campaigns',null,null),
  ('048','048_marketing_messages.sql','table','marketing_campaign_recipients',null,null),
  ('048','048_marketing_messages.sql','index','marketing_campaigns_status_idx',null,null),
  ('048','048_marketing_messages.sql','index','marketing_campaign_recipients_campaign_phone_idx',null,null),
  ('048','048_marketing_messages.sql','index','order_status_history_new_status_order_id_idx',null,null),
  ('048','048_marketing_messages.sql','function','marketing_campaign_recipients_sync_counters',null,null),
  ('048','048_marketing_messages.sql','trigger','marketing_campaign_recipients_sync_counters_trg',null,null),
  -- 049
  ('049','049_marketing_shipped_exclusion.sql','column','marketing_campaigns','exclude_shipped_product_ids',null),
  ('049','049_marketing_shipped_exclusion.sql','function','marketing_shipped_phones',null,null),
  -- 050
  ('050','050_affiliate_products.sql','column','products','fulfillment_type',null),
  ('050','050_affiliate_products.sql','column','products','affiliate_commission_type',null),
  ('050','050_affiliate_products.sql','column','products','affiliate_sku',null),
  ('050','050_affiliate_products.sql','column','products','affiliate_country',null),
  ('050','050_affiliate_products.sql','column','products','affiliate_currency',null),
  ('050','050_affiliate_products.sql','column','products','affiliate_sheet_url',null),
  ('050','050_affiliate_products.sql','column','products','affiliate_fixed_commission',null),
  ('050','050_affiliate_products.sql','column','products','affiliate_sell_price',null),
  ('050','050_affiliate_products.sql','constraint','products','products_currency_check',null),
  ('050','050_affiliate_products.sql','column','orders','affiliate_address',null),
  ('050','050_affiliate_products.sql','column','orders','affiliate_country',null),
  ('050','050_affiliate_products.sql','column','orders','affiliate_city',null),
  ('050','050_affiliate_products.sql','column','orders','affiliate_other_costs',null),
  ('050','050_affiliate_products.sql','column','orders','affiliate_costs_finalized',null),
  ('050','050_affiliate_products.sql','constraint','orders','orders_currency_not_empty_check',null),
  -- 051
  ('051','051_countries.sql','table','countries',null,null),
  ('051','051_countries.sql','notnull','products','country_id',null),
  ('051','051_countries.sql','policy','countries','countries_select_admin',null),
  ('051','051_countries.sql','data_zero','countries','iso_code',
     'select 2 - count(*) as n from public.countries where iso_code in (''MR'', ''SA'')'),
  -- 052
  ('052','052_marketing_country_scope.sql','notnull','marketing_campaigns','country_id',null),
  ('052','052_marketing_country_scope.sql','index','marketing_campaigns_country_id_idx',null,null),
  ('052','052_marketing_country_scope.sql','function','marketing_audience_confirmed',null,'%p_country_id%'),
  -- 053
  ('053','053_country_performance_indexes.sql','index','products_country_id_idx',null,null),
  -- 054
  ('054','054_product_specs.sql','column','products','specs_title_ar',null),
  ('054','054_product_specs.sql','column','products','specs_ar',null),
  ('054','054_product_specs.sql','column','products','specs_fr',null),
  -- 055
  ('055','055_product_display_currency.sql','column','products','display_currency',null),
  -- 056
  ('056','056_public_assets_bucket.sql','bucket','public-assets',null,null),
  -- 057
  ('057','057_products_public_view.sql','view','products_public',null,null),
  ('057','057_products_public_view.sql','no_policy','products','products_select_public',null),
  ('057','057_products_public_view.sql','no_policy','products','products_public_read',null),
  -- 058
  -- Only check_api_rate_limit is checked: 058 revokes it from PUBLIC too. The
  -- other functions are revoked from anon only and stay reachable through
  -- PUBLIC's default grant, so has_function_privilege can't tell.
  ('058','058_revoke_definer_execute.sql','anon_no_exec','public.check_api_rate_limit(text, integer, integer)',null,null),
  -- 059
  ('059','059_countries_public_view.sql','view','countries_public',null,null),
  ('059','059_countries_public_view.sql','no_policy','countries','countries_select_public',null),
  -- 060
  ('060','060_document_public_views_security_definer.sql','view_comment','products_public',null,'%migration 060%'),
  ('060','060_document_public_views_security_definer.sql','view_comment','countries_public',null,'%migration 060%'),
  -- 061
  ('061','061_hotfix_products_admin_select.sql','policy','products','products_select_panel',null),
  -- 062
  ('062','062_ctwa_attribution.sql','table','whatsapp_ad_clicks',null,null),
  ('062','062_ctwa_attribution.sql','index','whatsapp_ad_clicks_clid_key',null,null),
  ('062','062_ctwa_attribution.sql','index','whatsapp_ad_clicks_phone_clicked_at_idx',null,null),
  ('062','062_ctwa_attribution.sql','column','orders','meta_ctwa_clid',null),
  -- 063 (x2)
  ('063','063_ctwa_ad_source.sql','column','orders','meta_ad_source_id',null),
  ('063','063_ctwa_ad_source.sql','index','orders_meta_ad_source_id_created_at_idx',null,null),
  ('063','063_ctwa_ad_source.sql','index','whatsapp_ad_clicks_ad_source_id_clicked_at_idx',null,null),
  ('063','063_order_economics_snapshot.sql','column','orders','unit_price',null),
  ('063','063_order_economics_snapshot.sql','column','orders','unit_cost_price',null),
  ('063','063_order_economics_snapshot.sql','column','orders','affiliate_commission_type_at_order',null),
  ('063','063_order_economics_snapshot.sql','column','orders','affiliate_fixed_commission_at_order',null),
  ('063','063_order_economics_snapshot.sql','column','orders','affiliate_sell_price_at_order',null),
  -- 064 (x2)
  ('064','064_orders_business_date.sql','notnull','orders','ordered_at',null),
  ('064','064_orders_business_date.sql','index','orders_ordered_at_idx',null,null),
  ('064','064_whatsapp_sale.sql','table','whatsapp_contacts',null,null),
  ('064','064_whatsapp_sale.sql','index','whatsapp_contacts_last_inbound_at_idx',null,null),
  ('064','064_whatsapp_sale.sql','function','record_whatsapp_inbound',null,null),
  ('064','064_whatsapp_sale.sql','constraint','orders','orders_manual_sale_channel_check','%whatsapp%'),
  -- 065
  ('065','065_ad_spend_currency.sql','column','product_ad_spend_daily','source_amount',null),
  ('065','065_ad_spend_currency.sql','column','product_ad_spend_daily','source_currency',null),
  ('065','065_ad_spend_currency.sql','table','currency_rates',null,null),
  ('065','065_ad_spend_currency.sql','table','product_ad_campaign_unlinks',null,null),
  ('065','065_ad_spend_currency.sql','index','product_ad_campaign_unlinks_product_id_idx',null,null),
  ('065','065_ad_spend_currency.sql','policy','currency_rates','currency_rates_select_admin',null),
  -- 066
  ('066','066_whatsapp_dataset_leg.sql','column','orders','meta_purchase_dataset_sent',null),
  ('066','066_whatsapp_dataset_leg.sql','column','orders','meta_dataset_last_error',null),
  ('066','066_whatsapp_dataset_leg.sql','column','orders','meta_dataset_resend_claimed_at',null),
  ('066','066_whatsapp_dataset_leg.sql','index','orders_dataset_pending_idx',null,null),
  ('066','066_whatsapp_dataset_leg.sql','constraint','meta_event_log','meta_event_log_event_type_check','%dataset_resend%'),
  -- 067
  ('067','067_countries_local_operations.sql','notnull','countries','has_local_operations',null),
  ('067','067_countries_local_operations.sql','constraint','countries','countries_local_operations_mr_only',null),
  ('067','067_countries_local_operations.sql','column','countries_public','has_local_operations',null),
  ('067','067_countries_local_operations.sql','function','is_local_operations_country',null,null),
  ('067','067_countries_local_operations.sql','data_zero','countries','has_local_operations',
     'select 1 - count(*) as n from public.countries where has_local_operations and iso_code = ''MR'''),
  -- 068
  ('068','068_orders_country_id.sql','column','orders','country_id',null),
  ('068','068_orders_country_id.sql','index','orders_country_id_ordered_at_idx',null,null),
  ('068','068_orders_country_id.sql','constraint','orders','orders_currency_iso_check',null),
  ('068','068_orders_country_id.sql','trigger','trg_orders_enforce_country',null,null),
  ('068','068_orders_country_id.sql','trigger','trg_products_block_country_change',null,null),
  ('068','068_orders_country_id.sql','data_zero','orders','currency',
     'select count(*) as n from public.orders where currency = ''SARL'''),
  -- 069
  ('069','069_orders_country_id_not_null.sql','notnull','orders','country_id',null),
  ('069','069_orders_country_id_not_null.sql','table','orders_country_id_autofill_log',null,null),
  ('069','069_orders_country_id_not_null.sql','view_comment','orders_country_id_autofill_log',null,'%Permanent since 069%'),
  -- 070
  ('070','070_currency_rates_sar_kwd.sql','data_zero','currency_rates','code',
     'select 2 - count(*) as n from public.currency_rates where code in (''SAR'', ''KWD'')'),
  -- 071
  ('071','071_inventory.sql','column','orders','shipped_at',null),
  ('071','071_inventory.sql','column','orders','returned_at',null),
  ('071','071_inventory.sql','constraint','orders','orders_return_disposition_check',null),
  ('071','071_inventory.sql','column','products','low_stock_threshold',null),
  ('071','071_inventory.sql','table','inventory_settings',null,null),
  ('071','071_inventory.sql','table','stock_purchases',null,null),
  ('071','071_inventory.sql','table','stock_purchase_lines',null,null),
  ('071','071_inventory.sql','table','inventory_movements',null,null),
  ('071','071_inventory.sql','index','inventory_movements_order_primary_key',null,null),
  ('071','071_inventory.sql','function','sync_order_stock',null,null),
  ('071','071_inventory.sql','trigger','trg_orders_sync_stock',null,null),
  ('071','071_inventory.sql','trigger','trg_orders_stamp_fulfillment',null,null),
  ('071','071_inventory.sql','trigger','trg_inventory_movements_guard',null,null),
  ('071','071_inventory.sql','view','inventory_stock',null,null),
  ('071','071_inventory.sql','policy','inventory_movements','inventory_movements_select','%manage_inventory%'),
  -- 072
  ('072','072_inventory_functions.sql','function','change_order_status',null,null),
  ('072','072_inventory_functions.sql','function','inventory_go_live',null,null),
  ('072','072_inventory_functions.sql','function','create_stock_purchase',null,null),
  ('072','072_inventory_functions.sql','function','record_inventory_adjustment',null,null)
),
notes(file, note) as (values
  ('004_product_whatsapp_e164.sql', 'Was deleted from the repo; restored from git 2026-10-06.'),
  ('013_meta_initiate_checkout.sql', 'Was deleted from the repo; restored from git 2026-10-06.'),
  ('015_lock_brand_identity.sql', 'Trigger missing is expected and deliberate — NEVER re-run this file (see MIGRATIONS_LOG.md).'),
  ('069_orders_country_id_not_null.sql', 'Keeps the autofill safety net permanently; the log should stay empty for orders after 2026-10-07 01:54 UTC.'),
  ('005_form_fields_required_backfill.sql', 'Data-only on products.form_fields, which 008 dropped — cannot be verified.'),
  ('017_offer_section_fields.sql', 'All its columns were dropped by 021 — cannot be verified.'),
  ('026_ai_agent_whatsapp.sql', 'Its tables were dropped by 030; only the requires_human_intervention status is checked.'),
  ('016_header_dynamic_logo_and_offer_fields.sql', 'Its trigger function body was replaced by 020 — only columns checked.'),
  ('037_order_security.sql', 'Its orders_select_admin policy was replaced by 042 (see the soft-delete note in the preflight script).'),
  ('015_testimonial_extended_fields.sql', 'Data check: testimonials saved later from the admin form could also lack the key, so a "no" here is weak evidence.'),
  ('024_official_site_logo_url.sql', 'Data check: 027_zeina rewrites the same URLs, so 024 also reads "yes" if only 027 ran.'),
  ('027_zeina_logo_adoption.sql', 'Data check: "yes" means no product still uses an i.postimg.cc logo.')
),
ev as (
  select c.num, c.file, c.kind, c.obj, c.detail,
    case c.kind
      when 'na' then null
      when 'extension' then exists (select 1 from pg_extension where extname = c.obj)
      when 'table' then to_regclass('public.' || c.obj) is not null
      when 'no_table' then to_regclass('public.' || c.obj) is null
      when 'column' then exists (select 1 from information_schema.columns ic
        where ic.table_schema = 'public' and ic.table_name = c.obj and ic.column_name = c.detail)
      when 'no_column' then not exists (select 1 from information_schema.columns ic
        where ic.table_schema = 'public' and ic.table_name = c.obj and ic.column_name = c.detail)
      when 'notnull' then exists (select 1 from information_schema.columns ic
        where ic.table_schema = 'public' and ic.table_name = c.obj and ic.column_name = c.detail
          and ic.is_nullable = 'NO')
      when 'nullable' then exists (select 1 from information_schema.columns ic
        where ic.table_schema = 'public' and ic.table_name = c.obj and ic.column_name = c.detail
          and ic.is_nullable = 'YES')
      when 'index' then exists (select 1 from pg_indexes
        where schemaname = 'public' and indexname = c.obj)
      when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = c.obj
          and (c.extra is null or pg_get_function_identity_arguments(p.oid) ilike c.extra))
      when 'fn_body' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = c.obj and p.prosrc ilike c.extra)
      when 'constraint' then exists (select 1 from pg_constraint k
        join pg_class t on t.oid = k.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = c.obj and k.conname = c.detail
          and (c.extra is null or pg_get_constraintdef(k.oid) ilike c.extra))
      when 'policy' then exists (select 1 from pg_policies pp
        where pp.schemaname = 'public' and pp.tablename = c.obj and pp.policyname = c.detail
          and (c.extra is null or coalesce(pp.qual, '') || ' ' || coalesce(pp.with_check, '') ilike c.extra))
      when 'policy_wc' then exists (select 1 from pg_policies pp
        where pp.schemaname = 'public' and pp.tablename = c.obj and pp.policyname = c.detail
          and coalesce(pp.with_check, '') ilike c.extra)
      when 'no_policy' then not exists (select 1 from pg_policies pp
        where pp.schemaname = 'public' and pp.tablename = c.obj and pp.policyname = c.detail)
      when 'trigger' then exists (select 1 from pg_trigger tg
        where tg.tgname = c.obj and not tg.tgisinternal)
      when 'type' then exists (select 1 from pg_type ty join pg_namespace n on n.oid = ty.typnamespace
        where n.nspname = 'public' and ty.typname = c.obj)
      when 'view' then exists (select 1 from pg_views where schemaname = 'public' and viewname = c.obj)
      when 'view_comment' then coalesce(
        obj_description(to_regclass('public.' || c.obj), 'pg_class') ilike c.extra, false)
      when 'bucket' then exists (select 1 from storage.buckets b where b.id = c.obj)
      when 'realtime' then exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = c.obj)
      when 'anon_no_exec' then coalesce(
        not has_function_privilege('anon', to_regprocedure(c.obj)::oid, 'EXECUTE'), false)
      -- Data checks: only run the count when the column it reads exists, so a
      -- missing earlier migration reports "no" instead of aborting the script.
      when 'data_zero' then case
        when exists (select 1 from information_schema.columns ic
          where ic.table_schema = 'public' and ic.table_name = c.obj and ic.column_name = c.detail)
        then (xpath('/table/row/n/text()', query_to_xml(c.extra, false, false, '')))[1]::text::bigint = 0
        else false end
    end as ok
  from c
)
select
  ev.num as migration,
  ev.file,
  case
    when bool_and(ev.ok) is null then 'n/a'
    when bool_and(ev.ok) then 'yes'
    when bool_or(ev.ok) then 'PARTIAL'
    else 'no'
  end as applied,
  coalesce(string_agg(
    case when ev.ok = false then
      ev.kind || ' ' || coalesce(ev.obj, '') || coalesce('.' || ev.detail, '')
    end, '; '), '') as missing,
  coalesce(max(n.note), '') as note
from ev
left join notes n on n.file = ev.file
group by ev.num, ev.file
order by ev.num, ev.file;
