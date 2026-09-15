import type { OrderStatus } from "@/types";

export type DeletedOrderRow = {
  id: string;
  deleted_at: string;
  ordered_at: string;
  customer_name: string | null;
  phone: string | null;
  total_price: number;
  currency: string;
  status: OrderStatus;
  products: { name_ar: string; country_id: string } | { name_ar: string; country_id: string }[] | null;
};
