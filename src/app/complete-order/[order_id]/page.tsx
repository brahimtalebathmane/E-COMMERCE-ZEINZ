import { Suspense } from "react";
import { CompleteOrderClient } from "./CompleteOrderClient";

type PageProps = { params: Promise<{ order_id: string }> };

export default async function CompleteOrderPage({ params }: PageProps) {
  const { order_id } = await params;

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <CompleteOrderClient orderId={order_id} />
    </Suspense>
  );
}
