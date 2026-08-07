/**
 * 기계 부하로 그린다 — 소프트웨어가 아니라 **하드웨어가 화면**이 된다.
 *
 * 여기가 이 시스템에서 제일 이상한 표면이다. 다른 표면은 칸을 켜서 그리지만, 이건 **실제로
 * CPU 를 태운다.** 그리는 곳은 우리 코드가 아니라 감시 화면의 부하 그래프다. 우리는 그 그래프가
 * 그릴 모양을 만들 뿐이다.
 *
 * 왜 세로줄 단위인가 — 부하 그래프는 가로축이 시간이라 **한 순간에 값 하나**만 찍힌다.
 * 그림 한 장을 한 순간에 넣을 방법이 없다. 대신 그림을 왼쪽부터 한 줄씩 훑어서, 그 줄의
 * 실루엣 높이를 그 순간의 부하로 낸다. 그러면 시간이 지나면서 그래프에 실루엣이 흘러간다.
 *
 * 태우는 일 자체는 밖에서 넣는다(`burn`). 브라우저·노트북·서버가 서로 다르고, 무엇보다
 * **시험할 때는 진짜로 태우면 안 되기 때문**이다.
 */

import type { Paint, Surface, SurfaceShape } from '../surface.js';

export interface LoadSurfaceOptions {
	/** 그림을 몇 줄로 훑을지. 많을수록 곱지만 한 바퀴가 길어진다. 기본 64. */
	cols?: number;
	/** 높이 해상도. 기본 32. */
	rows?: number;
}

/**
 * 최신 그림을 받아 두고, 「지금 줄의 높이」를 하나씩 내주는 표면.
 *
 * 표면이면서 동시에 **읽어 가는 창구**다 — 태우는 쪽이 자기 박자로 `nextColumn()` 을 부른다.
 * 재생 박자(초당 15장)와 부하 재는 박자(보통 1~2초에 한 번)가 전혀 다르기 때문에, 둘을
 * 한 시계에 묶으면 어느 한쪽이 반드시 어긋난다.
 */
export class LoadSurface implements Surface {
	readonly id = 'load';

	private readonly colCount: number;
	private readonly rowCount: number;
	/** 줄마다 「실루엣이 얼마나 높이 찼나」 0~1. */
	private heights: Float64Array;
	private cursor = 0;

	constructor(options: LoadSurfaceOptions = {}) {
		this.colCount = Math.max(1, options.cols ?? 64);
		this.rowCount = Math.max(1, options.rows ?? 32);
		this.heights = new Float64Array(this.colCount);
	}

	measure(): SurfaceShape {
		// 자리를 신고하지 않는다 — 화면 어딘가의 조각이 아니라 그 자체로 하나의 액정이다.
		return { cols: this.colCount, rows: this.rowCount };
	}

	paint(paint: Paint): void {
		for (let x = 0; x < this.colCount; x++) {
			// 위에서부터 내려오다 처음 켜진 칸을 만나면, 거기가 그 줄의 실루엣 꼭대기다.
			let top = this.rowCount;
			for (let y = 0; y < this.rowCount; y++) {
				if (paint.at(x, y)) {
					top = y;
					break;
				}
			}
			this.heights[x] = (this.rowCount - top) / this.rowCount;
		}
	}

	/** 지금 줄의 높이(0~1)를 내고 한 줄 옮긴다. 끝에 닿으면 처음으로 돌아온다. */
	nextColumn(): number {
		const value = this.heights[this.cursor] ?? 0;
		this.cursor = (this.cursor + 1) % this.colCount;
		return value;
	}

	/** 지금까지 받은 그림의 줄 높이들 (시험·미리보기용). */
	snapshot(): number[] {
		return Array.from(this.heights);
	}
}

/** 「이만큼의 비율로 이 시간 동안 태워라」. 진짜 태우는 것은 부르는 쪽이 넣는다. */
export type Burn = (fraction: number, sliceMs: number) => void | Promise<void>;

export interface LoadDriverOptions {
	/** 한 줄을 몇 밀리초 동안 유지할지. 감시 화면이 재는 주기보다 길어야 그래프에 남는다. */
	sliceMs: number;
	/** 실제로 태우는 것. */
	burn: Burn;
	/** 최소 부하 — 0 으로 두면 그래프가 바닥에 붙어 모양이 안 보인다. 기본 0.05. */
	floor?: number;
	/** 최대 부하 — 1 로 두면 기계가 다른 일을 못 한다. 기본 0.75. */
	ceiling?: number;
}

/**
 * 줄 높이를 실제 부하로 바꿔 흘려보낸다.
 *
 * 바닥과 천장을 두는 이유: 0 은 그래프에서 「아무 일 없음」과 구별이 안 되고, 1 은 기계를
 * 멈춰 세운다. 그림은 그 사이 띠 안에서 그려야 한다.
 */
export class LoadDriver {
	private running = false;

	constructor(
		private readonly surface: LoadSurface,
		private readonly options: LoadDriverOptions
	) {}

	get isRunning(): boolean {
		return this.running;
	}

	stop(): void {
		this.running = false;
	}

	/** @param columns 몇 줄 흘려보낼지. 안 주면 멈출 때까지. */
	async run(columns?: number): Promise<number> {
		const floor = this.options.floor ?? 0.05;
		const ceiling = this.options.ceiling ?? 0.75;
		this.running = true;

		let drawn = 0;
		while (this.running && (columns === undefined || drawn < columns)) {
			const height = this.surface.nextColumn();
			const fraction = floor + (ceiling - floor) * Math.max(0, Math.min(1, height));
			await this.options.burn(fraction, this.options.sliceMs);
			drawn += 1;
		}
		this.running = false;
		return drawn;
	}
}

/**
 * 진짜로 태우는 것 — 한 조각 시간 중 정해진 비율만큼 바쁘게 돌고 나머지는 쉰다.
 *
 * 쉬는 구간을 반드시 남긴다. 안 남기면 이 함수가 도는 동안 다른 일이 아예 못 끼어들어서,
 * 감시 화면이 값을 보내지도 못한다 — 그리려던 그림이 자기 때문에 안 그려진다.
 */
export async function busyBurn(fraction: number, sliceMs: number): Promise<void> {
	const start = Date.now();
	const deadline = start + sliceMs;
	const busyUntil = start + sliceMs * Math.max(0, Math.min(1, fraction));

	while (Date.now() < busyUntil) {
		// 일부러 아무것도 안 한다 — 바쁜 것 자체가 목적이다.
	}

	// 쉬는 구간. **조각의 끝을 절대 시각으로 못 박는다** — 그냥 남은 만큼 자라고 하면
	// 타이머가 매번 늦게 깨어나 조각이 길어지고, 부하 비율이 그만큼 묽어진다. 그러면 그래프에
	// 그려지는 그림이 통째로 아래로 눌린다 (실제로 그렇게 나왔다: 0.71 을 내려 했는데 0.61).
	const SPIN_TAIL_MS = 2;
	while (Date.now() < deadline - SPIN_TAIL_MS) {
		const remaining = deadline - SPIN_TAIL_MS - Date.now();
		await new Promise((resolve) => setTimeout(resolve, Math.min(5, Math.max(0, remaining))));
	}
	// 마지막 몇 밀리초는 타이머를 못 믿으니 그냥 버틴다. 조각당 2ms 라 비율에 거의 영향이 없다.
	while (Date.now() < deadline) {
		// 끝을 맞춘다.
	}
}
