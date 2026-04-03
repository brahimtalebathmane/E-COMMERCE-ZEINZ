import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types";
import { OrderRowActions } from "./OrderRowActions";

export const dynamic = "force-dynamic";

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
        Could not load orders: {error.message}
      </p>
    );
  }

  const rows = (data ?? []) as unknown as OrderListRow[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Orders</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Receipts and uploads use signed URLs for preview (private storage).
      </p>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-[var(--accent-muted)]">
        <table className="min-w-[1200px] w-full divide-y divide-[var(--accent-muted)] text-xs">
          <thead className="bg-[var(--card)] text-left uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2">Ref</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Form data</th>
              <th className="px-3 py-2">Actions</th>
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
                  <td className="px-3 py-2 align-top">{o.phone ?? "—"}</td>
                  <td className="max-w-[180px] px-3 py-2 align-top whitespace-pre-wrap">
                    {o.address ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top">{productName}</td>
                  <td className="px-3 py-2 align-top">
                    <div>{o.payment_method ?? "—"}</div>
                    <div className="font-mono text-[10px] text-[var(--muted)]">
                      {o.payment_number ?? ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {o.transaction_reference ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top">${Number(o.total_price).toFixed(2)}</td>
                  <td className="max-w-[220px] px-3 py-2 align-top font-mono text-[10px] text-[var(--muted)]">
                    <pre className="whitespace-pre-wrap break-all">
                      {JSON.stringify(fd, null, 0)}
                    </pre>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <OrderRowActions
                      orderId={o.id}
                      completionToken={o.completion_token}
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
        <p className="mt-6 text-sm text-[var(--muted)]">No orders yet.</p>
      ) : null}
    </div>
  );
}
