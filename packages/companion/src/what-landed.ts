import { conversationOnly, type ConversationOptions } from './conversation';
import type { MemoryEntry } from './types';

/**
 * 무엇이 통했나. 얘가 한 말에 사람이 어떻게 반응했는지 읽는다.
 *
 * 레퍼런스에서 가장 많이 지적되는 것: 스트리머 AI 의 인격은 처음부터 설계된 게 아니라
 * **곁에 있는 사람들의 반응이 빚은 것**이다. 웃어 준 쪽이 굵어지고 식은 쪽은 말라 없어진다.
 * 만드는 사람이 너무 똑똑하게 만들면 인격이 지워진다고 말하는 이유도 같다. 정답을
 * 고르는 기계에는 빚어질 자리가 없다.
 *
 * 우리 얘는 인격이 **적어 둔 글 한 장에 박제**돼 있다. 몇 백 마디를 나눠도 뭐가 통했는지
 * 모르니, 통한 말도 식은 말도 똑같은 확률로 또 한다.
 *
 * 그런데 신호는 이미 기록에 있다. 얘가 말한 **다음에 사람이 무엇을 했는가**. 웃었나,
 * 바로 받았나, 되물었나, 아니면 한참 있다 응 한 마디였나. 새로 모을 것이 없다.
 *
 * 인격을 **고쳐 쓰지는 않는다.** 통한 말 몇 개를 보여 줄 뿐이다. 규칙으로 박으면 얘는
 * 규칙을 따르는 기계가 되고, 그건 빚어지는 것과 반대다.
 */
export interface Landing {
  /** 얘가 한 말. */
  said: string;
  /** 통했나. */
  landed: boolean;
  /** 무엇을 보고 그렇게 봤나 (사람이 읽는 말). */
  why: string;
}

export interface LandingOptions extends ConversationOptions {
  /** 이보다 빨리 받아 주면 살아 있는 반응으로 본다. */
  quickMs?: number;
  /** 이보다 오래 걸리면 식은 것으로 본다. */
  coldMs?: number;
}

const laugh = /(ㅋ|ㅎ|😂|🤣|ㅠㅋ|하하|ㄲㄲ)/;
const flat = /^(응|어|ㅇㅇ|그래|ok|오케이|넵|음)[....!?~ ]*$/i;

/**
 * 얘의 한마디와 바로 다음에 온 사람 말을 놓고 잰다.
 *
 * 사람이 아무 말도 안 했으면 잴 것이 없다. 조용한 것은 식은 것과 다르다. 자리를 비웠을
 * 수도 있고, 그냥 곁에 있는 게 좋았을 수도 있다. 모르는 것을 아는 척하지 않는다.
 */
export function reactionTo(
  said: MemoryEntry,
  reply: MemoryEntry | undefined,
  options: LandingOptions = {},
): Landing | null {
  if (said.role !== 'said') return null;
  if (reply === undefined || reply.role !== 'sensed') return null;

  const quick = options.quickMs ?? 30_000;
  const cold = options.coldMs ?? 180_000;
  const elapsedMs = reply.at - said.at;
  const answer = reply.text.trim();

  if (laugh.test(answer)) return { said: said.text, landed: true, why: '웃었다' };
  // 되물음은 **바로 와야** 되물음이다. 한참 있다 던진 물음은 내 말을 받은 게 아니라
  // 새로 꺼낸 얘기다 (실제 기록에서 이걸 통한 것으로 잘못 세고 있었다).
  if (answer.endsWith('?') && elapsedMs < cold) return { said: said.text, landed: true, why: '되물었다' };
  if (elapsedMs <= quick && answer.length >= 8 && flat.test(answer) === false) {
    return { said: said.text, landed: true, why: '바로 받아서 이어 갔다' };
  }
  if (flat.test(answer)) return { said: said.text, landed: false, why: '한 마디로 넘겼다' };
  if (elapsedMs >= cold) return { said: said.text, landed: false, why: '한참 있다 딴 얘기를 했다' };

  return null;
}

/** 오간 말을 훑어 통한 것과 식은 것을 가려낸다. 오래된 것이 앞. */
/**
 * **가짜 두뇌가 한 말인가** (TASK-KAR-201).
 *
 * `echoBrain` 은 LLM 없이 코어가 도는지 보려고 만든 가짜 두뇌다. 방금 들은 감각을
 * (echo) ... 로 그대로 돌려준다. 그런데 그 되울림이 **얘가 한 말로 기억에 남았다.**
 * 143회차에 세어 보니 **4516줄 중 128줄**이었고, 세 군데를 오염시키고 있었다:
 *
 *   ① 조수님이 받아 준 내 말. 통한 말 본보기가 가짜 두뇌 것이다
 *   ② 말투가 굳었다 판정. 가짜 두뇌의 접두사를 얘 말버릇으로 오인한다
 *   ③ 그 문장이 화면 감각을 그대로 옮긴 것이라 창은 Fa 같은 토막이 남는다 . 
 *      98회차의 ⠂ F만 띄워져 있네와 같은 모양이다
 */
export function fromFakeBrain(text: string): boolean {
  return /^\(echo\)\s+\S/.test(text.trim());
}

export function whatLanded(entries: readonly MemoryEntry[], options: LandingOptions = {}): Landing[] {
  /* 가짜 두뇌가 한 말은 얘 말이 아니다. 이미 남은 128줄도 여기서 걸러진다. */
  const talk = conversationOnly(entries, options)
    .filter((one) => !(one.role === 'said' && fromFakeBrain(one.text)));
  const out: Landing[] = [];
  for (let i = 0; i < talk.length - 1; i += 1) {
    const measured = reactionTo(talk[i], talk[i + 1], options);
    if (measured !== null) out.push(measured);
  }
  return out;
}

export interface LandingNoteOptions extends LandingOptions {
  /** 통한 말, 식은 말을 각각 몇 개까지 보여 줄지. */
  howMany?: number;
}

/**
 * 두뇌에 넘길 한 줄. 이런 게 통했다.
 *
 * 짧게 유지한다. 길게 늘어놓으면 이게 인격을 덮어 버린다. 그리고 **하라고 시키지 않는다** . 
 * 통한 것을 보여 주고 판단은 얘에게 맡긴다.
 */
export function landingNote(entries: readonly MemoryEntry[], options: LandingNoteOptions = {}): string {
  const howMany = options.howMany ?? 2;
  const all = whatLanded(entries, options);
  const ok = all.filter((l) => l.landed).slice(-howMany);
  const cooled = all.filter((l) => l.landed === false).slice(-howMany);
  if (ok.length === 0 && cooled.length === 0) return '';

  const show = (ls: Landing[]) => ls.map((l) => `${l.said.slice(0, 30)}(${l.why})`).join(', ');
  const parts: string[] = [];
  if (ok.length > 0) parts.push(`조수님이 받아 준 내 말: ${show(ok)}`);
  if (cooled.length > 0) parts.push(`시들했던 내 말: ${show(cooled)}`);

  return `${parts.join('. ')}. 흉내 내라는 게 아니다. 어느 쪽이 조수님에게 가 닿는지 알아 두라는 것이다.`;
}
