import { ProductForm } from "@/components/admin/ProductForm";
import { adminAr as a } from "@/locales/admin-ar";

export default function NewProductPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{a.newProduct.title}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{a.newProduct.slugHint}</p>
      <div className="mt-8">
        <ProductForm mode="create" />
      </div>
    </div>
  );
}
