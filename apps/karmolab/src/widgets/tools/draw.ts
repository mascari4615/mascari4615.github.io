/**
 * 뽑기 (TASK-KL-088) — 관련 도구를 한 위젯의 탭으로 묶는다.
 *
 * 목록에 낱개로 서 있으면 무엇이 있는지 눈에 안 들어오고 고를 게 늘어난다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 갈라진다.
 * 부분 위젯의 개별 주소는 그대로 살아 있다 (검색 유입 유지).
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 부품 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const parts = (): Array<[string, string]> => [
    ['lotto', t('draw.part.lotto', undefined, '로또')],
    ['ladder', t('draw.part.ladder', undefined, '사다리타기')],
    ['pick', t('draw.part.pick', undefined, '추첨 · 팀')]
  ];

  Toolbox.register({
    id: 'draw',
    title: t('widgets.draw.title', undefined, "랜덤 뽑기"),
    category: 'tool',
    desc: t('widgets-desc.draw.desc', undefined, "로또 번호·사다리타기·추첨과 팀 나누기를 한 곳에서"),
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<circle cx="9" cy="10" r="5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16" cy="16" r="5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 8v4M7 10h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: parts().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('draw').then(function () {

        Toolbox.mountTool(id, container);
              });
      }
    }))
  });
})();
