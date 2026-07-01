import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

/** Must stay in sync with `meta-pixel-client.ts` route dedupe keys. Bump when dedupe logic changes. */
export const META_PAGEVIEW_STORAGE_PREFIX = "meta_pageview_v3:";

/**
 * Inline script for product landing pages — fires init + standard PageView before React hydrates.
 * Polls until fbq exists and the pixel is registered; never marks dedupe unless trackSingle is queued.
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
  if(!window.fbq)return;
  window.fbq.disablePushState=true;
  window.fbq("set","autoConfig","false",id);
  window.fbq("init",id,{},{autoConfig:false,xfbml:false});
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
function firePageView(){
  if(!window.fbq)return false;
  if(alreadySent())return true;
  ensureInit();
  if(!pixelRegistered()&&!initInFlight())return false;
  if(!pixelRegistered())return false;
  window.fbq("trackSingle",id,"PageView");
  markSent();
  return true;
}
if(firePageView())return;
var attempts=0;
var timer=setInterval(function(){
  if(firePageView()||++attempts>=120)clearInterval(timer);
},50);
})();`;
}
