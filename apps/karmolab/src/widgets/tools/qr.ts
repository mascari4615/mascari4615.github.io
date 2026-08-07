/**
 * QR 도구 (TASK-KL-088) — 만들기와 읽기를 한자리에.
 *
 * 만든 QR 이 제대로 읽히는지 바로 확인하고 싶은 게 사람 마음이다. 두 기능이 떨어져 있으면
 * 그걸 하려고 다른 사이트를 찾게 된다.
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['qrgen', 'QR 만들기'],
    ['qrread', 'QR 읽기']
  ];

  Toolbox.register({
    id: 'qr',
    title: 'QR 도구',
    category: 'tool',
    desc: 'QR 코드를 만들고 읽습니다. 읽은 내용이 무엇인지도 알려 줍니다',
    layout: 'wide',
    lazyTabs: true,
    icon: '<rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z" fill="currentColor"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
