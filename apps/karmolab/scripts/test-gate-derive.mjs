/**
 * 발판 알아내기 — **조용히 안 도는 검사를 만들지 않는가** (TASK-KAR-231).
 *
 * 이 자리가 틀리면 나는 소리가 없다. 검사가 안 돌았는데 화면에는 초록이 뜬다 — 이 저장소에서
 * 제일 비싼 고장이다. 그래서 잠그는 것은 「빨라졌나」가 아니라 **「빠지면 안 될 것이 빠지나」**다.
 *
 * 사용: node scripts/test-gate-derive.mjs   (npm run test:gate-derive)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveWatch, pathsInside, scriptOf, tailOf } from './lib/gate-derive.mjs';
import { matches, pick } from './lib/gate-scope.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
const gates = JSON.parse(readFileSync(path.join(root, 'data', 'gate-list.json'), 'utf8')).목록;

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, why) => check(got === want, `${why} — 기대 ${want}, 나온 것 ${got}`);

// ── ① 근거를 못 구하면 「언제나 돈다」로 남는다 ──────────────────────────────

/* 이게 이 파일의 안전 기본값이다. 모르는 것을 「걸릴 것 없다」로 바꾸면 안 된다. */
eq(deriveWatch('없는검사', scripts), null, '모르는 이름이면 발판을 안 만든다');
eq(deriveWatch('typecheck', scripts), null, 'mjs 스크립트를 안 부르는 검사는 발판을 안 만든다');
/* 읽을 수 없는 스크립트도 마찬가지 — 「못 읽었다」를 「걸릴 것 없다」로 바꾸지 않는다. */
eq(
  deriveWatch('test:cutout', scripts, () => {
    throw new Error('못 읽음');
  }),
  null,
  '스크립트를 못 읽으면 발판을 안 만든다'
);
/* 아무 경로도 안 적힌 스크립트 = 알아낸 게 없다. 자기 자신만 발판으로 내주면
   그 검사는 자기 파일을 고칠 때 말고는 영영 안 돈다 — 소리 없는 고장. */
eq(deriveWatch('test:cutout', scripts, () => '// 아무 경로도 없다'), null, '알아낸 게 없으면 발판을 안 만든다');

// ── ② 자기 스크립트를 고치면 반드시 돈다 ────────────────────────────────────

let derivedCount = 0;
let selfMiss = 0;
for (const entry of gates) {
  const name = typeof entry === 'string' ? entry : (entry.이름 ?? entry.name);
  const watch = deriveWatch(name, scripts);
  if (watch === null) continue;
  derivedCount += 1;
  const script = scriptOf(name, scripts);
  if (!matches(watch, [script])) selfMiss += 1;
}
eq(selfMiss, 0, '발판을 알아낸 검사는 자기 스크립트가 바뀌면 전부 돈다');
check(derivedCount > 80, `발판을 알아낸 검사가 ${derivedCount}개 — 확 줄었으면 유도가 깨진 것이다`);

// ── ③ ★ 「전부 걸리는 자리」를 발판에 넣지 않는다 ────────────────────────────

/*
 * 이게 이 판의 핵심 회귀다. 2026-08-19 에 세운 발판 11개는 `package.json` 과
 * `src/lib/**` 를 보고 있어서, 검사를 하나 새로 다는 작업(=반드시 package.json 을 건드린다)
 * 에서는 **전부 걸려** 통짜와 똑같이 돌았다. 2026-08-20 에 이 파일이 같은 함정을 한 번 더
 * 밟았다(건너뜀 0으로 실측됨). 그래서 못 박는다.
 */
/* ★ 글자를 **쪼개서** 만든다 — 이 파일 안에 따옴표로 감싼 `src/…` 를 그대로 적으면
   유도기가 그걸 이 검사의 발판으로 집어 간다(실측: 이 줄 때문에 자기 자신이 걸렸다).
   검사가 자기 자신을 오염시키는 자리라, 여기만은 일부러 돌아간다. */
const S = 'sr' + 'c';
const 함정 = ['package.js' + 'on', `${S}/lib/**`, `${S}/**`];
let 함정걸림 = [];
for (const entry of gates) {
  const name = typeof entry === 'string' ? entry : (entry.이름 ?? entry.name);
  const watch = deriveWatch(name, scripts);
  if (watch === null) continue;
  for (const bad of 함정) if (watch.includes(bad)) 함정걸림.push(`${name} ← ${bad}`);
}
eq(함정걸림.length, 0, `알아낸 발판에 「전부 걸리는 자리」가 섞였다: ${함정걸림.slice(0, 3).join(' · ')}`);

/* `data/gate-list.json` 은 **정말로 그 파일을 읽는 검사**(`audit:gate-list` 등)에만 들어야 한다.
   모두에게 붙으면(=ALWAYS 에 넣으면) 검사를 하나 다는 작업마다 전부 걸린다 — 그게 함정이었다. */
const 목록본다 = gates
  .map((e) => (typeof e === 'string' ? e : (e.이름 ?? e.name)))
  .filter((n) => (deriveWatch(n, scripts) ?? []).includes('data/gate-list.json'));
check(목록본다.length <= 8, `gate-list 를 보는 검사가 ${목록본다.length}개 — 모두에게 붙었으면 함정으로 되돌아간 것이다`);

/* 실제로 그렇게 되는지 끝까지 재 본다 — package.json 만 바뀐 판에서 뭔가는 건너뛰어야 한다. */
const onlyPkg = pick(gates, ['package.json'], (n) => deriveWatch(n, scripts));
check(onlyPkg.skipped.length > 50, `package.json 만 바뀌면 대부분 건너뛴다 (지금 ${onlyPkg.skipped.length}개)`);

// ── ④ 있는 것만 발판이 된다 ─────────────────────────────────────────────────

const real = deriveWatch('test:cutout', scripts);
check(real.includes('src/lib/ai-cutout.ts'), '스크립트가 글자로 부른 파일이 발판에 든다');
check(real.includes('src/lib/inpaint.ts'), '여러 개를 부르면 여러 개가 다 든다');
check(
  !real.some((w) => w.startsWith('src/') && w.includes('없는')),
  '없는 경로는 안 넣는다'
);

/* 폴더를 훑는 검사는 그 안 아무 파일에나 걸려야 한다. */
const shared = deriveWatch('audit:shared-bypass', scripts);
check(shared !== null && matches(shared, ['src/widgets/tools/아무거나.ts']), '폴더는 그 안 전부로 넓힌다');

// ── ⑤ 조각들 ────────────────────────────────────────────────────────────────

eq(tailOf('test:xmlfmt'), 'xmlfmt', '이름 뒤쪽을 뗀다');
eq(tailOf('typecheck'), '', '갈래가 없으면 빈 문자열');
eq(tailOf('test:i18n:pages'), 'pages', '갈래가 여럿이면 마지막 칸');
eq(scriptOf('test:cutout', scripts), 'scripts/test-cutout.mjs', '부르는 스크립트를 집는다');
eq(scriptOf('없는것', scripts), null, '없으면 null');
check(pathsInside(`const a = '${S}/lib/x.ts'; const b = "data/y.json";`).length === 2, '따옴표 안 경로 둘을 다 집는다');
check(pathsInside(S + '/lib/x.ts 는 주석이다').length === 0, '따옴표 밖은 안 집는다');
/* 역따옴표로 감싼 주석 속 경로도 집는다 — 그건 「이 검사가 무엇을 딛나」를 사람이 적어 둔
   진짜 신호다. 넓은 쪽으로 틀리면 더 도는 것으로 끝나므로 안전하다. */
check(pathsInside('/* 설명: `' + S + '/lib/x.ts` */').length === 1, '역따옴표로 감싼 경로는 집는다');

/* ★ 다만 **글로브가 든 경로는 버린다.** `**` 가 보이는 자리는 거의 다 설명 문장이고,
   그걸 발판으로 삼으면 그 검사가 모든 소스를 보게 된다 = 늘 돈다 = 유도가 무의미해진다.
   (이 판을 짜다 실제로 이 파일이 자기 머리말 한 줄 때문에 그렇게 됐다.) */
const 글로브든것 = deriveWatch('test:gate-derive', scripts) ?? [];
check(!글로브든것.some((w) => w.startsWith(S + '/') && w.includes('*')), '설명 문장의 글로브는 발판이 안 된다');

/* 「모든 소스」는 발판이 아니다 — 넣어도 늘 걸리므로 알아낸 게 없는 것과 같다. */
check(!(deriveWatch('test:gate-derive', scripts) ?? []).includes(`${S}/**`), '뜻 없는 넓은 발판은 안 넣는다');

// ── ⑥ 그래서 실제로 줄어드나 (줄어야 이 파일이 존재할 이유가 있다) ───────────

const 한도구만 = pick(gates, ['src/widgets/bluemarble/air.ts'], (n) => deriveWatch(n, scripts));
check(
  한도구만.run.length < gates.length * 0.7,
  `한 파일만 고쳤을 때 ${한도구만.run.length}/${gates.length} — 30% 넘게 줄어야 한다`
);
check(한도구만.run.includes('test:air'), '그래도 그 파일의 검사는 반드시 돈다');

// ── 마무리 ───────────────────────────────────────────────────────────────────
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[test-gate-derive] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[test-gate-derive] 발판 유도 ${derivedCount}/${gates.length}개 · 검사 전부 통과`);
