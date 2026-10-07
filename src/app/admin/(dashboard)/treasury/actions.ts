"use server";

import { revalidatePath } from "next/cache";
import { assertPermission, AuthError } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  assertInCountryScope,
  requireLocalOperationsScope,
  type RequiredCountryScope,
} from "@/lib/auth/country-scope";
import { createServiceClient } from "@/lib/supabase/service";

type ActionError = { ok: false; error: string };
type Service = ReturnType<typeof createServiceClient>;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_TYPES = ["cash", "bank", "mobile_wallet", "person_custody"] as const;
const PARTY_TYPES = ["delivery_agent", "supplier", "employee", "other"] as const;

/** Arabic message for the errors the treasury functions raise (migration 074). */
function treasuryErrorMessage(raw: string): string {
  const map: Array<[string, string]> = [
    ["treasury_not_live", "فعّل الخزينة أولاً."],
    ["treasury_already_live", "الخزينة مُفعّلة مسبقاً."],
    ["order_not_unsettled", "أحد الطلبات سُوّي مسبقاً أو لم يعد مستحقاً — حدّث الصفحة."],
    ["belongs to another agent", "أحد الطلبات تابع لموزّع آخر."],
    ["order_already_settled", "هذا الطلب سُوّي مسبقاً — لا يمكن تغيير موزّعه."],
    ["explain the difference", "اكتب سبب الفرق بين المبلغ المستلم والمتوقع."],
    ["a reason is required", "السبب مطلوب."],
    ["already reversed", "تم عكس هذه العملية مسبقاً."],
    ["cannot be reversed", "لا يمكن عكس عملية عكسية."],
    ["voiding the settlement", "عمليات التسوية تُصحَّح بإلغاء التسوية كاملة."],
    ["stock purchase payments cannot be reversed", "دفعة شراء المخزون لا تُعكس من هنا."],
    ["already paid from the treasury", "هذا الشراء مدفوع مسبقاً من الخزينة."],
    ["dedicated screen", "استعمل الشاشة المخصصة لهذا النوع (تحويل، جرد، تسوية)."],
    ["in the future", "التاريخ لا يمكن أن يكون في المستقبل."],
    ["account is archived", "هذا الحساب مؤرشف."],
    ["treasury_accounts_name_key", "يوجد حساب بنفس الاسم."],
    ["treasury_categories_name_key", "توجد فئة بنفس الاسم."],
    ["two different accounts", "اختر حسابين مختلفين."],
    ["opening balance", "الرصيد الافتتاحي لا يمكن أن يكون سالباً."],
  ];
  for (const [needle, message] of map) if (raw.includes(needle)) return message;
  return raw;
}

function failure(error: unknown, fallback: string): ActionError {
  if (error instanceof AuthError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: treasuryErrorMessage(error.message) };
  return { ok: false, error: fallback };
}

async function requireTreasuryWrite(): Promise<{ userId: string; scope: RequiredCountryScope; service: Service }> {
  const session = await assertPermission(PERMISSIONS.manage_treasury);
  const scope = await requireLocalOperationsScope();
  return { userId: session.access.userId, scope, service: createServiceClient() };
}

async function assertRowCountry(service: Service, scope: RequiredCountryScope, table: string, id: string) {
  const { data, error } = await service.from(table).select("country_id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  assertInCountryScope(scope, (data?.country_id as string | undefined) ?? null);
}

function revalidateTreasury() {
  revalidatePath("/admin/treasury", "layout");
}

async function rpc(service: Service, fn: string, args: Record<string, unknown>) {
  const { data, error } = await service.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

// --- Go-live -----------------------------------------------------------------

export type GoLiveAccountInput = { name: string; type: (typeof ACCOUNT_TYPES)[number]; openingBalance: number };

export async function treasuryGoLiveAction(input: {
  goLiveOn: string;
  accounts: GoLiveAccountInput[];
  agentName: string;
  agentPhone: string;
  carriedOverOrderIds: string[];
}): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    if (!ISO_DATE_RE.test(input.goLiveOn ?? "")) return { ok: false, error: "تاريخ التفعيل غير صالح." };
    const accounts = (input.accounts ?? []).filter((a) => a.name?.trim());
    if (accounts.length === 0) return { ok: false, error: "أضف حساباً واحداً على الأقل." };
    for (const a of accounts) {
      if (!ACCOUNT_TYPES.includes(a.type)) return { ok: false, error: "نوع حساب غير صالح." };
      if (!Number.isFinite(a.openingBalance) || a.openingBalance < 0) {
        return { ok: false, error: "الرصيد الافتتاحي يجب أن يكون 0 أو أكثر." };
      }
    }
    if (!input.agentName?.trim()) return { ok: false, error: "اكتب اسم الموزّع الافتراضي." };
    await rpc(service, "treasury_go_live", {
      p_country_id: scope.countryId,
      p_go_live_on: input.goLiveOn,
      p_accounts: accounts.map((a) => ({ name: a.name.trim(), type: a.type, opening_balance: a.openingBalance })),
      p_default_agent_name: input.agentName.trim(),
      p_default_agent_phone: input.agentPhone ?? "",
      p_carried_over: [...new Set(input.carriedOverOrderIds ?? [])],
      p_user: userId,
    });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر تفعيل الخزينة.");
  }
}

// --- Accounts, categories, parties ------------------------------------------------

export async function createAccountAction(input: {
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  openingBalance: number;
}): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    if (!input.name?.trim()) return { ok: false, error: "اسم الحساب مطلوب." };
    if (!ACCOUNT_TYPES.includes(input.type)) return { ok: false, error: "نوع حساب غير صالح." };
    await rpc(service, "treasury_create_account", {
      p_country_id: scope.countryId,
      p_name: input.name.trim(),
      p_type: input.type,
      p_opening_balance: Number(input.openingBalance) || 0,
      p_user: userId,
    });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر إنشاء الحساب.");
  }
}

export async function updateAccountAction(input: {
  accountId: string;
  name?: string;
  isActive?: boolean;
}): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    await assertRowCountry(service, scope, "treasury_accounts", input.accountId);
    await rpc(service, "treasury_update_account", {
      p_account_id: input.accountId,
      p_name: input.name ?? null,
      p_is_active: input.isActive ?? null,
      p_user: userId,
    });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر تحديث الحساب.");
  }
}

export async function createCategoryAction(input: {
  name: string;
  parentId: string | null;
  direction: "income" | "expense" | "adjustment" | null;
  countedInProfitBy: "orders" | "opex" | "none" | null;
}): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    if (!input.name?.trim()) return { ok: false, error: "اسم الفئة مطلوب." };
    if (input.parentId) await assertRowCountry(service, scope, "treasury_categories", input.parentId);
    await rpc(service, "treasury_create_category", {
      p_country_id: scope.countryId,
      p_name: input.name.trim(),
      p_parent_id: input.parentId,
      p_direction: input.parentId ? null : input.direction,
      p_counted: input.parentId ? null : input.countedInProfitBy,
      p_user: userId,
    });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر إنشاء الفئة.");
  }
}

export async function createPartyAction(input: {
  name: string;
  type: (typeof PARTY_TYPES)[number];
  phone: string;
  makeDefaultAgent: boolean;
}): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    if (!input.name?.trim()) return { ok: false, error: "الاسم مطلوب." };
    if (!PARTY_TYPES.includes(input.type)) return { ok: false, error: "نوع غير صالح." };
    await rpc(service, "treasury_create_party", {
      p_country_id: scope.countryId,
      p_name: input.name.trim(),
      p_type: input.type,
      p_phone: input.phone ?? "",
      p_make_default: input.type === "delivery_agent" && Boolean(input.makeDefaultAgent),
      p_user: userId,
    });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر الحفظ.");
  }
}

export async function setDefaultAgentAction(partyId: string): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    await assertRowCountry(service, scope, "treasury_parties", partyId);
    await rpc(service, "treasury_set_default_agent", { p_party_id: partyId, p_user: userId });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر الحفظ.");
  }
}

export async function assignAgentAction(orderId: string, partyId: string | null): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    await assertRowCountry(service, scope, "orders", orderId);
    await rpc(service, "treasury_assign_agent", { p_order_id: orderId, p_party_id: partyId, p_user: userId });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر تعيين الموزّع.");
  }
}

// --- Money movements ---------------------------------------------------------------

export async function addTransactionAction(input: {
  accountId: string;
  categoryId: string;
  /** Absolute value for income/expense categories; signed for adjustment categories. */
  amount: number;
  partyId: string | null;
  occurredOn: string;
  note: string;
  receiptPath: string | null;
}): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    if (!Number.isFinite(input.amount) || input.amount === 0) return { ok: false, error: "المبلغ مطلوب." };
    if (!ISO_DATE_RE.test(input.occurredOn ?? "")) return { ok: false, error: "التاريخ غير صالح." };
    if (input.receiptPath && !input.receiptPath.startsWith(`treasury-receipts/${scope.countryId}/`)) {
      return { ok: false, error: "إيصال غير صالح." };
    }
    await rpc(service, "treasury_add_transaction", {
      p_country_id: scope.countryId,
      p_account_id: input.accountId,
      p_category_id: input.categoryId,
      p_amount: input.amount,
      p_party_id: input.partyId,
      p_occurred_on: input.occurredOn,
      p_note: input.note ?? "",
      p_receipt_path: input.receiptPath ?? null,
      p_user: userId,
    });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر تسجيل العملية.");
  }
}

export async function transferAction(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredOn: string;
  note: string;
}): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من 0." };
    if (!ISO_DATE_RE.test(input.occurredOn ?? "")) return { ok: false, error: "التاريخ غير صالح." };
    await rpc(service, "treasury_transfer", {
      p_country_id: scope.countryId,
      p_from: input.fromAccountId,
      p_to: input.toAccountId,
      p_amount: input.amount,
      p_occurred_on: input.occurredOn,
      p_note: input.note ?? "",
      p_user: userId,
    });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر التحويل.");
  }
}

export async function reverseTransactionAction(transactionId: string, reason: string): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    if (!reason?.trim()) return { ok: false, error: "السبب مطلوب." };
    await assertRowCountry(service, scope, "treasury_transactions", transactionId);
    await rpc(service, "treasury_reverse", { p_transaction_id: transactionId, p_reason: reason.trim(), p_user: userId });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر عكس العملية.");
  }
}

export async function cashCountAction(input: {
  accountId: string;
  counted: number;
  reason: string;
}): Promise<{ ok: true; difference: number } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    if (!Number.isFinite(input.counted) || input.counted < 0) return { ok: false, error: "المبلغ المعدود غير صالح." };
    await assertRowCountry(service, scope, "treasury_accounts", input.accountId);
    const diff = await rpc(service, "treasury_cash_count", {
      p_account_id: input.accountId,
      p_counted: input.counted,
      p_reason: input.reason ?? "",
      p_user: userId,
    });
    revalidateTreasury();
    return { ok: true, difference: Number(diff) || 0 };
  } catch (error) {
    return failure(error, "تعذّر تسجيل الجرد.");
  }
}

// --- Settlement -------------------------------------------------------------------------

export type SettlementOrderInput = { orderId: string; fee: number | null };

export async function settleAction(input: {
  partyId: string;
  accountId: string;
  settledOn: string;
  sales: SettlementOrderInput[];
  returns: SettlementOrderInput[];
  agentKeepsFees: boolean;
  received: number;
  reason: string;
  note: string;
}): Promise<{ ok: true; settlementId: string } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    if (!ISO_DATE_RE.test(input.settledOn ?? "")) return { ok: false, error: "التاريخ غير صالح." };
    if (!Number.isFinite(input.received)) return { ok: false, error: "اكتب المبلغ المستلم." };
    const fees = [...input.sales, ...input.returns];
    if (fees.some((l) => l.fee != null && (!Number.isFinite(l.fee) || l.fee < 0))) {
      return { ok: false, error: "رسوم التوصيل يجب أن تكون 0 أو أكثر." };
    }
    const id = await rpc(service, "treasury_settle", {
      p_country_id: scope.countryId,
      p_party_id: input.partyId,
      p_account_id: input.accountId,
      p_settled_on: input.settledOn,
      p_sales: input.sales.map((l) => ({ order_id: l.orderId, fee: l.fee })),
      p_returns: input.returns.map((l) => ({ order_id: l.orderId, fee: l.fee })),
      p_agent_keeps_fees: input.agentKeepsFees,
      p_received: input.received,
      p_reason: input.reason ?? "",
      p_note: input.note ?? "",
      p_user: userId,
    });
    revalidateTreasury();
    revalidatePath("/admin/orders");
    revalidatePath("/admin/analytics");
    return { ok: true, settlementId: String(id) };
  } catch (error) {
    return failure(error, "تعذّر حفظ التسوية.");
  }
}

export async function voidSettlementAction(settlementId: string, reason: string): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    if (!reason?.trim()) return { ok: false, error: "السبب مطلوب." };
    await assertRowCountry(service, scope, "treasury_settlements", settlementId);
    await rpc(service, "treasury_void_settlement", { p_settlement_id: settlementId, p_reason: reason.trim(), p_user: userId });
    revalidateTreasury();
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر إلغاء التسوية.");
  }
}

// --- Phase B link: pay a restock from an account ---------------------------------------

export async function payStockPurchaseAction(purchaseId: string, accountId: string): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope, service } = await requireTreasuryWrite();
    await assertRowCountry(service, scope, "stock_purchases", purchaseId);
    await rpc(service, "treasury_record_stock_purchase", {
      p_purchase_id: purchaseId,
      p_account_id: accountId,
      p_occurred_on: null,
      p_user: userId,
    });
    revalidateTreasury();
    revalidatePath("/admin/inventory");
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر تسجيل الدفع.");
  }
}
