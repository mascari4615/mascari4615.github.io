/**
 * proposal — ⑦' 생산자 발굴물 엔벨로프 + 결정적 라우터 (KAR-018-W slice-1).
 *
 * 그릴-락:
 *  W-2 = 판별 union `{kind, payload}`. payload = 기존 엔진 입력 shape
 *        (ProposalMeta/SkillProposal/AgentSpec) 재사용 → 평행정의0.
 *  W-4 = 발굴물은 seed TASK / proposed objective 까지만 (no-auto-exec).
 *
 * substrate-순수 (governance/self-* 형제, Discord/git/karmolab-ai 0).
 * 발굴 LLM 출력(JSON 문자열)을 *검증된* 엔벨로프로만 통과 — 형식오류·
 * kind 미지·payload 필수필드 누락 = null (DGM 동형, 날조 0). 실 LLM 호출·
 * 엔진 디스패치 = 어댑터(slice-2).
 */
import type { ProposalMeta } from './self-improve';
import type { SkillProposal } from './self-skill';
import type { AgentSpec } from './agent-factory';

export type ProposalKind = 'env' | 'skill' | 'agent' | 'task' | 'objective';

/** task-new seed 입력 (objectives.md self-tasking ② 작업단위). */
export interface TaskSeedPayload {
  title: string;
  body: string;
  /** 도메인 prefix (kar/wm/kl/yb/...). */
  domain: string;
}

/** objectives.md proposed 행 입력 (self-tasking ② 목표단위). */
export interface ObjectivePayload {
  summary: string;
  derivation: string;
  alignment: string;
}

export type ProposalEnvelope = (
  | { kind: 'env'; payload: ProposalMeta }
  | { kind: 'skill'; payload: SkillProposal }
  | { kind: 'agent'; payload: AgentSpec }
  | { kind: 'task'; payload: TaskSeedPayload }
  | { kind: 'objective'; payload: ObjectivePayload }
) & {
  /**
   * 이 발굴이 전진시키는 팀 포트폴리오 projectId (TASK-KAR-018-LT 기둥1).
   * 정책 게이트(runProducerOnce)가 team-portfolio 와 대조 — 미수렴 거부.
   * payload shape(재사용 엔진입력) 미오염 위해 *엔벨로프 최상위*.
   */
  projectId?: string;
};

export type RouteTarget =
  | 'self-improve'
  | 'self-skill'
  | 'agent-factory'
  | 'task-new'
  | 'objectives';

const ROUTE: Record<ProposalKind, RouteTarget> = {
  env: 'self-improve',
  skill: 'self-skill',
  agent: 'agent-factory',
  task: 'task-new',
  objective: 'objectives',
};

/** kind → 결정적 라우팅 타겟 (순수). */
export function routeProposal(env: ProposalEnvelope): RouteTarget {
  return ROUTE[env.kind];
}

function str(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}
function arr(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/** kind 별 payload 필수필드 검증 (누락=거부 → null, 날조 0). */
function payloadValid(kind: ProposalKind, p: Record<string, unknown>): boolean {
  switch (kind) {
    case 'env':
      return str(p.id) && str(p.summary) && arr(p.targetFiles) && str(p.source);
    case 'skill':
      return str(p.id) && str(p.name) && str(p.summary) && str(p.source) && str(p.coreId);
    case 'agent':
      return str(p.id) && str(p.coreId) && str(p.role) && str(p.name) && str(p.source);
    case 'task':
      return str(p.title) && str(p.body) && str(p.domain);
    case 'objective':
      return str(p.summary) && str(p.derivation) && str(p.alignment);
  }
}

const KINDS: ReadonlySet<string> = new Set<ProposalKind>([
  'env',
  'skill',
  'agent',
  'task',
  'objective',
]);

/**
 * 발굴 LLM 출력(JSON 문자열) → 검증된 ProposalEnvelope | null.
 * 파싱 실패 / kind 미지 / payload 누락 = null (부분·미상 거부, 날조 0).
 * LLM 이 코드펜스로 감싸는 경우 대비 ```json … ``` 추출.
 */
export function parseProposalEnvelope(raw: string): ProposalEnvelope | null {
  if (!str(raw)) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== 'object') return null;

  const o = obj as Record<string, unknown>;
  const kind = o.kind;
  if (typeof kind !== 'string' || !KINDS.has(kind)) return null;
  const payload = o.payload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  // KAR-018-Y 회귀 근본 (차분 실증): buildDiscoveryPrompt 가 본문 필드를
  // *불릿*으로 요구 → 모델이 string[] 반환하는데 payloadValid 는 문자열
  // 요구 → NULL 폐기(프롬프트↔파서 계약 드리프트). 계약 일치 = 알려진
  // 자유텍스트 필드가 string[] 이면 줄바꿈 join 으로 정규화(프롬프트가
  // 시키는 형식을 파서가 수용). env.targetFiles(배열 정당)는 미접촉.
  const p = payload as Record<string, unknown>;
  for (const k of ['summary', 'derivation', 'alignment', 'body', 'role'] as const) {
    const v = p[k];
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string')) {
      p[k] = (v as string[]).map((s) => s.trim()).filter(Boolean).join('\n');
    }
  }
  if (!payloadValid(kind as ProposalKind, p)) {
    return null;
  }
  // LT-2: projectId 는 *엔벨로프 최상위* 선택 필드. 파서는 추출만(정책
  // 거부 X — 순수 유지). 미수렴 거부 = runProducerOnce 정책 게이트.
  const projectId =
    typeof o.projectId === 'string' && o.projectId.trim()
      ? o.projectId.trim()
      : undefined;
  return { kind, payload: p, projectId } as unknown as ProposalEnvelope;
}

/**
 * 발굴물 결정적 id — 같은 엔벨로프 = 같은 id (사람 승인 매칭 키).
 * substrate-순수 유지를 위해 crypto 미사용(FNV-1a 32bit; 보안 아님,
 * 인박스↔approvals 매칭용 안정 식별자). 키 정렬 canonical JSON.
 */
export function proposalId(env: ProposalEnvelope): string {
  const canon = (v: unknown): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(',')}}`;
  };
  const s = `${env.kind}|${canon(env.payload)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `p${h.toString(16).padStart(8, '0')}`;
}

/**
 * LT-8: 팀 숙의 verdict='adopt-mods'(수정 채택) → 합의 수정안을 *새*
 * 제안 엔벨로프로 실체화 (순수·결정적, 날조 0 — modNote = 팀 CONVERGE
 * 턴의 *실제* 출력이며 새 내용 발명 X). 원 엔벨로프 deep clone + 그 kind
 * 의 사람가독 필드에 수정 주석 주입 → payload 변화 → proposalId 변화 →
 * 별개 카드(dedup 미충돌). 사람 승인 게이트 불변 — 거버넌스 결정
 * (2026-05-18, AskUserQuestion): 팀 verdict 는 사람 ✅/❌ 를 *대체 X*,
 * 합의 수정안을 새 카드로 올려 동료이 결정. modNote 빈값/clone 실패 =
 * null(억지 카드 X). 평행 파이프 0 — publishEnvelope 가 게시.
 */
export function buildModifiedEnvelope(
  original: ProposalEnvelope,
  modNote: string,
): ProposalEnvelope | null {
  const note = (modNote || '').replace(/\s+/g, ' ').trim();
  if (!note || !original || typeof original !== 'object') return null;
  let cloned: ProposalEnvelope;
  try {
    cloned = JSON.parse(JSON.stringify(original)) as ProposalEnvelope;
  } catch {
    return null;
  }
  const p = cloned.payload as unknown as Record<string, unknown>;
  if (!p || typeof p !== 'object') return null;
  const tag = `[팀 수정안] ${note}`;
  const inject = (k: string): void => {
    const prev = typeof p[k] === 'string' ? (p[k] as string).trim() : '';
    p[k] = (prev ? `${prev}\n\n${tag}` : tag).trim();
  };
  switch (cloned.kind) {
    case 'objective':
      inject('derivation');
      break;
    case 'task':
      inject('body');
      break;
    case 'env':
    case 'skill':
      inject('summary');
      break;
    case 'agent':
      inject('role');
      break;
  }
  // 동일 modNote 재주입 = 동일 payload(멱등) → 같은 pid (재숙의 폭주 0).
  return cloned;
}
