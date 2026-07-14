import { normalizeMetaPixelId, resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";
import type { MetaProductCustomData } from "@/lib/meta-product-custom-data";

export type MetaLandingProductContent = {
  productId: string;
  productName: string;
};

/**
 * Shared inline helpers. Uses Meta's documented base code: `fbq('init', id)`
 * followed by an explicit `fbq('track', 'PageView')` (init alone does NOT fire
 * PageView). disablePushState blocks SPA history dupes; default autoConfig keeps
 * PageView classified as the standard event.
 *
 * Dedupe is per PAGELOAD (window memory only — never sessionStorage): every full
 * page load must fire its own PageView/ViewContent, while the inline script, the
 * React runtime, and StrictMode re-runs share the same window flags so a single
 * pageload can never double-fire. Route-scoped event ids (`pv_…` / `vc_…`) live in
 * window.__metaEventIds and are shared with `meta-pixel-client.ts`.
 */
function landingScriptShell(idJson: string, fireBody: string): string {
  return `(function(){
var id=${idJson};
if(!id)return;
function routeKey(){return id+":"+location.pathname+location.search;}
function alreadySent(mem){
  var rk=routeKey();
  return !!(window[mem]&&window[mem][rk]);
}
function markSent(mem){
  var rk=routeKey();
  window[mem]=window[mem]||{};
  window[mem][rk]=true;
}
function eventIdFor(type){
  var map=window.__metaEventIds=window.__metaEventIds||{};
  var key=type+":"+routeKey();
  if(!map[key])map[key]=type+"_"+Date.now()+"_"+Math.random().toString(36).slice(2,10);
  return map[key];
}
function ensureInit(){
  if(window.__metaPixelsInited&&window.__metaPixelsInited[id])return;
  if(!window.fbq)return;
  window.fbq.disablePushState=true;
  window.fbq("init",id);
  window.__metaPixelsInited=window.__metaPixelsInited||{};
  window.__metaPixelsInited[id]=true;
}
function pixelRegistered(){
  try{
    var px=window.fbq&&window.fbq.getState&&window.fbq.getState().pixels;
    if(!px||!px.length)return false;
    for(var i=0;i<px.length;i++){
      if(String(px[i].id)===id)return true;
    }
  }catch(e){}
  return false;
}
function initPending(){
  var q=window.fbq&&window.fbq.queue;
  if(!Array.isArray(q))return false;
  for(var i=0;i<q.length;i++){
    var e=q[i];
    if(Array.isArray(e)&&e[0]==="init"&&String(e[1])===id)return true;
  }
  return false;
}
function initInFlight(){
  if(initPending())return true;
  return !!(window.__metaPixelsInited&&window.__metaPixelsInited[id]&&!pixelRegistered());
}
function readyToTrack(){
  if(!window.fbq)return false;
  ensureInit();
  if(!pixelRegistered()&&!initInFlight())return false;
  return pixelRegistered();
}
${fireBody}
var attempts=0;
var timer=setInterval(function(){
  if(fireEvents()||++attempts>=120)clearInterval(timer);
},50);
})();`;
}

/**
 * Catalog listing — standard PageView via `fbq('track','PageView')`. No product content_ids.
 */
export function buildMetaPixelCatalogPageViewScript(
  pixelId?: string | null,
): string | null {
  const id = normalizeMetaPixelId(pixelId) ?? resolvePublicMetaPixelId();
  if (!id) return null;

  const safeId = JSON.stringify(id);

  const fireBody = `
function fireEvents(){
  if(!readyToTrack())return false;
  if(alreadySent("__metaPixelPageViewSent"))return true;
  window.fbq("track","PageView",{},{eventID:eventIdFor("pv")});
  markSent("__metaPixelPageViewSent");
  return true;
}
if(fireEvents())return;
`;

  return landingScriptShell(safeId, fireBody);
}

/** @deprecated Use buildMetaPixelCatalogPageViewScript */
export function buildMetaPixelLandingPageViewScript(
  pixelId?: string | null,
): string | null {
  return buildMetaPixelCatalogPageViewScript(pixelId);
}

/**
 * Product landing — standard PageView + ViewContent with product content_ids.
 */
export function buildMetaPixelProductLandingScript(
  product: MetaLandingProductContent,
  pixelId?: string | null,
): string | null {
  const id = normalizeMetaPixelId(pixelId) ?? resolvePublicMetaPixelId();
  if (!id) return null;

  const productId = product.productId.trim();
  const productName = product.productName.trim() || "Product";
  if (!productId) return null;

  const safeId = JSON.stringify(id);
  const safeProductId = JSON.stringify(productId);
  const safeProductName = JSON.stringify(productName);

  const fireBody = `
var productId=${safeProductId};
var productName=${safeProductName};
function viewContentPayload(){
  return {
    content_type:"product",
    content_ids:[productId],
    content_name:productName,
    contents:[{id:productId,quantity:1}]
  };
}
function fireEvents(){
  if(!readyToTrack())return false;
  if(!alreadySent("__metaPixelPageViewSent")){
    window.fbq("track","PageView",{},{eventID:eventIdFor("pv")});
    markSent("__metaPixelPageViewSent");
  }
  if(!alreadySent("__metaPixelViewContentSent")){
    window.fbq("track","ViewContent",viewContentPayload(),{eventID:eventIdFor("vc")});
    markSent("__metaPixelViewContentSent");
  }
  return alreadySent("__metaPixelPageViewSent")&&alreadySent("__metaPixelViewContentSent");
}
if(fireEvents())return;
`;

  return landingScriptShell(safeId, fireBody);
}

/** Browser ViewContent payload shape (matches resolveMetaContentData). */
export function metaContentDataToPixelPayload(
  data: MetaProductCustomData,
): Record<string, unknown> {
  return {
    content_type: data.content_type,
    content_ids: data.content_ids,
    content_name: data.content_name,
    contents: data.contents,
  };
}
