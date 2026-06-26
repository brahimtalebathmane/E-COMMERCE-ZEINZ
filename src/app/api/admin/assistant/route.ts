import { NextResponse } from "next/server";
import { z } from "zod";
import { assertOwnerUser, AuthError } from "@/lib/auth/admin";
import { apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/service";
import { runAdminAssistant } from "@/lib/admin-assistant/run";

export const maxDuration = 120;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  threadId: z.string().trim().max(200).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    await assertOwnerUser();

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiValidationError("Invalid JSON");
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiValidationError("A non-empty message is required.");
    }

    const supabase = createServiceClient();

    const result = await runAdminAssistant({
      ctx: { supabase, requestHeaders: request.headers },
      userText: parsed.data.message,
      threadId: parsed.data.threadId ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 502 });
    }

    return NextResponse.json({
      reply: result.reply,
      threadId: result.threadId,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return apiErrorResponse(error, "[POST /api/admin/assistant]");
  }
}
