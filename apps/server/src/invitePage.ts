import { formatRoomCode } from '@classroom/protocol';

export const APP_PROTOCOL = 'brightboard';

/** The page someone lands on from an invite link. Tries to open the app, with a download fallback. */
export function invitePage(code: string | null, downloadUrl: string, title?: string): string {
  const appLink = code ? `${APP_PROTOCOL}://join/${code}` : '';
  const body = code
    ? `<h1>${title ? escapeHtml(title) : 'Join on Brightboard'} <span class="code">${formatRoomCode(code)}</span></h1>
       <p>Opening Brightboard… <span dir="rtl">جارٍ فتح Brightboard…</span></p>
       <a class="btn" href="${appLink}">Open Brightboard</a>
       <p class="small">Don't have the app yet? <a href="${downloadUrl}">Download Brightboard</a></p>
       <script>setTimeout(function(){ location.href = ${JSON.stringify(appLink)}; }, 300);</script>`
    : `<h1>Space not found</h1><p>Check the link with whoever invited you.</p><p dir="rtl">لم يتم العثور على المساحة. تحقق من الرابط مع من دعاك.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brightboard</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fffaf2;color:#1f2340;font-family:system-ui,'Segoe UI',sans-serif;padding:16px}
  main{background:#fff;border-radius:24px;padding:40px;max-width:440px;text-align:center;box-shadow:0 10px 40px rgba(31,35,64,.08)}
  .logo{font-weight:800;font-size:22px;color:#4f46e5;margin-bottom:24px}
  h1{font-size:24px;margin:0 0 12px}.code{font-family:Consolas,monospace;color:#4f46e5;letter-spacing:.08em}
  p{color:#5b6080}.small{font-size:14px}
  .btn{display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:14px;margin:12px 0}
  a{color:#4f46e5}
</style></head>
<body><main><div class="logo">☀ Brightboard</div>${body}</main></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
