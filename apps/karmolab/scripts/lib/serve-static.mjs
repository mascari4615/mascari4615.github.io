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
/**
 * `apps/karmolab/scripts/lib` → 저장소 뿌리 (네 단계 위).
 *
 * ⚠ 처음에 세 단계만 올라가 `apps/` 를 뿌리로 잡았다. 그러면 화면이 통째로 404 인데 **검사는
 * 통과했다** — 「쉬는가」를 보는 검사가 빈 페이지를 재고 「쉰다」고 답했다. 볼 대상이 없으면
 * 통과가 아니라 못 돌림이어야 한다. 그래서 아래 `serveRepo` 가 뿌리를 열 때 한 번 확인한다.
 */
const REPO_ROOT = path.dirname(path.dirname(path.dirname(path.dirname(here))));

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
  /* 뿌리가 틀리면 **화면이 통째로 404 인데 검사는 통과한다** — 빈 페이지는 언제나 조용하고,
     언제나 가볍다. 실제로 그렇게 한 번 속았다. 그러니 여기서 한 번 확인하고, 아니면 세운다. */
  const landmark = path.join(root, 'apps/karmolab/index.html');
  if (!fs.existsSync(landmark)) {
    throw new Error(`[serve-static] 뿌리가 틀렸다 — ${landmark} 가 없다. 빈 화면을 재면 무엇이든 통과한다.`);
  }
  /**
   * ❄ **한 판 안에서는 내용이 안 변한다** (2026-08-12).
   *
   * 이 작업공간은 세션 여럿이 **같은 나무**를 고친다. 검사가 도는 20~40초 사이에 옆 세션이
   * 빌드를 돌리면, 같은 검사가 같은 코드로 판마다 다른 답을 낸다 — 실제로 한 판은 통과,
   * 다음 판은 6개 빨강이 났다(같은 커밋). **흔들리는 게이트는 빨강을 무시하게 만들어
   * 게이트 자체를 죽인다.**
   *
   * 그래서 한 번 읽은 파일은 그 판 내내 **그때 읽은 것**을 내준다. 도중에 바뀐 파일은
   * `drift()` 로 이름을 남겨, 「왜 이상하지」가 아니라 「옆에서 바꿨다」로 읽히게 한다.
   */
  /**
   * ❄ 얼리기 **전에**, 그 파일이 다 쓰였는지 확인한다 (2026-08-13, TASK-KL-271).
   *
   * 얼리는 것 자체는 옳았는데 **무엇을 얼리느냐**가 문제였다: 빌드가 도는 중에 첫 요청이 오면
   * 반쯤 쓰인 묶음을 얼려 **판 내내 그것을 내준다**. 겉보기 증상은 「방금 넣은 규칙이 안 먹는다」
   * 라서, 규칙을 세 번 고치고서야 묶음이 옛것임을 알았다(계기를 붙여 잡았다: `규칙실림=false`).
   *
   * 읽기 전후로 크기·수정시각을 재서 **그 사이에 안 바뀐 것만** 얼린다. 바뀌었으면 잠깐 쉬고
   * 다시 읽는다 — 다 쓰이길 기다리는 것이지, 내용을 고치는 것이 아니다.
   */
  const napper = new Int32Array(new SharedArrayBuffer(4));
  const napMs = (msec) => { Atomics.wait(napper, 0, 0, msec); };
  function readStable(file, tries = 6) {
    let last = null;
    for (let i = 0; i < tries; i += 1) {
      const a = fs.statSync(file);
      const body = fs.readFileSync(file);
      const b = fs.statSync(file);
      if (a.size === b.size && a.mtimeMs === b.mtimeMs && b.size === body.length) return body;
      last = body;
      napMs(60);   // 쓰는 쪽이 끝낼 틈
    }
    return last ?? fs.readFileSync(file);
  }

  const frozen = new Map();
  const drifted = new Set();
  const server = http.createServer((req, res) => {
    let target = decodeURIComponent(req.url.split('?')[0]);
    /* ★ **`/karmolab/…` 는 블로그 밑에 있다** (2026-08-14). 배포된 사이트에서는 도구 장이
       `/karmolab/t/<도구>/` 로 서지만, 저장소에서는 `apps/blog/karmolab/…` 다. 이 매핑이 없으면
       앱이 만들어 준 링크(편지 `?m=`)를 그대로 열 때 **없는 주소**가 되고, 그 창에는 셸이
       영영 안 뜬다 — 실측: 편지 판 검사가 CI 에서 30초·60초 모두 초과하며 섰다(사람 자리에서는
       dev 서버가 그 매핑을 해 줘서 멀쩡했다). 없는 것을 기다리게 두면 「느리다」로 오해한다. */
    if (/^\/karmolab(\/|$)/.test(target)) target = `/apps/blog${target}`;
    if (target.endsWith('/')) target += 'index.html';
    let file = path.join(root, target.replace(/^\//, ''));
    /* ★ **도구 장은 저장소에 없다 — 없으면 셸을 내준다** (2026-08-14, 재현으로 확인).
       `/karmolab/t/<도구>/index.html` 은 `gen:tool-pages` 가 굽고 배포가 찍는 것이라
       `git ls-files` 로는 0개다. 앱이 만드는 편지 링크가 바로 그 주소라, CI 의 깨끗한
       체크아웃에서는 404 → 셸이 영영 안 뜬다(`Toolbox=undefined`, 60초 초과).
       그 장의 알맹이는 앱 셸과 같다(미리 그린 겉모습만 다르다) — 여기서 재려는 것은
       겉모습이 아니라 `?m=` 이 열리는 동작이다. */
    if (!fs.existsSync(file) && /^\/apps\/blog\/karmolab\//.test(target)) {
      const shell = path.join(root, 'apps/karmolab/index.html');
      if (fs.existsSync(shell)) file = shell;
    }
    // 뿌리 밖으로 나가는 주소는 거절한다 — 검사용이라도 열어 두면 안 된다.
    if (!file.startsWith(root)) { res.writeHead(404).end('not found'); return; }

    const had = frozen.get(file);
    if (!had) {
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      let body = readStable(file);
      const ext = path.extname(file);
      if (ext === '.html') body = Buffer.from(stripJekyll(String(body)), 'utf8');
      frozen.set(file, { body, type: MIME[ext] || 'application/octet-stream', mtime: fs.statSync(file).mtimeMs });
    } else if (fs.existsSync(file) && fs.statSync(file).mtimeMs !== had.mtime) {
      drifted.add(path.relative(root, file));   // 내주는 것은 처음 읽은 그것 — 이름만 남긴다
    }
    const hit = frozen.get(file);
    res.writeHead(200, { 'Content-Type': hit.type }).end(hit.body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    port,
    close: () => server.close(),
    /** 판 도중 옆에서 바뀐 파일들 — 빨강의 원인을 가리키는 증거. */
    drift: () => [...drifted],
  };
}

/**
 * 브라우저(chromium)를 띄울 수 있나 — **없으면 「못 돌림」이지 「통과」가 아니다**.
 *
 * 왜: 검사 넷을 `npm run build` 체인에 넣었는데, CI 의 verify 잡에는 playwright **브라우저
 * 설치 스텝이 없다**(daily-* 워크플로만 설치한다). 그대로 두면 CI 에서 이 검사들이 죽고,
 * 그러면 배포 길목이 통째로 막힌다 — 「아직 준비 안 된 것을 찾는 검사가 전원을 정지시키는」
 * 사고가 이 저장소에 이미 있었다.
 *
 * 그래서 브라우저가 없으면 조용히 통과시키지 말고 **못 돌린다고 말하고 빠진다**.
 * (설치돼 있으면 평소대로 돈다. CI 에 설치 스텝을 넣는 것은 별도 문제다.)
 *
 * @param {string} label 로그 앞머리
 * @returns {Promise<boolean>} 띄울 수 있으면 true
 */
export async function browserReady(label) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch (err) {
    console.log(`[${label}] 못 돌림 — 브라우저를 못 띄운다 (${String(err).split('\n')[0].slice(0, 90)})`);
    console.log(`[${label}]   CI 라면 \`npx playwright install --with-deps chromium\` 스텝이 필요하다. 통과로 세지 않는다.`);
    return false;
  }
}
