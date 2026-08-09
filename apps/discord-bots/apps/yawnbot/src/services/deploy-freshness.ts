/**
 * 배포 파수꾼 — 「사이트가 며칠째 옛 판인데 아무도 모른다」를 없앤다 (TASK-KL-210)
 *
 * 2026-08-09 실측: 배포 실행이 **성공**으로 찍히는 동안 사이트는 21시간째 전날 판이었다.
 * 그 전에도 며칠 그랬다. 아무도 몰랐다 — 아무 데서도 빨간 게 안 떴기 때문이다.
 *
 * ## 왜 실행 상태(gh run)를 안 보나
 *
 * 실행이 초록이어도 올라간 게 없을 수 있다. 실제로 그랬다:
 *  - 잡이 통째로 `skipped` 인데 워크플로 결론은 `success`
 *  - 배포 잡이 `needs` 로 매달린 앞 잡이 비켜서, 뒤가 전부 건너뛰어짐
 *  - 빌드가 옛 산출물을 그대로 다시 올려서 「성공」
 *
 * 그래서 **사이트가 스스로 밝힌 판**만 본다. 앱은 빌드 때 `build.json` 에 커밋·시각을 굽는다:
 *
 *   { "stamp": "20260808144710", "commit": "a373a033…", "builtAt": "2026-08-08T14:47:10Z" }
 *
 * 이건 실행 로그가 아니라 **사람이 지금 받는 그 파일**이다. 여기 적힌 것이 곧 진실이다.
 *
 * ## 무엇을 「낡음」이라 하나
 *
 *   낡음 = (사이트 커밋 ≠ master 끝) **그리고** (사이트가 구워진 지 N분 초과)
 *
 * 두 조건을 **함께** 봐야 하는 이유:
 *  - 커밋만 보면 — 배포는 몇 분 걸린다. 방금 민 것은 아직 안 올라간 게 정상인데 매번 빨개진다.
 *  - 시각만 보면 — 아무도 안 밀면 사이트는 당연히 어제 것이다. 그건 고장이 아니다.
 * 둘을 함께 보면 「밀 것이 있는데 몇 시간째 안 올라갔다」만 남는다 — 그것만이 사고다.
 *
 * ## 조용한 실패를 말하게
 *
 * `build.json` 을 아예 못 받는 경우(사이트 죽음·DNS·인증서)는 낡음보다 나쁘다. 별도 상태
 * (`unreachable`)로 구분해 알린다 — 「낡았다」와 「없다」를 같은 말로 뭉치면 손이 엉뚱한 데 간다.
 *
 * ## 알림 규율
 *
 * 상태가 **바뀔 때만** 한 번 (heartbeat 와 동형). 다만 낡음이 계속되면 잊히므로 `REMIND_MIN`
 * 마다 한 번씩 다시 찌른다 — 조용해지는 것이 이 사고의 본체라서 그렇다.
 *
 * 순수부(`evaluateFreshness`)는 시각·응답을 인자로 받는다 — 실 네트워크 없이 시험한다.
 */

export type FreshnessState = 'fresh' | 'stale' | 'unreachable';

export interface SiteBuild {
  commit: string;
  builtAt: string;
}

export interface FreshnessInput {
  /** 사이트가 밝힌 판. 못 받았으면 null. */
  site: SiteBuild | null;
  /** 못 받은 사유 (site 가 null 일 때). */
  unreachableReason?: string;
  /** master 끝 커밋 sha. 못 받았으면 null — 그때는 판단을 미룬다(남의 고장으로 우릴 깨우지 않는다). */
  headSha: string | null;
  now: Date;
  /** 이 시간을 넘게 안 올라갔으면 낡음. */
  staleAfterMin: number;
}

export interface FreshnessVerdict {
  state: FreshnessState;
  /** 사람이 읽는 한 줄. */
  reason: string;
  /** 사이트 판이 구워진 지 몇 분. 못 받았으면 null. */
  ageMin: number | null;
}

/** 사이트가 스스로 밝힌 판 vs master 끝 — 둘을 견줘 한 줄로 답한다. */
export function evaluateFreshness(input: FreshnessInput): FreshnessVerdict {
  const { site, headSha, now, staleAfterMin } = input;

  if (!site) {
    return {
      state: 'unreachable',
      ageMin: null,
      reason: `사이트가 자기 판을 못 밝힌다 — ${input.unreachableReason || '알 수 없음'}`,
    };
  }

  const builtAt = new Date(site.builtAt);
  const ageMin = Number.isNaN(builtAt.getTime())
    ? null
    : Math.floor((now.getTime() - builtAt.getTime()) / 60_000);

  if (ageMin === null) {
    return {
      state: 'unreachable',
      ageMin: null,
      reason: `사이트가 밝힌 시각을 못 읽는다 — builtAt=${JSON.stringify(site.builtAt)}`,
    };
  }

  /* master 끝을 못 물어봤으면 판단하지 않는다. GitHub 이 흔들릴 때 「사이트가 낡았다」고
     외치면 애먼 데를 파게 된다 — 모르는 것은 모른다고 두는 편이 낫다. */
  if (!headSha) {
    return {
      state: 'fresh',
      ageMin,
      reason: `master 끝을 못 물어봐 판단을 미룬다 (사이트 판 ${short(site.commit)} · ${humanAge(ageMin)} 전)`,
    };
  }

  const same = site.commit.startsWith(headSha) || headSha.startsWith(site.commit);
  if (same) {
    return {
      state: 'fresh',
      ageMin,
      reason: `사이트 = master 끝 ${short(headSha)} (${humanAge(ageMin)} 전에 올라감)`,
    };
  }

  if (ageMin <= staleAfterMin) {
    return {
      state: 'fresh',
      ageMin,
      reason: `올라가는 중 — 사이트 ${short(site.commit)} / master ${short(headSha)} (${humanAge(ageMin)} 전 판, 아직 ${staleAfterMin}분 안)`,
    };
  }

  return {
    state: 'stale',
    ageMin,
    reason:
      `사이트가 ${humanAge(ageMin)}째 옛 판이다 — 사이트 ${short(site.commit)} / master ${short(headSha)}. ` +
      `배포 실행이 초록이어도 올라간 것은 없다.`,
  };
}

function short(sha: string): string {
  return String(sha).slice(0, 8);
}

function humanAge(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간`;
  return `${Math.floor(h / 24)}일 ${h % 24}시간`;
}

/* ── 알림 판정 ──────────────────────────────────────── */

export interface AlertMemory {
  /** 직전 상태. 첫 tick 이면 null. */
  last: FreshnessState | null;
  /** 마지막으로 알린 시각 (같은 상태 안에서). */
  lastAlertAt: Date | null;
}

export interface AlertDecision {
  send: boolean;
  healthy: boolean;
  reason: string;
}

/**
 * 알릴까 — **상태가 바뀐 순간** 한 번, 그리고 나쁜 상태가 이어지면 `remindMin` 마다 한 번.
 *
 * 매 tick 외치면 사람이 끄고, 한 번만 외치면 잊는다. 이 사고의 본체가 「조용해지는 것」이라
 * 나쁜 쪽만 되풀이해 찌른다. 좋은 쪽(복구)은 한 번이면 충분하다.
 */
export function decideAlert(
  verdict: FreshnessVerdict,
  memory: AlertMemory,
  now: Date,
  remindMin: number,
): AlertDecision {
  const healthy = verdict.state === 'fresh';
  const changed = memory.last !== verdict.state;

  if (changed) {
    /* 첫 tick 에 이미 건강하면 굳이 「복구」라고 외치지 않는다 — 아무 일도 없었다. */
    if (memory.last === null && healthy) return { send: false, healthy, reason: verdict.reason };
    return { send: true, healthy, reason: verdict.reason };
  }

  if (!healthy && memory.lastAlertAt) {
    const sinceMin = (now.getTime() - memory.lastAlertAt.getTime()) / 60_000;
    if (sinceMin >= remindMin) return { send: true, healthy, reason: `(계속) ${verdict.reason}` };
  }

  return { send: false, healthy, reason: verdict.reason };
}

/* ── 실제로 물어보는 부분 ────────────────────────────── */

export interface DeployFreshnessDeps {
  /** 사이트가 판을 밝히는 자리. 기본 = KarmoLab build.json. */
  buildUrl?: string;
  /** `owner/repo`. 기본 'Mascari4615/Mascari4615.github.io'. */
  repo?: string;
  /** master 끝을 물을 때 쓸 토큰 (없으면 익명 — 시간당 60회라 10분 간격이면 충분하다). */
  token?: string;
  /** 확인 간격(분). 기본 10, 최소 2. */
  intervalMin?: number;
  /** 이만큼 안 올라가 있으면 낡음. 기본 45. */
  staleAfterMin?: number;
  /** 낡음이 이어질 때 다시 찌르는 간격(분). 기본 360(6시간). */
  remindMin?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  alert?: (event: { healthy: boolean; reason: string }) => void;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  timeoutMs?: number;
}

export interface DeployFreshnessHandle {
  tickNow: () => Promise<FreshnessVerdict>;
  stop: () => void;
}

const DEFAULT_BUILD_URL = 'https://blog.mascari4615.com/apps/karmolab/build.json';
const DEFAULT_REPO = 'Mascari4615/Mascari4615.github.io';
const DEFAULT_INTERVAL_MIN = 10;
const MIN_INTERVAL_MIN = 2;
const DEFAULT_STALE_AFTER_MIN = 45;
const DEFAULT_REMIND_MIN = 360;
const DEFAULT_TIMEOUT_MS = 10_000;

async function getJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    /* 캐시를 타면 **옛 판을 보고 「올라갔다」고 말한다** — 파수꾼이 캐시에 속으면 파수꾼이 아니다. */
    const res = await fetchImpl(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', ...headers },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 한 번 확인한다. 알림은 상태 전이에서만 (memory 는 호출부가 들고 있다). */
export async function runFreshnessTick(
  deps: Required<Pick<DeployFreshnessDeps, 'buildUrl' | 'repo' | 'staleAfterMin' | 'remindMin'>> & {
    fetchImpl: typeof fetch;
    now: () => Date;
    timeoutMs: number;
    token?: string;
    logger: Pick<Console, 'log' | 'warn' | 'error'>;
    alert?: (event: { healthy: boolean; reason: string }) => void;
  },
  memory: AlertMemory,
): Promise<FreshnessVerdict> {
  const { fetchImpl, now, timeoutMs, logger } = deps;

  let site: SiteBuild | null = null;
  let unreachableReason: string | undefined;
  try {
    const body = (await getJson(deps.buildUrl, fetchImpl, timeoutMs, {})) as Partial<SiteBuild>;
    if (body && typeof body.commit === 'string' && typeof body.builtAt === 'string') {
      site = { commit: body.commit, builtAt: body.builtAt };
    } else {
      unreachableReason = `build.json 모양이 다르다 (${JSON.stringify(body).slice(0, 120)})`;
    }
  } catch (err) {
    unreachableReason = String(err instanceof Error ? err.message : err).slice(0, 120);
  }

  let headSha: string | null = null;
  try {
    const ghHeaders: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'yawnbot-deploy-freshness',
    };
    if (deps.token) ghHeaders.Authorization = `Bearer ${deps.token}`;
    const body = (await getJson(
      `https://api.github.com/repos/${deps.repo}/commits/master`,
      fetchImpl,
      timeoutMs,
      ghHeaders,
    )) as { sha?: string };
    if (body && typeof body.sha === 'string') headSha = body.sha;
  } catch (err) {
    logger.warn(`[DeployFreshness] master 끝을 못 물어봤다 — ${String(err).slice(0, 100)}`);
  }

  const verdict = evaluateFreshness({
    site,
    unreachableReason,
    headSha,
    now: now(),
    staleAfterMin: deps.staleAfterMin,
  });

  const decision = decideAlert(verdict, memory, now(), deps.remindMin);
  memory.last = verdict.state;
  if (decision.send) {
    memory.lastAlertAt = now();
    deps.alert?.({ healthy: decision.healthy, reason: decision.reason });
    logger.warn(`[DeployFreshness] ${decision.reason}`);
  } else {
    logger.log(`[DeployFreshness] ${verdict.state} — ${verdict.reason}`);
  }
  return verdict;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** 주기 감시 시작. 이미 돌고 있으면 갈아 끼운다. */
export function startDeployFreshness(deps: DeployFreshnessDeps = {}): DeployFreshnessHandle {
  stopDeployFreshness();
  const resolved = {
    buildUrl: deps.buildUrl || DEFAULT_BUILD_URL,
    repo: deps.repo || DEFAULT_REPO,
    staleAfterMin: deps.staleAfterMin ?? DEFAULT_STALE_AFTER_MIN,
    remindMin: deps.remindMin ?? DEFAULT_REMIND_MIN,
    fetchImpl: deps.fetchImpl ?? fetch,
    now: deps.now ?? (() => new Date()),
    timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    token: deps.token,
    logger: deps.logger ?? console,
    alert: deps.alert,
  };
  const memory: AlertMemory = { last: null, lastAlertAt: null };
  const intervalMin = Math.max(MIN_INTERVAL_MIN, deps.intervalMin ?? DEFAULT_INTERVAL_MIN);

  const tickNow = () =>
    runFreshnessTick(resolved, memory).catch((err) => {
      resolved.logger.error(`[DeployFreshness] tick 실패 — ${String(err).slice(0, 200)}`);
      return { state: 'unreachable' as const, reason: String(err).slice(0, 200), ageMin: null };
    });

  void tickNow();
  timer = setInterval(() => void tickNow(), intervalMin * 60_000);
  if (typeof timer.unref === 'function') timer.unref();
  resolved.logger.log(`[DeployFreshness] 배포 파수꾼 켬 — ${intervalMin}분마다 · ${resolved.buildUrl}`);
  return { tickNow, stop: stopDeployFreshness };
}

export function stopDeployFreshness(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
