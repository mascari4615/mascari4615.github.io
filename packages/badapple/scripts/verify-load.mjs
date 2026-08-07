/**
 * 부하로 그리기가 **진짜로** 되는지 잰다 (TASK-KL-131 ③).
 *
 * 단위 시험은 「어떤 값을 내려 했나」까지만 본다. 그건 그리려는 의도지 그려진 그림이 아니다.
 * 여기서는 실제로 CPU 를 태우고, 이 프로세스가 쓴 시간을 되재서 **의도한 모양과 실제 부하가
 * 같은 곡선을 그리는지** 확인한다. 감시 화면이 보게 될 것이 바로 이 곡선이다.
 *
 * 상시 검사에는 안 넣는다 — 시간을 재는 검사라 기계가 바쁘면 흔들린다. 손으로 돌리는 확인용.
 */
import { LoadSurface, LoadDriver, busyBurn } from '../dist/surfaces/load.js';

const COLS = 16;
const ROWS = 16;
const SLICE_MS = 250;

// 산 모양 실루엣 — 가운데가 높고 양끝이 낮다. 곡선이 뒤집혀도 바로 눈에 띈다.
const surface = new LoadSurface({ cols: COLS, rows: ROWS });
const on = (x, y) => {
	const height = Math.round(ROWS * (0.15 + 0.8 * Math.sin((Math.PI * x) / (COLS - 1))));
	return y >= ROWS - height;
};
let lit = 0;
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (on(x, y)) lit += 1;
surface.paint({ cols: COLS, rows: ROWS, lit, at: on });

const intended = [];
const measured = [];

const driver = new LoadDriver(surface, {
	sliceMs: SLICE_MS,
	floor: 0.05,
	ceiling: 0.75,
	burn: async (fraction, sliceMs) => {
		intended.push(fraction);
		const before = process.cpuUsage();
		const wallBefore = Date.now();
		await busyBurn(fraction, sliceMs);
		const spent = process.cpuUsage(before);
		const wall = Date.now() - wallBefore;
		measured.push((spent.user + spent.system) / 1000 / Math.max(1, wall));
	}
});

console.log(`${COLS}줄 × ${SLICE_MS}ms — 약 ${((COLS * SLICE_MS) / 1000).toFixed(1)}초 태운다…`);
await driver.run(COLS);

/** 두 곡선이 같이 오르내리는 정도 (1 이면 완전히 같은 모양). */
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
	return top / Math.sqrt(la * lb);
}

const r = correlation(intended, measured);
const maxGap = Math.max(...intended.map((v, i) => Math.abs(v - measured[i])));

const bar = (v) => '█'.repeat(Math.round(v * 30));
console.log('\n의도 → 실제');
for (let i = 0; i < COLS; i++) {
	console.log(
		`${String(i).padStart(2)} ${intended[i].toFixed(2)} ${measured[i].toFixed(2)}  ${bar(measured[i])}`
	);
}

console.log(`\n같이 움직인 정도: ${r.toFixed(3)} · 가장 큰 어긋남: ${maxGap.toFixed(3)}`);

const fail = [];
if (!(r > 0.95)) fail.push(`실제 부하가 그림을 안 따라간다 (${r.toFixed(3)})`);
if (!(maxGap < 0.15)) fail.push(`어긋남이 크다 (${maxGap.toFixed(3)})`);

if (fail.length) {
	console.log(`RED:\n- ${fail.join('\n- ')}`);
	process.exit(1);
}
console.log('GREEN — 실제 CPU 부하가 그림 모양을 그대로 따라갔다');
