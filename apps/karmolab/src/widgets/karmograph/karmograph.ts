/**
 * karmograph.ts — 세계관 그래프 위젯 (TASK-KL-087 단위 1).
 *
 * 사용자: "KarmoGraph 프로그램 만들고 싶어. 마인드맵, 그래프, 관계도 같은 건데.
 * 세계관 설명에 특히 특화된 것."
 *
 * 일반 마인드맵과의 차이는 `packs.ts` 의 **어휘 팩**에 있다 (TASK-KL-202) — 노드는
 * 그냥 박스가 아니라 인물/카드/개념 중 하나고, 선은 그냥 줄이 아니라 ♡좋아함/
 * ☆소환/뒷받침 중 하나다. 팩을 갈아끼우면 같은 캔버스가 세계관 정리 도구도,
 * 팬 관계도 도구도, 카드 전개 정리 도구도, 개념 설명 도구도 된다.
 *
 * 캔버스는 `lib/graph/canvas.ts` (cockpit 에서 추출, 단위 0). 저장은
 * localStorage — 백엔드 0, 웹에서도 동작, 내용은 사적.
 *
 * 내용은 전적으로 사용자가 쓴다. AI 가 노드를 만들지 않는다 —
 * KarmoGraph 은 그릇이고 렌즈지, 작가가 아니다.
 */
import { t, loadNamespace } from '../../lib/i18n';
import { GraphCanvas } from '../../lib/graph/canvas';
import { themeFromCss } from '../../lib/graph/canvas-theme';
import type { GraphSpec, GraphNode, GraphEdge, GroupDef, NodeShape, BackgroundKind, EdgeKindDef, StoryStep } from '../../lib/graph/spec';
import { emptyGraphSpec } from '../../lib/graph/spec';
import { KarmoGraphLocalStorageAdapter } from './local-storage-adapter';
import { loadTerms, saveTerms, newTermId, type MyTerms } from './terms';
import { parseOutline, layoutTree } from './from-text';
import { sampleFor, INTENTS, MORE_INTENTS } from './samples';
import { COMMAND_GROUPS } from './commands';
import { posterLegend, legendWorthShowing } from './poster-legend';
import { wrapPoster } from './poster';
import { pasteIntent } from './paste-intent';
import { shouldOfferFocus } from './big-board';
import { panelFor, shouldSwitch } from './ui-state';
import { tableColumns, tableRows, sortRows, nextSort, type TableSort } from './table-view';
import { ripenessOf, worthNudging } from './ripeness';
import { printSheetHtml, isWide } from './print-sheet';
import { stepTime, nextTimeName, forgetTime, edgeAt, resolveEdges, type TimePoint } from './times';
import { readCardHtml } from './panels/read-panel';
import { dropFromFront, roughBytes } from './history';
import { measureStorage, humanBytes, WARN_RATIO } from './storage-health';
import { help } from './help';
import type { PanelCtx } from './panels/context';
import { renderHelpPanel } from './panels/help-panel';
import { renderSnaPanel } from './panels/sna-panel';
import { resolveDoc, notesOf, setNoteWords } from '../../lib/graph/notes';
import { mirrorToLibrary, refreshFromLibrary, foreignNotes, adoptNote } from './notes-library';
import { toJsonCanvas, fromJsonCanvas } from './json-canvas';
import { toMermaidBlock } from './mermaid';
import { withPresentation } from './presentation-svg';
import { filmPlan, frameAt, fitRect, filmFileName, type FilmScene } from './film';
import { loadStamps, captureStamp, applyStamp, deleteStamp } from './stamps';
import { renderNotesPanel } from './panels/notes-panel';
import { renderStampsPanel } from './panels/stamps-panel';
import { renderStoragePanel } from './panels/storage-panel';
import { renderFilterPanel } from './panels/filter-panel';
import { renderTermsPanel } from './panels/terms-panel';
import { renderGroupsPanel } from './panels/groups-panel';
import { renderManyPanel } from './panels/many-panel';
import { renderTextPanel } from './panels/text-panel';
import { renderEdgePanel } from './panels/edge-panel';
import { renderLinkSections, bindLinkSections } from './panels/links-section';
import { avatarFieldHtml, bindAvatarField } from './panels/avatar-section';
import { tagsFieldHtml, bindTagsField } from './panels/tags-section';
import { membershipFieldHtml, bindMembershipField } from './panels/membership-section';
import { shapeFieldHtml, tiltFieldHtml, bindLookFields } from './panels/look-section';
import { attachFieldHtml, bindAttachField } from './panels/attach-section';
import { docFieldHtml, bindDocField } from './panels/doc-section';
import { fieldsSectionHtml, bindFieldsSection } from './panels/fields-section';
import { commentsSectionHtml, bindCommentsSection } from './panels/comments-section';
import { outgoingLinks, backlinks, unlinkedMentions, linkFirstMention } from './links';
import { snapToGrid, unoverlap, layoutCircle, layoutHierarchy, layoutTimeline, bestTimeField } from './tidy';
import { computeSna, topBy } from './sna';
import { encodeShare, decodeShare, shareCodeFromLocation, buildShareUrl, isReadOnlyLink, withNodeAnchor, nodeAnchorFromLocation, SHARE_URL_LIMIT, stripImages } from './share';
import {
  loadLibrary, setActive, renameMap, touchMap, addMap, removeMap, mapKey,
  type LibraryIndex,
} from './library';
import {
  PACKS,
  DEFAULT_PACK_ID,
  packById,
  ALL_KIND_COLORS,
  ALL_KIND_ICONS,
  allKindLabels,
  ALL_EDGE_KIND_DEFS,
  allEdgeLabels,
  allNodeKindGroups,
  allEdgeKindGroups,
  type CanvasPack,
} from './packs';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  if (typeof Toolbox === 'undefined') return;
  const tb = Toolbox;

  const NODE_H = 40;
  const NODE_MIN_W = 120;
  /** 얼굴 사진은 이 픽셀로 줄여 넣는다 — 원본을 그대로 넣으면 localStorage 가 몇 장에 터진다. */
  const AVATAR_PX = 96;

  /* ★ 모양 이름은 **불릴 때** 꺼낸다. 이 자리(묶음이 읽히는 순간)는 말 묶음이 아직 안 들어온
     시점이라 `t()` 가 없는 열쇠로 던진다 — 그러면 위젯이 등록조차 안 된다(실측 2026-08-12). */
  const shapes = (): { id: NodeShape; label: string; icon: string }[] => [
    { id: 'rect', label: t('karmograph.shapes.msg'), icon: '▭' },
    { id: 'circle', label: t('karmograph.shapes.msg2'), icon: '◯' },
    { id: 'bubble', label: t('karmograph.shapes.msg3'), icon: '💬' },
    { id: 'note', label: t('karmograph.shapes.msg4'), icon: '📝' },
    { id: 'photo', label: t('karmograph.shapes.msg5'), icon: '🖼' },
  ];

  /* 스타일 한 장. 공용 `injectCSS` 는 이제 **있으면 덮어쓴다**(2026-08-13) — 우리만 따로 넣던
     길은 지웠다. 같은 일에 문이 둘이면 다음에 또 갈라진다. */
  /* 스타일 한 장 — **위젯을 열 때마다 다시 넣는다**(아래 build 안).
     셸이 위젯을 닫으며 style 을 걷어 가는 판이 있어, 모듈 첫 로드 때 한 번만 넣으면 다시 열었을 때
     **스타일 없이** 그려졌다(실측 2026-08-13: `<style>` 넷뿐, km-toolbar 규칙 없음 — 화면은 멀쩡).
     공용 `injectCSS` 는 이제 있으면 덮어쓰므로 매번 불러도 싸다. */
  const KARMOGRAPH_CSS = `
    /* ★ 높이를 화면에서 직접 가져온다. height:100% 는 셸 카드가 높이를 안 주면 0 이 되고,
       그때 캔버스는 117px 까지 눌렸다가 다음 실행엔 420px 이 되는 식으로 **들쭉날쭉**했다
       (실측 2026-08-09 — 같은 코드로 두 번 돌려 다른 결과가 났다). 캔버스는 넓이가 곧 쓸모라
       셸에 기대지 않고 스스로 확보한다. */
    .km-root { display:flex; flex-direction:column; width:100%;
      height:calc(100dvh - var(--km-top, 160px) - 8px); min-height:560px; overflow:hidden; }
    /* position+z-index — 캔버스 svg 를 absolute inset:0 로 깔면서, 툴바가 두 줄이 되는 순간
       그 svg 가 툴바 아랫줄을 덮어 **버튼이 눌리지 않았다**(실측 2026-08-09: 「⋯」 자리를 찍으면
       svg 가 잡혔다). 화면은 멀쩡해 보이는데 클릭만 죽는 부류라 눈으로는 못 잡는다. */
    /* 툴바는 짧게 유지한다. 실측 2026-08-09: 항목이 늘며 384px(5줄)까지 자라 캔버스를 먹었고,
       그렇다고 안에서 스크롤시키면 이번엔 버튼이 「멈추지 않아」 자동 조작이 통째로 막혔다.
       답은 스크롤이 아니라 **항목을 줄이는 것** — 노드 만들기는 빈 곳 더블클릭이 대신한다. */
    .km-toolbar { position:relative; z-index:5; display:flex; flex-wrap:wrap; gap:5px; align-items:center;
      padding:6px 10px; border-bottom:1px solid var(--border); background:var(--bg-secondary); flex-shrink:0; }
    .km-toolbar input[type=text], .km-toolbar select, .km-side select, .km-side input[type=text] {
      background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-primary);
      border-radius:var(--radius-sm); padding:5px 8px; font-size:var(--font-size-xs); }
    /* ★ 셸 CSS 가 폼 요소를 통짜 너비로 깔아 두는 바람에, 툴바 항목이 **한 줄에 하나씩** 쌓여
       세로로 네 줄을 먹고 있었다(실측 2026-08-10, 실서비스 화면). 툴바 안에서는 제 폭만 쓰게 못 박는다. */
    .km-toolbar > * { flex:0 0 auto; width:auto; max-width:100%; }
    /* 폭을 못 박아 한 줄에 더 많이 들어가게 — 툴바가 세로로 자랄수록 그림이 밀린다. */
    .km-toolbar select[data-km="maps"] { max-width:138px; }
    /* 이름을 고치는 동안 고르개 자리를 그대로 쓴다 — 자리가 움직이면 옆 단추가 손 밑에서 밀린다. */
    .km-toolbar input[data-km="map-name"] { max-width:138px; padding:4px 8px; border-radius:8px;
      border:1px solid var(--border-color); background:var(--bg-primary); color:var(--text-primary); }
    .km-toolbar input[data-km="map-name"].hidden { display:none; }
    /* ★ 단추의 hidden 클래스만은 **한 줄로** 못 박는다. 없던 동안 「접었다」고 표시한 단추가 그대로
       보였다 — 툴바의 「↑ 위로」가 68×30 으로 살아 있었고(접기의 뜻이 사라진다), 서랍·팔레트가
       부르라고 둔 대리 단추 둘이 22×10 조각으로 툴바에 끼어 있었다 (실측 2026-08-14). */
    .km-root button.hidden { display:none !important; }
    /* ★ 그 밖에는 공통 .hidden 규칙이 없다 — 숨길 것마다 제 규칙을 갖는다.
       (없는 줄 모르고 hidden 클래스만 붙였다가 고르개가 그대로 보였다, 2026-08-14) */
    .km-toolbar select[data-km="maps"].hidden { display:none; }
    /* 링크 상자 — 클립보드가 막힌 자리(비보안 컨텍스트·앱 안 브라우저)에서 **직접 복사**하는 길.
       예전엔 브라우저 prompt 였다: 판을 통째로 가리고, 긴 주소는 한 줄 창에서 끝이 안 보이고,
       무엇보다 「복사하라는 건지 고치라는 건지」가 안 읽혔다 (KL-271). */
    .km-linkbox { position:absolute; left:50%; bottom:64px; transform:translateX(-50%); z-index:970;
      display:flex; gap:6px; align-items:center; max-width:min(560px, 92%); padding:10px 12px;
      border-radius:12px; border:1px solid var(--border-color); background:var(--bg-secondary);
      box-shadow:0 8px 24px rgba(0,0,0,.35); }
    /* 말 상자 — 「안 됐다」는 말은 사라지면 안 된다(토스트는 3초면 없어진다). 그렇다고
       브라우저 alert 처럼 판을 얼려서도 안 된다 — 얼면 뒤에 있는 화면을 못 보고 답한다. */
    .km-note { position:absolute; left:50%; bottom:64px; transform:translateX(-50%); z-index:970;
      display:flex; gap:10px; align-items:flex-start; max-width:min(520px, 92%); padding:12px 14px;
      border-radius:12px; border:1px solid var(--border-color); background:var(--bg-secondary);
      box-shadow:0 8px 24px rgba(0,0,0,.35); color:var(--text-primary); font-size:13px;
      white-space:pre-line; }
    .km-linkbox input { flex:1 1 auto; min-width:180px; padding:6px 10px; border-radius:8px;
      border:1px solid var(--border-color); background:var(--bg-primary); color:var(--text-primary);
      font-size:12px; }
    .km-toolbar input[type=text] { min-width:132px; max-width:176px; }
    .km-toolbar input[data-km="find"] { min-width:118px; }
    .km-sep { width:1px; align-self:stretch; background:var(--border); margin:0 2px; }
    /* 찾은 수 — 흐려지는 것만으로는 「없다」와 「아직 안 쳤다」가 구별이 안 된다. */
    .km-findcount { font-size:11px; color:var(--text-tertiary); padding:0 2px; white-space:nowrap;
      font-variant-numeric:tabular-nums; }
    .km-findcount.is-none { color:var(--danger, #f87171); }
    .km-findcount.hidden { display:none; }
    .km-body { flex:1; display:flex; min-height:0; position:relative; }
        /* ★ 캔버스 최소 높이 — 툴바가 줄바꿈으로 커지면 flex 가 캔버스부터 깎는다.
       실측 2026-08-09: 툴바가 커지며 캔버스가 156px 로 눌려 더블클릭이 화면 밖으로 나갔다. */
    /* ★ 판은 **불투명한 바탕**이어야 한다. 캔버스는 제 배경을 인라인으로 --ck-canvas-bg (기본
       transparent)로 깔기 때문에 여기 적은 background 선언은 지고 있었고, 그 틈으로 앱 배경의
       성운 장식이 그대로 비쳐 선·글씨 위에 얼룩이 졌다(실측 2026-08-12 — 안내 글이 글로우에
       묻혀 안 읽혔다). 셸보다 한 단 **내려앉은** 색을 줘서 판이 파여 보이게 한다.
       토큰이라 밝은 테마에서도 같이 뒤집힌다. */
    .km-canvas { flex:1; position:relative; z-index:1; min-width:0; min-height:420px;
      --ck-canvas-bg: var(--bg-primary); background:var(--bg-primary); }
    /* 고른 것 옆에 뜨는 작은 도구 줄 — 자주 쓰는 네 가지를 옆 패널까지 안 가고 누르게 (Whimsical 계보). */
    .km-mini { position:absolute; z-index:15; display:flex; gap:2px; padding:2px;
      background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px;
      box-shadow:0 4px 14px rgba(0,0,0,0.28); }
    .km-mini.hidden { display:none; }
    /* 배율 줄 — 판 오른쪽 아래, 작은 판(미니맵) 바로 밑. 캔버스 도구들이 다 그렇듯
       **판 위에 얹힌 물건**으로 보이게 작은 판과 같은 결을 준다.
       ★ 왼쪽 아래에 두면 안 된다 — 그 자리는 앱의 채팅 알약이 덮는다(실측 2026-08-12). */
    /* 시점 줄 (KL-271 X2) — 넓은 화면에서는 판 아래 왼쪽(배율은 오른쪽), 폰에서는 판 위(아래 시트가 덮는다). */
    /* ★ 왼쪽 아래 구석은 **셸의 채팅 방울**이 쓴다 — 거기 두면 「‹」가 눌리지 않는다(실측:
       elementFromPoint 가 klchat-dot 을 준다). 그 위로 올린다. */
    .km-times { position:absolute; left:16px; bottom:58px; z-index:16; display:flex; align-items:center;
      gap:4px; padding:3px 6px; border-radius:999px; background:var(--glass-strong);
      border:1px solid var(--border); max-width:min(60%, 520px); overflow-x:auto; }
    .km-times.hidden { display:none; }
    .km-times .btn { padding:3px 9px; font-size:12px; border-radius:999px; white-space:nowrap; }
    .km-times .btn.is-on { background:var(--bg-tertiary); color:var(--text-primary); font-weight:600; }
    /* 이름은 **그 자리에서** 고친다 (KL-271) — 브라우저 prompt 는 판을 가리고,
       고치는 동안 「어느 시점을 고치는 중인가」가 화면에서 사라진다. */
    .km-times input { padding:3px 9px; font-size:12px; border-radius:999px; min-width:72px; max-width:140px;
      border:1px solid var(--border-color); background:var(--bg-primary); color:var(--text-primary); }
    .km-root.is-presenting .km-times { display:none; }
    .km-zoom { position:absolute; right:16px; bottom:14px; z-index:16; display:flex; align-items:center; gap:2px;
      padding:2px; border-radius:999px; background:var(--glass-strong); border:1px solid var(--border);
      box-shadow:0 8px 24px rgba(0,0,0,.32); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
    .km-zoom .btn { padding:3px 9px; font-size:13px; line-height:1.3; border-radius:999px; }
    .km-zoom .km-zoom-val { min-width:56px; font-size:11px; color:var(--text-secondary); font-variant-numeric:tabular-nums; }
    .km-root.is-presenting .km-zoom { display:none; }
    .km-mini .btn { padding:2px 6px; font-size:12px; line-height:1.2; }
    .km-side { width:clamp(300px, 26vw, 420px); flex-shrink:0; position:relative; z-index:2;
      border-left:1px solid var(--border); background:var(--bg-secondary);
      padding:10px; overflow-y:auto; font-size:var(--font-size-xs); }
    /* ★ 탭은 **전부 이름을 단다** (2026-08-12 사용자 검토: 🔗 💾 🔍 만 보고는 공유·내보내기가
       어디인지 알 수 없었다 — 아이콘은 아는 사람에게만 이름이다). 아홉 개가 한 줄에 안 들어가므로
       두 줄로 접는다: 옆 패널의 세로 12px 이 「무엇인지 모르는 단추 아홉 개」보다 싸다. */
    .km-tabs { display:flex; flex-wrap:wrap; gap:2px; margin:-4px -4px 10px; padding-bottom:8px;
      border-bottom:1px solid var(--border); position:sticky; top:-12px; background:var(--bg-secondary); z-index:2; }
    /* 아이콘 옆 이름 — 폰에서는 줄이 옆으로 밀리므로 그대로 두고(밀어 쓰면 된다), 아주 좁을 때만 접는다. */
    .km-btn-name { margin-left:5px; font-size:11px; vertical-align:middle; }
    @media (max-width: 420px) { .km-btn-name { display:none; } }
    .km-tabs { align-items:center; position:relative; }
    .km-tabs-now { flex:1; min-width:0; font-size:12px; font-weight:600; color:var(--text-primary);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:2px 2px 2px 4px; }
    .km-tabs-more { padding:2px 8px; font-size:13px; }
    /* 다른 목록은 **접어 둔다** — 늘 펴 두면 어쩌다 쓰는 여덟이 늘 쓰는 하나만큼 자리를 먹는다. */
    .km-tabs-menu { position:absolute; right:0; top:calc(100% + 4px); z-index:6; display:flex;
      flex-direction:column; gap:2px; padding:6px; min-width:150px; border:1px solid var(--border);
      border-radius:10px; background:var(--bg-secondary); box-shadow:0 10px 26px rgba(0,0,0,.4); }
    .km-tabs-menu.hidden { display:none; }
    .km-tabs-menu .km-tab { justify-content:flex-start; text-align:left; opacity:.9; }
    .km-tab { padding:4px 7px; font-size:13px; opacity:.55; }
    .km-tab.is-on { opacity:1; background:var(--bg-tertiary); }
    .km-tab-name { margin-left:4px; font-size:11px; max-width:96px; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; vertical-align:middle; }
    /* 빈 판에서 아직 쓸 데가 없는 손잡이는 접는다 (TASK-KL-271 F2). 되돌리기는 꺼진 채 남긴다 —
       사라지면 「되돌릴 수 있다」는 사실 자체를 못 배운다. */
    .km-toolbar.km-blank [data-km="find"],
    .km-toolbar.km-blank [data-km="find-count"],
    .km-toolbar.km-blank [data-km="fit"],
    .km-toolbar.km-blank [data-km="story"] { display:none !important; }
    /* 관계망을 읽어 주는 줄 — 숫자보다 먼저 눈에 들어와야 한다. */
    .km-said { background:var(--bg-tertiary); border-radius:8px; padding:8px 10px; }
    /* 👁 읽는 화면 (KL-271 O3) — 고칠 칸이 아니라 **읽을 글**의 옷이다. */
    /* 🌱 익은 정도 한 줄 (KL-271 L5) — 재촉이 아니라 알림이라 옅게. */
    .km-ripe { font-size:11.5px; color:var(--text-tertiary); margin:-2px 0 8px; }
    .km-read-note { color:var(--text-secondary); font-size:13px; margin:2px 0 8px; }
    .km-read-tags { color:var(--accent); font-size:11px; margin-bottom:8px; }
    .km-read-fields, .km-read-doc { margin-bottom:10px; }
    .km-read-doc { font-size:13px; line-height:1.7; color:var(--text-primary); white-space:pre-wrap; }
    .km-read-row { display:flex; gap:8px; font-size:12.5px; line-height:1.7; }
    .km-read-k { color:var(--text-tertiary); min-width:76px; flex-shrink:0; }
    /* ▤ 표 (KL-271 L4) — 좁은 패널에서 옆으로 구르고, 머리는 붙어 있는다. */
    .km-tablewrap { overflow-x:auto; max-height:60vh; overflow-y:auto; }
    .km-tbl { border-collapse:collapse; width:100%; font-size:12px; }
    .km-tbl th { position:sticky; top:0; background:var(--bg-secondary); text-align:left; padding:0; }
    .km-tbl th .btn { padding:4px 6px; font-size:11px; color:var(--text-tertiary); width:100%; justify-content:flex-start; }
    .km-tbl td { padding:5px 6px; border-top:1px solid var(--border); white-space:nowrap;
      max-width:140px; overflow:hidden; text-overflow:ellipsis; }
    .km-tbl tbody tr { cursor:pointer; }
    .km-tbl tbody tr:hover { background:var(--bg-tertiary); }
    .km-said-line, .km-gap-line, .km-clu-line { font-size:12px; color:var(--text-primary); line-height:1.6; }
    .km-said-line + .km-said-line, .km-gap-line + .km-gap-line, .km-clu-line + .km-clu-line { margin-top:4px; }
    /* 「글이 있으면 붙여넣기」 — 갈래 카드 밑에 한 줄로. 카드와 같은 무게로 두면 셋이 넷이 된다. */
    .km-intent-text { width:100%; margin-top:6px; justify-content:center; font-size:12px; }
    .km-side.hidden { display:none; }
    /* 패널 안에서 **성격이 다른 묶음**을 가르는 줄·이름표 (TASK-KL-271 P5). */
    .km-split { border:none; border-top:1px solid var(--border); margin:16px 0 10px; }
    .km-secname { font-size:10px; letter-spacing:.06em; text-transform:uppercase;
      color:var(--text-tertiary); margin:2px 0 6px; }
    .km-side h4 { margin:0 0 8px; font-size:var(--font-size-sm); color:var(--text-primary); }
    .km-field { margin-bottom:10px; display:flex; flex-direction:column; gap:4px; }
    .km-field label { color:var(--text-secondary); font-size:11px; }
    .km-field input, .km-field select { width:100%; }
    .km-edge-row { display:flex; flex-wrap:wrap; gap:4px; align-items:center; margin-bottom:8px; }
    .km-edge-row .km-edge-label { flex-basis:100%; font-size:11px; }
    .km-edge-row .km-edge-peer { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      color:var(--text-primary); }
    .km-edge-row select { width:74px; }
    .km-hint { color:var(--text-tertiary); font-size:11px; line-height:1.5; }
    .km-group-row { display:flex; gap:5px; align-items:center; margin-bottom:6px; }
    .km-group-row input[type=text] { flex:1; min-width:0; }
    .km-group-row input[type=color] { width:30px; height:26px; padding:0; border:1px solid var(--border);
      border-radius:var(--radius-sm); background:var(--bg-tertiary); cursor:pointer; }
    .km-group-count { color:var(--text-tertiary); font-size:11px; min-width:16px; text-align:right; }
    .km-avatar-row { display:flex; gap:6px; align-items:center; }
    .km-avatar-row input[type=text] { width:56px; text-align:center; font-size:16px; padding:2px 4px; }
    .km-avatar-row input[type=color] { width:34px; height:28px; padding:0; border:1px solid var(--border);
      border-radius:var(--radius-sm); background:var(--bg-tertiary); cursor:pointer; }
    .km-avatar-row .btn { padding:4px 8px; }
    .km-tilt-val { color:var(--text-tertiary); }
    .km-storage-warn { padding:6px 12px; background:#7f1d1d; color:#fecaca; font-size:var(--font-size-xs); }
    .km-storage-warn.is-fail { display:flex; gap:8px; align-items:center; justify-content:space-between; }
    .km-storage-warn.is-fail .btn { color:#fecaca; border-color:#fecaca; }
    .km-help-row { display:flex; gap:8px; align-items:baseline; padding:2px 0; }
    .km-help-how { color:var(--text-tertiary); font-size:11px; text-align:right; flex-shrink:0; max-width:58%; }
    .km-meter { height:8px; border-radius:999px; background:var(--bg-tertiary); overflow:hidden; }
    .km-meter-fill { height:100%; transition:width .2s ease; }
    /* ★ 종류 칸 — 값을 정하는 곳은 **하나**다 (TASK-KL-271 P2).
       거르는 칸이 값 칸과 같은 크기·같은 모양으로 위아래 붙어 있어서, 같은 값을 정하는 상자가
       둘로 보였다(사용자 「중복」 지적의 그 자리). 거르는 칸은 이름표 줄로 올려 **작게** 붙이고,
       값 칸만 아래 한 줄로 남긴다 — 27가지 6묶음이라 거르는 일 자체는 여전히 필요하다. */
    .km-kindrow { display:flex; align-items:baseline; gap:6px; }
    .km-kindrow label { flex:1; min-width:0; }
    .km-field input.km-kind-find { width:auto; flex:0 0 124px; font-size:11px; padding:2px 9px;
      background:var(--bg-tertiary); border:1px solid var(--border); border-radius:999px;
      text-overflow:ellipsis; }
    .km-field input.km-kind-find:focus { border-color:var(--accent); }
    .km-h4btn { float:right; padding:2px 8px; font-size:11px; }
    .km-table { display:flex; flex-direction:column; gap:3px; max-height:220px; overflow-y:auto; }
    .km-trow { display:flex; gap:4px; align-items:center; }
    .km-trow input[type=text] { flex:1; min-width:0; font-size:11px; }
    .km-tcell { font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:72px; }
    .km-tdim { color:var(--text-tertiary); }
    .km-trow .btn { padding:2px 6px; }
    /* ★ 옆 패널 버튼은 **글자를 안 접는다**. 줄 안에서 버튼이 마지막이라 flex 가 여기부터 깎았고,
       그 결과 「추가」가 「추 / 가」로, 「남기기」가 「남기 / 기」로 세로로 쪼개져 찍혔다
       (실측 2026-08-12, 노드 패널). 좁으면 입력칸이 줄어야지 버튼 글자가 접혀선 안 된다. */
    .km-side .btn { white-space:nowrap; flex:0 0 auto; }
    /* 나란히 놓기 줄 — 아이콘 단추 여덟 개가 한 줄에 선다. 손가락 화면에서도 44px 규격을 탄다. */
    .km-alignbar { display:flex; align-items:center; gap:3px; flex-wrap:wrap; }
    .km-alignbar .btn { padding:4px 8px; font-size:14px; line-height:1.1; }
    .km-tagbar { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
    .km-tagchip { padding:2px 8px; font-size:11px; border-radius:999px; }
    .km-link-row { display:flex; gap:6px; align-items:center; margin-bottom:4px; }
    .km-link-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      color:var(--text-primary); }
    .km-link-row .btn { padding:3px 8px; font-size:11px; }
    .km-textarea { width:100%; background:var(--bg-tertiary); border:1px solid var(--border);
      color:var(--text-primary); border-radius:var(--radius-sm); padding:8px; font-size:12px;
      font-family:var(--font-mono, ui-monospace, monospace); line-height:1.6; resize:vertical; margin-bottom:10px; }
    .km-more { position:relative; }
    /* 이름표로 묶고 나니 세로가 1020px 까지 자랐다 — 창보다 길면 아래쪽 항목은 **없는 것**이 된다.
       메뉴답게 제 안에서 구른다(툴바와 달리 여기는 스크롤이 맞다). 폭도 조금 넓혀 줄바꿈을 줄인다. */
    .km-drawer { position:absolute; right:0; top:calc(100% + 6px); z-index:20; min-width:212px;
      display:flex; flex-direction:column; gap:3px; padding:8px; border:1px solid var(--border);
      border-radius:10px; background:var(--bg-secondary); box-shadow:0 12px 32px rgba(0,0,0,.4);
      max-height:calc(100dvh - 170px); overflow-y:auto; overscroll-behavior:contain; }
    .km-drawer.hidden { display:none; }
    /* 폰에서 툴바가 접은 것들의 대체 문. 데스크톱에서는 툴바에 그대로 있으므로 **안 보인다**
       (보이면 같은 일에 문이 둘이 된다 — 이 작업이 없애려는 바로 그것). */
    .km-drawer .km-phone-only { display:none; }
    @media (max-width: 720px) {
      /* ★ 폰에서는 **시점 줄이 판 위**로 간다 (2026-08-14 실측). 아래에 두면 ① 배율과 겹치고
         (390px 폭에 둘을 나란히 못 놓는다) ② 아래 시트가 올라오면 그 뒤에 가려 아예 안 보인다.
         위쪽은 툴바 바로 밑이라 시트와 안 다툰다. */
      .km-times { top:8px; bottom:auto; left:8px; right:8px; max-width:none; } .km-drawer .km-phone-only { display:flex; }
      /* ★ 서랍은 폰에서 **아래 시트보다 위**여야 한다 (실측 2026-08-14: z-index 20 이라 시트(960)가
         덮었다 — 28개 명령 중 여덟이 짚으면 시트 단추가 잡혔고, 셋은 아예 화면 밖으로 나갔다.
         서랍은 폰에서 「접은 것들에 닿는 유일한 문」인데 그 문의 절반이 죽어 있었던 셈이다).
         화면에 맞춰 키를 자르고 제 안에서 구르게 한다 — 밖으로 흘러나가면 못 닿는다. */
      /* ⚠ 서랍만 z-index 를 올려서는 안 통한다 — 서랍은 툴바 **안**에 살고, 툴바가 제 쌓임
         맥락(position:relative + z-index:5)을 만들기 때문에 자식은 그 5 를 넘어설 수 없다.
         그래서 **툴바째** 올린다(툴바는 맨 위에 있어 시트와 겹치지 않는다 — 겹치는 건 서랍뿐). */
      .km-toolbar { z-index:971; }
      /* 폰에서 서랍은 **화면에 붙인다**(fixed). 툴바 안에 매달아 두면 ① 툴바의 옆 스크롤
         (overflow-x:auto)에 잘리고 ② 뜨는 자리에 따라 아래가 화면 밖으로 흘러 못 닿는다
         (실측 2026-08-14: 다섯 개가 화면 밖, 여덟 개가 시트 밑). 아래에 붙여 손이 닿는 자리로. */
      .km-drawer { position:fixed; left:8px; right:8px; bottom:8px; top:auto; min-width:0;
        max-height:70dvh; overflow-y:auto; } }
    /* 자주 안 쓰는 명령은 서랍에서 접는다 — 목록에서 사라지는 게 아니라 이름으로 부른다(Ctrl+K). */
    .km-drawer .km-cmd-rare { display:none; }
    /* ── 명령 팔레트 (TASK-KL-271 R3) ── 화면 한가운데 뜨는 한 칸. 치면 좁혀지고 Enter 로 실행. */
    /* ★ 팔레트는 **모두의 위**다 (z-index 972). 40 이던 동안 폰에서는 아래 시트(960)가 결과
       목록을 덮어, 칸에 글자는 쳐지는데 **고를 수가 없었다**(실측 2026-08-14: 보이는 아홉 중
       여섯이 시트 단추에 잡혔다 — 자판 Enter 를 아는 사람만 쓸 수 있었던 셈). */
    .km-pal { position:absolute; inset:0; z-index:972; display:flex; justify-content:center;
      align-items:flex-start; padding-top:12vh; background:rgba(0,0,0,.45); }
    .km-pal.hidden { display:none; }
    .km-pal-box { width:min(420px, 92%); max-height:60vh; display:flex; flex-direction:column;
      background:var(--bg-secondary); border:1px solid var(--border); border-radius:12px;
      box-shadow:0 18px 48px rgba(0,0,0,.5); overflow:hidden; }
    .km-pal-box input { border:none; border-bottom:1px solid var(--border); border-radius:0;
      padding:12px 14px; font-size:14px; background:transparent; }
    .km-pal-list { overflow-y:auto; padding:6px; display:flex; flex-direction:column; gap:2px; }
    .km-pal-list button { text-align:left; justify-content:flex-start; padding:7px 10px; }
    .km-pal-list button.is-on { background:var(--bg-tertiary); }
    .km-pal-g { font-size:10px; letter-spacing:.06em; color:var(--text-tertiary);
      text-transform:uppercase; margin:6px 2px 1px; }
    .km-pal-none { padding:14px; color:var(--text-tertiary); font-size:12px; }
    /* ★ 구를 수 있다는 **표시**가 없었다 (TASK-KL-271). 972px 중 728px 만 보이는데 손잡이가
       안 보여서, 잘려 있는 줄 알고 아래쪽 항목을 아예 없는 것으로 여긴다 — 실측 후 확인. */
    .km-drawer { scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
    .km-drawer::-webkit-scrollbar { width:8px; }
    .km-drawer::-webkit-scrollbar-thumb { background:var(--border); border-radius:99px;
      border:2px solid transparent; background-clip:content-box; }
    .km-drawer label { display:flex; flex-direction:column; gap:4px; font-size:11px; color:var(--text-secondary); }
    /* 이름표 — 묶음의 머리. 얇고 작게, 대신 위에 숨 쉴 자리를 준다. */
    .km-drawer-h { font-size:10px; letter-spacing:.06em; color:var(--text-tertiary);
      margin:6px 2px 1px; text-transform:uppercase; }
    .km-drawer-h:first-child { margin-top:0; }
    /* 메뉴는 **왼쪽 정렬**이다. 가운데 정렬이면 눈이 매 줄 시작점을 새로 찾는다. */
    .km-drawer .btn { justify-content:flex-start; text-align:left; padding:5px 8px; }
    .km-drawer hr { border:none; border-top:1px solid var(--border); margin:4px 0; }
    .km-check { display:flex; align-items:center; gap:6px; padding:2px 0; color:var(--text-primary); cursor:pointer; }
    .km-check input { width:auto; }
    .km-swatch { width:10px; height:10px; border-radius:2px; flex-shrink:0; }
    .km-side input[type=range] { width:100%; }
    .km-empty [data-km="sample"] { pointer-events:auto; margin:3px; }
    /* ★ 안내 글은 **반드시 블록 하나로 감싼다**. flex 컨테이너에 글·<b>·<br>·버튼을 그대로 두면
       조각 하나하나가 flex 아이템이 되어 세로로 한 글자씩 쪼개진다 — 실서비스 첫 화면이 그랬다. */
    /* 안내는 **위쪽에** 앉힌다. 한가운데 두면 「빈 곳 두 번 클릭」이 카드에 먹혀
       처음 여는 사람이 첫 동작부터 막힌다(검사가 실제로 그렇게 걸렸다). */
    .km-empty { position:absolute; inset:0; display:flex; align-items:flex-start; justify-content:center;
      pointer-events:none; padding:20px 24px 24px; }
    /* 첫 30초 — 「무엇을 만들 건가요」 세 갈래. 기능 60개를 평평하게 늘어놓는 대신
       *들어오는 문 세 개*를 크게 연다. 고르면 그 갈래의 견본·종류·칸 틀이 한꺼번에 깔린다. */
    .km-intent { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin:14px 0 6px; }
    .km-intent button { pointer-events:auto; flex:1 1 120px; min-width:110px; padding:10px 8px; border-radius:12px;
      border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary);
      display:flex; flex-direction:column; gap:4px; align-items:center; cursor:pointer; text-align:center; }
    .km-intent button:hover { border-color:var(--accent); transform:translateY(-2px); }
    .km-intent .km-intent-ico { font-size:26px; line-height:1.1; }
    .km-intent .km-intent-t { font-weight:600; font-size:13px; }
    .km-intent .km-intent-s { font-size:11px; color:var(--text-tertiary); line-height:1.4; }
    .km-empty-more { pointer-events:auto; }
    /* 다음 걸음 한 줄 — 판 아래 가운데. **누르는 것을 가리면 안 된다**(pointer-events:none). */
    .km-next { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); pointer-events:none;
      max-width:min(560px, 88%); text-align:center; padding:6px 12px; border-radius:999px;
      background:var(--bg-secondary); border:1px solid var(--border); color:var(--text-secondary);
      font-size:11px; opacity:.92; z-index:3; }
    .km-empty-in { max-width:min(760px, 100%); color:var(--text-tertiary); font-size:var(--font-size-sm);
      text-align:center; line-height:1.7; }
    /* 👁 보기 전용 — 편집 손잡이를 **아예 없앤다**. 「고쳐도 원본은 안 바뀝니다」를 글로 설명하는 것보다
       손잡이가 안 보이는 편이 헷갈림이 적다. 보는 일(끌기·확대·발표·내보내기)은 그대로 된다. */
    .km-root.is-readonly [data-km="add"],
    .km-root.is-readonly [data-km="undo"],
    .km-root.is-readonly [data-km="redo"],
    .km-root.is-readonly [data-km="map-new"],
    .km-root.is-readonly .km-mini { display:none !important; }
    /* 옆 패널은 **남긴다** — 통째로 숨기면 탭까지 사라져 「저장·발표·관계망 읽기」 같은
       보는 일까지 못 하게 된다. 손잡이는 CSS 가 아니라 캔버스가 아예 안 만든다. */
    .km-root.is-readonly .km-viewbadge { position:absolute; left:12px; top:12px; z-index:16;
      display:flex; gap:8px; align-items:center; padding:6px 10px; border-radius:999px;
      background:var(--bg-secondary); border:1px solid var(--border); font-size:12px; }
    /* 저장 표시 — 조용히 왔다 사라진다. 늘 떠 있으면 그것대로 잔소리가 된다. */
    .km-saved { position:absolute; left:16px; bottom:16px; z-index:16; font-size:11px;
      color:var(--text-secondary); padding:3px 9px; border-radius:999px; pointer-events:none;
      background:var(--bg-secondary); border:1px solid var(--border); opacity:.94; }
    .km-saved.hidden { display:none; }
    .km-root.is-presenting .km-saved { display:none; }
    /* 카드 위에 그 자리에서 뜨는 이름 칸 (TASK-KL-235). 카드와 **같은 크기·같은 글자**로 떠야
       「고치는 중」이 딴 창처럼 안 보인다. 판이 움직이면 닫는다 — 떠 있는 채 어긋나면 더 나쁘다. */
    .km-inline { position:absolute; z-index:20; box-sizing:border-box; font-weight:600;
      background:var(--bg-secondary); color:var(--text-primary); border:2px solid var(--accent);
      border-radius:8px; padding:2px 8px; outline:none; }
    .km-linking { outline:2px dashed var(--accent); outline-offset:-2px; }
    /* 발표 모드 — 그림을 가리지 않게 아래에만 얹는다. */
    /* ★ 발표 줄은 **판 위에 떠야 한다.** z-index 를 안 주면(auto) 캔버스 svg 가 그 위에 깔려
       「한 장으로 담기」·「다음」·「나가기」가 **마우스로 안 눌렸다** — 실측 2026-08-12: 단추
       한가운데를 찍으면 svg 가 잡혔다. 화면 검사는 hit-test 를 건너뛰는 방식(dispatchEvent)이라
       여태 초록이었다. 앱의 떠 있는 것들(채팅 알약 z=940)보다도 위여야 한다 —
       발표 중에는 이 줄이 화면의 주인이다. 바탕은 여전히 pointer-events:none 이라 그림은 그대로 끌린다. */
    .km-stage { position:absolute; left:0; right:0; bottom:0; z-index:950; padding:14px 16px;
      background:linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0));
      display:flex; flex-direction:column; gap:6px; pointer-events:none; }
    .km-stage.hidden { display:none; }
    .km-stage-strip { display:flex; flex-wrap:wrap; gap:4px; pointer-events:auto; margin-bottom:2px; }
    .km-chip { padding:2px 8px; font-size:11px; border-radius:999px; color:rgba(255,255,255,.8);
      background:rgba(255,255,255,.08); }
    .km-chip.is-on { background:rgba(255,255,255,.28); color:#fff; }
    .km-stage-title { font-size:var(--font-size-lg); font-weight:700; color:#fff; }
    .km-stage-note { font-size:var(--font-size-sm); color:rgba(255,255,255,.82); }
    /* 조작 단추는 **오른쪽**에 모은다. 왼쪽 아래는 앱의 채팅 알약 자리라 「이전」이 그 밑에
       깔려 안 눌렸다(실측 2026-08-12). 그 알약은 페이지 층에 떠 있어 z-index 로는 못 이긴다. */
    .km-stage-bar { display:flex; gap:6px; align-items:center; justify-content:flex-end;
      margin-top:4px; pointer-events:auto; flex-wrap:wrap; }
    .km-stage-bar span { color:rgba(255,255,255,.7); font-size:var(--font-size-xs); min-width:48px; text-align:center; }
    /* 장을 담을 때 쓰는 **판 위 작은 폼** (TASK-KL-271 O5·후속). 예전엔 브라우저 prompt 를
       두 번 띄웠는데, 첫 칸에서 취소하면 아무 말 없이 사라지고 폰에서는 시스템 대화상자가
       화면을 통째로 덮었다 — 발표 중에 도구가 화면을 뺏는 것은 그 자체로 사고다. */
    .km-stage-form { display:flex; gap:6px; align-items:center; pointer-events:auto; flex-wrap:wrap;
      margin-top:4px; }
    .km-stage-form.hidden { display:none; }
    .km-stage-form input { flex:1 1 180px; min-width:120px; padding:6px 10px; border-radius:8px;
      border:1px solid rgba(255,255,255,.24); background:rgba(0,0,0,.45); color:#fff; }
    .km-stage-form input::placeholder { color:rgba(255,255,255,.45); }
    .km-root.is-presenting .km-toolbar,
    .km-root.is-presenting .km-side { display:none; }
    /* 좁은 화면 — 옆에 붙던 편집 패널을 아래로 내린다. 레퍼런스들은 여기서 기능을 지웠지만
       여기선 배치만 바꾼다(묶음·선 편집 전부 그대로 쓴다). */
    @media (max-width: 720px) {
      .km-body { flex-direction:column; position:relative; }
      /* 폰에서 위젯 몸통이 **화면보다 길면** 접힌 시트가 화면 밖으로 나간다(스크롤해야 손잡이가 보인다).
         그래서 남은 화면에 맞춘다 — 「--km-top」 은 위젯이 페이지에서 얼마나 내려와 있는지(JS 가 잰다),
         「dvh」 는 주소창이 접히고 펴지는 만큼까지 따라가는 단위다(「vh」 는 안 따라간다). */
      .km-root { height:calc(100dvh - var(--km-top, 160px) - 8px); min-height:340px; }
      /* 폰에서는 캔버스가 **높이를 뺏기면 안 된다** — 옆 패널을 아래에 쌓으면 그림이 손바닥만 해진다.
         그래서 패널을 캔버스 위에 얹는 **시트**로 만든다(기본은 접힘, 손잡이로 올린다). */
      .km-canvas { min-height:0; height:100%; }
      /* ★ 시트 높이는 **화면**이 아니라 **위젯** 기준이다. 64vh 로 두면 위젯이 화면보다
         짧을 때(폰에서 늘 그렇다 — 위에 머리말·탭이 있다) 시트가 위젯보다 커져 캔버스를
         통째로 덮는다. 실측 2026-08-12: 카드를 고르면 그림이 한 조각도 안 보였다.
         위젯 몸통의 60% — 그림이 최소 40% 는 남는다. */
      /* ★ 폰에서 시트는 앱의 떠 있는 것들(채팅 알약 등)보다 **위**여야 한다. 아래에 두었더니
         시트 안 첫 줄 단추가 채팅 알약에 가려 안 눌렸다(실측 2026-08-12, 갈래 고르기). */
      .km-side { position:absolute; left:0; right:0; bottom:0; width:auto; z-index:960;
        max-height:60%; border-left:none; border-top:1px solid var(--border);
        border-radius:14px 14px 0 0; box-shadow:0 -8px 24px rgba(0,0,0,.35);
        /* 접혔을 때 내다보이는 만큼 = **손잡이 높이 그대로**. 손잡이만 키우면 그 아래가 화면 밖으로 나가 안 눌린다. */
        transform:translateY(calc(100% - 44px)); transition:transform .18s ease; padding-top:44px; }
      .km-root.is-sheet-up .km-side { transform:translateY(0); }
      /* ★ 말 상자·되물음·링크 상자는 **아래 시트 위쪽 절반**(그림 자리)에 붙인다.
         예전엔 시트와 같은 층(960)에 아래쪽으로 두어, 폰에서 시트가 상자를 통째로 덮었다 —
         「지울래요」가 화면에 있는데 눌러지지 않았다(실측 2026-08-14: 손가락이 시트 단추에 닿았다).
         시점 줄(top:8px) 밑에 놓고, 좁은 화면이니 가로를 다 쓴다. */
      .km-note, .km-linkbox { left:8px; right:8px; top:56px; bottom:auto; transform:none;
        max-width:none; flex-wrap:wrap; }
      /* ★ 줌 줄은 **접힌 시트 위**로 올린다. 아래(bottom:14px)에 두었더니 폰에서 손잡이 밑에
         깔려 세 단추가 통째로 안 눌렸다(실측 2026-08-14: 짚으면 시트가 잡혔다 — 폰에서 확대·축소
         단추가 죽어 있었던 셈이다. 두 손가락 벌리기는 되지만, 그걸 아는 사람만 쓴다).
         시트를 올리면 화면의 주인은 시트다 — 그때는 **감춘다**(가려진 채 살아 있는 척하지 않는다). */
      .km-zoom { bottom:56px; }
      .km-root.is-sheet-up .km-zoom { display:none; }
      /* ★ 손가락 규격(44) — 폰에서 시점 줄 단추 다섯과 「다른 목록」이 24~38px 이었다
         (실측 2026-08-14). 좁아서 옆 것이 눌리면 시점이 엉뚱하게 바뀐다. 시점이 많아지면
         줄이 넘치므로 **옆으로 굴러가게** 둔다(줄바꿈하면 판을 그만큼 가린다). */
      .km-times { overflow-x:auto; scrollbar-width:none; }
      .km-times::-webkit-scrollbar { display:none; }
      .km-times .btn { min-width:44px; min-height:44px; padding:3px 12px; }
      .km-times input { min-height:44px; }
      .km-tabs-more { min-width:44px; min-height:44px; }
      /* 손잡이 — 폰에서 시트를 올리고 내리는 유일한 자리라 **크게**(44px 규격) 잡는다. */
      /* ★ 손잡이는 **가운데 120px 만** 차지한다. 예전엔 가로 전체를 덮어서, 시트가 올라온 순간
         맨 윗줄 단추들이 손잡이 밑에 깔려 **눌리지 않았다**(실측 2026-08-12: 갈래 고르기 단추가
         손잡이에 가로채였다). 손가락 규격(120×44)은 그대로 지키면서 양옆을 비워 준다. */
      .km-sheet-grip { position:absolute; left:50%; transform:translateX(-50%); top:0;
        width:120px; height:44px; display:flex; align-items:center; justify-content:center; cursor:grab; }
      .km-sheet-grip::before { content:''; width:44px; height:4px; border-radius:999px; background:var(--border); }
      /* 폰에서 툴바가 **줄바꿈으로 부풀면** 그림이 그만큼 밀려난다(실측: 화면 절반을 먹었다).
         한 줄로 눕히고 옆으로 밀어 쓰게 한다 — 세로 공간이 폰에서 가장 비싼 자원이다. */
      .km-toolbar { gap:6px; padding:8px; flex-wrap:nowrap; overflow-x:auto; overflow-y:hidden;
        scrollbar-width:none; -webkit-overflow-scrolling:touch; }
      .km-toolbar::-webkit-scrollbar { display:none; }
      /* ★ 옆으로 밀리는데 **밀린다는 표시가 없었다** — 스크롤막대를 감췄으니(폰에서는 원래 안 보인다)
         오른쪽 끝을 흐리게 해서 「더 있다」를 눈에 보이게 한다. 끝까지 밀면 흐림도 사라진다. */
      .km-toolbar.km-more-right { -webkit-mask-image:linear-gradient(to right, #000 88%, transparent);
        mask-image:linear-gradient(to right, #000 88%, transparent); }
      .km-toolbar > * { flex:0 0 auto; }
      .km-toolbar input[type=text] { min-width:110px; }
      .km-toolbar .btn { padding:6px 10px; }
      /* ★ 폰에서는 툴바가 **반이 화면 밖**이었다 (실측: 필요한 폭 656px / 보이는 폭 358px).
         가로로 밀어야 닿는 손잡이는 없는 것과 같다 — 자주 안 쓰는 넷은 ⋯ 안으로 접고,
         그 자리를 ⋯ 서랍이 대신 연다(손잡이는 그대로, 문만 옮긴다). */
      /* 찾기 칸이 폰 툴바의 절반을 먹고 있었다(176px / 358px 중). 눌러서 쓸 때만 넓어지면 된다. */
      .km-toolbar input[data-km="find"] { min-width:0; flex:1 1 72px; max-width:96px; }
      .km-toolbar input[data-km="find"]:focus { max-width:none; flex:1 1 160px; }
      /* 판 이름은 폰에서 **짧게**. 이름이 길면 그것 하나가 툴바의 절반을 먹는다(실측 456px 중). */
      .km-toolbar select[data-km="maps"] { max-width:104px; }
      .km-toolbar [data-km="map-up"],
      .km-toolbar [data-km="map-new"],
      .km-toolbar [data-km="fit"],
      .km-toolbar [data-km="story"] { display:none; }
    }
    /* 손가락에는 손가락 크기를 준다 (TASK-KL-202 방향④).
       실측: 폰에서 툴바 아이콘이 34×30px 이었다 — 애플 44pt · 머티리얼 48dp 권장의 절반 남짓이라
       ↶ 를 누르려다 ↷ 가 눌린다. 마우스가 있는 화면은 그대로 둔다(커서는 1px 도 정확하다). */
    @media (pointer: coarse) {
      .km-toolbar .btn, .km-mini .btn, .km-sheet .btn { min-height:44px; min-width:44px; }
      .km-toolbar select, .km-toolbar input[type=text] { min-height:44px; }
      /* ★ **크기만으로는 모자란다 — 사이도 벌린다.** 작은 도구 줄의 세 단추가 2px 간격이었다
         (실측 2026-08-14). 그 줄의 끝은 🗑 라, 손가락이 조금 미끄러지면 복제하려다 **지운다**.
         손가락 규격 권고는 8px 이상 — 넉넉히 10px 로 벌리고, 지우기만 한 칸 더 띄운다. */
      .km-mini { gap:10px; padding:6px; }
      .km-mini [data-km="mini-del"] { margin-left:10px; }
    }
    `;
;

  function buildKarmoGraph(container: HTMLElement): void {
    // 맵 여러 장 — 목록은 항상 최소 한 장을 보장한다(격차 H).
    let library: LibraryIndex = loadLibrary();
    let store = new KarmoGraphLocalStorageAdapter(mapKey(library.activeId));
    store.onWriteError = () => warnSaveFailed();
      store.onForeignWrite = () => warnOtherTab();

    let spec: GraphSpec = emptyGraphSpec();
    let canvas: GraphCanvas | null = null;
    let selectedId: string | null = null;
    /** 연결 모드일 때 출발 노드 id. null 이면 평소 모드. */
    let linkingFrom: string | null = null;
    /** 오른쪽 패널이 무엇을 보여주는가 — 고른 노드냐, 묶음 목록이냐. */
    type SideMode = 'node' | 'groups' | 'terms' | 'filter' | 'many' | 'text' | 'sna' | 'storage' | 'notes' | 'stamps' | 'edge' | 'table' | 'help';
    let sideMode: SideMode = 'node';
    /* 옆 패널의 「더 적기」가 펼쳐져 있나 — 카드마다가 아니라 **판 전체로 하나**다.
       카드를 옮겨 다닐 때마다 다시 펼치게 하면, 자세히 적는 사람에게는 그게 더 큰 짐이다. */
    let moreOpen = false;
    /** Shift+드래그로 한 번에 고른 노드들. */
    let selectedMany: string[] = [];
    /** 지금 고른 선. 선에도 이야기가 붙는다(격차 Z). */
    /** 되돌리기 스택 이름이 `history` 라 브라우저 것과 겹친다 — 별칭으로 갈라 둔다. */
    // 자료 층이 쓰는 몇 마디를 **제 나라 말로** 얹는다 (KL-271) — 없으면 글 속에 영어가 남는다.
    setNoteWords({
      loop: t('karmograph.note.loop'),
      missing: t('karmograph.note.missing'),
      missingBlock: t('karmograph.note.missingBlock'),
    });
    const history0 = window.history;
    let selectedEdgeId: string | null = null;
    /** 화면에서 뺀 종류들 — 자료는 그대로 두고 보기만 줄인다(격차 M-3). */
    const filterState = {
      nodeKinds: new Set<string>(),
      edgeKinds: new Set<string>(),
      tags: new Set<string>(),
      hideOrphans: false,
      minDegree: 0,
      sizeByDegree: false,
      colorByTag: false,
      fieldName: '',
      fieldValue: '',
      colorByField: '',
    };
    /** 지금 끼워진 어휘 팩. `spec._meta.pack` 에 함께 저장된다. */
    let pack: CanvasPack = packById(DEFAULT_PACK_ID);
    /** 마지막에 쓴 노드 종류 — 팩을 없앤 뒤로 「기본값」은 이것이다. */
    let lastNodeKind = packById(DEFAULT_PACK_ID).nodeKinds[0].id;
    /** 사용자가 직접 만든 종류. 맵이 아니라 **사람**에게 붙는다(격차 A-2). */
    let terms: MyTerms = loadTerms();

    // 팩 + 내 용어를 합친 것이 「지금 쓸 수 있는 말」이다. 아래 조회는 전부 이걸 거친다.
    // ★ 갈래를 먼저 고르지 않는다(사용자 2026-08-09) — 쓸 수 있는 말은 **언제나 전부**다.
    //   팩은 고르는 문이 아니라 목록의 소제목일 뿐이다.
    const nodeKindsNow = (): typeof pack.nodeKinds => [...PACKS.flatMap((p0) => p0.nodeKinds), ...terms.nodeKinds];
    const edgeKindsNow = (): typeof pack.edgeKinds => [...PACKS.flatMap((p0) => p0.edgeKinds), ...terms.edgeKinds];
    /**
     * ★ **말은 언제나 글자로 돌려준다.**
     *
     * 종류가 안 적힌 카드가 있다(손으로 적은 파일·옛 판·남의 도구에서 온 것). 그때 이 함수가
     * `undefined` 를 돌려주면, 그걸 받아 글자를 다듬던 자리에서 거르기 칸이 통째로 터졌다
     * (실측 2026-08-14: 거친 판에서 거르기만 빨강). 모르면 **모른다고 적는다**.
     */
    const kindIcon = (id: string): string =>
      terms.nodeKinds.find((k) => k.id === id)?.icon ?? ALL_KIND_ICONS[id] ?? '·';
    const kindLabel = (id: string): string =>
      terms.nodeKinds.find((k) => k.id === id)?.label ?? allKindLabels()[id]
      ?? (id || t('karmograph.kind.unknown'));
    const edgeLabel = (id: string): string =>
      terms.edgeKinds.find((k) => k.id === id)?.label ?? allEdgeLabels()[id]
      ?? (id || t('karmograph.kind.unknown'));
    /** 캔버스에 넘길 색표·선 정의 — 팩 전체 + 내 용어. */
    const kindColorsNow = (): Record<string, string> => ({
      ...ALL_KIND_COLORS,
      ...Object.fromEntries(terms.nodeKinds.map((k) => [k.id, k.color])),
    });
    const edgeDefsNow = (): Record<string, EdgeKindDef> => ({
      ...ALL_EDGE_KIND_DEFS,
      ...Object.fromEntries(
        terms.edgeKinds.map((e) => [e.id, { color: e.color, style: e.style, arrow: e.arrow, width: e.width }])
      ),
    });

    /** 노드 종류 <option> — 팩에 없는 종류(다른 팩에서 넘어온 노드)도 잃지 않게 뒤에 붙인다. */
    /**
     * ⋯서랍의 차림표를 **등록부에서** 그린다 (TASK-KL-271 R4).
     * 손으로 적은 HTML 이던 시절엔 「새 자리를 만들고 옛 자리를 안 지우는」 일이 조용히 생겼다.
     */
    function drawerHtml(): string {
      /* ★ 접히는 것도 **DOM 에는 남는다** — 손잡이(onclick)가 그대로 살아 있어야 팔레트가
         그 단추를 눌러 일을 시킬 수 있다. 팔레트는 새 길을 내지 않는다(문이 또 늘면 그게 중복이다). */
      const body = COMMAND_GROUPS.map((g) => {
        const rows = g.items.map((c) => `<button class="btn ${c.danger ? 'btn-danger' : 'btn-ghost'}`
          + `${c.hot ? '' : ' km-cmd-rare'}" data-km="${c.key}">${esc(c.label())}</button>`).join('');
        const anyHot = g.items.some((c) => c.hot);
        return (anyHot ? `<div class="km-drawer-h">${esc(g.title())}</div>` : '') + rows;
      }).join('');
      const phone = [
        { key: 'map-up', label: t('karmograph.mapUp.title') },
        { key: 'map-new', label: t('karmograph.mapNew.title') },
        { key: 'fit', label: t('karmograph.fit.title') },
        { key: 'story', label: t('karmograph.story.title') },
      ].map((c) => `<button class="btn btn-ghost km-phone-only" data-km="tb-proxy"`
        + ` data-key="${c.key}">${esc(c.label)}</button>`).join('');
      return `${phone}${body}<hr /><button class="btn btn-ghost" data-km="palette-open">`
        + `${esc(t('karmograph.palette.open'))}</button>`;
    }

    function nodeKindOptions(selected?: string): string {
      // ★ 전부 보여 준다. 팩은 고르는 칸이 아니라 **소제목**일 뿐 — 한 맵에 인물도 카드도 개념도 산다.
      const groups = allNodeKindGroups();
      const known = new Set(groups.flatMap((g) => g.kinds.map((k) => k.id)));
      const mine = terms.nodeKinds;
      const opt = (k: { id: string; icon: string; label: string }): string =>
        `<option value="${k.id}"${k.id === selected ? ' selected' : ''}>${k.icon} ${k.label}</option>`;
      const parts = groups.map(
        (g) => `<optgroup label="${g.title}">${g.kinds.map(opt).join('')}</optgroup>`
      );
      if (mine.length > 0) {
        parts.push(`<optgroup label="${escapeAttr(t('karmograph.optgroup.mine'))}">${mine.map(opt).join('')}</optgroup>`);
        mine.forEach((k) => known.add(k.id));
      }
      // 어느 묶음에도 없는 종류(옛 저장본 등)는 잃지 않게 뒤에 붙인다.
      if (selected && !known.has(selected)) {
        parts.push(`<optgroup label="${escapeAttr(t('karmograph.optgroup.other'))}"><option value="${selected}" selected>${kindIcon(selected)} ${kindLabel(selected)}</option></optgroup>`);
      }
      return parts.join('');
    }

    /** 선 종류 <option> — 같은 이유로 팩 밖 종류를 보존한다. */
    function edgeKindOptions(selected?: string): string {
      const groups = allEdgeKindGroups();
      const known = new Set(groups.flatMap((g) => g.kinds.map((k) => k.id)));
      const mine = terms.edgeKinds;
      const opt = (k: { id: string; label: string }): string =>
        `<option value="${k.id}"${k.id === selected ? ' selected' : ''}>${k.label}</option>`;
      const parts = groups.map(
        (g) => `<optgroup label="${g.title}">${g.kinds.map(opt).join('')}</optgroup>`
      );
      if (mine.length > 0) {
        parts.push(`<optgroup label="${escapeAttr(t('karmograph.optgroup.mine'))}">${mine.map(opt).join('')}</optgroup>`);
        mine.forEach((k) => known.add(k.id));
      }
      if (selected && !known.has(selected)) {
        parts.push(`<optgroup label="${escapeAttr(t('karmograph.optgroup.other'))}"><option value="${selected}" selected>${edgeLabel(selected)}</option></optgroup>`);
      }
      return parts.join('');
    }

    container.innerHTML = `
      <div class="km-root">
        <div class="km-toolbar">
          <select data-km="maps" title="${esc(t('karmograph.maps.title'))}"></select>
          <!-- 이름은 **그 자리에서** 고친다 (KL-271) — 고르개가 잠깐 입력칸이 된다.
               브라우저 prompt 는 판을 통째로 가리고, 폰에서는 화면을 덮는다. -->
          <input class="hidden" data-km="map-name" aria-label="${esc(t('karmograph.mapRename2.title'))}" />
          <!-- 판 이름을 바꾸는 자리가 ⋯ 서랍 안에만 있었다 — **이름 옆**이 그 자리다 (2026-08-12 검토). -->
          <button class="btn btn-ghost" data-km="map-rename2" title="${esc(t('karmograph.mapRename2.title'))}"
            aria-label="${esc(t('karmograph.mapRename2.title'))}">✎</button>
          <button class="btn btn-ghost hidden" data-km="map-up" title="${esc(t('karmograph.mapUp.title'))}">↑<span
            class="km-btn-name">${esc(t('karmograph.btn.up'))}</span></button>
          <!-- 시작 갈래(작품 관계도·내 세계관·개념 설명)로 **돌아가는 유일한 길**이 이 단추다
               (빈 판에서만 그 고르개가 뜬다). 이름이 없으면 그 길이 안 보인다 — 2026-08-12 검토. -->
          <button class="btn btn-ghost" data-km="map-new" title="${esc(t('karmograph.mapNew.title'))}">+<span
            class="km-btn-name">${esc(t('karmograph.btn.newMap'))}</span></button>
          <span class="km-sep"></span>
          <input type="text" data-km="find" placeholder="${esc(t('karmograph.find.ph'))}" />
          <span class="km-findcount hidden" data-km="find-count" title="${esc(t('karmograph.find.countTitle'))}"></span>
          <button class="btn btn-ghost" data-km="undo" title="${esc(t('karmograph.undo.title'))}" disabled>↶</button>
          <button class="btn btn-ghost" data-km="redo" title="${esc(t('karmograph.redo.title'))}" disabled>↷</button>
          <!-- ★ 이 둘은 **이 도구에만 있는 기능**이라 그림만으로는 아무도 못 맞힌다
               (2026-08-12 사용자 검토: ⤢ ▶ 가 무엇인지 화면에서 알 길이 없었다).
               되돌리기 ↶ ↷ 는 어디서나 같은 그림이라 그대로 둔다 — 이름을 다 달면 그것대로 줄이 길어진다. -->
          <button class="btn btn-ghost" data-km="fit" title="${esc(t('karmograph.fit.title'))}">⤢<span
            class="km-btn-name">${esc(t('karmograph.btn.fit'))}</span></button>
          <button class="btn btn-ghost" data-km="story" title="${esc(t('karmograph.story.title'))}">▶<span
            class="km-btn-name">${esc(t('karmograph.btn.story'))}</span></button>
          <div class="km-more">
            <button class="btn btn-ghost" data-km="more" title="${esc(t('karmograph.more.title'))}">⋯</button>
            <!-- ★ 20개를 한 줄기로 늘어놓으면 **찾는 데가 아니라 훑는 데**가 된다(높이 845px 였다).
                 하는 일끼리 묶고 이름표를 단다 — 왼쪽 정렬이라 눈이 한 줄로 내려간다. -->
            <div class="km-drawer hidden" data-km="drawer">
              <div class="km-drawer-h">${esc(t('karmograph.drawer.g.view'))}</div>
              <label>${esc(t('karmograph.parts.msg2'))}
                <select data-km="bg">
                  <option value="dots">${esc(t('karmograph.opt.dots'))}</option>
                  <option value="grid">${esc(t('karmograph.opt.grid'))}</option>
                  <option value="cross">${esc(t('karmograph.opt.cross'))}</option>
                  <option value="none">${esc(t('karmograph.opt.none'))}</option>
                </select>
              </label>
              ${drawerHtml()}
            </div>
          </div>
          <input type="file" accept="application/json,.json" data-km="file" hidden />
          <input type="file" accept="image/*" data-km="img" hidden />
          <input type="file" accept="application/json,.json" data-km="restore-file" hidden />
        </div>
        <div class="km-body">
          <div class="km-canvas" data-km="canvas">
            <div class="km-mini hidden" data-km="mini">
              <button class="btn btn-ghost" data-km="mini-note" title="${esc(t('karmograph.miniNote.title'))}">🗒</button>
              <button class="btn btn-ghost" data-km="mini-copy" title="${esc(t('karmograph.miniCopy.title'))}">⧉</button>
              <button class="btn btn-ghost" data-km="mini-del" title="${esc(t('karmograph.miniDel.title'))}">🗑</button>
            </div>
            <!-- ★ **시점 줄** (TASK-KL-271 X2). 시점을 안 쓰는 판에는 **아예 안 뜬다** —
                 안 쓰는 사람에게 자리를 뺏는 순간 이 도구가 없애려던 그것이 된다. -->
            <div class="km-times hidden" data-km="times"></div>
            <!-- 시점 만들기는 **명령 팔레트·서랍**에서 부른다(툴바에 문을 또 내지 않는다). -->
            <button class="btn btn-ghost hidden" data-km="time-add" aria-hidden="true" tabindex="-1"></button>
            <!-- 영상 굽기도 마찬가지 — 자주 쓰는 일이 아니라 툴바에 자리를 안 준다. -->
            <button class="btn btn-ghost hidden" data-km="film" aria-hidden="true" tabindex="-1"></button>
            <div class="km-zoom" data-km="zoom">
              <button class="btn btn-ghost" data-km="zoom-out" title="${esc(t('karmograph.zoom.out'))}">−</button>
              <button class="btn btn-ghost km-zoom-val" data-km="zoom-val" title="${esc(t('karmograph.zoom.reset'))}">100%</button>
              <button class="btn btn-ghost" data-km="zoom-in" title="${esc(t('karmograph.zoom.in'))}">+</button>
            </div>
            <!-- ★ 저장 표시는 **툴바 밖**에 산다 (TASK-KL-271 F3). 툴바 흐름 안에 있던 동안엔
                 뜰 때마다 오른쪽 것들을 밀어서 「+ 새 판」이 208px → 318px 로 움직였다(실측).
                 눌리는 자리가 스스로 움직이면 손이 헛간다 — 판 위 제 자리에서 왔다 사라진다. -->
            <span class="km-saved hidden" data-km="saved" title="${esc(t('karmograph.saved.title'))}">${esc(t('karmograph.savedHere'))}</span>
            <div class="km-stage hidden" data-km="stage">
              <div class="km-stage-strip" data-km="stage-strip"></div>
              <div class="km-stage-title" data-km="stage-title"></div>
              <div class="km-stage-note" data-km="stage-note"></div>
              <div class="km-stage-form hidden" data-km="stage-form">
                <input data-km="stage-f-title" placeholder="${esc(t('karmograph.stageForm.title'))}" />
                <input data-km="stage-f-note" placeholder="${esc(t('karmograph.stageForm.note'))}" />
                <button class="btn btn-ghost" data-km="stage-save">${esc(t('karmograph.stageForm.save'))}</button>
                <button class="btn btn-ghost" data-km="stage-cancel">${esc(t('karmograph.stageForm.cancel'))}</button>
              </div>
              <div class="km-stage-bar">
                <button class="btn btn-ghost" data-km="stage-prev">◀</button>
                <span data-km="stage-count"></span>
                <button class="btn btn-ghost" data-km="stage-next">▶</button>
                <button class="btn btn-ghost" data-km="stage-auto" title="${esc(t('karmograph.stageAuto.title'))}">${esc(t('karmograph.stageAuto.label'))}</button>
                <button class="btn btn-ghost" data-km="stage-add">${esc(t('karmograph.stageAdd.label'))}</button>
                <button class="btn btn-ghost" data-km="stage-back" title="${esc(t('karmograph.stageBack.title'))}">↤</button>
                <button class="btn btn-ghost" data-km="stage-fwd" title="${esc(t('karmograph.stageFwd.title'))}">↦</button>
                <button class="btn btn-ghost" data-km="stage-rename" title="${esc(t('karmograph.stageRename.title'))}">✎</button>
                <button class="btn btn-ghost" data-km="stage-del">${esc(t('karmograph.stageDel.label'))}</button>
                <button class="btn btn-ghost" data-km="stage-exit">${esc(t('karmograph.stageExit.label'))}</button>
              </div>
            </div>
          </div>
          <div class="km-side hidden" data-km="side"></div>
          <div class="km-pal hidden" data-km="pal">
            <div class="km-pal-box">
              <input type="text" data-km="pal-find" aria-label="${esc(t('karmograph.palette.find'))}"
                placeholder="${esc(t('karmograph.palette.find'))}" />
              <div class="km-pal-list" data-km="pal-list" role="listbox"></div>
            </div>
          </div>
        </div>
      </div>`;

    const root = container.querySelector('.km-root') as HTMLElement;
    const q = <T extends HTMLElement>(name: string): T => root.querySelector(`[data-km="${name}"]`) as T;

    /**
     * 그림 하나만 있는 단추에 **읽어 줄 이름**을 붙인다.
     *
     * 툴바·서랍의 단추 30여 개가 「↶」 「⤢」 「🗑」 처럼 글자 하나뿐이라, 화면을 읽어 주는
     * 프로그램은 그 기호 이름(「위로 굽은 화살표」)만 읽어 준다 — 무슨 단추인지 알 수 없다.
     * 이름은 이미 `title` 에 번역돼 들어 있으므로 그대로 옮긴다. 단추마다 손으로 적지 않는 이유:
     * 새 단추가 생길 때마다 빠뜨리기 때문이다. 여기 한 줄이 그릴 때마다 전부 훑는다.
     */
    const nameIconButtons = (scope: ParentNode): void => {
      for (const el of scope.querySelectorAll<HTMLElement>('[title]')) {
        if (el.getAttribute('aria-label')) continue;
        const label = (el.textContent ?? '').trim();
        // 글자로 된 이름이 이미 보이면 그것이 곧 이름이다 — 덧붙이면 두 번 읽힌다.
        if (label.length > 2) continue;
        el.setAttribute('aria-label', el.getAttribute('title') ?? '');
      }
    };
    nameIconButtons(root);

    const canvasEl = q<HTMLElement>('canvas');
    const sideEl = q<HTMLElement>('side');

    /**
     * 폰에서 옆 패널은 **아래에서 올라오는 시트**다(캔버스가 높이를 안 뺏기게). 손잡이를 하나 얹고,
     * 노드를 고르면 저절로 올라온다 — 고른 뒤 「어디서 고치지?」를 한 번 더 찾게 하면 안 된다.
     */
    // ★ 패널은 그릴 때마다 `innerHTML` 을 통째로 갈아 끼운다 — 손잡이를 한 번만 붙이면
    //   첫 렌더에서 사라진다(실제로 그렇게 없어졌다). 그래서 **매번 다시 얹는다**.
    function ensureSheetGrip(): void {
      if (sideEl.querySelector('[data-km="sheet-grip"]')) return;
      const grip = document.createElement('div');
      grip.className = 'km-sheet-grip';
      grip.dataset.km = 'sheet-grip';
      grip.title = t('karmograph.sheetGrip.label');
      grip.onclick = () => root.classList.toggle('is-sheet-up');
      sideEl.appendChild(grip);
    }
    function raiseSheet(): void {
      if (!window.matchMedia('(max-width: 720px)').matches) return;
      root.classList.add('is-sheet-up');
      keepPickedCardVisible();
    }

    /**
     * 폰에서 카드를 고르면 아래 시트가 저절로 올라온다 — 그런데 **고른 그 카드가 시트에
     * 가려지는 일**이 생긴다(실측 2026-08-12: 아래쪽에 만든 카드가 통째로 덮였다).
     * 방금 고른 것이 안 보이면 고친 결과도 안 보인다. 그래서 가려진 만큼 판을 위로 민다.
     *
     * 배율은 안 건드린다 — 지금 보이는 범위를 그대로 아래로 옮겨 담으면 **밀기**가 된다
     * (`fitToWorldRect` 는 준 사각형을 화면에 맞추므로, 크기가 같으면 배율도 그대로다).
     */
    /* ★ **왜 안 밀렸는지 화면에 남긴다** (2026-08-12).
       이 함수는 조건 넷 중 하나만 어긋나도 조용히 아무것도 안 한다 — 그래서 CI 에서는 늘
       가려지는데 내 기계에서는 늘 통과하는, 원인을 물어볼 수 없는 상태가 됐다.
       빠져나간 자리를 판에 적어 두면 검사가 그걸 그대로 읽어 말해 준다. */
    /* ★ **한 번 재고 끝내지 않는다** (2026-08-12, 계측으로 밝혀짐).
       한 프레임 뒤에 딱 한 번 재던 판은 `panned(24)` 를 남기고 끝났는데, 정작 사람 눈에는
       173px 이 가려져 있었다 — 그 시점의 시트는 아직 다 자라지 않았고(최종 336) 카드도
       제자리가 아니었다. **언제 자리가 잡히는지 맞히는 것**이 애초에 틀린 접근이다.
       그래서 잠깐 동안(≈0.6초) 되풀이해 재고, 가림이 사라지면 스스로 멈춘다.
       자리가 언제 잡히든 결과가 같아진다 — 내 기계와 CI 가 갈리던 이유가 이것이었다. */
    function keepPickedCardVisible(): void {
      if (!canvas || !selectedId) { root.dataset.kmPan = 'no-selection'; return; }
      const margin = 12;
      const deadline = performance.now() + 600;
      let moved = 0;
      const step = (): void => {
        if (!canvas || !selectedId) return;
        const rect = canvas.nodeScreenRect(selectedId);
        const sheet = sideEl.getBoundingClientRect();
        if (!rect || sheet.height <= 0) {
          if (performance.now() < deadline) { requestAnimationFrame(step); return; }
          root.dataset.kmPan = rect ? 'sheet-h0' : 'no-rect';
          return;
        }
        /* 시트는 0.18초에 걸쳐 미끄러져 올라온다 — 올라오는 중에 위치를 재면 「안 가렸다」가
           나온다. 그래서 다 올라왔을 때의 자리를 셈으로 구한다: 판 아래끝 − 시트 높이. */
        /* ★ **두 자를 같은 자로 맞춘다** (2026-08-12, 계측 세 번째 — 이게 진짜 원인이었다).
           `nodeScreenRect` 가 주는 값은 **판 안에서의 자리**(판 왼쪽 위가 0)이고, 시트·판의
           `getBoundingClientRect` 는 **창 기준**이다. 두 자를 섞어 빼는 바람에 판이 화면에서
           내려온 만큼(실측 282px) 늘 덜 밀었다 — 24px 만 밀고 「이제 안 가림」이라 멈췄고,
           사람 눈에는 173px 이 그대로 가려져 있었다. 판 위끝을 더해 창 기준으로 맞춘다. */
        const canvasRect = canvasEl.getBoundingClientRect();
        const sheetTop = canvasRect.bottom - sheet.height;
        const over = canvasRect.top + rect.y + rect.h + margin - sheetTop;
        if (over <= 1) {
          /* 검사가 재는 값과 여기서 재는 값이 갈리면 원인을 못 찾는다 — **내가 무엇을 보고
             그만뒀는지** 그대로 남긴다 (카드 아래끝 · 내가 셈한 시트 위끝). */
          root.dataset.kmPan =
            `${moved ? `panned(${Math.round(moved)})` : 'no-need'}·카드끝${Math.round(canvasRect.top + rect.y + rect.h)}·시트위${Math.round(sheetTop)}`;
          return;
        }
        const scale = canvas.getScale() || 1;
        const view = canvas.viewRectWorld();
        if (!view || scale <= 0) { root.dataset.kmPan = 'no-view'; return; }
        /* ★ **곧바로 옮긴다 — 애니메이션으로 부탁하지 않는다** (2026-08-12, 계측 두 번째).
           `animate=true` 는 「그 자리로 미끄러져 가라」는 예약이다. 이 되풀이는 프레임마다
           다시 부르므로, 매번 예약이 새로 걸려 **한 발짝도 못 가고 제자리**였다
           (실측: 밀었다고 적힌 합계 709px, 실제 이동 0). 되풀이가 곧 부드러움을 맡는다. */
        canvas.fitToWorldRect({ x: view.x, y: view.y + over / scale, w: view.w, h: view.h }, 0, false);
        moved += over;
        if (performance.now() < deadline) requestAnimationFrame(step);
        else root.dataset.kmPan = `panned(${Math.round(moved)})·시간초과`;
      };
      requestAnimationFrame(step);
    }
    const fileEl = q<HTMLInputElement>('file');
    const imgEl = q<HTMLInputElement>('img');
    const restoreFileEl = q<HTMLInputElement>('restore-file');
    const undoEl = q<HTMLButtonElement>('undo');
    const redoEl = q<HTMLButtonElement>('redo');
    /** 사진 고르는 창이 뜬 사이 선택이 바뀔 수 있어, 어느 노드에 붙일지 기억해 둔다. */
    let avatarTargetId: string | null = null;

    /** 고른 사진을 정사각 96px data URL 로 줄인다 — 저장 용량 폭발 방지. */
    function shrinkToDataUrl(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const im = new Image();
        im.onload = () => {
          const side = Math.min(im.naturalWidth, im.naturalHeight);
          const cv = document.createElement('canvas');
          cv.width = AVATAR_PX;
          cv.height = AVATAR_PX;
          const ctx = cv.getContext('2d');
          if (!ctx) { URL.revokeObjectURL(url); reject(new Error(t('karmograph.err.161'))); return; }
          ctx.drawImage(
            im,
            (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side,
            0, 0, AVATAR_PX, AVATAR_PX
          );
          URL.revokeObjectURL(url);
          resolve(cv.toDataURL('image/webp', 0.85));
        };
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('karmograph.err.162'))); };
        im.src = url;
      });
    }

    /**
     * 백업 되돌리기 — **덮어쓰지 않고 더한다** (격차 Y-2).
     * 덮어쓰기는 되돌릴 수 없고, 사람은 「지금 것도 살아 있겠지」라고 믿는다. 이름이 겹치면 표시만 붙인다.
     */
    restoreFileEl.onchange = () => {
      const file = restoreFileEl.files?.[0];
      restoreFileEl.value = '';
      if (!file) return;
      void file.text().then((text) => {
        type Backup = { kind?: string; maps?: { name?: string; spec?: unknown }[] };
        let parsed: Backup | null = null;
        try { parsed = JSON.parse(text) as Backup; } catch { parsed = null; }
        if (!parsed || parsed.kind !== 'karmograph-backup' || !Array.isArray(parsed.maps)) {
          showNote([
            t('karmograph.file.msg'),
            t('karmograph.file.msg2'),
          ].join(String.fromCharCode(10)));
          return;
        }
        const used = new Set(library.maps.map((m) => m.name));
        let added = 0;
        for (const m of parsed.maps) {
          const spec0 = m.spec as Partial<GraphSpec> | null;
          if (!spec0 || !Array.isArray(spec0.nodes)) continue;
          const base = (m.name ?? t('karmograph.file.msg3')).trim() || t('karmograph.file.msg3');
          const name = used.has(base) ? t('karmograph.restoredName', { base }) : base;
          used.add(name);
          const res = addMap(library, name, JSON.stringify(spec0));
          library = res.index;
          added += 1;
        }
        renderMapList();
        openActiveMap();
        Toolbox.showToast?.(
          added === 0 ? t('karmograph.file.msg4') : t('karmograph.restored.n', { n: String(added) }),
          undefined, undefined
        );
      });
    };

    imgEl.onchange = () => {
      const file = imgEl.files?.[0];
      const targetId = avatarTargetId;
      avatarTargetId = null;
      imgEl.value = '';
      if (!file || !targetId) return;
      void shrinkToDataUrl(file)
        .then((dataUrl) => {
          const target = spec.nodes.find((n) => n.id === targetId);
          if (!target) return;
          target.avatar = { kind: 'image', value: dataUrl };
          resize(target);
          canvas?.render();
          canvas?.setSelectedNode(selectedId);
          persistStructure();
          renderSide();
        })
        .catch((e: unknown) => {
          console.error(t('karmograph.targetId.msg'), e);
          showNote(t('karmograph.targetId.msg2'));
        });
    };

    /**
     * **붙여넣으면 얼굴이 된다** (TASK-KL-271 X5).
     *
     * 예전엔 얼굴 하나 넣는 데 다섯 걸음이었다(카드 고르기 → 패널 → 「더 보기」 → 🖼 → 파일 찾기).
     * 사람이 실제로 하는 짓은 어디선가 그림을 복사해 붙여넣는 것 하나다. 무엇을 할지 정하는 규칙은
     * `paste-intent.ts` 가 안다 — 특히 **글을 치는 중이면 절대 안 가로챈다**.
     */
    const onPaste = (ev: ClipboardEvent): void => {
      const file = [...(ev.clipboardData?.items ?? [])]
        .find((it) => it.kind === 'file' && it.type.startsWith('image/'))?.getAsFile();
      const active = document.activeElement as HTMLElement | null;
      const what = pasteIntent({
        hasImage: Boolean(file),
        selectedId,
        typing: Boolean(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'
          || active.isContentEditable)),
        visible: root.isConnected && root.offsetParent !== null,
      });
      if (what === 'ignore') return;
      ev.preventDefault();
      if (what === 'need-card') {
        Toolbox.showToast?.(t('karmograph.paste.needCard'), undefined, undefined);
        return;
      }
      const targetId = selectedId;
      if (!file || !targetId) return;
      void shrinkToDataUrl(file)
        .then((dataUrl) => {
          const target = spec.nodes.find((n) => n.id === targetId);
          if (!target) return;
          lastAction = t('karmograph.paste.act');
          target.avatar = { kind: 'image', value: dataUrl };
          resize(target);
          canvas?.render();
          canvas?.setSelectedNode(selectedId);
          persistStructure();
          renderSide();
          Toolbox.showToast?.(t('karmograph.paste.done'), undefined, undefined);
        })
        .catch(() => showNote(t('karmograph.targetId.msg2')));
    };
    document.addEventListener('paste', onPaste);
    Toolbox.onDispose?.(() => document.removeEventListener('paste', onPaste));

    // ── 되돌리기 (TASK-KL-202 격차 F) ────────────────────────────────────────
    // 스냅샷 방식. 관계도는 노드 수십 개 규모라 JSON 통째로 떠도 싸고, 델타 방식과 달리
    // 「어떤 편집이든 되돌아간다」가 코드 한 줄로 보장된다 — 새 편집 기능을 붙일 때마다
    // undo 를 따로 안 짜도 된다. 그 대신 스냅샷 상한을 둬서 메모리를 묶는다.
    /** 되돌리기 더미 — **판 수가 아니라 무게로** 자른다 (규칙은 `history.ts`, TASK-KL-271 M4). */
    const history: string[] = [];
    /** 다음 저장이 「무엇을 한 것」인지 — 저장 직전에 아는 자리에서 적어 둔다. */
    let lastAction = '';
    /** 각 판이 「무엇을 한 뒤」인지 — 되돌리기 단추의 이름이 된다(빈 문자열이면 그냥 「되돌리기」). */
    const histLabels: string[] = [];
    let histIndex = -1;
    /** 되돌리는 중에는 스냅샷을 찍지 않는다 — 안 그러면 되돌린 것이 다시 기록된다. */
    let restoring = false;

    function snapshot(what = ''): void {
      if (restoring) return;
      const json = JSON.stringify(canvas?.getSpec() ?? spec);
      if (history[histIndex] === json) return;
      history.splice(histIndex + 1);   // 되돌린 뒤 새로 고치면 앞쪽 가지는 버린다
      histLabels.splice(histIndex + 1);
      history.push(json);
      histLabels.push(what);           // 「무엇을 한 판」인지 — 되돌리기 단추가 이걸 말한다
      // 사진이 붙은 판은 하나가 수 MB 다 — 예순 판을 그대로 들면 탭이 죽는다(죽으면 되돌리기가
      // 아니라 작업 전체를 잃는다). 가벼우면 예순 판, 무거우면 몇 판 — 더미 전체는 상한 아래.
      const drop = dropFromFront(history.map(roughBytes));
      if (drop > 0) { history.splice(0, drop); histLabels.splice(0, drop); }
      histIndex = history.length - 1;
      syncHistoryButtons();
    }

    function restoreTo(index: number): void {
      if (index < 0 || index >= history.length) return;
      restoring = true;
      spec = JSON.parse(history[index]) as GraphSpec;
      histIndex = index;
      selectedId = null;
      linkingFrom = null;
      canvasEl.classList.remove('km-linking');
      applySpec();
      store.saveSpec(spec);
      renderSide();
      restoring = false;
      syncHistoryButtons();
    }

    function syncHistoryButtons(): void {
      undoEl.disabled = histIndex <= 0;
      redoEl.disabled = histIndex >= history.length - 1;
      // ★ 화살표만 있으면 **무엇이 되돌아가는지** 모른 채 누른다 — 그래서 안 누른다
      //   (2026-08-12 사용자 검토). 마지막으로 한 일을 이름으로 붙여 준다.
      const back = histLabels[histIndex] ?? '';
      const fwd = histLabels[histIndex + 1] ?? '';
      undoEl.title = back ? t('karmograph.undoWhat', { what: back }) : t('karmograph.undo.title');
      redoEl.title = fwd ? t('karmograph.redoWhat', { what: fwd }) : t('karmograph.redo.title');
    }

    // ── 저장 ────────────────────────────────────────────────────────────────
    // 구조 변경은 즉시 전체 저장. 좌표 변경은 캔버스가 debounce 후 어댑터로.
    /** 저장이 실패하면 화면에 남는 표시를 띄운다 — alert 는 닫으면 흔적이 없다. */
    /**
     * 저장이 **실패했다** — 사람에게 지지 않는 표시로 알리고, **빠져나갈 길을 같이 준다**
     * (TASK-KL-271). 저장이 안 되는 판에서 필요한 건 경고문이 아니라 「지금 파일로 빼기」다.
     */
    /**
     * 🪟 **다른 탭도 이 판을 고쳤다** (KL-271).
     *
     * 한 판을 두 탭에서 열어 두는 일은 흔하다(링크로 열고 원래 탭은 그대로 둔다). 각 탭은 제
     * 기억 속 판을 통째로 쓰므로 **뒤에 쓴 탭이 앞 탭의 일을 지운다** — 실측 2026-08-14: B 탭에서
     * 만든 카드가 A 탭의 다음 저장에 아무 말 없이 사라졌다. 여기서는 **말해 준다**: 사라진 것을
     * 되찾는 길(직전 판 되살리기)과 지금 것을 지키는 길(파일로 빼기)이 둘 다 도구 안에 있다.
     */
    let toldOtherTab = false;
    function warnOtherTab(): void {
      if (toldOtherTab) return;   // 저장할 때마다 뜨면 일을 못 한다 — 한 번만 말한다
      toldOtherTab = true;
      showNote(t('karmograph.otherTab.msg'));
    }

    function warnSaveFailed(): void {
      const old = root.querySelector('.km-storage-warn');
      if (old?.classList.contains('is-fail')) return;
      old?.remove();
      const bar = document.createElement('div');
      bar.className = 'km-storage-warn is-fail';
      bar.innerHTML = `${esc(t('karmograph.saveFailed'))} `
        + `<button class="btn btn-ghost" data-km="save-failed-export">${esc(t('karmograph.saveFailed.out'))}</button>`;
      (bar.querySelector('[data-km="save-failed-export"]') as HTMLButtonElement).onclick = () => {
        // 내보내기는 한 길뿐이다 — 그 단추를 눌러 준다(여기서 또 만들면 문이 둘이 된다).
        (root.querySelector('[data-km="export"]') as HTMLButtonElement | null)?.click();
      };
      root.querySelector('.km-toolbar')?.insertAdjacentElement('afterend', bar);
    }

    function warnStorageIfTight(): void {
      const rep = measureStorage();
      if (!rep.warn) return;
      if (root.querySelector('.km-storage-warn')) return;
      const bar = document.createElement('div');
      bar.className = 'km-storage-warn';
      bar.innerHTML = t('karmograph.storageFull', { pct: Math.round(rep.ratio * 100) });
      root.querySelector('.km-toolbar')?.insertAdjacentElement('afterend', bar);
    }

    /** 지금 맵 이름 — 라이브러리 목록에서 「어느 맵에서 온 글인가」를 보여 주는 데 쓴다. */
    function activeMapName(): string {
      return library.maps.find((m) => m.id === library.activeId)?.name ?? t('karmograph.file.msg3');
    }

    /**
     * 저장 표시 — 이 도구는 **자동 저장**인데 그 말을 아무 데서도 안 했다. 처음 쓰는 사람은
     * 「저장 버튼이 어디 있지?」로 불안해하다가 창을 안 닫는다. 저장할 때마다 잠깐 「저장됨」을 켠다.
     */
    let savedTimer: ReturnType<typeof setTimeout> | null = null;
    let savedCount = 0;   // 처음 몇 번만 「이 브라우저에」까지 말한다 — 매번이면 소음이 된다
    function flashSaved(): void {
      const el = root.querySelector('[data-km="saved"]') as HTMLElement | null;
      if (!el) return;
      // ★ 「저장됨」만으로는 **어디에** 저장됐는지 모른다 — 방문기록을 지우면 사라지는 것을
      //   모른 채 몇 달을 쓰게 된다(2026-08-12 사용자 검토). 처음 몇 번은 자리까지 말해 준다.
      savedCount += 1;
      el.textContent = savedCount <= 3 ? t('karmograph.savedHere') : t('karmograph.el.msg');
      el.classList.remove('hidden');
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => el.classList.add('hidden'), 1400);
    }
    Toolbox.onDispose?.(() => { if (savedTimer) clearTimeout(savedTimer); });

    /**
     * 위젯이 페이지에서 얼마나 내려와 있는지를 CSS 에 알려 준다 (TASK-KL-202 방향④).
     * 폰에서 몸통이 화면보다 길면 **접힌 시트의 손잡이가 화면 밖**이라, 옆 패널을 여는 유일한 길이
     * 스크롤 뒤에 숨는다. 높이는 CSS 가 계산하고(`100dvh - --km-top`), 여기서는 자리만 잰다.
     */
    const syncViewportFit = (): void => {
      const top = Math.max(0, Math.round(root.getBoundingClientRect().top + window.scrollY
        - (document.scrollingElement?.scrollTop ?? 0)));
      root.style.setProperty('--km-top', `${top}px`);
    };
    // 만드는 시점엔 아직 화면에 안 붙어 있을 수 있다(그때 재면 0 이 나와 화면 전체를 먹는다).
    // 그래서 지금 한 번, 다음 그림 한 번, 그리고 위쪽 것들이 커지고 줄 때마다 다시 잰다.
    syncViewportFit();
    requestAnimationFrame(syncViewportFit);
    window.addEventListener('resize', syncViewportFit);
    window.addEventListener('orientationchange', syncViewportFit);
    const fitObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(syncViewportFit) : null;
    fitObserver?.observe(document.body);

    /* 툴바가 폰에서 옆으로 밀리는데 **밀린다는 표시가 없었다**(스크롤막대는 폰에서 안 보인다).
       오른쪽에 남은 것이 있으면 끝을 흐린다 — 끝까지 밀면 흐림이 사라져 「끝」도 같이 말해 준다. */
    // 툴바는 이 지점에 아직 없을 수 있다 — **부를 때마다 찾는다**(한 번 잡아 두면 null 로 굳는다).
    const syncToolbarFade = (): void => {
      const el = root.querySelector('.km-toolbar') as HTMLElement | null;
      if (!el || el.clientWidth === 0) return;   // 아직 자리를 안 잡았으면 판단하지 않는다
      el.classList.toggle('km-more-right', el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
    };
    requestAnimationFrame(syncToolbarFade);
    setTimeout(syncToolbarFade, 300);
    root.addEventListener('scroll', syncToolbarFade, { passive: true, capture: true });
    window.addEventListener('resize', syncToolbarFade);
    Toolbox.onDispose?.(() => {
      window.removeEventListener('resize', syncViewportFit);
      window.removeEventListener('orientationchange', syncViewportFit);
      window.removeEventListener('resize', syncToolbarFade);
      fitObserver?.disconnect();
    });

    /**
     * 카드가 사라지면 **그 카드를 가리키던 것들도** 손본다 (KL-271).
     *
     * 선과 지시선은 이미 정리했는데 **발표 장**은 지운 카드의 id 를 그대로 안고 있었다
     * (실측 2026-08-14). 화면이 터지진 않지만 ① 그 장이 「몇 장을 담았나」가 틀리고
     * ② 카드 id 는 번호를 다시 쓰므로 **나중에 만든 남의 카드가 그 장에 저절로 낀다**.
     */
    function forgetNodeEverywhere(id: string): void {
      for (const step of spec.story ?? []) {
        if (step.nodeIds?.includes(id)) step.nodeIds = step.nodeIds.filter((x) => x !== id);
      }
    }

    /** 이 탭이 이 판을 **고친 적 있나** — 다른 탭의 변경을 따라갈지 정하는 데 쓴다. */
    let touchedHere = false;

    function persistStructure(): void {
      touchedHere = true;
      store.saveSpec(canvas?.getSpec() ?? spec);
      flashSaved();
      // 공용 글은 맵보다 오래 산다 — 저장할 때마다 사람 창고에도 같이 적어 둔다.
      mirrorToLibrary(spec, activeMapName());
      library = touchMap(library, library.activeId);
      snapshot(lastAction || t('karmograph.act.edit'));
      lastAction = '';
      warnStorageIfTight();
    }

    // ── id 발급 ─────────────────────────────────────────────────────────────
    function nextId(prefix: 'node' | 'edge', taken: Set<string>): string {
      let n = 1;
      while (taken.has(`${prefix}-${n}`)) n += 1;
      return `${prefix}-${n}`;
    }

    // ── 노드 폭 — 라벨이 길면 넓힌다 (11px sans 기준 대략치) ────────────────
    function widthFor(label: string): number {
      return Math.max(NODE_MIN_W, Math.min(320, label.length * 9 + 28));
    }

    /**
     * 새로 태어나는 카드에 **그 종류의 빈 칸**을 심는다 (TASK-KL-202 방향② 첫 30초).
     *
     * 견본을 깔 때만 칸 틀을 깔아 주고 있었다 — 그래서 사람이 직접 만든 첫 카드는 **빈 몸**으로 나왔고,
     * 「인물이면 출신·소속을 적는다」는 이 판의 약속이 견본에서만 살아 있었다. 빈 칸이 곧 「여기에 적어라」다.
     * 값은 절대 안 채운다(채우면 지우는 일부터 시켜야 한다).
     */
    function seedFields(node: GraphNode): void {
      const tpl = nodeKindsNow().find((k) => k.id === node.kind)?.fields ?? [];
      if (tpl.length === 0) return;
      node.fields = { ...Object.fromEntries(tpl.map((name) => [name, ''])), ...(node.fields ?? {}) };
    }

    /**
     * 노드 크기 재계산. 얼굴·한마디·모양이 바뀌면 상자도 따라 커져야 한다 —
     * 안 그러면 글자가 테두리를 넘고, 동그라미 안에서 이름이 잘린다.
     */
    function resize(node: GraphNode): void {
      if (node.sized) return;   // 사람이 모서리를 끌어 정한 크기 — 자동 맞춤이 도로 물리면 안 된다.
      const shape = node.shape ?? 'rect';
      const hasNote = Boolean(node.note && node.note.trim());
      let w = widthFor(node.label);
      let h = NODE_H;
      // 모든 노드가 얼굴을 갖게 됐으므로(빈 얼굴 = 첫 글자) 폭 여유도 늘 준다.
      if (shape !== 'circle') w += 28;
      // 카드에 칸이 보이므로 그 줄 수만큼 키운다 — 안 키우면 글자가 카드 밖으로 흐른다.
      const fieldCount = Object.values(node.fields ?? {}).filter((v) => String(v).trim()).length;
      if (fieldCount > 0 && shape !== 'circle') h += Math.min(4, fieldCount) * 11 + 4;
      if (hasNote) {
        h += 14;
        w = Math.max(w, widthFor(node.note ?? '') );
      }
      if (shape === 'circle') {
        if (node.avatar) h += 26;
        w = Math.max(w + 24, h + 24);
      }
      // 메모는 글이 주인공이라 여유를 더 준다. 글이 붙어 있으면 **그 글이 카드 안에 보이므로**
      // 줄 수만큼 키워 준다 — 안 키우면 본문이 카드 밖으로 삐져나가 배경 위에 떠 보인다.
      if (shape === 'note') {
        w += 16;
        const body = resolveDoc(spec, node).trim();
        if (body) {
          const perLine = Math.max(6, Math.floor((w - 20) / 5.6));
          const lineCount = Math.min(
            6,
            body.split(/\r?\n/).filter(Boolean).reduce((n, para) => n + Math.ceil(para.length / perLine), 0),
          );
          h = 22 + lineCount * 12 + 10;
        }
      }
      // 사진 카드는 그림이 주인공 — 세로로 긴 초상 비율로 고정한다.
      if (shape === 'photo') { w = 140; h = 176; }
      node.w = Math.round(w);
      node.h = Math.round(h);
    }

    // ── 빈 상태 안내 ────────────────────────────────────────────────────────
    function syncEmptyHint(): void {
      /* ★ **빈 판에서는 툴바도 접는다** (TASK-KL-271 F2 / S2).
         카드가 0장인데 「전체 보기 · 발표 · 찾기」가 다 켜져 있었다 — 할 수 있는 게 하나뿐인
         순간에 선택지를 열 개 보여 주면, 그 하나가 어느 것인지가 안 보인다. 카드가 생기면
         저절로 돌아온다(지우는 게 아니라 아직 쓸 데가 없는 것을 접는 것). */
      root.classList.toggle('km-blank', spec.nodes.length === 0);
      // 툴바 자신에게도 표를 단다 — 위쪽 조상에 기대면 위젯이 두 번 얹힌 판에서 안 먹는다(실측).
      root.querySelector('.km-toolbar')?.classList.toggle('km-blank', spec.nodes.length === 0);
      const existing = canvasEl.querySelector('.km-empty');
      if (spec.nodes.length > 0) {
        existing?.remove();
        return;
      }
      // 팩을 바꾸면 안내 문구도 바뀌어야 하므로 매번 다시 쓴다.
      const el = (existing as HTMLElement | null) ?? document.createElement('div');
      el.className = 'km-empty';
      const samples = PACKS.map((pk) => ({ pk, s: sampleFor(pk.id) })).filter((x) => x.s);
      // 처음 여는 사람에게 필요한 것은 기능 목록이 아니라 **들어오는 문**이다.
      // 세 갈래를 크게 보여 주고, 고르면 그 갈래의 견본 + 종류 + 칸 틀이 한꺼번에 깔린다.
      // 캔버스 위에는 **글자만** 둔다. 큰 버튼을 캔버스에 얹으면 「빈 곳 두 번 클릭」을 잡아먹어
      // 처음 여는 사람이 첫 동작부터 막힌다(실제로 검사가 그렇게 걸렸다). 고르는 자리는 옆 패널이다.
      // 한 줄에 한 가지만. 전에는 둘째 줄이 길어 「이어집니다.」 넉 자만 셋째 줄로 떨어졌다(실서비스 첫 화면).
      /* ★ 폰에서는 **말이 달라야 한다.** 「두 번 클릭」도 「오른쪽에서」도 폰에는 없는 말이다 —
         손가락은 두드리고, 옆 패널은 아래에서 올라오는 시트다. 첫 화면 안내가 없는 곳을
         가리키면 처음 여는 사람은 첫 걸음부터 막힌다(실측 2026-08-12, 폰 첫 화면). */
      const touch = window.matchMedia('(max-width: 720px)').matches;
      /* ★ 폰에서는 **두 줄까지**다 (2026-08-12 사용자 검토). 넉 줄이면 아래 시트(시작 갈래)와
         겹쳐 문장이 중간에서 잘리고, 잘린 안내는 안 읽는다 — 실측: 「…고를 수 있어」에서 끊겼다.
         선 잇는 법은 시트를 올리면 나오는 시작 갈래와 도움말(?)이 맡는다. */
      el.innerHTML = '<div class="km-empty-in">' +
        t('karmograph.touch.msg') +
        t(touch ? 'karmograph.touch.msg2Touch' : 'karmograph.touch.msg2') +
        (touch ? '' : t('karmograph.touch.msg3') + t('karmograph.touch.msg4')) +
        '</div>';

      // 안내는 클릭을 통과시키지만(pointer-events:none) 버튼만은 눌려야 한다.
      el.querySelectorAll('[data-km="sample"]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const packId = (btn as HTMLElement).dataset.key ?? DEFAULT_PACK_ID;
          const s0 = sampleFor(packId);
          if (!s0) return;
          // 견본을 넣어도 **갈래가 고정되지 않는다** — 그 견본의 종류로 만들 뿐이다.
          buildFromOutline(s0.outline, packById(packId).nodeKinds[0].id);
          Toolbox.showToast?.(t('karmograph.sample.label'), undefined, undefined);
        });
      });
      if (!existing) canvasEl.appendChild(el);
    }

    // ── 묶음 (TASK-KL-202 격차 D) ────────────────────────────────────────────
    // 캔버스는 이미 묶음을 그리고 끌 줄 안다(멤버를 감싸 자동으로 커진다). 없던 건
    // *만들고 넣는 손잡이* 뿐이었다.
    /** 이 노드가 든 묶음들. 옛 저장본은 `group` 한 칸만 갖고 있다. */
    function memberOf(node: GraphNode): string[] {
      if (node.groups && node.groups.length > 0) return node.groups;
      return node.group ? [node.group] : [];
    }

    /** 소속을 통째로 다시 쓴다. `group` 은 첫 소속을 비춰 둔다 — 캔버스 밖(cockpit)이 그 이름으로 읽는다. */
    function setMembership(node: GraphNode, ids: string[]): void {
      node.groups = ids.length > 0 ? ids : undefined;
      node.group = ids[0] ?? '';
    }

    function nextGroupId(): string {
      const taken = new Set(spec.groups.map((g) => g.id));
      let n = 1;
      while (taken.has(`group-${n}`)) n += 1;
      return `group-${n}`;
    }

    /** 팩 프리셋 중 아직 안 쓴 이름·색을 집어 새 묶음을 만든다. 다 썼으면 번호를 붙인다. */
    function createGroup(): GroupDef {
      const used = new Set(spec.groups.map((g) => g.label));
      // 묶음 이름 후보도 갈래를 안 가린다 — 「가족」이든 「묘지」든 이 맵에 없으면 후보다.
      const preset = PACKS.flatMap((p0) => p0.groupPresets).find((p0) => !used.has(p0.label));
      const label = preset?.label ?? t('karmograph.groupNth', { n: spec.groups.length + 1 });
      const color = preset?.color ?? '#a78bfa';
      const center = canvas?.viewCenterWorld() ?? { x: 0, y: 0 };
      const group: GroupDef = {
        id: nextGroupId(),
        label,
        color,
        // 겹치는 묶음이 흔한 도구다 — 네모보다 멤버를 감싸는 윤곽이 「누가 어디 속하는지」를 덜 흐린다.
        shape: 'hull',
        // 멤버가 생기면 캔버스가 알아서 감싼다. 빈 묶음도 보이게 최소 상자를 준다.
        bbox: { x: Math.round(center.x - 90), y: Math.round(center.y - 60), w: 180, h: 120 },
      };
      spec.groups.push(group);
      return group;
    }

    // ── 내 용어 (격차 A-2) ───────────────────────────────────────────────────
    /** 용어가 바뀌면 색표·선 정의를 캔버스에 다시 넘겨야 그린 것이 따라온다. */
    /** 이 탭이 용어를 고친 적 있나 — 다른 탭의 변경을 따라갈지 정하는 데 쓴다. */
    let termsTouched = false;

    function applyTerms(): void {
      termsTouched = true;
      saveTerms(terms);
      spec._edge_kinds = { ...edgeDefsNow(), ...(spec._edge_kinds ?? {}) };
      // 내 용어가 이긴다 — 방금 고친 색이 옛 정의에 덮이면 「고쳤는데 그대로」가 된다.
      for (const e of terms.edgeKinds) {
        spec._edge_kinds[e.id] = { color: e.color, style: e.style, arrow: e.arrow, width: e.width };
      }
      canvas?.setKindColors(kindColorsNow());
      persistStructure();
    }

    /** 거르기 패널 — 종류 체크를 끄면 그 종류가 화면에서 빠진다(자료는 그대로). */
    function applyFilter(): void {
      canvas?.setFilter({
        nodeKinds: filterState.nodeKinds,
        edgeKinds: filterState.edgeKinds,
        tags: filterState.tags,
        hideOrphans: filterState.hideOrphans,
        minDegree: filterState.minDegree,
        fieldName: filterState.fieldName,
        fieldValue: filterState.fieldValue,
      });
      canvas?.setSelectedNode(selectedId);
    }

    /**
     * 여럿 고름 패널 — 한 번에 묶고·바꾸고·지운다.
     * 노드가 늘면 하나씩 만지는 것이 곧 벽이 된다(Heptabase 도 「골라서 Create Section」이 기본 동작).
     */
    /**
     * 글 한 덩이 → 노드·선. 「글로 만들기」와 「예시 넣어 보기」가 같은 길을 쓴다 —
     * 견본을 코드로 따로 만들면 문법이 갈라져 둘 중 하나가 곧 낡는다.
     */
    function buildFromOutline(src: string, kind: string): number {
      const doc = parseOutline(src);
      const parsed = doc.nodes;
      if (parsed.length === 0 && doc.links.length === 0) return 0;
      const center = canvas?.viewCenterWorld() ?? { x: 0, y: 0 };
      const pos = layoutTree(parsed, {
        colW: 240, rowH: 70,
        originX: Math.round(center.x - 240),
        originY: Math.round(center.y - (parsed.length * 70) / 4),
      });
      const takenN = new Set(spec.nodes.map((n) => n.id));
      const idMap = new Map<string, string>();
      /* ★ **같은 이름은 같은 카드다** (TASK-KL-271 P8). 글에서 「소꿉친구」가 아래에 또 나오는 것은
         새 사람이 아니라 그 사람에 대해 한 줄 더 적은 것이다. 예전에는 이름이 같아도 카드를 새로
         만들어서, 첫 화면 견본에 「소꿉친구」와 「라이벌」이 두 장씩 놓였다(사용자 「중복」 지적의 그 자리). */
      const byName = new Map<string, string>();
      for (const n of spec.nodes) if (!byName.has(n.label)) byName.set(n.label, n.id);
      for (const p of parsed) {
        const seen = byName.get(p.label);
        if (seen) { idMap.set(p.id, seen); continue; }
        const id = nextId('node', takenN);
        takenN.add(id);
        idMap.set(p.id, id);
        byName.set(p.label, id);
        const at = pos.get(p.id) ?? { x: center.x, y: center.y };
        const node: GraphNode = {
          id, kind: p.kind ?? kind, label: p.label, group: p.group ?? '',
          x: Math.round(at.x), y: Math.round(at.y),
          w: widthFor(p.label), h: NODE_H, ports: [],
          groups: p.groups,
          shape: p.shape,
          // 관계 이름은 **선에만** 적는다 — 카드 부제에 같은 말을 또 쓰면 첫 화면이 중복을
          // 시범 보이게 된다(KL-271 P8). 부제는 글에서 `note=` 로 따로 적었을 때만 채운다.
          note: p.note,
          tags: p.tags,
        };
        seedFields(node);
        resize(node);
        spec.nodes.push(node);
      }
      const takenE = new Set(spec.edges.map((e) => e.id));
      const edgeKind = edgeKindsNow()[0].id;
      for (const p of parsed) {
        if (!p.parent) continue;
        const from = idMap.get(p.parent);
        const to = idMap.get(p.id);
        if (!from || !to) continue;
        if (from === to) continue;   // 이름이 같아 한 장으로 합쳐졌으면 제자리 선이 된다
        const id = nextId('edge', takenE);
        takenE.add(id);
        spec.edges.push({ id, from, to, kind: edgeKind, label: p.edgeLabel ?? edgeLabel(edgeKind) });
      }
      // 화살표 줄 — **이름으로** 잇는다. 방금 만든 것뿐 아니라 이미 맵에 있던 인물도 대상이다
      // (글에는 「욘 -> 마을」이라고만 적히지, 그 둘이 어디서 왔는지는 안 적힌다).
      const byLabel = (name: string): string | undefined =>
        idMap.get(parsed.find((x) => x.label === name)?.id ?? '')
        ?? spec.nodes.find((x) => x.label === name)?.id;
      for (const link of doc.links) {
        const from = byLabel(link.from);
        const to = byLabel(link.to);
        if (!from || !to || from === to) continue;
        if (spec.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) continue;
        const id = nextId('edge', takenE);
        takenE.add(id);
        spec.edges.push({ id, from, to, kind: edgeKind, label: link.label ?? edgeLabel(edgeKind) });
      }
      applySpec();
      persistStructure();
      canvas?.fitView();
      return parsed.length;
    }

    /** 패널이 빌려 쓰는 것들 한 덩이 — 옮긴 패널은 이것만 알면 된다 (개편 2). */
    const panelCtx: PanelCtx = {
      side: sideEl,
      spec: () => spec,
      canvas: () => canvas,
      goNode: () => { sideMode = 'node'; renderSide(); },
      focusNode: (nodeId) => {
        if (!spec.nodes.some((n) => n.id === nodeId)) return;
        selectedId = nodeId;
        sideMode = 'node';
        renderSide();
        canvas?.fitToNodes([nodeId], 220);
      },
      persist: () => persistStructure(),
      refresh: () => renderSide(),
      esc: (s0) => escapeHtml(s0),
      terms,
      applyTerms: () => applyTerms(),
      createGroup: () => createGroup(),
      memberOf: (node) => memberOf(node),
      setMembership: (node, ids) => setMembership(node, ids),
      applySpec: () => applySpec(),
      selectedMany: () => selectedMany,
      nodeKindOptionsHtml: () => nodeKindOptions(),
      edgeKindOptionsHtml: (sel) => edgeKindOptions(sel),
      selectedEdge: () => spec.edges.find((e) => e.id === selectedEdgeId),
      spawnNodeAt: (x, y, label) => spawnNodeAt(x, y, label),
      spawnNoteCard: (noteId) => spawnNoteCard(noteId),
      putStamp: (stampId) => {
        const st = loadStamps().find((x) => x.id === stampId);
        if (!st) return;
        const center = canvas?.viewCenterWorld() ?? { x: 0, y: 0 };
        const ids = applyStamp(spec, st, { x: center.x - 120, y: center.y - 80 }, (prefix, taken) => nextId(prefix, taken));
        applySpec();
        persistStructure();
        canvas?.setSelectedNodes(ids);
        selectedMany = ids;
        sideMode = 'many';
        renderSide();
        Toolbox.showToast?.(t('karmograph.stamped', { name: st.name, n: ids.length }), undefined, undefined);
      },
      removeStamp: (stampId) => {
        deleteStamp(stampId);
        renderSide();
      },
      saveStamp: (name) => {
        const st = captureStamp(spec, selectedMany, name);
        if (!st) return;
        Toolbox.showToast?.(t('karmograph.stampSaved', { name: st.name }), undefined, undefined);
        renderSide();
      },
      linkWithLabel: (from, to, label) => {
        const dup = spec.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from));
        if (dup) return;
        const taken = new Set(spec.edges.map((e) => e.id));
        spec.edges.push({ id: nextId('edge', taken), from, to, kind: edgeKindsNow()[0].id, label });
        applySpec();
        persistStructure();
      },
      foreignNotes: () => foreignNotes(spec),
      adoptNote: (noteId) => { adoptNote(spec, noteId); },
      resizeNode: (node) => resize(node),
      openAvatarPicker: (nodeId) => { avatarTargetId = nodeId; imgEl.click(); },
      removeEdge: (id) => {
        spec.edges = spec.edges.filter((e) => e.id !== id);
        for (const n of spec.nodes) if (n.attachedTo === id) n.attachedTo = undefined;
        selectedEdgeId = null;
      },
      buildFromOutline: (s0, kind) => buildFromOutline(s0, kind),
      clearMany: () => { selectedMany = []; selectedId = null; },
      removeNodes: (ids) => {
        const gone = new Set(ids);
        const goneEdges = new Set(
          spec.edges.filter((e) => gone.has(e.from) || gone.has(e.to)).map((e) => e.id)
        );
        for (const id of gone) forgetNodeEverywhere(id);   // 발표 장에서도 뺀다(한 장씩 지울 때와 같게)
        spec.nodes = spec.nodes.filter((n) => !gone.has(n.id));
        spec.edges = spec.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
        for (const n of spec.nodes) {
          if (n.attachedTo && (gone.has(n.attachedTo) || goneEdges.has(n.attachedTo))) n.attachedTo = undefined;
        }
      },
      filterState,
      applyFilter: () => applyFilter(),
      focusDegree: () => focusDegree,
      setFocusDegree: (v) => { focusDegree = v; syncFocus(); },
      timesChanged: () => renderTimes(),
      applyDecorate: () => {
        canvas?.setDecorate({
          sizeByDegree: filterState.sizeByDegree,
          colorByTag: filterState.colorByTag,
          colorByField: filterState.colorByField,
        });
        canvas?.setSelectedNode(selectedId);
      },
      nodeKinds: () => nodeKindsNow().map((k) => ({ id: k.id, label: k.label, icon: k.icon, fields: k.fields })),
      edgeKinds: () => edgeKindsNow().map((k) => ({ id: k.id, label: k.label })),
      kindLabel: (id) => kindLabel(id),
      kindIcon: (id) => kindIcon(id),
      edgeLabel: (id) => edgeLabel(id),
      mapNameOfKey: (key) => {
        const id = key.replace('karmograph.map.', '');
        return library.maps.find((x) => x.id === id)?.name ?? key.replace('karmograph.', '');
      },
      openRestore: () => restoreFileEl.click(),
      backupAllMaps: () => {
        // 맵 하나씩 내보내게 하면 사람은 결국 몇 개를 빠뜨린다 — 통째로 한 파일에 담는다.
        const all = library.maps.map((m) => {
          let data: unknown = null;
          try { data = JSON.parse(localStorage.getItem(mapKey(m.id)) ?? 'null'); } catch { data = null; }
          return { id: m.id, name: m.name, updatedAt: m.updatedAt, spec: data };
        });
        downloadBlob(
          new Blob([JSON.stringify({ kind: 'karmograph-backup', v: 1, maps: all }, null, 2)], { type: 'application/json' }),
          'karmograph-backup.json'
        );
        Toolbox.showToast?.(t('karmograph.mapsBundled', { n: all.length }), undefined, undefined);
      },
      hasRescue: () => store.hasRescue(),
      restorePrevRevision: async () => {
        const prev = store.loadPrev();
        if (!prev) {
          Toolbox.showToast?.(t('karmograph.byLabel.msg'), undefined, undefined);
          return;
        }
        if (!await askNote(t('karmograph.confirmRestore', { n: prev.nodes.length }), t('karmograph.ask.ok'))) return;
        spec = prev;
        applySpec();
        persistStructure();
        canvas?.fitView();
        sideMode = 'node';
        renderSide();
        Toolbox.showToast?.(t('karmograph.byLabel.msg2'), undefined, undefined);
      },
    };

    /**
     * 오른쪽 패널 탭 (KL-202 개편 1).
     * 패널이 아홉 가지로 늘었는데 서로 오가는 길이 없었다 — 각 패널에 「닫기」만 있어서
     * 다른 패널로 가려면 툴바에서 그 아이콘을 **다시 찾아야** 했다. 탭을 항상 띄워
     * 「지금 어디에 있고 어디로 갈 수 있는지」를 한자리에서 보인다.
     */
    const SIDE_TABS: { id: SideMode; icon: string; title: string }[] = [
      { id: 'node', icon: '◉', title: t('karmograph.byLabel.msg3') },
      { id: 'groups', icon: '🫧', title: t('karmograph.byLabel.msg4') },
      { id: 'terms', icon: '🏷', title: t('karmograph.byLabel.msg5') },
      { id: 'filter', icon: '🔍', title: t('karmograph.byLabel.msg6') },
      { id: 'sna', icon: '📊', title: t('karmograph.byLabel.msg7') },
      { id: 'table', icon: '▤', title: t('karmograph.table.head') },
      { id: 'notes', icon: '🔗', title: t('karmograph.byLabel.msg8') },
      { id: 'storage', icon: '💾', title: t('karmograph.byLabel.msg9') },
      { id: 'help', icon: '?', title: t('karmograph.byLabel.msg10') },
    ];

    /**
     * 패널 머리 — **지금 무엇을 보고 있나** 한 줄 + 다른 목록으로 가는 접힌 문 (TASK-KL-271 R2).
     *
     * 전에는 그림 여덟 개가 늘 떠 있었다. 1440px 에서도 **두 줄로 접혔고**(실측), 정작 아홉 중
     * 여덟은 어쩌다 한 번 쓰는 것인데 「고른 것」과 같은 크기를 먹었다. 이제 화면은 **고른 것이
     * 정한다** — 카드를 고르면 카드 패널, 선이면 선 패널, 여럿이면 자리 패널, 아무것도 없으면
     * 판 패널. 나머지는 오른쪽 「⌄」 안에 접어 둔다(단추는 DOM 에 그대로 남아 손잡이가 산다).
     */
    function prependTabs(): void {
      const now = SIDE_TABS.find((x) => x.id === sideMode);
      const bar = document.createElement('div');
      bar.className = 'km-tabs';
      const rows = SIDE_TABS.map(
        (tb0) => `<button class="btn btn-ghost km-tab${sideMode === tb0.id ? ' is-on' : ''}"
          data-km="tab" data-key="${tb0.id}" title="${tb0.title}" aria-label="${tb0.title}"
          >${tb0.icon}<span class="km-tab-name">${tb0.title}</span></button>`
      ).join('');
      bar.innerHTML = `<span class="km-tabs-now">${esc(now ? `${now.icon} ${now.title}` : t('karmograph.panel.here'))}</span>`
        + `<button class="btn btn-ghost km-tabs-more" data-km="panel-more"`
        + ` title="${esc(t('karmograph.panel.more'))}" aria-label="${esc(t('karmograph.panel.more'))}">⌄</button>`
        + `<div class="km-tabs-menu hidden" data-km="panel-menu">${rows}</div>`;
      sideEl.insertBefore(bar, sideEl.firstChild);
      /* ★ 머리가 이름을 말하는데 **바로 밑 제목이 같은 말을 또** 한다 — 목록형 패널이 다 그렇다
         (「🔍 거르기」 / 「🔍 거르기」). 머리를 새로 얹으면서 생긴 겹말이라 여기서 함께 지운다
         (패널 여덟 곳을 각각 고치면 다음에 또 어긋난다). 글자만 비교하고 그림·기호는 뺀다. */
      const plain = (x: string): string => x.replace(/[^\p{L}\p{N}]/gu, '');
      const firstH4 = bar.nextElementSibling;
      if (firstH4?.tagName === 'H4' && now && plain(firstH4.textContent ?? '') === plain(now.title)) {
        firstH4.remove();
      }
      const menu = bar.querySelector('[data-km="panel-menu"]') as HTMLElement;
      (bar.querySelector('[data-km="panel-more"]') as HTMLButtonElement).onclick = (ev) => {
        ev.stopPropagation();
        menu.classList.toggle('hidden');
      };
      bar.querySelectorAll('[data-km="tab"]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => {
          sideMode = ((el as HTMLElement).dataset.key ?? 'node') as SideMode;
          renderSide();
        };
      });
    }

    // ── 선택 패널 ───────────────────────────────────────────────────────────
    function renderSide(): void {
      // 패널을 다시 그릴 때마다 고른 것이 바뀌었을 수 있다 — 작은 도구 줄도 따라 움직인다.
      queueMicrotask(placeMini);
      renderSideBody();
      // 패널은 통째로 다시 그려지므로 읽어 줄 이름도 그때마다 다시 붙인다.
      nameIconButtons(sideEl);
      // 패널이 비어 있어도(고른 것 없음) 탭은 남긴다 — 탭이 사라지면 갈 곳이 안 보인다.
      if (sideEl.classList.contains('hidden')) {
        sideEl.classList.remove('hidden');
        // 아무것도 안 골랐을 때의 옆 패널은 지금까지 **죽은 자리**였다. 처음 여는 사람에게
        // 가장 필요한 것(무엇을 만들 건가요)을 여기 둔다 — 캔버스 제스처와 안 싸우는 유일한 자리다.
        const intents = INTENTS.filter((it) => sampleFor(it.packId));
        /* ★ 앞줄은 **셋만** — 넷이 되면 고르기가 다시 어려워진다(F1 에서 배운 것).
           그런데 견본은 여섯 갈래가 이미 있고, 카드게임·구상·조직으로 온 사람에게 「작품 관계도」는
           남의 옷이다. 그래서 나머지 셋은 **한 줄 뒤에** 둔다 (TASK-KL-271 F4) — 있는 것을
           숨기지 않되 앞줄을 안 늘린다. 한 번 편 사람에게는 계속 펴 둔다. */
        const more = MORE_INTENTS.filter((it) => sampleFor(it.packId));
        const moreOpen = spec._meta?.moreIntents === 'on';
        // 빈 판에서는 **묻는 말이 맨 위**다. 「고르면 여기서 고칩니다」를 위에 두면 정작 첫 할 일이
        // 그 아래로 밀려 안 보인다(고를 것이 아직 하나도 없는데 고르라는 안내가 먼저 나온다).
        const pickHint = t('karmograph.renderSide.msg');
        const empty = spec.nodes.length === 0 && intents.length > 0;
        // 폰에서는 갈래 고르기가 **접힌 시트 안**에 있어 첫 화면에서 아예 안 보였다.
        // 빈 판이면 시트를 올려 둔다 — 덮을 그림도 아직 없다.
        if (empty) raiseSheet();
        sideEl.innerHTML = (empty ? '' : pickHint) +
          (!empty ? '' : `
            <div class="km-field">
              <label>${esc(t('karmograph.renderSide.msg2'))}</label>
              <div class="km-hint">${t('karmograph.packHint', { what: `<b>${esc(t('karmograph.renderSide.msg3'))}</b>` })}</div>
              <div class="km-intent">${intents.map((it) => `
                <button data-km="intent" data-key="${it.packId}">
                  <span class="km-intent-ico">${it.icon}</span>
                  <span class="km-intent-t">${escapeHtml(it.title)}</span>
                  <span class="km-intent-s">${escapeHtml(it.sub)}</span>
                </button>`).join('')}</div>
              ${more.length === 0 || moreOpen ? '' : `<button class="btn btn-ghost km-intent-more"
                data-km="intent-more">${esc(t('karmograph.intent.more'))}</button>`}
              ${!moreOpen ? '' : `<div class="km-intent">${more.map((it) => `
                <button data-km="intent" data-key="${it.packId}">
                  <span class="km-intent-ico">${it.icon}</span>
                  <span class="km-intent-t">${escapeHtml(it.title)}</span>
                  <span class="km-intent-s">${escapeHtml(it.sub)}</span>
                </button>`).join('')}</div>`}
              <!-- ★ **이미 글로 적어 둔 사람**에게는 갈래 고르기가 한 걸음 돌아가는 길이다
                   (TASK-KL-271 F5). 메모장의 인물 목록·위키 개요를 그대로 붙여넣으면 판이 된다 —
                   그 기능은 있었는데 ⋯서랍 깊이 있어 첫 화면에서 안 보였다. 새 길은 안 낸다:
                   기존 「글로 만들기」 단추를 눌러 준다. -->
              <button class="btn btn-ghost km-intent-text" data-km="intent-text">${
                esc(t('karmograph.intent.fromText'))}</button>
            </div>`);
        // 갈래를 고른 **뒤**가 진짜 막히는 자리다 — 견본은 깔렸는데 「이제 뭘 하지?」.
        // 다음 걸음 셋만 짧게 보여 주고, 한 번 닫으면 다시 안 뜬다(맵마다 기억한다).
        if (spec.nodes.length > 0 && spec._meta?.tips !== 'off') {
          const tips = document.createElement('div');
          tips.className = 'km-field';
          tips.innerHTML = t('karmograph.renderSide.msg4')
            + t('karmograph.renderSide.msg5')
            + t('karmograph.renderSide.msg6')
            + t('karmograph.renderSide.msg7')
            + t('karmograph.renderSide.msg8');
          sideEl.appendChild(tips);
          (tips.querySelector('[data-km="tips-off"]') as HTMLButtonElement).onclick = () => {
            spec._meta = { ...spec._meta, tips: 'off' };
            persistStructure();
            renderSide();
          };
          /* ★ **견본을 지우는 길** (TASK-KL-271 F6). 견본을 깔아 주는 것까지는 했는데, 「이제 이걸
             지우고 내 걸로 시작하고 싶다」는 길이 ⋯서랍 맨 밑 빨간 단추뿐이었다 — 처음 온 사람이
             누르기엔 무서운 자리다. 아직 **손대지 않은 견본일 때만** 여기 한 줄로 내놓는다
             (한 장이라도 고치면 자국과 안 맞아 저절로 사라진다 — 남의 작업을 지울 위험이 없다). */
          if (spec._meta?.sampleFp === `${spec.nodes.length}:${spec.edges.length}`) {
            const wipe = document.createElement('button');
            wipe.className = 'btn btn-ghost km-wipe';
            wipe.dataset.km = 'sample-wipe';
            wipe.textContent = t('karmograph.sample.wipe');
            wipe.onclick = () => {
              lastAction = t('karmograph.sample.wipeAct');
              spec.nodes = [];
              spec.edges = [];
              const meta = { ...spec._meta };
              delete meta.sampleFp;   // 자국을 지운다 — 빈 판에 「견본 지우기」가 또 뜨면 안 된다
              spec._meta = meta;
              applySpec();
              persistStructure();
              renderSide();
              Toolbox.showToast?.(t('karmograph.sample.wipeDone'), undefined, undefined);
            };
            tips.appendChild(wipe);
          }
        }
        const moreBtn = sideEl.querySelector('[data-km="intent-more"]') as HTMLButtonElement | null;
        if (moreBtn) {
          moreBtn.onclick = () => {
            spec._meta = { ...spec._meta, moreIntents: 'on' };
            persistStructure();
            renderSide();
          };
        }
        const textBtn = sideEl.querySelector('[data-km="intent-text"]') as HTMLButtonElement | null;
        if (textBtn) {
          textBtn.onclick = () => {
            (root.querySelector('[data-km="from-text"]') as HTMLButtonElement | null)?.click();
          };
        }
        sideEl.querySelectorAll('[data-km="intent"]').forEach((btn) => {
          (btn as HTMLButtonElement).onclick = () => {
            const packId = (btn as HTMLElement).dataset.key ?? DEFAULT_PACK_ID;
            const s1 = sampleFor(packId);
            if (!s1) return;
            // 갈래를 골라도 **팩을 갈아치우지는 않는다**. 종류 목록은 어차피 모든 갈래가 함께 보이고,
            // 팩을 바꾸면 이미 놓인 것들의 기본 종류까지 흔들려 「모든 주제가 공존」이 깨진다.
            const before = spec.nodes.length;
            const kind0 = packById(packId).nodeKinds[0];
            buildFromOutline(s1.outline, kind0.id);
            // 「이건 아직 손 안 댄 견본이다」 자국 (TASK-KL-271 F6). 한 장이라도 늘거나 줄면
            // 자국과 안 맞아 「견본 지우기」가 저절로 사라진다 — 남의 작업을 지울 위험이 없다.
            spec._meta = { ...spec._meta, sampleFp: `${spec.nodes.length}:${spec.edges.length}` };
            // 칸 틀은 이제 카드가 태어날 때 함께 심긴다(seedFields) — 견본도 같은 길을 탄다.
            void before;
            applySpec();
            persistStructure();
            /* ★ 판을 깔았으면 **묻기를 그만둔다** (TASK-KL-271 F1 / D6).
               여기서 옆 패널을 다시 그리지 않아서, 견본 네 장이 깔린 뒤에도 「무엇을 만들
               건가요?」 카드 셋이 그대로 떠 있었다 — 이미 한 일을 계속 묻는 화면이었다
               (실측: 카드 4장인데 갈래 고르개 3개 그대로). 고르개는 빈 판일 때만 나온다. */
            renderSide();
            Toolbox.showToast?.(t('karmograph.renderSide.msg9'), undefined, undefined);
          };
        });
      }
      // 👁 보기 전용에서도 **코멘트만은 열어 둔다** — 받은 사람이 「여기 이상해요」를 남길 유일한 칸이고,
      // 그 말이 없으면 공유는 일방적인 그림 던지기가 된다. 나머지 칸은 잠근다(잠긴 칸은 회색으로 보인다).
      if (readOnly) {
        sideEl.querySelectorAll('input, select, textarea, button').forEach((el) => {
          const key = (el as HTMLElement).dataset.km ?? '';
          const isComment = key.startsWith('cmt-');
          const isNav = key === 'tab' || key.startsWith('go-') || key === 'fork';
          if (isComment || isNav) return;
          (el as HTMLInputElement).disabled = true;
        });
      }
      prependTabs();
      ensureSheetGrip();
    }

    /**
     * **시점 줄** (TASK-KL-271 X2) — 넓은 화면은 판 아래, 폰은 판 위. 시점이 없으면 아예 안 그린다.
     * 「1부에서는 소꿉친구, 2부에서는 라이벌」을 담으려면 먼저 **시점이 있어야** 한다.
     */
    /** 지금 **이름을 고치고 있는** 시점 id — 비면 아무것도 안 고치는 중. */
    let renamingTime: string | null = null;
    function timesNow(): TimePoint[] { return (spec.times ?? []) as TimePoint[]; }
    function timeNow(): string { return spec._meta?.time ?? ''; }

    function renderTimes(): void {
      const bar = q<HTMLElement>('times');
      const list = timesNow();
      if (list.length === 0) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
      const now = timeNow() || list[0].id;
      bar.classList.remove('hidden');
      bar.innerHTML = `<button class="btn btn-ghost" data-km="time-prev" title="${esc(t('karmograph.time.prev'))}"
          aria-label="${esc(t('karmograph.time.prev'))}">‹</button>`
        + list.map((tp) => (tp.id === renamingTime
          ? `<input data-km="time-name" value="${escapeAttr(tp.name)}"
              aria-label="${esc(t('karmograph.time.rename'))}" />`
          : `<button class="btn btn-ghost${tp.id === now ? ' is-on' : ''}"
            data-km="time-go" data-key="${escapeAttr(tp.id)}"
            title="${esc(t('karmograph.time.renameHint'))}">${esc(tp.name)}</button>`)).join('')
        + `<button class="btn btn-ghost" data-km="time-next" title="${esc(t('karmograph.time.next'))}"
          aria-label="${esc(t('karmograph.time.next'))}">›</button>`
        // ★ 남의 판을 보는 중(보기 전용)에는 **오가는 것만** 준다 — 이름 바꾸기·지우기는 고치는 손이다.
        //   보이기만 해도 「고쳐도 되나」를 묻게 되고, 눌리면 받은 판이 말없이 달라진다.
        + (readOnly ? '' : `<button class="btn btn-ghost" data-km="time-rename" title="${esc(t('karmograph.time.rename'))}"
          aria-label="${esc(t('karmograph.time.rename'))}">✎</button>`
        + `<button class="btn btn-ghost" data-km="time-del" title="${esc(t('karmograph.time.del'))}"
          aria-label="${esc(t('karmograph.time.del'))}">✕</button>`);
      const goTo = (id: string): void => {
        spec._meta = { ...spec._meta, time: id };
        canvas?.render();     // 렌즈만 바뀌었다 — 자료는 그대로라 다시 그리기만 하면 된다
        persistStructure();
        renderTimes();
      };
      bar.querySelectorAll('[data-km="time-go"]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => goTo((el as HTMLElement).dataset.key ?? '');
      });
      (bar.querySelector('[data-km="time-prev"]') as HTMLButtonElement).onclick =
        () => goTo(stepTime(list, now, -1));
      (bar.querySelector('[data-km="time-next"]') as HTMLButtonElement).onclick =
        () => goTo(stepTime(list, now, 1));
      const renameBtn = bar.querySelector('[data-km="time-rename"]') as HTMLButtonElement | null;
      const delBtn = bar.querySelector('[data-km="time-del"]') as HTMLButtonElement | null;
      if (!renameBtn || !delBtn) return;   // 보기 전용 — 고치는 단추가 아예 없다
      renameBtn.onclick = () => {
        renamingTime = now;
        renderTimes();
      };
      // 칩을 두 번 누르는 것도 같은 길 — 이름을 고치려는 손은 대개 이름을 먼저 누른다.
      bar.querySelectorAll('[data-km="time-go"]').forEach((el) => {
        (el as HTMLElement).ondblclick = () => {
          renamingTime = (el as HTMLElement).dataset.key ?? '';
          renderTimes();
        };
      });
      const nameEl = bar.querySelector('[data-km="time-name"]') as HTMLInputElement | null;
      if (nameEl) {
        nameEl.focus();
        nameEl.select();
        const keep = (): void => {
          const at2 = timesNow().find((x) => x.id === renamingTime);
          const name = nameEl.value.trim();
          // 이름을 통째로 지우면 **원래 이름**을 둔다 — 이름 없는 시점은 고를 수가 없다.
          if (at2 && name) {
            spec.times = timesNow().map((x) => (x.id === renamingTime ? { ...x, name } : x));
            persistStructure();
          }
          renamingTime = null;
          renderTimes();
        };
        nameEl.onkeydown = (ev) => {
          ev.stopPropagation();   // 안 막으면 Delete·화살표가 판의 카드를 건드린다
          if (ev.key === 'Enter') { ev.preventDefault(); keep(); }
          if (ev.key === 'Escape') { ev.preventDefault(); renamingTime = null; renderTimes(); }
        };
        // 다른 데를 누르면 적은 대로 둔다(적어 놓고 딴 데를 눌렀다고 지우면 화가 난다).
        nameEl.onblur = () => { if (renamingTime) keep(); };
      }
      delBtn.onclick = async () => {
        const at = list.find((x) => x.id === now);
        if (!at || !await askNote(t('karmograph.time.delAsk', { name: at.name }), t('karmograph.ask.del'))) return;
        lastAction = t('karmograph.time.delAct');
        // 시점을 지우면 **그 시점에 적어 둔 얼굴도 함께** 지운다 — 안 지우면 아무도 못 보는 자료가 남는다.
        spec.edges = forgetTime(spec.edges, now) as typeof spec.edges;
        spec.times = list.filter((x) => x.id !== now);
        spec._meta = { ...spec._meta, time: spec.times[0]?.id ?? '' };
        applySpec();
        persistStructure();
        renderTimes();
      };
    }

    /** 표에서 지금 무엇을 기준으로 줄 세웠나 — 판을 다시 그려도 이어진다. */
    let tableSort: TableSort = { by: '', dir: 'up' };

    /**
     * ▤ **같은 자료를 표로** (TASK-KL-271 L4, Notion 뷰 계보).
     * 판은 「누가 누구와 이어졌나」에 강하고 「빠짐없이 훑기」에 약하다 — 카드가 흩어져 있어
     * 눈이 순서를 못 잡는다. 판을 대신하려는 게 아니라 **같은 자료의 다른 렌즈**라서,
     * 줄을 누르면 그 카드가 판에서도 골라진다.
     */
    function renderTablePanel(): void {
      const live = canvas?.getSpec() ?? spec;
      const cols = tableColumns(live.nodes);
      const rows = sortRows(tableRows(live.nodes, cols), tableSort, (k) => kindLabel(k));
      const arrow = (key: string): string => (tableSort.by !== key ? '' : (tableSort.dir === 'up' ? ' ▲' : ' ▼'));
      const head = [{ key: '', name: t('karmograph.table.name') }, { key: 'kind', name: t('karmograph.table.kind') }]
        .concat(cols.map((c) => ({ key: c, name: c })));
      sideEl.classList.remove('hidden');
      sideEl.innerHTML = `
        <div class="km-hint">${esc(t('karmograph.table.hint', { n: String(rows.length) }))}</div>
        <div class="km-tablewrap"><table class="km-tbl">
          <thead><tr>${head.map((h) => `<th><button class="btn btn-ghost" data-km="tbl-sort"`
            + ` data-key="${escapeAttr(h.key)}">${esc(h.name)}${arrow(h.key)}</button></th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr data-km="tbl-row" data-key="${escapeAttr(r.id)}">
            <td>${esc(r.label || t('karmograph.unnamed'))}</td>
            <td>${esc(kindLabel(r.kind))}</td>
            ${cols.map((c) => `<td>${esc(r.cells[c])}</td>`).join('')}
          </tr>`).join('')}</tbody>
        </table></div>`;
      sideEl.querySelectorAll('[data-km="tbl-sort"]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => {
          tableSort = nextSort(tableSort, (el as HTMLElement).dataset.key ?? '');
          renderSide();
        };
      });
      sideEl.querySelectorAll('[data-km="tbl-row"]').forEach((el) => {
        (el as HTMLElement).onclick = () => {
          const id = (el as HTMLElement).dataset.key ?? '';
          selectedId = id;
          canvas?.setSelectedNode(id);
          sideMode = 'node';
          renderSide();
        };
      });
    }

    function renderSideBody(): void {
      if (selectedId || selectedEdgeId) raiseSheet();
      if (sideMode === 'groups') {
        renderGroupsPanel(panelCtx);
        return;
      }
      if (sideMode === 'table') {
        renderTablePanel();
        return;
      }
      if (sideMode === 'terms') {
        renderTermsPanel(panelCtx);
        return;
      }
      if (sideMode === 'filter') {
        renderFilterPanel(panelCtx);
        return;
      }
      if (sideMode === 'many') {
        renderManyPanel(panelCtx);
        return;
      }
      if (sideMode === 'text') {
        renderTextPanel(panelCtx);
        return;
      }
      if (sideMode === 'sna') {
        renderSnaPanel(panelCtx);
        return;
      }
      if (sideMode === 'notes') {
        renderNotesPanel(panelCtx);
        return;
      }
      if (sideMode === 'stamps') {
        renderStampsPanel(panelCtx);
        return;
      }
      if (sideMode === 'storage') {
        renderStoragePanel(panelCtx);
        return;
      }
      if (sideMode === 'edge') {
        renderEdgePanel(panelCtx);
        return;
      }
      if (sideMode === 'help') {
        renderHelpPanel(panelCtx);
        return;
      }
      const node = spec.nodes.find((n) => n.id === selectedId);
      if (!node) {
        sideEl.classList.add('hidden');
        sideEl.innerHTML = '';
        canvas?.setSelectedNode(null);
        return;
      }
      canvas?.setSelectedNode(node.id);
      sideEl.classList.remove('hidden');

      /** 접어 둔 칸에 **이미 적힌 것**이 있나 — 있으면 열어 둔다(숨은 내 글 = 잃어버린 글). */
      const showMore = (n: GraphNode): boolean => moreOpen || nodeHasExtras(n);
      const nodeHasExtras = (n: GraphNode): boolean => Boolean(
        n.group || n.groups?.length || n.shape || n.attachedTo || n.rotate || n.avatar
        || n.doc || n.docRef || spec.comments?.some((c) => c.on === n.id),
      );
      const related = spec.edges.filter((e) => e.from === node.id || e.to === node.id);
      const labelOf = (id: string): string => spec.nodes.find((n) => n.id === id)?.label ?? id;

      /* 👁 **보기 전용은 읽는 화면이다** (TASK-KL-271 O3). 예전엔 편집 화면이 회색으로 잠긴 채
         나왔다 — 안 눌리는 입력칸이 가득한 「고장 난 폼」. 게다가 정작 읽을 것(설명)은 「더 보기」
         뒤에 접혀 있어, 받은 사람이 가장 하고 싶은 일이 가장 멀었다. 코멘트만 남기고 글로 낸다. */
      if (readOnly) {
        const links = related.map((e) => ({
          label: e.label || edgeLabel(e.kind),
          other: labelOf(e.from === node.id ? e.to : e.from),
        }));
        sideEl.innerHTML = readCardHtml(panelCtx, node, resolveDoc(spec, node), links)
          + commentsSectionHtml(panelCtx, node.id);
        // 읽는 화면에서 할 수 있는 일은 코멘트 하나뿐 — 남기면 저장하고 그 자리만 다시 그린다.
        bindCommentsSection(panelCtx, node.id, () => { persistStructure(); renderSide(); });
        prependTabs();
        ensureSheetGrip();
        return;
      }

      sideEl.innerHTML = `
        <!-- 머리에는 **이 카드가 무엇인지**를 적는다. 「노드」는 프로그램 말이지 사람 말이 아니고,
             바로 위 탭이 이미 「고른 것」이라 같은 말이 두 번 나오기도 했다. -->
        <h4>${kindIcon(node.kind)} ${esc(kindLabel(node.kind))}</h4>
        ${(() => {
          /* ★ **이 카드가 얼마나 익었나** (TASK-KL-271 L5, Heptabase 계보). 관계망 칸의 「아직 안
             적은 칸」이 판 전체를 말한다면 이건 이 카드 한 장이다 — 고쳐 쓰는 그 자리에서 남은
             칸 수를 말해 준다. 다 적은 카드에는 아무 말도 안 한다(그건 잔소리다). */
          const r = ripenessOf(node);
          return !worthNudging(r) ? '' : `<div class="km-ripe">${esc(t(
            r.ripe === 'seed' ? 'karmograph.ripe.seed' : 'karmograph.ripe.growing',
            { filled: String(r.filled), total: String(r.total), left: String(r.total - r.filled) },
          ))}</div>`;
        })()}
        ${!shouldOfferFocus(spec.nodes.length, Boolean(focusDegree), true) ? '' : `
        <!-- ★ 판이 커지면 전체 그림은 아무 말도 안 한다(KL-271 L1). 그렇다고 말없이 감추지는
             않는다 — 적어 둔 카드가 소리 없이 사라지면 「내 것이 없어졌다」가 된다. 권하기만 한다. -->
        <button class="btn btn-ghost km-offer" data-km="focus-offer">${esc(t('karmograph.crowd.offer', {
          n: String(spec.nodes.length),
        }))}</button>`}
        <div class="km-field">
          <!-- ★ 이름표는 for 속성으로 칸에 **묶여 있어야** 한다. 나란히 놓기만 하면 화면 읽어 주는
               도구에는 「글자 칸」이라고만 들린다 — 이 판에서 가장 많이 쓰는 칸인데도 (실측 2026-08-14). -->
          <label for="km-edit-label">${esc(t('karmograph.labelOf.msg'))}</label>
          <input type="text" id="km-edit-label" data-km="edit-label" value="${escapeAttr(node.label)}" />
        </div>
        <div class="km-field">
          <div class="km-kindrow">
            <label for="km-kind-list">${esc(t('karmograph.labelOf.msg2'))}</label>
            <input type="text" class="km-kind-find" data-km="kind-find" placeholder="${esc(t('karmograph.kindFind.ph'))}"
              aria-controls="km-kind-list" />
          </div>
          <select id="km-kind-list" data-km="edit-kind">${nodeKindOptions(node.kind)}</select>
        </div>
        <div class="km-field">
          <label>${esc(t('karmograph.labelOf.msg3'))}</label>
          <input type="text" data-km="edit-note" value="${escapeAttr(node.note ?? '')}" placeholder="${esc(t('karmograph.editNote.ph'))}" />
        </div>
        <!-- ★ 첫 카드부터 칸을 열다섯 개 펼쳐 놓으면 **한 줄 적으려던 사람이 지친다**
             (2026-08-12 사용자 검토: 이름 하나 넣으려는데 꼬리표·칸 3개·코멘트·설명이 한꺼번에 열렸다).
             자주 쓰는 셋(이름·종류·한마디)만 남기고 나머지는 **접어 둔다.**
             이미 적힌 것이 하나라도 있으면 열어 둔다 — 접힌 자리에 내 글이 숨으면 그건 잃어버린 것이다. -->
        ${tagsFieldHtml(panelCtx, node)}
        ${fieldsSectionHtml(panelCtx, node)}
        <!-- ★ **적는 칸**(꼬리표·칸·코멘트·설명)은 그대로 두고, **꾸미는 칸**만 접는다.
             모양·얼굴·기울기·소속·붙이기는 처음 30분에 한 번도 안 쓰는데 자리는 제일 많이 먹었다
             (2026-08-12 사용자 검토: 한 줄 적으려던 사람이 칸 열다섯을 만난다).
             이미 꾸며 둔 카드는 펼쳐 둔다 — 접힌 자리에 내가 한 것이 숨으면 그건 잃어버린 것이다. -->
        <!-- ★ 보기 전용(공유 링크)에서는 **코멘트가 유일하게 할 수 있는 일**이다 — 접으면 안 된다.
             받은 사람에게 남길 말조차 「더 보기」 뒤에 있으면 공유가 일방적인 그림 던지기가 된다. -->
        ${readOnly ? commentsSectionHtml(panelCtx, node.id) : ''}
        <button class="btn btn-ghost" data-km="more-toggle">${
          showMore(node) ? t('karmograph.side.less') : t('karmograph.side.more')}</button>
        ${!showMore(node) ? '' : `
          ${readOnly ? '' : commentsSectionHtml(panelCtx, node.id)}
          ${docFieldHtml(panelCtx, node)}
          ${membershipFieldHtml(panelCtx, node)}
          ${shapeFieldHtml(panelCtx, node, shapes())}
          ${attachFieldHtml(panelCtx, node)}
          ${tiltFieldHtml(panelCtx, node)}
          ${avatarFieldHtml(panelCtx, node)}
        `}
        <div data-km="link-sections">${renderLinkSections(panelCtx, node)}</div>
        <div class="km-field">
          <label>${esc(t('karmograph.labelOf.msg4'))}</label>
          <select data-km="link-kind">${edgeKindOptions()}</select>
          <!-- 손으로는 카드 오른쪽 점을 끌면 된다 — 이 단추는 **자판·화면낭독기로 쓰는 길**이다
               (KL-271 R1: 같은 일을 하던 카드 위 ↝ 는 지웠다). -->
          <button class="btn btn-ghost" data-km="link-start">${linkingFrom === node.id ? t('karmograph.linkStart.label') : t('karmograph.linkStart.label2')}</button>
          <div class="km-hint">${esc(t('karmograph.linkStart.hint'))}</div>
          ${linkingFrom === node.id ? t('karmograph.labelOf.msg5') : ''}
        </div>
        <div class="km-field">
          <label>${esc(t('karmograph.links.count', { n: String(related.length) }))}</label>
          ${
            related.length === 0
              ? t('karmograph.labelOf.msg6')
              : related
                  .map((e) => {
                    const outgoing = e.from === node.id;
                    const peer = outgoing ? e.to : e.from;
                    return `<div class="km-edge-row" data-edge="${escapeAttr(e.id)}">
                      <span class="km-edge-peer" title="${escapeAttr(labelOf(peer))}">${outgoing ? '→' : '←'} ${escapeHtml(labelOf(peer))}</span>
                      <select data-km="edge-kind">${edgeKindOptions(e.kind)}</select>
                      <button class="btn btn-ghost" data-km="edge-both" title="${esc(t('karmograph.edgeBoth.title'))}">${e.arrowStart ? '↔' : '→'}</button>
                      <button class="btn btn-ghost" data-km="edge-del" title="${esc(t('karmograph.edgeDel.title'))}">×</button>
                      <input type="text" data-km="edge-label" class="km-edge-label" value="${escapeAttr(e.label ?? '')}" placeholder="${esc(t('karmograph.edgeLabel.ph'))}" />
                    </div>`;
                  })
                  .join('')
          }
        </div>
        <button class="btn btn-ghost" data-km="node-copy">${esc(t('karmograph.nodeCopy.label'))}</button>
        <button class="btn btn-ghost" data-km="node-link">${esc(t('karmograph.nodeLink.label'))}</button>
        <button class="btn btn-ghost" data-km="node-dive">${node.subMap ? t('karmograph.nodeDive.label') : t('karmograph.nodeDive.label2')}</button>
        <button class="btn btn-danger" data-km="node-del">${esc(t('karmograph.nodeDel.label'))}</button>`;

      // 이름 편집 — 입력할 때마다 반영 (폭도 같이 조정)
      const labelInput = sideEl.querySelector('[data-km="edit-label"]') as HTMLInputElement;
      // 판 위 편집칸이 떠 있는 채로 옆 패널에서 고치면, 그 칸이 닫힐 때 **옛 글자로 되돌린다.**
      // 두 입구가 같은 값을 들고 있으면 늦게 닫히는 쪽이 이긴다 — 그래서 여기로 오면 그쪽을 접는다.
      labelInput.onfocus = () => closeInline(false);
      labelInput.oninput = () => {
        node.label = labelInput.value;
        resize(node);
        canvas?.render();
        canvas?.setSelectedNode(node.id);
        persistStructure();
      };

      /** 얼굴·모양·한마디는 전부 「고치면 즉시 다시 그리고 저장」 — 같은 뒷정리를 쓴다. */
      const touch = (redrawSide: boolean): void => {
        resize(node);
        canvas?.render();
        canvas?.setSelectedNode(node.id);
        persistStructure();
        if (redrawSide) renderSide();
      };

      bindTagsField(panelCtx, node);
      bindFieldsSection(panelCtx, node, touch);
      if (showMore(node) || readOnly) bindCommentsSection(panelCtx, node.id, touch);

      // 링크 목록만 다시 그린다 — 패널 전체를 다시 그리면 타자 치던 커서가 날아간다.
      if (showMore(node)) bindDocField(panelCtx, node, touch, () => {
        const holder = sideEl.querySelector('[data-km="link-sections"]');
        if (holder) {
          holder.innerHTML = renderLinkSections(panelCtx, node);
          bindLinkSections(panelCtx, selectedId);
        }
      });

      // 「더 적기」 — 첫 카드부터 칸 열다섯을 펼치지 않는다(사용자 검토 2026-08-12).
      const moreBtn = sideEl.querySelector('[data-km="more-toggle"]') as HTMLButtonElement | null;
      if (moreBtn) moreBtn.onclick = () => { moreOpen = !showMore(node); renderSide(); };

      const noteInput = sideEl.querySelector('[data-km="edit-note"]') as HTMLInputElement;
      noteInput.oninput = () => {
        node.note = noteInput.value.trim() || undefined;
        touch(false);
      };

      if (showMore(node)) {
        bindMembershipField(panelCtx, node);
        bindAttachField(panelCtx, node, touch);
      }

      // 파고들기 — 한 판에 다 그리면 곧 못 읽는다. 카드 하나를 **그 안의 판**으로 열어 층을 나눈다.
      // 처음 누르면 그 이름으로 새 판을 만들고, 다음부터는 그 판으로 간다(카드에는 ⤵ 가 붙는다).
      (sideEl.querySelector('[data-km="node-dive"]') as HTMLButtonElement).onclick = () => {
        if (!node.subMap) {
          const added = addMap(library, node.label || t('karmograph.untitledMap'));
          library = added.index;
          node.subMap = added.id;
          persistStructure();
          renderMapList();
          Toolbox.showToast?.(t('karmograph.innerMapMade', { name: node.label }), undefined, undefined);
        }
        const target = node.subMap;
        if (!target || !library.maps.some((m) => m.id === target)) {
          Toolbox.showToast?.(t('karmograph.nodeDive.label3'), undefined, undefined);
          node.subMap = undefined;
          persistStructure();
          renderSide();
          return;
        }
        library = setActive(library, target);
        renderMapList();
        openActiveMap();
      };

      // 이 카드로 바로 오는 주소 — 큰 그림을 보낼 때 「어디를 보라는 건지」를 말로 설명하지 않게.
      (sideEl.querySelector('[data-km="node-link"]') as HTMLButtonElement).onclick = () => {
        const live = canvas?.getSpec() ?? spec;
        void encodeShare(live).then(async (code) => {
          const url = withNodeAnchor(buildShareUrl(new URL(location.href), code, true), node.id);
          if (url.length > SHARE_URL_LIMIT) {
            showNote(t('karmograph.nodeLink.label2'));
            return;
          }
          try {
            await navigator.clipboard.writeText(url);
            Toolbox.showToast?.(t('karmograph.nodeLink.label3'), undefined, undefined);
          } catch {
            showLinkBox(url);
          }
        });
      };

      // 복제 — 같은 설정 그대로 옆에 하나 더 (레퍼런스의 「カード複製」).
      (sideEl.querySelector('[data-km="node-copy"]') as HTMLButtonElement).onclick = () => {
        const taken = new Set(spec.nodes.map((n) => n.id));
        const copy: GraphNode = {
          ...JSON.parse(JSON.stringify(node)) as GraphNode,
          id: nextId('node', taken),
          x: node.x + 24,
          y: node.y + 24,
        };
        spec.nodes.push(copy);
        selectedId = copy.id;
        applySpec();
        persistStructure();
        renderSide();
      };

      if (showMore(node)) bindLookFields(panelCtx, node, touch);

      if (showMore(node)) bindAvatarField(panelCtx, node, touch);

      // 타이핑하면 목록이 좁아진다. 고르는 값은 그대로 두고 **보이는 것만** 줄인다 —
      // 걸러진 사이에 고른 값이 사라지면 「내가 뭘 골랐는지」를 잃는다.
      const kindFind = sideEl.querySelector('[data-km="kind-find"]') as HTMLInputElement | null;
      const kindSel = sideEl.querySelector('[data-km="edit-kind"]') as HTMLSelectElement;
      if (kindFind) {
        kindFind.oninput = () => {
          const q0 = kindFind.value.trim().toLowerCase();
          kindSel.querySelectorAll('option').forEach((op) => {
            const hit = !q0 || (op.textContent ?? '').toLowerCase().includes(q0);
            (op as HTMLOptionElement).hidden = !hit && op.value !== kindSel.value;
          });
          kindSel.querySelectorAll('optgroup').forEach((g) => {
            const any = [...g.querySelectorAll('option')].some((op) => !(op as HTMLOptionElement).hidden);
            (g as HTMLOptGroupElement).hidden = !any;
          });
        };
      }

      (sideEl.querySelector('[data-km="edit-kind"]') as HTMLSelectElement).onchange = (ev) => {
        node.kind = (ev.target as HTMLSelectElement).value;
        canvas?.render();
        canvas?.setSelectedNode(node.id);
        persistStructure();
        renderSide();
      };

      (sideEl.querySelector('[data-km="link-start"]') as HTMLButtonElement).onclick = () => {
        linkingFrom = linkingFrom === node.id ? null : node.id;
        canvasEl.classList.toggle('km-linking', linkingFrom !== null);
        renderSide();
      };

      sideEl.querySelectorAll('.km-edge-row').forEach((rowEl) => {
        const row = rowEl as HTMLElement;
        const edgeId = row.dataset.edge ?? '';
        (row.querySelector('[data-km="edge-kind"]') as HTMLSelectElement).onchange = (ev) => {
          const edge = spec.edges.find((x) => x.id === edgeId);
          if (!edge) return;
          const oldPreset = edgeLabel(edge.kind);
          edge.kind = (ev.target as HTMLSelectElement).value;
          // 손으로 고쳐 쓴 말은 지키고, 프리셋 그대로였으면 새 프리셋으로 따라간다.
          if (!edge.label || edge.label === oldPreset) edge.label = edgeLabel(edge.kind);
          canvas?.render();
          canvas?.setSelectedNode(node.id);
          persistStructure();
          renderSide();
        };
        (row.querySelector('[data-km="edge-label"]') as HTMLInputElement).oninput = (ev) => {
          const edge = spec.edges.find((x) => x.id === edgeId);
          if (!edge) return;
          edge.label = (ev.target as HTMLInputElement).value;
          canvas?.render();
          canvas?.setSelectedNode(node.id);
          persistStructure();
        };
        (row.querySelector('[data-km="edge-both"]') as HTMLButtonElement).onclick = (ev) => {
          const edge = spec.edges.find((x) => x.id === edgeId);
          if (!edge) return;
          edge.arrowStart = edge.arrowStart ? undefined : true;
          (ev.currentTarget as HTMLButtonElement).textContent = edge.arrowStart ? '↔' : '→';
          canvas?.render();
          canvas?.setSelectedNode(node.id);
          persistStructure();
        };
        (row.querySelector('[data-km="edge-del"]') as HTMLButtonElement).onclick = () => {
          spec.edges = spec.edges.filter((x) => x.id !== edgeId);
          for (const n of spec.nodes) if (n.attachedTo === edgeId) n.attachedTo = undefined;
          applySpec();
          persistStructure();
          renderSide();
        };
      });

      bindLinkSections(panelCtx, selectedId);

      (sideEl.querySelector('[data-km="node-del"]') as HTMLButtonElement).onclick = async () => {
        if (!await askNote(t('karmograph.confirmDeleteEdges', { name: node.label }), t('karmograph.ask.del'))) return;
        const goneEdges = new Set(
          spec.edges.filter((e) => e.from === node.id || e.to === node.id).map((e) => e.id)
        );
        forgetNodeEverywhere(node.id);
        spec.nodes = spec.nodes.filter((n) => n.id !== node.id);
        spec.edges = spec.edges.filter((e) => e.from !== node.id && e.to !== node.id);
        // 사라진 것을 가리키던 지시선은 함께 지운다 — 안 그러면 허공을 가리킨다.
        for (const n of spec.nodes) {
          if (n.attachedTo === node.id || (n.attachedTo && goneEdges.has(n.attachedTo))) n.attachedTo = undefined;
        }
        selectedId = null;
        linkingFrom = null;
        canvasEl.classList.remove('km-linking');
        applySpec();
        persistStructure();
        renderSide();
      };
    }

    /** spec → 캔버스 반영 + 빈 상태 안내 동기화. */
    function applySpec(): void {
      /* ★ **시점 렌즈** (TASK-KL-271 X2). 그릴 때만 선의 얼굴을 갈아 끼운다 — 자료는 그대로라
         저장·되돌리기는 원본을 쓴다. 시점을 안 쓰는 판에서는 렌즈가 아무 일도 안 한다. */
      if (canvas) {
        canvas.edgeFace = (e) => {
          const face = edgeAt(e, timeNow());
          if (!face) return null;
          return (face.label === (e.label ?? '') && face.kind === e.kind) ? e
            : { ...e, label: face.label, kind: face.kind };
        };
      }
      canvas?.setSpec(spec);
      renderTimes();
      syncEmptyHint();
      syncNextHint();
    }

    /**
     * **다음 걸음 한 줄** (2026-08-12 사용자 검토).
     *
     * 빈 판에는 안내가 있는데, 카드를 하나 만드는 순간 그 안내가 통째로 사라졌다 —
     * 처음 여는 사람이 「이제 뭘 하지」로 멈추는 자리가 바로 거기였다. 그래서 **다 익힐 때까지만**
     * 한 줄이 따라온다: 카드 하나 → 하나 더 · 카드 둘인데 선 0 → 잇는 법 · 선이 생기면 사라진다.
     * 안 배운 것만 말하므로 저절로 없어진다(끄는 단추가 필요 없다).
     */
    function syncNextHint(): void {
      const nodes = spec.nodes.length;
      const edges = spec.edges.length;
      const key = nodes === 0 || edges > 0 ? '' : nodes === 1 ? 'one' : 'link';
      const had = canvasEl.querySelector('.km-next');
      if (!key || readOnly) { had?.remove(); return; }
      const el = (had as HTMLElement | null) ?? document.createElement('div');
      el.className = 'km-next';
      const touch = window.matchMedia('(max-width: 720px)').matches;
      el.textContent = key === 'one'
        ? t(touch ? 'karmograph.next.oneTouch' : 'karmograph.next.one')
        : t(touch ? 'karmograph.next.linkTouch' : 'karmograph.next.link');
      if (!had) canvasEl.appendChild(el);
    }

    // ── 선 만들기 — 「연결 시작」 버튼과 손잡이 드래그가 같은 길을 쓴다 ──────
    function createEdge(from: string, to: string): void {
      const kindSel = sideEl.querySelector('[data-km="link-kind"]') as HTMLSelectElement | null;
      const kind = kindSel?.value || edgeKindsNow()[0].id;
      const dup = spec.edges.some(
        (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from)
      );
      if (dup) {
        Toolbox.showToast?.(t('karmograph.linkKind.label'), undefined, undefined);
        return;
      }
      const taken = new Set(spec.edges.map((e) => e.id));
      // 선을 놓으면 그 자리에서 무슨 관계인지 읽혀야 한다 — 프리셋 이름을 라벨로 얹는다.
      const edge: GraphEdge = {
        id: nextId('edge', taken), from, to, kind,
        label: edgeLabel(kind),
      };
      spec.edges.push(edge);
      applySpec();
      persistStructure();
    }

    // ── 고른 것 옆 작은 도구 줄 (Whimsical 의 맥락 툴바) ──────────────────────
    // 자주 쓰는 넷(잇기·쪽지·복제·지우기)은 **손이 있는 자리**에 있어야 한다. 옆 패널까지 가는
    // 왕복이 관계도를 그리는 리듬을 끊는다.
    const miniEl = q<HTMLElement>('mini');
    let miniRaf = 0;

    function placeMini(): void {
      miniRaf = 0;
      if (!selectedId) { miniEl.classList.add('hidden'); return; }
      const rect = canvas?.nodeScreenRect(selectedId);
      if (!rect) { miniEl.classList.add('hidden'); return; }
      miniEl.classList.remove('hidden');
      /* 카드 위쪽에 띄우되, 화면 위로 넘치면 아래로 내린다(안 그러면 도구가 잘려 안 눌린다).
         ★ 띄우는 높이는 **줄의 실제 키**로 잰다. 34 로 못 박아 두었더니, 손가락 규격에 맞춰
         줄이 58px 로 커진 폰에서 줄이 카드를 덮어 **카드 자체가 안 눌렸다**(실측 2026-08-14). */
      const bar = miniEl.getBoundingClientRect();
      const barH = Math.max(bar.height, 34);
      const above = rect.y - barH - 6;
      /* ★ 오른쪽도 막는다 — 판 오른쪽 끝의 카드를 고르면 줄이 **화면 밖으로 나갔다**
         (실측 2026-08-14 폰: 오른쪽 끝 472px > 화면 390px — 지우기·복제가 통째로 사라진다). */
      const room = canvasEl.clientWidth - Math.max(bar.width, 100) - 4;
      miniEl.style.left = `${Math.round(Math.min(Math.max(4, rect.x), Math.max(4, room)))}px`;
      miniEl.style.top = `${Math.round(above > 4 ? above : rect.y + rect.h + 6)}px`;
      followMini();
    }

    /** 캔버스를 끌거나 확대하면 자리가 어긋난다 — 고른 것이 있는 동안만 매 프레임 따라간다. */
    function followMini(): void {
      if (!selectedId || miniRaf) return;
      miniRaf = requestAnimationFrame(placeMini);
    }
    Toolbox.onDispose?.(() => { if (miniRaf) cancelAnimationFrame(miniRaf); });

    /* 테마를 바꾸면 판도 같이 바뀌어야 한다. 색은 그릴 때 값으로 박히므로(내보낸 SVG 가
       혼자 서려면 그래야 한다) 바뀐 순간 다시 읽어 넣는다. */
    const themeWatch = new MutationObserver(() => canvas?.setTheme(themeFromCss(canvasEl)));
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    Toolbox.onDispose?.(() => themeWatch.disconnect());

    /* ★ 카드 위 작은 도구줄의 「↝ 선 잇기」를 걷어냈다 (TASK-KL-271 R1).
       선을 잇는 길이 셋이었다 — ① 카드 오른쪽 점 끌기 ② 이 ↝ ③ 옆 패널 「연결 시작」.
       ②③ 은 **같은 것**이다(다음 클릭이 연결되는 모드로 들어간다) — 같은 일에 문이 둘이라
       둘 다 반쯤 배우게 된다. 손으로 끄는 길(①)이 가장 빠르고, 자판·화면낭독기로 쓰는 사람에게는
       옆 패널의 단추(③)가 남는다. 그림 하나짜리 ↝ 는 아무도 뜻을 못 맞히던 자리라 그것을 지웠다. */
    q<HTMLButtonElement>('mini-copy').onclick = () => {
      const node = spec.nodes.find((n) => n.id === selectedId);
      if (!node) return;
      const taken = new Set(spec.nodes.map((n) => n.id));
      const copy: GraphNode = {
        ...JSON.parse(JSON.stringify(node)) as GraphNode,
        id: nextId('node', taken), x: node.x + 24, y: node.y + 24,
      };
      spec.nodes.push(copy);
      selectedId = copy.id;
      applySpec();
      persistStructure();
      renderSide();
    };
    q<HTMLButtonElement>('mini-note').onclick = () => {
      const node = spec.nodes.find((n) => n.id === selectedId);
      if (!node) return;
      const taken = new Set(spec.nodes.map((n) => n.id));
      const memo: GraphNode = {
        id: nextId('node', taken), kind: node.kind, label: t('karmograph.shapes.msg4'), group: '',
        x: node.x + node.w + 40, y: node.y - 20, w: 160, h: NODE_H, ports: [],
        shape: 'note', rotate: -3, attachedTo: node.id,
      };
      spec.nodes.push(memo);
      selectedId = memo.id;
      applySpec();
      persistStructure();
      renderSide();
      (sideEl.querySelector('[data-km="edit-doc"]') as HTMLTextAreaElement | null)?.focus();
    };
    q<HTMLButtonElement>('mini-del').onclick = async () => {
      const node = spec.nodes.find((n) => n.id === selectedId);
      if (!node) return;
      if (!await askNote(t('karmograph.confirmDeleteEdges', { name: node.label }), t('karmograph.ask.del'))) return;
      forgetNodeEverywhere(node.id);
      spec.nodes = spec.nodes.filter((n) => n.id !== node.id);
      spec.edges = spec.edges.filter((e) => e.from !== node.id && e.to !== node.id);
      for (const n of spec.nodes) if (n.attachedTo === node.id) n.attachedTo = undefined;
      selectedId = null;
      applySpec();
      persistStructure();
      renderSide();
    };

    // ── 노드 클릭: 선택 또는 연결 ────────────────────────────────────────────
    function handleNodeClick(nodeId: string): void {
      if (linkingFrom && linkingFrom !== nodeId) {
        createEdge(linkingFrom, nodeId);
        linkingFrom = null;
        canvasEl.classList.remove('km-linking');
      }
      selectedId = nodeId;
      // 판 전체를 보는 칸(거르기·관계망·표…)은 안 뺏는다 — 규칙은 `ui-state.ts` 한 곳에 (KL-271 R6).
      const sel1 = { nodes: 1, edge: false };
      if (shouldSwitch(sideMode, sel1)) sideMode = panelFor(sel1);
      renderSide();
      syncFocus();
    }

    // ── 캔버스 생성 ─────────────────────────────────────────────────────────
    canvas = new GraphCanvas(canvasEl, {
      // 어댑터를 한 겹 감싼다 — 캔버스가 드래그 좌표를 저장하는 그 순간이
      // 「노드를 옮겼다」는 되돌릴 수 있는 한 걸음이기도 하다.
      persistAdapter: {
        load: () => store.load(),
        save: async (updates) => {
          await store.save(updates);
          snapshot(t('karmograph.act.move'));
        },
      },
      kindColors: kindColorsNow(),
      // 얼굴을 안 정한 카드의 동그라미에 **종류 그림**을 넣는다 — 색만으로는 인물·장소·사건이
      // 구별되지 않았다(2026-08-12 사용자 검토). 이름 첫 글자는 「누구」만 말하고 「무엇」은 안 말한다.
      kindIcons: ALL_KIND_ICONS,
      edgeKinds: edgeDefsNow(),
      // 판 색은 앱 테마에서 읽어 온다 — 안 그러면 밝은 테마에서 판만 까만 채로 남는다.
      theme: themeFromCss(canvasEl),
      onNodeClick: (id) => handleNodeClick(id),
      onBackgroundClick: () => {
        // 폰: 빈 곳을 누르면 시트가 내려간다 — 고를 것을 놓았으니 그림을 다시 크게 보고 싶은 것이다
        // (손잡이를 다시 찾아 누르게 하면 한 동작이 두 동작이 된다).
        root.classList.remove('is-sheet-up');
        selectedMany = [];
        selectedId = null;
        linkingFrom = null;
        canvasEl.classList.remove('km-linking');
        renderSide();
        syncFocus();
      },
      onBackgroundDoubleClick: (world) => spawnNodeAt(world.x, world.y, ''),
      onNodeResized: () => { persistStructure(); },
      // 겹쳐 놓으면 잇기 — 선 도구를 따로 찾지 않게(Scapple). 이미 이어진 쌍은 건너뛰고,
      // 이었으면 말해 준다(모르고 생긴 선이 제일 나쁘다). Ctrl+Z 로 되돌아간다.
      onNodeDropped: (draggedId, overId) => {
        const dup = spec.edges.some(
          (e) => (e.from === draggedId && e.to === overId) || (e.from === overId && e.to === draggedId),
        );
        if (dup) return;
        const taken = new Set(spec.edges.map((e) => e.id));
        const kind = edgeKindsNow()[0].id;
        spec.edges.push({ id: nextId('edge', taken), from: draggedId, to: overId, kind, label: edgeLabel(kind) });
        applySpec();
        persistStructure();
        Toolbox.showToast?.(t('karmograph.handleNodeClick.msg'), undefined, undefined);
      },
      // 선을 휘거나 이름표를 옮긴 뒤 — 캔버스가 spec 을 고쳤으니 저장만 하면 된다.
      onEdgeChanged: () => persistStructure(),
      onEdgeClick: (edgeId) => {
        selectedEdgeId = edgeId;
        selectedId = null;
        selectedMany = [];
        canvas?.setSelectedNodes([]);
        sideMode = 'edge';
        renderSide();
      },
      onGroupChanged: () => persistStructure(),
      onSelectMany: (ids) => {
        selectedMany = ids;
        selectedId = ids.length === 1 ? ids[0] : null;
        /* ★ 「고른 것이 패널을 정한다」 규칙은 이제 한 곳(`ui-state.ts`)에 산다 (KL-271 R6/C2).
           그리고 **판 전체를 보는 칸은 안 뺏는다** — 거르기를 맞추다 카드를 짚어 보는 일이 흔한데
           그때마다 화면이 튀면 하던 일이 끊긴다. 여럿·선을 고른 것은 「이제 이걸 할 거야」라 따라간다. */
        const sel = { nodes: ids.length, edge: false };
        if (shouldSwitch(sideMode, sel)) sideMode = panelFor(sel);
        renderSide();
      },
      /**
       * 손잡이를 **빈 곳**에 놓았다 — 거기에 새 카드를 세우고 곧바로 잇는다 (TASK-KL-271 R1).
       * 관계도에서 가장 흔한 동작은 「이 사람에게서 뻗어 나가는 또 한 사람」인데, 전에는
       * 「빈 곳 두 번 클릭 → 이름 → 다시 점 끌기」 세 걸음이었다. 이제 한 번 끄는 것으로 끝난다.
       */
      onConnectToEmpty: (fromId, world) => {
        const before = new Set(spec.nodes.map((n) => n.id));
        spawnNodeAt(world.x, world.y, '');
        const made = spec.nodes.find((n) => !before.has(n.id));
        if (!made) return;
        createEdge(fromId, made.id);
        selectedId = made.id;
        renderSide();
        /* 선을 그리면 판을 다시 그리므로 **막 열린 이름칸이 함께 지워진다**(실측: 카드와 선은
           생겼는데 이름칸만 없었다). 다 그린 뒤에 한 번 더 연다 — 끌던 손이 그대로 타자로 이어진다. */
        /* 이름칸은 **자리를 잴 수 있게 된 뒤에** 연다. 선을 그리면 판을 다시 그리는데, 그 그림이
           끝나기 전에는 새 카드의 자리를 못 재서(`nodeScreenRect` 가 빈손) 조용히 안 열린다
           (실측: 카드와 선은 생겼는데 이름칸만 없었다). 그림 수를 세어 맞히면 바쁜 기계에서 또
           어긋나므로, **될 때까지** 몇 그림 기다린다. 옆 패널 이름 칸이 포커스를 잡아도 닫히므로
           먼저 놓는다. */
        let tries = 12;
        const openWhenReady = (): void => {
          (document.activeElement as HTMLElement | null)?.blur?.();
          if (canvas?.nodeScreenRect(made.id)) { openInline(made.id); return; }
          if ((tries -= 1) > 0) requestAnimationFrame(openWhenReady);
        };
        requestAnimationFrame(openWhenReady);
      },
      onConnect: (fromId, toId) => {
        selectedId = fromId;
        createEdge(fromId, toId);
        renderSide();
      },
    });

    // ── 툴바 ────────────────────────────────────────────────────────────────
    /* ★ 「다음에 만들 카드의 종류」 드롭다운을 툴바에서 걷어냈다 (TASK-KL-271 P1).
       아무도 그걸 「다음에 만들 종류」로 안 읽는다 — 고른 카드의 종류로 오해하고, 정작 종류를
       바꾸는 자리는 옆 패널에 따로 있었다(같은 값에 문이 둘). 이제 새 카드는 **직전에 손으로 만든
       종류**를 따라가고(`lastNodeKind`, 첫 값은 갈래의 첫 종류로 드롭다운의 첫 값과 같다),
       바꾸는 일은 만든 그 자리에서 한다.
       ※ 견본을 깔거나 저장본을 열 때 이 값을 판 내용에서 다시 뽑는 안은 **일부러 안 넣었다** —
         카드가 태어날 때 그 종류의 칸이 함께 심기므로, 종류가 말없이 바뀌면 칸·거르기·연표가
         줄줄이 어긋난다(2026-08-13 실측: 화면검사 1 → 14 빨강). 그건 따로 한 묶음으로 다룬다. */

    /**
     * 그 자리에 노드를 놓는다. 이름이 비면 빈 이름으로 만들고 오른쪽 이름 칸에 커서를 준다 —
     * 빈 곳을 두 번 눌러 바로 타이핑하는 흐름(Scapple·FigJam)이 이 길로 온다.
     */
    function spawnNodeAt(worldX: number, worldY: number, label: string): void {
      const kind = lastNodeKind;
      const taken = new Set(spec.nodes.map((n) => n.id));
      const w = widthFor(label);
      const node: GraphNode = {
        id: nextId('node', taken),
        kind,
        label,
        group: '',
        x: Math.round(worldX - w / 2),
        y: Math.round(worldY - NODE_H / 2),
        w,
        h: NODE_H,
        ports: [],
      };
      lastAction = t('karmograph.act.add');
      seedFields(node);
      resize(node);
      lastNodeKind = kind;
      spec.nodes.push(node);
      applySpec();
      persistStructure();
      selectedId = node.id;
      renderSide();
      // ★ 이름은 **카드 위에서** 받는다 (2026-08-12 사용자 검토).
      //   예전에는 옆 패널 이름칸에 포커스를 줬다. 그런데 보고 있는 눈은 판에 있어서,
      //   빈 상자만 서너 개 만들고 끝나는 일이 실제로 났다. 게다가 포커스가 판 밖에 있으니
      //   `?`(도움말)는 이름에 「?」로 박히고, 크기 손잡이 첫 누름은 「칸에서 빠져나오기」로 먹혔다.
      //   만든 자리에서 바로 타자 = 그 셋이 한꺼번에 없어진다.
      if (!label) requestAnimationFrame(() => openInline(node.id));
    }


    /**
     * 공용 글을 **캔버스 위 쪽지로** 놓는다 (TASK-KL-202 노트 1급 객체).
     * 지금까지 공용 글은 카드를 골라야만 읽혔다 — 세계관 설정처럼 「그림 옆에 늘 펼쳐 두고 싶은 글」이
     * 갈 자리가 없었다. 쪽지는 글의 **사본이 아니라 창**이라, 쪽지에서 고치면 쓰는 자리가 전부 바뀐다.
     */
    function spawnNoteCard(noteId: string): void {
      const note = notesOf(spec).find((n) => n.id === noteId);
      if (!note) return;
      const view = canvas?.viewCenterWorld() ?? { x: 0, y: 0 };
      const taken = new Set(spec.nodes.map((n) => n.id));
      const node: GraphNode = {
        id: nextId('node', taken),
        kind: lastNodeKind,
        label: note.title || t('karmograph.noteLabel'),
        group: '',
        x: Math.round(view.x - 80),
        y: Math.round(view.y - 40),
        w: 180,
        h: NODE_H,
        ports: [],
        shape: 'note',
        docRef: note.id,
      };
      resize(node);
      spec.nodes.push(node);
      applySpec();
      persistStructure();
      selectedId = node.id;
      sideMode = 'node';
      renderSide();
      canvas?.setSelectedNode(node.id);
    }

    // ── 포커스 (격차 M) — 볼 것만 또렷하게 ──────────────────────────────────
    const findEl = q<HTMLInputElement>('find');
    /**
     * 이웃 몇 다리까지 볼 것인가 — **거르기 패널이 들고 있다** (TASK-KL-271 P4).
     * 전에는 툴바에 고르개가 따로 있어서 「덜 보기」가 툴바 찾기 · 툴바 차수 · 거르기 패널
     * **세 자리**로 흩어져 있었다(D4). 찾는 건 툴바에서, 거르는 건 거르기에서 — 한 자리씩.
     */
    let focusDegree = '';

    /** 시작점에서 n 다리까지 퍼진 노드 id 들. */
    function spread(startIds: string[], degree: number): Set<string> {
      const seen = new Set(startIds);
      let frontier = startIds;
      // 「둘레 N다리」도 지금 시점의 선을 타고 번진다 (KL-271 X2) — 2부엔 없는 선으로 이웃이
      // 딸려 오면, 화면에 선이 없는데 카드만 또렷해진다.
      const live = resolveEdges(spec.edges, timeNow());
      for (let d = 0; d < degree; d += 1) {
        const next: string[] = [];
        for (const e of live) {
          if (frontier.includes(e.from) && !seen.has(e.to)) { seen.add(e.to); next.push(e.to); }
          if (frontier.includes(e.to) && !seen.has(e.from)) { seen.add(e.from); next.push(e.from); }
        }
        if (next.length === 0) break;
        frontier = next;
      }
      return seen;
    }

    /**
     * 찾은 수를 찾기 칸 옆에 적는다. 흐려지는 것만으로는 「없다」와 「아직 안 쳤다」가
     * 구별되지 않는다 — 아무것도 안 맞으면 판이 통째로 흐려지는데, 그게 「찾는 중」인지
     * 「없다」인지 화면이 말해 주지 않았다(실측 2026-08-12).
     */
    function showFindCount(n: number | null): void {
      const el = q<HTMLElement>('find-count');
      if (n === null) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      el.classList.toggle('is-none', n === 0);
      el.textContent = n === 0 ? t('karmograph.find.none') : t('karmograph.find.count', { n });
    }

    /** 수가 아니라 **한 마디**를 같은 자리에 띄운다(모자란 것을 알려 줄 때). */
    function showFindHint(msg: string | null): void {
      const el = q<HTMLElement>('find-count');
      if (!msg) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      el.classList.remove('is-none');
      el.textContent = msg;
    }

    /**
     * 지금 봐야 할 것 계산. 찾기 글자가 있으면 **이름이 맞는 노드**가 시작점,
     * 없으면 **고른 노드**가 시작점. 둘 다 없으면 포커스 해제.
     */
    function syncFocus(): void {
      const q0 = findEl.value.trim().toLowerCase();
      const degRaw = focusDegree;
      let starts: string[] = [];
      if (q0) {
        starts = spec.nodes
          .filter((n) => n.label.toLowerCase().includes(q0) || (n.note ?? '').toLowerCase().includes(q0))
          .map((n) => n.id);
        showFindCount(starts.length);
        if (starts.length === 0) {
          // 아무것도 안 맞으면 전부 흐려서 「없다」를 눈으로 보여 준다.
          canvas?.setFocus(new Set());
          return;
        }
      } else if (degRaw !== '' && selectedId) {
        showFindCount(null);
        starts = [selectedId];
      } else {
        /* 「고른 것만/1단계」를 골랐는데 고른 카드가 없으면 **아무 일도 안 일어난다.**
           그때 화면이 가만있으면 고장으로 읽힌다 — 무엇이 모자란지 한 마디 적어 준다. */
        showFindHint(degRaw !== '' ? t('karmograph.degree.pick') : null);
        canvas?.setFocus(null);
        return;
      }
      const degree = degRaw === '' ? 1 : Number(degRaw);
      canvas?.setFocus(spread(starts, degree));
    }

    findEl.oninput = syncFocus;


    // ── 발표 모드 (격차 M-2) ────────────────────────────────────────────────
    // 남에게 *설명*할 때는 전체를 한 번에 펼치면 아무도 못 읽는다. 볼 것을 몇 장으로
    // 나눠 차례로 연다 — 각 장은 「어느 노드들을 또렷하게 둘지」만 기억한다(Kumu 슬라이드).
    const stageEl = q<HTMLElement>('stage');
    let presenting = false;
    let stepIndex = 0;

    const steps = (): StoryStep[] => (spec.story ??= []);

    function showStep(): void {
      const list = steps();
      const step = list[stepIndex];
      (q<HTMLElement>('stage-title')).textContent = step?.title ?? t('karmograph.step.msg');
      (q<HTMLElement>('stage-note')).textContent =
        step?.note ?? t('karmograph.step.msg2');
      (q<HTMLElement>('stage-count')).textContent = list.length ? `${stepIndex + 1} / ${list.length}` : '0 / 0';
      // 장 목록 — 어디쯤 와 있는지 보이고, 눌러서 바로 건너뛴다(슬라이드 정렬 보기 자리).
      const strip = q<HTMLElement>('stage-strip');
      strip.innerHTML = list
        .map((s0, i) => `<button class="btn btn-ghost km-chip${i === stepIndex ? ' is-on' : ''}"
          data-km="stage-go" data-key="${i}">${i + 1}. ${escapeHtml(s0.title)}</button>`)
        .join('');
      strip.querySelectorAll('[data-km="stage-go"]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => {
          stepIndex = Number((el as HTMLElement).dataset.key ?? 0);
          showStep();
        };
      });
      if (!step) {
        canvas?.setFocus(null);
        return;
      }
      // 틀로 잡은 장은 **볼 때마다 다시 센다** — 그 사이 그 자리에 놓인 인물이 함께 나온다.
      const ids = step.rect ? (canvas?.nodesInWorldRect(step.rect) ?? []) : step.nodeIds;
      canvas?.setFocus(ids.length ? new Set(ids) : null);
      // 저장 당시 구도가 있으면 그 카메라를 복원한다. 옛 장면은 노드 자동 맞춤으로 그대로 열린다.
      if (step.camera) canvas?.fitToWorldRect(step.camera, 0, true);
      else canvas?.fitToNodes(ids, 80, true);
    }

    function setPresenting(on: boolean): void {
      presenting = on;
      root.classList.toggle('is-presenting', on);
      stageEl.classList.toggle('hidden', !on);
      if (on) {
        stepIndex = Math.min(stepIndex, Math.max(0, steps().length - 1));
        showStep();
      } else {
        stopAuto();
        closeStageForm();
        canvas?.setFocus(null);
        syncFocus();
      }
    }

    // 자동 넘김 — 손을 못 쓰는 자리(전시·배경 재생)에서 쓴다. 마지막 장에서 처음으로 돈다.
    let autoTimer: ReturnType<typeof setInterval> | null = null;
    function stopAuto(): void {
      if (autoTimer) clearInterval(autoTimer);
      autoTimer = null;
      const btn = root.querySelector('[data-km="stage-auto"]');
      if (btn) btn.textContent = t('karmograph.stageAuto.label');
    }
    Toolbox.onDispose?.(stopAuto);

    q<HTMLButtonElement>('stage-auto').onclick = (ev) => {
      if (autoTimer) { stopAuto(); return; }
      (ev.currentTarget as HTMLButtonElement).textContent = t('karmograph.btn.msg');
      autoTimer = setInterval(() => {
        const list = steps();
        if (list.length === 0 || !presenting) { stopAuto(); return; }
        stepIndex = (stepIndex + 1) % list.length;
        showStep();
      }, 6000);
    };

    q<HTMLButtonElement>('story').onclick = () => setPresenting(!presenting);
    q<HTMLButtonElement>('stage-exit').onclick = () => setPresenting(false);
    q<HTMLButtonElement>('stage-prev').onclick = () => {
      stepIndex = Math.max(0, stepIndex - 1);
      showStep();
    };
    q<HTMLButtonElement>('stage-next').onclick = () => {
      stepIndex = Math.min(Math.max(0, steps().length - 1), stepIndex + 1);
      showStep();
    };
    /**
     * 장을 담고 고치는 **판 위 작은 폼**. 예전엔 `prompt()` 를 연달아 두 번 띄웠다 —
     * 첫 칸에서 취소하면 아무 말 없이 사라지고, 폰에서는 시스템 대화상자가 발표 화면을 덮었다.
     * 이제 제목·설명을 **한 자리에서 함께** 적는다(Enter 담기 · Esc 그만).
     */
    let stageFormMode: 'add' | 'edit' | null = null;
    function openStageForm(mode: 'add' | 'edit'): void {
      const step = steps()[stepIndex];
      if (mode === 'edit' && !step) return;
      stageFormMode = mode;
      const form = q<HTMLElement>('stage-form');
      const titleEl = q<HTMLInputElement>('stage-f-title');
      const noteEl = q<HTMLInputElement>('stage-f-note');
      titleEl.value = mode === 'edit'
        ? step.title
        : t('karmograph.sceneNth', { n: String(steps().length + 1) });
      noteEl.value = mode === 'edit' ? (step.note ?? '') : '';
      form.classList.remove('hidden');
      titleEl.focus();
      titleEl.select();
    }
    function closeStageForm(): void {
      stageFormMode = null;
      q<HTMLElement>('stage-form').classList.add('hidden');
    }
    function saveStageForm(): void {
      if (!stageFormMode) return;
      const title = q<HTMLInputElement>('stage-f-title').value.trim();
      const note = q<HTMLInputElement>('stage-f-note').value.trim();
      const name = title || t('karmograph.sceneNth', { n: String(steps().length + 1) });
      if (stageFormMode === 'edit') {
        const step = steps()[stepIndex];
        if (step) {
          step.title = name;
          step.note = note || undefined;
        }
      } else {
        // 지금 또렷한 것들을 그대로 한 장으로 굳힌다. 포커스가 없으면 전체 장.
        const focused = currentFocusIds();
        steps().splice(stepIndex + (steps().length ? 1 : 0), 0, {
          id: `step-${Date.now().toString(36)}`,
          title: name,
          nodeIds: focused,
          note: note || undefined,
          camera: canvas?.viewRectWorld(),
          // 또렷하게 고른 것이 없으면 「지금 보이는 자리」를 **틀**로 굳힌다. 그러면 나중에 그 자리에
          // 새 인물을 놓아도 이 장에 저절로 낀다(노드 목록이면 영영 안 낀다).
          rect: focused.length === 0 ? canvas?.viewRectWorld() : undefined,
        });
        stepIndex = Math.min(steps().length - 1, stepIndex + (steps().length > 1 ? 1 : 0));
      }
      closeStageForm();
      persistStructure();
      showStep();
    }
    q<HTMLButtonElement>('stage-add').onclick = () => openStageForm('add');
    q<HTMLButtonElement>('stage-save').onclick = () => saveStageForm();
    q<HTMLButtonElement>('stage-cancel').onclick = () => closeStageForm();
    for (const key of ['stage-f-title', 'stage-f-note']) {
      q<HTMLInputElement>(key).onkeydown = (ev: KeyboardEvent) => {
        // 여기서 막지 않으면 Esc 가 발표 자체를 닫는다 — 글을 적다 말고 화면이 사라진다.
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); saveStageForm(); }
        if (ev.key === 'Escape') { ev.preventDefault(); closeStageForm(); }
      };
    }
    /** 이 장을 한 칸 옮긴다. 끌어 옮기기는 아직 — 버튼이 작고 확실하다. */
    function moveStep(delta: -1 | 1): void {
      const list = steps();
      const to = stepIndex + delta;
      if (to < 0 || to >= list.length) return;
      const [it] = list.splice(stepIndex, 1);
      list.splice(to, 0, it);
      stepIndex = to;
      persistStructure();
      showStep();
    }
    q<HTMLButtonElement>('stage-back').onclick = () => moveStep(-1);
    q<HTMLButtonElement>('stage-fwd').onclick = () => moveStep(1);
    // 고치는 것도 같은 폼이다 — 제목만이 아니라 **설명까지** 여기서 고친다(예전엔 제목뿐이었다).
    q<HTMLButtonElement>('stage-rename').onclick = () => openStageForm('edit');

    q<HTMLButtonElement>('stage-del').onclick = () => {
      const list = steps();
      if (list.length === 0) return;
      list.splice(stepIndex, 1);
      stepIndex = Math.max(0, Math.min(stepIndex, list.length - 1));
      persistStructure();
      showStep();
    };

    /** 지금 또렷하게 보이는 노드 id 들 — 발표 장을 담을 때 그대로 쓴다. */
    function currentFocusIds(): string[] {
      const q0 = findEl.value.trim().toLowerCase();
      const degRaw = focusDegree;
      if (q0) {
        const starts = spec.nodes
          .filter((n) => n.label.toLowerCase().includes(q0) || (n.note ?? '').toLowerCase().includes(q0))
          .map((n) => n.id);
        return [...spread(starts, degRaw === '' ? 1 : Number(degRaw))];
      }
      if (degRaw !== '' && selectedId) return [...spread([selectedId], Number(degRaw))];
      return [];
    }

    // ── 어휘 팩 전환 ────────────────────────────────────────────────────────
    // 이미 놓아둔 노드는 건드리지 않는다. 팩은 *앞으로 쓸 말*을 바꿀 뿐이고,
    // 색·아이콘은 전 팩 합본(ALL_*)이 받쳐 주므로 섞여 있어도 죽지 않는다.
    const packEl = root.querySelector('[data-km="pack"]') as HTMLSelectElement | null;
    function applyPack(id: string, persist: boolean): void {
      pack = packById(id);
      if (packEl) packEl.value = pack.id;
      spec._meta = { ...spec._meta, pack: pack.id };
      syncEmptyHint();
      renderSide();
      if (persist) persistStructure();
    }
    if (packEl) packEl.onchange = () => applyPack(packEl.value, true);

    /**
     * 가지런히 — 겹친 것만 밀고 격자에 맞춘다. 고른 것이 있으면 **그것만**.
     * 통째로 흩는 자동 배치는 안 한다: 사람이 잡아 둔 자리의 뜻이 날아간다.
     */
    /**
     * 링크 만들기 — 주소 안에 그림을 담는다(백엔드 0). 너무 크면 **만들지 않고** 파일 쪽으로 보낸다:
     * 잘린 주소는 「열리는데 내용이 이상한」 최악의 실패를 낸다.
     */
    q<HTMLButtonElement>('storage').onclick = () => {
      sideMode = 'storage';
      renderSide();
    };

    /**
     * **블로그에 넣을 한 줄** (TASK-KL-271 O6).
     *
     * 보기 전용 링크는 「눌러서 열어 보세요」까지다. 그런데 관계도를 남에게 보이는 가장 흔한 자리는
     * 글 안이고(블로그·문서), 거기서는 링크가 아니라 **판이 그 자리에 떠 있어야** 읽힌다.
     * 링크를 이미 만들 줄 아니, 그것을 끼우는 한 줄만 얹으면 된다 — 새 길이 아니라 같은 길의 옷이다.
     */
    function embedCodeOf(url: string): string {
      // 높이는 넉넉히, 테두리는 0 — 블로그 글 안에서 「끼워 넣은 창」처럼 보이면 읽는 흐름이 끊긴다.
      return `<iframe src="${url}" width="100%" height="600" style="border:0" loading="lazy"`
        + ` title="${escapeAttr(activeMapName())}"></iframe>`;
    }

    function makeShareLink(readOnly: boolean, asEmbed = false): void {
      const live = canvas?.getSpec() ?? spec;
      void encodeShare(live).then(async (code) => {
        let url = buildShareUrl(new URL(location.href), code, readOnly);
        if (url.length > SHARE_URL_LIMIT) {
          // 한계를 넘기는 것은 거의 언제나 사진이다. 「파일로 보내세요」로 끝내면 사진 한 장 때문에
          // 링크 공유가 통째로 막힌다 — 사진만 덜어 낸 링크를 먼저 권한다(얼굴은 첫 글자로 뜬다).
          const lean = stripImages(live);
          const leanUrl = lean.removed > 0
            ? buildShareUrl(new URL(location.href), await encodeShare(lean.spec), readOnly)
            : url;
          if (lean.removed > 0 && leanUrl.length <= SHARE_URL_LIMIT
            && await askNote(t('karmograph.confirmLeanShare', { n: lean.removed }), t('karmograph.ask.ok'))) {
            url = leanUrl;
          } else {
            showNote(
              t('karmograph.tooBigForLink', { k: Math.round(url.length / 1000) }) + '\n' +
              t('karmograph.live.msg')
            );
            return;
          }
        }
        const out = asEmbed ? embedCodeOf(url) : url;
        try {
          await navigator.clipboard.writeText(out);
          Toolbox.showToast?.(
            asEmbed ? t('karmograph.embed.done') : t('karmograph.live.msg2'), undefined, undefined);
        } catch {
          // 클립보드가 막힌 자리(비보안 컨텍스트 등)에서도 사람이 직접 복사할 수 있게 보여 준다.
          showLinkBox(out);
        }
      });
    }
    q<HTMLButtonElement>('share').onclick = () => makeShareLink(false);
    // 보여 주기만 할 때 쓰는 링크 — 받는 쪽에서 편집 손잡이가 사라진다(고쳐도 원본은 안 바뀐다는
    // 사실을 말로 설명하는 것보다, 애초에 못 고치게 하는 편이 헷갈림이 적다).
    q<HTMLButtonElement>('share-view').onclick = () => makeShareLink(true);
    q<HTMLButtonElement>('embed').onclick = () => makeShareLink(true, true);

    /**
     * 구조를 살리는 배치 — 「가지런히」는 있던 자리를 존중하지만, 이미 엉킨 그림은 그것으로 안 풀린다.
     * 되돌리기 한 걸음으로 남으므로 마음 놓고 눌러 보고 아니면 Ctrl+Z 로 되돌린다.
     */
    function relayout(kind: 'circle' | 'tree'): void {
      const live = canvas?.getSpec() ?? spec;
      const target = selectedMany.length > 1
        ? live.nodes.filter((n) => selectedMany.includes(n.id))
        : live.nodes;
      if (target.length === 0) return;
      const boxes = target.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));
      const center = canvas?.viewCenterWorld() ?? { x: 0, y: 0 };
      const deg = new Map<string, number>();
      for (const e of live.edges) {
        deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
        deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
      }
      const placed = kind === 'circle'
        ? layoutCircle(boxes, (id) => deg.get(id) ?? 0, center)
        : layoutHierarchy(boxes, live.edges.map((e) => ({ from: e.from, to: e.to })),
            { x: center.x, y: center.y - 200 });
      for (const [id, p] of placed) {
        const n = live.nodes.find((x) => x.id === id);
        if (n) { n.x = p.x; n.y = p.y; }
      }
      spec = live;
      applySpec();
      persistStructure();
      canvas?.fitView();
      Toolbox.showToast?.(t('karmograph.placed.n', {
        n: String(placed.size),
        how: kind === 'circle' ? t('karmograph.placed.msg') : t('karmograph.placed.msg2'),
      }), undefined, undefined);
    }
    // 연표 — 「언제」가 적힌 칸을 시간축으로 삼는다. 어느 칸인지는 **숫자가 가장 많이 든 칸**으로 고른다
    // (사람에게 「날짜 칸을 먼저 정하라」고 시키면 아무도 안 쓴다).
    q<HTMLButtonElement>('lay-time').onclick = () => {
      const live = canvas?.getSpec() ?? spec;
      const field = bestTimeField(live.nodes);
      if (!field) {
        Toolbox.showToast?.(t('karmograph.field.msg'), undefined, undefined);
        return;
      }
      const boxes = live.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));
      const center = canvas?.viewCenterWorld() ?? { x: 0, y: 0 };
      const placed = layoutTimeline(
        boxes,
        (id) => (live.nodes.find((n) => n.id === id)?.fields ?? {})[field],
        { x: center.x - 400, y: center.y - 120 },
      );
      for (const [id, p] of placed) {
        const n = live.nodes.find((x) => x.id === id);
        if (n) { n.x = p.x; n.y = p.y; }
      }
      spec = live;
      applySpec();
      persistStructure();
      canvas?.fitView();
      Toolbox.showToast?.(t('karmograph.arranged', { field, n: placed.size }), undefined, undefined);
    };
    q<HTMLButtonElement>('lay-circle').onclick = () => relayout('circle');
    q<HTMLButtonElement>('lay-tree').onclick = () => relayout('tree');

    q<HTMLButtonElement>('tidy').onclick = () => {
      const live = canvas?.getSpec() ?? spec;
      const target = selectedMany.length > 1
        ? live.nodes.filter((n) => selectedMany.includes(n.id))
        : live.nodes;
      if (target.length === 0) return;
      const boxes = target.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));

      const pushed = unoverlap(boxes, 24);
      for (const [id, p] of pushed) {
        const n = live.nodes.find((x) => x.id === id);
        if (n) { n.x = p.x; n.y = p.y; }
      }
      const snapped = snapToGrid(
        target.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })),
        8
      );
      for (const [id, p] of snapped) {
        const n = live.nodes.find((x) => x.id === id);
        if (n) { n.x = p.x; n.y = p.y; }
      }
      spec = live;
      applySpec();
      persistStructure();
      const n = pushed.size;
      Toolbox.showToast?.(
        n === 0 ? t('karmograph.n.msg') : t('karmograph.pushed.n', { n: String(n) }),
        undefined, undefined
      );
    };

    q<HTMLButtonElement>('from-text').onclick = () => {
      sideMode = 'text';
      renderSide();
    };

    // 「⋯ 더 보기」 서랍 — 자주 안 쓰는 것은 여기로 넣어 툴바가 캔버스를 잡아먹지 않게 한다.
    const drawerEl = q<HTMLElement>('drawer');
    q<HTMLButtonElement>('more').onclick = (ev) => {
      ev.stopPropagation();
      drawerEl.classList.toggle('hidden');
    };
    // 서랍 안의 **버튼**을 누르면 할 일이 끝난 것이니 닫는다. 배경 무늬 같은 고르기(select)는
    // 연달아 바꿔 보게 열어 둔다.
    drawerEl.onclick = (ev) => {
      ev.stopPropagation();
      // 폰에서 접힌 툴바 손잡이의 대체 문 — 일하는 길은 그대로 하나다(그 단추를 눌러 준다).
      const proxy = (ev.target as HTMLElement).closest('[data-km="tb-proxy"]') as HTMLElement | null;
      if (proxy) {
        (root.querySelector(`[data-km="${proxy.dataset.key}"]`) as HTMLButtonElement | null)?.click();
      }
      if ((ev.target as HTMLElement).closest('button')) drawerEl.classList.add('hidden');
    };
    function closeDrawer(): void { drawerEl.classList.add('hidden'); }
    document.addEventListener('click', closeDrawer);
    Toolbox.onDispose?.(() => document.removeEventListener('click', closeDrawer));

    /* ── 명령 팔레트 (TASK-KL-271 R3) ─────────────────────────────────────────
       서랍이 스물 몇 줄이 되면 **찾는 데가 아니라 훑는 데**가 된다. 자주 쓰는 여섯만 펴 두고,
       나머지는 **이름을 쳐서** 부른다. 새 길은 안 낸다 — 고른 것은 결국 그 단추를 눌러 준다.
       그래야 손잡이가 한 곳에 남고(문이 또 늘면 그게 중복이다), 검사도 그대로 산다. */
    const palEl = q<HTMLElement>('pal');
    const palFind = q<HTMLInputElement>('pal-find');
    const palList = q<HTMLElement>('pal-list');
    let palPick = 0;
    let palHits: { key: string; label: string; group: string }[] = [];

    function palRender(): void {
      const q0 = palFind.value.trim().toLowerCase();
      palHits = COMMAND_GROUPS.flatMap((g) => g.items.map((c) => ({
        key: c.key, label: c.label(), group: g.title(),
      }))).filter((c) => !q0 || c.label.toLowerCase().includes(q0));
      if (palPick >= palHits.length) palPick = Math.max(0, palHits.length - 1);
      if (palHits.length === 0) {
        palList.innerHTML = `<div class="km-pal-none">${esc(t('karmograph.palette.none'))}</div>`;
        return;
      }
      let lastGroup = '';
      palList.innerHTML = palHits.map((c, i) => {
        const head = c.group === lastGroup ? '' : `<div class="km-pal-g">${esc(c.group)}</div>`;
        lastGroup = c.group;
        return `${head}<button class="btn btn-ghost${i === palPick ? ' is-on' : ''}" role="option"`
          + ` data-i="${i}">${esc(c.label)}</button>`;
      }).join('');
      palList.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
    }

    /**
     * 팔레트를 닫고 **원래 있던 자리로 초점을 돌려준다** (KL-271).
     *
     * 실측 2026-08-14: 닫으면 초점이 body 로 떨어졌다 — 자판만 쓰는 사람은 그 순간 **자리를 잃고**
     * 다음 Tab 이 페이지 맨 위에서 다시 시작한다. 어디서 왔는지 기억해 두었다가 돌려놓는다.
     */
    let palCameFrom: HTMLElement | null = null;
    function palOpen(): void {
      palCameFrom = document.activeElement as HTMLElement | null;
      closeDrawer();
      palPick = 0;
      palFind.value = '';
      palEl.classList.remove('hidden');
      palRender();
      palFind.focus();
    }
    function palClose(): void {
      palEl.classList.add('hidden');
      // 부른 자리가 그 사이 사라졌으면(서랍 안 단추였다면) 판으로 돌려보낸다.
      const back = palCameFrom && palCameFrom.isConnected ? palCameFrom : q<HTMLElement>('more');
      palCameFrom = null;
      back?.focus?.();
    }
    /** 고른 명령은 **그 단추를 눌러** 실행한다 — 일하는 길은 하나로 남는다. */
    function palRun(i: number): void {
      const hit = palHits[i];
      if (!hit) return;
      palClose();
      (root.querySelector(`[data-km="${hit.key}"]`) as HTMLButtonElement | null)?.click();
    }

    q<HTMLButtonElement>('palette-open').onclick = (ev) => { ev.stopPropagation(); palOpen(); };
    palFind.oninput = () => { palPick = 0; palRender(); };
    palFind.onkeydown = (ev) => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); palPick = Math.min(palPick + 1, palHits.length - 1); palRender(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); palPick = Math.max(palPick - 1, 0); palRender(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); palRun(palPick); }
      else if (ev.key === 'Escape') { ev.preventDefault(); palClose(); }
    };
    palList.onclick = (ev) => {
      const btn = (ev.target as HTMLElement).closest('button');
      if (btn) palRun(Number((btn as HTMLElement).dataset.i));
    };
    // 바깥(어두운 자리)을 누르면 닫는다 — 갇힌 느낌을 안 준다.
    palEl.onclick = (ev) => { if (ev.target === palEl) palClose(); };

    /**
     * **Ctrl+⇧+P / ⌘⇧P** — Ctrl+K 와 `/` 는 이미 KarmoLab 전체의 「어느 도구로 갈까」 팔레트가
     * 쓰고 있다(실측: Ctrl+K 를 누르면 그쪽이 뜬다). 같은 자판에 문을 하나 더 내면 그게 바로
     * 이 작업이 없애려는 중복이다 — 그래서 편집기들이 「명령」에 쓰는 자판을 따로 쓴다.
     * 이 위젯이 화면에 있을 때만 받는다.
     */
    const palHotkey = (ev: KeyboardEvent): void => {
      if (!(ev.ctrlKey || ev.metaKey) || !ev.shiftKey || ev.key.toLowerCase() !== 'p') return;
      if (!root.isConnected || root.offsetParent === null) return;
      ev.preventDefault();
      if (palEl.classList.contains('hidden')) palOpen(); else palClose();
    };
    document.addEventListener('keydown', palHotkey);
    Toolbox.onDispose?.(() => document.removeEventListener('keydown', palHotkey));

    undoEl.onclick = () => restoreTo(histIndex - 1);
    redoEl.onclick = () => restoreTo(histIndex + 1);

    // Ctrl/⌘+Z · Ctrl+Y · Ctrl+Shift+Z. 글자 칸에 커서가 있으면 브라우저의 글자 되돌리기가
    // 먼저다 — 이름을 고치다 Ctrl+Z 를 눌렀는데 노드가 통째로 사라지면 그게 더 놀랍다.
    function onKeyDown(ev: KeyboardEvent): void {
      if (!root.isConnected) return;
      // Esc = 열린 것을 닫는다. 서랍이 열린 채로 남으면 그 아래 버튼들이 통째로 안 눌린다.
      if (ev.key === 'Escape' && !drawerEl.classList.contains('hidden')) {
        ev.preventDefault();
        drawerEl.classList.add('hidden');
        return;
      }
      // 발표 중에는 좌우 키로 장을 넘긴다 (글자 칸에 커서가 있으면 양보).
      const tag0 = (ev.target as HTMLElement | null)?.tagName ?? '';
      if (presenting && tag0 !== 'INPUT' && tag0 !== 'TEXTAREA') {
        if (ev.key === 'ArrowRight') { ev.preventDefault(); stepIndex = Math.min(Math.max(0, steps().length - 1), stepIndex + 1); showStep(); return; }
        if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepIndex = Math.max(0, stepIndex - 1); showStep(); return; }
        if (ev.key === 'Escape') { ev.preventDefault(); setPresenting(false); return; }
      }
      // ── 키보드만으로 쓰기 (격차 X) ────────────────────────────────────────
      // 글자 칸에 커서가 있으면 전부 양보한다 — 이름을 고치다 노드가 움직이면 놀란다.
      const focus = ev.target as HTMLElement | null;
      const inField = focus?.tagName === 'INPUT' || focus?.tagName === 'TEXTAREA'
        || focus?.tagName === 'SELECT' || focus?.isContentEditable === true;
      if (!inField && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        const step = ev.shiftKey ? 40 : 8;
        const move: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
        };
        if (move[ev.key]) {
          const [dx, dy] = move[ev.key];
          if (canvas?.nudgeSelected(dx, dy)) {
            ev.preventDefault();
            persistStructure();
            return;
          }
        }
        /**
         * ★ Tab 으로 **카드를 훑는 것은 판에 초점이 있을 때만**.
         *
         * 예전엔 글 칸만 아니면 무조건 가로챘다 — 그래서 툴바 단추에 초점이 있는 동안 Tab 을
         * 눌러도 **초점이 한 발짝도 안 움직였다**(실측 2026-08-14: 45번 눌러도 같은 단추).
         * 자판만 쓰는 사람에게는 첫 단추 하나가 이 도구의 전부였던 셈이다.
         * 판(캔버스) 안에 있을 때만 훑고, 손잡이들 사이에서는 브라우저에게 맡긴다.
         */
        // 「판에 있다」 = **손잡이에 앉아 있지 않다**. 미니 도구 줄처럼 판 위에 뜬 단추도 손잡이다
        //   (그것까지 판으로 치면 거기서 또 초점이 갇힌다 — 실측 2026-08-14).
        const onHandle = Boolean(focus?.closest?.(
          'button, a[href], select, input, textarea, [contenteditable="true"]'));
        const onBoard = !onHandle;
        if (ev.key === 'Tab' && onBoard) {
          const id = canvas?.selectStep(ev.shiftKey ? -1 : 1) ?? null;
          if (id) {
            ev.preventDefault();
            selectedId = id;
            selectedMany = [];
            sideMode = 'node';
            renderSide();
            return;
          }
        }
        if (ev.key === 'Enter' && selectedId) {
          ev.preventDefault();
          (sideEl.querySelector('[data-km="edit-label"]') as HTMLInputElement | null)?.focus();
          return;
        }
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          const node = selectedId ? spec.nodes.find((n) => n.id === selectedId) : null;
          if (node) {
            ev.preventDefault();
            // 지울지 되묻는 일은 **옆 패널 단추 한 곳**에만 둔다 — 여기서도 물으면 두 번 묻는다.
            (sideEl.querySelector('[data-km="node-del"]') as HTMLButtonElement | null)?.click();
            return;
          }
          /* ★ **선도 자판으로 지운다** (KL-271). 카드만 되던 동안, 선을 골라 패널까지 떠 있는데
             Delete 를 눌러도 아무 일이 없었다 — 자판만 쓰는 사람은 「고를 수는 있는데 못 지운다」를
             만난다(실측 2026-08-14). 같은 단추를 눌러 되물음도 한 번만 뜨게 한다. */
          if (selectedEdgeId) {
            ev.preventDefault();
            (sideEl.querySelector('[data-km="ed-del"]') as HTMLButtonElement | null)?.click();
          }
          return;
        }
        if (ev.key === '?' || (ev.key === '/' && ev.shiftKey)) {
          ev.preventDefault();
          sideMode = sideMode === 'help' ? 'node' : 'help';
          renderSide();
          return;
        }
        if (ev.key === 'Escape' && (selectedId || selectedMany.length > 0)) {
          ev.preventDefault();
          selectedId = null;
          selectedMany = [];
          canvas?.setSelectedNodes([]);
          sideMode = 'node';
          renderSide();
          return;
        }
      }

      if (!(ev.ctrlKey || ev.metaKey)) return;
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      const key = ev.key.toLowerCase();
      if (key === 'z' && !ev.shiftKey) { ev.preventDefault(); restoreTo(histIndex - 1); }
      else if (key === 'y' || (key === 'z' && ev.shiftKey)) { ev.preventDefault(); restoreTo(histIndex + 1); }
      else if (key === 'a') {
        /* 전부 고르기 — 나란히 놓기·묶음 넣기·한꺼번에 종류 바꾸기가 전부 「여럿 고름」에 있는데,
           고르는 길이 Shift+드래그 하나뿐이라 넓은 판에서는 그것부터 일이었다.
           **보이는 것만** 고른다 — 거르기로 감춘 것까지 고르면 안 보이는 것이 함께 움직인다. */
        const ids = [...(canvas?.visibleNodeIds() ?? new Set<string>())];
        if (ids.length === 0) return;
        ev.preventDefault();
        canvas?.setSelectedNodes(ids);
        selectedMany = ids;
        selectedId = ids.length === 1 ? ids[0] : null;
        sideMode = ids.length > 1 ? 'many' : 'node';
        renderSide();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    Toolbox.onDispose?.(() => document.removeEventListener('keydown', onKeyDown));

    // 배경 무늬 — 맵마다 따로 기억한다(`_meta.bg`).
    const bgEl = q<HTMLSelectElement>('bg');
    bgEl.onchange = () => {
      canvas?.setBackground(bgEl.value as BackgroundKind);
      spec._meta = { ...spec._meta, bg: bgEl.value };
      persistStructure();
      // 고르고 나면 서랍은 할 일을 다 했다 — 열어 두면 그 아래 버튼이 통째로 안 눌린다.
      drawerEl.classList.add('hidden');
    };

    q<HTMLButtonElement>('fit').onclick = () => { canvas?.fitView(); showZoom(); };

    /* ── 카드 이름을 그 자리에서 (TASK-KL-235) ─────────────────────────────────
       옆 패널까지 가야 이름을 고칠 수 있었다 — 보는 자리와 고치는 자리가 달랐다.
       카드 두 번 누르기는 여태 **아무 일도 안 하던 자리**라 관례대로 이름 고치기에 준다
       (파고들기는 예전부터 패널의 제 단추가 맡고 있어 뺏을 것이 없다). */
    let inlineEl: HTMLInputElement | null = null;
    function closeInline(save: boolean): void {
      const el = inlineEl;
      if (!el) return;
      inlineEl = null;
      const id = el.dataset.nodeId ?? '';
      const next = el.value;
      el.remove();
      if (!save) return;
      const node = spec.nodes.find((n) => n.id === id);
      if (!node || node.label === next) return;
      // 저장은 옆 패널 이름 칸과 **같은 길**로 — 두 길이 생기면 언젠가 갈라진다.
      lastAction = t('karmograph.act.rename');
      node.label = next;
      resize(node);
      canvas?.render();
      canvas?.setSelectedNode(node.id);
      persistStructure();
      renderSide();
    }
    function openInline(nodeId: string): void {
      if (!canvas || readOnly) return;
      const node = spec.nodes.find((n) => n.id === nodeId);
      const box = canvas.nodeScreenRect(nodeId);
      if (!node || !box) return;
      closeInline(false);
      // ★ `nodeScreenRect` 는 **캔버스 안쪽 좌표**다(화면 좌표 아님) — 화면 좌표로 알고 빼면
      //   편집칸이 카드 위쪽 엉뚱한 자리에 뜬다(실측 2026-08-12: 130px 어긋났다).
      const el = document.createElement('input');
      el.type = 'text';
      el.className = 'km-inline';
      el.dataset.nodeId = nodeId;
      el.value = node.label;
      /* ★ 칸은 **판 안**에 있어야 한다 — 카드가 화면 가장자리에 걸치면 그 자리 그대로 두었을 때
         칸의 시작이 화면 밖으로 나갔다(실측 2026-08-14: 왼쪽 -40px — 글자를 치는데 앞이 안 보인다). */
      const w = Math.min(Math.round(box.w), Math.max(80, canvasEl.clientWidth - 8));
      const h = Math.round(box.h);
      const left = Math.min(Math.max(4, Math.round(box.x)), Math.max(4, canvasEl.clientWidth - w - 4));
      const top = Math.min(Math.max(4, Math.round(box.y)), Math.max(4, canvasEl.clientHeight - h - 4));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.fontSize = `${Math.max(11, Math.round(13 * (canvas.getScale() || 1)))}px`;
      canvasEl.appendChild(el);
      inlineEl = el;
      el.focus();
      el.select();
      el.onkeydown = (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); closeInline(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeInline(false); }
        else ev.stopPropagation();   // 방향키·Delete 가 카드를 옮기거나 지우면 안 된다
      };
      el.onblur = () => closeInline(true);
    }
    canvasEl.addEventListener('dblclick', (ev) => {
      const hit = (ev.target as Element | null)?.closest?.('.ck-node') as HTMLElement | null;
      const id = hit?.dataset.id;
      if (!id) return;
      ev.preventDefault();
      ev.stopPropagation();
      openInline(id);
    });
    // 판이 움직이면 자리가 어긋난다 — 어긋난 채 떠 있는 것보다 닫는 편이 낫다.
    for (const evName of ['wheel', 'pointerdown'] as const) {
      canvasEl.addEventListener(evName, (ev) => {
        if (inlineEl && ev.target !== inlineEl) closeInline(true);
      }, true);
    }
    Toolbox.onDispose?.(() => closeInline(false));

    /* 배율 줄 — 휠·핀치를 모르는 사람에게도 확대·축소가 **보이는 자리**에 있어야 한다
       (레퍼런스 캔버스 도구들이 하나같이 구석에 이 줄을 두는 이유다). 숫자를 누르면 100% 로. */
    const zoomVal = q<HTMLButtonElement>('zoom-val');
    const showZoom = (): void => {
      const s = canvas?.getScale() ?? 1;
      zoomVal.textContent = `${Math.round(s * 100)}%`;
    };
    /** 사람이 손으로 배율을 정했나 — 정했으면 판이 넓어져도 마음대로 다시 맞추지 않는다. */
    let zoomChosen = false;
    q<HTMLButtonElement>('zoom-out').onclick = () => { zoomChosen = true; canvas?.zoomBy(1 / 1.25); showZoom(); };
    q<HTMLButtonElement>('zoom-in').onclick = () => { zoomChosen = true; canvas?.zoomBy(1.25); showZoom(); };
    zoomVal.onclick = () => {
      const s = canvas?.getScale() ?? 1;
      zoomChosen = true;
      if (s !== 1) canvas?.zoomBy(1 / s);
      showZoom();
    };
    canvasEl.addEventListener('wheel', () => { zoomChosen = true; }, { passive: true });

    /**
     * 판 크기가 달라지면 **다시 맞춘다** (TASK-KL-271 M1).
     *
     * 폰에서 판이 우표만 하게 뜨는 일이 있었다 — 배율은 판이 처음 그려질 때 한 번 정해지는데,
     * 그때는 아직 자리가 안 잡혀 있다(시트가 올라와 있거나 폭이 0). 실측: 390px 폰에서 저장본을
     * 열면 카드 전체 폭이 **109px**(판 폭 358px)로 그려졌고 배율 표시는 100% 라고 거짓말했다.
     * 사람이 손으로 배율을 정하기 전까지는, 폭·높이가 눈에 띄게 달라질 때마다 다시 맞춘다.
     */
    let lastFitW = 0;
    let lastFitH = 0;
    let refitTimer: ReturnType<typeof setTimeout> | null = null;
    const refitIfNeeded = (): void => {
      if (zoomChosen || !canvas || spec.nodes.length === 0) return;
      const w = canvasEl.clientWidth;
      const h = canvasEl.clientHeight;
      if (w <= 0 || h <= 0) return;
      // 1px 씩 흔들리는 것까지 따라가면 끌 때마다 판이 튄다 — 눈에 띄는 변화(8%)에만 움직인다.
      const moved = Math.abs(w - lastFitW) > lastFitW * 0.08 || Math.abs(h - lastFitH) > lastFitH * 0.08;
      if (!moved && lastFitW > 0) return;
      lastFitW = w;
      lastFitH = h;
      /* ★ **뭔가 고른 채면 다시 맞추지 않는다.** 카드를 고르면 옆 패널이 열리며 판이 좁아지는데,
         그때 다시 맞추면 **누르려던 손잡이가 도망간다** — 실측: 고른 직후 150ms 안에 손잡이가
         245px 옮겨 갔고, 그 틈에 누른 판이 여덟 번에 한 번 헛손질로 끝났다(화면검사 간헐 빨강의
         정체). 크기 기록은 위에서 이미 갱신했으므로, 판을 놓고 창을 바꾸면 그때 맞춘다. */
      if (selectedId || selectedEdgeId) return;
      canvas.fitView();
      showZoom();
    };
    const queueRefit = (): void => {
      if (refitTimer) clearTimeout(refitTimer);
      refitTimer = setTimeout(refitIfNeeded, 120);
    };
    const refitObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(queueRefit) : null;
    refitObserver?.observe(canvasEl);
    window.addEventListener('orientationchange', queueRefit);
    Toolbox.onDispose?.(() => {
      if (refitTimer) clearTimeout(refitTimer);
      refitObserver?.disconnect();
      window.removeEventListener('orientationchange', queueRefit);
    });
    /* 휠·핀치·「전체 보기」로 바뀐 배율도 따라 적어야 한다 — 숫자가 거짓이면 없느니만 못하다.
       시계로 계속 물어보는 대신 **배율이 바뀔 만한 동작 뒤에** 한 번씩 읽는다. */
    for (const evName of ['wheel', 'pointerup', 'dblclick'] as const) {
      canvasEl.addEventListener(evName, () => queueMicrotask(showZoom), { passive: true });
    }

    // ── 그림으로 내보내기 (격차 G) ──────────────────────────────────────────
    // 레퍼런스들은 「UI 를 숨길 테니 직접 캡처하세요」에서 멈춘다. 우리 캔버스는 SVG 라
    // 화면 밖까지 포함해 원본 해상도로 뽑을 수 있다 — 사람 손을 빌릴 이유가 없다.
    function downloadBlob(blob: Blob, name: string): void {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }

    /**
     * 💬 **판을 얼리지 않는 말 상자** (KL-271) — 브라우저 alert 을 대신한다.
     *
     * `alert` 은 브라우저 창을 띄워 판을 통째로 얼린다: 뒤에 있는 화면(무엇이 잘못됐는지)을
     * 볼 수 없고, 폰에서는 주소창 이름이 함께 떠 「사이트가 하는 말」처럼 읽힌다. 여기서는
     * 판 위에 얹고, 읽는 동안 화면은 그대로 살아 있다. 토스트와는 다르다 — **안 사라진다**
     * (「안 됐다」는 말이 3초 만에 사라지면 사람은 무슨 일이 일어났는지 영영 모른다).
     */
    function showNote(msg: string): void {
      root.querySelector('.km-note')?.remove();
      const box = document.createElement('div');
      box.className = 'km-note';
      box.setAttribute('role', 'status');
      box.innerHTML = `<span data-km="note-msg"></span>`
        + `<button class="btn btn-ghost" data-km="note-close" aria-label="${esc(t('karmograph.linkBox.close'))}">✕</button>`;
      (box.querySelector('[data-km="note-msg"]') as HTMLElement).textContent = msg;
      const back = focusKeeper();
      canvasEl.appendChild(box);
      trapTab(box);
      const close = (): void => { box.remove(); back(); };
      (box.querySelector('[data-km="note-close"]') as HTMLButtonElement).onclick = close;
      (box.querySelector('[data-km="note-close"]') as HTMLButtonElement).focus();
      box.onkeydown = (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape' || ev.key === 'Enter') close();
      };
    }

    /**
     * 작은 상자 안에 **초점을 가둔다** (KL-271).
     *
     * 되물음이 떠 있는데 Tab 이 뒤로 새면, 답하지 않은 결정 뒤에서 판을 만지게 된다 —
     * 눈으로 보는 사람에게는 상자가 앞을 막고 있는데 자판만 쓰는 사람에게는 안 막힌 셈이다
     * (실측 2026-08-14: 되물음에서 두 번째 Tab 이 옆 패널 칸으로 나갔다).
     */
    /** 상자를 열기 전 초점을 기억했다가 닫을 때 돌려준다 — 자리를 잃지 않게. */
    function focusKeeper(): () => void {
      const from = document.activeElement as HTMLElement | null;
      return () => {
        const back = from && from.isConnected ? from : null;
        back?.focus?.();
      };
    }

    function trapTab(box: HTMLElement): void {
      box.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key !== 'Tab') return;
        const spots = [...box.querySelectorAll<HTMLElement>('button, input, select, textarea')]
          .filter((el) => !(el as HTMLButtonElement).disabled);
        if (spots.length === 0) return;
        const at = spots.indexOf(document.activeElement as HTMLElement);
        const next = ev.shiftKey ? at - 1 : at + 1;
        // 끝에서 다음으로 가면 처음으로 — 상자가 곧 화면의 전부다.
        ev.preventDefault();
        spots[(next + spots.length) % spots.length].focus();
      });
    }

    /**
     * ❓ **판을 얼리지 않는 되물음** (KL-271) — 브라우저 confirm 을 대신한다.
     *
     * 되묻는 자리는 대개 **되돌릴 수 없는 일**(판 지우기·선 전부 끊기) 앞이다. 그런데 브라우저
     * confirm 은 판을 얼려 **무엇을 지우려는지 뒤를 못 보게** 만든다 — 「그 판이 어느 판이더라」를
     * 확인할 방법이 없는 채로 예/아니오를 고르게 하는 셈이다. 여기서는 화면을 살려 둔 채 묻는다.
     *
     * 기본 손가락은 **그만**에 둔다(Esc 도 그만) — 되돌릴 수 없는 쪽이 기본이면 언젠가 사고가 난다.
     */
    function askNote(msg: string, okLabel: string): Promise<boolean> {
      root.querySelector('.km-note')?.remove();
      return new Promise((resolve) => {
        const box = document.createElement('div');
        box.className = 'km-note';
        box.setAttribute('role', 'alertdialog');
        box.innerHTML = `<span data-km="ask-msg"></span>`
          + `<button class="btn btn-ghost" data-km="ask-no">${esc(t('karmograph.stageForm.cancel'))}</button>`
          + `<button class="btn" data-km="ask-yes"></button>`;
        (box.querySelector('[data-km="ask-msg"]') as HTMLElement).textContent = msg;
        (box.querySelector('[data-km="ask-yes"]') as HTMLElement).textContent = okLabel;
        const back = focusKeeper();
        canvasEl.appendChild(box);
        trapTab(box);
        const done = (yes: boolean): void => { box.remove(); back(); resolve(yes); };
        (box.querySelector('[data-km="ask-yes"]') as HTMLButtonElement).onclick = () => done(true);
        (box.querySelector('[data-km="ask-no"]') as HTMLButtonElement).onclick = () => done(false);
        (box.querySelector('[data-km="ask-no"]') as HTMLButtonElement).focus();
        box.onkeydown = (ev) => {
          ev.stopPropagation();
          if (ev.key === 'Escape') done(false);
        };
      });
    }

    /**
     * 🔗 **직접 복사하는 길** — 클립보드가 막힌 자리에서 링크를 보여 준다 (KL-271).
     *
     * 예전엔 `prompt()` 였다. 판이 통째로 가려지고, 긴 주소는 한 줄짜리 시스템 창에서 끝이 안
     * 보이며, 「고치라는 건지 복사하라는 건지」가 안 읽혔다. 여기서는 **글자가 이미 골라진 채**로
     * 판 위에 뜬다 — 사람이 할 일은 Ctrl+C 하나다(단추도 함께 준다).
     */
    function showLinkBox(url: string): void {
      root.querySelector('.km-linkbox')?.remove();
      const box = document.createElement('div');
      box.className = 'km-linkbox';
      box.innerHTML = `<input data-km="link-out" readonly aria-label="${esc(t('karmograph.nodeLink.label4'))}" />`
        + `<button class="btn btn-ghost" data-km="link-copy">${esc(t('karmograph.linkBox.copy'))}</button>`
        + `<button class="btn btn-ghost" data-km="link-close" aria-label="${esc(t('karmograph.linkBox.close'))}">✕</button>`;
      canvasEl.appendChild(box);
      trapTab(box);
      const field = box.querySelector('[data-km="link-out"]') as HTMLInputElement;
      field.value = url;
      field.focus();
      field.select();
      // 판의 자판 손잡이가 이 칸의 글쇠를 훔쳐 가지 않게 막는다(Delete 로 카드가 지워졌다).
      field.onkeydown = (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape') box.remove();
      };
      (box.querySelector('[data-km="link-copy"]') as HTMLButtonElement).onclick = () => {
        field.select();
        // 여기까지 온 것은 클립보드가 막혔다는 뜻이라 한 번 더 시도하되, 안 되면 고르기까지가 몫이다.
        void navigator.clipboard?.writeText?.(url).then(
          () => { Toolbox.showToast?.(t('karmograph.nodeLink.label3'), undefined, undefined); box.remove(); },
          () => {},
        );
      };
      (box.querySelector('[data-km="link-close"]') as HTMLButtonElement).onclick = () => box.remove();
    }

    /** 화면 테마의 실제 배경색 — 투명 PNG 로 뽑으면 흰 배경 뷰어에서 글씨가 안 보인다. */
    function canvasBackground(): string {
      const probe = getComputedStyle(canvasEl).backgroundColor;
      return probe && probe !== 'rgba(0, 0, 0, 0)' ? probe : '#111318';
    }

    /**
     * 자랑할 **한 장** (TASK-KL-271 O1) — 그림 위에 판 이름, 아래에 범례를 두른 SVG.
     * 「그림으로 저장」과 「SVG 로 저장」이 같은 자리를 쓴다 — 갈리면 한쪽만 틀을 입는다.
     */
    function posterSvgString(): string | null {
      const art = canvas?.exportSVGString({ background: canvasBackground() });
      if (!art) return null;
      /* 범례도 **지금 보고 있는 시점**을 따라야 한다 — 2부를 보며 뽑았는데 범례가 1부 것이면
         그림과 설명이 어긋난다(어느 쪽을 믿을지 사람이 못 정한다). KL-271 X2. */
      const shownSpec = { nodes: spec.nodes, edges: resolveEdges(spec.edges, timeNow()) };
      const leg = posterLegend(shownSpec, (k) => kindLabel(k), (k) => edgeLabel(k));
      const items = legendWorthShowing(leg) ? [...leg.nodes, ...leg.edges] : [];
      const colors = kindColorsNow();
      const edgeColor = (id: string): string | undefined => spec._edge_kinds?.[id]?.color
        ?? edgeKindsNow().find((k) => k.id === id)?.color;
      const cs = getComputedStyle(root);
      const pick = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
      return wrapPoster(art, {
        title: activeMapName(),
        stamp: new Date().toLocaleDateString('sv-SE'),   // 2026-08-13 — 어느 나라 사람이 봐도 같은 순서
        legend: items,
        more: leg.moreNodes + leg.moreEdges,
        skin: {
          bg: canvasBackground(),
          text: pick('--text-primary', '#e2e8f0'),
          dim: pick('--text-secondary', '#94a3b8'),
          line: pick('--border', '#334155'),
        },
        iconOf: (it) => (it.of === 'node' ? kindIcon(it.kind) : ''),
        colorOf: (it) => (it.of === 'edge' ? edgeColor(it.kind) : colors[it.kind]),
      });
    }

    function exportImage(scale: number): void {
      if (spec.nodes.length === 0) {
        Toolbox.showToast?.(t('karmograph.exportImage.msg'), undefined, undefined);
        return;
      }
      const svgText = posterSvgString();
      if (!svgText) return;
      // data URI 로 넘긴다 — SVG 를 http URL 로 물리면 브라우저가 캔버스를 오염시켜
      // toBlob 이 통째로 막힌다(내보내기가 「아무 일도 안 일어남」이 된다).
      const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      const im = new Image();
      im.onload = () => {
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(im.width * scale));
        out.height = Math.max(1, Math.round(im.height * scale));
        const ctx = out.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(im, 0, 0, out.width, out.height);
        out.toBlob((blob) => {
          if (!blob) {
            showNote(t('karmograph.im.msg'));
            return;
          }
          downloadBlob(blob, 'karmograph.png');
          Toolbox.showToast?.(t('karmograph.savedPng', { w: out.width, h: out.height }), undefined, undefined);
        }, 'image/png');
      };
      im.onerror = () => showNote(t('karmograph.im.msg'));
      im.src = src;
    }

    q<HTMLButtonElement>('time-add').onclick = () => {
      const list = timesNow();
      const id = `time-${Date.now().toString(36)}`;
      lastAction = t('karmograph.time.addAct');
      spec.times = [...list, { id, name: nextTimeName(list, (n) => t('karmograph.time.nth', { n: String(n) })) }];
      spec._meta = { ...spec._meta, time: id };
      persistStructure();
      renderTimes();
      Toolbox.showToast?.(t('karmograph.time.added'), undefined, undefined);
    };
    q<HTMLButtonElement>('png').onclick = () => exportImage(2);
    /**
     * **종이 한 장으로** (TASK-KL-271 O7). 탁자에 펼쳐 놓고 여럿이 보는 자리가 있다 —
     * TRPG 세션·회의·수업. 브라우저 인쇄를 그냥 쓰면 도구의 손잡이·패널까지 찍히고 판이 잘린다.
     * 뽑을 것만 담은 한 장을 새 창에 띄워 인쇄한다(가로로 긴 판은 눕혀서).
     */
    q<HTMLButtonElement>('print').onclick = () => {
      const art = posterSvgString();
      if (!art) {
        Toolbox.showToast?.(t('karmograph.exportImage.msg'), undefined, undefined);
        return;
      }
      const win = window.open('', '_blank');
      if (!win) { showNote(t('karmograph.print.blocked')); return; }
      win.document.write(printSheetHtml({ title: activeMapName(), svg: art, landscape: isWide(art) }));
      win.document.close();
      // 그림이 다 실린 뒤에 인쇄창을 띄운다 — 먼저 띄우면 빈 종이가 나온다.
      win.addEventListener('load', () => win.print());
    };

    q<HTMLButtonElement>('export').onclick = () => {
      const data = JSON.stringify(canvas?.getSpec() ?? spec, null, 2);
      downloadBlob(new Blob([data], { type: 'application/json' }), 'karmograph.json');
    };

    // 남의 도구(Obsidian Canvas·Kinopio…)로 나가는 문. 나갈 길이 있어야 사람이 마음 놓고 쌓는다.
    // SVG = **글자가 글자로 남는** 그림. 인쇄·확대·검색이 되고, 남이 색만 바꿔 쓰기도 쉽다
    // (PNG 는 확대하면 뭉갠다). Sozi 계보 — 발표 결과물이 브라우저만 있으면 도는 한 장.
    q<HTMLButtonElement>('svg').onclick = () => {
      if (spec.nodes.length === 0) {
        Toolbox.showToast?.(t('karmograph.exportImage.msg'), undefined, undefined);
        return;
      }
      const svgText = posterSvgString();
      if (!svgText) return;
      downloadBlob(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }), 'karmograph.svg');
    };

    // 문서에 붙일 수 있는 **글**로. 그림 파일은 문서에 넣는 순간 죽는다(고치려면 도구로 돌아가야 하고,
    // 보통 안 돌아간다). Mermaid 는 깃허브·memo 에서 그대로 렌더된다.
    q<HTMLButtonElement>('mermaid').onclick = () => {
      const live = canvas?.getSpec() ?? spec;
      if (live.nodes.length === 0) {
        Toolbox.showToast?.(t('karmograph.exportImage.msg'), undefined, undefined);
        return;
      }
      /* 글로 옮기는 것도 **지금 보고 있는 판**이다 (KL-271 X2) — 2부를 보며 뽑았는데 1부가
         나오면 「내가 본 것과 다른 것」이 문서에 박힌다. */
      const text = toMermaidBlock({ ...live, edges: resolveEdges(live.edges, timeNow()) });
      downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), 'karmograph.mermaid.md');
      void navigator.clipboard?.writeText(text).then(
        () => Toolbox.showToast?.(t('karmograph.text.msg'), undefined, undefined),
        () => {},   // 클립보드는 못 쓸 수 있다(권한·문맥) — 파일이 이미 나갔으니 조용히 넘긴다
      );
    };

    /**
     * 장들을 **자리와 말**로 바꾼다 — 발표 SVG 도 영상도 같은 것을 필요로 한다.
     * (한 자리에 두 번 적어 두면 한쪽만 고쳐져 「SVG 는 맞는데 영상은 딴 데를 비춘다」가 된다.)
     */
    function storyScenes(): FilmScene[] {
      const live = canvas?.getSpec() ?? spec;
      const story = live.story ?? [];
      return story.map((st) => {
        const ids = st.rect ? (canvas?.nodesInWorldRect(st.rect) ?? []) : st.nodeIds;
        const boxes = ids.map((id) => live.nodes.find((n) => n.id === id)).filter(Boolean) as GraphNode[];
        // 틀로 담은 장은 그 틀을, 노드로 담은 장은 그 노드들을 감싼 자리를 쓴다(여백 조금).
        const rect = st.rect ?? (boxes.length > 0
          ? (() => {
              const minX = Math.min(...boxes.map((n) => n.x)) - 60;
              const minY = Math.min(...boxes.map((n) => n.y)) - 60;
              const maxX = Math.max(...boxes.map((n) => n.x + n.w)) + 60;
              const maxY = Math.max(...boxes.map((n) => n.y + n.h)) + 60;
              return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
            })()
          : { x: 0, y: 0, w: 1000, h: 700 });
        return { title: st.title, note: st.note, rect };
      });
    }

    /**
     * 굽는 그릇 고르기 — 브라우저마다 아는 코덱이 다르다. 아는 것 중 **먼저 오는 것**을 쓰고,
     * 하나도 모르면 그릇을 안 정한다(브라우저 기본값에 맡긴다 — 안 정하면 대개 돌아간다).
     */
    function pickFilmType(): MediaRecorderOptions | undefined {
      const want = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      const can = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
      const ok = want.find((m) => can?.isTypeSupported?.(m));
      return ok ? { mimeType: ok } : undefined;
    }

    /**
     * 🎬 **발표를 영상 한 편으로** (TASK-KL-271 O5).
     *
     * SVG 한 장도 결국 **눌러야** 돌아간다. 그런데 자랑하는 자리는 대개 못 누르는 곳이다 —
     * 디스코드, X, 유튜브. 거기선 영상만 저절로 재생된다. 각본(몇 초·어디서 어디로)은 `film.ts`
     * 가 정하고, 여기서는 **굽는 일**만 한다: 그림을 한 번 크게 굽고, 그 위를 카메라가 훑는다.
     *
     * 왜 한 번만 굽나 — 장마다 다시 그리면 40장짜리는 40번 굽는다. 그림은 안 변하고 **보는
     * 자리만** 변하므로, 큰 그림 하나를 잘라 비추면 된다(그래서 굽는 시간이 장 수와 무관하다).
     */
    q<HTMLButtonElement>('film').onclick = async () => {
      const scenes = storyScenes();
      if (scenes.length === 0) {
        Toolbox.showToast?.(t('karmograph.story.msg'), undefined, undefined);
        return;
      }
      const Rec = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
      const out = document.createElement('canvas');
      // 굽는 길이 없는 브라우저가 있다(사파리 옛 판·앱 안 브라우저) — 조용히 실패하는 대신 말한다.
      if (!Rec || typeof out.captureStream !== 'function') {
        Toolbox.showToast?.(t('karmograph.film.cant'), undefined, undefined);
        return;
      }
      const svgText = canvas?.exportSVGString({ background: canvasBackground() });
      if (!svgText) return;
      const vb = /viewBox="([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)"/.exec(svgText);
      if (!vb) return;
      const [vx, vy] = [Number(vb[1]), Number(vb[2])];

      const plan = filmPlan(scenes);
      const W = 1280;
      const H = 720;
      out.width = W;
      out.height = H;
      const ctx = out.getContext('2d');
      if (!ctx) return;

      // 그림은 **두 배로** 굽는다 — 한 장에 바싹 다가가는 컷에서 원본 크기로 구우면 뭉갠다.
      const SHARP = 2;
      const big = svgText.replace(/(<svg[^>]*?)width="(\d+)"\s+height="(\d+)"/,
        (_m, head: string, w: string, h: string) =>
          `${head}width="${Number(w) * SHARP}" height="${Number(h) * SHARP}"`);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(big)}`;
      try {
        await img.decode();
      } catch {
        Toolbox.showToast?.(t('karmograph.film.cant'), undefined, undefined);
        return;
      }

      const bg = canvasBackground();
      const draw = (ms: number): void => {
        const f = frameAt(plan, scenes, ms);
        if (!f) return;
        const box = fitRect(f.rect, W, H);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img,
          (box.x - vx) * SHARP, (box.y - vy) * SHARP, box.w * SHARP, box.h * SHARP,
          0, 0, W, H);
        // 말은 **아래에 얇게** 깐다 — 가운데를 가리면 정작 보여 주려던 그림이 안 보인다.
        const barH = f.note ? 96 : 64;
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, H - barH, W, barH);
        ctx.fillStyle = '#fff';
        ctx.font = '600 34px system-ui, sans-serif';
        ctx.fillText(f.title, 36, H - barH + 44, W - 72);
        if (f.note) {
          ctx.fillStyle = 'rgba(255,255,255,0.78)';
          ctx.font = '24px system-ui, sans-serif';
          ctx.fillText(f.note, 36, H - barH + 80, W - 72);
        }
      };

      draw(0);   // 첫 프레임을 미리 그려 둔다 — 첫 0.1초가 빈 화면이면 썸네일이 검게 잡힌다
      const chunks: Blob[] = [];
      const rec = new Rec(out.captureStream(30), pickFilmType());
      rec.ondataavailable = (ev: BlobEvent) => { if (ev.data.size > 0) chunks.push(ev.data); };
      const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
      rec.start();
      Toolbox.showToast?.(
        t('karmograph.film.making', { sec: String(Math.ceil(plan.totalMs / 1000)) }), undefined, undefined);

      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const tick = (): void => {
          const ms = performance.now() - t0;
          draw(ms);
          if (ms >= plan.totalMs) { resolve(); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      rec.stop();
      await done;
      const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
      downloadBlob(blob, filmFileName(activeMapName()));
      Toolbox.showToast?.(t('karmograph.film.done', { sec: String(Math.ceil(plan.totalMs / 1000)) }),
        undefined, undefined);
    };

    // 발표는 대개 **남의 기계**에서 열린다 — 결과물이 브라우저만 있으면 도는 한 장이어야 한다.
    q<HTMLButtonElement>('svg-story').onclick = () => {
      const scenes = storyScenes();
      if (scenes.length === 0) {
        Toolbox.showToast?.(t('karmograph.story.msg'), undefined, undefined);
        return;
      }
      const svgText = canvas?.exportSVGString({ background: canvasBackground() });
      if (!svgText) return;
      downloadBlob(
        new Blob([withPresentation(svgText, scenes)], { type: 'image/svg+xml;charset=utf-8' }),
        'karmograph-presentation.svg',
      );
      Toolbox.showToast?.(t('karmograph.savedDeck', { n: scenes.length }), undefined, undefined);
    };

    // 본 찍기 — 창고에 뜬 한 벌을 지금 화면 한가운데에 놓는다. id 는 새로 뽑으므로 같은 본을
    // 두 번 찍어도 서로 다른 인물이 된다(노트와 정반대: 노트는 같은 글, 본은 같은 모양).
    q<HTMLButtonElement>('stamps').onclick = () => {
      const list = loadStamps();
      if (list.length === 0) {
        Toolbox.showToast?.(t('karmograph.list.msg'), undefined, undefined);
        return;
      }
      sideMode = 'stamps';
      renderSide();
    };

    q<HTMLButtonElement>('canvas-out').onclick = () => {
      const src0 = canvas?.getSpec() ?? spec;
      // JSON Canvas 도 그림을 옮기는 것이라 지금 시점을 따른다(자료 통째 백업은 「JSON 내보내기」다).
      const data = JSON.stringify(
        toJsonCanvas({ ...src0, edges: resolveEdges(src0.edges, timeNow()) }), null, 2);
      downloadBlob(new Blob([data], { type: 'application/json' }), 'karmograph.canvas');
    };

    q<HTMLButtonElement>('import').onclick = () => fileEl.click();
    fileEl.onchange = () => {
      const file = fileEl.files?.[0];
      if (!file) return;
      void file
        .text()
        .then((text) => {
          const parsed = JSON.parse(text) as Partial<GraphSpec> & { nodes?: unknown[] };
          if (!Array.isArray(parsed.nodes)) throw new Error(t('karmograph.err.219'));
          // 남의 캔버스인지 우리 것인지는 **노드 모양**으로 갈린다(JSON Canvas 는 `type` 을 갖는다).
          // 확장자로 가르면 이름만 바꾼 파일에 속는다.
          const looksCanvas = parsed.nodes.some((n) => typeof (n as { type?: unknown }).type === 'string');
          spec = looksCanvas
            ? fromJsonCanvas(parsed, { ...emptyGraphSpec(), _edge_kinds: edgeDefsNow(), _meta: { pack: pack.id } })
            : ({
                ...emptyGraphSpec(),
                ...(parsed as Partial<GraphSpec>),
                nodes: (parsed.nodes as GraphNode[]).map((n) => ({ ...n, ports: n.ports ?? [] })),
              } as GraphSpec);
          selectedId = null;
          applyPack(spec._meta?.pack ?? pack.id, false);
          applySpec();
          canvas?.fitView();
          persistStructure();
          renderSide();
          Toolbox.showToast?.(t('karmograph.loadedNodes', { n: spec.nodes.length }), undefined, undefined);
        })
        .catch((e: unknown) => {
          console.error(t('karmograph.file.msg5'), e);
          showNote(t('karmograph.file.msg6'));
        })
        .finally(() => {
          fileEl.value = '';
        });
    };

    q<HTMLButtonElement>('clear').onclick = async () => {
      if (!await askNote(t('karmograph.file.msg7'), t('karmograph.ask.del'))) return;
      spec = emptyGraphSpec();
      spec._edge_kinds = { ...edgeDefsNow() };
      spec._meta = { pack: pack.id };
      selectedId = null;
      linkingFrom = null;
      canvasEl.classList.remove('km-linking');
      applySpec();
      store.clear();
      renderSide();
      snapshot(t('karmograph.act.clear'));   // 「전체 삭제」도 되돌릴 수 있어야 한다
    };

    // ── 맵 목록 (격차 H) ────────────────────────────────────────────────────
    const mapsEl = q<HTMLSelectElement>('maps');

    function renderMapList(): void {
      queueMicrotask(syncUpButton);
      mapsEl.innerHTML = library.maps
        .map((m) => `<option value="${escapeAttr(m.id)}"${m.id === library.activeId ? ' selected' : ''}>${escapeHtml(m.name)}</option>`)
        .join('');
    }

    /** 지금 열린 맵을 화면에 올린다. 맵을 바꿀 때마다 되돌리기 이력도 갈아 끼운다. */
    /**
     * 👁 보기 전용으로 들어간다. 되돌아가는 길(**내 것으로 복제**)을 반드시 함께 준다 —
     * 남의 관계도를 보다가 「여기서부터 내 걸로 이어 그리고 싶다」가 이 도구의 가장 자연스러운 다음 걸음이다.
     */
    let readOnly = false;
    function enterReadOnly(): void {
      if (readOnly) return;
      readOnly = true;
      root.classList.add('is-readonly');
      renderTimes();                // 시점 줄도 다시 짠다 — 고치는 단추를 빼야 한다
      canvas?.setEditable(false);   // 숨기는 게 아니라 **안 만든다**
      canvasEl.style.cursor = 'grab';
      const badge = document.createElement('div');
      badge.className = 'km-viewbadge';
      badge.innerHTML = t('karmograph.badge.msg');
      canvasEl.appendChild(badge);
      (badge.querySelector('[data-km="fork"]') as HTMLButtonElement).onclick = () => {
        readOnly = false;
        root.classList.remove('is-readonly');
        renderTimes();              // 내 것이 되었으니 고치는 단추도 돌려준다
        canvas?.setEditable(true);
        badge.remove();
        // 주소에서 보기 전용 표시를 지운다 — 새로고침해도 다시 잠기면 「복제했는데 또 잠긴다」가 된다.
        const url = new URL(location.href);
        url.searchParams.delete('kmv');
        history0.replaceState(null, '', url.toString());
        Toolbox.showToast?.(t('karmograph.fork.label'), undefined, undefined);
        renderSide();
      };
    }

    /**
     * 🔁 **다른 탭이 이 판을 고치면 따라간다** (KL-271).
     *
     * 105·106·107 회차는 「덮은 뒤에」 알리고 되찾는 길이었다. 그보다 나은 건 **덮을 일을 안
     * 만드는 것** — 내가 아직 이 판을 안 고쳤다면 다른 탭이 저장한 그것을 그대로 받으면 된다.
     * 이미 고쳤다면 말없이 갈아 끼우지 않는다(내 일이 사라지는 게 더 나쁘다) — 그때는 저장할 때
     * 뜨는 경고와 보관본이 받는다.
     */
    function followOtherTab(ev: StorageEvent): void {
      /* 목록이 바뀌었으면 **고르개도 따라간다** — 다른 탭에서 만든 판이 목록에 안 뜨면
         「분명 만들었는데 없다」가 된다(자료는 이제 안 사라진다 — 106회차 합치기. 화면만 낡았다). */
      if (ev.key === 'karmograph.index' && ev.newValue) {
        const fresh = loadLibrary();
        // 내가 보고 있는 판은 그대로 둔다 — 목록만 새로 그린다.
        library = { ...fresh, activeId: library.activeId };
        renderMapList();
        return;
      }
      /* 내 용어도 따라간다 — 다른 탭에서 만든 종류가 이 탭의 고르개에 없으면 「분명 만들었는데
         목록에 없다」가 된다(자료는 이제 안 사라진다 — 107회차 합치기. 화면만 낡았다). */
      if (ev.key === 'karmograph.terms' && ev.newValue) {
        /* ★ **내가 고친 적 있으면 갈아 끼우지 않는다.** 저쪽 저장이 늦게 도착하면 내 기억을
           옛것으로 되돌려 놓고, 그 다음 내 저장이 그 옛것을 그대로 써서 **내 용어가 사라졌다**
           (실측 2026-08-14: 둘이어야 할 것이 하나로). 자료는 합치기가 지키고, 화면은 다음에 열 때 맞는다. */
        if (termsTouched) return;
        /* ★ **자리를 갈아 끼우지 말고 속을 채운다.** 패널은 이 객체를 그대로 쥐고 있어서,
           변수만 새 객체로 바꾸면 패널이 **버려진 옛 객체**에 용어를 더한다 — 더한 것이 저장도
           화면도 안 된다(실측 2026-08-14: A 탭의 「새 종류」가 통째로 사라졌다). */
        const fresh = loadTerms();
        terms.nodeKinds = fresh.nodeKinds;
        terms.edgeKinds = fresh.edgeKinds;
        spec._edge_kinds = { ...edgeDefsNow(), ...(spec._edge_kinds ?? {}) };
        for (const e of terms.edgeKinds) {
          spec._edge_kinds[e.id] = { color: e.color, style: e.style, arrow: e.arrow, width: e.width };
        }
        canvas?.setKindColors(kindColorsNow());
        renderSide();
        return;
      }
      /* 공용 글도 따라간다 — 글은 판보다 오래 살고 **여러 판이 같은 글을 쓴다**. 저쪽에서 고친
         글이 이쪽 카드에 옛 글로 남아 있으면, 같은 글이 화면마다 다르게 보인다. */
      if (ev.key === 'karmograph.notes' && ev.newValue) {
        if (refreshFromLibrary(spec) > 0) {
          applySpec();
          renderSide();
          Toolbox.showToast?.(t('karmograph.otherTab.followed'), undefined, undefined);
        }
        return;
      }
      if (ev.key !== mapKey(library.activeId) || !ev.newValue) return;
      if (touchedHere || readOnly) return;
      void store.load().then((loaded) => {
        if (!loaded) return;
        spec = loaded;
        spec._edge_kinds = { ...edgeDefsNow(), ...(spec._edge_kinds ?? {}) };
        applySpec();
        renderSide();
        renderTimes();
        Toolbox.showToast?.(t('karmograph.otherTab.followed'), undefined, undefined);
      });
    }
    window.addEventListener('storage', followOtherTab);
    Toolbox.onDispose?.(() => window.removeEventListener('storage', followOtherTab));

    function openActiveMap(): void {
      touchedHere = false;   // 판을 새로 열면 「내가 고친 적 없다」로 돌아간다
      store = new KarmoGraphLocalStorageAdapter(mapKey(library.activeId));
      store.onWriteError = () => warnSaveFailed();
      store.onForeignWrite = () => warnOtherTab();
      history.length = 0;
      histIndex = -1;
      selectedId = null;
      linkingFrom = null;
      sideMode = 'node';
      void store.load().then((loaded) => {
        spec = loaded ?? emptyGraphSpec();
        // 관계 종류 정의는 항상 최신 셋으로 (저장본이 옛 정의를 갖고 있어도 색이 맞게).
        spec._edge_kinds = { ...edgeDefsNow(), ...(spec._edge_kinds ?? {}) };
        // 다른 맵에서 고친 공용 글을 여기서 한 번 받아 온다 — 라이브러리가 정본이다.
        refreshFromLibrary(spec);
        applyPack(spec._meta?.pack ?? DEFAULT_PACK_ID, false);
        const bg = (spec._meta?.bg ?? 'dots') as BackgroundKind;
        bgEl.value = bg;
        canvas?.setBackground(bg);
        applySpec();
        if (spec.nodes.length > 0) canvas?.fitView();
        renderSide();
        snapshot();   // 되돌리기의 바닥 — 불러온 그 상태
        syncHistoryButtons();
      });
    }

    mapsEl.onchange = () => {
      library = setActive(library, mapsEl.value);
      openActiveMap();
    };

    /**
     * ↑ 위 판으로 — 지금 판을 **담고 있는 카드**를 찾아 그리로 돌아간다.
     *   (단추 글자는 ↑ 이다. ⤴ 는 기본이 **이모지 표현**이라 단색 툴바에서 혼자 파란 칩으로
     *   떴다 — 이형 선택자를 붙여도 브라우저가 이모지 글꼴을 계속 골랐다. 실측 2026-08-12.)
     * 들어가는 길만 있고 나오는 길이 없으면 층이 미로가 된다(맵 고르개에서 이름으로 찾게 하는 건 길이 아니다).
     */
    function findParentOfCurrent(): { mapId: string; nodeId: string } | null {
      for (const m of library.maps) {
        if (m.id === library.activeId) continue;
        try {
          const raw = localStorage.getItem(mapKey(m.id));
          if (!raw) continue;
          const parsed = JSON.parse(raw) as Partial<GraphSpec>;
          const hit = (parsed.nodes ?? []).find((n) => n.subMap === library.activeId);
          if (hit) return { mapId: m.id, nodeId: hit.id };
        } catch {
          // 깨진 칸 하나 때문에 나가는 길이 막히면 안 된다 — 다음 맵을 계속 본다.
        }
      }
      return null;
    }

    function syncUpButton(): void {
      const btn = root.querySelector('[data-km="map-up"]') as HTMLButtonElement | null;
      if (btn) btn.classList.toggle('hidden', !findParentOfCurrent());
    }

    q<HTMLButtonElement>('map-up').onclick = () => {
      const parent = findParentOfCurrent();
      if (!parent) return;
      library = setActive(library, parent.mapId);
      renderMapList();
      openActiveMap();
      // 돌아가면 **그 카드가 골라져 있어야** 한다 — 어디서 나왔는지가 바로 보인다.
      setTimeout(() => {
        selectedId = parent.nodeId;
        sideMode = 'node';
        renderSide();
        canvas?.setSelectedNode(parent.nodeId);
        canvas?.fitToNodes([parent.nodeId], 240);
      }, 120);
    };

    q<HTMLButtonElement>('map-new').onclick = () => {
      const added = addMap(library, t('karmograph.mapNth', { n: library.maps.length + 1 }));
      library = added.index;
      renderMapList();
      openActiveMap();
    };

    q<HTMLButtonElement>('map-copy').onclick = () => {
      const json = JSON.stringify(canvas?.getSpec() ?? spec);
      const name = library.maps.find((m) => m.id === library.activeId)?.name ?? t('karmograph.file.msg3');
      const added = addMap(library, t('karmograph.copyOf', { name }), json);
      library = added.index;
      renderMapList();
      openActiveMap();
    };

    // 이름 옆 ✎ 와 서랍의 「이름 바꾸기」는 **같은 길**을 쓴다 — 두 길이 생기면 언젠가 갈라진다.
    const renameActiveMap = (): void => {
      const cur = library.maps.find((m) => m.id === library.activeId);
      const sel = q<HTMLSelectElement>('maps');
      const box = q<HTMLInputElement>('map-name');
      box.value = cur?.name ?? '';
      sel.classList.add('hidden');
      box.classList.remove('hidden');
      box.focus();
      box.select();
      let closed = false;
      const close = (keep: boolean): void => {
        if (closed) return;
        closed = true;
        const name = box.value.trim();
        box.classList.add('hidden');
        sel.classList.remove('hidden');
        // 이름을 통째로 비우면 옛 이름을 둔다 — 이름 없는 판은 고르개에서 못 고른다.
        if (keep && name && name !== cur?.name) {
          library = renameMap(library, library.activeId, name);
        }
        renderMapList();
      };
      box.onkeydown = (ev) => {
        ev.stopPropagation();   // 안 막으면 Delete·화살표가 판의 카드를 건드린다
        if (ev.key === 'Enter') { ev.preventDefault(); close(true); }
        if (ev.key === 'Escape') { ev.preventDefault(); close(false); }
      };
      // 적어 놓고 딴 데를 눌렀다고 지우면 화가 난다 — 적은 대로 둔다.
      box.onblur = () => close(true);
    };
    // 판 이름은 **이름 옆 ✎** 하나로만 바꾼다 — 서랍 안 같은 단추는 걷어냈다 (KL-271 P3).
    q<HTMLButtonElement>('map-rename2').onclick = renameActiveMap;

    q<HTMLButtonElement>('map-del').onclick = async () => {
      const cur = library.maps.find((m) => m.id === library.activeId);
      const last = library.maps.length <= 1;
      // 지우는 말은 **판 이름을 넣어** 묻는다 — 「어느 판이더라」를 되묻게 하지 않으려고.
      const name = cur?.name ?? t('karmograph.file.msg3');
      const msg = last ? t('karmograph.mapDel.last', { name }) : t('karmograph.mapDel.ask', { name });
      if (!await askNote(msg, t('karmograph.ask.del'))) return;
      library = removeMap(library, library.activeId);
      renderMapList();
      openActiveMap();
    };

    // ── 초기 로드 ───────────────────────────────────────────────────────────
    renderMapList();
    openActiveMap();

    // 주소에 공유 코드가 실려 있으면 **새 맵으로** 가져온다 — 열던 맵을 덮어쓰지 않는다.
    const shareCode = shareCodeFromLocation(location.search);
    if (shareCode) {
      void decodeShare(shareCode).then((data) => {
        const incoming = data as Partial<GraphSpec> | null;
        if (!incoming || !Array.isArray(incoming.nodes)) {
          Toolbox.showToast?.(t('karmograph.shareCode.msg'), undefined, undefined);
          return;
        }
        const added = addMap(library, t('karmograph.shareCode.msg2'));
        library = added.index;
        renderMapList();
        store = new KarmoGraphLocalStorageAdapter(mapKey(library.activeId));
      store.onWriteError = () => warnSaveFailed();
      store.onForeignWrite = () => warnOtherTab();
        spec = {
          ...emptyGraphSpec(),
          ...incoming,
          nodes: incoming.nodes.map((n) => ({ ...n, ports: n.ports ?? [] })),
        } as GraphSpec;
        store.saveSpec(spec);
        history.length = 0;
        histIndex = -1;
        applyPack(spec._meta?.pack ?? DEFAULT_PACK_ID, false);
        applySpec();
        canvas?.fitView();
        if (isReadOnlyLink(location.search)) enterReadOnly();
        // 주소가 카드를 가리키면 열자마자 그 카드를 고르고 화면을 맞춘다 — 안 그러면 받은 사람이
        // 큰 그림에서 「어디를 보라는 건지」 찾아 헤맨다.
        const anchor = nodeAnchorFromLocation(location.search);
        if (anchor && spec.nodes.some((n) => n.id === anchor)) {
          selectedId = anchor;
          sideMode = 'node';
          renderSide();
          canvas?.setSelectedNode(anchor);
          canvas?.fitToNodes([anchor], 220);
        }
        renderSide();
        snapshot();
        syncHistoryButtons();
        Toolbox.showToast?.(t('karmograph.loadedFromLink', { n: spec.nodes.length }), undefined, undefined);
      });
    }

    Mdd.linePreset('tool_run', {
      mood: 'idle',
      msg: t('karmograph.shareCode.msg3'),
    });
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
    );
  }

  function escapeAttr(s: string): string {
    return escapeHtml(s);
  }

  tb.register({
    ...(tb.getLazyWidgetPublicMeta ? tb.getLazyWidgetPublicMeta('karmograph') : { id: 'karmograph' }),
    tabs: [
      {
        id: 'karmograph-main',
        label: 'KarmoGraph',
        /* 도움말 목록(`help.ts`)이 말 묶음에서 오므로 **받고 나서** 그린다. */
        build: (container: HTMLElement): void => {
          /* ★ 스타일은 **마스코트 스크립트에 기대지 않는다** (TASK-KL-271, 원인 확정).
             `Mdd` 는 첫 그림에 안 필요해서 나중에 따로 실려 오고, 그때까지의 부름은 **줄을 세웠다가
             그 스크립트가 오면 흘려보낸다**(index.html 의 stub). 그 스크립트가 안 오는 판에서는
             줄이 영영 안 흘러 **위젯 스타일이 통째로 안 실렸다** — 화면은 그려지므로 「규칙이 안
             먹는다」로 보였고, 그 착시로 같은 자리를 세 번 고쳤다(실측: style 넷뿐, km 규칙 0).
             제 옷은 제가 입는다. 열 때마다 넣고, 있으면 덮어쓴다. */
          const styleId = 'km-css-karmograph';
          const styleEl = (document.getElementById(styleId) as HTMLStyleElement | null)
            ?? document.createElement('style');
          styleEl.id = styleId;
          if (styleEl.textContent !== KARMOGRAPH_CSS) styleEl.textContent = KARMOGRAPH_CSS;
          if (!styleEl.isConnected) (document.head || document.documentElement).appendChild(styleEl);
          void loadNamespace('karmograph').then(() => buildKarmoGraph(container));
        },
      },
    ],
  });
})();
