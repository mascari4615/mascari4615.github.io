/**
 * 코드 사진 알맹이 — 재는 일 (TASK-KL-245).
 *
 * 여기서 지키는 규칙은 `text2img` 와 **정반대**다: 줄을 접지 않고, 글자를 줄이지 않는다.
 * 코드는 줄이 곧 뜻이라 「가장 긴 줄이 그림 폭을 정한다」가 유일하게 맞는 셈법이다.
 * 그리고 탭은 **다음 눈금까지** 편다 — 무조건 네 칸으로 바꾸면 탭과 공백이 섞인 파일에서
 * 줄이 어긋나고, 코드에서 어긋난 들여쓰기는 곧 오해다.
 *
 * 사용: node scripts/test-codeshot-core.mjs   (npm run test:codeshot)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, label) => check(got === want, `${label}: 「${got}」 (기대 「${want}」)`);

async function load() {
  const entry = path.join(os.tmpdir(), `cs-core-${Date.now()}.ts`);
  fs.writeFileSync(
    entry,
    `export * as shot from ${JSON.stringify(path.join(root, 'src/widgets/tools/shared/code-shot.ts'))};\n` +
      `export * as frames from ${JSON.stringify(path.join(root, 'src/widgets/tools/shared/code-frames.ts'))};\n`
  );
  const out = path.join(os.tmpdir(), `cs-core-${Date.now()}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const { shot, frames } = await load();

/* ── 탭 펴기 ─────────────────────────────────────────────────────── */
eq(shot.expandTabs('\tx', 4), '    x', '줄 맨 앞 탭은 네 칸');
eq(shot.expandTabs('ab	x', 4), 'ab  x', '탭은 **다음 눈금까지**만 채운다');
eq(shot.expandTabs('abcd\tx', 4), 'abcd    x', '눈금에 딱 맞으면 한 칸 전체를 더 간다');
eq(shot.expandTabs('a	b	c', 2), 'a b c', '눈금 크기를 바꿔도 규칙은 같다');

/* ── 크기 재기 ───────────────────────────────────────────────────── */
const frame = frames.frameById('bare');
const opts = (over = {}) => ({
  fontSize: 16,
  lineHeight: 26,
  numbers: false,
  tab: 4,
  frame,
  margin: 30,
  charW: 10,
  ...over
});

{
  /* 20 글자 — 너무 짧은 그림을 막는 최소 폭(120px)보다 길게 잡아야 「가장 긴 줄」 규칙이 보인다. */
  const L = shot.layout(['ab', 'a'.repeat(20), 'abc'], opts());
  // 가장 긴 줄 20글자 × 10 + 좌우 여백(14+16) + 바깥 여백(30×2)
  eq(L.width, 20 * 10 + 14 + 16 + 60, '가장 긴 줄이 그림 폭을 정한다');
  eq(L.height, 3 * 26 + 16 + 16 + 60, '줄 수가 그림 높이를 정한다');
}

{
  /* 한 글자짜리 코드도 알아볼 그림이 나와야 한다 — 손톱만 한 PNG 는 사고로 보인다. */
  const tiny = shot.layout(['x'], opts());
  check(tiny.width >= 120, '아주 짧은 코드에도 최소 폭이 있다');
}

{
  const short = shot.layout(['x'], opts());
  const long = shot.layout(['x'.repeat(120)], opts());
  check(long.width > short.width * 5, '긴 줄은 접지 않는다 — 그림이 넓어질 뿐이다');
  eq(long.height, short.height, '줄을 안 접으므로 높이는 그대로다');
}

{
  const off = shot.layout(['a', 'b'], opts({ numbers: false }));
  const on = shot.layout(['a', 'b'], opts({ numbers: true }));
  check(on.width > off.width, '줄 번호를 켜면 그만큼 폭이 는다');
  eq(on.gutter, 1 * 10 + 18, '번호 칸은 자릿수만큼만 차지한다');
  const many = shat(shot, 120);
  eq(many.gutter, 3 * 10 + 18, '세 자리가 되면 번호 칸도 그만큼 넓어진다');
}

function shat(mod, n) {
  return mod.layout(Array.from({ length: n }, () => 'x'), opts({ numbers: true }));
}

{
  const L = shot.layout(['\tx'], opts());
  const L2 = shot.layout(['    x'], opts());
  eq(L.width, L2.width, '탭은 편 뒤의 길이로 잰다 — 안 그러면 탭 쓴 파일만 좁게 나온다');
}

{
  const L = shot.layout([], opts());
  check(L.height > 0 && L.width > 0, '빈 코드도 그림 한 장은 나온다(빈 캔버스는 고장으로 보인다)');
}

/* ── 껍데기 ──────────────────────────────────────────────────────── */
eq(frames.FRAMES.length, 4, '껍데기 넷으로 시작한다');
check(
  frames.FRAMES.every((f) => f.id && f.pad && f.palette && typeof f.back === 'function'),
  '껍데기는 모두 같은 모양을 지킨다(새로 더할 때 표에 한 줄이면 되게)'
);
eq(frames.frameById('없는것').id, frames.FRAMES[0].id, '모르는 껍데기를 부르면 기본값으로');
check(
  frames.FRAMES.some((f) => !f.palette.dark),
  '밝은 껍데기도 있어야 한다 — 어두운 것만 있으면 「테마」가 아니다'
);

/* ── 색 ──────────────────────────────────────────────────────────── */
check(shot.colorFor('keyword', true, '#fff') !== '#fff', '아는 종류는 제 색을 받는다');
check(shot.colorFor('keyword control-flow', true, '#fff') === shot.colorFor('keyword', true, '#fff'),
  'Prism 이 이름을 여럿 줘도 아는 것 하나를 집는다');
eq(shot.colorFor('듣도보도못한것', true, '#fff'), '#fff', '모르는 종류는 기본 글자색');
check(shot.colorFor('string', true, '#fff') !== shot.colorFor('string', false, '#fff'),
  '어두운 바닥과 밝은 바닥은 색이 달라야 한다');

/* ── 줄 자르기 ───────────────────────────────────────────────────── */
{
  const lines = shot.toLines([
    { text: 'a', kind: 'keyword' },
    { text: 'b\nc', kind: 'comment' },
    { text: 'd', kind: '' }
  ]);
  eq(lines.length, 2, '조각 한가운데의 줄바꿈에서도 줄이 갈린다(여러 줄 주석)');
  eq(lines[0].map((s) => s.text).join(''), 'ab', '첫 줄');
  eq(lines[1].map((s) => s.text).join(''), 'cd', '둘째 줄');
  eq(lines[0][1].kind, 'comment', '갈라져도 제 색을 잃지 않는다');
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-codeshot] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-codeshot] 전부 통과');
