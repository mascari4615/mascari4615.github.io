/**
 * activity-collector.ts — 5 신호 poll → 통합 state → 콜백 (TASK-KL-082 단위 F).
 *
 * 15s 폴링. 탭 hidden(document.hidden) 시 일시 정지.
 * 각 신호를 graph spec 의 live.source 에 매핑해 node_ids_active / edge_ids_animated 산출.
 */

import type { GraphSpec, LiveSpec } from './graph-spec';
import type { ActiveSets, EphemeralNodeRender } from './graph-canvas';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface SlotInfo {
  slot: string;
  pwd_short: string;
  topic: string;
}

export interface ProposalInfo {
  id: string;
  short_summary: string;
}

export interface RepoCommitInfo {
  count: number;
  last_sha: string;
  last_msg: string;
}

export interface CiRunInfo {
  workflow: string;
  status: string;
  run_id: string;
}

export interface InProgressTaskInfo {
  id: string;
  title: string;
  domain: string;
}

export interface ActivitySnapshot {
  ts: number;
  slots: SlotInfo[];
  proposals: ProposalInfo[];
  commits_by_repo: Record<string, RepoCommitInfo>;
  services: Record<string, string>;
  ci_runs: CiRunInfo[];
  in_progress_tasks: InProgressTaskInfo[];
}

export interface ActivityCollectorOutput {
  snapshot: ActivitySnapshot;
  activeSets: ActiveSets;
  ephemeralNodes: EphemeralNodeRender[];
}

type OutputCallback = (out: ActivityCollectorOutput) => void;

// ─── ActivityCollector ────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;
const CACHE_TTL_MS = 14_000;

export class ActivityCollector {
  private spec: GraphSpec | null = null;
  private callback: OutputCallback;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFetch = 0;
  private lastSnapshot: ActivitySnapshot | null = null;

  constructor(callback: OutputCallback) {
    this.callback = callback;
  }

  setSpec(spec: GraphSpec): void {
    this.spec = spec;
  }

  start(): void {
    if (this.timer !== null) return;
    void this.poll();
    this.timer = setInterval(() => {
      if (document.hidden) return;
      void this.poll();
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFetch < CACHE_TTL_MS && this.lastSnapshot) {
      this.emit(this.lastSnapshot);
      return;
    }

    const snapshot = await this.fetchSnapshot();
    if (!snapshot) return;
    this.lastFetch = Date.now();
    this.lastSnapshot = snapshot;
    this.emit(snapshot);
  }

  private async fetchSnapshot(): Promise<ActivitySnapshot | null> {
    const t = (window as unknown as { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__;
    const invoke = t?.core?.invoke;
    if (typeof invoke !== 'function') return null;

    const repoRoot = (window as unknown as { __cockpitRepoRoot?: string }).__cockpitRepoRoot ?? '';
    if (!repoRoot) return null;

    try {
      return await (invoke as (cmd: string, args?: Record<string, unknown>) => Promise<ActivitySnapshot>)(
        'cockpit_get_activity',
        { repoRoot },
      );
    } catch (e) {
      console.warn('[cockpit] cockpit_get_activity 실패', e);
      return null;
    }
  }

  private emit(snapshot: ActivitySnapshot): void {
    const activeSets = this.computeActiveSets(snapshot);
    const ephemeralNodes = this.computeEphemeralNodes(snapshot);
    this.callback({ snapshot, activeSets, ephemeralNodes });
  }

  // ── 활성 세트 계산 ────────────────────────────────────────────────────────

  private computeActiveSets(snap: ActivitySnapshot): ActiveSets {
    const node_ids_active = new Set<string>();
    const edge_ids_animated = new Set<string>();

    if (!this.spec) return { node_ids_active, edge_ids_animated };

    for (const node of this.spec.nodes) {
      if (!node.live) continue;
      if (this.isNodeActive(node.live, snap)) {
        node_ids_active.add(node.id);
      }
    }

    // live.source = 'nssm-service' 이고 active → 연결된 edge 도 animated
    for (const edge of this.spec.edges) {
      const kind = this.spec._edge_kinds?.[edge.kind];
      if (!kind?.animated_on_active) continue;
      const fromNodeId = edge.from.split(':')[0];
      const toNodeId = edge.to.split(':')[0];
      if (node_ids_active.has(fromNodeId) || node_ids_active.has(toNodeId)) {
        edge_ids_animated.add(edge.id);
      }
    }

    return { node_ids_active, edge_ids_animated };
  }

  private isNodeActive(live: LiveSpec, snap: ActivitySnapshot): boolean {
    switch (live.source) {
      case 'git-commits': {
        const repo = live.repo ?? '';
        const info = snap.commits_by_repo[repo];
        return (info?.count ?? 0) > 0;
      }
      case 'nssm-service': {
        const svc = live.service ?? '';
        return snap.services[svc] === 'running';
      }
      case 'active-sessions':
        return snap.slots.length > 0;
      case 'editor-log':
        // v1: editor-log 신호 미구현 (defer per TASK-KL-082 defer list)
        return false;
      default:
        return false;
    }
  }

  // ── ephemeral 노드 계산 ───────────────────────────────────────────────────

  private computeEphemeralNodes(snap: ActivitySnapshot): EphemeralNodeRender[] {
    if (!this.spec) return [];
    const result: EphemeralNodeRender[] = [];

    for (const anchor of this.spec.ephemeral_anchors ?? []) {
      const items = this.anchorItems(anchor, snap);
      if (items.length === 0) continue;

      // 단일 컬럼 list — Unity Animator sub-state 느낌. 라벨 ellipsis 는 render 쪽에서.
      // anchor 박스 밖으로 넘치면 visual overflow OK (캔버스 자유 배치).
      const cellW = anchor.w - 8;
      const cellH = 22;
      const gap = 4;
      items.forEach(({ id, label }, idx) => {
        result.push({
          id,
          label,
          anchorId: anchor.id,
          x: anchor.x + 4,
          y: anchor.y + 24 + idx * (cellH + gap),
          w: cellW,
          h: cellH,
        });
      });
    }

    return result;
  }

  private anchorItems(anchor: import('./graph-spec').EphemeralAnchor, snap: ActivitySnapshot): Array<{ id: string; label: string }> {
    if (!anchor) return [];
    switch (anchor.source.kind) {
      case 'active-sessions':
        return snap.slots.map((s) => ({
          id: anchor.id_template.replace('{slot}', s.slot),
          label: anchor.label_template
            .replace('{slot}', s.slot)
            .replace('{pwd_short}', s.pwd_short)
            .replace('{topic}', s.topic),
        }));
      case 'proposals':
        return snap.proposals.map((p) => ({
          id: anchor.id_template.replace('{id}', p.id),
          label: anchor.label_template.replace('{short_summary}', p.short_summary),
        }));
      case 'gh-runs':
        return snap.ci_runs
          .filter((r) => r.status === 'in_progress' || r.status === 'queued')
          .map((r) => ({
            id: anchor.id_template.replace('{run_id}', r.run_id),
            label: anchor.label_template
              .replace('{workflow}', r.workflow)
              .replace('{status}', r.status),
          }));
      case 'task-walk':
        return (snap.in_progress_tasks ?? []).map((t) => ({
          id: anchor.id_template.replace('{id}', t.id),
          label: anchor.label_template
            .replace('{id}', t.id)
            .replace('{short_title}', t.title.length > 24 ? t.title.slice(0, 22) + '…' : t.title)
            .replace('{domain}', t.domain),
        }));
      default:
        return [];
    }
  }
}
