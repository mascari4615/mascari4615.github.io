/**
 * GIF 만들기 — 인코더 (TASK-KL-088)
 *
 * 브라우저에는 GIF 를 쓰는 기능이 없다. 남의 라이브러리를 받아 오면 그만이지만,
 * 이 도구의 값어치는 「파일이 밖으로 안 나간다」이므로 받아 오는 것도 최소로 둔다.
 * 그래서 GIF89a 를 직접 엮는다 — 팔레트 뽑기(중앙값 자르기) + LZW 압축.
 *
 * 품질이 핵심이다. 색을 아무렇게나 줄이면 사람 얼굴이 얼룩덜룩해진다:
 *  - 팔레트는 **전 프레임에서 뽑는다** (프레임마다 따로 뽑으면 재생 중 색이 출렁인다)
 *  - 색 대응은 오차 확산(Floyd–Steinberg)으로 뿌려 띠(banding)를 줄인다
 *  - 안 변한 픽셀은 투명으로 남겨 용량을 줄인다 (프레임 간 차이만 기록)
 *
 * 다른 위젯이 쓰는 진입점 = `window.KarmoGif.encodeAsync(...)` (장 사이에 숨 쉴 틈을 준다).
 * 시험·짧은 작업용 = `encode(...)` — 결과 파일은 둘이 완전히 같다.
 */
(function (): void {
  interface Frame {
    data: Uint8ClampedArray; // RGBA
    delayMs: number;
  }

  interface Box {
    pixels: number[]; // 인덱스 (r,g,b 는 아래 sample 배열에서)
    rMin: number; rMax: number;
    gMin: number; gMax: number;
    bMin: number; bMax: number;
  }

  /** 바이트를 계속 이어 붙이는 통. 미리 크기를 모르니 배열로 모은다. */
  class ByteSink {
    private chunks: number[] = [];
    byte(v: number): void {
      this.chunks.push(v & 0xff);
    }
    short(v: number): void {
      this.chunks.push(v & 0xff, (v >> 8) & 0xff);
    }
    str(s: string): void {
      for (let i = 0; i < s.length; i++) this.chunks.push(s.charCodeAt(i) & 0xff);
    }
    bytes(arr: number[] | Uint8Array): void {
      for (let i = 0; i < arr.length; i++) this.chunks.push(arr[i] & 0xff);
    }
    toUint8(): Uint8Array {
      return new Uint8Array(this.chunks);
    }
  }

  /**
   * 중앙값 자르기(median cut) — 색을 256 개로 줄인다.
   * 색이 가장 넓게 퍼진 축을 반으로 잘라 상자를 늘려 가는 방식이라,
   * 많이 쓰인 색이 자동으로 더 촘촘한 자리를 받는다.
   */
  function medianCut(sample: Uint8Array, maxColors: number): number[][] {
    const count = sample.length / 3;
    const all: number[] = [];
    for (let i = 0; i < count; i++) all.push(i);

    const measure = (pixels: number[]): Box => {
      let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
      for (const p of pixels) {
        const r = sample[p * 3], g = sample[p * 3 + 1], b = sample[p * 3 + 2];
        if (r < rMin) rMin = r;
        if (r > rMax) rMax = r;
        if (g < gMin) gMin = g;
        if (g > gMax) gMax = g;
        if (b < bMin) bMin = b;
        if (b > bMax) bMax = b;
      }
      return { pixels, rMin, rMax, gMin, gMax, bMin, bMax };
    };

    let boxes: Box[] = [measure(all)];
    while (boxes.length < maxColors) {
      // 가장 넓은 상자를 고른다 — 넓을수록 그 안의 색들이 서로 멀다 = 오차가 크다
      let target = -1;
      let widest = 0;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.pixels.length < 2) continue;
        const span = Math.max(b.rMax - b.rMin, b.gMax - b.gMin, b.bMax - b.bMin);
        if (span > widest) {
          widest = span;
          target = i;
        }
      }
      if (target < 0 || widest === 0) break;

      const box = boxes[target];
      const rSpan = box.rMax - box.rMin, gSpan = box.gMax - box.gMin, bSpan = box.bMax - box.bMin;
      const axis = rSpan >= gSpan && rSpan >= bSpan ? 0 : gSpan >= bSpan ? 1 : 2;
      const sorted = box.pixels.slice().sort((x, y) => sample[x * 3 + axis] - sample[y * 3 + axis]);
      const mid = sorted.length >> 1;
      boxes.splice(target, 1, measure(sorted.slice(0, mid)), measure(sorted.slice(mid)));
    }

    return boxes.map((b) => {
      let r = 0, g = 0, bl = 0;
      for (const p of b.pixels) {
        r += sample[p * 3];
        g += sample[p * 3 + 1];
        bl += sample[p * 3 + 2];
      }
      const n = Math.max(1, b.pixels.length);
      return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
    });
  }

  /** GIF 의 LZW 압축. 사전이 가득 차면 비우고 다시 시작한다. */
  function lzw(indices: Uint8Array, minCodeSize: number): number[] {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let next = eoiCode + 1;
    let dict = new Map<string, number>();

    const out: number[] = [];
    let cur = 0;
    let curBits = 0;
    const emit = (code: number): void => {
      cur |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8) {
        out.push(cur & 0xff);
        cur >>= 8;
        curBits -= 8;
      }
    };

    const reset = (): void => {
      dict = new Map();
      codeSize = minCodeSize + 1;
      next = eoiCode + 1;
    };

    emit(clearCode);
    reset();

    let prefix = String(indices[0]);
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const combined = prefix + ',' + k;
      if (dict.has(combined)) {
        prefix = combined;
        continue;
      }
      emit(prefix.indexOf(',') < 0 ? Number(prefix) : (dict.get(prefix) as number));
      if (next < 4096) {
        dict.set(combined, next++);
        if (next > 1 << codeSize && codeSize < 12) codeSize++;
      } else {
        emit(clearCode);
        reset();
      }
      prefix = String(k);
    }
    emit(prefix.indexOf(',') < 0 ? Number(prefix) : (dict.get(prefix) as number));
    emit(eoiCode);
    if (curBits > 0) out.push(cur & 0xff);
    return out;
  }

  /** LZW 결과를 255 바이트짜리 덩어리로 쪼갠다 (GIF 규격). */
  function blocks(sink: ByteSink, data: number[]): void {
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      sink.byte(chunk.length);
      sink.bytes(chunk);
    }
    sink.byte(0);
  }

  interface EncodeOptions {
    width: number;
    height: number;
    frames: Frame[];
    maxColors?: number;
    dither?: boolean;
    loop?: boolean;
    /** 진행률 0~1 */
    onProgress?: (ratio: number) => void;
  }

  function start(opts: EncodeOptions): { step: (fi: number) => Blob | null; count: number } {
    const { width, height, frames } = opts;
    const maxColors = Math.max(4, Math.min(255, opts.maxColors ?? 128)); // 1칸은 투명색 몫
    const dither = opts.dither !== false;

    // 팔레트는 전 프레임에서 한 번만 뽑는다 — 프레임마다 뽑으면 재생 중 색이 출렁인다.
    const step = Math.max(1, Math.floor((width * height * frames.length) / 24000));
    const sampleList: number[] = [];
    for (const f of frames) {
      for (let p = 0; p < width * height; p += step) {
        sampleList.push(f.data[p * 4], f.data[p * 4 + 1], f.data[p * 4 + 2]);
      }
    }
    const palette = medianCut(new Uint8Array(sampleList), maxColors);
    const transparentIndex = palette.length; // 마지막 칸을 「안 변함」 표시로 쓴다
    const tableSize = Math.max(2, 1 << Math.ceil(Math.log2(Math.max(2, palette.length + 1))));

    // 가까운 색 찾기는 프레임마다 수십만 번 돈다 — 캐시가 없으면 체감이 확 나빠진다.
    const cache = new Map<number, number>();
    const nearest = (r: number, g: number, b: number): number => {
      const key = (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2);
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2];
        // 사람 눈은 초록에 민감하다 — 가중치를 줘야 얼굴색이 덜 튄다
        const dist = dr * dr * 3 + dg * dg * 6 + db * db * 1;
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      cache.set(key, best);
      return best;
    };

    const sink = new ByteSink();
    sink.str('GIF89a');
    sink.short(width);
    sink.short(height);
    sink.byte(0x80 | (Math.log2(tableSize) - 1)); // 전역 팔레트 있음
    sink.byte(0);
    sink.byte(0);
    for (let i = 0; i < tableSize; i++) {
      const c = palette[i] || [0, 0, 0];
      sink.byte(c[0]);
      sink.byte(c[1]);
      sink.byte(c[2]);
    }

    if (opts.loop !== false) {
      sink.byte(0x21);
      sink.byte(0xff);
      sink.byte(11);
      sink.str('NETSCAPE2.0');
      sink.byte(3);
      sink.byte(1);
      sink.short(0); // 0 = 무한 반복
      sink.byte(0);
    }

    let prev: Uint8ClampedArray | null = null;
    /**
     * 한 장을 엮는다. 이 안이 무겁다 — 480×360 한 장이 17만 픽셀이고, 픽셀마다 가까운 색을
     * 찾고 오차를 뿌린다. 장수가 많으면 통째로 돌 때 화면이 얼어붙으므로,
     * **한 장 단위로 쪼개** 두고 부르는 쪽이 중간에 숨 쉴 틈을 넣을 수 있게 한다.
     */
    const encodeFrame = (frame: Frame, fi: number): void => {
      const indices = new Uint8Array(width * height);
      // 오차 확산용 작업 버퍼 (원본을 건드리면 다음 프레임 비교가 망가진다)
      const work = dither ? new Float32Array(width * height * 3) : null;
      if (work) {
        for (let i = 0; i < width * height; i++) {
          work[i * 3] = frame.data[i * 4];
          work[i * 3 + 1] = frame.data[i * 4 + 1];
          work[i * 3 + 2] = frame.data[i * 4 + 2];
        }
      }

      let usesTransparent = false;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          // 앞 프레임과 같은 픽셀은 안 그린다 — 움직임이 적은 영상에서 용량이 크게 준다
          if (
            prev &&
            prev[i * 4] === frame.data[i * 4] &&
            prev[i * 4 + 1] === frame.data[i * 4 + 1] &&
            prev[i * 4 + 2] === frame.data[i * 4 + 2]
          ) {
            indices[i] = transparentIndex;
            usesTransparent = true;
            continue;
          }
          let r: number, g: number, b: number;
          if (work) {
            r = Math.max(0, Math.min(255, work[i * 3]));
            g = Math.max(0, Math.min(255, work[i * 3 + 1]));
            b = Math.max(0, Math.min(255, work[i * 3 + 2]));
          } else {
            r = frame.data[i * 4];
            g = frame.data[i * 4 + 1];
            b = frame.data[i * 4 + 2];
          }
          const idx = nearest(r, g, b);
          indices[i] = idx;

          if (work) {
            // 남은 오차를 이웃에게 나눠 준다 — 색 띠 대신 자연스러운 알갱이로 보인다
            const er = r - palette[idx][0], eg = g - palette[idx][1], eb = b - palette[idx][2];
            const spread = (nx: number, ny: number, w: number): void => {
              if (nx < 0 || nx >= width || ny >= height) return;
              const n = (ny * width + nx) * 3;
              work[n] += er * w;
              work[n + 1] += eg * w;
              work[n + 2] += eb * w;
            };
            spread(x + 1, y, 7 / 16);
            spread(x - 1, y + 1, 3 / 16);
            spread(x, y + 1, 5 / 16);
            spread(x + 1, y + 1, 1 / 16);
          }
        }
      }

      sink.byte(0x21);
      sink.byte(0xf9);
      sink.byte(4);
      // 투명색을 쓰면 「앞 프레임 위에 덧그리기」여야 한다 (지우면 구멍이 뚫린다)
      sink.byte((1 << 2) | (usesTransparent ? 1 : 0));
      sink.short(Math.max(2, Math.round(frame.delayMs / 10))); // 1/100 초 단위
      sink.byte(usesTransparent ? transparentIndex : 0);
      sink.byte(0);

      sink.byte(0x2c);
      sink.short(0);
      sink.short(0);
      sink.short(width);
      sink.short(height);
      sink.byte(0); // 지역 팔레트 없음 = 전역 사용

      const minCodeSize = Math.max(2, Math.ceil(Math.log2(tableSize)));
      sink.byte(minCodeSize);
      blocks(sink, lzw(indices, minCodeSize));

      prev = frame.data;
      opts.onProgress?.((fi + 1) / frames.length);
    };

    return {
      /** 한 장씩 진행한다. 다 끝나면 `null` 대신 완성된 파일을 돌려준다. */
      step(fi: number): Blob | null {
        if (fi < frames.length) {
          encodeFrame(frames[fi], fi);
          return null;
        }
        sink.byte(0x3b);
        return new Blob([sink.toUint8() as unknown as BlobPart], { type: 'image/gif' });
      },
      count: frames.length
    };
  }

  /** 한 번에 다 엮는다. 장수가 적을 때(그리고 시험할 때) 쓰기 좋다. */
  function encode(opts: EncodeOptions): Blob {
    const job = start(opts);
    for (let i = 0; i < job.count; i++) job.step(i);
    return job.step(job.count) as Blob;
  }

  /**
   * 장 사이에 숨 쉴 틈을 준다. 장수가 많으면 한 번에 도는 동안 화면이 통째로 멈춰
   * 「먹통이 됐나」 싶어지기 때문이다. 결과 파일은 위와 완전히 같다.
   */
  async function encodeAsync(opts: EncodeOptions): Promise<Blob> {
    const job = start(opts);
    for (let i = 0; i < job.count; i++) {
      job.step(i);
      // 네 장마다 한 번씩 — 매번 쉬면 오히려 느려진다
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    return job.step(job.count) as Blob;
  }

  (window as unknown as { KarmoGif: { encode: typeof encode; encodeAsync: typeof encodeAsync } }).KarmoGif = {
    encode,
    encodeAsync
  };
})();
