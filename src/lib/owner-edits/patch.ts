/**
 * Owner edits (migration 076): the shapes the edit screens send, their
 * validation, and the "old → new" lines the confirmation shows. Pure — used
 * by the client forms and re-checked by the server actions.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TRANSACTION_KINDS = ["normal", "opening", "transfer", "reversal", "adjustment", "settlement"] as const;
export const MOVEMENT_TYPES = ["opening", "purchase", "sale_out", "return_in", "adjustment", "damage"] as const;

/** Only the fields that changed. `amount` is the size; the category gives the sign. */
export type TransactionPatch = Partial<{
  amount: number;
  occurred_on: string;
  account_id: string;
  category_id: string;
  party_id: string | null;
  note: string | null;
  receipt_path: string | null;
  kind: (typeof TRANSACTION_KINDS)[number];
  order_id: string | null;
  order_role: "sale" | "delivery_fee" | null;
}>;

export type MovementPatch = Partial<{
  product_id: string;
  quantity: number;
  type: (typeof MOVEMENT_TYPES)[number];
  unit_cost: number | null;
  date: string;
  note: string | null;
}>;

type Clean<T> = { ok: true; patch: T } | { ok: false; error: string };

const isUuid = (v: unknown) => typeof v === "string" && UUID_RE.test(v);
const nullableUuid = (v: unknown) => v === null || isUuid(v);

export function sanitizeTransactionPatch(input: TransactionPatch): Clean<TransactionPatch> {
  const out: TransactionPatch = {};
  const p = input ?? {};
  if ("amount" in p) {
    if (typeof p.amount !== "number" || !Number.isFinite(p.amount) || p.amount === 0) {
      return { ok: false, error: "المبلغ لا يمكن أن يكون 0 — احذف العملية بدلاً من ذلك." };
    }
    out.amount = Math.round(p.amount * 100) / 100;
  }
  if ("occurred_on" in p) {
    if (typeof p.occurred_on !== "string" || !DATE_RE.test(p.occurred_on)) return { ok: false, error: "التاريخ غير صالح." };
    out.occurred_on = p.occurred_on;
  }
  for (const key of ["account_id", "category_id"] as const) {
    if (key in p) {
      if (!isUuid(p[key])) return { ok: false, error: "اختيار غير صالح." };
      out[key] = p[key];
    }
  }
  for (const key of ["party_id", "order_id"] as const) {
    if (key in p) {
      if (!nullableUuid(p[key])) return { ok: false, error: key === "order_id" ? "رقم الطلب غير صالح." : "اختيار غير صالح." };
      out[key] = p[key] ?? null;
    }
  }
  for (const key of ["note", "receipt_path"] as const) {
    if (key in p) out[key] = typeof p[key] === "string" ? (p[key] as string).trim() || null : null;
  }
  if ("kind" in p) {
    if (!TRANSACTION_KINDS.includes(p.kind as never)) return { ok: false, error: "نوع غير صالح." };
    out.kind = p.kind;
  }
  if ("order_role" in p) {
    if (p.order_role !== null && p.order_role !== "sale" && p.order_role !== "delivery_fee") {
      return { ok: false, error: "نوع غير صالح." };
    }
    out.order_role = p.order_role;
  }
  return { ok: true, patch: out };
}

export function sanitizeMovementPatch(input: MovementPatch): Clean<MovementPatch> {
  const out: MovementPatch = {};
  const p = input ?? {};
  if ("product_id" in p) {
    if (!isUuid(p.product_id)) return { ok: false, error: "اختيار غير صالح." };
    out.product_id = p.product_id;
  }
  if ("quantity" in p) {
    if (!Number.isInteger(p.quantity) || p.quantity === 0) {
      return { ok: false, error: "الكمية عدد صحيح غير 0 — احذف الحركة بدلاً من ذلك." };
    }
    out.quantity = p.quantity;
  }
  if ("type" in p) {
    if (!MOVEMENT_TYPES.includes(p.type as never)) return { ok: false, error: "نوع غير صالح." };
    out.type = p.type;
  }
  if ("unit_cost" in p) {
    if (p.unit_cost !== null && (typeof p.unit_cost !== "number" || !Number.isFinite(p.unit_cost) || p.unit_cost < 0)) {
      return { ok: false, error: "التكلفة لا يمكن أن تكون سالبة." };
    }
    out.unit_cost = p.unit_cost ?? null;
  }
  if ("date" in p) {
    if (typeof p.date !== "string" || !DATE_RE.test(p.date)) return { ok: false, error: "التاريخ غير صالح." };
    out.date = p.date;
  }
  if ("note" in p) out.note = typeof p.note === "string" ? p.note.trim() || null : null;
  return { ok: true, patch: out };
}

/**
 * Keeps only the fields whose value really changed, comparing the form's
 * values with the record's. Empty strings count as "no value".
 */
export function diffFields<T extends Record<string, unknown>>(before: T, after: T): Partial<T> {
  const norm = (v: unknown) => (v === "" || v === undefined ? null : v);
  const out: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (norm(before[key]) !== norm(after[key])) out[key] = after[key];
  }
  return out;
}

export type ChangeLine = { label: string; from: string; to: string };

/**
 * The confirmation's "old → new" lines. `labels` names each field and
 * `format` turns ids and numbers into what the owner reads (account names…).
 */
export function describeChanges<T extends Record<string, unknown>>(
  before: T,
  changes: Partial<T>,
  labels: Partial<Record<keyof T, string>>,
  format: (key: keyof T, value: unknown) => string = (_k, v) => (v == null || v === "" ? "—" : String(v)),
): ChangeLine[] {
  return (Object.keys(changes) as (keyof T)[]).map((key) => ({
    label: labels[key] ?? String(key),
    from: format(key, before[key]),
    to: format(key, changes[key]),
  }));
}

/** Bookkeeping columns the audit screen does not list as "changes". */
const AUDIT_NOISE = new Set(["edited_at", "edited_by", "deleted_by", "created_by", "owner_edited", "updated_at"]);

/**
 * Field-by-field changes of one audit-log row (old row → new row). For an
 * insert, every meaningful field of the new row is listed with "—" before.
 */
export function auditChanges(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): { key: string; from: string; to: string }[] {
  const show = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const keys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]);
  const out: { key: string; from: string; to: string }[] = [];
  for (const key of keys) {
    if (AUDIT_NOISE.has(key) || key === "id") continue;
    const from = show(oldData?.[key]);
    const to = show(newData?.[key]);
    if (from !== to) out.push({ key, from, to });
  }
  return out;
}
