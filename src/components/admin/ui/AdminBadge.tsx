import type { ReactNode } from "react";
import {
  STATUS_HUE_CLASSES,
  type StatusHue,
} from "./status-colors";

type Props = {
  children: ReactNode;
  hue?: StatusHue;
  size?: "sm" | "md";
  className?: string;
  /** Hide dot for compact inline use */
  dot?: boolean;
};

export function AdminBadge({
  children,
  hue = "neutral",
  size = "md",
  className = "",
  dot = true,
}: Props) {
  const colors = STATUS_HUE_CLASSES[hue];
  const sizeClass =
    size === "sm"
      ? "gap-1 px-2 py-0.5 text-[10px]"
      : "gap-1.5 px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border font-semibold ${sizeClass} ${colors.pill} ${className}`}
    >
      {dot ? (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors.dot}`}
          aria-hidden
        />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
