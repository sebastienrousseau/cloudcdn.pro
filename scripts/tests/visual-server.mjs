// SPDX-License-Identifier: MIT OR Apache-2.0

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT || 8788);
const MIME_TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function resolveRequest(pathname) {
  const relative = pathname.startsWith('/en/') || pathname.startsWith('/shared/')
    ? `cdn${pathname}`
    : pathname.slice(1);
  let target = resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(`${ROOT}${sep}`)) return null;
  try {
    if (statSync(target).isDirectory()) target = resolve(target, 'index.html');
    return statSync(target).isFile() ? target : null;
  } catch {
    return null;
  }
}

createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad Request');
    return;
  }
  const target = resolveRequest(pathname);
  if (!target) {
    response.writeHead(404).end('Not Found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(target)] || 'application/octet-stream',
  });
  createReadStream(target).pipe(response);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Visual test server listening on http://127.0.0.1:${PORT}`);
});
