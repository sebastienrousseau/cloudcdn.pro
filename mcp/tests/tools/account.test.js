import { afterEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;

function mockFetch(data = {}) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json' },
    })
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.resetModules();
});

describe('account tools', () => {
  async function getTools() {
    process.env.CLOUDCDN_BASE_URL = 'https://test.cdn';
    process.env.CLOUDCDN_ACCOUNT_KEY = 'ak_test';
    const { registerAccountTools } = await import('../../lib/tools/account.js');
    const tools = {};
    registerAccountTools({
      tool: (name, _description, _schema, handler) => { tools[name] = handler; },
    });
    return tools;
  }

  it('explains a cache result for the requested URL', async () => {
    mockFetch({ verdict: 'hit_fresh' });
    const tools = await getTools();
    const result = await tools.explain_cache_miss({ url: 'https://cloudcdn.pro/logo.svg' });
    expect(JSON.parse(result.content[0].text).verdict).toBe('hit_fresh');
    const url = new URL(globalThis.fetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/insights/cache-explain');
    expect(url.searchParams.get('url')).toBe('https://cloudcdn.pro/logo.svg');
  });

  it('gets and sets the account spend cap', async () => {
    mockFetch({ monthlyCapUsd: 25 });
    const tools = await getTools();
    const getResult = await tools.account_cap_get({});
    expect(JSON.parse(getResult.content[0].text).monthlyCapUsd).toBe(25);

    mockFetch({ monthlyCapUsd: 50 });
    const setResult = await tools.account_cap_set({ monthlyCapUsd: 50 });
    expect(JSON.parse(setResult.content[0].text).monthlyCapUsd).toBe(50);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/api/account/cap');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ monthlyCapUsd: 50 });
  });

  it('lists and provisions account zones', async () => {
    mockFetch({ zones: [{ name: 'docs' }] });
    const tools = await getTools();
    const listResult = await tools.account_zone_list({});
    expect(JSON.parse(listResult.content[0].text).zones[0].name).toBe('docs');

    mockFetch({ name: 'media', live: false });
    const provisionResult = await tools.account_zone_provision({
      name: 'Media',
      originUrl: 'https://origin.example.com',
    });
    expect(JSON.parse(provisionResult.content[0].text).name).toBe('media');
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/api/auth/onboarding/zone');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      name: 'Media',
      originUrl: 'https://origin.example.com',
    });
  });

  it('purges selected URLs and tags or sends an empty purge', async () => {
    mockFetch({ invalidated: 3 });
    const tools = await getTools();
    await tools.purge_cache({
      urls: ['https://cloudcdn.pro/a.svg'],
      tags: ['logos'],
      everything: true,
    });
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual({
      urls: ['https://cloudcdn.pro/a.svg'],
      tags: ['logos'],
      everything: true,
    });

    mockFetch({ invalidated: 0 });
    await tools.purge_cache({});
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual({});
  });

  it('deploys an edge rule without reshaping its input', async () => {
    mockFetch({ id: 'rule-1' });
    const tools = await getTools();
    const input = { name: 'docs', pattern: '/docs/*', action: 'cache', ttl: 60 };
    const result = await tools.deploy_function(input);
    expect(JSON.parse(result.content[0].text).id).toBe('rule-1');
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual(input);
  });

  it('gets analytics with and without an optional zone', async () => {
    mockFetch({ requests: 10 });
    const tools = await getTools();
    await tools.get_analytics({ zone: 'docs', range: '7d' });
    let url = new URL(globalThis.fetch.mock.calls[0][0]);
    expect(url.searchParams.get('zone')).toBe('docs');
    expect(url.searchParams.get('range')).toBe('7d');

    mockFetch({ requests: 20 });
    const result = await tools.get_analytics({ range: '24h' });
    expect(JSON.parse(result.content[0].text).requests).toBe(20);
    url = new URL(globalThis.fetch.mock.calls[0][0]);
    expect(url.searchParams.has('zone')).toBe(false);
    expect(url.searchParams.get('range')).toBe('24h');
  });
});
