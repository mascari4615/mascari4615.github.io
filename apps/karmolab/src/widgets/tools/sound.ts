/**
 * 소리 도구 (TASK-KL-088) — 녹음하고 다듬는 일을 한자리에.
 *
 * 녹음 → 자르기 → 크기 맞추기 → 잇기 는 대개 이어서 하는 일이다. 흩어져 있으면
 * 그때마다 다른 자리를 찾아야 한다. 저장은 MP3 와 WAV 중 고를 수 있다.
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['voicerec', '녹음'],
    ['audiocut', '자르기'],
    ['audiolevel', '크기 맞추기'],
    ['audiojoin', '잇기']
  ];

  Toolbox.register({
    id: 'sound',
    title: '소리 도구',
    category: 'tool',
    desc: '녹음하고 자르고 크기를 맞추고 잇습니다. MP3·WAV 로 저장하며 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    lazyTabs: true,
    icon: '<path d="M4 12h2l2-5 3 12 3-16 3 14 2-5h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
