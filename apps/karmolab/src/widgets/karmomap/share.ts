/**
 * share.ts — 링크 하나로 관계도 넘기기 (TASK-KL-202 격차 V).
 *
 * 백엔드가 0 이라 서버에 올릴 곳이 없다. 그래서 **주소 안에 그림을 넣는다** — 압축한 뒤
 * URL 에 안전한 글자로 바꿔 `?km=` 에 싣는다. 받는 쪽은 그 주소만 열면 된다.
 *
 * 두 가지를 지킨다:
 * - **주소 조각(#)이 아니라 물음표 뒤(?)** 에 싣는다. 여기 셸은 `#` 을 도구 이름 라우팅에 쓴다.
 * - **너무 크면 만들지 않는다.** 주소는 브라우저·메신저마다 한계가 다르고, 잘린 주소는
 *   「열리는데 내용이 이상한」 최악의 실패를 낸다. 큰 그림은 JSON 파일로 보내는 게 맞다.
 */

/** 실용 상한. 이보다 길면 주소가 어딘가에서 잘릴 위험이 크다. */
export const SHARE_URL_LIMIT = 8000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function squeeze(bytes: Uint8Array, mode: 'deflate-raw'): Promise<Uint8Array> {
  const cs = new CompressionStream(mode);
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unsqueeze(bytes: Uint8Array, mode: 'deflate-raw'): Promise<Uint8Array> {
  const ds = new DecompressionStream(mode);
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 그림 → 주소에 실을 글자. 압축이 안 되는 환경이면 그냥 base64 로 간다(앞에 표식을 붙인다). */
export async function encodeShare(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  if (typeof CompressionStream === 'undefined') return `r${toBase64Url(json)}`;
  try {
    return `z${toBase64Url(await squeeze(json, 'deflate-raw'))}`;
  } catch {
    return `r${toBase64Url(json)}`;
  }
}

/** 주소에 실린 글자 → 그림. 모양이 아니면 null(남이 만든 이상한 주소를 그대로 믿지 않는다). */
export async function decodeShare(code: string): Promise<unknown | null> {
  if (!code) return null;
  const kind = code[0];
  const body = code.slice(1);
  try {
    const raw = fromBase64Url(body);
    const bytes = kind === 'z' ? await unsqueeze(raw, 'deflate-raw') : raw;
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** 지금 주소에서 공유 코드만 뽑는다. */
export function shareCodeFromLocation(search: string): string {
  return new URLSearchParams(search).get('km') ?? '';
}

/**
 * 공유 주소 만들기. 도구 이름(#karmomap)은 그대로 두고 `?km=` 만 갈아 끼운다.
 *
 * `readOnly` = **보기 전용** 링크(`&kmv=1`). 남에게 관계도를 보여 줄 때 대부분은 *읽히기만* 하면 된다 —
 * 편집 손잡이가 그대로 보이면 받는 쪽은 「내가 고쳐도 되나」부터 헷갈리고, 실수로 고쳐 놓고
 * 원본이 바뀐 줄 안다(사실은 자기 브라우저에만 남는다). 그 혼란을 링크에서 끊는다.
 */
export function buildShareUrl(base: URL, code: string, readOnly = false): string {
  const url = new URL(base.toString());
  url.searchParams.set('km', code);
  if (readOnly) url.searchParams.set('kmv', '1');
  else url.searchParams.delete('kmv');
  url.hash = '#karmomap';
  return url.toString();
}

/** 이 주소가 보기 전용인가. */
export function isReadOnlyLink(search: string): boolean {
  return new URLSearchParams(search).get('kmv') === '1';
}
