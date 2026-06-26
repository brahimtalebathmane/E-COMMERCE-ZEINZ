import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Request-scoped Supabase client.
 *
 * Wrapped in React `cache()` so that the layout, the page, and any helpers that
 * run inside the same server render (e.g. `getAdminSession`) all share a single
 * client + a single cookie parse instead of constructing a fresh one each call.
 * This is per-request memoization only — separate requests still get isolated
 * clients, so there is no cross-user leakage.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component — ignore if middleware already refreshed session
          }
        },
      },
    },
  );
});
