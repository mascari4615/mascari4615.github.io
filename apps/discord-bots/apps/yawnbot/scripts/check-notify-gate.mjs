/**
 * 알림은 **거르는 자리 하나**를 지난다 (TASK-KL-191 축7).
 *
 * 사람이 「이 갈래는 안 받겠다」고 껐으면 그 알림은 **쌓이지도 않아야** 한다. 쌓아 두고
 * 화면에서만 숨기면 「안 읽음 12」 같은 수가 계속 붙고, 그 수를 없애려고 사람은 결국 종을
 * 통째로 끈다 — 그러면 정말 필요한 알림도 같이 죽는다.
 *
 * 그래서 거르는 자리는 하나다(`notifyIfWanted`). 그런데 부르는 곳이 열 곳이 넘으면 한 곳은
 * 반드시 빠진다 — 실제로 두 곳이 빠져 있었다(채팅 답글 · 흐름 예약). 둘 다 「끈 사람에게도
 * 쌓이는」 경로였고, 타입도 시험도 초록이었다. 눈으로 세는 대신 여기서 센다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/** 이 파일들만 원장을 직접 불러도 된다 — 거르는 자리 자신과, 알림 원장 자체. */
const ALLOWED = new Set(['services/karmolab-notifications.ts']);
/** 문 그 자체 — 여기서만 원장을 직접 부른다. */
const GATE_FILE = 'services/karmolab-notify-gate.ts';
const GATE_BODY = /export function notifyIfWanted\(/;

const offenders = [];
let gateSeen = false;
let calls = 0;

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const rel = path.relative(SRC, full).replace(/\\/g, '/');
    const source = fs.readFileSync(full, 'utf-8');
    if (rel === GATE_FILE && GATE_BODY.test(source)) gateSeen = true;
    calls += (source.match(/notifyIfWanted\(/g) ?? []).length;
    if (ALLOWED.has(rel)) continue;
    source.split('\n').forEach((line, i) => {
      if (!/\bnotes\.notify\(|\bnotifications\.notify\(/.test(line)) return;
      // 거르는 자리 안의 한 줄(`notes.notify(input);`)만 봐준다.
      if (rel === GATE_FILE) return;
      offenders.push(`${rel}:${i + 1}`);
    });
  }
};

walk(SRC);

/* 0건 통과 금지 — 부르는 곳을 하나도 못 찾았다면 이름이 바뀐 것이지 안전해진 것이 아니다. */
if (!gateSeen) {
  console.error('❌ 알림 게이트: 거르는 자리(notifyIfWanted)를 못 찾았다 — 이름이 바뀌었으면 이 검사도 같이 고쳐라');
  process.exit(1);
}
if (calls < 5) {
  console.error(`❌ 알림 게이트: 거르는 자리를 지나는 곳이 ${calls}곳뿐이다 — 검사가 낡았다`);
  process.exit(1);
}

if (offenders.length) {
  console.error('❌ 거르는 자리를 건너뛰고 알림을 쌓는 곳:');
  for (const o of offenders) console.error(`   - ${o}`);
  console.error('   notifyIfWanted(...) 로 부르라 — 끈 갈래는 쌓이지도 않아야 한다.');
  process.exit(1);
}

console.log(`✅ 알림 게이트: ${calls}곳 전부 거르는 자리를 지난다`);
