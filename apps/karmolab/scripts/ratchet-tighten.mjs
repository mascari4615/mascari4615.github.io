#!/usr/bin/env node
/**
 * 톱니를 **자동으로 조인다** (TASK-KL-312)
 *
 * 왜 있나: 이 저장소의 기준선 일곱은 전부 「빚 카운터」다 — 번들 바이트·별칭 없는 도구 수·
 * 이름 없는 칸 수·느슨한 검사·묶이지 않은 검사·안 불리는 말 묶음. 전부 **줄기만 해야** 한다.
 * 그런데 줄인 뒤 기준선을 다시 적는 일(`-- --update`)은 사람 몫이었다. 사람이 그걸 잊으면
 * 기준선은 옛 빚을 그대로 들고 있고, **다시 늘어나도 그 빚만큼은 안 걸린다** — 톱니가 헐거워진다.
 *
 * 조이는 일은 기계 일이다. 여기서는 각 검사를 `--update` 로 돌린 뒤 **좋아진 경우에만** 남긴다.
 * 나빠지는 방향이면 되돌린다 — `--update` 는 「지금 값을 적는다」라서, 회귀 상태에서 부르면
 * 기준선이 **느슨해진다**(그러면 자동화가 톱니를 부수는 셈이다).
 *
 * 판정: 기준선 안의 모든 숫자와 목록 길이가 **하나도 안 늘었으면** 조인 것이다.
 *
 * 사용:
 *   node scripts/ratchet-tighten.mjs           # 조여 보고 결과만 알림 (파일은 남는다)
 *   node scripts/ratchet-tighten.mjs --dry     # 아무것도 안 남긴다 (원래대로 되돌린다)
 * exit: 0 = 조였거나 그대로 · 1 = 검사가 죽었다
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DRY = process.argv.includes('--dry');

/** 기준선 = 전부 빚 카운터(작을수록 좋다). 새 기준선이 생기면 여기 한 줄. */
const ratchet = [
  { npm: 'audit:bundles', file: 'data/bundle-baseline.json', what: '번들 gzip 바이트' },
  { npm: 'audit:coverage', file: 'data/coverage-baseline.json', what: '첫 화면에서 안 쓰인 바이트' },
  { npm: 'audit:labels', file: 'data/a11y-baseline.json', what: '이름 없는 입력칸' },
  { npm: 'audit:aliases', file: 'data/alias-baseline.json', what: '별칭 없는 도구' },
  { npm: 'audit:loose', file: 'data/loose-checks.json', what: '느슨한 검사' },
  { npm: 'audit:orphans', file: 'data/orphan-tests.json', what: '아무 묶음에도 없는 검사' },
  { npm: 'audit:i18n-load', file: 'data/i18n-namespace-load.json', what: '안 불리는 말 묶음' }
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const readRaw = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf8') : null);

/** 숫자·목록 길이만 모은다 — 날짜(`at`·`갱신`)는 값이 아니라 도장이라 뺀다. */
function values(node, prefix = '', out = {}) {
  if (Array.isArray(node)) {
    out[prefix + '[]'] = node.length;
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'at' || k === '갱신' || k === 'note' || k === '설명') continue;
      values(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  if (typeof node === 'number') out[prefix] = node;
  return out;
}

const tighten = [];
const loose = [];
const dead = [];

for (const t of ratchet) {
  const before = readRaw(t.file);
  const r = spawnSync(npm, ['run', '--silent', t.npm, '--', '--update'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  const after = readRaw(t.file);

  if (after === null) {
    dead.push(`${t.npm} — 기준선 파일이 없다 (${t.file}) · ${(r.stderr || '').trim().split('\n').pop() || ''}`);
    continue;
  }
  if (before === after) continue;

  let regressed = [];
  try {
    const a = values(JSON.parse(before ?? '{}'));
    const b = values(JSON.parse(after));
    regressed = Object.keys(b).filter((k) => typeof a[k] === 'number' && b[k] > a[k]);
  } catch {
    regressed = ['(기준선을 못 읽었다 — 안전하게 되돌린다)'];
  }

  if (regressed.length > 0 || DRY) {
    if (before === null) fs.rmSync(path.join(root, t.file), { force: true });
    else fs.writeFileSync(path.join(root, t.file), before, 'utf8');
    if (regressed.length > 0) loose.push({ ...t, regressed });
    continue;
  }
  tighten.push(t);
}

if (dead.length) {
  console.error('[ratchet] 조일 수 없었다');
  dead.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}

for (const t of tighten) console.log(`[ratchet] 조였다 — ${t.what} (${t.file})`);
for (const t of loose) {
  console.log(`[ratchet] 그대로 뒀다 — ${t.what} 이(가) 늘었다: ${t.나빠진곳.slice(0, 4).join(', ')}`);
  console.log(`          늘어난 것은 자동으로 눈감아 주지 않는다 — 그건 검사(${t.npm})가 빨갛게 말한다.`);
}
/* 아무 일 없어도 한 줄 — 「조용함」이 정상인지 안 돈 것인지 구분되게. */
console.log(`[ratchet] 톱니 ${ratchet.length}종 · 조임 ${tighten.length} · 늘어남 ${loose.length}${DRY ? ' (--dry, 남긴 것 없음)' : ''}`);
