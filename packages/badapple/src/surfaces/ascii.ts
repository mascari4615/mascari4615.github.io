/**
 * 아스키 표면 — 칸의 **밝기**를 글자 농도로, 색이 있으면 글자 색으로 낸다 (TASK-KL-244).
 *
 * `TextSurface` 와 왜 따로인가: 저쪽은 켜짐/꺼짐만 읽는 1비트 표면이고, 봇 메시지·터미널처럼
 * 색이 없는 자리를 위해 그대로 둬야 한다. 여기서 필요한 건 그 반대 — 계조가 있어야 그림이
 * 그림처럼 보이고, 색이 있어야 「글자로 그린 영상」이 된다.
 *
 * **어떻게 보여 줄지는 안 정한다.** 완성된 글자판과 칸별 색을 그대로 넘긴다 — 받는 쪽이
 * HTML 로 칠하든 캔버스에 찍든 ANSI 로 터미널에 뿌리든 이 파일은 모른다. 표면이 표현 방식을
 * 정하면 브라우저 전용이 되어, 이 묶음이 지키려는 「어디서나 같은 것」이 깨진다.
 */

import type { Paint, Surface, SurfaceShape } from '../surface.js';

export interface AsciiFrame {
	cols: number;
	rows: number;
	/** 줄바꿈으로 이어 붙인 글자판. 그대로 복사·저장하면 된다. */
	text: string;
	/**
	 * 칸마다의 색 `0xRRGGBB` (`cols*rows` 길이). 색이 없는 클립이면 `null` —
	 * 그때는 받는 쪽이 자기 글자색을 그대로 쓰면 된다.
	 */
	colors: Int32Array | null;
}

export interface AsciiSurfaceOptions {
	cols: number;
	rows: number;
	/**
	 * **어두운 것부터 밝은 것 순.** 예: `' .:-=+*#%@'`
	 *
	 * 순서를 이렇게 못 박는 이유: 아스키 아트 램프는 세상에 두 방향이 다 돌아다녀서, 정하지
	 * 않으면 어떤 램프를 넣느냐에 따라 그림이 통째로 반전된다 — 그런데 반전된 그림도 그럴듯해
	 * 보여서 한참 뒤에야 알아챈다. 뒤집고 싶으면 램프를 뒤집어 넣어라.
	 */
	ramp: string;
	/** 색을 같이 낼지. 클립에 색이 없으면 켜도 `colors` 는 `null` 이다. */
	color?: boolean;
	/** 한 장이 완성될 때마다. */
	write(frame: AsciiFrame): void;
}

export class AsciiSurface implements Surface {
	readonly id = 'ascii';

	constructor(private readonly options: AsciiSurfaceOptions) {}

	measure(): SurfaceShape | null {
		const { cols, rows } = this.options;
		if (cols <= 0 || rows <= 0) return null;
		return { cols, rows };
	}

	paint(paint: Paint): void {
		const ramp = this.options.ramp && this.options.ramp.length > 0 ? this.options.ramp : ' .:-=+*#%@';
		const last = ramp.length - 1;
		const wantColor = this.options.color === true && paint.hasColor;
		const colors = wantColor ? new Int32Array(paint.cols * paint.rows) : null;

		const lines: string[] = [];
		for (let y = 0; y < paint.rows; y++) {
			let line = '';
			for (let x = 0; x < paint.cols; x++) {
				// 밝기 평면이 없는 클립이면 `level` 이 켜짐/꺼짐을 0·255 로 돌려준다 —
				// 그래서 1비트 클립을 넣어도 이 표면은 그냥 돈다 (양 끝 글자만 쓰게 된다).
				const level = paint.level(x, y);
				const index = Math.max(0, Math.min(last, Math.round((level / 255) * last)));
				line += ramp[index];
				if (colors) colors[y * paint.cols + x] = paint.rgb(x, y);
			}
			lines.push(line);
		}

		this.options.write({ cols: paint.cols, rows: paint.rows, text: lines.join('\n'), colors });
	}
}
