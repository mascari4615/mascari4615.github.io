/**
 * `.bab` — 흑백 프레임 묶음 한 파일.
 *
 * 왜 자체 형식인가: 영상 파일을 그대로 쓰면 「화면 아닌 것을 화면으로 쓴다」가 성립하지 않는다.
 * 재생기가 브라우저의 영상 재생 능력에 기대는 순간, 도구 타일도 파비콘도 그냥 영상 위젯이 된다.
 * 여기서 원하는 것은 **프레임마다 켜짐/꺼짐 격자 하나**뿐이다. 그거면 어떤 표면에도 꽂힌다.
 *
 * 담는 방식:
 *   - 한 칸 = 1비트 (켜짐/꺼짐). 색도 회색도 없다 — 실루엣이 원본 밈의 몸통이다.
 *   - 프레임마다 **연속 구간 길이**만 적는다(런렝스). 실루엣은 넓은 면이 이어져서 이게 제일 짧다.
 *   - 앞 프레임과 **달라진 칸만** 적는 방식(델타)도 같이 재고, 둘 중 짧은 쪽을 고른다.
 *     실루엣 영상은 대부분 프레임이 거의 안 변해서 델타가 압도적으로 짧다.
 *   - 되감기·건너뛰기를 위해 일정 간격마다 **통째 프레임**(열쇠 프레임)을 강제로 넣는다.
 *     안 그러면 3분짜리에서 뒤로 가려고 처음부터 다 풀어야 한다.
 *
 * 바이트 순서 = 리틀 엔디언. 숫자는 대부분 varint(LEB128) — 구간 길이가 대개 작아서다.
 */

export const MAGIC = 0x31424142; // 'BAB1' (리틀 엔디언으로 읽었을 때)

/** 프레임 한 장의 종류. */
const KEY = 0;
const DELTA = 1;

export interface ClipMeta {
	/** 가로 칸 수. */
	width: number;
	/** 세로 칸 수. */
	height: number;
	/** 초당 프레임. 소수 한 자리까지 담는다 (29.97 → 30.0 으로 반올림되니 인코더가 정해 넣는다). */
	fps: number;
	/** 총 프레임 수. */
	frameCount: number;
}

/**
 * 푼 상태의 클립. 프레임은 `width*height` 짜리 0/1 바이트 배열로 나온다.
 * (비트로 촘촘히 담지 않는 이유 = 표면마다 칸 하나씩 읽어 가므로 바이트가 다루기 쉽고,
 *  64×48 이면 3KB 라 메모리도 문제가 안 된다.)
 */
export interface Clip extends ClipMeta {
	/** i 번째 프레임. 범위 밖이면 처음/끝으로 물린다. */
	frame(i: number): Uint8Array;
}

// ── varint ───────────────────────────────────────────────────────────────────

function pushVarint(out: number[], value: number): void {
	let v = value >>> 0;
	while (v >= 0x80) {
		out.push((v & 0x7f) | 0x80);
		v >>>= 7;
	}
	out.push(v);
}

class Reader {
	private pos = 0;
	constructor(private readonly bytes: Uint8Array) {}

	get offset(): number {
		return this.pos;
	}

	seek(offset: number): void {
		this.pos = offset;
	}

	u8(): number {
		const v = this.bytes[this.pos];
		if (v === undefined) throw new Error('bab: 파일이 중간에 끊겼다');
		this.pos += 1;
		return v;
	}

	varint(): number {
		let result = 0;
		let shift = 0;
		for (;;) {
			const byte = this.u8();
			result |= (byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) return result >>> 0;
			shift += 7;
			if (shift > 35) throw new Error('bab: 숫자가 너무 길다 — 파일이 깨졌다');
		}
	}
}

// ── 굽기 (인코드) ─────────────────────────────────────────────────────────────

/** 한 프레임을 런렝스로. 항상 「꺼짐」 구간부터 센다 (첫 구간이 0 길이일 수 있다). */
function rle(frame: Uint8Array, out: number[]): void {
	let expect = 0;
	let run = 0;
	for (let i = 0; i < frame.length; i++) {
		const on = frame[i] ? 1 : 0;
		if (on === expect) {
			run += 1;
		} else {
			pushVarint(out, run);
			expect = on;
			run = 1;
		}
	}
	pushVarint(out, run);
}

/** 앞 프레임과 XOR — 달라진 칸만 1 로 남는다. 그걸 다시 런렝스로 줄인다. */
function xor(prev: Uint8Array, next: Uint8Array): Uint8Array {
	const diff = new Uint8Array(next.length);
	for (let i = 0; i < next.length; i++) diff[i] = (prev[i] ?? 0) ^ (next[i] ?? 0);
	return diff;
}

export interface EncodeOptions {
	/** 몇 프레임마다 통째 프레임을 강제로 넣을지 (되감기 비용). 기본 60. */
	keyframeInterval?: number;
}

/**
 * 0/1 프레임 목록 → `.bab` 바이트.
 * @param frames 각 원소가 `width*height` 길이의 0/1 배열
 */
export function encode(frames: readonly Uint8Array[], meta: Omit<ClipMeta, 'frameCount'>, options: EncodeOptions = {}): Uint8Array {
	const keyframeInterval = Math.max(1, options.keyframeInterval ?? 60);
	const cells = meta.width * meta.height;
	if (cells <= 0) throw new Error('bab: 크기가 0 이다');

	const header = new Uint8Array(16);
	const view = new DataView(header.buffer);
	view.setUint32(0, MAGIC, true);
	view.setUint16(4, meta.width, true);
	view.setUint16(6, meta.height, true);
	view.setUint16(8, Math.round(meta.fps * 10), true);
	view.setUint32(10, frames.length, true);
	view.setUint16(14, 0, true); // 여유 칸 — 나중에 회색 단계 같은 걸 넣을 자리

	const body: number[] = [];
	let prev: Uint8Array | null = null;

	for (let i = 0; i < frames.length; i++) {
		const frame = frames[i];
		if (!frame || frame.length !== cells) throw new Error(`bab: ${i} 번째 프레임 크기가 안 맞는다`);

		const asKey: number[] = [];
		rle(frame, asKey);

		let chosen = asKey;
		let kind = KEY;
		if (prev && i % keyframeInterval !== 0) {
			const asDelta: number[] = [];
			rle(xor(prev, frame), asDelta);
			if (asDelta.length < asKey.length) {
				chosen = asDelta;
				kind = DELTA;
			}
		}

		const payload: number[] = [];
		pushVarint(payload, chosen.length + 1); // 이 프레임이 차지하는 바이트 수 (종류 1바이트 포함)
		payload.push(kind);
		for (const b of chosen) payload.push(b);
		for (const b of payload) body.push(b);

		prev = frame;
	}

	const out = new Uint8Array(header.length + body.length);
	out.set(header, 0);
	out.set(Uint8Array.from(body), header.length);
	return out;
}

// ── 풀기 (디코드) ─────────────────────────────────────────────────────────────

/**
 * 런렝스 구간을 프레임 버퍼에 되쓴다.
 *
 * 멈추는 조건이 **프레임이 다 찼을 때**여야 한다. 예전엔 「다음 프레임 시작까지 읽기」로 했는데,
 * 그 사이에 다음 프레임의 길이 숫자가 끼어 있어 몇 바이트를 더 읽고 넘쳤다. 담긴 칸 수가
 * 곧 끝이라는 게 이 형식의 진짜 규약이다.
 */
function unrle(reader: Reader, end: number, into: Uint8Array): void {
	let pos = 0;
	let value = 0;
	while (pos < into.length) {
		if (reader.offset >= end) throw new Error('bab: 프레임이 다 안 찼다 — 파일이 깨졌다');
		const run = reader.varint();
		if (pos + run > into.length) throw new Error('bab: 구간이 프레임을 넘친다 — 파일이 깨졌다');
		if (value) into.fill(1, pos, pos + run);
		else into.fill(0, pos, pos + run);
		pos += run;
		value ^= 1;
	}
	if (pos !== into.length) throw new Error('bab: 프레임이 다 안 찼다 — 파일이 깨졌다');
}

/**
 * `.bab` 바이트 → 클립.
 *
 * 프레임 시작 위치를 미리 훑어 표로 만든다(파일당 한 번). 그래야 아무 데나 건너뛸 수 있다.
 * 프레임 자체는 **부를 때** 푼다 — 3분짜리를 통째로 메모리에 펴 두지 않는다.
 */
export function decode(bytes: Uint8Array): Clip {
	if (bytes.length < 16) throw new Error('bab: 파일이 너무 짧다');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== MAGIC) throw new Error('bab: 이 파일은 bab 형식이 아니다');

	const width = view.getUint16(4, true);
	const height = view.getUint16(6, true);
	const fps = view.getUint16(8, true) / 10;
	const frameCount = view.getUint32(10, true);
	const cells = width * height;

	// 프레임 목차: [시작오프셋, 끝오프셋, 종류] — 되감기 때 어느 열쇠 프레임부터 풀지 여기서 본다.
	// 끝을 따로 담는다. 「다음 프레임 시작」으로 대신하면 그 사이의 길이 숫자까지 읽어 넘친다.
	const offsets = new Int32Array(frameCount);
	const ends = new Int32Array(frameCount);
	const kinds = new Uint8Array(frameCount);
	{
		const scan = new Reader(bytes);
		scan.seek(16);
		for (let i = 0; i < frameCount; i++) {
			const size = scan.varint();
			offsets[i] = scan.offset;
			ends[i] = scan.offset + size;
			kinds[i] = scan.u8();
			scan.seek(scan.offset + size - 1);
		}
	}

	// 바로 앞 프레임을 들고 있으면 이어보기는 한 장만 풀면 된다.
	let cachedIndex = -1;
	let cached = new Uint8Array(cells);
	const scratch = new Uint8Array(cells);

	function decodeInto(i: number, into: Uint8Array): void {
		const start = offsets[i];
		const end = ends[i];
		if (start === undefined || end === undefined) throw new Error('bab: 목차가 깨졌다');
		const reader = new Reader(bytes);
		reader.seek(start + 1); // 종류 1바이트 건너뜀
		if (kinds[i] === KEY) {
			unrle(reader, end, into);
		} else {
			unrle(reader, end, scratch);
			for (let c = 0; c < cells; c++) into[c] = (into[c] ?? 0) ^ (scratch[c] ?? 0);
		}
	}

	function frame(index: number): Uint8Array {
		let i = index;
		if (!Number.isFinite(i)) i = 0;
		i = Math.max(0, Math.min(frameCount - 1, Math.trunc(i)));
		if (i === cachedIndex) return cached;

		// 이어보기(바로 다음 장)면 델타 한 번이면 된다.
		if (i === cachedIndex + 1 && kinds[i] === DELTA) {
			decodeInto(i, cached);
			cachedIndex = i;
			return cached;
		}

		// 아니면 가장 가까운 앞쪽 열쇠 프레임부터 따라 온다.
		let start = i;
		while (start > 0 && kinds[start] !== KEY) start -= 1;
		const buffer = new Uint8Array(cells);
		for (let c = start; c <= i; c++) decodeInto(c, buffer);
		cached = buffer;
		cachedIndex = i;
		return cached;
	}

	return { width, height, fps, frameCount, frame };
}
