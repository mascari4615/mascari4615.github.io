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
