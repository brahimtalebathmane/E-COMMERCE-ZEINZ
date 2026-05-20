import type { ProductSourcingType } from "@/types";

/** Minimal fields required to create a product in the research stage. */
export type ResearchProductPayload = {
  name_ar: string;
  media_url: string;
  media_type: "image" | "video";
  price: number;
  cost_price: number;
  sourcing_type: ProductSourcingType;
  sourcing_link: string;
};
