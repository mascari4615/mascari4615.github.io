/**
 * 개발 도구 (TASK-KL-088) — 개발하다 잠깐 필요해지는 것들을 한 위젯의 탭으로.
 *
 * 이것들은 「작업 중에 잠깐」 쓰인다. 낱개로 흩어져 있으면 매번 목록에서 찾아야 하고,
 * 정작 무엇이 있는지도 눈에 안 들어온다.
 * 화면은 각 부분 위젯이 그대로 그린다 (Toolbox.mountTool) — 복제하면 고칠 곳이 갈라진다.
 * 부분 위젯의 개별 주소는 그대로 살아 있다 (검색 유입 유지).
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['jsonfmt', 'JSON'],
    ['jwt', 'JWT'],
    ['regextest', '정규식'],
    ['hashgen', '해시'],
    ['uuidgen', 'UUID'],
    ['cron', '크론'],
    ['urlparse', 'URL'],
    ['crypto', '암호화']
  ];

  Toolbox.register({
    id: 'devtool',
    title: '개발 도구',
    category: 'tool',
    desc: 'JSON 포맷·JWT 디코드·정규식 테스트·해시·UUID·크론·URL·암호화를 한 곳에서',
    layout: 'wide',
    lazyTabs: true, // 안 본 탭은 만들지 않는다
    icon: '<path d="M9 6 3 12l6 6M15 6l6 6-6 6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
