/**
 * 앱 셸로 도구 페이지를 **지금 찍을 수 있는지** 본다 (TASK-KL-097)
 *
 * 도구 상세 127장 + 목록 한 장은 `index.html`(앱 셸)에서 배포 때 만들어진다. 결과물은
 * 저장소에 안 들어간다(gitignore) — 그래서 셸을 고쳐도 로컬에서는 아무 일도 안 일어나고,
 * **배포에 가서야** 터진다. 실제로 오늘 두 번 터졌다:
 *   ① 인트로를 고치며 큰제목 태그에 id 를 붙였더니 생성기가 「큰제목을 못 찾음」으로 죽었다.
 *      그 뒤 세 시간 동안 밀어넣은 것이 하나도 안 나갔다.
 *   ② 셸이 암호 라이브러리를 지연 로드로 바꾸자 「태그를 못 찾음」으로 또 죽었다.
 * 둘 다 셸을 고친 사람은 몰랐다. 생성기를 돌려 볼 이유가 없었기 때문이다.
 *
 * 그래서 이 검사는 **임시 자리에 실제로 찍어 본다**. 저장소에 있는 결과물과 대조하지 않는다 —
 * 그건 gitignore 라 CI 에는 아예 없고, 있어도 「낡았다」는 사실은 배포가 알아서 지운다.
 * 여기서 볼 것은 하나다: 지금 셸로 찍는 일이 성립하는가.
 *
 * 사용: node scripts/audit-tool-pages-fresh.mjs  (npm run audit:pages)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'karmolab-pages-'));
const out = path.join(tmp, 't');

let stdout = '';
try {
  stdout = execFileSync(process.execPath, [path.join(root, 'scripts/gen-tool-pages.mjs'), '--out', out], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // 검사가 기록 파일을 건드리면 그건 검사가 아니다 — 다음 검사가 그 기록으로 통과해 버린다.
    env: { ...process.env, KARMOLAB_GEN_NO_STATE: '1' },
  });
} catch (e) {
  console.error('[audit-tool-pages] 지금 셸로는 도구 페이지를 못 찍는다 — 이대로 밀어넣으면 배포가 멈춘다.\n');
  console.error(String(e.stderr || e.stdout || e.message).trim().split('\n').slice(0, 12).join('\n'));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

/* 셸에 얹어 찍는 것은 도구만이 아니다 (TASK-KL-129) — 봇 소개·프로필도 같은 셸을 쓴다.
 * 그쪽만 검사에서 빠져 있으면 셸을 고쳤을 때 여기서는 통과하고 **배포에 가서 죽는다**.
 * 같은 자리에 함께 찍어 본다. */
const shellOut = path.join(tmp, 'shell');
try {
  execFileSync(process.execPath, [path.join(root, 'scripts/gen-shell-pages.mjs'), '--out', shellOut], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  console.error('[audit-tool-pages] 지금 셸로는 봇 소개·프로필을 못 찍는다 — 이대로 밀어넣으면 배포가 멈춘다.\n');
  console.error(String(e.stderr || e.stdout || e.message).trim().split('\n').slice(0, 12).join('\n'));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
const shellPages = ['bot', 'u'].filter((n) => fs.existsSync(path.join(shellOut, n, 'index.html')));
if (shellPages.length < 2) {
  console.error(`[audit-tool-pages] 셸 페이지가 반만 찍혔다 — ${shellPages.join(', ') || '한 장도 없음'}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

/* 찍힌 페이지의 **박아 넣은 스크립트가 말이 되는가** (TASK-KL-129).
 *
 * 이 페이지들의 글은 생성기의 문자열 안에서 만들어진다. 그래서 거기 정규식 하나만 적어도
 * 역슬래시가 한 번 먹혀 엉뚱한 글이 나간다 — 그리고 브라우저는 그 스크립트를 통째로 버린다.
 * 실제로 걸러 찾기 칸까지 화면에서 사라졌는데, 서버는 200 을 주고 파일도 멀쩡해 보였다.
 * 사람이 열어 보기 전에는 아무도 모른다. 그래서 여기서 실제로 **읽혀지는지** 본다. */
{
  const broken = [];
  const check = (file) => {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      const code = m[1];
      if (!code.trim()) continue;
      if (code.includes('{%')) continue;           // Jekyll 이 나중에 채우는 자리
      /* 자바스크립트가 아닌 자리도 있다 — 구조 설명(JSON), 그리고 브라우저에게 「이 주소를 미리
       * 받아 둬라」를 알려 주는 미리읽기 규칙(speculationrules). 둘 다 내용은 JSON 이다.
       * 이걸 자바스크립트로 읽으려 하면 첫 중괄호를 코드 묶음으로 보고 곧바로 실패한다 —
       * 실제로 그래서 멀쩡한 페이지 여섯 장이 「스크립트가 안 읽힌다」로 잡혔다. */
      if (/\btype="speculationrules"/.test(m[0]) || /\btype="application\/(ld\+)?json"/.test(m[0])) {
        try { JSON.parse(code); } catch (e) { broken.push(`${path.basename(path.dirname(file))} · 구조 설명(JSON): ${e.message}`); }
        continue;
      }
      try { new vm.Script(code); } catch (e) { broken.push(`${path.basename(path.dirname(file))} · ${e.message}`); }
    }
  };
  check(path.join(out, 'index.html'));                       // 도구 목록
  for (const n of ['bot', 'u']) check(path.join(shellOut, n, 'index.html'));
  for (const n of fs.readdirSync(out).slice(0, 5)) {          // 도구 상세 몇 장 표본
    const f = path.join(out, n, 'index.html');
    if (fs.existsSync(f)) check(f);
  }
  if (broken.length) {
    console.error('[audit-tool-pages] 찍힌 페이지의 스크립트가 안 읽힌다 — 그 화면은 통째로 죽는다:');
    broken.slice(0, 6).forEach((b) => console.error('  - ' + b));
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
}

/** 조용히 반쪽만 찍히는 경우를 막는다 — 「돌긴 돌았다」는 통과 조건이 아니다. */
const pages = fs.existsSync(out)
  ? fs.readdirSync(out).filter((n) => fs.existsSync(path.join(out, n, 'index.html'))).length
  : 0;
const hub = fs.existsSync(path.join(out, 'index.html'));
fs.rmSync(tmp, { recursive: true, force: true });

if (!hub || pages < 50) {
  console.error(`[audit-tool-pages] 찍히긴 했는데 결과가 이상하다 — 도구 ${pages}장 · 목록 ${hub ? '있음' : '없음'}`);
  console.error(stdout.trim().split('\n').slice(-5).join('\n'));
  process.exit(1);
}
console.log(`[audit-tool-pages] 지금 셸로 도구 ${pages}장 + 목록 + 셸 페이지 ${shellPages.length}장을 찍을 수 있다`);
