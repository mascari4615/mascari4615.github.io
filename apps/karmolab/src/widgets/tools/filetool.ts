/**
 * 파일 도구 (TASK-KL-088) — PDF·오디오처럼 파일을 직접 다루는 것들.
 *
 * 이런 작업은 대개 파일을 남의 서버에 올려서 한다. 계약서·이력서·음원처럼 올리면 안 되는 것이 대부분이라,
 * 브라우저 안에서 끝나는 자리를 따로 둔다. 무거운 처리기는 그 탭을 처음 열 때만 받는다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /**
   * 탭 순서 = **같은 갈래끼리**. 열둘이 뒤섞여 있으면 아는 기능도 못 찾는다.
   * PDF → 소리 → 이미지 → 그 외 순서이고, 이름은 무엇을 하는지가 먼저 보이게 적는다
   * (「PDF」 처럼 대상만 적으면 무슨 일을 하는 자리인지 알 수 없다).
   */
  /* 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const parts = (): Array<[string, string]> => [
    ['imgbatch', t('filetool.part.imgbatch', undefined, '이미지 일괄 변환')],
    ['imgmerge', t('filetool.part.imgmerge', undefined, '사진 이어 붙이기')],
    ['favicon', t('filetool.part.favicon', undefined, '파비콘 만들기')],
    ['exifclean', t('filetool.part.exifclean', undefined, '사진 정보 지우기')],
    ['ziptool', t('filetool.part.ziptool', undefined, 'ZIP 묶기·풀기')],
    ['filesplit', t('filetool.part.filesplit', undefined, '큰 파일 나누기')],
    ['filehash', t('filetool.part.filehash', undefined, '파일 검사값')]
  ];

  Toolbox.register({
    id: 'filetool',
    title: t('widgets.filetool.title', undefined, "파일 도구"),
    category: 'tool',
    desc: t('widgets-desc.filetool.desc', undefined, "사진 변환·이어 붙이기, 위치정보 지우기, ZIP, 큰 파일 나누기. 파일이 브라우저를 벗어나지 않습니다"),
    layout: 'wide',
    lazyTabs: true, // 처리기가 무겁다 — 연 탭만 만든다
    icon: '<path d="M4 6a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    tabs: parts().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('filetool').then(function () {

        Toolbox.mountTool(id, container);
              });
      }
    }))
  });
})();
