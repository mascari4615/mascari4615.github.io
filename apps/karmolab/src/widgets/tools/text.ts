/**
 * 텍스트 도구 (TASK-KL-088) — 세기·정리·비교·표기법·한영타를 한 위젯의 탭으로.
 *
 * 글 하나를 손보는 동안 이 다섯은 이어서 쓰인다 (붙여넣고 → 세어보고 → 정리하고 → 비교하고).
 * 목록에 따로 서 있으면 그때마다 화면을 나갔다 들어와야 한다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 갈라진다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const parts = (): Array<[string, string]> => [
    ['charcount', t('text.part.charcount')],
    ['textclean', t('text.part.textclean')],
    ['textdiff', t('text.part.textdiff')],
    ['caseconv', t('text.part.caseconv')],
    ['hangulkey', t('text.part.hangulkey')],
    ['lorem', t('text.part.lorem')],
    ['replace', t('text.part.replace')],
    ['slug', t('text.part.slug')],
    ['listdiff', t('text.part.listdiff')],
    ['jamo', t('text.part.jamo')],
    ['wordfreq', t('text.part.wordfreq')],
    ['linebreak', t('text.part.linebreak')],
    ['checklist', t('text.part.checklist')]
  ];

  Toolbox.register({
    id: 'text',
    title: t('widgets.text.title', undefined, "텍스트 도구"),
    category: 'tool',
    desc: t('widgets-desc.text.desc', undefined, "글자수 세기·줄 정리·두 글 비교·표기법 변환·한영타 되돌리기를 한 곳에서"),
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<path d="M4 5h16M4 5v2M20 5v2M12 5v14M9 19h6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M4 12h4M4 16h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>',
    tabs: parts().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('text').then(function () {

        Toolbox.mountTool(id, container);
              });
      }
    }))
  });
})();
