/**
 * **받는다고 적어 놓고 안 받는 도구** 잡기 (TASK-KL-238 / 2 photopea)
 *
 * 「이어서」 줄은 도구 메타의 `accepts` 를 보고 갈 곳을 고른다. 그런데 실제로 받는 손은
 * 코드의 `Toolbox.onHandoff(...)` 다. 둘이 갈라지면 **오류 없이 빈 화면**이 뜬다 —
 * 사람은 넘겼다고 믿고, 도구는 아무것도 안 받은 채 처음 화면을 보여 준다.
 *
 * 실측(2026-08-14): 「먹」이 `accepts: ['image/*']` 라고 적어 두고 `onHandoff` 가 없었다.
 * 「이미지 편집 → 먹」으로 넘기면 그림이 사라진 것처럼 보였다. 눈으로는 못 잡는 종류다.
 *
 * 여기서 재는 것: **선언한 도구는 받는 손이 있어야 한다.** 반대(손은 있는데 선언이 없다)도 본다 —
 * 그건 받을 수 있는데 목록에 안 뜨는 경우라, 사람이 그 길을 영영 못 찾는다.
 *
 * 사용: node scripts/audit-handoff-accepts.mjs   (npm run audit:handoff)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const meta = fs.readFileSync(path.join(root, 'src/widgets-lazy-meta.ts'), 'utf8');

/** 메타에서 `id` 와 `accepts` 를 뽑는다. 코드를 돌리지 않는다(빌드 전에도 돌아야 한다). */
const declared = new Map();
for (const block of meta.split(/\n\s*\{\s*\n/)) {
  const id = /id:\s*'([^']+)'/.exec(block);
  if (!id) continue;
  const accepts = /accepts:\s*\[([^\]]*)\]/.exec(block);
  if (!accepts) continue;
  const kinds = [...accepts[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (kinds.length) declared.set(id[1], kinds);
}

/** 코드에서 `onHandoff('<id>'` 를 찾는다. */
const handlers = new Set();
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const body = fs.readFileSync(full, 'utf8');
    for (const m of body.matchAll(/onHandoff\??\.?\(\s*'([^']+)'/g)) handlers.add(m[1]);
  }
};
walk(path.join(root, 'src/widgets'));

/* 「받는 손이 여기 없어도 되는」 것들 — 껍데기가 대신 받아 넘긴다(재료 작업대). */
const SHELL_TAKES = new Set(
  [...meta.matchAll(/id:\s*'([^']+)'[\s\S]*?bundle:\s*'([^']+)'/g)].map((m) => m[1])
);

const missing = [];
for (const [id, kinds] of declared) {
  if (handlers.has(id)) continue;
  if (SHELL_TAKES.has(id)) continue; // 묶음 안 도구는 껍데기가 받아 준다
  missing.push(`${id} — accepts: ${kinds.join('·')} 라고 적었는데 onHandoff 가 없다 (넘기면 빈 화면)`);
}

const stray = [];
for (const id of handlers) {
  if (declared.has(id)) continue;
  stray.push(`${id} — onHandoff 는 있는데 메타에 accepts 가 없다 (받을 수 있는데 목록에 안 뜬다)`);
}

if (missing.length === 0 && stray.length === 0) {
  console.log(`[handoff-accepts] 선언 ${declared.size}개 · 받는 손 ${handlers.size}개 — 어긋남 없음`);
  process.exit(0);
}
console.error('[handoff-accepts] 선언과 실물이 어긋난다:');
for (const m of [...missing, ...stray]) console.error(`  - ${m}`);
console.error('  고치는 법: 도구 코드에 `Toolbox.onHandoff("<id>", (file) => …)` 를 걸거나, 메타의 accepts 를 지워라.');
process.exit(1);
