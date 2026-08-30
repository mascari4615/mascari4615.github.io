/**
 * 구경꾼이 보는 판. 아무의 비밀도 안 보이게 (TASK-KL-264 E2)
 *
 * 자리에 앉은 사람에게는 `redact(s, seat)` 로 **그 자리가 보면 안 되는 것**을 지워 보낸다.
 * 그런데 구경꾼에게는 지울 기준이 되는 자리가 없다. 여기서 흔한 실수가 둘이다:
 *
 *  ① **통째로 보낸다**. 화면이 안 그려도 값은 이미 건너간 뒤다(개발자 도구로 다 보인다).
 *     함대 찾기에서 구경꾼이 배 위치를 전부 아는 판이 된다.
 *  ② **없는 자리(-1)로 지운다**. 게임의 `redact` 는 이 자리가 못 보는 것을 지우므로,
 *     아무 자리도 아닌 -1 에게는 **아무것도 안 지워진다.** ①과 결과가 같다.
 *
 * 옳은 뜻은 하나다: 구경꾼은 **모두가 볼 수 있는 것만** 본다. 그래서 자리마다 한 번씩,
 * **전부 겹쳐 지운다.** 어느 자리든 못 보는 것이면 구경꾼도 못 본다. 게임이 뭘 감추는지
 * 이 파일은 몰라도 되고, 게임을 51개까지 늘려도 새로 적을 것이 없다.
 */
import type { GameDef } from './types';

/** 자리 수만큼 겹쳐 지운 판. 감출 것이 없는 게임이면 그대로 돌려준다. */
export function forWatcher<S>(
  game: Pick<GameDef<S, unknown>, 'redact'>,
  state: S,
  seats: number
): S {
  if (!game.redact) return state;
  let out = state;
  for (let i = 0; i < seats; i++) out = game.redact(out, i);
  return out;
}
