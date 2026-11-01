# Cloudflare zone configuration

cloudcdn.pro serves assets to other domains. Part of what makes that work
lives in the Cloudflare dashboard, not in this repo, and a zone setting
can override what `functions/_middleware.js` sends. This page records the
zone state the code depends on. `scripts/check-edge-headers.mjs` checks the
live result daily and after every deploy (`.github/workflows/edge-headers.yml`).

Recorded 2026-11-01. Plan: Free.

## Settings this repo depends on

| Setting | Required value | Why |
| :--- | :--- | :--- |
| Rules → Transform Rules → Response Header → "Security Headers" | `Cross-Origin-Resource-Policy: cross-origin` | The rule runs after the middleware and overwrites it. `same-site` makes Chrome block every asset on other domains (`ERR_BLOCKED_BY_RESPONSE.NotSameSite`). |
| Scrape Shield → Hotlink Protection | Off | When on, any `.png`/`.jpg`/`.gif`/`.ico` requested with a foreign `Referer` gets a 403 HTML page. |
| Security → Bots → Bot Fight Mode | Off | Cannot be skipped per path on Free; challenges image proxies and server-side fetchers. |
| Security → Bots → JavaScript Detections | Off | When on, the edge injects an inline script into every HTML page, which the strict `script-src 'self'` CSP in `functions/_middleware.js` would block. |
| Rate limiting rule | GET/HEAD, 100 per 10 s per IP, **excluding** `/stocks/`, `/clients/`, `/cdn/` | Cached assets cost nothing; offices behind one NAT would otherwise get broken images. |
| SSL/TLS mode | Full (strict) | Origin is `cloudcdn-pro.pages.dev`, which has a valid certificate. |
| DNSSEC | Active | Registrar is Cloudflare; the DS record is published automatically. |

## Other zone rules (not header-affecting)

- Custom WAF rule: block methods other than GET/HEAD/OPTIONS, and `/.git`, `/.env`, `/.aws`.
- Cache rule "Cache Static Assets": edge TTL 30 days, browser TTL 7 days, by file extension.
- Compression rule: zstd, Brotli, gzip for text, JSON, fonts, SVG and icons.
- Redirect rule: `www.cloudcdn.pro` → `cloudcdn.pro` (301).
- Managed transform: remove `X-Powered-By`.
- Enabled: HTTP/2, HTTP/3, 0-RTT, TLS 1.3, post-quantum key exchange, ECH,
  Early Hints, Tiered Cache, Always Use HTTPS, HSTS (1 year, preload),
  minimum TLS 1.2.

## Using the CDN from another domain

No setup is needed on the other zone. The consuming site only has to allow
`https://cloudcdn.pro` in its own Content-Security-Policy (`img-src`, and
`font-src` / `style-src` / `script-src` for those asset types).

## Known limitation: CORS preflight on static-only paths

Paths excluded in `_routes.json` (`/cdn/shared/*`, `/cdn/*/dist/*`,
favicons, `/.well-known/*`, `/coverage/*`) are served without the Functions
middleware, so an `OPTIONS` preflight returns 405. Plain `<img>`, `<link>`,
`<script>` and `@font-face` loads, and simple `fetch()` calls, never send a
preflight and are unaffected; only a cross-site `fetch()` with custom request
headers is. Routing these paths through Functions would fix it but spends
the Free plan's daily Function quota on every request, so it is left as is.

## Changing a zone setting

Change it in the dashboard, update this page in the same PR as any code
that depends on it, and run `node scripts/check-edge-headers.mjs`.
