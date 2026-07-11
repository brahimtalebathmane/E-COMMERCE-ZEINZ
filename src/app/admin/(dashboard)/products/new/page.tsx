import { ResearchProductForm } from "@/components/admin/ResearchProductForm";
import { AdminPageHeader } from "@/components/admin/ui";
import { adminAr as a } from "@/locales/admin-ar";

export default function NewProductPage() {
  return (
    <div>
      <AdminPageHeader title={a.newProduct.title} subtitle={a.newProduct.researchHint} />
      <ResearchProductForm mode="create" />
    </div>
  );
}
