import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  type AdminAccess,
  type PermissionKey,
  hasAnyPermission,
  hasPermission,
  isOwnerRole,
  parsePermissions,
} from "@/lib/auth/permissions";

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
  access: AdminAccess;
};

type ProfileRow = {
  role: string;
  permissions: unknown;
  is_active: boolean;
  display_name: string | null;
  email: string | null;
};

function buildAccess(userId: string, profile: ProfileRow): AdminAccess {
  const role = profile.role === "staff" ? "staff" : "owner";
  return {
    userId,
    role,
    isOwner: isOwnerRole(role),
    permissions: parsePermissions(profile.permissions),
    isActive: profile.is_active !== false,
    displayName: profile.display_name,
    email: profile.email,
  };
}

async function loadPanelAccess(
  supabase: SupabaseClient,
  user: User,
): Promise<AdminAccess> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions, is_active, display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["owner", "staff"].includes(profile.role)) {
    throw new AuthError(403, "Forbidden");
  }
  if (profile.is_active === false) {
    throw new AuthError(403, "Account suspended");
  }

  return buildAccess(user.id, profile as ProfileRow);
}

/**
 * Ensures the current session belongs to an active owner or staff panel user.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const access = await loadPanelAccess(supabase, user);
    return { supabase, user, access };
  } catch {
    return null;
  }
}

export async function assertAdminUser(): Promise<AdminSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new AuthError(401, "Unauthorized");
  }
  const access = await loadPanelAccess(supabase, user);
  return { supabase, user, access };
}

export async function assertOwnerUser(): Promise<AdminSession> {
  const session = await assertAdminUser();
  if (!session.access.isOwner) {
    throw new AuthError(403, "Owner access required");
  }
  return session;
}

export async function assertPermission(permission: PermissionKey): Promise<AdminSession> {
  const session = await assertAdminUser();
  if (!hasPermission(session.access, permission)) {
    throw new AuthError(403, "Forbidden");
  }
  return session;
}

export async function assertAnyPermission(permissions: PermissionKey[]): Promise<AdminSession> {
  const session = await assertAdminUser();
  if (!hasAnyPermission(session.access, permissions)) {
    throw new AuthError(403, "Forbidden");
  }
  return session;
}

/** @deprecated Use assertAdminUser — kept for gradual migration */
export async function assertAdmin(): Promise<SupabaseClient> {
  const { supabase } = await assertAdminUser();
  return supabase;
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
