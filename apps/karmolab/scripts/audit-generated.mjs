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
 *
 * [빨강-확인] 2026-08-14 — 표에 없는 굽는 명령(`gen:없는이름`)을 넣어 보고 빨개지는 것을 봤다.
 *   같은 표를 새벽 워크플로가 읽으므로, 새 `nightly: true` 한 줄이 워크플로 단계와 커밋 목록에
 *   자동으로 뜨는 것도 확인했다(가짜 항목 한 줄 → 양쪽 출력에 나타남).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
/* 표는 `lib/generated-artifacts.mjs` 한 곳 — 새벽 워크플로도 같은 표를 읽는다.
   여기 또 적으면 「밤에 굽는다」는 약속만 있고 굽는 놈은 없는 자리가 생긴다. */
import { generated } from './lib/generated-artifacts.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const UPDATE = process.argv.includes('--update');


const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const read = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
};

/* ★ **표에 적힌 굽는 명령이 진짜 있나** (2026-08-14). 표는 이제 새벽 워크플로도 읽는다 —
   여기 없는 이름을 적어 두면 그 파일은 「밤에 굽는다」는 약속만 남고 새벽 3시에 조용히 죽는다.
   (사람은 새벽 로그를 안 본다. 그러니 낮에, 미는 자리에서 잡는다.) */
{
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const unknownNames = generated.map((x) => x.npm).filter((n) => !pkg.scripts?.[n]);
  if (unknownNames.length) {
    console.error('[audit-generated] 표에 적힌 굽는 명령이 package.json 에 없다: ' + unknownNames.join(', '));
    console.error('  → scripts/lib/generated-artifacts.mjs 와 package.json 중 한쪽이 낡았다.');
    process.exit(1);
  }
}

const stale = [];
const dead = [];

for (const item of generated) {
  /* **잴 수 없는 것은 안 잰다** — 다시 구우면 늘 다른 것(시각·최근 N일)을 게이트에 걸면
     영원히 빨갛다. 그건 밤이 굽는다. 그래도 한 줄 남긴다 — 「안 본다」가 보여야 한다. */
  if (item.무거움) {
    /* 굽는 값이 큰 것은 감사기가 안 굽는다 — 대신 누가 보는지 적어 둔다(안 보는 것과 구분). */
    console.log(`[audit-generated] ${item.outputs.join(', ')} — 여기서 안 굽는다 (${item.무거움})`);
    continue;
  }
  if (item.못잼) {
    console.log(`[audit-generated] ${item.outputs.join(', ')} — 못 잰다(${item.못잼}) · 새벽 refresh-generated 가 굽는다`);
    continue;
  }
  /* 되돌릴 수 있게 먼저 담아 둔다 — git 에 기대지 않는다(이 트리는 여러 세션이 함께 쓴다). */
  const before = new Map(item.outputs.map((rel) => [rel, read(rel)]));

  const r = spawnSync(npm, ['run', '--silent', item.npm], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  if (r.status === 2) {
    /* 2 = 「못 돌렸다」 — 이 저장소 규약. 죽은 것이 아니다(잴 것이 아직 없다는 뜻). */
    console.log(`[audit-generated] ${item.npm} — 못 돌렸다고 한다 (빨강 아님)`);
    continue;
  }
  if (r.status !== 0) {
    dead.push(`${item.npm} — 생성기가 죽었다 (${(r.stderr || '').trim().split('\n').pop() || 'exit ' + r.status})`);
    continue;
  }

  const changed = item.outputs.filter((rel) => {
    const a = before.get(rel);
    const b = read(rel);
    if (a === null || b === null) return a !== b;
    return a.equals(b) === false;
  });

  if (changed.length > 0) stale.push({ npm: item.npm, files: changed, why: item.why, nightly: item.nightly });

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

if (dead.length) {
  console.error('[audit-generated] 생성기가 죽었다 — 낡았는지 볼 수조차 없다');
  dead.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}

/* 매일 스스로 굽는 것은 「낡았다」가 아니라 「곧 구워진다」다 — 갈라 낸다. */
const nightlyBuilds = stale.filter((x) => x.nightly);
const reallyStale = stale.filter((x) => !x.nightly);
if (nightlyBuilds.length) {
  console.log(`[audit-generated] 밤에 스스로 굽는 파생물 ${nightlyBuilds.length}종이 지금은 낡았다 (막지 않는다)`);
  for (const x of nightlyBuilds) console.log(`  · ${x.files.join(', ')} — ${x.why} · 새벽 refresh-generated 가 굽는다`);
}

if (reallyStale.length) {
  console.error(`[audit-generated] 커밋된 파생물 ${reallyStale.length}종이 지금 소스와 다르다`);
  for (const x of reallyStale) {
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
console.log(`[audit-generated] 파생물 ${generated.filter((x) => !x.못잼 && !x.무거움).length}종이 지금 소스와 같다${UPDATE ? ' (--update)' : ''}`);
