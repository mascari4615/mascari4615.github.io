/**
 * **숫자 칸 한 줄**을 한 곳으로 (TASK-KL-257)
 *
 * 실측(2026-08-16): 똑같은 한 줄짜리 `const stat = …` 이 **32곳**에 글자 하나 안 틀리고
 * 복사돼 있었다(소리 다섯 · 영상 여섯 · PDF 다섯 · 그림 넷 …). 원장이 「통계 칸 39파일」로
 * 세던 그 자리다.
 *
 * 한 줄짜리를 왜 빼나 — 줄 수 때문이 아니다. **고칠 때가 문제다.** 이 칸의 모양을 한 번
 * 바꾸려면 32곳을 찾아 고쳐야 하고, 그러면 아무도 안 바꾼다(그래서 이 칸은 몇 달째 그대로다).
 * 접근성 표시 하나 붙이는 일도 마찬가지다.
 *
 * 값을 이스케이프하지 않는 이유: 부르는 쪽이 이미 만든 조각(`<b>3.2</b>MB` 같은 것)을
 * 넣는 자리가 있다. 사람이 넣은 글을 그대로 담는 자리가 아니다 — 그런 값은 부르는 쪽에서 막는다.
 */

/** 숫자 칸 하나. `primary` 는 그 판에서 **제일 중요한 수** 하나에만 준다. */
export function statCell(label: string, value: string, primary = false): string {
  return `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${label}</div><div class="cc-stat-value">${value}</div></div>`;
}

/** 여러 칸을 한 줄로. `[라벨, 값]` 또는 `[라벨, 값, 중요]`. */
export function statRow(cells: Array<[string, string] | [string, string, boolean]>): string {
  return cells.map(([label, value, primary]) => statCell(label, value, primary === true)).join('');
}
