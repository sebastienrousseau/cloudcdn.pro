/**
 * Webhook delivery consumer — Cloudflare Queues handler.
 *
 * This file is the canonical reference shape for a Worker that consumes
 * messages produced by dispatchWebhook in functions/api/webhooks.js.
 * Cloudflare Pages itself does not run queue consumers — they must be
 * deployed as a separate Worker that binds the same queue.
 *
 * Operator setup (one-time) — the scaffolded consumer Worker is at
 * workers/webhook-consumer/ in this repo. To activate:
 *
 *   1. Create the queues:
 *        npx wrangler queues create cloudcdn-webhooks
 *        npx wrangler queues create cloudcdn-webhooks-dlq
 *
 *   2. Deploy the consumer Worker:
 *        cd workers/webhook-consumer && npx wrangler deploy
 *      The Worker re-exports `webhookQueueHandler` from this file as
 *      `export default { queue: webhookQueueHandler }`.
 *
 *   3. Uncomment the `[[queues.producers]]` stanza in the repo-root
 *      wrangler.toml so Pages binds `env.WEBHOOK_QUEUE`. dispatchWebhook
 *      in webhooks.js auto-detects the binding and starts enqueueing.
 *
 * Retry semantics:
 *   - Cloudflare supplies `msg.attempts`. Delivery failures use that value
 *     for exponential backoff (1s, 5s, 25s, 125s). Once the application
 *     threshold is reached, the queue continues its configured retry and
 *     dead-letter policy without another application delay.
 *   - HMAC signing is identical to the inline path so receivers see the
 *     same `X-Webhook-Signature` header shape.
 */

import { decryptWebhookSecret, getWebhookById } from './webhooks.js';

const MAX_ATTEMPTS = 4;
const BACKOFFS_SEC = [1, 5, 25, 125];
const DELIVER_TIMEOUT_MS = 5_000;

async function signBody(secret, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

async function resolveDelivery(envelope, env) {
  // Support messages queued before v0.0.1 while draining the old format.
  if (envelope.url) return envelope;
  if (!env?.RATE_KV) throw new Error('Webhook registry is unavailable.');
  const webhook = await getWebhookById(env.RATE_KV, envelope.webhookId);
  if (!webhook?.active) throw new Error('Webhook is missing or inactive.');
  const secret = await decryptWebhookSecret(env, webhook);
  return { ...envelope, url: webhook.url, secret };
}

async function deliver(envelope, env) {
  const { url, body, secret } = await resolveDelivery(envelope, env);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'CloudCDN-Webhook/1.0',
  };
  if (secret) {
    const hex = await signBody(secret, body);
    headers['X-Webhook-Signature'] = `sha256=${hex}`;
  }
  const controller = new AbortController();
  /* v8 ignore next -- abort timer fires only when a receiver stalls > 5s */
  const timeoutId = setTimeout(() => controller.abort(), DELIVER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Webhook returned HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Cloudflare Queues consumer handler.
 *
 *   export default { queue: webhookQueueHandler };
 *
 * Each message is the envelope produced by dispatchWebhook:
 *   { webhookId, event, body }
 */
export async function webhookQueueHandler(batch, env, _ctx) {
  for (const msg of batch.messages) {
    const envelope = msg.body;
    try {
      await deliver(envelope, env);
      msg.ack();
    } catch (err) {
      const attempt = Number(msg.attempts) || 1;
      if (attempt >= MAX_ATTEMPTS) {
        // Final failure — let the queue infrastructure DLQ it.
        msg.retry({ delaySeconds: 0 });
        continue;
      }
      /* v8 ignore next -- attempt is bounded by MAX_ATTEMPTS so the
         ?? fallback is unreachable in practice; defensive only */
      const delaySeconds = BACKOFFS_SEC[attempt - 1] ?? BACKOFFS_SEC[BACKOFFS_SEC.length - 1];
      msg.retry({ delaySeconds });
      void err;
    }
  }
}

// Default export so the file is drop-in for a wrangler `main` entry.
export default { queue: webhookQueueHandler };
