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
  { name: '흥 화면이 도는지', cmd: ['npm', 'run', 'test:heung'] },
  { name: '타임캡슐이 도는지', cmd: ['npm', 'run', 'test:timecapsule'] },
  { name: '오락실 자판이 도는지', cmd: ['npm', 'run', 'smoke:arcadekeys'] },
  { name: '자기 성능 재기가 도는지', cmd: ['npm', 'run', 'test:perf:self'] },
  /* ★ 2026-08-16 — orphan 목록에 「빠르면 그냥 gates 에 넣어라」로 앉아 있던 것. 재 보니
     **400초에 3판 중 2판**밖에 못 갔다 — 빠르지 않다(10분쯤 본다). 그런데 이건 지도 화면을 여러 판 돌려
     한 번이라도 빨개지는 항목을 세는 자다 — 「흔들린다」를 진단으로 안 쓰려고 만든 것인데
     정작 아무도 안 돌리고 있었다. 느린 검사의 집인 여기가 그 자리다.
     ⚠ 이 판에는 지붕(40분)이 있다 — 이걸 넣어 어느 조각이 60% 를 넘으면 러너가 스스로 운다.
     그때는 이걸 빼지 말고 **제일 무거운 것부터 더 드문 자리로** 옮겨라(끊긴 판은 아무것도 못 알려 준다). */
  { name: '지도 화면이 판마다 흔들리는지', cmd: ['npm', 'run', 'test:karmograph:repeat'] },
  /* 예산 검사의 자기시험 — 예산을 반으로 조여 **빨간불이 실제로 나는지** 본다.
     초록만 보고 믿지 않으려면 빨강도 나는 걸 봐야 한다. 위 `test:perf:self` 와 같은 짝. */
  { name: '성능 예산이 빨간불도 내는지', cmd: ['npm', 'run', 'test:perf:budget:regress'] },
  /* 6분짜리다 — 묶음에 넣으면 push 마다 6분이 붙는다. 여기가 그 집이다. */
  { name: '둘러보기가 끝까지 도는지', cmd: ['npm', 'run', 'smoke:tour'] },
  /* ★ 2026-08-16 — 이 줄은 `test:perf:budget:regress` 를 부르고 있었다. `:regress` 는 예산을
     **재어 나온 값의 절반**으로 조여 일부러 빨갛게 만드는 자기시험이고, 한 건이라도 잡히면
     0 으로 끝난다 — 즉 실제 예산을 넘든 말든 늘 초록이었다. 이름은 「지켜지는지」인데
     지켜지는지를 한 번도 안 봤다. 진짜 예산으로 바꾼다(실측 14개 항목 전부 예산 안쪽). */
  { name: '성능 예산이 지켜지는지', cmd: ['npm', 'run', 'test:perf:budget'] },
  { name: '실사이트 화면들이 뜨는지', cmd: ['npm', 'run', 'smoke:live'] },
  /* ★ 이건 **실사이트**를 재는 검사다 (`URL` 기본값이 blog.mascari4615.com).
     묶음(gates)에 뒀더니 배포가 도는 순간에 걸려 「위젯 파일 404」로 빨갰다 —
     그 자리에는 「배포에 밟혔으면 다시」 껍데기가 없다. 여기가 그 껍데기가 있는 자리다. */
  { name: '흐름이 스스로 이어가는지', cmd: ['npm', 'run', 'test:flow:auto'] },
  /* ★ **실주소를 보는 검사는 여기 산다** (2026-08-14). 아래 여섯은 어제 내가 묶음(gates)에
     넣었던 것인데, 전부 `URL` 기본값이 실사이트다. 묶음에는 「배포에 밟혔으면 다시 한 판」
     껍데기가 없어서, 남의 배포가 도는 순간에 걸리면 우리 push 가 빨개진다
     (실측: `test:flow:auto` 가 옛 판 표식 파일 404 로 죽었다). 그 껍데기가 있는 이 자리로 옮긴다. */
  { name: '받은 알림 화면이 도는지', cmd: ['npm', 'run', 'test:inbox'] },
  { name: '이상형 월드컵이 도는지', cmd: ['npm', 'run', 'test:worldcup'] },
  { name: '공방 화면이 도는지', cmd: ['npm', 'run', 'test:workshop'] },
  { name: '약속한 모양이 실제와 맞는지', cmd: ['npm', 'run', 'test:contract:live'] },
  { name: '대결 한 판이 실제로 도는지', cmd: ['npm', 'run', 'test:duel'] },
  { name: '남이 만든 도구 화면이 도는지', cmd: ['npm', 'run', 'test:usertool'] },
  /* ★ **아무도 안 돌리던 검사 둘** (2026-08-15). `audit:orphans` 가 이름으로 짚어 줬다 —
     써 두고 어디에도 안 물려 있으면 없는 검사다. 둘 다 18~33초라 push 묶음에는 무겁고,
     한 시간에 한 번 도는 이 자리가 그런 검사의 집이다. */
  { name: '라디오가 도는지', cmd: ['npm', 'run', 'smoke:radio'] },
  { name: '오락실 다시보기가 도는지', cmd: ['npm', 'run', 'smoke:arcadereplay'] },
  /* ★ **내 기계에서 초록이던 셋이 CI 에서 빨갰다** (2026-08-15). 고아를 묶음에 넣으면서 같이
     넣었는데, 셋 다 판정이 **기계를 탄다** — 「60초 안에 재생 시작」(느린 러너에서 안 참) ·
     「제목이 화면 폭의 60%」(여기 60%+ · CI 44%) · 오락실 무대(브라우저·포트를 탄다).
     `domain-wm.md § 관문 ④` 이 이미 말한 그 꼴이다: 절대 시간·「보이는 것의 수」로 자르면
     느린 기계에서 태생적 빨강이다. 막는 자리에 두면 **남의 push 까지 세운다**.
     끄는 것이 아니라 **한 시간에 한 번 도는 이 자리로 옮긴다** — 판정은 계속 나온다.
     문턱을 기계와 무관하게 고치면(견줌·비율·CANNOT-RUN) 그때 묶음으로 승격해라. */
  { name: '배드애플이 재생되는지', cmd: ['npm', 'run', 'test:badapple'] },
  { name: '블루마블 화면 틀이 맞는지', cmd: ['npm', 'run', 'smoke:bm'] },
  { name: '오락실 무대가 서는지', cmd: ['npm', 'run', 'smoke:arcadestage'] },
  /* ★ 배포 길에서 옮겨 왔다 (2026-08-16, TASK-KAR-217). 한 판 4분 32초인데 **막지는 못하는**
     검사라(대상에서 원본 언어를 빼고 돌아 막는 조건이 성립하지 않는다) 배포를 세울 이유가 없었다.
     판정은 계속 필요하므로 — 다른 언어 도구 화면에 한국어가 남았는지는 한국어 쓰는 사람 눈에
     안 보인다 — 여기서 두 시간마다 본다. */
  { name: '다른 언어 도구 화면에 그 언어가 보이는지', cmd: ['npm', 'run', 'test:widget-i18n'] },
];

export const CHECKS = withLive(RAW_CHECKS);
