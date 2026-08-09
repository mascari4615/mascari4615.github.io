/**
 * 해시 · 체크섬 — 알맹이 (TASK-KL-088 / S1)
 *
 * 이 도구의 알맹이에는 **남의 손이 하나 필요하다**. 실제 해시 계산은 브라우저에선 CryptoJS,
 * Node 에선 `node:crypto` 가 한다 — 어느 쪽도 반대편엔 없다. 그렇다고 알맹이에 둘 중 하나를
 * 박으면 그 순간 한쪽에서 못 돈다.
 *
 * 그래서 **계산기를 밖에서 받는다**(`HashBackend`). 알맹이가 소유하는 것은 계산기가 아니라
 * *약속* 이다 — 어떤 알고리즘을 어떤 순서로 보여 줄지, 16진수를 어떻게 적을지, 남이 준
 * 체크섬과 어떻게 맞춰 볼지. 그 셋이 이 도구에서 **틀리면 안 되는 부분**이고, 양쪽에서 같아야 한다.
 *
 * (해시 자체를 AI 가 대신 답하면 그럴듯한 거짓말이 나온다 — 그래서 이 도구는 MCP A등급이다.)
 */
import { keccak, sha3 } from './sha3';
import type { ToolRunner, ToolSpec } from './types';

export type Algo = 'MD5' | 'SHA1' | 'SHA256' | 'SHA512' | 'SHA3_512' | 'KECCAK512' | 'RIPEMD160';

/** 화면에 나가는 순서이기도 하다. 흔히 쓰는 것부터. */
export const ALGOS: readonly Algo[] = ['MD5', 'SHA1', 'SHA256', 'SHA512', 'SHA3_512', 'KECCAK512', 'RIPEMD160'];

/**
 * 이 둘은 **계산기를 안 빌린다** — `core/sha3.ts` 가 직접 계산한다.
 * 그래서 브라우저와 Node 가 *같은 코드 한 벌*을 쓴다. 값이 갈릴 자리가 아예 없다.
 */
const SELF_COMPUTED: Partial<Record<Algo, (text: string) => string>> = {
  SHA3_512: (t) => sha3(t, 512),
  KECCAK512: (t) => keccak(t, 512)
};

/**
 * ★ `KECCAK512` 를 「SHA-3」 이라 부르지 않는다 (2026-08-09, TASK-KL-205 에서 실측으로 발각).
 *
 * CryptoJS 의 `SHA3` 은 **표준화 이전의 Keccak** 이다. 2015년 FIPS-202 로 표준이 되면서 채움
 * 규칙(padding)이 바뀌었고, 그래서 같은 글자에 **다른 값**이 나온다. 빈 글자로 대 보면 확실하다:
 *   Keccak-512("") = 0eab42de…   ← CryptoJS 가 내던 값
 *   SHA3-512("")   = a69f73cc…   ← `openssl dgst -sha3-512` · `sha3sum` · Node 가 내는 값
 *
 * 그동안 화면에 「SHA-3 (512)」 라고 적혀 나갔다. 이 도구를 쓰는 이유가 **값을 맞춰 보는 것**인데,
 * 이름이 틀리면 사람은 멀쩡한 파일을 「손상됐다」고 판단한다. 그래서 이름을 사실대로 고쳤다.
 *
 * 진짜 SHA-3 은 이제 우리가 직접 계산한다 (`core/sha3.ts`) — 남의 라이브러리를 안 들였다.
 * 둘 다 내놓으므로 옛 값이 필요한 사람도, 표준 값이 필요한 사람도 헷갈리지 않는다.
 */
export const LABEL: Record<Algo, string> = {
  MD5: 'MD5',
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
  SHA3_512: 'SHA3-512',
  KECCAK512: 'Keccak-512',
  RIPEMD160: 'RIPEMD-160'
};

/** 이름만으로는 오해가 남는 것에 붙이는 한 줄. 화면이 그대로 보여 준다. */
export const CAVEAT: Partial<Record<Algo, string>> = {
  SHA3_512: '표준(FIPS-202)입니다. sha3sum · openssl dgst -sha3-512 와 같은 값입니다.',
  KECCAK512: '표준 SHA-3 이전 판입니다. sha3sum 값과 다릅니다 — 옛 도구와 맞출 때만 쓰세요.'
};

/** 파일 체크섬 쪽이 쓰는 세 개 (WebCrypto 가 해 주는 것만). */
export const FILE_ALGOS = ['SHA-1', 'SHA-256', 'SHA-512'] as const;

/**
 * 실제로 해시를 뜨는 손. 소문자 16진수를 돌려주면 된다.
 * 브라우저 = CryptoJS · Node = node:crypto · 시험 = node:crypto.
 */
export type HashBackend = (algo: Algo, text: string) => string;

export const spec: ToolSpec = {
  id: 'hashgen',
  ops: {
    text: {
      desc:
        '문자열의 해시를 16진수로 계산한다. algo 를 주면 그것만, 안 주면 7종 전부' +
        ' (MD5 · SHA-1 · SHA-256 · SHA-512 · SHA3-512(FIPS-202) · Keccak-512(표준 이전) · RIPEMD-160).',
      in: { text: 'string', algo: 'string?', upper: 'boolean?' },
      out: 'string'
    }
  }
};

export interface HashRow {
  algo: Algo;
  label: string;
  hex: string;
  /** 이름만으로 오해할 수 있는 것에만 붙는다 (Keccak-512). */
  caveat?: string;
}

/** 빈 글자면 빈 값으로 돌려준다 — 화면이 「-」 를 그리기 위해서다(계산 안 함이 아니라 값 없음). */
export function hashAll(text: string, backend: HashBackend, upper = false): HashRow[] {
  return ALGOS.map((algo) => {
    const self = SELF_COMPUTED[algo];
    const hex = text === '' ? '' : self ? self(text) : backend(algo, text);
    return { algo, label: LABEL[algo], hex: upper ? hex.toUpperCase() : hex, caveat: CAVEAT[algo] };
  });
}

export function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 남이 준 체크섬을 맞춰 볼 수 있는 모양으로 만든다.
 * 배포처가 준 값은 대문자거나, 줄바꿈·공백이 섞였거나, `sha256:` 같은 머리말이 붙어 온다.
 * 그걸 그대로 비교하면 **같은 파일인데 「다르다」고 나온다** — 이 도구의 최악이다.
 */
export function normalizeExpected(raw: string): string {
  return raw
    .trim()
    .replace(/^[a-z0-9-]+[:=]\s*/i, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 맞는 알고리즘 이름을 돌려준다. 없으면 null — 「모르겠다」를 값으로 말한다. */
export function findMatch(hashes: Record<string, string>, expectedRaw: string): string | null {
  const want = normalizeExpected(expectedRaw);
  if (want === '') return null;
  for (const [name, hex] of Object.entries(hashes)) {
    if (hex.toLowerCase() === want) return name;
  }
  return null;
}

/**
 * 이름으로 부르는 창구 (`types.ts` 의 ToolRunner).
 * `deps.hash` = 해시 계산기. SHA3-512·Keccak-512 만 쓸 거면 없어도 되지만, 나머지 다섯에는 필요하다.
 */
export const run: ToolRunner = (op, args, deps) => {
  if (op !== 'text') throw new Error(`hashgen 에 「${op}」 는 없습니다`);

  const text = String(args.text ?? '');
  const upper = args.upper === true;
  const backend = (deps?.hash as HashBackend | undefined) ?? (() => {
    throw new Error('해시 계산기가 없습니다 (deps.hash)');
  });

  const wanted = args.algo === undefined || args.algo === '' ? null : String(args.algo).toUpperCase().replace(/[-\s]/g, '_');
  const rows = hashAll(text, backend, upper);
  if (wanted === null) return rows.map((r) => `${r.label}: ${r.hex}`).join('\n');

  const hit = rows.find((r) => r.algo === wanted || r.label.toUpperCase().replace(/[-\s]/g, '_') === wanted);
  if (hit === undefined) throw new Error(`모르는 알고리즘입니다: ${String(args.algo)} (있는 것: ${ALGOS.join(' · ')})`);
  return hit.hex;
};
