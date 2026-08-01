// 공유 프로젝트 상태 = 팀의 *북극성* (TASK-KAR-018-LT 기둥1).
//
// 발단 진단 D2/D3: cadence 가 무상태 emit → "팀이 함께 미는 프로젝트"가
// 코드에 없어 자가정비 영구기관. 본 모듈이 그 결손을 메운다 — 모든
// proposal/objective 는 *어느 프로젝트의 무엇을 전진시키는가* 를 cite 해야
// 하고, "전진"은 PR 수가 아니라 progressLog delta 로 측정된다.
//
// 정본 = memo/.claude/team-portfolio.json (머신). 렌더 .md 는 파생 투영
// (active-sessions 라이브-투영 패턴 재사용 — 새 시각 패러다임 0).
// 형식·IO 규약 = agent-decisions.ts 와 동일(순수 코어 + best-effort IO,
// 평행정의 0). 사용자 결정(AskUserQuestion): 포트폴리오 다중목표, 으뜸 WM.
import fs from 'fs';
import path from 'path';

export interface ProgressEntry {
  ts: string;
  projectId: string;
  /** 무엇이 전진했는가 (사람 평이체 한 줄). */
  delta: string;
  /** 증거 (PR/commit/관측 — 날조 방지 anchor). */
  evidence: string;
}

export interface CurrentObjective {
  text: string;
  openedTs: string;
  /** deliberation 이 호스팅되는 thread 키 (TASK id 또는 objective id). */
  deliberationThreadId?: string;
}

export interface PortfolioProject {
  id: string;
  title: string;
  /** 이 프로젝트가 향하는 단 하나의 별 (사용자 영역 — 코드가 임의변경 X). */
  northStar: string;
  /** 틱 라우팅 가중치 (클수록 우선). 으뜸 WM 최대. */
  weight: number;
  status: 'active' | 'paused' | 'done';
  /** 도구적(자가정비류) — 반드시 weight 제한 + 명시. 영구기관 차단. */
  instrumental?: boolean;
  currentObjective?: CurrentObjective;
  progressLog: ProgressEntry[];
}

export interface Portfolio {
  projects: PortfolioProject[];
}

export function portfolioPath(memoRoot: string): string {
  return path.join(memoRoot, '.claude', 'team-portfolio.json');
}

const EMPTY: Portfolio = { projects: [] };

function clampWeight(n: unknown): number {
  const v = typeof n === 'number' && isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1000, Math.round(v)));
}

function parseProject(o: unknown): PortfolioProject | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (!id || !title) return null;
  const status =
    r.status === 'paused' || r.status === 'done' ? r.status : 'active';
  const co =
    r.currentObjective && typeof r.currentObjective === 'object'
      ? (r.currentObjective as Record<string, unknown>)
      : null;
  return {
    id,
    title,
    northStar: typeof r.northStar === 'string' ? r.northStar.trim() : '',
    weight: clampWeight(r.weight),
    status,
    instrumental: r.instrumental === true,
    currentObjective: co
      ? {
          text: typeof co.text === 'string' ? co.text.trim() : '',
          openedTs: typeof co.openedTs === 'string' ? co.openedTs : '',
          deliberationThreadId:
            typeof co.deliberationThreadId === 'string'
              ? co.deliberationThreadId
              : undefined,
        }
      : undefined,
    progressLog: Array.isArray(r.progressLog)
      ? (r.progressLog as unknown[])
          .map((e) => {
            if (!e || typeof e !== 'object') return null;
            const x = e as Record<string, unknown>;
            return {
              ts: typeof x.ts === 'string' ? x.ts : '',
              projectId: typeof x.projectId === 'string' ? x.projectId : id,
              delta: typeof x.delta === 'string' ? x.delta : '',
              evidence: typeof x.evidence === 'string' ? x.evidence : '',
            } as ProgressEntry;
          })
          .filter((e): e is ProgressEntry => !!e && !!e.delta)
      : [],
  };
}

/** raw JSON → Portfolio (이상=빈/기본, 견고). 순수. */
export function parsePortfolio(raw: string): Portfolio {
  try {
    const o = JSON.parse(raw);
    const root = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
    const arr = Array.isArray(root.projects) ? (root.projects as unknown[]) : [];
    return {
      projects: arr
        .map(parseProject)
        .filter((p: PortfolioProject | null): p is PortfolioProject => !!p),
    };
  } catch {
    return { projects: [] };
  }
}

/** 파일 부재·이상 = 빈 포트폴리오(견고). IO. */
export function loadPortfolio(memoRoot: string): Portfolio {
  try {
    return parsePortfolio(fs.readFileSync(portfolioPath(memoRoot), 'utf-8'));
  } catch {
    return EMPTY;
  }
}

/**
 * 틱이 전진시킬 프로젝트 = status=active 중 weight 최대 (동률 → id 정렬
 * 첫). 없으면 null. 자가정비(instrumental)는 weight 제한이라 으뜸 WM 을
 * 못 이김 = 영구기관 구조적 차단 (ADR ⓒ).
 */
export function topProject(p: Portfolio): PortfolioProject | null {
  const active = p.projects.filter((x) => x.status === 'active');
  if (active.length === 0) return null;
  return active.slice().sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/**
 * proposal/objective 의 projectId cite 검증 (순수·결정적). 알려진
 * active/paused 프로젝트여야 통과 — 미매핑 = 거부(LT-2 게이트). "전진"이
 * 어느 북극성에 수렴하는지 강제 = D3 영구기관 근본.
 */
export function validateProjectCitation(
  p: Portfolio,
  projectId: string,
): { ok: boolean; reason: string } {
  const id = (projectId || '').trim();
  if (!id) return { ok: false, reason: 'projectId 미기재 — 북극성 미수렴' };
  const proj = p.projects.find((x) => x.id === id);
  if (!proj)
    return {
      ok: false,
      reason: `미지 projectId "${id}" — 포트폴리오 외 (자가정비는 instrumental 프로젝트 cite)`,
    };
  if (proj.status === 'done')
    return { ok: false, reason: `프로젝트 "${id}" done — 신규 전진 무의미` };
  return { ok: true, reason: `→ ${proj.title}` };
}

/**
 * 프롬프트 주입 블록 (순수·바운드). producer/deliberation 코어가 이걸 보고
 * *반드시 projectId + 북극성 전진방식* 을 cite 하게 한다.
 */
export function formatPortfolioBlock(p: Portfolio): string {
  if (p.projects.length === 0) return '';
  const sorted = p.projects
    .slice()
    .sort((a, b) => b.weight - a.weight);
  const lines = sorted.map((x) => {
    const tag = x.instrumental ? ' (도구적·weight제한)' : '';
    const obj = x.currentObjective?.text
      ? ` | 현 목표: ${x.currentObjective.text}`
      : '';
    return `- [${x.id}] ${x.title} (w${x.weight}, ${x.status})${tag} — 북극성: ${x.northStar}${obj}`;
  });
  return [
    '[팀 포트폴리오 — 북극성. 으뜸 = weight 최대]',
    ...lines,
    '',
    '*모든 제안은 위 projectId 하나를 cite + "이게 그 북극성/현 목표를',
    '어떻게 전진시키는가" 한 줄 명시 필수.* 어디에도 안 붙는 일 = 영구기관,',
    '하지 마라. 자가정비는 도구적 프로젝트를 cite (숨기지 말 것).',
  ].join('\n');
}

/** 포트폴리오 → 사람용 .md 투영 (active-sessions 라이브-투영 패턴). 순수. */
export function renderPortfolioMarkdown(p: Portfolio): string {
  const sorted = p.projects.slice().sort((a, b) => b.weight - a.weight);
  const head = [
    '# 팀 포트폴리오 (북극성)',
    '',
    '> 파생 투영 — 정본 = `team-portfolio.json`. 손편집 X.',
    '> "전진" = progressLog delta vs 북극성 (PR 수 X). TASK-KAR-018-LT.',
    '',
  ];
  const body = sorted.flatMap((x) => {
    const tag = x.instrumental ? ' · 도구적' : '';
    const obj = x.currentObjective?.text
      ? `\n- **현 목표**: ${x.currentObjective.text}`
      : '';
    const recent = x.progressLog
      .slice(-3)
      .map((e) => `  - ${e.ts.slice(0, 10)} ${e.delta} (${e.evidence})`)
      .join('\n');
    return [
      `## [${x.id}] ${x.title} — w${x.weight} · ${x.status}${tag}`,
      `- **북극성**: ${x.northStar}${obj}`,
      recent ? `- **최근 전진**:\n${recent}` : '- **최근 전진**: (없음)',
      '',
    ];
  });
  return [...head, ...body].join('\n');
}

function writePortfolio(memoRoot: string, p: Portfolio): boolean {
  try {
    const fp = portfolioPath(memoRoot);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(p, null, 2) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** progressLog 1건 append (read-modify-write, best-effort). IO. */
export function appendProgress(
  memoRoot: string,
  entry: Omit<ProgressEntry, 'ts'> & { ts?: string },
): boolean {
  const p = loadPortfolio(memoRoot);
  const proj = p.projects.find((x) => x.id === entry.projectId);
  if (!proj) return false;
  proj.progressLog.push({
    ts: entry.ts ?? new Date().toISOString(),
    projectId: entry.projectId,
    delta: String(entry.delta || '').slice(0, 300),
    evidence: String(entry.evidence || '').slice(0, 200),
  });
  return writePortfolio(memoRoot, p);
}

/** 프로젝트 currentObjective 설정 (best-effort). IO. */
export function setObjective(
  memoRoot: string,
  projectId: string,
  objective: Omit<CurrentObjective, 'openedTs'> & { openedTs?: string },
): boolean {
  const p = loadPortfolio(memoRoot);
  const proj = p.projects.find((x) => x.id === projectId);
  if (!proj) return false;
  proj.currentObjective = {
    text: String(objective.text || '').slice(0, 300),
    openedTs: objective.openedTs ?? new Date().toISOString(),
    deliberationThreadId: objective.deliberationThreadId,
  };
  return writePortfolio(memoRoot, p);
}
