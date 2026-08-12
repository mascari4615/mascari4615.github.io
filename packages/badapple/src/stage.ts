/**
 * 무대 — 한 장의 그림을 지금 붙어 있는 표면들에게 나눠 준다.
 *
 * 여기가 「도구가 활발하게 바뀐다」를 견디는 자리다. 무대는 표면 **목록을 들고 있지 않다** —
 * 매 프레임 붙어 있는 것들에게 「지금 너 어디에 몇 칸이냐」를 물어서, 그 답으로 배치를 새로 짠다.
 * 도구가 사라지면 그 표면이 `null` 을 답하거나 아예 떼어져 있고, 무대는 나머지로 다시 짠다.
 * 새 도구가 생기면 다음 프레임에 그냥 낀다. 재배치를 위해 아무도 아무한테 알리지 않아도 된다.
 *
 * 배치는 두 가지가 섞인다:
 *   - **모자이크** — 자기 자리를 신고한 표면들. 그것들을 전부 감싸는 사각형을 구해서,
 *     각 표면이 그 안에서 차지하는 비율만큼 원본 그림의 해당 구역을 받는다.
 *     = 화면에 흩어진 타일들이 모여 하나의 큰 액정이 된다.
 *   - **거울** — 자리를 안 신고한 표면들. 전체 그림을 자기 격자로 줄여 받는다.
 *
 * 둘을 섞어 쓸 수 있는 게 중요하다: 타일은 모자이크로 한 조각씩, 파비콘은 거울로 전체를,
 * 같은 재생에서 동시에 나온다.
 */

import type { Paint, Rect, Surface, SurfaceShape } from './surface.js';

interface Attached {
	surface: Surface;
	id: string;
}

/** 원본 그림 한 장 — 무대가 표면에게 나눠 주기 전의 것. */
export interface Frame {
	width: number;
	height: number;
	/** `width*height` 길이의 0/1. */
	cells: Uint8Array;
	/** `width*height` 길이의 밝기 0~255. 파일에 붙어 있을 때만. */
	levels?: Uint8Array | null;
	/** `width*height*3` 길이의 R·G·B. 파일에 붙어 있을 때만. */
	colors?: Uint8Array | null;
}

/** 원본의 어떤 구역을, 표면의 격자 크기로 줄여서 답하는 `Paint`. */
function makePaint(frame: Frame, region: Rect, cols: number, rows: number): Paint {
	// 표면 격자 한 칸이 원본에서 차지하는 넓이. 한 칸에 여러 원본 칸이 걸리면
	// 「하나라도 켜져 있으면 켠다」로 본다 — 실루엣은 가늘어지는 것보다 굵어지는 게 안전하다.
	const sx = region.width / cols;
	const sy = region.height / rows;

	// 실루엣은 「하나라도 켜지면 켬」(위 설명), 밝기·색은 **평균**이다. 계조가 있는 그림에서
	// 최댓값을 쓰면 한 칸에 밝은 점 하나만 걸려도 그 칸이 통째로 하얘져서, 축소할수록 그림이
	// 하얗게 타 버린다. 평균은 축소가 곧 흐림이 되어 원본 느낌을 지킨다.
	const hasLevel = !!frame.levels && frame.levels.length >= frame.width * frame.height;
	const hasColor = !!frame.colors && frame.colors.length >= frame.width * frame.height * 3;

	let lit = 0;
	const cache = new Uint8Array(cols * rows);
	const levelCache = hasLevel ? new Uint8Array(cols * rows) : null;
	const colorCache = hasColor ? new Uint8Array(cols * rows * 3) : null;
	for (let gy = 0; gy < rows; gy++) {
		const y0 = Math.floor(region.y + gy * sy);
		const y1 = Math.max(y0 + 1, Math.ceil(region.y + (gy + 1) * sy));
		for (let gx = 0; gx < cols; gx++) {
			const x0 = Math.floor(region.x + gx * sx);
			const x1 = Math.max(x0 + 1, Math.ceil(region.x + (gx + 1) * sx));
			let on = 0;
			let levelSum = 0;
			let redSum = 0;
			let greenSum = 0;
			let blueSum = 0;
			let taken = 0;
			// 평면이 없으면 켜진 칸 하나만 찾으면 끝 — 예전처럼 일찍 빠져나온다.
			const needAverage = levelCache !== null || colorCache !== null;
			for (let y = y0; y < y1; y++) {
				if (y < 0 || y >= frame.height) continue;
				if (on && !needAverage) break;
				const row = y * frame.width;
				for (let x = x0; x < x1; x++) {
					if (x < 0 || x >= frame.width) continue;
					if (frame.cells[row + x]) on = 1;
					if (on && !needAverage) break;
					if (levelCache) levelSum += frame.levels?.[row + x] ?? 0;
					if (colorCache) {
						const at = (row + x) * 3;
						redSum += frame.colors?.[at] ?? 0;
						greenSum += frame.colors?.[at + 1] ?? 0;
						blueSum += frame.colors?.[at + 2] ?? 0;
					}
					taken += 1;
				}
			}
			const cell = gy * cols + gx;
			cache[cell] = on;
			lit += on;
			const divisor = Math.max(1, taken);
			if (levelCache) levelCache[cell] = Math.round(levelSum / divisor);
			if (colorCache) {
				colorCache[cell * 3] = Math.round(redSum / divisor);
				colorCache[cell * 3 + 1] = Math.round(greenSum / divisor);
				colorCache[cell * 3 + 2] = Math.round(blueSum / divisor);
			}
		}
	}

	const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < cols && y < rows;

	return {
		cols,
		rows,
		lit,
		hasLevel,
		hasColor,
		at(x: number, y: number): boolean {
			if (!inside(x, y)) return false;
			return cache[y * cols + x] === 1;
		},
		level(x: number, y: number): number {
			if (!inside(x, y)) return 0;
			const cell = y * cols + x;
			if (levelCache) return levelCache[cell] ?? 0;
			return cache[cell] ? 255 : 0;
		},
		rgb(x: number, y: number): number {
			if (!inside(x, y)) return 0;
			const cell = y * cols + x;
			if (colorCache) {
				return (
					((colorCache[cell * 3] ?? 0) << 16) | ((colorCache[cell * 3 + 1] ?? 0) << 8) | (colorCache[cell * 3 + 2] ?? 0)
				);
			}
			const value = levelCache ? (levelCache[cell] ?? 0) : cache[cell] ? 255 : 0;
			return (value << 16) | (value << 8) | value;
		}
	};
}

export class Stage {
	private attached: Attached[] = [];
	private counter = 0;

	/** 표면을 붙인다. 떼는 함수를 돌려준다 (도구가 사라질 때 그걸 부르면 끝). */
	add(surface: Surface): () => void {
		const id = surface.id ?? `surface-${++this.counter}`;
		const entry: Attached = { surface, id };
		this.attached.push(entry);
		return () => this.remove(surface);
	}

	remove(surface: Surface): void {
		const index = this.attached.findIndex((a) => a.surface === surface);
		if (index < 0) return;
		const [entry] = this.attached.splice(index, 1);
		try {
			entry?.surface.restore?.();
		} catch {
			// 되돌리다 실패한 표면 하나 때문에 나머지가 안 떼어지면 안 된다.
		}
	}

	/** 지금 붙어 있는 수 (기본 표면으로 넘길지 판단할 때 쓴다). */
	get size(): number {
		return this.attached.length;
	}

	/** 전부 떼고 원래대로 되돌린다. */
	clear(): void {
		for (const entry of [...this.attached]) this.remove(entry.surface);
	}

	/**
	 * 그림 한 장을 지금 붙어 있는 표면들에 뿌린다.
	 *
	 * 표면 하나가 던진 오류가 나머지를 못 그리게 하면 안 된다 — 도구 하나가 화면에서 막
	 * 사라지는 중이라 잰 값이 이상해지는 일은 정상적으로 일어난다. 그래서 각각 감싼다.
	 */
	present(frame: Frame): void {
		const mosaic: { entry: Attached; shape: SurfaceShape; rect: Rect }[] = [];
		const mirror: { entry: Attached; shape: SurfaceShape }[] = [];

		for (const entry of this.attached) {
			let shape: SurfaceShape | null = null;
			try {
				shape = entry.surface.measure();
			} catch {
				shape = null;
			}
			if (!shape || shape.cols <= 0 || shape.rows <= 0) continue;
			if (shape.rect && shape.rect.width > 0 && shape.rect.height > 0) {
				mosaic.push({ entry, shape, rect: shape.rect });
			} else {
				mirror.push({ entry, shape });
			}
		}

		// 모자이크: 지금 화면에 있는 것들을 전부 감싸는 사각형이 곧 「이번 프레임의 액정 크기」다.
		// 도구가 하나 빠지면 이 사각형이 줄고, 그림도 그만큼 다시 맞춰진다 — 저절로 따라온다.
		if (mosaic.length > 0) {
			let left = Infinity;
			let top = Infinity;
			let right = -Infinity;
			let bottom = -Infinity;
			for (const item of mosaic) {
				left = Math.min(left, item.rect.x);
				top = Math.min(top, item.rect.y);
				right = Math.max(right, item.rect.x + item.rect.width);
				bottom = Math.max(bottom, item.rect.y + item.rect.height);
			}
			const spanWidth = Math.max(1, right - left);
			const spanHeight = Math.max(1, bottom - top);

			// 그림을 칸 영역에 **늘려 맞추지 않는다.** 늘리면 화면이 가로로 넓을 때 그림이
			// 옆으로 퍼져 사람 실루엣이 뚱뚱해진다. 대신 원본 비율을 지킨 채 영역 안에 넣고,
			// 남는 가장자리는 그냥 빈다 (영화 볼 때 위아래 검은 띠와 같은 원리).
			const scale = Math.min(spanWidth / frame.width, spanHeight / frame.height);
			const drawWidth = frame.width * scale;
			const drawHeight = frame.height * scale;
			const padX = (spanWidth - drawWidth) / 2;
			const padY = (spanHeight - drawHeight) / 2;

			for (const item of mosaic) {
				// 화면상 자리 → 원본 그림에서의 구역. 비율을 지킨 그림 자리 기준으로 환산한다.
				// 그림 밖으로 나간 칸은 알아서 꺼진 것으로 읽힌다 (`at` 이 범위를 본다).
				const region: Rect = {
					x: ((item.rect.x - left - padX) / Math.max(1, drawWidth)) * frame.width,
					y: ((item.rect.y - top - padY) / Math.max(1, drawHeight)) * frame.height,
					width: (item.rect.width / Math.max(1, drawWidth)) * frame.width,
					height: (item.rect.height / Math.max(1, drawHeight)) * frame.height
				};
				try {
					item.entry.surface.paint(makePaint(frame, region, item.shape.cols, item.shape.rows));
				} catch {
					// 이 표면만 이번 프레임을 건너뛴다.
				}
			}
		}

		const whole: Rect = { x: 0, y: 0, width: frame.width, height: frame.height };
		for (const item of mirror) {
			try {
				item.entry.surface.paint(makePaint(frame, whole, item.shape.cols, item.shape.rows));
			} catch {
				// 위와 같다.
			}
		}
	}
}
