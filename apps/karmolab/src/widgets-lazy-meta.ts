/**
 * 지연 로드 위젯 공통 메타 (단일 출처)
 * - 지연 등록 stub + 각 위젯 Toolbox.register 시 ...getLazyWidgetPublicMeta(id) 로 재사용
 * - lazyScriptPaths: 로더가 순서대로 불러올 스크립트 경로(widgets/ 기준, .js 제외)
 */
import type { KarmoLabLazyWidgetStub } from '../types/karmolab';

window.KARMOLAB_LAZY_META = [
  {
    id: 'life',
    title: 'Life 채널',
    category: 'tool',
    desc: '화면 캡처 / 음성 녹음 기능 on/off. 비활성 시 Whisper 모델 (~3.1GB) RAM 해제.',
    icon: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
    lazyScriptPaths: ['life/life']
  },
  {
    id: 'user',
    title: '내 정보',
    category: 'tool',
    hidden: true,
    desc: '프로필 · 성과 · 활동 · 계정',
    layout: 'form',
    icon: '<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>',
    lazyScriptPaths: ['user']
  },
  {
    /* 남이 만든 도구 (TASK-KL-183 H) — 창작자 층.
     * 실행은 모래상자 안에서만 일어난다(우리 출처를 안 준다). 숨기지 않는다:
     * 이 화면 자체가 「여기 있는 것이 전부 우리가 만든 것은 아니다」라는 선언이다. */
    id: 'usertool',
    title: '만든 도구',
    category: 'tool',
    desc: '사람들이 만들어 올린 도구 — 상자 안에서만 돕니다',
    layout: 'form',
    icon: '<path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="17" cy="16" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['usertool']
  },
  {
    /* 도구 흐름 (TASK-KL-181) — 도구를 이어 붙여 내 순서를 만들어 둔다.
     * 숨기지 않는다: 이 화면 자체가 「도구가 서로 만난다」는 이 사이트의 주장이다. */
    id: 'flow',
    title: '흐름',
    category: 'tool',
    desc: '도구를 이어 붙여 내 순서를 만들고 저장합니다',
    layout: 'form',
    icon: '<path d="M4 6h6M14 6h6M4 18h6M14 18h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10 6c0 6 4 6 4 12" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['flow']
  },
  {
    // 환경 설정 = 「이 브라우저」의 것이다. 「나」(내 정보)와 한 화면에 두지 않는다 (TASK-KL-139).
    id: 'settings',
    title: '환경 설정',
    category: 'tool',
    hidden: true,
    desc: '테마 · API 키 · 이 브라우저에 저장된 것',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['settings']
  },
  {
    id: 'status',
    title: '상태 · 변경 기록',
    category: 'tool',
    hidden: true,
    desc: '지금 잘 돌고 있는지와 최근에 무엇이 바뀌었는지 — 전부 실측',
    layout: 'form',
    icon: '<path d="M3 12h4l2.5-7 4 14L16 12h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['status']
  },
  {
    /* 성능 계기판 (TASK-KL-201) — 개발용. 목록에는 안 내놓는다(hidden): 이건 만드는 사람이
       「어디가 느린가」를 볼 때 여는 자리다. ⌘K·주소로는 그대로 열린다. */
    id: 'perf',
    title: '성능 계기판',
    category: 'tool',
    hidden: true,
    desc: 'KarmoLab 자기 성능 실측 — 부팅 · 위젯별 무게 · 긴 작업 · 프레임 · 판별 부팅 비교 (개발용)',
    layout: 'form',
    icon: '<path d="M12 20a8 8 0 1 1 8-8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 12l5-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
    lazyScriptPaths: ['perf/perf']
  },
  {
    /* 커뮤니티는 **부팅에서 뺐다** (TASK-KL-204, 근거 = KL-201 계기판).
       첫 화면에서 77KB 를 받고 한 번도 안 그렸다 — 계기판의 「받았는데 안 쓴 코드」가 잡았다.
       느린 회선에서 그 77KB 는 곧 몇 백 ms 다. 눌렀을 때 받는다(chat 이 먼저 간 길). */
    id: 'community',
    title: '커뮤니티',
    category: 'tool',
    desc: '자유 · 질문 · 자랑 · 도구 요청 — 도구를 쓰는 사람들이 모이는 자리',
    layout: 'wide',
    noHero: true,
    icon: '<path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M8 9.5h8M8 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['community']
  },
  {
    /* 광장도 부팅에서 뺐다 (TASK-KL-204, 근거 = KL-201 계기판) — 첫 화면에서 23KB 를 받고
       한 번도 안 그렸다. 들어오는 길은 전부 `switchPage('plaza')` 라 지연 등록으로 그대로 열린다. */
    id: 'plaza',
    title: '광장',
    category: 'tool',
    desc: '이 사이트의 숫자를 전부 공개하는 자리 — 방문 · 도구 · 커뮤니티, 전부 실측',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3.5 12h17M12 3.2c2.4 2.6 2.4 14 0 17.6M12 3.2c-2.4 2.6-2.4 14 0 17.6" stroke="currentColor" stroke-width="1.2" fill="none"/>',
    lazyScriptPaths: ['plaza']
  },
  {
    /* 즐겨찾기·링크도 부팅에서 뺐다 (TASK-KL-204, 근거 = KL-201 계기판). 첫 화면에서 둘이 40KB 를
       받고 한 번도 안 그렸다. **갈래를 빈 값으로 둔다** — 셸이 갈래 없는 도구를 따로 모아
       그리므로(`toolbox.ts` 의 「갈래 없음」 묶음) 목록에 보이는 자리는 지금과 똑같다. */
    id: 'favorites',
    title: '즐겨찾기',
    category: '',
    desc: '자주 가는 사이트와 도구를 모아 빠르게 접속합니다',
    layout: 'wide',
    icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    lazyScriptPaths: ['favorites']
  },
  {
    id: 'linktree',
    title: '링크',
    category: '',
    desc: '개발자 연락처 & 링크 모음',
    layout: 'narrow',
    icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    lazyScriptPaths: ['linktree/linktree']
  },
  {
    /* 디버그 창도 부팅에서 뺐다 (TASK-KL-204). 데스크톱 앱에서만 쓰는 것을 **웹으로 오는
       사람까지 받고 있었다**(첫 화면에서 12KB, 한 번도 안 그린다).
       `desktopOnly` 지연 위젯 선례 = 서버 모니터. */
    id: 'devtools',
    title: '디버그',
    category: 'tool',
    desktopOnly: true,
    desc: '데스크톱 앱·연동 점검용 테스트 모음 (알림 등)',
    layout: 'form',
    icon: '<rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 9l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="11" y1="15" x2="18" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    lazyScriptPaths: ['devtools']
  },
  {
    /* 브라우저 안에서 도는 AI (TASK-KL-209) — 서버를 한 번도 안 부른다.
       안 되는 브라우저에서는 없는 척하지 않고 「이 브라우저는 아직」이라고 적는다. */
    id: 'localai',
    title: '기기 안 AI',
    category: 'tool',
    desc: '번역·요약을 서버 없이 이 기기 안에서 — 글이 밖으로 안 나갑니다 (크롬 계열 최신판)',
    layout: 'form',
    icon: '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9.5" cy="10" r="1.2" fill="currentColor"/><circle cx="14.5" cy="10" r="1.2" fill="currentColor"/><path d="M9 14.5c1.8 1.3 4.2 1.3 6 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    lazyScriptPaths: ['localai/localai']
  },
  {
    id: 'servermonitor',
    title: '서버 모니터',
    category: 'tool',
    desktopOnly: true,
    desc: '로컬 URL·프로세스·.env (데스크톱)',
    layout: 'form',
    icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    lazyScriptPaths: ['servermonitor']
  },
  {
    id: 'activity',
    title: '활동 기록',
    category: 'lab',
    desktopOnly: true,
    desc: '내 PC에서 어떤 앱·창에 시간을 얼마나 썼는지 (데스크톱 앱 전용)',
    layout: 'form',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 16v-3M11 16v-7M15 16v-5M19 16v-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    lazyScriptPaths: ['activity']
  },
  {
    id: 'wm',
    title: 'Witch-Mendokusai',
    category: 'tool',
    desc: '만들고 있는 게임 — 소개 · 하루 체험 · 세계 도감 · 이야기 · 소식 · 만드는 중',
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 7.5h6M9 11h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['wm/wm']
  },
  {
    id: 'docs',
    title: '문서',
    category: 'tool',
    desc: 'KarmoLab 소개·로드맵·가이드 + 캐릭터·시스템 위키 — 사이드바 그룹 내비게이션, 본문 + 목차',
    layout: 'wide',
    icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    lazyScriptPaths: ['docs/docs']
  },
  {
    id: 'randomgen',
    title: '랜덤 생성기',
    category: 'play',
    desc: '창작용 키워드·주제를 랜덤으로 뽑습니다',
    layout: 'wide',
    icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="16" y1="3" x2="22" y2="3"/><line x1="19" y1="0" x2="19" y2="6"/>',
    /* 순서가 중요하다 — 주제 목록이 먼저 서고, 생성기들이 거기에 얹고, 본체가 마지막이다 */
    lazyScriptPaths: [
      'randomgen/randomgen-topics', 'randomgen/randomgen-time', 'randomgen/randomgen-number',
      'randomgen/randomgen-name', 'randomgen/randomgen-color', 'randomgen/randomgen'
    ]
  },
  {
    id: 'passgen',
    title: '비밀번호 만들기·확인',
    category: 'tool',
    desc: '안전한 비밀번호를 만들고, 쓰던 것이 얼마나 버티는지 확인합니다. 아무것도 전송하지 않습니다',
    layout: 'wide',
    icon: '<rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="15" r="1.4" fill="currentColor"/>',
    lazyScriptPaths: ['tools/passgen']
  },
  {
    id: 'devtool',
    title: '개발 도구',
    category: 'tool',
    desc: 'JSON 포맷·JWT 디코드·정규식 테스트·해시·UUID·크론·URL·암호화를 한 곳에서',
    layout: 'wide',
    icon: '<path d="M9 6 3 12l6 6M15 6l6 6-6 6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/jsonfmt', 'tools/jwt', 'tools/regextest', 'tools/hashgen', 'tools/uuidgen', 'tools/cron', 'tools/urlparse', 'vendor/crypto-js.min', 'crypto', 'tools/base64', 'tools/csvjson', 'tools/tableconv', 'tools/json2ts', 'tools/devtool']
  },
  {
    id: 'charconv',
    title: '문자 변환',
    category: 'tool',
    desc: '전각·반각, 한글·로마자, 한글·자모를 한 곳에서 — 섞인 글자를 먼저 알려 준다',
    layout: 'wide',
    icon: '<path d="M5 8h6M8 8v8M14 16l4-8 4 8M15.5 13h5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/charconv']
  },
  {
    id: 'dailycho',
    title: '오늘의 초성 맞히기',
    category: 'tool',
    desc: '초성만 보고 낱말 다섯 개 — 답은 이 사이트의 도구 이름',
    layout: 'wide',
    icon: '<path d="M7 8v8M12 8v8M17 8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 12h1M20 12h-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/dailycho']
  },
  {
    id: 'dailytype',
    title: '오늘의 한글 타자',
    category: 'tool',
    desc: '매일 바뀌는 세 문장 — 전원 같은 문제, 결과는 격자로만 공유',
    layout: 'wide',
    icon: '<path d="M4 7h16v10H4z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 11h2M11 11h2M15 11h2M8 14h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/dailytype']
  },
  {
    id: 'chain',
    title: '도구 묶어 쓰기',
    category: 'tool',
    desc: '도구 여러 개를 이어서 한 번에 — 앞 결과가 다음 도구의 입력이 됩니다',
    layout: 'wide',
    icon: '<path d="M9 12a3 3 0 0 1 3-3h2a3 3 0 0 1 0 6h-1M15 12a3 3 0 0 1-3 3h-2a3 3 0 0 1 0-6h1" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
    // CryptoJS 를 같이 싣는다 — 묶음에 해시가 끼면 그때 계산기가 있어야 한다.
    lazyScriptPaths: ['vendor/crypto-js.min', 'tools/chain']
  },
  {
    id: 'base64',
    hidden: true, // 「devtool」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'Base64 인코딩 · 디코딩',
    category: 'tool',
    desc: '텍스트와 Base64 를 서로 바꿉니다. 한글 안 깨짐, URL-safe 표기 지원',
    layout: 'wide',
    icon: '<path d="M4 7h6v10H4zM14 7h6v10h-6z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 12h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/base64']
  },
  {
    id: 'crypto',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '암호화 / 복호화',
    category: 'tool',
    desc: '텍스트를 AES, Base64, URL 인코딩으로 암호화·복호화합니다',
    layout: 'form',
    icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
    lazyScriptPaths: ['vendor/crypto-js.min', 'crypto']
  },
  {
    id: 'memo',
    title: '메모장',
    category: 'tool',
    desc: '로컬 메모를 저장하고 관리합니다',
    layout: 'full',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>',
    lazyScriptPaths: ['memo']
  },
  {
    id: 'chatbot',
    title: '챗봇',
    category: 'tool',
    desc: 'AI와 대화합니다',
    layout: 'full',
    icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
    /** load order matters; see widgets/chatbot/README.md.
     *  KL-054: gemini/marked/prism = eager 제거 → chatbot 첫 진입 시 로드. */
    lazyScriptPaths: [
      'root/gemini',
      'vendor/marked.min',
      'vendor/prism.min',
      'vendor/prism-autoloader.min',
      'world/world',
      'world/parse-md',
      'world/load-characters-from-wiki',
      'chatbot/styles',
      'chatbot/markdown',
      'chatbot/characters',
      'chatbot/karmo-image',
      'chatbot/prompt',
      'chatbot/chatbot'
    ]
  },
  {
    id: 'imagegen',
    hidden: true, // 「이미지」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'image', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '이미지 생성',
    category: 'tool',
    desc: 'AI로 이미지를 생성합니다',
    layout: 'full',
    icon: '<circle cx="12" cy="12" r="10"/><line x1="14.31" y1="8" x2="20.05" y2="17.94"/><line x1="9.69" y1="8" x2="21.17" y2="8"/><line x1="7.38" y1="12" x2="13.12" y2="2.06"/><line x1="9.69" y1="16" x2="3.95" y2="6.06"/><line x1="14.31" y1="16" x2="2.83" y2="16"/><line x1="16.62" y1="12" x2="10.88" y2="21.94"/>',
    produces: ['image/*'],
    lazyScriptPaths: [
      'root/gemini',
      'world/world',
      'world/parse-md',
      'world/load-characters-from-wiki',
      'imagegen/presets',
      'imagegen/config',
      'imagegen/styles',
      'imagegen/core',
      'imagegen/imagegen'
    ]
  },
  {
    id: 'image',
    title: '이미지',
    category: 'tool',
    desc: '편집·형식 변환, 아스키 아트, AI 생성과 보관함을 한 곳에서',
    layout: 'full',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8.5" cy="9" r="1.6" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 17l4.5-4.5 3 3L15 12l5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    /* 이 묶음이 내놓는 것 (TASK-KL-183 A) — 흐름을 만들 때 「이어지는 도구」를 위로 올리는 근거.
       숨긴 도구(imagegen 등)에 적어 봐야 목록에 안 뜨므로, **보이는 대표**에 적는다. */
    produces: ['image/*'],
    lazyScriptPaths: ['root/gemini', 'ref/reftable', 'imageconvert/imageconvert', 'imageedit', 'tools/text2img', 'tools/imgresize', 'tools/redact', 'tools/asciiart', 'world/world', 'world/parse-md', 'world/load-characters-from-wiki', 'imagegen/presets', 'imagegen/config', 'imagegen/styles', 'imagegen/core', 'imagegen/imagegen', 'imagelib', 'tools/image']
  },
  {
    id: 'imageedit',
    hidden: true, // 「이미지」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'image', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '이미지 편집',
    category: 'tool',
    desc: '편집·형식·해상도 변환(PNG·JPEG·WebP 등)을 한 화면에서',
    layout: 'full',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M9 3v18" stroke="currentColor" stroke-width="1.5"/><path d="M3 15h18" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="9" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    produces: ['image/*'],
    lazyScriptPaths: ['root/gemini', 'imageconvert/imageconvert', 'imageedit']
  },
  {
    id: 'imagelib',
    hidden: true, // 「이미지」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'image', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '이미지 라이브러리',
    category: 'tool',
    desc: '생성한 이미지를 저장하고 관리합니다',
    layout: 'full',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    lazyScriptPaths: ['root/gemini', 'imagelib']
  },
  {
    id: 'tierlist',
    title: '티어리스트',
    category: 'lab',
    desc: '후보 풀(주제별 요소)에서 순위 인스턴스를 만들고, 블로그·로컬 JSON으로 주고받기 (개발 중)',
    layout: 'form',
    icon: '<path d="M3 3h18v4H3zM3 9h14v4H3zM3 15h10v4H3z"/>',
    lazyScriptPaths: ['tierlist/tierlist']
  },
  {
    id: 'postgraph',
    title: '글 그래프',
    category: 'lab',
    desc: '블로그 포스트 간 내부 링크 관계를 그래프로 봅니다 (개발 중)',
    layout: 'full',
    icon: '<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10.2" y1="10.2" x2="13.8" y2="13.8" stroke="currentColor" stroke-width="1.5"/>',
    lazyScriptPaths: ['postgraph']
  },
  {
    id: 'conch',
    title: '소라고동',
    category: 'play',
    hidden: true,
    desc: '소라고동에게 질문합니다',
    layout: 'form',
    icon: '<path d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z M12 6c-3.31 0-6 2.69-6 6 M12 8c-2.21 0-4 1.79-4 4" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['conch']
  },
  {
    id: 'pulse',
    title: '박동',
    category: 'play',
    desc: '아무 의미 없는 것을 아주 규칙적으로 내보내는 방송국 7개 — 세 글자·종·눈금·낱말·한 줄·무늬·점 (TASK-KL-207)',
    layout: 'full',
    icon: '<path d="M2 12h4l3-8 4 16 3-8h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    lazyScriptPaths: ['pulse/pulse']
  },
  {
    id: 'adventure',
    title: '무한 텍스트 어드벤처',
    category: 'play',
    desc: '티메토 GM 의 무한 텍스트 어드벤처 (KL-032). 무대 = KarmoWorld, history → wiki entity 누적',
    layout: 'full',
    icon: '<path d="M14 4l6 6-9 9H5v-6l9-9z M3 21l3-3 M19 7l-2-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    lazyScriptPaths: [
      'world/world',
      'world/parse-md',
      'world/load-characters-from-wiki',
      'world/load-adventures-from-wiki',
      'adventure/adventure'
    ]
  },
  {
    id: 'planner',
    title: '플래너',
    category: 'lab',
    desc: '나만의 일정 동기화 및 스트릭 칸반 보드 (개발 중)',
    layout: 'full',
    icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/>',
    lazyScriptPaths: ['planner/planner']
  },
  {
    id: 'cockpit',
    title: 'Cockpit',
    category: 'lab',
    desktopOnly: true,
    desc: '프로젝트 구조·상황 단일 표면 — Unity Shader Graph 식 노드 그래프 + TASK 탭 (TASK-KL-082, 통합 위젯)',
    layout: 'full',
    noHero: true,
    icon: '<rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 6h4M6 10v4M18 10v4M10 18h4" stroke="currentColor" stroke-width="1.5"/>',
    lazyScriptPaths: ['cockpit/cockpit']
  },
  {
    id: 'terminal',
    title: 'PowerShell 터미널',
    category: 'tool',
    desktopOnly: true,
    desc: '카드 stdin 무관 단일 셸 (line-IO). pwsh→powershell.exe fallback, cd/Set-Location 자동 추적, 5000줄 cap',
    layout: 'full',
    noHero: true,
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" ry="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M7 9l3 3-3 3M12 15h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    lazyScriptPaths: ['terminal/terminal']
  },
  {
    id: 'claude-env',
    title: 'Claude 환경',
    category: 'tool',
    desktopOnly: true,
    desc: 'Claude Code Stop/Notification hook 사운드 알림 GUI — memo/dotfiles 정본 (v1: read 만, Step 2+: write + sync + preview + wav drag-drop)',
    layout: 'form',
    icon: '<path d="M3 11l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 8v8a3 3 0 003 3h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="18" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    lazyScriptPaths: ['claude-env']
  },
  {
    id: 'alarm',
    title: '알람',
    category: 'tool',
    desktopOnly: true,
    desc: '강제 기상 데스크톱 알람 (Free Alarm Clock 레퍼런스, TASK-KL-064) — 상주 스케줄러 + OS 강제기상(절전 깨우기/모니터 ON/볼륨 강제) + autostart',
    layout: 'form',
    icon: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 9v4l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 3 2 6M19 3l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['alarm']
  },

  /* ───── 실용 도구 (TASK-KL-088) ─────
   * 검색 유입 1급 대상. 각 항목은 data/tools-seo.json 에 같은 id 의 SEO 문안이 있어야 하고,
   * scripts/gen-tool-pages.mjs 가 /karmolab/t/<id>/ 정적 페이지를 만든다 (짝 없으면 빌드 실패). */
  {
    id: 'text',
    title: '텍스트 도구',
    category: 'tool',
    desc: '글자수 세기·줄 정리·두 글 비교·표기법 변환·한영타 되돌리기를 한 곳에서',
    layout: 'wide',
    icon: '<path d="M4 5h16M4 5v2M20 5v2M12 5v14M9 19h6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M4 12h4M4 16h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>',
    lazyScriptPaths: ['tools/charcount', 'tools/textclean', 'tools/textdiff', 'tools/caseconv', 'tools/hangulkey', 'tools/lorem', 'tools/replace', 'tools/slug', 'tools/listdiff', 'tools/jamo', 'tools/wordfreq', 'tools/linebreak', 'tools/checklist', 'tools/text']
  },
  {
    id: 'lorem',
    hidden: true, // 「text」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '더미 텍스트 생성',
    category: 'tool',
    desc: '화면 시안용 임시 글을 만듭니다. 한글 더미와 로렘 입숨, 문단·문장·단어 단위',
    layout: 'form',
    icon: '<path d="M4 6h16M4 10h16M4 14h12M4 18h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/lorem']
  },
  {
    id: 'replace',
    hidden: true, // 「text」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '찾아 바꾸기',
    category: 'tool',
    desc: '텍스트에서 찾아 바꿉니다. 바꾸기 전에 걸린 곳을 미리 보여줍니다',
    layout: 'wide',
    icon: '<circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14.5 14.5 20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 10h6M10 7v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>',
    lazyScriptPaths: ['tools/replace']
  },
  {
    id: 'slug',
    hidden: true, // 「text」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '슬러그 만들기',
    category: 'tool',
    desc: '제목을 주소에 쓸 형태로 바꿉니다. 한글은 로마자로 옮겨 적습니다',
    layout: 'form',
    icon: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/slug']
  },
  {
    id: 'listdiff',
    hidden: true, // 「text」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '목록 비교',
    category: 'tool',
    desc: '두 명단에서 공통·한쪽에만 있는 항목을 가려냅니다. 순서와 무관',
    layout: 'wide',
    icon: '<circle cx="9" cy="12" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="15" cy="12" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    lazyScriptPaths: ['tools/listdiff']
  },
  {
    id: 'jamo',
    hidden: true, // 「text」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '한글 자모 분해',
    category: 'tool',
    desc: '글자를 초성·중성·종성으로 쪼개고 자모를 글자로 되돌립니다. 초성 추출 포함',
    layout: 'wide',
    icon: '<path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['tools/jamo']
  },
  {
    id: 'wordfreq',
    hidden: true, // 「text」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '단어 빈도 분석',
    category: 'tool',
    desc: '글에서 자주 쓴 낱말을 세어 보여줍니다. 한국어 조사 떼기 지원',
    layout: 'wide',
    icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/wordfreq']
  },
  {
    id: 'linebreak',
    hidden: true, // 「text」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '줄바꿈 정리',
    category: 'tool',
    desc: 'PDF·웹에서 복사한 글의 끊긴 줄을 잇거나 원하는 길이로 다시 나눕니다',
    layout: 'wide',
    icon: '<path d="M4 6h16M4 12h10a3 3 0 0 1 0 6h-3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M13 15l-2 3 2 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 18h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/linebreak']
  },
  {
    id: 'checklist',
    hidden: true, // 「text」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '체크리스트',
    category: 'tool',
    desc: '할 일 목록을 만들고 주소 하나로 공유합니다. 계정도 서버도 없이',
    layout: 'form',
    icon: '<path d="M4 7l2 2 4-4M4 14l2 2 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 7h7M13 16h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/checklist']
  },
  {
    // 「진짜로 못 여는」 편지 — 목록에서 바로 보여야 한다 (TASK-KL-134).
    id: 'timecapsule',
    title: '타임캡슐 편지',
    category: 'tool',
    desc: '정한 날 전에는 아무도 못 여는 편지를 만듭니다. 맡아 두는 서버가 없어 잠긴 편지 자체가 주소가 됩니다',
    layout: 'wide',
    icon: '<rect x="4" y="9" width="16" height="12" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 9V6.5a4 4 0 0 1 8 0V9" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="15" r="1.6" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['tools/timecapsule']
  },
  {
    // 둘이 붙는 놀이 — 목록에서 바로 보여야 한다 (TASK-KL-132).
    id: 'duel',
    title: '번개 대결',
    category: 'tool',
    desc: '몇 초짜리 미니게임으로 둘이 붙습니다. 링크 하나면 바로 시작하고, 방을 우리 서버에 두지 않습니다',
    layout: 'wide',
    noHero: true,
    icon: '<path d="M13 2L5 13h6l-1 9 9-12h-6l1-8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/duel']
  },
  {
    // 놀이라 묶음에 안 넣는다 — 목록에서 바로 보여야 사람이 들어온다 (TASK-KL-131).
    id: 'ghosttype',
    title: '유령 타자 대결',
    category: 'tool',
    desc: '타자 기록이 주소 하나가 되고, 그 주소를 연 사람은 내 유령과 나란히 달립니다. 아무 글이나 걸 수 있고 주소는 만료되지 않습니다',
    layout: 'wide',
    icon: '<path d="M12 3a6 6 0 0 0-6 6v10l2-1.6 2 1.6 2-1.6 2 1.6 2-1.6 2 1.6V9a6 6 0 0 0-6-6z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M10 10h.01M14 10h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/ghosttype']
  },
  {
    // 묶음에 넣지 않는다 — 다른 PDF 도구가 「한 파일을 고친다」면 이건 「두 판본을 견준다」라
    // 하는 일의 결이 다르고, 목록에서 바로 보여야 하는 도구다 (TASK-KL-130).
    id: 'pdfdiff',
    title: 'PDF 판본 대조',
    category: 'tool',
    desc: '문서 두 판본에서 바뀐 자리만 형광으로 짚어 줍니다. 글자와 그림을 함께 보아 표·도장이 밀린 것도 잡습니다',
    layout: 'wide',
    icon: '<path d="M9 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M15 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M7 8h3M7 12h2M14 8h3M14 12h3M14 16h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/pdfdiff']
  },
  {
    id: 'pdf2img',
    accepts: ['application/pdf'], // 다른 도구가 만든 PDF 를 받는다 (TASK-KL-133)
    hidden: true, // 「PDF 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'PDF → 이미지',
    category: 'tool',
    desc: 'PDF 페이지를 PNG·JPG 로 바꿉니다. 배율을 올리면 인쇄용 해상도까지',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="13" y="13" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M13 19l2-2 2 2 2-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/pdf2img']
  },
  {
    id: 'img2pdf',
    accepts: ['image/*'], // 다른 도구가 만든 그림을 받는다 (TASK-KL-133)
    hidden: true, // 「PDF 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '이미지 → PDF',
    category: 'tool',
    desc: '사진 여러 장을 한 PDF 로 묶습니다. 비율을 지킨 채 종이에 맞춥니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="10" height="9" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 11l3-3 2 2 3-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M17 8h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    produces: ['application/pdf'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/img2pdf']
  },
  {
    id: 'ziptool',
    hidden: true, // 「filetool」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'filetool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'ZIP 만들기·풀기',
    category: 'tool',
    desc: '파일을 ZIP 으로 묶고, 받은 ZIP 의 목록을 보고 풀어 냅니다',
    layout: 'wide',
    icon: '<path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M11 3v2h2V3M11 7v2h2V7M11 11v2h2v-2" stroke="currentColor" stroke-width="1.5"/><rect x="10.5" y="15" width="3" height="4" rx="0.6" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['tools/ziptool']
  },
  {
    id: 'pdfwatermark',
    accepts: ['application/pdf'], // 다른 도구가 만든 PDF 를 받는다 (TASK-KL-133)
    hidden: true, // 「PDF 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'PDF 워터마크',
    category: 'tool',
    desc: 'PDF 전 페이지에 문구를 얹습니다. 한글도 됩니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 17 16 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>',
    produces: ['application/pdf'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/pdfwatermark']
  },
  {
    id: 'audiospeed',
    accepts: ['audio/*', 'video/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「소리 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'sound', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '소리 속도',
    category: 'tool',
    desc: '녹음을 빠르게·느리게 만듭니다. 목소리는 그대로 두고 길이만 바꿉니다',
    layout: 'wide',
    icon: '<path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M16 8l4 4-4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['audio/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/audiospeed']
  },
  {
    id: 'audiofade',
    accepts: ['audio/*', 'video/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「소리 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'sound', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '소리 페이드',
    category: 'tool',
    desc: '시작·끝의 「툭」 하는 끊김을 없앱니다. 어디가 끊기는지 먼저 짚어 줍니다',
    layout: 'wide',
    icon: '<path d="M3 19L21 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 19h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7 19v-3M11 19v-6M15 19v-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>',
    produces: ['audio/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/audiofade']
  },
  {
    id: 'audiojoin',
    accepts: ['audio/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「소리 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'sound', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '오디오 이어붙이기',
    category: 'tool',
    desc: '여러 음원을 하나로 잇습니다. 표본율이 달라도 맞춰서 이어 줍니다',
    layout: 'wide',
    icon: '<path d="M4 12h3l2-4 2 8 2-6 2 4h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4v3M12 17v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/>',
    produces: ['audio/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/audiojoin']
  },
  {
    id: 'imgbatch',
    hidden: true, // 「filetool」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'filetool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '이미지 일괄 변환',
    category: 'tool',
    desc: '사진 여러 장의 크기와 형식을 한 번에 바꿔 ZIP 으로 받습니다',
    layout: 'wide',
    icon: '<rect x="3" y="6" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 14l3.5-3.5 2.5 2.5 3-3 4 4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M7 3h11a2 2 0 0 1 2 2v11" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.6"/>',
    lazyScriptPaths: ['tools/imgbatch']
  },
  {
    id: 'filehash',
    hidden: true, // 「filetool」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'filetool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '파일 검사값 확인',
    category: 'tool',
    desc: '내려받은 파일의 체크섬을 계산하고 배포처가 적어 둔 값과 맞춰 봅니다',
    layout: 'wide',
    icon: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/filehash']
  },
  {
    id: 'pdftool',
    hidden: true, // 「PDF 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'PDF 편집',
    category: 'tool',
    desc: 'PDF 를 합치고 페이지를 빼내고 돌립니다. 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M8 14h8M8 17h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    produces: ['application/pdf'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/pdftool']
  },
  {
    id: 'audiocut',
    accepts: ['audio/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「소리 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'sound', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '오디오 자르기',
    category: 'tool',
    desc: '음원의 원하는 구간만 잘라 냅니다. 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M3 12h2l2-5 3 12 3-16 3 14 2-5h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['audio/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/audiocut']
  },
  {
    id: 'favicon',
    hidden: true, // 「파일 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'filetool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '파비콘 만들기',
    category: 'tool',
    desc: '그림 한 장으로 사이트 아이콘 여러 크기와 ico 를 만듭니다. 붙일 코드까지 줍니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.3" opacity="0.6"/><circle cx="6" cy="7" r="0.9" fill="currentColor"/><path d="M9 15l2-2.5L13 15l2-3 2.5 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/favicon']
  },
  {
    id: 'imgmerge',
    accepts: ['image/*'], // 다른 도구가 만든 그림을 받는다 (TASK-KL-133)
    hidden: true, // 「파일 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'filetool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '사진 이어 붙이기',
    category: 'tool',
    desc: '여러 장을 세로나 가로로 한 장에 이어 붙입니다. 사진이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="3" width="18" height="8" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="13" width="18" height="8" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 7l2-2 2 2M7 17l2-2 2 2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>',
    produces: ['image/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/imgmerge']
  },
  {
    id: 'text2pdf',
    hidden: true, // 「파일 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '글을 PDF 로',
    category: 'tool',
    desc: '적은 글을 A4 PDF 로 만듭니다. 한글도 깨지지 않고, 글이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.5 12h7M8.5 15h7M8.5 18h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    produces: ['application/pdf'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/text2pdf']
  },
  {
    id: 'pdfsign',
    accepts: ['application/pdf'], // 다른 도구가 만든 PDF 를 받는다 (TASK-KL-133)
    hidden: true, // 「파일 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'PDF 에 서명 넣기',
    category: 'tool',
    desc: '계약서에 손으로 그린 서명을 얹습니다. 인쇄·스캔 없이, 문서가 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 16c1.5-3 2.5 1 4-1s2 .5 3-1" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
    produces: ['application/pdf'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/pdfsign']
  },
  {
    id: 'filesplit',
    hidden: true, // 「파일 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'filetool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '큰 파일 나누기·합치기',
    category: 'tool',
    desc: '큰 파일을 여러 조각으로 나누고 다시 합칩니다. 압축하지 않아 원본과 완전히 같습니다',
    layout: 'wide',
    icon: '<path d="M4 12h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="3 3"/><rect x="4" y="3" width="16" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="4" y="15" width="7" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="13" y="15" width="7" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    lazyScriptPaths: ['tools/filesplit']
  },
  {
    id: 'exifclean',
    accepts: ['image/jpeg'], // 다른 도구가 만든 그림을 받는다 (TASK-KL-133)
    hidden: true, // 「파일 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'filetool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '사진 정보 지우기',
    category: 'tool',
    desc: '사진에 든 위치·카메라 정보를 보여 주고 지웁니다. 화질을 건드리지 않고, 사진이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 6l1.5-2h5L16 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M18.5 4.5 5.5 21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    produces: ['image/*'],
    lazyScriptPaths: ['tools/exifclean']
  },
  {
    id: 'pdf2text',
    accepts: ['application/pdf'], // 다른 도구가 만든 PDF 를 받는다 (TASK-KL-133)
    hidden: true, // 「파일 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'PDF 에서 글자 뽑기',
    category: 'tool',
    desc: 'PDF 의 글자를 줄·문단을 살려 뽑아냅니다. 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.5 12h7M8.5 15h7M8.5 18h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/pdf2text']
  },
  {
    id: 'audiolevel',
    accepts: ['audio/*', 'video/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「파일 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'sound', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '소리 크기 맞추기',
    category: 'tool',
    desc: '들쭉날쭉한 녹음의 크기를 고르게 만듭니다. 전후를 파형과 숫자로 비교하고, 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M4 14V10M8 17V7M12 19V5M16 16V8M20 13v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    produces: ['audio/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/audiolevel']
  },
  {
    id: 'pdfcrop',
    accepts: ['application/pdf'], // 다른 도구가 만든 PDF 를 받는다 (TASK-KL-133)
    hidden: true, // 「PDF 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'PDF 여백 자르기',
    category: 'tool',
    desc: '스캔본·논문의 넓은 여백을 걷어냅니다. 글자는 그대로 고를 수 있습니다',
    layout: 'wide',
    icon: '<path d="M7 3v14h14" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M3 7h14v14" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    produces: ['application/pdf'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/pdfcrop']
  },
  {
    id: 'pdfpagenum',
    accepts: ['application/pdf'], // 다른 도구가 만든 PDF 를 받는다 (TASK-KL-133)
    hidden: true, // 「PDF 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'PDF 쪽 번호',
    category: 'tool',
    desc: 'PDF 에 쪽 번호를 넣습니다. 표지는 건너뛰고 본문부터 1로 셀 수 있습니다',
    layout: 'wide',
    icon: '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 17h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    produces: ['application/pdf'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/pdfpagenum']
  },
  {
    id: 'pdfredact',
    accepts: ['application/pdf'], // 다른 도구가 만든 PDF 를 받는다 (TASK-KL-133)
    hidden: true, // 「PDF 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'PDF 가리개',
    category: 'tool',
    desc: 'PDF 에서 개인정보를 지웁니다. 검은 네모를 얹는 게 아니라 글자 자체를 없앱니다',
    layout: 'wide',
    icon: '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="8" y="12" width="7" height="3.5" rx="0.8" fill="currentColor"/>',
    produces: ['application/pdf'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/pdfredact']
  },
  {
    id: 'pdfcompress',
    hidden: true, // 「파일 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'pdf', // 이 도구를 부르면 묶음의 이 탭으로 간다
    // 다른 도구가 만든 PDF 를 받는다 (TASK-KL-133). 이 표시는 위젯이 아직 안 실렸을 때도
    // 보여야 한다 — 「이어서」 줄은 결과가 나온 그 순간에 갈 곳을 고르기 때문이다.
    accepts: ['application/pdf'],
    title: 'PDF 용량 줄이기',
    category: 'tool',
    desc: '스캔 PDF 의 용량을 줄입니다. 화질을 미리 보고 고를 수 있고, 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 16h6M12 11v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10.5 13.2 12 14.7l1.5-1.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['application/pdf'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/pdfcompress']
  },
  {
    id: 'pdf',
    title: 'PDF 도구',
    category: 'tool',
    desc: 'PDF 를 합치고 나누고 줄이고, 서명·워터마크를 넣습니다. 문서가 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    lazyTabs: true, // 처리기가 무겁다 — 연 탭만 만든다
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.5 13h7M8.5 16.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/pdftool', 'tools/pdfcrop', 'tools/pdfpagenum', 'tools/pdfredact', 'tools/pdfcompress', 'tools/pdfsign', 'tools/pdfwatermark', 'tools/pdf2text', 'tools/text2pdf', 'tools/pdf2img', 'tools/img2pdf', 'tools/pdf']
  },
  {
    id: 'sound',
    title: '소리 도구',
    category: 'tool',
    desc: '녹음하고 자르고 크기를 맞추고 잇습니다. MP3·WAV 로 저장하며 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    lazyTabs: true,
    icon: '<path d="M4 12h2l2-5 3 12 3-16 3 14 2-5h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/voicerec', 'tools/audiocut', 'tools/audiolevel', 'tools/audiospeed', 'tools/audiofade', 'tools/audiojoin', 'tools/sound']
  },
  {
    id: 'filetool',
    title: '파일 도구',
    category: 'tool',
    desc: '사진 변환·이어 붙이기, 위치정보 지우기, ZIP, 큰 파일 나누기. 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M4 6a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/imgbatch', 'tools/imgmerge', 'tools/favicon', 'tools/exifclean', 'tools/ziptool', 'tools/filesplit', 'tools/filehash', 'tools/filetool']
  },
  {
    id: 'video2gif',
    accepts: ['video/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「영상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'videotool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '영상 → GIF',
    category: 'tool',
    desc: '영상의 원하는 구간을 GIF 로 만듭니다. 구간·화질을 보면서 고르고, 받기 전에 결과를 먼저 봅니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/>',
    produces: ['image/gif'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/gifenc', 'tools/video2gif'] // 압축기가 먼저 있어야 한다
  },
  {
    id: 'video2audio',
    accepts: ['video/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「영상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'videotool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '영상에서 소리 추출',
    category: 'tool',
    desc: '영상 파일의 소리만 뽑아 음원으로 받습니다. 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="13" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M16 10l5-3v10l-5-3z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M7 14c0-2 1.5-3 2.5-3s2.5 1 2.5 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    produces: ['audio/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/video2audio']
  },
  {
    id: 'videotrim',
    accepts: ['video/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「영상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'videotool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '영상 자르기',
    category: 'tool',
    desc: '영상에서 원하는 구간만 잘라 냅니다. 소리도 함께 남고, 영상이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M6 4v13a3 3 0 1 0 2 2.8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M18 4v13a3 3 0 1 1-2 2.8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M9 9h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    produces: ['video/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/videotrim']
  },
  {
    id: 'videorotate',
    accepts: ['video/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「영상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'videotool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '영상 돌리기',
    category: 'tool',
    desc: '누워서 찍힌 영상을 세웁니다. 돌리면 가로세로도 함께 바뀝니다',
    layout: 'wide',
    icon: '<rect x="3" y="7" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M17 8a5 5 0 0 1 0 8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M19.5 5.5L17 8l2.5 2.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['video/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/videorotate']
  },
  {
    id: 'videocompress',
    accepts: ['video/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「영상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'videotool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '영상 용량 줄이기',
    category: 'tool',
    desc: '영상 용량을 줄입니다. 해상도와 화질을 고르고, 영상이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M10.5 9.5 8 12l2.5 2.5M13.5 9.5 16 12l-2.5 2.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['video/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/videocompress']
  },
  {
    id: 'video2img',
    accepts: ['video/*'], // 다른 도구가 만든 것을 받는다 (TASK-KL-133)
    hidden: true, // 「영상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'videotool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '영상에서 사진 뽑기',
    category: 'tool',
    desc: '영상의 한 장면이나 일정 간격 장면을 원본 화질로 뽑습니다. 영상이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M15 9l6-3v9l-6-3z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><rect x="7" y="12" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="var(--bg, #111)"/><path d="M7 18l3-3 2 2 2.5-2.5L19 18" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/video2img']
  },
  {
    id: 'screenrec',
    hidden: true, // 「영상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'videotool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '화면 녹화',
    category: 'tool',
    desc: '화면이나 창을 녹화합니다. 소리도 함께 담고, 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 21h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="10.5" r="3" fill="currentColor"/>',
    lazyScriptPaths: ['tools/screenrec']
  },
  {
    id: 'voicerec',
    hidden: true, // 「파일 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'sound', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '목소리 녹음',
    category: 'tool',
    desc: '마이크로 바로 녹음해 WAV 로 받습니다. 소리가 들어오는지 눈으로 보이고, 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 18v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/voicerec']
  },
  {
    id: 'videotool',
    title: '영상 도구',
    category: 'tool',
    desc: '영상을 GIF 로 만들고, 구간을 자르고, 소리를 뽑고, 화면을 녹화합니다. 영상이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    lazyTabs: true, // 처리가 무겁다 — 연 탭만 만든다
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>',
    lazyScriptPaths: ['tools/gifenc', 'tools/video2gif', 'tools/videotrim', 'tools/videorotate', 'tools/videocompress', 'tools/video2img', 'tools/video2audio', 'tools/screenrec', 'tools/videotool']
  },
  {
    id: 'charcount',
    hidden: true, // 「텍스트 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '글자수 세기',
    category: 'tool',
    desc: '공백 포함·제외 글자수, 바이트, 단어·문장·원고지 매수를 실시간으로 셉니다',
    layout: 'form',
    icon: '<path d="M4 7V5h16v2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 5v14M9 19h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/charcount']
  },
  {
    id: 'csvjson',
    hidden: true, // 「devtool」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'CSV ↔ JSON 변환',
    category: 'tool',
    desc: '표(CSV)와 JSON 을 서로 바꿉니다. 따옴표 안 쉼표·줄바꿈도 안 깨집니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="8" height="16" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h8M3 14h8" stroke="currentColor" stroke-width="1.3"/><path d="M15 6h1a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2h-1" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/csvjson']
  },
  {
    id: 'tableconv',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '표 바꾸기',
    category: 'tool',
    desc: '엑셀에서 복사한 표를 마크다운·CSV·JSON 으로 바꿉니다. 붙여넣기만 하면 됩니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18M3 14.5h18M9 4v16M15 4v16" stroke="currentColor" stroke-width="1.3" opacity="0.8"/>',
    lazyScriptPaths: ['tools/tableconv']
  },
  {
    id: 'json2ts',
    hidden: true, // 「devtool」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'JSON → 타입 선언',
    category: 'tool',
    desc: 'JSON 에서 TypeScript 인터페이스를 만듭니다. 배열은 모든 원소를 합쳐 봅니다',
    layout: 'wide',
    icon: '<path d="M9 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M14 8h6M17 8v9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/json2ts']
  },
  {
    id: 'jsonfmt',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'JSON 포맷터',
    category: 'tool',
    desc: 'JSON 을 보기 좋게 정렬하거나 한 줄로 압축하고, 문법 오류의 줄·칸 위치를 찾아줍니다',
    layout: 'wide',
    icon: '<path d="M9 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2M15 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/jsonfmt']
  },
  {
    id: 'hangulkey',
    hidden: true, // 「텍스트 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '한영타 변환',
    category: 'tool',
    desc: '한영키를 안 누르고 친 글자를 되돌립니다. dkssudgktpdy ↔ 안녕하세요 (두벌식)',
    layout: 'form',
    icon: '<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 10h2M11 10h2M16 10h2M7 14h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/hangulkey']
  },
  {
    id: 'qrgen',
    hidden: true, // 「QR 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'qr', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'QR 코드 생성',
    category: 'tool',
    desc: 'URL·텍스트·WiFi·연락처를 QR 코드로 만들고 PNG/SVG 로 저장합니다',
    layout: 'form',
    icon: '<rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    lazyScriptPaths: ['tools/qrgen']
  },
  {
    id: 'qrread',
    hidden: true, // 「QR 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'qr', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'QR 코드 읽기',
    category: 'tool',
    desc: '그림이나 카메라로 QR 을 읽고, 그 안에 무엇이 들었는지 알려 줍니다. 어디에도 올리지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z" fill="currentColor"/>',
    lazyScriptPaths: ['tools/qrread']
  },
  {
    id: 'qr',
    title: 'QR 도구',
    category: 'tool',
    desc: 'QR 코드를 만들고 읽습니다. 읽은 내용이 무엇인지도 알려 줍니다',
    layout: 'wide',
    lazyTabs: true, // 해독기가 무겁다 — 연 탭만 만든다
    icon: '<rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z" fill="currentColor"/>',
    lazyScriptPaths: ['tools/qrgen', 'tools/qrread', 'tools/qr']
  },
  {
    id: 'draw',
    title: '랜덤 뽑기',
    category: 'tool',
    desc: '로또 번호·사다리타기·추첨과 팀 나누기를 한 곳에서',
    layout: 'wide',
    icon: '<circle cx="9" cy="10" r="5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16" cy="16" r="5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 8v4M7 10h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/lotto', 'tools/ladder', 'tools/pick', 'tools/draw']
  },
  {
    id: 'quest',
    title: '오늘의 문제',
    category: 'tool',
    desc: '도구를 열어야 풀리는 하루 한 문제 — 진법·모스·해시·단위',
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M9 8a3 3 0 1 1 4 2.8c-.8.3-1 .9-1 1.7v.5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.2" fill="currentColor"/>',
    lazyScriptPaths: ['quest']
  },
  {
    id: 'packs',
    title: '내 표 만들기',
    category: 'tool',
    desc: '놀이에 쓸 표를 직접 만듭니다 — 스프레드시트에서 붙여넣기 한 판이면 됩니다',
    layout: 'wide',
    noHero: true,
    icon:
      '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18M9 9v11" stroke="currentColor" stroke-width="1.4"/><path d="M15 13h4M17 11v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['packs']
  },
  {
    id: 'twenty',
    title: '스무고개',
    category: 'tool',
    desc: '하나를 마음에 정하면 스무 번 안에 맞힙니다 — 포켓몬·롤 챔피언·원신 캐릭터',
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M9 9a3 3 0 1 1 4 2.8c-.8.3-1 .9-1 1.7v.4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['twenty']
  },
  {
    id: 'play',
    title: '놀이터',
    category: 'tool',
    desc: '하루 한 판씩 — 하나 맞히기 · 높은 쪽 고르기 · 오늘의 문제',
    layout: 'wide',
    noHero: true,
    icon:
      '<rect x="3" y="7" width="18" height="11" rx="4" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M7.5 11v3M6 12.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="16" cy="12" r="1.1" fill="currentColor"/><circle cx="18" cy="14.5" r="1.1" fill="currentColor"/>',
    lazyScriptPaths: ['play']
  },
  {
    id: 'higher',
    title: '높은 쪽 고르기',
    category: 'tool',
    desc: '둘 중 어느 쪽이 더 큰지만 고르는 연승 놀이 — 포켓몬·롤·원신',
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M4 18l5-6 4 3 7-9" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 6h5v5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['higher']
  },
  {
    id: 'worldcup',
    title: '이상형 월드컵',
    category: 'tool',
    desc: '둘 중 하나만 고르는 토너먼트 — 표를 만들면 그대로 내 월드컵이 됩니다',
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M7 4h10v3a5 5 0 0 1-10 0V4z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M12 12v4M9 20h6M10 16h4v4h-4z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
    lazyScriptPaths: ['worldcup']
  },
  {
    id: 'lotto',
    hidden: true, // 「뽑기」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'draw', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '로또 번호 생성',
    category: 'tool',
    desc: '1~45 로또 번호를 원하는 게임 수만큼 뽑습니다. 제외수·고정수·홀짝 조건 지원',
    layout: 'form',
    icon: '<circle cx="8" cy="9" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16" cy="15" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 7v4M6 9h4" stroke="currentColor" stroke-width="1.4"/>',
    lazyScriptPaths: ['tools/lotto']
  },
  {
    id: 'timer',
    hidden: true, // 「시간」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'time', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '타이머 · 스톱워치',
    category: 'tool',
    desc: '카운트다운 타이머와 랩 기록 스톱워치. 끝나면 알림음이 울립니다',
    layout: 'form',
    icon: '<circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 9v4l3 2M9 2h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/timer']
  },
  {
    id: 'time',
    title: '시간',
    category: 'tool',
    desc: '날짜 계산·D-Day·타이머·스톱워치·세계 시차를 한 곳에서',
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/datecalc', 'tools/timer', 'tools/worldclock', 'tools/epoch', 'tools/birth', 'tools/workdays', 'tools/timecalc', 'tools/pace', 'tools/time']
  },
  {
    id: 'birth',
    hidden: true, // 「time」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'time', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '생일 정보',
    category: 'tool',
    desc: '생년월일로 만 나이·띠·별자리·태어난 요일·다음 생일까지 남은 날을 한 번에',
    layout: 'form',
    icon: '<path d="M4 20h16v-7H4zM6 13V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M9 7V5M12 7V4M15 7V5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/birth']
  },
  {
    id: 'workdays',
    hidden: true, // 「시간 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'time', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '영업일 계산',
    category: 'tool',
    desc: '주말과 공휴일을 뺀 영업일을 셉니다. 어떤 날을 뺐는지 보여 줍니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 15l2 2 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/workdays']
  },
  {
    id: 'timecalc',
    hidden: true, // 「time」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'time', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '시간 더하기·빼기',
    category: 'tool',
    desc: '시각에 시간을 더하거나 근무시간을 합산합니다. 60진법 실수를 막습니다',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M16 4h5M18.5 1.5v5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/timecalc']
  },
  {
    id: 'pace',
    hidden: true, // 「time」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'time', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '러닝 페이스 계산',
    category: 'tool',
    desc: '페이스와 속도를 서로 바꾸고 목표 기록에 필요한 페이스를 역산합니다',
    layout: 'wide',
    icon: '<circle cx="17" cy="5" r="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 21l2-6-3-2 1-4 3 2 2 1M9 12l-2 3-3 1" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/pace']
  },
  {
    id: 'datecalc',
    hidden: true, // 「시간」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'time', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '날짜 계산기 · D-Day',
    category: 'tool',
    desc: '두 날짜 사이 일수, D-Day, 며칠 후 날짜, 만 나이를 계산합니다',
    layout: 'form',
    icon: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/datecalc']
  },
  {
    id: 'unitconv',
    hidden: true, // 「계산기」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '단위 변환',
    category: 'tool',
    desc: '길이·무게·넓이(평)·부피·온도·데이터·속도·시간을 서로 변환합니다',
    layout: 'form',
    icon: '<path d="M3 8h13l-3-3M21 16H8l3 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/unitconv']
  },
  {
    id: 'hashgen',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '해시 생성기',
    category: 'tool',
    desc: '텍스트나 파일의 MD5·SHA-1·SHA-256·SHA-512 해시(체크섬)를 브라우저에서 계산합니다',
    layout: 'form',
    icon: '<path d="M9 3L7 21M17 3l-2 18M4 8h16M3 16h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    // 해시 라이브러리를 **자기가** 부른다 (TASK-KL-104). 예전에는 셸이 그것을 늘 먼저
    // 받아 뒀기에 안 적어도 됐는데, 그 eager 로드를 뺀 뒤로 이 도구의 제 주소
    // (`/karmolab/t/hashgen/`)에서만 「라이브러리를 불러오지 못했어요」가 떴다. 앱 안에서는
    // 묶음(개발 도구)이 대신 받아 줘서 멀쩡해 보였다 — 그래서 오래 안 들켰다.
    lazyScriptPaths: ['vendor/crypto-js.min', 'tools/hashgen']
  },
  {
    id: 'uuidgen',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'UUID 생성기',
    category: 'tool',
    desc: 'UUID v4·v7, ULID, NanoID, 안전한 비밀번호를 원하는 개수만큼 만듭니다',
    layout: 'form',
    icon: '<rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 12h2M11 12h2M15 12h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/uuidgen']
  },
  {
    id: 'textdiff',
    hidden: true, // 「텍스트 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '텍스트 비교',
    category: 'tool',
    desc: '두 텍스트·코드의 달라진 줄을 찾아 색으로 표시합니다 (추가 / 삭제 / 동일)',
    layout: 'wide',
    icon: '<path d="M4 4h7v16H4zM13 4h7v16h-7z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h3M6 13h3M15 11h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/textdiff']
  },
  {
    id: 'regextest',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '정규식 테스터',
    category: 'tool',
    desc: '정규표현식을 실시간으로 시험하고 매치·그룹·치환 결과를 확인합니다',
    layout: 'wide',
    icon: '<path d="M12 4v16M5 8l14 8M19 8L5 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/regextest']
  },
  {
    id: 'color',
    title: '색상 도구',
    category: 'tool',
    desc: 'HEX·RGB·HSL 변환, 이미지에서 색 추출, CSS 색 이름표를 한 곳에서',
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3a9 9 0 0 1 0 18 4.5 4.5 0 0 1 0-9 4.5 4.5 0 0 0 0-9z" fill="currentColor" opacity="0.45"/><circle cx="8" cy="9" r="1.1" fill="currentColor"/>',
    lazyScriptPaths: ['ref/reftable', 'tools/colorconv', 'tools/palette', 'ref/colorname', 'tools/gradient', 'tools/contrast', 'tools/colorblind', 'tools/color']
  },
  {
    id: 'gradient',
    hidden: true, // 「색상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'color', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '그라데이션 만들기',
    category: 'tool',
    desc: '배경용 그라데이션을 보면서 만들고 CSS 를 가져갑니다. 가운데가 탁해지지 않게 섞습니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5 18 19 6" stroke="currentColor" stroke-width="1.2" opacity="0.5"/><circle cx="7" cy="8" r="1.6" fill="currentColor" opacity="0.8"/><circle cx="17" cy="16" r="1.6" fill="currentColor" opacity="0.4"/>',
    lazyScriptPaths: ['tools/gradient']
  },
  {
    id: 'contrast',
    hidden: true, // 「color」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'color', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '색 대비 검사',
    category: 'tool',
    desc: '글자색과 배경색의 대비비를 재고 접근성 기준 통과 여부를 알려줍니다',
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    lazyScriptPaths: ['tools/contrast']
  },
  {
    id: 'colorblind',
    hidden: true, // 「color」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'color', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '색각 시뮬레이터',
    category: 'tool',
    desc: '두 색이 색각 이상에서 어떻게 보이는지 확인하고 구분 가능한지 판정합니다',
    layout: 'wide',
    icon: '<circle cx="9" cy="12" r="5.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="15" cy="12" r="5.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7.5a5.5 5.5 0 0 0 0 9" stroke="currentColor" stroke-width="1.3"/>',
    lazyScriptPaths: ['tools/colorblind']
  },
  {
    id: 'colorconv',
    hidden: true, // 「색상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'color', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '색상 변환',
    category: 'tool',
    desc: 'HEX·RGB·HSL·CMYK 를 서로 변환하고, 대비비(가독성)와 조화 팔레트를 함께 봅니다',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3a9 9 0 0 1 0 18 4.5 4.5 0 0 1 0-9 4.5 4.5 0 0 0 0-9z" fill="currentColor" opacity="0.5"/>',
    lazyScriptPaths: ['tools/colorconv']
  },

  {
    id: 'text2img',
    hidden: true, // 「이미지 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'image', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '글자를 그림으로',
    category: 'tool',
    desc: '인용구나 공지를 이미지 카드로 만듭니다. 긴 글도 잘리지 않게 크기를 맞춰 줍니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 10h10M7 13h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    produces: ['image/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/text2img']
  },
  {
    id: 'imgresize',
    accepts: ['image/*'], // 다른 도구가 만든 그림을 받는다 (TASK-KL-133)
    hidden: true, // 「이미지 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'image', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '사진 크기 맞추기',
    category: 'tool',
    desc: '가로 몇 px, 몇 MB 이하 같은 기준에 맞춰 줄입니다. 용량은 알아서 찾아 줍니다',
    layout: 'wide',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 16l3-3 2 2 3-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 7h3v3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    produces: ['image/*'], // 이 도구가 내놓는 것 (TASK-KL-191 — 선언이 정본, 파생 X)
    lazyScriptPaths: ['tools/imgresize']
  },
  {
    id: 'redact',
    hidden: true, // 「이미지 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'image', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '가리개',
    category: 'tool',
    desc: '캡처에서 계좌번호·이름 같은 것을 지웁니다. 덮는 게 아니라 그 자리를 없앱니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="6" y="9" width="7" height="4" rx="1" fill="currentColor"/><path d="M15 15h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/redact']
  },
  {
    id: 'asciiart',
    hidden: true, // 「이미지」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'image', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '이미지 → 아스키 아트',
    category: 'tool',
    desc: '사진이나 그림을 글자로 그린 아스키 아트로 바꿉니다. 폭·문자 세트·반전 조절',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h3M6 12h6M6 15h4M14 9h4M15 12h3M13 15h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/asciiart']
  },
  {
    id: 'radix',
    hidden: true, // 「계산기」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '진법 변환',
    category: 'tool',
    desc: '2·8·10·16진수를 한 화면에서 동시에 변환합니다. 임의 진법(2~36)과 비트 연산도 함께',
    layout: 'form',
    icon: '<path d="M4 6h4v4H4zM4 14h4v4H4z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8h8M12 16h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 4v4M16 16v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/radix']
  },
  {
    id: 'barcode',
    title: '바코드 만들기',
    category: 'tool',
    desc: '재고·도서·물품 라벨용 바코드를 만듭니다. 안 읽히는 값은 미리 알려 줍니다',
    layout: 'wide',
    icon: '<path d="M4 5v14M7 5v14M9.5 5v14M13 5v14M16 5v14M18 5v14M20 5v14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/barcode']
  },
  {
    id: 'icsmake',
    title: '일정 파일 만들기',
    category: 'tool',
    desc: '모임·공지를 달력에 넣을 수 있는 .ics 파일로 만듭니다. 시간대를 맞춰 적습니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 13v5M9.5 15.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/icsmake']
  },
  {
    id: 'subtitle',
    title: '자막 시간 맞추기',
    category: 'tool',
    desc: '어긋난 자막을 밀거나 늘려 맞춥니다. SRT·VTT 를 서로 바꿉니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 14h5M13 14h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/subtitle']
  },
  {
    id: 'textredact',
    title: '글자 가리개',
    category: 'tool',
    desc: '로그·문서에서 주민번호·전화·카드번호를 찾아 지웁니다. 무엇을 찾았는지 보여 줍니다',
    layout: 'wide',
    icon: '<path d="M4 5h16M4 9h16M4 13h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="14" y="15" width="7" height="4" rx="1" fill="currentColor"/>',
    lazyScriptPaths: ['tools/textredact']
  },
  {
    id: 'textclean',
    hidden: true, // 「텍스트 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '텍스트 정리',
    category: 'tool',
    desc: '여러 줄 텍스트를 정렬·중복 제거·공백 정리·번호 매기기로 한 번에 다듬습니다',
    layout: 'wide',
    icon: '<path d="M4 6h16M4 11h11M4 16h14M4 21h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M17 18l2 2 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/textclean']
  },
  {
    id: 'ladder',
    hidden: true, // 「뽑기」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'draw', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '사다리타기',
    category: 'tool',
    desc: '이름과 결과를 넣으면 사다리를 그리고, 누른 사람의 경로를 따라 내려가며 짝을 정합니다',
    layout: 'wide',
    icon: '<path d="M7 3v18M17 3v18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7 8h10M7 13h10M7 18h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/ladder']
  },
  {
    id: 'palette',
    hidden: true, // 「색상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'color', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '이미지 색상 추출',
    category: 'tool',
    desc: '사진에서 대표 색을 뽑아 HEX·RGB 팔레트로 보여줍니다. CSS 변수로도 한 번에 복사',
    layout: 'wide',
    icon: '<path d="M12 3a9 9 0 1 0 0 18h2a3 3 0 0 0 0-6h-1a2 2 0 0 1 0-4h2a5 5 0 0 0-3-8z" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7" r="1.3" fill="currentColor"/><circle cx="7" cy="14" r="1.3" fill="currentColor"/>',
    lazyScriptPaths: ['tools/palette']
  },
  {
    id: 'calc',
    title: '계산기',
    category: 'tool',
    desc: '퍼센트·이자·BMI·단위·진법 계산을 한 곳에서',
    layout: 'form',
    icon: '<rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 7h8M8 12h2M12 12h2M16 12h1M8 16h2M12 16h2M16 16h1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/percent', 'tools/interest', 'tools/bmi', 'tools/unitconv', 'tools/radix', 'tools/numword', 'tools/aspect', 'tools/grade', 'tools/vat', 'tools/bytesize', 'tools/bizno', 'tools/loan', 'tools/cssunit', 'tools/calc']
  },
  {
    id: 'numword',
    hidden: true, // 「calc」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '숫자 ↔ 한글',
    category: 'tool',
    desc: '숫자를 한글로 읽고 한글 수를 숫자로 되돌립니다. 계약서·영수증 금액 표기',
    layout: 'form',
    icon: '<path d="M4 8h6M7 5v11M14 5h4a2 2 0 0 1 0 4h-2a2 2 0 0 0 0 4h4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/numword']
  },
  {
    id: 'aspect',
    hidden: true, // 「calc」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '화면 비율 계산기',
    category: 'tool',
    desc: '가로·세로 비율을 유지한 채 크기를 계산합니다. 화면비 목록과 여백 계산 포함',
    layout: 'form',
    icon: '<rect x="3" y="6" width="18" height="12" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 6l18 12" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>',
    lazyScriptPaths: ['tools/aspect']
  },
  {
    id: 'grade',
    hidden: true, // 「calc」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '학점 계산기',
    category: 'tool',
    desc: '과목별 학점과 성적으로 평점을 계산합니다. 목표 학점에 필요한 성적도 함께',
    layout: 'wide',
    icon: '<path d="M12 4 2 9l10 5 10-5z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/grade']
  },
  {
    id: 'vat',
    hidden: true, // 「calc」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '부가세 계산기',
    category: 'tool',
    desc: '공급가에서 부가세를 더하거나 총액에서 빼냅니다. 세금계산서 세 줄 그대로',
    layout: 'form',
    icon: '<path d="M4 20 20 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7 4h10a2 2 0 0 1 2 2v3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="7" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="17" cy="16" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['tools/vat']
  },
  {
    id: 'bytesize',
    hidden: true, // 「calc」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '용량 단위 변환',
    category: 'tool',
    desc: 'KB·MB·GB 를 서로 바꿉니다. 1000 기준과 1024 기준을 나란히 봅니다',
    layout: 'form',
    icon: '<ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" stroke="currentColor" stroke-width="1.4" fill="none"/>',
    lazyScriptPaths: ['tools/bytesize']
  },
  {
    id: 'bizno',
    hidden: true, // 「calc」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '사업자번호 검사',
    category: 'tool',
    desc: '사업자등록번호·법인등록번호가 형식상 올바른지 계산으로 확인합니다',
    layout: 'form',
    icon: '<rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 6V4h8v2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 12h5M7 16h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/bizno']
  },
  {
    id: 'loan',
    hidden: true, // 「calc」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '대출 상환표',
    category: 'tool',
    desc: '원리금균등·원금균등·만기일시 상환을 비교하고 달별 원금·이자를 봅니다',
    layout: 'wide',
    icon: '<path d="M3 20h18M6 20V10M11 20V6M16 20v-8M21 20v-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/loan']
  },
  {
    id: 'cssunit',
    hidden: true, // 「calc」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'CSS 단위 변환',
    category: 'tool',
    desc: 'px·rem·em·pt·% 를 서로 바꿉니다. 루트 기준과 부모 기준을 나란히',
    layout: 'form',
    icon: '<path d="M4 7h16M4 12h10M4 17h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19 14v6M17 16l2-2 2 2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/cssunit']
  },
  {
    id: 'percent',
    hidden: true, // 「계산기」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '퍼센트 계산기',
    category: 'tool',
    desc: '할인율·증감률·비율을 질문 문장 그대로 채워 넣어 계산합니다',
    layout: 'form',
    icon: '<path d="M19 5 5 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16.5" cy="16.5" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    lazyScriptPaths: ['tools/percent']
  },
  {
    id: 'interest',
    hidden: true, // 「계산기」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '이자 계산기',
    category: 'tool',
    desc: '예금·적금 만기 금액과 대출 월 상환액을 계산합니다. 이자소득세 15.4% 반영',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.4V13m0 2.5v.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/interest']
  },
  {
    id: 'urlparse',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'URL 인코딩 · 분해',
    category: 'tool',
    desc: '한글이 깨진 주소를 되돌리고, 쿼리 파라미터를 펼쳐 보고, 추적 파라미터를 지웁니다',
    layout: 'wide',
    icon: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/urlparse']
  },
  {
    id: 'caseconv',
    hidden: true, // 「텍스트 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'text', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '표기법 변환',
    category: 'tool',
    desc: 'camelCase·snake_case·kebab-case·PascalCase 를 서로 바꿉니다. 여러 줄 한 번에',
    layout: 'form',
    icon: '<path d="M4 17 8 7l4 10M5.5 14h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 11a3 3 0 1 0 0 4v1m0-6.5V17" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/caseconv']
  },
  {
    id: 'jwt',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'JWT 디코더',
    category: 'tool',
    desc: 'JWT 토큰의 헤더·페이로드를 풀어 보고 만료 시각과 남은 시간을 확인합니다',
    layout: 'wide',
    icon: '<path d="M12 3v18M12 7 5.5 9.5M12 7l6.5 2.5M12 15l-6.5-2.5M12 15l6.5-2.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['tools/jwt']
  },
  {
    id: 'cron',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'devtool', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '크론 표현식 읽기',
    category: 'tool',
    desc: '크론 표현식을 우리말로 풀고 다음 실행 시각을 실제로 계산해 보여줍니다',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M3 4l2 2M21 4l-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/cron']
  },
  {
    id: 'epoch',
    hidden: true, // 「time」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'time', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '타임스탬프 변환',
    category: 'tool',
    desc: '유닉스 타임스탬프와 사람이 읽는 시각을 서로 바꿉니다. 초·밀리초 자동 판별',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l4 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/epoch']
  },
  {
    id: 'worldclock',
    hidden: true, // 「시간」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'time', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '세계 시간 · 시차',
    category: 'tool',
    desc: '도시별 현재 시각과 서울과의 시차를 봅니다. 서머타임 자동 반영',
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" stroke="currentColor" stroke-width="1.4" fill="none"/>',
    lazyScriptPaths: ['tools/worldclock']
  },
  {
    id: 'morse',
    title: '모스 부호 변환',
    category: 'tool',
    desc: '글자를 모스 부호로 바꾸고 부호를 다시 글자로 읽습니다. 한글 모스와 소리·불빛 재생 지원',
    layout: 'form',
    icon: '<path d="M3 12h2M8 12h6M17 12h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M3 7h4M10 7h2M15 7h6M3 17h6M12 17h2M17 17h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>',
    lazyScriptPaths: ['tools/morse']
  },
  {
    id: 'pick',
    hidden: true, // 「뽑기」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'draw', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '추첨 · 팀 나누기',
    category: 'tool',
    desc: '명단에서 무작위로 뽑고, 팀을 나누고, 순서를 정합니다. 중복 없이 공정하게',
    layout: 'form',
    icon: '<circle cx="7" cy="8" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="17" cy="8" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M2 20a5 5 0 0 1 10 0M12 20a5 5 0 0 1 10 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/pick']
  },
  {
    id: 'bmi',
    hidden: true, // 「계산기」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'calc', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'BMI 계산기',
    category: 'tool',
    desc: '키와 몸무게로 체질량지수를 계산하고 대한비만학회·WHO 두 기준으로 함께 봅니다',
    layout: 'form',
    icon: '<circle cx="12" cy="5" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8v7M9 22l3-7 3 7M7 11h10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/bmi']
  },

  /* ───── 자료 (ref) — 찾아보고 눌러 복사하는 표 (TASK-KL-088) ─────
   * 전부 ref/reftable 의 공용 렌더러를 먼저 로드한다 (keycode 만 자체 UI). */
  {
    id: 'reference',
    title: '참고표',
    category: 'ref',
    desc: 'git 명령어·마크다운·HTTP 상태·단축키·파일 확장자·키 코드를 한 곳에서 찾아봅니다',
    layout: 'wide',
    icon: '<path d="M4 5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M4 18a2 2 0 0 1 2-2h13" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 7h7M8 11h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/gitcmd', 'ref/markdown', 'ref/httpstatus', 'ref/shortcut', 'ref/filetype', 'ref/keycode', 'ref/regexref', 'ref/reference']
  },
  {
    id: 'charmap',
    title: '문자표',
    category: 'ref',
    desc: '특수문자·이모지·HTML 엔티티·ASCII 를 한 곳에서 찾아 눌러 복사합니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 9h2M7 13h4M13 9h4M15 13h2M7 17h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/specialchar', 'ref/emoji', 'ref/htmlentity', 'ref/ascii', 'ref/charmap']
  },
  {
    id: 'specialchar',
    hidden: true, // 「문자표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'charmap', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '특수문자 모음',
    category: 'ref',
    desc: '화살표·별·도형·수학기호 등 자판에 없는 특수문자를 눌러서 복사합니다',
    layout: 'wide',
    icon: '<path d="M5 7h6M8 4v6M15 5l4 4M19 5l-4 4M7 15h4M9 13v4M15 15h4M15 18h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/specialchar']
  },
  {
    id: 'ascii',
    hidden: true, // 「문자표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'charmap', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'ASCII 코드표',
    category: 'ref',
    desc: '0~127 ASCII 문자의 10진·16진·2진 값과 제어문자 의미를 한 표에서 봅니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18M9 9v11" stroke="currentColor" stroke-width="1.4"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/ascii']
  },
  {
    id: 'htmlentity',
    hidden: true, // 「문자표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'charmap', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'HTML 특수문자',
    category: 'ref',
    desc: '&amp;nbsp; &amp;lt; &amp;copy; 같은 HTML 엔티티 코드를 문자와 함께 찾아 복사합니다',
    layout: 'wide',
    icon: '<path d="M9 7 4 12l5 5M15 7l5 5-5 5M13 4l-2 16" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/htmlentity']
  },
  {
    id: 'httpstatus',
    hidden: true, // 「참고표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'reference', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'HTTP 상태 코드',
    category: 'ref',
    desc: '200·301·403·404·500 등 HTTP 응답 코드의 뜻과 쓰는 상황을 정리한 표',
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v6M12 16v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/httpstatus']
  },
  {
    id: 'colorname',
    hidden: true, // 「색상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'color', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'CSS 색상 이름표',
    category: 'ref',
    desc: 'CSS 표준 색상 이름 148개와 HEX 값을 눈으로 비교하고 눌러서 복사합니다',
    layout: 'wide',
    icon: '<path d="M12 3a9 9 0 1 0 0 18h2a3 3 0 0 0 0-6h-1a2 2 0 0 1 0-4h2a5 5 0 0 0-3-8z" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/colorname']
  },
  {
    id: 'keycode',
    hidden: true, // 「참고표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'reference', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '키보드 이벤트 코드',
    category: 'ref',
    desc: '키를 누르면 event.key · event.code · keyCode 값을 그 자리에서 보여줍니다',
    layout: 'form',
    icon: '<rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    lazyScriptPaths: ['ref/keycode']
  },
  {
    id: 'emoji',
    hidden: true, // 「문자표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'charmap', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '이모지 찾기',
    category: 'ref',
    desc: '한국어로 검색해서 이모지를 찾고 눌러서 복사합니다. 표정·손짓·기호 등 분류별',
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/emoji']
  },
  {
    id: 'markdown',
    hidden: true, // 「참고표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'reference', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '마크다운 문법표',
    category: 'ref',
    desc: '제목·표·코드블록·체크박스 등 마크다운 문법을 찾아 그대로 복사합니다 (GFM 기준)',
    layout: 'wide',
    icon: '<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 15V9l3 3 3-3v6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 9v4M15 12l2 2 2-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/markdown']
  },
  {
    id: 'regexref',
    hidden: true, // 「참고표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'reference', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '정규식 치트시트',
    category: 'ref',
    desc: '정규식 기호와 자주 쓰는 패턴을 하려는 일로 찾아 복사합니다',
    layout: 'wide',
    icon: '<path d="M12 4v16M6 8l12 8M18 8 6 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/regexref']
  },
  {
    id: 'gitcmd',
    hidden: true, // 「참고표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'reference', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: 'git 명령어 모음',
    category: 'ref',
    desc: '하려는 일로 git 명령어를 찾습니다. 되돌릴 수 없는 명령은 따로 표시',
    layout: 'wide',
    icon: '<circle cx="6" cy="6" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="6" cy="18" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="18" cy="12" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 8.5v7M8.5 6h5a4 4 0 0 1 4 4v0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/gitcmd']
  },
  {
    id: 'filetype',
    hidden: true, // 「참고표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'reference', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '파일 확장자표',
    category: 'ref',
    desc: '확장자가 무슨 파일이고 무엇으로 여는지 찾아봅니다. 이미지·문서·압축·코드 등',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M8 15h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/filetype']
  },
  {
    id: 'shortcut',
    hidden: true, // 「참고표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    bundle: 'reference', // 이 도구를 부르면 묶음의 이 탭으로 간다
    title: '단축키 모음',
    category: 'ref',
    desc: '윈도우·맥·브라우저·VS Code 단축키 중 알면 실제로 쓰게 되는 것만 모았습니다',
    layout: 'wide',
    icon: '<rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h1M10 9h1M14 9h1M18 9h1M6 13h1M10 13h5M18 13h1M8 16.5h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/shortcut']
  },

  /* ───── 잡동사니 (Stash) — TASK-KL-034 ─────
   * 사이드바 hide (hidden: true). 「잡동사니」 위젯 안에서 inline render + 자동 작동.
   * 직접 진입 (Toolbox.switchPage) 가능. 21 개 dead 위젯 자산 보존. */
  { id: 'bounce', title: '바운스', category: 'play', desc: '공을 튕겨 바운스 게임을 합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['bounce'] },
  { id: 'bubble', title: '뽁뽁이', category: 'play', desc: '뽁뽁이를 터뜨립니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['bubble'] },
  { id: 'countdown', title: '카운트다운', category: 'tool', desc: '카운트다운 타이머를 설정합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['countdown'] },
  { id: 'darkroom', title: '다크룸', category: 'play', desc: '어두운 방에서 마우스로 빛을 비춥니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['darkroom'] },
  { id: 'eyes', title: '눈동자', category: 'play', desc: '마우스를 따라오는 눈동자', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['eyes'] },
  { id: 'folder', title: '에러', category: 'play', desc: '폴더가 무한 증식하는 이스터에그', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['folder'] },
  { id: 'fontgacha', title: '폰트가챠', category: 'play', desc: '가챠로 폰트를 바꿉니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['font'] },
  { id: 'hacker', title: '해커', category: 'play', desc: '키보드를 연타해 해커 느낌의 텍스트를 출력합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['hacker'] },
  { id: 'hourglass', title: '모래시계', category: 'tool', desc: '모래시계 타이머를 실행합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['hourglass'] },
  { id: 'moon', title: '달 위상', category: 'tool', desc: '오늘의 달 위상을 확인합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['moon'] },
  { id: 'news', title: '뉴스', category: 'play', desc: '가짜 뉴스 헤드라인을 생성합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['news'] },
  { id: 'particle', title: '파티클', category: 'play', desc: '마우스로 파티클을 움직이고 클릭으로 폭발시킵니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['particle'] },
  { id: 'password', title: '비번', category: 'tool', desc: '4자리 비밀번호를 힌트 보며 맞히는 놀이', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['password'] },
  { id: 'pet', title: '쓰다듬기', category: 'play', desc: '고양이를 쓰다듬고 호감도를 올립니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['pet'] },
  { id: 'reaction', title: '반응속도', category: 'play', desc: '반응 속도를 측정합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['reaction'] },
  { id: 'shylink', title: '어그로', category: 'play', desc: '움직이는 링크를 잡는 미니게임', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['shylink'] },
  { id: 'speed', title: '속도측정', category: 'play', desc: '드래그 속도를 측정합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['speed'] },
  { id: 'stone', title: '돌', category: 'play', desc: '돌을 던져 점을 봅니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['stone'] },
  { id: 'toast', title: '토스트', category: 'play', desc: '토스트 알림을 띄웁니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['toast'] },
  { id: 'ytdownloader', title: '유튜브 다운로드', category: 'tool', desc: '유튜브 영상을 다운로드합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['youtubedl'] },

  /* 잡동사니 위젯 본체 */
  {
    id: 'stash',
    title: '잡동사니',
    category: 'play',
    desc: '정리 안 된 실험들이 한 상자에 살아 움직임',
    layout: 'full',
    icon: '<path d="M3 7h18l-2 13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L3 7z M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['stash']
  },

  /* 노트북(집에서 24시간 도는 기계)으로 가는 문 — 파일 공유·빌드 현황 */
  {
    id: 'laptop',
    title: '노트북',
    category: 'lab',
    desc: '집에서 24시간 도는 노트북 — 파일 공유·빌드 현황으로 가는 문',
    layout: 'form',
    icon: '<rect x="3" y="5" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M2 19h20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['laptop']
  },

  /* ORBITA (TASK-KL-193) — 순서를 줄이 아니라 궤도로 적는 시퀀서. 색이 곧 음이다. */
  {
    id: 'orbita',
    title: 'ORBITA',
    category: 'lab',
    desc: '궤도에 색을 찍어 만드는 폴리리듬 시퀀서 — 브라우저 신스 + MIDI 출력',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".5"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".8"/><circle cx="12" cy="3" r="1.8" fill="currentColor"/><circle cx="17" cy="12" r="1.4" fill="currentColor"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/>',
    lazyScriptPaths: ['orbita']
  },

  /* 블루마블 (TASK-KL-206) — 계기판이 아니라 창문이다. 자취방에 켜 두면 지구가 돌고,
     밤이 된 쪽에 도시가 켜지고, 방금 어딘가가 흔들리면 그 자리에 파문이 인다. */
  {
    id: 'bluemarble',
    title: '블루마블',
    category: 'lab',
    desc: '지금 이 순간의 지구 — 낮과 밤, 도시 불빛, 방금 난 지진, 머리 위의 ISS',
    layout: 'full',
    icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3.5 10h17M4.2 15h15.6" stroke="currentColor" stroke-width="1.1" opacity=".5" fill="none"/><path d="M12 3c3 3.6 3 13.4 0 18M12 3C9 6.6 9 16.4 12 21" stroke="currentColor" stroke-width="1.1" opacity=".5" fill="none"/>',
    lazyScriptPaths: ['bluemarble/bluemarble']
  },

  /* 정원 (TASK-KL-211) — 손대지 않는 것을 켜 두고 구경한다. 9칸이 읽는 규칙 하나로
     도시가 자라고 길이 뚫린다. 무슨 일이 일어났는지는 문장으로 말해 준다. */
  {
    id: 'garden',
    title: '정원',
    category: 'lab',
    desc: '오늘의 규칙 하나로 스스로 자라는 격자 — 손대지 않고 지켜봅니다',
    layout: 'full',
    icon: '<rect x="3" y="3" width="6" height="6" rx="1" fill="currentColor" opacity=".85"/><rect x="15" y="3" width="6" height="6" rx="1" fill="currentColor" opacity=".35"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity=".85"/><rect x="3" y="15" width="6" height="6" rx="1" fill="currentColor" opacity=".35"/><rect x="15" y="15" width="6" height="6" rx="1" fill="currentColor" opacity=".85"/>',
    lazyScriptPaths: ['garden/garden']
  },

  /* 도감 (TASK-KL-196) — 써 본 도구에 도장이 찍힌다. 새로 만드는 것 없이 160개를 채울 것으로. */
  {
    id: 'collection',
    title: '도감',
    category: 'tool',
    desc: '써 본 도구에 도장이 찍힌다 — 몇 칸이나 채웠나',
    layout: 'wide',
    noHero: true,
    icon:
      '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M8 4v16" stroke="currentColor" stroke-width="1.7"/><path d="M12 9.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="currentColor"/>',
    lazyScriptPaths: ['collection']
  },

  /* KarmoMap (TASK-KL-087 / KL-202) — 관계도·세계관·카드 전개를 그리는 캔버스.
   * ★ 이 항목이 없어서 20 커밋치 기능이 **앱에서 열 수 없는 상태**로 있었다(2026-08-09 실측):
   *   여기 적힌 `lazyScriptPaths` 가 번들 대상 목록이기도 해서, 안 적으면 묶음 자체가 안 만들어진다.
   *   타입체크·번들 정합 검사는 그때도 전부 초록이었다 — 「없는 것」은 검사할 대상이 없으니까. */
  {
    id: 'karmomap',
    title: 'KarmoMap',
    category: 'lab',
    desc: '관계도·세계관·카드 전개를 그리는 캔버스 — 어휘 팩을 갈아끼우면 쓰임새가 바뀐다',
    layout: 'wide',
    noHero: true,
    icon:
      '<circle cx="6" cy="7" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle cx="18" cy="6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle cx="12" cy="17" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M8.4 8.4 10.6 15M15.9 7.6 13.4 15M8.5 6.6h7" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".7"/>',
    lazyScriptPaths: ['karmomap/karmomap']
  }
] as KarmoLabLazyWidgetStub[];
