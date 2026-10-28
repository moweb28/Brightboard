import { formatRoomCode } from '@classroom/protocol';

/** The page an invite link opens: it tries the app, and offers the download if the app isn't installed. */
export function invitePage(code: string | null, downloadUrl = ''): string {
  const appLink = code ? `brightboard://join/${code}` : '';
  const download = downloadUrl
    ? `<p class="small">Don’t have the app yet? <a href="${escapeHtml(downloadUrl)}">Download Brightboard for Windows</a></p>
       <p class="small" dir="rtl" lang="ar">ليس لديك التطبيق؟ <a href="${escapeHtml(downloadUrl)}">نزّل Brightboard لويندوز</a></p>`
    : '';
  const body = code
    ? `<h1>You’re invited</h1>
       <p class="code">${formatRoomCode(code)}</p>
       <a class="btn" href="/?join=${code}">Join in your browser</a>
       <p class="small" dir="rtl" lang="ar"><a href="/?join=${code}">انضم من المتصفح</a></p>
       <div id="desktop" hidden>
         <a class="btn btn-alt" href="${appLink}">Open in the Brightboard app</a>
         ${download}
       </div>
       <script>
         // Only Windows has the app: elsewhere (phones, tablets) trying brightboard:// just shows an error.
         if (/Windows/.test(navigator.userAgent)) {
           document.getElementById('desktop').hidden = false;
           setTimeout(function(){ location.href = ${JSON.stringify(appLink)}; }, 300);
         }
       </script>`
    : `<h1>That link doesn’t work</h1><p>Check it with whoever invited you.</p><p dir="rtl" lang="ar">هذا الرابط لا يعمل. تحقق منه مع من دعاك.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brightboard invite</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1f2024;color:#f2f3f5;font-family:system-ui,'Segoe UI',sans-serif;padding:16px}
  main{background:#2d2f33;border-radius:12px;padding:36px 32px;max-width:420px;width:100%;box-sizing:border-box;text-align:center}
  .brand{font-weight:700;font-size:15px;color:#a5a8ff;margin-bottom:20px}
  h1{font-size:24px;margin:0 0 8px;letter-spacing:-.02em}
  .code{font-family:Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:.1em;color:#f2f3f5;margin:0 0 20px}
  p{color:#a4a6ad;margin:6px 0}.small{font-size:14px}
  .btn{display:block;background:#5b5bd6;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px;margin:8px 0 14px}
  .btn-alt{background:#3a3c42;margin-top:22px}
  a{color:#a5a8ff}
</style></head>
<body><main><div class="brand">Brightboard</div>${body}</main></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
