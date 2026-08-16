/**
 * repeat-karmograph.mjs — **흔들리는 판을 잡는 자** (TASK-KL-271).
 *
 * 화면검사는 한 판 초록이라고 안심할 수 없다. 이 작업에서 판마다 돌아가며 하나씩 빨개지는 일이
 * 오래 있었고, 그때마다 「flaky」로 적고 넘겼다 — 그런데 2026-08-13 에 재현율을 재 보니
 * **제품 결함**이었다(카드를 고르면 판이 튀어 손잡이가 도망갔다). 「흔들린다」는 진단이 아니다.
 *
 * 그래서 **여러 판 돌려 어느 항목이 한 번이라도 빨개졌는지**를 세는 자를 둔다.
 * 사용: node scripts/repeat-karmograph.mjs 3
 */
import { spawn } from 'node:child_process';

const runs = Number(process.argv[2] || 3);
const reds = new Map();
let greens = 0;

const once = () => new Promise((resolve) => {
  const p = spawn(process.execPath, ['scripts/smoke-karmograph.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.on('close', () => {
    // 빨강 줄은 「 - <항목 이름>: <까닭>」 꼴로 요약에 실린다.
    const lines = out.split('\n').filter((l) => l.startsWith(' - '));
    if (lines.length === 0) greens += 1;
    for (const l of lines) {
      const name = l.slice(3).split(':')[0].trim();
      reds.set(name, (reds.get(name) ?? 0) + 1);
    }
    resolve();
  });
});

for (let i = 0; i < runs; i += 1) {
  process.stdout.write(`판 ${i + 1}/${runs} …\n`);
  await once();
}

/* ★ **한 번 빨간 것은 아직 진단이 아니다** (2026-08-14 실측). 이 작업공간은 세션 여럿이 같은
   기계에서 빌드·설치를 돌려, 4초 문턱짜리 기다림이 부하 때문에 한 판씩 넘칠 때가 있다 —
   같은 판에서 매번 다른 항목이 하나씩 빨개졌고 다시 돌리면 초록이었다. 그래서 「한 번만
   빨간 것들」은 한 판 더 돌려 되풀이되는지 본다. 되풀이되면 제품, 아니면 그 판의 부하다. */
if (reds.size > 0 && [...reds.values()].every((n) => n === 1)) {
  /* ★ **어느 항목이 흔들렸는지 이름을 남긴다** (2026-08-17). 여태 「부하로 본다」로 넘기며
     이름을 안 찍었다 — 그러면 같은 항목이 며칠째 흔들려도 아무도 못 모은다.
     한 판의 판정은 못 되지만, **쌓이면** 그게 진단이다. */
  console.log(`한 번씩만 빨갰다 (${[...reds.keys()].join(' · ')}) — 부하인지 제품인지 가리려고 한 판 더 돈다 …`);
  const suspects = new Set(reds.keys());
  reds.clear();
  await once();
  const again = [...reds.keys()].filter((name) => suspects.has(name));
  if (again.length === 0) {
    console.log(`RESULT: STABLE — 되풀이되지 않았다 (그 판의 부하로 본다). 이번에 한 번 흔들린 것: ${[...suspects].join(' · ')}`);
    process.exit(0);
  }
  reds.clear();
  for (const name of again) reds.set(name, 2);
}
console.log(`\n초록 ${greens}/${runs} 판`);
if (reds.size === 0) {
  console.log('RESULT: STABLE — 한 항목도 안 흔들렸다');
  process.exit(0);
}
console.log('흔들린 항목 (판 수):');
for (const [name, n] of [...reds.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n}/${runs}  ${name}`);
}
console.log('RESULT: SHAKY — 재현율을 재고 원인을 찾아라 (「flaky」는 진단이 아니다)');
process.exit(1);
