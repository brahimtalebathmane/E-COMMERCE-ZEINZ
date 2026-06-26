"use client";

import dynamic from "next/dynamic";

/**
 * Defers the AI assistant chat bundle out of the dashboard's critical client
 * JS. The drawer renders nothing until the owner opens it, so there is no
 * reason to ship/hydrate its chat logic on every panel's first paint. The chunk
 * is fetched in the background after hydration (and instantly on first open),
 * which keeps initial render and navigation hydration lean without changing any
 * behaviour or layout.
 */
const AdminAssistant = dynamic(
  () => import("./AdminAssistant").then((m) => m.AdminAssistant),
  { ssr: false },
);

export function AdminAssistantLazy() {
  return <AdminAssistant />;
}
