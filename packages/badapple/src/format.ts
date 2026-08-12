/**
 * `.bab` — 흑백 프레임 묶음 한 파일.
 *
 * 왜 자체 형식인가: 영상 파일을 그대로 쓰면 「화면 아닌 것을 화면으로 쓴다」가 성립하지 않는다.
 * 재생기가 브라우저의 영상 재생 능력에 기대는 순간, 도구 타일도 파비콘도 그냥 영상 위젯이 된다.
 * 여기서 원하는 것은 **프레임마다 켜짐/꺼짐 격자 하나**뿐이다. 그거면 어떤 표면에도 꽂힌다.
 *
 * 담는 방식:
 *   - 한 칸 = 1비트 (켜짐/꺼짐). 실루엣이 원본 밈의 몸통이고, 모든 표면이 읽을 수 있는 최소 공통분모다.
 *   - 프레임마다 **연속 구간 길이**만 적는다(런렝스). 실루엣은 넓은 면이 이어져서 이게 제일 짧다.
 *   - 앞 프레임과 **달라진 칸만** 적는 방식(델타)도 같이 재고, 둘 중 짧은 쪽을 고른다.
 *     실루엣 영상은 대부분 프레임이 거의 안 변해서 델타가 압도적으로 짧다.
 *   - 되감기·건너뛰기를 위해 일정 간격마다 **통째 프레임**(열쇠 프레임)을 강제로 넣는다.
 *     안 그러면 3분짜리에서 뒤로 가려고 처음부터 다 풀어야 한다.
 *
 * **계조·색은 덧붙는 평면이다** (TASK-KL-244). 1비트 실루엣은 그대로 두고, 프레임 뒤에 밝기
 * 평면(칸당 0~255)과 색 평면(칸당 R·G·B)을 *선택적으로* 잇는다. 이렇게 나눈 이유:
 *   - 표면 계약(`surface.ts`)은 켜짐/꺼짐 두 개뿐이다. 색을 실루엣 자리에 섞으면 파비콘·부하
 *     표면처럼 색을 못 쓰는 표면이 전부 깨진다. 색을 *모르는* 표면은 지금처럼 실루엣만 읽으면 된다.
 *   - 프레임 길이(`size`)가 평면까지 덮으므로, **색을 모르는 옛 재생기가 새 파일을 열어도**
 *     실루엣만 그리고 평면은 조용히 건너뛴다. 파일 하나로 둘 다 산다.
 * 평면은 채널마다 따로 담는다(R·G·B 각각) — 한 채널 안은 값이 부드럽게 이어져서 훨씬 짧아진다.
 *
 * 바이트 순서 = 리틀 엔디언. 숫자는 대부분 varint(LEB128) — 구간 길이가 대개 작아서다.
 */

export const MAGIC = 0x31424142; // 'BAB1' (리틀 엔디언으로 읽었을 때)

/** 프레임 한 장의 종류. */
const KEY = 0;
const DELTA = 1;

/** 헤더 여유 칸(오프셋 14)에 담기는 깃발 — 이 파일에 어떤 평면이 붙어 있나. */
export const FLAG_LEVELS = 1 << 0;
export const FLAG_COLORS = 1 << 1;

/** 평면 한 장을 담는 방식. */
const PLANE_KEY = 0;
const PLANE_DELTA = 1;
const PLANE_SAME = 2;

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
	/** 이 클립에 밝기 평면이 붙어 있나. */
	hasLevels?: boolean;
	/** 이 클립에 색 평면이 붙어 있나. */
	hasColors?: boolean;
	/** i 번째 프레임의 밝기 평면 (`width*height`, 0~255). 없으면 `null`. */
	levels?(i: number): Uint8Array | null;
	/** i 번째 프레임의 색 평면 (`width*height*3`, R·G·B 순). 없으면 `null`. */
	colors?(i: number): Uint8Array | null;
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

/** 색 평면(RGB 섞임)에서 한 채널만 뽑는다. */
function channelOf(plane: Uint8Array, ch: number, cells: number): Uint8Array {
	const out = new Uint8Array(cells);
	for (let c = 0; c < cells; c++) out[c] = plane[c * 3 + ch] ?? 0;
	return out;
}

/** 앞 프레임과 XOR — 달라진 칸만 1 로 남는다. 그걸 다시 런렝스로 줄인다. */
function xor(prev: Uint8Array, next: Uint8Array): Uint8Array {
	const diff = new Uint8Array(next.length);
	for (let i = 0; i < next.length; i++) diff[i] = (prev[i] ?? 0) ^ (next[i] ?? 0);
	return diff;
}

// ── 평면 (밝기·색) ─────────────────────────────────────────

/**
 * 바이트 평면 한 장 → 바이트열. 세 방식을 다 재 보고 **제일 짧은 것**을 고른다.
 *
 * 실루엣과 달리 평면은 값이 0/1 이 아니라 0~255 다. 그래서 「구간 길이만」으로는 안 되고
 * 값도 같이 적어야 한다. 대신 축소된 격자에서는 이웃 칸이 거의 같은 값이라 구간이 길게 나온다.
 *
 *   - `PLANE_SAME`  앞 프레임과 한 칸도 안 달라졌다 (정지 화면·검은 띠에서 흔하다)
 *   - `PLANE_DELTA` 달라진 구역만: 건너뛸 칸 수 → 고칠 칸 수 → 그 구간을 런렝스로
 *   - `PLANE_KEY`   통째로 런렝스
 *
 * 앞이 `null`(열쇠 프레임)이면 무조건 `PLANE_KEY` — 되감기가 여기서 시작하기 때문이다.
 */
function encodePlane(plane: Uint8Array, prev: Uint8Array | null, forceKey: boolean): number[] {
	const asKey: number[] = [];
	rleBytes(plane, 0, plane.length, asKey);

	if (forceKey || !prev) return [PLANE_KEY, ...asKey];

	let same = true;
	for (let i = 0; i < plane.length; i++) {
		if (plane[i] !== prev[i]) {
			same = false;
			break;
		}
	}
	if (same) return [PLANE_SAME];

	const asDelta: number[] = [];
	let i = 0;
	while (i < plane.length) {
		let skip = 0;
		while (i + skip < plane.length && plane[i + skip] === prev[i + skip]) skip += 1;
		if (i + skip >= plane.length) break;
		let run = 0;
		while (i + skip + run < plane.length && plane[i + skip + run] !== prev[i + skip + run]) run += 1;
		pushVarint(asDelta, skip);
		pushVarint(asDelta, run);
		rleBytes(plane, i + skip, i + skip + run, asDelta);
		i += skip + run;
	}

	return asDelta.length + 1 < asKey.length ? [PLANE_DELTA, ...asDelta] : [PLANE_KEY, ...asKey];
}

/** `[from, to)` 구간을 (구간 길이, 값) 짝으로. */
function rleBytes(plane: Uint8Array, from: number, to: number, out: number[]): void {
	let i = from;
	while (i < to) {
		const value = plane[i] ?? 0;
		let run = 1;
		while (i + run < to && plane[i + run] === value) run += 1;
		pushVarint(out, run);
		out.push(value);
		i += run;
	}
}

/** `[from, to)` 를 런렝스에서 되쓴다. */
function unrleBytes(reader: Reader, from: number, to: number, into: Uint8Array): void {
	let pos = from;
	while (pos < to) {
		const run = reader.varint();
		const value = reader.u8();
		if (run <= 0) throw new Error('bab: 평면 구간이 0 이다 — 파일이 깨졌다');
		if (pos + run > to) throw new Error('bab: 평면 구간이 넘쳤다 — 파일이 깨졌다');
		into.fill(value, pos, pos + run);
		pos += run;
	}
}

/** 평면 한 장을 `into` 에 푼다. 델타면 `into` 에 이미 앞 프레임이 들어 있어야 한다. */
function decodePlane(reader: Reader, end: number, into: Uint8Array): void {
	const mode = reader.u8();
	if (mode === PLANE_SAME) return;
	if (mode === PLANE_KEY) {
		unrleBytes(reader, 0, into.length, into);
		return;
	}
	if (mode !== PLANE_DELTA) throw new Error('bab: 모르는 평면 방식이다');
	let pos = 0;
	while (reader.offset < end && pos < into.length) {
		const skip = reader.varint();
		const run = reader.varint();
		pos += skip;
		if (pos + run > into.length) throw new Error('bab: 평면 구간이 프레임을 넘친다');
		unrleBytes(reader, pos, pos + run, into);
		pos += run;
	}
}

export interface EncodeOptions {
	/** 몇 프레임마다 통째 프레임을 강제로 넣을지 (되감기 비용). 기본 60. */
	keyframeInterval?: number;
	/**
	 * 프레임마다의 밝기 평면 (`width*height`, 0~255). 주면 파일에 같이 담긴다.
	 * 실루엣만 읽는 표면은 이걸 몰라도 되고, 아스키 아트처럼 계조가 필요한 쪽만 읽는다.
	 */
	levels?: readonly Uint8Array[];
	/** 프레임마다의 색 평면 (`width*height*3`, R·G·B 순). */
	colors?: readonly Uint8Array[];
}

/**
 * 0/1 프레임 목록 → `.bab` 바이트.
 * @param frames 각 원소가 `width*height` 길이의 0/1 배열
 */
export function encode(frames: readonly Uint8Array[], meta: Omit<ClipMeta, 'frameCount'>, options: EncodeOptions = {}): Uint8Array {
	const keyframeInterval = Math.max(1, options.keyframeInterval ?? 60);
	const cells = meta.width * meta.height;
	if (cells <= 0) throw new Error('bab: 크기가 0 이다');

	// 평면은 프레임 수가 맞을 때만 담는다 — 반쯤 담긴 평면은 재생 중에 조용히 어긋난다.
	const levels = options.levels && options.levels.length === frames.length ? options.levels : null;
	const colors = options.colors && options.colors.length === frames.length ? options.colors : null;
	const flags = (levels ? FLAG_LEVELS : 0) | (colors ? FLAG_COLORS : 0);

	const header = new Uint8Array(16);
	const view = new DataView(header.buffer);
	view.setUint32(0, MAGIC, true);
	view.setUint16(4, meta.width, true);
	view.setUint16(6, meta.height, true);
	view.setUint16(8, Math.round(meta.fps * 10), true);
	view.setUint32(10, frames.length, true);
	view.setUint16(14, flags, true); // 어떤 평면이 붙어 있나

	const body: number[] = [];
	let prev: Uint8Array | null = null;
	let prevLevel: Uint8Array | null = null;
	let prevColor: Uint8Array | null = null;

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

		// 평면은 실루엣이 열쇠 프레임일 때 같이 열쇠로 간다 — 되감기가 실루엣 열쇠를 기준으로
		// 거슬러 오르므로, 평면만 델타로 남으면 건너뛴 자리에서 색이 어긋난다.
		const forceKey = kind === KEY;
		const planes: number[] = [];
		if (levels) {
			const plane = levels[i];
			if (!plane || plane.length !== cells) throw new Error(`bab: ${i} 번째 밝기 평면 크기가 안 맞는다`);
			const encoded = encodePlane(plane, forceKey ? null : prevLevel, forceKey);
			pushVarint(planes, encoded.length);
			for (const b of encoded) planes.push(b);
			prevLevel = plane;
		}
		if (colors) {
			const plane = colors[i];
			if (!plane || plane.length !== cells * 3) throw new Error(`bab: ${i} 번째 색 평면 크기가 안 맞는다`);
			// 채널마다 따로 — 한 채널 안은 값이 부드럽게 이어져 훨씬 짧아진다.
			for (let ch = 0; ch < 3; ch++) {
				const channel = new Uint8Array(cells);
				for (let c = 0; c < cells; c++) channel[c] = plane[c * 3 + ch] ?? 0;
				const before = forceKey || !prevColor ? null : channelOf(prevColor, ch, cells);
				const encoded = encodePlane(channel, before, forceKey);
				pushVarint(planes, encoded.length);
				for (const b of encoded) planes.push(b);
			}
			prevColor = plane;
		}

		const payload: number[] = [];
		// 이 프레임이 차지하는 바이트 수 (종류 1바이트 + 실루엣 + 평면 전부).
		// 평면까지 덮어야 색을 모르는 옛 재생기가 통째로 건너뛸 수 있다.
		pushVarint(payload, chosen.length + 1 + planes.length);
		payload.push(kind);
		for (const b of chosen) payload.push(b);
		for (const b of planes) payload.push(b);
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
	const flags = view.getUint16(14, true);
	const hasLevels = (flags & FLAG_LEVELS) !== 0;
	const hasColors = (flags & FLAG_COLORS) !== 0;
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
	// 평면도 같은 자리에 같이 들고 있어야 한다 — 실루엣만 앞서 가면 색이 한 장 밀린다.
	let cachedIndex = -1;
	let cached = new Uint8Array(cells);
	let cachedLevels = hasLevels ? new Uint8Array(cells) : null;
	let cachedColors = hasColors ? new Uint8Array(cells * 3) : null;
	const scratch = new Uint8Array(cells);
	const channel = new Uint8Array(cells);

	function decodeInto(i: number, into: Uint8Array, levelsInto: Uint8Array | null, colorsInto: Uint8Array | null): void {
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

		// 평면은 실루엣 바로 뒤에 길이가 앞선 채로 이어 붙어 있다. 안 읽어도 프레임 목차가
		// 통째 길이를 들고 있으므로, 색을 안 쓰는 쪽은 여기 오지 않고 그냥 지나간다.
		if (hasLevels) {
			const size = reader.varint();
			const stop = reader.offset + size;
			if (levelsInto) decodePlane(reader, stop, levelsInto);
			reader.seek(stop);
		}
		if (hasColors) {
			for (let ch = 0; ch < 3; ch++) {
				const size = reader.varint();
				const stop = reader.offset + size;
				if (colorsInto) {
					for (let c = 0; c < cells; c++) channel[c] = colorsInto[c * 3 + ch] ?? 0;
					decodePlane(reader, stop, channel);
					for (let c = 0; c < cells; c++) colorsInto[c * 3 + ch] = channel[c] ?? 0;
				}
				reader.seek(stop);
			}
		}
	}

	function seekTo(index: number): void {
		let i = index;
		if (!Number.isFinite(i)) i = 0;
		i = Math.max(0, Math.min(frameCount - 1, Math.trunc(i)));
		if (i === cachedIndex) return;

		// 이어보기(바로 다음 장)면 델타 한 번이면 된다.
		if (i === cachedIndex + 1 && kinds[i] === DELTA) {
			decodeInto(i, cached, cachedLevels, cachedColors);
			cachedIndex = i;
			return;
		}

		// 아니면 가장 가까운 앞쪽 열쇠 프레임부터 따라 온다.
		let start = i;
		while (start > 0 && kinds[start] !== KEY) start -= 1;
		const buffer = new Uint8Array(cells);
		const levelBuffer = hasLevels ? new Uint8Array(cells) : null;
		const colorBuffer = hasColors ? new Uint8Array(cells * 3) : null;
		for (let c = start; c <= i; c++) decodeInto(c, buffer, levelBuffer, colorBuffer);
		cached = buffer;
		cachedLevels = levelBuffer;
		cachedColors = colorBuffer;
		cachedIndex = i;
	}

	function frame(index: number): Uint8Array {
		seekTo(index);
		return cached;
	}

	function levels(index: number): Uint8Array | null {
		if (!hasLevels) return null;
		seekTo(index);
		return cachedLevels;
	}

	function colors(index: number): Uint8Array | null {
		if (!hasColors) return null;
		seekTo(index);
		return cachedColors;
	}

	return { width, height, fps, frameCount, frame, levels, colors, hasLevels, hasColors };
}
