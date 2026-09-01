/**
 * 서버가 다시 셈한 것과 보고가 어긋나면 점수가 안 움직이는가 (change.arcade-online)
 *
 * - 여기서 제일 중요한 것은 **못 셌을 때 통과시키는가**. 묶음이 안 구워진 배포에서
 *   점수가 통째로 멈추면 그게 조작보다 나쁨
 * - 진짜 커널은 안 부름. 이 자리에서 잴 것은 판정을 어떻게 쓰는가
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { agreesWithTape as verifyOutcome, setVerifier, verifierReady } from './arcade-verify';

const agreesWithTape = (tape: unknown, seats: string[], ranks: string[]) =>
  verifyOutcome(tape, seats, { placements: ranks.map((id) => [id]) });

const SEATS = ['a', 'b'];
const TAPE = { game: 'gomoku', seed: 1, seats: [{}, {}], moves: [] };

afterEach(() => setVerifier(null));

describe('패보로 다시 셈하기', () => {
  it('묶음이 없으면 통과시킨다. 점수가 멈추면 안 됨', () => {
    setVerifier(null);
    expect(verifierReady()).toBe(false);
    const out = agreesWithTape(TAPE, SEATS, ['b', 'a']);
    expect(out.checked).toBe(false);
    expect(out.agrees).toBe(true);
  });

  it('패보가 없어도 통과시킨다', () => {
    setVerifier(() => ({ ok: true, ranks: [0, 1], scores: [1, 0], finished: true }));
    const out = agreesWithTape(null, SEATS, ['b', 'a']);
    expect(out.checked).toBe(false);
    expect(out.agrees).toBe(true);
  });

  it('서버가 못 세면 통과시킨다. 못 셌다는 거짓말이 아니다', () => {
    setVerifier(() => ({ ok: false, why: '모르는 놀이' }));
    const out = agreesWithTape(TAPE, SEATS, ['a', 'b']);
    expect(out.checked).toBe(false);
    expect(out.why).toBe('모르는 놀이');
  });

  it('안 끝난 판은 안 센다', () => {
    setVerifier(() => ({ ok: true, ranks: [0, 1], scores: [1, 0], finished: false }));
    expect(agreesWithTape(TAPE, SEATS, ['a', 'b']).checked).toBe(false);
  });

  it('맞으면 맞다고 한다', () => {
    setVerifier(() => ({ ok: true, ranks: [0, 1], scores: [1, 0], finished: true }));
    const out = agreesWithTape(TAPE, SEATS, ['a', 'b']);
    expect(out.checked).toBe(true);
    expect(out.agrees).toBe(true);
    expect(out.served).toEqual({ placements: [['a'], ['b']] });
  });

  it('거꾸로 보고하면 어긋난다고 한다', () => {
    setVerifier(() => ({ ok: true, ranks: [0, 1], scores: [1, 0], finished: true }));
    const out = agreesWithTape(TAPE, SEATS, ['b', 'a']);
    expect(out.checked).toBe(true);
    expect(out.agrees).toBe(false);
  });

  it('점수가 같으면 같은 자리에 묶어야 한다', () => {
    setVerifier(() => ({ ok: true, ranks: [0, 1], scores: [3, 3], finished: true }));
    expect(verifyOutcome(TAPE, SEATS, { placements: [['b', 'a']] }).agrees).toBe(true);
    expect(agreesWithTape(TAPE, SEATS, ['b', 'a']).agrees).toBe(false);
  });

  it('자리 수가 다르면 안 센다', () => {
    setVerifier(() => ({ ok: true, ranks: [0, 1, 2], scores: [1, 0, 0], finished: true }));
    expect(agreesWithTape(TAPE, SEATS, ['a', 'b']).checked).toBe(false);
  });
});
