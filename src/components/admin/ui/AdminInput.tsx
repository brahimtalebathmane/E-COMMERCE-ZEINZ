import type { ComponentProps } from "react";

type Props = ComponentProps<"input"> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function AdminInput({ label, hint, error, className = "", id, ...props }: Props) {
  const inputId = id ?? (label ? label.replace(/\s/g, "-") : undefined);
  return (
    <label className="block space-y-1.5">
      {label ? (
        <span className="text-xs font-semibold text-[var(--foreground)]">{label}</span>
      ) : null}
      <input
        id={inputId}
        className={`admin-input ${error ? "border-red-400/50 focus:border-red-400 focus:ring-red-400/30" : ""} ${className}`}
        {...props}
      />
      {error ? (
        <span className="block text-xs text-red-400">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-[var(--muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

type SelectProps = ComponentProps<"select"> & {
  label?: string;
  hint?: string;
};

export function AdminSelect({ label, hint, className = "", id, children, ...props }: SelectProps) {
  const selectId = id ?? (label ? label.replace(/\s/g, "-") : undefined);
  return (
    <label className="block space-y-1.5">
      {label ? (
        <span className="text-xs font-semibold text-[var(--foreground)]">{label}</span>
      ) : null}
      <select id={selectId} className={`admin-input ${className}`} {...props}>
        {children}
      </select>
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

type TextareaProps = ComponentProps<"textarea"> & {
  label?: string;
  hint?: string;
};

export function AdminTextarea({ label, hint, className = "", id, ...props }: TextareaProps) {
  const textareaId = id ?? (label ? label.replace(/\s/g, "-") : undefined);
  return (
    <label className="block space-y-1.5">
      {label ? (
        <span className="text-xs font-semibold text-[var(--foreground)]">{label}</span>
      ) : null}
      <textarea
        id={textareaId}
        className={`admin-input min-h-[88px] resize-y py-3 ${className}`}
        {...props}
      />
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}
