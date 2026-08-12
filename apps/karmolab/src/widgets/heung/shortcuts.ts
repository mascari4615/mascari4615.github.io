/**
 * 흥 — 단축키 목록 (TASK-KL-220).
 *
 * 27회차 동안 단축키가 쌓였는데 어디에도 안 적혀 있었다. 여기 한 곳에 적고 화면이 이걸 그린다.
 * **적어 두기만 하면 곧 거짓말이 된다** — `keys` 는 실제 처리 코드와 대조하는 검사가 따로 있다
 * (`scripts/test-heung-shortcuts.mjs`).
 */

export interface ShortcutGroup {
  title: string;
  items: { keys: string[]; what: string }[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: '재생',
    items: [
      { keys: ['Space'], what: '재생 / 멈춤 · 멈춘 채로 누르면 처음으로' },
      { keys: ['Shift+Space'], what: '고른 클립 구간만 반복 재생' },
      { keys: ['Alt+←', 'Alt+→'], what: '앞뒤 구간 이름표로 건너뛰기' }
    ]
  },
  {
    title: '도구',
    items: [
      { keys: ['P'], what: '그리기 — 빈 자리를 눌러 클립·음을 만든다' },
      { keys: ['E'], what: '고르기 — 빈 곳을 끌어 여러 개를 묶는다' },
      { keys: ['C'], what: '자르기 — 클립을 눌러 그 자리에서 나눈다' }
    ]
  },
  {
    title: '편집',
    items: [
      { keys: ['Ctrl+Z', 'Ctrl+Shift+Z', 'Ctrl+Y'], what: '되돌리기 / 다시 하기' },
      { keys: ['Ctrl+C', 'Ctrl+X', 'Ctrl+V'], what: '복사 / 잘라내기 / 붙여넣기 (묶음 그대로)' },
      { keys: ['Ctrl+B'], what: '고른 것 복제' },
      { keys: ['Delete', 'Backspace'], what: '고른 것 삭제 (잠긴 클립은 남는다)' },
      { keys: ['M'], what: '고른 클립 소리 끄기 / 켜기' },
      { keys: ['Escape'], what: '끌던 것 취소 · 메뉴·큰 창 닫기' }
    ]
  },
  {
    title: '고르기',
    items: [
      { keys: ['Shift+클릭'], what: '묶음에 더하기' },
      { keys: ['Ctrl+클릭'], what: '묶음에서 빼기 / 넣기' },
      { keys: ['Alt+끌기'], what: '클립 복제하며 끌기' }
    ]
  }
];

/** 검사와 화면이 같은 목록을 본다. */
export function shortcutKeys(): string[] {
  return SHORTCUTS.flatMap((group) => group.items.flatMap((item) => item.keys));
}

export function shortcutsHtml(esc: (value: unknown) => string): string {
  const groups = SHORTCUTS.map((group) => `<section><h5>${esc(group.title)}</h5>${group.items.map((item) => `<p><span class="hu-keys">${item.keys.map((key) => `<kbd>${esc(key)}</kbd>`).join('')}</span><span>${esc(item.what)}</span></p>`).join('')}</section>`).join('');
  return `<div class="hu-help" role="dialog" aria-modal="true" aria-label="단축키"><div class="hu-help-head"><strong>단축키</strong><button class="hu-btn" data-help-act="close">닫기</button></div><div class="hu-help-body">${groups}</div></div>`;
}
