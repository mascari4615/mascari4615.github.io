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

/** 실주소를 여는 검사는 배포에 밟히면 다시 잰다 — 근거 있을 때만 (retry-if-redeployed.mjs). */
const retry = (...cmd) => ['node', 'scripts/retry-if-redeployed.mjs', ...cmd];

export const PREP = [
  { name: '대조 기준 만들기 (빌드 산출물 — 게이트는 verify 몫)', cmd: ['npm', 'run', 'build:artifacts'] },
  /* 아래 검사 몇 개는 **이 자리에 띄운 서버**로 `/karmolab/t/<도구>/` 를 연다. 그 페이지는
     배포가 찍는 것이라 여기엔 없었고, 화면이 통째로 「not found」였다(2026-08-13 실측). */
  { name: '도구·놀이 페이지 찍기 (검사가 그 주소를 연다)', cmd: ['npm', 'run', 'gen:tool-pages'] },
  { name: '놀이 페이지 찍기', cmd: ['npm', 'run', 'gen:play-pages'] },
];

export const CHECKS = [
  { name: '올린 판이 실제로 서빙되는지', cmd: ['node', 'scripts/check-live-version.mjs'], live: true },
  { name: '부르는 이름이 실제로 있는지', cmd: ['npm', 'run', 'audit:scripts'] },
  { name: 'WM 페이지 배선이 이어져 있는지', cmd: ['npm', 'run', 'audit:wm'] },
  { name: '도구마다 딸린 것이 채워졌는지', cmd: ['npm', 'run', 'audit:data'] },
  { name: '화면이 뜨는지 (전 도구)', cmd: retry('npm', 'run', 'test:live') },
  { name: '이상형 월드컵 한 판이 실제로 끝나는지', cmd: retry('node', 'scripts/smoke-worldcup.mjs'), live: true },
  { name: '오늘의 판이 첫 화면에 뜨고 세는지', cmd: retry('npm', 'run', 'test:today') },
  { name: '자랑 카드가 실제로 그려지는지', cmd: retry('npm', 'run', 'test:brag') },
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
  { name: '검색엔진이 읽는 머리가 성한지', cmd: ['npm', 'run', 'audit:seo'], live: true },
  { name: '비워 둔 자리가 실제와 맞는지', cmd: ['npm', 'run', 'audit:heights'], live: true },
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
];
