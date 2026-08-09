/**
 * 위젯 매니페스트
 *
 * - KARMOLAB_WIDGETS_BOOT: 초기 로드(즉시 실행)
 * - 지연 위젯 메타·경로: widgets-lazy-meta.js 의 KARMOLAB_LAZY_META (단일 출처)
 *
 * 위젯 추가: boot에 넣거나 lazy-meta에 항목 추가 후 해당 위젯은
 * (디버그: widgets/devtools.js — Tauri는 동일 파일을 앱에 포함해 init 전 주입)
 *   Toolbox.register({ ...Toolbox.getLazyWidgetPublicMeta('id'), tabs: [...] })
 */
window.KARMOLAB_WIDGETS_BOOT = [
  /* 즐겨찾기·링크도 여기 없다 — 첫 화면에서 둘이 40KB 를 받고 한 번도 안 그렸다
     (TASK-KL-204, KL-201 계기판이 잡았다). 목록에서 보이는 자리는 그대로다:
     갈래를 빈 값으로 둬서 셸의 「갈래 없음」 묶음에 지금처럼 남는다. */
  /* 광장도 여기 없다 — 같은 이유 (TASK-KL-204). 첫 화면에서 23KB 를 받고 안 그렸다. */
  /* 커뮤니티도 여기 없다 — 같은 이유다 (TASK-KL-204). 첫 화면에서 77KB 를 받고 한 번도
     안 그렸다(KL-201 계기판이 잡았다). 누르면 그때 받는다. */
  /* 채팅은 여기 없다 — **화면을 다 그린 뒤** 온다 (TASK-KL-128 26).
     셸에 상주하는 한 방인 것은 맞지만, 첫 그림에 필요한 것은 아니다. 부팅 목록에 있던 동안
     도구 화면에서 491ms 짜리 프레임 하나를 통째로 만들었다(실측·기기 4배 느리게).
     부르는 곳 = `index.html` 의 「화면 다 그린 뒤」 묶음 (마스코트·계정과 같은 자리). */
  'dashboard',
  'devtools'
];
