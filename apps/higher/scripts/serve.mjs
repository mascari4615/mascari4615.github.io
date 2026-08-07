/**
 * 두 놀이를 눈으로 보려고 띄우는 작은 서버 (TASK-KL-089)
 *
 * Jekyll 을 돌리면 몇십 초가 걸린다. 이 서버는 파일 앞머리(front matter)만 떼고 실제 주소
 * 그대로 내준다 — 배포와 같은 경로로 보이므로 링크·fetch 가 그대로 동작한다.
 *
 * 사용: node scripts/serve.mjs   → http://127.0.0.1:8877/karmolab/higher/
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const apps = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const PORT = Number(process.env.PORT || 8877);
const strip = (s) => s.replace(/^---[\s\S]*?---\n/, '');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript' };

/** 주소 → 실제 파일 (앱마다 permalink 를 그대로 흉내낸다) */
function resolve(url) {
  const u = decodeURIComponent(url.split('?')[0]);
  for (const [prefix, dir] of [
    ['/karmolab/higher/', path.join(apps, 'higher')],
    ['/karmolab/quest/', path.join(apps, 'quest')]
  ]) {
    if (!u.startsWith(prefix)) continue;
    const rest = u.slice(prefix.length);
    if (!rest || rest === 'index.html') return path.join(dir, 'index.html');
    if (rest.endsWith('.json')) return path.join(dir, 'data', rest);
    return path.join(dir, rest);
  }
  return null;
}

http
  .createServer((req, res) => {
    const file = resolve(req.url);
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<p>여기엔 없습니다. <a href="/karmolab/higher/">높은 쪽 고르기</a> · <a href="/karmolab/quest/">오늘의 문제</a></p>');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'text/plain; charset=utf-8' });
    res.end(strip(fs.readFileSync(file, 'utf8')));
  })
  .listen(PORT, () => {
    console.log(`[serve] http://127.0.0.1:${PORT}/karmolab/higher/  (높은 쪽 고르기)`);
    console.log(`[serve] http://127.0.0.1:${PORT}/karmolab/quest/   (오늘의 문제)`);
  });
