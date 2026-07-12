import {
  buildMetaPixelInitUserData,
  type MetaPixelAdvancedMatchingPayload,
} from "@/lib/meta-pixel-advanced-matching";
import {
  META_PAGEVIEW_STORAGE_PREFIX,
  META_VIEWCONTENT_STORAGE_PREFIX,
  metaContentDataToPixelPayload,
} from "@/lib/meta-pixel-landing-script";
import { normalizeMetaPixelId, resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";
import type { MetaProductCustomData } from "@/lib/meta-product-custom-data";

type FbqFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push?: FbqFn;
  loaded?: boolean;
  version?: string;
  disablePushState?: boolean;
  getState?: () => { pixels?: Array<{ id?: string }> };
  instance?: { pixelsByID?: Record<string, { userData?: Record<string, string> }> };
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
    __metaPixelsInited?: Record<string, boolean>;
    /** Pixel IDs that received manual AM (ph/fn/ln) on fbq init — per pixel, site-wide. */
    __metaPixelInitHadPii?: Record<string, boolean>;
    __metaPixelPageViewSent?: Record<string, boolean>;
    __metaPixelViewContentSent?: Record<string, boolean>;
    /** `${pixelId}:${eventName}:${eventID}` keys already dispatched, to guarantee once-per-action. */
    __metaSentEvents?: Record<string, boolean>;
  }
}

const isDev = process.env.NODE_ENV === "development";

function devLog(message: string, data?: Record<string, unknown>): void {
  if (!isDev) return;
  if (data) {
    console.log(`[Meta Pixel] ${message}`, data);
  } else {
    console.log(`[Meta Pixel] ${message}`);
  }
}

/** Load official fbq bootstrap if root layout script has not run yet. */
function ensureFbqQueue(): void {
  if (typeof window === "undefined" || window.fbq) return;

  (function (f, b, e, v) {
    if (f.fbq) return;
    const n = function (...args: unknown[]) {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue.push(args);
      }
    } as FbqFn;
    f.fbq = n;
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    // Stop Meta's automatic PageView on history.pushState — we fire one manually per route.
    n.disablePushState = true;
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    if (s?.parentNode) s.parentNode.insertBefore(t, s);
    else (b.head || b.documentElement).appendChild(t);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
}

function initUserDataHasPii(userData?: Record<string, string>): boolean {
  return Boolean(userData?.ph || userData?.fn || userData?.ln || userData?.em);
}

/**
 * Merge advanced matching on an already-inited pixel.
 * Avoids fbq('set','userData') — Meta's SDK rejects a pixel_id 4th arg on that API and
 * may warn even when our code passes 3 args (plugin wraps the call internally).
 */
function mergeMetaPixelUserData(
  pixelId: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): void {
  const userData = buildMetaPixelInitUserData(pixelId, extra);
  if (!userData) return;

  try {
    const inst = window.fbq?.instance?.pixelsByID?.[pixelId];
    if (inst) {
      inst.userData = { ...(inst.userData ?? {}), ...userData };
      if (initUserDataHasPii(userData)) {
        window.__metaPixelInitHadPii = window.__metaPixelInitHadPii || {};
        window.__metaPixelInitHadPii[pixelId] = true;
      }
      devLog("userData merged on pixel instance", {
        pixelId,
        keys: Object.keys(userData),
      });
    }
  } catch {
    // ignore — next tracked event may ship without enriched AM
  }
}

/** Default init — allow Meta's automatic base-code PageView (standard event). */
const FBQ_INIT_OPTS = { xfbml: false } as const;

/** Module-level init lock — survives HMR and complements window.__metaPixelsInited. */
const initedPixelIds = new Set<string>();

function isInitPendingInFbqQueue(pixelId: string): boolean {
  const queue = window.fbq?.queue;
  if (!Array.isArray(queue)) return false;
  return queue.some(
    (entry) => Array.isArray(entry) && entry[0] === "init" && String(entry[1]) === pixelId,
  );
}

function countFbqPixelRegistrations(pixelId: string): number {
  try {
    const pixels = window.fbq?.getState?.()?.pixels;
    if (!Array.isArray(pixels)) return 0;
    const id = String(pixelId);
    return pixels.filter((pixel) => String(pixel?.id) === id).length;
  } catch {
    return 0;
  }
}

function isFbqPixelRegistered(pixelId: string): boolean {
  return countFbqPixelRegistrations(pixelId) > 0;
}

/** Sync module/window init flags when fbq already registered this pixel (SPA navigation). */
function syncInitedFromFbqState(pixelId: string): boolean {
  if (!isFbqPixelRegistered(pixelId)) return false;
  markMetaPixelInited(pixelId);
  return true;
}

function markMetaPixelInited(pixelId: string): void {
  initedPixelIds.add(pixelId);
  window.__metaPixelsInited = window.__metaPixelsInited || {};
  window.__metaPixelsInited[pixelId] = true;
}

function isMetaPixelInited(pixelId: string): boolean {
  return (
    initedPixelIds.has(pixelId) ||
    Boolean(window.__metaPixelsInited?.[pixelId]) ||
    isFbqPixelRegistered(pixelId) ||
    isInitPendingInFbqQueue(pixelId)
  );
}

function pageViewDedupeKey(pixelId: string): string {
  const path = window.location.pathname;
  const search = window.location.search;
  return `${pixelId}:${path}${search}`;
}

function queueMetaPixelInit(
  id: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): void {
  ensureFbqQueue();
  if (!window.fbq) return;

  syncInitedFromFbqState(id);

  if (isMetaPixelInited(id)) {
    devLog("init skipped (already registered or pending)", { pixelId: id });
    return;
  }

  if (countFbqPixelRegistrations(id) > 0) {
    markMetaPixelInited(id);
    devLog("init skipped (pixel already in fbq state)", { pixelId: id });
    return;
  }

  // Reserve the init slot synchronously so concurrent callers cannot queue a second init.
  markMetaPixelInited(id);

  // Keep SPA history from auto-firing PageView; first PageView comes from init (standard).
  window.fbq.disablePushState = true;

  const userData = buildMetaPixelInitUserData(id, extra);
  if (userData) {
    window.fbq("init", id, userData, FBQ_INIT_OPTS);
  } else {
    window.fbq("init", id, {}, FBQ_INIT_OPTS);
  }
  // Credit automatic init PageView for this route (Meta base-code behavior).
  markPageViewSentForRoute(pageViewDedupeKey(id));
  if (initUserDataHasPii(userData)) {
    window.__metaPixelInitHadPii = window.__metaPixelInitHadPii || {};
    window.__metaPixelInitHadPii[id] = true;
  }
  devLog("init queued", {
    pixelId: id,
    hasInitUserData: Boolean(userData),
    hasPii: initUserDataHasPii(userData),
  });
}

/**
 * Initialize each pixel ID EXACTLY once per page session.
 *
 * Calling `fbq('init', id)` more than once for the same ID registers the pixel a
 * second time inside fbevents.js, which makes every untargeted `fbq('track', …)`
 * (and even `trackSingle`) fire twice. Advanced matching that arrives after the
 * first init is therefore merged on fbq.instance.pixelsByID[id].userData instead of a
 * re-init, so events are never duplicated.
 *
 * Unified site-wide pixel from NEXT_PUBLIC_META_PIXEL_ID — init once per page session.
 */
function syncMetaPixelInit(
  pixelId: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): string | null {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") return null;

  ensureFbqQueue();

  syncInitedFromFbqState(id);

  if (!isMetaPixelInited(id)) {
    queueMetaPixelInit(id, extra);
    return id;
  }

  // Already initialized: NEVER re-init. Merge advanced matching on the live instance.
  markMetaPixelInited(id);
  mergeMetaPixelUserData(id, extra);

  return id;
}

function ensurePixelInit(
  pixelId: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): string | null {
  return syncMetaPixelInit(pixelId, extra);
}

/** Re-run init with manual advanced matching (Meta requires PII in the init third argument). */
export function refreshMetaPixelInitWithUserData(
  pixelId: string,
  extra?: MetaPixelAdvancedMatchingPayload | null,
): void {
  syncMetaPixelInit(pixelId, extra);
}

function isPageViewSentForRoute(key: string): boolean {
  if (typeof window === "undefined") return false;
  const storageKey = `${META_PAGEVIEW_STORAGE_PREFIX}${key}`;
  try {
    if (sessionStorage.getItem(storageKey) === "1") return true;
  } catch {
    // ignore private mode / quota
  }
  return Boolean(window.__metaPixelPageViewSent?.[key]);
}

function markPageViewSentForRoute(key: string): void {
  if (!window.__metaPixelPageViewSent) window.__metaPixelPageViewSent = {};
  window.__metaPixelPageViewSent[key] = true;
  try {
    sessionStorage.setItem(`${META_PAGEVIEW_STORAGE_PREFIX}${key}`, "1");
  } catch {
    // ignore
  }
}

function markViewContentSentForRoute(key: string): void {
  if (!window.__metaPixelViewContentSent) window.__metaPixelViewContentSent = {};
  window.__metaPixelViewContentSent[key] = true;
  try {
    sessionStorage.setItem(`${META_VIEWCONTENT_STORAGE_PREFIX}${key}`, "1");
  } catch {
    // ignore
  }
}

function isViewContentSentForRoute(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(`${META_VIEWCONTENT_STORAGE_PREFIX}${key}`) === "1") return true;
  } catch {
    // ignore
  }
  return Boolean(window.__metaPixelViewContentSent?.[key]);
}

const META_TRACKED_EVENT_STORAGE_PREFIX = "meta_tracked_event_v1:";
function isDuplicateTrackedEvent(
  pixelId: string,
  eventName: string,
  eventID?: string,
): boolean {
  if (!eventID || typeof window === "undefined") return false;
  const memKey = `${pixelId}:${eventName}:${eventID}`;
  const storageKey = `${META_TRACKED_EVENT_STORAGE_PREFIX}${memKey}`;

  try {
    if (sessionStorage.getItem(storageKey) === "1") return true;
    sessionStorage.setItem(storageKey, "1");
  } catch {
    if (window.__metaSentEvents?.[memKey]) return true;
    if (!window.__metaSentEvents) window.__metaSentEvents = {};
    window.__metaSentEvents[memKey] = true;
    return false;
  }

  if (!window.__metaSentEvents) window.__metaSentEvents = {};
  window.__metaSentEvents[memKey] = true;
  return false;
}

function pushFbqTrack(
  pixelId: string,
  eventName: string,
  payload?: Record<string, unknown>,
  opts?: { eventID?: string },
): boolean {
  if (!window.fbq) return false;

  // Guarantee a given user action (identified by eventID) fires once per session,
  // so rapid double-taps / re-renders cannot emit the same Lead/InitiateCheckout twice.
  if (isDuplicateTrackedEvent(pixelId, eventName, opts?.eventID)) {
    devLog(`${eventName} skipped (duplicate eventID)`, { pixelId, eventID: opts?.eventID });
    return false;
  }

  const duplicateRegistrations = countFbqPixelRegistrations(pixelId);
  if (duplicateRegistrations > 1) {
    console.warn(
      `[Meta Pixel] ${eventName} may duplicate — pixel ${pixelId} registered ${duplicateRegistrations}x in fbq (avoid calling fbq init twice)`,
    );
  }

  // Always target the specific pixel (`trackSingle`). Untargeted `fbq('track', …)`
  // dispatches to every registered pixel instance and is the main duplication vector.
  // userData is applied in syncMetaPixelInit before this call — do not set again here.
  const trackPayload = payload ?? {};
  if (opts?.eventID) {
    window.fbq("trackSingle", pixelId, eventName, trackPayload, { eventID: opts.eventID });
  } else {
    window.fbq("trackSingle", pixelId, eventName, trackPayload);
  }

  devLog(`${eventName} trackSingle queued`, {
    pixelId,
    eventID: opts?.eventID,
  });

  return true;
}

/** Standard PageView for client-side route changes (init already fired the first one). */
function pushFbqPageView(pixelId: string): boolean {
  if (!window.fbq) return false;

  const duplicateRegistrations = countFbqPixelRegistrations(pixelId);
  if (duplicateRegistrations > 1) {
    console.warn(
      `[Meta Pixel] PageView may duplicate — pixel ${pixelId} registered ${duplicateRegistrations}x in fbq (avoid calling fbq init twice)`,
    );
  }

  window.fbq("track", "PageView");
  devLog("PageView track queued (client navigation)", { pixelId });
  return true;
}

/** @deprecated Use trackMetaPageView / trackMetaEvent; kept for callers that awaited init. */
export function ensureMetaPixelSdk(pixelId: string): string | null {
  return ensurePixelInit(pixelId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Queue a standard PageView once the pixel is registered (or after retry budget).
 * Retries when fbq / fbevents.js is still loading — unlike Lead, PageView must not
 * rely on a one-shot effect that StrictMode or dedupe locks can permanently block.
 */
async function dispatchMetaPageViewOnce(id: string, key: string): Promise<boolean> {
  ensureFbqQueue();
  syncMetaPixelInit(id);

  if (!window.fbq) return false;

  const regCount = await waitForFbqPixelRegistration(id);
  if (isPageViewSentForRoute(key)) return true;

  // Prefer firing after init registered the pixel; still attempt on last resort when
  // fbevents.js is slow but init is queued (regCount may stay 0 briefly).
  if (regCount === 0 && isInitPendingInFbqQueue(id)) {
    await sleep(200);
  }

  if (isPageViewSentForRoute(key)) return true;

  const sent = pushFbqPageView(id);
  if (!sent) return false;

  markPageViewSentForRoute(key);
  devLog("PageView queued", {
    pixelId: id,
    key,
    regCount,
    queueLength: window.fbq?.queue?.length ?? 0,
  });
  return true;
}

/** Fire one PageView per route; safe to call multiple times (dedupes + retries). */
export async function trackMetaPageView(pixelId?: string | null): Promise<void> {
  const id = normalizeMetaPixelId(pixelId) ?? resolvePublicMetaPixelId();
  if (!id || typeof window === "undefined") return;

  const key = pageViewDedupeKey(id);
  if (isPageViewSentForRoute(key)) {
    devLog("PageView skipped (already sent for route)", { pixelId: id, key });
    return;
  }

  const retryDelaysMs = [0, 150, 400, 900, 1800];
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    if (isPageViewSentForRoute(key)) return;
    if (retryDelaysMs[attempt] > 0) {
      await sleep(retryDelaysMs[attempt]);
    }
    if (isPageViewSentForRoute(key)) return;

    const sent = await dispatchMetaPageViewOnce(id, key);
    if (sent) return;
  }

  devLog("PageView retries exhausted", { pixelId: id, key });
}

function pushFbqViewContent(pixelId: string, payload: Record<string, unknown>): boolean {
  if (!window.fbq) return false;
  window.fbq("track", "ViewContent", payload);
  devLog("ViewContent track queued", { pixelId });
  return true;
}

async function dispatchMetaViewContentOnce(
  id: string,
  key: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  ensureFbqQueue();
  syncMetaPixelInit(id);
  if (!window.fbq) return false;

  const regCount = await waitForFbqPixelRegistration(id);
  if (isViewContentSentForRoute(key)) return true;

  if (regCount === 0 && isInitPendingInFbqQueue(id)) {
    await sleep(200);
  }

  if (isViewContentSentForRoute(key)) return true;

  const sent = pushFbqViewContent(id, payload);
  if (!sent) return false;

  markViewContentSentForRoute(key);
  devLog("ViewContent queued", { pixelId: id, key, regCount });
  return true;
}

/** Fire one ViewContent per product route; dedupes like PageView. */
export async function trackMetaViewContent(
  content: MetaProductCustomData,
  pixelId?: string | null,
): Promise<void> {
  const id = normalizeMetaPixelId(pixelId) ?? resolvePublicMetaPixelId();
  if (!id || typeof window === "undefined") return;

  const key = pageViewDedupeKey(id);
  if (isViewContentSentForRoute(key)) {
    devLog("ViewContent skipped (already sent for route)", { pixelId: id, key });
    return;
  }

  const payload = metaContentDataToPixelPayload(content);
  const retryDelaysMs = [0, 150, 400, 900, 1800];
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    if (isViewContentSentForRoute(key)) return;
    if (retryDelaysMs[attempt] > 0) {
      await sleep(retryDelaysMs[attempt]);
    }
    if (isViewContentSentForRoute(key)) return;

    const sent = await dispatchMetaViewContentOnce(id, key, payload);
    if (sent) return;
  }

  devLog("ViewContent retries exhausted", { pixelId: id, key });
}

export function trackMetaEvent(
  pixelId: string | null | undefined,
  eventName: string,
  payload?: Record<string, unknown>,
  opts?: { eventID?: string; advancedMatching?: MetaPixelAdvancedMatchingPayload | null },
): void {
  const id = normalizeMetaPixelId(pixelId) ?? resolvePublicMetaPixelId();
  if (!id || typeof window === "undefined") return;

  const ready = syncMetaPixelInit(id, opts?.advancedMatching);
  if (!ready || !window.fbq) return;

  pushFbqTrack(
    id,
    eventName,
    payload,
    opts?.eventID ? { eventID: opts.eventID } : undefined,
  );

  devLog(`${eventName} queued`, {
    pixelId: id,
    queueLength: window.fbq.queue?.length ?? 0,
    eventID: opts?.eventID,
    hasPayload: Boolean(payload && Object.keys(payload).length > 0),
  });
}

/** Outcome of the dedicated browser Lead path (never shares pushFbqTrack with other events). */
export type TrackMetaLeadResult =
  | { sent: true }
  | { sent: false; reason: string };

/** Wait until fbq registration count stabilizes — catches late duplicate inits. */
function waitForFbqPixelRegistration(pixelId: string, maxMs = 2500): Promise<number> {
  return new Promise((resolve) => {
    const started = Date.now();
    let lastCount = -1;
    let stableTicks = 0;

    const tick = () => {
      const count = countFbqPixelRegistrations(pixelId);
      const pending = isInitPendingInFbqQueue(pixelId);
      const elapsed = Date.now() - started;

      if (count > 0 && count === lastCount && !pending) {
        stableTicks += 1;
        if (stableTicks >= 2) {
          resolve(count);
          return;
        }
      } else {
        stableTicks = 0;
        lastCount = count;
      }

      if ((!pending && elapsed > 200) || elapsed >= maxMs) {
        resolve(countFbqPixelRegistrations(pixelId));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Single-path browser Lead — one userData update, one trackSingle, no applyMetaPixelUserData.
 * Skips browser Lead when fbq has duplicate pixel registrations (trackSingle would emit twice).
 */
export async function trackMetaLead(
  pixelId: string,
  payload: Record<string, unknown>,
  opts: { eventID: string; advancedMatching?: MetaPixelAdvancedMatchingPayload | null },
): Promise<TrackMetaLeadResult> {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") {
    return { sent: false, reason: "no_pixel" };
  }

  ensureFbqQueue();
  syncMetaPixelInit(id, opts.advancedMatching);

  const regCount = await waitForFbqPixelRegistration(id);
  mergeMetaPixelUserData(id, opts.advancedMatching);

  const finalRegCount = countFbqPixelRegistrations(id);
  if (finalRegCount > 1 || regCount > 1) {
    console.warn(
      `[Meta Pixel] Skipping browser Lead — pixel ${id} registered ${finalRegCount}x in fbq; CAPI Lead will still fire`,
    );
    return { sent: false, reason: "duplicate_pixel_registration" };
  }

  if (!window.fbq) {
    return { sent: false, reason: "fbq_unavailable" };
  }

  // Lock immediately before trackSingle — not before async registration wait.
  if (isDuplicateTrackedEvent(id, "Lead", opts.eventID)) {
    return { sent: false, reason: "duplicate_event_id" };
  }

  window.fbq("trackSingle", id, "Lead", payload, { eventID: opts.eventID });
  devLog("Lead trackSingle queued (dedicated path)", {
    pixelId: id,
    eventID: opts.eventID,
    regCount: finalRegCount,
  });

  return { sent: true };
}
