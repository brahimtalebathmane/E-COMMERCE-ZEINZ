/**
 * Minimal in-memory stand-in for the supabase-js query builder — only the
 * surface the Meta dispatch and dataset-resend paths use. Rows are plain
 * objects; filters mirror PostgREST semantics closely enough for those paths.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/** Composite unique keys, so a duplicate insert fails with 23505 like Postgres. */
const UNIQUE_KEYS: Record<string, string[]> = {
  order_meta_dispatches: ["order_id", "event_type"],
};

function compare(a: unknown, b: unknown): number {
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function parseOrClause(clause: string): Filter {
  const parts = clause.split(",").map((part) => {
    const [column, op, ...rest] = part.split(".");
    const raw = rest.join(".").replace(/^"|"$/g, "");
    return (row: Row) => {
      const value = row[column];
      if (op === "is") return raw === "null" ? value == null : String(value) === raw;
      if (op === "eq") return String(value) === raw;
      if (op === "lt") return value != null && compare(value, raw) < 0;
      if (op === "gt") return value != null && compare(value, raw) > 0;
      throw new Error(`fake-supabase: unsupported or() operator ${op}`);
    };
  });
  return (row) => parts.some((p) => p(row));
}

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private returning = false;
  private head = false;
  private countRequested = false;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private mode: "many" | "maybeSingle" | "single" = "many";

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.head = Boolean(options?.head);
      this.countRequested = Boolean(options?.count);
    } else {
      this.returning = true;
    }
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((row) => (value === null ? row[column] == null : row[column] === value));
    return this;
  }
  not(column: string, op: string, value: unknown) {
    if (op !== "is" || value !== null) throw new Error("fake-supabase: only not(col, 'is', null)");
    this.filters.push((row) => row[column] != null);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push((row) => row[column] != null && compare(row[column], value) >= 0);
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push((row) => row[column] != null && compare(row[column], value) < 0);
    return this;
  }
  or(clause: string) {
    this.filters.push(parseOrClause(clause));
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((row) => this.filters.every((f) => f(row)));
  }

  private shape(rows: Row[]) {
    let out = rows.map((r) => ({ ...r }));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      out.sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    if (this.mode === "many") return { data: out, error: null };
    if (out.length > 1 && this.mode === "maybeSingle") {
      return { data: null, error: { message: "multiple rows", code: "PGRST116" } };
    }
    return { data: out[0] ?? null, error: null };
  }

  private execute() {
    const rows = this.db.rows(this.table);
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const unique = UNIQUE_KEYS[this.table];
      for (const row of list) {
        if (unique && rows.some((r) => unique.every((k) => r[k] === row[k]))) {
          return { data: null, error: { message: "duplicate key", code: "23505" } };
        }
        rows.push({ created_at: new Date().toISOString(), ...row });
      }
      return { data: null, error: null };
    }
    if (this.op === "update") {
      const hits = this.matching();
      for (const row of hits) Object.assign(row, this.payload, { updated_at: new Date().toISOString() });
      return this.returning ? this.shape(hits) : { data: null, error: null };
    }
    if (this.op === "delete") {
      const hits = new Set(this.matching());
      this.db.replace(this.table, rows.filter((r) => !hits.has(r)));
      return { data: null, error: null };
    }
    const hits = this.matching();
    if (this.head) return { data: null, error: null, count: hits.length };
    const shaped = this.shape(hits);
    return this.countRequested ? { ...shaped, count: hits.length } : shaped;
  }

  then<TResult1, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }
}

export class FakeDb {
  private tables = new Map<string, Row[]>();

  rows(table: string): Row[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  replace(table: string, rows: Row[]) {
    this.tables.set(table, rows);
  }

  seed(table: string, rows: Row[]) {
    this.rows(table).push(...rows.map((r) => ({ ...r })));
  }

  find(table: string, id: string): Row | undefined {
    return this.rows(table).find((r) => r.id === id);
  }

  client(): SupabaseClient {
    return { from: (table: string) => new Query(this, table) } as unknown as SupabaseClient;
  }
}
