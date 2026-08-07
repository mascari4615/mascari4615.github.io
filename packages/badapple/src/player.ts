/**
 * 재생기 — 시계를 보고 「지금 몇 번째 그림인지」를 정해서 무대에 넘긴다.
 *
 * 시계를 스스로 만들지 않는다. 브라우저면 화면 갱신에 맞춰, 서버면 타이머로, 시험에서는
 * 손으로 시각을 넣어 돌린다 — 그래야 시간이 걸린 동작을 **기다리지 않고** 시험할 수 있다.
 * (`requestAnimationFrame` 을 안에 박아 두면 브라우저 밖에선 아무것도 시험할 수 없다.)
 */

import type { Clip } from './format.js';
import { Stage, type Frame } from './stage.js';

export interface PlayerOptions {
	/** 끝나면 처음으로 되감아 계속. 기본 true — 배경으로 트는 게 기본 쓰임새다. */
	loop?: boolean;
	/** 배속. 1 = 원래 속도. */
	rate?: number;
}

export class Player {
	readonly stage = new Stage();

	private playing = false;
	/** 재생 시작 기준 시각 (넣어 준 시계 기준). */
	private originMs = 0;
	/** 멈춰 있는 동안 유지할 재생 위치(초). */
	private heldSec = 0;
	private lastIndex = -1;
	private loopEnabled: boolean;
	private rateValue: number;

	constructor(private readonly clip: Clip, options: PlayerOptions = {}) {
		this.loopEnabled = options.loop ?? true;
		this.rateValue = options.rate ?? 1;
	}

	get isPlaying(): boolean {
		return this.playing;
	}

	get durationSec(): number {
		return this.clip.frameCount / Math.max(0.1, this.clip.fps);
	}

	/** 지금 재생 위치(초). */
	get positionSec(): number {
		return this.heldSec;
	}

	set loop(value: boolean) {
		this.loopEnabled = value;
	}

	set rate(value: number) {
		// 배속을 바꾸면 기준 시각도 옮겨야 지금 자리에서 이어진다.
		this.rateValue = Math.max(0.01, value);
	}

	/** @param nowMs 시계 값. 부르는 쪽이 준다. */
	play(nowMs: number): void {
		if (this.playing) return;
		this.playing = true;
		this.originMs = nowMs - (this.heldSec * 1000) / this.rateValue;
	}

	pause(nowMs: number): void {
		if (!this.playing) return;
		this.heldSec = this.positionAt(nowMs);
		this.playing = false;
	}

	/** 그 자리로 옮긴다. 재생 중이면 거기서부터 이어진다. */
	seek(sec: number, nowMs: number): void {
		const clamped = Math.max(0, Math.min(this.durationSec, sec));
		this.heldSec = clamped;
		this.lastIndex = -1;
		if (this.playing) this.originMs = nowMs - (clamped * 1000) / this.rateValue;
	}

	private positionAt(nowMs: number): number {
		const elapsed = ((nowMs - this.originMs) * this.rateValue) / 1000;
		const total = this.durationSec;
		if (total <= 0) return 0;
		if (elapsed < total) return Math.max(0, elapsed);
		if (!this.loopEnabled) return total;
		return elapsed % total;
	}

	/**
	 * 한 번 그린다. 부르는 쪽이 시계 값을 준다.
	 * @returns 이번에 그림을 새로 뿌렸으면 true (같은 프레임이면 건너뛴다)
	 */
	tick(nowMs: number): boolean {
		if (!this.playing) return false;

		const sec = this.positionAt(nowMs);
		this.heldSec = sec;

		if (!this.loopEnabled && sec >= this.durationSec) {
			this.playing = false;
		}

		const index = Math.min(this.clip.frameCount - 1, Math.floor(sec * this.clip.fps));
		if (index === this.lastIndex) return false;
		this.lastIndex = index;

		const frame: Frame = {
			width: this.clip.width,
			height: this.clip.height,
			cells: this.clip.frame(index)
		};
		this.stage.present(frame);
		return true;
	}

	/** 재생을 접고 붙어 있던 표면들을 원래대로 되돌린다. */
	dispose(): void {
		this.playing = false;
		this.stage.clear();
	}
}
