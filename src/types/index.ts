export type FormFieldType = "text" | "textarea" | "file" | "email" | "link";

export type FormFieldConfig = {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
};

export type Testimonial = {
  name: string;
  quote: string;
  role?: string;
};

export type FAQ = {
  q: string;
  a: string;
};

export type ProductRow = {
  id: string;
  name_ar: string;
  name_fr: string;
  description_ar: string;
  description_fr: string;
  slug: string;
  old_slugs: string[];
  price: number;
  discount_price: number | null;
  media_type: "image" | "video";
  media_url: string;
  features_ar: string[];
  features_fr: string[];
  gallery: string[];
  testimonials_ar: Testimonial[];
  testimonials_fr: Testimonial[];
  faqs_ar: FAQ[];
  faqs_fr: FAQ[];
  meta_pixel_id: string | null;
  /** E.164 digits (e.g. 222… for Mauritania). Null uses NEXT_PUBLIC_WHATSAPP_E164. */
  whatsapp_e164: string | null;
  form_title_ar: string;
  form_title_fr: string;
  form_fields_ar: FormFieldConfig[];
  form_fields_fr: FormFieldConfig[];
  created_at: string;
};

/** Resolved strings for the current storefront locale (Arabic or French with Arabic fallback). */
export type LocalizedProductCopy = {
  name: string;
  description: string;
  features: string[];
  testimonials: Testimonial[];
  faqs: FAQ[];
  form_title: string;
  form_fields: FormFieldConfig[];
};

export type OrderStatus = "pending" | "confirmed" | "shipped" | "cancelled";

export type OrderRow = {
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
  status: OrderStatus;
  form_data: Record<string, unknown>;
  completion_token: string;
  created_at: string;
};

export type PaymentMethodRow = {
  id: string;
  label: string;
  account_number: string;
  payment_logo_url: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
};
