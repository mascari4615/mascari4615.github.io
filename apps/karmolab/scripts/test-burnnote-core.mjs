/**
 * 사라지는 쪽지 알맹이 — 잠그고 푸는 일 (TASK-KL-251).
 *
 * 이 도구의 값어치는 「우리도 못 본다」 하나에 걸려 있다. 그러니 여기서 지키는 것은
 * ① 잠근 덩어리에 원문이 비치지 않는가 ② 열쇠가 매번 다른가 ③ 틀린 열쇠가 **조용히**
 * 실패하지 않는가(빈 글을 돌려주면 「빈 쪽지였나」로 읽힌다) ④ 링크의 열쇠가 `#` 뒤에 있는가.
 *
 * 사용: node scripts/test-burnnote-core.mjs   (npm run test:burnnote)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
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

/* 브라우저가 주는 것들은 요즘 Node 에도 있다 — 없을 때만 채워 넣는다(있는 걸 덮으면 던진다). */
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
if (!globalThis.btoa) globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');

async function load() {
  const entry = path.join(os.tmpdir(), `bn-core-${Date.now()}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/lib/burn-note.ts'))};\n`);
  const out = path.join(os.tmpdir(), `bn-core-${Date.now()}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const B = await load();

/* ── 잠그고 풀기 ─────────────────────────────────────────────────── */
{
  const text = '비밀번호는 hunter2 입니다';
  const { body, key } = await B.seal(text);
  eq(await B.open(body, key), text, '잠근 것을 열쇠로 풀면 원문');
  check(!body.includes('hunter2'), '잠근 덩어리에 원문이 비치면 안 된다');
  check(body.length > 20, '덩어리에는 한 번 쓰는 값이 앞에 붙는다');
}

{
  /* 같은 글을 두 번 잠가도 결과가 같으면, 서버가 「둘이 같은 말이다」를 알게 된다. */
  const a = await B.seal('같은 글');
  const b = await B.seal('같은 글');
  check(a.body !== b.body, '같은 글도 매번 다르게 잠긴다');
  check(a.key !== b.key, '열쇠도 매번 새로');
}

{
  const { body, key } = await B.seal('x');
  const other = (await B.seal('y')).key;
  let threw = false;
  try {
    await B.open(body, other);
  } catch {
    threw = true;
  }
  check(threw, '틀린 열쇠는 **던져야** 한다 — 조용히 빈 글을 주면 「빈 쪽지였나」로 읽힌다');
}

{
  const { key } = await B.seal('x');
  let threw = false;
  try {
    await B.open('짧다', key);
  } catch {
    threw = true;
  }
  check(threw, '망가진 덩어리도 던진다');
}

{
  /* 한 글자만 바꿔도 열리면 안 된다 — 그건 자물쇠가 아니라 장식이다. */
  const { body, key } = await B.seal('건드리지 마시오');
  const tampered = body.slice(0, -1) + (body.slice(-1) === 'A' ? 'B' : 'A');
  let threw = false;
  try {
    await B.open(tampered, key);
  } catch {
    threw = true;
  }
  check(threw, '덩어리를 한 글자라도 고치면 안 열린다');
}

{
  const long = '가'.repeat(5000);
  const { body, key } = await B.seal(long);
  eq((await B.open(body, key)).length, 5000, '긴 글도 그대로 돌아온다');
}

{
  const emoji = '🔥 이모지와 한글과 English';
  const { body, key } = await B.seal(emoji);
  eq(await B.open(body, key), emoji, '이모지·한글이 깨지지 않는다');
}

/* ── 파일 봉투 (TASK-KL-252) ─────────────────────────────────────── */
{
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
  const packed = B.packFile('계약서 최종.pdf', 'application/pdf', bytes);
  const { body, key } = await B.seal(packed);
  check(!body.includes('계약서'), '파일 이름도 잠긴 안쪽에 있다 — 이름 자체가 정보다');
  const out = B.unpackFile(await B.open(body, key));
  eq(out?.name, '계약서 최종.pdf', '이름이 돌아온다');
  eq(out?.type, 'application/pdf', '종류가 돌아온다');
  eq(Array.from(out.bytes).join(','), '0,1,2,250,251,255', '바이트가 한 개도 안 틀리고 돌아온다');
}

{
  check(B.unpackFile('그냥 글') === null, '그냥 글은 파일 봉투가 아니다');
  check(B.unpackFile('') === null, '빈 것도 아니다');
  const half = B.packFile('a', 'b', new Uint8Array([1])).slice(0, 20);
  check(B.unpackFile(half) === null, '잘린 봉투는 null — 반쯤 읽은 파일을 내주면 안 된다');
}

{
  /* 큰 파일도 바이트가 그대로여야 한다 — base64 자리 맞춤에서 끝이 잘리는 실수가 흔하다. */
  const big = new Uint8Array(100000);
  for (let i = 0; i < big.length; i += 1) big[i] = i % 256;
  const out = B.unpackFile(B.packFile('big.bin', '', big));
  eq(out.bytes.length, 100000, '10만 바이트가 그대로');
  eq(out.bytes[99999], 99999 % 256, '마지막 바이트까지 그대로');
}

/* ── 링크 ────────────────────────────────────────────────────────── */
{
  const link = B.linkFor('https://x.example', 'ID123', 'KEY456');
  check(link.includes('#'), '링크에는 # 이 있다');
  const after = link.slice(link.indexOf('#'));
  check(after.includes('KEY456'), '**열쇠는 # 뒤에** 있다 — 이 자리가 서버로 안 가는 유일한 자리다');
  check(link.slice(0, link.indexOf('#')).indexOf('KEY456') === -1, '열쇠가 # 앞에 새어 나오면 안 된다');
  check(link.slice(0, link.indexOf('#')).indexOf('?') === -1, '물음표 뒤에 두면 서버 기록에 남는다 — 안 쓴다');
}

{
  const got = B.parseLink('#n=ID123.KEY456');
  eq(got?.id, 'ID123', '링크에서 이름을 되짚는다');
  eq(got?.key, 'KEY456', '링크에서 열쇠를 되짚는다');
}

{
  const { body, key } = await B.seal('왕복');
  const link = B.linkFor('https://x.example', 'the-id', key);
  const parsed = B.parseLink(link.slice(link.indexOf('#')));
  eq(await B.open(body, parsed.key), '왕복', '링크를 거쳐 온 열쇠로도 열린다');
}

check(B.parseLink('#something=else') === null, '모양이 안 맞으면 null');
check(B.parseLink('') === null, '빈 것도 null');
check(B.parseLink('#n=onlyid') === null, '열쇠가 없으면 null');
{
  const other = B.parseLink('#tab=x&n=A.B');
  eq(other?.id, 'A', '다른 값들과 섞여 있어도 찾아낸다');
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-burnnote] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-burnnote] 전부 통과');
