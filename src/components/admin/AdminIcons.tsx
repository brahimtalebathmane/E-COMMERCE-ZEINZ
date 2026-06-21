import type { SVGProps } from "react";

/**
 * Lightweight, unified line-icon set for the admin shell.
 * Stroke-based (currentColor) so a single component scales and recolors via
 * Tailwind text utilities — no icon-library dependency, zero runtime cost.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 22, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </Base>
  );
}

export function ProductsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M21 7.5 12 12 3 7.5 12 3l9 4.5Z" />
      <path d="M3 7.5v9L12 21l9-4.5v-9" />
      <path d="M12 12v9" />
    </Base>
  );
}

export function OrdersIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 4h2l1.4 9.5a1.5 1.5 0 0 0 1.5 1.3h6.7a1.5 1.5 0 0 0 1.5-1.2L20 7H7" />
      <circle cx="10" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </Base>
  );
}

export function AnalyticsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 17v-5" />
      <path d="M13 17V8" />
      <path d="M18 17v-7" />
    </Base>
  );
}

export function StoreIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 9 5.2 4.5A1 1 0 0 1 6.2 4h11.6a1 1 0 0 1 1 .5L20 9" />
      <path d="M4 9v0a2.4 2.4 0 0 0 4 1.8 2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0A2.4 2.4 0 0 0 20 9" />
      <path d="M5.5 11.5V20h13v-8.5" />
      <path d="M10 20v-4.5h4V20" />
    </Base>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h12" />
    </Base>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </Base>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </Base>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Base>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Base>
  );
}
