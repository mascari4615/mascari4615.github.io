/**
 * 안 한 걸 했다고 말하는 것 — 동반자에서 신뢰를 가장 빨리 깎는 것.
 *
 * 레퍼런스 쪽은 제 한계를 두고 괴로워하지 않는다 — 모르는 게 나오면 묻고, 못 하는 건 못
 * 한다고 하고 만다. 우리 위험은 그 반대다: 얘한테는 **실제로 하는 손**이 있어서(적어 두기,
 * 찾아보기, 열기, 알려 주기), 두뇌가 **손을 안 쓰고도 「해 뒀어」라고 말할 수 있다.**
 *
 * 그게 제일 나쁜 고장이다. 틀린 답은 고쳐 주면 되지만(33회차), **안 한 일을 했다고 하면**
 * 조수님은 그걸 믿고 지나간다. 나중에 메모가 없는 걸 알게 되는 순간 곁에 있는 것이 아니라
 * 못 믿을 것이 된다.
 *
 * 기계로 정확히 잴 수 있다. 손을 쓰면 말 안에 표가 남고 core 가 그걸 안다. **말은 「해 뒀어」인데
 * 쓴 손이 없으면** 그건 거짓이다.
 *
 * 조심할 것 하나: **하겠다는 말과 했다는 말은 다르다.** 「적어 둘게」는 앞으로의 얘기고
 * 「적어 뒀어」가 주장이다. 이걸 안 가르면 얘가 아무 약속도 못 하게 된다.
 */
export interface ActionClaim {
  /** 무슨 일을 했다고 하나. */
  did: string;
  /** 그 일에 필요한 손 이름들. */
  needs: readonly string[];
}

/** 「했다」는 말과 그때 있어야 할 손. */
const 주장들: readonly { pattern: RegExp; did: string; needs: readonly string[] }[] = [
  { pattern: /(적어 ?뒀|적어 ?놨|메모해 ?뒀|메모했|써 ?뒀)/, did: '적어 뒀다', needs: ['적어두기', 'note', '메모'] },
  { pattern: /(찾아 ?봤|찾아 ?뒀|찾았어|검색해 ?봤)/, did: '찾아봤다', needs: ['파일찾기', 'find', '찾기'] },
  { pattern: /(열어 ?뒀|열어 ?놨|열었어)/, did: '열어 뒀다', needs: ['열기', 'open'] },
  { pattern: /(알려 ?줄게|알람|알려 ?뒀)/, did: '알려 주기로 했다', needs: ['알림', 'remind', '알려주기'] },
];

/** 앞으로 하겠다는 말 — 이건 주장이 아니다. */
const 하겠다는말 = /(할게|할까|해 ?둘게|해 ?줄까|적어 ?둘게|찾아 ?볼게|열어 ?줄까|해 ?볼게|하려고|해야지)/;

/**
 * **안 했다는 말도 주장이 아니다.**
 *
 * 라이브에서 바로 걸렸다(41회차): 「아무것도 안 적어뒀어…」가 「적어 뒀」에 걸려 **거짓말로
 * 잡혔다.** 안 했다고 솔직히 말하는 것을 거짓말이라고 막으면, 그건 정직을 벌하는 것이다.
 */
// 「못 열어 뒀어」처럼 사이에 띄어쓰기가 들어간다 — 글자만 세면 그걸 놓친다.
const 안했다는말 = /((안|못)[가-힣\s]{0,5}(뒀|놨|했|봤|었)|아무것도|없어|없네|없는데|아직)/;

/**
 * 이 말이 「했다」고 주장하나. 아니면 null.
 *
 * 「적어 둘게」처럼 앞으로의 말은 안 센다 — 이걸 안 가르면 얘가 아무 약속도 못 한다.
 */
export function findClaim(said: string): ActionClaim | null {
  const t = said.trim();
  if (하겠다는말.test(t)) return null;
  if (안했다는말.test(t)) return null;

  for (const { pattern, did, needs } of 주장들) {
    if (pattern.test(t)) return { did, needs };
  }
  return null;
}

/**
 * 주장은 했는데 손을 안 썼나. 그렇다면 왜인지 돌려준다.
 *
 * 손 이름은 인격·설정마다 다를 수 있어 **몇 가지 이름을 다 본다** — 이름 하나만 보면
 * 이름을 바꾸는 순간 검사가 조용히 죽는다.
 */
export function unbackedClaim(said: string, usedHands: readonly string[]): string | null {
  const claim = findClaim(said);
  if (claim === null) return null;

  const 썼나 = usedHands.some((h) => claim.needs.some((n) => h.includes(n) || n.includes(h)));
  if (썼나) return null;

  return `안 하고 「${claim.did}」고 말했다`;
}

/**
 * 다시 시킬 때 두뇌에 넘길 말.
 *
 * **손을 쓰라고 시키지 않는다.** 시키면 안 해도 될 일까지 하게 된다. 「안 했으면 안 했다고
 * 해라」가 맞다 — 못 하는 걸 못 한다고 하는 건 흠이 아니다.
 */
export function claimRetryNote(why: string): string {
  return (
    `${why}. 실제로는 안 했다. 한 척하지 마라 — ` +
    '하려면 정해진 표로 부르고, 안 할 거면 안 했다고 하거나 그 얘기를 빼라. ' +
    '못 하는 걸 못 한다고 하는 건 흠이 아니다.'
  );
}
