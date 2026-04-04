function formatFormFieldValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    return String(v);
  }
  if (Array.isArray(v)) {
    return v.map((x) => formatFormFieldValue(x)).join(" · ");
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${formatFormFieldValue(val)}`)
      .join(" · ");
  }
  return String(v);
}

export function OrderFormDataDisplay({
  fd,
  emptyLabel,
}: {
  fd: Record<string, unknown>;
  emptyLabel: string;
}) {
  const user = Object.entries(fd).filter(([k]) => !k.startsWith("_"));
  const system = Object.entries(fd).filter(([k]) => k.startsWith("_"));
  if (user.length === 0 && system.length === 0) {
    return <span className="text-[var(--muted)]">{emptyLabel}</span>;
  }
  return (
    <div className="space-y-3 text-start text-sm">
      {user.length > 0 ? (
        <ul className="space-y-2">
          {user.map(([k, v]) => (
            <li key={k} className="break-words">
              <span className="font-semibold text-[var(--foreground)]">{k}</span>
              <span className="mx-1 text-[var(--muted)]">:</span>
              <span className="text-[var(--muted)]">{formatFormFieldValue(v)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {system.length > 0 ? (
        <ul className="space-y-1.5 border-t border-[var(--accent-muted)]/40 pt-3 text-xs text-[var(--muted)]">
          {system.map(([k, v]) => (
            <li key={k} className="break-all">
              <span className="font-mono" dir="ltr">
                {k}
              </span>{" "}
              <span dir="auto">{formatFormFieldValue(v)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
