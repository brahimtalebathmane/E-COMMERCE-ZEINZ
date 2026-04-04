import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  product_id: string;
  customer_name?: string;
  phone?: string;
  address?: string;
  payment_method?: string;
  payment_number?: string;
  transaction_reference?: string;
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
        customer_name: data.customer_name ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        payment_method: data.payment_method ?? null,
        payment_number: data.payment_number ?? null,
        transaction_reference: data.transaction_reference ?? null,
        total_price: total,
        currency: "MRU",
        status: "pending",
        form_data: {},
      })
      .select("id, completion_token, total_price")
      .single();

    if (orderErr) {
      throw new Error(orderErr.message);
    }
    if (!order) {
      throw new Error("Create failed: no order returned");
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      completion_token: order.completion_token,
      total_price: order.total_price,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[POST /api/orders]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
