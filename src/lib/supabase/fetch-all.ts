import "server-only";

/**
 * PostgREST caps a response at `db-max-rows` (1000 by default) and gives no
 * signal that it truncated. Anything that must be COMPLETE to be correct —
 * every row feeding a profit total — has to be read in explicit ranges.
 */
const PAGE_SIZE = 1000;
/** Refuse to spin forever if a query somehow never terminates. */
const MAX_PAGES = 100;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Minimal shape a Supabase query builder must support for paginated reads. */
type OrderedQuery<T> = {
  order: (column: string, opts: { ascending: boolean }) => OrderedQuery<T>;
  range: (from: number, to: number) => PageResult<T>;
};

type RangeableQuery<T> = {
  order: (column: string, opts: { ascending: boolean }) => OrderedQuery<T>;
};

/**
 * Reads every row of `build()` in pages of PAGE_SIZE.
 *
 * `orderColumns` must identify a row UNIQUELY (a primary key, or a column
 * list that forms one). Paging is by offset, and Postgres doesn't keep ties in
 * the same order from one page query to the next — ordering by a non-unique
 * column alone (e.g. `date` on a per-product, per-day table) can return a row
 * on two pages or on none, double-counting or dropping it from a total.
 */
export async function fetchAllRows<T>(
  build: () => RangeableQuery<T>,
  orderColumns: string | readonly [string, ...string[]],
): Promise<{ rows: T[]; error: string | null; truncated: boolean }> {
  const columns: readonly string[] = typeof orderColumns === "string" ? [orderColumns] : orderColumns;
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    let query = build().order(columns[0], { ascending: true });
    for (const column of columns.slice(1)) {
      query = query.order(column, { ascending: true });
    }
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message, truncated: false };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, error: null, truncated: false };
  }
  return { rows, error: null, truncated: true };
}
