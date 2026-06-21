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
      className={`${bleedClassName} border-b border-black/20 px-4 py-2.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)] sm:px-6 sm:py-3 md:px-8`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, #073a0d 0%, #0a4d12 45%, #0d5c16 100%)",
      }}
      role="region"
      aria-label="Promotion"
    >
      <div className="mx-auto flex w-full min-w-0 max-w-4xl items-center justify-center gap-2">
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 shrink-0 text-[#bff5c4] sm:h-4 sm:w-4"
          fill="currentColor"
          aria-hidden
        >
          <path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z" />
        </svg>
        <p
          dir="auto"
          title={line}
          className="min-w-0 truncate text-center text-sm font-semibold leading-tight tracking-tight text-[#f4fff4] sm:text-[0.95rem] md:text-base"
        >
          {line}
        </p>
      </div>
    </div>
  );
}
