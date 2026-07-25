import type { AffiliateCommissionType, FulfillmentType, OrderStatus } from "@/types";

export type AdminOrderProduct = {
  name_ar: string;
  slug: string;
  price: number;
  discount_price: number | null;
  media_type: "image" | "video";
  media_url: string;
  fulfillment_type: FulfillmentType;
  affiliate_commission_type: AffiliateCommissionType | null;
  affiliate_sku: string | null;
  affiliate_sheet_url: string | null;
} | null;

export type OrderSource = "storefront" | "manual";

export type AdminOrderRow = {
  id: string;
  product_id: string;
  customer_name: string | null;
  phone: string | null;
  total_price: number;
  currency: string;
  status: OrderStatus;
  completion_token: string;
  created_at: string;
  delivery_cost: number | null;
  note: string | null;
  quantity: number;
  source: OrderSource;
  manual_sale_group_id: string | null;
  meta_lead_sent: boolean | null;
  meta_purchase_sent: boolean | null;
  meta_cancel_sent: boolean | null;
  affiliate_address: string | null;
  affiliate_country: string | null;
  affiliate_city: string | null;
  affiliate_other_costs: number | null;
  affiliate_costs_finalized: boolean;
  products: AdminOrderProduct;
};
