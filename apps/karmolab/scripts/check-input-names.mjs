/**
 * 입력칸에 이름이 붙어 있는지 **소스에서** 본다 (TASK-KL-088)
 *
 * 이미 라이브를 재는 검사가 있다(`audit-input-labels.mjs`). 그런데 그건 배포된 뒤에야 알려 준다 —
 * 실제로 오늘 도구 7개에 이름 없는 칸 17개를 만들고도 배포 전에는 아무 신호가 없었다.
 * 배포가 막힌 날이라 우연히 손으로 발견했을 뿐이다.
 *
 * 그래서 같은 것을 소스에서 미리 본다. 라이브 검사를 대신하는 게 아니라 **더 일찍** 잡는 자리다.
 * 눈에 보이는 설명이 옆에 적혀 있어도 화면낭독기는 이어 준 것만 읽는다 —
 * `aria-label` 이나 `<label for>` 로 이어 줘야 한다.
 *
 * 사용: node scripts/check-input-names.mjs
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'src/widgets/tools');

// 이름이 필요한 것: 값을 고르거나 적는 칸. 체크박스·라디오는 대개 <label> 로 감싸므로 뺀다
// (감싼 경우 화면낭독기가 그 글을 읽어 준다). 파일 선택은 감싸는 영역이 설명을 갖는다.
const NEEDS_NAME = /<(input|select|textarea)\b[^>]*>/g;
const SKIP_TYPES = /type="(hidden|checkbox|radio|file|button|submit)"/;

/* ★ **밀어 올린 그 커밋을 본다 — 디스크가 아니라** (2026-08-13).
 *
 * 이 나무는 세션 여섯이 함께 쓴다. 디스크를 읽으면 **남이 아직 커밋도 안 한 편집**이 내 push 를
 * 막는다 (실측: 이웃의 burnnote 작업 때문에 내 무관한 push 가 계속 빨갰다). 반대로 남의
 * 미커밋 상태 덕에 통과해 버리는 일도 있었다 — 이 파일 아래 주석의 그 사고다.
 * 판정 대상은 **올라가는 커밋**이다. 못 물어보면(git 없음·얕은 사본) 그때만 디스크로 내려간다. */
const REF = process.env.KL_PUSH_SHA || 'HEAD';
const gitEnv = { ...process.env };
delete gitEnv.GIT_DIR;
delete gitEnv.GIT_WORK_TREE;
delete gitEnv.GIT_INDEX_FILE;
delete gitEnv.GIT_PREFIX;
const git = (args) =>
  execFileSync('git', args, { cwd: root, env: gitEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

/** `[{ name, src }]` — 커밋에서 읽는다. 못 읽으면 `null`(모름) 이고 그때만 디스크를 본다. */
function toolsAtRef() {
  try {
    const relDir = path.relative(root, dir).split(path.sep).join('/');
    const names = git(['ls-tree', '-r', '--name-only', REF, '--', relDir])
      .split(String.fromCharCode(10))
      .map((l) => l.trim())
      .filter((l) => l.endsWith('.ts'));
    if (!names.length) return null; // 하나도 못 봤다 = 못 물어본 것에 가깝다
    /* `ls-tree` 가 돌려주는 자리는 **지금 선 곳 기준**이다. `show` 에 그대로 넘기면 저장소
       뿌리 기준으로 읽어 엉뚱한 자리를 찾다 던진다 — 그러면 조용히 디스크로 내려가 버려서
       고쳐 놓고도 남의 낡은 사본 때문에 계속 빨갰다. `./` 를 붙여 「여기 기준」이라고 말한다. */
    return names.map((full) => ({ name: full.split('/').pop(), src: git(['show', `${REF}:./${full}`]) }));
  } catch {
    return null;
  }
}

const files =
  toolsAtRef() ||
  fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.ts'))
    .map((n) => ({ name: n, src: fs.readFileSync(path.join(dir, n), 'utf8') }));

/* 주석은 화면이 아니다 (2026-08-13). 설명글에 적힌 `<input accept>` 같은 예시가 진짜 칸으로
   잡혀 「이름 없는 칸 1개」가 됐다 — 없는 결함을 쫓게 만드는 빨강이라 먼저 걷어낸다. */
const stripBlockComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ');

const offenders = [];
let seenCells = 0;
for (const { name, src: raw } of files) {
  const src = stripBlockComments(raw);
  for (const m of src.matchAll(NEEDS_NAME)) {
    const tag = m[0];
    seenCells += 1;
    if (SKIP_TYPES.test(tag)) continue;
    if (/aria-label=|aria-labelledby=|title="/.test(tag)) continue;
    // placeholder 는 브라우저가 이름이 없을 때 대신 읽어 준다 — 완벽하진 않지만 「편집란」보다는 낫다.
    // 이 검사는 **이름이 될 만한 것이 하나도 없는** 칸만 잡는다 (라이브 검사가 0 이라고 한 것을
    // 여기서 77개라 우기면 아무도 안 믿는다 — 실제로 처음엔 그렇게 잘못 짰다).
    if (/placeholder="/.test(tag)) continue;
    const id = (tag.match(/id="([^"]+)"/) || [])[1];
    if (id && new RegExp(`<label[^>]*for="${id}"`).test(src)) continue;
    // <label> … <input> … </label> 처럼 감싼 경우도 이름이 붙는다
    const before = src.slice(0, m.index);
    const openLabel = before.lastIndexOf('<label');
    if (openLabel >= 0 && before.indexOf('</label>', openLabel) < 0) continue;
    offenders.push(`${name}: ${id ? '#' + id : tag.slice(0, 48)}`);
  }
}

/*
 * **막지 않고 알리기만 한다.** 처음엔 빌드를 막게 했더니 CI 가 통째로 죽었다 —
 * 내 컴퓨터에는 다른 세션이 고치는 중인(아직 커밋 안 된) 이름들이 있어서 통과했고,
 * 저장소에는 없어서 실패한 것이다. **남의 미커밋 상태에 기대 통과한 검사**였다.
 *
 * **0 이 된 날 잠갔다 (TASK-KL-105).** 예전에는 세기만 하고 그냥 통과시켰다 — 남의 작업을
 * 막지 않으려는 뜻이었는데, 결과는 숫자가 몇 달 동안 39에서 그대로였다. 아무도 안 막으니
 * 아무도 안 고쳤다. 이제 0 이므로 늘어나는 순간 빨개진다. 새로 만드는 칸에 이름 한 줄
 * 붙이는 비용은 작고, 안 붙이면 그 칸은 「편집란」으로만 읽힌다.
 *
 * 배포된 화면을 재는 짝은 `audit-input-labels.mjs` (기준치 0). 이쪽이 먼저·빠르게 잡고,
 * 그쪽이 실제로 나간 화면을 확인한다.
 */
/* ★ **칸을 한 개도 못 봤으면 통과가 아니다** (2026-08-16).
   이 검사는 화면낭독기가 「편집란」으로만 읽는 칸을 잡는다. 그런데 칸을 찾는 정규식이
   낡거나(도구가 다른 방식으로 칸을 그리게 바뀌면) 걸리는 게 0 개가 되고, 그러면
   「전부 이름을 갖고 있다」를 찍고 초록으로 끝난다 — 실제로는 아무것도 안 본 것이다.
   파일은 읽혔는데 칸이 0 개면 그건 못 돌린 것이다. */
if (seenCells === 0) {
  console.error(`[check-input-names] CANNOT-RUN: 파일 ${files.length}개를 읽었는데 입력칸을 한 개도 못 찾았다`);
  console.error('  → 도구가 칸을 그리는 방식이 바뀌었거나 이 검사의 정규식이 낡았다.');
  console.error('  → 0 개는 통과가 아니다 — 이 검사는 39개를 0 으로 만든 뒤 잠근 자리다 (KL-105).');
  process.exit(2);
}

if (offenders.length) {
  console.error(`[check-input-names] 이름 없는 입력칸 ${offenders.length}개 — 화면낭독기는 「편집란」으로만 읽습니다`);
  /* ★ **내 사본이 낡아서 나는 빨강인지 말해 준다** (2026-08-13).
     이 나무는 세션 여섯이 함께 쓴다 — 남이 편집 중인 파일이 내 자리에서는 **옛 판**일 수 있다.
     실측: 이름을 이미 붙여 올린 파일이 여기서는 그대로라, 고쳐 놓고도 빨강을 다시 쫓았다.
     그 파일이 origin 과 다르면 그렇다고 적어 둔다 — 없는 버그를 쫓는 시간이 제일 아깝다. */
  const stale = new Set();
  for (const o of offenders) {
    const file = String(o).split(':')[0].trim();
    if (!file || stale.has(file)) continue;
    try {
      const rel = path.join(dir, file);
      const mine = fs.readFileSync(rel, 'utf8');
      const theirs = execFileSync('git', ['show', `origin/master:./${path.relative(root, rel).split(path.sep).join('/')}`],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (mine !== theirs) stale.add(file);
    } catch { /* 물어볼 수 없으면 아무 말도 안 한다 */ }
  }
  offenders.slice(0, 15).forEach((o) => {
    const file = String(o).split(':')[0].trim();
    console.error('  - ' + o + (stale.has(file) ? '   ← 내 사본이 origin 과 다르다 (남이 편집 중일 수 있다)' : ''));
  });
  if (offenders.length > 15) console.error(`  … 그 밖 ${offenders.length - 15}개`);
  console.error('  고치는 법: 그 칸에 aria-label="눈에 보이는 그 설명" 을 붙이거나 <label for> 로 이어 주세요.');
  process.exit(1);
}
console.log('[check-input-names] 도구의 입력칸이 모두 이름을 갖고 있다');
