import { createClient } from "@/lib/supabase/server";
import type { PaymentMethodRow } from "@/types";
import { CreatePaymentMethodForm, PaymentMethodEditor } from "./PaymentMethodForms";
import { adminAr as a } from "@/locales/admin-ar";

export const dynamic = "force-dynamic";

export default async function PaymentMethodsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return (
      <p className="text-sm text-red-600">
        {a.paymentMethods.loadError} {error.message}
      </p>
    );
  }

  const rows = (data ?? []) as PaymentMethodRow[];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">{a.paymentMethods.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          {a.paymentMethods.subtitleBefore}{" "}
          <code className="rounded bg-[var(--accent-muted)]/50 px-1" dir="ltr">
            PAYMENT_METHODS_JSON
          </code>{" "}
          {a.paymentMethods.subtitleAfter}
        </p>
      </div>

      <CreatePaymentMethodForm />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{a.paymentMethods.existing}</h2>
        {rows.map((r) => (
          <PaymentMethodEditor key={r.id} row={r} />
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{a.paymentMethods.noRows}</p>
        ) : null}
      </div>
    </div>
  );
}
