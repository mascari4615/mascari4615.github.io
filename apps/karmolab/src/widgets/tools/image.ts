/**
 * 이미지 (TASK-KL-088) — 편집·색 추출·아스키 아트·AI 생성·보관함을 한 위젯의 탭으로.
 *
 * 사진 한 장을 두고 하는 일들이라 낱개로 흩어져 있으면 화면을 계속 나갔다 들어와야 한다.
 * 이 묶음은 무거운 화면(AI 생성·보관함)을 포함하므로 lazyTabs 로 둔다 — 안 연 탭은 만들지 않는다.
 * 화면은 각 부분 위젯이 그대로 그리고 (Toolbox.mountTool), 부분의 개별 주소는 살아 있다.
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['imageedit', '편집 · 변환'],
    ['palette', '색 추출'],
    ['asciiart', '아스키 아트'],
    ['imagegen', 'AI 생성'],
    ['imagelib', '보관함']
  ];

  Toolbox.register({
    id: 'image',
    title: '이미지',
    category: 'tool',
    desc: '편집·형식 변환, 색 추출, 아스키 아트, AI 생성과 보관함을 한 곳에서',
    layout: 'full',
    lazyTabs: true, // AI 생성·보관함이 무겁다 — 연 탭만 만든다
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8.5" cy="9" r="1.6" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 17l4.5-4.5 3 3L15 12l5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
