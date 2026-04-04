import type { OrderStatus } from "@/types";

export type AdminOrderProduct = {
  name_ar: string;
  slug: string;
  whatsapp_e164: string | null;
  price: number;
  discount_price: number | null;
  description_ar: string;
  media_type: "image" | "video";
  media_url: string;
  /** Post-payment field definitions (Arabic labels); JSON from DB. */
  form_fields_ar?: unknown;
} | null;

export type AdminOrderRow = {
  id: string;
  product_id: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  payment_method: string | null;
  payment_number: string | null;
  transaction_reference: string | null;
  receipt_image_url: string | null;
  total_price: number;
  currency: string;
  status: OrderStatus;
  form_data: Record<string, unknown> | null;
  completion_token: string;
  created_at: string;
  products: AdminOrderProduct;
};
