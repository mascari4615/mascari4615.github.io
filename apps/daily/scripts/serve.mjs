/**
 * dist/ 를 실제 배포와 같은 주소(/daily/…)로 띄운다. 눈으로 보고 스샷 찍는 용도.
 *   node scripts/serve.mjs [포트]
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export function startServer(port = 0) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]).replace(/^\/daily/, '') || '/';
    let file = join(dist, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dist) || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('없음');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const server = await startServer(Number(process.argv[2]) || 4620);
  console.log(`http://127.0.0.1:${server.address().port}/daily/`);
}
