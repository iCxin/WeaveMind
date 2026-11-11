import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = resolve(process.cwd());
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = normalize(decoded).replace(/^([/\\])+/, '');
  const abs = resolve(join(ROOT, rel));
  if (!abs.startsWith(ROOT + sep) && abs !== ROOT) return null;
  return abs;
}

async function exists(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}

const server = createServer(async (req, res) => {
  try {
    let pathname = (req.url || '/').split('?')[0];
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    const abs = safePath(pathname);
    if (!abs) { res.writeHead(403).end('forbidden'); return; }

    const file = (await exists(abs)) ? abs : null;

    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 not found: ' + pathname);
      return;
    }

    const ext = extname(file).toLowerCase();

    if (ext === '.ts') {
      const src = await readFile(file, 'utf8');
      const js = stripTypeScriptTypes(src, { mode: 'strip', sourceUrl: pathname });
      res.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store'
      });
      res.end(js);
      return;
    }

    const buf = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=0'
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('500 ' + (err && err.message ? err.message : String(err)));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`WeaveMind dev server → http://${HOST}:${PORT}/`);
  console.log(`root: ${ROOT}`);
});
