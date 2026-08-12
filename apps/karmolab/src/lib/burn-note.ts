/**
 * 사라지는 쪽지 — 잠그고 푸는 일 (TASK-KL-251)
 *
 * **열쇠는 서버로 안 간다.** 브라우저가 여기서 잠그고, 열쇠는 주소의 `#` 뒤에 실린다 —
 * 브라우저는 `#` 뒤를 서버로 보내지 않는다(HTTP 규격). 그래서 우리 서버가 들고 있는 것은
 * 알아볼 수 없는 덩어리 하나뿐이고, 우리도 내용을 못 본다.
 *
 * 이 조각은 화면을 모른다 — 글을 받아 덩어리와 열쇠를 돌려주고, 그 반대도 한다.
 */

const ALGO = 'AES-GCM';
/** 열쇠 길이 256비트. 짧게 줄일 이유가 없다 — 주소 몇 글자를 아끼자고 자물쇠를 얇게 만들지 않는다. */
const KEY_BITS = 256;

function bytesToBase64Url(b: Uint8Array): string {
  let s = '';
  for (const v of b) s += String.fromCharCode(v);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 되짚을 때 **자기 그릇을 새로 잡는다** — 남의 버퍼를 잘라 쓰면 암호 API 가 받아 주지 않는다. */
function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** 잘라 낸 조각을 **제 그릇에 옮겨 담는다**(위와 같은 이유). */
function slice(b: Uint8Array, from: number, to?: number): Uint8Array<ArrayBuffer> {
  const part = b.subarray(from, to);
  const out = new Uint8Array(new ArrayBuffer(part.length));
  out.set(part);
  return out;
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error('no-webcrypto');
  return c.subtle;
}

export interface Sealed {
  /** 서버로 보낼 덩어리 (첫 12바이트 = 한 번 쓰는 값, 나머지 = 잠긴 글) */
  body: string;
  /** 주소 `#` 뒤에 실을 열쇠 */
  key: string;
}

/**
 * 잠근다. **한 번 쓰는 값(nonce)을 매번 새로 뽑아** 덩어리 앞에 붙인다 —
 * 같은 열쇠로 두 번 잠글 때 이 값이 겹치면 AES-GCM 은 통째로 무너진다.
 */
export async function seal(text: string): Promise<Sealed> {
  const key = await subtle().generateKey({ name: ALGO, length: KEY_BITS }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const data = new TextEncoder().encode(text);
  const enc = new Uint8Array(await subtle().encrypt({ name: ALGO, iv }, key, data));
  const raw = new Uint8Array(await subtle().exportKey('raw', key));
  const joined = new Uint8Array(iv.length + enc.length);
  joined.set(iv, 0);
  joined.set(enc, iv.length);
  return { body: bytesToBase64Url(joined), key: bytesToBase64Url(raw) };
}

/**
 * 푼다. 열쇠가 틀리거나 덩어리가 손상되면 **던진다** — 조용히 빈 글을 돌려주면
 * 「빈 쪽지였나 보다」로 읽혀서, 실제로는 못 연 것을 연 것으로 착각하게 된다.
 */
export async function open(body: string, key: string): Promise<string> {
  const joined = base64UrlToBytes(body);
  if (joined.length < 13) throw new Error('too-short');
  const iv = slice(joined, 0, 12);
  const enc = slice(joined, 12);
  const k = await subtle().importKey('raw', base64UrlToBytes(key), { name: ALGO }, false, ['decrypt']);
  const plain = await subtle().decrypt({ name: ALGO, iv }, k, enc);
  return new TextDecoder().decode(plain);
}

/**
 * 링크 한 줄. 열쇠는 **`#` 뒤**에 둔다 — 이 자리가 서버로 안 가는 유일한 자리다.
 * (물음표 뒤에 두면 주소가 서버 기록에 그대로 남는다.)
 *
 * 주소 모양은 **도구 상세 쪽**을 쓴다(`/karmolab/t/burnnote/`) — 해시는 이 앱에서
 * 「어느 도구를 열까」를 뜻하므로, 거기에 데이터를 실으면 도구가 안 열린다.
 * 타임캡슐이 먼저 같은 자리를 지나갔고 같은 모양을 쓴다.
 */
export function linkFor(origin: string, id: string, key: string): string {
  return `${origin}/karmolab/t/burnnote/#n=${encodeURIComponent(id)}.${encodeURIComponent(key)}`;
}

/** 링크에서 이름과 열쇠를 되짚는다. 모양이 안 맞으면 null. */
export function parseLink(hash: string): { id: string; key: string } | null {
  const m = /(?:^|[#&])n=([^.&]+)\.([^&]+)/.exec(hash || '');
  if (!m) return null;
  try {
    return { id: decodeURIComponent(m[1]), key: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}
