/**
 * 지금 누가 놀고 있나. 열린 방 목록 (arcade-next ★2)
 *
 * 방, 구경, 편지까지 다 만들어 놓고도 **아무도 못 만난다.** 링크를 아는 사람만 오기 때문이다.
 * 혼자 오락실을 연 사람이 남을 만나는 길이 지금은 없다. 이 목록이 그 길이다.
 *
 * **방을 서버가 들고 있지 않다.** 판은 브라우저끼리(P2P) 돌고, 여기 남는 것은 이 코드로
 * 모이는 중이라는 쪽지 한 장뿐이다. 그래서 봇이 죽어도 이미 열린 방은 그대로 돌아간다.
 *
 * 규율:
 *  ① **올리는 것은 명시적이다.** 사이트의 같이는 그대로 비공개(링크 아는 사람만)고,
 *     여기 오르는 것은 같이 찾기로 연 방뿐이다. 기본값을 어느 쪽으로 두든 한쪽은 놀라므로,
 *     아예 다른 단추로 가른다.
 *  ② **금방 사라진다**(10분). 안 지우면 목록이 죽은 방으로 덮인다. 아무도 없네보다
 *     눌렀는데 아무도 없네가 나쁘다. 방 주인이 계속 살아 있다고 알리면 그만큼 늘어난다.
 *  ③ **아무 글자나 안 받는다.** 방 코드, 놀이 id 모양만, 이름은 길이를 자른다 . 
 *     그대로 남에게 보이는 값이다.
 *  ④ 저장은 **메모리뿐**이다. 10분짜리를 파일에 적으면 배포마다 죽은 방이 되살아난다.
 */
import express from 'express';
import type { Application, Request, Response } from 'express';

/** 이만큼 소식이 없으면 닫힌 방으로 본다. */
const TTL_MS = 10 * 60 * 1000;
/** 한 번에 보여 줄 방 수. 넘으면 새 방부터. */
const MAX = 30;
const NAME_MAX = 16;

export interface OpenRoom {
  code: string;
  game: string;
  host: string;
  /** 마지막으로 살아 있다고 알린 때 */
  at: number;
}

const rooms = new Map<string, OpenRoom>();

/** 죽은 방을 걷는다. 부를 때마다 훑어도 서른 개라 값이 안 든다. */
function sweep(now = Date.now()): void {
  for (const [code, r] of rooms) if (now - r.at > TTL_MS) { rooms.delete(code); closed.set(code, now); }
  for (const [code, at] of closed) if (now - at > TTL_MS) closed.delete(code);
}

const clean = (v: unknown, re: RegExp, max: number): string | null => {
  const s = String(v ?? '').trim().slice(0, max);
  return re.test(s) ? s : null;
};

/**
 * 이 코드가 **공개로 연 방**인가. 결과를 채널에 옮길지 정하는 자리가 이걸 묻는다 . 
 * 비공개 판을 채널에 옮기면 그건 중계가 아니라 감시다.
 *
 * 이미 닫힌 방도 참으로 본다(TTL 안이면): 판이 끝나고 방을 내린 **다음에** 결과가 오기 때문이다.
 */
export function wasOpen(code: string): boolean {
  sweep();
  return rooms.has(code) || closed.has(code);
}

/** 방금 닫힌 방들. 결과가 뒤늦게 와도 공개였다를 안다. */
const closed = new Map<string, number>();

/** 검사에서 쓰는 뒷문. 판마다 빈 목록에서 시작해야 서로를 안 본다. */
export function resetRooms(): void {
  rooms.clear();
  closed.clear();
}

export function registerArcadeRooms(app: Application): void {
  /**
   * 방을 올린다 / 살아 있다고 알린다. 같은 코드면 덮어쓴다. 알림이 곧 아직 있다다.
   */
  /* 몸통 읽기는 **이 길에만** 단다. 이 저장소가 그렇게 한다(`/kl/uploads` 와 같은 꼴).
     전역에 달면 남의 길이 이미 읽은 몸통을 두 번 읽는 일이 생긴다. */
  app.post('/kl/arcade/rooms', express.json({ limit: '4kb' }), (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const code = clean(body.code, /^[A-Z0-9]{4,12}$/, 12);
    const game = clean(body.game, /^[a-z0-9]{2,24}$/, 24);
    if (!code || !game) {
      res.status(400).json({ error: 'code, game 모양이 아니다' });
      return;
    }
    /* 이름은 모양을 안 따진다(한글, 이모지가 온다). 대신 길이를 자르고 줄바꿈을 없앤다. */
    const host = String(body.host ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || '누군가';
    sweep();
    rooms.set(code, { code, game, host, at: Date.now() });
    res.json({ ok: true, until: TTL_MS });
  });

  /** 방을 닫는다. 안 불러도 10분이면 사라지지만, 부르면 그 자리에서 깨끗해진다. */
  app.delete('/kl/arcade/rooms/:code', (req: Request, res: Response) => {
    const code = clean(req.params.code, /^[A-Z0-9]{4,12}$/, 12);
    if (code && rooms.delete(code)) closed.set(code, Date.now());
    res.json({ ok: true });
  });

  /** 지금 열린 방들. 로그인 없이 본다. 공개로 연 방이라 감출 것이 없다. */
  app.get('/kl/arcade/rooms', (_req: Request, res: Response) => {
    sweep();
    const list = [...rooms.values()].sort((a, b) => b.at - a.at).slice(0, MAX);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ rooms: list.map(({ code, game, host }) => ({ code, game, host })) });
  });
}
