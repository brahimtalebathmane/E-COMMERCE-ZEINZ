import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

/** Must stay in sync with `meta-pixel-client.ts` route dedupe keys. Bump when dedupe logic changes. */
export const META_PAGEVIEW_STORAGE_PREFIX = "meta_pageview_v2:";

/**
 * Inline script for product landing pages — fires init + standard PageView before React hydrates.
 * Polls for `window.fbq` (layout bootstrap) and never writes dedupe keys unless trackSingle is queued.
 */
export function buildMetaPixelLandingPageViewScript(
  pixelId: string | null | undefined,
): string | null {
  const id = normalizeMetaPixelId(pixelId);
  if (!id) return null;

  const safeId = JSON.stringify(id);
  const safePrefix = JSON.stringify(META_PAGEVIEW_STORAGE_PREFIX);

  return `(function(){
var id=${safeId};
if(!id)return;
var prefix=${safePrefix};
function routeKey(){return id+":"+location.pathname+location.search;}
function storageKey(){return prefix+routeKey();}
function alreadySent(){
  var rk=routeKey();
  try{if(sessionStorage.getItem(storageKey())==="1")return true;}catch(e){}
  return !!(window.__metaPixelPageViewSent&&window.__metaPixelPageViewSent[rk]);
}
function markSent(){
  var rk=routeKey();
  try{sessionStorage.setItem(storageKey(),"1");}catch(e){}
  window.__metaPixelPageViewSent=window.__metaPixelPageViewSent||{};
  window.__metaPixelPageViewSent[rk]=true;
}
function ensureInit(){
  if(window.__metaPixelsInited&&window.__metaPixelsInited[id])return;
  window.fbq.disablePushState=true;
  window.fbq("set","autoConfig","false",id);
  window.fbq("init",id,{},{autoConfig:false,xfbml:false});
  window.__metaPixelsInited=window.__metaPixelsInited||{};
  window.__metaPixelsInited[id]=true;
}
function firePageView(){
  if(!window.fbq)return false;
  if(alreadySent())return true;
  ensureInit();
  window.fbq("trackSingle",id,"PageView");
  markSent();
  return true;
}
if(firePageView())return;
var attempts=0;
var timer=setInterval(function(){
  if(firePageView()||++attempts>=100)clearInterval(timer);
},50);
})();`;
}
