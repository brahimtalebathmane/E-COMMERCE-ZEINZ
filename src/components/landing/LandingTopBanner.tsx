"use client";

/**
 * Full-viewport-width promo strip above the main landing header.
 * Single-line copy; horizontal overflow is clipped with an ellipsis.
 */
export function LandingTopBanner({
  text,
  bleedClassName,
}: {
  text: string;
  /** Break out of a centered column (e.g. ProductLanding `fullBleedStripClass`). */
  bleedClassName: string;
}) {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return null;

  return (
    <div
      className={`${bleedClassName} border-b border-black/15 bg-[#0a4d12] px-4 py-2.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)] sm:px-6 sm:py-3 md:px-8`}
      role="region"
      aria-label="Promotion"
    >
      <p
        dir="auto"
        title={line}
        className="mx-auto w-full min-w-0 max-w-4xl truncate text-center text-sm font-semibold leading-tight tracking-tight text-[#f4fff4] sm:text-[0.95rem] md:text-base"
      >
        {line}
      </p>
    </div>
  );
}
