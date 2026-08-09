-- Verified fact: `set local role anon; select public.check_api_rate_limit('probe', 5, 60);`
-- succeeds today — any visitor can call every SECURITY DEFINER helper below
-- via /rest/v1/rpc/<fn>, including burning another customer's rate-limit
-- bucket or spamming rows into api_rate_limit_buckets.
--
-- Empirically verified before applying (BEGIN/ROLLBACK against production,
-- simulating both an owner and a view_orders-only staff session by setting
-- request.jwt.claim.sub): revoking anon/authenticated EXECUTE on these
-- functions does NOT break RLS policy evaluation for real logged-in admins.
-- Postgres does not require the querying role to hold EXECUTE on a function
-- referenced inside a USING/WITH CHECK expression — only SQL that calls the
-- function directly (e.g. an RPC request) needs the grant. All real app
-- callers of check_api_rate_limit already use the service-role client
-- (src/app/api/orders/route.ts), so revoking anon/authenticated does not
-- affect them either.
--
-- marketing_shipped_phones, marketing_audience_confirmed, and
-- marketing_campaign_recipients_sync_counters are also flagged by the
-- Supabase advisor as anon/authenticated-executable SECURITY DEFINER
-- functions, but they are explicitly out of scope for this change (owned by
-- the WhatsApp/marketing worker being handled separately) and are left as a
-- justified, documented WARN.

revoke execute on function public.check_api_rate_limit(text, integer, integer) from anon, authenticated, public;
grant  execute on function public.check_api_rate_limit(text, integer, integer) to service_role;

revoke execute on function public.handle_new_user()          from anon, authenticated, public;
revoke execute on function public.is_admin(uuid)             from anon, authenticated;
revoke execute on function public.is_owner_user()            from anon;
revoke execute on function public.is_active_panel_user()     from anon;
revoke execute on function public.has_panel_permission(text) from anon;
