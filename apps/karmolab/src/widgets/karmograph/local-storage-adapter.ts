/**
 * local-storage-adapter.ts. KarmoGraph 의 그래프 영속 (TASK-KL-087 단위 1).
 *
 * 왜 localStorage 인가: 세계관 노트는 사적인 것이고, 백엔드 0 으로 즉시
 * 동작해야 하며, 데스크톱 앱이 아니어도(웹) 써야 한다. 서버 동기화는 후속.
 *
 * 캔버스는 드래그 좌표만 `save(updates)` 로 흘려보낸다. 노드/엣지 추가, 삭제
 * 같은 *구조* 변경은 위젯이 `saveSpec(spec)` 으로 통째로 쓴다. 좌표 패치와
 * 구조 저장을 한 메서드로 합치면 캔버스가 구조를 알아야 해서 seam 이 깨진다.
 */
import type { GraphSpec, NodeCoord } from '../../lib/karmograph/spec';
import { emptyGraphSpec } from '../../lib/karmograph/spec';
import type { GraphPersistAdapter } from '../../lib/karmograph/adapter';
import { t, loadNamespace } from '../../lib/i18n';

const DEFAULT_KEY = 'karmograph.graph';

export class KarmoGraphLocalStorageAdapter implements GraphPersistAdapter {
  private key: string;

  /**
   * 저장이 **실패했을 때** 부를 자리 (TASK-KL-271).
   * 예전에는 여기서 곧장 `alert()` 를 띄웠는데, ① 문구가 한국어로 박혀 있어 다른 말 쓰는 사람은
   * 못 읽었고 ② 닫으면 흔적이 없어 저장된 줄 알고 계속 고치다 통째로 잃었다.
   * 어댑터는 **알리기만** 하고, 무엇을 보여 줄지는 화면을 아는 쪽이 정한다.
   */
  onWriteError?: (err: unknown) => void;

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
      console.error(t('karmograph.parsed.msg2'), e);
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

  /** 구조 변경(노드/엣지 추가, 삭제, 수정) 후 전체 저장. */
  saveSpec(spec: GraphSpec): void {
    this.write(spec);
  }

  clear(): void {
    try {
      // 지우기 직전 판도 남긴다. 전체 삭제야말로 되살리고 싶은 자리다.
      const before = localStorage.getItem(this.key);
      localStorage.removeItem(this.key);
      if (before) { try { localStorage.setItem(this.prevKey(), before); } catch { /* 칸이 좁으면 포기 */ } }
    } catch (e) {
      console.error(t('karmograph.before.msg'), e);
    }
  }

  /**
   * 직전 판 열쇠. 되돌리기 이력은 새로고침에 사라지므로, **한 판만** 따로 남긴다
   * (TASK-KL-202 격차 AB). 방금 뭘 잘못했는데 새로고침해 버린 자리를 위해서.
   * 여러 판을 쌓으면 5MB 칸을 금세 먹는다. 한 판이 값의 대부분을 준다.
   */
  private prevKey(): string {
    return this.key.replace('karmograph.map.', 'karmograph.prev.');
  }

  /**
   * 다른 탭이 고친 판을 덮으며 **따로 떠 둔 것이 있나** (KL-271).
   * 말 상자는 한 번 뜨고 사라지지만, 이 표시는 저장 칸에 남아 되찾는 길을 가리킨다.
   */
  hasRescue(): boolean {
    try {
      return Boolean(localStorage.getItem(this.rescueKey()));
    } catch {
      return false;
    }
  }

  /** 직전 판 읽기. 없으면 null. */
  loadPrev(): GraphSpec | null {
    try {
      // 남이 쓴 것을 덮은 적이 있으면 **그것부터** 돌려준다. 되찾고 싶은 건 대개 그쪽이다.
      const raw = localStorage.getItem(this.rescueKey()) ?? localStorage.getItem(this.prevKey());
      return raw ? (this.normalize(JSON.parse(raw) as Partial<GraphSpec>)) : null;
    } catch {
      return null;
    }
  }

  /**
   * 다른 탭이 이 판을 고쳤나. **덮어쓰기 전에** 묻는 자리 (KL-271).
   *
   * 한 판을 두 탭에서 열어 두는 일은 흔하다(링크로 열고, 원래 탭은 그대로 둔다). 그런데 각 탭은
   * 제 기억 속 판을 통째로 쓰므로, **뒤에 쓴 탭이 앞 탭의 일을 지운다**. 실측 2026-08-14:
   * B 탭에서 만든 카드가 A 탭의 다음 저장에 사라졌다(아무 말도 없이).
   * 여기서는 내가 마지막에 쓴 표시와 저장소의 표시를 견줘 **남이 썼는지**만 알린다.
   */
  onForeignWrite: ((key: string) => void) | null = null;

  private stamp = '';

  /** ⚠ `karmograph.map.*` 앞머리를 쓰면 **판 목록을 훑는 곳이 이걸 판으로 알고 JSON 으로 읽는다**
   *  (실측 2026-08-14: 예시 넣기가 통째로 빨갰다). 다른 앞머리에 둔다. */
  private stampKey(): string { return this.key.replace('karmograph.map.', 'karmograph.stamp.'); }

  /** 남의 판을 덮는 순간 따로 떠 두는 자리. 보통 저장은 여기를 절대 안 건드린다. */
  private rescueKey(): string { return this.key.replace('karmograph.map.', 'karmograph.rescue.'); }

  /** 저장소의 표시가 내가 쓴 것과 다르면 = 그 사이 남이 썼다. */
  private foreignSince(): boolean {
    if (!this.stamp) return false;   // 이 탭이 아직 한 번도 안 썼으면 다툴 것이 없다
    try {
      return localStorage.getItem(this.stampKey()) !== this.stamp;
    } catch {
      return false;
    }
  }

  private write(spec: GraphSpec): void {
    const foreign = this.foreignSince();
    try {
      // ★ 본판을 **먼저** 쓴다. 직전 판은 있으면 좋은 것이라, 그것 때문에 본판 저장이
      //   밀려나면 본말전도다(실측 2026-08-09: 직전 판까지 쓰다 칸이 차서 저장이 통째로 실패했다).
      const before = localStorage.getItem(this.key);
      localStorage.setItem(this.key, JSON.stringify(spec));
      /* 직전 판은 작을 때만, 실패해도 조용히 넘어간다.
         ★ 단 **남이 쓴 판을 덮는 순간**에는 크기를 안 따진다. 그 한 판이 곧 되찾을 유일한
         자료다(내 저장이 여러 번 돌면 내 것으로 밀려 사라진다. 실측 2026-08-14). */
      if (before && before.length < 400_000) {
        try { localStorage.setItem(this.prevKey(), before); } catch { /* 칸이 좁으면 포기 */ }
      }
      /* ★ 남이 쓴 판을 덮는 순간, 그 판을 **따로** 떠 둔다. 직전 판 자리에만 두면 내 다음
         저장이 곧바로 밀어낸다(실측 2026-08-14: 두 번째 저장에 사라졌다). 여기는 보통 저장이
         절대 안 건드리는 자리다. 되살리기가 이걸 먼저 본다. */
      if (foreign && before) {
        try { localStorage.setItem(this.rescueKey(), before); } catch { /* 칸이 좁으면 포기 */ }
      }
      // 내가 썼다는 표시를 남긴다. 다음 저장 때 그 사이 남이 썼나를 이걸로 안다.
      this.stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      try { localStorage.setItem(this.stampKey(), this.stamp); } catch { /* 칸이 좁으면 포기 */ }
      if (foreign) this.onForeignWrite?.(this.key);
    } catch (e) {
      // 용량 초과(QuotaExceeded)가 대표 케이스. 조용히 삼키면 사용자가 저장된 줄 알고 작업을
      // 계속하다 통째로 잃는다. 그래서 알린다. 다만 **여기서 창을 띄우지는 않는다**:
      // 문구가 한국어로 박혀 있어 다른 말 쓰는 사람은 못 읽었고, 닫으면 흔적이 없었다.
      // 무엇을 보여 줄지는 화면을 아는 쪽이 정한다(`onWriteError`).
      console.error(t('karmograph.before.msg2'), e);
      this.onWriteError?.(e);
    }
  }

  /** 옛 저장본, 손으로 고친 JSON 에 필드가 빠져 있어도 캔버스가 안 죽게. */
  private normalize(p: Partial<GraphSpec>): GraphSpec {
    const base = emptyGraphSpec();
    /* ★ **적어 둔 것을 흘리지 않는다** (TASK-KL-271). 예전엔 아는 칸만 골라 담았는데, 그러면
       나중에 생긴 칸(저장한 보기, 시점, 꾸미기 규칙...)이 **다시 열 때 조용히 사라진다** . 
       저장본에는 남아 있으니 아무도 못 알아챈다(실측: 보기 저장이 새로고침 한 번에 증발).
       그래서 **통째로 가져오고**, 없어서는 안 되는 칸만 뒤에서 채운다. */
    return {
      ...(p as GraphSpec),
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
