import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types";
import { OrderRowActions } from "./OrderRowActions";
import { adminAr as a } from "@/locales/admin-ar";
import { formatPrice } from "@/lib/currency";

export const dynamic = "force-dynamic";

function formatFormFieldValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    return String(v);
  }
  if (Array.isArray(v)) {
    return v.map((x) => formatFormFieldValue(x)).join(" · ");
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${formatFormFieldValue(val)}`)
      .join(" · ");
  }
  return String(v);
}

function OrderFormDataCell({
  fd,
  emptyLabel,
}: {
  fd: Record<string, unknown>;
  emptyLabel: string;
}) {
  const user = Object.entries(fd).filter(([k]) => !k.startsWith("_"));
  const system = Object.entries(fd).filter(([k]) => k.startsWith("_"));
  if (user.length === 0 && system.length === 0) {
    return <span className="text-[var(--muted)]">{emptyLabel}</span>;
  }
  return (
    <div className="space-y-2 text-start text-xs">
      {user.length > 0 ? (
        <ul className="space-y-1.5">
          {user.map(([k, v]) => (
            <li key={k}>
              <span className="font-semibold text-[var(--foreground)]">{k}</span>
              <span className="mx-1 text-[var(--muted)]">:</span>
              <span className="break-all text-[var(--muted)]">
                {formatFormFieldValue(v)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {system.length > 0 ? (
        <ul className="space-y-1 border-t border-[var(--accent-muted)]/40 pt-2 text-[10px] text-[var(--muted)]">
          {system.map(([k, v]) => (
            <li key={k} className="break-all">
              <span className="font-mono" dir="ltr">
                {k}
              </span>{" "}
              <span dir="auto">{formatFormFieldValue(v)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type OrderListRow = {
  id: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  payment_method: string | null;
  payment_number: string | null;
  transaction_reference: string | null;
  receipt_image_url: string | null;
  total_price: number;
  status: OrderStatus;
  form_data: Record<string, unknown> | null;
  completion_token: string;
  created_at: string;
  products: { name: string; slug: string } | null;
};

export default async function AdminOrdersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      customer_name,
      phone,
      address,
      payment_method,
      payment_number,
      transaction_reference,
      receipt_image_url,
      total_price,
      status,
      form_data,
      completion_token,
      created_at,
      products ( name, slug )
    `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-sm text-red-600">
        {a.orders.loadError} {error.message}
      </p>
    );
  }

  const rows = (data ?? []) as unknown as OrderListRow[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">{a.orders.title}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{a.orders.subtitle}</p>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-[var(--accent-muted)]">
        <table className="min-w-[1200px] w-full divide-y divide-[var(--accent-muted)] text-xs">
          <thead className="bg-[var(--card)] text-start uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">{a.orders.customer}</th>
              <th className="px-3 py-2">{a.orders.phone}</th>
              <th className="px-3 py-2">{a.orders.address}</th>
              <th className="px-3 py-2">{a.orders.product}</th>
              <th className="px-3 py-2">{a.orders.payment}</th>
              <th className="px-3 py-2">{a.orders.ref}</th>
              <th className="px-3 py-2">{a.orders.total}</th>
              <th className="px-3 py-2">{a.orders.formData}</th>
              <th className="px-3 py-2">{a.orders.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--accent-muted)]">
            {rows.map((o) => {
              const fd = (o.form_data ?? {}) as Record<string, unknown>;
              const formComplete = Boolean(fd["_purchase_confirmed_at"]);
              const productName = o.products?.name ?? "—";
              return (
                <tr key={o.id}>
                  <td className="px-3 py-2 align-top">{o.customer_name ?? "—"}</td>
                  <td className="px-3 py-2 align-top" dir="ltr">
                    {o.phone ?? "—"}
                  </td>
                  <td className="max-w-[180px] px-3 py-2 align-top whitespace-pre-wrap">
                    {o.address ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top">{productName}</td>
                  <td className="px-3 py-2 align-top">
                    <div>{o.payment_method ?? "—"}</div>
                    <div className="font-mono text-[10px] text-[var(--muted)]" dir="ltr">
                      {o.payment_number ?? ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top" dir="ltr">
                    {o.transaction_reference ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top" dir="ltr">
                    {formatPrice(Number(o.total_price))}
                  </td>
                  <td className="max-w-[260px] px-3 py-2 align-top text-[var(--muted)]">
                    <OrderFormDataCell fd={fd} emptyLabel={a.orders.formDataEmpty} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <OrderRowActions
                      orderId={o.id}
                      completionToken={o.completion_token}
                      totalPrice={Number(o.total_price)}
                      status={o.status}
                      formComplete={formComplete}
                      receiptPath={o.receipt_image_url}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--muted)]">{a.orders.noOrders}</p>
      ) : null}
    </div>
  );
}
