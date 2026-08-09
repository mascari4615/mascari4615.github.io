/**
 * karmomap.ts — 세계관 그래프 위젯 (TASK-KL-087 단위 1).
 *
 * 사용자: "KarmoMap 프로그램 만들고 싶어. 마인드맵, 그래프, 관계도 같은 건데.
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
 * KarmoMap 은 그릇이고 렌즈지, 작가가 아니다.
 */
import { GraphCanvas } from '../../lib/graph/canvas';
import type { GraphSpec, GraphNode, GraphEdge, GroupDef, NodeShape, BackgroundKind, EdgeKindDef, StoryStep } from '../../lib/graph/spec';
import { emptyGraphSpec } from '../../lib/graph/spec';
import { KarmoMapLocalStorageAdapter } from './local-storage-adapter';
import { loadTerms, saveTerms, newTermId, type MyTerms } from './terms';
import { parseOutline, layoutTree } from './from-text';
import { sampleFor } from './samples';
import { measureStorage, humanBytes, WARN_RATIO } from './storage-health';
import { HELP } from './help';
import type { PanelCtx } from './panels/context';
import { renderHelpPanel } from './panels/help-panel';
import { renderSnaPanel } from './panels/sna-panel';
import { renderStoragePanel } from './panels/storage-panel';
import { renderFilterPanel } from './panels/filter-panel';
import { renderTermsPanel } from './panels/terms-panel';
import { outgoingLinks, backlinks, unlinkedMentions, linkFirstMention } from './links';
import { snapToGrid, unoverlap } from './tidy';
import { computeSna, topBy } from './sna';
import { encodeShare, decodeShare, shareCodeFromLocation, buildShareUrl, SHARE_URL_LIMIT } from './share';
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
  ALL_KIND_LABELS,
  ALL_EDGE_KIND_DEFS,
  ALL_EDGE_LABELS,
  type CanvasPack,
} from './packs';

(function (): void {
  if (typeof Toolbox === 'undefined') return;
  const tb = Toolbox;

  const NODE_H = 40;
  const NODE_MIN_W = 120;
  /** 얼굴 사진은 이 픽셀로 줄여 넣는다 — 원본을 그대로 넣으면 localStorage 가 몇 장에 터진다. */
  const AVATAR_PX = 96;

  const SHAPES: { id: NodeShape; label: string; icon: string }[] = [
    { id: 'rect', label: '카드', icon: '▭' },
    { id: 'circle', label: '동그라미', icon: '◯' },
    { id: 'bubble', label: '말풍선', icon: '💬' },
    { id: 'note', label: '메모', icon: '📝' },
    { id: 'photo', label: '사진 카드', icon: '🖼' },
  ];

  Mdd.injectCSS(
    'karmomap',
    `
    /* ★ 높이를 화면에서 직접 가져온다. height:100% 는 셸 카드가 높이를 안 주면 0 이 되고,
       그때 캔버스는 117px 까지 눌렸다가 다음 실행엔 420px 이 되는 식으로 **들쭉날쭉**했다
       (실측 2026-08-09 — 같은 코드로 두 번 돌려 다른 결과가 났다). 캔버스는 넓이가 곧 쓸모라
       셸에 기대지 않고 스스로 확보한다. */
    .km-root { display:flex; flex-direction:column; width:100%;
      height:min(82vh, 920px); min-height:560px; overflow:hidden; }
    /* position+z-index — 캔버스 svg 를 absolute inset:0 로 깔면서, 툴바가 두 줄이 되는 순간
       그 svg 가 툴바 아랫줄을 덮어 **버튼이 눌리지 않았다**(실측 2026-08-09: 「⋯」 자리를 찍으면
       svg 가 잡혔다). 화면은 멀쩡해 보이는데 클릭만 죽는 부류라 눈으로는 못 잡는다. */
    /* 툴바는 짧게 유지한다. 실측 2026-08-09: 항목이 늘며 384px(5줄)까지 자라 캔버스를 먹었고,
       그렇다고 안에서 스크롤시키면 이번엔 버튼이 「멈추지 않아」 자동 조작이 통째로 막혔다.
       답은 스크롤이 아니라 **항목을 줄이는 것** — 노드 만들기는 빈 곳 더블클릭이 대신한다. */
    .km-toolbar { position:relative; z-index:5; display:flex; flex-wrap:wrap; gap:6px; align-items:center;
      padding:8px 12px; border-bottom:1px solid var(--border); background:var(--bg-secondary); flex-shrink:0; }
    .km-toolbar input[type=text], .km-toolbar select, .km-side select, .km-side input[type=text] {
      background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-primary);
      border-radius:var(--radius-sm); padding:5px 8px; font-size:var(--font-size-xs); }
    .km-toolbar input[type=text] { min-width:180px; }
    .km-toolbar input[data-km="find"] { min-width:130px; }
    .km-sep { width:1px; align-self:stretch; background:var(--border); margin:0 2px; }
    .km-body { flex:1; display:flex; min-height:0; }
        /* ★ 캔버스 최소 높이 — 툴바가 줄바꿈으로 커지면 flex 가 캔버스부터 깎는다.
       실측 2026-08-09: 툴바가 커지며 캔버스가 156px 로 눌려 더블클릭이 화면 밖으로 나갔다. */
    .km-canvas { flex:1; position:relative; min-width:0; min-height:420px; background:var(--bg-tertiary); }
    .km-side { width:264px; flex-shrink:0; border-left:1px solid var(--border); background:var(--bg-secondary);
      padding:12px; overflow-y:auto; font-size:var(--font-size-xs); }
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
    .km-empty [data-km="sample"] { pointer-events:auto; }
    .km-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      color:var(--text-tertiary); font-size:var(--font-size-sm); text-align:center; pointer-events:none;
      padding:24px; line-height:1.7; }
    .km-linking { outline:2px dashed var(--accent); outline-offset:-2px; }
    /* 발표 모드 — 그림을 가리지 않게 아래에만 얹는다. */
    .km-stage { position:absolute; left:0; right:0; bottom:0; padding:14px 16px;
      background:linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0));
      display:flex; flex-direction:column; gap:6px; pointer-events:none; }
    .km-stage.hidden { display:none; }
    .km-stage-title { font-size:var(--font-size-lg); font-weight:700; color:#fff; }
    .km-stage-note { font-size:var(--font-size-sm); color:rgba(255,255,255,.82); }
    .km-stage-bar { display:flex; gap:6px; align-items:center; margin-top:4px; pointer-events:auto; }
    .km-stage-bar span { color:rgba(255,255,255,.7); font-size:var(--font-size-xs); min-width:48px; text-align:center; }
    .km-root.is-presenting .km-toolbar,
    .km-root.is-presenting .km-side { display:none; }
    /* 좁은 화면 — 옆에 붙던 편집 패널을 아래로 내린다. 레퍼런스들은 여기서 기능을 지웠지만
       여기선 배치만 바꾼다(묶음·선 편집 전부 그대로 쓴다). */
    @media (max-width: 720px) {
      .km-body { flex-direction:column; }
      .km-side { width:auto; max-height:45%; border-left:none; border-top:1px solid var(--border); }
      .km-toolbar { gap:6px; padding:8px; }
      .km-toolbar input[type=text] { min-width:120px; flex:1; }
      .km-toolbar .btn { padding:6px 10px; }
    }
    `
  );

  function buildKarmoMap(container: HTMLElement): void {
    // 맵 여러 장 — 목록은 항상 최소 한 장을 보장한다(격차 H).
    let library: LibraryIndex = loadLibrary();
    let store = new KarmoMapLocalStorageAdapter(mapKey(library.activeId));

    let spec: GraphSpec = emptyGraphSpec();
    let canvas: GraphCanvas | null = null;
    let selectedId: string | null = null;
    /** 연결 모드일 때 출발 노드 id. null 이면 평소 모드. */
    let linkingFrom: string | null = null;
    /** 오른쪽 패널이 무엇을 보여주는가 — 고른 노드냐, 묶음 목록이냐. */
    type SideMode = 'node' | 'groups' | 'terms' | 'filter' | 'many' | 'text' | 'sna' | 'storage' | 'edge' | 'help';
    let sideMode: SideMode = 'node';
    /** Shift+드래그로 한 번에 고른 노드들. */
    let selectedMany: string[] = [];
    /** 지금 고른 선. 선에도 이야기가 붙는다(격차 Z). */
    let selectedEdgeId: string | null = null;
    /** 화면에서 뺀 종류들 — 자료는 그대로 두고 보기만 줄인다(격차 M-3). */
    const filterState = {
      nodeKinds: new Set<string>(),
      edgeKinds: new Set<string>(),
      tags: new Set<string>(),
      hideOrphans: false,
      sizeByDegree: false,
      colorByTag: false,
    };
    /** 지금 끼워진 어휘 팩. `spec._meta.pack` 에 함께 저장된다. */
    let pack: CanvasPack = packById(DEFAULT_PACK_ID);
    /** 사용자가 직접 만든 종류. 맵이 아니라 **사람**에게 붙는다(격차 A-2). */
    let terms: MyTerms = loadTerms();

    // 팩 + 내 용어를 합친 것이 「지금 쓸 수 있는 말」이다. 아래 조회는 전부 이걸 거친다.
    const nodeKindsNow = (): typeof pack.nodeKinds => [...pack.nodeKinds, ...terms.nodeKinds];
    const edgeKindsNow = (): typeof pack.edgeKinds => [...pack.edgeKinds, ...terms.edgeKinds];
    const kindIcon = (id: string): string =>
      terms.nodeKinds.find((k) => k.id === id)?.icon ?? ALL_KIND_ICONS[id] ?? '·';
    const kindLabel = (id: string): string =>
      terms.nodeKinds.find((k) => k.id === id)?.label ?? ALL_KIND_LABELS[id] ?? id;
    const edgeLabel = (id: string): string =>
      terms.edgeKinds.find((k) => k.id === id)?.label ?? ALL_EDGE_LABELS[id] ?? id;
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
      const list = nodeKindsNow();
      const ids = list.map((k) => k.id);
      const extra = selected && !ids.includes(selected) ? [selected] : [];
      return [
        ...list.map(
          (k) => `<option value="${k.id}"${k.id === selected ? ' selected' : ''}>${k.icon} ${k.label}</option>`
        ),
        ...extra.map((id) => `<option value="${id}" selected>${kindIcon(id)} ${kindLabel(id)}</option>`),
      ].join('');
    }

    /** 선 종류 <option> — 같은 이유로 팩 밖 종류를 보존한다. */
    function edgeKindOptions(selected?: string): string {
      const list = edgeKindsNow();
      const ids = list.map((k) => k.id);
      const extra = selected && !ids.includes(selected) ? [selected] : [];
      return [
        ...list.map(
          (k) => `<option value="${k.id}"${k.id === selected ? ' selected' : ''}>${k.label}</option>`
        ),
        ...extra.map((id) => `<option value="${id}" selected>${edgeLabel(id)}</option>`),
      ].join('');
    }

    container.innerHTML = `
      <div class="km-root">
        <div class="km-toolbar">
          <select data-km="maps" title="맵 고르기"></select>
          <button class="btn btn-ghost" data-km="map-new" title="새 맵">+</button>
          <select data-km="pack" title="어휘 팩 — 같은 캔버스, 다른 말">
            ${PACKS.map((p) => `<option value="${p.id}"${p.id === pack.id ? ' selected' : ''}>${p.icon} ${p.label}</option>`).join('')}
          </select>
          <select data-km="new-kind" title="새로 만들 노드 종류">${nodeKindOptions()}</select>
          <span class="km-sep"></span>
          <input type="text" data-km="find" placeholder="🔎 이름으로 찾기" />
          <select data-km="degree" title="고른 노드에서 몇 다리까지 볼까">
            <option value="">전체 보기</option>
            <option value="0">고른 것만</option>
            <option value="1">1다리</option>
            <option value="2">2다리</option>
          </select>
          <button class="btn btn-ghost" data-km="groups" title="묶음 관리">🫧</button>
          <button class="btn btn-ghost" data-km="terms" title="내 용어 — 팩에 없는 종류 만들기">🏷</button>
          <button class="btn btn-ghost" data-km="filter" title="거르기 — 종류별로 화면에서 빼기">🔍</button>
          <button class="btn btn-ghost" data-km="sna" title="누가 중심인가 · 누가 다리인가">📊</button>
          <button class="btn btn-ghost" data-km="help" title="무엇을 할 수 있나 (?)">?</button>
          <button class="btn btn-ghost" data-km="undo" title="되돌리기 (Ctrl+Z)" disabled>↶</button>
          <button class="btn btn-ghost" data-km="redo" title="다시 하기 (Ctrl+Y)" disabled>↷</button>
          <button class="btn btn-ghost" data-km="fit" title="화면 맞춤">⤢</button>
          <button class="btn btn-ghost" data-km="story" title="발표 모드 — 볼 것을 몇 장으로 나눠 차례로">▶</button>
          <div class="km-more">
            <button class="btn btn-ghost" data-km="more" title="더 보기">⋯</button>
            <div class="km-drawer hidden" data-km="drawer">
              <label>배경 무늬
                <select data-km="bg">
                  <option value="dots">· 점</option>
                  <option value="grid">▦ 모눈</option>
                  <option value="cross">✛ 십자</option>
                  <option value="none">□ 없음</option>
                </select>
              </label>
              <button class="btn btn-ghost" data-km="storage">💾 저장 상태</button>
              <button class="btn btn-ghost" data-km="share">🔗 링크 만들기</button>
              <button class="btn btn-ghost" data-km="tidy">🧹 가지런히</button>
              <button class="btn btn-ghost" data-km="from-text">📝 글로 만들기</button>
              <button class="btn btn-ghost" data-km="png">🖼 그림으로 저장</button>
              <button class="btn btn-ghost" data-km="export">JSON 내보내기</button>
              <button class="btn btn-ghost" data-km="import">JSON 가져오기</button>
              <hr />
              <button class="btn btn-ghost" data-km="map-copy">⧉ 이 맵 복제</button>
              <button class="btn btn-ghost" data-km="map-rename">✎ 맵 이름 바꾸기</button>
              <button class="btn btn-ghost" data-km="map-del">🗑 이 맵 삭제</button>
              <hr />
              <button class="btn btn-danger" data-km="clear">전체 삭제</button>
            </div>
          </div>
          <input type="file" accept="application/json,.json" data-km="file" hidden />
          <input type="file" accept="image/*" data-km="img" hidden />
          <input type="file" accept="application/json,.json" data-km="restore-file" hidden />
        </div>
        <div class="km-body">
          <div class="km-canvas" data-km="canvas">
            <div class="km-stage hidden" data-km="stage">
              <div class="km-stage-title" data-km="stage-title"></div>
              <div class="km-stage-note" data-km="stage-note"></div>
              <div class="km-stage-bar">
                <button class="btn btn-ghost" data-km="stage-prev">◀</button>
                <span data-km="stage-count"></span>
                <button class="btn btn-ghost" data-km="stage-next">▶</button>
                <button class="btn btn-ghost" data-km="stage-auto" title="6초마다 다음 장으로">⏱ 자동</button>
                <button class="btn btn-ghost" data-km="stage-add">+ 지금 화면을 한 장으로</button>
                <button class="btn btn-ghost" data-km="stage-del">이 장 지우기</button>
                <button class="btn btn-ghost" data-km="stage-exit">나가기</button>
              </div>
            </div>
          </div>
          <div class="km-side hidden" data-km="side"></div>
        </div>
      </div>`;

    const root = container.querySelector('.km-root') as HTMLElement;
    const q = <T extends HTMLElement>(name: string): T => root.querySelector(`[data-km="${name}"]`) as T;

    const canvasEl = q<HTMLElement>('canvas');
    const sideEl = q<HTMLElement>('side');
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
          if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas 2d 없음')); return; }
          ctx.drawImage(
            im,
            (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side,
            0, 0, AVATAR_PX, AVATAR_PX
          );
          URL.revokeObjectURL(url);
          resolve(cv.toDataURL('image/webp', 0.85));
        };
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했습니다')); };
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
        if (!parsed || parsed.kind !== 'karmomap-backup' || !Array.isArray(parsed.maps)) {
          alert([
            'KarmoMap 백업 파일이 아닙니다.',
            '(「모든 맵 한 파일로 내보내기」로 만든 파일을 골라 주세요)',
          ].join(String.fromCharCode(10)));
          return;
        }
        const used = new Set(library.maps.map((m) => m.name));
        let added = 0;
        for (const m of parsed.maps) {
          const spec0 = m.spec as Partial<GraphSpec> | null;
          if (!spec0 || !Array.isArray(spec0.nodes)) continue;
          const base = (m.name ?? '맵').trim() || '맵';
          const name = used.has(base) ? `${base} (복원)` : base;
          used.add(name);
          const res = addMap(library, name, JSON.stringify(spec0));
          library = res.index;
          added += 1;
        }
        renderMapList();
        openActiveMap();
        Toolbox.showToast?.(
          added === 0 ? '되돌릴 맵이 없었습니다' : `맵 ${added}개를 되돌렸습니다`,
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
          console.error('[karmomap] 얼굴 사진 처리 실패', e);
          alert('사진을 읽지 못했습니다.');
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
      bar.innerHTML = `저장 칸이 ${Math.round(rep.ratio * 100)}% 찼습니다 — 「💾 저장 상태」에서 백업하세요.`;
      root.querySelector('.km-toolbar')?.insertAdjacentElement('afterend', bar);
    }

    function persistStructure(): void {
      store.saveSpec(canvas?.getSpec() ?? spec);
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
     * 노드 크기 재계산. 얼굴·한마디·모양이 바뀌면 상자도 따라 커져야 한다 —
     * 안 그러면 글자가 테두리를 넘고, 동그라미 안에서 이름이 잘린다.
     */
    function resize(node: GraphNode): void {
      const shape = node.shape ?? 'rect';
      const hasNote = Boolean(node.note && node.note.trim());
      let w = widthFor(node.label);
      let h = NODE_H;
      if (node.avatar && shape !== 'circle') w += 28;
      if (hasNote) {
        h += 14;
        w = Math.max(w, widthFor(node.note ?? '') );
      }
      if (shape === 'circle') {
        if (node.avatar) h += 26;
        w = Math.max(w + 24, h + 24);
      }
      // 메모는 글이 주인공이라 여유를 더 준다.
      if (shape === 'note') w += 16;
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
      const sample = sampleFor(pack.id);
      el.innerHTML =
        `${escapeHtml(pack.hint)}<br><b>빈 곳을 두 번 클릭</b>하면 그 자리에 노드가 생깁니다.<br>` +
        '노드 오른쪽의 <b>점을 끌어다</b> 다른 노드에 놓으면 선이 이어져요.<br>' +
        '<span style="opacity:.75">키보드: <b>Tab</b> 다음 노드 · <b>방향키</b> 옮기기 · <b>Enter</b> 이름 · <b>?</b> 전체 도움말</span>' +
        (sample
          ? `<br><br><button class="btn btn-primary" data-km="sample">「${escapeHtml(sample.title)}」 예시 넣어 보기</button>`
          : '');
      // 안내는 클릭을 통과시키지만(pointer-events:none) 버튼만은 눌려야 한다.
      el.querySelector('[data-km="sample"]')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const s0 = sampleFor(pack.id);
        if (!s0) return;
        buildFromOutline(s0.outline, nodeKindsNow()[0].id);
        Toolbox.showToast?.('예시를 넣었습니다 — 마음껏 고치세요', undefined, undefined);
      });
      if (!existing) canvasEl.appendChild(el);
    }

    // ── 묶음 (TASK-KL-202 격차 D) ────────────────────────────────────────────
    // 캔버스는 이미 묶음을 그리고 끌 줄 안다(멤버를 감싸 자동으로 커진다). 없던 건
    // *만들고 넣는 손잡이* 뿐이었다.
    /** 이 맵에 이미 쓰인 꼬리표 — 같은 말을 두 번 만들지 않게 눌러서 붙인다. */
    function allTags(): string[] {
      return [...new Set(spec.nodes.flatMap((n) => n.tags ?? []))].sort();
    }

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
      const preset = pack.groupPresets.find((p) => !used.has(p.label));
      const label = preset?.label ?? `묶음 ${spec.groups.length + 1}`;
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

    function renderGroupsPanel(): void {
      sideEl.classList.remove('hidden');
      canvas?.setSelectedNode(null);
      sideEl.innerHTML = `
        <h4>🫧 묶음</h4>
        <div class="km-hint">노드를 고른 뒤 「묶음」에서 넣으세요. 묶음 머리를 끌면 안에 든 노드가 같이 움직입니다.</div>
        <div class="km-field">
          ${
            spec.groups.length === 0
              ? '<div class="km-hint">아직 묶음이 없습니다.</div>'
              : spec.groups
                  .map((g) => {
                    const count = spec.nodes.filter((n) => memberOf(n).includes(g.id)).length;
                    return `<div class="km-group-row" data-group="${escapeAttr(g.id)}">
                      <input type="color" data-km="group-color" value="${escapeAttr(g.color)}" title="색" />
                      <input type="text" data-km="group-label" value="${escapeAttr(g.label)}" />
                      <span class="km-group-count">${count}</span>
                      <button class="btn btn-ghost" data-km="group-shape" title="테두리 모양 — 윤곽/네모">${(g.shape ?? 'box') === 'hull' ? '⬡' : '▭'}</button>
                      <button class="btn btn-ghost" data-km="group-eye" title="상자 보이기/숨기기">${g.hidden ? '🚫' : '👁'}</button>
                      <button class="btn btn-ghost" data-km="group-del" title="묶음 삭제">×</button>
                    </div>`;
                  })
                  .join('')
          }
        </div>
        <button class="btn btn-primary" data-km="group-add">+ 새 묶음</button>
        <button class="btn btn-ghost" data-km="group-close">닫기</button>`;

      (sideEl.querySelector('[data-km="group-add"]') as HTMLButtonElement).onclick = () => {
        createGroup();
        applySpec();
        persistStructure();
        renderSide();
      };
      (sideEl.querySelector('[data-km="group-close"]') as HTMLButtonElement).onclick = () => {
        sideMode = 'node';
        renderSide();
      };

      sideEl.querySelectorAll('.km-group-row').forEach((rowEl) => {
        const row = rowEl as HTMLElement;
        const gid = row.dataset.group ?? '';
        const find = (): GroupDef | undefined => spec.groups.find((g) => g.id === gid);
        (row.querySelector('[data-km="group-label"]') as HTMLInputElement).oninput = (ev) => {
          const g = find();
          if (!g) return;
          g.label = (ev.target as HTMLInputElement).value;
          canvas?.render();
          persistStructure();
        };
        (row.querySelector('[data-km="group-color"]') as HTMLInputElement).oninput = (ev) => {
          const g = find();
          if (!g) return;
          g.color = (ev.target as HTMLInputElement).value;
          canvas?.render();
          persistStructure();
        };
        (row.querySelector('[data-km="group-shape"]') as HTMLButtonElement).onclick = (ev) => {
          const g = find();
          if (!g) return;
          g.shape = (g.shape ?? 'box') === 'hull' ? 'box' : 'hull';
          (ev.currentTarget as HTMLButtonElement).textContent = g.shape === 'hull' ? '⬡' : '▭';
          canvas?.render();
          persistStructure();
        };
        (row.querySelector('[data-km="group-eye"]') as HTMLButtonElement).onclick = (ev) => {
          const g = find();
          if (!g) return;
          // 상자만 감춘다 — 소속은 그대로라 다시 켜면 그대로 나온다.
          g.hidden = g.hidden ? undefined : true;
          (ev.currentTarget as HTMLButtonElement).textContent = g.hidden ? '🚫' : '👁';
          canvas?.render();
          persistStructure();
        };
        (row.querySelector('[data-km="group-del"]') as HTMLButtonElement).onclick = () => {
          // 묶음만 없앤다 — 안에 든 노드는 그 자리에 남는다.
          spec.groups = spec.groups.filter((g) => g.id !== gid);
          for (const n of spec.nodes) {
            const rest = memberOf(n).filter((x) => x !== gid);
            if (rest.length !== memberOf(n).length) setMembership(n, rest);
          }
          applySpec();
          persistStructure();
          renderSide();
        };
      });
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
      });
      canvas?.setSelectedNode(selectedId);
    }

    /**
     * 여럿 고름 패널 — 한 번에 묶고·바꾸고·지운다.
     * 노드가 늘면 하나씩 만지는 것이 곧 벽이 된다(Heptabase 도 「골라서 Create Section」이 기본 동작).
     */
    function renderManyPanel(): void {
      sideEl.classList.remove('hidden');
      sideEl.innerHTML = `
        <h4>◫ ${selectedMany.length}개 골랐음</h4>
        <div class="km-hint">캔버스에서 <b>Shift+드래그</b>로 범위를 칠하면 여럿이 골라집니다. 고른 것 중 하나를 끌면 함께 움직입니다.</div>
        <div class="km-field">
          <label>한꺼번에 묶음에 넣기</label>
          <select data-km="many-group">
            <option value="">— 고르세요 —</option>
            ${spec.groups.map((g) => `<option value="${escapeAttr(g.id)}">${escapeHtml(g.label)}</option>`).join('')}
            <option value="__new">+ 새 묶음</option>
          </select>
        </div>
        <div class="km-field">
          <label>한꺼번에 종류 바꾸기</label>
          <select data-km="many-kind">
            <option value="">— 고르세요 —</option>
            ${nodeKindsNow().map((k) => `<option value="${k.id}">${k.icon} ${escapeHtml(k.label)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-danger" data-km="many-del">${selectedMany.length}개 모두 삭제</button>
        <button class="btn btn-ghost" data-km="many-close">고르기 해제</button>`;

      (sideEl.querySelector('[data-km="many-group"]') as HTMLSelectElement).onchange = (ev) => {
        const v = (ev.target as HTMLSelectElement).value;
        if (!v) return;
        const gid = v === '__new' ? createGroup().id : v;
        for (const id of selectedMany) {
          const n = spec.nodes.find((x) => x.id === id);
          if (n) setMembership(n, [...new Set([...memberOf(n), gid])]);
        }
        applySpec();
        persistStructure();
        renderSide();
      };

      (sideEl.querySelector('[data-km="many-kind"]') as HTMLSelectElement).onchange = (ev) => {
        const v = (ev.target as HTMLSelectElement).value;
        if (!v) return;
        for (const id of selectedMany) {
          const n = spec.nodes.find((x) => x.id === id);
          if (n) n.kind = v;
        }
        applySpec();
        persistStructure();
        renderSide();
      };

      (sideEl.querySelector('[data-km="many-del"]') as HTMLButtonElement).onclick = () => {
        if (!confirm(`고른 ${selectedMany.length}개 노드와 거기 붙은 선을 모두 지울까요?`)) return;
        const gone = new Set(selectedMany);
        const goneEdges = new Set(
          spec.edges.filter((e) => gone.has(e.from) || gone.has(e.to)).map((e) => e.id)
        );
        spec.nodes = spec.nodes.filter((n) => !gone.has(n.id));
        spec.edges = spec.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
        for (const n of spec.nodes) {
          if ((n.attachedTo && gone.has(n.attachedTo)) || (n.attachedTo && goneEdges.has(n.attachedTo))) {
            n.attachedTo = undefined;
          }
        }
        selectedMany = [];
        selectedId = null;
        sideMode = 'node';
        applySpec();
        persistStructure();
        renderSide();
      };

      (sideEl.querySelector('[data-km="many-close"]') as HTMLButtonElement).onclick = () => {
        selectedMany = [];
        sideMode = 'node';
        canvas?.setSelectedNodes([]);
        renderSide();
      };
    }

    /**
     * 글로 만들기 — 들여쓴 목록을 그대로 관계도로 (격차 O).
     * 이미 그린 것은 건드리지 않고 **더한다**: 사람은 보통 「이만큼 더 있어」로 오지, 처음부터 다시 오지 않는다.
     */
    function renderTextPanel(): void {
      sideEl.classList.remove('hidden');
      canvas?.setSelectedNode(null);
      sideEl.innerHTML = `
        <h4>📝 글로 만들기</h4>
        <div class="km-hint">들여쓰면 위 줄에 이어집니다. 콜론(:) 뒤는 그 선에 붙는 말입니다.</div>
        <textarea data-km="text-src" class="km-textarea" rows="12" placeholder="욘&#10;  링 : 부하&#10;  알리사 : 부하&#10;마을&#10;  대장간"></textarea>
        <div class="km-field">
          <label>새로 만들 노드 종류</label>
          <select data-km="text-kind">${nodeKindOptions()}</select>
        </div>
        <button class="btn btn-primary" data-km="text-go">이 글로 만들기</button>
        <button class="btn btn-ghost" data-km="text-close">닫기</button>`;

      (sideEl.querySelector('[data-km="text-close"]') as HTMLButtonElement).onclick = () => {
        sideMode = 'node';
        renderSide();
      };

      (sideEl.querySelector('[data-km="text-go"]') as HTMLButtonElement).onclick = () => {
        const src = (sideEl.querySelector('[data-km="text-src"]') as HTMLTextAreaElement).value;
        const kind = (sideEl.querySelector('[data-km="text-kind"]') as HTMLSelectElement).value || nodeKindsNow()[0].id;
        const made = buildFromOutline(src, kind);
        if (made === 0) {
          Toolbox.showToast?.('읽을 줄이 없습니다', undefined, undefined);
          return;
        }
        sideMode = 'node';
        renderSide();
        Toolbox.showToast?.(`${made}개를 만들었습니다`, undefined, undefined);
      };
    }

    /**
     * 설명 속 연결 — 가리키는 것 / 나를 가리키는 것 / 이름만 나온 곳 (격차 Q).
     * 마지막 것이 이 도구의 값이다: 사람이 링크 문법을 몰라도 그물이 자란다.
     */
    function renderLinkSections(node: GraphNode): string {
      const all = spec.nodes;
      const out = outgoingLinks(node, all);
      const back = backlinks(node, all);
      const loose = unlinkedMentions(node, all);
      if (out.length === 0 && back.length === 0 && loose.length === 0) return '';
      const row = (label: string, action: string, key: string, extra = ''): string =>
        `<div class="km-link-row"><span class="km-link-name">${escapeHtml(label)}</span>
          <button class="btn btn-ghost" data-km="${action}" data-key="${escapeAttr(key)}">${extra}</button></div>`;
      return `
        ${out.length === 0 ? '' : `<div class="km-field"><label>가리키는 것 ${out.length}</label>
          ${out.map((o) => (o.node
            ? row(o.name, 'go-link', o.node.id, '가기')
            : row(o.name, 'make-link', o.name, '만들기'))).join('')}</div>`}
        ${back.length === 0 ? '' : `<div class="km-field"><label>나를 가리키는 것 ${back.length}</label>
          ${back.map((b) => row(b.label, 'go-link', b.id, '가기')).join('')}</div>`}
        ${loose.length === 0 ? '' : `<div class="km-field"><label>이름만 나온 곳 ${loose.length}</label>
          ${loose.map((m) => row(m.label, 'link-mention', m.id, '이어 주기')).join('')}
          <div class="km-hint">글에 이름이 적혀 있는데 아직 [[ ]] 로 안 이어진 자리입니다.</div></div>`}`;
    }

    /** 링크 목록의 버튼들. renderSide 가 다시 그릴 때마다 새로 매단다. */
    function bindLinkSections(): void {
      sideEl.querySelectorAll('[data-km="go-link"]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => {
          const id = (el as HTMLElement).dataset.key ?? '';
          if (!spec.nodes.some((n) => n.id === id)) return;
          selectedId = id;
          sideMode = 'node';
          renderSide();
          canvas?.fitToNodes([id], 220);
        };
      });
      sideEl.querySelectorAll('[data-km="make-link"]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => {
          const name = (el as HTMLElement).dataset.key ?? '';
          if (!name) return;
          const center = canvas?.viewCenterWorld() ?? { x: 0, y: 0 };
          spawnNodeAt(center.x + 160, center.y + 120, name);
        };
      });
      sideEl.querySelectorAll('[data-km="link-mention"]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => {
          const id = (el as HTMLElement).dataset.key ?? '';
          const other = spec.nodes.find((n) => n.id === id);
          const me = spec.nodes.find((n) => n.id === selectedId);
          if (!other || !me) return;
          other.doc = linkFirstMention(other.doc ?? '', me.label);
          canvas?.render();
          canvas?.setSelectedNode(me.id);
          persistStructure();
          renderSide();
        };
      });
    }

    /**
     * 글 한 덩이 → 노드·선. 「글로 만들기」와 「예시 넣어 보기」가 같은 길을 쓴다 —
     * 견본을 코드로 따로 만들면 문법이 갈라져 둘 중 하나가 곧 낡는다.
     */
    function buildFromOutline(src: string, kind: string): number {
      const parsed = parseOutline(src);
      if (parsed.length === 0) return 0;
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
          id, kind, label: p.label, group: '',
          x: Math.round(at.x), y: Math.round(at.y),
          w: widthFor(p.label), h: NODE_H, ports: [],
        };
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
      applySpec();
      persistStructure();
      canvas?.fitView();
      return parsed.length;
    }

    /**
     * 선 패널 — 관계 자체에 붙는 이야기 (격차 Z).
     * 「언제부터 라이벌인가」는 어느 한쪽 인물의 설명이 아니다. 노드에만 적을 곳을 두면 갈 데가 없다.
     */
    function renderEdgePanel(): void {
      const edge = spec.edges.find((e) => e.id === selectedEdgeId);
      if (!edge) {
        sideMode = 'node';
        renderSide();
        return;
      }
      const nameOf = (id: string): string => spec.nodes.find((n) => n.id === id)?.label || '(이름 없음)';
      sideEl.classList.remove('hidden');
      sideEl.innerHTML = `
        <h4>― 관계</h4>
        <div class="km-hint">${escapeHtml(nameOf(edge.from))} → ${escapeHtml(nameOf(edge.to))}</div>
        <div class="km-field">
          <label>무슨 관계</label>
          <select data-km="ed-kind">${edgeKindOptions(edge.kind)}</select>
        </div>
        <div class="km-field">
          <label>선 위에 쓸 말</label>
          <input type="text" data-km="ed-label" value="${escapeAttr(edge.label ?? '')}" placeholder="비우면 안 보임" />
        </div>
        <div class="km-field">
          <label>이 관계의 이야기</label>
          <textarea data-km="ed-doc" class="km-textarea" rows="5" placeholder="언제부터, 왜 이런 사이가 됐는지">${escapeHtml(edge.doc ?? '')}</textarea>
        </div>
        <div class="km-field">
          <label>꼬리표 <span class="km-hint">쉼표로 여러 개</span></label>
          <input type="text" data-km="ed-tags" value="${escapeAttr((edge.tags ?? []).join(', '))}" />
        </div>
        <button class="btn btn-ghost" data-km="ed-both">${edge.arrowStart ? '양쪽 화살표 ↔' : '한쪽 화살표 →'}</button>
        <button class="btn btn-danger" data-km="ed-del">이 선 지우기</button>
        <button class="btn btn-ghost" data-km="ed-close">닫기</button>`;

      const save = (): void => {
        canvas?.render();
        persistStructure();
      };
      (sideEl.querySelector('[data-km="ed-kind"]') as HTMLSelectElement).onchange = (ev) => {
        const old = edgeLabel(edge.kind);
        edge.kind = (ev.target as HTMLSelectElement).value;
        if (!edge.label || edge.label === old) edge.label = edgeLabel(edge.kind);
        save();
        renderSide();
      };
      (sideEl.querySelector('[data-km="ed-label"]') as HTMLInputElement).oninput = (ev) => {
        edge.label = (ev.target as HTMLInputElement).value;
        save();
      };
      (sideEl.querySelector('[data-km="ed-doc"]') as HTMLTextAreaElement).oninput = (ev) => {
        edge.doc = (ev.target as HTMLTextAreaElement).value.trim() || undefined;
        persistStructure();
      };
      (sideEl.querySelector('[data-km="ed-tags"]') as HTMLInputElement).onchange = (ev) => {
        const list = (ev.target as HTMLInputElement).value.split(',').map((x) => x.trim()).filter(Boolean);
        edge.tags = list.length > 0 ? [...new Set(list)] : undefined;
        persistStructure();
      };
      (sideEl.querySelector('[data-km="ed-both"]') as HTMLButtonElement).onclick = (ev) => {
        edge.arrowStart = edge.arrowStart ? undefined : true;
        (ev.currentTarget as HTMLButtonElement).textContent = edge.arrowStart ? '양쪽 화살표 ↔' : '한쪽 화살표 →';
        save();
      };
      (sideEl.querySelector('[data-km="ed-del"]') as HTMLButtonElement).onclick = () => {
        spec.edges = spec.edges.filter((e) => e.id !== edge.id);
        for (const n of spec.nodes) if (n.attachedTo === edge.id) n.attachedTo = undefined;
        selectedEdgeId = null;
        sideMode = 'node';
        applySpec();
        persistStructure();
        renderSide();
      };
      (sideEl.querySelector('[data-km="ed-close"]') as HTMLButtonElement).onclick = () => {
        selectedEdgeId = null;
        sideMode = 'node';
        renderSide();
      };
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
      filterState,
      applyFilter: () => applyFilter(),
      applyDecorate: () => {
        canvas?.setDecorate({ sizeByDegree: filterState.sizeByDegree, colorByTag: filterState.colorByTag });
        canvas?.setSelectedNode(selectedId);
      },
      nodeKinds: () => nodeKindsNow().map((k) => ({ id: k.id, label: k.label, icon: k.icon })),
      edgeKinds: () => edgeKindsNow().map((k) => ({ id: k.id, label: k.label })),
      kindLabel: (id) => kindLabel(id),
      kindIcon: (id) => kindIcon(id),
      edgeLabel: (id) => edgeLabel(id),
      mapNameOfKey: (key) => {
        const id = key.replace('karmomap.map.', '');
        return library.maps.find((x) => x.id === id)?.name ?? key.replace('karmomap.', '');
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
          new Blob([JSON.stringify({ kind: 'karmomap-backup', v: 1, maps: all }, null, 2)], { type: 'application/json' }),
          'karmomap-backup.json'
        );
        Toolbox.showToast?.(`맵 ${all.length}개를 한 파일로 담았습니다`, undefined, undefined);
      },
      restorePrevRevision: () => {
        const prev = store.loadPrev();
        if (!prev) {
          Toolbox.showToast?.('되살릴 직전 판이 없습니다', undefined, undefined);
          return;
        }
        if (!confirm(`직전 판(노드 ${prev.nodes.length}개)으로 되돌릴까요? 지금 것은 다시 직전 판이 됩니다.`)) return;
        spec = prev;
        applySpec();
        persistStructure();
        canvas?.fitView();
        sideMode = 'node';
        renderSide();
        Toolbox.showToast?.('직전 판으로 되돌렸습니다', undefined, undefined);
      },
    };

    /**
     * 오른쪽 패널 탭 (KL-202 개편 1).
     * 패널이 아홉 가지로 늘었는데 서로 오가는 길이 없었다 — 각 패널에 「닫기」만 있어서
     * 다른 패널로 가려면 툴바에서 그 아이콘을 **다시 찾아야** 했다. 탭을 항상 띄워
     * 「지금 어디에 있고 어디로 갈 수 있는지」를 한자리에서 보인다.
     */
    const SIDE_TABS: { id: SideMode; icon: string; title: string }[] = [
      { id: 'node', icon: '◉', title: '고른 것' },
      { id: 'groups', icon: '🫧', title: '묶음' },
      { id: 'terms', icon: '🏷', title: '내 용어' },
      { id: 'filter', icon: '🔍', title: '거르기' },
      { id: 'sna', icon: '📊', title: '관계망' },
      { id: 'storage', icon: '💾', title: '저장' },
      { id: 'help', icon: '?', title: '도움말' },
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
      renderSideBody();
      // 패널이 비어 있어도(고른 것 없음) 탭은 남긴다 — 탭이 사라지면 갈 곳이 안 보인다.
      if (sideEl.classList.contains('hidden')) {
        sideEl.classList.remove('hidden');
        sideEl.innerHTML = '<div class="km-hint">노드나 선을 고르면 여기서 고칩니다.</div>';
      }
      prependTabs();
    }

    function renderSideBody(): void {
      if (sideMode === 'groups') {
        renderGroupsPanel();
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
        renderManyPanel();
        return;
      }
      if (sideMode === 'text') {
        renderTextPanel();
        return;
      }
      if (sideMode === 'sna') {
        renderSnaPanel(panelCtx);
        return;
      }
      if (sideMode === 'storage') {
        renderStoragePanel(panelCtx);
        return;
      }
      if (sideMode === 'edge') {
        renderEdgePanel();
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
          <label>이름</label>
          <input type="text" data-km="edit-label" value="${escapeAttr(node.label)}" />
        </div>
        <div class="km-field">
          <label>종류</label>
          <select data-km="edit-kind">${nodeKindOptions(node.kind)}</select>
        </div>
        <div class="km-field">
          <label>한마디</label>
          <input type="text" data-km="edit-note" value="${escapeAttr(node.note ?? '')}" placeholder="이름 밑에 한 줄" />
        </div>
        <div class="km-field">
          <label>꼬리표 <span class="km-hint">쉼표로 여러 개</span></label>
          <input type="text" data-km="edit-tags" value="${escapeAttr((node.tags ?? []).join(', '))}" placeholder="영향력 큼, 나중에 다시" />
          ${allTags().length === 0 ? '' : `<div class="km-tagbar">${allTags()
            .map((tg) => `<button class="btn btn-ghost km-tagchip" data-km="tag-add" data-key="${escapeAttr(tg)}">${escapeHtml(tg)}</button>`)
            .join('')}</div>`}
        </div>
        <div class="km-field">
          <label>설명</label>
          <textarea data-km="edit-doc" class="km-textarea" rows="5" placeholder="이 인물·개념에 대해 길게 적어 두는 자리">${escapeHtml(node.doc ?? '')}</textarea>
          <div class="km-hint">적어 두면 카드 모서리에 📄 가 붙습니다. 그림에는 안 나옵니다. <b>[[이름]]</b> 으로 다른 노드를 가리킬 수 있어요.</div>
        </div>
        <div data-km="link-sections">${renderLinkSections(node)}</div>
        <div class="km-field">
          <label>묶음 (여러 개 가능)</label>
          ${
            spec.groups.length === 0
              ? '<div class="km-hint">아직 묶음이 없습니다.</div>'
              : spec.groups
                  .map(
                    (g) => `<label class="km-check"><input type="checkbox" data-km="in-group" value="${escapeAttr(g.id)}"${
                      memberOf(node).includes(g.id) ? ' checked' : ''
                    } /> <span class="km-swatch" style="background:${escapeAttr(g.color)}"></span>${escapeHtml(g.label)}</label>`
                  )
                  .join('')
          }
          <button class="btn btn-ghost" data-km="group-new-here">+ 새 묶음에 넣기</button>
        </div>
        <div class="km-field">
          <label>모양</label>
          <select data-km="edit-shape">
            ${SHAPES.map(
              (s) => `<option value="${s.id}"${(node.shape ?? 'rect') === s.id ? ' selected' : ''}>${s.icon} ${s.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="km-field">
          <label>가리키는 대상</label>
          <select data-km="edit-attach">
            <option value="">— 없음 —</option>
            ${spec.nodes
              .filter((n) => n.id !== node.id)
              .map((n) => `<option value="${escapeAttr(n.id)}"${n.id === node.attachedTo ? ' selected' : ''}>${kindIcon(n.kind)} ${escapeHtml(n.label || '(이름 없음)')}</option>`)
              .join('')}
            ${spec.edges
              .map((e) => {
                const a = spec.nodes.find((n) => n.id === e.from)?.label ?? e.from;
                const b = spec.nodes.find((n) => n.id === e.to)?.label ?? e.to;
                return `<option value="${escapeAttr(e.id)}"${e.id === node.attachedTo ? ' selected' : ''}>― ${escapeHtml(a)} ↔ ${escapeHtml(b)}</option>`;
              })
              .join('')}
          </select>
          <div class="km-hint">고르면 이 노드에서 그쪽으로 옅은 점선이 이어집니다. 관계선과 달리 종류·화살표가 없습니다.</div>
        </div>
        <div class="km-field">
          <label>기울기 <span class="km-tilt-val">${Math.round(node.rotate ?? 0)}°</span></label>
          <input type="range" data-km="edit-rotate" min="-20" max="20" step="1" value="${Math.round(node.rotate ?? 0)}" />
        </div>
        <div class="km-field">
          <label>얼굴</label>
          <div class="km-avatar-row">
            <input type="text" data-km="edit-emoji" maxlength="4" placeholder="😀" value="${escapeAttr(node.avatar?.kind === 'emoji' ? node.avatar.value : '')}" />
            <input type="color" data-km="edit-color" value="${escapeAttr(node.avatar?.kind === 'color' ? node.avatar.value : '#a78bfa')}" title="색 원" />
            <button class="btn btn-ghost" data-km="edit-img" title="사진 올리기">🖼</button>
            <button class="btn btn-ghost" data-km="edit-noface" title="얼굴 지우기">✕</button>
          </div>
          <div class="km-hint">이모지를 적거나, 색을 고르거나, 사진을 올리세요. 사진은 이 브라우저 안에만 남습니다.</div>
        </div>
        <div class="km-field">
          <label>이 노드에서 연결 만들기</label>
          <select data-km="link-kind">${edgeKindOptions()}</select>
          <button class="btn btn-ghost" data-km="link-start">${linkingFrom === node.id ? '연결 취소' : '연결 시작'}</button>
          ${linkingFrom === node.id ? '<div class="km-hint">이어붙일 다른 노드를 클릭하세요. 배경을 클릭하면 취소됩니다.</div>' : ''}
        </div>
        <div class="km-field">
          <label>연결 ${related.length}개</label>
          ${
            related.length === 0
              ? '<div class="km-hint">아직 없습니다.</div>'
              : related
                  .map((e) => {
                    const outgoing = e.from === node.id;
                    const peer = outgoing ? e.to : e.from;
                    return `<div class="km-edge-row" data-edge="${escapeAttr(e.id)}">
                      <span class="km-edge-peer" title="${escapeAttr(labelOf(peer))}">${outgoing ? '→' : '←'} ${escapeHtml(labelOf(peer))}</span>
                      <select data-km="edge-kind">${edgeKindOptions(e.kind)}</select>
                      <button class="btn btn-ghost" data-km="edge-both" title="양쪽 화살표로">${e.arrowStart ? '↔' : '→'}</button>
                      <button class="btn btn-ghost" data-km="edge-del" title="연결 삭제">×</button>
                      <input type="text" data-km="edge-label" class="km-edge-label" value="${escapeAttr(e.label ?? '')}" placeholder="선 위에 쓸 말 (비우면 안 보임)" />
                    </div>`;
                  })
                  .join('')
          }
        </div>
        <button class="btn btn-ghost" data-km="node-copy">⧉ 이 노드 복제</button>
        <button class="btn btn-danger" data-km="node-del">노드 삭제</button>`;

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

      const tagsInput = sideEl.querySelector('[data-km="edit-tags"]') as HTMLInputElement;
      const applyTags = (): void => {
        const list = tagsInput.value.split(',').map((x) => x.trim()).filter(Boolean);
        node.tags = list.length > 0 ? [...new Set(list)] : undefined;
        persistStructure();
      };
      tagsInput.onchange = applyTags;
      tagsInput.onblur = applyTags;
      sideEl.querySelectorAll('[data-km="tag-add"]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => {
          const tg = (el as HTMLElement).dataset.key ?? '';
          const cur = tagsInput.value.split(',').map((x) => x.trim()).filter(Boolean);
          if (!cur.includes(tg)) cur.push(tg);
          tagsInput.value = cur.join(', ');
          applyTags();
        };
      });

      const docInput = sideEl.querySelector('[data-km="edit-doc"]') as HTMLTextAreaElement;
      docInput.oninput = () => {
        node.doc = docInput.value.trim() || undefined;
        canvas?.render();
        canvas?.setSelectedNode(node.id);
        persistStructure();
        // 링크 목록만 다시 그린다 — 패널 전체를 다시 그리면 타자 치던 커서가 날아간다.
        const holder = sideEl.querySelector('[data-km="link-sections"]');
        if (holder) {
          holder.innerHTML = renderLinkSections(node);
          bindLinkSections();
        }
      };

      const noteInput = sideEl.querySelector('[data-km="edit-note"]') as HTMLInputElement;
      noteInput.oninput = () => {
        node.note = noteInput.value.trim() || undefined;
        touch(false);
      };

      sideEl.querySelectorAll('[data-km="in-group"]').forEach((el) => {
        (el as HTMLInputElement).onchange = (ev) => {
          const box = ev.target as HTMLInputElement;
          const cur = new Set(memberOf(node));
          if (box.checked) cur.add(box.value);
          else cur.delete(box.value);
          setMembership(node, [...cur]);
          applySpec();
          persistStructure();
        };
      });

      (sideEl.querySelector('[data-km="group-new-here"]') as HTMLButtonElement).onclick = () => {
        setMembership(node, [...memberOf(node), createGroup().id]);
        applySpec();
        persistStructure();
        renderSide();
      };

      (sideEl.querySelector('[data-km="edit-attach"]') as HTMLSelectElement).onchange = (ev) => {
        const v = (ev.target as HTMLSelectElement).value;
        node.attachedTo = v || undefined;
        canvas?.render();
        canvas?.setSelectedNode(node.id);
        persistStructure();
      };

      const rotateEl = sideEl.querySelector('[data-km="edit-rotate"]') as HTMLInputElement;
      rotateEl.oninput = () => {
        const deg = Number(rotateEl.value);
        node.rotate = deg === 0 ? undefined : deg;
        const out = sideEl.querySelector('.km-tilt-val');
        if (out) out.textContent = `${deg}°`;
        canvas?.render();
        canvas?.setSelectedNode(node.id);
        persistStructure();
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

      (sideEl.querySelector('[data-km="edit-shape"]') as HTMLSelectElement).onchange = (ev) => {
        node.shape = (ev.target as HTMLSelectElement).value as NodeShape;
        touch(false);
      };

      const emojiInput = sideEl.querySelector('[data-km="edit-emoji"]') as HTMLInputElement;
      emojiInput.oninput = () => {
        const v = emojiInput.value.trim();
        node.avatar = v ? { kind: 'emoji', value: v } : undefined;
        touch(false);
      };

      (sideEl.querySelector('[data-km="edit-color"]') as HTMLInputElement).oninput = (ev) => {
        node.avatar = { kind: 'color', value: (ev.target as HTMLInputElement).value };
        touch(true);
      };

      (sideEl.querySelector('[data-km="edit-img"]') as HTMLButtonElement).onclick = () => {
        avatarTargetId = node.id;
        imgEl.click();
      };

      (sideEl.querySelector('[data-km="edit-noface"]') as HTMLButtonElement).onclick = () => {
        node.avatar = undefined;
        touch(true);
      };

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

      bindLinkSections();

      (sideEl.querySelector('[data-km="node-del"]') as HTMLButtonElement).onclick = () => {
        if (!confirm(`"${node.label}" 노드와 연결된 선을 모두 삭제할까요?`)) return;
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
        Toolbox.showToast?.('두 노드는 이미 연결돼 있습니다', undefined, undefined);
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
      onNodeClick: (id) => handleNodeClick(id),
      onBackgroundClick: () => {
        selectedMany = [];
        selectedId = null;
        linkingFrom = null;
        canvasEl.classList.remove('km-linking');
        renderSide();
        syncFocus();
      },
      onBackgroundDoubleClick: (world) => spawnNodeAt(world.x, world.y, ''),
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
      const kind = newKindEl.value || nodeKindsNow()[0].id;
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
      resize(node);
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
      (q<HTMLElement>('stage-title')).textContent = step?.title ?? '아직 담은 장이 없습니다';
      (q<HTMLElement>('stage-note')).textContent =
        step?.note ?? '찾기·다리수로 볼 것을 고른 뒤 「+ 지금 화면을 한 장으로」 를 누르세요.';
      (q<HTMLElement>('stage-count')).textContent = list.length ? `${stepIndex + 1} / ${list.length}` : '0 / 0';
      if (!step) {
        canvas?.setFocus(null);
        return;
      }
      canvas?.setFocus(step.nodeIds.length ? new Set(step.nodeIds) : null);
      canvas?.fitToNodes(step.nodeIds);
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
      if (btn) btn.textContent = '⏱ 자동';
    }
    Toolbox.onDispose?.(stopAuto);

    q<HTMLButtonElement>('stage-auto').onclick = (ev) => {
      if (autoTimer) { stopAuto(); return; }
      (ev.currentTarget as HTMLButtonElement).textContent = '⏸ 멈춤';
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
      const title = prompt('이 장의 제목', `${steps().length + 1}장`)?.trim();
      if (title === undefined) return;
      const note = prompt('설명 한 줄 (건너뛰려면 비우고 확인)')?.trim();
      steps().splice(stepIndex + (steps().length ? 1 : 0), 0, {
        id: `step-${Date.now().toString(36)}`,
        title: title || `${steps().length + 1}장`,
        nodeIds: focused,
        note: note || undefined,
      });
      stepIndex = Math.min(steps().length - 1, stepIndex + (steps().length > 1 ? 1 : 0));
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
    const packEl = q<HTMLSelectElement>('pack');
    function applyPack(id: string, persist: boolean): void {
      pack = packById(id);
      packEl.value = pack.id;
      newKindEl.innerHTML = nodeKindOptions();
      spec._meta = { ...spec._meta, pack: pack.id };
      syncEmptyHint();
      renderSide();
      if (persist) persistStructure();
    }
    packEl.onchange = () => applyPack(packEl.value, true);

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

    q<HTMLButtonElement>('share').onclick = () => {
      const live = canvas?.getSpec() ?? spec;
      void encodeShare(live).then(async (code) => {
        const url = buildShareUrl(new URL(location.href), code);
        if (url.length > SHARE_URL_LIMIT) {
          alert(
            `그림이 커서 링크로는 못 보냅니다 (${Math.round(url.length / 1000)}k자).
` +
            '「JSON 내보내기」로 파일을 보내 주세요. (사진을 붙인 노드가 특히 큽니다)'
          );
          return;
        }
        try {
          await navigator.clipboard.writeText(url);
          Toolbox.showToast?.('링크를 복사했습니다', undefined, undefined);
        } catch {
          // 클립보드가 막힌 자리(비보안 컨텍스트 등)에서도 사람이 직접 복사할 수 있게 보여 준다.
          prompt('이 링크를 복사해 보내세요', url);
        }
      });
    };

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
        n === 0 ? '이미 가지런합니다' : `겹친 ${n}개를 밀었습니다`,
        undefined, undefined
      );
    };

    q<HTMLButtonElement>('from-text').onclick = () => {
      sideMode = 'text';
      renderSide();
    };

    q<HTMLButtonElement>('help').onclick = () => {
      sideMode = sideMode === 'help' ? 'node' : 'help';
      renderSide();
    };

    q<HTMLButtonElement>('sna').onclick = () => {
      sideMode = sideMode === 'sna' ? 'node' : 'sna';
      renderSide();
    };

    q<HTMLButtonElement>('filter').onclick = () => {
      sideMode = sideMode === 'filter' ? 'node' : 'filter';
      renderSide();
    };

    q<HTMLButtonElement>('terms').onclick = () => {
      sideMode = sideMode === 'terms' ? 'node' : 'terms';
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

    q<HTMLButtonElement>('groups').onclick = () => {
      sideMode = sideMode === 'groups' ? 'node' : 'groups';
      renderSide();
    };

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
          if (node && confirm(`"${node.label}" 을(를) 지울까요?`)) {
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
      const t = ev.target as HTMLElement | null;
      const tag = t?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
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
        Toolbox.showToast?.('아직 그릴 것이 없습니다', undefined, undefined);
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
            alert('그림을 만들지 못했습니다.');
            return;
          }
          downloadBlob(blob, 'karmomap.png');
          Toolbox.showToast?.(`${out.width}×${out.height} PNG 로 저장했습니다`, undefined, undefined);
        }, 'image/png');
      };
      im.onerror = () => alert('그림을 만들지 못했습니다.');
      im.src = src;
    }

    q<HTMLButtonElement>('png').onclick = () => exportImage(2);

    q<HTMLButtonElement>('export').onclick = () => {
      const data = JSON.stringify(canvas?.getSpec() ?? spec, null, 2);
      downloadBlob(new Blob([data], { type: 'application/json' }), 'karmomap.json');
    };

    q<HTMLButtonElement>('import').onclick = () => fileEl.click();
    fileEl.onchange = () => {
      const file = fileEl.files?.[0];
      if (!file) return;
      void file
        .text()
        .then((text) => {
          const parsed = JSON.parse(text) as Partial<GraphSpec>;
          if (!Array.isArray(parsed.nodes)) throw new Error('nodes 배열이 없습니다');
          spec = {
            ...emptyGraphSpec(),
            ...parsed,
            nodes: parsed.nodes.map((n) => ({ ...n, ports: n.ports ?? [] })),
          } as GraphSpec;
          selectedId = null;
          applyPack(spec._meta?.pack ?? pack.id, false);
          applySpec();
          canvas?.fitView();
          persistStructure();
          renderSide();
          Toolbox.showToast?.(`${spec.nodes.length}개 노드를 불러왔습니다`, undefined, undefined);
        })
        .catch((e: unknown) => {
          console.error('[karmomap] 가져오기 실패', e);
          alert('JSON 을 읽지 못했습니다. KarmoMap 에서 내보낸 파일인지 확인해 주세요.');
        })
        .finally(() => {
          fileEl.value = '';
        });
    };

    q<HTMLButtonElement>('clear').onclick = () => {
      if (!confirm('KarmoMap 의 모든 노드와 연결을 삭제할까요? 되돌릴 수 없습니다.')) return;
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
      mapsEl.innerHTML = library.maps
        .map((m) => `<option value="${escapeAttr(m.id)}"${m.id === library.activeId ? ' selected' : ''}>${escapeHtml(m.name)}</option>`)
        .join('');
    }

    /** 지금 열린 맵을 화면에 올린다. 맵을 바꿀 때마다 되돌리기 이력도 갈아 끼운다. */
    function openActiveMap(): void {
      store = new KarmoMapLocalStorageAdapter(mapKey(library.activeId));
      history.length = 0;
      histIndex = -1;
      selectedId = null;
      linkingFrom = null;
      sideMode = 'node';
      void store.load().then((loaded) => {
        spec = loaded ?? emptyGraphSpec();
        // 관계 종류 정의는 항상 최신 셋으로 (저장본이 옛 정의를 갖고 있어도 색이 맞게).
        spec._edge_kinds = { ...edgeDefsNow(), ...(spec._edge_kinds ?? {}) };
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

    q<HTMLButtonElement>('map-new').onclick = () => {
      const added = addMap(library, `맵 ${library.maps.length + 1}`);
      library = added.index;
      renderMapList();
      openActiveMap();
    };

    q<HTMLButtonElement>('map-copy').onclick = () => {
      const json = JSON.stringify(canvas?.getSpec() ?? spec);
      const name = library.maps.find((m) => m.id === library.activeId)?.name ?? '맵';
      const added = addMap(library, `${name} 사본`, json);
      library = added.index;
      renderMapList();
      openActiveMap();
    };

    q<HTMLButtonElement>('map-rename').onclick = () => {
      const cur = library.maps.find((m) => m.id === library.activeId);
      const name = prompt('맵 이름', cur?.name ?? '')?.trim();
      if (!name) return;
      library = renameMap(library, library.activeId, name);
      renderMapList();
    };

    q<HTMLButtonElement>('map-del').onclick = () => {
      const cur = library.maps.find((m) => m.id === library.activeId);
      const last = library.maps.length <= 1;
      const msg = last
        ? `"${cur?.name ?? '맵'}" 의 내용을 모두 지울까요? (마지막 한 장이라 맵 자체는 남습니다)`
        : `"${cur?.name ?? '맵'}" 맵을 지울까요? 되돌릴 수 없습니다.`;
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
          Toolbox.showToast?.('링크의 내용을 읽지 못했습니다', undefined, undefined);
          return;
        }
        const added = addMap(library, '받은 맵');
        library = added.index;
        renderMapList();
        store = new KarmoMapLocalStorageAdapter(mapKey(library.activeId));
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
        renderSide();
        snapshot();
        syncHistoryButtons();
        Toolbox.showToast?.(`링크에서 ${spec.nodes.length}개를 받았습니다`, undefined, undefined);
      });
    }

    Mdd.linePreset('tool_run', {
      mood: 'idle',
      msg: '뭘 그려볼까요? 위에서 어휘 팩을 고르면 캔버스가 그 말로 바뀝니다.',
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
    ...(tb.getLazyWidgetPublicMeta ? tb.getLazyWidgetPublicMeta('karmomap') : { id: 'karmomap' }),
    tabs: [{ id: 'karmomap-main', label: 'KarmoMap', build: buildKarmoMap }],
  });
})();
