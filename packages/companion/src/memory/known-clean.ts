import { repliedToInstruction } from '../meta-talk';

/**
 * 「아는 것」에 앎이 아닌 줄이 굳지 않게 한다.
 *
 * 103회차에 두뇌 시스템 자리를 찍어 보니 「이 사람에 대해 아는 것」이 통째로 이랬다:
 *
 * > 아직 아는 것이 없습니다.
 * > 이 대화는 창작물이나 상황극으로 보여서 조수님에 대한 사실적인 정보를 추출하기 어렵습니다.
 *
 * 둘 다 조수님에 대한 앎이 아니다. 하나는 **빈 상태 선언**이고, 하나는 졸이는 두뇌가
 * **우리에게 하는 말**이다. 그런데 그게 매 turn 시스템 자리에 실려 나갔다. 얘는 그걸
 * 「이 사람에 대해 아는 것」이라 믿고 말한다.
 *
 * 졸이는 프롬프트에는 이미 「'아는 것이 없습니다' 같은 말은 붙이지 마라」고 적혀 있다.
 * **말로 시킨 것은 안 지켜진다** — 42회차에 손을 시켰을 때도 0/10 이었다. 구조로 막는다.
 *
 * 입 앞 지킴이를 여기서 **다시 쓴다**(`repliedToInstruction`). 지킴이를 두 벌 만들면
 * 한쪽만 고쳐지고 다른 쪽이 조용히 낡는다.
 */

/** 「아직 아는 게 없다」는 선언 — 그건 앎이 아니라 앎의 부재다. */
const declaresNothing = /(아는\s*(것|게)\s*(이|가)?\s*(아직\s*)?없|정보가?\s*(아직\s*)?없|알아낼\s*(수\s*있는\s*)?(것|정보)|파악(된|한)\s*(것|정보)\s*(이|가)?\s*없)/;

/** 「못 하겠다」는 보고 — 사람에게 하는 말이 아니라 우리에게 하는 말이다. */
const reportsFailure = /(어렵습니다|어렵다|불가능|추출하기|판단하기\s*어|확인되지\s*않|알\s*수\s*없|죄송)/;

/** 대화 자체를 평가하는 말 — 앎이 아니라 감상이다. */
const judgesTheChat = /(이\s*대화는|대화(가|는)\s*[^\n]{0,20}(보인다|보여서|같습니다|같아\s*보)|상황극|롤플레이|창작물)/;

/**
 * 이 한 줄이 「조수님에 대한 앎」인가. 아니면 왜 아닌지.
 *
 * 좁게 잡는다 — 지나치게 걸러 내면 진짜 기억이 사라지고, 그건 오염보다 나쁘다.
 */
export function notKnowledge(line: string): string | null {
  const text = line.trim();
  if (text === '') return '빈 줄';
  if (declaresNothing.test(text)) return '앎이 없다는 선언 — 그건 앎이 아니다';
  if (reportsFailure.test(text)) return '못 하겠다는 보고 — 사람에게 하는 말이 아니다';
  if (judgesTheChat.test(text)) return '대화 자체에 대한 감상 — 이 사람에 대한 앎이 아니다';
  return repliedToInstruction(text) === null ? null : '무대 뒤 말';
}

/**
 * 앎인 줄만 남긴다. 하나도 안 남으면 빈 글.
 *
 * 부르는 쪽은 빈 글이 오면 **지금까지 아는 것을 그대로 둔다** — 오염된 새 글로 덮어쓰는
 * 것보다 낡은 앎을 두는 편이 낫다.
 */
export function onlyKnowledge(known: string): string {
  return known
    .split(/\r?\n/)
    .filter((line) => notKnowledge(line) === null)
    .join('\n')
    .trim();
}
