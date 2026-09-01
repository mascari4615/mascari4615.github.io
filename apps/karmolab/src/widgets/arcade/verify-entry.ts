/**
 * 서버가 판을 다시 셈하는 문 (change.arcade-online)
 *
 * 여태 등급 점수는 **브라우저 말만 믿고** 움직였다. 그 판 전원이 같은 순서를 보내야
 * 반영되므로 혼자 하는 거짓말은 막혔지만, 판을 굴리는 주인이 커널을 손대면 막을 길이
 * 없었음. 주인이 곧 심판
 *
 * 커널은 화면도 그물망도 안 쓰고 결정적. 씨앗과 누른 것만 있으면 같은 판이 나옴
 * 그래서 **서버가 그 판을 다시 굴려 승자를 제 손으로 셀 수 있다.**
 *
 * 이 파일은 그 문 하나만. 서버가 붙잡을 표면을 좁게 두려고 따로 둠
 * (놀이 명부와 커널 전체를 서버가 알 필요는 없음).
 */
import { gameById } from './index';
import { playback, type Tape } from './replay';

export interface Verdict {
  ok: boolean;
  /** 왜 못 셌나. `ok` 가 거짓일 때만 */
  why?: string;
  /** 서버가 센 순서. 잘한 순서, 첫째가 1위 */
  ranks?: number[];
  /** 자리별 점수. 사람이 볼 때 쓴다 */
  scores?: number[];
  finished?: boolean;
}

/** 되살릴 수 있는 모양인가. 남이 보낸 값이라 하나씩 본다 */
function shaped(tape: unknown): tape is Tape<unknown> {
  const t = tape as Partial<Tape<unknown>> | null;
  if (!t || typeof t !== 'object') return false;
  if (typeof t.game !== 'string' || typeof t.seed !== 'number') return false;
  if (!Array.isArray(t.seats) || t.seats.length < 1 || t.seats.length > 8) return false;
  if (!Array.isArray(t.moves) || t.moves.length > 20000) return false;
  return t.moves.every((m) => m && typeof m.at === 'number' && typeof m.seat === 'number');
}

/**
 * 패보를 되살려 순서를 셈. 서버에서 부름
 *
 * - 못 세면 거짓말이 아니라 **못 셌다**는 뜻. 부르는 쪽이 그 둘을 가름
 * - 같은 점수는 같은 등수. 순서 배열은 자리 번호를 잘한 차례로 늘어놓은 것
 */
export function verifyTape(tape: unknown): Verdict {
  if (!shaped(tape)) return { ok: false, why: '패보 모양이 아니다' };
  const game = gameById(tape.game);
  if (!game) return { ok: false, why: '모르는 놀이: ' + tape.game };
  try {
    const m = playback(game, tape as Tape<never>);
    const v = m.view();
    const scores = v.seats.map((s) => s.score);
    const ranks = scores
      .map((score, seat) => ({ score, seat }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.seat);
    return { ok: true, ranks, scores, finished: v.finished };
  } catch (e) {
    return { ok: false, why: '되살리다 멈춤: ' + (e instanceof Error ? e.message : String(e)) };
  }
}
