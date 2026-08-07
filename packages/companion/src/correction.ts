import { stripParticle, worthWondering } from './curiosity';
import type { MemoryEntry } from './types';

/**
 * 고쳐 주기 — 「아니야, 그거 틀렸어」를 말로 할 수 있게.
 *
 * 얘는 조수님에 대해 아는 것을 스스로 졸여서 쌓는다(16회차). 졸이는 건 두뇌가 하니 **가끔
 * 틀린 걸 배운다.** 그런데 지금까지 그걸 고칠 방법이 **창을 열고 목록에서 지우는 것뿐**이었다.
 * 대화하다가 「아니 그거 아니야」라고 해도 아무 일도 안 일어났다.
 *
 * 틀린 걸 못 고치는 상대는 금방 답답해진다. 게다가 잘못 안 것은 그대로 남아 다음 대화의
 * 재료가 되므로 **틀림이 굳는다.**
 *
 * 두 가지를 한다.
 * 1. **받아들이게 한다.** 두뇌한테 「방금 한 말이 틀렸다고 한다」고 알려 준다 — 우기지 말라고.
 * 2. **아는 것에서 지운다.** 다만 **함부로 지우지 않는다** — 무엇을 지울지는 조수님이 방금
 *    부정한 그 얘기에서만 고른다. 「아니야」 한마디에 아는 것을 다 지우면 그건 고치기가
 *    아니라 기억상실이다.
 */
export interface Correction {
  /** 무엇을 부정했나 — 얘가 방금 한 말. */
  denied: string;
  /** 아는 것에서 지울 만한 낱말들 (없을 수도 있다). */
  keys: string[];
  /** 조수님이 대신 알려 준 게 있나. */
  instead: string | null;
}

const 부정 = /(아니야|아니고|아닌데|아니라|틀렸|잘못|그게 아니|안 그래|안그래|내가 언제|그런 적 없|한 적 없|아니거든)/;
const 맞장구부정 = /^(아니|아니요|아뇨|노)[.…!?\s]*$/;

/** 이 말이 「틀렸다」는 뜻인가. */
export function deniesSomething(text: string): boolean {
  const t = text.trim();
  return 부정.test(t) || 맞장구부정.test(t);
}

/**
 * 고칠 거리를 뽑는다. 얘가 방금 한 말이 없으면 null — 부정할 대상이 없다.
 *
 * 지울 낱말은 **얘가 한 말**에서 고른다. 조수님이 「아니야」라고만 했을 때 조수님 말에서
 * 뽑으면 「아니」를 지우려 들기 때문이다.
 */
export function findCorrection(said: string, lastSaid: MemoryEntry | undefined): Correction | null {
  if (deniesSomething(said) === false) return null;
  if (lastSaid === undefined || lastSaid.role !== 'said') return null;

  const denied = lastSaid.text.trim();
  // 「아니야, X 야」처럼 대신 알려 준 게 있으면 그것도 들고 간다.
  const 나머지 = said.replace(부정, '').replace(/^[,\s.…]+/, '').trim();

  // 지울 낱말은 **얘 말과 조수님의 정정문 양쪽**에서 뽑는다.
  //
  // 처음엔 얘 말에서만 뽑았는데, 얘가 「싫어하잖아…」처럼 짧게 답하면 **지울 낱말이 하나도
  // 안 나온다**(실측 33회차: 받아들이기는 했는데 아는 것은 그대로였다). 무엇에 대한 얘기인지는
  // 조수님이 고쳐 주는 문장에 들어 있다 — 「아니야, 나 커피 진짜 좋아해」의 「커피」.
  const keys = [...뽑기(denied), ...뽑기(나머지)].filter((w, i, all) => all.indexOf(w) === i);

  return { denied, keys, instead: 나머지.length >= 2 ? 나머지 : null };
}

/** 지울 만한 낱말을 뽑는다. 조사를 떼야 「커피를」이 아니라 「커피」로 지운다. */
function 뽑기(text: string): string[] {
  return text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => stripParticle(w.trim()))
    .filter((w) => worthWondering(w) && 나아님.has(w) === false);
}

/** 사람을 가리키거나 부정하는 말은 지울 거리가 아니다. */
const 나아님 = new Set(['조수님', '조수', '아니', '아니야', '진짜', '정말', '이거', '그거']);

/**
 * 아는 것에서 지운다. 몇 줄을 지웠는지 돌려준다.
 *
 * **지울 게 없으면 아무것도 안 한다.** 「아니야」 한마디에 통째로 비우는 일은 없다.
 */
export function applyCorrection(
  correction: Correction,
  forget: (keyword: string) => boolean,
  max = 2,
): string[] {
  const 지운것: string[] = [];
  for (const key of correction.keys) {
    if (지운것.length >= max) break;
    if (forget(key)) 지운것.push(key);
  }
  return 지운것;
}

/**
 * 두뇌에 넘길 한 줄.
 *
 * **우기지 말라고 한다.** 잘못 안 걸 지적받았을 때 변명하거나 「그런 뜻이 아니었다」고 하는
 * 게 가장 나쁘다. 그리고 **과하게 사과하지도 말라**고 한다 — 곁에 있는 사이에 굽신거리면
 * 그것도 결이 아니다.
 */
export function correctionNote(correction: Correction, erased: readonly string[] = []): string {
  const 지움 = erased.length > 0 ? ` 잘못 알고 있던 것(${erased.join(', ')})은 지웠다.` : '';
  const 대신 = correction.instead === null ? '' : ` 조수님 말로는 「${correction.instead.slice(0, 40)}」 라고 한다.`;
  return (
    `방금 네가 한 말(「${correction.denied.slice(0, 30)}」)이 틀렸다고 한다.${대신}${지움} ` +
    '우기거나 변명하지 마라. 그렇다고 굽신거리지도 마라 — 짧게 받아들이고 넘어가라.'
  );
}
