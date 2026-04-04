/** Mauritania country calling code (digits only, no +). */
export const MR_E164_CC = "222";

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Converts admin input (national part after +222, or full international digits) to stored E.164 digits.
 * Returns null when empty or incomplete — callers fall back to site env WhatsApp.
 */
export function mauritaniaWhatsappInputToE164Digits(input: string): string | null {
  const raw = digitsOnly(input);
  if (!raw) return null;

  if (raw.startsWith(MR_E164_CC)) {
    const sub = raw.slice(MR_E164_CC.length).replace(/^0+/, "");
    return sub.length > 0 ? `${MR_E164_CC}${sub}` : null;
  }

  const sub = raw.replace(/^0+/, "");
  if (!sub.length) return null;
  return `${MR_E164_CC}${sub}`;
}

/** Inverse for the product form: show national digits after +222. */
export function e164DigitsToMauritaniaLocalInput(stored: string | null | undefined): string {
  if (!stored) return "";
  const d = digitsOnly(stored);
  if (d.startsWith(MR_E164_CC)) return d.slice(MR_E164_CC.length);
  return d;
}
