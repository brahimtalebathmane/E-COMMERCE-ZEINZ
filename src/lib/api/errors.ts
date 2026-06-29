import { NextResponse } from "next/server";

/** Generic user-facing error (Arabic) — never expose raw DB/stack details. */
export const GENERIC_API_ERROR_AR =
  "عذراً، حدث خطأ غير متوقع، يرجى المحاولة لاحقاً";

export const FORBIDDEN_RESPONSE = NextResponse.json(
  { error: "Forbidden" },
  { status: 403 },
);

export function apiErrorResponse(
  error: unknown,
  logContext: string,
  status = 500,
): NextResponse {
  console.error(logContext, error);
  return NextResponse.json({ error: GENERIC_API_ERROR_AR }, { status });
}

export function apiValidationError(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function apiRateLimitError(retryAfterSec?: number): NextResponse {
  const headers: HeadersInit = {};
  if (retryAfterSec != null && retryAfterSec > 0) {
    headers["Retry-After"] = String(Math.ceil(retryAfterSec));
  }
  return NextResponse.json(
    {
      error:
        "تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة بعد قليل.",
    },
    { status: 429, headers },
  );
}

export function apiConflictError(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}
