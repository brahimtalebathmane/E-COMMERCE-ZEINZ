import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

/** Must stay in sync with `meta-pixel-client.ts` dedupe keys. */
export const META_PAGEVIEW_STORAGE_PREFIX = "meta_pageview_v1:";
export const META_TRACKED_EVENT_STORAGE_PREFIX = "meta_tracked_event_v1:";

/**
 * Inline script for product landing pages — fires init + PageView before React hydrates.
 * MetaPixelRuntime dedupes on hydration so this never double-counts.
 */
export function buildMetaPixelLandingPageViewScript(
  pixelId: string | null | undefined,
): string | null {
  const id = normalizeMetaPixelId(pixelId);
  if (!id) return null;

  const safeId = JSON.stringify(id);

  return `(function(){
var id=${safeId};
if(!id||!window.fbq)return;
var key=id+":"+location.pathname+location.search;
var pvKey=${JSON.stringify(META_PAGEVIEW_STORAGE_PREFIX)}+key;
try{if(sessionStorage.getItem(pvKey)==="1")return;}catch(e){}
if(window.__metaPixelPageViewSent&&window.__metaPixelPageViewSent[key])return;
window.fbq.disablePushState=true;
window.fbq("set","autoConfig","false",id);
window.fbq("init",id,{},{autoConfig:false,xfbml:false});
var eventID="pv:"+key;
var trackKey=${JSON.stringify(META_TRACKED_EVENT_STORAGE_PREFIX)}+id+":PageView:"+eventID;
try{
  if(sessionStorage.getItem(trackKey)==="1")return;
  sessionStorage.setItem(trackKey,"1");
  sessionStorage.setItem(pvKey,"1");
}catch(e){}
window.__metaPixelsInited=window.__metaPixelsInited||{};
window.__metaPixelsInited[id]=true;
window.__metaPixelPageViewSent=window.__metaPixelPageViewSent||{};
window.__metaPixelPageViewSent[key]=true;
window.fbq("trackSingle",id,"PageView",{},{eventID:eventID});
})();`;
}
