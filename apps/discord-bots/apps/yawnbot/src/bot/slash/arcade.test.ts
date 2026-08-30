/**
 * `/오락실` 이 만드는 것 (TASK-KL-264 D4)
 *
 * 두 가지가 틀리면 조용히 나쁘다:
 *  ① **코드 알파벳이 사이트와 다르면**. 봇이 만든 방을 사이트가 못 알아보는 게 아니라,
 *     사람이 손으로 옮겨 적을 때만 틀린다(0/O, 1/I). 가끔만 안 되는 고장이 제일 나쁘다.
 *  ② **모르는 놀이를 링크에 실으면**. 주소에 그대로 들어가는 값이라 남의 말을 우리가 한다.
 */
import { describe, it, expect } from 'vitest';
import { makeCode, loadGames } from './arcade';

/** 사이트의 정본과 같아야 하는 알파벳 (`apps/karmolab/src/lib/room.ts`). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

describe('/오락실 방 코드', () => {
  it('다섯 글자', () => {
    expect(makeCode()).toHaveLength(5);
    expect(makeCode(7)).toHaveLength(7);
  });

  it('헷갈리는 글자(0, O, 1, I)를 안 쓴다. 소리 내어 읽어 주는 코드다', () => {
    const many = Array.from({ length: 400 }, () => makeCode()).join('');
    expect(many).not.toMatch(/[01OI]/);
    for (const ch of many) expect(ALPHABET).toContain(ch);
  });

  it('같은 코드를 연달아 주지 않는다', () => {
    const seen = new Set(Array.from({ length: 200 }, () => makeCode()));
    expect(seen.size).toBeGreaterThan(190);
  });
});

describe('/오락실 놀이 목록', () => {
  it('말 묶음에서 읽는다. 못 읽어도 빈 표일 뿐 안 터진다', () => {
    const games = loadGames();
    expect(Array.isArray(games)).toBe(true);
    for (const g of games) {
      expect(g.id).toMatch(/^[a-z0-9]+$/);
      expect(g.name.length).toBeGreaterThan(0);
    }
  });
});
