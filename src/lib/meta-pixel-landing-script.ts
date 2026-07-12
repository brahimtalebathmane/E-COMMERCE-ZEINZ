import { normalizeMetaPixelId, resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";
import type { MetaProductCustomData } from "@/lib/meta-product-custom-data";

/** Must stay in sync with `meta-pixel-client.ts` route dedupe keys. Bump when dedupe logic changes. */
export const META_PAGEVIEW_STORAGE_PREFIX = "meta_pageview_v4:";
export const META_VIEWCONTENT_STORAGE_PREFIX = "meta_viewcontent_v1:";

export type MetaLandingProductContent = {
  productId: string;
  productName: string;
};

/**
 * Shared inline helpers. Init uses Meta's default autoConfig so the automatic
 * PageView from `fbq('init')` is classified as the standard base-code PageView
 * (not Manual Setup / Custom). disablePushState still blocks SPA history dupes.
 */
function landingScriptShell(idJson: string, prefixJson: string, fireBody: string): string {
  return `(function(){
var id=${idJson};
if(!id)return;
var prefix=${prefixJson};
function routeKey(){return id+":"+location.pathname+location.search;}
function storageKey(suffix){return suffix+routeKey();}
function alreadySent(suffix,mem){
  var rk=routeKey();
  var sk=storageKey(suffix);
  try{if(sessionStorage.getItem(sk)==="1")return true;}catch(e){}
  return !!(window[mem]&&window[mem][rk]);
}
function markSent(suffix,mem){
  var rk=routeKey();
  var sk=storageKey(suffix);
  try{sessionStorage.setItem(sk,"1");}catch(e){}
  window[mem]=window[mem]||{};
  window[mem][rk]=true;
}
function ensureInit(){
  if(window.__metaPixelsInited&&window.__metaPixelsInited[id])return;
  if(!window.fbq)return;
  window.fbq.disablePushState=true;
  // Default autoConfig — Meta fires the standard PageView on init (base-code behavior).
  window.fbq("init",id);
  window.__metaPixelsInited=window.__metaPixelsInited||{};
  window.__metaPixelsInited[id]=true;
  // Credit the automatic init PageView so React does not fire a second one.
  markSent(prefix,"__metaPixelPageViewSent");
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
 * Catalog listing — init only (automatic standard PageView). No product content_ids.
 */
export function buildMetaPixelCatalogPageViewScript(
  pixelId?: string | null,
): string | null {
  const id = normalizeMetaPixelId(pixelId) ?? resolvePublicMetaPixelId();
  if (!id) return null;

  const safeId = JSON.stringify(id);
  const safePrefix = JSON.stringify(META_PAGEVIEW_STORAGE_PREFIX);

  const fireBody = `
var pvPrefix=${safePrefix};
function fireEvents(){
  if(!readyToTrack())return false;
  // PageView already credited in ensureInit (Meta automatic base-code PageView).
  return alreadySent(pvPrefix,"__metaPixelPageViewSent");
}
if(fireEvents())return;
`;

  return landingScriptShell(safeId, safePrefix, fireBody);
}

/** @deprecated Use buildMetaPixelCatalogPageViewScript */
export function buildMetaPixelLandingPageViewScript(
  pixelId?: string | null,
): string | null {
  return buildMetaPixelCatalogPageViewScript(pixelId);
}

/**
 * Product landing — automatic PageView via init + ViewContent with product content_ids.
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
  const safePvPrefix = JSON.stringify(META_PAGEVIEW_STORAGE_PREFIX);
  const safeVcPrefix = JSON.stringify(META_VIEWCONTENT_STORAGE_PREFIX);
  const safeProductId = JSON.stringify(productId);
  const safeProductName = JSON.stringify(productName);

  const fireBody = `
var pvPrefix=${safePvPrefix};
var vcPrefix=${safeVcPrefix};
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
  if(!alreadySent(vcPrefix,"__metaPixelViewContentSent")){
    window.fbq("track","ViewContent",viewContentPayload());
    markSent(vcPrefix,"__metaPixelViewContentSent");
  }
  return alreadySent(pvPrefix,"__metaPixelPageViewSent")&&alreadySent(vcPrefix,"__metaPixelViewContentSent");
}
if(fireEvents())return;
`;

  return landingScriptShell(safeId, safePvPrefix, fireBody);
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
