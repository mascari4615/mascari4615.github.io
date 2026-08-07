/**
 * 고치면 그 자리에서 보이는 개발 서버 (TASK-KL-100)
 *
 * 왜: 고친 것을 보려면 배포를 기다리거나 새로고침을 해야 했다. 배포는 몇 분이고,
 * 새로고침은 상태를 다 날린다 — 입력하던 값, 열어 둔 탭, 스크롤.
 *
 * 무엇을 하나:
 *   · 소스가 바뀌면 다시 빌드하고, **무엇이 바뀌었는지에 따라 다르게** 알린다.
 *   · 스타일 → 새로고침 없이 `<link>` 만 갈아 끼운다. 화면 상태가 그대로 남는다.
 *   · 위젯 → 그 번들만 다시 받아 실행한다. `Toolbox.register` 가 갈아 끼우고 다시 그린다
 *     (KL-100 에서 연 길이다). 다른 위젯이 들고 있던 값은 안 건드린다.
 *   · 셸(toolbox·로더·index.html) → 이건 앱 자체라 새로고침. 대신 그때만 한다.
 *
 * 설정은 여기서 다시 안 적는다 — `build.mjs` 를 그대로 부른다. 두 벌로 적으면 언젠가 갈라진다.
 *
 * 사용: npm run dev   (기본 http://127.0.0.1:8813/apps/karmolab/index.html)
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // apps/karmolab
const REPO = path.dirname(path.dirname(here));                            // 저장소 뿌리
const PORT = Number(process.argv[2] || 8813);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

/* ── 듣고 있는 브라우저들 ─────────────────────────── */
const clients = new Set();
function notify(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) { try { res.write(line); } catch (_) { clients.delete(res); } }
}

/* ── 브라우저에 심는 쪽 ───────────────────────────
 * 페이지에 <script> 한 조각으로 들어간다. 개발 서버에서만 심으므로 실서비스에는 안 나간다. */
const CLIENT = `
<script>
(function () {
  var log = function (m) { console.log('%c[dev] ' + m, 'color:#a78bfa'); };
  var es = new EventSource('/__dev');
  es.addEventListener('message', function (e) {
    var msg = JSON.parse(e.data);
    if (msg.type === 'css') {
      // 새로고침 없이 스타일만 갈아 끼운다 — 화면 상태가 그대로 남는다.
      var n = 0;
      [].forEach.call(document.querySelectorAll('link[rel=stylesheet]'), function (el) {
        var u = new URL(el.href, location.href);
        if (!u.pathname.endsWith(msg.file)) return;
        u.searchParams.set('dev', Date.now());
        el.href = u.pathname + u.search;
        n++;
      });
      log('스타일 갈아 끼움 ' + msg.file + (n ? '' : ' (이 페이지엔 없음)'));
      return;
    }
    if (msg.type === 'widget') {
      // 그 번들만 다시 받아 실행한다. register 가 같은 이름을 갈아 끼우고 화면을 다시 그린다.
      var s = document.createElement('script');
      s.src = msg.url + '?dev=' + Date.now();
      s.onload = function () { log('위젯 갈아 끼움 ' + msg.file); s.remove(); };
      s.onerror = function () { log('위젯 못 받음 — 새로고침한다'); location.reload(); };
      document.head.appendChild(s);
      return;
    }
    if (msg.type === 'reload') { log('셸이 바뀌어 새로고침 — ' + msg.file); location.reload(); }
    if (msg.type === 'error')  { console.error('[dev] 빌드 실패\\n' + msg.detail); }
  });
  es.onerror = function () { /* 서버 재시작 시 EventSource 가 알아서 다시 붙는다 */ };
  log('붙었다 — 고치면 여기로 알려 준다');
})();
</script>
`;

/* Jekyll 앞머리(--- ... ---)는 실제 사이트에서는 서버가 떼고 준다. 여기서도 떼야 화면이 같다. */
function stripFrontMatter(text) {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return text;
  const nl = text.indexOf('\n', end + 1);
  return nl < 0 ? text : text.slice(nl + 1);
}

/**
 * 실제 사이트의 주소 → 저장소의 파일 (TASK-KL-129)
 *
 * 이 서버는 파일 경로 그대로만 줬다. 그런데 앱 안의 링크는 **배포된 주소**로 적혀 있다
 * (`/karmolab/t/`, `/karmolab/bot/`, `/daily/`). 배포에서는 Jekyll 이 앞머리의 permalink 로
 * 그 주소를 만들어 주지만 여기서는 아무도 안 만들어 줘서, 첫 화면의 「도구 목록」 카드를
 * 누르면 「없다」가 떴다 — 화면을 고치는 중에 목록·상세는 아예 못 열어 봤다는 뜻이다.
 * 규칙을 한 벌 적어 두는 대신 **있을 만한 자리를 차례로 찾는다**: 새 앱이 늘어도 그대로 맞는다.
 */
function resolveFile(rel) {
  const noLab = rel.replace(/^\/karmolab/, '') || '/index.html';
  // 어떤 앱은 제 것을 `dist/` 에 굽는다 (/daily/ → apps/daily/dist/index.html).
  const [, first, ...rest] = noLab.split('/');
  const dist = first ? path.join(REPO, 'apps', first, 'dist', ...rest) : null;
  const candidates = [
    path.join(REPO, rel),                    // 파일 경로 그대로 (/apps/karmolab/index.html)
    path.join(REPO, 'apps/blog', rel),       // 블로그가 내보내는 것 — 도구 목록·상세가 여기 찍힌다
    path.join(here, noLab),                  // 셸과 그 곁의 페이지 (/karmolab/ · /karmolab/bot/)
    path.join(REPO, 'apps', noLab),          // 딴 앱 (/karmolab/higher/ → apps/higher/)
    path.join(REPO, 'apps', rel),            // 딴 앱을 제 이름으로 (/daily/ → apps/daily/)
    ...(dist ? [dist] : []),                 // 구워 두는 앱 (/daily/ → apps/daily/dist/)
  ];
  for (const f of candidates) {
    if (!f.startsWith(REPO)) continue;
    if (fs.existsSync(f) && !fs.statSync(f).isDirectory()) return f;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/__dev') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive',
    });
    res.write(': hi\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = resolveFile(rel);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      rel.startsWith('/karmolab/t/')
        ? `없다: ${rel}\n\n도구 목록·상세는 만들어 두는 페이지다. 한 번 찍어라:\n  npm run gen:tool-pages\n(찍은 것은 apps/blog/karmolab/t/ 에 들어간다.)`
        : '없다: ' + rel
    );
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  let body;
  if (ext === '.html') {
    let html = stripFrontMatter(fs.readFileSync(file, 'utf8'));
    // 개발용 조각은 </body> 바로 앞에. 없으면 끝에 붙인다.
    html = html.includes('</body>') ? html.replace('</body>', CLIENT + '</body>') : html + CLIENT;
    body = Buffer.from(html, 'utf8');
  } else {
    body = fs.readFileSync(file);
  }
  // 캐시를 끈다 — 개발 중에 옛 파일이 살아 있으면 「고쳤는데 왜 그대로지」가 된다.
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  const enc = String(req.headers['accept-encoding'] || '');
  if (/gzip/.test(enc) && /^(text|application)\//.test(type)) {
    body = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(body);
});

/* ── 산출물 사진 찍기 ─────────────────────────────
 * 빌드 전후로 js/ 를 훑어 **무엇이 실제로 달라졌는지** 본다. 소스 이름으로 짐작하지 않는다
 * — 한 파일을 고쳐도 그것을 품은 번들이 여러 개 바뀔 수 있다.
 *
 * 잰 것으로 배운 것: **시각·크기로 비교하면 안 된다.** 빌드는 산출물을 전부 다시 쓰므로
 * 하나만 고쳐도 200개가 「바뀜」으로 잡히고, 그러면 매번 셸이 걸려 새로고침으로 떨어진다
 * (실제로 그랬다 — 위젯 하나 고쳤는데 새로고침 세 번). 내용으로 비교해야 한다. */
function snapshot(dir, acc = new Map()) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) snapshot(p, acc);
    else if (p.endsWith('.js')) acc.set(p, createHash('sha1').update(fs.readFileSync(p)).digest('hex'));
  }
  return acc;
}

let building = false, again = false;
function rebuild(reason) {
  if (building) { again = true; return; }
  building = true;
  const before = snapshot(path.join(here, 'js'));
  const t0 = Date.now();
  execFile(process.execPath, [path.join(here, 'build.mjs')], { cwd: here }, (err, _out, stderr) => {
    building = false;
    if (err) {
      console.error(`[dev] 빌드 실패 — ${reason}`);
      console.error(String(stderr).trim().split('\n').slice(0, 8).join('\n'));
      notify({ type: 'error', detail: String(stderr).slice(0, 1500) });
      if (again) { again = false; rebuild(reason); }
      return;
    }
    const after = snapshot(path.join(here, 'js'));
    const changed = [...after.keys()].filter((p) => after.get(p) !== before.get(p));
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    // 셸이 바뀌면 위젯만 갈아 끼워도 소용없다 — 앱 자체가 옛 코드다.
    const SHELL = ['js/toolbox.js', 'js/widgets-loader.js', 'js/widgets-manifest.js', 'js/widgets-lazy-meta.js', 'js/mdd.js'];
    const relOf = (p) => path.relative(here, p).split(path.sep).join('/');
    const shellHit = changed.map(relOf).find((r) => SHELL.includes(r));
    if (shellHit) {
      console.log(`[dev] ${secs}초 · 셸이 바뀌었다(${shellHit}) → 새로고침`);
      notify({ type: 'reload', file: shellHit });
    } else if (changed.length) {
      for (const p of changed) {
        const r = relOf(p);
        console.log(`[dev] ${secs}초 · 위젯 갈아 끼움 ${r}`);
        notify({ type: 'widget', file: r, url: '/apps/karmolab/' + r });
      }
    } else {
      console.log(`[dev] ${secs}초 · 산출물 변화 없음 (${reason})`);
    }
    if (again) { again = false; rebuild(reason); }
  });
}

/* ── 무엇을 지켜보나 ─────────────────────────────── */
function watch(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  let last = 0;
  fs.watch(dir, { recursive: true }, (_evt, name) => {
    if (!name) return;
    const now = Date.now();
    if (now - last < 60) return;          // 편집기가 한 번 저장에 여러 번 알린다
    last = now;
    onFile(String(name).split(path.sep).join('/'));
  });
}

watch(path.join(here, 'src'), (name) => {
  if (!/\.(ts|js)$/.test(name)) return;
  console.log(`[dev] 바뀜 src/${name}`);
  rebuild('src/' + name);
});
watch(path.join(here, 'css'), (name) => {
  if (!name.endsWith('.css')) return;
  console.log(`[dev] 바뀜 css/${name} → 갈아 끼움`);
  notify({ type: 'css', file: '/apps/karmolab/css/' + name });
});
fs.watchFile(path.join(here, 'index.html'), { interval: 300 }, (cur, prev) => {
  if (cur.mtimeMs === prev.mtimeMs) return;
  console.log('[dev] 바뀜 index.html → 새로고침');
  notify({ type: 'reload', file: 'index.html' });
});

/* 이 서버 자신이 바뀌면 **스스로 다시 뜬다** (TASK-KL-129).
 *
 * 남의 코드는 다 지켜보면서 정작 제 코드는 안 봤다. 그래서 서버를 고쳐 놓고도 돌던 것은 옛
 * 코드라, 고친 사람도 쓰는 사람도 「고쳤는데 왜 그대로지」를 겪었다(주소 못 찾는 것을 고친 날
 * 바로 그랬다). 새로 띄우고 이 프로세스는 물러난다 — 사람이 기억할 일이 아니다. */
fs.watchFile(fileURLToPath(import.meta.url), { interval: 500 }, (cur, prev) => {
  if (cur.mtimeMs === prev.mtimeMs) return;
  console.log('[dev] 개발 서버 자신이 바뀌었다 → 다시 뜬다');
  notify({ type: 'reload', file: 'scripts/dev.mjs' });
  server.close();
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), String(PORT)], {
    cwd: here,
    stdio: 'inherit',
    // 새 것을 **떼어 놓는다**. 안 그러면 이쪽이 물러날 때 같이 사라져, 「다시 뜬다」고 찍어 놓고
    // 아무것도 안 도는 상태가 된다(실제로 그랬다 — 서버가 통째로 죽어 있었다).
    detached: true,
  });
  child.unref();
  // 새 것이 자리를 잡을 틈을 준다. 자리는 안 비면 새 쪽이 기다렸다 다시 잡는다(아래 재시도).
  child.on('spawn', () => setTimeout(() => process.exit(0), 400));
  // 새로 못 떴으면 지금 것이라도 계속 돈다 — 조용히 아무것도 안 도는 것이 제일 나쁘다.
  child.on('error', (e) => console.error('[dev] 다시 뜨기 실패 — 지금 것으로 계속한다:', e.message));
});

/** 같은 공유기 안에서 폰이 찾아올 수 있는 주소. 127.0.0.1 로만 열면 폰에서는 안 보인다 —
 *  모바일 화면을 진짜 폰으로 보려면 이게 있어야 한다 (TASK-KL-101). */
function lanAddress() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) return n.address;
    }
  }
  return null;
}

/* 자리가 아직 안 비었으면 **잠깐 기다렸다 다시 잡는다** (TASK-KL-129).
 * 스스로 다시 뜰 때 앞 프로세스가 물러나는 데 한 박자가 걸린다 — 그 틈에 한 번 튕기고
 * 끝나면 서버가 아예 안 뜬 채로 남는다(실제로 그랬다: 다시 뜬다고 찍고는 죽어 있었다). */
server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  if ((server.__tries = (server.__tries || 0) + 1) > 20) {
    console.error(`[dev] ${PORT} 번 자리가 안 비워진다 — 다른 서버가 쓰고 있는지 봐라`);
    process.exit(1);
  }
  setTimeout(() => server.listen(PORT, '0.0.0.0'), 250);
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddress();
  console.log(`[dev] 이 컴퓨터  http://127.0.0.1:${PORT}/apps/karmolab/index.html`);
  if (lan) console.log(`[dev] 폰에서    http://${lan}:${PORT}/apps/karmolab/index.html  (같은 와이파이)`);
  else console.log('[dev] 폰에서 볼 주소를 못 찾았다 — 유선/무선이 다 꺼져 있나 확인해라');
  console.log('[dev] 스타일·위젯은 그 자리에서 갈아 끼운다. 셸이 바뀔 때만 새로고침한다.');
});
