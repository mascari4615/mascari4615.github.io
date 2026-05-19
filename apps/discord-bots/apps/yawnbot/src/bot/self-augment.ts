/**
 * self-augment — 자가증강 *닫는* 루프 (TASK-KAR-018-LT-11).
 *
 * 그동안의 "형식적 cron" 근본: 팀이 새 코어를 *제안·materialize(status:
 * draft)* 까지만 하고 draft→active flip(=바인딩) 을 아무도 안 함
 * (agent-factory-adapter "slice-3/외부" 미구축). `agent-cadence.ts`
 * 워커는 `status==='active'` 만 픽 → draft 코어 = 사산.
 *
 * 본 모듈이 그 닫는 rung: 팀 채택으로 materialize 된 draft 코어를
 *  ① 구조검증+비충돌 PASS → 자율 draft→active flip + baseline 스냅샷
 *  ② 사후 행동 적합도(agent-trace done vs fail 비율, 관측창) 퇴행 →
 *     자동 active→draft revert
 * = 사용자 결정(2026-05-19 "완전 자율 + 측정 게이트"). !kill·revert SLO
 * 항상 위. 새 코어=코드 0(core.md 뿐) → heavy verify 부적용(올바른
 * 스코핑); 의미있는 게이트 = 구조+비충돌+사후측정.
 *
 * substrate-순수: fs/path 만(Discord·discord.js import 0 — proposal-
 * adapter 동형). 원장 = LT-10 verdict 원장과 동일 패턴(평행정의0).
 */
import fs from 'fs';
import path from 'path';
import { loadCoreDef, listCoreIds, type CoreDef } from '../services/agent-core';

const SAFE_CORE_ID = /^[a-z0-9][a-z0-9_-]*$/;

/** 자율 승격 절대 제외 (비전·정체성 코어 — 사람 영역, 헌장 §3③). */
const PROTECTED_CORE_IDS: ReadonlySet<string> = new Set([
  'atlas',
  'echo',
]);

function memoRootOf(env: NodeJS.ProcessEnv): string {
  return env.MEMO_REPO_PATH?.trim() || '';
}

// ── 승격 후보 큐 (inbox-consumer 가 팀 채택 agent materialize 시 enqueue) ──
export function promotionCandidatesPath(env: NodeJS.ProcessEnv): string {
  const root = memoRootOf(env);
  return root
    ? path.join(root, '.claude', 'agent-core-promotion-candidates.jsonl')
    : '';
}

export function enqueuePromotionCandidate(
  env: NodeJS.ProcessEnv,
  coreId: string,
): void {
  const p = promotionCandidatesPath(env);
  if (!p || !coreId) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(
      p,
      JSON.stringify({ ts: new Date().toISOString(), coreId }) + '\n',
      'utf-8',
    );
  } catch {
    /* best-effort — 큐 실패가 materialize 비차단 */
  }
}

function readCandidateIds(env: NodeJS.ProcessEnv): string[] {
  const p = promotionCandidatesPath(env);
  if (!p || !fs.existsSync(p)) return [];
  const out = new Set<string>();
  try {
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const c = JSON.parse(t).coreId;
      if (typeof c === 'string' && c) out.add(c);
    }
  } catch {
    /* best-effort */
  }
  return [...out];
}

// ── 승격/revert 상태 원장 (id별 최신 = promoted | reverted | none) ──
export interface PromotionRec {
  ts: string;
  coreId: string;
  action: 'promoted' | 'reverted';
  reason: string;
}

export function promotionLedgerPath(env: NodeJS.ProcessEnv): string {
  const root = memoRootOf(env);
  return root
    ? path.join(root, '.claude', 'agent-core-promotion.jsonl')
    : '';
}

function appendPromotionRec(
  env: NodeJS.ProcessEnv,
  rec: Omit<PromotionRec, 'ts'>,
): void {
  const p = promotionLedgerPath(env);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(
      p,
      JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n',
      'utf-8',
    );
  } catch {
    /* best-effort */
  }
}

/** coreId → 최신 승격 레코드 (순수). 없으면 undefined. */
export function readPromotionState(
  env: NodeJS.ProcessEnv,
): Map<string, PromotionRec> {
  const p = promotionLedgerPath(env);
  const latest = new Map<string, PromotionRec>();
  if (!p || !fs.existsSync(p)) return latest;
  try {
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const e = JSON.parse(t) as PromotionRec;
      if (e && e.coreId && e.action) latest.set(e.coreId, e);
    }
  } catch {
    /* best-effort */
  }
  return latest;
}

// ── ① 승격 게이트 (순수 결정 — 구조검증 + 비충돌) ──────────────
export interface PromotionDecision {
  ok: boolean;
  reason: string;
}

/**
 * draft 코어 1개의 자율 active 승격 가부 (순수·결정적, fs read-only).
 *  · 파싱·필수필드(role/displayName)·safe id  ← 구조검증
 *  · status === 'draft' (이미 active/없음 = 대상 X)
 *  · PROTECTED(atlas/echo) 제외 (정체성 = 사람 영역)
 *  · worker(kind=worker)면 같은 domain 의 *active* 코어 없어야 (비충돌)
 * 통과 못 하면 ok:false + 사유 (날조 X — escalate/보류 신호).
 */
export function evaluateCorePromotion(
  memoRoot: string,
  coreId: string,
): PromotionDecision {
  if (!memoRoot) return { ok: false, reason: 'memo-root 부재' };
  if (!SAFE_CORE_ID.test(coreId)) {
    return { ok: false, reason: `부적합 coreId: ${coreId}` };
  }
  if (PROTECTED_CORE_IDS.has(coreId)) {
    return { ok: false, reason: `보호 코어(정체성·사람 영역): ${coreId}` };
  }
  let core: CoreDef | null;
  try {
    core = loadCoreDef(memoRoot, coreId);
  } catch {
    return { ok: false, reason: 'core.md 파싱 실패' };
  }
  if (!core) return { ok: false, reason: 'core.md 부재' };
  if ((core.status || '').trim() !== 'draft') {
    return { ok: false, reason: `status≠draft (=${core.status}) — 대상 X` };
  }
  if (!(core.role || '').trim() || !(core.displayName || '').trim()) {
    return { ok: false, reason: '필수필드(role/displayName) 누락' };
  }
  const kind = (core.frontmatter?.kind || '').trim();
  const domain = (core.frontmatter?.domain || '').trim().toUpperCase();
  if (kind === 'worker' && domain) {
    for (const otherId of listCoreIds(memoRoot)) {
      if (otherId === coreId) continue;
      let o: CoreDef | null = null;
      try {
        o = loadCoreDef(memoRoot, otherId);
      } catch {
        o = null;
      }
      if (
        o &&
        (o.status || '').trim() === 'active' &&
        (o.frontmatter?.kind || '').trim() === 'worker' &&
        (o.frontmatter?.domain || '').trim().toUpperCase() === domain
      ) {
        return {
          ok: false,
          reason: `domain ${domain} active 워커 ${otherId} 와 충돌`,
        };
      }
    }
  }
  return { ok: true, reason: '구조검증+비충돌 PASS' };
}

/**
 * core.md frontmatter `status:` 한 줄을 from→to 로 치환 (fs effect).
 * frontmatter 블록(첫 `---`~둘째 `---`) 안의 `status:` 만 — 본문 오염 0.
 * 멱등(이미 to 면 true). 실패=false (날조 X).
 */
export function setCoreStatus(
  memoRoot: string,
  coreId: string,
  to: 'active' | 'draft',
): boolean {
  if (!memoRoot || !SAFE_CORE_ID.test(coreId)) return false;
  const abs = path.join(memoRoot, '.claude', 'agents', coreId, 'core.md');
  try {
    const raw = fs.readFileSync(abs, 'utf-8');
    const nl = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(/\r?\n/);
    if (lines[0]?.trim() !== '---') return false;
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        end = i;
        break;
      }
    }
    if (end < 0) return false;
    let hit = false;
    for (let i = 1; i < end; i++) {
      if (/^status\s*:/.test(lines[i])) {
        lines[i] = `status: ${to}`;
        hit = true;
        break;
      }
    }
    if (!hit) return false;
    fs.writeFileSync(abs, lines.join(nl), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// ── ② 사후 행동 적합도 (agent-trace.jsonl — 기존 durable 신호) ──
export interface CoreOutcomes {
  done: number;
  fail: number;
  total: number;
}

/**
 * 코어의 sinceTs 이후 워커 trace 결과 집계 (순수, read-only).
 * appendTrace reason = `worker <id> <res.status> …` (agent-cadence:1619).
 * status==='done' = 산출 성공 / 그 외(error 등) = fail. 새 instrumentation
 * 0 (substrate-first — 기존 감사 trace 재사용).
 */
export function readCoreOutcomes(
  env: NodeJS.ProcessEnv,
  coreId: string,
  sinceTs: string,
): CoreOutcomes {
  const root = memoRootOf(env);
  const out: CoreOutcomes = { done: 0, fail: 0, total: 0 };
  if (!root) return out;
  const p = path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl');
  if (!fs.existsSync(p)) return out;
  try {
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const e = JSON.parse(t) as {
        ts?: string;
        core?: string;
        reason?: string;
      };
      if (!e || e.core !== coreId || !e.ts || e.ts < sinceTs) continue;
      const m = /^worker\s+\S+\s+(\S+)/.exec(e.reason || '');
      if (!m) continue;
      out.total += 1;
      if (m[1] === 'done') out.done += 1;
      else out.fail += 1;
    }
  } catch {
    /* best-effort — 손상 라인 폐기 */
  }
  return out;
}

export interface RegressionCfg {
  /** 판정 최소 관측수 (그 전엔 미관측 = 유지, 성급 revert X). */
  minObservations: number;
  /** done 비율 이 미만이면 퇴행 (0~1). */
  minDoneRatio: number;
}

export const DEFAULT_REGRESSION_CFG: RegressionCfg = {
  minObservations: 3,
  minDoneRatio: 0.34, // 3건 중 1건도 산출 못 하면(=0.0~0.33) 퇴행
};

/**
 * 승격 코어 퇴행 판정 (순수). 관측 부족 = 미퇴행(유지 — 성급 X,
 * "측정으로 들러붙는 진화만" 정합). 날조 0: 실제 trace 집계만.
 */
export function detectCorePromotionRegression(
  o: CoreOutcomes,
  cfg: RegressionCfg = DEFAULT_REGRESSION_CFG,
): { regressed: boolean; reason: string } {
  if (o.total < cfg.minObservations) {
    return {
      regressed: false,
      reason: `관측 ${o.total}/${cfg.minObservations} — 판정 보류(유지)`,
    };
  }
  const ratio = o.total > 0 ? o.done / o.total : 0;
  if (ratio < cfg.minDoneRatio) {
    return {
      regressed: true,
      reason: `done 비율 ${o.done}/${o.total}(${ratio.toFixed(
        2,
      )}) < ${cfg.minDoneRatio} — 퇴행`,
    };
  }
  return {
    regressed: false,
    reason: `done 비율 ${o.done}/${o.total}(${ratio.toFixed(2)}) 정상`,
  };
}

// ── 러너 (DI — fs flip/notify 주입, 헤드리스 테스트 가능) ────────
export interface SelfAugmentDeps {
  /** core.md status flip (default = setCoreStatus). 테스트 stub. */
  setStatus?: (memoRoot: string, coreId: string, to: 'active' | 'draft') => boolean;
  /** #team-bus 가시화 (default no-op — 가시층은 호출측 어댑터). */
  notify?: (msg: string) => void;
  regressionCfg?: RegressionCfg;
}

/**
 * 승격 후보 1회 소비: 구조검증+비충돌 PASS → 자율 draft→active flip +
 * 승격 원장. 멱등(이미 promoted/active = skip). FAIL = #team-bus 사유
 * (escalate — 사람/재숙의). @returns 이번에 승격한 coreId[].
 */
export function runCorePromotionOnce(
  env: NodeJS.ProcessEnv,
  deps: SelfAugmentDeps = {},
): string[] {
  const root = memoRootOf(env);
  if (!root) return [];
  const setStatus = deps.setStatus ?? setCoreStatus;
  const notify = deps.notify ?? (() => {});
  const state = readPromotionState(env);
  const promoted: string[] = [];
  for (const coreId of readCandidateIds(env)) {
    const st = state.get(coreId);
    if (st && st.action === 'promoted') continue; // 멱등
    const dec = evaluateCorePromotion(root, coreId);
    if (!dec.ok) {
      // status≠draft 흔한 정상 케이스(이미 active/이전 처리) = 조용히 skip,
      // 진짜 게이트 실패만 표면화 (노이즈 0).
      if (!/status≠draft|대상 X/.test(dec.reason)) {
        notify(
          `🧬 자가증강 보류 — 코어 \`${coreId}\` 승격 게이트 미통과: ${dec.reason} (재숙의/사람 검토)`,
        );
      }
      continue;
    }
    if (!setStatus(root, coreId, 'active')) {
      notify(`🧬 자가증강 — 코어 \`${coreId}\` status flip 실패(IO) — 보류`);
      continue;
    }
    appendPromotionRec(env, {
      coreId,
      action: 'promoted',
      reason: dec.reason,
    });
    notify(
      `🧬 **자가증강** — 팀이 새 코어 \`${coreId}\` 를 검증 통과시켜 ` +
        `*가동(active)* 시작했습니다. 적합도 미달 시 자동 원복됩니다.`,
    );
    promoted.push(coreId);
  }
  return promoted;
}

/**
 * 승격 코어 퇴행 1회 점검: agent-trace 집계 → 퇴행 시 자율 active→
 * draft revert + 원장. 관측 부족/정상 = 무동작(성급 X). @returns
 * 이번에 revert 한 coreId[].
 */
export function runCorePromotionRevertOnce(
  env: NodeJS.ProcessEnv,
  deps: SelfAugmentDeps = {},
): string[] {
  const root = memoRootOf(env);
  if (!root) return [];
  const setStatus = deps.setStatus ?? setCoreStatus;
  const notify = deps.notify ?? (() => {});
  const cfg = deps.regressionCfg ?? DEFAULT_REGRESSION_CFG;
  const reverted: string[] = [];
  for (const [coreId, rec] of readPromotionState(env)) {
    if (rec.action !== 'promoted') continue; // 이미 revert/none
    const o = readCoreOutcomes(env, coreId, rec.ts);
    const r = detectCorePromotionRegression(o, cfg);
    if (!r.regressed) continue;
    if (!setStatus(root, coreId, 'draft')) {
      notify(`🧬 자가증강 revert — 코어 \`${coreId}\` flip 실패(IO) — 보류`);
      continue;
    }
    appendPromotionRec(env, {
      coreId,
      action: 'reverted',
      reason: r.reason,
    });
    notify(
      `🧬 **자가증강 자동 원복** — 코어 \`${coreId}\` 가 가동 후 적합도 ` +
        `미달(${r.reason}) → draft 로 되돌렸습니다. (측정으로 들러붙는 진화만)`,
    );
    reverted.push(coreId);
  }
  return reverted;
}
