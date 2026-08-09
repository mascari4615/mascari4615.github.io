/**
 * 검사 전용 **가만히 있는 서버** (TASK-KL-202).
 *
 * 왜 있나: 화면검사를 공용 dev 서버(8813)에 물리면, 다른 사람이 셸 파일 하나만 고쳐도
 * dev 가 「새로고침」을 쏘고 그 순간 검사 중이던 요소가 통째로 떨어져 나간다 —
 * 결과는 30초짜리 클릭 타임아웃이 흩뿌려진 빨강. **제품은 멀쩡한데 검사만 죽는** 가장 나쁜 부류다.
 *
 * 그래서 검사는 파일을 그냥 읽어 주기만 하는 서버에서 돈다. 핫리로드도, 감시도 없다.
 *
 * 사용: node scripts/serve-static.mjs [port]   (기본 8814, 문서 루트 = apps/karmolab 의 상위 두 단계)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const siteRoot = path.dirname(path.dirname(appDir));   // …/Mascari4615.github.io
const port = Number(process.argv[2] || process.env.PORT || 8814);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  // 상위 경로 탈출 차단 — 검사용이라도 열어 두면 언젠가 다른 데서 쓰인다.
  const rel = path.normalize(decodeURIComponent(url)).replace(/^([/\\])+/, '');
  const file = path.join(siteRoot, rel);
  if (!file.startsWith(siteRoot)) {
    res.writeHead(403).end('nope');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      // 검사가 **방금 만든 번들**을 봐야 한다 — 캐시가 끼면 낡은 판으로 초록이 뜬다.
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[serve-static] http://127.0.0.1:${port}/apps/karmolab/index.html (문서 루트 ${siteRoot})`);
});
