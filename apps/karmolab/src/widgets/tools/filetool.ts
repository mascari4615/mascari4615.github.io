/**
 * 파일 도구 (TASK-KL-088) — PDF·오디오처럼 파일을 직접 다루는 것들.
 *
 * 이런 작업은 대개 파일을 남의 서버에 올려서 한다. 계약서·이력서·음원처럼 올리면 안 되는 것이 대부분이라,
 * 브라우저 안에서 끝나는 자리를 따로 둔다. 무거운 처리기는 그 탭을 처음 열 때만 받는다.
 */
(function (): void {
  /**
   * 탭 순서 = **같은 갈래끼리**. 열둘이 뒤섞여 있으면 아는 기능도 못 찾는다.
   * PDF → 소리 → 이미지 → 그 외 순서이고, 이름은 무엇을 하는지가 먼저 보이게 적는다
   * (「PDF」 처럼 대상만 적으면 무슨 일을 하는 자리인지 알 수 없다).
   */
  const PARTS: Array<[string, string]> = [
    ['pdftool', 'PDF 합치기·나누기'],
    ['pdfcompress', 'PDF 용량 줄이기'],
    ['pdfsign', 'PDF 서명'],
    ['pdfwatermark', 'PDF 워터마크'],
    ['pdf2text', 'PDF → 글자'],
    ['pdf2img', 'PDF → 이미지'],
    ['img2pdf', '이미지 → PDF'],
    ['audiocut', '소리 자르기'],
    ['audiojoin', '소리 잇기'],
    ['audiolevel', '소리 크기 맞추기'],
    ['voicerec', '목소리 녹음'],
    ['imgbatch', '이미지 일괄 변환'],
    ['exifclean', '사진 정보 지우기'],
    ['ziptool', 'ZIP 묶기·풀기'],
    ['filesplit', '큰 파일 나누기'],
    ['filehash', '파일 검사값']
  ];

  Toolbox.register({
    id: 'filetool',
    title: '파일 도구',
    category: 'tool',
    desc: 'PDF·소리·이미지 파일을 다룹니다. 파일이 브라우저를 벗어나지 않습니다',
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
