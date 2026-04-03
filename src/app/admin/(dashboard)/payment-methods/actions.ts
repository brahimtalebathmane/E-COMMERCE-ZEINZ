"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
  sort_order: number;
  active: boolean;
}) {
  const supabase = await assertAdmin();
  const { error } = await supabase.from("payment_methods").insert({
    label: input.label.trim(),
    account_number: input.account_number.trim(),
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
    sort_order: number;
    active: boolean;
  },
) {
  const supabase = await assertAdmin();
  const { error } = await supabase
    .from("payment_methods")
    .update({
      label: input.label.trim(),
      account_number: input.account_number.trim(),
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
