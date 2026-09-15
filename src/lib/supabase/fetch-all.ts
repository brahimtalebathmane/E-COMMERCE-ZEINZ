import "server-only";

/**
 * PostgREST caps a response at `db-max-rows` (1000 by default) and gives no
 * signal that it truncated. Anything that must be COMPLETE to be correct —
 * every row feeding a profit total — has to be read in explicit ranges.
 */
const PAGE_SIZE = 1000;
/** Refuse to spin forever if a query somehow never terminates. */
const MAX_PAGES = 100;

/** Minimal shape a Supabase query builder must support for paginated reads. */
type RangeableQuery<T> = {
  order: (column: string, opts: { ascending: boolean }) => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  };
};

export async function fetchAllRows<T>(
  build: () => RangeableQuery<T>,
  orderColumn: string,
): Promise<{ rows: T[]; error: string | null; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build()
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message, truncated: false };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, error: null, truncated: false };
  }
  return { rows, error: null, truncated: true };
}
