/**
 * 파일 검사값(체크섬) — 알맹이 (TASK-KL-088 / S1)
 *
 * 내려받은 설치 파일이 중간에 바뀌지 않았는지 확인하려면 배포처가 적어 둔 값과 내 파일의 값을
 * 비교해야 한다. 그런데 **눈으로 대조하면 반드시 놓친다** — 64자리다. 그래서 기계가 맞춘다.
 *
 * MCP 로 내놓는 이유(A등급): 해시는 LLM 이 **지어낸다**. 「이 파일 sha256 뭐야」에 그럴듯한
 * 64자리를 내놓고, 그걸 믿으면 손상된 파일을 멀쩡하다고 판단한다. 그리고 배포처가 준 값은
 * 대문자거나 `sha256:` 머리말이 붙거나 줄바꿈이 섞여 오는데, 그대로 비교하면 **같은 파일인데
 * 「다르다」**가 나온다 — 그 정리도 여기서 한다.
 *
 * ★ **바이트 규약** (TASK-KL-205 P4): 파일을 다루는 알맹이는 `File`·`Blob` 이 아니라
 * `Uint8Array` 를 주고받는다. 그래야 화면(File→ArrayBuffer)과 Node(fs.readFile) 양쪽에서 같은
 * 코드가 돈다. 감싸고 내려받는 일은 화면 몫이다.
 */
import { findMatch, normalizeExpected } from './hashgen';
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'filehash',
  ops: {
    verify: {
      desc:
        '체크섬 문자열 두 개가 같은 값인지 맞춰 본다. 대문자·`sha256:` 머리말·줄바꿈이 섞여 있어도' +
        ' 정리해서 비교한다 (그대로 비교하면 같은 파일인데 다르다고 나온다).',
      in: { actual: 'string', expected: 'string' },
      out: 'string'
    }
  }
};

/*
 * 「파일의 해시를 내라」는 연산은 **일부러 안 냈다.**
 * 해시 계산은 비동기(`crypto.subtle`)인데 우리 창구(`ToolRunner`)는 동기다. 억지로 끼우면
 * 항상 던지는 연산이 목록에 남아, 에이전트가 부르고 실패하는 죽은 칸이 된다.
 * 문자열 해시는 `hashgen_text` 가 이미 같은 값을 낸다. 파일 바이트는 화면 도구가 다룬다.
 */

/** 화면이 보여 주는 순서. 이름은 WebCrypto 가 아는 표기 그대로다. */
export const FILE_ALGOS: Array<[string, string]> = [
  ['SHA-256', 'SHA-256 — 가장 널리 쓰임'],
  ['SHA-1', 'SHA-1 — 옛 배포처'],
  ['SHA-512', 'SHA-512']
];

export const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export const size = (n: number): string =>
  n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;

/**
 * 바이트의 체크섬들. `crypto.subtle` 은 브라우저·Node 둘 다에 있어서 이 함수는 양쪽에서 돈다.
 * 브라우저가 못 하는 방식은 조용히 건너뛴다 — 하나라도 나오면 대조는 된다.
 */
export async function hashBytes(bytes: Uint8Array): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [algo] of FILE_ALGOS) {
    try {
      out[algo] = hex(await crypto.subtle.digest(algo, bytes as unknown as ArrayBuffer));
    } catch {
      /* 그 방식을 못 하면 건너뛴다 */
    }
  }
  return out;
}

export interface Verdict {
  /** 맞은 방식 이름. 없으면 null. */
  matched: string | null;
  normalized: string;
}

/** 기대값과 맞춰 본다. 정리 규칙은 `hashgen` 과 **같은 것**을 쓴다 (두 도구가 갈리면 안 된다). */
export function verify(hashes: Record<string, string>, expectedRaw: string): Verdict {
  return { matched: findMatch(hashes, expectedRaw), normalized: normalizeExpected(expectedRaw) };
}

const enc = new TextEncoder();

export const run: ToolRunner = (op, args) => {
  if (op === 'verify') {
    const actual = normalizeExpected(String(args.actual ?? ''));
    const expected = normalizeExpected(String(args.expected ?? ''));
    if (actual === '' || expected === '') throw new Error('맞춰 볼 값 두 개가 필요합니다');
    const same = actual === expected;
    return [
      same ? '같습니다 — 같은 파일입니다.' : '다릅니다 — 받다가 깨졌거나 다른 파일입니다.',
      `내 값:   ${actual}`,
      `기대값: ${expected}`,
      actual.length !== expected.length
        ? `길이가 다릅니다 (${actual.length} vs ${expected.length}) — 방식이 서로 다를 수 있습니다(SHA-256 은 64자리).`
        : ''
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  throw new Error(`filehash 에 「${op}」 는 없습니다`);
};

/** 문자열 → 체크섬. 화면과 시험이 쓴다 (`run` 은 동기라 여기 못 담는다). */
export async function hashText(text: string): Promise<Record<string, string>> {
  return hashBytes(enc.encode(text));
}
