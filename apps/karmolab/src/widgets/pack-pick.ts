/**
 * 「내 표」에서 놀이로 건너오는 길 (TASK-KL-089).
 *
 * 앱은 한 번 그린 화면을 그대로 다시 보여 준다. 그래서 놀이 화면이 이미 만들어진 뒤에
 * 표를 새로 만들거나 「이 표로 놀기」를 눌러도, 그 놀이는 **여전히 옛 목록**을 들고 있었다
 * (실측: 밀어 넣은 표 대신 아까 그 판이 그대로 열렸다).
 *
 * 화면이 다시 보이는 그 순간에 한 번 더 보게 한다 — 세 놀이가 같은 길을 쓴다.
 */
const PICK = 'karmolab_pack_pick';

/** 건네받은 표가 있으면 그 id 를 돌려주고 지운다 (한 번만 쓰인다). */
export function takePick(): string | null {
  try {
    const v = localStorage.getItem(PICK);
    if (v) localStorage.removeItem(PICK);
    return v;
  } catch {
    return null;
  }
}

/** 이 위젯의 화면이 다시 보일 때마다 부른다. 뒷정리는 Toolbox 가 맡는다. */
export function onPageActive(container: HTMLElement, fn: () => void): void {
  const eye = new MutationObserver((recs) => {
    for (const r of recs) {
      if ((r.target as HTMLElement).classList.contains('active')) {
        fn();
        return;
      }
    }
  });
  // 그리는 도중에는 그 칸이 아직 없을 수 있다 — 한 박자 뒤에 찾는다.
  setTimeout(() => {
    const page = container.closest('.tool-page');
    if (page) eye.observe(page, { attributes: true, attributeFilter: ['class'] });
  }, 0);
  Toolbox.onDispose?.(() => eye.disconnect());
}
