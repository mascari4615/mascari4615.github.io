/**
 * 재료 고르기 — 할 말이 많다고 다 넣으면 하나도 안 먹는다.
 *
 * 지시를 잘 따르는 정도는 **동시에 걸린 제약의 수에 반비례**한다는 것이 여러 번 측정됐다.
 * 줄이 늘수록 준수율이 떨어지고, 가운데에 놓인 것은 특히 흐려진다(앞뒤는 그나마 남는다).
 * 서로 부딪히는 지시가 섞이면 더 나빠진다.
 *
 * 우리가 실제로 겪은 것들이 전부 이 그림에 맞는다:
 * - 15회차: 하루의 매듭을 **넣었더니 인사가 더 짧아졌다.** 재료 하나 늘 때마다 몸을 사린다.
 * - 23회차: 자기상을 **맨 앞으로 올려도** 안 먹혔다.
 * - 28회차 실측: 인격 610자에 재료 737자 — **재료가 인격보다 많고**, 열한 줄 중 여덟 줄이
 *   늘 켜져 있었다.
 *
 * 그래서 **다 넣지 않는다.** 재료마다 「지금 필요한가」를 묻고, 필요한 것 중에서 **글자 수
 * 예산** 안에 드는 것만 고른다. 그리고 남은 것을 **앞뒤로** 놓는다 — 가운데는 흐려지니까.
 */
export interface Ingredient {
  /** 무엇인지 (진단용 이름). */
  name: string;
  /** 넣을 글. 빈 문자열이면 아예 없는 것으로 친다. */
  text: string;
  /**
   * 얼마나 중요한가. 큰 것이 먼저 자리를 얻는다.
   *
   * 같은 값이면 **적어 준 순서**를 지킨다 — 흔들리면 매번 다른 프롬프트가 되어, 답이
   * 달라진 이유를 알 수 없게 된다.
   */
  weight: number;
  /** 지금 자리에 필요한가. 안 주면 늘 필요한 것으로 본다. */
  when?: boolean;
}

export interface BudgetOptions {
  /** 글자 수 상한. */
  maxChars?: number;
  /** 줄 수 상한 — 짧은 줄이 많은 것도 제약이 많은 것이다. */
  maxLines?: number;
  /**
   * 재료마다 어떻게 됐는지 알려 준다 (실림/밀림/꺼짐/빔).
   *
   * 고르는 자리가 **모든 재료가 지나가는 유일한 길목**이라, 여기 한 번 달면 전부 덮인다.
   */
  mark?: (name: string, fate: '실림' | '밀림' | '꺼짐' | '빔', 왜?: string) => void;
  /** 이번 turn 이 무엇이었나 — 안 실린 이유를 나중에 되짚을 때 이게 있어야 한다. */
  자리?: string;
}

/**
 * 예산 안에서 재료를 고른다.
 *
 * 무게가 큰 것부터 담다가 예산이 모자라면 **그 재료는 건너뛰고 다음 것을 본다** — 잘라
 * 넣지 않는다. 반쯤 잘린 지시는 안 넣느니만 못하다.
 */
export function pickIngredients(all: readonly Ingredient[], options: BudgetOptions = {}): Ingredient[] {
  const maxChars = options.maxChars ?? 420;
  const maxLines = options.maxLines ?? 5;

  const mark = options.mark;
  const 자리 = options.자리 === undefined ? '' : ` · ${options.자리.slice(0, 40)}`;
  const 쓸것: { x: Ingredient; i: number }[] = [];
  all.forEach((x, i) => {
    /* **「안 실렸다」만 남기면 못 고친다.** 오늘 한 재료가 600턴 넘게 안 실린 걸 찾아
       놓고도, 조건이 안 켜진 건지 만들 게 없었던 건지를 알아내려고 실험을 네 번 돌렸다
       (71회차에 되묻기로 똑같이 당했다). 갈래마다 이유를 같이 남긴다. */
    if (x.when === false) { mark?.(x.name, '꺼짐', `조건이 안 켜졌다${자리}`); return; }
    if (x.text.trim() === '') { mark?.(x.name, '빔', `만들 게 없었다${자리}`); return; }
    쓸것.push({ x, i });
  });
  쓸것.sort((a, b) => (b.x.weight - a.x.weight) || (a.i - b.i));

  const 고른것: { x: Ingredient; i: number }[] = [];
  let 쓴글자 = 0;
  for (const it of 쓸것) {
    const 길이 = it.x.text.trim().length;
    if (고른것.length >= maxLines || 쓴글자 + 길이 > maxChars) {
      mark?.(it.x.name, '밀림', `자리가 모자랐다 (무게 ${it.x.weight})${자리}`);
      continue;
    }
    고른것.push(it);
    쓴글자 += 길이;
    mark?.(it.x.name, '실림', '');
  }
  return 고른것.map((it) => it.x);
}

/**
 * 고른 재료를 늘어놓는다 — **가장 중요한 것을 맨 앞, 그 다음을 맨 뒤.**
 *
 * 가운데가 흐려지는 건 어느 모델에서나 나타난다. 그러니 제일 중요한 둘을 양 끝에 둔다.
 */
export function layOut(picked: readonly Ingredient[]): string[] {
  if (picked.length <= 2) return picked.map((x) => x.text.trim());

  const [첫째, 둘째, ...나머지] = picked;
  return [첫째.text.trim(), ...나머지.map((x) => x.text.trim()), 둘째.text.trim()];
}

/** 골라서 늘어놓기까지 한 번에. */
export function composeIngredients(all: readonly Ingredient[], options: BudgetOptions = {}): string {
  return layOut(pickIngredients(all, options)).join(' ');
}
