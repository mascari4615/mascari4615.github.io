/**
 * 잠깐 쓰는 메일 — 화면 없이 잴 수 있는 것 (TASK-KL-339).
 *
 * 잠그는 것 셋:
 * ① **확인 코드를 잘못 짚지 않나** — 이 도구를 쓰는 이유의 열에 아홉이 그거다.
 *    아무거나 골라 주면 사람이 **틀린 코드를 붙여 넣는다.** 못 찾으면 못 찾았다고 해야 한다.
 * ② **지난 주소를 되살리지 않나** — 되살리면 「편지가 안 온다」로 보인다(고장처럼).
 * ③ **남은 시간이 0에서 「끝」이라고 말하나** — 「곧 사라집니다」가 몇 분째 떠 있으면
 *    그건 시계가 아니라 장식이다.
 *
 * 사용: node scripts/test-tempmail.mjs   (npm run test:tempmail)
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
const eq = (got, want, why) => check(got === want, `${why} — 기대 ${want}, 나온 것 ${got}`);

/* 브라우저 자리 흉내 — 이 이음새는 sessionStorage 에 열쇠를 둔다. */
const bag = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (bag.has(k) ? bag.get(k) : null),
  setItem: (k, v) => bag.set(k, String(v)),
  removeItem: (k) => bag.delete(k)
};

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tempmail-'));
const outfile = path.join(outDir, 'tempmail.mjs');
await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/tempmail.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'silent'
});
const M = await import(pathToFileURL(outfile).href);

// ── ① 확인 코드 ──────────────────────────────────────────────────────────────

eq(M.codeIn('인증번호는 123456 입니다'), '123456', '여섯 자리 숫자를 집는다');
eq(M.codeIn('Your code: 4821'), '4821', '네 자리도 집는다');
eq(M.codeIn('코드 A1B2C3 을 입력하세요'), 'A1B2C3', '대문자·숫자 섞인 덩어리도 집는다');

/* ★ 못 찾으면 **못 찾았다고 해야 한다.** 아무거나 골라 주면 틀린 코드를 붙여 넣게 된다. */
eq(M.codeIn('안녕하세요. 반갑습니다.'), null, '코드가 없으면 null');
eq(M.codeIn(''), null, '빈 편지면 null');
eq(M.codeIn('가입을 환영합니다'), null, '숫자가 없으면 null');

/* 숫자만 있는 대문자 덩어리는 코드가 아니다 — 이름·약어일 뿐이다. */
eq(M.codeIn('WELCOME 님 반갑습니다'), null, '숫자 없는 대문자 덩어리는 코드가 아니다');

/* 여럿이면 가장 긴 것 — 짧은 쪽은 연도·시각일 때가 많다. */
eq(M.codeIn('2026년 코드는 883104 입니다'), '883104', '연도보다 긴 쪽을 고른다');

// ── ② 지난 주소를 되살리지 않는다 ────────────────────────────────────────────

const now = 1_000_000;
const live = { address: 'abc@mail.x', name: 'abc', token: 'k', expiresAt: now + 60_000 };
M.keep(live);
eq(M.recall(now)?.name, 'abc', '살아 있는 주소는 이어서 쓴다');

/* ★ 지난 주소를 되살리면 사람은 「편지가 안 온다」로 본다 — 고장처럼 보이는 정상이다. */
eq(M.recall(now + 120_000), null, '수명이 지난 주소는 안 되살린다');

M.keep({ address: 'x', name: 'x', token: 'k' }); // expiresAt 없음
eq(M.recall(now), null, '망가진 기록은 안 되살린다');

bag.clear();
eq(M.recall(now), null, '없으면 null');

M.keep(live);
M.forget();
eq(M.recall(now), null, '버리면 잊는다');

/* 열쇠를 어디에 두는가 = 곧 사생활이다. localStorage 면 몇 달 뒤에도 그 기계에 남는다. */
const source = fs.readFileSync(path.join(root, 'src/lib/tempmail.ts'), 'utf8');
check(source.includes('sessionStorage'), '★ 열쇠는 세션에 둔다 (탭을 닫으면 같이 사라진다)');
/* **쓰는 자리**를 본다(`localStorage.`) — 낱말만 보면 「왜 안 쓰는가」를 적은 주석이 걸린다.
   실제로 걸렸다: 설명 문장이 검사를 빨갛게 만드는 건 오늘만 두 번째다. */
check(!/localStorage\s*\./.test(source), '★ localStorage 에 안 둔다 — 임시 주소의 열쇠가 몇 달 남는다');
check(/localStorage/.test(source), '왜 안 쓰는지는 적어 둔다 (다음 사람이 되돌리지 않게)');
check(!/token=/.test(source.replace(/X-KL-Mail-Token/g, '')), '★ 열쇠를 주소줄에 안 싣는다 (기록·로그에 남는다)');

// ── ③ 남은 시간 ─────────────────────────────────────────────────────────────

check(/9분|10분/.test(M.leftSay(now + 9.5 * 60_000, now)), `분 단위로 말한다 (나온 것 ${M.leftSay(now + 9.5 * 60_000, now)})`);
check(/30초/.test(M.leftSay(now + 30_000, now)), `1분 미만은 초로 말한다 (나온 것 ${M.leftSay(now + 30_000, now)})`);
check(/사라졌/.test(M.leftSay(now - 1, now)), `★ 지났으면 「끝」이라고 말한다 (나온 것 ${M.leftSay(now - 1, now)})`);
check(/사라졌/.test(M.leftSay(now, now)), '딱 0 도 끝이다');

// ── ④ 미리보기 ──────────────────────────────────────────────────────────────

eq(M.preview('여러\n줄\n편지'), '여러 줄 편지', '줄바꿈을 눌러 한 줄로');
check(M.preview('가'.repeat(300)).length <= 91, '길면 자른다');
check(M.preview('가'.repeat(300)).endsWith('…'), '자른 표를 남긴다');
eq(M.preview(''), '', '빈 편지도 던지지 않는다');

// ── ⑤ 고를 수 있는 수명 ─────────────────────────────────────────────────────

check(M.TTL_CHOICES.length >= 2, '수명을 고를 수 있다');
check(Math.max(...M.TTL_CHOICES) <= 60, '뒷단 상한(60분)을 안 넘는 것만 보여 준다');

// ── 마무리 ───────────────────────────────────────────────────────────────────
fs.rmSync(outDir, { recursive: true, force: true });
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[test-tempmail] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[test-tempmail] 잠깐 쓰는 메일 — 검사 전부 통과');
