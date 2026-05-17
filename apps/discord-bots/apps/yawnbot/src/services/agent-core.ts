/**
 * agent-core — 에이전트 *코어* 정의 로더 (KAR-018-V R-1).
 *
 * 코어⊥스킨(sub-A0): 코어 = 에이전트의 *정체·직무·경계*(누구이고 무슨
 * 일을 하는가), 스킨 = *목소리·말투·인격*(어떻게 말하는가). 기존
 * assistant-handler 는 스킨 카드만 시스템 프롬프트에 썼다 → 코어
 * 바인딩 채널에서도 그냥 스킨이 답함(동료 아님, "그냥 봇"). 본 로더가
 * `memo/.claude/agents/<coreId>/core.md` 를 읽어 코어 정체성을 회수,
 * buildSystemPrompt 가 *코어 정체 + 스킨 목소리*로 합성한다.
 *
 * 정본 = `memo/.claude/agents/<id>/core.md` (사람/팩토리가 authoring).
 * 평행정의0 — character-service.parseFrontmatter 와 동일 형식 재사용.
 */
import fs from 'fs';
import path from 'path';

export interface CoreDef {
  id: string;
  /** 한 줄 직무 (frontmatter role). */
  role: string;
  /** draft | active … (게이트 상태). */
  status: string;
  /** 기본 스킨 id (목소리 미지정 시). */
  defaultSkin: string;
  /** 디스코드 표시 이모지 (frontmatter emoji, 미지정 시 🛰 — atlas 호환). */
  emoji: string;
  /** 디스코드 표시명 (frontmatter display_name, 미지정 시 Id 캐피털). */
  displayName: string;
  /** core.md 본문 (직무/경계/에스컬레이션 등 — 정체성 상세). */
  body: string;
  frontmatter: Record<string, string>;
}

/** `emoji displayName` 합성 (디스코드 webhook username·embed author 용). */
export function coreLabel(c: CoreDef): string {
  return `${c.emoji} ${c.displayName}`.trim();
}

/** `---\n…\n---\n본문` 파싱 (character-service 와 동일 규약). */
function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw.trim() };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (key) data[key] = val;
  }
  return { data, body: m[2].trim() };
}

const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * 코어 정의 로드. 부재·형식이상·잘못된 id = null (caller=레거시 스킨
 * 단독 경로로 graceful fallback). spawn LLM 아닌 *어댑터*가 fs 읽음.
 */
export function loadCoreDef(memoRoot: string, coreId: string): CoreDef | null {
  const root = (memoRoot || '').trim();
  const id = (coreId || '').trim();
  if (!root || !SAFE_ID.test(id)) return null;
  try {
    const p = path.join(root, '.claude', 'agents', id, 'core.md');
    if (!fs.existsSync(p)) return null;
    const { data, body } = parseFrontmatter(fs.readFileSync(p, 'utf-8'));
    if (!body) return null;
    const resolvedId = data.id?.trim() || id;
    return {
      id: resolvedId,
      role: data.role?.trim() || '',
      status: data.status?.trim() || 'draft',
      defaultSkin: data.default_skin?.trim() || '',
      emoji: data.emoji?.trim() || '🛰',
      displayName:
        data.display_name?.trim() ||
        resolvedId.charAt(0).toUpperCase() + resolvedId.slice(1),
      body,
      frontmatter: data,
    };
  } catch {
    return null;
  }
}

/**
 * `memo/.claude/agents/<id>/core.md` 가 있는 코어 id 전부 (정렬). 복수
 * 동료(KAR-018-V R-4) — 하드코딩 단일 'atlas' 폐기, 디렉토리가 정본.
 */
export function listCoreIds(memoRoot: string): string[] {
  const root = (memoRoot || '').trim();
  if (!root) return [];
  try {
    const dir = path.join(root, '.claude', 'agents');
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          SAFE_ID.test(e.name) &&
          fs.existsSync(path.join(dir, e.name, 'core.md')),
      )
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * 발굴물 → 담당 코어 id (KAR-018-V R-4 도메인 라우팅, 결정적·순수).
 *
 * 규칙 (우선순위):
 *  1. `explicitCoreId` 가 알려진 코어면 그대로 (skill/agent payload 의
 *     이미 authoring 된 의도 존중).
 *  2. 도메인/텍스트가 yawnbot·디스코드 마커를 담고 'echo' 코어 존재 →
 *     'echo' (콘텐츠/경험 동료).
 *  3. 그 외 = 'atlas' (존재 시) — *기존 전량 atlas 행동 보존 (회귀 0)*.
 *  4. atlas 도 없으면 첫 코어 id, 그것도 없으면 'atlas' 문자열.
 *
 * 도메인 마커 = TASK-SCHEMA 도메인 prefix 'yb' / yawnbot·discord-bots
 * 경로. atlas 가 default 라 *yb/디스코드 발굴만* echo 로 재라우팅된다.
 */
export function resolveProposalCore(
  knownCoreIds: string[],
  hint: { domain?: string; explicitCoreId?: string; text?: string },
): string {
  const known = new Set(knownCoreIds);
  const explicit = (hint.explicitCoreId || '').trim();
  if (explicit && known.has(explicit)) return explicit;

  const domain = (hint.domain || '').trim().toLowerCase();
  const text = (hint.text || '').toLowerCase();
  const isYawnDomain =
    domain === 'yb' ||
    /\byb\b/.test(domain) ||
    /yawnbot|discord-bots|apps\/discord-bots|디스코드 봇|욘봇/.test(text);
  if (isYawnDomain && known.has('echo')) return 'echo';

  if (known.has('atlas')) return 'atlas';
  return knownCoreIds.length > 0 ? knownCoreIds[0] : 'atlas';
}
