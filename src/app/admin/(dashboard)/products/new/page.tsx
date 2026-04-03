import { ProductForm } from "@/components/admin/ProductForm";

export default function NewProductPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">New product</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        The URL slug is generated from the name and cannot be changed later.
      </p>
      <div className="mt-8">
        <ProductForm mode="create" />
      </div>
    </div>
  );
}
