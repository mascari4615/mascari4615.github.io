/**
 * 시간 (TASK-KL-088) — 관련 도구를 한 위젯의 탭으로 묶는다.
 *
 * 목록에 낱개로 서 있으면 무엇이 있는지 눈에 안 들어오고 고를 게 늘어난다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 갈라진다.
 * 부분 위젯의 개별 주소는 그대로 살아 있다 (검색 유입 유지).
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 부품 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const parts = (): Array<[string, string]> => [
    ['datecalc', t('time.part.datecalc')],
    ['timer', t('time.part.timer')],
    ['worldclock', t('time.part.worldclock')],
    ['epoch', t('time.part.epoch')],
    ['birth', t('time.part.birth')],
    ['workdays', t('time.part.workdays')],
    ['timecalc', t('time.part.timecalc')],
    ['pace', t('time.part.pace')]
  ];

  Toolbox.register({
    id: 'time',
    title: t('widgets.time.title', undefined, "시간"),
    category: 'tool',
    desc: t('widgets-desc.time.desc', undefined, "날짜 계산·D-Day·타이머·스톱워치·세계 시차를 한 곳에서"),
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: parts().map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        void loadNamespace('time').then(function () {

        Toolbox.mountTool(id, container);
              });
      }
    }))
  });
})();
