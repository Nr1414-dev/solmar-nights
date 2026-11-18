// A tiny static server for game/ (Node 22, standard library only), so the
// entry can be played locally without a build step: `node serve.ts` serves
// game/ on http://localhost:8080. It sends the MIME types a browser game
// needs and refuses any path outside game/. `node serve.ts --dir <path>`
// serves another directory instead (handy for checking a built /output),
// `--quiet` silences the per-request log, and GET /__health answers
// {"ok":true} so a smoke test can tell the server is up without a page.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const root = resolve(fileURLToPath(new URL(dirIndex === -1 ? './game' : args[dirIndex + 1] ?? './game', import.meta.url)));
const quiet = args.includes('--quiet');
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://localhost');
  const log = (line) => { if (!quiet) console.log(line); };
  if (url.pathname === '/__health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end('{"ok":true}');
    log(`${method} /__health -> 200`);
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    log(`${method} ${url.pathname} -> 400`);
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden');
    log(`${method} ${pathname} -> 403`);
    return;
  }
  let size;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    log(`${method} ${pathname} -> 404`);
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  log(`${method} ${pathname} -> 200 (${size} bytes)`);
  // A HEAD request gets the headers (content-type, length) and no body.
  if (method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});
