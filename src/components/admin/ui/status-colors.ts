import type { OrderStatus } from "@/types";
import type { ProductTestingStatus } from "@/types";

/** Semantic hue tokens — shared across badges, KPI accents, and metric pills. */
export type StatusHue =
  | "amber"
  | "emerald"
  | "sky"
  | "red"
  | "violet"
  | "slate"
  | "neutral";

// Token-driven so badges read correctly in light and dark mode (globals.css, --hue-*).
// Class names are written out in full: Tailwind only generates classes it can see.
export const STATUS_HUE_CLASSES: Record<
  StatusHue,
  { dot: string; pill: string }
> = {
  amber: {
    dot: "bg-[var(--hue-amber-dot)]",
    pill: "border-transparent bg-[var(--hue-amber-bg)] text-[var(--hue-amber-fg)]",
  },
  emerald: {
    dot: "bg-[var(--hue-emerald-dot)]",
    pill: "border-transparent bg-[var(--hue-emerald-bg)] text-[var(--hue-emerald-fg)]",
  },
  sky: {
    dot: "bg-[var(--hue-sky-dot)]",
    pill: "border-transparent bg-[var(--hue-sky-bg)] text-[var(--hue-sky-fg)]",
  },
  red: {
    dot: "bg-[var(--hue-red-dot)]",
    pill: "border-transparent bg-[var(--hue-red-bg)] text-[var(--hue-red-fg)]",
  },
  violet: {
    dot: "bg-[var(--hue-violet-dot)]",
    pill: "border-transparent bg-[var(--hue-violet-bg)] text-[var(--hue-violet-fg)]",
  },
  slate: {
    dot: "bg-[var(--hue-slate-dot)]",
    pill: "border-transparent bg-[var(--hue-slate-bg)] text-[var(--hue-slate-fg)]",
  },
  neutral: {
    dot: "bg-[var(--muted)]",
    pill: "border-transparent bg-[var(--fill)] text-[var(--foreground)]",
  },
};

export function orderStatusHue(status: OrderStatus): StatusHue {
  switch (status) {
    case "pending":
      return "amber";
    case "confirmed":
      return "sky";
    case "shipped":
      return "emerald";
    case "cancelled":
      return "slate";
    case "requires_human_intervention":
      return "red";
    case "internal_return":
      return "violet";
    default:
      return "neutral";
  }
}

export function productPipelineHue(status: ProductTestingStatus): StatusHue {
  switch (status) {
    case "under_research":
      return "slate";
    case "ready_for_test":
    case "testing":
      return "amber";
    case "winner":
      return "emerald";
    case "failed":
      return "red";
    default:
      return "neutral";
  }
}

export function metaEventHue(state: string): StatusHue {
  if (state === "success") return "emerald";
  if (state === "failed") return "red";
  return "amber";
}

export const KPI_ACCENT: Record<string, string> = {
  revenue: "var(--status-emerald)",
  profit: "var(--accent)",
  orders: "var(--status-sky)",
  today: "var(--status-violet)",
  pending: "var(--status-amber)",
  products: "var(--status-pink)",
};
