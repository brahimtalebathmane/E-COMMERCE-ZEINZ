import type { FormFieldConfig, FormFieldType } from "@/types";

const VALID_TYPES: FormFieldType[] = ["text", "textarea", "file", "email", "link"];

function isFormFieldType(v: unknown): v is FormFieldType {
  return typeof v === "string" && VALID_TYPES.includes(v as FormFieldType);
}

/**
 * Ensures each stored JSON field has a boolean `required` and valid shape.
 */
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
    const required = o.required === true;
    out.push({ id, label, type, required });
    i += 1;
  }
  return out;
}
