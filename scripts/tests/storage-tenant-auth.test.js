import { describe, it, expect, vi } from 'vitest';

const storage = await import('../../functions/api/storage/[[path]].js');
const batch = await import('../../functions/api/storage/batch.js');
const auth = await import('../../functions/api/storage/_auth.js');

const TOKEN = 'cdn_test_PREFIXAA_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

function makeAccountDb(ownedSlugs = ['akande']) {
  return {
    prepare: vi.fn((sql) => ({
      bind: vi.fn((...args) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM api_keys')) {
            return {
              id: 'key-1', account_id: 'account-1',
              scopes: '["storage:read","storage:write"]',
              expires_at: null, revoked_at: null,
            };
          }
          if (sql.includes('FROM account_zones')) {
            return ownedSlugs.includes(args[1]) ? { id: `zone-${args[1]}` } : null;
          }
          return null;
        }),
        all: vi.fn(async () => ({ results: ownedSlugs.map(slug => ({ slug })) })),
        run: vi.fn(async () => ({ success: true })),
      })),
    })),
  };
}

function makeContext(path, { method = 'GET', ownedSlugs, body, url } = {}) {
  const headers = new Headers({ Authorization: `Bearer ${TOKEN}` });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const request = new Request(
    url || `https://cloudcdn.pro/api/storage/${path.join('/')}`,
    { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) },
  );
  const manifest = [
    { name: 'logo.svg', path: 'akande/v1/logo.svg', project: 'akande', size: 10 },
    { name: 'logo.svg', path: 'other/v1/logo.svg', project: 'other', size: 10 },
    { name: 'photo.webp', path: 'stocks/images/photo.webp', project: 'stocks', size: 10 },
  ];
  return {
    request,
    params: { path },
    env: {
      ACCOUNTS_DB: makeAccountDb(ownedSlugs),
      GITHUB_TOKEN: 'github-token',
      GITHUB_REPO: 'owner/repo',
      ASSETS: {
        fetch: vi.fn(async (input) => {
          const target = input instanceof URL
            ? input.href
            : (typeof input === 'string' ? input : input.url);
          return target.endsWith('/manifest.json')
            ? new Response(JSON.stringify(manifest))
            : new Response('asset');
        }),
      },
    },
    waitUntil: vi.fn(),
  };
}

describe('account-scoped storage authorization', () => {
  it('retains the account principal from a D1 API key', async () => {
    const ctx = makeContext(['clients', 'akande', 'v1', 'logo.svg']);
    const principal = await auth.authenticateStorage(ctx.request, ctx.env, 'storage:read');
    expect(principal).toMatchObject({ kind: 'account', accountId: 'account-1' });
  });

  it('allows an owned zone and rejects another account zone', async () => {
    const owned = makeContext(['clients', 'akande', 'v1', 'logo.svg']);
    expect((await storage.onRequestGet(owned)).status).toBe(200);

    const foreign = makeContext(['clients', 'other', 'v1', 'logo.svg']);
    expect((await storage.onRequestGet(foreign)).status).toBe(403);
  });

  it('rejects account-key access to the shared stocks namespace', async () => {
    const ctx = makeContext(['stocks', 'images', 'photo.webp']);
    expect((await storage.onRequestGet(ctx)).status).toBe(403);
  });

  it('rejects account-key directory listings in the stocks namespace', async () => {
    const ctx = makeContext(['stocks', 'images', ''], {
      url: 'https://cloudcdn.pro/api/storage/stocks/images/',
    });
    expect((await storage.onRequestGet(ctx)).status).toBe(403);
  });

  it('filters directory listings to zones owned by the account', async () => {
    const ctx = makeContext(['clients', ''], {
      url: 'https://cloudcdn.pro/api/storage/clients/',
    });
    const res = await storage.onRequestGet(ctx);
    expect(res.status).toBe(200);
    const names = (await res.json()).map(entry => entry.ObjectName);
    expect(names).toEqual(['akande']);
  });

  it('authorizes legacy-style client paths against their first segment', async () => {
    const ctx = makeContext(['akande', 'v1', ''], {
      url: 'https://cloudcdn.pro/api/storage/akande/v1/',
    });
    expect((await storage.onRequestGet(ctx)).status).toBe(200);
  });

  it('rejects a batch when any destination belongs to another account', async () => {
    const ctx = makeContext([], {
      method: 'POST',
      url: 'https://cloudcdn.pro/api/storage/batch',
      body: {
        files: [
          { path: 'clients/akande/v1/ok.svg', content: 'PHN2Zy8+' },
          { path: 'clients/other/v1/no.svg', content: 'PHN2Zy8+' },
        ],
      },
    });
    const res = await batch.onRequestPost(ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ HttpCode: 403 });
  });

  it('keeps legacy administrators unrestricted', async () => {
    expect(await auth.accountOwnsStoragePath({}, { kind: 'admin' }, 'stocks/images/photo.webp')).toBe(true);
  });

  it('fails closed for a malformed account principal', async () => {
    expect(await auth.accountOwnsStoragePath({}, { kind: 'account' }, 'clients/akande/logo.svg')).toBe(false);
    expect(await auth.accountStorageSlugs({}, null)).toBe(null);
  });
});
