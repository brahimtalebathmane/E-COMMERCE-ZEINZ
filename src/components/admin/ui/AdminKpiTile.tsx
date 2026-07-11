type Props = {
  label: string;
  value: string;
  accent?: string;
  emphasize?: boolean;
  hint?: string;
};

export function AdminKpiTile({ label, value, accent, emphasize, hint }: Props) {
  const valueClass = emphasize
    ? value.trim().startsWith("-")
      ? "text-red-400"
      : "text-emerald-400"
    : "text-[var(--foreground)]";

  return (
    <div className="admin-kpi-tile">
      {accent ? (
        <span
          className="admin-kpi-tile-accent"
          style={{ background: accent }}
          aria-hidden
        />
      ) : null}
      <p className="admin-kpi-label">{label}</p>
      <p className={`admin-kpi-value ${valueClass}`} dir="ltr">
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}
