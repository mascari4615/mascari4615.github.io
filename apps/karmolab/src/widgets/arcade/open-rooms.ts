/**
 * 공개로 연 방 — 올리고, 살아 있다고 알리고, 본다 (arcade-next ★2)
 *
 * 방 자체는 여전히 **브라우저끼리** 돈다. 여기서 하는 일은 「이 코드로 모이는 중」이라는
 * 쪽지를 한 군데(욘봇)에 붙였다 떼는 것뿐이다. 그래서 그 서버가 죽어도 **이미 열린 방은
 * 그대로 돌아가고**, 로비도 안 깨진다 — 못 물어보면 빈 목록으로 본다.
 *
 * 올리는 것은 **명시적이다.** 지금의 「같이」는 그대로 비공개(링크 아는 사람만)고, 여기 오르는
 * 것은 「같이 찾기」로 연 방뿐이다. 기본값을 어느 쪽으로 두든 한쪽은 놀라므로 단추로 가른다.
 */

const HOST = 'https://yawnbot.mascari4615.com';
/** 살아 있다고 알리는 주기 — 서버가 10분에 지우므로 그보다 넉넉히 자주. */
const BEAT_MS = 3 * 60 * 1000;

export interface OpenRoom {
  code: string;
  game: string;
  host: string;
}

/** 지금 열린 방들. 못 물어보면 **빈 목록** — 로비가 그 때문에 멈추면 안 된다. */
export async function listRooms(): Promise<OpenRoom[]> {
  try {
    const res = await fetch(`${HOST}/kl/arcade/rooms`, { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as { rooms?: OpenRoom[] };
    return Array.isArray(body.rooms) ? body.rooms : [];
  } catch {
    return [];
  }
}

/**
 * 방을 올리고 **계속 살아 있다고 알린다.** 돌려주는 것을 부르면 내려간다.
 *
 * 알림을 안 하면 서버가 10분 뒤에 지운다 — 창을 닫고 간 사람의 방이 목록에 남지 않게.
 * 그래서 이 자리는 「올리기」가 아니라 「들고 있기」다.
 */
export function holdRoom(room: OpenRoom): () => void {
  let alive = true;
  const beat = (): void => {
    if (!alive) return;
    void fetch(`${HOST}/kl/arcade/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room)
    }).catch(() => {
      /* 못 올려도 방은 돈다 — 목록에 안 뜰 뿐이다 */
    });
  };
  beat();
  const timer = window.setInterval(beat, BEAT_MS);
  return () => {
    alive = false;
    window.clearInterval(timer);
    /* 창을 닫는 길에도 가야 하므로 `keepalive` — 안 붙이면 브라우저가 중간에 끊는다. */
    void fetch(`${HOST}/kl/arcade/rooms/${encodeURIComponent(room.code)}`, {
      method: 'DELETE',
      keepalive: true
    }).catch(() => {});
  };
}
