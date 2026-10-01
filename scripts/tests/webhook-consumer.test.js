import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const consumer = await import('../../functions/api/webhook_consumer.js');

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  // Stub setTimeout so the 5-second abort timer doesn't actually arm; we
  // still want clearTimeout to no-op cleanly.
  globalThis.setTimeout = (cb, _ms) => { void cb; return 0; };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

function makeMsg(body, overrides = {}) {
  return {
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function envelope(extra = {}) {
  return {
    webhookId: 'w-1',
    url: 'https://hook.example.com/cb',
    secret: null,
    event: 'asset.created',
    body: JSON.stringify({ event: 'asset.created', data: { path: '/x.png' } }),
    attempt: 0,
    ...extra,
  };
}

describe('webhookQueueHandler', () => {
  it('ack()s each message on successful delivery', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const m1 = makeMsg(envelope());
    const m2 = makeMsg(envelope({ webhookId: 'w-2', url: 'https://b.example.com/cb' }));
    await consumer.webhookQueueHandler({ messages: [m1, m2] }, {}, {});
    expect(m1.ack).toHaveBeenCalledTimes(1);
    expect(m2.ack).toHaveBeenCalledTimes(1);
    expect(m1.retry).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('signs the body with HMAC-SHA256 when a secret is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const msg = makeMsg(envelope({ secret: 'a'.repeat(40) }));
    await consumer.webhookQueueHandler({ messages: [msg] }, {}, {});
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers['X-Webhook-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('loads new-format delivery configuration from the webhook registry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const registry = JSON.stringify([{
      id: 'w-1',
      active: true,
      url: 'https://registry.example.com/cb',
      secret: 'registry-secret',
    }]);
    const env = { RATE_KV: { get: vi.fn().mockResolvedValue(registry) } };
    const msg = makeMsg({
      webhookId: 'w-1',
      event: 'asset.created',
      body: JSON.stringify({ event: 'asset.created' }),
    });
    await consumer.webhookQueueHandler({ messages: [msg] }, env, {});
    expect(msg.ack).toHaveBeenCalledTimes(1);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://registry.example.com/cb');
    expect(options.headers['X-Webhook-Signature']).toMatch(/^sha256=/);
  });

  it('retries identifier-only messages when the registry binding is absent', async () => {
    const msg = makeMsg({ webhookId: 'w-1', body: '{}' });
    await consumer.webhookQueueHandler({ messages: [msg] }, {}, {});
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 1 });
  });

  it('retries identifier-only messages for missing webhooks', async () => {
    const env = { RATE_KV: { get: vi.fn().mockResolvedValue('[]') } };
    const msg = makeMsg({ webhookId: 'missing', body: '{}' });
    await consumer.webhookQueueHandler({ messages: [msg] }, env, {});
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 1 });
  });

  it('retries with exponential backoff on a non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const msg = makeMsg(envelope({ attempt: 0 }));
    await consumer.webhookQueueHandler({ messages: [msg] }, {}, {});
    expect(msg.retry).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
    const [opts] = msg.retry.mock.calls[0];
    expect(opts.delaySeconds).toBeGreaterThan(0);
  });

  it('retries on network failure (fetch rejects)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connection reset'));
    const msg = makeMsg(envelope(), { attempts: 2 });
    await consumer.webhookQueueHandler({ messages: [msg] }, {}, {});
    expect(msg.retry).toHaveBeenCalledTimes(1);
    const [opts] = msg.retry.mock.calls[0];
    expect(opts.delaySeconds).toBeGreaterThanOrEqual(5);
  });

  it('escalates to DLQ (delaySeconds=0) after MAX_ATTEMPTS', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 502 }));
    const msg = makeMsg(envelope(), { attempts: 4 });
    await consumer.webhookQueueHandler({ messages: [msg] }, {}, {});
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 0 });
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('processes multiple messages independently — one ack, one retry', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const m1 = makeMsg(envelope());
    const m2 = makeMsg(envelope({ webhookId: 'w-2' }));
    await consumer.webhookQueueHandler({ messages: [m1, m2] }, {}, {});
    expect(m1.ack).toHaveBeenCalledTimes(1);
    expect(m1.retry).not.toHaveBeenCalled();
    expect(m2.ack).not.toHaveBeenCalled();
    expect(m2.retry).toHaveBeenCalledTimes(1);
  });

  it('default export points at the queue handler', () => {
    expect(consumer.default.queue).toBe(consumer.webhookQueueHandler);
  });
});
