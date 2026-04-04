"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizePaymentLogoUrl, isValidPaymentLogoUrl } from "@/lib/payment-logo-url";
import { adminAr as a } from "@/locales/admin-ar";
import { revalidatePath } from "next/cache";

function assertValidLogoUrl(raw: string): string | null {
  if (!isValidPaymentLogoUrl(raw)) {
    throw new Error(a.paymentMethods.logoUrlInvalid);
  }
  return normalizePaymentLogoUrl(raw);
}

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    throw new Error("Forbidden");
  }
  return supabase;
}

export async function createPaymentMethodAction(input: {
  label: string;
  account_number: string;
  payment_logo_url: string;
  sort_order: number;
  active: boolean;
}) {
  const supabase = await assertAdmin();
  const payment_logo_url = assertValidLogoUrl(input.payment_logo_url);
  const { error } = await supabase.from("payment_methods").insert({
    label: input.label.trim(),
    account_number: input.account_number.trim(),
    payment_logo_url,
    sort_order: input.sort_order,
    active: input.active,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/payment-methods");
}

export async function updatePaymentMethodAction(
  id: string,
  input: {
    label: string;
    account_number: string;
    payment_logo_url: string;
    sort_order: number;
    active: boolean;
  },
) {
  const supabase = await assertAdmin();
  const payment_logo_url = assertValidLogoUrl(input.payment_logo_url);
  const { error } = await supabase
    .from("payment_methods")
    .update({
      label: input.label.trim(),
      account_number: input.account_number.trim(),
      payment_logo_url,
      sort_order: input.sort_order,
      active: input.active,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/payment-methods");
}

export async function deletePaymentMethodAction(id: string) {
  const supabase = await assertAdmin();
  const { error } = await supabase.from("payment_methods").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/payment-methods");
}
