import { NotFoundContent } from "@/components/store/NotFoundContent";
import { StoreSiteFooter } from "@/components/store/StoreSiteFooter";

/**
 * No product context here (the whole point of a not-found page), so there's
 * no fulfillment_type to gate on. Defaults to showing the footer, same as
 * the catalog homepage — a generic "page not found" reached from an unknown
 * or mistyped URL isn't known to be affiliate-specific.
 */
export default function NotFound() {
  return (
    <>
      <NotFoundContent />
      <StoreSiteFooter />
    </>
  );
}
