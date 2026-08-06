/**
 * 파일 도구 (TASK-KL-088) — PDF·오디오처럼 파일을 직접 다루는 것들.
 *
 * 이런 작업은 대개 파일을 남의 서버에 올려서 한다. 계약서·이력서·음원처럼 올리면 안 되는 것이 대부분이라,
 * 브라우저 안에서 끝나는 자리를 따로 둔다. 무거운 처리기는 그 탭을 처음 열 때만 받는다.
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['pdftool', 'PDF'],
    ['audiocut', '오디오'],
    ['pdf2img', 'PDF → 이미지'],
    ['img2pdf', '이미지 → PDF'],
    ['ziptool', 'ZIP']
  ];

  Toolbox.register({
    id: 'filetool',
    title: '파일 도구',
    category: 'tool',
    desc: 'PDF 합치기·페이지 편집과 오디오 자르기. 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    lazyTabs: true, // 처리기가 무겁다 — 연 탭만 만든다
    icon: '<path d="M4 6a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
