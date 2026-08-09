/**
 * Base64 인코딩 · 디코딩 — 알맹이 (TASK-KL-088 / S1 코어 분리)
 *
 * 브라우저 기본 함수(btoa/atob)는 **바이트 단위**라 한글을 넣으면 그냥 터진다.
 * 그래서 UTF-8 로 바꿔 넣고 되돌릴 때 다시 UTF-8 로 읽는다 — 한글이 깨지지 않는 이유.
 * URL-safe 표기(+/ → -_)도 함께 다룬다. 주소나 토큰에 실린 값은 대개 그쪽이다.
 *
 * 화면 코드는 `widgets/tools/base64.ts` 에 있다. 여기엔 계산만 둔다 (`core/README.md`).
 * btoa·atob·TextEncoder 는 브라우저와 Node 둘 다에 있는 표준이라 이 파일은 양쪽에서 돈다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'base64',
  ops: {
    encode: {
      desc: '텍스트를 Base64 로 바꾼다. 한글은 UTF-8 로 다뤄 깨지지 않는다.',
      in: { text: 'string', urlSafe: 'boolean?' },
      out: 'string'
    },
    decode: {
      desc: 'Base64 를 텍스트로 되돌린다. URL-safe 표기와 빠진 = 채움도 함께 처리한다.',
      in: { code: 'string' },
      out: 'string'
    }
  }
};

export function encode(text: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin);
  return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64;
}

export function decode(code: string): string {
  const norm = code.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const padded = norm.padEnd(Math.ceil(norm.length / 4) * 4, '=');
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 「몇 바이트짜리 글이었나」 — 화면이 상태줄에 쓰고, 알맹이 쪽에도 둬야 Node 에서 같은 답이 난다. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 이름으로 부르는 창구 (`types.ts` 의 ToolRunner). 주소 호출·MCP 가 이걸 쓴다. */
export const run: ToolRunner = (op, args) => {
  if (op === 'encode') return encode(String(args.text ?? ''), args.urlSafe === true);
  if (op === 'decode') return decode(String(args.code ?? ''));
  throw new Error(`base64 에 「${op}」 는 없습니다`);
};
