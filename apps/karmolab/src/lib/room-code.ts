/**
 * 방 코드와 초대 링크. **가벼운 쪽**
 *
 * `room.ts` 는 trystero(P2P) 를 들고 있어 부르는 순간 55KB 가 묶음에 실림.
 * 코드와 링크 만들기는 그 없이도 되므로 여기로 가름. 오락실 로비는 이쪽만 부르고
 * P2P 는 방을 열 때 조각으로 (`arcade/net-loader.ts`, 2026-09-02 감사 B2)
 */
import { toolPage } from './site-base';

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Payload = { [k: string]: Json };

export interface Peer {
  id: string;
  name: string;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(len = 5): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}

export function inviteLink(toolPath: string, code: string): string {
  const path = toolPath.startsWith('/') ? toolPath : toolPage(toolPath);
  return `${location.origin}${path}?r=${code}`;
}

export function codeFromUrl(): string | null {
  const q = new URLSearchParams(location.search).get('r');
  if (q) return q.trim().toUpperCase();
  const m = location.hash.match(/[#&]r=([^&]+)/);
  return m ? decodeURIComponent(m[1]).trim() : null;
}
