/**
 * proposal-adapter — ⑦' 생산자 발굴→파싱→라우팅→디스패치 (KAR-018-W slice-2).
 *
 * substrate⊥어댑터(⓪'): proposal.ts(순수 envelope/router) ↔ 실 발굴 LLM·
 * 엔진 디스패치 사이. 평행정의0 — sub-D `appendTrace`/`NotifyFn` 재사용.
 *
 * W-4 no-auto-exec: dispatch 는 *seed TASK / proposed objective 또는 엔진
 * 게이트까지만*. 즉시 main 반영·활성화 X (각 엔진의 ②/②'/④ 게이트가 차단,
 * 활성화는 slice-3 사람승인 reconcile). 발굴 실패·미배선 = 폐기 + trace.
 */
import fs from 'fs';
import path from 'path';
import {
  parseProposalEnvelope,
  routeProposal,
  proposalId,
  type ProposalEnvelope,
  type RouteTarget,
  type TaskSeedPayload,
  type ObjectivePayload,
} from './proposal';
import {
  appendTrace,
  defaultNotify,
  isObjectiveApproved,
  type NotifyFn,
} from './governance-adapter';

/** 발굴 LLM 호출 (DI — generateAssistantText 'claude-cli' 래퍼 주입). */
export type DiscoverFn = () => Promise<string>;

/** kind 별 엔진 디스패치 (DI — 각 run·seed·append 어댑터 주입). */
export type ProposalDispatch = Partial<
  Record<RouteTarget, (env: ProposalEnvelope) => Promise<void>>
>;

export interface ProposalProducerDeps {
  env: NodeJS.ProcessEnv;
  discover: DiscoverFn;
  dispatch: ProposalDispatch;
  notify?: NotifyFn;
}

/**
 * ⑦' 생산자 1 tick: 발굴 → parse(검증) → route → dispatch.
 *  · 파싱 실패(형식·부분·미지) → 'parse-fail' (폐기 + trace, 날조 0).
 *  · 타겟 미배선 → 'no-dispatch' (해당 엔진 어댑터 미주입 — graceful).
 *  · 정상 → RouteTarget (dispatch 가 seed/proposed/엔진게이트까지만, no-auto-exec).
 */
export async function runProducerOnce(
  deps: ProposalProducerDeps,
): Promise<string> {
  const notify = deps.notify ?? defaultNotify(deps.env);
  let raw: string;
  try {
    raw = await deps.discover();
  } catch (e) {
    notify(
      `⑦' 발굴 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
    return 'discover-error';
  }

  const envelope = parseProposalEnvelope(raw);
  if (!envelope) {
    appendTrace(deps.env, {
      ts: new Date().toISOString(),
      type: 'drift',
      core: 'producer',
      reason: '발굴물 파싱 실패(형식·부분·미지) — 폐기',
    });
    notify('⑦\' 발굴물 파싱 실패 — 폐기 (날조 0)');
    return 'parse-fail';
  }

  const target = routeProposal(envelope);
  const fn = deps.dispatch[target];
  if (!fn) {
    notify(`⑦' ${envelope.kind}→${target} 디스패치 미배선 — 보류`);
    return 'no-dispatch';
  }

  await fn(envelope); // no-auto-exec: dispatch=인박스/seed/엔진게이트까지만
  const pid = proposalId(envelope);
  appendTrace(deps.env, {
    ts: new Date().toISOString(),
    type: 'budget',
    core: 'producer',
    reason: `발굴→${target} (${envelope.kind}) ${pid}`,
  });
  notify(
    `⑦' 발굴 → ${target} (${envelope.kind}) [${pid}] — 승인 시 처리 ` +
      `(agent-approvals.jsonl 에 {"objId":"${pid}","status":"approved"})`,
  );
  return target;
}

// ── 보수적 materialization: proposals 인박스 (canon 자동변경 X) ──
// objectives.md 「발굴물 자동 실행 절대 X」 최보수 해석 — 발굴물은 사람
// 검토용 인박스(jsonl)에만 기록. seed TASK/objective row/엔진 실행은
// *사람·후속 단계*가 인박스에서 승격 (slice-3/W 후속). agent-state/
// approvals/archive 와 동급 런타임 아티팩트(gitignore 됨).

export function proposalsPath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'proposals.jsonl') : '';
}

export interface ProposalInboxEntry {
  ts: string;
  /** 결정적 발굴 id — 사람 승인(agent-approvals.jsonl objId) 매칭 키. */
  id: string;
  target: RouteTarget;
  kind: ProposalEnvelope['kind'];
  envelope: ProposalEnvelope;
}

export function appendProposal(
  env: NodeJS.ProcessEnv,
  entry: ProposalInboxEntry,
): void {
  const p = proposalsPath(env);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    /* best-effort — 인박스 실패가 발굴을 막지 않음 */
  }
}

/**
 * 보수 dispatch: 모든 타겟 → proposals 인박스 기록 (canon 무변경).
 * 엔진 실행/seed/active 승격은 사람 검토 후 (W slice-3/후속 — 데드
 * 인터페이스 방지 + 「자동 실행 절대 X」 최보수).
 */
export function inboxDispatch(env: NodeJS.ProcessEnv): ProposalDispatch {
  const targets: RouteTarget[] = [
    'self-improve',
    'self-skill',
    'agent-factory',
    'task-new',
    'objectives',
  ];
  const d: ProposalDispatch = {};
  for (const t of targets) {
    d[t] = async (envelope) => {
      appendProposal(env, {
        ts: new Date().toISOString(),
        id: proposalId(envelope),
        target: t,
        kind: envelope.kind,
        envelope,
      });
    };
  }
  return d;
}

// ── 승인 게이트 인박스 소비자 (W slice-3, task kind) ──────────
// proposals.jsonl 발굴 + agent-approvals.jsonl `approved`(objId=발굴id)
// 일치 → 실 *seed* TASK 파일 머터리얼라이즈. canon 정합:
//  · W-4 no-auto-exec: status:seed 까지만 (사람이 ready 승격 = 기존
//    TASK 시스템 게이트, 즉시 실행 X)
//  · W-5 사람승인 활성화: isObjectiveApproved(approvals.jsonl) 재사용
//  · mission §3 무한증식 차단: *승인된 것만*, materialized 멱등
//  · 평행정의0: approval seam·TASK-SCHEMA 재사용 (sub-E core.md
//    authoring 트랙과 비충돌 — task kind=task-new 라우팅뿐)

/** TASK-SCHEMA 도메인 → {폴더(memo 기준 상대), prefix}. */
const DOMAIN_MAP: Record<string, { folder: string; prefix: string }> = {
  wm: { folder: 'wm/tasks', prefix: 'WM' },
  kl: { folder: 'projects/karmolab/tasks', prefix: 'KL' },
  yb: { folder: 'projects/yawnbot/tasks', prefix: 'YB' },
  life: { folder: 'life/tasks', prefix: 'LIFE' },
  hobby: { folder: 'hobby/tasks', prefix: 'HOBBY' },
  learn: { folder: 'learning/tasks', prefix: 'LEARN' },
  kar: { folder: 'tasks', prefix: 'KAR' },
};

export function materializedPath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'proposals-materialized.jsonl') : '';
}

export function readMaterialized(env: NodeJS.ProcessEnv): Set<string> {
  const p = materializedPath(env);
  const s = new Set<string>();
  if (!p || !fs.existsSync(p)) return s;
  try {
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (t) s.add(JSON.parse(t).id as string);
    }
  } catch {
    /* best-effort */
  }
  return s;
}

function appendMaterialized(
  env: NodeJS.ProcessEnv,
  id: string,
  taskPath: string,
): void {
  const p = materializedPath(env);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(
      p,
      JSON.stringify({ ts: new Date().toISOString(), id, taskPath }) + '\n',
      'utf-8',
    );
  } catch {
    /* best-effort */
  }
}

export function readInboxProposals(
  env: NodeJS.ProcessEnv,
): ProposalInboxEntry[] {
  const p = proposalsPath(env);
  if (!p || !fs.existsSync(p)) return [];
  const out: ProposalInboxEntry[] = [];
  try {
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const e = JSON.parse(t) as ProposalInboxEntry;
      if (e && e.id && e.envelope) out.push(e);
    }
  } catch {
    /* best-effort — 손상 라인은 폐기 */
  }
  return out;
}

function slugify(title: string): string {
  return (
    title
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'untitled'
  );
}

/** 도메인 폴더의 다음 빈 TASK 번호 (race-best-effort — seed 라 사람 검토). */
function nextTaskId(memoRoot: string, folder: string, prefix: string): string {
  const dir = path.join(memoRoot, folder);
  let max = 0;
  try {
    const re = new RegExp(`^TASK-${prefix}-(\\d+)`);
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  } catch {
    /* 폴더 부재 → 001 부터 */
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/**
 * 승인된 task 발굴 → *seed* TASK 파일 작성. status:seed = 사람이
 * ready 로 승격해야 진행(기존 TASK 시스템 게이트 = W-4 no-auto-exec).
 * @returns 작성된 파일 절대경로 (실패 시 null).
 */
export function materializeTaskProposal(
  env: NodeJS.ProcessEnv,
  payload: TaskSeedPayload,
): string | null {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  if (!root) return null;
  const dom = DOMAIN_MAP[payload.domain?.trim().toLowerCase()] ?? null;
  if (!dom) return null; // 미지 도메인 = 폐기 (날조 0, 추측 X)
  const id = nextTaskId(root, dom.folder, dom.prefix);
  const file = `TASK-${id}-${slugify(payload.title)}.md`;
  const abs = path.join(root, dom.folder, file);
  const body = [
    '---',
    `id: TASK-${id}`,
    'status: seed',
    'priority: normal',
    `path: [${payload.domain.trim().toLowerCase()}, agent-discovered]`,
    'tags: [agent-discovered]',
    '---',
    '',
    '## 목표',
    '',
    '> ⑦\' 자율 발굴 (사람 승인 후 머터리얼라이즈 — agent-approvals.jsonl).',
    `> 발굴 제목: "${payload.title.trim()}"`,
    '',
    '## 컨텍스트 (발굴 본문 — 검토 후 정제)',
    '',
    payload.body.trim(),
    '',
    '## 완료 조건',
    '',
    '- [ ] (검토 후 채움 — seed→ready 승격 시)',
    '',
    '## 비고',
    '',
    '- ⑦\' 발굴물. status=seed = 사람이 정제·검증 후 ready 승격해야 진행.',
    '',
  ].join('\n');
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (fs.existsSync(abs)) return abs; // 멱등 (동일 slug 재머터리얼 방지)
    fs.writeFileSync(abs, body, 'utf-8');
    return abs;
  } catch {
    return null;
  }
}

function objectivesPath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'objectives.md') : '';
}

/** 표 셀 안전화 — `|`·개행 제거(표 깨짐 방지), 길이 cap. */
function cell(s: string): string {
  return s.replace(/[\r\n|]+/g, ' ').trim().slice(0, 220) || '-';
}

/**
 * 승인된 objective 발굴 → objectives.md 표에 `proposed` 행 append.
 * **status=proposed** = 사람이 active 승격해야 cadence 픽업(parseCadence
 * Objective 는 `active` 만 매칭) = W-4 no-auto-exec / 정본 「자동 실행 X」.
 * 봇은 파일만 쓰고 *commit X* (사람이 diff 검토→승격→커밋 = 사용자 주기
 * 승인, agent-mission §2.3). 표 블록 *안*(마지막 OBJ 행 뒤)에 삽입 —
 * 뒤 prose 섹션 보존. objectives.md 부재·표 미발견 = null (정본 구조
 * 날조 X). @returns `objectives.md:OBJ-NNN` | null.
 */
export function materializeObjectiveProposal(
  env: NodeJS.ProcessEnv,
  payload: ObjectivePayload,
): string | null {
  const p = objectivesPath(env);
  if (!p || !fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const nl = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(/\r?\n/);
    const rowRe = /^\|\s*OBJ-(\d+)\s*\|/;
    let lastRow = -1;
    let maxN = 0;
    let sepIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(rowRe);
      if (m) {
        lastRow = i;
        maxN = Math.max(maxN, parseInt(m[1], 10));
      }
      if (sepIdx < 0 && /^\|\s*-{2,}\s*\|/.test(lines[i])) sepIdx = i;
    }
    const at = lastRow >= 0 ? lastRow : sepIdx;
    if (at < 0) return null; // 표 구조 미발견 = 날조 X
    const objId = `OBJ-${String(maxN + 1).padStart(3, '0')}`;
    const row =
      `| ${objId} | ${cell(payload.summary)} | ` +
      `${cell(payload.derivation)} | ${cell(payload.alignment)} | ` +
      `proposed | - | - |`;
    lines.splice(at + 1, 0, row);
    fs.writeFileSync(p, lines.join(nl), 'utf-8');
    return `objectives.md:${objId}`;
  } catch {
    return null;
  }
}

/**
 * 인박스 1회 소비: 승인(approvals.jsonl approved)된 발굴 머터리얼라이즈
 * (멱등 = materialized.jsonl). 지원 kind: `task`→seed TASK,
 * `objective`→objectives.md proposed 행 (둘 다 사람 승격 게이트 = W-4).
 * kill·미승인·미지원kind·이미처리 = skip. *블록 X* (백그라운드 자율종료).
 * env/skill/agent kind = 엔진 실행 트랙(sub-E) — 본 소비자 미처리(inert).
 * @returns 이번에 머터리얼라이즈한 건수.
 */
export async function runInboxConsumerOnce(
  env: NodeJS.ProcessEnv,
  opts: { notify?: NotifyFn } = {},
): Promise<number> {
  const notify = opts.notify ?? defaultNotify(env);
  const done = readMaterialized(env);
  let n = 0;
  const seen = new Set<string>();
  for (const e of readInboxProposals(env)) {
    if (
      (e.kind !== 'task' && e.kind !== 'objective') ||
      seen.has(e.id) ||
      done.has(e.id)
    ) {
      continue;
    }
    seen.add(e.id);
    if (!isObjectiveApproved(env, e.id)) continue; // 미승인 = inert
    const desc =
      e.kind === 'task'
        ? materializeTaskProposal(env, e.envelope.payload as TaskSeedPayload)
        : materializeObjectiveProposal(
            env,
            e.envelope.payload as ObjectivePayload,
          );
    if (!desc) {
      notify(
        `⑦' 승인 발굴 ${e.id}(${e.kind}) 머터리얼라이즈 실패 ` +
          `(도메인 미지·objectives.md 부재·IO) — 보류`,
      );
      continue;
    }
    const short = e.kind === 'task' ? path.basename(desc) : desc;
    appendMaterialized(env, e.id, short);
    appendTrace(env, {
      ts: new Date().toISOString(),
      type: 'budget',
      core: 'consumer',
      reason: `승인 머터리얼라이즈 ${e.id} (${e.kind}) → ${short}`,
    });
    notify(
      `✅ 승인 발굴 머터리얼라이즈: ${e.id} (${e.kind}) → ${short} ` +
        (e.kind === 'task'
          ? '(status:seed — 사람이 ready 승격 시 진행)'
          : '(status:proposed — 사람이 active 승격 시 cadence 픽업)'),
    );
    n++;
  }
  return n;
}
