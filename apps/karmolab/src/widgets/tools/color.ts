/**
 * 색상 도구 (TASK-KL-088) — 변환 · 이미지에서 추출 · CSS 색 이름을 한 위젯의 탭으로.
 *
 * 셋 다 「색 하나를 정하려고」 쓰는 도구다. 목록에 따로 서 있으면 어느 걸 눌러야 할지부터 고민이 된다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 둘로 갈라진다.
 * 부분 위젯의 개별 주소는 그대로 살아 있다 (검색 유입 유지).
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['colorconv', '변환'],
    ['palette', '이미지에서 추출'],
    ['colorname', 'CSS 색 이름'],
    ['contrast', '대비 검사'],
    ['colorblind', '색각']
  ];

  Toolbox.register({
    id: 'color',
    title: '색상 도구',
    category: 'tool',
    desc: 'HEX·RGB·HSL 변환, 이미지에서 색 추출, CSS 색 이름표를 한 곳에서',
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3a9 9 0 0 1 0 18 4.5 4.5 0 0 1 0-9 4.5 4.5 0 0 0 0-9z" fill="currentColor" opacity="0.45"/><circle cx="8" cy="9" r="1.1" fill="currentColor"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
