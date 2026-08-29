/**
 * APNG 라이터. 움직이는 PNG 한 장
 *
 * 왜 새로 쓰나: 저장소에 GIF 인코더는 있지만 APNG 를 쓰는 것이 없었다. GIF 는 색이 256개고
 * 투명이 켜짐/꺼짐 둘뿐이라 반투명 가장자리가 계단이 된다. Discord 스티커(320x320, 512KB)가
 * 요구하는 형식이 APNG. 이모트는 투명 가장자리가 곧 품질
 *
 * 압축은 브라우저의 `CompressionStream('deflate')` 몫. zlib 을 손으로 안 씀.
 * Node 18+ 에도 같은 이름이라 검사도 같은 길.
 *
 * 이 파일은 **브라우저를 모른다**. `document`, `canvas` 를 안 쓰고 픽셀을 `Uint8ClampedArray`
 * (RGBA, straight alpha) 로 받음. 먹의 다른 core 파일과 같은 규칙.
 */

export interface ApngFrame {
  /** RGBA 8비트. 길이는 `width * height * 4`. */
  data: Uint8ClampedArray;
  /** 이 장을 얼마나 보여 줄지(ms). */
  delayMs: number;
}

export interface ApngOptions {
  width: number;
  height: number;
  frames: ApngFrame[];
  /** 0 이면 끝없이 반복. */
  plays?: number;
  /** 0~1. 장수가 많으면 굽는 동안 화면이 멈춘 것처럼 보이지 않게 한다. */
  onProgress?: (ratio: number) => void;
}

/* CRC32. PNG 청크마다 붙는다. 표는 한 번만 만든다. */
let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 청크 하나. 길이 + 이름 + 알맹이 + CRC. */
function chunk(name: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = name.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
  return out;
}

/**
 * 한 장을 PNG 스캔라인으로. 줄마다 앞에 필터 번호
 *
 * 필터는 줄마다 None(0)과 Up(2) 중 **덜 튀는 쪽**을 고른다. 이모트는 배경이 넓게 비어 있어
 * Up 이 대부분의 줄을 0 으로 만들고, 그만큼 압축이 잘 된다. Paeth 까지 가면 고르는 비용이
 * 압축 이득을 넘는다(실측은 아래 검사에 적어 둔다).
 */
function scanlines(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const out = new Uint8Array((stride + 1) * height);
  const up = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const src = y * stride;
    const dst = y * (stride + 1);
    /* Up 필터의 값과 그 절대합. 위 줄이 없으면(첫 줄) 그냥 원본이다. */
    let sumNone = 0;
    let sumUp = 0;
    for (let i = 0; i < stride; i += 1) {
      const raw = data[src + i];
      const above = y === 0 ? 0 : data[src - stride + i];
      const diff = (raw - above) & 0xff;
      up[i] = diff;
      sumNone += raw < 128 ? raw : 256 - raw;
      sumUp += diff < 128 ? diff : 256 - diff;
    }
    if (y > 0 && sumUp < sumNone) {
      out[dst] = 2;
      out.set(up, dst + 1);
    } else {
      out[dst] = 0;
      for (let i = 0; i < stride; i += 1) out[dst + 1 + i] = data[src + i];
    }
  }
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** ms 를 PNG 의 분수 지연으로. 분모를 1000 으로 고정하면 반올림 오차가 없다. */
function delayParts(delayMs: number): [number, number] {
  return [Math.max(1, Math.min(65535, Math.round(delayMs))), 1000];
}

/**
 * 움직이는 PNG 한 장. 장 사이 쉼은 `deflate` 가 이미 비동기라 저절로.
 *
 * 첫 장은 `IDAT`, 나머지는 `fdAT` (APNG 규약). 첫 장의 `fcTL` 은
 * `IDAT` **앞**에 와야 하고, 순번(sequence number)은 `fcTL` 과 `fdAT` 를 통틀어 하나로 셈.
 */
export async function encodeApng(opts: ApngOptions): Promise<Blob> {
  const { width, height, frames } = opts;
  if (frames.length === 0) throw new Error('apng: 장이 없다');
  const parts: Uint8Array[] = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;   // 비트 깊이
  ihdr[9] = 6;   // 색 종류 6 은 RGBA
  ihdr[10] = 0;  // 압축 0 은 deflate
  ihdr[11] = 0;  // 필터 0 은 표준 다섯 가지
  ihdr[12] = 0;  // 훑기 0 은 인터레이스 없음
  parts.push(chunk('IHDR', ihdr));

  const actl = new Uint8Array(8);
  const actlView = new DataView(actl.buffer);
  actlView.setUint32(0, frames.length);
  actlView.setUint32(4, opts.plays ?? 0);
  parts.push(chunk('acTL', actl));

  let sequence = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const [num, den] = delayParts(frames[i].delayMs);
    const fctl = new Uint8Array(26);
    const fctlView = new DataView(fctl.buffer);
    fctlView.setUint32(0, sequence);
    sequence += 1;
    fctlView.setUint32(4, width);
    fctlView.setUint32(8, height);
    fctlView.setUint32(12, 0); // x
    fctlView.setUint32(16, 0); // y
    fctlView.setUint16(20, num);
    fctlView.setUint16(22, den);
    fctl[24] = 0; // dispose 0 은 다음 장이 이 위에 그려짐
    fctl[25] = 0; // blend 0 은 덮어쓰기 (장마다 통짜라 섞을 것 없음)
    parts.push(chunk('fcTL', fctl));

    const compressed = await deflate(scanlines(frames[i].data, width, height));
    if (i === 0) {
      parts.push(chunk('IDAT', compressed));
    } else {
      const fdat = new Uint8Array(compressed.length + 4);
      new DataView(fdat.buffer).setUint32(0, sequence);
      sequence += 1;
      fdat.set(compressed, 4);
      parts.push(chunk('fdAT', fdat));
    }
    opts.onProgress?.((i + 1) / frames.length);
  }

  parts.push(chunk('IEND', new Uint8Array(0)));
  return new Blob(parts as unknown as BlobPart[], { type: 'image/apng' });
}
