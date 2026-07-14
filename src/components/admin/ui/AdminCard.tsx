import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  noPadding?: boolean;
};

export function AdminCard({
  children,
  className = "",
  title,
  action,
  noPadding,
}: Props) {
  if (title) {
    return (
      <section className={`admin-card overflow-hidden ${className}`}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3.5 sm:px-5">
          <h2 className="admin-section-title">{title}</h2>
          {action}
        </div>
        <div className={noPadding ? "" : "p-4 sm:p-5"}>{children}</div>
      </section>
    );
  }
  return (
    <section className={`admin-card ${noPadding ? "" : "p-4 sm:p-5"} ${className}`}>
      {children}
    </section>
  );
}
