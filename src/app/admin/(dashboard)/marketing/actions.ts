"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAudience, searchAllCustomers, type AudienceType, type RecipientRow } from "./data";

export type PreviewAudienceResult = { ok: true; recipients: RecipientRow[] } | { ok: false; error: string };

/** Recipient-count preview for the two automatic audience modes, shown before the admin commits to Send. */
export async function previewAudienceAction(
  audienceType: "all_confirmed" | "by_product",
  productId?: string | null,
): Promise<PreviewAudienceResult> {
  try {
    await assertPermission(PERMISSIONS.marketing_messages);
    const recipients = await resolveAudience(audienceType, productId);
    return { ok: true, recipients };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load audience." };
  }
}

/** Manual-mode customer search (name or phone substring). */
export async function searchCustomersAction(term: string): Promise<PreviewAudienceResult> {
  try {
    await assertPermission(PERMISSIONS.marketing_messages);
    const recipients = await searchAllCustomers(term);
    return { ok: true, recipients };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to search customers." };
  }
}

export type CreateCampaignResult = { ok: true; campaignId: string } | { ok: false; error: string };

/**
 * Creates a campaign as `draft`. For manual audience, also inserts the
 * admin-picked recipients as `pending` rows right away (so they're locked in
 * at creation time, before Send) — the two automatic modes resolve their
 * audience fresh at Send time instead, since "who currently qualifies" can
 * change between creating the draft and clicking Send.
 */
export async function createCampaignAction(input: {
  messageText: string;
  imageUrl?: string | null;
  audienceType: AudienceType;
  productId?: string | null;
  manualRecipients?: RecipientRow[];
}): Promise<CreateCampaignResult> {
  try {
    await assertPermission(PERMISSIONS.marketing_messages);
    const messageText = input.messageText.trim();
    if (!messageText) return { ok: false, error: "نص الرسالة مطلوب." };

    if (input.audienceType === "by_product" && !input.productId) {
      return { ok: false, error: "اختر منتجاً." };
    }
    if (input.audienceType === "manual" && !(input.manualRecipients && input.manualRecipients.length > 0)) {
      return { ok: false, error: "أضف مستلماً واحداً على الأقل." };
    }

    const supabase = createServiceClient();

    const { data: campaign, error: cErr } = await supabase
      .from("marketing_campaigns")
      .insert({
        message_text: messageText,
        image_url: input.imageUrl || null,
        audience_type: input.audienceType,
        product_id: input.audienceType === "by_product" ? input.productId : null,
        status: "draft",
        total_recipients: input.audienceType === "manual" ? input.manualRecipients?.length ?? 0 : 0,
      })
      .select("id")
      .single();
    if (cErr || !campaign) return { ok: false, error: cErr?.message || "Failed to create campaign." };

    if (input.audienceType === "manual" && input.manualRecipients?.length) {
      const rows = input.manualRecipients.map((r) => ({
        campaign_id: campaign.id,
        phone: r.phone,
        customer_name: r.customerName,
        status: "pending" as const,
      }));
      const { error: insErr } = await supabase
        .from("marketing_campaign_recipients")
        .upsert(rows, { onConflict: "campaign_id,phone", ignoreDuplicates: true });
      if (insErr) return { ok: false, error: insErr.message };
    }

    revalidatePath("/admin/marketing");
    return { ok: true, campaignId: String(campaign.id) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to create campaign." };
  }
}

export type SendCampaignResult = { ok: true; recipientCount: number } | { ok: false; error: string };

/**
 * Flips a draft campaign to `sending` and (for the two automatic audience
 * modes) bulk-inserts the recipient rows resolved fresh right now. Does NOT
 * send anything itself — the already-running Railway worker picks it up on
 * its next poll. The `.eq("status", "draft")` guard prevents a double-submit
 * from double-inserting/double-starting; the DB's unique(campaign_id, phone)
 * index is a second line of defense.
 */
export async function sendCampaignAction(campaignId: string): Promise<SendCampaignResult> {
  try {
    await assertPermission(PERMISSIONS.marketing_messages);
    const supabase = createServiceClient();

    const { data: campaign, error: gErr } = await supabase
      .from("marketing_campaigns")
      .select("id, audience_type, product_id, status")
      .eq("id", campaignId)
      .maybeSingle();
    if (gErr || !campaign) return { ok: false, error: gErr?.message || "الحملة غير موجودة." };
    if (campaign.status !== "draft") return { ok: false, error: "هذه الحملة ليست في وضع المسودة." };

    let recipientCount = 0;

    if (campaign.audience_type === "manual") {
      const { count } = await supabase
        .from("marketing_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);
      recipientCount = count ?? 0;
      if (recipientCount === 0) return { ok: false, error: "لا يوجد مستلمون لهذه الحملة." };
    } else {
      const recipients = await resolveAudience(
        campaign.audience_type as "all_confirmed" | "by_product",
        campaign.product_id,
      );
      if (recipients.length === 0) return { ok: false, error: "لا يوجد عملاء مطابقون لهذا الاختيار." };

      const rows = recipients.map((r) => ({
        campaign_id: campaignId,
        phone: r.phone,
        customer_name: r.customerName,
        status: "pending" as const,
      }));
      const { error: insErr } = await supabase
        .from("marketing_campaign_recipients")
        .upsert(rows, { onConflict: "campaign_id,phone", ignoreDuplicates: true });
      if (insErr) return { ok: false, error: insErr.message };
      recipientCount = recipients.length;
    }

    const { data: updated, error: uErr } = await supabase
      .from("marketing_campaigns")
      .update({
        status: "sending",
        total_recipients: recipientCount,
      })
      .eq("id", campaignId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (uErr) return { ok: false, error: uErr.message };
    if (!updated) return { ok: false, error: "تم إرسال هذه الحملة بالفعل." };

    revalidatePath("/admin/marketing");
    return { ok: true, recipientCount };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to start sending." };
  }
}

export type ResumeCampaignResult = { ok: true } | { ok: false; error: string };

/** Resumes a campaign that the worker auto-paused (status=failed) after 3 consecutive send failures. */
export async function resumeCampaignAction(campaignId: string): Promise<ResumeCampaignResult> {
  try {
    await assertPermission(PERMISSIONS.marketing_messages);
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .update({ status: "sending", consecutive_failures: 0 })
      .eq("id", campaignId)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "هذه الحملة ليست متوقفة." };

    revalidatePath("/admin/marketing");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to resume campaign." };
  }
}

export type RecipientListRow = {
  id: string;
  phone: string;
  customerName: string | null;
  status: "pending" | "sent" | "failed";
  errorMessage: string | null;
  sentAt: string | null;
};

export type ListRecipientsResult = { ok: true; recipients: RecipientListRow[] } | { ok: false; error: string };

/** Full recipient list for a campaign's drill-down view. */
export async function listCampaignRecipientsAction(campaignId: string): Promise<ListRecipientsResult> {
  try {
    await assertPermission(PERMISSIONS.marketing_messages);
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("marketing_campaign_recipients")
      .select("id, phone, customer_name, status, error_message, sent_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });
    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      recipients: (data ?? []).map((r) => ({
        id: String(r.id),
        phone: r.phone,
        customerName: r.customer_name,
        status: r.status as "pending" | "sent" | "failed",
        errorMessage: r.error_message,
        sentAt: r.sent_at,
      })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load recipients." };
  }
}
