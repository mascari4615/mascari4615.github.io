/**
 * **라이브 점검 목록 — 한 곳** (2026-08-13)
 *
 * 왜 있나: 이 목록이 워크플로 YAML 안에만 있었다. 그래서
 *   ① 내 컴퓨터에서 같은 순서를 돌릴 방법이 없었다 — 빨강 하나 볼 때마다 **밀고 10분 기다렸다**.
 *     어젯밤 라이브 점검 하나를 초록으로 만드는 데 그렇게 여섯 번을 왕복했다.
 *   ② 같은 전제를 두 곳(배포 워크플로 / 이 워크플로)이 각자 들고 있다가 갈라졌다 —
 *     `badapple` 짓는 단계가 한쪽에만 들어가 25 판 연속 죽은 적이 있다(그 주석이 아직 남아 있다).
 *
 * 그래서 목록은 여기 하나뿐이고, 워크플로와 `npm run verify:live` 가 **같은 이 파일**을 읽는다.
 * 목록이 하나면 갈라질 수가 없다.
 *
 * 각 줄: { name: 사람 말, cmd: [실행할 것], live: true 면 실주소를 본다 }
 */

/* 실주소를 여는 검사(`live: true`)는 **러너가** 자동으로 `retry-if-redeployed.mjs` 를 씌운다 —
   목록에 껍데기를 손으로 적으면 새 줄에서 빠뜨린다(실제로 넷만 씌워져 있었다). */

export const PREP = [
  { name: '대조 기준 만들기 (빌드 산출물 — 게이트는 verify 몫)', cmd: ['npm', 'run', 'build:artifacts'] },
  /* 아래 검사 몇 개는 **이 자리에 띄운 서버**로 `/karmolab/t/<도구>/` 를 연다. 그 페이지는
     배포가 찍는 것이라 여기엔 없었고, 화면이 통째로 「not found」였다(2026-08-13 실측). */
  { name: '도구·놀이 페이지 찍기 (검사가 그 주소를 연다)', cmd: ['npm', 'run', 'gen:tool-pages'] },
  { name: '놀이 페이지 찍기', cmd: ['npm', 'run', 'gen:play-pages'] },
];

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = dirname(here);

/* ★ **「실주소를 보는 검사」를 손으로 표시하지 않는다** (2026-08-13).
 *
 * 여기 `live: true` 를 사람이 붙이고 있었는데, 실제로 실주소를 여는 검사는 **훨씬 많았다** —
 * 판본 대조·도구 목록·설치 정보·타자·값 넣기·이름 잇기 … 열두 개가 표시 없이 실사이트를 열고
 * 있었다. 표시가 빠지면 두 가지가 조용히 깨진다:
 *   ① 배포가 도중에 갈아치워도 「다시 한 판」 껍데기가 안 씌워져 **가짜 빨강**이 난다.
 *   ② 내 컴퓨터에서 고친 것을 확인하려 돌려도 **실사이트를 재고 있다** — 안 고쳤는데 초록,
 *      고쳤는데 빨강. 로컬 재현이라는 말 자체가 거짓이 된다.
 *
 * 그래서 표시를 **검사 파일에게 물어본다**: 그 스크립트의 `BASE` 기본값이 바깥 주소면 실주소다.
 * 목록과 사실이 갈라질 자리를 없앤다. 줄에 `live` 를 적으면 그 값이 이긴다(예외용).
 */
function scriptFileOf(cmd) {
  if (cmd[0] === 'node') return join(appRoot, cmd[1]);
  if (cmd[0] === 'npm' && cmd[1] === 'run') {
    const pkg = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
    const line = pkg.scripts?.[cmd[2]];
    const m = line && line.match(/node\s+(\S+\.mjs)/);
    return m ? join(appRoot, m[1]) : null;
  }
  return null;
}

/**
 * 그 검사가 **어디를 여나** — 못 읽으면 `null`(모름).
 *   'live'  실사이트          'local' 이 자리에 띄운 서버        'none' 아무 데도 안 연다
 */
function baseKindOf(cmd) {
  const file = scriptFileOf(cmd);
  if (!file) return null;
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  /* ★ **볼 곳을 helper 로 옮긴 검사도 실주소다** (2026-08-14 자기 회귀 잡기).
     오늘 검사 열여섯의 「볼 곳」을 `lib/live-url.mjs`(`livePage()`)로 모았는데, 여기 규칙은
     `process.env.BASE || 'http…'` 글자만 찾는다 — 그래서 그 열여섯이 갑자기 「아무 데도 안 연다」로
     분류됐고, 러너가 **「배포에 밟혔으면 다시」 껍데기를 안 씌우게** 됐다(배포 중이면 거짓 빨강).
     helper 를 쓰는 것도 실주소로 친다. */
  if (src.includes('livePage(') || src.includes('liveBase(')) return 'live';
  const m = src.match(/process\.env\.BASE\s*\|\|\s*['"](https?:[^'"]*)['"]/);
  if (!m) return 'none';
  return /127\.0\.0\.1|localhost/.test(m[1]) ? 'local' : 'live';
}

/** 목록에 적힌 줄들에 `live`·`needsServer` 를 채워 넣는다 — 손으로 적은 값이 있으면 그것이 이긴다. */
function withLive(list) {
  return list.map((c) => {
    const kind = baseKindOf(c.cmd);
    if (kind === null) {
      /* 못 물어본 것은 「아니오」가 아니다 — 실주소로 치고 껍데기를 씌운다(씌워서 손해가 없다). */
      console.warn(`[live-checks] ${c.name} — 어느 파일인지 못 물어봤다 · 실주소로 친다`);
      return { live: true, needsServer: false, ...c };
    }
    /* ★ **이 자리에 서버가 있어야 도는 검사가 있다** (2026-08-13).
       「비워 둔 자리가 실제와 맞는지」가 늘 빨갛길래 봤더니, 재는 상대가
       `127.0.0.1:8801` 인데 아무도 그 서버를 안 띄우고 있었다 — 「못 돌림」이 **빨강**으로
       읽히던 자리다. 이제 러너가 필요한 검사가 있을 때만 그 서버를 띄우고 끝나면 내린다. */
    return { live: kind === 'live', needsServer: kind === 'local', ...c };
  });
}

const RAW_CHECKS = [
  { name: '올린 판이 실제로 서빙되는지', cmd: ['node', 'scripts/check-live-version.mjs'], live: true },
  { name: '부르는 이름이 실제로 있는지', cmd: ['npm', 'run', 'audit:scripts'] },
  { name: 'WM 페이지 배선이 이어져 있는지', cmd: ['npm', 'run', 'audit:wm'] },
  { name: '도구마다 딸린 것이 채워졌는지', cmd: ['npm', 'run', 'audit:data'] },
  { name: '화면이 뜨는지 (전 도구)', cmd: ['npm', 'run', 'test:live'], live: true },
  { name: '이상형 월드컵 한 판이 실제로 끝나는지', cmd: ['node', 'scripts/smoke-worldcup.mjs'], live: true },
  { name: '오늘의 판이 첫 화면에 뜨고 세는지', cmd: ['npm', 'run', 'test:today'], live: true },
  { name: '자랑 카드가 실제로 그려지는지', cmd: ['npm', 'run', 'test:brag'], live: true },
  { name: '도감에 도장이 찍히는지', cmd: ['npm', 'run', 'test:collection'] },
  { name: '숨긴 것이 실제로 찾아지는지', cmd: ['npm', 'run', 'test:secrets'] },
  { name: '말로 부리기가 도구까지 데려가는지', cmd: ['npm', 'run', 'test:ask'] },
  { name: '계산기 답이 그림 카드가 되는지', cmd: ['npm', 'run', 'test:resultcard'] },
  { name: '실황 줄이 있을 때만 뜨는지', cmd: ['npm', 'run', 'test:live-line'] },
  { name: '첫 화면 꾸민 것이 남는지', cmd: ['npm', 'run', 'test:homeprefs'] },
  { name: '명령 팔레트가 실제로 여닫히는지', cmd: ['npm', 'run', 'test:palette'] },
  { name: '팔레트가 내놓는 답이 도구와 같은지', cmd: ['npm', 'run', 'test:palette-answers'] },
  { name: '도구 목록 페이지가 성한지', cmd: ['npm', 'run', 'test:hub'] },
  { name: '마스코트가 살아 있는지', cmd: ['npm', 'run', 'test:mascot'] },
  { name: '스크립트 없이도 읽히는지', cmd: ['npm', 'run', 'test:nojs'] },
  { name: '미리 그린 화면에 손이 달리는지', cmd: ['npm', 'run', 'test:hydration'] },
  { name: '실제 사이트에 있어야 하는 것이 있는지', cmd: ['npm', 'run', 'audit:live'], live: true },
  { name: '놀이 셋이 성한지', cmd: ['node', '../play/scripts/smoke.mjs'] },
  /* 놀이 열 판이 **지어지기는 하나** — 말 묶음을 이르게 부르면 위젯이 통째로 안 올라간다.
     도구 장이 없는 놀이는 `test:i18n:runtime` 이 안 보고 있었다 (2026-08-14 실서비스 고장). */
  { name: '놀이가 실제로 지어지는지', cmd: ['npm', 'run', 'test:play-i18n'], live: true },
  /* 일본어 판도 같은 코드에 **다른 말 묶음**을 얹는다 — 열쇠 하나가 비면 그 화면만 죽는다
     (지금 ja 는 빠진 열쇠가 50개다). 한국어 판이 초록이어도 저쪽은 아닐 수 있다. */
  { name: '일본어 판 화면이 지어지는지', cmd: ['npm', 'run', 'test:play-i18n:ja'], live: true },
  { name: '검색엔진이 읽는 머리가 성한지', cmd: ['npm', 'run', 'audit:seo'], live: true },
  { name: '비워 둔 자리가 실제와 맞는지', cmd: ['npm', 'run', 'audit:heights'] },
  { name: '설치 정보가 성한지', cmd: ['npm', 'run', 'test:pwa'] },
  { name: '값을 넣으면 답이 나오는지', cmd: ['npm', 'run', 'test:answers'] },
  { name: '글자를 넣으면 반응하는지', cmd: ['npm', 'run', 'test:typing'] },
  { name: '화면 다섯이 넓은 화면·폰에서 안 넘치는지', cmd: ['npm', 'run', 'test:platform'] },
  { name: '판본 대조가 도는지', cmd: ['npm', 'run', 'test:pdfdiff'] },
  { name: '타자 대결 한 바퀴가 도는지', cmd: ['npm', 'run', 'test:ghosttype'] },
  { name: '입력칸에 이름이 이어져 있는지', cmd: ['npm', 'run', 'audit:labels'] },
  { name: '밝은 테마·어두운 테마에서 글씨가 보이는지', cmd: ['npm', 'run', 'test:contrast'] },
  { name: '도구마다 공유 카드가 있는지', cmd: ['npm', 'run', 'audit:cards'] },
  { name: '안 쓰는데 첫 화면을 막는 스타일', cmd: ['npm', 'run', 'audit:blocking-css'] },
  { name: '후원 자리가 규칙대로 뜨는지', cmd: ['npm', 'run', 'audit:sponsor'] },
  { name: '공유 카드가 지금 문구와 맞는지', cmd: ['npm', 'run', 'audit:cards:fresh'] },
  /* ★ **아무도 안 돌리던 검사 둘** (2026-08-14). `audit:orphans` 목록에 몇 달째 앉아 있었다 —
     써 두고 어디에도 안 물려 있으면 없는 검사다. 그렇다고 묶음(gates)에 넣으면 push 마다
     83초·154초가 붙는데, 지금도 판정이 밀려 40분씩 걸린다. 한 시간에 한 번 도는 이 자리가
     느린 검사의 집이다. */
  { name: '방을 든 채 게임을 갈아타는지', cmd: ['npm', 'run', 'smoke:arcaderoom'] },
  { name: '무대(관전 화면)가 도는지', cmd: ['npm', 'run', 'smoke:arcadestage'] },
  { name: '흥 화면이 도는지', cmd: ['npm', 'run', 'test:heung'] },
];

export const CHECKS = withLive(RAW_CHECKS);
