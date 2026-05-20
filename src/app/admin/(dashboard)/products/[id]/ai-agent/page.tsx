import Link from "next/link";
import { AiAgentManager } from "@/components/admin/AiAgentManager";
import { createClient } from "@/lib/supabase/server";
import { mapProductRow } from "@/lib/products";
import { adminAr as a } from "@/locales/admin-ar";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProductAiAgentPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: productRow, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !productRow) {
    notFound();
  }

  const product = mapProductRow(productRow as Record<string, unknown>);

  const { data: ruleRow } = await supabase
    .from("ai_agent_rules")
    .select("system_instruction, is_active")
    .eq("product_id", id)
    .maybeSingle();

  return (
    <div>
      <Link
        href={`/admin/products/${id}/edit`}
        className="text-sm text-[var(--muted)] underline"
      >
        ← {a.aiAgent.backToProduct}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{a.aiAgent.title}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{a.aiAgent.subtitle}</p>

      <div className="mt-8 max-w-3xl">
        <AiAgentManager
          productId={id}
          productName={product.name_ar}
          initialInstruction={(ruleRow?.system_instruction as string) ?? ""}
          initialActive={ruleRow?.is_active !== false}
        />
      </div>
    </div>
  );
}
