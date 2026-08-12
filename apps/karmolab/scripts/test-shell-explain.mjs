/**
 * 명령줄 뜯어보기 알맹이 — 자르는 일 (TASK-KL-250).
 *
 * 이 도구가 틀리는 자리는 전부 **자르기**다. 공백으로 나누면 따옴표 안이 쪼개지고,
 * 붙은 옵션(`-xzvf`)이 한 덩어리로 남고, 파이프 너머가 같은 명령으로 보인다.
 * 틀린 자르기 위에 붙인 설명은 설명이 아니라 오해다.
 *
 * 사용: node scripts/test-shell-explain.mjs   (npm run test:shell)
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
  const entry = path.join(os.tmpdir(), `sh-core-${Date.now()}.ts`);
  fs.writeFileSync(
    entry,
    `export * from ${JSON.stringify(path.join(root, 'src/lib/shell-explain.ts'))};\n` +
      `export { COMMANDS, DANGERS } from ${JSON.stringify(path.join(root, 'src/lib/shell-dict.ts'))};\n`
  );
  const out = path.join(os.tmpdir(), `sh-core-${Date.now()}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const S = await load();

/* ── 낱말로 자르기 ────────────────────────────────────────────────── */
eq(S.tokenize('ls -la').join('|'), 'ls|-la', '보통 줄');
eq(
  S.tokenize('git commit -m "두 낱말"').join('|'),
  'git|commit|-m|"두 낱말"',
  '따옴표 안의 공백에서는 자르지 않는다'
);
eq(S.tokenize("echo 'a b'").join('|'), "echo|'a b'", '홑따옴표도 마찬가지');
eq(S.tokenize('cp a\\ b c').join('|'), 'cp|a\\ b|c', '역슬래시로 막은 공백도 한 덩어리');
eq(S.tokenize('ls|grep x').join('|'), 'ls|||grep|x', '띄어쓰기 없이 붙은 파이프도 낱말이다');
eq(S.tokenize('a && b').join('|'), 'a|&&|b', '두 글자 이음말');
eq(S.tokenize('cmd > out.txt').join('|'), 'cmd|>|out.txt', '방향 바꾸기');
eq(S.tokenize('cmd 2> err.log').join('|'), 'cmd|2>|err.log', '오류만 따로 보내기');
eq(S.tokenize('   ').length, 0, '빈 줄은 빈 손');

/* ── 붙은 옵션 펴기 ───────────────────────────────────────────────── */
eq(S.expandFlags('-xzvf').join(' '), '-x -z -v -f', '붙은 짧은 옵션을 하나씩 편다');
eq(S.expandFlags('--all').join(' '), '--all', '긴 옵션은 건드리지 않는다');
eq(S.expandFlags('-1').join(' '), '-1', '한 글자짜리는 그대로');
eq(S.expandFlags('--').join(' '), '--', '「여기부터 옵션 아님」 표시는 그대로');
eq(S.expandFlags('-2.5').join(' '), '-2.5', '음수처럼 보이는 값은 옵션이 아니다');
eq(S.expandFlags('file.txt').join(' '), 'file.txt', '옵션이 아닌 것은 그대로');

/* ── 도막 나누기 ──────────────────────────────────────────────────── */
{
  const segs = S.explain('ls -la | grep foo');
  eq(segs.length, 2, '파이프 너머는 다른 명령이다');
  eq(segs[0].name, 'ls', '첫 명령');
  eq(segs[1].name, 'grep', '둘째 명령');
  eq(segs[1].join, '|', '무엇으로 이어졌는지 기억한다');
  check(!!segs[1].joinWhat, '이음말의 뜻도 말해 준다');
}
{
  const segs = S.explain('npm test && git push');
  eq(segs.length, 2, '&& 도 명령을 나눈다');
  check(/성공/.test(segs[1].joinWhat), '&& 는 「앞이 성공했을 때만」');
}

/* ── 뜻 붙이기 ────────────────────────────────────────────────────── */
{
  const [seg] = S.explain('tar -xzvf a.tar.gz');
  const flags = seg.parts.filter((p) => p.kind === 'flag');
  eq(flags.length, 4, '붙은 옵션 넷이 각각 설명을 받는다');
  check(flags.every((f) => f.what.length > 0), '넷 다 뜻이 붙는다');
  check(seg.parts.some((p) => p.kind === 'value' && p.text === 'a.tar.gz'), '파일 이름은 값으로');
}
{
  const [seg] = S.explain('git commit -m "fix"');
  check(seg.parts.some((p) => p.kind === 'command' && p.text === 'commit'), '하위 명령을 알아본다');
  const m = seg.parts.find((p) => p.text === '-m');
  check(/메시지/.test(m.what), '하위 명령의 옵션 표를 먼저 본다');
}
{
  /* `git push -f` 의 `-f` 는 `git -f` 가 아니다 — 하위 명령마다 뜻이 다르다. */
  const [seg] = S.explain('git push -f');
  const f = seg.parts.find((p) => p.text === '-f');
  check(/덮어/.test(f.what), '하위 명령이 다르면 같은 글자도 다른 뜻');
}
{
  const [seg] = S.explain('듣도보도못한명령 -q');
  eq(seg.parts[0].what, '', '모르는 명령은 아는 척하지 않는다');
  eq(seg.parts[1].what, '', '모르는 옵션도 마찬가지');
}

/* ── 위험 표시 ────────────────────────────────────────────────────── */
{
  const d = S.dangersOf(S.explain('rm -rf /tmp/x'));
  check(d.length > 0, '되돌릴 수 없는 것에는 표시가 붙는다');
  check(/되돌릴 수 없/.test(d.join(' ')), '왜 위험한지 말해 준다');
}
check(S.dangersOf(S.explain('ls -la')).length === 0, '멀쩡한 명령에 겁주지 않는다');
check(S.dangersOf(S.explain('git push --force')).length > 0, '억지로 밀기는 위험하다');
check(S.dangersOf(S.explain('git push --force-with-lease')).length === 0, '안전한 쪽(--force-with-lease)은 겁주지 않는다');
check(S.dangersOf(S.explain('git reset --hard')).length > 0, '고치던 것을 버리는 것은 위험하다');
check(S.dangersOf(S.explain('chmod 777 file')).length > 0, '아무나 쓰게 여는 것은 위험하다');
check(S.dangersOf(S.explain('dd if=a of=/dev/sda')).length > 0, '디스크 통째 덮어쓰기는 위험하다');
{
  /* 「받아서 바로 실행」은 도막 **둘이 만나야** 생기는 위험이라 조각 하나만 봐선 안 보인다. */
  const d = S.dangersOf(S.explain('curl -s https://x.sh | sh'));
  check(/읽어 보지도 않고/.test(d.join(' ')), '받아서 바로 실행하는 것을 잡아낸다');
  check(S.dangersOf(S.explain('curl -s https://x.sh -o x.sh')).length === 0, '받기만 하는 것은 겁주지 않는다');
}

/* ── 사전 ─────────────────────────────────────────────────────────── */
check(Object.keys(S.COMMANDS).length >= 40, `사전에 명령이 마흔 이상 (지금 ${Object.keys(S.COMMANDS).length})`);
check(
  Object.values(S.COMMANDS).every((d) => d.what && d.what.length > 3),
  '모든 명령에 한 줄 설명이 있다'
);
check(S.DANGERS.every((d) => d.match instanceof RegExp && d.why.length > 10), '위험 표는 모양이 같다');

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-shell] 전부 통과');
