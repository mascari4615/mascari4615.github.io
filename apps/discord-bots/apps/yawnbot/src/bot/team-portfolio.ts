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
  /** 마지막 retrospective 시각(ISO). LT-7 주기 게이트(영속·재시작 불변). */
  lastRetroTs?: string;
  /** 마지막 사용자 품질 체크 요청 시각(ISO). LT-QC 주기 게이트(24h). */
  lastQualityCheckTs?: string;
}

export interface Portfolio {
  projects: PortfolioProject[];
  /** 마지막 자기수술 시각(ISO). 기둥4 주기 게이트(기본 12h). */
  lastSurgeryTs?: string;
  /** 마지막 #team-bus 다이제스트 송신 시각(ISO). LT-DIGEST 주기 게이트(기본 12h). */
  lastDigestTs?: string;
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
    lastRetroTs:
      typeof r.lastRetroTs === 'string' ? r.lastRetroTs : undefined,
    lastQualityCheckTs:
      typeof r.lastQualityCheckTs === 'string' ? r.lastQualityCheckTs : undefined,
  };
}

/** raw JSON → Portfolio (이상=빈/기본, 견고). 순수.
 *  top-level lastSurgeryTs / lastDigestTs 보존 — 미보존 시 매 load 마다 0 리셋되어
 *  주기 게이트(기둥4·LT-DIGEST)가 영구 통과(잠복 버그). */
export function parsePortfolio(raw: string): Portfolio {
  try {
    const o = JSON.parse(raw);
    const root = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
    const arr = Array.isArray(root.projects) ? (root.projects as unknown[]) : [];
    return {
      projects: arr
        .map(parseProject)
        .filter((p: PortfolioProject | null): p is PortfolioProject => !!p),
      lastSurgeryTs:
        typeof root.lastSurgeryTs === 'string' ? root.lastSurgeryTs : undefined,
      lastDigestTs:
        typeof root.lastDigestTs === 'string' ? root.lastDigestTs : undefined,
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

// ═══ LT-7: retro 밸브 (TASK-KAR-018-LT 기둥3 — anti-self-grooming) ═══
// 주기 retrospective: progressLog vs northStar 리뷰 → currentObjective
// 자동 조정. 자가정비를 *명시 instrumental + 주기 검토* 로만 허용한다는
// ⓒ 결정의 실현 — 팀이 "전진하는 척"인지 스스로 점검하고 목표를 갱신.

/**
 * retro 실행 시점인가 (순수·결정적). active + 리뷰할 진전 존재 +
 * 마지막 retro 후 intervalMs 경과. 영속 lastRetroTs 기준 → 재시작
 * 불변(인메모리 쿨다운 아님 = 긴 주기 신뢰).
 */
export function shouldRunRetro(
  proj: PortfolioProject,
  nowMs: number,
  intervalMs: number,
): boolean {
  if (proj.status !== 'active') return false;
  if (proj.progressLog.length === 0) return false;
  const last = proj.lastRetroTs ? Date.parse(proj.lastRetroTs) : 0;
  return nowMs - (isFinite(last) ? last : 0) >= intervalMs;
}

export type RetroAction = 'keep' | 'adjust' | 'achieved';
export interface RetroDecision {
  action: RetroAction;
  /** adjust 시 새 currentObjective 텍스트. */
  objective?: string;
}

/** retro LLM 출력 → 결정적 파싱 (불명확=keep, 날조 0). 순수. */
export function parseRetroDecision(text: string): RetroDecision {
  const t = (text || '').trim();
  const line = t.split('\n')[0] || '';
  if (/달성|완료|achieved|done/i.test(line)) return { action: 'achieved' };
  const adj = t.match(
    /(?:조정|변경|adjust|새\s*목표)\s*[:：-]?\s*(.+)/i,
  );
  if (adj && adj[1].trim()) {
    return { action: 'adjust', objective: adj[1].trim().slice(0, 300) };
  }
  return { action: 'keep' }; // 유지·불명확 = 현 목표 보존(보수·날조 0)
}

/** retro 프롬프트 (순수·바운드). 진전이 *진짜* 북극성으로 가는지 심문. */
export function buildRetroPrompt(
  proj: PortfolioProject,
  missionText: string,
): string {
  const recent = proj.progressLog
    .slice(-6)
    .map((e) => `· ${e.ts.slice(0, 10)} ${e.delta} (${e.evidence})`)
    .join('\n');
  return [
    `너는 karmoddrine 에이전트 팀. 프로젝트 «${proj.title}» 회고 1턴.`,
    '도구·파일 접근 없이 아래만으로 판단. 사장(비개발자) 평이체,',
    '내부 코드명·영어약어·경로 금지. 3~4문장.',
    '',
    `[북극성 — 사용자 영역, 바꾸지 마라]`,
    proj.northStar,
    `[현 목표]`,
    proj.currentObjective?.text || '(없음)',
    '',
    '[최근 전진 기록]',
    recent || '(없음)',
    '',
    '[미션 정렬 anchor]',
    missionText.trim().slice(0, 800),
    '',
    '[질문] 이 전진들이 *진짜* 북극성으로 가고 있나, 자가정비 맴돌이인가?',
    '첫 줄 정확히 하나:',
    '· "유지" — 현 목표 그대로가 옳다.',
    '· "조정: <새 목표 한 줄>" — 더 북극성에 가까운 목표로.',
    '· "달성" — 현 목표 달성됨(다음은 별도 발굴).',
    '둘째 줄 = 평이체 사유 1줄.',
  ].join('\n');
}

/**
 * retro 결과 반영 (best-effort, 항상 lastRetroTs 스탬프 — keep 라도
 * 주기 재계산). adjust=currentObjective 교체. IO.
 */
export function recordRetro(
  memoRoot: string,
  projectId: string,
  d: RetroDecision,
  ts?: string,
): boolean {
  const p = loadPortfolio(memoRoot);
  const proj = p.projects.find((x) => x.id === projectId);
  if (!proj) return false;
  const now = ts ?? new Date().toISOString();
  proj.lastRetroTs = now;
  if (d.action === 'adjust' && d.objective) {
    proj.currentObjective = { text: d.objective.slice(0, 300), openedTs: now };
  }
  return writePortfolio(memoRoot, p);
}

// ═══ LT-QC: 사용자 품질 체크 강제 (HITL 닫힘 게이트) ═══
// 최상위 진단(2026-05-19): 재설계가 CI-green 증분 영구기관이 된 근본 =
// 완료조건 검증의 최종 rung 이 사용자 관측인데 그 관측을 *요청*하는 메커니즘이
// 없었음. 본 섹션이 그 gap 을 닫는다.
//
// retro(LT-7) 와 차이: retro = 에이전트→자기 self-check(진전 필요).
// quality-check = 에이전트→사용자 요청(진전 없어도 판정 필요, 오히려
// 진전 0일수록 판정이 급함). 두 체크 독립.

/**
 * 사용자 품질 체크 요청 시점인가 (순수·결정적). active 프로젝트이고
 * 마지막 요청 후 intervalMs 경과(기본 24h). retro 와 달리 progressLog
 * 조건 없음 — 진전이 없을수록 요청이 더 중요.
 */
export function shouldRunQualityCheck(
  proj: PortfolioProject,
  nowMs: number,
  intervalMs: number,
): boolean {
  if (proj.status !== 'active') return false;
  const last = proj.lastQualityCheckTs ? Date.parse(proj.lastQualityCheckTs) : 0;
  return nowMs - (isFinite(last) ? last : 0) >= intervalMs;
}

/**
 * 사용자에게 보낼 품질 체크 메시지 (순수·바운드). 팀 숙의가 진짜 토론인지
 * 사용자가 직접 #team-bus 에서 관측·판정해달라는 요청. LLM 호출 없음 —
 * 이 메시지가 사용자를 팀 관찰로 이끄는 forcing-function.
 */
export function buildQualityCheckMessage(proj: PortfolioProject): string {
  const obj = proj.currentObjective?.text
    ? `현 목표: ${proj.currentObjective.text.slice(0, 100)}`
    : '현 목표 없음';
  const progress =
    proj.progressLog.length > 0
      ? `최근 전진: ${proj.progressLog
          .slice(-2)
          .map((e) => e.delta.slice(0, 80))
          .join(' / ')}`
      : '기록된 전진 없음';
  return [
    `🔍 **팀 품질 체크** — «${proj.title}»`,
    `북극성: ${proj.northStar.slice(0, 100)}`,
    `${obj} | ${progress}`,
    '',
    '**팀이 진짜 토론하고 있나요?** #team-bus 최근 숙의 스레드를 확인하고',
    '이 메시지 스레드에 답글 해주세요:',
    '✅ 진짜 토론 — 반박·대안·수렴 있음',
    '❌ 아직 깡통 — Echo 동의만 / 숙의 없음',
  ].join('\n');
}

/**
 * 품질 체크 요청 기록 (lastQualityCheckTs 스탬프, best-effort). IO.
 */
export function recordQualityCheck(
  memoRoot: string,
  projectId: string,
  ts?: string,
): boolean {
  const p = loadPortfolio(memoRoot);
  const proj = p.projects.find((x) => x.id === projectId);
  if (!proj) return false;
  proj.lastQualityCheckTs = ts ?? new Date().toISOString();
  return writePortfolio(memoRoot, p);
}

// ═══ 기둥4: 자기수술 (self-surgery) — TASK-KAR-018-LT ═══
// 진단(2026-05-19): retro/QC 가 형식적인 근본 = "측정 대상이 메타-목표뿐".
// 기존 retro(목표 조정)·QC(사용자 핑)에 더해, 시스템 실작동 헬스 신호를
// 보고 팀 자율 진단 → task-new seed OR escalate 루프를 추가한다.
// (신설 X — retro/QC substrate 위에 health 층 추가, 평행파이프 0)

/**
 * 자기수술 실행 시점인가 (순수·결정적). active 프로젝트 존재 + 마지막
 * 수술 후 intervalMs 경과. 이슈 없으면 호출측이 skip (이슈 필터는 외부).
 */
export function shouldRunSurgery(
  portfolio: Portfolio,
  nowMs: number,
  intervalMs: number,
): boolean {
  if (!portfolio.projects.some((p) => p.status === 'active')) return false;
  const last = portfolio.lastSurgeryTs
    ? Date.parse(portfolio.lastSurgeryTs)
    : 0;
  return nowMs - (isFinite(last) ? last : 0) >= intervalMs;
}

export type SurgeryAction = 'seed' | 'escalate' | 'keep';

export interface SurgeryDecision {
  action: SurgeryAction;
  /** action==='seed' 시 TASK 제목 (한 줄). */
  taskTitle?: string;
  /** action==='seed' 시 TASK 본문 (마크다운). */
  taskBody?: string;
  /** 결정 사유 (날조 X — LLM 원문 기반). */
  reason: string;
}

/**
 * 자기수술 LLM 프롬프트 (순수·바운드). 헬스 이슈 → 근본 진단 + fix 과제.
 * 이슈는 system-health.ts 의 HealthIssue[] 포맷 문자열로 주입.
 */
export function buildSurgerySeedPrompt(
  proj: PortfolioProject,
  healthBlock: string,
  missionText: string,
): string {
  return [
    `너는 karmoddrine 에이전트 팀. 시스템 자기수술 진단 1턴.`,
    '도구·파일 접근 없이 아래 데이터만으로 판단. 사장(비개발자) 평이체,',
    '내부 코드명·영어약어·경로 금지. 4~6문장.',
    '',
    `[최우선 프로젝트]`,
    `${proj.title} — 북극성: ${proj.northStar}`,
    `현 목표: ${proj.currentObjective?.text || '(없음)'}`,
    '',
    healthBlock,
    '',
    '[미션 anchor]',
    missionText.trim().slice(0, 600),
    '',
    '[지시] 위 헬스 이슈의 *진짜 근본*이 무엇인지 진단하고,',
    '팀이 자율로 고칠 수 있는 과제 하나를 제안하라.',
    '(비가역·외부·사람 비전 영역이면 "escalate" 를 선택)',
    '',
    '첫 줄 정확히 하나:',
    '· "과제: <한 줄 제목>" — 자율 fix 가능 task seed 제안.',
    '· "escalate: <사유 한 줄>" — 사람 판단 필요.',
    '· "정상: <이유>" — 이슈가 사실 문제 없음.',
    '둘째 줄 이후 = 진단 사유 3~4문장 (평이체).',
  ].join('\n');
}

/**
 * 자기수술 LLM 출력 → 결정 파싱 (순수·결정적, 불명확=escalate).
 * "과제:" → seed, "escalate:" → escalate, "정상:" → keep.
 */
export function parseSurgeryDecision(text: string): SurgeryDecision {
  const t = (text || '').trim();
  const lines = t.split(/\r?\n/);
  const first = lines[0]?.trim() || '';
  const rest = lines.slice(1).join('\n').trim();

  const seedMatch = first.match(/^과제\s*[:：]\s*(.+)/i);
  if (seedMatch) {
    const taskTitle = seedMatch[1].trim().slice(0, 120);
    return {
      action: 'seed',
      taskTitle,
      taskBody: rest.slice(0, 800) || taskTitle,
      reason: rest.slice(0, 200) || taskTitle,
    };
  }

  const escMatch = first.match(/^escalate\s*[:：]\s*(.+)/i);
  if (escMatch) {
    return { action: 'escalate', reason: escMatch[1].trim().slice(0, 200) };
  }

  const keepMatch = first.match(/^정상\s*[:：]\s*(.+)/i);
  if (keepMatch) {
    return { action: 'keep', reason: keepMatch[1].trim().slice(0, 200) };
  }

  // 불명확 = escalate (날조 X — 사람이 봐야 안전)
  return { action: 'escalate', reason: `진단 불명확(원문): ${first.slice(0, 80)}` };
}

/**
 * 자기수술 실행 기록 (lastSurgeryTs 스탬프, best-effort). IO.
 */
export function recordSurgery(memoRoot: string, ts?: string): boolean {
  const p = loadPortfolio(memoRoot);
  p.lastSurgeryTs = ts ?? new Date().toISOString();
  return writePortfolio(memoRoot, p);
}

// ═══ LT-DIGEST: #team-bus 주기 가시화 다이제스트 (TASK-KAR-018-LT-DIGEST) ═══
// 진화 ledger(ticker) 와 ⊥: ticker=event-driven push / digest=time-driven pull.
// 진화 0 일 때도 "12h 진화 0 — stalled: X" 명시 → "cron 껍데기" 인지 직격.

/** digest 실행 시점인가 (순수·결정적). 영속 lastDigestTs 기준. */
export function shouldRunDigest(
  p: Portfolio,
  nowMs: number,
  intervalMs: number,
): boolean {
  const last = p.lastDigestTs ? Date.parse(p.lastDigestTs) : 0;
  return nowMs - (Number.isFinite(last) ? last : 0) >= intervalMs;
}

/** digest 송신 기록 (lastDigestTs 스탬프, best-effort). IO. */
export function recordDigest(memoRoot: string, ts?: string): boolean {
  const p = loadPortfolio(memoRoot);
  p.lastDigestTs = ts ?? new Date().toISOString();
  return writePortfolio(memoRoot, p);
}
