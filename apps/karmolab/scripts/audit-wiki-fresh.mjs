/**
 * audit-wiki-fresh.mjs — 위키 산출물이 memo 정본과 맞나 본다.
 *
 * ★ 왜 (2026-08-17 실측): 위키 장은 `memo/` 를 읽어 굽는데, **CI 에는 memo 가 없다** —
 *   그래서 배포는 굽지 않고 커밋된 산출물을 그대로 쓴다. 즉 이 산출물은 **사람이 자기 자리에서
 *   구워 담아야만** 최신이 된다. 그런데 굽는 명령이 몇 판이고 죽어 있었고(기획서를 위키 항목으로
 *   읽었다), 아무도 몰랐다 — 오늘 고치자마자 `meta-loop` 한 줄이 그제야 갱신됐다
 *   (「보드」 → 「세션 간 채널」). 사이트에 몇 주째 옛말이 걸려 있었다는 뜻이다.
 *   사람 기억에 맡기지 않는다. 굽고 나서 달라지면 빨강.
 *
 * 사용: node scripts/audit-wiki-fresh.mjs
 * 나가는 값: 0 같음 · 1 다름(굽고 담아라) · 2 못 봤다(memo 정본이 없는 자리 — 통과 아님)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const memo = process.env.KARMO_MEMO_PATH || path.resolve(root, '../../../memo');
if (!fs.existsSync(memo)) {
  console.log(`[위키 신선도] 못 봤다 — memo 정본이 이 자리에 없다: ${memo} (통과로 안 센다)`);
  process.exit(2);
}

const 구움 = spawnSync(process.execPath, ['scripts/sync-wiki.mjs'], { cwd: root, encoding: 'utf8' });
if (구움.status !== 0) {
  console.error('[위키 신선도] FAIL — 굽다가 죽었다:');
  console.error((구움.stderr || 구움.stdout || '').trim().split(String.fromCharCode(10)).slice(-4).join(String.fromCharCode(10)));
  process.exit(1);
}

let 달라진것;
try {
  달라진것 = execFileSync('git', ['status', '--porcelain', '--', 'world/wiki'], { cwd: root, encoding: 'utf8' })
    .trim().split(String.fromCharCode(10)).filter(Boolean);
} catch (e) {
  console.log(`[위키 신선도] 못 봤다 — git 에 물어보지 못했다: ${e.message} (통과로 안 센다)`);
  process.exit(2);
}

if (달라진것.length) {
  console.error(`[위키 신선도] FAIL — 구운 결과가 담긴 것과 다르다 ${달라진것.length}건:`);
  for (const one of 달라진것.slice(0, 10)) console.error(`  ${one}`);
  console.error('  방금 구워 뒀다 — 그대로 담아라(CI 에는 memo 가 없어 배포는 굽지 못한다).');
  process.exit(1);
}
console.log('[위키 신선도] 구운 결과가 담긴 것과 같다');
