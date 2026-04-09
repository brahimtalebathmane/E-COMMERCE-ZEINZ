import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logOrderCommunicationEvent } from "@/lib/order-communication-log";

type Body = {
  product_id: string;
  customer_name: string;
  phone: string;
  address?: string;
};

export async function POST(request: Request) {
  let data: Body;
  try {
    data = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (!data.product_id || typeof data.product_id !== "string") {
      return NextResponse.json({ error: "product_id required" }, { status: 400 });
    }
    if (!data.customer_name || typeof data.customer_name !== "string" || !data.customer_name.trim()) {
      return NextResponse.json({ error: "customer_name required" }, { status: 400 });
    }
    if (!data.phone || typeof data.phone !== "string" || !data.phone.trim()) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, discount_price, price")
      .eq("id", data.product_id)
      .maybeSingle();

    if (pErr) {
      throw new Error(pErr.message);
    }
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const total =
      product.discount_price != null
        ? Number(product.discount_price)
        : Number(product.price);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        product_id: data.product_id,
        customer_name: data.customer_name.trim(),
        phone: data.phone.trim(),
        address: data.address?.trim() || null,
        payment_method: null,
        payment_number: null,
        transaction_reference: null,
        receipt_image_url: null,
        total_price: total,
        currency: "MRU",
        status: "pending",
      })
      .select("id, total_price")
      .single();

    if (orderErr) {
      throw new Error(orderErr.message);
    }
    if (!order) {
      throw new Error("Create failed: no order returned");
    }

    console.log("[POST /api/orders] Order created", {
      order_id: order.id,
      product_id: data.product_id,
      phone: data.phone.trim(),
    });

    await logOrderCommunicationEvent(supabase, order.id, "order_created", null);

    return NextResponse.json({
      success: true,
      order_id: order.id,
      total_price: order.total_price,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[POST /api/orders]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
