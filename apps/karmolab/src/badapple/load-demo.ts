/**
 * 부하가 곧 화면 (TASK-KL-131 ③).
 *
 * 여기 그려지는 선은 **우리가 그린 그림이 아니다.** 우리는 CPU 를 태울 뿐이고, 선은 그 기계가
 * 실제로 얼마나 바빴는지를 되재서 나온 값이다. 그림과 선이 닮았다면, 그건 하드웨어가 그림을
 * 따라갔다는 뜻이다. 그게 이 화면의 전부다.
 *
 * 왜 일꾼(Worker)에서 태우나 — 화면 쪽에서 태우면 그리는 일 자체가 멈춰서, 그림이 안 나오는
 * 이유가 「부하 때문」인지 「그리기가 막혀서」인지 구별이 안 된다. 태우는 곳과 그리는 곳을 나눠야
 * 선이 진짜 부하를 뜻한다.
 *
 * 재는 값 = 일꾼이 한 조각 시간 중 실제로 바빴던 비율. 의도한 값이 아니라 **된 값**이다.
 */
import { decode, LoadSurface, Player } from 'badapple';

/**
 * 일꾼이 하는 일: 시킨 비율만큼 바쁘게 돌고, **실제로** 얼마나 바빴는지 되재서 보고한다.
 * 조각의 끝을 절대 시각으로 못 박는다 — 안 그러면 타이머가 늦게 깨어난 만큼 비율이 묽어져서
 * 선이 통째로 아래로 눌린다.
 */
const WORKER_SOURCE = `
self.onmessage = (event) => {
  const { fraction, sliceMs } = event.data;
  const start = Date.now();
  const deadline = start + sliceMs;
  const busyUntil = start + sliceMs * Math.max(0, Math.min(1, fraction));
  let busySpent = 0;

  while (Date.now() < busyUntil) { /* 바쁜 것이 목적이다 */ }
  busySpent = Date.now() - start;

  const rest = () => {
    if (Date.now() < deadline - 2) {
      setTimeout(rest, Math.min(5, Math.max(0, deadline - 2 - Date.now())));
      return;
    }
    while (Date.now() < deadline) { /* 끝을 맞춘다 */ }
    const wall = Date.now() - start;
    self.postMessage({ measured: busySpent / Math.max(1, wall) });
  };
  rest();
};
`;

(function (): void {
	const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

	const SLICE_MS = 220;
	const HISTORY = 96;

	const measured: number[] = [];
	const intended: number[] = [];
	let worker: Worker | null = null;
	let running = false;

	const surface = new LoadSurface({ cols: 64, rows: 32 });

	function drawGraph(): void {
		const canvas = $<HTMLCanvasElement>('blGraph');
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (canvas.width !== Math.round(width * dpr)) {
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		const style = getComputedStyle(document.body);
		ctx.clearRect(0, 0, width, height);

		const step = width / HISTORY;
		const plot = (series: number[], color: string, dashed: boolean): void => {
			ctx.beginPath();
			ctx.setLineDash(dashed ? [3, 4] : []);
			ctx.strokeStyle = color;
			ctx.lineWidth = dashed ? 1 : 2;
			series.forEach((value, index) => {
				const x = index * step;
				const y = height - value * height;
				if (index === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			ctx.stroke();
		};

		// 의도한 모양은 옅은 점선, 실제로 잰 부하는 진한 실선. 둘이 겹치면 성공이다.
		plot(intended, style.color, true);
		plot(measured, style.color, false);
		ctx.setLineDash([]);
	}

	function pushSample(intent: number, real: number): void {
		intended.push(intent);
		measured.push(real);
		if (intended.length > HISTORY) intended.shift();
		if (measured.length > HISTORY) measured.shift();
		drawGraph();

		$('blReadout').textContent = `시킨 값 ${(intent * 100).toFixed(0)}% · 실제 ${(real * 100).toFixed(0)}%`;
	}

	/** 시킨 값. 보고가 돌아왔을 때 「무엇을 시켰었나」와 짝지으려면 들고 있어야 한다. */
	let lastIntent = 0;

	function burnNext(): void {
		if (!running || !worker) return;
		const height = surface.nextColumn();
		lastIntent = 0.05 + 0.7 * Math.max(0, Math.min(1, height));
		worker.postMessage({ fraction: lastIntent, sliceMs: SLICE_MS });
	}

	async function start(): Promise<void> {
		if (running) return;

		const response = await fetch('/apps/karmolab/data/badapple/demo.bab');
		if (!response.ok) {
			$('blReadout').textContent = '기본 클립을 못 읽었다.';
			return;
		}
		const clip = decode(new Uint8Array(await response.arrayBuffer()));

		// 재생기는 그림을 계속 갈아 준다. 태우는 쪽은 자기 박자로 한 줄씩 읽어 간다 —
		// 초당 15장과 한 조각 220ms 는 서로 다른 박자라, 한 시계에 묶으면 반드시 어긋난다.
		const player = new Player(clip, { loop: true });
		player.stage.add(surface);
		player.play(performance.now());
		const tick = (now: number): void => {
			if (!running) return;
			player.tick(now);
			requestAnimationFrame(tick);
		};

		worker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' })));
		worker.onmessage = (event: MessageEvent<{ measured: number }>) => {
			pushSample(lastIntent, event.data.measured);
			burnNext();
		};

		running = true;
		requestAnimationFrame(tick);
		burnNext();
		$<HTMLButtonElement>('blStart').disabled = true;
		$<HTMLButtonElement>('blStop').disabled = false;
	}

	function stop(): void {
		running = false;
		worker?.terminate();
		worker = null;
		$<HTMLButtonElement>('blStart').disabled = false;
		$<HTMLButtonElement>('blStop').disabled = true;
		$('blReadout').textContent = '멈췄다.';
	}

	$('blStart').addEventListener('click', () => void start());
	$('blStop').addEventListener('click', stop);
	window.addEventListener('resize', drawGraph);
})();
