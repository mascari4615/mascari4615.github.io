/**
 * PDF 도구 (TASK-KL-088) — PDF 로 하는 일을 한자리에.
 *
 * 원래 「파일 도구」 하나에 열여덟 개가 들어 있었다. PDF·소리·이미지가 뒤섞여, 아는 기능도
 * 찾기 어려웠다. 123apps 처럼 갈래별로 나눈다 — 사이드바 항목은 둘 늘지만 각 묶음이 한눈에 든다.
 *
 * 계약서·이력서가 오가는 자리라 「올리지 않는다」가 특히 중요하다. 처리기는 연 탭만 받는다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 부품 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const parts = (): Array<[string, string]> => [
    ['pdftool', t('pdf.part.pdftool')],
    ['pdfcompress', t('pdf.part.pdfcompress')],
    ['pdfsign', t('pdf.part.pdfsign')],
    ['pdfcrop', t('pdf.part.pdfcrop')],
    ['pdfpagenum', t('pdf.part.pdfpagenum')],
    ['pdfredact', t('pdf.part.pdfredact')],
    ['pdfwatermark', t('pdf.part.pdfwatermark')],
    ['pdf2text', t('pdf.part.pdf2text')],
    ['text2pdf', t('pdf.part.text2pdf')],
    ['pdf2img', t('pdf.part.pdf2img')],
    ['img2pdf', t('pdf.part.img2pdf')]
  ];

  Toolbox.register({
    id: 'pdf',
    title: t('widgets.pdf.title', undefined, "PDF 도구"),
    category: 'tool',
    desc: t('widgets-desc.pdf.desc', undefined, "PDF 를 합치고 나누고 줄이고, 서명·워터마크를 넣습니다. 문서가 브라우저를 벗어나지 않습니다"),
    layout: 'wide',
    lazyTabs: true,
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.5 13h7M8.5 16.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: parts().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('pdf').then(function () {

        Toolbox.mountTool(id, container);
              });
      }
    }))
  });
})();
