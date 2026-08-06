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
    id: 'devtool',
    title: '개발 도구',
    category: 'tool',
    desc: 'JSON 포맷·JWT 디코드·정규식 테스트·해시·UUID·크론·URL·암호화를 한 곳에서',
    layout: 'wide',
    icon: '<path d="M9 6 3 12l6 6M15 6l6 6-6 6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['tools/jsonfmt', 'tools/jwt', 'tools/regextest', 'tools/hashgen', 'tools/uuidgen', 'tools/cron', 'tools/urlparse', 'crypto', 'tools/devtool']
  },
  {
    id: 'crypto',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    title: '암호화 / 복호화',
    category: 'tool',
    desc: '텍스트를 AES, Base64, URL 인코딩으로 암호화·복호화합니다',
    layout: 'form',
    icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
    lazyScriptPaths: ['crypto']
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
    title: '이미지 생성',
    category: 'tool',
    desc: 'AI로 이미지를 생성합니다',
    layout: 'full',
    icon: '<circle cx="12" cy="12" r="10"/><line x1="14.31" y1="8" x2="20.05" y2="17.94"/><line x1="9.69" y1="8" x2="21.17" y2="8"/><line x1="7.38" y1="12" x2="13.12" y2="2.06"/><line x1="9.69" y1="16" x2="3.95" y2="6.06"/><line x1="14.31" y1="16" x2="2.83" y2="16"/><line x1="16.62" y1="12" x2="10.88" y2="21.94"/>',
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
    lazyScriptPaths: ['root/gemini', 'ref/reftable', 'imageconvert/imageconvert', 'imageedit', 'tools/asciiart', 'world/world', 'world/parse-md', 'world/load-characters-from-wiki', 'imagegen/presets', 'imagegen/config', 'imagegen/styles', 'imagegen/core', 'imagegen/imagegen', 'imagelib', 'tools/image']
  },
  {
    id: 'imageedit',
    hidden: true, // 「이미지」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    title: '이미지 편집',
    category: 'tool',
    desc: '편집·형식·해상도 변환(PNG·JPEG·WebP 등)을 한 화면에서',
    layout: 'full',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M9 3v18" stroke="currentColor" stroke-width="1.5"/><path d="M3 15h18" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="9" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['root/gemini', 'imageconvert/imageconvert', 'imageedit']
  },
  {
    id: 'imagelib',
    hidden: true, // 「이미지」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
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
    lazyScriptPaths: ['tools/charcount', 'tools/textclean', 'tools/textdiff', 'tools/caseconv', 'tools/hangulkey', 'tools/text']
  },
  {
    id: 'charcount',
    hidden: true, // 「텍스트 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    title: '글자수 세기',
    category: 'tool',
    desc: '공백 포함·제외 글자수, 바이트, 단어·문장·원고지 매수를 실시간으로 셉니다',
    layout: 'form',
    icon: '<path d="M4 7V5h16v2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 5v14M9 19h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/charcount']
  },
  {
    id: 'jsonfmt',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
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
    title: '한영타 변환',
    category: 'tool',
    desc: '한영키를 안 누르고 친 글자를 되돌립니다. dkssudgktpdy ↔ 안녕하세요 (두벌식)',
    layout: 'form',
    icon: '<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 10h2M11 10h2M16 10h2M7 14h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/hangulkey']
  },
  {
    id: 'qrgen',
    title: 'QR 코드 생성',
    category: 'tool',
    desc: 'URL·텍스트·WiFi·연락처를 QR 코드로 만들고 PNG/SVG 로 저장합니다',
    layout: 'form',
    icon: '<rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    lazyScriptPaths: ['tools/qrgen']
  },
  {
    id: 'draw',
    title: '뽑기',
    category: 'tool',
    desc: '로또 번호·사다리타기·추첨과 팀 나누기를 한 곳에서',
    layout: 'wide',
    icon: '<circle cx="9" cy="10" r="5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16" cy="16" r="5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 8v4M7 10h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/lotto', 'tools/ladder', 'tools/pick', 'tools/draw']
  },
  {
    id: 'lotto',
    hidden: true, // 「뽑기」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
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
    lazyScriptPaths: ['tools/datecalc', 'tools/timer', 'tools/worldclock', 'tools/time']
  },
  {
    id: 'datecalc',
    hidden: true, // 「시간」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
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
    title: '해시 생성기',
    category: 'tool',
    desc: '텍스트나 파일의 MD5·SHA-1·SHA-256·SHA-512 해시(체크섬)를 브라우저에서 계산합니다',
    layout: 'form',
    icon: '<path d="M9 3L7 21M17 3l-2 18M4 8h16M3 16h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/hashgen']
  },
  {
    id: 'uuidgen',
    hidden: true, // 「개발 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
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
    lazyScriptPaths: ['ref/reftable', 'tools/colorconv', 'tools/palette', 'ref/colorname', 'tools/color']
  },
  {
    id: 'colorconv',
    hidden: true, // 「색상 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
    title: '색상 변환',
    category: 'tool',
    desc: 'HEX·RGB·HSL·CMYK 를 서로 변환하고, 대비비(가독성)와 조화 팔레트를 함께 봅니다',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3a9 9 0 0 1 0 18 4.5 4.5 0 0 1 0-9 4.5 4.5 0 0 0 0-9z" fill="currentColor" opacity="0.5"/>',
    lazyScriptPaths: ['tools/colorconv']
  },

  {
    id: 'asciiart',
    hidden: true, // 「이미지」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
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
    title: '진법 변환',
    category: 'tool',
    desc: '2·8·10·16진수를 한 화면에서 동시에 변환합니다. 임의 진법(2~36)과 비트 연산도 함께',
    layout: 'form',
    icon: '<path d="M4 6h4v4H4zM4 14h4v4H4z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8h8M12 16h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 4v4M16 16v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/radix']
  },
  {
    id: 'textclean',
    hidden: true, // 「텍스트 도구」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
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
    lazyScriptPaths: ['tools/percent', 'tools/interest', 'tools/bmi', 'tools/unitconv', 'tools/radix', 'tools/calc']
  },
  {
    id: 'percent',
    hidden: true, // 「계산기」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
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
    title: '크론 표현식 읽기',
    category: 'tool',
    desc: '크론 표현식을 우리말로 풀고 다음 실행 시각을 실제로 계산해 보여줍니다',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M3 4l2 2M21 4l-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    lazyScriptPaths: ['tools/cron']
  },
  {
    id: 'worldclock',
    hidden: true, // 「시간」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
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
    lazyScriptPaths: ['ref/reftable', 'ref/gitcmd', 'ref/markdown', 'ref/httpstatus', 'ref/shortcut', 'ref/filetype', 'ref/keycode', 'ref/reference']
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
    title: '마크다운 문법표',
    category: 'ref',
    desc: '제목·표·코드블록·체크박스 등 마크다운 문법을 찾아 그대로 복사합니다 (GFM 기준)',
    layout: 'wide',
    icon: '<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 15V9l3 3 3-3v6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 9v4M15 12l2 2 2-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    lazyScriptPaths: ['ref/reftable', 'ref/markdown']
  },
  {
    id: 'gitcmd',
    hidden: true, // 「참고표」 위젯의 탭으로 합쳐짐 — 검색 유입 주소는 유지
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
  { id: 'moon', title: '문페이즈', category: 'tool', desc: '오늘의 달 위상을 확인합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['moon'] },
  { id: 'news', title: '뉴스', category: 'play', desc: '가짜 뉴스 헤드라인을 생성합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['news'] },
  { id: 'particle', title: '파티클', category: 'play', desc: '마우스로 파티클을 움직이고 클릭으로 폭발시킵니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['particle'] },
  { id: 'password', title: '비번', category: 'tool', desc: '랜덤 비밀번호를 생성합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['password'] },
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
  }
] as KarmoLabLazyWidgetStub[];
