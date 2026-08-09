/**
 * panels/context.ts — 패널이 위젯에게 빌리는 것들 (TASK-KL-202 개편 2).
 *
 * `karmomap.ts` 가 2500 줄을 넘었고 그 절반이 **패널 아홉 개**였다. 그냥 파일만 쪼개면
 * 인자가 스무 개씩 붙어 더 나빠진다 — 그래서 **빌려 쓰는 것을 한 덩이(`PanelCtx`)로 묶어**
 * 넘긴다. 패널은 이 덩이 하나만 알면 되고, 위젯은 한 군데서 채워 준다.
 *
 * 한 번에 다 옮기지 않는다. **의존이 가장 적은 패널부터** 하나씩 — 큰 이사를 한 번에 하면
 * 무엇이 깨졌는지 알 수 없고, 화면 검사(35항목)가 있어도 되돌릴 지점이 없어진다.
 */
import type { GraphCanvas } from '../../../lib/graph/canvas';
import type { GraphSpec, GraphNode, GraphEdge, GroupDef } from '../../../lib/graph/spec';
import type { MyTerms } from '../terms';

export interface PanelCtx {
  /** 패널이 그려질 자리. 패널은 여기 `innerHTML` 을 통째로 쓴다. */
  side: HTMLElement;
  /** 지금 맵. 읽기만 — 고치는 것은 위젯이 준 함수로. */
  spec: () => GraphSpec;
  canvas: () => GraphCanvas | null;
  /** 화면 상태를 바꾸고 다시 그린다. */
  goNode: () => void;
  /** 그 노드를 골라 보여 준다. */
  focusNode: (nodeId: string) => void;
  /** 구조를 고쳤을 때 — 저장 + 되돌리기 한 걸음. */
  persist: () => void;
  /** 다시 그리기 (패널 자신 포함). */
  refresh: () => void;
  esc: (s: string) => string;

  // ── 저장 패널이 빌리는 것들 ────────────────────────────────────────────
  /** 저장 열쇠 → 사람이 읽는 맵 이름. */
  mapNameOfKey: (key: string) => string;
  /** 백업 파일 고르는 창 열기. */
  openRestore: () => void;
  /** 모든 맵을 한 파일로 내려받기. */
  backupAllMaps: () => void;
  /** 직전 판으로 되돌리기. */
  restorePrevRevision: () => void;

  // ── 거르기 패널이 빌리는 것들 ──────────────────────────────────────────
  /**
   * 무엇을 껐는지 · 어떤 규칙을 켰는지. **위젯이 들고 있는 것을 그대로 빌려 준다** —
   * 패널 안에 두면 패널을 닫을 때마다 사라진다.
   */
  filterState: {
    nodeKinds: Set<string>;
    edgeKinds: Set<string>;
    tags: Set<string>;
    hideOrphans: boolean;
    /** 이 수보다 적게 이어진 노드는 숨긴다(0 = 안 씀). */
    minDegree: number;
    sizeByDegree: boolean;
    colorByTag: boolean;
  };
  /** 거르기 값을 캔버스에 반영. */
  applyFilter: () => void;
  /** 꾸미기 규칙을 캔버스에 반영. */
  applyDecorate: () => void;
  /** 지금 팩 + 내 용어의 종류 목록. */
  nodeKinds: () => { id: string; label: string; icon: string }[];
  edgeKinds: () => { id: string; label: string }[];
  kindLabel: (id: string) => string;
  kindIcon: (id: string) => string;
  edgeLabel: (id: string) => string;

  // ── 내 용어 패널이 빌리는 것들 ────────────────────────────────────────
  /** 사람이 만든 종류들 (맵이 아니라 사람에게 붙는다). */
  terms: MyTerms;
  /** 고친 용어를 저장하고 캔버스 색표에 반영. */
  applyTerms: () => void;

  // ── 묶음 패널이 빌리는 것들 ────────────────────────────────────────────
  /** 새 묶음 하나(팩 프리셋 이름·색을 집어 온다). */
  createGroup: () => GroupDef;
  /** 이 노드가 든 묶음들. */
  memberOf: (node: GraphNode) => string[];
  /** 소속을 통째로 다시 쓴다. */
  setMembership: (node: GraphNode, ids: string[]) => void;
  /** spec → 캔버스 반영 (구조가 바뀐 뒤). */
  applySpec: () => void;

  // ── 여럿 고름 패널이 빌리는 것들 ──────────────────────────────────────
  selectedMany: () => string[];
  clearMany: () => void;
  /** 노드들과 거기 붙은 선·지시선을 함께 지운다. */
  removeNodes: (ids: string[]) => void;

  // ── 글로 만들기 패널이 빌리는 것들 ────────────────────────────────────
  /** 노드 종류 <option> 묶음 HTML. */
  nodeKindOptionsHtml: () => string;
  /** 들여쓴 글 → 노드·선. 만든 개수를 돌려준다. */
  buildFromOutline: (src: string, kind: string) => number;

  // ── 선 패널이 빌리는 것들 ──────────────────────────────────────────────
  edgeKindOptionsHtml: (selected?: string) => string;
  /** 지금 고른 선 (없으면 undefined). */
  selectedEdge: () => GraphEdge | undefined;
  /** 선 하나와 그것을 가리키던 지시선을 지운다. */
  removeEdge: (id: string) => void;

  // ── 설명 속 링크가 빌리는 것 ──────────────────────────────────────────
  /** 그 자리에 노드를 놓는다(이름이 비면 이름 칸에 커서). */
  spawnNodeAt: (x: number, y: number, label: string) => void;
}
