import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger" | "sm-ghost";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "admin-btn-primary",
  ghost: "admin-btn-ghost",
  danger:
    "admin-btn-ghost !border-red-500/30 !text-red-300 hover:!bg-red-500/10 hover:!text-red-200",
  "sm-ghost":
    "inline-flex min-h-[44px] touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-[var(--admin-border-strong)] bg-white/[0.02] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  children: ReactNode;
};

export function AdminButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: Variant;
  children: ReactNode;
};

export function AdminLinkButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link className={`${VARIANT_CLASS[variant]} ${className}`} {...props}>
      {children}
    </Link>
  );
}
