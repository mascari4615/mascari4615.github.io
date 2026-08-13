#!/usr/bin/env node
/**
 * 커밋된 파생물이 **지금 소스로 다시 구운 것과 같은가** (TASK-KL-312)
 *
 * 왜 있나: 파생물 중에는 「커밋본이 곧 서비스본」인 것이 있다 — 배포가 다시 굽지 않고,
 * 저장소에 들어 있는 파일 그대로 사람과 봇에게 나간다. 그런 파일은 소스가 바뀌어도
 * **아무 데서도 안 걸린 채** 낡는다.
 *
 * 실측(2026-08-13): `data/worldcup-tools.json` 은 도구 122개짜리였는데 도구는 138개였다 —
 * 8/08 에 구운 표가 8/13 의 도구 목록을 모르고 봇에 심기고 있었다(`yawnbot/karmolab-packs.ts`).
 *
 * 판정: 생성기를 그대로 돌려 산출물이 **바뀌면 빨강**(= 커밋본이 낡았다). 기본은 되돌려 놓는다 —
 * 검사가 남의 작업 트리를 건드리면 안 된다. `--update` 면 새로 구운 것을 남긴다.
 *
 * 여기서 **안 보는 것**:
 *   · 시간 의존 파생물(`data/devlog.json` = 최근 120일 커밋) — 다시 구우면 늘 달라서
 *     게이트로 쓰면 영원히 빨갛다. 그건 `refresh-generated.yml` 이 매일 굽는다.
 *   · 배포가 매번 다시 굽는 것(도구 페이지·놀이·커뮤니티·셸 페이지) — 커밋본이 낡아도
 *     사람에게 나가는 것은 새로 구운 쪽이다.
 *
 * 사용: node scripts/audit-generated.mjs [--update]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const UPDATE = process.argv.includes('--update');

/**
 * 「커밋본이 곧 서비스본」인 파생물만. 새로 생기면 여기 한 줄 —
 * 산출 경로를 적어 두면 되돌리기까지 이 검사가 알아서 한다.
 */
const 파생물 = [
  {
    npm: 'gen:worldcup-tools',
    outputs: ['data/worldcup-tools.json'],
    why: '봇이 뜰 때 씨앗 표로 심는다 — 낡으면 새 도구가 월드컵에 안 나온다'
  },
  {
    npm: 'gen:core-tools',
    outputs: ['data/core-tools.json', 'src/core/registry.generated.ts', 'src/core/registry-lazy.generated.ts'],
    why: '묶어 쓰기·MCP 가 부를 수 있는 도구 목록'
  }
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const read = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
};

const 낡음 = [];
const 죽음 = [];

for (const item of 파생물) {
  /* 되돌릴 수 있게 먼저 담아 둔다 — git 에 기대지 않는다(이 트리는 여러 세션이 함께 쓴다). */
  const before = new Map(item.outputs.map((rel) => [rel, read(rel)]));

  const r = spawnSync(npm, ['run', '--silent', item.npm], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  if (r.status !== 0) {
    죽음.push(`${item.npm} — 생성기가 죽었다 (${(r.stderr || '').trim().split('\n').pop() || 'exit ' + r.status})`);
    continue;
  }

  const 바뀐것 = item.outputs.filter((rel) => {
    const a = before.get(rel);
    const b = read(rel);
    if (a === null || b === null) return a !== b;
    return a.equals(b) === false;
  });

  if (바뀐것.length > 0) 낡음.push({ npm: item.npm, files: 바뀐것, why: item.why });

  /* 기본은 원상복구. `--update` 면 새로 구운 것을 남긴다(= 사람이 커밋한다). */
  if (!UPDATE) {
    for (const rel of item.outputs) {
      const a = before.get(rel);
      const p = path.join(root, rel);
      if (a === null) fs.rmSync(p, { force: true });
      else fs.writeFileSync(p, a);
    }
  }
}

if (죽음.length) {
  console.error('[audit-generated] 생성기가 죽었다 — 낡았는지 볼 수조차 없다');
  죽음.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}

if (낡음.length) {
  console.error(`[audit-generated] 커밋된 파생물 ${낡음.length}종이 지금 소스와 다르다`);
  for (const x of 낡음) {
    console.error(`  - ${x.files.join(', ')}  (${x.why})`);
    console.error(`    → npm run ${x.npm}   후 커밋`);
  }
  console.error('  ※ 한 번에: npm run audit:generated -- --update');
  process.exit(1);
}

/* 초록도 한 줄 남긴다 — 「아무 말 없음」이 정상인지 안 돈 것인지 구분되게. */
console.log(`[audit-generated] 파생물 ${파생물.length}종이 지금 소스와 같다${UPDATE ? ' (--update)' : ''}`);
