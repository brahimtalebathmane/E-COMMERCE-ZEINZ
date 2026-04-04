import type { FormFieldConfig, FormFieldType } from "@/types";

const VALID_TYPES: FormFieldType[] = ["text", "textarea", "file", "email", "link"];

function isFormFieldType(v: unknown): v is FormFieldType {
  return typeof v === "string" && VALID_TYPES.includes(v as FormFieldType);
}

/** Parses admin / DB JSON: supports `required`, string booleans, and legacy `optional`. */
function parseRequiredFlag(o: Record<string, unknown>): boolean {
  if (typeof o.required === "boolean") return o.required;
  if (o.required === "true") return true;
  if (o.required === "false") return false;
  if (typeof o.optional === "boolean") return !o.optional;
  if (o.optional === "true") return false;
  if (o.optional === "false") return true;
  return false;
}

function isNonEmptyFieldValue(
  type: FormFieldType,
  v: unknown,
): boolean {
  if (v === undefined || v === null) return false;
  if (type === "file") {
    return typeof v === "string" && v.trim().length > 0;
  }
  return String(v).trim().length > 0;
}

/**
 * Ensures each stored JSON field has a boolean `required` and valid shape.
 */
/** Keeps French field rows aligned with Arabic (same ids, types, required). */
export function alignFormFieldsFr(
  ar: FormFieldConfig[],
  frPrev: FormFieldConfig[],
): FormFieldConfig[] {
  const frById = new Map(frPrev.map((f) => [f.id, f]));
  return ar.map((a) => {
    const existing = frById.get(a.id);
    return {
      ...a,
      label: existing?.label ?? "",
    };
  });
}

export function normalizeFormFields(raw: unknown): FormFieldConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: FormFieldConfig[] = [];
  let i = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id =
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim()
        : `field-${i}`;
    const label = typeof o.label === "string" ? o.label : "";
    const type = isFormFieldType(o.type) ? o.type : "text";
    const required = parseRequiredFlag(o);
    out.push({ id, label, type, required });
    i += 1;
  }
  return out;
}

/**
 * Server-side check that all required post-payment fields have values in `form_data`
 * (field ids as keys). Used when confirming an order.
 */
export function validatePostPaymentFormCompletion(
  rawFields: unknown,
  formData: Record<string, unknown>,
): string | null {
  const fields = normalizeFormFields(rawFields);
  for (const f of fields) {
    if (!f.required) continue;
    if (!isNonEmptyFieldValue(f.type, formData[f.id])) {
      return "Post-payment form incomplete";
    }
  }
  return null;
}
