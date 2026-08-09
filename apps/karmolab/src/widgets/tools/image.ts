/**
 * 이미지 (TASK-KL-088) — 편집·아스키 아트·AI 생성·보관함을 한 위젯의 탭으로.
 *
 * 사진 한 장을 두고 하는 일들이라 낱개로 흩어져 있으면 화면을 계속 나갔다 들어와야 한다.
 * 이 묶음은 무거운 화면(AI 생성·보관함)을 포함하므로 lazyTabs 로 둔다 — 안 연 탭은 만들지 않는다.
 * 화면은 각 부분 위젯이 그대로 그리고 (Toolbox.mountTool), 부분의 개별 주소는 살아 있다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 부품 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const parts = (): Array<[string, string]> => [
    ['imageedit', t('image.part.imgbatch', undefined, '편집 · 변환')],

    ['text2img', t('image.part.text2img', undefined, '글자 카드')],
    ['imgresize', t('image.part.imgresize', undefined, '크기 맞추기')],
    ['redact', t('image.part.redact', undefined, '가리개')],
    ['asciiart', t('image.part.asciiart', undefined, '아스키 아트')],
    ['imagegen', t('image.part.aigen', undefined, 'AI 생성')],
    ['imagelib', t('image.part.store', undefined, '보관함')]
  ];

  Toolbox.register({
    id: 'image',
    title: t('widgets.image.title', undefined, "이미지"),
    category: 'tool',
    desc: t('widgets-desc.image.desc', undefined, "편집·형식 변환, 아스키 아트, AI 생성과 보관함을 한 곳에서"),
    layout: 'full',
    lazyTabs: true, // AI 생성·보관함이 무겁다 — 연 탭만 만든다
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8.5" cy="9" r="1.6" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 17l4.5-4.5 3 3L15 12l5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: parts().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('image').then(function () {

        Toolbox.mountTool(id, container);
              });
      }
    }))
  });
})();
