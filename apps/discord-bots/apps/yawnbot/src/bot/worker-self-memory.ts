/**
 * 워커 자기 메모리 — broken loop 사전 차단 (TASK-KAR-018, 자가발전 substrate layer 2).
 *
 * 사용자 발화 (2026-05-22): 「에이전트 봇이 지혼자 자가발전할 수 있게 / 지금은 그냥 Cronbot」.
 * Cronbot 의 정의 = 매 tick 이전 결과 무관하게 동일 동작. 자가발전 = 이전 결과 read → 다음
 * tick 조정.
 *
 * 본 모듈 = 워커가 task pick 직전에 *자기 history* read → 같은 task 가 최근 6h 내 3회 이상
 * no-op done 한 적 있으면 skip. status drift 보강 (다중 layer):
 *   - layer A (frontmatter status sync — sync-task-status.mjs/.ts): commit 인식 후 done 마킹
 *   - layer B (현재 모듈): 워커가 자기 mem 보고 사전 skip — sync layer 가 미인식하는 패턴 안전망
 *   - layer C (system-health broken-loop signal): 사후 critical 신호 → self-surgery 진단
 *
 * 데이터 source = `memo/.claude/discoveries/agent-trace.jsonl` (system-health 와 동일 source,
 * 별 jsonl 신설 X — 평행 파이프 회피).
 */
import fs from 'fs';
import path from 'path';

interface TraceEntry {
  ts?: string;
  type?: string;
  core?: string;
  reason?: string;
  task?: string;
}

/** worker tick → done 결과 카운트 (최근 N hour, task id 기준). 안전 기본 = 빈 Map.
 *
 * 매 워커 tick 호출 → 전체 trace 파일 parse = O(N). 6h 윈도우 = 라인 수 작음
 * (cadence 30분 + ops 합쳐 ≤ 50~100). tail 만 read 로 성능 안정화 — 트레이스
 * 누적이 커져도 워커 pick latency 영향 X. tail size 는 6h × 안전계수 (cadence
 * tick 빈도 × 라인/tick) 보다 충분히 크게.
 */
const TAIL_LINES = 2000;
export function loadRecentDoneCounts(
  memoRoot: string,
  windowHours: number = 6,
  nowMs: number = Date.now(),
): Map<string, number> {
  const out = new Map<string, number>();
  if (!memoRoot) return out;
  const p = path.join(memoRoot, '.claude', 'discoveries', 'agent-trace.jsonl');
  if (!fs.existsSync(p)) return out;
  try {
    const cutoffIso = new Date(nowMs - windowHours * 3_600_000).toISOString();
    const all = fs.readFileSync(p, 'utf-8').split(/\r?\n/);
    const lines = all.slice(-TAIL_LINES).filter(Boolean);
    for (const l of lines) {
      let e: TraceEntry;
      try { e = JSON.parse(l); } catch { continue; }
      if (!e.ts || e.ts < cutoffIso) continue;
      if (!/\bdone\b/.test(e.reason || '')) continue;
      const taskId =
        e.task ||
        (e.reason || '').match(/TASK-[A-Z]+-\d{3}(?:-[A-Z0-9]+)*/)?.[0] ||
        null;
      if (!taskId) continue;
      out.set(taskId, (out.get(taskId) ?? 0) + 1);
    }
  } catch { /* best-effort */ }
  return out;
}

/**
 * 워커가 task pick 전 호출. 동일 task 가 windowHours 내 thresholdCount 이상 done 반복 시
 * true (= skip 권장). 즉 broken loop 사전 차단.
 *
 * thresholdCount default 3 = system-health.broken-loop 와 동일 임계 (정합).
 */
export function shouldSkipBrokenLoop(
  memoRoot: string,
  taskId: string,
  thresholdCount: number = 3,
  windowHours: number = 6,
  nowMs: number = Date.now(),
): boolean {
  const counts = loadRecentDoneCounts(memoRoot, windowHours, nowMs);
  return (counts.get(taskId) ?? 0) >= thresholdCount;
}

/**
 * task id 후보 배열을 받아 broken-loop 의심 항목을 *맨 뒤로 정렬* (skip 아닌 deprioritize).
 * filter 가 아닌 sort = 다른 후보 없을 때 fallback 으로 시도 가능. 완전 차단보다 안전.
 */
export function deprioritizeBrokenLoopCandidates<T extends { id: string }>(
  memoRoot: string,
  cands: T[],
  thresholdCount: number = 3,
  windowHours: number = 6,
  nowMs: number = Date.now(),
): T[] {
  if (cands.length <= 1) return cands;
  const counts = loadRecentDoneCounts(memoRoot, windowHours, nowMs);
  return [...cands].sort((a, b) => {
    const aBroken = (counts.get(a.id) ?? 0) >= thresholdCount ? 1 : 0;
    const bBroken = (counts.get(b.id) ?? 0) >= thresholdCount ? 1 : 0;
    return aBroken - bBroken; // broken (1) 이 뒤로
  });
}
