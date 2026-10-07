/** Static local callback page; OAuth parameters never appear in the HTML. */
export function oauthCallbackPage(outcome: 'received' | 'failed', service: string): string {
  const failed = outcome === 'failed'
  const title = failed ? 'Sign-in interrupted' : 'Return to OpenPulse'
  const message = failed
    ? 'We couldn’t complete authorization. Return to the app and try signing in again.'
    : `Authorization received. OpenPulse will finish connecting ${service} in the app.`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · OpenPulse</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100svh; padding: 32px 24px; display: grid; place-items: center; background: radial-gradient(ellipse at 50% 40%, #181822 0, #0e0f12 65%); color: #edeef2; color-scheme: dark; font: 16px/1.6 'Archivo', 'Helvetica Neue', sans-serif; -webkit-font-smoothing: antialiased; }
    main { width: 100%; max-width: 460px; text-align: center; }
    header { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 56px; font-size: 20px; font-weight: 650; letter-spacing: -.5px; }
    header svg { width: 36px; height: 36px; flex-shrink: 0; }
    .status { display: block; width: 72px; height: 72px; margin: 0 auto 28px; color: ${failed ? '#e0544e' : '#a19fff'}; }
    h1 { margin: 0 0 16px; font-size: clamp(28px, 6vw, 36px); font-weight: 600; line-height: 1.2; letter-spacing: -1px; }
    p { max-width: 380px; margin: 0 auto; color: #9ba0ab; }
    small { display: block; margin-top: 40px; color: #858995; font-size: 13px; }
    @media (max-height: 540px) { header { margin-bottom: 28px; } small { margin-top: 24px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <svg aria-hidden="true" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="14" fill="#e11d48"/>
        <g transform="translate(4 4)">
          <path d="M20 33.9 C10.2 25.5 3.2 19.8 3.2 13 C3.2 8.4 6.8 5.1 11.1 5.1 C14.7 5.1 17.8 7.5 20 11 C22.2 7.5 25.3 5.1 28.9 5.1 C33.2 5.1 36.8 8.4 36.8 13 C36.8 19.8 29.8 25.5 20 33.9 Z" fill="white"/>
          <path d="M4.4 18.6 H16.2 L18.6 11.4 L21.7 26 L24.1 15.7 L25.9 18.6 H35.6" stroke="#e11d48" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </svg>
      OpenPulse
    </header>
    <svg class="status" aria-hidden="true" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="35" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-opacity=".18"/>
      ${failed
        ? '<path d="M36 23v16m0 9h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
        : '<path d="m24 36 8 8 16-16" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'}
    </svg>
    <h1>${title}</h1>
    <p>${message}</p>
    <small>You can close this browser tab.</small>
  </main>
</body>
</html>`
}

export const OAUTH_CALLBACK_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff'
}
