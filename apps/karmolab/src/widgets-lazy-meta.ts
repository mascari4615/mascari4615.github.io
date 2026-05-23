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
    id: 'crypto',
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
    id: 'imageedit',
    title: '이미지 편집',
    category: 'tool',
    desc: '편집·형식·해상도 변환(PNG·JPEG·WebP 등)을 한 화면에서',
    layout: 'full',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M9 3v18" stroke="currentColor" stroke-width="1.5"/><path d="M3 15h18" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="9" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['root/gemini', 'imageconvert/imageconvert', 'imageedit']
  },
  {
    id: 'imagelib',
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
    id: 'quest-log',
    title: 'Quest Log',
    category: 'lab',
    desktopOnly: true,
    desc: 'memo TASK 트리 — Tauri 전용 (memo 폴더 런타임 read, 6 도메인 그룹 + parent chain + 체크박스 진행도, 2s 폴링)',
    layout: 'full',
    noHero: true,
    icon: '<path d="M12 2l2.9 6.95 7.6.6-5.75 4.95L18.4 22 12 17.9 5.6 22l1.65-7.5L1.5 9.55l7.6-.6z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
    lazyScriptPaths: ['quest-log/quest-log']
  },
  {
    id: 'karmoddrine-map',
    title: 'karmoddrine 지도',
    category: 'lab',
    desktopOnly: true,
    desc: 'umbrella 전체 토폴로지 — D3 force graph (드래그/줌/hover/클릭 패널). TASK-KAR-091 Phase 1 MVP, 정적 schema',
    layout: 'full',
    noHero: true,
    icon: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="19" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="19" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="12" x2="5" y2="6" stroke="currentColor" stroke-width="1.3"/><line x1="12" y1="12" x2="19" y2="6" stroke="currentColor" stroke-width="1.3"/><line x1="12" y1="12" x2="5" y2="18" stroke="currentColor" stroke-width="1.3"/><line x1="12" y1="12" x2="19" y2="18" stroke="currentColor" stroke-width="1.3"/>',
    lazyScriptPaths: ['karmoddrine-map/karmoddrine-map']
  },
  {
    id: 'task-launcher',
    title: 'TASK Launcher',
    category: 'tool',
    desktopOnly: true,
    desc: 'memo TASK 파일 flat 검색 + 외부 에디터 즉시 오픈 + 새 TASK 즉석 생성 (id 자동 발급, frontmatter skeleton)',
    layout: 'full',
    noHero: true,
    icon: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M16 16l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    lazyScriptPaths: ['task-launcher']
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
    id: 'agent-team',
    title: '에이전트 팀',
    category: 'lab',
    desktopOnly: true,
    desc: 'KAR-018 에이전트 팀 운영 콘솔 (v1: roster + objectives + 활성 세션 read-only)',
    layout: 'full',
    icon: '<circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="10" x2="7" y2="14" stroke="currentColor" stroke-width="1.4"/><line x1="14" y1="10" x2="17" y2="14" stroke="currentColor" stroke-width="1.4"/>',
    lazyScriptPaths: ['agent-team/agent-team']
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
  { id: 'morse', title: '모스', category: 'tool', desc: '모스 부호로 인코딩·디코딩합니다', hidden: true, layout: 'form', icon: '', lazyScriptPaths: ['morse'] },
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
    category: 'tool',
    desc: '정리 안 된 실험들이 한 상자에 살아 움직임',
    layout: 'full',
    icon: '<path d="M3 7h18l-2 13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L3 7z M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    lazyScriptPaths: ['stash']
  }
] as KarmoLabLazyWidgetStub[];
