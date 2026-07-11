import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function AdminEmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--admin-border)] bg-white/[0.03] text-2xl text-[var(--muted)]"
        aria-hidden
      >
        ◌
      </div>
      <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
