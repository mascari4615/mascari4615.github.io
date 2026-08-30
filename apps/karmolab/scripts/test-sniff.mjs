/**
 * 알아보기 알맹이 검사 (TASK-KL-263). 붙여넣은 것의 갈래를 맞게 짚는가.
 *
 * 이건 화면이 아니라 **판정**이라, 브라우저 없이 판정만 재는 게 맞다. 특히 볼 것은
 * **겹치는 것들**이다: JWT 는 base64 이기도 하고, 해시는 16진수이기도 하고, 쉼표가 든 글은
 * 표처럼 보인다. 넓은 것이 좁은 것을 먹으면 짚는 기능 자체가 쓸모없어진다.
 *
 * 사용: node scripts/test-sniff.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'sniff-'));
const out = join(dir, 'sniff.mjs');
await build({
  entryPoints: ['src/widgets/tools/shared/sniff.ts'],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent'
});
const { sniff } = await import(`file://${out.replace(/\\/g, '/')}`);

const failures = [];
const eq = (raw, want, why) => {
  const got = sniff(raw).kind;
  if (got === want) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why}. 기대 ${want}, 나온 것 ${got}`);
  }
};

/* 곧은 것들 */
eq('{"a":1,"b":[1,2]}', 'json', 'JSON 물체');
eq('[1,2,3]', 'json', 'JSON 목록');
eq('{"a":1,', 'json', '깨진 JSON 도 JSON. 오히려 이때 보기 좋게가 필요하다');
eq('https://karmolab.dev/t/pdf?a=1&b=2', 'url', 'URL');
eq('550e8400-e29b-41d4-a716-446655440000', 'uuid', 'UUID');
eq('1755043200', 'epoch', '초 단위 시각');
eq('1755043200000', 'epoch', '밀리초 시각');
eq('*/5 * * * *', 'cron', '크론');
eq('a,b,c\n1,2,3\n4,5,6', 'csv', '칸 수가 고른 표');
eq('a\tb\n1\t2', 'csv', '탭으로 나뉜 표');
eq('d41d8cd98f00b204e9800998ecf8427e', 'hex', 'MD5 길이 16진수');
eq('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'hex', 'SHA-256 길이');

/* **겹치는 것들**. 여기서 순서가 판가름난다 */
const jwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
eq(jwt, 'jwt', 'JWT 가 base64 에 먹히면 안 된다');
eq('aGVsbG8gd29ybGQgdGhpcyBpcyBiYXNlNjQ=', 'base64', 'Base64');
eq('그냥 사람이 쓴 글입니다. 쉼표, 도 있고요.', 'text', '쉼표 든 한 줄 글이 표가 되면 안 된다');
eq('사과, 배, 감\n귤, 포도', 'text', '칸 수가 안 맞으면 표가 아니다');
eq('hello', 'text', '짧은 글은 base64 가 아니다');
eq('', 'text', '빈 것');
eq('2026-08-13', 'text', '날짜 글자는 시각(숫자)이 아니다');
eq('999999999999999', 'text', '자릿수 안 맞는 숫자는 시각이 아니다');

/* 곁들이는 셈이 실제로 붙는가 */
const j = sniff('{"a":1,"b":2,"c":3}');
if (j.detail === '키 3개') process.stdout.write('.');
else {
  process.stdout.write('x');
  failures.push(`JSON 키 수를 세야 한다. 나온 것 ${j.detail}`);
}
const c = sniff('a,b,c\n1,2,3');
if (c.detail === '3칸, 2줄') process.stdout.write('.');
else {
  process.stdout.write('x');
  failures.push(`표는 칸, 줄을 세야 한다. 나온 것 ${c.detail}`);
}

process.stdout.write('\n');
rmSync(dir, { recursive: true, force: true });
if (failures.length) {
  console.error(`[test-sniff] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-sniff] 전부 통과');
