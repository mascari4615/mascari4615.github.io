/**
 * 시간 (TASK-KL-088) — 관련 도구를 한 위젯의 탭으로 묶는다.
 *
 * 목록에 낱개로 서 있으면 무엇이 있는지 눈에 안 들어오고 고를 게 늘어난다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 갈라진다.
 * 부분 위젯의 개별 주소는 그대로 살아 있다 (검색 유입 유지).
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['datecalc', '날짜 · D-Day'],
    ['timer', '타이머'],
    ['worldclock', '세계 시차'],
    ['epoch', '타임스탬프'],
    ['birth', '생일'],
    ['workdays', '영업일'],
    ['timecalc', '시간 더하기'],
    ['pace', '러닝 페이스']
  ];

  Toolbox.register({
    id: 'time',
    title: '시간',
    category: 'tool',
    desc: '날짜 계산·D-Day·타이머·스톱워치·세계 시차를 한 곳에서',
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
