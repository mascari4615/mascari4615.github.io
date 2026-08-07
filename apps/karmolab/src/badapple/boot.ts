/**
 * 홈 화면 스위치 (TASK-KL-131).
 *
 * 화면을 바꾸지 않는다. 평소엔 아무 흔적도 없고, 켜면 **지금 화면에 있는 것들이 그대로 액정이 된다.**
 * 어떤 칸을 쓸지는 이름으로 안 찾는다 — 모양으로 스스로 고른다. 그래서 도구가 늘거나 줄거나
 * 화면을 개편해도 이 파일은 손댈 일이 없다.
 *
 * 켜는 법 두 가지:
 *   - 주소 뒤에 `?badapple` — 남에게 보여 줄 때
 *   - 위·위·아래·아래·왼·오·왼·오·B·A — 아는 사람만
 * 끄는 법: Esc, 또는 같은 순서를 다시.
 *
 * 트는 영상: 굽는 화면에서 구운 게 있으면 **그것**, 없으면 기본 도형 클립.
 * 남의 영상을 담아 두지 않는다.
 */
import { decode, DomTilesSurface, Player, TextSurface } from 'badapple';
import { CLIP_STORAGE_KEY } from './shared';

const KONAMI = [
	'ArrowUp',
	'ArrowUp',
	'ArrowDown',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'ArrowLeft',
	'ArrowRight',
	'b',
	'a'
];

(function (): void {
	let player: Player | null = null;
	let raf = 0;
	let progress = 0;

	function base64ToBytes(text: string): Uint8Array {
		const binary = atob(text);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	}

	/** 구운 게 있으면 그것, 없으면 기본 도형. 둘 다 실패하면 조용히 포기한다(장난이 사이트를 막으면 안 된다). */
	async function loadClip(): Promise<Uint8Array | null> {
		try {
			const stored = localStorage.getItem(CLIP_STORAGE_KEY);
			if (stored) return base64ToBytes(stored);
		} catch {
			// 저장 공간을 막아 둔 브라우저 — 기본 클립으로 간다.
		}
		try {
			const response = await fetch('/apps/karmolab/data/badapple/demo.bab');
			if (!response.ok) return null;
			return new Uint8Array(await response.arrayBuffer());
		} catch {
			return null;
		}
	}

	function stop(): void {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		player?.dispose();
		player = null;
		document.documentElement.removeAttribute('data-badapple');
	}

	async function start(): Promise<void> {
		if (player) return;
		const bytes = await loadClip();
		if (!bytes) return;

		let clip;
		try {
			clip = decode(bytes);
		} catch {
			// 저장된 것이 깨졌으면 지우고 만다 — 다음엔 기본 클립이 뜬다.
			try {
				localStorage.removeItem(CLIP_STORAGE_KEY);
			} catch {
				/* 지울 수 없어도 그냥 넘어간다 */
			}
			return;
		}

		player = new Player(clip, { loop: true });
		// 화면에 실제로 있는 것들을 액정으로 (모양으로 스스로 고른다).
		player.stage.add(new DomTilesSurface({ subdivide: { cols: 6, rows: 6 } }));
		// 탭 제목도 같은 그림을 받는다. 한 줄뿐이라 칸마다 「얼마나 찼나」를 글자 굵기로 낸다 —
		// 켜짐/꺼짐으로 누르면 아래가 꽉 찬 영상에서 제목이 아예 안 움직인다.
		player.stage.add(
			new TextSurface({
				cols: 24,
				rows: 12,
				ramp: ' ▁▂▃▄▅▆▇█',
				write: (text) => {
					document.title = text;
				}
			})
		);

		document.documentElement.setAttribute('data-badapple', 'on');
		player.play(performance.now());
		const tick = (now: number): void => {
			player?.tick(now);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	}

	function toggle(): void {
		if (player) stop();
		else void start();
	}

	window.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && player) {
			stop();
			return;
		}
		// 글을 쓰는 중이면 끼어들지 않는다.
		const target = event.target as HTMLElement | null;
		if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;

		const expected = KONAMI[progress];
		if (expected && event.key.toLowerCase() === expected.toLowerCase()) {
			progress += 1;
			if (progress === KONAMI.length) {
				progress = 0;
				toggle();
			}
		} else {
			// 첫 글자부터 다시 — 틀린 그 키가 시작일 수도 있다.
			progress = KONAMI[0] && event.key.toLowerCase() === KONAMI[0].toLowerCase() ? 1 : 0;
		}
	});

	if (new URLSearchParams(location.search).has('badapple')) void start();
})();
