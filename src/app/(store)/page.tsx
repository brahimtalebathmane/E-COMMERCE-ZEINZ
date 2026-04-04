import {
  createPublicClient,
  isSupabaseConfigured,
} from "@/lib/supabase/public";
import { CatalogPageClient } from "@/components/store/CatalogPageClient";

export const revalidate = 60;

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return <CatalogPageClient products={[]} configured={false} />;
  }

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select("name, slug, discount_price, price")
    .order("created_at", { ascending: false });

  const products = data ?? [];

  return <CatalogPageClient products={products} configured />;
}
