/**
 * 단축키 모음 (TASK-KL-088)
 *
 * 단축키표는 「외운 것을 확인」 이 아니라 「이런 게 있는 줄 몰랐다」 를 위해 존재한다.
 * 그래서 목록을 다 싣지 않고, **알면 실제로 쓰게 되는 것**만 남긴다.
 */
(function (): void {
  /** [단축키, 하는 일, 비고] */
  const S: Record<string, Array<[string, string, string]>> = {
    '윈도우 기본': [
      ['Win + D', '바탕화면 보기', '한 번 더 누르면 원래대로'],
      ['Win + E', '파일 탐색기 열기', ''],
      ['Win + L', '화면 잠그기', '자리 뜰 때'],
      ['Win + V', '클립보드 기록', '예전에 복사한 것까지 꺼낸다 · 처음엔 켜야 함'],
      ['Win + Shift + S', '화면 일부 캡처', '캡처 도구가 바로 뜬다'],
      ['Win + .', '이모지 입력창', '어디서든 이모지'],
      ['Win + 방향키', '창을 반쪽으로 붙이기', '좌우 분할 배치'],
      ['Win + Tab', '작업 보기·가상 데스크톱', ''],
      ['Ctrl + Shift + Esc', '작업 관리자 바로 열기', 'Ctrl+Alt+Del 을 안 거친다'],
      ['Alt + Tab', '창 전환', ''],
      ['F2', '이름 바꾸기', '탐색기에서'],
      ['Shift + Delete', '휴지통 안 거치고 삭제', '되돌릴 수 없다']
    ],
    '맥 기본': [
      ['Cmd + Space', '스포트라이트 검색', '앱 실행·파일 찾기·계산까지'],
      ['Cmd + Tab', '앱 전환', ''],
      ['Cmd + Shift + 4', '화면 일부 캡처', 'Space 를 더 누르면 창 단위'],
      ['Cmd + Shift + 5', '캡처·화면 녹화', ''],
      ['Cmd + Option + Esc', '강제 종료 창', ''],
      ['Cmd + ,', '앱 환경설정', '거의 모든 맥 앱 공통'],
      ['Ctrl + Cmd + Space', '이모지 입력창', ''],
      ['Cmd + Delete', '휴지통으로 보내기', '']
    ],
    '어디서나 쓰는 것': [
      ['Ctrl / Cmd + Z', '실행 취소', ''],
      ['Ctrl / Cmd + Shift + Z', '다시 실행', '앱에 따라 Ctrl+Y'],
      ['Ctrl / Cmd + Shift + V', '서식 없이 붙여넣기', '글꼴·색이 딸려오지 않는다'],
      ['Ctrl / Cmd + F', '찾기', ''],
      ['Ctrl / Cmd + A', '전체 선택', ''],
      ['Ctrl / Cmd + S', '저장', ''],
      ['Home / End', '줄 처음·끝으로', '맥은 Cmd + ← / →'],
      ['Ctrl / Cmd + 방향키', '단어 단위 이동', 'Shift 를 더하면 단어 단위 선택']
    ],
    브라우저: [
      ['Ctrl / Cmd + T', '새 탭', ''],
      ['Ctrl / Cmd + Shift + T', '닫은 탭 되살리기', '실수로 닫았을 때 · 여러 번 가능'],
      ['Ctrl / Cmd + W', '탭 닫기', ''],
      ['Ctrl / Cmd + L', '주소창으로 이동', 'F6 또는 Alt+D 도 같음'],
      ['Ctrl / Cmd + Shift + N', '시크릿 창', '파이어폭스는 Shift+P'],
      ['Ctrl / Cmd + Shift + R', '캐시 무시하고 새로고침', '화면이 옛것일 때'],
      ['Ctrl / Cmd + 숫자', 'n번째 탭으로', '9 는 항상 마지막 탭'],
      ['F12', '개발자 도구', ''],
      ['Space / Shift + Space', '한 화면씩 아래·위로', '']
    ],
    'VS Code': [
      ['Ctrl / Cmd + P', '파일 빠른 열기', '이름 일부만 쳐도 찾는다'],
      ['Ctrl / Cmd + Shift + P', '명령 팔레트', '기능 이름을 검색해 실행 — 단축키를 몰라도 된다'],
      ['Ctrl / Cmd + D', '같은 단어 다음 것도 선택', '반복하면 여러 곳 동시 편집'],
      ['Alt + ↑ / ↓', '줄 옮기기', '맥은 Option'],
      ['Shift + Alt + ↑ / ↓', '줄 복제', ''],
      ['Ctrl / Cmd + /', '주석 토글', ''],
      ['Ctrl + `', '터미널 열고 닫기', ''],
      ['Ctrl / Cmd + Shift + F', '전체 검색', '열려 있지 않은 파일까지'],
      ['F2', '이름 한 번에 바꾸기', '쓰인 곳 전부 · 문자열 치환보다 안전'],
      ['Alt + 클릭', '커서 여러 개 놓기', '']
    ],
    한글입력: [
      ['한자 키 (또는 오른쪽 Alt)', '한자·특수문자 변환', '자음 하나 치고 누르면 기호 목록'],
      ['Shift + Space', '한영 전환', '기기에 따라 다름'],
      ['ㅁ + 한자', '문장부호 목록', '『 』 【 】 등'],
      ['ㅇ + 한자', '원문자·괄호문자', '① ㉠ ⓐ 등']
    ]
  };

  Toolbox.register({
    id: 'shortcut',
    title: '단축키 모음',
    category: 'ref',
    desc: '윈도우·맥·브라우저·VS Code 단축키 중 알면 실제로 쓰게 되는 것만 모았습니다',
    layout: 'wide',
    icon: '<rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h1M10 9h1M14 9h1M18 9h1M6 13h1M10 13h5M18 13h1M8 16.5h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '단축키',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: 'Ctrl+Shift+T 하나만 알아도 이득이에요.' });
          const items = Object.keys(S).flatMap((group) =>
            S[group].map(([key, label, desc]) => ({
              copy: key,
              glyph: key,
              label,
              sub: desc,
              keywords: `${key} ${label} ${desc}`,
              group
            }))
          );
          window.RefTable?.build(container, {
            items,
            placeholder: '하려는 일로 찾기 (예: 캡처, 닫은 탭, 주석, 이모지)',
            copyNoun: '단축키',
            layout: 'list',
            note: '알면 실제로 쓰게 되는 것만 골랐습니다.'
          });
        }
      }
    ]
  });
})();
