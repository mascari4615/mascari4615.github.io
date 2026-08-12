/**
 * 굽는 화면 — 영상 한 편을 흑백 격자 파일(.bab)로 굽고, 그 자리에서 바로 틀어 본다.
 *
 * 영상 파일은 여기 없다. 쓰는 사람이 자기 것을 고른다 — 브라우저 안에서만 처리하고
 * 아무 데도 안 올린다. (그래서 남의 영상을 이 저장소에 담을 일도 없다.)
 *
 * 미리보기가 두 종류인 이유: 이 시스템의 핵심 주장이 「같은 그림을 서로 다른 표면이
 * 동시에 나눠 그린다」다. 글자판 하나만 보여 주면 그냥 아스키 아트 도구로 보인다.
 */
import { decode, encode, Player, sampleVideo, TextSurface, DomTilesSurface } from 'badapple';
import { saveClip } from './shared';
import { t, loadNamespace } from '../lib/i18n';

/* 위젯이 아니라 셸·라이브러리 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 읽으므로 document 가 있을 때만. */
if (typeof document !== 'undefined') void loadNamespace('badapple');

(function (): void {
	const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

	let player: Player | null = null;
	let raf = 0;
	let baked: Uint8Array | null = null;

	function status(message: string): void {
		$('baStatus').textContent = message;
	}

	/**
	 * 구운 것을 홈이 이어받을 자리에 놓는다 (`shared.ts` — 바이트를 그대로 받는 자리).
	 *
	 * 담을 자리가 없어도 **굽는 것은 계속된다.** 못 담은 것을 굽기 실패로 보이게 하면,
	 * 방금 만든 것이 눈앞에 있는데 화면은 실패라고 말하는 상태가 된다. 사실대로 적는다.
	 */
	async function handOverToHome(bytes: Uint8Array): Promise<boolean> {
		return saveClip(bytes);
	}

	function stop(): void {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		player?.dispose();
		player = null;
	}

	/** 구운 것을 튼다. 시계는 화면 갱신에 맞춰 넣는다 — 재생기는 시계를 스스로 안 만든다. */
	function playBaked(bytes: Uint8Array): void {
		stop();
		const clip = decode(bytes);
		player = new Player(clip, { loop: true });

		// ① 글자판 — 자리를 신고하지 않으므로 전체 그림을 통째로 받는다 (거울)
		const pre = $('baText');
		player.stage.add(
			new TextSurface({
				cols: clip.width,
				rows: clip.height,
				on: '█',
				off: ' ',
				write: (text) => {
					pre.textContent = text;
				}
			})
		);

		// ② 화면에 실제로 있는 것들 — 자리를 신고하므로 그림의 자기 구역만 받는다 (모자이크).
		// 선택자를 안 준다: 무엇을 액정으로 쓸지는 화면을 재서 스스로 고른다.
		if ($<HTMLInputElement>('baOverlay').checked) {
			player.stage.add(new DomTilesSurface({ subdivide: { cols: 8, rows: 8 } }));
		}

		player.play(performance.now());
		const loop = (now: number): void => {
			player?.tick(now);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		status(t('badapple.playing', { w: clip.width, h: clip.height, frames: clip.frameCount, fps: clip.fps }));
	}

	async function bake(file: File): Promise<void> {
		stop();
		const video = document.createElement('video');
		video.muted = true;
		video.playsInline = true;
		video.src = URL.createObjectURL(file);

		await new Promise<void>((resolve, reject) => {
			video.addEventListener('loadedmetadata', () => resolve(), { once: true });
			video.addEventListener('error', () => reject(new Error(t('badapple.err.01'))), { once: true });
		});

		const width = Number($<HTMLInputElement>('baWidth').value) || 64;
		const height = Number($<HTMLInputElement>('baHeight').value) || 48;
		const fps = Number($<HTMLInputElement>('baFps').value) || 15;

		status(t('badapple.t02'));
		const sampled = await sampleVideo(video, {
			width,
			height,
			fps,
			threshold: Number($<HTMLInputElement>('baThreshold').value) || 128,
			invert: $<HTMLInputElement>('baInvert').checked,
			// 색을 담으면 실루엣 위에 평면이 얹힌다. 색을 못 쓰는 표면(파비콘·기계 부하)은
			// 그대로 실루엣만 읽으므로, 켜도 그쪽이 달라지지 않는다.
			levels: $<HTMLInputElement>('baColor').checked,
			colors: $<HTMLInputElement>('baColor').checked,
			onProgress: (done, total) => {
				if (done % 5 === 0 || done === total) status(t('badapple.baking', { pct: Math.round((done / total) * 100) }));
			}
		});

		URL.revokeObjectURL(video.src);

		baked = encode(
			sampled.frames,
			{ width: sampled.width, height: sampled.height, fps: sampled.fps },
			{ levels: sampled.levels, colors: sampled.colors }
		);
		const raw = sampled.frames.length * Math.ceil((width * height) / 8);
		const handed = await handOverToHome(baked);
		status(
			t('badapple.baked', { size: (baked.length / 1024).toFixed(1), raw: (raw / 1024).toFixed(1) }) +
				(handed ? t('badapple.t03') : t('badapple.t04'))
		);
		$<HTMLButtonElement>('baSave').disabled = false;
		playBaked(baked);
	}

	$('baPick').addEventListener('click', () => $<HTMLInputElement>('baFile').click());
	$('baFile').addEventListener('change', (event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		bake(file).catch((error: unknown) => status(error instanceof Error ? error.message : t('badapple.t05')));
	});

	$('baSave').addEventListener('click', () => {
		if (!baked) return;
		const url = URL.createObjectURL(new Blob([baked as unknown as BlobPart], { type: 'application/octet-stream' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = 'clip.bab';
		a.click();
		URL.revokeObjectURL(url);
	});

	$('baStop').addEventListener('click', () => {
		stop();
		status(t('badapple.t06'));
	});

	$('baOverlay').addEventListener('change', () => {
		if (baked) playBaked(baked);
	});
})();
