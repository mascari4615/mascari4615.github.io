/**
 * Project Atlas — KarmoLab/WM/memo 구조를 읽고 수정 지점을 찾는 개발자용 지도.
 *
 * 첫 버전은 C4식 레벨 전환 + 클릭 가능한 노드 + 작업 레시피를 제공한다.
 * 런타임에 볼 수 있는 위젯 메타와 servermonitor 설정은 요약으로 끌어와
 * 완전 수동 문서가 되지 않게 한다.
 */
(function (): void {
  if (typeof Toolbox === 'undefined') return;

  type LevelId = 'landscape' | 'containers' | 'components' | 'code';
  type DocKind = 'tutorial' | 'howto' | 'reference' | 'explanation';

  interface AtlasNode {
    id: string;
    level: LevelId;
    title: string;
    kind: string;
    summary: string;
    path: string;
    webNote: string;
    unityNote: string;
    editWhen: string[];
    links: Array<{ label: string; widget?: string; href?: string }>;
    x: number;
    y: number;
    w: number;
    h: number;
    group: 'karmolab' | 'wm' | 'memo' | 'bot' | 'infra';
  }

  interface AtlasEdge {
    from: string;
    to: string;
    label: string;
  }

  interface AtlasRecipe {
    id: string;
    title: string;
    kind: DocKind;
    goal: string;
    steps: string[];
    files: string[];
  }

  interface ServerMonitorConfig {
    devProfiles?: unknown[];
    localMonitors?: unknown[];
    envFiles?: unknown[];
  }

  const LEVELS: Array<{ id: LevelId; label: string; note: string }> = [
    { id: 'landscape', label: '1. Landscape', note: '전체 작업공간과 레포 관계' },
    { id: 'containers', label: '2. Containers', note: '앱·게임·지식베이스 단위' },
    { id: 'components', label: '3. Components', note: '위젯·봇·문서·빌드 흐름' },
    { id: 'code', label: '4. Code', note: '직접 고치는 파일과 진입점' },
  ];

  const GROUP_COLOR: Record<AtlasNode['group'], string> = {
    karmolab: 'var(--accent, #a99bf5)',
    wm: '#62c6a6',
    memo: '#f4c56a',
    bot: '#7db4ff',
    infra: '#e48aa0',
  };

  const NODES: AtlasNode[] = [
    {
      id: 'umbrella',
      level: 'landscape',
      title: 'karmoddrine',
      kind: 'workspace',
      summary: '세 개의 주요 레포를 한 폴더에서 같이 보는 umbrella 작업공간.',
      path: 'C:/Users/masca/repos/karmoddrine',
      webNote: '웹 프로젝트 하나가 아니라 여러 독립 레포가 같이 놓인 구조다. 커밋은 각 레포 단위로 한다.',
      unityNote: 'Unity 솔루션 하나가 아니라, Unity 프로젝트와 웹/문서 레포가 옆에 있는 형태라고 보면 된다.',
      editWhen: ['공통 룰을 바꿀 때', '프로젝트 간 관계를 이해할 때', 'AI 세션 진입 문서를 고칠 때'],
      links: [{ label: '문서', widget: 'docs' }, { label: '작업', widget: 'quest-log' }],
      x: 330, y: 34, w: 250, h: 84, group: 'infra',
    },
    {
      id: 'githubio',
      level: 'landscape',
      title: 'Mascari4615.github.io',
      kind: 'repo',
      summary: 'KarmoLab, 블로그, Discord 봇, 공용 패키지가 들어 있는 메인 코드 레포.',
      path: 'Mascari4615.github.io/',
      webNote: '웹에서 보이는 대부분의 기능은 여기에서 나온다. KarmoLab 위젯도 이 레포의 앱 중 하나다.',
      unityNote: 'Unity의 Assets 폴더처럼 실제 실행 코드가 많이 있는 쪽이다.',
      editWhen: ['KarmoLab 위젯을 추가/수정할 때', '봇 코드를 고칠 때', '블로그/웹 배포를 고칠 때'],
      links: [{ label: 'KarmoLab 문서', widget: 'docs' }, { label: '서버 모니터', widget: 'servermonitor' }],
      x: 72, y: 185, w: 250, h: 90, group: 'karmolab',
    },
    {
      id: 'wmrepo',
      level: 'landscape',
      title: 'WitchMendokusai',
      kind: 'Unity repo',
      summary: 'Unity 게임 본체. C# 게임 로직, 씬, 에셋, 패키지가 들어 있다.',
      path: 'WitchMendokusai/',
      webNote: '웹 앱은 아니지만 KarmoLab의 WM 위젯이 이 게임의 공개 도감/소식을 보여준다.',
      unityNote: '여기가 네가 익숙한 Unity 프로젝트다. Web 쪽은 이 게임을 설명하거나 보조한다.',
      editWhen: ['게임 로직을 고칠 때', 'Unity 씬/프리팹/에셋을 다룰 때', 'WM 입력/DI 규칙을 바꿀 때'],
      links: [{ label: 'WM 위젯', widget: 'wm' }],
      x: 372, y: 185, w: 236, h: 90, group: 'wm',
    },
    {
      id: 'memo',
      level: 'landscape',
      title: 'memo',
      kind: 'knowledge repo',
      summary: '룰, TASK, 캐릭터, WM 설계 문서가 들어 있는 지식베이스 레포.',
      path: 'memo/',
      webNote: '코드가 아니라 정본 문서다. KarmoLab의 QuestLog와 WM 도감이 여기 문서를 읽는다.',
      unityNote: 'Unity 프로젝트 밖에 있는 기획서/작업보드/캐릭터 설정 저장소다.',
      editWhen: ['TASK를 남길 때', '프로젝트 룰을 고칠 때', 'WM 설계/세계관 문서를 고칠 때'],
      links: [{ label: 'QuestLog', widget: 'quest-log' }, { label: '문서', widget: 'docs' }],
      x: 660, y: 185, w: 230, h: 90, group: 'memo',
    },

    {
      id: 'karmolab',
      level: 'containers',
      title: 'KarmoLab Web App',
      kind: 'browser app',
      summary: '여러 도구와 위젯을 한 화면에서 여는 브라우저 앱.',
      path: 'Mascari4615.github.io/apps/karmolab/',
      webNote: 'HTML은 껍데기, TypeScript는 동작, CSS는 모양이다. 빌드하면 src가 js로 변환된다.',
      unityNote: 'Unity 씬 하나에 여러 패널/프리팹을 띄우는 것과 비슷하다.',
      editWhen: ['새 위젯을 만들 때', '화면 동작을 바꿀 때', 'KarmoLab 자체 UX를 고칠 때'],
      links: [{ label: '문서', widget: 'docs' }, { label: 'KarmoMap', widget: 'karmomap' }],
      x: 84, y: 80, w: 260, h: 94, group: 'karmolab',
    },
    {
      id: 'tauri',
      level: 'containers',
      title: 'KarmoLab Desktop',
      kind: 'Tauri shell',
      summary: '웹 KarmoLab에 로컬 파일/프로세스 제어 능력을 붙이는 데스크톱 앱.',
      path: 'Mascari4615.github.io/apps/karmolab-tauri/',
      webNote: '브라우저만으로 못 하는 로컬 명령은 Tauri의 Rust command를 통해 실행한다.',
      unityNote: 'Unity C#이 OS 기능을 호출하는 네이티브 플러그인과 비슷하다.',
      editWhen: ['로컬 서버 시작/종료를 붙일 때', '파일 시스템 명령을 추가할 때', '데스크톱 업데이트 흐름을 고칠 때'],
      links: [{ label: '서버 모니터', widget: 'servermonitor' }],
      x: 392, y: 80, w: 250, h: 94, group: 'infra',
    },
    {
      id: 'yawnbot',
      level: 'containers',
      title: 'YawnBot',
      kind: 'Discord bot',
      summary: 'Discord 대화, 캐릭터 기억, GitHub webhook, AI 호출을 담당하는 봇.',
      path: 'Mascari4615.github.io/apps/discord-bots/apps/yawnbot/',
      webNote: '웹 페이지는 아니지만 Node.js TypeScript 앱이다. 서버처럼 계속 실행된다.',
      unityNote: '게임 밖에서 도는 전용 서버/툴 프로세스라고 보면 된다.',
      editWhen: ['Discord 명령을 바꿀 때', 'AI 응답 흐름을 고칠 때', '캐릭터 기억 로직을 손볼 때'],
      links: [{ label: '서버 모니터', widget: 'servermonitor' }, { label: '문서', widget: 'docs' }],
      x: 690, y: 80, w: 246, h: 94, group: 'bot',
    },
    {
      id: 'wm-game',
      level: 'containers',
      title: 'WM Unity Game',
      kind: 'Unity client',
      summary: '실제 게임 플레이가 들어 있는 Unity 프로젝트.',
      path: 'WitchMendokusai/Assets/_WitchMendokusai/',
      webNote: 'KarmoLab은 이 게임을 빌드하지 않는다. 대신 문서/현황/도감을 보여주는 입구가 된다.',
      unityNote: '네가 직접 고칠 게임 코드의 중심.',
      editWhen: ['플레이어/아이템/전투/입력을 고칠 때', '씬 배치를 바꿀 때', '게임 UI를 만들 때'],
      links: [{ label: 'WM 소개', widget: 'wm' }],
      x: 220, y: 244, w: 260, h: 94, group: 'wm',
    },
    {
      id: 'memo-docs',
      level: 'containers',
      title: 'memo Docs',
      kind: 'source of truth',
      summary: 'AI 룰, TASK, WM 설계, 캐릭터 설정의 정본.',
      path: 'memo/',
      webNote: 'KarmoLab의 여러 위젯이 이 문서를 읽어 화면으로 바꾼다.',
      unityNote: '기획서와 작업 티켓이 한 저장소에 모여 있는 형태다.',
      editWhen: ['AI에게 남길 규칙을 정할 때', '로드맵/TASK를 정리할 때', 'WM 세계관 문서를 수정할 때'],
      links: [{ label: 'QuestLog', widget: 'quest-log' }],
      x: 544, y: 244, w: 260, h: 94, group: 'memo',
    },

    {
      id: 'widget-system',
      level: 'components',
      title: 'Widget System',
      kind: 'KarmoLab component',
      summary: '위젯 메타, lazy loader, Toolbox.register로 화면을 구성하는 시스템.',
      path: 'apps/karmolab/src/widgets-lazy-meta.ts + src/widgets/',
      webNote: '새 도구는 메타에 등록되고, 실제 코드는 lazyScriptPaths로 필요할 때 로드된다.',
      unityNote: '프리팹 목록과 실제 프리팹 파일을 따로 두고, 필요할 때 인스턴스화하는 구조와 비슷하다.',
      editWhen: ['새 위젯을 추가할 때', '위젯 이름/분류/아이콘을 바꿀 때', '위젯 로딩 방식을 고칠 때'],
      links: [{ label: '문서 위젯', widget: 'docs' }],
      x: 72, y: 50, w: 264, h: 94, group: 'karmolab',
    },
    {
      id: 'atlas',
      level: 'components',
      title: 'Project Atlas',
      kind: 'new widget',
      summary: '지금 보고 있는 프로젝트 이해/수정 지도.',
      path: 'apps/karmolab/src/widgets/project-atlas/project-atlas.ts',
      webNote: '정적 설명만 두지 않고, 위젯 메타와 서버 설정처럼 살아있는 데이터도 일부 읽는다.',
      unityNote: 'Unity 에디터의 프로젝트 창 + 인스펙터 + 튜토리얼 패널을 합친 보조 도구에 가깝다.',
      editWhen: ['프로젝트 구조 설명을 업데이트할 때', '새 레포/위젯/작업 레시피를 안내에 넣을 때'],
      links: [{ label: 'KarmoMap', widget: 'karmomap' }],
      x: 392, y: 50, w: 250, h: 94, group: 'karmolab',
    },
    {
      id: 'questlog',
      level: 'components',
      title: 'QuestLog',
      kind: 'task viewer',
      summary: 'memo TASK 파일을 읽어 프로젝트 진행도를 보여주는 위젯.',
      path: 'apps/karmolab/src/widgets/quest-log/quest-log.ts',
      webNote: 'Markdown TASK 파일이 UI 데이터가 된다. 문서가 곧 앱 데이터인 패턴이다.',
      unityNote: 'Unity용 커스텀 에디터 창이 ScriptableObject나 JSON 작업목록을 읽는 것과 비슷하다.',
      editWhen: ['TASK 표시 방식을 바꿀 때', '작업 상태 write-back을 고칠 때'],
      links: [{ label: 'QuestLog 열기', widget: 'quest-log' }],
      x: 694, y: 50, w: 250, h: 94, group: 'memo',
    },
    {
      id: 'servermonitor',
      level: 'components',
      title: 'Server Monitor',
      kind: 'desktop widget',
      summary: '로컬 서버/봇/.env를 KarmoLab 카드에서 시작하고 확인하는 위젯.',
      path: 'apps/karmolab/src/widgets/servermonitor.ts + data/servermonitor-config.json',
      webNote: '터미널 명령을 외우지 않게 하고, 설정 JSON을 UI 카드로 바꾼다.',
      unityNote: '에디터 메뉴 버튼으로 외부 서버를 켜고 로그를 보는 개발 도구와 비슷하다.',
      editWhen: ['새 로컬 서버를 등록할 때', '.env 편집 대상을 추가할 때', '로그/health 표시를 고칠 때'],
      links: [{ label: '서버 모니터 열기', widget: 'servermonitor' }],
      x: 84, y: 208, w: 270, h: 94, group: 'infra',
    },
    {
      id: 'wm-web',
      level: 'components',
      title: 'WM Web Surface',
      kind: 'public game surface',
      summary: 'WM 개발 노트와 공개 데이터를 웹 소개/도감/소식으로 보여주는 위젯.',
      path: 'apps/karmolab/src/widgets/wm/wm.ts',
      webNote: '게임 자체가 아니라 게임을 설명하고 보여주는 웹 표면이다.',
      unityNote: '게임 공식 사이트와 개발 노트 뷰어가 KarmoLab 안에 들어온 형태다.',
      editWhen: ['WM 소개/도감 UI를 바꿀 때', '개발 노트 공개 방식을 고칠 때'],
      links: [{ label: 'WM 열기', widget: 'wm' }],
      x: 396, y: 208, w: 250, h: 94, group: 'wm',
    },
    {
      id: 'ai-package',
      level: 'components',
      title: 'karmolab-ai',
      kind: 'shared package',
      summary: 'OpenAI/Gemini/Claude CLI 등 AI 호출을 한 곳에서 감싸는 공용 패키지.',
      path: 'Mascari4615.github.io/packages/karmolab-ai/',
      webNote: 'AI 공급자별 차이를 앱 코드 안에 흩뿌리지 않기 위한 공용 계층이다.',
      unityNote: '여러 시스템이 같이 쓰는 C# service assembly 같은 역할이다.',
      editWhen: ['AI provider를 추가할 때', '봇과 앱의 AI 호출 방식을 함께 바꿀 때'],
      links: [{ label: 'AI 문서', widget: 'docs' }],
      x: 694, y: 208, w: 250, h: 94, group: 'bot',
    },

    {
      id: 'meta-file',
      level: 'code',
      title: 'widgets-lazy-meta.ts',
      kind: 'registry file',
      summary: '위젯 이름, 분류, 아이콘, lazyScriptPaths의 단일 출처.',
      path: 'Mascari4615.github.io/apps/karmolab/src/widgets-lazy-meta.ts',
      webNote: '여기에 등록되지 않으면 위젯은 검색/목록/빌드 대상에서 빠질 수 있다.',
      unityNote: 'Unity에서 메뉴나 Addressables 카탈로그에 프리팹을 등록하는 파일에 가깝다.',
      editWhen: ['위젯 추가', '위젯 분류 변경', '아이콘/설명 변경'],
      links: [{ label: 'Atlas 현재', widget: 'project-atlas' }],
      x: 60, y: 48, w: 260, h: 94, group: 'karmolab',
    },
    {
      id: 'atlas-file',
      level: 'code',
      title: 'project-atlas.ts',
      kind: 'widget entry',
      summary: 'Project Atlas 화면, 구조 데이터, 레시피, 런타임 요약을 그리는 파일.',
      path: 'Mascari4615.github.io/apps/karmolab/src/widgets/project-atlas/project-atlas.ts',
      webNote: 'TypeScript 한 파일이 빌드 후 js/widgets/project-atlas/project-atlas.js가 된다.',
      unityNote: 'MonoBehaviour 하나가 UI 패널을 만들고 버튼 이벤트를 연결하는 것과 비슷하다.',
      editWhen: ['Atlas 화면을 바꿀 때', '구조 노드/레시피를 추가할 때'],
      links: [{ label: '문서', widget: 'docs' }],
      x: 366, y: 48, w: 260, h: 94, group: 'karmolab',
    },
    {
      id: 'build-file',
      level: 'code',
      title: 'build.mjs',
      kind: 'build script',
      summary: 'TypeScript 위젯을 브라우저용 JavaScript로 묶는 빌드 진입점.',
      path: 'Mascari4615.github.io/apps/karmolab/build.mjs',
      webNote: '브라우저는 TS를 직접 실행하지 않는다. build.mjs가 js/ 산출물을 만든다.',
      unityNote: 'Unity가 C#을 컴파일해 실행 가능한 어셈블리로 만드는 단계와 비슷하다.',
      editWhen: ['빌드 산출물 경로를 바꿀 때', '새 특별 번들 규칙이 필요할 때'],
      links: [{ label: '성능', widget: 'perf' }],
      x: 668, y: 48, w: 260, h: 94, group: 'infra',
    },
    {
      id: 'server-config',
      level: 'code',
      title: 'servermonitor-config.json',
      kind: 'runtime config',
      summary: '서버 모니터가 보여줄 로컬 프로세스, health URL, env 파일 목록.',
      path: 'Mascari4615.github.io/apps/karmolab/data/servermonitor-config.json',
      webNote: '새 서버를 만들면 명령 안내 대신 이 설정에 카드로 등록하는 것이 정답이다.',
      unityNote: '개발용 툴 설정 ScriptableObject나 JSON과 비슷하다.',
      editWhen: ['새 봇/서버를 KarmoLab에서 켜게 만들 때', 'health 체크 URL을 추가할 때'],
      links: [{ label: '서버 모니터', widget: 'servermonitor' }],
      x: 214, y: 220, w: 270, h: 94, group: 'infra',
    },
    {
      id: 'wm-input',
      level: 'code',
      title: 'WM Input Rules',
      kind: 'Unity rule',
      summary: 'WM은 Unity New Input System만 쓰고, 입력 추가 시 3곳을 함께 수정한다.',
      path: 'WitchMendokusai/Assets/_WitchMendokusai/',
      webNote: '웹 코드는 아니지만, Atlas가 Unity 작업 진입 규칙을 같이 보여줘야 한다.',
      unityNote: 'Input.GetKeyDown 금지. InputManager와 inputactions를 통해 간다.',
      editWhen: ['새 키/마우스 입력을 추가할 때', '입력 이벤트 타입을 바꿀 때'],
      links: [{ label: 'WM', widget: 'wm' }],
      x: 540, y: 220, w: 270, h: 94, group: 'wm',
    },
  ];

  const EDGES: AtlasEdge[] = [
    { from: 'umbrella', to: 'githubio', label: 'contains' },
    { from: 'umbrella', to: 'wmrepo', label: 'contains' },
    { from: 'umbrella', to: 'memo', label: 'contains' },
    { from: 'karmolab', to: 'tauri', label: 'desktop bridge' },
    { from: 'karmolab', to: 'yawnbot', label: 'API / bot' },
    { from: 'memo-docs', to: 'wm-game', label: 'design source' },
    { from: 'widget-system', to: 'atlas', label: 'registers' },
    { from: 'widget-system', to: 'questlog', label: 'loads' },
    { from: 'servermonitor', to: 'yawnbot', label: 'starts' },
    { from: 'wm-web', to: 'memo-docs', label: 'reads' },
    { from: 'ai-package', to: 'yawnbot', label: 'powers' },
    { from: 'meta-file', to: 'atlas-file', label: 'lazy path' },
    { from: 'build-file', to: 'atlas-file', label: 'bundles' },
    { from: 'server-config', to: 'servermonitor', label: 'configures' },
    { from: 'wm-input', to: 'wm-game', label: 'guards' },
  ];

  const RECIPES: AtlasRecipe[] = [
    {
      id: 'new-widget',
      title: '새 KarmoLab 위젯 만들기',
      kind: 'howto',
      goal: '새 도구를 KarmoLab 목록과 빌드에 자연스럽게 추가한다.',
      steps: [
        '같은 layout/category 위젯 1~2개를 먼저 읽는다.',
        'src/widgets/<slug>/<slug>.ts 또는 src/widgets/<slug>.ts를 만든다.',
        'Toolbox.register와 getLazyWidgetPublicMeta(<slug>)로 등록한다.',
        'widgets-lazy-meta.ts에 id/title/category/layout/icon/lazyScriptPaths를 추가한다.',
        'npm run typecheck와 node build.mjs로 산출물이 만들어지는지 확인한다.',
      ],
      files: ['src/widgets/README.md', 'src/widgets-lazy-meta.ts', 'build.mjs'],
    },
    {
      id: 'edit-widget',
      title: '기존 KarmoLab 위젯 수정',
      kind: 'tutorial',
      goal: '어느 파일을 고쳐야 하는지 찾고, 바로 화면에서 확인한다.',
      steps: [
        'widgets-lazy-meta.ts에서 위젯 id와 lazyScriptPaths를 찾는다.',
        'lazyScriptPaths가 가리키는 src/widgets 아래 파일을 연다.',
        '화면 문구/버튼/상태를 바꾼다.',
        'KarmoLab dev 서버에서 위젯을 다시 열어 확인한다.',
      ],
      files: ['src/widgets-lazy-meta.ts', 'src/widgets/<widget>/'],
    },
    {
      id: 'server-profile',
      title: '서버 모니터에 명령 추가',
      kind: 'howto',
      goal: '사용자가 터미널 명령을 외우지 않도록 KarmoLab 카드로 노출한다.',
      steps: [
        '실행 명령을 package.json script나 허용 program으로 감싼다.',
        'data/servermonitor-config.json의 devProfiles에 시작 명령을 추가한다.',
        '필요하면 localMonitors에 health URL을 같은 id로 묶는다.',
        '환경 파일이 필요하면 envFiles에 등록한다.',
      ],
      files: ['data/servermonitor-config.json', 'apps/karmolab-tauri/src-tauri/src/local_dev.rs'],
    },
    {
      id: 'wm-input',
      title: 'WM 입력 추가',
      kind: 'reference',
      goal: 'Unity New Input System 규칙을 깨지 않고 새 입력을 추가한다.',
      steps: [
        'InputEventType 열거형에 이벤트를 추가한다.',
        'inputEventBindings 딕셔너리에 기본 바인딩을 추가한다.',
        'WMInput.inputactions에 Action 항목을 추가한다.',
        '게임 컴포넌트에서 Keyboard.current/Mouse.current를 직접 읽지 않는다.',
      ],
      files: ['WitchMendokusai/AGENTS.md', 'WMInput.inputactions', 'InputManager'],
    },
    {
      id: 'task-doc',
      title: '작업을 TASK로 남기기',
      kind: 'explanation',
      goal: 'AI 세션이 바뀌어도 왜/무엇/어디까지가 사라지지 않게 한다.',
      steps: [
        'memo/TASK-SCHEMA.md 형식에 맞춰 TASK 파일을 만든다.',
        '목표에는 사용자 원문과 해석을 함께 둔다.',
        '관련 파일 읽기와 쓰기를 분리한다.',
        '구현이 끝나면 roadmap과 TASK 상태를 같이 갱신한다.',
      ],
      files: ['memo/TASK-SCHEMA.md', 'memo/projects/karmolab/tasks/', 'memo/projects/karmolab/roadmap.md'],
    },
  ];

  let activeLevel: LevelId = 'landscape';
  let activeNodeId = 'umbrella';
  let activeMode: 'map' | 'recipes' | 'concepts' = 'map';
  let serverConfig: ServerMonitorConfig | null = null;
  let serverConfigError = '';

  const esc = (value: unknown): string =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char] ?? char);

  function nodesForLevel(level: LevelId): AtlasNode[] {
    return NODES.filter((node) => node.level === level);
  }

  function nodeById(id: string): AtlasNode {
    return NODES.find((node) => node.id === id) ?? nodesForLevel(activeLevel)[0] ?? NODES[0];
  }

  function runtimeSummaryHtml(): string {
    const windowWithMeta = window as unknown as { KARMOLAB_LAZY_META?: Array<{ id?: string; category?: string; desktopOnly?: boolean; hidden?: boolean }> };
    const meta = Array.isArray(windowWithMeta.KARMOLAB_LAZY_META) ? windowWithMeta.KARMOLAB_LAZY_META : [];
    const visible = meta.filter((item) => item.hidden !== true).length;
    const desktop = meta.filter((item) => item.desktopOnly === true).length;
    const categories = Array.from(new Set(meta.map((item) => item.category || '(none)'))).length;

    const profileCount = Array.isArray(serverConfig?.devProfiles) ? serverConfig.devProfiles.length : null;
    const monitorCount = Array.isArray(serverConfig?.localMonitors) ? serverConfig.localMonitors.length : null;
    const envCount = Array.isArray(serverConfig?.envFiles) ? serverConfig.envFiles.length : null;
    const serverText = serverConfig
      ? `${profileCount ?? 0} profiles · ${monitorCount ?? 0} monitors · ${envCount ?? 0} env files`
      : serverConfigError
        ? 'servermonitor config load failed'
        : 'loading servermonitor config';

    return `
      <section class="pa-runtime">
        <div class="pa-runtime-item"><b>${meta.length}</b><span>registered widgets</span></div>
        <div class="pa-runtime-item"><b>${visible}</b><span>visible entries</span></div>
        <div class="pa-runtime-item"><b>${desktop}</b><span>desktop-only</span></div>
        <div class="pa-runtime-item"><b>${categories}</b><span>categories</span></div>
        <div class="pa-runtime-wide"><span>Server Monitor</span><b>${esc(serverText)}</b></div>
      </section>`;
  }

  function linkHtml(link: { label: string; widget?: string; href?: string }): string {
    if (link.widget) {
      return `<button type="button" class="pa-link" data-open-widget="${esc(link.widget)}">${esc(link.label)}</button>`;
    }
    if (link.href) {
      return `<a class="pa-link" href="${esc(link.href)}" rel="noopener">${esc(link.label)}</a>`;
    }
    return `<span class="pa-link">${esc(link.label)}</span>`;
  }

  function sidePanelHtml(): string {
    const node = nodeById(activeNodeId);
    return `
      <aside class="pa-side">
        <div class="pa-node-kind" style="--pa-node-color:${GROUP_COLOR[node.group]}">${esc(node.kind)}</div>
        <h2>${esc(node.title)}</h2>
        <p class="pa-summary">${esc(node.summary)}</p>
        <dl class="pa-facts">
          <div><dt>Path</dt><dd><code>${esc(node.path)}</code></dd></div>
          <div><dt>Web note</dt><dd>${esc(node.webNote)}</dd></div>
          <div><dt>Unity mental model</dt><dd>${esc(node.unityNote)}</dd></div>
        </dl>
        <section class="pa-editwhen">
          <h3>수정하는 경우</h3>
          <ul>${node.editWhen.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
        </section>
        <section class="pa-links">
          <h3>연결된 위젯</h3>
          <div>${node.links.map(linkHtml).join('')}</div>
        </section>
      </aside>`;
  }

  function mapHtml(): string {
    const levelNodes = nodesForLevel(activeLevel);
    if (!levelNodes.some((node) => node.id === activeNodeId)) {
      activeNodeId = levelNodes[0]?.id ?? activeNodeId;
    }
    const levelEdges = EDGES.filter((edge) =>
      levelNodes.some((node) => node.id === edge.from) && levelNodes.some((node) => node.id === edge.to)
    );
    const nodeMap = new Map(levelNodes.map((node) => [node.id, node]));

    const edgesSvg = levelEdges.map((edge) => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) return '';
      const x1 = from.x + from.w / 2;
      const y1 = from.y + from.h / 2;
      const x2 = to.x + to.w / 2;
      const y2 = to.y + to.h / 2;
      const lx = (x1 + x2) / 2;
      const ly = (y1 + y2) / 2;
      return `
        <line class="pa-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>
        <text class="pa-edge-label" x="${lx}" y="${ly - 6}">${esc(edge.label)}</text>`;
    }).join('');

    const nodesSvg = levelNodes.map((node) => {
      const selected = node.id === activeNodeId ? ' is-selected' : '';
      return `
        <g class="pa-node${selected}" data-node="${esc(node.id)}" tabindex="0" role="button" aria-label="${esc(node.title)}">
          <rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="8" style="--pa-node-color:${GROUP_COLOR[node.group]}"></rect>
          <text class="pa-node-kind-svg" x="${node.x + 16}" y="${node.y + 24}">${esc(node.kind)}</text>
          <text class="pa-node-title" x="${node.x + 16}" y="${node.y + 50}">${esc(node.title)}</text>
          <foreignObject x="${node.x + 16}" y="${node.y + 58}" width="${node.w - 32}" height="${node.h - 62}">
            <div class="pa-node-desc">${esc(node.summary)}</div>
          </foreignObject>
        </g>`;
    }).join('');

    const level = LEVELS.find((item) => item.id === activeLevel)!;
    return `
      <div class="pa-main">
        <section class="pa-toolbar">
          <div>
            <p class="pa-kicker">Project Atlas</p>
            <h1>${esc(level.label)}</h1>
            <p>${esc(level.note)}</p>
          </div>
          <div class="pa-mode-tabs">
            <button type="button" class="${activeMode === 'map' ? 'is-on' : ''}" data-mode="map">지도</button>
            <button type="button" class="${activeMode === 'recipes' ? 'is-on' : ''}" data-mode="recipes">레시피</button>
            <button type="button" class="${activeMode === 'concepts' ? 'is-on' : ''}" data-mode="concepts">Web 개념</button>
          </div>
        </section>
        <nav class="pa-levels">${LEVELS.map((item) => `
          <button type="button" class="${item.id === activeLevel ? 'is-on' : ''}" data-level="${item.id}">
            <b>${esc(item.label)}</b><span>${esc(item.note)}</span>
          </button>`).join('')}</nav>
        ${runtimeSummaryHtml()}
        <section class="pa-map-wrap">
          <svg class="pa-map" viewBox="0 0 1000 360" role="img" aria-label="Project Atlas map">
            <defs>
              <marker id="pa-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <path d="M0,0 L0,6 L9,3 z"></path>
              </marker>
            </defs>
            ${edgesSvg}
            ${nodesSvg}
          </svg>
        </section>
      </div>
      ${sidePanelHtml()}`;
  }

  function recipesHtml(): string {
    return `
      <div class="pa-main">
        <section class="pa-toolbar">
          <div>
            <p class="pa-kicker">Diataxis split</p>
            <h1>작업 레시피</h1>
            <p>배우는 글, 작업 절차, 참조 정보, 배경 설명을 섞지 않기 위한 첫 묶음입니다.</p>
          </div>
          <div class="pa-mode-tabs">
            <button type="button" data-mode="map">지도</button>
            <button type="button" class="is-on" data-mode="recipes">레시피</button>
            <button type="button" data-mode="concepts">Web 개념</button>
          </div>
        </section>
        <section class="pa-recipes">
          ${RECIPES.map((recipe) => `
            <article class="pa-recipe">
              <span class="pa-recipe-kind">${esc(recipe.kind)}</span>
              <h2>${esc(recipe.title)}</h2>
              <p>${esc(recipe.goal)}</p>
              <ol>${recipe.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>
              <div class="pa-file-list">${recipe.files.map((file) => `<code>${esc(file)}</code>`).join('')}</div>
            </article>
          `).join('')}
        </section>
      </div>
      <aside class="pa-side">
        <div class="pa-node-kind">Docs rule</div>
        <h2>읽을 때와 작업할 때를 분리</h2>
        <p class="pa-summary">튜토리얼은 실습용, How-to는 작업용, Reference는 사실표, Explanation은 배경 이해용입니다.</p>
        <section class="pa-editwhen">
          <h3>Atlas의 기준</h3>
          <ul>
            <li>처음 배우는 내용은 짧고 순서 있게 둔다.</li>
            <li>작업 절차는 목표 하나만 해결한다.</li>
            <li>파일 목록은 해석 없이 정확하게 둔다.</li>
            <li>왜 이런 구조인지 설명은 따로 둔다.</li>
          </ul>
        </section>
      </aside>`;
  }

  function conceptsHtml(): string {
    const concepts = [
      {
        term: 'HTML',
        unity: 'Scene Hierarchy에 놓인 UI 오브젝트 구조',
        note: '무엇이 화면에 있는지를 정한다. 버튼, 입력칸, 섹션 같은 뼈대다.',
      },
      {
        term: 'CSS',
        unity: 'Canvas/RectTransform/Style 설정',
        note: '어떻게 보이는지를 정한다. 색, 간격, 배치, 반응형 크기 같은 부분이다.',
      },
      {
        term: 'TypeScript',
        unity: 'C# 스크립트',
        note: '무엇이 일어나는지를 정한다. 클릭, 저장, fetch, 렌더링 같은 동작이다.',
      },
      {
        term: 'Build',
        unity: 'Unity Compile/Build 과정',
        note: '브라우저가 직접 읽는 JS/CSS 산출물을 만든다. KarmoLab은 src를 고치고 js로 빌드한다.',
      },
      {
        term: 'Tauri',
        unity: '네이티브 플러그인 + 게임 런처',
        note: '웹 화면에 로컬 파일/프로세스 제어를 붙이는 데스크톱 껍데기다.',
      },
      {
        term: 'Widget',
        unity: '독립 UI 패널/프리팹',
        note: 'KarmoLab 안에서 따로 로드되고, Toolbox.register로 자기 탭과 화면을 등록한다.',
      },
    ];
    return `
      <div class="pa-main">
        <section class="pa-toolbar">
          <div>
            <p class="pa-kicker">Web for Unity brain</p>
            <h1>Web 개념 번역표</h1>
            <p>일반 Web 강의가 아니라 이 프로젝트를 고치기 위한 최소 개념만 둡니다.</p>
          </div>
          <div class="pa-mode-tabs">
            <button type="button" data-mode="map">지도</button>
            <button type="button" data-mode="recipes">레시피</button>
            <button type="button" class="is-on" data-mode="concepts">Web 개념</button>
          </div>
        </section>
        <section class="pa-concepts">${concepts.map((concept) => `
          <article class="pa-concept">
            <h2>${esc(concept.term)}</h2>
            <p>${esc(concept.note)}</p>
            <dl><dt>Unity식 감각</dt><dd>${esc(concept.unity)}</dd></dl>
          </article>
        `).join('')}</section>
      </div>
      <aside class="pa-side">
        <div class="pa-node-kind">First edit path</div>
        <h2>수정 파일 찾는 순서</h2>
        <p class="pa-summary">KarmoLab에서 화면을 고치려면 보통 위젯 id를 먼저 찾고, lazyScriptPaths가 가리키는 파일을 엽니다.</p>
        <section class="pa-editwhen">
          <h3>최소 루틴</h3>
          <ul>
            <li>위젯 이름을 검색한다.</li>
            <li>widgets-lazy-meta.ts에서 id와 경로를 확인한다.</li>
            <li>src/widgets 아래 원본을 고친다.</li>
            <li>typecheck와 build로 확인한다.</li>
          </ul>
        </section>
        <section class="pa-links">
          <h3>바로가기</h3>
          <div>${linkHtml({ label: '문서', widget: 'docs' })}${linkHtml({ label: 'KarmoMap', widget: 'karmomap' })}</div>
        </section>
      </aside>`;
  }

  function render(container: HTMLElement): void {
    container.classList.add('project-atlas');
    container.innerHTML = activeMode === 'recipes'
      ? recipesHtml()
      : activeMode === 'concepts'
        ? conceptsHtml()
        : mapHtml();
  }

  function wire(container: HTMLElement): void {
    container.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const modeBtn = target.closest<HTMLElement>('[data-mode]');
      if (modeBtn) {
        activeMode = (modeBtn.dataset.mode as 'map' | 'recipes' | 'concepts') || 'map';
        render(container);
        return;
      }
      const levelBtn = target.closest<HTMLElement>('[data-level]');
      if (levelBtn) {
        activeLevel = (levelBtn.dataset.level as LevelId) || 'landscape';
        activeMode = 'map';
        activeNodeId = nodesForLevel(activeLevel)[0]?.id ?? activeNodeId;
        render(container);
        return;
      }
      const nodeEl = target.closest<SVGGElement>('[data-node]');
      if (nodeEl?.dataset.node) {
        activeNodeId = nodeEl.dataset.node;
        render(container);
        return;
      }
      const widgetBtn = target.closest<HTMLElement>('[data-open-widget]');
      if (widgetBtn?.dataset.openWidget) {
        Toolbox.switchPage?.(widgetBtn.dataset.openWidget);
      }
    });

    container.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      const nodeEl = target.closest<SVGGElement>('[data-node]');
      if (!nodeEl?.dataset.node) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activeNodeId = nodeEl.dataset.node;
      render(container);
    });
  }

  function injectStyles(): void {
    Mdd.injectCSS(
      'project-atlas',
      `
      .project-atlas { display:grid; grid-template-columns:minmax(0,1fr) 310px; gap:14px; min-height:min(78vh, 860px); }
      .pa-main, .pa-side { min-width:0; }
      .pa-toolbar { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:12px; }
      .pa-kicker { margin:0 0 4px; color:var(--text-tertiary); font-size:11px; text-transform:uppercase; font-weight:800; letter-spacing:0; }
      .pa-toolbar h1 { margin:0 0 4px; font-size:24px; line-height:1.15; color:var(--text-primary); }
      .pa-toolbar p { margin:0; color:var(--text-secondary); font-size:13px; line-height:1.5; }
      .pa-mode-tabs { display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end; }
      .pa-mode-tabs button, .pa-levels button, .pa-link {
        border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-secondary);
        border-radius:var(--radius-sm); cursor:pointer; font:inherit; text-decoration:none;
      }
      .pa-mode-tabs button { padding:7px 10px; font-size:12px; }
      .pa-mode-tabs button.is-on, .pa-levels button.is-on, .pa-link:hover {
        border-color:var(--accent); color:var(--text-primary); background:var(--accent-subtle);
      }
      .pa-levels { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:6px; margin-bottom:10px; }
      .pa-levels button { text-align:left; padding:9px 10px; min-height:58px; }
      .pa-levels b { display:block; color:var(--text-primary); font-size:12px; margin-bottom:3px; }
      .pa-levels span { display:block; font-size:11px; line-height:1.35; color:var(--text-tertiary); }
      .pa-runtime { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:6px; margin-bottom:10px; }
      .pa-runtime-item, .pa-runtime-wide {
        background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-sm);
        padding:8px 10px; min-width:0;
      }
      .pa-runtime-item b { display:block; color:var(--text-primary); font-size:18px; line-height:1.1; }
      .pa-runtime-item span, .pa-runtime-wide span { display:block; color:var(--text-tertiary); font-size:11px; margin-top:2px; }
      .pa-runtime-wide { grid-column:1 / -1; display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .pa-runtime-wide b { color:var(--text-secondary); font-size:12px; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pa-map-wrap { background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-md); overflow:hidden; min-height:360px; }
      .pa-map { width:100%; height:auto; min-height:360px; display:block; }
      .pa-edge { stroke:var(--border-color, var(--border)); stroke-width:2; marker-end:url(#pa-arrow); opacity:.8; }
      .pa-edge-label { fill:var(--text-tertiary); font-size:12px; text-anchor:middle; paint-order:stroke; stroke:var(--bg-tertiary); stroke-width:5px; }
      #pa-arrow path { fill:var(--border-color, var(--border)); }
      .pa-node { cursor:pointer; outline:none; }
      .pa-node rect { fill:var(--bg-secondary); stroke:var(--border); stroke-width:1.5; transition:stroke .15s ease, fill .15s ease; }
      .pa-node:hover rect, .pa-node:focus rect { stroke:var(--pa-node-color); fill:var(--bg-primary); }
      .pa-node.is-selected rect { stroke:var(--pa-node-color); stroke-width:3; filter:drop-shadow(0 0 10px color-mix(in srgb, var(--pa-node-color) 45%, transparent)); }
      .pa-node-kind-svg { fill:var(--text-tertiary); font-size:11px; text-transform:uppercase; }
      .pa-node-title { fill:var(--text-primary); font-size:18px; font-weight:800; }
      .pa-node-desc { color:var(--text-secondary); font-size:12px; line-height:1.35; overflow:hidden; }
      .pa-side { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:14px; align-self:start; position:sticky; top:10px; max-height:78vh; overflow:auto; }
      .pa-node-kind { display:inline-flex; border:1px solid var(--pa-node-color, var(--accent)); color:var(--text-primary); background:var(--bg-tertiary); border-radius:999px; padding:3px 8px; font-size:11px; margin-bottom:10px; }
      .pa-side h2 { margin:0 0 8px; color:var(--text-primary); font-size:20px; line-height:1.2; }
      .pa-summary { margin:0 0 14px; color:var(--text-secondary); font-size:13px; line-height:1.55; }
      .pa-facts { margin:0; display:flex; flex-direction:column; gap:10px; }
      .pa-facts div { border-top:1px solid var(--border); padding-top:10px; }
      .pa-facts dt, .pa-editwhen h3, .pa-links h3 { color:var(--text-tertiary); font-size:11px; text-transform:uppercase; font-weight:800; margin:0 0 5px; }
      .pa-facts dd { margin:0; color:var(--text-secondary); font-size:12px; line-height:1.5; }
      .pa-facts code, .pa-file-list code { font-family:var(--font-mono); color:var(--accent); background:var(--bg-tertiary); border-radius:4px; padding:2px 5px; }
      .pa-editwhen, .pa-links { margin-top:14px; border-top:1px solid var(--border); padding-top:12px; }
      .pa-editwhen ul { margin:0; padding-left:18px; color:var(--text-secondary); font-size:12px; line-height:1.55; }
      .pa-links div { display:flex; flex-wrap:wrap; gap:6px; }
      .pa-link { display:inline-flex; padding:6px 9px; font-size:12px; }
      .pa-recipes { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
      .pa-recipe, .pa-concept {
        background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md);
        padding:14px; min-width:0;
      }
      .pa-recipe-kind { display:inline-block; color:var(--accent); font-size:11px; text-transform:uppercase; font-weight:800; margin-bottom:7px; }
      .pa-recipe h2, .pa-concept h2 { margin:0 0 8px; color:var(--text-primary); font-size:17px; line-height:1.25; }
      .pa-recipe p, .pa-concept p { margin:0 0 10px; color:var(--text-secondary); font-size:13px; line-height:1.55; }
      .pa-recipe ol { margin:0 0 10px; padding-left:18px; color:var(--text-secondary); font-size:12px; line-height:1.55; }
      .pa-file-list { display:flex; flex-wrap:wrap; gap:5px; }
      .pa-concepts { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; }
      .pa-concept dl { margin:0; border-top:1px solid var(--border); padding-top:8px; }
      .pa-concept dt { color:var(--text-tertiary); font-size:11px; margin-bottom:4px; }
      .pa-concept dd { margin:0; color:var(--text-secondary); font-size:12px; line-height:1.45; }
      @media (max-width: 980px) {
        .project-atlas { grid-template-columns:1fr; }
        .pa-side { position:static; max-height:none; }
        .pa-levels, .pa-runtime { grid-template-columns:repeat(2, minmax(0,1fr)); }
        .pa-recipes, .pa-concepts { grid-template-columns:1fr; }
      }
      @media (max-width: 620px) {
        .pa-toolbar { flex-direction:column; }
        .pa-mode-tabs { justify-content:flex-start; }
        .pa-levels, .pa-runtime { grid-template-columns:1fr; }
        .pa-map-wrap { overflow:auto; }
        .pa-map { min-width:820px; }
      }
      `
    );
  }

  async function loadRuntimeData(): Promise<void> {
    try {
      const response = await fetch('/apps/karmolab/data/servermonitor-config.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      serverConfig = (await response.json()) as ServerMonitorConfig;
      serverConfigError = '';
    } catch (error) {
      serverConfig = null;
      serverConfigError = error instanceof Error ? error.message : String(error);
    }
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta!('project-atlas'),
    tabs: [
      {
        id: 'project-atlas-main',
        label: 'Atlas',
        build(container: HTMLElement): void {
          injectStyles();
          render(container);
          wire(container);
          void loadRuntimeData().then(() => {
            if (container.isConnected && activeMode === 'map') render(container);
          });
        },
      },
    ],
  });
})();
