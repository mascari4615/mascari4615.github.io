/**
 * 이미 털린 비밀번호인가 (TASK-KL-255)
 *
 * **비밀번호를 보내지 않는다.** 해시 앞 다섯 글자만 보내고, 서버는 그 다섯 글자로 시작하는
 * 해시를 수백 개 통째로 돌려준다. 남은 대조는 **여기(브라우저)에서** 한다 —
 * 서버는 내가 그중 어느 것인지 모른다(이걸 k-익명이라 부른다).
 *
 * 그래서 이 파일에서 절대 하면 안 되는 일이 하나 있다: **완전한 해시를 주소에 싣는 것.**
 * 그 순간 이 도구는 「비밀번호를 남에게 물어보는 도구」가 된다.
 *
 * 재료 = api.pwnedpasswords.com (열쇠 없음 · CORS 열림, 2026-08-12 실측).
 */

const API = 'https://api.pwnedpasswords.com/range/';

/** 접두사 길이. 이 값이 곧 「서버가 얼마나 모르는가」다 — 짧을수록 더 모른다. */
export const PREFIX_LEN = 5;

/** SHA-1 을 대문자 16진수로. 유출 목록이 그 형식으로 되어 있다. */
export async function sha1Hex(text: string): Promise<string> {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('no-webcrypto');
  const buf = await c.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * 서버가 돌려준 덩어리에서 **내 것**을 찾는다.
 *
 * 한 줄이 `접미35글자:횟수` 다. 못 찾으면 0 — 「목록에 없다」는 뜻이지 「안전하다」가 아니다.
 */
export function countIn(body: string, suffix: string): number {
  const want = suffix.toUpperCase();
  for (const line of body.split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    if (line.slice(0, i).trim().toUpperCase() === want) {
      const n = Number(line.slice(i + 1).replace(/[^\d]/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

export interface PwnedResult {
  /** 몇 번 유출 목록에 나왔나. 0 = 목록에 없음 */
  count: number;
  /** 서버가 이번에 돌려준 해시 개수 — 「서버는 이 중 어느 것인지 모른다」의 증거 */
  amongst: number;
  /** 실제로 보낸 다섯 글자 (화면에 그대로 보여 준다) */
  sent: string;
}

/**
 * 물어본다. **보내는 것은 `sent` 뿐**이고, 그건 돌려주는 값에도 담겨 있어
 * 화면이 「무엇을 보냈는지」를 사람에게 그대로 보일 수 있다.
 */
export async function checkPassword(
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<PwnedResult | null> {
  if (!password) return null;
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, PREFIX_LEN);
  const suffix = hash.slice(PREFIX_LEN);
  try {
    const res = await fetchImpl(API + prefix, { headers: { Accept: 'text/plain' } });
    if (!res.ok) return null;
    const body = await res.text();
    const amongst = body.split('\n').filter((l) => l.includes(':')).length;
    return { count: countIn(body, suffix), amongst, sent: prefix };
  } catch {
    return null;
  }
}

/** 몇 번 나왔나 → 사람이 읽는 한 마디. 숫자만 던지면 그게 큰 건지 작은 건지 모른다. */
export function verdict(count: number): 'clean' | 'seen' | 'common' | 'everywhere' {
  if (count <= 0) return 'clean';
  if (count < 100) return 'seen';
  if (count < 100000) return 'common';
  return 'everywhere';
}
