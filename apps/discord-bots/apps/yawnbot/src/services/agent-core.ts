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
  /** 검증 후 core.md frontmatter 에 누적된 자기 스킬 id 목록. */
  skills: string[];
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

/** frontmatter inline list (`[]`, `[a, b]`) 파서. 알 수 없는 형식은 빈 배열. */
export function parseCoreSkills(raw: string | undefined): string[] {
  const text = (raw || '').trim();
  if (!text || text === '[]') return [];
  const m = text.match(/^\[(.*)\]$/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => SAFE_ID.test(s));
}

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
      skills: parseCoreSkills(data.skills),
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
 * 단일 #team-bus 다중 코어 *이름지정 라우팅* (KAR-018-V R-4-i2,
 * 결정적·순수). 사용자가 동료를 *이름으로 부르면* 그 코어가 답한다 —
 * "명명 코어 N"의 자연스러운 실현 (cadence 무관, 사용자 직접 검증 가능).
 *
 * 매칭 = 텍스트가 `@?<핸들><구분자><나머지>` 로 시작. 핸들 = 코어 id
 * 또는 displayName (대소문자·@ 무시). 미지정·미지 핸들·나머지 없음 →
 * null (호출자가 채널 바인딩 코어 그대로 = 회귀 0). 반환 text = 호칭
 * prefix 제거 (모델이 "echo," 를 내용으로 오인 X).
 */
export function resolveAddressedCore(
  text: string,
  cores: { id: string; displayName: string }[],
): { coreId: string; text: string } | null {
  const t = (text || '').trim();
  const m = t.match(/^@?([\p{L}\p{N}._-]{1,32})\s*[,:]?\s+([\s\S]+)$/u);
  if (!m) return null;
  const handle = m[1].toLowerCase();
  const rest = m[2].trim();
  if (!rest) return null;
  for (const c of cores) {
    if (
      handle === c.id.toLowerCase() ||
      handle === c.displayName.toLowerCase()
    ) {
      return { coreId: c.id, text: rest };
    }
  }
  return null;
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

  const isWmDomain =
    domain === 'wm' ||
    /\bwm\b/.test(domain) ||
    /witch.*mendokusai|위치.*멘도쿠사이|witch-mendokusai/.test(text);
  if (isWmDomain && known.has('wm-scout')) return 'wm-scout';

  if (known.has('atlas')) return 'atlas';
  return knownCoreIds.length > 0 ? knownCoreIds[0] : 'atlas';
}

// ── KAR-018-Z: 코어 work-memory 생명주기 (코어층 소유, 스킨 잡담과 별개) ──
// 형식 = discoveries jsonl 정본 재사용(평행정의0): memo/.claude/agents/
// <id>/mem/<YYYY-MM-DD>.jsonl. append(작업·결과 누적) + read(코어 정체·
// 대화에 자기 기억 주입 = non-dead). 코어가 세션·재기동 넘어 *기억·학습*.

export interface CoreMemEntry {
  ts: string;
  session: string;
  type: 'discovery' | 'decision' | 'fix' | 'fail' | 'insight';
  topic: string;
  summary: string;
}

function coreMemDir(root: string, coreId: string): string | null {
  const r = (root || '').trim();
  const id = (coreId || '').trim();
  if (!r || !SAFE_ID.test(id)) return null;
  return path.join(r, '.claude', 'agents', id, 'mem');
}

/** `mem/<YYYY-MM-DD>.jsonl` 절대경로 (KST 일자). 부적합 = null. */
export function coreMemPath(
  memoRoot: string,
  coreId: string,
  date?: Date,
): string | null {
  const dir = coreMemDir(memoRoot, coreId);
  if (!dir) return null;
  const d = date ?? new Date();
  const ymd = new Date(d.getTime() + 9 * 3600 * 1000) // KST
    .toISOString()
    .slice(0, 10);
  return path.join(dir, `${ymd}.jsonl`);
}

/**
 * 코어 mem 1 entry append (best-effort·날조 X). ts 미지정 시 now.
 * 부적합 id·IO 실패 = false (비차단 — 기억 실패가 작업을 막지 X).
 */
export function appendCoreMemory(
  memoRoot: string,
  coreId: string,
  entry: Omit<CoreMemEntry, 'ts'> & { ts?: string },
): boolean {
  const p = coreMemPath(memoRoot, coreId);
  if (!p) return false;
  const rec: CoreMemEntry = {
    ts: entry.ts || new Date().toISOString(),
    session: entry.session || 'agent',
    type: entry.type,
    topic: String(entry.topic || '').slice(0, 80),
    summary: String(entry.summary || '').slice(0, 400),
  };
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(rec) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * 코어의 최근 mem entry → 프롬프트용 압축 블록 (순수·바운드). mem/
 * *.jsonl 파일 일자 오름차순, 전체에서 최신 `max`개 → `- [type] topic:
 * summary`. 부재·부적합 = '' (섹션 생략). 코어 정체/대화에 주입되어
 * "자기 최근 작업·결과를 기억"하게 함(Z-2 first-use).
 */
export function readRecentCoreMemory(
  memoRoot: string,
  coreId: string,
  max = 8,
): string {
  const dir = coreMemDir(memoRoot, coreId);
  if (!dir) return '';
  try {
    if (!fs.existsSync(dir)) return '';
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .sort(); // 일자 오름차순
    const entries: CoreMemEntry[] = [];
    for (const f of files) {
      for (const line of fs
        .readFileSync(path.join(dir, f), 'utf-8')
        .split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try {
          const e = JSON.parse(t) as CoreMemEntry;
          if (e && e.type && e.summary) entries.push(e);
        } catch {
          /* 손상 라인 폐기 */
        }
      }
    }
    if (entries.length === 0) return '';
    return entries
      .slice(-Math.max(1, max))
      .map(
        (e) =>
          `- [${e.type}] ${String(e.topic || '').slice(0, 60)}: ${String(
            e.summary || '',
          ).slice(0, 200)}`,
      )
      .join('\n')
      .slice(0, 1400);
  } catch {
    return '';
  }
}
