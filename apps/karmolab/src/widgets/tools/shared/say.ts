/**
 * **상태 한 줄**을 한 곳으로 (TASK-KL-291)
 *
 * 도구 126개를 재 보니(2026-08-13):
 *   - 똑같은 네 줄짜리 `say()` 를 **55곳**이 손으로 적고 있었다
 *   - `tool-status` 자리는 **104곳**에 있는데
 *   - **`aria-live` 는 2곳뿐이었다**
 *
 * 마지막 줄이 문제다. 「다 됐습니다」·「이 파일은 못 엽니다」 같은 말은 **화면이 안 바뀐 채
 * 글자만 갈린다** — 눈으로 보는 사람에겐 보이지만, 화면낭독기는 `aria-live` 가 없으면
 * **아무 말도 안 한다.** 누른 뒤에 아무 반응이 없는 것과 같다.
 *
 * 그래서 상태 줄을 만드는 자리를 하나 둔다. **여기서 만들면 읽힌다.**
 */

export type SayKind = '' | 'ok' | 'error' | 'warn';

/**
 * 그 자리를 상태 줄로 삼고, 말하는 손잡이를 돌려준다.
 *
 * `role="status"` + `aria-live="polite"` 를 붙인다 — 「지금 하던 일을 끊지 말고, 틈이 나면
 * 읽어 달라」는 뜻이다. `assertive` 는 타이핑을 끊어서 오히려 방해가 된다.
 */
export function statusLine(el: HTMLElement): (msg: string, kind?: SayKind) => void {
  if (!el.getAttribute('role')) el.setAttribute('role', 'status');
  if (!el.getAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
  return (msg: string, kind: SayKind = ''): void => {
    el.textContent = msg;
    el.className = 'tool-status' + (kind ? ' ' + kind : '');
  };
}
