/**
 * 기본 표면 — 화면에 실제로 있는 것들을 재서 액정으로 쓴다.
 *
 * 이게 「아무도 신고 안 해도 돌아간다」를 담당한다. 도구 하나하나가 자기 방식으로 그리는 게
 * 진짜 목표지만, 그건 도구 쪽이 자발적으로 하는 일이라 언제든 0개일 수 있다. 그때 이 표면이
 * 대신 그린다 — 화면에 있는 것을 골라 재고, **그 위에 덮는 층**에 칠한다.
 *
 * 중요한 것: 골라 놓은 것들의 마크업도 스타일도 건드리지 않는다. 위치만 읽는다.
 * 그래서 나중에 화면을 통째로 갈아엎어도 이 표면은 그냥 새 배치를 다시 읽는다.
 */

import type { Paint, Rect, Surface, SurfaceShape } from '../surface.js';
import { measureCandidates, pickTileGroups, subdivisionFor } from './discover.js';

/** 화면 배치를 다시 재는 간격 (밀리초). 매 프레임 훑으면 그리는 시간보다 재는 시간이 커진다. */
const RESCAN_MS = 400;

export interface DomTilesOptions {
	/**
	 * 액정으로 쓸 것들을 고르는 선택자. **안 주는 것이 기본이자 권장**이다 —
	 * 안 주면 화면에서 모양으로 스스로 찾는다(`discover.ts`). 이름을 박으면 화면 개편 한 번에
	 * 조용히 아무것도 안 그리게 된다.
	 */
	selector?: string;
	/** 어디서 찾을지. 기본 `document`. */
	root?: ParentNode & { querySelectorAll: Element['querySelectorAll'] };
	/**
	 * 타일 하나를 몇 칸으로 쪼갤지. **안 주는 것이 기본**이다 — 안 주면 놓인 칸 수를 보고 정한다.
	 * 칸이 다섯 개뿐인 화면과 백 개인 화면이 같은 값을 쓰면 한쪽은 반드시 뭉갠다.
	 */
	subdivide?: { cols: number; rows: number };
	/** 켜진 칸 색. 기본은 글자색을 따라간다 (어두운/밝은 테마 양쪽에서 보이게). */
	onColor?: string;
	/** 꺼진 칸 색. 기본 투명. */
	offColor?: string;
	/** 덮는 층을 어디에 넣을지. 기본 `document.body`. */
	mount?: HTMLElement;
}

/** 화면 밖으로 나간 것은 뺀다 — 안 보이는 데를 그려 봐야 해상도만 낭비다. */
function visibleRects(elements: Element[]): { element: Element; rect: Rect }[] {
	const out: { element: Element; rect: Rect }[] = [];
	const viewHeight = window.innerHeight || 0;
	const viewWidth = window.innerWidth || 0;
	for (const element of elements) {
		const box = element.getBoundingClientRect();
		if (box.width <= 0 || box.height <= 0) continue;
		if (box.bottom < 0 || box.top > viewHeight) continue;
		if (box.right < 0 || box.left > viewWidth) continue;
		out.push({ element, rect: { x: box.left, y: box.top, width: box.width, height: box.height } });
	}
	return out;
}

/**
 * 고른 것들 전체를 하나의 액정으로 쓰는 표면 하나.
 *
 * 표면을 타일마다 하나씩 만들지 않고 **통째로 하나**로 두는 이유: 타일이 사라지고 생기는 게
 * 잦은데, 표면 목록을 그때마다 맞춰 주려면 결국 어딘가에 도구 표가 생긴다. 잴 때마다 다시
 * 찾으면 그 표가 필요 없다.
 */
export class DomTilesSurface implements Surface {
	readonly id = 'dom-tiles';

	private layer: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private cells: { rect: Rect; cols: number; rows: number }[] = [];
	private cols = 0;
	private rows = 0;
	/** 마지막으로 화면을 다시 훑은 시각. 매 프레임 훑지 않으려고 들고 있다. */
	private measuredAt = 0;
	private cachedShape: SurfaceShape | null | undefined = undefined;
	/** 칸을 화면 격자에 대응시킬 때 쓰는 기준 자리 — 잴 때 한 번 구해 두고 칠할 때 다시 쓴다. */
	private span = { left: 0, top: 0, width: 1, height: 1 };

	constructor(private readonly options: DomTilesOptions) {}

	measure(): SurfaceShape | null {
		// 화면을 **매 프레임 다시 훑지 않는다.** 배치는 초당 열댓 번씩 바뀌는 것이 아니다 —
		// 창 크기가 바뀌거나 스크롤하거나 도구가 열릴 때 바뀐다. 그런데 그때를 일일이 알아채려
		// 하면 결국 화면 쪽에 매달리게 되므로, 그냥 짧은 간격으로 다시 잰다.
		const now = Date.now();
		if (this.cachedShape !== undefined && now - this.measuredAt < RESCAN_MS) return this.cachedShape;
		this.measuredAt = now;

		const root = this.options.root ?? document;
		const found = this.options.selector
			? visibleRects(Array.from(root.querySelectorAll(this.options.selector)))
			: pickTileGroups(measureCandidates(root), {
					viewportArea: (window.innerWidth || 1) * (window.innerHeight || 1)
				}).map((item) => ({ element: null, rect: item.rect }));
		if (found.length === 0) {
			this.cachedShape = null;
			this.cells = [];
			return null;
		}

		// 고른 것들을 감싸는 사각형 안에서, 각 타일이 차지하는 자리를 **칸 단위**로 환산한다.
		// 그래야 무대에게 「나는 이만한 격자다」 하나로 말할 수 있다.
		let left = Infinity;
		let top = Infinity;
		let right = -Infinity;
		let bottom = -Infinity;
		let minWidth = Infinity;
		let minHeight = Infinity;
		for (const item of found) {
			left = Math.min(left, item.rect.x);
			top = Math.min(top, item.rect.y);
			right = Math.max(right, item.rect.x + item.rect.width);
			bottom = Math.max(bottom, item.rect.y + item.rect.height);
			minWidth = Math.min(minWidth, item.rect.width);
			minHeight = Math.min(minHeight, item.rect.height);
		}
		const boundsWidth = Math.max(1, right - left);
		const boundsHeight = Math.max(1, bottom - top);

		// 칸 하나를 몇으로 쪼갤지. 안 주면 **놓인 칸 수를 보고 정한다** — 큰 버튼 다섯 개짜리
		// 화면과 도구 백 개짜리 화면이 비슷한 해상도로 나오게. 고정으로 박으면 한쪽이 반드시 흐리다.
		// (실제로 첫 화면에서 큰 버튼 5개만 잡혀 그림이 뭉갰다.)
		const sub =
			this.options.subdivide ??
			subdivisionFor(Math.round(boundsWidth / minWidth), Math.round(boundsHeight / minHeight));

		// 가장 작은 타일이 자기 몫(sub.cols × sub.rows)을 갖도록 전체 격자 크기를 정한다.
		this.cols = Math.max(sub.cols, Math.min(320, Math.round((boundsWidth / minWidth) * sub.cols)));
		this.rows = Math.max(sub.rows, Math.min(320, Math.round((boundsHeight / minHeight) * sub.rows)));

		this.cells = found.map((item) => ({
			rect: item.rect,
			cols: Math.max(1, Math.round((item.rect.width / boundsWidth) * this.cols)),
			rows: Math.max(1, Math.round((item.rect.height / boundsHeight) * this.rows))
		}));
		this.span = { left, top, width: boundsWidth, height: boundsHeight };

		this.cachedShape = {
			cols: this.cols,
			rows: this.rows,
			rect: { x: left, y: top, width: boundsWidth, height: boundsHeight }
		};
		return this.cachedShape;
	}

	paint(paint: Paint): void {
		const ctx = this.ensureLayer();
		if (!ctx || this.cells.length === 0) return;

		const canvas = ctx.canvas;
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		const style = getComputedStyle(document.body);
		const on = this.options.onColor ?? style.color ?? '#000';
		const off = this.options.offColor;

		// 기준 자리는 잴 때 구해 둔 것을 쓴다 — 칠할 때마다 다시 구할 이유가 없다.
		const { left, top, width: boundsWidth, height: boundsHeight } = this.span;

		// 칸을 하나씩 칠하지 않는다. 실루엣은 켜진 칸이 가로로 길게 이어져서, **이어진 만큼
		// 한 번에** 칠하면 그리기 호출이 몇 배로 줄어든다 (같은 그림, 같은 결과).
		ctx.fillStyle = on;
		for (const cell of this.cells) {
			const startCol = Math.floor(((cell.rect.x - left) / boundsWidth) * paint.cols);
			const startRow = Math.floor(((cell.rect.y - top) / boundsHeight) * paint.rows);
			const cellWidth = cell.rect.width / cell.cols;
			const cellHeight = cell.rect.height / cell.rows;

			for (let gy = 0; gy < cell.rows; gy++) {
				let runStart = -1;
				for (let gx = 0; gx <= cell.cols; gx++) {
					const lit = gx < cell.cols && paint.at(startCol + gx, startRow + gy);
					if (lit && runStart < 0) runStart = gx;
					else if (!lit && runStart >= 0) {
						ctx.fillRect(
							cell.rect.x + runStart * cellWidth,
							cell.rect.y + gy * cellHeight,
							Math.ceil((gx - runStart) * cellWidth),
							Math.ceil(cellHeight)
						);
						runStart = -1;
					}
				}
			}
		}

		// 꺼진 칸에도 색을 칠하라고 한 경우에만 한 번 더 돈다 (평소엔 안 쓴다).
		if (off) {
			ctx.fillStyle = off;
			for (const cell of this.cells) {
				const startCol = Math.floor(((cell.rect.x - left) / boundsWidth) * paint.cols);
				const startRow = Math.floor(((cell.rect.y - top) / boundsHeight) * paint.rows);
				const cellWidth = cell.rect.width / cell.cols;
				const cellHeight = cell.rect.height / cell.rows;
				for (let gy = 0; gy < cell.rows; gy++) {
					for (let gx = 0; gx < cell.cols; gx++) {
						if (paint.at(startCol + gx, startRow + gy)) continue;
						ctx.fillRect(
							cell.rect.x + gx * cellWidth,
							cell.rect.y + gy * cellHeight,
							Math.ceil(cellWidth),
							Math.ceil(cellHeight)
						);
					}
				}
			}
		}
	}

	restore(): void {
		this.layer?.remove();
		this.layer = null;
		this.ctx = null;
		this.cells = [];
		// 재 둔 것을 버린다 — 다시 붙었을 때 옛 배치로 그리면 화면이 그 사이 바뀌었을 수 있다.
		this.cachedShape = undefined;
		this.measuredAt = 0;
	}

	private ensureLayer(): CanvasRenderingContext2D | null {
		const width = window.innerWidth || 0;
		const height = window.innerHeight || 0;
		const dpr = Math.min(2, window.devicePixelRatio || 1);

		if (!this.layer) {
			const canvas = document.createElement('canvas');
			canvas.setAttribute('aria-hidden', 'true');
			// 덮기만 하고 조작은 절대 막지 않는다 — 재생 중에도 사이트는 그대로 써져야 한다.
			canvas.style.cssText =
				'position:fixed;inset:0;pointer-events:none;z-index:9998;mix-blend-mode:difference;';
			(this.options.mount ?? document.body).appendChild(canvas);
			this.layer = canvas;
			this.ctx = canvas.getContext('2d');
		}

		const canvas = this.layer;
		if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		return this.ctx;
	}
}
