import { createClient } from "@supabase/supabase-js";

/** Trims and strips wrapping quotes (common when pasting into Netlify / hosting UIs). */
function normalizeEnv(value: string | undefined): string {
  if (value == null) return "";
  let v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

export function createServiceClient() {
  const url = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
