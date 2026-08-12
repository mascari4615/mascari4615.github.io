/**
 * 우주 데이터 중계 (TASK-KL-241 follow-up) — **자기 파일에 산다**.
 *
 * 왜 생겼나 (2026-08-12 실측):
 *   - `celestrak.org` 가 **403** 을 준다. 브라우저만 막힌 게 아니다 — 우리 서버에서 curl 로
 *     쳐도 403 이다. 자동 접근을 아예 잠갔다.
 *   - `ll.thespacedevs.com` 은 **429**. 여기는 IP 당 한도라, 화면을 여는 사람마다 각자 부르는
 *     구조 자체가 문제였다. 사람이 늘수록 반드시 넘긴다.
 *
 * 그래서 **화면이 바깥에 직접 붙는 구조를 걷어낸다.** 여기가 대신 받아서:
 *   ① 한 번 받은 것을 **여럿이 나눠 쓴다** (한도는 사람 수가 아니라 이 서버 하나에만 걸린다)
 *   ② 원천이 죽으면 **다음 원천**으로 간다 (한 곳이 문을 닫아도 화면은 산다)
 *   ③ 전부 죽으면 **낡은 값이라도 준다** — 궤도 요소는 하루 지나도 쓸 만하고,
 *      발사 일정은 어제 것이라도 빈 화면보다 낫다
 *
 * 붙는 자리: `main.ts` 가 `registerKarmolabApi(app)` **다음에** 부른다 — `/kl` CORS 미들웨어가
 * 거기서 달리고 Express 는 먼저 달린 것부터 태운다.
 */
import type { Application, Request, Response } from 'express';

/** CelesTrak 이 주던 것과 **같은 모양** — 화면 코드를 고치지 않으려고 이 형식을 지킨다. */
export interface Omm {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
}

/* ── TLE 두 줄을 궤도 요소로 ──────────────────────────────────────────────
   자리로 잘라 읽는 옛 형식이다. 칸이 정해져 있으므로 **자리로 자른다** — 공백으로 나누면
   값이 붙어 나오는 줄(부호가 바로 붙는 자리)에서 조용히 어긋난다. */

/** `26224.11681231` → 2026-08-12T02:48:12Z 같은 시각. 앞 두 자리가 연도다. */
export function epochFromTle(raw: string): string {
  const yy = Number(raw.slice(0, 2));
  const doy = Number(raw.slice(2));
  if (!Number.isFinite(yy) || !Number.isFinite(doy)) return new Date().toISOString();
  // 57 보다 작으면 2000 년대 — 이 형식이 정한 규칙이다(위성 시대가 1957 년에 시작했다)
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const ms = Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
  return new Date(ms).toISOString();
}

export function ommFromTle(name: string, l1: string, l2: string, id = 25544): Omm | null {
  if (!l1 || !l2 || l1.length < 32 || l2.length < 63) return null;
  const num = (s: string): number => Number(s.trim());
  const ecc = Number('0.' + l2.slice(26, 33).trim()); // 앞의 `0.` 은 적지 않는 형식이다
  const out: Omm = {
    OBJECT_NAME: name || 'ISS (ZARYA)',
    NORAD_CAT_ID: id,
    EPOCH: epochFromTle(l1.slice(18, 32).trim()),
    MEAN_MOTION: num(l2.slice(52, 63)),
    ECCENTRICITY: ecc,
    INCLINATION: num(l2.slice(8, 16)),
    RA_OF_ASC_NODE: num(l2.slice(17, 25)),
    ARG_OF_PERICENTER: num(l2.slice(34, 42)),
    MEAN_ANOMALY: num(l2.slice(43, 51)),
  };
  const bad = Object.values(out).some((v) => typeof v === 'number' && !Number.isFinite(v));
  return bad ? null : out;
}

/* ── 나눠 쓰는 곳간 ───────────────────────────────────────────────────── */

interface Box<T> {
  at: number;
  value: T;
}

/**
 * 값 하나를 여럿이 나눠 쓰는 곳간.
 *
 * 세 가지를 한다: **때가 안 됐으면 그대로 준다** · 같은 순간에 여럿이 물어도 **바깥에는 한 번만
 * 묻는다**(안 그러면 첫 손님 열 명이 열 번 부른다) · 바깥이 죽으면 **낡은 값이라도 준다**.
 */
export class SharedCache<T> {
  private box: Box<T> | null = null;
  private inflight: Promise<T | null> | null = null;

  constructor(
    private readonly ttlMs: number,
    /** 이만큼까지는 낡은 값도 준다 — 빈 화면보다 어제 값이 낫다. */
    private readonly staleMs: number,
    private readonly load: () => Promise<T | null>,
    private readonly now: () => number = Date.now,
  ) {}

  get age(): number | null {
    return this.box ? this.now() - this.box.at : null;
  }

  async get(): Promise<{ value: T | null; fresh: boolean; ageMs: number | null }> {
    const age = this.age;
    if (this.box && age !== null && age < this.ttlMs) {
      return { value: this.box.value, fresh: true, ageMs: age };
    }
    if (!this.inflight) {
      this.inflight = this.load()
        .catch(() => null)
        .then((v) => {
          if (v !== null && v !== undefined) this.box = { at: this.now(), value: v };
          this.inflight = null;
          return v;
        });
    }
    const got = await this.inflight;
    if (got !== null && got !== undefined) return { value: got, fresh: true, ageMs: 0 };
    // 바깥이 죽었다 — 곳간에 뭔가 있으면 그거라도
    const a2 = this.age;
    if (this.box && a2 !== null && a2 < this.staleMs) {
      return { value: this.box.value, fresh: false, ageMs: a2 };
    }
    return { value: null, fresh: false, ageMs: a2 };
  }
}

/* ── 원천들 ───────────────────────────────────────────────────────────── */

const UA = 'KarmoLab/1.0 (+https://mascari4615.github.io/karmolab/)';

async function getJson<T>(url: string, ms = 12000): Promise<T | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: ac.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** 앞에서부터 되는 곳까지. 하나가 문을 닫아도 화면은 살아 있어야 한다. */
export async function firstOf<T>(sources: Array<() => Promise<T | null>>): Promise<T | null> {
  for (const s of sources) {
    const got = await s();
    if (got) return got;
  }
  return null;
}

async function loadIss(): Promise<Omm[] | null> {
  return firstOf<Omm[]>([
    // ① TLE 를 그대로 주는 곳 (2026-08-12 실측: 200 · 열려 있음)
    async () => {
      const d = await getJson<{ name?: string; line1?: string; line2?: string }>(
        'https://tle.ivanstanojevic.me/api/tle/25544',
      );
      const o = d && d.line1 && d.line2 ? ommFromTle(d.name || 'ISS (ZARYA)', d.line1, d.line2) : null;
      return o ? [o] : null;
    },
    // ② 원래 자리 — 다시 열리면 이쪽이 가장 정확하다
    async () => {
      const rows = await getJson<Omm[]>('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json');
      return Array.isArray(rows) && rows.length ? rows : null;
    },
  ]);
}

interface LaunchFeed {
  results: unknown[];
}

async function loadLaunches(): Promise<LaunchFeed | null> {
  return firstOf<LaunchFeed>([
    // ① 같은 API 의 느슨한 쪽 (한도가 널널하다)
    async () => {
      const d = await getJson<LaunchFeed>('https://lldev.thespacedevs.com/2.3.0/launches/upcoming/?limit=10&mode=list');
      return d && Array.isArray(d.results) && d.results.length ? d : null;
    },
    // ② 원래 자리
    async () => {
      const d = await getJson<LaunchFeed>('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10&mode=list');
      return d && Array.isArray(d.results) && d.results.length ? d : null;
    },
  ]);
}

/**
 * 위성 무리 목록. 여기만은 **대신할 곳이 없다** — 무리 단위로 주는 데는 CelesTrak 뿐이다.
 * 그래서 더더욱 여기서 받아 나눠 써야 한다: 화면마다 부르면 두 시간 창에 걸려 서로를 막는다.
 */
const GROUPS = new Set(['active', 'visual', 'stations', 'starlink']);

async function loadGroup(name: string): Promise<Omm[] | null> {
  const rows = await getJson<Omm[]>(
    `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(name)}&FORMAT=json`,
    20000,
  );
  return Array.isArray(rows) && rows.length ? rows : null;
}

/* ── 라우트 ───────────────────────────────────────────────────────────── */

export function registerSpaceRoutes(app: Application): void {
  /* 궤도 요소는 하루가 지나도 쓸 만하다 — 두 시간에 한 번이면 넉넉하고, 못 받으면 이틀까지 버틴다. */
  const iss = new SharedCache<Omm[]>(2 * 60 * 60 * 1000, 48 * 60 * 60 * 1000, loadIss);
  /* 발사 일정은 자주 바뀌지만 분 단위로 바뀌진 않는다. */
  const launches = new SharedCache<LaunchFeed>(30 * 60 * 1000, 24 * 60 * 60 * 1000, loadLaunches);

  const serve = async (
    res: Response,
    cache: SharedCache<unknown>,
    maxAgeSec: number,
    empty: unknown,
  ): Promise<void> => {
    const { value, fresh, ageMs } = await cache.get();
    /* 중간 캐시도 함께 쉬게 한다 — 이 서버가 한 번 받은 것을 다시 묻는 일까지 줄인다. */
    res.setHeader('Cache-Control', `public, max-age=${maxAgeSec}`);
    if (ageMs !== null) res.setHeader('X-KL-Age', String(Math.round(ageMs / 1000)));
    if (!value) {
      /* 아무 데서도 못 받았다. **200 으로 빈 값**을 준다 — 화면 입장에서 「우주 소식이 없다」와
         「우리 서버가 고장」은 다르게 보여야 하지만, 여기서는 겹 하나가 조용히 비는 게 맞다. */
      res.json(empty);
      return;
    }
    if (!fresh) res.setHeader('X-KL-Stale', '1');
    res.json(value);
  };

  /** ISS 궤도 요소 — CelesTrak 이 주던 것과 같은 모양(배열). */
  app.get('/kl/space/iss', (_req: Request, res: Response) => {
    void serve(res, iss as SharedCache<unknown>, 1800, []);
  });

  /** 다가오는 발사 — TheSpaceDevs 형식 그대로. */
  app.get('/kl/space/launches', (_req: Request, res: Response) => {
    void serve(res, launches as SharedCache<unknown>, 600, { results: [] });
  });

  /* 무리는 크고(수 MB) 자주 안 바뀐다 — 여섯 시간에 한 번, 못 받으면 이틀까지 버틴다. */
  const groups = new Map<string, SharedCache<Omm[]>>();
  app.get('/kl/space/group/:name', (req: Request, res: Response) => {
    const name = String(req.params.name || '');
    /* 아는 이름만 — 아무 주소나 대신 받아 주는 문이 되면 그건 중계가 아니라 우회로다. */
    if (!GROUPS.has(name)) {
      res.status(404).json({ error: 'unknown group' });
      return;
    }
    let cache = groups.get(name);
    if (!cache) {
      cache = new SharedCache<Omm[]>(6 * 60 * 60 * 1000, 48 * 60 * 60 * 1000, () => loadGroup(name));
      groups.set(name, cache);
    }
    void serve(res, cache as SharedCache<unknown>, 3600, []);
  });
}
