/**
 * audit-memo-derived.mjs — **memo 를 읽어 굽는 산출물**이 정본과 맞나 본다 (위키 · 세계관 · WM 일감).
 *
 * ★ 왜 (2026-08-17 실측): 위키 장은 `memo/` 를 읽어 굽는데, **CI 에는 memo 가 없다** —
 *   그래서 배포는 굽지 않고 커밋된 산출물을 그대로 쓴다. 즉 이 산출물은 **사람이 자기 자리에서
 *   구워 담아야만** 최신이 된다. 그런데 굽는 명령이 몇 판이고 죽어 있었고(기획서를 위키 항목으로
 *   읽었다), 아무도 몰랐다 — 오늘 고치자마자 `meta-loop` 한 줄이 그제야 갱신됐다
 *   (「보드」 → 「세션 간 채널」). 사이트에 몇 주째 옛말이 걸려 있었다는 뜻이다.
 *   사람 기억에 맡기지 않는다. 굽고 나서 달라지면 빨강.
 *
 * 사용: node scripts/audit-memo-derived.mjs
 * 나가는 값: 0 같음 · 1 다름(굽고 담아라) · 2 못 봤다(memo 정본이 없는 자리 — 통과 아님)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const memo = process.env.KARMODDRINE_MEMO_PATH || path.resolve(root, '../../../memo');
if (!fs.existsSync(memo)) {
  console.log(`[memo 산출물] 못 봤다 — memo 정본이 이 자리에 없다: ${memo} (통과로 안 센다)`);
  process.exit(2);
}

/* ★ **HEAD 와 견주지 마라 — 「다시 구워도 그대로인가」를 물어라** (2026-08-17, 이 검사를 담다가 데임).
   처음엔 `git status` 로 봤는데, 그러면 **갓 구운 것을 담는 커밋 자체가 막힌다**(담기 전에는
   당연히 HEAD 와 다르다). 물어야 할 것은 「지금 이 자리의 산출물이 memo 로 다시 구운 것과 같은가」다.
   그래서 굽기 전후의 내용을 견준다 — 담겼든 안 담겼든 정본과 맞으면 초록. */

/* memo 를 읽는 생성기 전부 — 하나라도 빠지면 그 산출물만 조용히 낡는다.
   실측 2026-08-17: 위키를 고치고 나서 보니 세계관·WM 일감도 몇 백 줄씩 어긋나 있었다. */
const 생성기 = [
  ['위키', 'scripts/sync-wiki.mjs', 'world/wiki'],
  ['세계관', 'scripts/build-worldbook.mjs', 'data/worldbook.json'],
  ['WM 일감', 'scripts/build-wm-tasks.mjs', 'data/wm-tasks.json'],
];
const 지문 = (rel) => {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return '(없음)';
  if (fs.statSync(abs).isDirectory()) {
    const 목록 = [];
    const 훑기 = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) 훑기(f);
        else 목록.push(`${path.relative(abs, f)}:${createHash('sha1').update(fs.readFileSync(f)).digest('hex')}`);
      }
    };
    훑기(abs);
    return 목록.sort().join('|');
  }
  return createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
};

const 이전 = 생성기.map(([, , out]) => 지문(out));

for (const [이름, 파일] of 생성기) {
  const 구움 = spawnSync(process.execPath, [파일], { cwd: root, encoding: 'utf8' });
  if (구움.status !== 0) {
    console.error(`[memo 산출물] FAIL — ${이름} 굽다가 죽었다 (${파일}):`);
    console.error((구움.stderr || 구움.stdout || '').trim().split(String.fromCharCode(10)).slice(-4).join(String.fromCharCode(10)));
    process.exit(1);
  }
}

const 달라진것 = 생성기
  .map(([이름, , out], i) => (지문(out) === 이전[i] ? null : `${이름} (${out})`))
  .filter(Boolean);

if (달라진것.length) {
  console.error(`[memo 산출물] FAIL — 다시 구우니 달라졌다 ${달라진것.length}건 (= 이 자리의 산출물이 memo 정본보다 낡았다):`);
  for (const one of 달라진것) console.error(`  - ${one}`);
  console.error('  방금 구워 뒀다 — 그대로 담아라(CI 에는 memo 가 없어 배포는 굽지 못한다).');
  process.exit(1);
}
console.log(`[memo 산출물] ${생성기.length}가지 전부 정본과 같다 — ${생성기.map((g) => g[0]).join(' · ')}`);
