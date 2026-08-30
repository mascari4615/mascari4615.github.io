/**
 * 판을 편지로. 방 없이 며칠에 걸쳐 두는 놀이 (TASK-KL-264 D5)
 *
 * 오목이나 함대 찾기를 같이 두려면 지금은 **둘이 동시에 창을 열고 있어야** 한다. 방을 만들고
 * 링크를 보내고 상대가 들어올 때까지 기다리는 비용이, 한 수 두는 비용보다 크다. 그래서
 * 실제로는 아무도 안 둔다.
 *
 * 게임피죤이 하던 그것: **한 수 두고 링크를 보낸다.** 상대가 아무 때나 열어서 한 수 두고
 * 링크를 돌려보낸다. 서버도 방도 필요 없다. 판 전체가 링크 안에 있다.
 *
 * 되는 이유는 앞 걸음들 때문이다. 커널이 결정적이고(같은 씨앗 = 같은 판) 시계가 칸 단위라,
 * **씨앗과 수 목록**이면 판이 되살아난다(`replay.ts`). 여기서는 그걸 글자로 접었다 편다.
 *
 * 한 가지가 더 줄어든다: **비동기 판에는 봇이 없다.** 사람 둘이 번갈아 두므로 몇 시에
 * 두었나가 판에 아무 영향을 안 준다. 시각을 칸 번호로 다시 매겨도 같은 판이 나온다.
 * 그래서 편지에는 시각을 안 싣는다. 오목 서른 수가 300자 남짓이다.
 *
 * 링크에 담는 이유(서버에 안 담는 이유): 담아 둘 서버가 없고, 있어도 판 하나에 주소 하나를
 * 만들어 두면 그 주소가 사라지는 날 판도 사라진다. 링크는 카카오톡 대화방에 남는다.
 */

import { Match } from './kernel';
import type { GameDef, GameOpts } from './types';
import { toolPage } from '../../lib/site-base';

/** 편지 한 통 = 판 하나. */
export interface Letter {
  game: string;
  seed: number;
  /** 자리 이름 (사람만. 봇은 비동기 판에 없다) */
  who: string[];
  /** 둔 수, 순서대로. 자리는 차례에서 나오므로 안 싣는다. */
  moves: unknown[];
  /** 시작할 때 고른 값 (판 크기 등). 안 실으면 받는 쪽이 다른 판을 편다 */
  opts?: GameOpts;
}

/** 남이 준 값이라 못 믿는다. 숫자와 참거짓만 남긴다 */
function safeOpts(v: unknown): GameOpts {
  const out: Record<string, number | boolean> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === 'number' || typeof x === 'boolean') out[k] = x;
    }
  }
  return out;
}

/** 링크가 감당할 길이. 넘으면 편지로는 못 보낸다. 그때는 방을 열어야 한다. */
export const MAX_CHARS = 1800;

/* 주소에 그대로 실을 수 있는 글자만 쓴다. `+/=` 는 링크에서 깨진다. */
const toUrl = (b64: string): string => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl = (s: string): string => s.replace(/-/g, '+').replace(/_/g, '/');

/** 편지를 접는다. 너무 길면 null. 부르는 쪽이 이건 방으로 하세요라고 말할 수 있게. */
export function fold(letter: Letter): string | null {
  try {
    const json = JSON.stringify([letter.game, letter.seed, letter.who, letter.moves, letter.opts ?? {}]);
    /* 한글 이름이 들어오므로 UTF-8 로 바꾼 뒤 접는다. `btoa` 는 바이트만 받는다. */
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const packed = toUrl(btoa(bin));
    return packed.length > MAX_CHARS ? null : packed;
  } catch {
    return null;
  }
}

/** 편지를 편다. 못 읽으면 null. 남이 준 글자라 못 믿는다. */
export function unfold(packed: string): Letter | null {
  try {
    const bin = atob(fromUrl(packed.trim()));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
    /* 옛 편지는 넷이다. 다섯째(고른 값)가 나중에 붙었으므로 없어도 편다 */
    if (!Array.isArray(raw) || raw.length < 4 || raw.length > 5) return null;
    const [game, seed, who, moves, opts] = raw as [unknown, unknown, unknown, unknown, unknown];
    if (typeof game !== 'string' || typeof seed !== 'number') return null;
    if (!Array.isArray(who) || !who.every((n) => typeof n === 'string')) return null;
    if (!Array.isArray(moves)) return null;
    return { game, seed, who, moves, opts: safeOpts(opts) };
  } catch {
    return null;
  }
}

/** 편지를 담은 링크. 방 링크(`?r=`)와 다른 자리를 쓴다. 둘은 다른 놀이 방식이다. */
export function letterLink(toolPath: string, packed: string): string {
  const path = toolPath.startsWith('/') ? toolPath : toolPage(toolPath);
  return `${location.origin}${path}?m=${packed}`;
}

/** 주소에 편지가 실려 있으면 편다. */
export function letterFromUrl(): Letter | null {
  const q = new URLSearchParams(location.search).get('m');
  return q ? unfold(q) : null;
}

/**
 * 편지를 판으로 편다. 적힌 수를 처음부터 다시 둔다.
 *
 * 시각은 안 실었으므로 **칸 하나에 한 수**로 다시 매긴다. 봇이 없으니 그래도 같은 판이다
 * (봇이 있으면 뜸 들이는 시간이 판을 바꾸므로 이렇게 못 한다. 그래서 비동기 판에는 봇을 안 둔다).
 *
 * 못 두는 수가 섞여 있어도 커널이 조용히 흘린다. 남이 준 글자라 그 편이 낫다.
 */
export function deal<S, A>(game: GameDef<S, A>, letter: Letter): Match<S, A> {
  const seats = letter.who.map((name) => ({ name, bot: false }));
  const m = new Match(game, letter.seed, seats, letter.opts ?? {});
  let now = 0;
  letter.moves.forEach((action, i) => {
    m.dispatch(i % seats.length, action as A);
    now += 16;
    m.step(now);
  });
  /* 마지막 수로 판이 끝났으면 쉬는 시간을 넘겨 결과가 서게 한다. */
  m.step(now + 2000);
  return m;
}

/** 다음에 둘 자리. 수를 번갈아 두므로 개수에서 나온다. */
export const turnOf = (letter: Letter): number => letter.moves.length % Math.max(1, letter.who.length);
