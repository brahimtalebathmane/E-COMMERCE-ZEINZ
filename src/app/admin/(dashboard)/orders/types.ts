import type { OrderStatus } from "@/types";

export type AdminOrderProduct = {
  name_ar: string;
  slug: string;
  price: number;
  discount_price: number | null;
  media_type: "image" | "video";
  media_url: string;
} | null;

export type AdminOrderRow = {
  id: string;
  product_id: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  total_price: number;
  currency: string;
  status: OrderStatus;
  completion_token: string;
  created_at: string;
  products: AdminOrderProduct;
};
