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

export const STATUS_HUE_CLASSES: Record<
  StatusHue,
  { dot: string; pill: string }
> = {
  amber: {
    dot: "bg-amber-400",
    pill: "border-amber-400/35 bg-amber-400/12 text-amber-200",
  },
  emerald: {
    dot: "bg-emerald-400",
    pill: "border-emerald-400/35 bg-emerald-400/12 text-emerald-200",
  },
  sky: {
    dot: "bg-sky-400",
    pill: "border-sky-400/35 bg-sky-400/12 text-sky-200",
  },
  red: {
    dot: "bg-red-400",
    pill: "border-red-400/35 bg-red-400/12 text-red-200",
  },
  violet: {
    dot: "bg-violet-400",
    pill: "border-violet-400/35 bg-violet-400/12 text-violet-200",
  },
  slate: {
    dot: "bg-slate-400",
    pill: "border-slate-400/35 bg-slate-400/12 text-slate-200",
  },
  neutral: {
    dot: "bg-[var(--muted)]",
    pill: "border-[var(--admin-border-strong)] bg-white/[0.05] text-[var(--foreground)]",
  },
};

export function orderStatusHue(status: OrderStatus): StatusHue {
  switch (status) {
    case "pending":
      return "amber";
    case "confirmed":
      return "emerald";
    case "shipped":
      return "sky";
    case "cancelled":
      return "red";
    case "requires_human_intervention":
      return "violet";
    case "internal_return":
      return "slate";
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
