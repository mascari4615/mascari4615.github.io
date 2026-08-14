/**
 * 셈 공책 알맹이 검사 (TASK-KL-264) — 사람이 적은 줄을 맞게 세는가.
 *
 * 계산기는 **틀리면 안 되는** 물건이라 화면보다 여기가 본검사다. 특히 볼 것:
 *   - 줄 순서가 문맥이다 (앞 줄 이름·앞 줄 값·여태 합)
 *   - 퍼센트 세 가지가 서로 안 먹는다 (`25% of 400` ≠ `400 + 25%`)
 *   - 못 세는 줄이 **나머지를 안 무너뜨린다** (한 줄 틀렸다고 공책이 죽으면 못 쓴다)
 *   - `eval` 을 안 쓰므로 코드가 든 줄은 그냥 못 센 줄이어야 한다
 *
 * 사용: node scripts/test-calc.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'calc-'));
const out = join(dir, 'calc.mjs');
await build({
  entryPoints: ['src/widgets/tools/shared/calc.ts'],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent'
});
const { calcSheet, solveZero, plotSamples, evalAt } = await import(`file://${out.replace(/\\/g, '/')}`);

const failures = [];
const near = (a, b) => Math.abs(a - b) < 0.01;
/** 한 줄짜리 */
const val = (src, want, why) => {
  const r = calcSheet(src);
  const got = r[r.length - 1].value;
  if (got !== null && near(got, want)) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why} — 「${src}」 기대 ${want}, 나온 것 ${got} ${r[r.length - 1].error || ''}`);
  }
};
const dead = (src, why) => {
  const r = calcSheet(src);
  if (r[r.length - 1].value === null) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why} — 「${src}」 는 못 세야 하는데 ${r[r.length - 1].value} 가 나왔다`);
  }
};

/* 사칙연산 */
val('1234 + 5678', 6912, '더하기');
val('1,234 + 1,000', 2234, '쉼표 든 숫자');
val('(3 + 4) * 5', 35, '괄호');
val('2 ^ 10', 1024, '거듭제곱');
val('10 / 4', 2.5, '나누기');
val('-5 + 3', -2, '음수로 시작');
dead('1 / 0', '0 으로 나누기는 답이 아니다');

/* 퍼센트 세 가지 — 서로 먹으면 안 된다 */
val('25% of 400', 100, '~의 몇 퍼센트');
val('400의 25%', 100, '한국어 어순');
val('50000 + 10%', 55000, '부가세 붙이기');
val('19800 - 10%', 17820, '할인');

/* 단위 */
val('3km in mi', 1.8641, '길이 바꾸기');
val('1000 m to km', 1, '미터 → 킬로미터');
val('2kg in lb', 4.4092, '무게');
val('1gb in mb', 1024, '데이터');
val('90min in h', 1.5, '시간');
val('3.3 m2 in 평', 0.9982, '평');
dead('3kg in km', '무게를 길이로는 못 바꾼다');

/* 줄 순서가 문맥 */
val('밥값 = 32000\n밥값 / 4', 8000, '앞 줄 이름을 뒤 줄이 쓴다');
val('a = 10\nb = 20\na * b', 200, '이름 둘');
val('100\n200\nsum', 300, '여태 합');
val('7 * 6\nprev + 8', 50, '앞 줄 값');
val('밥값 = 30000\n술값 = 20000\n밥값 + 술값\n앞 / 5', 10000, '세 줄 이어 셈 — 1인당');

/* 안 세는 줄 · 안 죽는 공책 */
{
  const r = calcSheet('# 오늘 정산\n\n30000\n이건 뭐라고 쓴 줄\n5000\nsum');
  const ok = r[0].value === null && r[1].value === null && r[3].value === null && near(r[5].value, 35000);
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`못 세는 줄이 나머지를 무너뜨리면 안 된다 — 나온 합 ${r[5].value}`);
  }
  if (r[3].error) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('못 센 줄은 이유를 남겨야 한다');
  }
  if (!r[0].error) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('주석 줄은 흠이 아니다 — 이유를 남기면 안 된다');
  }
}

/* eval 을 안 쓴다 — 코드가 든 줄은 그냥 못 센 줄 */
dead('process.exit(1)', '코드는 못 세는 줄이어야 한다');
dead('[].constructor', '코드는 못 세는 줄이어야 한다 (2)');
dead('알수없는이름 + 1', '모르는 이름');

/* 단위가 답에 도로 붙는가 */
{
  const r = calcSheet('1200원 * 3');
  if (r[0].text.includes('원') && near(r[0].value, 3600)) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`「원」 이 답에 붙어야 한다 — 나온 것 「${r[0].text}」`);
  }
}


/* ── x 구하기 · 그리기 (TASK-KL-238 / 13 wolframalpha) ────────────────
 *
 * 여기서 가장 나쁜 실패는 **지어낸 답**이다. 삼차를 이차로 우겨 풀거나, 실수 답이 없는데
 * 숫자를 내놓으면 사람이 그걸 믿는다. 그래서 「없다」와 「대략」을 말하는지도 같이 본다. */
const lastLine = (src) => {
  const r = calcSheet(src);
  return r[r.length - 1];
};
const says = (src, want, why) => {
  const got = lastLine(src).text;
  if (got.replace(/\s+/g, '') === want.replace(/\s+/g, '')) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why}: 「${got}」 (기대 「${want}」)`);
  }
};

says('2x + 3 = 11', 'x = 4', '일차방정식');
says('2*x + 3 = 11', 'x = 4', '곱셈 기호를 적어도 같다');
says('x/2 = 8', 'x = 16', '나눗셈만 있어도');
says('x^2 - 5x + 6 = 0', 'x = 2, 3', '이차방정식은 뿌리 둘');
says('x^2 = 9', 'x = -3, 3', '이차 — 음수 뿌리를 안 버린다');
says('x^2 - 6x + 9 = 0', 'x = 3', '중근은 하나로');

{
  const r = lastLine('x^2 + 1 = 0');
  if (r.value === null && r.text === '' && r.error) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`허근뿐이면 답을 지어내면 안 된다 — 나온 것 「${r.text}」`);
  }
}
{
  const r = lastLine('x^3 - 8 = 0');
  const n = Number(r.text.replace(/[^0-9.-]/g, ''));
  if (r.text.includes('≈') && Math.abs(n - 2) < 0.01) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`삼차는 대략으로 말해야 한다 — 나온 것 「${r.text}」`);
  }
}
{
  const r = calcSheet('밥값 = 32000\n밥값 * 2');
  if (near(r[1].value, 64000)) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`이름 매기기가 방정식으로 오해되면 안 된다 — 나온 것 「${r[1].text}」`);
  }
}
{
  const r = calcSheet('x = 3\nx + 1');
  if (near(r[1].value, 4)) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`x = 3 은 값 매기기다 — 나온 것 「${r[1].text}」`);
  }
}
{
  const p = lastLine('y = x^2 - 3').plot;
  if (p && p.points.length > 100 && Math.abs(p.minY + 3) < 0.01) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`y = x^2 - 3 은 표본을 내야 한다 (골은 -3) — 나온 것 ${p ? p.minY : '없음'}`);
  }
}
{
  const p = plotSamples('1/x', -5, 5, 100);
  if (p && p.points.every(([, y]) => Number.isFinite(y))) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('못 재는 자리(1/0)는 건너뛰어야 한다');
  }
}
{
  const p = plotSamples('5', -1, 1, 10);
  if (p && p.maxY > p.minY) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('납작한 직선도 높이를 가져야 그려진다');
  }
}
if (solveZero(() => 1) === null) process.stdout.write('.');
else {
  process.stdout.write('x');
  failures.push('늘 1 인 함수는 뿌리가 없다고 해야 한다');
}
if (Number.isNaN(evalAt('알수없는', 1))) process.stdout.write('.');
else {
  process.stdout.write('x');
  failures.push('모르는 이름은 NaN 이어야 한다 (던지면 그리기가 죽는다)');
}

process.stdout.write('\n');
rmSync(dir, { recursive: true, force: true });
if (failures.length) {
  console.error(`[test-calc] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-calc] 전부 통과');
