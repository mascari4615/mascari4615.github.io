/**
 * 굽기 — 영상 한 편에서 흑백 격자 프레임을 뽑는다.
 *
 * 브라우저에서 한다. ffmpeg 을 깔라고 요구하는 순간 「아무나 자기 영상을 넣어 본다」가 죽고,
 * 이 시스템은 내 컴퓨터에서만 도는 물건이 된다. 레포에 이미 영상에서 그림을 뽑는 것과
 * 밝기를 재는 것이 있어서, 같은 방식을 그대로 따른다:
 *   - 그 시각으로 옮기고 옮겨질 때까지 기다린다 (이미 도착해 있으면 신호가 안 오므로 바로 진행)
 *   - 밝기는 단순 평균이 아니라 시감 가중 — 평균을 쓰면 초록이 지나치게 밝게 잡힌다
 */

/** 시감 가중 밝기 (0~255). */
function luma(r: number, g: number, b: number): number {
	return 0.299 * r + 0.587 * g + 0.114 * b;
}

export interface SampleOptions {
	/** 가로 칸 수. */
	width: number;
	/** 세로 칸 수. */
	height: number;
	/** 초당 몇 장. 높일수록 부드럽지만 파일이 커진다. 기본 15. */
	fps?: number;
	/** 이 밝기보다 밝으면 켜진 칸 (0~255). 기본 128. */
	threshold?: number;
	/** 밝고 어두움을 뒤집는다. 원본이 「흰 배경에 검은 실루엣」이면 켜 준다. */
	invert?: boolean;
	/** 여기부터 (초). 기본 0. */
	startSec?: number;
	/** 여기까지 (초). 기본 영상 끝. */
	endSec?: number;
	/** 한 장 뽑을 때마다. 오래 걸리는 작업이라 진행 상황을 보여 줄 수 있게. */
	onProgress?: (done: number, total: number) => void;
}

/** 옮기고 도착할 때까지 기다린다. 이미 도착해 있으면 신호가 안 오므로 바로 넘어간다. */
function seekTo(video: HTMLVideoElement, time: number, timeoutMs = 3000): Promise<void> {
	return new Promise((resolve) => {
		const duration = Number.isFinite(video.duration) ? video.duration : 0;
		const target = Math.min(Math.max(0, time), Math.max(0, duration - 0.02));
		if (Math.abs(video.currentTime - target) < 0.01) return resolve();
		let timer = 0;
		const done = (): void => {
			window.clearTimeout(timer);
			video.removeEventListener('seeked', done);
			resolve();
		};
		video.addEventListener('seeked', done);
		timer = window.setTimeout(done, timeoutMs);
		video.currentTime = target;
	});
}

export interface Sampled {
	frames: Uint8Array[];
	width: number;
	height: number;
	fps: number;
}

/**
 * 영상 → 0/1 프레임 목록. 결과를 `encode` 에 그대로 넘기면 `.bab` 이 된다.
 *
 * @param video 이미 메타데이터까지 읽힌 영상 (`loadedmetadata` 이후)
 */
export async function sampleVideo(video: HTMLVideoElement, options: SampleOptions): Promise<Sampled> {
	const width = Math.max(1, Math.round(options.width));
	const height = Math.max(1, Math.round(options.height));
	const fps = Math.max(1, options.fps ?? 15);
	const threshold = options.threshold ?? 128;
	const invert = options.invert ?? false;

	const duration = Number.isFinite(video.duration) ? video.duration : 0;
	const start = Math.max(0, options.startSec ?? 0);
	const end = Math.min(duration, options.endSec ?? duration);
	const span = Math.max(0, end - start);
	const total = Math.max(1, Math.floor(span * fps));

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('badapple: 그림판을 못 만들었다');

	const frames: Uint8Array[] = [];
	for (let i = 0; i < total; i++) {
		await seekTo(video, start + i / fps);
		ctx.drawImage(video, 0, 0, width, height);
		const data = ctx.getImageData(0, 0, width, height).data;

		const cells = new Uint8Array(width * height);
		for (let c = 0; c < cells.length; c++) {
			const p = c * 4;
			const bright = luma(data[p] ?? 0, data[p + 1] ?? 0, data[p + 2] ?? 0);
			const on = invert ? bright < threshold : bright >= threshold;
			cells[c] = on ? 1 : 0;
		}
		frames.push(cells);
		options.onProgress?.(i + 1, total);
	}

	return { frames, width, height, fps };
}
