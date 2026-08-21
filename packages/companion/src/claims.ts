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
const claims: readonly { pattern: RegExp; did: string; needs: readonly string[] }[] = [
  { pattern: /(적어 ?뒀|적어 ?놨|메모해 ?뒀|메모했|써 ?뒀)/, did: '적어 뒀다', needs: ['적어두기', 'note', '메모'] },
  { pattern: /(찾아 ?봤|찾아 ?뒀|찾았어|검색해 ?봤)/, did: '찾아봤다', needs: ['파일찾기', 'find', '찾기'] },
  { pattern: /(열어 ?뒀|열어 ?놨|열었어)/, did: '열어 뒀다', needs: ['열기', 'open'] },
  { pattern: /(알려 ?줄게|알람|알려 ?뒀)/, did: '알려 주기로 했다', needs: ['알림', 'remind', '알려주기'] },
];

/** 앞으로 하겠다는 말 — 이건 주장이 아니다. */
const willDoText = /(할게|할까|해 ?둘게|해 ?줄까|적어 ?둘게|찾아 ?볼게|열어 ?줄까|해 ?볼게|하려고|해야지)/;

/**
 * **안 했다는 말도 주장이 아니다.**
 *
 * 라이브에서 바로 걸렸다(41회차): 「아무것도 안 적어뒀어…」가 「적어 뒀」에 걸려 **거짓말로
 * 잡혔다.** 안 했다고 솔직히 말하는 것을 거짓말이라고 막으면, 그건 정직을 벌하는 것이다.
 */
// 「못 열어 뒀어」처럼 사이에 띄어쓰기가 들어간다 — 글자만 세면 그걸 놓친다.
//
// 어미를 손으로 적다가 **「았」을 빠뜨렸다.** 그래서 「못 찾았어」 — 이 관문이 막으려던
// 것과 정반대인, 가장 흔한 정직한 말 — 이 거짓말로 잡혔다(101회차 라이브: 두 번 다시
// 시키고 끝내 「…아니다.」 5자만 나갔다). 목록을 손으로 적으면 하나가 빠지고, 빠진 것은
// 라이브에서만 드러난다. 그래서 어미를 세지 말고 **과거를 만드는 조각**을 다 적는다.
const didNotText = /((안|못)[가-힣\s]{0,5}(뒀|놨|했|봤|었|았)|아무것도|없어|없네|없는데|아직)/;

/**
 * 이 말이 「했다」고 주장하나. 아니면 null.
 *
 * 「적어 둘게」처럼 앞으로의 말은 안 센다 — 이걸 안 가르면 얘가 아무 약속도 못 한다.
 */
export function findClaim(said: string): ActionClaim | null {
  const t = said.trim();
  if (willDoText.test(t)) return null;
  if (didNotText.test(t)) return null;

  for (const { pattern, did, needs } of claims) {
    if (pattern.test(t)) return { did, needs };
  }
  return null;
}

/**
 * 주장은 했는데 손을 안 썼나. 그렇다면 왜인지 돌려준다.
 *
 * 손 이름은 인격·설정마다 다를 수 있어 **몇 가지 이름을 다 본다** — name 하나만 보면
 * 이름을 바꾸는 순간 검사가 조용히 죽는다.
 */
export function unbackedClaim(said: string, usedHands: readonly string[]): string | null {
  const claim = findClaim(said);
  if (claim === null) return null;

  const used = usedHands.some((h) => claim.needs.some((n) => h.includes(n) || n.includes(h)));
  if (used) return null;

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

/**
 * **「누를게」라고 말만 하는 것.**
 *
 * 122회차 라이브에서 「화면에서 아무거나 하나 눌러봐」에 이렇게 답했다 —
 * 「아, 이거 누를게. 응, 최근 활동 정리 탭 누르고 올게…」. **그리고 아무것도 안 눌렀다.**
 * 손 표시(`[[누르기: 3]]`)를 안 적었기 때문이다. 42회차에 같은 것을 겪었다(0/10).
 *
 * 위의 `unbackedClaim` 은 「했다」는 거짓말을 잡는다. 이건 반대다 — **「할게」라고 하고 안
 * 하는 것**. 41회차에 「약속을 막으면 안 된다」고 정했으므로 넓게 잡으면 안 된다.
 * 그래서 **지금 이 turn 에 해야 하는 일**(누르기)에만 좁게 건다. 「적어둘게」 같은 진짜
 * 약속은 그대로 둔다 — 그건 나중에 해도 되는 일이다.
 */
const willPress = /(누를게|누를께|눌러 ?볼게|눌러 ?줄게|누르고 ?올게|눌러 ?놓을게|눌러야지)/;
const wontPress = /((못|안)\s*누|누르지 ?않)/;

export function promisedButSkipped(said: string, usedHands: readonly string[]): string | null {
  const text = String(said ?? '').trim();
  if (text === '') return null;
  if (wontPress.test(text)) return null;
  if (willPress.test(text) === false) return null;
  if (usedHands.some((h) => h.includes('누르기'))) return null;
  return '누르겠다고 말했는데 안 눌렀다';
}
