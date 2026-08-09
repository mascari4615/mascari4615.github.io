/**
 * 검사용 정적 서버 — **한 곳** (TASK-KL-201).
 *
 * 왜 생겼나: 검사 스크립트 21개가 저마다 같은 서버 조각을 복사해 갖고 있었다. 그중 여덟은
 * HTML 에서 **앞머리만** 걷고 Liquid 태그(`{% … %}`)는 그대로 내보냈다 — 그러면 화면 맨 위에
 * 조건문이 **글자로** 뜬다. 실측: 그 한 줄 때문에 밀림(CLS)이 0.032 로 잡혔고, 걷어내니
 * 0.010 이었다. 실서비스에는 없는 것을 재고 있었던 셈이다.
 *
 * 복사본이 여덟이면 한 곳을 고쳐도 일곱은 그대로다. 그래서 자리를 하나로 만든다.
 *
 * 쓰는 법:
 *   import { serveRepo } from './lib/serve-static.mjs';
 *   const { base, close } = await serveRepo();   // http://127.0.0.1:<빈 포트>
 *   ...
 *   close();
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** apps/karmolab/scripts/lib → 저장소 뿌리 */
const REPO_ROOT = path.dirname(path.dirname(path.dirname(here)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * Jekyll 이 처리해 줄 것을 정적 서빙에서도 없앤다 — 앞머리 + `{% … %}`.
 *
 * 정규식을 안 쓴다: 여러 줄 정규식을 스크립트로 심다가 세 번 깨졌다(개행·따옴표 이스케이프).
 * 문자열 자르기는 그런 사고가 없다.
 */
export function stripJekyll(text) {
  let out = text;
  if (out.startsWith('---')) {
    const close = out.indexOf('---', 3);
    if (close > 0) out = out.slice(out.indexOf('\n', close) + 1);
  }
  return out
    .split('{%')
    .map((part, i) => (i === 0 ? part : part.slice(part.indexOf('%}') + 2)))
    .join('');
}

/**
 * 저장소를 그대로 내주는 서버를 띄운다. 포트는 비어 있는 것을 알아서 잡는다
 * (고정 포트로 두면 검사 둘이 동시에 돌 때 하나가 죽는다).
 *
 * @returns {Promise<{ base: string, port: number, close: () => void }>}
 */
export async function serveRepo(options = {}) {
  const root = options.root || REPO_ROOT;
  const server = http.createServer((req, res) => {
    let target = decodeURIComponent(req.url.split('?')[0]);
    if (target.endsWith('/')) target += 'index.html';
    const file = path.join(root, target.replace(/^\//, ''));
    // 뿌리 밖으로 나가는 주소는 거절한다 — 검사용이라도 열어 두면 안 된다.
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    let body = fs.readFileSync(file);
    const ext = path.extname(file);
    if (ext === '.html') body = Buffer.from(stripJekyll(String(body)), 'utf8');
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, port, close: () => server.close() };
}
