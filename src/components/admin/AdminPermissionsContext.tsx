"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AdminAccess, PermissionKey } from "@/lib/auth/permissions";
import { hasAnyPermission, hasPermission } from "@/lib/auth/permissions";

const AdminPermissionsContext = createContext<AdminAccess | null>(null);

export function AdminPermissionsProvider({
  access,
  children,
}: {
  access: AdminAccess;
  children: ReactNode;
}) {
  return (
    <AdminPermissionsContext.Provider value={access}>
      {children}
    </AdminPermissionsContext.Provider>
  );
}

export function useAdminAccess(): AdminAccess {
  const ctx = useContext(AdminPermissionsContext);
  if (!ctx) {
    throw new Error("useAdminAccess must be used within AdminPermissionsProvider");
  }
  return ctx;
}

export function useHasPermission(key: PermissionKey): boolean {
  const access = useAdminAccess();
  return hasPermission(access, key);
}

export function useHasAnyPermission(keys: PermissionKey[]): boolean {
  const access = useAdminAccess();
  return hasAnyPermission(access, keys);
}
