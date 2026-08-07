/**
 * 액정으로 쓸 것을 **스스로 찾는다.** 선택자를 안 받는다.
 *
 * 왜: 선택자를 박는 순간 그게 곧 「화면을 아는 코드」다. 도구는 활발하게 바뀌고, 칸 이름은
 * 개편 한 번이면 사라진다. 그러면 재생은 오류도 없이 그냥 아무것도 안 그린다 — 제일 나쁜
 * 종류의 고장이다(고장인 줄 모른다).
 *
 * 대신 **모양으로** 찾는다: 한 부모 밑에 크기가 고만고만한 형제가 여럿 있으면, 그게 격자다.
 * 도구 칸이든 상태 타일이든 목록 줄이든 상관없다. 이름이 바뀌어도 모양은 남는다.
 *
 * 고르는 기준 (점수가 제일 높은 무리 하나):
 *   - 형제가 많을수록 좋다 (해상도)
 *   - 크기가 서로 비슷할수록 좋다 (들쭉날쭉하면 그림이 일그러진다)
 *   - 너무 작거나(글자 쪼가리) 너무 큰 것(화면 전체를 덮는 껍데기)은 뺀다
 */

import type { Rect } from '../surface.js';

/** 잰 결과 한 칸. DOM 없이도 시험할 수 있게 잰 값만 받는다. */
export interface Measured {
	/** 같은 부모끼리 묶기 위한 표식. DOM 에서는 부모 요소 자체를 쓴다. */
	group: unknown;
	rect: Rect;
}

export interface DiscoverOptions {
	/** 이보다 작은 것은 무시 (픽셀). 기본 24 — 글자 쪼가리를 거른다. */
	minSide?: number;
	/** 화면의 이 비율보다 크면 무시. 기본 0.6 — 전체를 덮는 껍데기를 거른다. */
	maxAreaRatio?: number;
	/** 최소 몇 개는 모여야 격자로 친다. 기본 4. */
	minCount?: number;
	/** 화면 넓이 (픽셀²). maxAreaRatio 판단에 쓴다. */
	viewportArea: number;
}

/**
 * 잰 것들 중에서 액정으로 쓸 무리 하나를 고른다. 못 고르면 빈 배열.
 *
 * 순수 함수다 — 브라우저 없이 시험한다. 「화면에서 뭘 고르나」가 이 시스템에서 제일 자주
 * 틀릴 자리라, 여기만은 눈으로 보지 않고도 확인할 수 있어야 한다.
 */
export function pickTileGroup(measured: readonly Measured[], options: DiscoverOptions): Measured[] {
	const minSide = options.minSide ?? 24;
	const maxAreaRatio = options.maxAreaRatio ?? 0.6;
	const minCount = options.minCount ?? 4;

	const groups = new Map<unknown, Measured[]>();
	for (const item of measured) {
		const { width, height } = item.rect;
		if (width < minSide || height < minSide) continue;
		if (width * height > options.viewportArea * maxAreaRatio) continue;
		const bucket = groups.get(item.group);
		if (bucket) bucket.push(item);
		else groups.set(item.group, [item]);
	}

	let best: Measured[] = [];
	let bestScore = 0;

	for (const bucket of groups.values()) {
		if (bucket.length < minCount) continue;

		// 크기가 얼마나 고른지 — 가장 작은 것과 가장 큰 것의 넓이 비.
		let minArea = Infinity;
		let maxArea = 0;
		for (const item of bucket) {
			const area = item.rect.width * item.rect.height;
			minArea = Math.min(minArea, area);
			maxArea = Math.max(maxArea, area);
		}
		const evenness = maxArea > 0 ? minArea / maxArea : 0;

		// 개수는 이득이지만 무한정은 아니다(로그). 고르기가 심하게 나쁘면 개수로도 못 산다.
		const score = Math.log2(bucket.length + 1) * (0.25 + 0.75 * evenness);
		if (score > bestScore) {
			bestScore = score;
			best = bucket;
		}
	}

	return best;
}

/**
 * 칸 하나를 몇 개로 쪼갤지 정한다.
 *
 * 왜 자동이어야 하나: 화면마다 칸 수가 전혀 다르다. 도구 목록에는 백 개가 넘게 깔리지만
 * 첫 화면에는 큰 버튼 다섯 개뿐이다 (실제로 그랬다). 쪼갬을 고정으로 박으면 한쪽은 흐릿하고
 * 다른 쪽은 쓸데없이 잘다. 칸이 적으면 잘게, 많으면 성글게 — 전체 해상도를 비슷하게 맞춘다.
 *
 * @param tilesAcross 가로로 몇 칸 놓였나
 * @param tilesDown 세로로 몇 줄인가
 * @param target 원하는 전체 격자 크기
 */
export function subdivisionFor(
	tilesAcross: number,
	tilesDown: number,
	target: { cols: number; rows: number } = { cols: 56, rows: 40 }
): { cols: number; rows: number } {
	const across = Math.max(1, tilesAcross);
	const down = Math.max(1, tilesDown);
	return {
		// 한 칸이 너무 잘아지면 그리는 값이 커지기만 하고 눈에는 차이가 없다 — 위쪽을 막는다.
		cols: Math.max(1, Math.min(24, Math.round(target.cols / across))),
		rows: Math.max(1, Math.min(24, Math.round(target.rows / down)))
	};
}

/** 화면에서 잰다. 보이는 것만, 그리고 남의 자식까지 다 훑지 않게 요소 수를 제한한다. */
export function measureCandidates(root: ParentNode, limit = 4000): Measured[] {
	const out: Measured[] = [];
	const all = root.querySelectorAll('*');
	const viewHeight = window.innerHeight || 0;
	const viewWidth = window.innerWidth || 0;

	for (let i = 0; i < all.length && i < limit; i++) {
		const element = all[i];
		if (!element) continue;
		const tag = element.tagName;
		// 그림을 담을 수 없는 것들은 처음부터 뺀다.
		if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'HEAD' || tag === 'META' || tag === 'LINK') continue;
		const box = element.getBoundingClientRect();
		if (box.width <= 0 || box.height <= 0) continue;
		if (box.bottom < 0 || box.top > viewHeight) continue;
		if (box.right < 0 || box.left > viewWidth) continue;
		out.push({
			group: element.parentElement,
			rect: { x: box.left, y: box.top, width: box.width, height: box.height }
		});
	}

	void viewWidth;
	return out;
}
