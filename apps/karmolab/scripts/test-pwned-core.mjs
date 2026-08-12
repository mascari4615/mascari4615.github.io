/**
 * 유출 확인 알맹이 — **비밀번호가 안 나가는가** (TASK-KL-255).
 *
 * 이 도구의 값어치는 「물어보되 알려 주지 않는다」 하나에 걸려 있다. 그래서 여기서 가장
 * 크게 지키는 것은 기능이 아니라 **약속**이다: 나가는 요청에 비밀번호도, 완전한 해시도
 * 실리면 안 된다. 나머지(대조·판정)는 그 약속이 지켜진 뒤의 이야기다.
 *
 * 사용: node scripts/test-pwned-core.mjs   (npm run test:pwned)
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
  const entry = path.join(os.tmpdir(), `pw-core-${Date.now()}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/lib/pwned.ts'))};\n`);
  const out = path.join(os.tmpdir(), `pw-core-${Date.now()}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const P = await load();

/* ── 해시 ────────────────────────────────────────────────────────── */
{
  /* `password` 의 SHA-1 은 널리 알려진 값이다 — 이게 틀리면 대조가 통째로 어긋난다. */
  const h = await P.sha1Hex('password');
  eq(h, '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8', 'password 의 SHA-1');
  eq(h.slice(0, 5), '5BAA6', '앞 다섯 글자가 접두사');
}
{
  const h = await P.sha1Hex('한글 비밀번호 🔐');
  eq(h.length, 40, '한글·이모지도 40자리 해시가 나온다');
  check(/^[0-9A-F]+$/.test(h), '대문자 16진수 — 유출 목록이 그 형식이다');
}
{
  const a = await P.sha1Hex('a');
  const b = await P.sha1Hex('b');
  check(a !== b, '다른 글자는 다른 해시');
}

/* ── 대조 ────────────────────────────────────────────────────────── */
const BODY = [
  '0018A45C4D1DEF81644B54AB7F969B88D65:100',
  '00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2',
  '011053FD0102E94D6AE2F8B83D76FAF94F6:3861493'
].join('\r\n');

eq(P.countIn(BODY, '00D4F6E8FA6EECAD2A3AA415EEC418D38EC'), 2, '있으면 그 횟수');
eq(P.countIn(BODY, '011053FD0102E94D6AE2F8B83D76FAF94F6'), 3861493, '큰 수도 그대로');
eq(P.countIn(BODY, '없는접미사'), 0, '없으면 0');
eq(P.countIn(BODY, '00d4f6e8fa6eecad2a3aa415eec418d38ec'), 2, '소문자로 물어도 찾는다');
eq(P.countIn('', 'X'), 0, '빈 응답도 0');
eq(P.countIn('망가진줄\n또다른줄', 'X'), 0, '콜론 없는 줄은 건너뛴다');

/* ── 약속: 비밀번호도 완전한 해시도 안 나간다 ────────────────────── */
{
  const seen = [];
  const fake = async (url) => {
    seen.push(url);
    return { ok: true, text: async () => BODY };
  };
  /* 주소에 도메인(`pwnedpasswords.com`)이 들어가므로 **도메인과 안 겹치는 말**로 재야 한다 —
     `password` 로 재면 도메인에 걸려 늘 빨강이다(거짓 양성). */
  const pw = '말달리자1234!';
  const full = await P.sha1Hex(pw);
  const r = await P.checkPassword(pw, fake);

  eq(seen.length, 1, '요청은 한 번');
  check(!seen[0].includes(pw), '**비밀번호가 주소에 실리면 안 된다**');
  check(!seen[0].includes(full), '**완전한 해시도 실리면 안 된다** — 그 순간 남이 내 것을 안다');
  check(seen[0].endsWith(full.slice(0, 5)), `앞 다섯 글자만 나간다 (지금 ${seen[0].slice(-12)})`);
  eq(r.sent, full.slice(0, 5), '보낸 것을 그대로 돌려준다 — 화면이 사람에게 보일 수 있게');
  eq(r.amongst, 3, '받은 해시 개수 — 「이 중 어느 것인지 모른다」의 증거');
  eq(r.count, 0, '이 가짜 응답에는 내 것이 없다');
}

{
  /* 진짜로 목록에 있는 경우 — 접미사를 응답에 심어 왕복시킨다. */
  const full = await P.sha1Hex('password');
  const body = `${full.slice(5)}:9659365\r\nAAAA:1`;
  const r = await P.checkPassword('password', async () => ({ ok: true, text: async () => body }));
  eq(r.count, 9659365, '목록에 있으면 횟수를 알려 준다');
}

{
  const r = await P.checkPassword('x', async () => ({ ok: false, text: async () => '' }));
  check(r === null, '서버가 거절하면 null — 「안전하다」로 읽히면 안 된다');
}
{
  const r = await P.checkPassword('x', async () => {
    throw new Error('끊김');
  });
  check(r === null, '끊겨도 null (예외를 밖으로 안 던진다)');
}
check((await P.checkPassword('', async () => ({ ok: true, text: async () => '' }))) === null, '빈 비밀번호는 묻지 않는다');

/* ── 판정 ────────────────────────────────────────────────────────── */
eq(P.verdict(0), 'clean', '0 = 목록에 없음');
eq(P.verdict(1), 'seen', '한 번이라도 나오면 이미 털린 것');
eq(P.verdict(99), 'seen', '백 미만');
eq(P.verdict(100), 'common', '백부터는 흔한 것');
eq(P.verdict(99999), 'common', '십만 미만');
eq(P.verdict(100000), 'everywhere', '십만 넘으면 아무 데나 있는 것');
eq(P.verdict(-5), 'clean', '이상한 값은 없음으로');
eq(P.PREFIX_LEN, 5, '접두사 길이 = 서버가 모르는 정도');

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-pwned] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-pwned] 전부 통과');
