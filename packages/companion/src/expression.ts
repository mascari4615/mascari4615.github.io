import type { Feeling } from './feeling';
import { 평소 } from './feeling';

/**
 * 표정 신호 — 얼굴이 지금 어떤가.
 *
 * 레퍼런스 쪽은 표정을 두 갈래로 얻는다. ① 두뇌가 말 앞에 `[놀람]` 같은 표를 달면 그걸
 * 뽑아 쓰고(그 표는 **소리로 읽지 않는다**), ② 그것 말고도 지금 상태에 따라 얼굴이 바뀐다.
 * 그리고 그 표정이 하는 일은 예쁜 게 아니라 **지금 무슨 상태인지 알리는 것**이다 — 듣는
 * 중인지, 생각 중인지, 기분이 상했는지.
 *
 * 우리에겐 그 신호가 아예 없었다. 마음(21회차)도 목소리 결(24회차)도 생겼는데 **얼굴로는
 * 아무것도 안 나갔다.**
 *
 * 여기서는 **신호만 만든다. 얼굴 자체는 안 건드린다** — 생김새는 다른 세션 몫이다. 그쪽이
 * 이 신호를 받아 모델에 물리기만 하면 되도록, 받는 자리를 미리 열어 둔다.
 *
 * 두뇌가 표를 안 달아도 돌아가야 한다. 표에만 기대면 두뇌를 갈아 끼우는 순간 얼굴이 죽는다.
 * 그래서 **마음에서 저절로 유도**하고, 표가 있으면 그게 이긴다.
 */
export type Expression = '평온' | '웃음' | '놀람' | '뾰족' | '처짐' | '졸림';

const 표정들: readonly Expression[] = ['평온', '웃음', '놀람', '뾰족', '처짐', '졸림'];

/** 아는 표정인가. */
export function isExpression(x: string): x is Expression {
  return (표정들 as readonly string[]).includes(x);
}

/**
 * 말 앞에 붙은 표를 뽑아낸다.
 *
 * **표는 반드시 말에서 지운다.** 안 지우면 얘가 「대괄호 놀람 대괄호 뭐야」라고 소리 내어
 * 읽는다 — 표정을 붙이려다 말을 망치는 것이다.
 */
export function stripExpression(said: string): { text: string; tagged: Expression | null } {
  let tagged: Expression | null = null;
  const text = said
    .replace(/\[([^\]]{1,8})\]/g, (whole, inner: string) => {
      const 다듬은 = inner.trim();
      if (isExpression(다듬은) === false) return whole;
      if (tagged === null) tagged = 다듬은;
      return '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { text, tagged };
}

/** 두뇌에 알려 줄 한 줄 — 어떤 표를 쓸 수 있는지. */
export function expressionNote(): string {
  return (
    `말 앞에 얼굴을 표로 달 수 있다: ${표정들.map((e) => `[${e}]`).join(' ')}. ` +
    '꼭 달 필요는 없다 — 안 달면 결에 맞춰 알아서 간다. 표는 맨 앞에 하나만.'
  );
}

export interface ExpressionInput {
  /** 지금 마음. */
  feeling: Feeling;
  /** 지금 하려는 말. */
  text?: string;
  /** 두뇌가 표를 달았으면 그것. */
  tagged?: Expression | null;
}

const 웃는말 = /(ㅋ|ㅎ|하하)/;
const 놀란말 = /(어\?|엇|헉|뭐\?|진짜\?)/;

/**
 * 지금 어떤 얼굴인가.
 *
 * 두뇌가 단 표가 가장 세다 — 얘가 스스로 고른 것이니까. 그 다음이 말 내용, 그 다음이 마음.
 * 아무것도 없으면 평온이다. **평온이 기본인 게 중요하다** — 늘 뭔가 짓고 있으면 그건
 * 표정이 아니라 경련이다.
 */
export function expressionFrom(input: ExpressionInput): Expression {
  if (input.tagged != null) return input.tagged;

  const text = (input.text ?? '').trim();
  if (text !== '' && 웃는말.test(text)) return '웃음';
  if (text !== '' && 놀란말.test(text)) return '놀람';

  const v = input.feeling.valence - 평소.valence;
  const a = input.feeling.arousal - 평소.arousal;
  if (a >= 0.25) return v < -0.15 ? '뾰족' : '놀람';
  if (a <= -0.45) return '졸림';
  if (a <= -0.25) return v > 0.15 ? '평온' : '처짐';
  if (v >= 0.3) return '웃음';
  if (v <= -0.3) return '뾰족';
  return '평온';
}

/**
 * 얼굴이 자주 바뀌면 그게 더 이상하다 — 바뀐 것만 흘려보낸다.
 *
 * 말 한 조각마다 얼굴 신호를 쏘면 받는 쪽이 깜빡이게 된다. 실제로 달라졌을 때만 알린다.
 */
export class Face {
  private now: Expression = '평온';

  /** 이번에 바뀌었으면 새 표정, 그대로면 null. */
  changeTo(next: Expression): Expression | null {
    if (next === this.now) return null;
    this.now = next;
    return next;
  }

  get current(): Expression {
    return this.now;
  }

  /** 말이 끝났으니 평온으로 돌아간다. 표정이 남아 굳지 않게. */
  rest(): Expression | null {
    return this.changeTo('평온');
  }
}
