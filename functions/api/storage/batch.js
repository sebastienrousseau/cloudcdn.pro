/**
 * Batch upload endpoint — bundles multiple files into a single Git commit.
 *
 * POST /api/storage/batch
 * Body: { "files": [{ "path": "clients/akande/v1/logos/new.svg", "content": "<base64>", "encoding": "base64" }] }
 *
 * Uses the GitHub Git Database API (Trees + Commits) to avoid
 * 409 conflicts from concurrent Contents API calls.
 */

import { fetchWithTimeout, log, cdnOrigin } from '../_shared.js';
import { authenticateStorage, accountOwnsStoragePath } from './_auth.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'AccessKey, Authorization, Content-Type',
  'Content-Type': 'application/json',
};

const MAX_BATCH_SIZE = 50;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const STORAGE_ROOTS = new Set(['clients', 'stocks']);

/**
 * Canonicalise a caller-supplied asset path and confine it to the two
 * repository directories that form the public storage hierarchy.
 */
export function normalizeStoragePath(path) {
  if (typeof path !== 'string' || path.length === 0) return null;
  if (path.includes('\\') || path.includes('\0')) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }

  if (decoded.startsWith('/') || decoded.endsWith('/')) return null;
  const segments = decoded.split('/');
  if (segments.length < 2 || segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
  if (!STORAGE_ROOTS.has(segments[0])) return null;
  if (segments.some(segment => /[\u0000-\u001f\u007f]/.test(segment))) return null;
  return segments.join('/');
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'CloudCDN',
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const principal = await authenticateStorage(request, env, 'storage:write');
  if (!principal) {
    return new Response(JSON.stringify({ HttpCode: 401, Message: 'Authentication required. Provide a valid API key in the request header. Use "AccessKey" for storage and asset operations, or "AccountKey" for zone management and analytics. Scoped tokens with "storage:write" are also accepted as Bearer tokens.' }), {
      status: 401, headers: CORS_HEADERS,
    });
  }

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return new Response(JSON.stringify({
      HttpCode: 501,
      Message: 'Batch uploads require the GITHUB_TOKEN and GITHUB_REPO environment variables to be configured. Set these in your Cloudflare Pages project settings under Environment Variables.',
    }), { status: 501, headers: CORS_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ HttpCode: 400, Message: 'The request body contains invalid JSON and could not be parsed. Verify the payload is well-formed JSON with correct syntax, including matching brackets and properly quoted strings.' }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const files = body.files;
  if (!Array.isArray(files) || files.length === 0) {
    return new Response(JSON.stringify({ HttpCode: 400, Message: 'The request body must include a "files" array containing at least one file object. Each object requires "path" and "content" fields. Maximum batch size is 50 files per request.' }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  if (files.length > MAX_BATCH_SIZE) {
    return new Response(JSON.stringify({
      HttpCode: 400, Message: `The batch request exceeds the maximum of ${MAX_BATCH_SIZE} files per request. Split your upload into multiple batch requests of ${MAX_BATCH_SIZE} files or fewer. Each batch is committed atomically as a single Git commit.`,
    }), { status: 400, headers: CORS_HEADERS });
  }

  // Validate all files and retain only canonical, storage-confined paths.
  const validatedFiles = [];
  for (const file of files) {
    if (!file.path || !file.content) {
      return new Response(JSON.stringify({
        HttpCode: 400, Message: 'Each file object in the batch array must include both "path" (string, the destination path) and "content" (string, base64-encoded file data). Optional: "encoding" defaults to "base64".',
      }), { status: 400, headers: CORS_HEADERS });
    }
    const canonicalPath = normalizeStoragePath(file.path);
    if (!canonicalPath) {
      return new Response(JSON.stringify({
        HttpCode: 400, Message: `Invalid path: ${file.path}. File paths must be relative paths beneath clients/ or stocks/ and must not contain traversal segments, control characters, backslashes, empty segments, or malformed percent escapes.`,
      }), { status: 400, headers: CORS_HEADERS });
    }
    // Check base64 size (~4/3 of original)
    const estimatedSize = (file.content.length * 3) / 4;
    if (estimatedSize > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({
        HttpCode: 413,
        Message: `File ${file.path} exceeds the maximum allowed size of ${MAX_FILE_SIZE / 1048576} MB. Reduce the file size by compressing or resizing the asset before uploading. For large files, consider splitting into smaller chunks or using a different storage backend.`,
      }), { status: 413, headers: CORS_HEADERS });
    }
    validatedFiles.push({ ...file, path: canonicalPath });
  }

  for (const file of validatedFiles) {
    if (!await accountOwnsStoragePath(env, principal, file.path)) {
      return new Response(JSON.stringify({ HttpCode: 403, Message: `This API key does not have access to the storage zone for ${file.path}.` }), {
        status: 403, headers: CORS_HEADERS,
      });
    }
  }

  const repo = env.GITHUB_REPO;
  const headers = ghHeaders(env.GITHUB_TOKEN);
  const branch = 'main';

  try {
    // 1. Get current HEAD
    const refRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/git/ref/heads/${branch}`, { headers });
    if (!refRes.ok) throw new Error('Failed to get branch ref');
    const headSha = (await refRes.json()).object.sha;

    // 2. Get base tree
    const commitRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/git/commits/${headSha}`, { headers });
    if (!commitRes.ok) throw new Error('Failed to get commit');
    const baseTree = (await commitRes.json()).tree.sha;

    // 3. Create blobs for each file
    const treeEntries = [];
    for (const file of validatedFiles) {
      const blobRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/git/blobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: file.content, encoding: file.encoding || 'base64' }),
      });
      if (!blobRes.ok) throw new Error('Failed to create blob');
      const blob = await blobRes.json();
      treeEntries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      });
    }

    // 4. Create tree
    const treeRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ base_tree: baseTree, tree: treeEntries }),
    });
    if (!treeRes.ok) throw new Error('Failed to create tree');
    const treeSha = (await treeRes.json()).sha;

    // 5. Create commit (auto-signed by GitHub)
    const paths = validatedFiles.map(f => f.path).join(', ');
    const commitMsg = validatedFiles.length === 1
      ? `chore: upload ${paths} via Storage API [skip ci]`
      : `chore: batch upload ${validatedFiles.length} files via Storage API [skip ci]`;

    const newCommitRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: commitMsg, parents: [headSha], tree: treeSha }),
    });
    if (!newCommitRes.ok) throw new Error('Failed to create commit');
    const commitSha = (await newCommitRes.json()).sha;

    // 6. Update branch ref
    const updateRes = await fetchWithTimeout(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: commitSha }),
    });
    if (!updateRes.ok) throw new Error('Failed to update branch');

    // 7. Async cache purge for all uploaded paths
    if (env.CLOUDFLARE_ZONE_ID && env.CLOUDFLARE_API_TOKEN) {
      const origin = cdnOrigin(request.url);
      const urls = validatedFiles.map(f => {
        const publicPath = f.path.startsWith('clients/') ? f.path.slice('clients/'.length) : f.path;
        return `${origin}/${publicPath}`;
      });
      context.waitUntil(
        fetch(`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: urls }),
        }).catch(() => {})
      );
    }

    return new Response(JSON.stringify({
      HttpCode: 201,
      Message: `${validatedFiles.length} file(s) uploaded successfully in a single atomic commit. The files have been committed to the repository and will be available at the edge after the CI/CD pipeline completes deployment (approximately 60-90 seconds).`,
      Commit: commitSha,
      Files: validatedFiles.map(f => f.path),
      EdgeStatus: 'pending',
      EdgeNote: 'Files committed. Available at the edge after CI/CD deploy (~60-90 seconds).',
      DateCreated: new Date().toISOString(),
    }, null, 2), { status: 201, headers: CORS_HEADERS });

  } catch (err) {
    log.error('BATCH_UPLOAD_ERROR', err.message);
    return new Response(JSON.stringify({
      HttpCode: 500,
      Message: 'The batch upload failed due to an unexpected error. Verify your credentials and try again.',
    }), { status: 500, headers: CORS_HEADERS });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' },
  });
}
