/**
 * Unregister Serwist workers that were registered at site root (`scope: /`).
 * Those intercept storefront navigations (e.g. `/order-success`) and can throw
 * `no-response` when NetworkOnly fetch fails.
 */
export async function unregisterLegacyRootSerwist(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const origin = window.location.origin.replace(/\/$/, "");
  const rootScope = `${origin}/`;

  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.map(async (reg) => {
      const script = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL;
      if (!script?.endsWith("/sw.js")) return;
      if (reg.scope !== rootScope && reg.scope !== origin) return;
      try {
        await reg.unregister();
        console.info("[Serwist] Unregistered legacy root-scoped service worker");
      } catch {
        // ignore — checkout still proceeds without SW control
      }
    }),
  );
}
