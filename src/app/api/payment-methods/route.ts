import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type MethodRow = {
  id: string;
  label: string;
  account_number: string;
  payment_logo_url: string | null;
  sort_order: number;
};

function parseEnvMethods(): MethodRow[] {
  const raw = process.env.PAYMENT_METHODS_JSON?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row, i) => {
      const r = row as Record<string, unknown>;
      const rawLogo = r.payment_logo_url;
      const logoStr =
        typeof rawLogo === "string" && rawLogo.trim() ? rawLogo.trim() : null;
      return {
        id: String(r.id ?? `env-${i}`),
        label: String(r.label ?? "Payment"),
        account_number: String(r.account_number ?? r.number ?? ""),
        payment_logo_url: logoStr,
        sort_order: Number(r.sort_order ?? i),
      };
    });
  } catch {
    return [];
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, label, account_number, payment_logo_url, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.length) {
    return NextResponse.json({ methods: data as MethodRow[] });
  }

  const envMethods = parseEnvMethods();
  return NextResponse.json({ methods: envMethods });
}
