/**
 * 마크다운 문법표 (TASK-KL-088)
 *
 * 「표 문법이 뭐였더라」 를 찾을 때 필요한 건 설명이 아니라 **바로 붙여 넣을 조각**이다.
 * 그래서 항목마다 실제로 동작하는 예시를 복사값으로 둔다.
 * GitHub Flavored Markdown(GFM) 기준이며, 편집기에 따라 안 되는 건 따로 표시했다.
 */
(function (): void {
  /** [복사할 조각, 이름, 설명] */
  const M: Record<string, Array<[string, string, string]>> = {
    '글 구조': [
      ['# 제목', '제목 1', '가장 큰 제목 · # 개수로 단계 조절 (최대 6)'],
      ['## 소제목', '제목 2', '문서 본문은 보통 여기서 시작'],
      ['### 작은 제목', '제목 3', '세 번째 단계'],
      ['---', '가로줄', '단락 구분선 (앞뒤로 빈 줄 필요)'],
      ['> 인용문', '인용', '> 를 겹치면 인용 안의 인용'],
      ['\n', '줄바꿈', '문장 끝에 공백 두 칸 또는 빈 줄 하나']
    ],
    '글자 꾸미기': [
      ['**굵게**', '굵게', '별표 두 개로 감싸기'],
      ['*기울임*', '기울임', '별표 하나 · 밑줄 _기울임_ 도 같음'],
      ['***굵은 기울임***', '굵은 기울임', '별표 세 개'],
      ['~~취소선~~', '취소선', '물결 두 개 (GFM)'],
      ['`코드`', '인라인 코드', '백틱 하나로 감싸기'],
      ['<sub>아래첨자</sub>', '아래첨자', 'HTML 태그 · 지원 여부 편집기마다 다름'],
      ['<sup>위첨자</sup>', '위첨자', 'HTML 태그']
    ],
    '목록': [
      ['- 항목', '순서 없는 목록', '- 또는 * · 하위는 공백 2칸 들여쓰기'],
      ['1. 항목', '번호 목록', '숫자는 전부 1. 로 써도 자동으로 매겨짐'],
      ['- [ ] 할 일', '체크박스 (빈칸)', 'GFM 전용 · 목록 안에서만'],
      ['- [x] 끝난 일', '체크박스 (완료)', 'x 는 소문자'],
      ['term\n: 정의', '정의 목록', '일부 확장 문법에서만 동작']
    ],
    '링크·이미지': [
      ['[보이는 글자](https://example.com)', '링크', '대괄호=글자, 소괄호=주소'],
      ['[링크](url "설명")', '툴팁 링크', '주소 뒤 따옴표로 마우스오버 설명'],
      ['![대체 텍스트](image.png)', '이미지', '앞에 느낌표 · 대체 텍스트는 접근성에 중요'],
      ['[![이미지](img.png)](https://link)', '누르는 이미지', '이미지를 링크로 감싼 형태'],
      ['<https://example.com>', '자동 링크', '주소를 꺾쇠로 감싸면 그대로 링크'],
      ['[^1]', '각주 표시', '본문에 표시 · 아래에 [^1]: 내용 을 적는다']
    ],
    '코드': [
      ['```js\ncode\n```', '코드 블록', '백틱 세 개 + 언어 이름 → 문법 강조'],
      ['```diff\n+ 추가\n- 삭제\n```', 'diff 블록', '추가는 초록, 삭제는 빨강으로'],
      ['    들여쓴 코드', '들여쓰기 코드 블록', '공백 4칸 · 요즘은 백틱 방식을 권장']
    ],
    '표': [
      ['| 열1 | 열2 |\n| --- | --- |\n| 값1 | 값2 |', '기본 표', 'GFM · 구분선 줄이 반드시 필요'],
      ['| 왼쪽 | 가운데 | 오른쪽 |\n| :-- | :-: | --: |\n| a | b | c |', '정렬 지정 표', '콜론 위치로 정렬 방향 결정']
    ],
    'GitHub 확장': [
      ['- [ ] 할 일\n- [x] 한 일', '작업 목록', '이슈·PR 본문에서 클릭으로 체크됨'],
      ['@사용자', '멘션', '이슈·PR 에서 알림이 감'],
      ['#123', '이슈 참조', '같은 저장소의 이슈·PR 번호'],
      ['```mermaid\ngraph TD;\nA-->B;\n```', 'mermaid 다이어그램', 'GitHub·일부 뷰어에서 그림으로 렌더링'],
      ['> [!NOTE]\n> 알림 내용', '알림 블록', 'NOTE·TIP·IMPORTANT·WARNING·CAUTION'],
      ['<details>\n<summary>접기</summary>\n\n내용\n\n</details>', '접었다 펴기', 'summary 다음에 빈 줄이 있어야 안이 렌더링됨']
    ],
    '자주 막히는 것': [
      ['\\*별표\\*', '기호 그대로 쓰기', '역슬래시로 문법 해제 (이스케이프)'],
      ['&nbsp;', '빈 칸 강제', '연속 공백이 무시될 때'],
      ['<br>', '강제 줄바꿈', '표 안처럼 빈 줄을 못 쓰는 자리에서'],
      ['`` `백틱` ``', '백틱 자체 표시', '바깥 백틱을 하나 더 늘린다']
    ]
  };

  Toolbox.register({
    id: 'markdown',
    title: '마크다운 문법표',
    category: 'ref',
    desc: '제목·표·코드블록·체크박스 등 마크다운 문법을 찾아 그대로 복사합니다 (GFM 기준)',
    layout: 'wide',
    icon: '<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 15V9l3 3 3-3v6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 9v4M15 12l2 2 2-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '문법표',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '표 문법은 저도 매번 까먹어요.' });
          const items = Object.keys(M).flatMap((group) =>
            M[group].map(([copy, label, desc]) => ({
              copy,
              // 줄바꿈이 든 조각은 표에서 한 줄로 보여야 읽힌다.
              glyph: copy.replace(/\n/g, ' ⏎ ').slice(0, 42),
              label,
              sub: desc,
              keywords: `${label} ${desc} ${copy}`,
              group
            }))
          );
          window.RefTable?.build(container, {
            items,
            placeholder: '무엇을 쓰려는지 적어 보세요 (예: 표, 체크박스, 접기, 코드)',
            copyNoun: '문법',
            layout: 'list',
            note: '누르면 문법 조각이 그대로 복사됩니다 (GFM 기준).'
          });
        }
      }
    ]
  });
})();
