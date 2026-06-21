-- 030_remove_whatsapp_ai_agent.sql
-- Architectural pivot: the inbound WhatsApp AI reply agent has been removed and
-- replaced by an interactive Admin Command Assistant inside the dashboard.
--
-- This migration tears down the per-product AI agent rule storage and the
-- WhatsApp OpenAI thread mapping that backed the old inbound pipeline.
--
-- Notes:
-- * The `orders.status` enum extension (`requires_human_intervention`) added in
--   026 is intentionally kept: it remains a valid order state and is still
--   supported by the order state machine and the new admin assistant.
-- * Idempotent: safe to re-run.

-- Per-product AI agent rules (and their RLS policies, dropped with the table).
drop table if exists public.ai_agent_rules cascade;

-- Phone -> OpenAI thread mapping used only by the removed inbound agent.
drop table if exists public.whatsapp_chats cascade;
