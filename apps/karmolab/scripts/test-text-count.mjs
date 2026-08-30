/**
 * 글 세기 알맹이 검사 (TASK-KL-275). **사람이 세는 대로** 세는가.
 *
 * 글자수는 트위터 글자수, 이력서 자수 제한 때문에 보는 것이다. 사람 눈과 다르면 쓸모가 없다.
 * 우리가 쓰던 두 방식은 둘 다 틀렸다:
 *   `글.length` = UTF-16 조각 수, `[...글]` = 코드포인트 수(가족 이모지가 다섯으로 쪼개진다)
 *
 * 사용: node scripts/test-text-count.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'text-'));
const out = join(dir, 'text.mjs');
await build({
  entryPoints: ['src/widgets/tools/shared/text.ts'],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent'
});
const { countChars, countWords, countText, escapeHtml, head } = await import(pathToFileURL(out).href);

const failures = [];
const eq = (got, want, why) => {
  if (got === want) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why}. 기대 ${want}, 나온 것 ${got}`);
  }
};

/* 사람 눈 = 몇 자인가 */
eq(countChars('안녕하세요'), 5, '한글 다섯 자');
eq(countChars('hello'), 5, '영문 다섯 자');
eq(countChars('👍'), 1, '이모지 하나는 한 자');
eq(countChars('👨‍👩‍👧'), 1, '가족 이모지도 **한 덩이**(예전엔 5로 셌다)');
eq(countChars('🇰🇷'), 1, '국기도 한 덩이');
eq(countChars('é'.normalize('NFD')), 1, 'NFD 로 풀린 é 도 한 자');
eq(countChars('👨‍👩‍👧 안녕 café'), 9, '섞인 글. 사람 눈으로 아홉 자');
eq(countChars(''), 0, '빈 글');

/* 옛 방식과 실제로 다른가. 같으면 이 검사가 아무것도 안 지키는 것이다 */
{
  const s = '👨‍👩‍👧 안녕 café';
  const old1 = s.length;
  const old2 = [...s].length;
  if (countChars(s) !== old1 && countChars(s) !== old2) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`옛 방식(${old1}, ${old2})과 같은 수가 나오면 고친 게 없는 것이다`);
  }
}

/* 낱말, 줄, 바이트 */
eq(countWords('가나 다라 마바'), 3, '낱말 셋');
eq(countWords('  '), 0, '공백만 있으면 0');
eq(countWords('a\n\nb'), 2, '줄바꿈도 공백');
eq(countText('한 줄\n두 줄\n세 줄').lines, 3, '줄 셋');
eq(countText('').lines, 0, '빈 글은 0줄');
eq(countText('가').bytes, 3, '한글 한 자 = 3바이트');
eq(countText('a').bytes, 1, '영문 한 자 = 1바이트');
eq(countText('가 나').charsNoSpace, 2, '공백 뺀 글자 수');

/* 화면에 박아 넣을 때 */
eq(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;', '꺾쇠, 따옴표를 막는다');
eq(escapeHtml("it's"), 'it&#39;s', '홑따옴표도 막는다');

/* 앞머리 자르기. 이모지가 반 토막 나면 안 된다 */
{
  const s = '👍'.repeat(10);
  const cut = head(s, 5);
  if (!/�/.test(cut) && countChars(cut) * 2 <= 6) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`앞머리를 자르다 이모지를 쪼갰다. 나온 것 ${cut}`);
  }
  eq(head('짧은 글', 100), '짧은 글', '짧으면 그대로');
}

process.stdout.write('\n');
rmSync(dir, { recursive: true, force: true });
if (failures.length) {
  console.error(`[test-text-count] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-text-count] 사람이 세는 대로 센다');
