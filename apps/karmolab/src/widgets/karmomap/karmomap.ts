/**
 * karmomap.ts — 세계관 그래프 위젯 (TASK-KL-087 단위 1).
 *
 * 사용자: "KarmoMap 프로그램 만들고 싶어. 마인드맵, 그래프, 관계도 같은 건데.
 * 세계관 설명에 특히 특화된 것."
 *
 * 일반 마인드맵과의 차이는 `kinds.ts` 에 있다 — 노드는 인물/장소/물건/사건/개념,
 * 연결은 관련/상위/포함/대립/선후. 세계관을 설명할 때 실제로 쓰는 말이다.
 *
 * 캔버스는 `lib/graph/canvas.ts` (cockpit 에서 추출, 단위 0). 저장은
 * localStorage — 백엔드 0, 웹에서도 동작, 내용은 사적.
 *
 * 내용은 전적으로 사용자가 쓴다. AI 가 노드를 만들지 않는다 —
 * KarmoMap 은 그릇이고 렌즈지, 작가가 아니다.
 */
import { GraphCanvas } from '../../lib/graph/canvas';
import type { GraphSpec, GraphNode, GraphEdge } from '../../lib/graph/spec';
import { emptyGraphSpec } from '../../lib/graph/spec';
import { KarmoMapLocalStorageAdapter } from './local-storage-adapter';
import {
  NODE_KINDS,
  NODE_KIND_LABELS,
  NODE_KIND_COLORS,
  NODE_KIND_ICONS,
  EDGE_KINDS,
  EDGE_KIND_LABELS,
  EDGE_KIND_DEFS,
  isNodeKind,
  type NodeKind,
  type EdgeKind,
} from './kinds';

(function (): void {
  if (typeof Toolbox === 'undefined') return;
  const tb = Toolbox;

  const NODE_H = 40;
  const NODE_MIN_W = 120;

  Mdd.injectCSS(
    'karmomap',
    `
    .km-root { display:flex; flex-direction:column; height:100%; width:100%; min-height:520px; overflow:hidden; }
    .km-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:10px 12px;
      border-bottom:1px solid var(--border); background:var(--bg-secondary); flex-shrink:0; }
    .km-toolbar input[type=text], .km-toolbar select, .km-side select, .km-side input[type=text] {
      background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-primary);
      border-radius:var(--radius-sm); padding:5px 8px; font-size:var(--font-size-xs); }
    .km-toolbar input[type=text] { min-width:180px; }
    .km-spacer { flex:1; }
    .km-body { flex:1; display:flex; min-height:0; }
    .km-canvas { flex:1; position:relative; min-width:0; background:var(--bg-tertiary); }
    .km-side { width:264px; flex-shrink:0; border-left:1px solid var(--border); background:var(--bg-secondary);
      padding:12px; overflow-y:auto; font-size:var(--font-size-xs); }
    .km-side.hidden { display:none; }
    .km-side h4 { margin:0 0 8px; font-size:var(--font-size-sm); color:var(--text-primary); }
    .km-field { margin-bottom:10px; display:flex; flex-direction:column; gap:4px; }
    .km-field label { color:var(--text-secondary); font-size:11px; }
    .km-field input, .km-field select { width:100%; }
    .km-edge-row { display:flex; gap:4px; align-items:center; margin-bottom:6px; }
    .km-edge-row .km-edge-peer { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      color:var(--text-primary); }
    .km-edge-row select { width:74px; }
    .km-hint { color:var(--text-tertiary); font-size:11px; line-height:1.5; }
    .km-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      color:var(--text-tertiary); font-size:var(--font-size-sm); text-align:center; pointer-events:none;
      padding:24px; line-height:1.7; }
    .km-linking { outline:2px dashed var(--accent); outline-offset:-2px; }
    `
  );

  function buildKarmoMap(container: HTMLElement): void {
    const store = new KarmoMapLocalStorageAdapter();

    let spec: GraphSpec = emptyGraphSpec();
    let canvas: GraphCanvas | null = null;
    let selectedId: string | null = null;
    /** 연결 모드일 때 출발 노드 id. null 이면 평소 모드. */
    let linkingFrom: string | null = null;

    container.innerHTML = `
      <div class="km-root">
        <div class="km-toolbar">
          <input type="text" data-km="new-label" placeholder="새 노드 이름" />
          <select data-km="new-kind">
            ${NODE_KINDS.map((k) => `<option value="${k}">${NODE_KIND_ICONS[k]} ${NODE_KIND_LABELS[k]}</option>`).join('')}
          </select>
          <button class="btn btn-primary" data-km="add">+ 추가</button>
          <span class="km-spacer"></span>
          <button class="btn btn-ghost" data-km="fit">화면 맞춤</button>
          <button class="btn btn-ghost" data-km="export">내보내기</button>
          <button class="btn btn-ghost" data-km="import">가져오기</button>
          <button class="btn btn-danger" data-km="clear">전체 삭제</button>
          <input type="file" accept="application/json,.json" data-km="file" hidden />
        </div>
        <div class="km-body">
          <div class="km-canvas" data-km="canvas"></div>
          <div class="km-side hidden" data-km="side"></div>
        </div>
      </div>`;

    const root = container.querySelector('.km-root') as HTMLElement;
    const q = <T extends HTMLElement>(name: string): T => root.querySelector(`[data-km="${name}"]`) as T;

    const canvasEl = q<HTMLElement>('canvas');
    const sideEl = q<HTMLElement>('side');
    const fileEl = q<HTMLInputElement>('file');

    // ── 저장 ────────────────────────────────────────────────────────────────
    // 구조 변경은 즉시 전체 저장. 좌표 변경은 캔버스가 debounce 후 어댑터로.
    function persistStructure(): void {
      store.saveSpec(canvas?.getSpec() ?? spec);
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

    // ── 빈 상태 안내 ────────────────────────────────────────────────────────
    function syncEmptyHint(): void {
      const existing = canvasEl.querySelector('.km-empty');
      if (spec.nodes.length === 0) {
        if (!existing) {
          const el = document.createElement('div');
          el.className = 'km-empty';
          el.innerHTML =
            '아직 비어 있어요.<br>위에 이름을 적고 <b>+ 추가</b> 를 누르면 첫 노드가 생깁니다.<br>' +
            '노드를 끌어서 배치하고, 클릭하면 오른쪽에서 고칠 수 있어요.';
          canvasEl.appendChild(el);
        }
      } else if (existing) {
        existing.remove();
      }
    }

    // ── 선택 패널 ───────────────────────────────────────────────────────────
    function renderSide(): void {
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
        <h4>${NODE_KIND_ICONS[node.kind as NodeKind] ?? '·'} 노드</h4>
        <div class="km-field">
          <label>이름</label>
          <input type="text" data-km="edit-label" value="${escapeAttr(node.label)}" />
        </div>
        <div class="km-field">
          <label>종류</label>
          <select data-km="edit-kind">
            ${NODE_KINDS.map(
              (k) => `<option value="${k}"${k === node.kind ? ' selected' : ''}>${NODE_KIND_ICONS[k]} ${NODE_KIND_LABELS[k]}</option>`
            ).join('')}
          </select>
        </div>
        <div class="km-field">
          <label>이 노드에서 연결 만들기</label>
          <select data-km="link-kind">
            ${EDGE_KINDS.map((k) => `<option value="${k}">${EDGE_KIND_LABELS[k]}</option>`).join('')}
          </select>
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
                      <select data-km="edge-kind">
                        ${EDGE_KINDS.map((k) => `<option value="${k}"${k === e.kind ? ' selected' : ''}>${EDGE_KIND_LABELS[k]}</option>`).join('')}
                      </select>
                      <button class="btn btn-ghost" data-km="edge-del" title="연결 삭제">×</button>
                    </div>`;
                  })
                  .join('')
          }
        </div>
        <button class="btn btn-danger" data-km="node-del">노드 삭제</button>`;

      // 이름 편집 — 입력할 때마다 반영 (폭도 같이 조정)
      const labelInput = sideEl.querySelector('[data-km="edit-label"]') as HTMLInputElement;
      labelInput.oninput = () => {
        node.label = labelInput.value;
        node.w = widthFor(node.label);
        canvas?.render();
        canvas?.setSelectedNode(node.id);
        persistStructure();
      };

      (sideEl.querySelector('[data-km="edit-kind"]') as HTMLSelectElement).onchange = (ev) => {
        const v = (ev.target as HTMLSelectElement).value;
        if (!isNodeKind(v)) return;
        node.kind = v;
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
          edge.kind = (ev.target as HTMLSelectElement).value;
          canvas?.render();
          canvas?.setSelectedNode(node.id);
          persistStructure();
        };
        (row.querySelector('[data-km="edge-del"]') as HTMLButtonElement).onclick = () => {
          spec.edges = spec.edges.filter((x) => x.id !== edgeId);
          applySpec();
          persistStructure();
          renderSide();
        };
      });

      (sideEl.querySelector('[data-km="node-del"]') as HTMLButtonElement).onclick = () => {
        if (!confirm(`"${node.label}" 노드와 연결된 선을 모두 삭제할까요?`)) return;
        spec.nodes = spec.nodes.filter((n) => n.id !== node.id);
        spec.edges = spec.edges.filter((e) => e.from !== node.id && e.to !== node.id);
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

    // ── 노드 클릭: 선택 또는 연결 ────────────────────────────────────────────
    function handleNodeClick(nodeId: string): void {
      if (linkingFrom && linkingFrom !== nodeId) {
        const from = linkingFrom;
        const kindSel = sideEl.querySelector('[data-km="link-kind"]') as HTMLSelectElement | null;
        const kind: EdgeKind = (kindSel?.value as EdgeKind) ?? 'relates';
        const dup = spec.edges.some(
          (e) => (e.from === from && e.to === nodeId) || (e.from === nodeId && e.to === from)
        );
        if (dup) {
          Toolbox.showToast?.('두 노드는 이미 연결돼 있습니다', undefined, undefined);
        } else {
          const taken = new Set(spec.edges.map((e) => e.id));
          const edge: GraphEdge = { id: nextId('edge', taken), from, to: nodeId, kind };
          spec.edges.push(edge);
          applySpec();
          persistStructure();
        }
        linkingFrom = null;
        canvasEl.classList.remove('km-linking');
      }
      selectedId = nodeId;
      renderSide();
    }

    // ── 캔버스 생성 ─────────────────────────────────────────────────────────
    canvas = new GraphCanvas(canvasEl, {
      persistAdapter: store,
      kindColors: NODE_KIND_COLORS,
      edgeKinds: EDGE_KIND_DEFS,
      onNodeClick: (id) => handleNodeClick(id),
      onBackgroundClick: () => {
        selectedId = null;
        linkingFrom = null;
        canvasEl.classList.remove('km-linking');
        renderSide();
      },
    });

    // ── 툴바 ────────────────────────────────────────────────────────────────
    const newLabelEl = q<HTMLInputElement>('new-label');
    const newKindEl = q<HTMLSelectElement>('new-kind');

    function addNode(): void {
      const label = newLabelEl.value.trim();
      if (!label) {
        newLabelEl.focus();
        return;
      }
      const kindRaw = newKindEl.value;
      const kind: NodeKind = isNodeKind(kindRaw) ? kindRaw : 'concept';
      const taken = new Set(spec.nodes.map((n) => n.id));
      const center = canvas?.viewCenterWorld() ?? { x: 0, y: 0 };
      // 겹쳐 쌓이지 않게 노드 수만큼 살짝 계단식으로 밀어 놓는다.
      const step = (spec.nodes.length % 8) * 24;
      const node: GraphNode = {
        id: nextId('node', taken),
        kind,
        label,
        group: '',
        x: Math.round(center.x - widthFor(label) / 2 + step),
        y: Math.round(center.y - NODE_H / 2 + step),
        w: widthFor(label),
        h: NODE_H,
        ports: [],
      };
      spec.nodes.push(node);
      newLabelEl.value = '';
      applySpec();
      persistStructure();
      selectedId = node.id;
      renderSide();
    }

    q<HTMLButtonElement>('add').onclick = addNode;
    newLabelEl.onkeydown = (e) => {
      if (e.key === 'Enter') addNode();
    };

    q<HTMLButtonElement>('fit').onclick = () => canvas?.fitView();

    q<HTMLButtonElement>('export').onclick = () => {
      const data = JSON.stringify(canvas?.getSpec() ?? spec, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'karmomap.json';
      a.click();
      URL.revokeObjectURL(url);
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
      spec._edge_kinds = { ...EDGE_KIND_DEFS };
      selectedId = null;
      linkingFrom = null;
      canvasEl.classList.remove('km-linking');
      applySpec();
      store.clear();
      renderSide();
    };

    // ── 초기 로드 ───────────────────────────────────────────────────────────
    void store.load().then((loaded) => {
      spec = loaded ?? emptyGraphSpec();
      // 관계 종류 정의는 항상 최신 셋으로 (저장본이 옛 정의를 갖고 있어도 색이 맞게).
      spec._edge_kinds = { ...EDGE_KIND_DEFS, ...(spec._edge_kinds ?? {}) };
      applySpec();
      if (spec.nodes.length > 0) canvas?.fitView();
      renderSide();
    });

    Mdd.linePreset('tool_run', {
      mood: 'idle',
      msg: '세계관을 펼쳐볼까요? 인물·장소·사건을 놓고 관계로 이어보세요.',
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
