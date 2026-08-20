/**
 * 깨진 글자 걸러내기.
 *
 * 조수님이 「채팅에서 내 글씨가 깨져 나온다」고 알려 줬다. 확인해 보니 창에서 친 글이
 * 아니라 **밖에서 밀어 넣은 시험용 말**이 셸을 거치며 깨진 것이었다(60회차).
 *
 * 창만 쓰면 안 생기는 일이지만, 말을 밀어 넣는 창구는 창 말고도 열려 있다. 그리고
 * **한 번 들어오면 기억에 그대로 쌓인다** — 대화 기록에 남고, 졸여서 「아는 것」이 되고,
 * 사건으로도 담긴다. 사람이 안 한 말이 사람의 기억이 되는 것이다.
 *
 * 그래서 들어오는 자리에서 막는다. **막을 땐 왜 막았는지 말한다** — 조용히 버리면
 * 「보냈는데 아무 반응이 없다」가 되고, 그건 고장과 구분이 안 된다.
 *
 * 좁게 잡는다. 이모지·특수문자·외국어를 깨진 것으로 세면 멀쩡한 말이 막힌다.
 */

/** 글자가 깨졌다는 확실한 표시 — 되돌릴 수 없게 뭉개진 자리. */
const garbled = /�/g;

/**
 * 이 말이 깨졌나. 깨졌으면 왜인지, 아니면 null.
 *
 * 판단 근거는 **되돌릴 수 없는 글자(U+FFFD)의 비율**이다. 하나쯤은 진짜로 그 글자를
 * 쓴 것일 수 있으니 비율로 본다.
 */
export function isBroken(text: string): string | null {
  const text2 = String(text ?? '');
  if (text2.trim() === '') return null;
  const garbledCount = (text2.match(garbled) ?? []).length;
  if (garbledCount === 0) return null;
  const ratio = garbledCount / text2.length;
  // 한두 개 섞인 건 그냥 둔다 — 진짜로 그 글자를 붙여 넣었을 수도 있다.
  if (garbledCount < 3 && ratio < 0.2) return null;
  return `글자가 깨져 들어왔다 (${garbledCount}자 뭉개짐 · ${Math.round(ratio * 100)}%)`;
}

/**
 * 기억에서 깨진 줄을 골라낸다 — 이미 쌓인 것을 걷어낼 때.
 *
 * 지우는 건 여기서 안 한다. **무엇을 지울지 고르는 일과 실제로 지우는 일을 나눠 둔다** —
 * 지우기는 되돌릴 수 없어서, 무엇이 지워질지 먼저 볼 수 있어야 한다.
 */
export function brokenLines<T extends { text: string }>(entries: readonly T[]): T[] {
  return entries.filter((e) => isBroken(e.text) !== null);
}
