/**
 * 닮은 사진 묶기 (TASK-KL-316 / 30)
 *
 * 사진첩에서 지우고 싶은 건 **똑같은 파일**만이 아니다 — 연사로 찍은 열 장, 크기만 줄인 사본,
 * 메신저로 오가며 다시 압축된 것들이 진짜 짐이다. 바이트가 다르니 파일 해시로는 하나도 안 묶인다.
 *
 * 그래서 **그림의 모양**을 64비트로 줄여 견준다(dHash: 옆 칸보다 밝은가만 남긴다).
 * 크기·압축이 달라져도 이 값은 거의 안 변하고, 다른 사진이면 크게 벌어진다.
 *
 * 지우는 일은 **우리가 안 한다** — 브라우저는 남의 폴더를 못 지우고, 지우는 건 되돌릴 수 없다.
 * 「어느 것을 남기면 되는지」만 말한다(가장 큰 판, 즉 가장 덜 상한 것).
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'dupphoto',
  ops: {
    describe: {
      desc: 'Explain how similar photos are grouped (64-bit dHash, Hamming distance) and what the tool will not do.',
      in: {},
      out: 'string'
    }
  }
};

/**
 * 9×8 회색 값 → 64비트 지문. 옆 칸보다 밝으면 1.
 * **밝기 자체가 아니라 이웃과의 차이**를 쓰는 이유: 사진 전체가 밝아지거나 어두워져도 안 변한다.
 */
export function dHash(gray: ArrayLike<number>, width = 9, height = 8): bigint {
  if (gray.length < width * height) throw new Error('9×8 로 줄인 회색 값이 필요합니다');
  let bits = 0n;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = gray[y * width + x];
      const right = gray[y * width + x + 1];
      bits = (bits << 1n) | (left > right ? 1n : 0n);
    }
  }
  return bits;
}

/** RGBA 를 회색으로 (사람 눈에 맞춘 무게). */
export function toGray(pixels: ArrayLike<number>, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const at = i * 4;
    out.push(0.299 * pixels[at] + 0.587 * pixels[at + 1] + 0.114 * pixels[at + 2]);
  }
  return out;
}

/** 두 지문이 몇 비트나 다른가 (0 = 똑같아 보임). */
export function distance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

export interface Photo {
  name: string;
  /** 파일 크기(바이트) — 어느 것을 남길지 고를 때 쓴다 */
  size: number;
  hash: bigint;
  /** 픽셀 수 (알면 더 나은 판단) */
  pixels?: number;
  /** 바이트가 완전히 같은 것끼리 묶는 값 (있으면) */
  exact?: string;
}

export interface Group {
  /** 남기면 되는 것 (가장 크고 덜 상한 판) */
  keep: Photo;
  /** 지워도 되는 것들 */
  others: Photo[];
  /** 이 묶음이 얼마나 닮았나 (0 = 똑같아 보임) */
  spread: number;
  /** 지우면 줄어드는 바이트 */
  saved: number;
}

/**
 * 닮은 것끼리 묶는다. **이어짐으로 묶는다**(A~B, B~C 면 셋이 한 묶음) —
 * 연사 사진은 한쪽 끝과 다른 끝이 꽤 다르지만 사람에게는 한 덩어리다.
 */
export function group(photos: Photo[], threshold = 6): Group[] {
  const parent = photos.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let cur = i;
    while (parent[cur] !== root) {
      const next = parent[cur];
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < photos.length; i++) {
    for (let j = i + 1; j < photos.length; j++) {
      const exact = photos[i].exact !== undefined && photos[i].exact === photos[j].exact;
      if (exact || distance(photos[i].hash, photos[j].hash) <= threshold) union(i, j);
    }
  }

  const buckets = new Map<number, Photo[]>();
  photos.forEach((photo, i) => {
    const root = find(i);
    const list = buckets.get(root) ?? [];
    list.push(photo);
    buckets.set(root, list);
  });

  const out: Group[] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    /* 남길 것 = **가장 큰 것** (다시 압축될수록 작아지고 상한다). 같으면 이름이 짧은 쪽. */
    const sorted = [...list].sort((a, b) => (b.pixels ?? 0) - (a.pixels ?? 0) || b.size - a.size || a.name.length - b.name.length);
    const keep = sorted[0];
    const others = sorted.slice(1);
    let spread = 0;
    for (const one of list) for (const two of list) spread = Math.max(spread, distance(one.hash, two.hash));
    out.push({ keep, others, spread, saved: others.reduce((sum, p) => sum + p.size, 0) });
  }
  /* 많이 줄어드는 묶음부터 — 사람이 위에서부터 지우면 된다 */
  return out.sort((a, b) => b.saved - a.saved);
}

export function totalSaved(groups: Group[]): number {
  return groups.reduce((sum, g) => sum + g.saved, 0);
}

export const run: ToolRunner = (op) => {
  if (op !== 'describe') throw new Error('dupphoto: 모르는 연산 ' + op);
  return [
    'Groups photos that look alike using a 64-bit difference hash, not the file bytes,',
    'so resized and re-compressed copies still land in the same group.',
    'It never deletes anything — it only says which copy is worth keeping.'
  ].join('\n');
};
