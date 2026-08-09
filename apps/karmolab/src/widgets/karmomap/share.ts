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

/**
 * 링크에서 **사진만 덜어 낸다** (TASK-KL-202 방향③).
 *
 * 주소 한계를 넘기는 것은 거의 언제나 사진이다 — 96px webp 한 장이 글 수천 자와 맞먹는다.
 * 그렇다고 「JSON 파일로 보내세요」로 끝내면, 사진 한 장 붙였다는 이유로 **링크 공유가 통째로 막힌다**.
 * 관계·이름·칸이 그림의 알맹이고 얼굴은 곁들이다 — 사진을 뺀 링크는 첫 글자 얼굴로 멀쩡히 열린다.
 *
 * 원본은 안 건드린다(사본을 만든다). 사진 카드는 **보통 카드로 되돌려** 보낸다 —
 * 사진 없는 사진 카드는 빈 상자로 보인다.
 */
export function stripImages<T extends { nodes: { avatar?: { kind: string; value: string }; shape?: string }[] }>(
  spec: T,
): { spec: T; removed: number } {
  let removed = 0;
  const nodes = spec.nodes.map((n) => {
    if (n.avatar?.kind !== 'image') return n;
    removed += 1;
    const copy = { ...n, avatar: undefined } as typeof n;
    if (copy.shape === 'photo') copy.shape = 'rect';
    return copy;
  });
  return { spec: { ...spec, nodes } as T, removed };
}

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

/**
 * **그 인물로 바로 가는 주소** (Craft 의 딥링크 계보). 링크를 받은 사람이 큰 그림에서
 * 「어디를 보라는 건지」 찾아 헤매지 않게, 열자마자 그 카드를 고르고 화면을 맞춘다.
 */
export function withNodeAnchor(url: string, nodeId: string): string {
  const u = new URL(url);
  u.searchParams.set('kmnode', nodeId);
  return u.toString();
}

/** 주소가 가리키는 노드 id(없으면 빈 문자열). */
export function nodeAnchorFromLocation(search: string): string {
  return new URLSearchParams(search).get('kmnode') ?? '';
}

/** 이 주소가 보기 전용인가. */
export function isReadOnlyLink(search: string): boolean {
  return new URLSearchParams(search).get('kmv') === '1';
}
