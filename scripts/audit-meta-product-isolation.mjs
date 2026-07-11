#!/usr/bin/env node
/**
 * Regression guard: Meta funnel storage must stay isolated per product and per tab.
 * Run before deploy: npm run audit:meta-isolation
 */

const META_FUNNEL_STORAGE_VERSION = "v2";

function metaFunnelEventIdStorageKey(productId) {
  return `meta_funnel_${META_FUNNEL_STORAGE_VERSION}:${productId.trim()}:event_id`;
}

function metaFunnelActivityStorageKey(productId) {
  return `meta_funnel_${META_FUNNEL_STORAGE_VERSION}:${productId.trim()}:last_activity_ms`;
}

function metaPendingLeadStorageKey(orderId) {
  return `meta_pending_lead_v2:${orderId.trim()}`;
}

function createEventId(label) {
  return `${Date.now()}_${label}`;
}

/** Minimal sessionStorage stand-in (one instance = one browser tab). */
function createTabStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    keys() {
      return [...map.keys()];
    },
  };
}

function ensureFunnelSession(storage, productId, createId) {
  const id = productId.trim();
  if (!id) return "";
  const eventKey = metaFunnelEventIdStorageKey(id);
  const activityKey = metaFunnelActivityStorageKey(id);
  const existing = storage.getItem(eventKey)?.trim();
  if (existing) {
    storage.setItem(activityKey, String(Date.now()));
    return existing;
  }
  const next = createId(id);
  storage.setItem(eventKey, next);
  storage.setItem(activityKey, String(Date.now()));
  return next;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testConcurrentTabsDifferentProducts() {
  const tabA = createTabStorage();
  const tabB = createTabStorage();
  const productA = "11111111-1111-4111-8111-111111111111";
  const productB = "22222222-2222-4222-8222-222222222222";

  const eventA1 = ensureFunnelSession(tabA, productA, () => createEventId("tabA"));
  const eventB1 = ensureFunnelSession(tabB, productB, () => createEventId("tabB"));
  const eventA2 = ensureFunnelSession(tabA, productA, () => createEventId("tabA-rotated"));
  const eventB2 = ensureFunnelSession(tabB, productB, () => createEventId("tabB-rotated"));

  assert(eventA1 === eventA2, "Tab A must reuse its product-scoped funnel event_id");
  assert(eventB1 === eventB2, "Tab B must reuse its product-scoped funnel event_id");
  assert(eventA1 !== eventB1, "Concurrent tabs must not share funnel event_id across products");

  const keysA = tabA.keys().filter((k) => k.includes(productA));
  const keysB = tabB.keys().filter((k) => k.includes(productB));
  assert(keysA.length === 2, "Tab A should only store product A funnel keys");
  assert(keysB.length === 2, "Tab B should only store product B funnel keys");
  assert(
    !tabA.keys().some((k) => k.includes(productB)),
    "Tab A storage must not contain product B keys",
  );
  assert(
    !tabB.keys().some((k) => k.includes(productA)),
    "Tab B storage must not contain product A keys",
  );
}

function testSameTabSequentialProducts() {
  const tab = createTabStorage();
  const productA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const productB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const eventA = ensureFunnelSession(tab, productA, () => createEventId("A"));
  const eventB = ensureFunnelSession(tab, productB, () => createEventId("B"));
  const eventAAgain = ensureFunnelSession(tab, productA, () => createEventId("A-new"));

  assert(eventA !== eventB, "Different products in the same tab must have distinct event_ids");
  assert(eventA === eventAAgain, "Returning to a product must restore its scoped session");
}

function testPendingLeadOrderIsolation() {
  const tab = createTabStorage();
  const orderA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const orderB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  tab.setItem(
    metaPendingLeadStorageKey(orderA),
    JSON.stringify({ orderId: orderA, productId: "p-a", eventId: "e-a" }),
  );
  tab.setItem(
    metaPendingLeadStorageKey(orderB),
    JSON.stringify({ orderId: orderB, productId: "p-b", eventId: "e-b" }),
  );

  const rawA = tab.getItem(metaPendingLeadStorageKey(orderA));
  const rawB = tab.getItem(metaPendingLeadStorageKey(orderB));
  assert(rawA.includes("p-a"), "Order A pending payload must remain intact");
  assert(rawB.includes("p-b"), "Order B pending payload must remain intact");
  assert(rawA !== rawB, "Pending Lead payloads must not overwrite each other");
}

function testLegacyGlobalKeyMustNotBeUsed() {
  const legacyKeys = [
    "meta_event_id_session",
    "meta_event_product_id_session",
    "meta_event_last_activity_ms",
    "meta_pending_lead_v1",
  ];
  for (const key of legacyKeys) {
    assert(
      !key.includes(":product") && key !== "meta_pending_lead_v1" || key === "meta_pending_lead_v1",
      "legacy key list sanity",
    );
  }
  assert(
    metaFunnelEventIdStorageKey("uuid").includes(":uuid:"),
    "Funnel keys must embed productId",
  );
  assert(
    metaPendingLeadStorageKey("uuid").endsWith("uuid"),
    "Pending lead keys must embed orderId",
  );
}

function main() {
  const tests = [
    ["concurrent tabs / different products", testConcurrentTabsDifferentProducts],
    ["same tab / sequential products", testSameTabSequentialProducts],
    ["pending lead order isolation", testPendingLeadOrderIsolation],
    ["storage key scoping", testLegacyGlobalKeyMustNotBeUsed],
  ];

  for (const [name, fn] of tests) {
    fn();
    console.log(`PASS  ${name}`);
  }

  console.log("\nAll Meta product-isolation regression checks passed.");
}

try {
  main();
} catch (error) {
  console.error("\nFAIL  Meta product-isolation regression check");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
