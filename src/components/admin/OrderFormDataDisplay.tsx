"use client";

import { useCallback, useState } from "react";
import type { FormFieldConfig, FormFieldType } from "@/types";
import { ReceiptThumbnail } from "@/app/admin/(dashboard)/orders/ReceiptThumbnail";
import { adminAr as a } from "@/locales/admin-ar";

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function stringifyFormValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (Array.isArray(v)) {
    return v.map((x) => stringifyFormValue(x)).join(" · ");
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${stringifyFormValue(val)}`)
      .join(" · ");
  }
  return String(v);
}

function toAbsoluteHref(s: string): string {
  const t = s.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

type Entry = {
  id: string;
  label: string;
  type: FormFieldType;
  raw: unknown;
};

/** Dynamic post-payment fields only (excludes internal keys like `_purchase_confirmed_at`). */
function buildEntries(
  formData: Record<string, unknown>,
  definitions: FormFieldConfig[],
): Entry[] {
  const defById = new Map(definitions.map((f) => [f.id, f]));
  const keys = Object.keys(formData).filter((k) => !k.startsWith("_"));
  const ordered: string[] = [];
  for (const f of definitions) {
    if (keys.includes(f.id)) ordered.push(f.id);
  }
  for (const k of [...keys].sort()) {
    if (!ordered.includes(k)) ordered.push(k);
  }
  return ordered.map((id) => {
    const def = defById.get(id);
    return {
      id,
      label: def?.label?.trim() ? def.label.trim() : id,
      type: def?.type ?? "text",
      raw: formData[id],
    };
  });
}

function CopyValueButton({
  text,
  disabled,
}: {
  text: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (disabled) return;
    try {
      await copyTextToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [disabled, text]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onCopy()}
      className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-lg border border-[var(--accent-muted)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--accent-muted)]/25 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {copied ? a.orders.formFieldCopied : a.orders.formFieldCopy}
    </button>
  );
}

function NonFileValue({ entry }: { entry: Entry }) {
  const str = stringifyFormValue(entry.raw);

  if (entry.type === "link" && str.trim()) {
    const href = toAbsoluteHref(str);
    return (
      <div className="space-y-2">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground)]">
          {str}
        </p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-sm font-medium text-[var(--accent)] underline underline-offset-2"
          >
            {a.orders.formFieldOpenLink}
          </a>
        ) : null}
      </div>
    );
  }

  if (entry.type === "email" && str.trim()) {
    return (
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground)]">
        <a
          href={`mailto:${encodeURIComponent(str.trim())}`}
          className="text-[var(--accent)] underline underline-offset-2"
        >
          {str}
        </a>
      </p>
    );
  }

  if (entry.type === "textarea") {
    return (
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground)]">
        {str || "—"}
      </p>
    );
  }

  return (
    <p className="break-words text-sm leading-relaxed text-[var(--foreground)]">{str || "—"}</p>
  );
}

export function OrderFormDataDisplay({
  formData,
  fieldDefinitions,
  emptyLabel,
}: {
  formData: Record<string, unknown>;
  fieldDefinitions: FormFieldConfig[];
  emptyLabel: string;
}) {
  const entries = buildEntries(formData, fieldDefinitions);

  if (entries.length === 0) {
    return <span className="text-[var(--muted)]">{emptyLabel}</span>;
  }

  return (
    <div className="space-y-4 text-start">
      {entries.map((entry) => {
        const displayStr = stringifyFormValue(entry.raw);
        const rawStr = typeof entry.raw === "string" ? entry.raw.trim() : "";
        const isStoredFormFilePath = rawStr.length > 0 && rawStr.startsWith("form-files/");
        const isFile =
          rawStr.length > 0 &&
          (entry.type === "file" || isStoredFormFilePath);
        const path = isFile ? rawStr : "";
        const copyStr = isFile ? path : displayStr;
        const copyDisabled = copyStr.length === 0;

        return (
          <div
            key={entry.id}
            className="rounded-xl border border-[var(--accent-muted)]/60 bg-[var(--background)] p-4 shadow-sm sm:p-5"
          >
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {entry.label}
            </h4>

            {isFile ? (
              <div className="mt-3 space-y-3">
                <div className="overflow-hidden rounded-xl border border-[var(--accent-muted)] bg-[var(--card)]/40">
                  <ReceiptThumbnail
                    storagePath={path}
                    variant="full"
                    className="!max-h-[min(40vh,360px)] !rounded-xl"
                  />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <p
                    className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-[var(--muted)]"
                    dir="ltr"
                  >
                    {path}
                  </p>
                  <CopyValueButton text={copyStr} disabled={copyDisabled} />
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <NonFileValue entry={entry} />
                </div>
                <div className="flex shrink-0 justify-end sm:pt-0.5">
                  <CopyValueButton text={copyStr} disabled={copyDisabled} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
