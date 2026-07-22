/** Granular admin panel permission keys stored on staff profiles. */
export const PERMISSIONS = {
  view_orders: "view_orders",
  confirm_orders: "confirm_orders",
  cancel_orders: "cancel_orders",
  manage_products: "manage_products",
  view_analytics: "view_analytics",
  view_meta_monitoring: "view_meta_monitoring",
  marketing_messages: "marketing_messages",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export type PanelRole = "owner" | "staff";

export type AdminProfile = {
  role: PanelRole;
  permissions: PermissionKey[];
  isActive: boolean;
  displayName: string | null;
  email: string | null;
};

export type AdminAccess = AdminProfile & {
  isOwner: boolean;
  userId: string;
};

export const ROUTE_PERMISSIONS: Record<string, PermissionKey | PermissionKey[] | "owner"> = {
  "/admin/staff": "owner",
  "/admin/products": PERMISSIONS.manage_products,
  "/admin/orders": PERMISSIONS.view_orders,
  "/admin/analytics": PERMISSIONS.view_analytics,
  "/admin/meta": PERMISSIONS.view_meta_monitoring,
  "/admin/marketing": PERMISSIONS.marketing_messages,
};

export function parsePermissions(raw: unknown): PermissionKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is PermissionKey =>
    typeof p === "string" && ALL_PERMISSIONS.includes(p as PermissionKey),
  );
}

export function isOwnerRole(role: string | null | undefined): boolean {
  return role === "owner";
}

export function hasPermission(access: Pick<AdminAccess, "isOwner" | "permissions">, key: PermissionKey): boolean {
  if (access.isOwner) return true;
  return access.permissions.includes(key);
}

export function hasAnyPermission(
  access: Pick<AdminAccess, "isOwner" | "permissions">,
  keys: PermissionKey[],
): boolean {
  if (access.isOwner) return true;
  return keys.some((k) => access.permissions.includes(k));
}

export function canAccessRoute(
  access: Pick<AdminAccess, "isOwner" | "permissions">,
  pathname: string,
): boolean {
  if (access.isOwner) return true;

  for (const [route, requirement] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      if (requirement === "owner") return false;
      if (Array.isArray(requirement)) return hasAnyPermission(access, requirement);
      return hasPermission(access, requirement);
    }
  }

  // Dashboard home is always reachable for authenticated panel users.
  if (pathname === "/admin" || pathname === "/admin/") return true;
  return true;
}

/** Status transitions that require confirm vs cancel authority. */
export function permissionForOrderStatus(status: string): PermissionKey | null {
  if (status === "confirmed" || status === "shipped") return PERMISSIONS.confirm_orders;
  if (
    status === "cancelled" ||
    status === "internal_return" ||
    status === "requires_human_intervention"
  ) {
    return PERMISSIONS.cancel_orders;
  }
  return PERMISSIONS.confirm_orders;
}

export function canChangeOrderStatus(
  access: Pick<AdminAccess, "isOwner" | "permissions">,
  nextStatus: string,
): boolean {
  if (!hasPermission(access, PERMISSIONS.view_orders)) return false;
  const required = permissionForOrderStatus(nextStatus);
  return required ? hasPermission(access, required) : false;
}

/**
 * Whether a staff member can edit order-detail fields that aren't a status
 * transition (e.g. delivery cost) — anyone who can confirm or cancel orders at
 * all, same gate the order detail modal already uses for its status editor.
 */
export function canEditOrderDetails(access: Pick<AdminAccess, "isOwner" | "permissions">): boolean {
  return (
    hasPermission(access, PERMISSIONS.view_orders) &&
    hasAnyPermission(access, [PERMISSIONS.confirm_orders, PERMISSIONS.cancel_orders])
  );
}

export type PermissionMeta = {
  key: PermissionKey;
  labelAr: string;
  shortAr: string;
  descriptionAr: string;
};

export const PERMISSION_CATALOG: PermissionMeta[] = [
  {
    key: PERMISSIONS.view_orders,
    labelAr: "عرض الطلبات",
    shortAr: "الطلبات",
    descriptionAr: "الوصول إلى لوحة الطلبات ومتابعة حالتها.",
  },
  {
    key: PERMISSIONS.confirm_orders,
    labelAr: "تأكيد الطلبات",
    shortAr: "تأكيد",
    descriptionAr: "تغيير حالة الطلب إلى «مؤكد» أو «تم الشحن».",
  },
  {
    key: PERMISSIONS.cancel_orders,
    labelAr: "إلغاء الطلبات",
    shortAr: "إلغاء",
    descriptionAr: "إلغاء الطلبات، الإرجاع الداخلي، أو حذفها.",
  },
  {
    key: PERMISSIONS.manage_products,
    labelAr: "إدارة المنتجات",
    shortAr: "المنتجات",
    descriptionAr: "عرض وإضافة وتعديل وأرشفة المنتجات.",
  },
  {
    key: PERMISSIONS.view_analytics,
    labelAr: "عرض الأرباح",
    shortAr: "الأرباح",
    descriptionAr: "الوصول إلى تحليلات الربح ومصاريف الإعلانات.",
  },
  {
    key: PERMISSIONS.view_meta_monitoring,
    labelAr: "مراقبة Meta",
    shortAr: "Meta",
    descriptionAr: "متابعة أحداث Meta Pixel/CAPI والأعطال.",
  },
  {
    key: PERMISSIONS.marketing_messages,
    labelAr: "الرسائل التسويقية",
    shortAr: "التسويق",
    descriptionAr: "إرسال حملات واتساب تسويقية للعملاء السابقين.",
  },
];
