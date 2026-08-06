/**
 * 영상 도구 (TASK-KL-088) — 영상을 다루는 것들을 한자리에.
 *
 * 영상은 파일이 크고 사적인 경우가 많아, 남의 서버에 올리는 것이 특히 꺼려진다.
 * 여기서는 브라우저 안에서 끝난다. 처리가 무거우니 연 탭만 만든다.
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['video2gif', 'GIF 만들기'],
    ['videotrim', '자르기'],
    ['video2img', '사진 뽑기'],
    ['video2audio', '소리 추출'],
    ['screenrec', '화면 녹화']
  ];

  Toolbox.register({
    id: 'videotool',
    title: '영상 도구',
    category: 'tool',
    desc: '영상을 GIF 로 만들고, 구간을 자르고, 소리를 뽑고, 화면을 녹화합니다. 영상이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    lazyTabs: true,
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
