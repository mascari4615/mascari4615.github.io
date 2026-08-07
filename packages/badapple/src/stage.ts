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
}

/** 원본의 어떤 구역을, 표면의 격자 크기로 줄여서 답하는 `Paint`. */
function makePaint(frame: Frame, region: Rect, cols: number, rows: number): Paint {
	// 표면 격자 한 칸이 원본에서 차지하는 넓이. 한 칸에 여러 원본 칸이 걸리면
	// 「하나라도 켜져 있으면 켠다」로 본다 — 실루엣은 가늘어지는 것보다 굵어지는 게 안전하다.
	const sx = region.width / cols;
	const sy = region.height / rows;

	let lit = 0;
	const cache = new Uint8Array(cols * rows);
	for (let gy = 0; gy < rows; gy++) {
		const y0 = Math.floor(region.y + gy * sy);
		const y1 = Math.max(y0 + 1, Math.ceil(region.y + (gy + 1) * sy));
		for (let gx = 0; gx < cols; gx++) {
			const x0 = Math.floor(region.x + gx * sx);
			const x1 = Math.max(x0 + 1, Math.ceil(region.x + (gx + 1) * sx));
			let on = 0;
			for (let y = y0; y < y1 && !on; y++) {
				if (y < 0 || y >= frame.height) continue;
				const row = y * frame.width;
				for (let x = x0; x < x1; x++) {
					if (x < 0 || x >= frame.width) continue;
					if (frame.cells[row + x]) {
						on = 1;
						break;
					}
				}
			}
			cache[gy * cols + gx] = on;
			lit += on;
		}
	}

	return {
		cols,
		rows,
		lit,
		at(x: number, y: number): boolean {
			if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
			return cache[y * cols + x] === 1;
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
			const boundsWidth = Math.max(1, right - left);
			const boundsHeight = Math.max(1, bottom - top);

			for (const item of mosaic) {
				// 화면상 비율 → 원본 그림에서의 구역.
				const region: Rect = {
					x: ((item.rect.x - left) / boundsWidth) * frame.width,
					y: ((item.rect.y - top) / boundsHeight) * frame.height,
					width: (item.rect.width / boundsWidth) * frame.width,
					height: (item.rect.height / boundsHeight) * frame.height
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
