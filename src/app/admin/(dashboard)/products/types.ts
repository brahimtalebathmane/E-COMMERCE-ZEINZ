import type { ProductTestingStatus, ProductSourcingType } from "@/types";

export type AdminProductPipelineRow = {
  id: string;
  name_ar: string;
  slug: string;
  price: number;
  discount_price: number | null;
  cost_price: number | null;
  media_url: string;
  media_type: "image" | "video";
  sourcing_type: ProductSourcingType | null;
  sourcing_link: string;
  test_status: ProductTestingStatus;
};
