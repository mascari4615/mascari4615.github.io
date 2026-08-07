/**
 * 이 컴퓨터 전체를 화면으로 쓴다 (TASK-KL-131 ③).
 *
 * 앞선 확인은 「한 프로세스가 얼마나 바빴나」까지였다. 그건 작업 관리자가 보여 주는 값이 아니다 —
 * 코어가 여럿인데 하나만 태우면 전체 사용률은 거의 안 움직인다. 그래서 여기서는
 * **코어 수만큼 나눠 태우고, 기계 전체 사용률을 되재서** 그림이 나오는지 본다.
 *
 * 재는 법: 운영체제가 알려 주는 코어별 누적 시간(일한 시간 / 논 시간)의 **차이**를 조각마다 본다.
 * 우리 프로세스만이 아니라 이 컴퓨터에서 도는 모든 것이 들어간다 — 그게 요점이다.
 *
 * 무엇을 그리나: 기본 클립(우리가 그린 도형)을 세로줄로 훑는다. 한 줄이 한 조각이다.
 *
 * 안전: 천장을 열어 두지 않는다. 남는 여유를 반드시 남겨서 다른 일이 멈추지 않게 한다.
 */
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bandFor, decode, LoadSurface, Player } from '../dist/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIP = path.resolve(HERE, '../../../apps/karmolab/data/badapple/demo.bab');

const SLICE_MS = 400;
const CEILING = 0.7; // 기계를 다 먹지 않는다 — 나머지는 다른 일 몫
const FLOOR = 0.05;
const COLUMNS = Number(process.argv[2] ?? 40);

const cores = os.cpus().length;

/**
 * 그리기 전에 **도화지가 비어 있는지** 먼저 본다.
 *
 * 이 기계가 이미 바쁘면 무엇을 시켜도 전체 사용률은 100% 근처에 붙어 있고, 그림은 아예
 * 안 나타난다. 그때 「실패」라고 말하면 거짓말이다 — 코드가 틀린 게 아니라 **잴 수가 없는 것**이다.
 * (실제로 여기서 한 번 헤맸다: 다른 작업들이 돌던 중이라 바탕이 이미 70~80% 였다.)
 */
async function measureBaseline(samples = 5, ms = 400) {
	const readings = [];
	for (let i = 0; i < samples; i++) {
		const before = cpuTotals();
		await new Promise((resolve) => setTimeout(resolve, ms));
		const after = cpuTotals();
		const busy = after.busy - before.busy;
		const idle = after.idle - before.idle;
		readings.push(busy + idle > 0 ? busy / (busy + idle) : 0);
	}
	return readings.reduce((sum, value) => sum + value, 0) / readings.length;
}

/** 코어 하나를 맡아 시킨 비율만큼 바쁘게 도는 일꾼. */
const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
parentPort.on('message', (msg) => {
  if (msg === 'bye') return process.exit(0);
  const { fraction, sliceMs } = msg;
  const start = Date.now();
  const busyUntil = start + sliceMs * fraction;
  while (Date.now() < busyUntil) { /* 바쁜 것이 목적이다 */ }
  parentPort.postMessage('done');
});
`;

/** 코어별 누적 시간을 합쳐 「일한 시간 / 전체 시간」을 낸다. */
function cpuTotals() {
	let busy = 0;
	let idle = 0;
	for (const core of os.cpus()) {
		busy += core.times.user + core.times.nice + core.times.sys + core.times.irq;
		idle += core.times.idle;
	}
	return { busy, idle };
}

console.log(`이 컴퓨터: 코어 ${cores}개. 먼저 도화지가 비었는지 본다…`);
const baseline = await measureBaseline();
console.log(`아무것도 안 태운 상태의 사용률: ${(baseline * 100).toFixed(1)}%`);

// 바탕을 빼고 **남은 자리**에 그린다. 기계가 놀고 있어야만 되는 게 아니라, 자리만 있으면 된다.
const band = bandFor(Math.max(baseline, FLOOR), CEILING);
if (!band) {
	console.log(
		`\n지금은 못 그린다 — 남은 자리가 없다 (바탕 ${(baseline * 100).toFixed(0)}%, 천장 ${(CEILING * 100).toFixed(0)}%).\n` +
			'코드가 틀린 게 아니라 잴 수가 없는 상태다. 다른 작업이 끝난 뒤 다시 돌려라.\n' +
			'조용한 기계일수록 그림이 선명하다.'
	);
	process.exit(2);
}
console.log(`그림이 놓일 자리: ${(band.low * 100).toFixed(0)}% ~ ${(band.high * 100).toFixed(0)}%`);

const workerFile = path.join(os.tmpdir(), `badapple-burn-${process.pid}.cjs`);
fs.writeFileSync(workerFile, WORKER_SOURCE);
const workers = Array.from({ length: cores }, () => new Worker(workerFile));

const clip = decode(new Uint8Array(fs.readFileSync(CLIP)));
const surface = new LoadSurface({ cols: 64, rows: 32 });
const player = new Player(clip, { loop: true });
player.stage.add(surface);

// 재생기에 시각을 넣어 그림을 갈아 준다. 태우는 박자와는 따로 논다.
let clock = 0;
player.play(clock);

const intended = [];
const measured = [];

console.log(`이 컴퓨터: 코어 ${cores}개 · 한 줄 ${SLICE_MS}ms · ${COLUMNS}줄 (약 ${((COLUMNS * SLICE_MS) / 1000).toFixed(0)}초)`);
console.log('태우는 중… (기계 전체 사용률을 되재는 중)\n');

for (let column = 0; column < COLUMNS; column++) {
	clock += SLICE_MS;
	player.tick(clock);

	const height = surface.nextColumn();
	// 그림이 놓일 자리는 전체 부하 기준이고, 태울 양은 거기서 바탕을 뺀 나머지다.
	const target = band.low + (band.high - band.low) * Math.max(0, Math.min(1, height));
	const fraction = Math.max(0, target - baseline);

	// 재는 창은 **조각 하나 전체**여야 한다. 태우는 동안만 재면 무엇을 시키든 항상 100% 로 나온다
	// (실제로 그렇게 나왔다 — 시킨 값 0.25 도 0.33 도 전부 1.00). 태운 뒤 남은 시간을 반드시
	// 쉬고, 그 쉬는 시간까지 창 안에 넣어야 「이 조각 동안 얼마나 바빴나」가 된다.
	const sliceStart = Date.now();
	const before = cpuTotals();
	await Promise.all(
		workers.map(
			(worker) =>
				new Promise((resolve) => {
					worker.once('message', resolve);
					worker.postMessage({ fraction, sliceMs: SLICE_MS });
				})
		)
	);
	const restMs = SLICE_MS - (Date.now() - sliceStart);
	if (restMs > 0) await new Promise((resolve) => setTimeout(resolve, restMs));
	const after = cpuTotals();

	const busyDelta = after.busy - before.busy;
	const idleDelta = after.idle - before.idle;
	const total = busyDelta + idleDelta;
	measured.push(total > 0 ? busyDelta / total : 0);
	intended.push(fraction);
}

for (const worker of workers) worker.postMessage('bye');
fs.rmSync(workerFile, { force: true });

function correlation(a, b) {
	const n = a.length;
	const mean = (xs) => xs.reduce((s, x) => s + x, 0) / n;
	const ma = mean(a);
	const mb = mean(b);
	let top = 0;
	let la = 0;
	let lb = 0;
	for (let i = 0; i < n; i++) {
		top += (a[i] - ma) * (b[i] - mb);
		la += (a[i] - ma) ** 2;
		lb += (b[i] - mb) ** 2;
	}
	return la === 0 || lb === 0 ? 0 : top / Math.sqrt(la * lb);
}

const bar = (v) => '█'.repeat(Math.round(v * 40));
console.log('시킨 값 → 기계 전체 사용률');
for (let i = 0; i < COLUMNS; i++) {
	console.log(`${String(i).padStart(2)} ${intended[i].toFixed(2)} ${measured[i].toFixed(2)}  ${bar(measured[i])}`);
}

const r = correlation(intended, measured);
console.log(`\n같이 움직인 정도: ${r.toFixed(3)}`);

const fail = [];
if (!(r > 0.85)) fail.push(`기계 전체 사용률이 그림을 안 따라간다 (${r.toFixed(3)})`);
if (Math.max(...measured) - Math.min(...measured) < 0.2) fail.push('전체 사용률이 거의 안 움직였다 — 태우는 양이 부족하다');

if (fail.length) {
	console.log(`RED:\n- ${fail.join('\n- ')}`);
	process.exit(1);
}
console.log('GREEN — 이 컴퓨터 전체 사용률이 그림 모양을 그렸다');
