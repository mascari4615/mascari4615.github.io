/**
 * local-storage-adapter.ts — KarmoMap 의 그래프 영속 (TASK-KL-087 단위 1).
 *
 * 왜 localStorage 인가: 세계관 노트는 사적인 것이고, 백엔드 0 으로 즉시
 * 동작해야 하며, 데스크톱 앱이 아니어도(웹) 써야 한다. 서버 동기화는 후속.
 *
 * 캔버스는 드래그 좌표만 `save(updates)` 로 흘려보낸다. 노드/엣지 추가·삭제
 * 같은 *구조* 변경은 위젯이 `saveSpec(spec)` 으로 통째로 쓴다 — 좌표 패치와
 * 구조 저장을 한 메서드로 합치면 캔버스가 구조를 알아야 해서 seam 이 깨진다.
 */
import type { GraphSpec, NodeCoord } from '../../lib/graph/spec';
import { emptyGraphSpec } from '../../lib/graph/spec';
import type { GraphPersistAdapter } from '../../lib/graph/adapter';

const DEFAULT_KEY = 'karmomap.graph';

export class KarmoMapLocalStorageAdapter implements GraphPersistAdapter {
  private key: string;

  constructor(key: string = DEFAULT_KEY) {
    this.key = key;
  }

  load(): Promise<GraphSpec | null> {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return Promise.resolve(null);
      const parsed = JSON.parse(raw) as Partial<GraphSpec>;
      return Promise.resolve(this.normalize(parsed));
    } catch (e) {
      console.error('[karmomap] 저장본 읽기 실패 — 빈 캔버스로 시작합니다', e);
      return Promise.resolve(null);
    }
  }

  /** 캔버스가 debounce 후 넘기는 좌표 패치. 저장본에 얹어 다시 쓴다. */
  async save(updates: NodeCoord[]): Promise<void> {
    if (updates.length === 0) return;
    const spec = (await this.load()) ?? emptyGraphSpec();
    for (const u of updates) {
      const kind = u.kind ?? 'node';
      if (kind === 'node') {
        const n = spec.nodes.find((x) => x.id === u.id);
        if (n) { n.x = u.x; n.y = u.y; }
      } else if (kind === 'group') {
        const g = spec.groups.find((x) => x.id === u.id);
        if (g) { g.bbox.x = u.x; g.bbox.y = u.y; }
      } else if (kind === 'anchor') {
        const a = spec.ephemeral_anchors.find((x) => x.id === u.id);
        if (a) { a.x = u.x; a.y = u.y; }
      }
    }
    this.write(spec);
  }

  /** 구조 변경(노드/엣지 추가·삭제·수정) 후 전체 저장. */
  saveSpec(spec: GraphSpec): void {
    this.write(spec);
  }

  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch (e) {
      console.error('[karmomap] 저장본 삭제 실패', e);
    }
  }

  private write(spec: GraphSpec): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(spec));
    } catch (e) {
      // 용량 초과(QuotaExceeded)가 대표 케이스 — 조용히 삼키면 사용자가
      // 저장된 줄 알고 작업을 계속하다 통째로 잃는다. 그래서 알린다.
      console.error('[karmomap] 저장 실패', e);
      alert('KarmoMap 저장에 실패했습니다. 브라우저 저장 공간을 확인해 주세요.\n(JSON 내보내기로 먼저 백업하시길 권합니다)');
    }
  }

  /** 옛 저장본·손으로 고친 JSON 에 필드가 빠져 있어도 캔버스가 안 죽게. */
  private normalize(p: Partial<GraphSpec>): GraphSpec {
    const base = emptyGraphSpec();
    return {
      version: p.version ?? base.version,
      _meta: p._meta ?? base._meta,
      groups: p.groups ?? base.groups,
      nodes: (p.nodes ?? base.nodes).map((n) => ({ ...n, ports: n.ports ?? [] })),
      edges: p.edges ?? base.edges,
      ephemeral_anchors: p.ephemeral_anchors ?? base.ephemeral_anchors,
      _edge_kinds: p._edge_kinds ?? base._edge_kinds,
    };
  }
}
