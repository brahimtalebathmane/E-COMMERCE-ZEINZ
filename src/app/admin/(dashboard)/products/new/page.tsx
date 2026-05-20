import { ResearchProductForm } from "@/components/admin/ResearchProductForm";
import { adminAr as a } from "@/locales/admin-ar";

export default function NewProductPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{a.newProduct.title}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{a.newProduct.researchHint}</p>
      <div className="mt-8">
        <ResearchProductForm />
      </div>
    </div>
  );
}
