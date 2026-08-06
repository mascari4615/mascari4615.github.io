/**
 * 뽑기 (TASK-KL-088) — 관련 도구를 한 위젯의 탭으로 묶는다.
 *
 * 목록에 낱개로 서 있으면 무엇이 있는지 눈에 안 들어오고 고를 게 늘어난다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 갈라진다.
 * 부분 위젯의 개별 주소는 그대로 살아 있다 (검색 유입 유지).
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['lotto', '로또'],
    ['ladder', '사다리타기'],
    ['pick', '추첨 · 팀']
  ];

  Toolbox.register({
    id: 'draw',
    title: '뽑기',
    category: 'tool',
    desc: '로또 번호·사다리타기·추첨과 팀 나누기를 한 곳에서',
    layout: 'wide',
    icon: '<circle cx="9" cy="10" r="5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16" cy="16" r="5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 8v4M7 10h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
