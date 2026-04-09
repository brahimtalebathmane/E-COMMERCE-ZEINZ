import ar from "@/locales/ar.json";
import fr from "@/locales/fr.json";

export type Locale = "ar" | "fr";

export const LOCALES: Locale[] = ["ar", "fr"];

export const LOCALE_STORAGE_KEY = "zeinz-locale";

const messages: Record<Locale, Record<string, unknown>> = {
  ar: ar as Record<string, unknown>,
  fr: fr as Record<string, unknown>,
};

function getNested(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Dot path e.g. "catalog.title" */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const path = key.split(".");
  const raw = getNested(messages[locale], path);
  let s = typeof raw === "string" ? raw : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
  }
  return s;
}

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}

/** Map common API error strings to i18n keys under errors.* */
export function mapApiErrorToKey(error: string): string | null {
  const normalized = error.trim();
  const map: Record<string, string> = {
    "Invalid JSON": "errors.invalidJson",
    "token required": "errors.tokenRequired",
    NotFound: "errors.notFound",
    "completion_token required": "errors.completionTokenRequired",
    "Product not found": "errors.productNotFound",
    "Invalid order": "errors.invalidOrder",
    Unauthorized: "errors.unauthorized",
    Forbidden: "errors.forbidden",
    "path required": "errors.pathRequired",
    Failed: "errors.failed",
    "file, order_id, completion_token, and field_id required":
      "errors.fileOrderTokenFieldRequired",
    "file, order_id, and completion_token required":
      "errors.fileOrderTokenRequired",
  };
  if (map[normalized]) return map[normalized];
  if (normalized.startsWith("Update failed") || normalized === "Update failed")
    return "errors.updateFailed";
  if (normalized.startsWith("Create failed") || normalized === "Create failed")
    return "errors.createFailed";
  const extra: Record<string, string> = {
    "Could not save order": "errors.couldNotSaveOrder",
    "Invalid server response": "errors.invalidServerResponse",
  };
  if (extra[normalized]) return extra[normalized];
  if (
    normalized.includes("NEXT_PUBLIC_SUPABASE_URL") ||
    normalized.includes("SUPABASE_SERVICE_ROLE_KEY")
  ) {
    return "errors.supabaseEnvMissing";
  }
  return null;
}
