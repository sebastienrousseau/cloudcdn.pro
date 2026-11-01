#!/usr/bin/env node
/**
 * Live edge-header check for cloudcdn.pro.
 *
 * Several headers are set (or overridden) by Cloudflare zone rules that
 * live outside this repo (see docs/CLOUDFLARE.md). This script requests
 * real assets the way a browser on another site would and fails when the
 * edge stops serving them cross-site: wrong Cross-Origin-Resource-Policy,
 * missing CORS, hotlink protection returning 403, or a missing security
 * header on HTML.
 *
 * Usage: node scripts/check-edge-headers.mjs [--base https://cloudcdn.pro]
 * Exit code 0 when every check passes, 1 otherwise.
 */

const CROSS_SITE_REQUEST = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  Referer: 'https://edge-header-check.example/',
  Origin: 'https://edge-header-check.example',
  'Sec-Fetch-Site': 'cross-site',
  'Sec-Fetch-Mode': 'no-cors',
};

const ASSET_HEADERS = {
  'cross-origin-resource-policy': 'cross-origin',
  'access-control-allow-origin': '*',
};

// One asset per extension that Cloudflare Hotlink Protection covers
// (ico, png) plus the formats it does not (webp, svg, css), on both the
// Functions-routed and the static-only paths.
export const CHECKS = [
  { path: '/clients/sebastienrousseau/favicon.ico', type: 'image/', headers: ASSET_HEADERS },
  { path: '/clients/sebastienrousseau/v1/icons/192x192.png', type: 'image/', headers: ASSET_HEADERS },
  { path: '/stocks/images/sebastienrousseau-320.webp', type: 'image/', headers: ASSET_HEADERS },
  { path: '/clients/common/images/buttons/x-black.svg', type: 'image/', headers: ASSET_HEADERS },
  { path: '/cdn/shared/theme.css', type: 'text/css', headers: ASSET_HEADERS },
  {
    path: '/',
    type: 'text/html',
    headers: { 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff' },
    present: ['content-security-policy', 'strict-transport-security'],
  },
];

/** Returns a list of human-readable problems for one response. */
export function evaluate(check, status, headers) {
  const problems = [];
  if (status !== 200) problems.push(`status ${status}, expected 200`);
  const type = headers.get('content-type') ?? '';
  if (!type.startsWith(check.type)) problems.push(`content-type "${type}", expected ${check.type}*`);
  for (const [name, want] of Object.entries(check.headers)) {
    const got = headers.get(name);
    if (got !== want) problems.push(`${name}: "${got}", expected "${want}"`);
  }
  for (const name of check.present ?? []) {
    if (!headers.get(name)) problems.push(`${name} missing`);
  }
  return problems;
}

export async function runChecks(base, fetchImpl = fetch) {
  const results = [];
  for (const check of CHECKS) {
    const url = `${base}${check.path}?edge-check=${Date.now()}`;
    const res = await fetchImpl(url, { headers: CROSS_SITE_REQUEST, redirect: 'manual' });
    results.push({ path: check.path, problems: evaluate(check, res.status, res.headers) });
  }
  return results;
}

async function main(argv) {
  const i = argv.indexOf('--base');
  const base = (i >= 0 ? argv[i + 1] : 'https://cloudcdn.pro').replace(/\/$/, '');
  const results = await runChecks(base);
  for (const { path, problems } of results) {
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${path}`);
    for (const p of problems) console.log(`       ${p}`);
  }
  return results.every((r) => r.problems.length === 0) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main(process.argv.slice(2));
}
