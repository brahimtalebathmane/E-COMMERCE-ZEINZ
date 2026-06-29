import { NextResponse } from "next/server";
import { clearOrderSuccessSessionCookies } from "@/lib/orders/order-success-session";

/** Clears short-lived order-success HttpOnly cookies after tokens are consumed. */
export async function POST() {
  const response = NextResponse.json({ success: true });
  clearOrderSuccessSessionCookies(response);
  return response;
}
