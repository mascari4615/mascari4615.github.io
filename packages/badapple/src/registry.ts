/**
 * 신고 창구 — 그리고 싶은 쪽이 **재생기를 몰라도** 자기를 등록하는 자리.
 *
 * 왜 필요한가: 지금까지는 덮는 층 하나가 화면 전체를 대신 그렸다. 그건 「아무도 신고 안 해도
 * 돌아간다」를 위한 바닥이지 목표가 아니다. 진짜 목표는 **도구가 자기 방식으로 그리는 것** —
 * 번호판은 번호로, 팔레트는 색칸으로, 글자 도구는 글자로.
 *
 * 그런데 도구는 재생기가 지금 도는지 모르고, 알 필요도 없어야 한다:
 *   - 도구가 먼저 켜져 있고 재생이 나중에 시작될 수도 있고
 *   - 재생 중에 도구가 열리거나 닫힐 수도 있다
 *
 * 그래서 창구가 사이에 선다. 도구는 창구에만 신고하고, 창구가 재생기가 생길 때 넘긴다.
 * 도구가 사라질 때 부르는 함수 하나만 돌려받으면 뒷정리도 끝난다 — 도구 쪽에 재생 관련
 * 코드가 한 줄도 안 남는 게 요점이다.
 */

import type { Stage } from './stage.js';
import type { Surface } from './surface.js';

export class Registry {
	private readonly surfaces = new Set<Surface>();
	private stage: Stage | null = null;
	/** 무대에 붙일 때 받은 「떼는 함수」. 무대가 바뀌면 이걸로 먼저 뗀다. */
	private detachers = new Map<Surface, () => void>();

	/**
	 * 그릴 것을 신고한다. 재생이 이미 돌고 있으면 바로 붙고, 아니면 다음 재생 때 붙는다.
	 * @returns 신고를 무르는 함수. 도구가 닫힐 때 부르면 된다.
	 */
	add(surface: Surface): () => void {
		this.surfaces.add(surface);
		if (this.stage) this.detachers.set(surface, this.stage.add(surface));
		return () => this.remove(surface);
	}

	remove(surface: Surface): void {
		this.surfaces.delete(surface);
		const detach = this.detachers.get(surface);
		if (detach) {
			detach();
			this.detachers.delete(surface);
		}
	}

	/** 지금 신고돼 있는 수. */
	get size(): number {
		return this.surfaces.size;
	}

	/** 재생이 시작될 때. 신고돼 있던 것들을 한꺼번에 붙인다. */
	bindTo(stage: Stage): void {
		if (this.stage === stage) return;
		this.unbind();
		this.stage = stage;
		for (const surface of this.surfaces) this.detachers.set(surface, stage.add(surface));
	}

	/**
	 * 재생이 끝날 때. 무대에서만 떼고 **신고는 남긴다** — 다음에 다시 켜면 그대로 다시 그린다.
	 * (신고까지 지우면 도구가 재생 껐다 켤 때마다 다시 신고해야 하고, 그러면 도구 쪽에서
	 *  재생 상태를 신경 쓰게 된다. 그게 바로 이 창구가 없애려던 것이다.)
	 */
	unbind(): void {
		for (const detach of this.detachers.values()) detach();
		this.detachers.clear();
		this.stage = null;
	}
}
