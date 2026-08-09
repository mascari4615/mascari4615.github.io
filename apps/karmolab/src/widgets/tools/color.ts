/**
 * 색상 도구 (TASK-KL-088) — 변환 · 이미지에서 추출 · CSS 색 이름을 한 위젯의 탭으로.
 *
 * 셋 다 「색 하나를 정하려고」 쓰는 도구다. 목록에 따로 서 있으면 어느 걸 눌러야 할지부터 고민이 된다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 둘로 갈라진다.
 * 부분 위젯의 개별 주소는 그대로 살아 있다 (검색 유입 유지).
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 부품 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const parts = (): Array<[string, string]> => [
    ['colorconv', t('color.part.colorconv', undefined, '변환')],
    ['palette', t('color.part.palette', undefined, '이미지에서 추출')],
    ['colorname', t('color.part.cssnames', undefined, 'CSS 색 이름')],
    ['gradient', t('color.part.gradient', undefined, '그라데이션')],
    ['contrast', t('color.part.contrast', undefined, '대비 검사')],
    ['colorblind', t('color.part.colorblind', undefined, '색각')]
  ];

  Toolbox.register({
    id: 'color',
    title: t('widgets.color.title', undefined, "색상 도구"),
    category: 'tool',
    desc: t('widgets-desc.color.desc', undefined, "HEX·RGB·HSL 변환, 이미지에서 색 추출, CSS 색 이름표를 한 곳에서"),
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3a9 9 0 0 1 0 18 4.5 4.5 0 0 1 0-9 4.5 4.5 0 0 0 0-9z" fill="currentColor" opacity="0.45"/><circle cx="8" cy="9" r="1.1" fill="currentColor"/>',
    tabs: parts().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('color').then(function () {

        Toolbox.mountTool(id, container);
              });
      }
    }))
  });
})();
