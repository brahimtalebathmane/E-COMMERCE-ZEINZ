import { Suspense } from "react";
import { CompleteOrderClient } from "./CompleteOrderClient";
import { LoadingFallback } from "@/components/store/LoadingFallback";

type PageProps = { params: Promise<{ order_id: string }> };

export default async function CompleteOrderPage({ params }: PageProps) {
  const { order_id } = await params;

  return (
    <Suspense fallback={<LoadingFallback />}>
      <CompleteOrderClient orderId={order_id} />
    </Suspense>
  );
}
