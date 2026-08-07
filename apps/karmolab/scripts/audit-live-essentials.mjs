/**
 * 실제 사이트에 「있어야 하는 것」이 있는가 (TASK-KL-089)
 *
 * 왜 있나: 하루에 두 번, 내 작업이 **조용히 사라졌다.** 여러 세션이 같은 저장소를 쓰다 보니
 * 갈래가 다시 쓰이면서 파일 몇 개가 예전 내용으로 되돌아갔다. 커밋은 남아 있는데 내용이 없다.
 * 그런데 그때도 검사는 전부 초록이었다 — 검사들이 **내 컴퓨터의 파일**을 보고 있었기 때문이다.
 *
 * 그래서 이 검사만은 실제 주소에서, 사람이 보게 되는 결과로 확인한다:
 * 「마크업이 나갔나」 뿐 아니라 「그 모양을 만드는 스타일도 함께 나갔나」까지 본다
 * (실제로 칸은 나가고 스타일만 빠져서, 맨몸으로 떠 있던 적이 있다).
 *
 * 여기 적는 것은 **없어지면 사람이 바로 손해를 보는 것들**로 한정한다 — 목록이 길어지면
 * 아무도 안 고치는 빨간불이 된다.
 *
 * 사용: BASE=https://blog.mascari4615.com node scripts/audit-live-essentials.mjs
 */
const BASE = process.env.BASE || 'https://blog.mascari4615.com';

if (!BASE.startsWith('https://')) {
  console.log(`[audit-live-essentials] 건너뜀 — 실제 사이트가 아니다 (BASE=${BASE}). 이 검사는 배포된 주소에서만 뜻이 있다.`);
  process.exit(0);
}

const problems = [];
const notes = [];

async function get(pathname) {
  const res = await fetch(BASE + pathname);
  return { status: res.status, text: await res.text() };
}

/** 있어야 하는 것 — [무엇, 어디서, 찾을 것, 없으면 사람이 겪는 일] */
const WANT = [
  ['도구 페이지의 이동 경로', '/karmolab/t/loan/', /class="tool-crumb"/, '도구 한 장에 떨어진 사람이 위로 올라갈 길이 없다'],
  ['그 이동 경로의 모양', '/apps/karmolab/css/tools.css', /\.tool-crumb\s*\{/, '경로가 맨몸으로 떠서 글자 뭉치처럼 보인다'],
  ['도구 페이지의 찾기 칸', '/karmolab/t/loan/', /class="tool-seo-find"/, '다른 도구를 찾으려면 목록으로 건너가야 한다'],
  ['그 찾기 칸의 모양', '/apps/karmolab/css/tools.css', /\.tool-seo-find\s*\{/, '칸과 버튼이 줄도 안 맞고 폰에서 화면이 확대된다'],
  ['도구 페이지의 방문 기록기', '/karmolab/t/loan/', /gc\.zgo\.at/, '어느 도구로 사람이 오는지 하나도 안 세어진다'],
  ['검색 결과에서 큰 그림 허용', '/karmolab/t/loan/', /max-image-preview:large/, '공유 카드가 작은 썸네일로 나가거나 아예 안 나간다'],
  ['블로그에서 도구로 가는 길', '/', /href="[^"]*\/karmolab\/t\/"/, '글 수백 장에서 도구로 가는 길이 사라진다'],
  ['없는 도구 주소 건지기', '/karmolab/t/그런도구없음/', /karmolab-rescue/, '옛 링크로 온 사람이 그냥 버려진다'],
  ['놀이 — 높은 쪽 고르기', '/karmolab/higher/', /id="picks"/, '목록에서 링크만 걸리고 열면 없다'],
  ['놀이 — 오늘의 문제', '/karmolab/quest/', /id="all"/, '목록에서 링크만 걸리고 열면 없다'],
  // TASK-KL-098 — 아래 셋은 실제로 한 번 통째로 사라진 적이 있다. 다른 작업이 같은 파일을
  // 다시 쓰면서 줄이 없어졌고, 내 컴퓨터를 보는 검사는 전부 초록이었다.
  ['로그인·기록 스크립트', '/karmolab/', /js\/account\.js/, '로그인·헤더·광장이 통째로 죽는다 (한 번 그랬다)'],
  ['그 스크립트가 실제로 받아진다', '/apps/karmolab/js/account.js', /KarmoAccount/, '부르기는 하는데 파일이 안 만들어져 404 다'],
  ['광장 입구', '/karmolab/', /Toolbox\.switchPage\('plaza'\)/, '이야기·도구 요청으로 가는 길이 없어진다'],
  ['공개 프로필 페이지', '/karmolab/u/', /id="profileRoot"/, '남에게 보여줄 프로필 주소가 죽는다']
];

for (const [what, where, re, hurt] of WANT) {
  let got;
  try {
    got = await get(where);
  } catch (e) {
    problems.push(`${what}: ${where} 를 못 받았다 (${String(e.message).slice(0, 40)})`);
    continue;
  }
  // 「없는 주소」 자리는 404 가 정상이다 — 상태가 아니라 내용으로 본다.
  if (got.status >= 500) {
    problems.push(`${what}: ${where} 가 http ${got.status}`);
    continue;
  }
  if (!re.test(got.text)) problems.push(`${what} 이(가) 실제 사이트에 없다 — ${hurt} (${where})`);
  else notes.push(what);
}

if (problems.length) {
  console.error(`[audit-live-essentials] 실제 사이트에서 빠진 것 ${problems.length}건 / ${WANT.length}`);
  problems.forEach((p) => console.error('  - ' + p));
  console.error('  → 내 컴퓨터 파일과 원격을 견줘 봐라: `git diff origin/master -- <파일>`. 갈래가 다시 쓰이며 되돌아간 적이 있다.');
  process.exit(1);
}
console.log(`[audit-live-essentials] 실제 사이트에 ${notes.length}가지 다 있다 — 마크업뿐 아니라 그 모양을 만드는 스타일까지`);
