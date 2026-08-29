/**
 * protobuf 를 눈으로 (TASK-KL-316 / 18)
 *
 * protobuf 바이너리는 **스키마가 없으면 아무것도 아니다**. 그런데 문제가 터지는 자리는 대개
 * 이 바이트가 뭔지 모르겠다이다. 로그에 찍힌 base64 한 덩이, 캡처한 요청 몸통 같은 것.
 *
 * 그래서 두 갈래로 읽는다:
 *   ① **스키마 없이**. 선 형식(wire format)만으로 번호 3번, 문자열, 길이 12까지는 늘 알 수 있다.
 *   ② **`.proto` 를 주면**. 번호에 이름, 타입을 붙여 사람 말로 만든다.
 *
 * 되짚어 쓰기(encode)도 있다: 스키마와 JSON 을 주면 바이트로 만든다.
 * 다만 **모르는 것은 모른다고 적는다**. 64비트 실수, zigzag 여부처럼 스키마 없이 못 가르는 자리는
 * 후보를 같이 돌려준다. 짐작해서 하나만 보여 주면 사람이 그걸 믿는다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'protobuf',
  ops: {
    decode: {
      desc:
        'Decode protobuf bytes (hex or base64) into fields.' +
        ' Give a .proto and a message name to get names and types; without it, wire types are still shown.',
      in: { data: 'string', proto: 'string?', message: 'string?' },
      out: 'string'
    },
    encode: {
      desc: 'Encode JSON into protobuf bytes (hex) using a .proto definition and a message name.',
      in: { json: 'string', proto: 'string', message: 'string' },
      out: 'string'
    }
  }
};

/* ── .proto 읽기 (우리가 쓰는 만큼) ────────────────────────────────── */

export interface Field {
  no: number;
  name: string;
  type: string;
  repeated: boolean;
}

export interface Message {
  name: string;
  fields: Field[];
}

export function parseProto(text: string): Message[] {
  const out: Message[] = [];
  const body = text.replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const re = /message\s+(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const fields: Field[] = [];
    for (const raw of m[2].split(';')) {
      const line = raw.trim();
      if (line === '' || line.startsWith('message') || line.startsWith('enum') || line.startsWith('reserved')) continue;
      const f = /^(repeated\s+|optional\s+|required\s+)?([\w.]+)\s+(\w+)\s*=\s*(\d+)/.exec(line);
      if (f === null) continue;
      fields.push({ no: Number(f[4]), name: f[3], type: f[2], repeated: (f[1] ?? '').trim() === 'repeated' });
    }
    out.push({ name: m[1], fields });
  }
  return out;
}

/* ── 바이트 읽기 ───────────────────────────────────────────────────── */

export function fromHex(text: string): Uint8Array {
  const clean = text.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const g = globalThis as unknown as { atob?: (s: string) => string; Buffer?: { from: (s: string, e: string) => Uint8Array } };
  if (typeof g.atob === 'function') {
    const raw = g.atob(clean);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  if (g.Buffer !== undefined) return new Uint8Array(g.Buffer.from(clean, 'base64'));
  throw new Error('base64 를 읽을 수 없습니다');
}

/** 16진수처럼 보이나 base64 처럼 보이나. 사람은 아무거나 붙여넣는다. */
export function readBytes(text: string): Uint8Array {
  const body = text.trim();
  if (/^[0-9a-f\s,x]+$/i.test(body) && body.replace(/[^0-9a-f]/gi, '').length % 2 === 0) return fromHex(body);
  return fromBase64(body);
}

export type WireKind = 'varint' | 'i64' | 'bytes' | 'i32' | 'unknown';

export interface Piece {
  no: number;
  kind: WireKind;
  /** 스키마가 있으면 붙는 이름, 타입 */
  name?: string;
  declared?: string;
  /** 사람이 볼 값 (스키마가 없으면 후보를 함께) */
  value: unknown;
  /** 스키마 없이 못 가르는 자리의 다른 읽기 */
  alternatives?: Record<string, unknown>;
  /** 안에 또 메시지가 들어 있으면 */
  children?: Piece[];
}

function varint(bytes: Uint8Array, at: number): { value: bigint; next: number } {
  let shift = 0n;
  let value = 0n;
  let i = at;
  while (i < bytes.length) {
    const byte = bytes[i++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 70n) throw new Error('varint 가 너무 깁니다 (' + at + '번째 바이트)');
  }
  return { value, next: i };
}

const zigzag = (v: bigint): bigint => (v >> 1n) ^ -(v & 1n);

function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let printable = 0;
  for (const b of bytes) {
    if (b === 9 || b === 10 || b === 13 || (b >= 0x20 && b !== 0x7f)) printable++;
  }
  return printable / bytes.length > 0.9;
}

/** 스키마 없이도 여기까지는 늘 알 수 있다. 스키마가 있으면 이름을 붙인다. */
export function decode(bytes: Uint8Array, schema?: Message, all: Message[] = [], depth = 0): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  while (at < bytes.length) {
    const head = varint(bytes, at);
    at = head.next;
    const no = Number(head.value >> 3n);
    const wire = Number(head.value & 7n);
    const field = schema?.fields.find((f) => f.no === no);
    const piece: Piece = { no, kind: 'unknown', value: null, name: field?.name, declared: field?.type };

    if (wire === 0) {
      const v = varint(bytes, at);
      at = v.next;
      piece.kind = 'varint';
      const declared = field?.type ?? '';
      if (declared === 'bool') piece.value = v.value !== 0n;
      else if (declared.startsWith('sint')) piece.value = String(zigzag(v.value));
      else piece.value = String(v.value);
      if (field === undefined) {
        /* 스키마가 없으면 **여러 읽기가 다 맞다**. 하나만 보여 주면 그걸 믿는다. */
        piece.alternatives = { signed: String(zigzag(v.value)), bool: v.value !== 0n };
      }
    } else if (wire === 1) {
      const slice = bytes.slice(at, at + 8);
      at += 8;
      piece.kind = 'i64';
      const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
      piece.value = slice.length === 8 ? view.getFloat64(0, true) : null;
      if (slice.length === 8) piece.alternatives = { int64: String(view.getBigInt64(0, true)) };
    } else if (wire === 2) {
      const len = varint(bytes, at);
      at = len.next;
      const end = at + Number(len.value);
      const slice = bytes.slice(at, end);
      at = end;
      piece.kind = 'bytes';
      const declared = field?.type ?? '';
      const nested = all.find((m) => m.name === declared);
      if (nested !== undefined && depth < 8) {
        piece.children = decode(slice, nested, all, depth + 1);
        piece.value = '{...}';
      } else if (declared === 'string' || declared === 'bytes' || field === undefined) {
        /* 스키마가 없으면 **안에 메시지가 또 있는지** 열어 본다. 되면 그게 대개 맞다. */
        let child: Piece[] | undefined;
        if (depth < 8 && slice.length > 0 && declared !== 'string') {
          try {
            const guess = decode(slice, undefined, all, depth + 1);
            if (guess.length > 0) child = guess;
          } catch {
            child = undefined;
          }
        }
        if (looksLikeText(slice)) {
          piece.value = new TextDecoder().decode(slice);
          if (child !== undefined) piece.alternatives = { message: child.length + ' fields' };
        } else if (child !== undefined) {
          piece.children = child;
          piece.value = '{...}';
        } else {
          piece.value = toHex(slice);
        }
      } else {
        piece.value = toHex(slice);
      }
    } else if (wire === 5) {
      const slice = bytes.slice(at, at + 4);
      at += 4;
      piece.kind = 'i32';
      const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
      piece.value = slice.length === 4 ? view.getFloat32(0, true) : null;
      if (slice.length === 4) piece.alternatives = { int32: view.getInt32(0, true) };
    } else {
      throw new Error('모르는 선 형식 ' + wire + ' (' + at + '번째 바이트)');
    }
    out.push(piece);
  }
  return out;
}

/* ── 되짚어 쓰기 ───────────────────────────────────────────────────── */

function putVarint(out: number[], value: bigint): void {
  let v = value;
  for (;;) {
    const byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v === 0n) {
      out.push(byte);
      return;
    }
    out.push(byte | 0x80);
  }
}

const VARINT_TYPES = ['int32', 'int64', 'uint32', 'uint64', 'bool', 'enum', 'sint32', 'sint64'];

export function encode(value: Record<string, unknown>, schema: Message, all: Message[] = []): Uint8Array {
  const out: number[] = [];
  const put = (field: Field, item: unknown): void => {
    const type = field.type;
    if (VARINT_TYPES.includes(type)) {
      putVarint(out, (BigInt(field.no) << 3n) | 0n);
      const n = typeof item === 'boolean' ? (item ? 1n : 0n) : BigInt(Math.trunc(Number(item)));
      putVarint(out, type.startsWith('sint') ? (n << 1n) ^ (n >> 63n) : n < 0n ? BigInt.asUintN(64, n) : n);
      return;
    }
    if (type === 'string' || type === 'bytes') {
      const bytes = type === 'string' ? new TextEncoder().encode(String(item)) : fromHex(String(item));
      putVarint(out, (BigInt(field.no) << 3n) | 2n);
      putVarint(out, BigInt(bytes.length));
      out.push(...bytes);
      return;
    }
    if (type === 'double' || type === 'float') {
      const size = type === 'double' ? 8 : 4;
      const buf = new ArrayBuffer(size);
      const view = new DataView(buf);
      if (size === 8) view.setFloat64(0, Number(item), true);
      else view.setFloat32(0, Number(item), true);
      putVarint(out, (BigInt(field.no) << 3n) | (size === 8 ? 1n : 5n));
      out.push(...new Uint8Array(buf));
      return;
    }
    const nested = all.find((m) => m.name === type);
    if (nested !== undefined && typeof item === 'object' && item !== null) {
      const inner = encode(item as Record<string, unknown>, nested, all);
      putVarint(out, (BigInt(field.no) << 3n) | 2n);
      putVarint(out, BigInt(inner.length));
      out.push(...inner);
      return;
    }
    throw new Error('아직 못 쓰는 타입: ' + type);
  };

  for (const field of schema.fields) {
    const item = value[field.name];
    if (item === undefined || item === null) continue;
    if (field.repeated && Array.isArray(item)) {
      for (const one of item) put(field, one);
      continue;
    }
    put(field, item);
  }
  return new Uint8Array(out);
}

export function show(pieces: Piece[], indent = 0): string {
  const pad = '  '.repeat(indent);
  return pieces
    .map((p) => {
      const head = pad + '#' + p.no + (p.name === undefined ? '' : ' ' + p.name) + ' (' + (p.declared ?? p.kind) + ')';
      const alt = p.alternatives === undefined ? '' : '   ~ ' + Object.entries(p.alternatives).map(([k, v]) => k + '=' + String(v)).join(', ');
      if (p.children !== undefined) return head + '\n' + show(p.children, indent + 1);
      return head + ': ' + String(p.value) + alt;
    })
    .join('\n');
}

export const run: ToolRunner = (op, args) => {
  if (op === 'decode') {
    const all = args.proto === undefined ? [] : parseProto(String(args.proto));
    const schema = all.find((m) => m.name === String(args.message ?? '')) ?? (all.length === 1 ? all[0] : undefined);
    return show(decode(readBytes(String(args.data ?? '')), schema, all));
  }
  if (op === 'encode') {
    const all = parseProto(String(args.proto ?? ''));
    const schema = all.find((m) => m.name === String(args.message ?? '')) ?? all[0];
    if (schema === undefined) throw new Error('메시지를 못 찾았습니다');
    return toHex(encode(JSON.parse(String(args.json ?? '{}')) as Record<string, unknown>, schema, all));
  }
  throw new Error('protobuf: 모르는 연산 ' + op);
};
