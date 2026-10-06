/**
 * Phase A (country scoping): the local-operations gate, the country-scope
 * guards, the new permissions, and paginated reads that can't drop or repeat
 * rows across pages.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { hasLocalOperations } from "../src/lib/local-operations.ts";
import { assertInCountryScope } from "../src/lib/auth/country-scope.ts";
import { AuthError } from "../src/lib/auth/admin.ts";
import {
  ALL_PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSIONS,
  canAccessRoute,
  parsePermissions,
} from "../src/lib/auth/permissions.ts";
import { fetchAllRows } from "../src/lib/supabase/fetch-all.ts";

test("hasLocalOperations: only an explicit true flag counts", () => {
  assert.equal(hasLocalOperations({ has_local_operations: true }), true);
  assert.equal(hasLocalOperations({ has_local_operations: false }), false);
  assert.equal(hasLocalOperations(null), false);
  assert.equal(hasLocalOperations(undefined), false);
  // A row read before migration 067 has no flag at all — never local.
  assert.equal(hasLocalOperations({} as { has_local_operations: boolean }), false);
});

test("assertInCountryScope: same country passes, another or missing country is a 403", () => {
  const scope = { countryId: "mr" };
  assert.doesNotThrow(() => assertInCountryScope(scope, "mr"));
  for (const other of ["sa", "", null, undefined]) {
    assert.throws(
      () => assertInCountryScope(scope, other),
      (error: unknown) => error instanceof AuthError && error.status === 403,
    );
  }
});

test("new permissions: catalogued, parsed, and routed", () => {
  for (const key of [PERMISSIONS.manage_inventory, PERMISSIONS.view_treasury, PERMISSIONS.manage_treasury]) {
    assert.ok(ALL_PERMISSIONS.includes(key), `${key} missing from ALL_PERMISSIONS`);
    assert.ok(PERMISSION_CATALOG.some((p) => p.key === key), `${key} missing from the staff screen`);
  }
  assert.deepEqual(parsePermissions(["view_treasury", "not_a_permission"]), ["view_treasury"]);
});

test("routes: owners reach inventory/treasury, staff only with the matching permission", () => {
  const owner = { isOwner: true, permissions: [] };
  const staffNone = { isOwner: false, permissions: [PERMISSIONS.view_orders] };
  const staffView = { isOwner: false, permissions: [PERMISSIONS.view_treasury] };
  const staffManage = { isOwner: false, permissions: [PERMISSIONS.manage_treasury] };
  const staffInventory = { isOwner: false, permissions: [PERMISSIONS.manage_inventory] };

  assert.equal(canAccessRoute(owner, "/admin/inventory"), true);
  assert.equal(canAccessRoute(owner, "/admin/treasury"), true);

  // Existing staff get none of the three until an owner ticks them.
  assert.equal(canAccessRoute(staffNone, "/admin/inventory"), false);
  assert.equal(canAccessRoute(staffNone, "/admin/treasury/accounts"), false);

  assert.equal(canAccessRoute(staffView, "/admin/treasury"), true);
  assert.equal(canAccessRoute(staffManage, "/admin/treasury"), true);
  assert.equal(canAccessRoute(staffView, "/admin/inventory"), false);
  assert.equal(canAccessRoute(staffInventory, "/admin/inventory/purchases"), true);
});

/** Fake query builder: a table sorted by the requested columns, served in ranges. */
function fakeTable<T extends Record<string, unknown>>(rows: T[]) {
  const calls: string[][] = [];
  const build = () => {
    const order: string[] = [];
    const query = {
      order(column: string) {
        order.push(column);
        return query;
      },
      range(from: number, to: number) {
        calls.push([...order]);
        const sorted = [...rows].sort((a, b) => {
          for (const column of order) {
            const x = String(a[column]);
            const y = String(b[column]);
            if (x !== y) return x < y ? -1 : 1;
          }
          return 0;
        });
        return Promise.resolve({ data: sorted.slice(from, to + 1), error: null });
      },
    };
    return query;
  };
  return { build, calls };
}

test("fetchAllRows: reads past 1000 rows and orders by every given column", async () => {
  // 3 products × 400 days = 1200 rows: more than one page, many ties on date.
  const rows: { product_id: string; date: string }[] = [];
  for (const product of ["p1", "p2", "p3"]) {
    for (let day = 0; day < 400; day++) {
      rows.push({ product_id: product, date: `d${String(day).padStart(3, "0")}` });
    }
  }
  const table = fakeTable(rows);
  const result = await fetchAllRows<{ product_id: string; date: string }>(
    table.build as never,
    ["date", "product_id"],
  );

  assert.equal(result.error, null);
  assert.equal(result.truncated, false);
  assert.equal(result.rows.length, 1200);
  const keys = new Set(result.rows.map((r) => `${r.product_id}|${r.date}`));
  assert.equal(keys.size, 1200, "no row may appear on two pages");
  assert.deepEqual(table.calls[0], ["date", "product_id"]);
  assert.equal(table.calls.length, 2);
});

test("fetchAllRows: a single column still works", async () => {
  const table = fakeTable([{ id: "b" }, { id: "a" }]);
  const result = await fetchAllRows<{ id: string }>(table.build as never, "id");
  assert.deepEqual(result.rows.map((r) => r.id), ["a", "b"]);
  assert.deepEqual(table.calls, [["id"]]);
});
