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
