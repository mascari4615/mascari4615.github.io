/**
 * 참고표 (TASK-KL-088) — HTTP 상태·git 명령어·마크다운·단축키·확장자·키 코드를 한 위젯의 탭으로.
 *
 * 전부 「몰라서 찾아보는 표」 라 성격이 같다. 여섯 개가 목록에 나란히 서 있으면
 * 정작 무엇이 있는지 눈에 안 들어온다. 한 자리에 모아 탭으로 고르게 한다.
 * 화면은 각 부분 위젯이 그대로 그린다 — 표 데이터는 여전히 한 곳에만 있다.
 */
(function (): void {
  const PARTS: Array<[string, string]> = [
    ['gitcmd', 'git 명령어'],
    ['markdown', '마크다운'],
    ['httpstatus', 'HTTP 상태'],
    ['shortcut', '단축키'],
    ['filetype', '파일 확장자'],
    ['keycode', '키 코드']
  ];

  Toolbox.register({
    id: 'reference',
    title: '참고표',
    category: 'ref',
    desc: 'git 명령어·마크다운·HTTP 상태·단축키·파일 확장자·키 코드를 한 곳에서 찾아봅니다',
    layout: 'wide',
    icon: '<path d="M4 5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M4 18a2 2 0 0 1 2-2h13" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 7h7M8 11h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: PARTS.map(([id, label]) => ({
      id,
      label,
      build: function (container: HTMLElement): void {
        Toolbox.mountTool(id, container);
      }
    }))
  });
})();
