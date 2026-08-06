/**
 * 텍스트 도구 (TASK-KL-088) — 세기·정리·비교·표기법·한영타를 한 위젯의 탭으로.
 *
 * 글 하나를 손보는 동안 이 다섯은 이어서 쓰인다 (붙여넣고 → 세어보고 → 정리하고 → 비교하고).
 * 목록에 따로 서 있으면 그때마다 화면을 나갔다 들어와야 한다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 갈라진다.
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['charcount', '글자수'],
    ['textclean', '정리'],
    ['textdiff', '비교'],
    ['caseconv', '표기법'],
    ['hangulkey', '한영타'],
    ['lorem', '더미 텍스트'],
    ['replace', '찾아 바꾸기']
  ];

  Toolbox.register({
    id: 'text',
    title: '텍스트 도구',
    category: 'tool',
    desc: '글자수 세기·줄 정리·두 글 비교·표기법 변환·한영타 되돌리기를 한 곳에서',
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<path d="M4 5h16M4 5v2M20 5v2M12 5v14M9 19h6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M4 12h4M4 16h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
