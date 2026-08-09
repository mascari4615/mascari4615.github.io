/**
 * UUID · 랜덤 ID — 알맹이 (TASK-KL-088 / S1)
 *
 * 난수는 `crypto.getRandomValues` 만 쓴다. `Math.random` 은 예측 가능해서 ID·비밀번호 용도로 부적격이다.
 * 이 전역은 브라우저와 Node(19+) 둘 다에 있어서 이 파일은 양쪽에서 그대로 돈다.
 *
 * MCP 로 내놓는 이유(A등급 — 「LLM 이 **못 하는** 것」):
 * LLM 에게 「UUID 하나 만들어 줘」나 「무작위 비밀번호」를 시키면 **무작위가 아닌 것**이 나온다.
 * 학습 데이터에 흔한 값이거나, 자기가 방금 만든 것과 비슷하거나, 같은 요청에 같은 답을 낸다.
 * 그걸 세션 토큰·비밀번호로 쓰면 그 자리가 곧 구멍이다. **여기가 이 서버에서 가장 값이 큰 도구다.**
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'uuidgen',
  ops: {
    generate: {
      desc:
        '암호학적으로 안전한 난수로 ID 를 만든다 (LLM 이 지어낸 값은 무작위가 아니다).' +
        ' kind = uuid4(기본) · uuid7(시간순 정렬됨) · ulid · nanoid · password.' +
        ' count 는 개수, length 는 nanoid·password 의 길이, symbols 는 password 에 기호 포함.',
      in: { kind: 'string?', count: 'number?', length: 'number?', symbols: 'boolean?' },
      out: 'string'
    }
  }
};

export function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
}

const hexOf = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const dash = (hex: string): string =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

export function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return dash(hexOf(b));
}

/** UUID v7 — 앞 48비트가 밀리초 타임스탬프라 **정렬하면 생성 순서**가 된다 (DB 기본키에 유리). */
export function uuidV7(now: number = Date.now()): string {
  const b = randomBytes(16);
  b[0] = (now / 2 ** 40) & 0xff;
  b[1] = (now / 2 ** 32) & 0xff;
  b[2] = (now / 2 ** 24) & 0xff;
  b[3] = (now / 2 ** 16) & 0xff;
  b[4] = (now / 2 ** 8) & 0xff;
  b[5] = now & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  return dash(hexOf(b));
}

const NANO_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

export function nanoId(len = 21): string {
  return [...randomBytes(len)].map((x) => NANO_ALPHABET[x % NANO_ALPHABET.length]).join('');
}

const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now: number = Date.now()): string {
  let ts = now;
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = ULID_CHARS[ts % 32] + time;
    ts = Math.floor(ts / 32);
  }
  const rand = [...randomBytes(16)].map((x) => ULID_CHARS[x % 32]).join('').slice(0, 16);
  return time + rand;
}

/** 헷갈리는 글자(0/O, 1/l/I)는 뺐다 — 손으로 옮겨 적을 때 그게 사고를 낸다. */
export function password(len = 16, symbols = false): string {
  const base = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pool = base + (symbols ? '!@#$%^&*()-_=+[]{}' : '');
  return [...randomBytes(len)].map((x) => pool[x % pool.length]).join('');
}

export type Kind = 'uuid4' | 'uuid7' | 'ulid' | 'nanoid' | 'password';

export function makeOne(kind: Kind, length: number, symbols: boolean, now?: number): string {
  if (kind === 'uuid7') return uuidV7(now);
  if (kind === 'ulid') return ulid(now);
  if (kind === 'nanoid') return nanoId(length);
  if (kind === 'password') return password(length, symbols);
  return uuidV4();
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'generate') throw new Error(`uuidgen 에 「${op}」 는 없습니다`);
  const kind = String(args.kind ?? 'uuid4') as Kind;
  if (['uuid4', 'uuid7', 'ulid', 'nanoid', 'password'].includes(kind) === false) {
    throw new Error(`모르는 종류입니다: ${kind} (uuid4 · uuid7 · ulid · nanoid · password)`);
  }
  const count = Math.min(100, Math.max(1, Math.round(Number(args.count ?? 1))));
  const length = Math.min(256, Math.max(4, Math.round(Number(args.length ?? (kind === 'password' ? 16 : 21)))));
  const symbols = args.symbols === true;

  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(makeOne(kind, length, symbols));
  return out.join('\n');
};
