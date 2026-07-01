/** Official Meta fbq bootstrap (no pixel init — IDs are per product/page). */
export const META_PIXEL_BOOTSTRAP_JS = `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];n.disablePushState=!0;t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
if(s&&s.parentNode)s.parentNode.insertBefore(t,s);else(b.head||b.documentElement).appendChild(t)}
(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
`.trim();
