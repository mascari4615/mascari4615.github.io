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
import { t, loadNamespace } from '../../lib/i18n';

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
      console.error(t('karmomap.t402'), e);
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
      // 지우기 직전 판도 남긴다 — 「전체 삭제」야말로 되살리고 싶은 자리다.
      const before = localStorage.getItem(this.key);
      localStorage.removeItem(this.key);
      if (before) { try { localStorage.setItem(this.prevKey(), before); } catch { /* 칸이 좁으면 포기 */ } }
    } catch (e) {
      console.error(t('karmomap.t403'), e);
    }
  }

  /**
   * 직전 판 열쇠. 되돌리기 이력은 새로고침에 사라지므로, **한 판만** 따로 남긴다
   * (TASK-KL-202 격차 AB) — 「방금 뭘 잘못했는데 새로고침해 버린」 자리를 위해서.
   * 여러 판을 쌓으면 5MB 칸을 금세 먹는다. 한 판이 값의 대부분을 준다.
   */
  private prevKey(): string {
    return this.key.replace('karmomap.map.', 'karmomap.prev.');
  }

  /** 직전 판 읽기 — 없으면 null. */
  loadPrev(): GraphSpec | null {
    try {
      const raw = localStorage.getItem(this.prevKey());
      return raw ? (this.normalize(JSON.parse(raw) as Partial<GraphSpec>)) : null;
    } catch {
      return null;
    }
  }

  private write(spec: GraphSpec): void {
    try {
      // ★ 본판을 **먼저** 쓴다. 직전 판은 「있으면 좋은 것」이라, 그것 때문에 본판 저장이
      //   밀려나면 본말전도다(실측 2026-08-09: 직전 판까지 쓰다 칸이 차서 저장이 통째로 실패했다).
      const before = localStorage.getItem(this.key);
      localStorage.setItem(this.key, JSON.stringify(spec));
      // 직전 판은 작을 때만, 실패해도 조용히 넘어간다.
      if (before && before.length < 400_000) {
        try { localStorage.setItem(this.prevKey(), before); } catch { /* 칸이 좁으면 포기 */ }
      }
    } catch (e) {
      // 용량 초과(QuotaExceeded)가 대표 케이스 — 조용히 삼키면 사용자가
      // 저장된 줄 알고 작업을 계속하다 통째로 잃는다. 그래서 알린다.
      console.error(t('karmomap.t404'), e);
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
