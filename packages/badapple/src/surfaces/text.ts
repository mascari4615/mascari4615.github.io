/**
 * 글자 표면 — 켜진 칸을 글자로 찍는다. 브라우저·터미널·봇 메시지 어디서나 같은 것을 쓴다.
 *
 * 이 표면은 화면 자리를 신고하지 않는다(거울). 전체 그림을 자기 격자로 줄여 받는다 —
 * 글자판은 「화면 어딘가의 조각」이 아니라 그 자체로 하나의 액정이기 때문이다.
 */

import type { Paint, Surface, SurfaceShape } from '../surface.js';

export interface TextSurfaceOptions {
	cols: number;
	rows: number;
	/** 켜진 칸에 찍을 글자. 기본은 꽉 찬 네모. */
	on?: string;
	/** 꺼진 칸. 기본 공백. */
	off?: string;
	/**
	 * 높이가 없는 자리(탭 제목·한 줄 상태막)를 위한 방식. 주면 **한 줄만** 낸다 —
	 * 칸마다 세로로 얼마나 찼는지를 글자 굵기로 바꾼다.
	 *
	 * 왜 필요한가: 한 줄에 그림을 눌러 담으면서 「하나라도 켜지면 켬」으로 하면, 아래쪽이 꽉 찬
	 * 영상은 **모든 칸이 항상 켜져** 아무것도 안 움직인다. 실제로 그렇게 나왔다.
	 * 옅은 것부터 진한 것 순으로 준다. 예: `' ▁▂▃▄▅▆▇█'`
	 */
	ramp?: string;
	/** 완성된 한 장을 받는다. 콘솔에 찍든 메시지를 고치든 부르는 쪽 마음. */
	write(text: string): void;
}

export class TextSurface implements Surface {
	readonly id = 'text';

	constructor(private readonly options: TextSurfaceOptions) {}

	measure(): SurfaceShape | null {
		const { cols, rows } = this.options;
		if (cols <= 0 || rows <= 0) return null;
		return { cols, rows };
	}

	paint(paint: Paint): void {
		const ramp = this.options.ramp;
		if (ramp && ramp.length > 0) {
			let line = '';
			for (let x = 0; x < paint.cols; x++) {
				let filled = 0;
				for (let y = 0; y < paint.rows; y++) if (paint.at(x, y)) filled += 1;
				const level = Math.round((filled / Math.max(1, paint.rows)) * (ramp.length - 1));
				line += ramp[Math.max(0, Math.min(ramp.length - 1, level))];
			}
			this.options.write(line);
			return;
		}

		const on = this.options.on ?? '█';
		const off = this.options.off ?? ' ';
		const lines: string[] = [];
		for (let y = 0; y < paint.rows; y++) {
			let line = '';
			for (let x = 0; x < paint.cols; x++) line += paint.at(x, y) ? on : off;
			lines.push(line);
		}
		this.options.write(lines.join('\n'));
	}
}
