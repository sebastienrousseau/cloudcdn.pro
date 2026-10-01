import { authenticateAccess } from '../_shared.js';
import { authenticateWithScope } from '../tokens.js';
import { getDB } from '../auth/_lib.js';

/**
 * Authenticate storage callers while retaining the account identity carried
 * by D1 API keys. Legacy scoped tokens and AccessKey/session callers remain
 * repository administrators for backwards compatibility.
 */
export async function authenticateStorage(request, env, scope) {
  return authenticateWithScope(request, env, scope, () => authenticateAccess(request, env));
}

export function storageZoneSlug(path) {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0 || segments[0] === 'stocks') return null;
  if (segments[0] === 'clients') return segments[1] || null;
  return segments[0];
}

export async function accountOwnsStoragePath(env, principal, path) {
  if (principal?.kind === 'admin') return true;
  if (principal?.kind !== 'account' || !principal.accountId) return false;

  const slug = storageZoneSlug(path);
  if (!slug) return false;
  const row = await getDB(env)
    .prepare(
      `SELECT id FROM account_zones
       WHERE account_id = ?1 AND slug = ?2 AND deleted_at IS NULL`
    )
    .bind(principal.accountId, slug).first();
  return !!row;
}

export async function accountStorageSlugs(env, principal) {
  if (principal?.kind !== 'account' || !principal.accountId) return null;
  const result = await getDB(env)
    .prepare(
      `SELECT slug FROM account_zones
       WHERE account_id = ?1 AND deleted_at IS NULL`
    )
    .bind(principal.accountId).all();
  return new Set((result?.results || []).map(row => row.slug));
}
