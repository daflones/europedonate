import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
export function createHandler(directory) {
  const root = resolve(directory);
  return async function handler(request, response) {
    const security = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-cache' };
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, security); response.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { response.writeHead(400, security); response.end('Bad request'); return; }
    if (pathname === '/healthz') { response.writeHead(200, { ...security, 'Content-Type': 'text/plain' }); response.end(request.method === 'HEAD' ? undefined : 'ok'); return; }
    if (pathname.split('/').some(part => part.startsWith('.'))) { response.writeHead(404, security); response.end('Not found'); return; }
    let path = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!path.startsWith(root + sep)) { response.writeHead(404, security); response.end('Not found'); return; }
    if (!extname(path)) path += '.html';
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not-file');
      const data = await readFile(path);
      response.writeHead(200, { ...security, 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Content-Length': data.length });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch { response.writeHead(404, { ...security, 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Page not found'); }
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 3000);
  const root = fileURLToPath(new URL('../dist/', import.meta.url));
  createServer(createHandler(root)).listen(port, '0.0.0.0', () => console.log(`Kindora Paws is available on port ${port}`));
}
