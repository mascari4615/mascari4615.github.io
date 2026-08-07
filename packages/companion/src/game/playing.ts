import { 아는말, judge, pickWord, play, startWordChain, type WordChain } from './word-chain';

/**
 * 놀이 중 — 대화 한가운데서 놀이가 시작되고 끝나는 자리.
 *
 * 놀이를 따로 만든 것과 **대화에 끼워 넣는 것**은 다른 일이다. 「끝말잇기 하자」 한마디로
 * 시작되고, 그만하자면 그만두고, 노는 중에는 아무 말이나 다 한 수로 받아야 한다.
 *
 * 노는 동안에는 **두뇌를 부르지 않는다.** 놀이는 주고받는 박자가 전부라서, 3초 뒤에 오는
 * 「사과!」는 이미 놀이가 아니다. 그래서 이미 있는 반사 이음매에 얹었다 — core 는 또 안
 * 고쳤다.
 *
 * 그만두는 길을 넉넉히 열어 뒀다. 빠져나올 수 없는 놀이는 놀이가 아니라 덫이다.
 */
export type PlayReply = { say: string; playing: boolean };

const 하자 = /(끝말잇기|끝말 잇기)/;
const 그만 = /(그만|관두|안 해|안해|됐어|스톱|stop|졌다|항복)/i;

export interface PlayOptions {
  /** 얘가 아는 말. 시험에서 갈아 끼운다. */
  words?: readonly string[];
  /** 고르는 손. */
  roll?: () => number;
}

/**
 * 놀이판을 들고 있는 것. 대화 한 줄을 넣으면 놀이가 받았는지 아닌지 돌려준다.
 *
 * 놀이가 안 받으면 null — 그러면 평소대로 두뇌가 답한다. 놀이가 대화를 가로채면 안 된다.
 */
export class Playing {
  private chain: WordChain | null = null;

  constructor(private readonly options: PlayOptions = {}) {}

  /** 지금 노는 중인가. */
  get on(): boolean {
    return this.chain !== null;
  }

  /** 지금까지 나온 말 (진단용). */
  get used(): readonly string[] {
    return this.chain?.used ?? [];
  }

  /** 대화 한 줄을 받는다. 놀이가 안 받으면 null. */
  hear(said: string): PlayReply | null {
    const text = said.trim();

    if (this.chain === null) {
      if (하자.test(text) === false) return null;
      this.chain = startWordChain();
      // 시작은 얘가 낸다 — 「먼저 해」 하고 미루는 건 같이 노는 게 아니다.
      const 첫말 = pickWord(this.chain, this.words, this.roll);
      if (첫말 === null) {
        this.chain = null;
        return { say: '…아는 말이 없어. 다음에 하자.', playing: false };
      }
      this.chain = play(this.chain, 첫말, '나').chain;
      return { say: `좋아. ${첫말}.`, playing: true };
    }

    if (그만.test(text)) {
      const 몇개 = this.chain.used.length;
      this.chain = null;
      return { say: 몇개 >= 6 ? `…재밌었어. ${몇개}개나 했네.` : '…응, 그만하자.', playing: false };
    }

    // 노는 중이어도 **한 수처럼 생긴 말**만 한 수로 받는다.
    //
    // 처음엔 아무 말이나 다 한 수로 받았는데, 실제로 놀다 보니 판을 열어 둔 걸 잊고 딴 말을
    // 하면 「한글로만 해야지. 내가 이겼다」가 튀어나왔다(실측). 끝말잇기 수는 **낱말 하나**지
    // 문장이 아니다. 문장은 대화로 흘려보낸다 — 놀이가 대화를 잡아먹으면 안 된다.
    if (한수처럼생겼나(text) === false) return null;

    const 한수 = play(this.chain, text, '조수님');
    if (한수.chain.winner !== null) {
      this.chain = null;
      return { say: `${한수.judged.why} 내가 이겼다.`, playing: false };
    }

    const 낼말 = pickWord(한수.chain, this.words, this.roll);
    if (낼말 === null) {
      this.chain = null;
      return { say: `…${text[text.length - 1]}… 모르겠어. 내가 졌다.`, playing: false };
    }

    this.chain = play(한수.chain, 낼말, '나').chain;
    return { say: `${낼말}.`, playing: true };
  }

  /** 판을 접는다 (창을 닫거나 할 때). */
  stop(): void {
    this.chain = null;
  }

  private get words(): readonly string[] {
    return this.options.words ?? 아는말;
  }

  private get roll(): () => number {
    return this.options.roll ?? Math.random;
  }
}

/**
 * 이 말이 「한 수」처럼 생겼나.
 *
 * 낱말 하나여야 한다 — 띄어쓰기가 있거나 물음표·느낌표가 붙었으면 대화지 수가 아니다.
 * 다만 **틀린 수는 통과시킨다**(영어·한 글자) — 그건 규칙 위반으로 지는 자리지, 대화가
 * 아니다. 안 그러면 규칙이 없는 놀이가 된다.
 */
export function 한수처럼생겼나(said: string): boolean {
  const t = said.trim();
  if (t === '' || /[\s]/.test(t)) return false;
  if (/[?？!！.…,]/.test(t)) return false;
  return t.length <= 8;
}

/** 이 말이 놀이를 걸어오는 말인가 (놀이 밖에서 미리 보고 싶을 때). */
export function invitesPlay(said: string): boolean {
  return 하자.test(said.trim());
}

/** 판정만 빌려 쓰고 싶을 때. */
export { judge };
