import { describe, it, expect } from 'vitest';
import { CHECKS, evaluate, runChecks } from '../check-edge-headers.mjs';

const image = CHECKS.find((c) => c.path.endsWith('.ico'));
const html = CHECKS.find((c) => c.path === '/');

const good = {
  'content-type': 'image/vnd.microsoft.icon',
  'cross-origin-resource-policy': 'cross-origin',
  'access-control-allow-origin': '*',
};

describe('evaluate', () => {
  it('passes a correctly served cross-site asset', () => {
    expect(evaluate(image, 200, new Headers(good))).toEqual([]);
  });

  it('flags CORP same-site (the 2026-11-01 zone-rule regression)', () => {
    const headers = new Headers({ ...good, 'cross-origin-resource-policy': 'same-site' });
    expect(evaluate(image, 200, headers)).toEqual([
      'cross-origin-resource-policy: "same-site", expected "cross-origin"',
    ]);
  });

  it('flags the Hotlink Protection 403 page', () => {
    const headers = new Headers({ 'content-type': 'text/html; charset=UTF-8' });
    const problems = evaluate(image, 403, headers);
    expect(problems).toContain('status 403, expected 200');
    expect(problems).toContain('content-type "text/html; charset=UTF-8", expected image/*');
  });

  it('requires security headers on HTML', () => {
    const headers = new Headers({
      'content-type': 'text/html; charset=utf-8',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'strict-transport-security': 'max-age=31536000',
    });
    expect(evaluate(html, 200, headers)).toEqual(['content-security-policy missing']);
  });
});

describe('runChecks', () => {
  it('requests every path cross-site without following redirects', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return { status: 200, headers: new Headers(good) };
    };
    const results = await runChecks('https://cdn.test', fetchImpl);
    expect(results).toHaveLength(CHECKS.length);
    expect(calls[0].url).toMatch(/^https:\/\/cdn\.test\/clients\/sebastienrousseau\/favicon\.ico\?edge-check=\d+$/);
    expect(calls[0].init.redirect).toBe('manual');
    expect(calls[0].init.headers['Sec-Fetch-Site']).toBe('cross-site');
  });
});
