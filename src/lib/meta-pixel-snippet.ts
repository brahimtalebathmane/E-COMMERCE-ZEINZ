import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

/** Meta’s standard bootstrap + init + PageView (Pixel Helper expects this shape in HTML). */
export function buildMetaPixelFullSnippet(rawPixelId: string): string | null {
  const id = normalizeMetaPixelId(rawPixelId);
  if (!id) return null;

  return `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
if(s&&s.parentNode)s.parentNode.insertBefore(t,s);else b.head.appendChild(t)}
(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${id}');
window.__metaPixelsInited=window.__metaPixelsInited||{};
window.__metaPixelsInited['${id}']=true;
`.trim();
}

/** Additional pixel when fbq already loaded (e.g. site-wide + product pixel). */
export function buildMetaPixelInitOnlySnippet(rawPixelId: string): string | null {
  const id = normalizeMetaPixelId(rawPixelId);
  if (!id) return null;

  return `
(function(){
var id='${id}';
window.__metaPixelsInited=window.__metaPixelsInited||{};
if(window.__metaPixelsInited[id])return;
if(!window.fbq){
  !function(f,b,e,v,n,t,s){
    if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    if(s&&s.parentNode)s.parentNode.insertBefore(t,s);else b.head.appendChild(t)
  }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
}
fbq('init',id);
window.__metaPixelsInited=window.__metaPixelsInited||{};
window.__metaPixelsInited[id]=true;
})();
`.trim();
}
