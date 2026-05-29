import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export class AuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

export type AdminSession = {
  supabase: SupabaseClient;
  user: User;
};

/**
 * Ensures the current session belongs to an authenticated admin.
 * Use in Server Actions and server components.
 */
export async function assertAdminUser(): Promise<AdminSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new AuthError(401, "Unauthorized");
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    throw new AuthError(403, "Forbidden");
  }
  return { supabase, user };
}

/** @deprecated Use assertAdminUser — kept for gradual migration */
export async function assertAdmin(): Promise<SupabaseClient> {
  const { supabase } = await assertAdminUser();
  return supabase;
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
