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
import { sampleFor, INTENTS } from './samples';
import { measureStorage, humanBytes, WARN_RATIO } from './storage-health';
import { help } from './help';
import type { PanelCtx } from './panels/context';
import { renderHelpPanel } from './panels/help-panel';
import { renderSnaPanel } from './panels/sna-panel';
import { resolveDoc, notesOf } from '../../lib/graph/notes';
import { mirrorToLibrary, refreshFromLibrary, foreignNotes, adoptNote } from './notes-library';
import { toJsonCanvas, fromJsonCanvas } from './json-canvas';
import { toMermaidBlock } from './mermaid';
import { withPresentation } from './presentation-svg';
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
    { id: 'rect', label: t('karmograph.t155'), icon: '▭' },
    { id: 'circle', label: t('karmograph.t156'), icon: '◯' },
    { id: 'bubble', label: t('karmograph.t157'), icon: '💬' },
    { id: 'note', label: t('karmograph.t158'), icon: '📝' },
    { id: 'photo', label: t('karmograph.t159'), icon: '🖼' },
  ];

  Mdd.injectCSS(
    'karmograph',
    `
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
    .km-toolbar select[data-km="new-kind"], .km-toolbar select[data-km="degree"] { max-width:102px; }
    .km-toolbar input[type=text] { min-width:132px; max-width:176px; }
    .km-toolbar input[data-km="find"] { min-width:118px; }
    .km-sep { width:1px; align-self:stretch; background:var(--border); margin:0 2px; }
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
    .km-mini .btn { padding:2px 6px; font-size:12px; line-height:1.2; }
    .km-side { width:clamp(300px, 26vw, 420px); flex-shrink:0; position:relative; z-index:2;
      border-left:1px solid var(--border); background:var(--bg-secondary);
      padding:10px; overflow-y:auto; font-size:var(--font-size-xs); }
    .km-tabs { display:flex; gap:2px; margin:-4px -4px 10px; padding-bottom:8px;
      border-bottom:1px solid var(--border); position:sticky; top:-12px; background:var(--bg-secondary); z-index:2; }
    .km-tab { padding:4px 7px; font-size:13px; opacity:.55; }
    .km-tab.is-on { opacity:1; background:var(--bg-tertiary); }
    .km-side.hidden { display:none; }
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
    .km-help-row { display:flex; gap:8px; align-items:baseline; padding:2px 0; }
    .km-help-how { color:var(--text-tertiary); font-size:11px; text-align:right; flex-shrink:0; max-width:58%; }
    .km-meter { height:8px; border-radius:999px; background:var(--bg-tertiary); overflow:hidden; }
    .km-meter-fill { height:100%; transition:width .2s ease; }
    .km-kind-find { margin-bottom:4px; }
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
    .km-drawer { position:absolute; right:0; top:calc(100% + 6px); z-index:20; min-width:190px;
      display:flex; flex-direction:column; gap:4px; padding:8px; border:1px solid var(--border);
      border-radius:var(--radius-sm); background:var(--bg-secondary); box-shadow:0 8px 24px rgba(0,0,0,.35); }
    .km-drawer.hidden { display:none; }
    .km-drawer label { display:flex; flex-direction:column; gap:4px; font-size:11px; color:var(--text-secondary); }
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
    .km-empty-in { max-width:min(760px, 100%); color:var(--text-tertiary); font-size:var(--font-size-sm);
      text-align:center; line-height:1.7; }
    /* 👁 보기 전용 — 편집 손잡이를 **아예 없앤다**. 「고쳐도 원본은 안 바뀝니다」를 글로 설명하는 것보다
       손잡이가 안 보이는 편이 헷갈림이 적다. 보는 일(끌기·확대·발표·내보내기)은 그대로 된다. */
    .km-root.is-readonly [data-km="add"],
    .km-root.is-readonly [data-km="undo"],
    .km-root.is-readonly [data-km="redo"],
    .km-root.is-readonly [data-km="new-kind"],
    .km-root.is-readonly [data-km="map-new"],
    .km-root.is-readonly .km-mini { display:none !important; }
    /* 옆 패널은 **남긴다** — 통째로 숨기면 탭까지 사라져 「저장·발표·관계망 읽기」 같은
       보는 일까지 못 하게 된다. 손잡이는 CSS 가 아니라 캔버스가 아예 안 만든다. */
    .km-root.is-readonly .km-viewbadge { position:absolute; left:12px; top:12px; z-index:16;
      display:flex; gap:8px; align-items:center; padding:6px 10px; border-radius:999px;
      background:var(--bg-secondary); border:1px solid var(--border); font-size:12px; }
    /* 저장 표시 — 조용히 왔다 사라진다. 늘 떠 있으면 그것대로 잔소리가 된다. */
    .km-saved { font-size:11px; color:var(--text-tertiary); padding:0 4px; opacity:.9; }
    .km-saved.hidden { display:none; }
    .km-linking { outline:2px dashed var(--accent); outline-offset:-2px; }
    /* 발표 모드 — 그림을 가리지 않게 아래에만 얹는다. */
    .km-stage { position:absolute; left:0; right:0; bottom:0; padding:14px 16px;
      background:linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0));
      display:flex; flex-direction:column; gap:6px; pointer-events:none; }
    .km-stage.hidden { display:none; }
    .km-stage-strip { display:flex; flex-wrap:wrap; gap:4px; pointer-events:auto; margin-bottom:2px; }
    .km-chip { padding:2px 8px; font-size:11px; border-radius:999px; color:rgba(255,255,255,.8);
      background:rgba(255,255,255,.08); }
    .km-chip.is-on { background:rgba(255,255,255,.28); color:#fff; }
    .km-stage-title { font-size:var(--font-size-lg); font-weight:700; color:#fff; }
    .km-stage-note { font-size:var(--font-size-sm); color:rgba(255,255,255,.82); }
    .km-stage-bar { display:flex; gap:6px; align-items:center; margin-top:4px; pointer-events:auto; }
    .km-stage-bar span { color:rgba(255,255,255,.7); font-size:var(--font-size-xs); min-width:48px; text-align:center; }
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
      .km-side { position:absolute; left:0; right:0; bottom:0; width:auto; z-index:18;
        max-height:64vh; border-left:none; border-top:1px solid var(--border);
        border-radius:14px 14px 0 0; box-shadow:0 -8px 24px rgba(0,0,0,.35);
        /* 접혔을 때 내다보이는 만큼 = **손잡이 높이 그대로**. 손잡이만 키우면 그 아래가 화면 밖으로 나가 안 눌린다. */
        transform:translateY(calc(100% - 44px)); transition:transform .18s ease; padding-top:44px; }
      .km-root.is-sheet-up .km-side { transform:translateY(0); }
      /* 손잡이 — 폰에서 시트를 올리고 내리는 유일한 자리라 **크게**(44px 규격) 잡는다. */
      .km-sheet-grip { position:absolute; left:0; right:0; top:0; height:44px; display:flex;
        align-items:center; justify-content:center; cursor:grab; }
      .km-sheet-grip::before { content:''; width:44px; height:4px; border-radius:999px; background:var(--border); }
      /* 폰에서 툴바가 **줄바꿈으로 부풀면** 그림이 그만큼 밀려난다(실측: 화면 절반을 먹었다).
         한 줄로 눕히고 옆으로 밀어 쓰게 한다 — 세로 공간이 폰에서 가장 비싼 자원이다. */
      .km-toolbar { gap:6px; padding:8px; flex-wrap:nowrap; overflow-x:auto; overflow-y:hidden;
        scrollbar-width:none; -webkit-overflow-scrolling:touch; }
      .km-toolbar::-webkit-scrollbar { display:none; }
      .km-toolbar > * { flex:0 0 auto; }
      .km-toolbar input[type=text] { min-width:110px; }
      .km-toolbar .btn { padding:6px 10px; }
    }
    /* 손가락에는 손가락 크기를 준다 (TASK-KL-202 방향④).
       실측: 폰에서 툴바 아이콘이 34×30px 이었다 — 애플 44pt · 머티리얼 48dp 권장의 절반 남짓이라
       ↶ 를 누르려다 ↷ 가 눌린다. 마우스가 있는 화면은 그대로 둔다(커서는 1px 도 정확하다). */
    @media (pointer: coarse) {
      .km-toolbar .btn, .km-mini .btn, .km-sheet .btn { min-height:44px; min-width:44px; }
      .km-toolbar select, .km-toolbar input[type=text] { min-height:44px; }
    }
    `
  );

  function buildKarmoGraph(container: HTMLElement): void {
    // 맵 여러 장 — 목록은 항상 최소 한 장을 보장한다(격차 H).
    let library: LibraryIndex = loadLibrary();
    let store = new KarmoGraphLocalStorageAdapter(mapKey(library.activeId));

    let spec: GraphSpec = emptyGraphSpec();
    let canvas: GraphCanvas | null = null;
    let selectedId: string | null = null;
    /** 연결 모드일 때 출발 노드 id. null 이면 평소 모드. */
    let linkingFrom: string | null = null;
    /** 오른쪽 패널이 무엇을 보여주는가 — 고른 노드냐, 묶음 목록이냐. */
    type SideMode = 'node' | 'groups' | 'terms' | 'filter' | 'many' | 'text' | 'sna' | 'storage' | 'notes' | 'stamps' | 'edge' | 'help';
    let sideMode: SideMode = 'node';
    /** Shift+드래그로 한 번에 고른 노드들. */
    let selectedMany: string[] = [];
    /** 지금 고른 선. 선에도 이야기가 붙는다(격차 Z). */
    /** 되돌리기 스택 이름이 `history` 라 브라우저 것과 겹친다 — 별칭으로 갈라 둔다. */
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
    const kindIcon = (id: string): string =>
      terms.nodeKinds.find((k) => k.id === id)?.icon ?? ALL_KIND_ICONS[id] ?? '·';
    const kindLabel = (id: string): string =>
      terms.nodeKinds.find((k) => k.id === id)?.label ?? allKindLabels()[id] ?? id;
    const edgeLabel = (id: string): string =>
      terms.edgeKinds.find((k) => k.id === id)?.label ?? allEdgeLabels()[id] ?? id;
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
          <select data-km="maps" title="${esc(t('karmograph.t92'))}"></select>
          <button class="btn btn-ghost hidden" data-km="map-up" title="${esc(t('karmograph.t93'))}">↑</button>
          <span class="km-saved hidden" data-km="saved" title="${esc(t('karmograph.t94'))}">${esc(t('karmograph.t117'))}</span>
          <button class="btn btn-ghost" data-km="map-new" title="${esc(t('karmograph.t95'))}">+</button>
          <select data-km="new-kind" title="${esc(t('karmograph.t96'))}">${nodeKindOptions()}</select>
          <span class="km-sep"></span>
          <input type="text" data-km="find" placeholder="${esc(t('karmograph.t97'))}" />
          <select data-km="degree" title="${esc(t('karmograph.t98'))}">
            <option value="">${esc(t('karmograph.t118'))}</option>
            <option value="0">${esc(t('karmograph.opt.0'))}</option>
            <option value="1">${esc(t('karmograph.opt.1'))}</option>
            <option value="2">${esc(t('karmograph.opt.2'))}</option>
          </select>
          <button class="btn btn-ghost" data-km="undo" title="${esc(t('karmograph.t99'))}" disabled>↶</button>
          <button class="btn btn-ghost" data-km="redo" title="${esc(t('karmograph.t100'))}" disabled>↷</button>
          <button class="btn btn-ghost" data-km="fit" title="${esc(t('karmograph.t101'))}">⤢</button>
          <button class="btn btn-ghost" data-km="story" title="${esc(t('karmograph.t102'))}">▶</button>
          <div class="km-more">
            <button class="btn btn-ghost" data-km="more" title="${esc(t('karmograph.t103'))}">⋯</button>
            <div class="km-drawer hidden" data-km="drawer">
              <label>${esc(t('karmograph.t119'))}
                <select data-km="bg">
                  <option value="dots">${esc(t('karmograph.opt.dots'))}</option>
                  <option value="grid">${esc(t('karmograph.opt.grid'))}</option>
                  <option value="cross">${esc(t('karmograph.opt.cross'))}</option>
                  <option value="none">${esc(t('karmograph.opt.none'))}</option>
                </select>
              </label>
              <button class="btn btn-ghost" data-km="storage">${esc(t('karmograph.t120'))}</button>
              <button class="btn btn-ghost" data-km="share">${esc(t('karmograph.t121'))}</button>
              <button class="btn btn-ghost" data-km="share-view">${esc(t('karmograph.t122'))}</button>
              <button class="btn btn-ghost" data-km="tidy">${esc(t('karmograph.t123'))}</button>
              <button class="btn btn-ghost" data-km="lay-circle">${esc(t('karmograph.t124'))}</button>
              <button class="btn btn-ghost" data-km="lay-tree">${esc(t('karmograph.t125'))}</button>
              <button class="btn btn-ghost" data-km="lay-time">${esc(t('karmograph.t126'))}</button>
              <button class="btn btn-ghost" data-km="from-text">${esc(t('karmograph.t127'))}</button>
              <button class="btn btn-ghost" data-km="stamps">${esc(t('karmograph.t128'))}</button>
              <button class="btn btn-ghost" data-km="png">${esc(t('karmograph.t129'))}</button>
              <button class="btn btn-ghost" data-km="svg">${esc(t('karmograph.t130'))}</button>
              <button class="btn btn-ghost" data-km="svg-story">${esc(t('karmograph.t131'))}</button>
              <button class="btn btn-ghost" data-km="export">${esc(t('karmograph.t132'))}</button>
              <button class="btn btn-ghost" data-km="import">${esc(t('karmograph.t133'))}</button>
              <button class="btn btn-ghost" data-km="canvas-out">${esc(t('karmograph.t134'))}</button>
              <button class="btn btn-ghost" data-km="mermaid">${esc(t('karmograph.t135'))}</button>
              <hr />
              <button class="btn btn-ghost" data-km="map-copy">${esc(t('karmograph.t136'))}</button>
              <button class="btn btn-ghost" data-km="map-rename">${esc(t('karmograph.t137'))}</button>
              <button class="btn btn-ghost" data-km="map-del">${esc(t('karmograph.t138'))}</button>
              <hr />
              <button class="btn btn-danger" data-km="clear">${esc(t('karmograph.t139'))}</button>
            </div>
          </div>
          <input type="file" accept="application/json,.json" data-km="file" hidden />
          <input type="file" accept="image/*" data-km="img" hidden />
          <input type="file" accept="application/json,.json" data-km="restore-file" hidden />
        </div>
        <div class="km-body">
          <div class="km-canvas" data-km="canvas">
            <div class="km-mini hidden" data-km="mini">
              <button class="btn btn-ghost" data-km="mini-link" title="${esc(t('karmograph.t104'))}">↝</button>
              <button class="btn btn-ghost" data-km="mini-note" title="${esc(t('karmograph.t105'))}">🗒</button>
              <button class="btn btn-ghost" data-km="mini-copy" title="${esc(t('karmograph.t106'))}">⧉</button>
              <button class="btn btn-ghost" data-km="mini-del" title="${esc(t('karmograph.t107'))}">🗑</button>
            </div>
            <div class="km-stage hidden" data-km="stage">
              <div class="km-stage-strip" data-km="stage-strip"></div>
              <div class="km-stage-title" data-km="stage-title"></div>
              <div class="km-stage-note" data-km="stage-note"></div>
              <div class="km-stage-bar">
                <button class="btn btn-ghost" data-km="stage-prev">◀</button>
                <span data-km="stage-count"></span>
                <button class="btn btn-ghost" data-km="stage-next">▶</button>
                <button class="btn btn-ghost" data-km="stage-auto" title="${esc(t('karmograph.t108'))}">${esc(t('karmograph.t140'))}</button>
                <button class="btn btn-ghost" data-km="stage-add">${esc(t('karmograph.t141'))}</button>
                <button class="btn btn-ghost" data-km="stage-back" title="${esc(t('karmograph.t109'))}">↤</button>
                <button class="btn btn-ghost" data-km="stage-fwd" title="${esc(t('karmograph.t110'))}">↦</button>
                <button class="btn btn-ghost" data-km="stage-rename" title="${esc(t('karmograph.t111'))}">✎</button>
                <button class="btn btn-ghost" data-km="stage-del">${esc(t('karmograph.t142'))}</button>
                <button class="btn btn-ghost" data-km="stage-exit">${esc(t('karmograph.t143'))}</button>
              </div>
            </div>
          </div>
          <div class="km-side hidden" data-km="side"></div>
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
      grip.title = t('karmograph.t160');
      grip.onclick = () => root.classList.toggle('is-sheet-up');
      sideEl.appendChild(grip);
    }
    function raiseSheet(): void {
      if (window.matchMedia('(max-width: 720px)').matches) root.classList.add('is-sheet-up');
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
          alert([
            t('karmograph.t163'),
            t('karmograph.t164'),
          ].join(String.fromCharCode(10)));
          return;
        }
        const used = new Set(library.maps.map((m) => m.name));
        let added = 0;
        for (const m of parsed.maps) {
          const spec0 = m.spec as Partial<GraphSpec> | null;
          if (!spec0 || !Array.isArray(spec0.nodes)) continue;
          const base = (m.name ?? t('karmograph.t165')).trim() || '맵';
          const name = used.has(base) ? t('karmograph.restoredName', { base }) : base;
          used.add(name);
          const res = addMap(library, name, JSON.stringify(spec0));
          library = res.index;
          added += 1;
        }
        renderMapList();
        openActiveMap();
        Toolbox.showToast?.(
          added === 0 ? t('karmograph.t166') : `맵 ${added}개를 되돌렸습니다`,
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
          console.error(t('karmograph.t167'), e);
          alert(t('karmograph.t168'));
        });
    };

    // ── 되돌리기 (TASK-KL-202 격차 F) ────────────────────────────────────────
    // 스냅샷 방식. 관계도는 노드 수십 개 규모라 JSON 통째로 떠도 싸고, 델타 방식과 달리
    // 「어떤 편집이든 되돌아간다」가 코드 한 줄로 보장된다 — 새 편집 기능을 붙일 때마다
    // undo 를 따로 안 짜도 된다. 그 대신 스냅샷 상한을 둬서 메모리를 묶는다.
    const HISTORY_MAX = 60;
    const history: string[] = [];
    let histIndex = -1;
    /** 되돌리는 중에는 스냅샷을 찍지 않는다 — 안 그러면 되돌린 것이 다시 기록된다. */
    let restoring = false;

    function snapshot(): void {
      if (restoring) return;
      const json = JSON.stringify(canvas?.getSpec() ?? spec);
      if (history[histIndex] === json) return;
      history.splice(histIndex + 1);   // 되돌린 뒤 새로 고치면 앞쪽 가지는 버린다
      history.push(json);
      if (history.length > HISTORY_MAX) history.shift();
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
    }

    // ── 저장 ────────────────────────────────────────────────────────────────
    // 구조 변경은 즉시 전체 저장. 좌표 변경은 캔버스가 debounce 후 어댑터로.
    /** 저장이 실패하면 화면에 남는 표시를 띄운다 — alert 는 닫으면 흔적이 없다. */
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
      return library.maps.find((m) => m.id === library.activeId)?.name ?? t('karmograph.t165');
    }

    /**
     * 저장 표시 — 이 도구는 **자동 저장**인데 그 말을 아무 데서도 안 했다. 처음 쓰는 사람은
     * 「저장 버튼이 어디 있지?」로 불안해하다가 창을 안 닫는다. 저장할 때마다 잠깐 「저장됨」을 켠다.
     */
    let savedTimer: ReturnType<typeof setTimeout> | null = null;
    function flashSaved(): void {
      const el = root.querySelector('[data-km="saved"]') as HTMLElement | null;
      if (!el) return;
      el.textContent = t('karmograph.t117');
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
    Toolbox.onDispose?.(() => {
      window.removeEventListener('resize', syncViewportFit);
      window.removeEventListener('orientationchange', syncViewportFit);
      fitObserver?.disconnect();
    });

    function persistStructure(): void {
      store.saveSpec(canvas?.getSpec() ?? spec);
      flashSaved();
      // 공용 글은 맵보다 오래 산다 — 저장할 때마다 사람 창고에도 같이 적어 둔다.
      mirrorToLibrary(spec, activeMapName());
      library = touchMap(library, library.activeId);
      snapshot();
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
      el.innerHTML = '<div class="km-empty-in">' +
        t('karmograph.t169') +
        t('karmograph.t170') +
        t('karmograph.t171') +
        t('karmograph.t172') +
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
          Toolbox.showToast?.(t('karmograph.t173'), undefined, undefined);
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
    function applyTerms(): void {
      saveTerms(terms);
      spec._edge_kinds = { ...edgeDefsNow(), ...(spec._edge_kinds ?? {}) };
      // 내 용어가 이긴다 — 방금 고친 색이 옛 정의에 덮이면 「고쳤는데 그대로」가 된다.
      for (const e of terms.edgeKinds) {
        spec._edge_kinds[e.id] = { color: e.color, style: e.style, arrow: e.arrow, width: e.width };
      }
      canvas?.setKindColors(kindColorsNow());
      newKindEl.innerHTML = nodeKindOptions();
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
      for (const p of parsed) {
        const id = nextId('node', takenN);
        takenN.add(id);
        idMap.set(p.id, id);
        const at = pos.get(p.id) ?? { x: center.x, y: center.y };
        const node: GraphNode = {
          id, kind: p.kind ?? kind, label: p.label, group: p.group ?? '',
          x: Math.round(at.x), y: Math.round(at.y),
          w: widthFor(p.label), h: NODE_H, ports: [],
          groups: p.groups,
          shape: p.shape,
          note: p.note ?? p.edgeLabel,
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
        spec.nodes = spec.nodes.filter((n) => !gone.has(n.id));
        spec.edges = spec.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
        for (const n of spec.nodes) {
          if (n.attachedTo && (gone.has(n.attachedTo) || goneEdges.has(n.attachedTo))) n.attachedTo = undefined;
        }
      },
      filterState,
      applyFilter: () => applyFilter(),
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
      restorePrevRevision: () => {
        const prev = store.loadPrev();
        if (!prev) {
          Toolbox.showToast?.(t('karmograph.t174'), undefined, undefined);
          return;
        }
        if (!confirm(t('karmograph.confirmRestore', { n: prev.nodes.length }))) return;
        spec = prev;
        applySpec();
        persistStructure();
        canvas?.fitView();
        sideMode = 'node';
        renderSide();
        Toolbox.showToast?.(t('karmograph.t175'), undefined, undefined);
      },
    };

    /**
     * 오른쪽 패널 탭 (KL-202 개편 1).
     * 패널이 아홉 가지로 늘었는데 서로 오가는 길이 없었다 — 각 패널에 「닫기」만 있어서
     * 다른 패널로 가려면 툴바에서 그 아이콘을 **다시 찾아야** 했다. 탭을 항상 띄워
     * 「지금 어디에 있고 어디로 갈 수 있는지」를 한자리에서 보인다.
     */
    const SIDE_TABS: { id: SideMode; icon: string; title: string }[] = [
      { id: 'node', icon: '◉', title: t('karmograph.t176') },
      { id: 'groups', icon: '🫧', title: t('karmograph.t177') },
      { id: 'terms', icon: '🏷', title: t('karmograph.t178') },
      { id: 'filter', icon: '🔍', title: t('karmograph.t179') },
      { id: 'sna', icon: '📊', title: t('karmograph.t180') },
      { id: 'notes', icon: '🔗', title: t('karmograph.t181') },
      { id: 'storage', icon: '💾', title: t('karmograph.t182') },
      { id: 'help', icon: '?', title: t('karmograph.t183') },
    ];

    /** 패널 내용을 그린 뒤 맨 앞에 탭을 얹는다 — 각 패널이 innerHTML 을 통째로 쓰기 때문. */
    function prependTabs(): void {
      const bar = document.createElement('div');
      bar.className = 'km-tabs';
      bar.innerHTML = SIDE_TABS.map(
        (tb0) => `<button class="btn btn-ghost km-tab${sideMode === tb0.id ? ' is-on' : ''}"
          data-km="tab" data-key="${tb0.id}" title="${tb0.title}">${tb0.icon}</button>`
      ).join('');
      sideEl.insertBefore(bar, sideEl.firstChild);
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
        // 빈 판에서는 **묻는 말이 맨 위**다. 「고르면 여기서 고칩니다」를 위에 두면 정작 첫 할 일이
        // 그 아래로 밀려 안 보인다(고를 것이 아직 하나도 없는데 고르라는 안내가 먼저 나온다).
        const pickHint = t('karmograph.t184');
        const empty = spec.nodes.length === 0 && intents.length > 0;
        sideEl.innerHTML = (empty ? '' : pickHint) +
          (!empty ? '' : `
            <div class="km-field">
              <label>${esc(t('karmograph.t144'))}</label>
              <div class="km-hint">${t('karmograph.packHint', { what: `<b>${esc(t('karmograph.t146'))}</b>` })}</div>
              <div class="km-intent">${intents.map((it) => `
                <button data-km="intent" data-key="${it.packId}">
                  <span class="km-intent-ico">${it.icon}</span>
                  <span class="km-intent-t">${escapeHtml(it.title)}</span>
                  <span class="km-intent-s">${escapeHtml(it.sub)}</span>
                </button>`).join('')}</div>
            </div>`);
        // 갈래를 고른 **뒤**가 진짜 막히는 자리다 — 견본은 깔렸는데 「이제 뭘 하지?」.
        // 다음 걸음 셋만 짧게 보여 주고, 한 번 닫으면 다시 안 뜬다(맵마다 기억한다).
        if (spec.nodes.length > 0 && spec._meta?.tips !== 'off') {
          const tips = document.createElement('div');
          tips.className = 'km-field';
          tips.innerHTML = t('karmograph.t185')
            + t('karmograph.t186')
            + t('karmograph.t187')
            + t('karmograph.t188')
            + t('karmograph.t189');
          sideEl.appendChild(tips);
          (tips.querySelector('[data-km="tips-off"]') as HTMLButtonElement).onclick = () => {
            spec._meta = { ...spec._meta, tips: 'off' };
            persistStructure();
            renderSide();
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
            // 칸 틀은 이제 카드가 태어날 때 함께 심긴다(seedFields) — 견본도 같은 길을 탄다.
            void before;
            applySpec();
            persistStructure();
            Toolbox.showToast?.(t('karmograph.t190'), undefined, undefined);
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

    function renderSideBody(): void {
      if (selectedId || selectedEdgeId) raiseSheet();
      if (sideMode === 'groups') {
        renderGroupsPanel(panelCtx);
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

      const related = spec.edges.filter((e) => e.from === node.id || e.to === node.id);
      const labelOf = (id: string): string => spec.nodes.find((n) => n.id === id)?.label ?? id;

      sideEl.innerHTML = `
        <h4>${kindIcon(node.kind)} 노드</h4>
        <div class="km-field">
          <label>${esc(t('karmograph.t148'))}</label>
          <input type="text" data-km="edit-label" value="${escapeAttr(node.label)}" />
        </div>
        <div class="km-field">
          <label>${esc(t('karmograph.t149'))}</label>
          <input type="text" class="km-kind-find" data-km="kind-find" placeholder="${esc(t('karmograph.t112'))}"
            aria-controls="km-kind-list" />
          <select id="km-kind-list" data-km="edit-kind">${nodeKindOptions(node.kind)}</select>
        </div>
        <div class="km-field">
          <label>${esc(t('karmograph.t150'))}</label>
          <input type="text" data-km="edit-note" value="${escapeAttr(node.note ?? '')}" placeholder="${esc(t('karmograph.t113'))}" />
        </div>
        ${tagsFieldHtml(panelCtx, node)}
        ${fieldsSectionHtml(panelCtx, node)}
        ${commentsSectionHtml(panelCtx, node.id)}
        ${docFieldHtml(panelCtx, node)}
        <div data-km="link-sections">${renderLinkSections(panelCtx, node)}</div>
        ${membershipFieldHtml(panelCtx, node)}
        ${shapeFieldHtml(panelCtx, node, shapes())}
        ${attachFieldHtml(panelCtx, node)}
        ${tiltFieldHtml(panelCtx, node)}
        ${avatarFieldHtml(panelCtx, node)}
        <div class="km-field">
          <label>${esc(t('karmograph.t151'))}</label>
          <select data-km="link-kind">${edgeKindOptions()}</select>
          <button class="btn btn-ghost" data-km="link-start">${linkingFrom === node.id ? t('karmograph.t191') : t('karmograph.t192')}</button>
          ${linkingFrom === node.id ? t('karmograph.t193') : ''}
        </div>
        <div class="km-field">
          <label>연결 ${related.length}개</label>
          ${
            related.length === 0
              ? t('karmograph.t194')
              : related
                  .map((e) => {
                    const outgoing = e.from === node.id;
                    const peer = outgoing ? e.to : e.from;
                    return `<div class="km-edge-row" data-edge="${escapeAttr(e.id)}">
                      <span class="km-edge-peer" title="${escapeAttr(labelOf(peer))}">${outgoing ? '→' : '←'} ${escapeHtml(labelOf(peer))}</span>
                      <select data-km="edge-kind">${edgeKindOptions(e.kind)}</select>
                      <button class="btn btn-ghost" data-km="edge-both" title="${esc(t('karmograph.t114'))}">${e.arrowStart ? '↔' : '→'}</button>
                      <button class="btn btn-ghost" data-km="edge-del" title="${esc(t('karmograph.t115'))}">×</button>
                      <input type="text" data-km="edge-label" class="km-edge-label" value="${escapeAttr(e.label ?? '')}" placeholder="${esc(t('karmograph.t116'))}" />
                    </div>`;
                  })
                  .join('')
          }
        </div>
        <button class="btn btn-ghost" data-km="node-copy">${esc(t('karmograph.t152'))}</button>
        <button class="btn btn-ghost" data-km="node-link">${esc(t('karmograph.t153'))}</button>
        <button class="btn btn-ghost" data-km="node-dive">${node.subMap ? t('karmograph.t195') : t('karmograph.t196')}</button>
        <button class="btn btn-danger" data-km="node-del">${esc(t('karmograph.t154'))}</button>`;

      // 이름 편집 — 입력할 때마다 반영 (폭도 같이 조정)
      const labelInput = sideEl.querySelector('[data-km="edit-label"]') as HTMLInputElement;
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
      bindCommentsSection(panelCtx, node.id, touch);

      // 링크 목록만 다시 그린다 — 패널 전체를 다시 그리면 타자 치던 커서가 날아간다.
      bindDocField(panelCtx, node, touch, () => {
        const holder = sideEl.querySelector('[data-km="link-sections"]');
        if (holder) {
          holder.innerHTML = renderLinkSections(panelCtx, node);
          bindLinkSections(panelCtx, selectedId);
        }
      });

      const noteInput = sideEl.querySelector('[data-km="edit-note"]') as HTMLInputElement;
      noteInput.oninput = () => {
        node.note = noteInput.value.trim() || undefined;
        touch(false);
      };

      bindMembershipField(panelCtx, node);

      bindAttachField(panelCtx, node, touch);

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
          Toolbox.showToast?.(t('karmograph.t197'), undefined, undefined);
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
            alert(t('karmograph.t198'));
            return;
          }
          try {
            await navigator.clipboard.writeText(url);
            Toolbox.showToast?.(t('karmograph.t199'), undefined, undefined);
          } catch {
            prompt(t('karmograph.t200'), url);
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

      bindLookFields(panelCtx, node, touch);

      bindAvatarField(panelCtx, node, touch);

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

      (sideEl.querySelector('[data-km="node-del"]') as HTMLButtonElement).onclick = () => {
        if (!confirm(t('karmograph.confirmDeleteEdges', { name: node.label }))) return;
        const goneEdges = new Set(
          spec.edges.filter((e) => e.from === node.id || e.to === node.id).map((e) => e.id)
        );
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
      canvas?.setSpec(spec);
      syncEmptyHint();
    }

    // ── 선 만들기 — 「연결 시작」 버튼과 손잡이 드래그가 같은 길을 쓴다 ──────
    function createEdge(from: string, to: string): void {
      const kindSel = sideEl.querySelector('[data-km="link-kind"]') as HTMLSelectElement | null;
      const kind = kindSel?.value || edgeKindsNow()[0].id;
      const dup = spec.edges.some(
        (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from)
      );
      if (dup) {
        Toolbox.showToast?.(t('karmograph.t201'), undefined, undefined);
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
      // 카드 위쪽에 띄우되, 화면 위로 넘치면 아래로 내린다(안 그러면 도구가 잘려 안 눌린다).
      const above = rect.y - 34;
      miniEl.style.left = `${Math.max(4, Math.round(rect.x))}px`;
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

    q<HTMLButtonElement>('mini-link').onclick = () => {
      if (!selectedId) return;
      linkingFrom = selectedId;
      canvasEl.classList.add('km-linking');
    };
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
        id: nextId('node', taken), kind: node.kind, label: t('karmograph.t158'), group: '',
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
    q<HTMLButtonElement>('mini-del').onclick = () => {
      const node = spec.nodes.find((n) => n.id === selectedId);
      if (!node) return;
      if (!confirm(t('karmograph.confirmDeleteEdges', { name: node.label }))) return;
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
      sideMode = 'node';
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
          snapshot();
        },
      },
      kindColors: kindColorsNow(),
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
        Toolbox.showToast?.(t('karmograph.t202'), undefined, undefined);
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
        sideMode = ids.length > 1 ? 'many' : 'node';
        renderSide();
      },
      onConnect: (fromId, toId) => {
        selectedId = fromId;
        createEdge(fromId, toId);
        renderSide();
      },
    });

    // ── 툴바 ────────────────────────────────────────────────────────────────
    const newKindEl = q<HTMLSelectElement>('new-kind');

    /**
     * 그 자리에 노드를 놓는다. 이름이 비면 빈 이름으로 만들고 오른쪽 이름 칸에 커서를 준다 —
     * 빈 곳을 두 번 눌러 바로 타이핑하는 흐름(Scapple·FigJam)이 이 길로 온다.
     */
    function spawnNodeAt(worldX: number, worldY: number, label: string): void {
      const kind = newKindEl.value || lastNodeKind;
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
      seedFields(node);
      resize(node);
      lastNodeKind = kind;
      spec.nodes.push(node);
      applySpec();
      persistStructure();
      selectedId = node.id;
      renderSide();
      if (!label) {
        const input = sideEl.querySelector('[data-km="edit-label"]') as HTMLInputElement | null;
        input?.focus();
      }
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
    const degreeEl = q<HTMLSelectElement>('degree');

    /** 시작점에서 n 다리까지 퍼진 노드 id 들. */
    function spread(startIds: string[], degree: number): Set<string> {
      const seen = new Set(startIds);
      let frontier = startIds;
      for (let d = 0; d < degree; d += 1) {
        const next: string[] = [];
        for (const e of spec.edges) {
          if (frontier.includes(e.from) && !seen.has(e.to)) { seen.add(e.to); next.push(e.to); }
          if (frontier.includes(e.to) && !seen.has(e.from)) { seen.add(e.from); next.push(e.from); }
        }
        if (next.length === 0) break;
        frontier = next;
      }
      return seen;
    }

    /**
     * 지금 봐야 할 것 계산. 찾기 글자가 있으면 **이름이 맞는 노드**가 시작점,
     * 없으면 **고른 노드**가 시작점. 둘 다 없으면 포커스 해제.
     */
    function syncFocus(): void {
      const q0 = findEl.value.trim().toLowerCase();
      const degRaw = degreeEl.value;
      let starts: string[] = [];
      if (q0) {
        starts = spec.nodes
          .filter((n) => n.label.toLowerCase().includes(q0) || (n.note ?? '').toLowerCase().includes(q0))
          .map((n) => n.id);
        if (starts.length === 0) {
          // 아무것도 안 맞으면 전부 흐려서 「없다」를 눈으로 보여 준다.
          canvas?.setFocus(new Set());
          return;
        }
      } else if (degRaw !== '' && selectedId) {
        starts = [selectedId];
      } else {
        canvas?.setFocus(null);
        return;
      }
      const degree = degRaw === '' ? 1 : Number(degRaw);
      canvas?.setFocus(spread(starts, degree));
    }

    findEl.oninput = syncFocus;
    degreeEl.onchange = syncFocus;

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
      (q<HTMLElement>('stage-title')).textContent = step?.title ?? t('karmograph.t203');
      (q<HTMLElement>('stage-note')).textContent =
        step?.note ?? t('karmograph.t204');
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
      if (btn) btn.textContent = t('karmograph.t140');
    }
    Toolbox.onDispose?.(stopAuto);

    q<HTMLButtonElement>('stage-auto').onclick = (ev) => {
      if (autoTimer) { stopAuto(); return; }
      (ev.currentTarget as HTMLButtonElement).textContent = t('karmograph.t205');
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
    q<HTMLButtonElement>('stage-add').onclick = () => {
      // 지금 또렷한 것들을 그대로 한 장으로 굳힌다. 포커스가 없으면 전체 장.
      const focused = currentFocusIds();
      const title = prompt(t('karmograph.t206'), `${steps().length + 1}장`)?.trim();
      if (title === undefined) return;
      const note = prompt(t('karmograph.t207'))?.trim();
      steps().splice(stepIndex + (steps().length ? 1 : 0), 0, {
        id: `step-${Date.now().toString(36)}`,
        title: title || t('karmograph.sceneNth', { n: steps().length + 1 }),
        nodeIds: focused,
        note: note || undefined,
        camera: canvas?.viewRectWorld(),
        // 또렷하게 고른 것이 없으면 「지금 보이는 자리」를 **틀**로 굳힌다. 그러면 나중에 그 자리에
        // 새 인물을 놓아도 이 장에 저절로 낀다(노드 목록이면 영영 안 낀다).
        rect: focused.length === 0 ? canvas?.viewRectWorld() : undefined,
      });
      stepIndex = Math.min(steps().length - 1, stepIndex + (steps().length > 1 ? 1 : 0));
      persistStructure();
      showStep();
    };
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
    q<HTMLButtonElement>('stage-rename').onclick = () => {
      const step = steps()[stepIndex];
      if (!step) return;
      const title = prompt(t('karmograph.t206'), step.title)?.trim();
      if (!title) return;
      step.title = title;
      persistStructure();
      showStep();
    };

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
      const degRaw = degreeEl.value;
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
      newKindEl.innerHTML = nodeKindOptions();
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

    function makeShareLink(readOnly: boolean): void {
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
            && confirm(t('karmograph.confirmLeanShare', { n: lean.removed }))) {
            url = leanUrl;
          } else {
            alert(
              t('karmograph.tooBigForLink', { k: Math.round(url.length / 1000) }) + '\n' +
              t('karmograph.t208')
            );
            return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          Toolbox.showToast?.(t('karmograph.t209'), undefined, undefined);
        } catch {
          // 클립보드가 막힌 자리(비보안 컨텍스트 등)에서도 사람이 직접 복사할 수 있게 보여 준다.
          prompt(t('karmograph.t200'), url);
        }
      });
    }
    q<HTMLButtonElement>('share').onclick = () => makeShareLink(false);
    // 보여 주기만 할 때 쓰는 링크 — 받는 쪽에서 편집 손잡이가 사라진다(고쳐도 원본은 안 바뀐다는
    // 사실을 말로 설명하는 것보다, 애초에 못 고치게 하는 편이 헷갈림이 적다).
    q<HTMLButtonElement>('share-view').onclick = () => makeShareLink(true);

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
      Toolbox.showToast?.(`${placed.size}개를 ${kind === 'circle' ? t('karmograph.t210') : t('karmograph.t211')} 놓았습니다 — Ctrl+Z 로 되돌립니다`, undefined, undefined);
    }
    // 연표 — 「언제」가 적힌 칸을 시간축으로 삼는다. 어느 칸인지는 **숫자가 가장 많이 든 칸**으로 고른다
    // (사람에게 「날짜 칸을 먼저 정하라」고 시키면 아무도 안 쓴다).
    q<HTMLButtonElement>('lay-time').onclick = () => {
      const live = canvas?.getSpec() ?? spec;
      const field = bestTimeField(live.nodes);
      if (!field) {
        Toolbox.showToast?.(t('karmograph.t212'), undefined, undefined);
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
        n === 0 ? t('karmograph.t213') : `겹친 ${n}개를 밀었습니다`,
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
      if ((ev.target as HTMLElement).closest('button')) drawerEl.classList.add('hidden');
    };
    function closeDrawer(): void { drawerEl.classList.add('hidden'); }
    document.addEventListener('click', closeDrawer);
    Toolbox.onDispose?.(() => document.removeEventListener('click', closeDrawer));

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
        if (ev.key === 'Tab') {
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
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && selectedId) {
          const node = spec.nodes.find((n) => n.id === selectedId);
          if (node && confirm(t('karmograph.confirmDeleteNode', { name: node.label }))) {
            ev.preventDefault();
            (sideEl.querySelector('[data-km="node-del"]') as HTMLButtonElement | null)?.click();
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

    q<HTMLButtonElement>('fit').onclick = () => canvas?.fitView();

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

    /** 화면 테마의 실제 배경색 — 투명 PNG 로 뽑으면 흰 배경 뷰어에서 글씨가 안 보인다. */
    function canvasBackground(): string {
      const probe = getComputedStyle(canvasEl).backgroundColor;
      return probe && probe !== 'rgba(0, 0, 0, 0)' ? probe : '#111318';
    }

    function exportImage(scale: number): void {
      if (spec.nodes.length === 0) {
        Toolbox.showToast?.(t('karmograph.t214'), undefined, undefined);
        return;
      }
      const svgText = canvas?.exportSVGString({ background: canvasBackground() });
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
            alert(t('karmograph.t215'));
            return;
          }
          downloadBlob(blob, 'karmograph.png');
          Toolbox.showToast?.(t('karmograph.savedPng', { w: out.width, h: out.height }), undefined, undefined);
        }, 'image/png');
      };
      im.onerror = () => alert(t('karmograph.t215'));
      im.src = src;
    }

    q<HTMLButtonElement>('png').onclick = () => exportImage(2);

    q<HTMLButtonElement>('export').onclick = () => {
      const data = JSON.stringify(canvas?.getSpec() ?? spec, null, 2);
      downloadBlob(new Blob([data], { type: 'application/json' }), 'karmograph.json');
    };

    // 남의 도구(Obsidian Canvas·Kinopio…)로 나가는 문. 나갈 길이 있어야 사람이 마음 놓고 쌓는다.
    // SVG = **글자가 글자로 남는** 그림. 인쇄·확대·검색이 되고, 남이 색만 바꿔 쓰기도 쉽다
    // (PNG 는 확대하면 뭉갠다). Sozi 계보 — 발표 결과물이 브라우저만 있으면 도는 한 장.
    q<HTMLButtonElement>('svg').onclick = () => {
      if (spec.nodes.length === 0) {
        Toolbox.showToast?.(t('karmograph.t214'), undefined, undefined);
        return;
      }
      const svgText = canvas?.exportSVGString({ background: canvasBackground() });
      if (!svgText) return;
      downloadBlob(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }), 'karmograph.svg');
    };

    // 문서에 붙일 수 있는 **글**로. 그림 파일은 문서에 넣는 순간 죽는다(고치려면 도구로 돌아가야 하고,
    // 보통 안 돌아간다). Mermaid 는 깃허브·memo 에서 그대로 렌더된다.
    q<HTMLButtonElement>('mermaid').onclick = () => {
      const live = canvas?.getSpec() ?? spec;
      if (live.nodes.length === 0) {
        Toolbox.showToast?.(t('karmograph.t214'), undefined, undefined);
        return;
      }
      const text = toMermaidBlock(live);
      downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), 'karmograph.mermaid.md');
      void navigator.clipboard?.writeText(text).then(
        () => Toolbox.showToast?.(t('karmograph.t216'), undefined, undefined),
        () => {},   // 클립보드는 못 쓸 수 있다(권한·문맥) — 파일이 이미 나갔으니 조용히 넘긴다
      );
    };

    // 발표는 대개 **남의 기계**에서 열린다 — 결과물이 브라우저만 있으면 도는 한 장이어야 한다.
    q<HTMLButtonElement>('svg-story').onclick = () => {
      const live = canvas?.getSpec() ?? spec;
      const story = live.story ?? [];
      if (story.length === 0) {
        Toolbox.showToast?.(t('karmograph.t217'), undefined, undefined);
        return;
      }
      const svgText = canvas?.exportSVGString({ background: canvasBackground() });
      if (!svgText) return;
      const scenes = story.map((st) => {
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
        Toolbox.showToast?.(t('karmograph.t218'), undefined, undefined);
        return;
      }
      sideMode = 'stamps';
      renderSide();
    };

    q<HTMLButtonElement>('canvas-out').onclick = () => {
      const data = JSON.stringify(toJsonCanvas(canvas?.getSpec() ?? spec), null, 2);
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
          console.error(t('karmograph.t220'), e);
          alert(t('karmograph.t221'));
        })
        .finally(() => {
          fileEl.value = '';
        });
    };

    q<HTMLButtonElement>('clear').onclick = () => {
      if (!confirm(t('karmograph.t222'))) return;
      spec = emptyGraphSpec();
      spec._edge_kinds = { ...edgeDefsNow() };
      spec._meta = { pack: pack.id };
      selectedId = null;
      linkingFrom = null;
      canvasEl.classList.remove('km-linking');
      applySpec();
      store.clear();
      renderSide();
      snapshot();   // 「전체 삭제」도 되돌릴 수 있어야 한다 — 여기가 제일 아쉬운 자리다
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
      canvas?.setEditable(false);   // 숨기는 게 아니라 **안 만든다**
      canvasEl.style.cursor = 'grab';
      const badge = document.createElement('div');
      badge.className = 'km-viewbadge';
      badge.innerHTML = t('karmograph.t223');
      canvasEl.appendChild(badge);
      (badge.querySelector('[data-km="fork"]') as HTMLButtonElement).onclick = () => {
        readOnly = false;
        root.classList.remove('is-readonly');
        canvas?.setEditable(true);
        badge.remove();
        // 주소에서 보기 전용 표시를 지운다 — 새로고침해도 다시 잠기면 「복제했는데 또 잠긴다」가 된다.
        const url = new URL(location.href);
        url.searchParams.delete('kmv');
        history0.replaceState(null, '', url.toString());
        Toolbox.showToast?.(t('karmograph.t224'), undefined, undefined);
        renderSide();
      };
    }

    function openActiveMap(): void {
      store = new KarmoGraphLocalStorageAdapter(mapKey(library.activeId));
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
      const name = library.maps.find((m) => m.id === library.activeId)?.name ?? t('karmograph.t165');
      const added = addMap(library, t('karmograph.copyOf', { name }), json);
      library = added.index;
      renderMapList();
      openActiveMap();
    };

    q<HTMLButtonElement>('map-rename').onclick = () => {
      const cur = library.maps.find((m) => m.id === library.activeId);
      const name = prompt(t('karmograph.t225'), cur?.name ?? '')?.trim();
      if (!name) return;
      library = renameMap(library, library.activeId, name);
      renderMapList();
    };

    q<HTMLButtonElement>('map-del').onclick = () => {
      const cur = library.maps.find((m) => m.id === library.activeId);
      const last = library.maps.length <= 1;
      const msg = last
        ? `"${cur?.name ?? t('karmograph.t165')}" 의 내용을 모두 지울까요? (마지막 한 장이라 맵 자체는 남습니다)`
        : `"${cur?.name ?? t('karmograph.t165')}" 맵을 지울까요? 되돌릴 수 없습니다.`;
      if (!confirm(msg)) return;
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
          Toolbox.showToast?.(t('karmograph.t226'), undefined, undefined);
          return;
        }
        const added = addMap(library, t('karmograph.t227'));
        library = added.index;
        renderMapList();
        store = new KarmoGraphLocalStorageAdapter(mapKey(library.activeId));
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
      msg: t('karmograph.t228'),
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
          void loadNamespace('karmograph').then(() => buildKarmoGraph(container));
        },
      },
    ],
  });
})();
