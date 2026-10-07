/** Admin date formatting in the business timezone (Africa/Nouakchott, UTC+0). */

const DATE_TIME = new Intl.DateTimeFormat("ar", {
  timeZone: "Africa/Nouakchott",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat("ar", {
  timeZone: "Africa/Nouakchott",
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Nouakchott",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDateTimeAr(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME.format(d);
}

export function formatDateAr(value: string | Date | null | undefined): string {
  if (!value) return "—";
  // A bare YYYY-MM-DD is a calendar date, not an instant: read it as noon UTC
  // so no timezone can move it to the previous day.
  const d =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00Z`)
        : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATE_ONLY.format(d);
}

/** Today's calendar date (YYYY-MM-DD) in Nouakchott. */
export function todayKeyNouakchott(): string {
  return DAY_KEY.format(new Date());
}
