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
    why: '봇이 뜰 때 씨앗 표로 심는다 — 낡으면 새 도구가 월드컵에 안 나온다',
    /* ★ **막지 않는다** (2026-08-13). 이 표는 **도구가 하나 늘 때마다** 낡는다 — 이 저장소는
       세션 여럿이 하루에도 여러 개를 만든다. 막는 게이트로 두면 도구를 만든 사람이 아니라
       그 뒤에 미는 **모든 세션**이 빨강을 맞고, 굽자면 빌드까지 새로 해야 한다(깨끗한 사본에서).
       매일 새벽 `refresh-generated.yml` 이 스스로 굽는다 — 그 사이에는 말만 하고 지나간다. */
    nightly: true
  },
  {
    npm: 'gen:arcade-catalog',
    outputs: ['src/widgets/arcade/catalog-meta.generated.ts', 'src/widgets/arcade/chunks.generated.json'],
    why: '로비가 읽는 명패 + 조각 표 — 낡으면 새 게임이 오락실에 안 뜨거나 눌러도 안 열린다'
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

/* 매일 스스로 굽는 것은 「낡았다」가 아니라 「곧 구워진다」다 — 갈라 낸다. */
const 밤에굽는것 = 낡음.filter((x) => x.nightly);
const 진짜낡음 = 낡음.filter((x) => !x.nightly);
if (밤에굽는것.length) {
  console.log(`[audit-generated] 밤에 스스로 굽는 파생물 ${밤에굽는것.length}종이 지금은 낡았다 (막지 않는다)`);
  for (const x of 밤에굽는것) console.log(`  · ${x.files.join(', ')} — ${x.why} · 새벽 refresh-generated 가 굽는다`);
}

if (진짜낡음.length) {
  console.error(`[audit-generated] 커밋된 파생물 ${진짜낡음.length}종이 지금 소스와 다르다`);
  for (const x of 진짜낡음) {
    console.error(`  - ${x.files.join(', ')}  (${x.why})`);
    console.error(`    → npm run ${x.npm}   후 커밋`);
  }
  console.error('  ※ 한 번에: npm run audit:generated -- --update');
  /* ★ **굽는 자리를 고르라** (2026-08-13 실측). 이 작업 폴더는 세션 여럿이 함께 쓴다 —
     여기서 구우면 남의 **미커밋** 소스가 섞여 들어간다. 실제로 월드컵 표를 여기서 굽자
     멀쩡한 도구 일곱(JSON 포맷터·QR 생성 등)이 표에서 빠졌다. 커밋본이 곧 서비스본인
     파생물은 그렇게 담기면 사람이 쓰는 화면이 조용히 줄어든다. */
  console.error('  ※ 남이 함께 쓰는 폴더라면 **깨끗한 사본**에서 구워라 —');
  console.error('     git clone --depth 5 <repo> tmp && cd tmp/apps/karmolab && npm ci && npm run build:artifacts && npm run <생성기>');
  process.exit(1);
}

/* 초록도 한 줄 남긴다 — 「아무 말 없음」이 정상인지 안 돈 것인지 구분되게. */
console.log(`[audit-generated] 파생물 ${파생물.length}종이 지금 소스와 같다${UPDATE ? ' (--update)' : ''}`);
