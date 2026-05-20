"use client";

import { useState, useTransition } from "react";
import { saveAiAgentRulesAction } from "@/app/admin/(dashboard)/products/ai-agent-actions";
import { adminAr as a } from "@/locales/admin-ar";
import { toast } from "sonner";

type Props = {
  productId: string;
  productName: string;
  initialInstruction: string;
  initialActive: boolean;
};

export function AiAgentManager({
  productId,
  productName,
  initialInstruction,
  initialActive,
}: Props) {
  const [instruction, setInstruction] = useState(initialInstruction);
  const [isActive, setIsActive] = useState(initialActive);
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      try {
        await saveAiAgentRulesAction(productId, instruction, isActive);
        toast.success(a.aiAgent.saveSuccess);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : a.aiAgent.saveFailed);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
        <p className="text-sm font-semibold">{productName}</p>
        <p className="mt-2 text-sm text-[var(--muted)]">{a.aiAgent.intro}</p>
      </div>

      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--accent-muted)]"
        />
        <span>{a.aiAgent.activeLabel}</span>
      </label>

      <div>
        <label className="text-sm font-semibold" htmlFor="ai-system-instruction">
          {a.aiAgent.rulesLabel}
        </label>
        <p className="mt-1 text-xs text-[var(--muted)]">{a.aiAgent.rulesHint}</p>
        <textarea
          id="ai-system-instruction"
          dir="rtl"
          rows={14}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={a.aiAgent.rulesPlaceholder}
          className="mt-3 w-full rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] px-4 py-3 text-sm leading-relaxed"
        />
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
        <p className="font-semibold">{a.aiAgent.exampleTitle}</p>
        <p className="mt-2 text-xs leading-relaxed opacity-90">{a.aiAgent.exampleBody}</p>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => onSave()}
        className="min-h-[44px] rounded-xl bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? a.aiAgent.saving : a.aiAgent.save}
      </button>
    </div>
  );
}
