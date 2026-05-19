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
import type { AgentSpec } from './agent-factory';
import { loadPortfolio, validateProjectCitation } from './team-portfolio';
import {
  appendTrace,
  defaultNotify,
  isObjectiveApproved,
  type NotifyFn,
} from './governance-adapter';

/** 발굴 LLM 호출 (DI — generateAssistantText 'claude-cli' 래퍼 주입). */
export type DiscoverFn = () => Promise<string>;

/**
 * 발굴 가시화 seam (KAR-018-V) — substrate-clean 최소 shape (Discord 무관).
 * main.ts 가 명명 에이전트 카드+스레드 렌더러(agent-bus)를 주입.
 * 미주입이면 no-op (기존 동작 보존 — graceful).
 */
export type ProposalAnnouncer = (a: {
  id: string;
  target: RouteTarget;
  kind: ProposalEnvelope['kind'];
  envelope: ProposalEnvelope;
}) => void | Promise<void>;
let _announcer: ProposalAnnouncer | null = null;
export function setProposalAnnouncer(fn: ProposalAnnouncer | null): void {
  _announcer = fn;
}

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

  // LT-2 북극성 게이트: 모든 발굴은 팀 포트폴리오 projectId 하나로
  // 수렴해야 한다(D3 영구기관 근본 — "어디에도 안 붙는 일" 차단).
  // 단 *pre-rollout graceful*: 포트폴리오 정본 미배포(projects 0)면
  // 게이트 skip(하드 outage 0, 코드베이스 degraded-not-hang 정합·회귀0).
  // 정본 존재 시에만 미수렴 발굴 거부 = no-project (parse-fail 동형 폐기).
  const portfolio = loadPortfolio(deps.env.MEMO_REPO_PATH?.trim() || '');
  if (portfolio.projects.length > 0) {
    const cite = validateProjectCitation(
      portfolio,
      envelope.projectId || '',
    );
    if (!cite.ok) {
      appendTrace(deps.env, {
        ts: new Date().toISOString(),
        type: 'drift',
        core: 'producer',
        reason: `발굴 projectId 미수렴 — 폐기 (${cite.reason})`,
      });
      notify(
        `⑦' 발굴 폐기 — 팀 북극성 미수렴 (${cite.reason}). ` +
          '모든 제안은 포트폴리오 projectId 하나를 cite 해야 함.',
      );
      return 'no-project';
    }
  }

  // 게시(dedup→route→dispatch→카드→trace) = publishEnvelope 단일 substrate.
  return publishEnvelope(deps, envelope);
}

/**
 * 검증된 엔벨로프 1건을 인박스+명명에이전트 카드로 게시 (substrate —
 * runProducerOnce 꼬리 추출, 평행 파이프 0). LT-8 의 *수정 채택→새 카드*
 * 도 이 한 경로를 재사용(별 게시 파이프 신설 X = substrate-first ⓑ).
 *
 *  · dedup: 같은 pid(=같은 payload) 이미 인박스면 재게시 X (거절/대기/
 *    승인 무관, KAR-042/038). adopt-mods 멱등 → 재숙의 폭주 0.
 *  · route→dispatch: no-auto-exec(인박스/seed/엔진게이트까지만).
 *  · _announcer: 카드+스레드 best-effort(가시층 실패 ≠ 파이프 실패).
 *
 * projectId 북극성 게이트는 *호출자* 책임 — producer=신규 발굴이라
 * runProducerOnce 가 선검사 / adopt-mods=원 제안이 이미 통과(재검 불요).
 * 반환 = RouteTarget | 'duplicate' | 'no-dispatch'.
 */
export async function publishEnvelope(
  deps: ProposalProducerDeps,
  envelope: ProposalEnvelope,
): Promise<string> {
  const notify = deps.notify ?? defaultNotify(deps.env);
  const pid = proposalId(envelope);
  const seenIds = new Set(readInboxProposals(deps.env).map((e) => e.id));
  if (seenIds.has(pid)) {
    appendTrace(deps.env, {
      ts: new Date().toISOString(),
      type: 'drift',
      core: 'producer',
      reason: `중복 발굴 dedup — 이미 인박스, 재게시 X [${pid}]`,
    });
    notify(
      `⑦' 중복 제안 dedup — 이미 인박스(거절/대기/승인 무관), 재게시 안 함 [${pid}]`,
    );
    return 'duplicate';
  }

  const target = routeProposal(envelope);
  const fn = deps.dispatch[target];
  if (!fn) {
    notify(`⑦' ${envelope.kind}→${target} 디스패치 미배선 — 보류`);
    return 'no-dispatch';
  }

  await fn(envelope); // no-auto-exec: dispatch=인박스/seed/엔진게이트까지만
  // KAR-018-V: 명명 에이전트 카드+스레드 게시 (사람 팔로업 가시층).
  // best-effort — 게시 실패가 발굴 파이프 비차단 (Discord 어댑터는 main).
  if (_announcer) {
    try {
      await _announcer({ id: pid, target, kind: envelope.kind, envelope });
    } catch {
      /* 가시층 실패 ≠ 발굴 실패 (graceful) */
    }
  }
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

/**
 * 발굴 LLM 이 쓰는 자유어 도메인 → 정식 prefix 정규화 (KAR-018-V fix).
 * 버그: LLM 이 "yawnbot"/"karmolab"/"witch" 식으로 써서 정확키 매칭
 * 실패 → 승인했는데 TASK 0 생성(결정 증발). *절대 null 아님* —
 * 미지는 kar(umbrella 메타)로 안착(seed 라 사람이 재분류, 무손실).
 */
const DOMAIN_ALIAS: Record<string, string> = {
  wm: 'wm', witch: 'wm', witchmendokusai: 'wm', mendokusai: 'wm',
  unity: 'wm', game: 'wm',
  kl: 'kl', karmolab: 'kl', karmo: 'kl', tauri: 'kl', lab: 'kl',
  yb: 'yb', yawnbot: 'yb', yawn: 'yb', bot: 'yb', discord: 'yb',
  life: 'life', hobby: 'hobby',
  learn: 'learn', learning: 'learn',
  kar: 'kar', umbrella: 'kar', meta: 'kar', infra: 'kar', memo: 'kar',
  dotfiles: 'kar', 'agent-team': 'kar', agent: 'kar', agents: 'kar',
};
function resolveDomain(raw: string | undefined): {
  key: string;
  folder: string;
  prefix: string;
} {
  const norm = (raw ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  const key =
    DOMAIN_ALIAS[norm] ??
    DOMAIN_ALIAS[norm.replace(/-/g, '')] ??
    'kar'; // 미지 = 메타 버킷 (결정 무손실 — 증발 X)
  return { key, ...DOMAIN_MAP[key] };
}

/**
 * TASK id(`TASK-<PREFIX>-…`) → 후보 TASK 폴더(memo 상대) 목록.
 * prefix 매칭 폴더를 앞에, 나머지 폴더를 뒤에 (미지 prefix·교차배치
 * 견고). DOMAIN_MAP 단일정본 재사용 — 평행정의0 (mission §원칙 4).
 * TASK-KAR-018-THR: task↔thread 영속 매핑(task-thread-link)이 소비.
 */
export function taskFoldersForId(taskId: string): string[] {
  const all = Object.values(DOMAIN_MAP).map((d) => d.folder);
  const m = taskId.match(/^TASK-([A-Z]{2,6})-/);
  if (!m) return all;
  const pref = m[1];
  const hit = Object.values(DOMAIN_MAP)
    .filter((d) => d.prefix === pref)
    .map((d) => d.folder);
  return hit.length
    ? [...hit, ...all.filter((f) => !hit.includes(f))]
    : all;
}

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

// ── KAR-018-Y-2: 거절 이력 학습 (resolved 원장 = 제안 substrate) ──
// 평행정의0: 결정-잠금 원장 경로 정본을 substrate(여기)로 단일화.
// agent-bus `proposalResolvedPath` 가 본 함수에 위임(Discord 어댑터가
// 소유하던 것을 substrate 로 승격 — getResolved/markResolved 는 본
// 경로 재사용). 형식 = `{ts,id,decision}` 줄, id 별 *최신* 결정 유효.
export function resolvedLedgerPath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root
    ? path.join(root, '.claude', 'agent-proposal-resolved.jsonl')
    : '';
}

/** 최신 결정이 `rejected` 인 발굴 id 집합 (순수). 사장 명시 거부 = 학습 신호. */
export function readRejectedProposalIds(env: NodeJS.ProcessEnv): Set<string> {
  const p = resolvedLedgerPath(env);
  const out = new Set<string>();
  if (!p || !fs.existsSync(p)) return out;
  try {
    const latest = new Map<string, string>(); // id → 최신 decision
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const e = JSON.parse(t);
      if (e && typeof e.id === 'string' && typeof e.decision === 'string') {
        latest.set(e.id, e.decision);
      }
    }
    for (const [id, dec] of latest) if (dec === 'rejected') out.add(id);
  } catch {
    /* best-effort */
  }
  return out;
}

/**
 * 거절된 발굴 → discover 프롬프트용 "사장이 거절함, 반복 X" 컨텍스트
 * 블록 (순수·바운드). resolved(rejected) ⨝ inbox 엔벨로프로 제목 회수.
 * 거절 0 = '' (섹션 생략). gatherDiscoveryContext 의 거절-전용 신호
 * (기존 '최근 인박스' 는 단순 최근 — 거절=사장 명시 거부, 더 강한 학습).
 */
export function summarizeRejectedForDiscovery(
  env: NodeJS.ProcessEnv,
): string {
  const rejected = readRejectedProposalIds(env);
  if (rejected.size === 0) return '';
  const byId = new Map<string, ProposalInboxEntry>();
  for (const e of readInboxProposals(env)) {
    if (rejected.has(e.id)) byId.set(e.id, e); // 최신 엔트리 유효
  }
  const lines: string[] = [];
  for (const e of byId.values()) {
    const pl = (e.envelope?.payload ?? {}) as Record<string, unknown>;
    const t =
      (typeof pl.title === 'string' && pl.title) ||
      (typeof pl.summary === 'string' && pl.summary) ||
      (typeof pl.name === 'string' && pl.name) ||
      e.id;
    lines.push(`- ${e.kind}: ${String(t).slice(0, 90)}`);
    if (lines.length >= 12) break;
  }
  return lines.join('\n').slice(0, 1400);
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
  // 별칭 정규화 — 미지여도 kar 안착(승인 결정 증발 X, KAR-018-V fix).
  const dom = resolveDomain(payload.domain);
  const id = nextTaskId(root, dom.folder, dom.prefix);
  const file = `TASK-${id}-${slugify(payload.title)}.md`;
  const abs = path.join(root, dom.folder, file);
  const body = [
    '---',
    `id: TASK-${id}`,
    'status: seed',
    'priority: normal',
    `path: [${dom.key}, agent-discovered]`,
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

// ── KAR-018-V R-4-i3a: 승인된 새 코어 머터리얼라이즈 ─────────────
// factory(evaluateAgentSpec)=valid∧무충돌∧dry-run → escalate(④사람승인).
// ✅ 승인 후 *실제 core.md 생성* 이 부재했음(line "agent kind inert").
// 본 함수가 그 갭 = "팀이 팀을 만든다"(README 도그푸딩). 단 **status:
// draft 만** — active 전이·바인딩은 별도 사람 게이트(agent-factory-
// adapter 불변식: "활성화 = 사람 승인 후 별도"). 멱등 + *기존 코어
// 절대 비덮어쓰기*(atlas/echo/선행 머터리얼 보존).

const SAFE_CORE_ID = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * 승인된 agent 발굴 → `memo/.claude/agents/<coreId>/core.md` **Draft**
 * + `mem/README.md` 작성. atlas/echo core.md 구조 mirror(평행정의0,
 * loadCoreDef 가 읽는 frontmatter+body). status:draft 고정(절대 active
 * X — 활성/바인딩=별도 사람 게이트). coreId 부적합·불완전 spec = null
 * (날조 X). 기존 core.md 존재 = 멱등 skip(반환만 — *덮어쓰기 X*).
 * @returns `.claude/agents/<coreId>/core.md` (rel) | null.
 */
export function materializeAgentProposal(
  env: NodeJS.ProcessEnv,
  payload: AgentSpec,
): string | null {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  if (!root) return null;
  const coreId = (payload.coreId || '').trim();
  const role = (payload.role || '').trim();
  const name = (payload.name || '').trim();
  // factory specComplete 와 동근(평행정의0): 불완전·부적합 = 결정 증발 X·날조 X
  if (!SAFE_CORE_ID.test(coreId) || !role || !name) return null;
  const relCore = path.join('.claude', 'agents', coreId, 'core.md');
  const absCore = path.join(root, relCore);
  try {
    if (fs.existsSync(absCore)) return relCore; // 멱등 — *기존 코어 비덮어쓰기*
    const display =
      name || coreId.charAt(0).toUpperCase() + coreId.slice(1);
    const src = (payload.source || '').trim() || '⑦\' 자율 발굴';
    // 워커 판별자 pass-through (KAR-018-X). 없으면 무출력 = 기존 byte-identical.
    const kind = (payload.kind || '').trim();
    const domain = (payload.domain || '').trim().toUpperCase();
    const machine = (payload.machine || '').trim();
    const isWorker = kind === 'worker';
    const extraFm = [
      ...(kind ? [`kind: ${kind}`] : []),
      ...(domain ? [`domain: ${domain}`] : []),
      ...(machine ? [`machine: ${machine}`] : []),
    ];
    const dutyBullets = isWorker
      ? [
          `- ${role}`,
          `- ⑦(2) 소비자: 자기 도메인(${domain}) ready/seed TASK 를 pull→claim→tier3 실행→#team-bus 자기목소리 보고. autopilot 안전 룰셋(자기 worktree·Draft PR only).`,
          `- 출처(발굴): ${src}`,
        ]
      : [
          `- ${role}`,
          `- 자율 작업 발굴(⑦'): 조사→적용성→**task-new seed / (b)objective 제안**으로만 산출. 직접 main 변경 X.`,
          `- 출처(발굴): ${src}`,
        ];
    const core = [
      '---',
      `id: ${coreId}`,
      `role: ${role}`,
      'tools: [Read, Write, Edit, Glob, Grep, Bash(git status/log/diff/add/commit/branch/checkout), TASK, task-new, WebSearch, WebFetch]',
      'skills: []',
      'work_memory: ./mem/',
      'default_skin: alisa',
      'emoji: 🤖',
      `display_name: ${display}`,
      'status: draft',
      ...extraFm,
      '---',
      '',
      `# ${coreId}`,
      '',
      `> 팩토리(⑤)가 머터리얼라이즈한 코어 (KAR-018-V R-4-i3a — "팀이 팀을 만든다"). \`id: ${coreId}\` = 기능 핸들(내부). 디스코드 표시명·말투는 *스킨*(기본 \`alisa\`, 독립 스왑 — 사용자 redirect 가능)이 결정. \`emoji 🤖\`·\`default_skin\` 은 보수 default — 검토 시 조정.`,
      '',
      '## 직무',
      '',
      ...dutyBullets,
      '',
      '## 경계 / 금지 (④ 거버넌스)',
      '',
      '- **destructive 금지**: merge / master·main push / force-push / 다른 세션 영역 침범. 산출 = feature 브랜치 + Draft PR 까지만.',
      '- **검증 게이트 준수**: 환경 변경 = ②(compile/test/CI/hook + 회귀 베이스라인). 자기 스킬 = ②\'(행동평가 셋). 통과분만 archive·승격.',
      '- **목표 정렬**: 모든 작업은 ⑥(a) `agent-mission.md` 대비 정렬. 미션 없는 자율 진행 시 #team-bus 에 정렬 불확실 표면화.',
      '- **예산**: ④ 런타임 예산 reserve→evaluate 준수. 초과 시 narrow/escalate/stop.',
      '- **도메인 경계**: 자기 직무 밖(타 코어 영역) 침범 전 #team-bus 표면화.',
      '',
      '## 에스컬레이션',
      '',
      '- 위험액션(risk-tag) / 새 코어 생성 / 미션 해석 모호 → **#team-bus 승인 대기** (state-managed interrupt, 사람·!kill 최우선).',
      '- 피어 이견(타 코어와 도메인 경계·접근 충돌) → 즉시 행동 X, #team-bus 표면화 (해소 룰 = sub-D).',
      '',
      '## 상태',
      '',
      '`status: draft` — ⑤ 팩토리가 spec 검증(②)+사람 승인(④) 후 머터리얼라이즈한 Draft. **active 전이·채널 바인딩은 별도 사람 게이트**(자동 활성화 절대 X — agent-factory-adapter 불변식). atlas/echo 와 동형으로 첫 사용처에서 검토·승격.',
      '',
    ].join('\n');
    fs.mkdirSync(path.dirname(absCore), { recursive: true });
    fs.writeFileSync(absCore, core, 'utf-8');
    const memReadme = path.join(root, '.claude', 'agents', coreId, 'mem', 'README.md');
    if (!fs.existsSync(memReadme)) {
      fs.mkdirSync(path.dirname(memReadme), { recursive: true });
      fs.writeFileSync(
        memReadme,
        [
          `# ${coreId} — work-memory`,
          '',
          `코어 \`${coreId}\` 의 work-memory. **코어 층 소유** (스킨 \`characters/<slug>/memory/\` = 봇 MemoryService 소유, 별개).`,
          '',
          '- 형식 = discoveries jsonl 재사용 (정본 `memo/.claude/discoveries/README.md`). 누적 raw append → 세션-end digest.',
          '- 팩토리(⑤)가 머터리얼라이즈한 Draft 코어 (KAR-018-V R-4-i3a). 첫 entry = active 승격·실작업 진입 시 (현재 빈 상태 정상).',
          '',
        ].join('\n'),
        'utf-8',
      );
    }
    return relCore;
  } catch {
    return null;
  }
}

/**
 * 인박스 1회 소비: 승인(approvals.jsonl approved)된 발굴 머터리얼라이즈
 * (멱등 = materialized.jsonl). 지원 kind: `task`→seed TASK,
 * `objective`→objectives.md proposed 행, `agent`→`.claude/agents/
 * <id>/core.md` **Draft** (전부 사람 승격/활성 게이트 = W-4·불변식).
 * kill·미승인·미지원kind·이미처리 = skip. *블록 X* (백그라운드 자율종료).
 * env/skill kind = 엔진 실행 트랙(sub-E) — 본 소비자 미처리(inert).
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
      (e.kind !== 'task' && e.kind !== 'objective' && e.kind !== 'agent') ||
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
        : e.kind === 'agent'
          ? materializeAgentProposal(env, e.envelope.payload as AgentSpec)
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
    const short = e.kind === 'objective' ? desc : path.basename(desc);
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
          : e.kind === 'agent'
            ? '(core.md status:draft — active 전이·바인딩은 별도 사람 게이트)'
            : '(status:proposed — 사람이 active 승격 시 cadence 픽업)'),
    );
    n++;
  }
  return n;
}
