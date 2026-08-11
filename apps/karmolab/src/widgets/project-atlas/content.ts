export type AtlasMode = 'learn' | 'reference';
export type LabKind = 'none' | 'dom' | 'layout' | 'event' | 'architecture' | 'debug' | 'project';

export interface Lesson {
  id: string;
  module: string;
  number: string;
  title: string;
  summary: string;
  minutes: number;
  objectives: string[];
  explain: Array<{ title: string; body: string }>;
  code?: string;
  files: string[];
  lab: LabKind;
  question: string;
  choices: string[];
  answer: number;
  answerNote: string;
}

export const LESSONS: Lesson[] = [
  {
    id:'orientation', module:'시작하기', number:'01', title:'작업 환경과 안전선', summary:'편집기·터미널·개발 서버의 역할을 구분하고 기존 변경을 지키는 법을 배웁니다.', minutes:12,
    objectives:['VS Code와 터미널의 역할 구분','개발 서버를 직접 열기','src 원본과 생성 js 구분','내가 바꾼 한 줄만 복구'],
    explain:[
      { title:'세 개의 창', body:'VS Code는 파일을 고치고, 터미널은 검사와 서버를 실행하며, 브라우저는 결과와 오류를 보여줍니다. 셋은 같은 일을 하지 않습니다.' },
      { title:'가장 중요한 안전선', body:'이 작업공간에는 다른 미커밋 변경이 있을 수 있습니다. 파일 전체 checkout/reset 대신 내가 바꾼 문자열만 직접 원래대로 고칩니다.' },
      { title:'첫 실행', body:'karmoddrine에서 KarmoLab 폴더로 이동해 npm run dev를 실행하고, 브라우저 주소창에 127.0.0.1:8813/apps/karmolab/index.html을 입력합니다.' },
    ],
    code:'node --version\nnpm --version\ncd Mascari4615.github.io/apps/karmolab\nnpm run dev', files:['AGENTS.md','apps/karmolab/package.json','apps/karmolab/src/widgets/README.md'], lab:'none',
    question:'사람이 직접 수정해야 하는 것은 어느 쪽인가요?', choices:['js/widgets의 번들','src의 TypeScript 원본','브라우저 DOM','service worker cache'], answer:1, answerNote:'src가 정본입니다. js/widgets는 build가 다시 만드는 결과입니다.',
  },
  {
    id:'browser', module:'Web 기초', number:'02', title:'브라우저가 화면을 만드는 과정', summary:'HTML·CSS·TypeScript·DOM이 한 화면에 합쳐지는 순서를 봅니다.', minutes:15,
    objectives:['HTML/CSS/TS 역할 구분','DOM의 의미 이해','파일과 실행 중 화면 구분'],
    explain:[
      { title:'HTML은 구조', body:'제목, 버튼, 목록처럼 무엇이 존재하고 서로 어떤 부모·자식 관계인지 정합니다. KarmoLab에서는 TS의 template string 안에 자주 있습니다.' },
      { title:'CSS는 규칙', body:'class를 통해 크기, 간격, 색과 배치를 정합니다. HTML은 같아도 부모의 display만 바꾸면 화면이 달라집니다.' },
      { title:'TypeScript와 DOM', body:'TypeScript가 실행되면 브라우저의 실제 화면 객체인 DOM을 만들고 찾고 바꿉니다. 타입 정보는 검사에 쓰이고 브라우저용 JS에는 남지 않습니다.' },
    ],
    code:'container.innerHTML = `<button class="card">열기</button>`;\n// HTML 구조       CSS가 찾는 이름\ncontainer.querySelector(".card"); // 실행 중 DOM 찾기', files:['src/widgets/project-atlas/project-atlas.ts','src/widgets/project-atlas/styles.ts'], lab:'dom',
    question:'버튼은 보이지만 간격만 이상하다면 어느 층부터 보나요?', choices:['HTML 문구','부모 CSS','fetch 응답','TypeScript 타입'], answer:1, answerNote:'배치와 간격은 CSS 문제일 가능성이 가장 높고, 특히 부모의 display/gap/padding부터 봅니다.',
  },
  {
    id:'layout', module:'Web 기초', number:'03', title:'CSS 레이아웃을 눈으로 익히기', summary:'같은 HTML에 flex와 grid를 적용하고 gap·padding의 차이를 직접 확인합니다.', minutes:18,
    objectives:['부모 layout 규칙 이해','gap과 padding 구분','반응형 전환 이해'],
    explain:[
      { title:'부모가 배치를 결정', body:'Unity Layout Group처럼 CSS에서도 자식을 하나씩 밀기보다 부모에 flex나 grid 규칙을 줍니다.' },
      { title:'서로 다른 두 간격', body:'padding은 부모 테두리와 내용 사이, gap은 자식과 자식 사이입니다. 둘을 같은 여백으로 생각하면 레이아웃 수정이 꼬입니다.' },
      { title:'반응형', body:'화면 폭이 줄면 media query가 열 수나 방향을 바꿉니다. 넓은 화면만 확인하면 모바일 회귀를 놓칩니다.' },
    ],
    code:'.parent {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 16px;\n  padding: 20px;\n}', files:['src/widgets/project-atlas/styles.ts','src/widgets/README.md'], lab:'layout',
    question:'카드 사이의 거리만 넓히려면 무엇을 바꾸나요?', choices:['padding','gap','font-size','innerHTML'], answer:1, answerNote:'gap은 자식 사이, padding은 부모 안쪽 가장자리의 여백입니다.',
  },
  {
    id:'events', module:'동작 만들기', number:'04', title:'이벤트 → 상태 → 렌더', summary:'클릭이 data 속성을 거쳐 상태를 바꾸고 화면을 다시 만드는 흐름을 실행합니다.', minutes:20,
    objectives:['event target 읽기','dataset으로 의도 전달','상태와 DOM 갱신 구분','listener 정리 필요성 이해'],
    explain:[
      { title:'이벤트는 신호', body:'버튼 클릭 자체에는 앱의 의미가 없습니다. data-action 같은 HTML 신호를 읽어 어떤 상태를 바꿀지 결정합니다.' },
      { title:'상태가 진실', body:'화면 글자를 직접 여기저기 고치기보다 count 같은 상태를 바꾸고 render가 그 상태를 화면에 반영하게 합니다.' },
      { title:'정리도 기능', body:'KarmoLab hot swap에서는 listener와 timer가 남을 수 있습니다. build에서 만든 장기 자원은 Toolbox.onDispose에 정리를 등록합니다.' },
    ],
    code:'let count = 0;\ncontainer.addEventListener("click", (event) => {\n  const button = (event.target as HTMLElement).closest("[data-add]");\n  if (!button) return;\n  count += Number(button.dataset.add);\n  render();\n});', files:['src/widgets/project-atlas/project-atlas.ts','src/toolbox.ts'], lab:'event',
    question:'클릭 후 상태는 바뀌는데 화면이 그대로라면 무엇을 확인하나요?', choices:['render 호출','CSS font','npm 버전','JSON 파일'], answer:0, answerNote:'상태 변경 뒤 DOM을 갱신하는 render 또는 직접 업데이트가 실행돼야 합니다.',
  },
  {
    id:'architecture', module:'KarmoLab 구조', number:'05', title:'메뉴에서 위젯 실행까지', summary:'위젯 주소록, lazy loader, register, build, dispose를 하나의 실행 흐름으로 연결합니다.', minutes:22,
    objectives:['화면 이름에서 원본 찾기','lazyScriptPaths 이해','register/build 진입점 찾기','shell과 위젯 경계 이해'],
    explain:[
      { title:'주소록', body:'widgets-lazy-meta.ts가 id, 제목, layout과 lazyScriptPaths를 보관합니다. 화면 이름에서 실제 bundle로 가는 첫 단서입니다.' },
      { title:'등록과 build', body:'bundle이 로드되면 Toolbox.register가 위젯을 등록합니다. 사용자가 열 때 tab의 build(container)가 실제 화면을 만듭니다.' },
      { title:'모듈 따라가기', body:'entry 파일이 content.ts나 styles.ts를 import할 수 있습니다. meta에서 entry를 찾은 뒤 import를 따라가야 정본이 나타납니다.' },
    ],
    code:"widgets-lazy-meta.ts\n  ↓ lazyScriptPaths\nproject-atlas/project-atlas.ts\n  ↓ import\ncontent.ts + styles.ts\n  ↓ Toolbox.register → build(container)", files:['src/widgets-lazy-meta.ts','src/widgets-loader.ts','src/toolbox.ts','src/widgets/project-atlas/'], lab:'architecture',
    question:'meta가 project-atlas.ts를 가리키는데 문구가 없다면 다음 행동은?', choices:['생성 JS 수정','import 경로 따라가기','index.html 삭제','캐시만 지우기'], answer:1, answerNote:'entry 파일의 import를 따라 content.ts 같은 실제 정본 모듈을 찾습니다.',
  },
  {
    id:'boundaries', module:'KarmoLab 구조', number:'06', title:'데이터·번역·Tauri 경계', summary:'같은 화면에 들어오는 정적 JSON, 브라우저 저장소, 번역과 데스크톱 기능을 구분합니다.', minutes:20,
    objectives:['fetch와 localStorage 구분','i18n catalog 위치 이해','웹판과 Tauri 기능 경계 이해'],
    explain:[
      { title:'데이터의 주소', body:'fetch는 URL의 JSON/문서를 읽고, localStorage는 현재 브라우저 origin에 작은 문자열을 남깁니다. 출처와 수명이 다릅니다.' },
      { title:'보이는 문구의 정본', body:'화면 문구가 TS에 없으면 i18n/ko의 widget catalog나 공용 catalog를 찾습니다. key와 fallback을 구분합니다.' },
      { title:'Tauri는 별도 권한층', body:'브라우저에서 불가능한 파일·프로세스 기능은 Tauri command를 통해 연결됩니다. 모든 위젯이 Tauri를 사용하는 것은 아닙니다.' },
    ],
    code:'const response = await fetch("/apps/karmolab/data/example.json");\nconst rows = await response.json();\nlocalStorage.setItem("my-key", JSON.stringify(rows));\nconst title = t("widget.title", undefined, "기본 제목");', files:['data/','i18n/ko/','src/lib/i18n.ts','apps/karmolab-tauri/src-tauri/'], lab:'none',
    question:'새로고침 후 현재 PC 브라우저에만 남아야 하는 작은 값은?', choices:['fetch URL','localStorage','i18n catalog','Tauri permission'], answer:1, answerNote:'localStorage는 같은 origin의 브라우저에 문자열을 보관합니다.',
  },
  {
    id:'debugging', module:'문제 해결', number:'07', title:'오류를 층별로 좁히기', summary:'증상에서 시작해 터미널·Console·Network·DOM 중 어디를 볼지 결정합니다.', minutes:22,
    objectives:['첫 오류 읽기','화면/동작/데이터 문제 분류','DevTools 도구 선택','재현과 확인 구분'],
    explain:[
      { title:'첫 오류부터', body:'터미널 오류가 길어도 가장 위의 파일 경로와 줄·칸을 먼저 봅니다. 뒤의 오류는 첫 실패에서 연쇄된 것일 수 있습니다.' },
      { title:'관측 도구 선택', body:'Console은 실행 오류, Network는 파일·JSON 요청, Elements는 실제 DOM과 적용 CSS를 보여줍니다.' },
      { title:'검사는 서로 다름', body:'typecheck 통과는 타입 계약 증거입니다. 클릭과 레이아웃은 실제 브라우저에서 따로 확인해야 합니다.' },
    ],
    code:'화면이 안 뜸 → Network에서 bundle 요청\n버튼이 안 됨 → Console + data-* + listener\n간격이 이상함 → Elements의 부모 computed style\n목록이 비었음 → Network response + JSON shape', files:['package.json','build.mjs','브라우저 DevTools'], lab:'debug',
    question:'JSON 목록이 비었을 때 가장 먼저 볼 곳은?', choices:['폰트 설정','Network 응답','git log','CSS radius'], answer:1, answerNote:'요청 상태와 실제 응답을 확인해야 URL 문제와 parsing/UI 문제를 구분할 수 있습니다.',
  },
  {
    id:'project', module:'최종 프로젝트', number:'08', title:'작은 위젯 하나 완성하기', summary:'배운 구조·스타일·이벤트·검증을 합쳐 개인 카운터 위젯의 설계를 완성합니다.', minutes:35,
    objectives:['변경 범위 설계','register/build/render 구성','이벤트와 dispose 적용','검증 체크리스트 작성'],
    explain:[
      { title:'먼저 범위', body:'버튼 두 개와 숫자 하나만 있는 counter를 목표로 합니다. 저장이나 Tauri 같은 기능은 첫 버전에 넣지 않습니다.' },
      { title:'완성 조건', body:'메뉴에서 열리고, +1/-1이 작동하고, 모바일에서 넘치지 않으며, typecheck와 실제 클릭 검증을 통과해야 합니다.' },
      { title:'스스로 설명', body:'어떤 파일이 주소록이고, 어떤 값이 상태이며, 어떤 이벤트가 상태를 바꾸는지 설명할 수 있어야 끝입니다.' },
    ],
    code:"// src/widgets/my-counter/my-counter.ts\nlet count = 0;\nfunction render(container: HTMLElement): void {\n  container.innerHTML = `<output>${count}</output>\n    <button data-delta=\"-1\">-1</button>\n    <button data-delta=\"1\">+1</button>`;\n}\n// register → build → listener → render 순서로 완성", files:['src/widgets/README.md','src/widgets-lazy-meta.ts','src/widgets/my-counter/my-counter.ts','build.mjs'], lab:'project',
    question:'최종 프로젝트의 행동 검증으로 가장 적절한 것은?', choices:['파일이 존재한다','typecheck만 통과한다','버튼 클릭 후 숫자와 모바일 화면을 확인한다','주석을 많이 쓴다'], answer:2, answerNote:'타입 검사와 사용자 관측 행동은 별개입니다. 실제 클릭과 레이아웃까지 확인해야 합니다.',
  },
];

export const TROUBLESHOOT = [
  ['node/npm 없음','Node.js 설치 후 VS Code와 터미널을 모두 다시 연다.'],['package.json 없음','현재 경로가 apps/karmolab인지 확인한다.'],['8813 사용 중','기존 개발 서버가 켜졌는지 URL을 먼저 연다.'],['수정 미반영','src 확인 → 저장 → 개발 터미널 첫 오류 → 위젯 재진입 → 새로고침.'],['TS 오류가 김','가장 위 error의 파일·줄·칸부터 읽는다.'],['버튼 무반응','data-* → listener selector → 상태 변경 → render 순서로 본다.'],['목록 비어 있음','Network status/response → JSON shape → empty/error UI 순서.'],['안전한 복구','파일 전체 reset 대신 내가 바꾼 한 줄만 직접 원복한다.'],
] as const;
