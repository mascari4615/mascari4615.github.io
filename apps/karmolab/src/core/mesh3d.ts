/**
 * 3D 파일 읽기 — 알맹이 (흡수 ⓑ 「3D 뷰어」)
 *
 * 「누가 보낸 3D 파일을 그냥 열어 보고 싶다」가 이 도구의 전부다. 지금은 그러려고 프로그램을
 * 깔거나 남의 사이트에 파일을 올려야 한다. 우리 원칙대로 **기기 밖으로 안 내보내고** 연다.
 *
 * ★ 라이브러리를 안 쓴다. three.js 는 600KB 가 넘고, 이 도구 하나 때문에 그걸 들이면
 * 「설치 없이 가볍게 열린다」가 깨진다. 같은 판단을 bluemarble 에서도 했다(지구본을 손으로 그림).
 * 그래서 **읽는 부분은 여기(순수함수), 그리는 부분은 화면(WebGL)** 으로 나눈다 —
 * 이 파일은 파일 하나도 안 열고 시험할 수 있다.
 *
 * STL·OBJ 만 읽는다. 그 둘이 「받아 놓고 못 여는」 파일의 대부분이다(STL = 3D 프린터,
 * OBJ = 블렌더·스캐너). glTF 는 재질·애니메이션까지 있는 다른 물건이라 따로 다뤄야 한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'mesh3d',
  ops: {
    info: {
      desc:
        'Read an STL or OBJ mesh and report triangle count, bounding box, and size in millimetres —' +
        ' the numbers you need before printing or importing. Text is parsed here; binary STL must be' +
        ' handed in as base64.' +
        ' / STL·OBJ 를 읽어 삼각형 수·크기(mm)를 낸다. 인쇄·불러오기 전에 확인하는 숫자.',
      in: { text: 'string', format: 'string?' },
      out: 'string'
    }
  }
};

export interface Mesh {
  /** 삼각형 세 꼭짓점을 이어 붙인 것 — 9개마다 삼각형 하나. WebGL 이 그대로 받는 모양이다. */
  positions: Float32Array;
  triangles: number;
  min: [number, number, number];
  max: [number, number, number];
}

const EMPTY_BOUNDS: [number, number, number] = [0, 0, 0];

function bounds(positions: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  if (positions.length === 0) return { min: [...EMPTY_BOUNDS], max: [...EMPTY_BOUNDS] };
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max };
}

/**
 * 이진 STL 인가.
 *
 * 규격에 표시가 없어서 **글자로 판단하면 자주 틀린다** — 이진 파일의 머리 80바이트에 우연히
 * `solid` 가 들어 있는 일이 흔하다(여러 프로그램이 그렇게 쓴다). 그래서 **길이로 판단한다**:
 * 이진 STL 은 정확히 `84 + 삼각형수 × 50` 바이트다. 이 셈이 맞으면 이진이다.
 */
export function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.length < 84) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  return bytes.length === 84 + count * 50;
}

export function parseBinaryStl(bytes: Uint8Array): Mesh {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const positions = new Float32Array(count * 9);
  let at = 84;
  for (let t = 0; t < count; t++) {
    at += 12; // 법선은 버린다 — 화면에서 다시 계산하는 편이 정확하다(틀리게 적힌 파일이 많다)
    for (let v = 0; v < 9; v++) {
      positions[t * 9 + v] = view.getFloat32(at, true);
      at += 4;
    }
    at += 2; // 속성 바이트
  }
  return { positions, triangles: count, ...bounds(positions) };
}

export function parseAsciiStl(text: string): Mesh {
  const nums: number[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*vertex\s+(\S+)\s+(\S+)\s+(\S+)/.exec(line);
    if (m === null) continue;
    nums.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if (nums.length % 9 !== 0) throw new Error('STL vertex count must be a multiple of 3 — the file may be truncated');
  const positions = Float32Array.from(nums);
  return { positions, triangles: nums.length / 9, ...bounds(positions) };
}

/**
 * OBJ. 면이 사각형(또는 그 이상)이면 **삼각형으로 쪼갠다** — WebGL 은 삼각형만 그린다.
 * 블렌더에서 그냥 내보내면 사각형이 섞여 나오므로, 이걸 안 하면 모델이 군데군데 뚫린다.
 */
export function parseObj(text: string): Mesh {
  const verts: number[][] = [];
  const out: number[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('v ')) {
      const p = t.slice(2).trim().split(/\s+/).map(Number);
      verts.push([p[0], p[1], p[2]]);
      continue;
    }
    if (t.startsWith('f ') === false) continue;

    /* `f 1/2/3` 처럼 붙어 오는 것에서 앞의 꼭짓점 번호만 쓴다. 음수는 뒤에서부터 센다. */
    const idx = t
      .slice(2)
      .trim()
      .split(/\s+/)
      .map((token) => {
        const n = Number(token.split('/')[0]);
        return n < 0 ? verts.length + n : n - 1;
      });

    for (let i = 1; i + 1 < idx.length; i++) {
      for (const at of [idx[0], idx[i], idx[i + 1]]) {
        const v = verts[at];
        if (v === undefined) throw new Error('OBJ face references a missing vertex — the file may be truncated');
        out.push(v[0], v[1], v[2]);
      }
    }
  }
  const positions = Float32Array.from(out);
  return { positions, triangles: out.length / 9, ...bounds(positions) };
}

/** 무엇인지 알아서 판단해 읽는다. 확장자를 못 믿는 자리라 **내용으로** 본다. */
export function parseMesh(bytes: Uint8Array, name = ''): Mesh {
  if (isBinaryStl(bytes)) return parseBinaryStl(bytes);
  const text = new TextDecoder().decode(bytes);
  if (/^\s*solid/.test(text) && /vertex/.test(text)) return parseAsciiStl(text);
  if (/^\s*v\s/m.test(text)) return parseObj(text);
  throw new Error(`${name === '' ? 'This file' : name} is not readable as STL or OBJ`);
}

export interface MeshInfo {
  triangles: number;
  size: [number, number, number];
  center: [number, number, number];
  /** 가장 긴 변 — 화면에 맞춰 줄일 때 쓴다. */
  longest: number;
}

export function describe(mesh: Mesh): MeshInfo {
  const size: [number, number, number] = [
    mesh.max[0] - mesh.min[0],
    mesh.max[1] - mesh.min[1],
    mesh.max[2] - mesh.min[2]
  ];
  return {
    triangles: mesh.triangles,
    size,
    center: [(mesh.min[0] + mesh.max[0]) / 2, (mesh.min[1] + mesh.max[1]) / 2, (mesh.min[2] + mesh.max[2]) / 2],
    longest: Math.max(...size)
  };
}

const mm = (n: number): string => `${Math.round(n * 100) / 100}`;

export const run: ToolRunner = (op, args) => {
  if (op !== 'info') throw new Error(`Unknown mesh3d op: ${op}`);
  const text = String(args.text ?? '');
  if (text.trim() === '') throw new Error('No input text provided');

  const format = String(args.format ?? '').toLowerCase();
  const mesh = format === 'obj' ? parseObj(text) : format === 'stl' ? parseAsciiStl(text) : parseMesh(new TextEncoder().encode(text));
  const info = describe(mesh);

  return [
    `Triangles: ${info.triangles.toLocaleString('en-US')}`,
    `크기: ${mm(info.size[0])} × ${mm(info.size[1])} × ${mm(info.size[2])}`,
    `Longest side: ${mm(info.longest)}`,
    '',
    'Units are not written in the file — STL and OBJ only store numbers.',
    '3D printers usually read them as mm.'
  ].join('\n');
};
