/** Rolling window for rejecting duplicate phone + product submissions. */
export const DUPLICATE_ORDER_WINDOW_MS = 10 * 60 * 1000;

export const DUPLICATE_ORDER_ERROR_AR =
  "لقد أرسلت طلباً لهذا المنتج مؤخراً. يرجى الانتظار 10 دقائق قبل إعادة المحاولة.";

export type DuplicateOrderCheckInput = {
  phone: string;
  productId: string;
};

/**
 * Returns true when any order with the same phone and product was created within
 * {@link DUPLICATE_ORDER_WINDOW_MS}, including soft-deleted rows (admin visibility
 * must not reset the duplicate lock).
 */
export async function hasRecentDuplicateOrder(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  input: DuplicateOrderCheckInput,
): Promise<boolean> {
  const since = new Date(Date.now() - DUPLICATE_ORDER_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("phone", input.phone)
    .eq("product_id", input.productId)
    .gte("created_at", since)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.length);
}
