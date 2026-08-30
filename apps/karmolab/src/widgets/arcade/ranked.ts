/**
 * 등급전. 게스트 열쇠와 대기열 (change.arcade-online 1번)
 *
 * - 같이 찾기는 열린 방 목록에서 사람이 고름. 등급전은 서버(욘봇)가 붙여 줌
 * - 점수 구간으로 방을 나누고 같은 방의 둘을 짝지음. 판은 그대로 브라우저끼리
 * - 서버가 죽으면 등급전만 멈춤. 친선전은 그대로 (사용자 결정)
 *
 * 게스트 열쇠:
 * - 기기마다 비밀 글자 하나. 서버는 그 해시를 이 사람으로 씀
 * - 열쇠를 내보내 다른 기기에 붙이면 같은 사람
 * - 계정(4번)이 붙으면 열쇠가 계정에 매달림. 모바일 게임의 게스트 계정과 같은 꼴
 */

const HOST = 'https://yawnbot.mascari4615.com';
const KEY = 'karmolab.arcade.key';
/** 알림 주기. 서버 제외 한계 15초보다 넉넉히 자주 */
const BEAT_MS = 5 * 1000;

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** 이 기기의 열쇠. 없으면 생성 */
export function guestKey(): string {
  const have = (localStorage.getItem(KEY) || '').trim();
  if (/^[A-Za-z0-9_-]{16,64}$/.test(have)) return have;
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  const key = [...buf].map((n) => KEY_ALPHABET[n % KEY_ALPHABET.length]).join('');
  localStorage.setItem(KEY, key);
  return key;
}

/** 다른 기기에서 가져온 열쇠 붙이기. 모양이 아니면 거절 */
export function importKey(raw: string): boolean {
  const key = raw.trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return false;
  localStorage.setItem(KEY, key);
  return true;
}

export type RankRoom = 'beginner' | 'upper';

export interface Matched {
  code: string;
  host: boolean;
  room: RankRoom;
  opponent: string;
}

export interface RankedHooks {
  /** 줄에 서 있음. 같은 방의 나 말고 몇 */
  onWaiting(room: RankRoom, others: number): void;
  onMatched(m: Matched): void;
  /** 서버 무응답. 등급전만 종료, 친선전은 그대로 */
  onDown(): void;
}

export interface Ranked {
  cancel(): void;
}

type Answer = {
  status?: 'waiting' | 'matched' | 'none';
  code?: string;
  host?: boolean;
  room?: RankRoom;
  opponent?: string;
  others?: number;
};

/**
 * 줄서기. 5초마다 알리고 짝이 나면 `onMatched`. 돌려주는 것으로 나감
 * - 알림 하나가 곧 물어보기. `POST` 답에 짝 여부가 실려 옴
 */
export function enterQueue(game: string, name: string, hooks: RankedHooks): Ranked {
  const key = guestKey();
  let alive = true;
  let misses = 0;
  const stop = (): void => {
    alive = false;
    window.clearInterval(timer);
  };
  const beat = async (): Promise<void> => {
    if (!alive) return;
    let a: Answer;
    try {
      const res = await fetch(`${HOST}/kl/arcade/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, game, name })
      });
      if (!res.ok) throw new Error(String(res.status));
      a = (await res.json()) as Answer;
      misses = 0;
    } catch {
      /* 세 번은 봐줌. 회선이 잠깐 끊긴 것과 서버 죽음은 첫 실패로 구분 불가 */
      if (++misses < 3) return;
      stop();
      hooks.onDown();
      return;
    }
    if (!alive) return;
    if (a.status === 'matched' && a.code) {
      stop();
      hooks.onMatched({
        code: a.code,
        host: Boolean(a.host),
        room: a.room === 'upper' ? 'upper' : 'beginner',
        opponent: String(a.opponent ?? '')
      });
      return;
    }
    hooks.onWaiting(a.room === 'upper' ? 'upper' : 'beginner', Math.max(0, Number(a.others ?? 0)));
  };
  const timer = window.setInterval(() => void beat(), BEAT_MS);
  void beat();
  return {
    cancel: () => {
      if (!alive) return;
      stop();
      /* 창 닫는 길에도 가야 하므로 `keepalive`. 안 빼면 15초간 유령과 짝 */
      void fetch(`${HOST}/kl/arcade/queue/${encodeURIComponent(key)}`, { method: 'DELETE', keepalive: true }).catch(() => {});
    }
  };
}
