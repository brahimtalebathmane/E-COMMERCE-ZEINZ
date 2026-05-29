import { z } from "zod";

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Mauritania local: exactly 8 digits, first digit 2, 3, or 4. */
export const mauritaniaLocalPhoneSchema = z
  .string()
  .transform((raw) => onlyDigits(raw))
  .refine((d) => d.length === 8, "رقم الهاتف يجب أن يكون 8 أرقام")
  .refine(
    (d) => d[0] === "2" || d[0] === "3" || d[0] === "4",
    "رقم الهاتف يجب أن يبدأ بـ 2 أو 3 أو 4",
  );

/**
 * Accepts +222XXXXXXXX, 222XXXXXXXX, or 8-digit local; returns canonical +222XXXXXXXX.
 */
export function canonicalizeMauritaniaPhone(input: string): string {
  const digits = onlyDigits(input);
  let local: string;
  if (digits.length === 8) {
    local = digits;
  } else if (digits.length === 11 && digits.startsWith("222")) {
    local = digits.slice(3);
  } else if (digits.length === 10 && digits.startsWith("22")) {
    local = digits.slice(2);
  } else {
    throw new Error("invalid_phone");
  }
  const parsed = mauritaniaLocalPhoneSchema.safeParse(local);
  if (!parsed.success) {
    throw new Error("invalid_phone");
  }
  return `+222${parsed.data}`;
}

export const createOrderPhoneSchema = z
  .string()
  .min(1, "phone required")
  .transform((raw, ctx) => {
    try {
      return canonicalizeMauritaniaPhone(raw);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "رقم الهاتف غير صالح (8 أرقام تبدأ بـ 2 أو 3 أو 4)",
      });
      return z.NEVER;
    }
  });
