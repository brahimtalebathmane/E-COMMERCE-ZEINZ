"use server";

import { revalidatePath } from "next/cache";
import { assertOwnerUser } from "@/lib/auth/admin";
import {
  ALL_PERMISSIONS,
  type PermissionKey,
  parsePermissions,
} from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/service";

export type StaffRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  permissions: PermissionKey[];
  isActive: boolean;
  createdAt: string;
};

export type StaffActionResult =
  | { ok: true }
  | { ok: false; error: string };

function normalizePermissions(input: string[]): PermissionKey[] {
  const set = new Set<PermissionKey>();
  for (const p of input) {
    if (ALL_PERMISSIONS.includes(p as PermissionKey)) {
      set.add(p as PermissionKey);
    }
  }
  return Array.from(set);
}

export async function listStaffAction(): Promise<StaffRow[]> {
  await assertOwnerUser();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, permissions, is_active, created_at, role")
    .eq("role", "staff")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    email: row.email ?? null,
    displayName: row.display_name ?? null,
    permissions: parsePermissions(row.permissions),
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function createStaffAction(input: {
  email: string;
  password: string;
  displayName: string;
  permissions: string[];
}): Promise<StaffActionResult> {
  const { user } = await assertOwnerUser();

  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const displayName = input.displayName.trim();
  const permissions = normalizePermissions(input.permissions);

  if (!email || !password) {
    return { ok: false, error: "البريد الإلكتروني وكلمة المرور مطلوبان." };
  }
  if (password.length < 8) {
    return { ok: false, error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل." };
  }

  const service = createServiceClient();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "staff",
      permissions,
      display_name: displayName || null,
    },
  });

  if (createError || !created.user) {
    return { ok: false, error: createError?.message ?? "تعذر إنشاء الحساب." };
  }

  if (created.user.id === user.id) {
    return { ok: false, error: "لا يمكن إنشاء حساب للمالك الحالي." };
  }

  const { error: profileError } = await service
    .from("profiles")
    .update({
      role: "staff",
      permissions,
      display_name: displayName || null,
      is_active: true,
      email,
    })
    .eq("id", created.user.id);

  if (profileError) {
    await service.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function updateStaffAction(input: {
  id: string;
  displayName: string;
  permissions: string[];
  isActive: boolean;
  password?: string;
}): Promise<StaffActionResult> {
  await assertOwnerUser();

  const id = input.id.trim();
  if (!id) return { ok: false, error: "معرّف الموظف مطلوب." };

  const displayName = input.displayName.trim();
  const permissions = normalizePermissions(input.permissions);
  const service = createServiceClient();

  const { data: existing, error: fetchError } = await service
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!existing || existing.role !== "staff") {
    return { ok: false, error: "الموظف غير موجود." };
  }

  const { error: profileError } = await service
    .from("profiles")
    .update({
      display_name: displayName || null,
      permissions,
      is_active: input.isActive,
    })
    .eq("id", id);

  if (profileError) return { ok: false, error: profileError.message };

  const password = input.password?.trim();
  if (password) {
    if (password.length < 8) {
      return { ok: false, error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل." };
    }
    const { error: pwError } = await service.auth.admin.updateUserById(id, { password });
    if (pwError) return { ok: false, error: pwError.message };
  }

  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function suspendStaffAction(id: string, suspend: boolean): Promise<StaffActionResult> {
  await assertOwnerUser();

  const staffId = id.trim();
  if (!staffId) return { ok: false, error: "معرّف الموظف مطلوب." };

  const service = createServiceClient();
  const { data: existing, error: fetchError } = await service
    .from("profiles")
    .select("role")
    .eq("id", staffId)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!existing || existing.role !== "staff") {
    return { ok: false, error: "الموظف غير موجود." };
  }

  const { error } = await service
    .from("profiles")
    .update({ is_active: !suspend })
    .eq("id", staffId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/staff");
  return { ok: true };
}
