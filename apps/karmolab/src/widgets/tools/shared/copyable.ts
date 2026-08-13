/**
 * **눌러서 복사되는 자리** (TASK-KL-297)
 *
 * 도구가 글을 내놓으면 사람이 다음에 하는 일은 거의 늘 **다른 데 옮겨 적기**다.
 * 그런데 결과를 보여 주는 도구 41개 중 **14개에 복사가 없었다** — 그중 대부분은 파일을
 * 내놓는 쪽이라 복사가 뜻이 없지만, 글을 내놓으면서 없는 곳이 남아 있었다
 * (뜯어본 JWT · 날짜 셈 결과 같은 것들).
 *
 * 복사 단추를 따로 두는 대신 **그 자리 자체를 누르게** 한다 — 결과 옆에 단추가 하나 더 붙으면
 * 화면이 복잡해지고, 좁은 화면에서는 결과보다 단추가 커진다.
 */
import { markLive } from './say';

/* 눌렀을 때 잠깐 표시 — 어느 도구에서 쓰든 같아야 해서 여기서 한 번만 넣는다.
 * (도구마다 제 색을 쓰면 「복사됐나?」를 매번 다르게 배워야 한다.) */
let styled = false;
function once(): void {
  if (styled) return;
  styled = true;
  const el = document.createElement('style');
  el.textContent = '.kl-copied{outline:2px solid rgba(120,200,140,.85);outline-offset:2px;border-radius:6px;}';
  document.head.appendChild(el);
}

/**
 * 이 자리를 눌러서 복사되게 만든다.
 *
 * @param el   누를 자리 (결과 글이 들어 있는 요소)
 * @param text 복사할 글을 그때그때 만들어 준다 — 결과가 바뀌어도 최신 것이 복사된다
 * @param label 낭독기·툴팁에 쓸 이름 (「결과 복사」 같은 것)
 */
export function copyOnClick(el: HTMLElement, text: () => string, label: string): void {
  once();
  el.style.cursor = 'copy';
  el.title = label;
  /* 자판으로도 닿아야 한다 — 마우스로만 되는 자리를 또 만들지 않는다 (TASK-KL-294) */
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  if (!el.getAttribute('role')) el.setAttribute('role', 'button');
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', label);

  const go = (): void => {
    const v = text();
    if (!v) return;
    void Toolbox.copyText?.(v, { message: label });
    el.classList.add('kl-copied');
    window.setTimeout(() => el.classList.remove('kl-copied'), 900);
  };
  el.addEventListener('click', go);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go();
    }
  });
  markLive(el);
}
