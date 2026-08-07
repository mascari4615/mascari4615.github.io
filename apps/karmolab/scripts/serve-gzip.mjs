/**
 * 빠르기를 잴 때 쓰는 로컬 서버 — **압축을 해서** 준다 (TASK-KL-089)
 *
 * 두 가지를 실제 사이트처럼 흉내 낸다 — **압축**과 **앞머리 설정 제거**. 둘 다 안 하면 재는 값이
 * 실제보다 부풀려진다(각각 몇 배씩).
 *
 * 왜 따로 있나: 평소 쓰는 로컬 서버는 압축을 안 한다. 그런데 실제 사이트는 한다.
 * 그래서 그냥 재면 받는 양이 실제보다 몇 배로 잡히고, 느린 회선을 흉내 낼수록 그 차이가
 * 벌어진다 — 실측으로 90KB 짜리 파일이 실제로는 16KB 였고, 그 하나 때문에 「도구가 3.7초에
 * 나타난다」는 값이 나왔다. 진짜 값은 1.6초다. 없는 문제를 쫓게 만드는 함정이다.
 *
 * 그러므로 **회선·기기를 느리게 흉내 내는 측정은 반드시 이 서버로** 해야 한다.
 * (기능이 되나 안 되나 보는 검사는 평소 서버로 충분하다 — 거기선 압축이 상관없다.)
 *
 * 사용: node scripts/serve-gzip.mjs [뿌리경로] [포트]
 *       기본 = 저장소 뿌리, 8801. 주소는 평소 서버와 같은 모양이다
 *       (예: http://127.0.0.1:8801/apps/blog/karmolab/t/loan/).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = process.argv[2] || path.dirname(path.dirname(here));
const PORT = Number(process.argv[3] || 8801);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// 이미 압축된 것(그림·글꼴)을 또 압축하면 되레 손해다 — 실제 사이트도 안 한다.
const COMPRESSIBLE = /\.(html|js|css|json|xml|svg|webmanifest|txt)$/;

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(ROOT, urlPath);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('없는 주소');
    }
    let body = fs.readFileSync(file);

    /* 저장소의 .html 은 맨 위에 설정 몇 줄(`--- layout: none … ---`)을 달고 있다. 실제 사이트에서는
     * Jekyll 이 그걸 먹고 내보내지만, 그냥 파일로 주면 **화면에 글자로 뜬다**. 그 한 줄이 앱 전체를
     * 아래로 밀어, 재 보면 밀림 수치가 실제보다 세 배로 나온다(실측 0.102 대 0.035).
     * 여기서 걷어내야 이 서버로 잰 값이 실제 사이트 값이 된다. */
    if (/\.html$/.test(file)) {
      const text = body.toString('utf8');
      const fm = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
      if (fm) body = Buffer.from(text.slice(fm[0].length), 'utf8');
    }
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' };
    if (COMPRESSIBLE.test(file) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      const gz = zlib.gzipSync(body);
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': gz.length });
      return res.end(gz);
    }
    res.writeHead(200, { ...headers, 'Content-Length': body.length });
    res.end(body);
  })
  .listen(PORT, () => {
    console.log(`[serve-gzip] ${PORT} 번에서 압축해서 준다 — 빠르기 측정은 이 주소로 (뿌리: ${ROOT})`);
  });
