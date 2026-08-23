/**
 * memo-atlas — 내가 쓴 것을 한 장의 지형도로 (TASK-KAR-233).
 *
 * 목록으로 보면 안 보던 걸 또 안 본다. 지도로 보면 **어디에 쏠렸는지**가
 * 남 눈으로 보인다. 자리·덩어리·덩어리 이름은 미리 구워 둔다
 * (scripts/build-memo-atlas.mjs → data/memo-atlas.json).
 *
 * 배치 규칙을 갈아끼울 수 있다 — 같은 데이터, 다른 질문:
 *   뜻자리  : 비슷한 뜻끼리 가까이 (임베딩 두 축)
 *   덩어리  : 묶인 것끼리 모아 놓기
 *   갈래    : 어느 폴더에서 왔나
 */
/* 이 파일은 **모듈**이다(맨 끝 `export {}`). 그래야 아래 선언이 다른 위젯의 같은 선언과
   안 부딪친다 — 모듈이 아니면 전역 하나를 여럿이 선언하는 꼴이 된다. */
declare const Toolbox: { register: (m: unknown) => void } | undefined;

(function (): void {
  'use strict';

  type Doc = {
    id: string;
    lane: string;
    title: string;
    status: string;
    done: boolean;
    bytes: number;
    xy: [number, number] | null;      // 뜻자리 — 비슷한 것끼리 또렷하게
    axis: [number, number] | null;    // 축 — 전체를 가르는 가장 큰 두 방향
    cluster: number | null;
    levels: number[] | null;   // 층마다 어느 덩어리에 드나 (성긴 것부터)
    twin?: string | null;
    tag?: string | null;   // 사람이 붙인 분류 (블로그 앞머리)      // 거의 같은 글이 있으면 그 대표의 id
    dense?: number | null;     // 밀도로 뭉친 자리 번호 (-1 = 허허벌판)
    densep?: number | null;    // 그 자리의 한가운데인가 (λ_p/λ_max, 1 이 한가운데)
    buried?: boolean;          // 오래됐고 아무도 안 부르는 글
    days?: number | null;      // 마지막으로 손댄 지 며칠
    links?: number;            // 몇 군데서 부르나
    born?: string | null;      // 처음 담긴 달 (2026-08)
    url?: string | null;       // 바깥에서 주운 것의 원래 주소
    near?: number[];           // 뜻으로 가까운 글들의 자리 번호 (가까운 순)
    honest?: number;           // 닮은 글 8개 중 지도에서도 가까운 수 (0~8) — 낮으면 **찢김**
    fake?: number;             // 화면 이웃 중 진짜로는 먼 것의 수 — **거짓 이웃**
    fakeOf?: number;           // 그때 본 화면 이웃 수 (보통 24)
    mix?: number;              // 이웃에 낀 갈래의 유효 개수 (1 = 한 갈래뿐)
    alone?: number;            // 어디에도 안 붙는 정도 (LOF · 1 쯤이면 보통)
    lonely?: boolean;          // 그중 위 2% — 「혼자 있는 글」
  };
  type Level = {
    k: number; names: string[]; words?: string[][];
    sil?: number | null; dbcv?: number | null;
    /* 이름이 제 무리 것인가 (응집도 c_npmi) — own: 제 무리 글로 잰 값, other: 남의 무리 글로 */
    fit?: { names: Array<{ name: string; own: number | null; other: number | null } | null>; mean: number | null; better: number; judged: number } | null;
    /* 왜 안 갈리는지 — 한 수 말고 요인 이름으로 (Sedlmair 2012) */
    why?: { why: string; elongMed: number; outlierMed: number;
      worst: { a: string; b: string; std: number };
      rows: Array<{ name: string; n: number; spread: number; density: number; elong: number; outlier: number }> } | null;
    /** **p 값** — 덩어리 짝마다 중심을 잇는 선에 투영해 단봉성을 검정한다 (Hartigan dip). */
    dip?: { runs: number; alpha: number; floor: number; pairs: number; split: number;
      randSplit: number; fakeSplit: number; medDip: number; medRandDip: number; minP: number | null;
      fakes: Array<{ name: string; n: number; dip: number; p: number }>;
      rows: Array<{ a: string; b: string; na: number; nb: number; used: number;
        dip: number; p: number; randDip: number; randP: number }> } | null;
  };
  type Hole = { a: string; b: string; size: [number, number] };
  type Skeleton = { nodes: Array<{ xy: [number, number]; n: number; lane: string; keep?: number }>; links: Array<[number, number, number]>;
    params?: { bins: number; overlap: number; min: number; lens?: string }; comp?: number | null;
    lensTable?: Array<{ lens: string; spread: number; off: number; n: number; comp: number;
      cross?: number; stress?: number | null; np?: number | null; rank?: number }> | null;
    /* 그린 그림을 잰 자 셋 — 얽힘(읽히기) · stress(전체 충실도) · 이웃 지킴(가까운 것) */
    draw?: { cross: number; stress: number | null; np: number | null; pairs: number; links: number; nodes: number;
      /* 자리를 다시 잡았나 — 매어 둔 채 stress 를 줄였나, 원래 자리 그대로인가 */
      anchored?: { used: boolean; lambda: number | null; moved: number; rose: number | null;
        trail: number[] | null;
        before: { cross: number; stress: number | null; np: number | null; xy?: Array<[number, number]> };
        table: Array<{ lambda: number; cross: number; stress: number | null; np: number | null;
          moved: number; rose: number; better: number; worse: number }> } | null } | null;
    /* 눈금 사다리 — 조각이 어느 눈금 구간에서 사는가 (Multiscale Mapper) */
    /* 흔든 스무 판을 그림째로 — 화면이 400ms 씩 돌려 보여 준다 (HOPs) */
    hops?: Array<{ nodes: Array<[number, number, number]>; links: Array<[number, number]> }> | null;
    tower?: { overlap: number; lens: string; bins: number[];
      loopByBins?: Array<{ bins: number; loops: number }>;
      counts: Array<{ bins: number; comps: number }>;
      bars: Array<{ from: number; to: number; span: number; size: number; died: number | null }>;
      full: number; once: number } | null;
    wobble?: { comp: [number, number]; off: number } | null;
    /* 글을 열에 하나씩 빼고 스무 판 다시 지었을 때 — 조각 수 분포와 마디마다 살아남은 비율 */
    /* 고리(H1) — 자료 안의 순환. 마구 섞은 점의 고리 수를 나란히 싣는다. */
    h1?: { rank: number; comps: number; shortest: number; loops: number[][];
      rand?: { rank: number; nodes: number; links: number } } | null;
    confidence?: { runs: number; keep: number; same: number;
      curve?: Array<{ at: number; mine: number; rand: number; gap: number }>;
      baseline?: number; ratio?: number | null;
      comps: Array<[number, number]>; mode: number | null; modeRuns: number;
      survival: number[]; full: number; shaky: number; min: number | null; mean: number | null } | null };
  type Tile = { side: number; cells: Array<{ i: number; j: number; n: number; name: string }> };
  /** **관심도(DOI)** — 예산 안에서 연결된 것만 남기는 고르기를 재 본 표. 졌으면 진 대로 싣는다. */
  type Doi = { used: boolean; why: string; S: number; k: number; alpha: number; hopCost: number;
    recall: number; zero: number; cosine: number; rand: number; want: number; missed: number;
    inner: boolean; flat: boolean; pick: number; test: number; margin: number;
    sweep: Array<{ alpha: number; recall: number }>;
    /* 자료 미달로 못 잰 판 — 이때는 위 수들이 없다. */
    tooFew?: { focuses: number; pick: number; test: number; needPick: number; needTest: number } };
  /** **씨앗 떨림** — 같은 손잡이로 씨앗만 바꿔 여러 판 구웠을 때 자리가 얼마나 달라지나. */
  type Wobble = { m: number; n: number; med: number; p90: number; nullMed: number; nullP90: number;
    ratio: number; single: number; splitGap: number; keep: number; keepP10: number; nullKeep: number;
    at: Array<{ m: number; gap: number }> };
  /** **초기화 사다리** — 자리를 물려주는 초기값을 바꿔 보고 잰 표. 졌으면 진 대로 싣는다. */
  type InitLadder = { used: boolean; ceiling: number; base: number; margin: number;
    table: Array<{ name: string; r: number }>; top: string[];
    sabotage: { points: number; vectors: number };
    plumbing: { differs: boolean };
    winner: { name: string; runs: number; r: number; rLo: number; rHi: number; wobble: number; keep: number } | null;
    control: { name: string; r: number; rLo: number; rHi: number; wobble: number; keep: number } | null };
  /** **고유차원** — 이 무더기가 몇 차원짜리인가. 2차원 종이에 담기는가. */
  type Idim = { ambient: number; n: number; id: number;
    ours: { twoNN: number; naive: number; mle: Array<{ k: number; id: number }> };
    shuffled: { twoNN: number; mle: Array<{ k: number; id: number }> };
    noise: { twoNN: number; mle: Array<{ k: number; id: number }> };
    calibration: Array<{ truth: number; twoNN: number; mle: number }> };
  /** **나무 같은 정도(δ-쌍곡성)** — 굽은 2차원이 도움이 될 자료인가. */
  type Delta = { n: number; dim: number; where: number; treeLike: boolean; matched: number | null;
    ours: { relMean: number; relMax: number; trials: number };
    shuffled: { relMean: number };
    calibration: Array<{ shape: string; relMean: number; matched?: boolean }> };
  /** **자리 정렬** — 행렬로 그릴 값이 있나, 있으면 어떤 순서로. */
  type Seriation = { worth: boolean; best: string | null; order: number[] | null;
    n: number; of: number; k: number; gain: number; shufGain: number; calGain: number;
    twoSumGain: number; chance: number;
    ours: Array<{ way: string; twoSum: number; profile: number; ar: number }> };
  /** **공개 위험** — 이 파일을 남에게 주면 무엇이 드러나나. */
  type Leak = { maskRate: number; k: number; n: number; masked: number; guessed: number;
    rate: number; commonRate: number; shuffledRate: number; xyRate: number; lift: number };
  /** **공유용 일반화 판** — k 를 키우며 사생활과 값어치를 같이 잰 표. */
  type Share = { chance: number; masked: number; pick: number | null; usable: boolean;
    rows: Array<{ k: number; side: number; cells: number; keptDocs: number;
      attack: number; keepNear: number; randNear: number }> };
  /** **새로 생긴 관심사** — 최근 글이 서로 뭉치나. 좌표가 아니라 이웃으로 잰다. */
  type Novelty = { months: number; known: number; unknown: number; recentMonths: string[];
    clustered: boolean; k: number;
    real: { share: number; near: number; lift: number };
    shuffled: { lift: number };
    lanes: Array<{ lane: string; all: number; recent: number; lift: number }> };
  /** **이어야 할 둘** — 뜻으로 가까운데 사람 링크가 없는 쌍. 시간으로 잘라 평가한다. */
  type Suggest = { skipped?: string;
    /* 자료 미달로 못 잰 판 — 이때는 아래 수들이 없다. */
    tooFew?: { pairs: number; test: number; known: number; need: number };
    pairs: number; test: number; known: number; pool: number;
    pairsAll: number; max: number; useful: boolean; cutMonths: string[];
    real: { map: number; p: Array<{ k: number; rate: number }> };
    rand: { map: number; p: Array<{ k: number; rate: number }> };
    calib?: { better: boolean; baseRate: number; rate: number[]; bins: number[];
      ours: { ece: number; brier: number }; flat: { ece: number; brier: number } } };
  /** **쓰이는가** — 지도가 「다시 손댈 글」을 미리 짚나. git 이 정답을 준다. */
  type Revisit = { skipped?: string; recentMonths: string[]; prevMonths: string[];
    older: number; back: number; base: number; useful: boolean; ks: number[];
    ours: { hits: Array<{ k: number; rate: number }> };
    strict: { hits: Array<{ k: number; rate: number }> };
    buried: { hits: Array<{ k: number; rate: number }> };
    chance: { hits: Array<{ k: number; rate: number }> };
    ages: Array<{ year: string; all: number; back: number; rate: number }> };
  /** **잣대 중복** — 우리가 적는 수들이 서로 같은 말을 하는지. */
  type Zoo = { n: number; runs: number; real: number; eff: number; k: number; dupAt: number;
    names: string[]; label: Record<string, string>;
    clusters: Array<{ members: string[]; rep: string }>;
    dup: Array<{ a: string; b: string; rho: number }>;
    twin: { a: string; b: string; rho: number; same: boolean };
    noiseCtl: { max: number; with: string; limit: number; boots: number; alone: boolean }; sane: boolean };
  /** **지금 손대는 것 주변** — git 을 상호작용 자취로 삼은 관심도. 지도가 보태는지도 잰다. */
  type TaskDoi = { skipped?: string; events: number; dropped: number; droppedFiles: number;
    bulkCut: number; pastEvents: number; older: number; back: number; base: number;
    ks: number[]; useful: boolean; mapAdds: boolean;
    doi: Array<{ k: number; rate: number }>; freq: Array<{ k: number; rate: number }>;
    near: Array<{ k: number; rate: number }>; both: Array<{ k: number; rate: number }>;
    chance: Array<{ k: number; rate: number }> };
  type Atlas = { zoo?: Zoo | null; taskDoi?: TaskDoi | null; revisit?: Revisit | null; suggest?: Suggest | null; novelty?: Novelty | null; share?: Share | null; leak?: Leak | null; seriation?: Seriation | null; delta?: Delta | null; idim?: Idim | null; initLadder?: InitLadder | null; wobble?: Wobble | null; doi?: Doi | null; count: number; embedded: number; lanes: string[]; clusterNames: string[]; levels: Level[]; edges: Array<[number, number]>; buried: number; holes: Hole[]; months: string[]; skeleton: Skeleton | null; tiles?: Tile[];
    twins?: { at: number; pairs: number; marked: number; groups: number } | null;
    umap?: { nn: number; md: number; trust: number; cont: number } | null;
    h0?: { long: number; pieces: number | null; clear: boolean; drop: number; at: number; bars: number[];
      /* 붓스트랩 띠 — 문턱을 눈대중이 아니라 자료가 정한다 */
      boot?: { B: number; alpha: number; c: number; band: number; gap: number; long: number; naive: number;
        spread: number[] } | null;
      /* 이상치에 덜 흔들리는 답 — DTM 무게 여과, 손잡이 m 사다리 */
      dtm?: { ms: number[]; band: number | null; split: number;
        rows: Array<{ m: number; k: number; top: number; gap: number; at: number;
          band: number | null; long: number | null }> } | null;
      signal?: number; bootPieces?: number | null } | null;
    /* 바깥 잣대 — 사람이 붙인 분류(갈래·블로그 categories)와 우리 나눔이 맞나 */
    external?: { rows: Array<{ k: number; of: string; n: number; groups: number; classes: number;
      purity: number; inverse: number; harmonic: number; ari: number; nmi: number;
      randHarmonic: number | null; randAri: number | null; randNmi: number | null }> } | null;
    /* 덩어리가 진짜인가 — 꿋꿋함(거짓 무리)·뭉침(놓친 무리) (Jeon 2022) */
    group?: { k: number; iters: number; walk: number; n: number;
      steady: number; cohesive: number; randSteady: number | null; randCohesive: number | null } | null;
    /* 허브 — 몇 편이 모두의 이웃 자리를 먹나 (Radovanović 2010) */
    hub?: { best?: string | null; rows: Array<{ k: number; best?: string;
      raw: { skew: number; max: number; mean: number; top1: number; orphans: number };
      fixed: { skew: number; max: number; mean: number; top1: number; orphans: number };
      mp?: { skew: number; orphans: number }; snn?: { skew: number; orphans: number } }> } | null;
    /* 어긋남 — 찢김(닮은 글이 흩어짐)과 거짓 이웃(옆에 있어도 남남). 둘뿐이다(CheckViz) */
    warp?: { k: number; fakeMean: number; fakeHalf: number; counted: number;
      tearMean: number | null; tearAll: number } | null;
    /* 써 보는 잣대 — 새 글이 이 덩어리에 속하는지 알아맞힐 수 있나 (ProxAnn 식) */
    prox?: { rows: Array<{ k: number; groups: number; reps: number; auc: number; tau: number; worst: number;
      randAuc: number | null; randTau: number | null }> } | null;
    /* 낱말 침입자 — 이 이름들이 읽히나 (Reading Tea Leaves) */
    intrusion?: { k: number; trials: number; groups: number; words: number; mp: number; chance: number;
      randMp: number; dfMp: number; dfHiMp: number; misses: string[] } | null;
    dense?: { k: number; params: { minSamples: number; minSize: number }; dbcv: number; noise: number; names: string[] } | null;
    mixStat?: { mean: number; alone: number; meet: number; counted: number } | null;
    lonelyStat?: { marked: number; cut: number; candidates: number; overlapBuried: number; k: number; minBytes: number } | null;
    docs: Doc[] };
  type Layout = 'meaning' | 'axis' | 'cluster' | 'lane' | 'skeleton';

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* 덩어리 색. 눈이 먼저 덩어리를 잡아야 「쏠림」이 보인다.
     **색은 늘 가장 성긴 층(6개)을 따른다.** 사람이 구분할 수 있는 범주색은 예닐곱이
     한계라, 촘촘한 층까지 색으로 나누면 거짓말이 된다 — 실측: 층 30 에서 14개 덩어리가
     남과 같은 색이었고 차이가 0도인 짝도 있었다. 세부는 이름표가 맡는다.
     덤으로 당겨도 「내가 있던 큰 동네」가 색으로 남아 길찾기가 쉬워진다.
     색값은 색약이 있어도 갈리는 검증된 여덟 색(Wong)에서 가져왔다. */
  const CLUSTER_COLORS = [
    [230, 159, 0],    // 주황
    [86, 180, 233],   // 하늘
    [0, 158, 115],    // 초록
    [240, 228, 66],   // 노랑
    [0, 114, 178],    // 파랑
    [213, 94, 0],     // 주홍
    [204, 121, 167],  // 분홍
    [140, 140, 140],  // 회색
  ];
  const rgbOf = (n: number | null): number[] => CLUSTER_COLORS[(n ?? 0) % CLUSTER_COLORS.length];
  const paint = (n: number | null, alpha: number, dim = false): string => {
    const [r, g, b] = rgbOf(n);
    const k = dim ? 0.45 : 1;
    return `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${alpha})`;
  };


  /**
   * **지형 — 높이 = 몰린 정도, 경계는 없다** (ThemeScape, Wise 외 SPIRE/PNNL 1995).
   *
   * ★ 우리 수는 「구획이지 무리가 아니다」라고 말한다 — 표준화 중심거리 0.13~0.59,
   * 꿋꿋함 0.121. 그런데 화면은 **덩어리마다 색을 칠해** 「여기부터 저기까지가 한 무리」를
   * 주장하고 있었다. 글과 그림이 반대말을 하는 중이었다.
   *
   * ThemeScape 의 답: **선을 긋지 말고 높이를 그려라.** 등고선은 「여기가 빽빽하다」만
   * 말하고 「여기서부터 남이다」는 말하지 않는다 — 우리 자료에 정직한 유일한 그림이다.
   *
   * 밀도는 칸에 세어 넣고 **상자 흐리기 세 번**으로 뭉갠다(가우시안 근사, O(칸)).
   * 등고선은 marching squares — 네 귀퉁이의 높낮이로 칸마다 선분을 낸다.
   */
  type Field = { side: number; g: Float64Array; max: number; mid: number };

  function blurPass(g: Float64Array, side: number, r: number): void {
    const tmp = new Float64Array(g.length);
    for (let j = 0; j < side; j += 1) {           // 가로
      for (let i = 0; i < side; i += 1) {
        let s = 0; let n = 0;
        for (let k = -r; k <= r; k += 1) {
          const x = i + k;
          if (x < 0 || x >= side) continue;
          s += g[j * side + x]; n += 1;
        }
        tmp[j * side + i] = s / n;
      }
    }
    for (let i = 0; i < side; i += 1) {           // 세로
      for (let j = 0; j < side; j += 1) {
        let s = 0; let n = 0;
        for (let k = -r; k <= r; k += 1) {
          const y = j + k;
          if (y < 0 || y >= side) continue;
          s += tmp[y * side + i]; n += 1;
        }
        g[j * side + i] = s / n;
      }
    }
  }

  /** 화면 칸마다 점을 세고 흐려서 높이 밭을 만든다. pts 는 0~1 로 정규화된 자리. */
  function densityField(pts: Array<[number, number]>, side: number): Field {
    const g = new Float64Array(side * side);
    for (const [ux, uy] of pts) {
      if (!(ux >= 0 && ux <= 1 && uy >= 0 && uy <= 1)) continue;
      const i = Math.min(side - 1, Math.floor(ux * side));
      const j = Math.min(side - 1, Math.floor(uy * side));
      g[j * side + i] += 1;
    }
    const r = Math.max(2, Math.round(side / 18));
    blurPass(g, side, r); blurPass(g, side, r); blurPass(g, side, r);
    let max = 0;
    for (let k = 0; k < g.length; k += 1) if (g[k] > max) max = g[k];
    const sorted = Array.from(g).sort((a, b) => a - b);
    return { side, g, max, mid: sorted[Math.floor(sorted.length / 2)] };
  }

  /** 높이 h 위에 뜬 칸이 **몇 덩어리**인가 = 봉우리 수. 선을 긋는 게 아니라 세기만 한다. */
  function peaksAt(f: Field, h: number): number {
    const { side, g } = f;
    const seen = new Uint8Array(g.length);
    let n = 0;
    for (let s = 0; s < g.length; s += 1) {
      if (seen[s] || g[s] < h) continue;
      n += 1;
      const q = [s]; seen[s] = 1;
      for (let p = 0; p < q.length; p += 1) {
        const c = q[p]; const ci = c % side; const cj = (c - ci) / side;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
          const ni = ci + di; const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= side || nj >= side) continue;
          const nx = nj * side + ni;
          if (seen[nx] || g[nx] < h) continue;
          seen[nx] = 1; q.push(nx);
        }
      }
    }
    return n;
  }

  /** marching squares — 높이 h 의 등고선을 칸 좌표(0~side) 선분으로 낸다. */
  function contourAt(f: Field, h: number): Array<[number, number, number, number]> {
    const { side, g } = f;
    const segs: Array<[number, number, number, number]> = [];
    const at = (i: number, j: number): number => g[j * side + i];
    /* 두 귀퉁이 사이에서 h 가 지나는 자리(선형 보간). */
    const cut = (a: number, b: number): number => (Math.abs(b - a) < 1e-12 ? 0.5 : (h - a) / (b - a));
    for (let j = 0; j < side - 1; j += 1) {
      for (let i = 0; i < side - 1; i += 1) {
        const tl = at(i, j); const tr = at(i + 1, j); const br = at(i + 1, j + 1); const bl = at(i, j + 1);
        const code = (tl >= h ? 8 : 0) | (tr >= h ? 4 : 0) | (br >= h ? 2 : 0) | (bl >= h ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const T: [number, number] = [i + cut(tl, tr), j];
        const R: [number, number] = [i + 1, j + cut(tr, br)];
        const B: [number, number] = [i + cut(bl, br), j + 1];
        const L: [number, number] = [i, j + cut(tl, bl)];
        const push = (a: [number, number], b: [number, number]): void => { segs.push([a[0], a[1], b[0], b[1]]); };
        switch (code) {
          case 1: case 14: push(L, B); break;
          case 2: case 13: push(B, R); break;
          case 3: case 12: push(L, R); break;
          case 4: case 11: push(T, R); break;
          case 6: case 9: push(T, B); break;
          case 7: case 8: push(L, T); break;
          case 5: push(L, T); push(B, R); break;      // 안장 — 두 선분
          case 10: push(L, B); push(T, R); break;
          default: break;
        }
      }
    }
    return segs;
  }


  /**
   * **두드러짐으로 봉우리를 센다** (ToMATo, Chazal 외 / AuToMATo, arXiv 2408.06958).
   *
   * ★ 전에는 「꼭대기의 55%」에서 잘라 세었다 — **손으로 고른 상수 하나가 답을 만들었다.**
   * ToMATo 의 답: 높은 값부터 훑으며 봉우리를 키우다 **안장에서 만나면 낮은 쪽이 죽는다**
   * (elder rule). 태어나 죽을 때까지가 그 봉우리의 **두드러짐**. 밀도가 서로 다른 봉우리도
   * 갈라낸다 — 고정 높이 자르기가 못 하는 것이다.
   *
   * 무엇이 「진짜 봉우리」인지는 두드러짐을 정렬해 자르는데, 그 문턱마저 손으로 안 고른다:
   * **병목 붓스트랩**으로 낸다(AuToMATo). α 는 논문 기본값 0.35 — 95%가 아니라 **일부러
   * 낮게** 잡는다(격자·밀도추정이 최적이 아닌 것을 상쇄하려고).
   */
  function peakBars(f: Field): number[] {
    const { side, g } = f;
    const n = g.length;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => g[b] - g[a]);
    const parent = new Int32Array(n).fill(-1);
    const birth = new Float64Array(n);
    const find = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]; 
      let c = x; while (parent[c] !== c) { const nx = parent[c]; parent[c] = r; c = nx; } return r; };
    const bars: number[] = [];
    for (const c of order) {
      if (g[c] <= 0) continue;
      const ci = c % side; const cj = (c - ci) / side;
      const roots: number[] = [];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
        const ni = ci + di; const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= side || nj >= side) continue;
        const nx = nj * side + ni;
        if (parent[nx] === -1) continue;          // 아직 안 훑은(낮은) 칸
        const r = find(nx);
        if (!roots.includes(r)) roots.push(r);
      }
      if (!roots.length) { parent[c] = c; birth[c] = g[c]; continue; }   // 새 봉우리
      /* elder rule — 가장 먼저 난(높이 태어난) 쪽이 산다. 나머지는 여기서 죽는다. */
      let elder = roots[0];
      for (const r of roots) if (birth[r] > birth[elder]) elder = r;
      parent[c] = elder;
      for (const r of roots) {
        if (r === elder) continue;
        bars.push(birth[r] - g[c]);               // 두드러짐 = 태어난 높이 − 안장 높이
        parent[r] = elder;
      }
    }
    return bars.sort((a, b) => b - a);
  }

  /** 두 두드러짐 목록의 거리 — 큰 것부터 짝지어 가장 큰 어긋남(병목 어림). */
  function barDist(a: number[], b: number[]): number {
    let d = 0;
    const m = Math.max(a.length, b.length);
    for (let i = 0; i < m; i += 1) d = Math.max(d, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
    return d;
  }

  const PEAK_B = 30;        // 붓스트랩 판 수 (논문 1000 — 화면에서 매 그림마다 도므로 줄였다)
  const PEAK_ALPHA = 0.35;  // 논문 기본값. 95%가 아니라 일부러 65% 영역이다

  /**
   * **문턱을 손으로 안 고른다** — 점을 되뽑아 밭을 다시 만들고, 두드러짐 목록이 얼마나
   * 흔들리는지 잰다. 그 흔들림의 (1−α) 분위수의 두 배를 넘는 봉우리만 진짜다.
   */
  function peaksByProminence(pts: Array<[number, number]>, seed = 4615):
    { peaks: number; cut: number; bars: number[]; runs: number; alpha: number; gap: number } {
    const f = densityField(pts, TERRAIN_SIDE);
    const bars = peakBars(f);
    const norm = f.max > 0 ? bars.map((v) => v / f.max) : bars;
    let s = seed >>> 0;
    const rnd = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const ds: number[] = [];
    for (let b = 0; b < PEAK_B; b += 1) {
      const re: Array<[number, number]> = [];
      for (let i = 0; i < pts.length; i += 1) re.push(pts[Math.floor(rnd() * pts.length)]);
      const rf = densityField(re, TERRAIN_SIDE);
      const rb = peakBars(rf);
      ds.push(barDist(norm, rf.max > 0 ? rb.map((v) => v / rf.max) : rb));
    }
    ds.sort((x, y) => x - y);
    const q = ds[Math.min(ds.length - 1, Math.floor((1 - PEAK_ALPHA) * ds.length))] ?? 0;
    const cut = 2 * q;
    /* 가장 큰 봉우리는 죽지 않는다(끝까지 산다) — 그래서 1을 더한다. */
    const peaks = 1 + norm.filter((v) => v > cut).length;
    let gap = 0;
    for (let i = 0; i + 1 < norm.length; i += 1) gap = Math.max(gap, norm[i] - norm[i + 1]);
    return { peaks, cut: Number(cut.toFixed(4)), bars: norm.slice(0, 8).map((v) => Number(v.toFixed(3))),
      runs: PEAK_B, alpha: PEAK_ALPHA, gap: Number(gap.toFixed(3)) };
  }

  /** 높낮이가 **있기는 한가** — 섞으면 이 값이 떨어져야 지형이 자료의 것이다. */
  function reliefOf(f: Field): number {
    return f.max > 0 ? (f.max - f.mid) / f.max : 0;
  }

  const TERRAIN_SIDE = 64;
  const TERRAIN_CUT = 0.55;   // 봉우리를 세는 높이 (꼭대기의 몇 할)
  const TERRAIN_BANDS = 6;    // 등고선 몇 겹

  /**
   * **바탕값** — 같은 수의 점을 **고르게 흩었을 때**의 높낮이.
   *
   * ★ 이게 없으면 「높낮이 0.58」은 아무 뜻이 없다. 점 1516개를 칸 64² 에 고르게 흩어도
   * 뭉침은 생긴다(푸아송 요동) — 실제로 0.16 쯤 나온다. 우리 수가 그보다 **뚜렷이**
   * 높아야 등고선이 자료의 것이다. 씨앗을 박아 두어 판마다 안 흔들린다.
   */
  function flatRelief(n: number): number {
    let s2 = 987654321;
    const rnd = (): number => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296; };
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < n; i += 1) pts.push([rnd(), rnd()]);
    return reliefOf(densityField(pts, TERRAIN_SIDE));
  }

  /** 자 쪽에서 **같은 코드**로 지어낸 자료를 재 볼 창구. 화면엔 아무 영향 없다. */
  function terrainProbe(pts: Array<[number, number]>): Record<string, unknown> {
    const f = densityField(pts, TERRAIN_SIDE);
    return {
      cutPeaks: peaksAt(f, f.max * TERRAIN_CUT),   // 옛 방식(고정 55% 자르기) — 나란히 견준다
      relief: Number(reliefOf(f).toFixed(3)),
      lines: contourAt(f, f.max * TERRAIN_CUT).length,
      base: Number(flatRelief(pts.length).toFixed(3)),
      ...peaksByProminence(pts),
    };
  }
  (window as unknown as Record<string, unknown>).__atlasTerrainProbe = terrainProbe;

  /* 스타일은 위젯이 직접 넣는다 — 공용 css 파일은 세션 여럿이 같이 만져서
     되감기 사고가 났던 자리다. 한 번만 넣고 다시 안 넣는다. */
  const STYLE_ID = 'memo-atlas-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = [
      '.atlas-wrap{display:flex;flex-direction:column;gap:8px;height:100%;min-height:420px}',
      '.atlas-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
      '.atlas-title{font-weight:600}',
      '.atlas-count{margin-left:auto;font-size:12px;opacity:.65}',
      '.atlas-modes{display:inline-flex;gap:4px}',
      /* display 를 준 것에는 hidden 이 안 먹는다 — 접었는데 그대로 보였다. */
      '.atlas-modes[hidden]{display:none}',
      '.atlas-modes button{padding:4px 10px;font:inherit;font-size:12px;cursor:pointer;',
      'background:transparent;color:inherit;border:1px solid currentColor;border-radius:6px;opacity:.5}',
      '.atlas-modes button.on{opacity:1;background:rgba(127,127,127,.18)}',
      '.atlas-more{padding:4px 10px;font:inherit;font-size:12px;cursor:pointer;background:transparent;',
      'color:inherit;border:1px dashed currentColor;border-radius:6px;opacity:.55}',
      '.atlas-more:hover{opacity:.9}',
      '.atlas-more.on{opacity:.9;border-style:solid}',
      /* touch-action:none — 안 끄면 손가락을 대는 순간 브라우저가 페이지를 대신
         스크롤해서 우리 손짓이 아예 안 온다(폰에서 지도가 안 움직이던 이유). */
      '.atlas-canvas{flex:1;width:100%;min-height:320px;border-radius:10px;touch-action:none;',
      'background:radial-gradient(ellipse at 50% 40%,#12131a,#08090d);cursor:grab}',
      '.atlas-legend{display:flex;flex-wrap:wrap;gap:6px}',
      '.atlas-chip{font-size:11px;padding:2px 8px;border-radius:999px;',
      'color:rgb(var(--c));border:1px solid rgba(var(--c),.5)}',
      '.atlas-card{padding:10px 12px;border-radius:8px;background:rgba(127,127,127,.12)}',
      '.atlas-card-title{font-weight:600;margin-bottom:2px}',
      '.atlas-card-meta{font-size:12px;opacity:.7}',
      '.atlas-card-path{font-size:11px;opacity:.5;margin-top:4px;word-break:break-all}',
      '.atlas-open{display:inline-block;margin-top:8px;padding:5px 12px;font-size:12px;',
      'text-decoration:none;color:inherit;background:rgba(0,158,115,.18);',
      'border:1px solid rgba(0,158,115,.6);border-radius:6px}',
      '.atlas-open:hover{background:rgba(0,158,115,.3)}',
      '.atlas-pick{margin-top:10px;padding:6px 14px;font:inherit;font-size:12px;cursor:pointer;',
      'background:rgba(86,180,233,.18);color:inherit;border:1px solid rgba(86,180,233,.6);border-radius:6px}',
      '.atlas-holes{padding:10px 12px;border-radius:8px;background:rgba(255,214,102,.10);',
      'border:1px solid rgba(255,214,102,.35);font-size:12px;line-height:1.7}',
      '.atlas-holes b{font-weight:600}',
      '.atlas-time{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;',
      'background:rgba(127,127,127,.12);font-size:12px}',
      '.atlas-time input{flex:1}',
      '.atlas-find{width:150px;padding:4px 8px;font:inherit;font-size:12px;border-radius:6px;',
      'border:1px solid rgba(148,163,184,.35);background:rgba(15,18,26,.6);color:inherit}',
      '.atlas-near{margin-top:8px;font-size:12px;opacity:.85}',
      '.atlas-near b{font-weight:600;opacity:.7;font-size:11px}',
      '.atlas-vs{margin-top:10px;padding:10px 12px;border-radius:8px;font-size:12px;',
      'background:rgba(15,18,26,.72);border:1px solid rgba(148,163,184,.28)}',
      '.atlas-vs h4{margin:0 0 6px;font-size:12px;font-weight:600}',
      '.atlas-vs table{width:100%;border-collapse:collapse}',
      '.atlas-vs td,.atlas-vs th{padding:3px 6px;text-align:left;vertical-align:top}',
      '.atlas-vs th{opacity:.6;font-weight:500;font-size:11px}',
      '.atlas-vs .mid{opacity:.55}',
      '.atlas-kept{margin-top:6px;font-size:11px;opacity:.6}',
      /* ★ **읽는 법 띠가 지도를 먹는다.** 줄이 늘 때마다 띠가 두꺼워지고 그만큼 캔버스가
         짧아진다 — 그림이 더 빽빽해져서 선 겹침이 19.1% → 20.2% 로 문턱을 넘었다(자가 잡았다).
         바퀴마다 줄이 하나씩 느는 구조라 놔두면 계속 나빠진다. 그래서 **높이를 묶고**
         넘치면 그 안에서 굴린다 — 내용은 다 있고 지도는 안 줄어든다. */
      '.atlas-howto{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:11px;opacity:.72;',
      '  max-height:3.4em;overflow-y:auto;overscroll-behavior:contain}',
      '.atlas-howto b{font-weight:600;opacity:.8}',
      '.atlas-howto span{white-space:nowrap}',
      '.atlas-howto button{margin-left:auto;padding:1px 7px;font:inherit;font-size:11px;cursor:pointer;',
      'background:none;border:1px solid rgba(148,163,184,.35);border-radius:6px;color:inherit;opacity:.8}',
      '.atlas-vs button{margin-top:6px;padding:2px 8px;font:inherit;font-size:11px;cursor:pointer;',
      'background:none;border:1px solid rgba(148,163,184,.35);border-radius:6px;color:inherit}',
      '.atlas-near button{display:block;margin:3px 0 0;padding:2px 0;font:inherit;font-size:12px;',
      'background:none;border:0;color:#7dd3fc;cursor:pointer;text-align:left}',
      '.atlas-time .now{min-width:96px;font-weight:600}',
      '.atlas-holes ol{margin:6px 0 0;padding-left:20px}',
    ].join('');
    document.head.appendChild(el);
  }


  /* 글에는 그림이 없다 — 실측: memo 글 2022개 중 그림 든 글이 2개. 그래서 그림 대신
     **표시 자체**에 뜻을 싣는다. 채널이 겹치면 둘 다 안 읽히므로 갈라 쓴다:
       색   = 어느 덩어리        크기 = 글 길이
       모양 = 어느 갈래에서 왔나  테두리 = 묻혔나
     갈래를 색으로 또 칠하지 않는 이유가 이것이다. */
  /* ★ **갈래마다 명시 등재한다.** 색은 자리 순서(i%8)라 여덟 건너 같은 색이 돌아온다 —
     같은 색 갈래끼리는 여기서 모양을 갈라 (색,모양) 짝을 다르게 만든다. 새 갈래가 생겨
     여기 없으면 동그라미로 떨어져 짝이 겹치고, 채널 예산 자가 빨개진다 — 그게 신호다
     (memo 개편으로 갈래가 11→19 가 되며 실제로 그랬다). */
  const LANE_SHAPE: Record<string, number> = {
    WM: 3,            // 게임 = 세모
    KarmoLab: 4,      // 랩 = 네모
    '욘봇': 5,         // 봇 = 오각
    karmoddrine: 6,   // 우산 = 육각
    '룰': 0,           // 룰 = 동그라미
    '외장뇌': 0,
    '노트': 0,
    '시스템': 4,
    '인생': 3,
    '블로그': 0,
    assistant: 0, learning: 3, stuff: 4,       // 같은 색(0번) 세 갈래
    career: 4,                                  // 노트(0)·WM(3) 과 같은 색
    changes: 0, projects: 4,
    characters: 0, design: 0, hobby: 3,
    'laptop-ops': 0, skills: 3,
  };

  /** 꼭짓점 수가 0 이면 동그라미, 아니면 그 수만큼의 각진 도형. */
  function markPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number): void {
    ctx.beginPath();
    if (!sides) { ctx.arc(x, y, r, 0, Math.PI * 2); return; }
    for (let i = 0; i < sides; i += 1) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
      const px = x + Math.cos(a) * r * 1.15;
      const py = y + Math.sin(a) * r * 1.15;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }


  /** 제목에서 사람이 알아볼 말만 남긴다. 앞의 날짜·일감번호는 다 똑같아서 쓸모없다. */
  function headOf(title: string): string {
    const t = title
      .replace(/^\d{4}-\d{2}-\d{2}[-\s]*/, '')
      .replace(/^TASK-[A-Z]+-\d+(-[A-Z])?[-\s]*/, '')
      .replace(/^bookmark[-\s]*/i, '')
      .trim();
    return (t || title).slice(0, 14);
  }

  /**
   * 내 지도 불러오기 — **서버로 안 보낸다.**
   *
   * 지도 데이터엔 글 제목·경로가 다 들어 있어 공개 레포에 못 담는다(2026-08-21 사고).
   * 그래서 각자 자기 기계에서 굽고, 브라우저가 그 파일을 직접 읽는다.
   *
   * 두 층이다:
   *   ① 파일 손잡이를 기억할 수 있는 브라우저 → 한 번 고르면 다음부터 저절로 뜬다
   *   ② 아닌 브라우저 → 평범한 파일 고르기로 받아 내용을 브라우저 저장소에 넣는다
   * 어느 쪽이든 파일은 이 기계 밖으로 안 나간다.
   */
  const STORE = 'memo-atlas-store';
  const CAN_REMEMBER = typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';

  function openDb(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
      const req = indexedDB.open(STORE, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  /**
   * **「지우지 마라」를 받아 둔다.**
   *
   * 폴백 길(파일 손잡이를 못 쓰는 브라우저 — 파이어폭스·사파리·아이폰)은 지도 내용을
   * 브라우저 저장소에 넣는다. 그런데 브라우저는 자리가 모자라면 그런 저장소를 **말없이
   * 지운다.** `navigator.storage.persist()` 로 허락받은 곳만 건너뛴다.
   *
   * 허락 여부를 화면에 적는다 — 못 받았으면 「지워질 수 있다」고 말해야 한다.
   * 말 안 하면 어느 날 지도가 사라지고 왜 사라졌는지 아무도 모른다.
   */
  let persisted: boolean | null = null;
  /* **한 판에 한 번만 청한다.** 두 번째 부름이 브라우저에서 영영 안 돌아오는 일이 있었고
     (넣을 때 한 번, 띄울 때 한 번 불렀다) 그 바람에 화면에 아무 말도 안 떴다. 답을 쥐고
     다음부터는 그걸 돌려준다. 사람에게 같은 걸 두 번 묻지 않는 것도 덤. */
  let persistAsked: Promise<boolean | null> | null = null;
  function askPersist(): Promise<boolean | null> {
    if (persistAsked) return persistAsked;
    const st = (navigator as unknown as { storage?: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> } }).storage;
    if (!st?.persist) { persistAsked = Promise.resolve(null); return persistAsked; }
    persistAsked = (async () => {
      try {
        const already = await st.persisted?.();
        persisted = already || await st.persist!();
        return persisted;
      } catch { return null; }
    })();
    return persistAsked;
  }

  async function kv<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
    try {
      const db = await openDb();
      return await new Promise<T | null>((res) => {
        const r = fn(db.transaction('kv', mode).objectStore('kv'));
        r.onsuccess = () => res((r.result as T) ?? null);
        r.onerror = () => res(null);
      });
    } catch { return null; }
  }

  /** 지난번에 골라 둔 것이 있으면 그대로 읽는다. 없으면 null. */
  async function loadRemembered(): Promise<unknown | null> {
    if (CAN_REMEMBER) {
      const handle = await kv<FileSystemFileHandle>('readonly', (s) => s.get('handle'));
      if (handle) {
        try {
          const perm = await (handle as unknown as { queryPermission(o: unknown): Promise<string> })
            .queryPermission({ mode: 'read' });
          if (perm === 'granted') return JSON.parse(await (await handle.getFile()).text());
        } catch { /* 파일이 옮겨졌거나 권한이 끊겼다 — 다시 고르게 둔다 */ }
      }
    }
    const text = await kv<string>('readonly', (s) => s.get('text'));
    if (text) { try { return JSON.parse(text); } catch { return null; } }
    return null;
  }

  /** 사람이 파일을 고른다. 고른 것은 기억해 둔다. */
  async function pickAtlas(): Promise<unknown | null> {
    if (CAN_REMEMBER) {
      try {
        const w = window as unknown as { showOpenFilePicker(o: unknown): Promise<FileSystemFileHandle[]> };
        const [handle] = await w.showOpenFilePicker({
          types: [{ description: '지형도 데이터', accept: { 'application/json': ['.json'] } }],
        });
        await kv('readwrite', (s) => s.put(handle, 'handle'));
        await askPersist();
        return JSON.parse(await (await handle.getFile()).text());
      } catch { return null; }     // 사람이 취소했다
    }
    return new Promise((res) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) { res(null); return; }
        const text = await f.text();
        await kv('readwrite', (s) => s.put(text, 'text'));   // 손잡이를 못 쓰니 내용을 둔다
        await askPersist();                                 // 넣자마자 「지우지 마라」를 청한다
        try { res(JSON.parse(text)); } catch { res(null); }
      };
      inp.click();
    });
  }


  function render(root: HTMLElement): void {
    ensureStyle();
    root.innerHTML = [
      '<div class="atlas-wrap">',
      '  <div class="atlas-bar">',
      '    <span class="atlas-title">내 글 지형도</span>',
      '    <span class="atlas-modes">',
      '      <button data-layout="meaning" class="on">뜻자리</button>',
            '      <button data-layout="cluster">덩어리</button>',
      '      <button data-layout="lane">갈래</button>',
      '      <button data-layout="skeleton">뼈대</button>',
      '    </span>',
      /* 첫 화면엔 배치 넷만. 나머지는 접어 둔다 — 열자마자 단추 일곱이면
         「안 열어 보던 걸 열게 한다」는 목적을 스스로 깎는다.
         **접고 끝내지 않는다**: 접힌 자리에 무엇이 들었는지 이름을 적어 둔다.
         너무 깊이 숨겨 아무도 못 찾는 것이 이 방식의 가장 흔한 실패다. */
      '    <button class="atlas-more" data-more="1">더 보기 — 축 · 시간 · 안 만난 조합 · 도드라지게 다섯(묻힘 · 혼자 · 믿음 · 만남 · 뭉친 자리) · 이 글 둘레 · 폰으로 조종</button>',
      '    <span class="atlas-modes atlas-extra" hidden>',
      '      <button data-layout="axis">축</button>',
      '      <button data-buried="1">묻힌 것</button>',
      '      <button data-holes="1">안 만난 조합</button>',
      '      <button data-time="1">시간</button>',
      '      <button data-lie="1">믿음</button>',
      '      <button data-meet="1">만나는 자리</button>',
      '      <button data-lonely="1">혼자</button>',
      '      <button data-dense="1">뭉친 자리</button>',
      '      <button data-ego="1">이 글 둘레</button>',
      '      <button data-diff="1">밀도 차</button>',
      '      <button data-trail="1">궤적</button>',
      /* 폰을 조종기로 — 센서는 **HTTPS 에서만** 온다(iOS 는 누름 안에서 권한까지).
         「잡기」를 누르고 있는 동안만 움직인다(클러치) — 손을 들고 있게 만들지 않는다. */
      '      <button data-matrix="1">행렬</button>',
      '      <button data-terrain="1">지형</button>',
      '      <button data-warp="1">어긋남</button>',
      '      <button data-loop="1">고리 (뼈대에서)</button>',
      '      <button data-hops="1">흔들어 보기 (뼈대에서)</button>',
      '      <button data-phone="1">폰으로 조종</button>',
      '      <button data-grab="1" hidden>잡기 (누르고 기울이기)</button>',
      '    </span>',
      /* 찾는 칸. 점이 1516개인데 특정 글로 가는 길이 없었다 —
         치면 맞는 것만 밝게 두고 나머지는 죽인다. 지우면 도로 다 밝다. */
      '    <input class="atlas-find" type="search" placeholder="찾기 (제목·경로)" aria-label="글 찾기">',
      '    <span class="atlas-count"></span>',
      '  </div>',
      '  <canvas class="atlas-canvas"></canvas>',
      '  <div class="atlas-card" hidden></div>',
      '  <div class="atlas-vs" hidden></div>',
      '  <div class="atlas-howto"></div>',
      '  <div class="atlas-kept" hidden></div>',
      '  <div class="atlas-time" hidden></div>',
      '  <div class="atlas-holes" hidden></div>',
      '  <div class="atlas-legend"></div>',
      '</div>',
    ].join('');

    const canvas = root.querySelector('.atlas-canvas') as HTMLCanvasElement;
    const card = root.querySelector('.atlas-card') as HTMLElement;
    const vsEl = root.querySelector('.atlas-vs') as HTMLElement;
    const howtoEl = root.querySelector('.atlas-howto') as HTMLElement;
    const legend = root.querySelector('.atlas-legend') as HTMLElement;
    const holesEl = root.querySelector('.atlas-holes') as HTMLElement;
    const timeEl = root.querySelector('.atlas-time') as HTMLElement;
    const countEl = root.querySelector('.atlas-count') as HTMLElement;
    const ctx = canvas.getContext('2d')!;

    let atlas: Atlas | null = null;
    let layout: Layout = 'meaning';
    let view = { x: 0, y: 0, scale: 1 };
    let hover: Doc | null = null;
    /* 자리를 못 잡아 안 그린 이름 수. 너무 많으면 층을 잘못 고른 것이다. */
    let droppedLabels = 0;
    /* 손 얹은 점에 붙은 선 수. 카드에 적어 준다 — 「이 글이 몇 군데와 엮였나」. */
    let hoverLinks = 0;
    /* 묻힌 글만 도드라지게 볼지. 기본은 꺼짐 — 평소 지도를 어지럽히지 않는다. */
    let buriedOn = false;
    /* 「이 자리는 못 믿는다」를 켜 놓았나. 384차원을 2차원으로 줄이면 **반드시**
       거짓말이 생긴다 — 문제는 하나 마나가 아니라 **어디서** 하느냐다. 기본은 꺼짐:
       평소에 켜 두면 지도가 경고문으로 뒤덮여 정작 볼 것을 못 본다. */
    let lieOn = false;
    /* 「갈래가 만나는 자리」를 켜 놓았나. 이 지도를 만든 이유가 이것이다 —
       따로 자란 것들이 뜻으로는 맞닿는 자리. 기본은 꺼짐. */
    let meetOn = false;
    /* 「어디에도 안 붙는 글」을 켜 놓았나. 묻힌 것(시간)과 다른 렌즈다 —
       어제 쓴 글이라도 이웃이 없으면 걸린다. 새 씨앗이거나 잘못 쓴 글. */
    let lonelyOn = false;
    /**
     * **궤적** — 달마다의 무게중심을 찍어 잇는다 (내 관심이 어디로 움직였나).
     *
     * 시간 지도의 근본 문제는 「때마다 공간이 달라진다」인데 **우리는 그걸 안 겪는다** —
     * 한 판에 한 번 임베딩하고 판이 바뀌면 지난 그림에 포갠다(어긋남 0.000). 기준틀이
     * 이미 하나라, 시간은 **다시 그릴 일이 아니라 얹을 일**이다.
     *
     * ★ **글이 적은 달은 안 찍는다.** 무게중심은 표본이 적으면 튄다 — 몇 편이냐로 자르지 않고
     * **평균의 오차**(흩어진 정도 ÷ √n)를 재서, 지도 폭의 5%를 넘으면 그 달은 「모른다」로 둔다.
     * 안 찍은 달이 몇인지도 적는다(조용히 빼면 없는 흐름이 보인다).
     */
    const TRAIL_SE = 0.05;                // 평균의 오차가 지도 폭의 이만큼을 넘으면 안 찍는다
    let trailOn = false;
    let trailCache: { key: string; pts: Array<{ m: string; x: number; y: number; n: number }>; skipped: number; moved: number } | null = null;

    function trail(): { pts: Array<{ m: string; x: number; y: number; n: number }>; skipped: number; moved: number } | null {
      if (!atlas || !trailOn) return null;
      const key = `${layout}|${atlas.count}`;
      if (trailCache && trailCache.key === key) return trailCache;
      const by = new Map<string, Array<[number, number]>>();
      for (const d of atlas.docs) {
        if (!d.born) continue;
        const p = placed.get(d.id);
        if (!p) continue;
        if (!by.has(d.born)) by.set(d.born, []);
        by.get(d.born)!.push(unit(p));
      }
      const pts: Array<{ m: string; x: number; y: number; n: number }> = [];
      let skipped = 0;
      for (const m of (atlas.months || [])) {
        const list = by.get(m);
        /* **글 한 편짜리 달은 오차가 0 이 아니라 「모름」이다.** 처음엔 흩어진 정도로만
           걸렀더니 n=1 인 달이 se=0 으로 나와 **가장 못 믿을 점이 가장 확실한 점**으로
           찍혔다(실측: 2020-01·2021-01… 열한 달). 세 편 미만은 아예 안 찍는다. */
        if (!list || list.length < 3) { skipped += 1; continue; }
        const mx = list.reduce((a, q) => a + q[0], 0) / list.length;
        const my = list.reduce((a, q) => a + q[1], 0) / list.length;
        let vx = 0; let vy = 0;
        for (const q of list) { vx += (q[0] - mx) ** 2; vy += (q[1] - my) ** 2; }
        /* 표본 분산은 n−1 로 나눈다 — n 으로 나누면 적은 표본에서 흩어짐을 낮게 본다. */
        const se = Math.sqrt((vx + vy) / (list.length - 1)) / Math.sqrt(list.length);
        if (se > TRAIL_SE) { skipped += 1; continue; }
        pts.push({ m, x: mx, y: my, n: list.length });
      }
      let moved = 0;
      for (let i = 1; i < pts.length; i += 1) moved += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      trailCache = { key, pts, skipped, moved };
      return trailCache;
    }

    /**
     * **밀도 차 지도** — 두 무리를 같은 격자에서 재고 **차이**를 깐다.
     *
     * 갈래 색으로는 「어디에 무엇이 있나」까지만 보인다. 우리가 묻고 싶은 건 그 다음이다:
     * **「블로그엔 썼는데 메모엔 없는 자리」**(생각을 안 적어 둔 곳)와
     * **「메모만 무성하고 글로는 안 낸 자리」**(안 꺼낸 것).
     *
     * ★ **반드시 무리 크기로 나눈다.** 블로그 374 · 메모 1534 라 날것으로 세면 메모가
     * 모든 칸을 이긴다 — 그건 밀도 차가 아니라 「어느 쪽이 더 많나」를 다시 그린 것이다.
     * 각 무리 안에서의 비율(칸의 글 수 / 그 무리 전체)로 견주고, 차이는
     * (pA − pB) / (pA + pB) 로 −1~1 에 맞춘다(둘 다 0 인 칸은 건너뛴다).
     */
    const DIFF_SIDE = 24;                 // 격자 한 변
    const DIFF_STRONG = 0.33;             // 이보다 치우치면 「한쪽이 진하다」고 센다
    const DIFF_MODES: Array<{ name: string; a: string; b: string; pick: (d: Doc) => 0 | 1 | -1 }> = [
      {
        name: '블로그 ↔ 메모',
        a: '블로그', b: '메모',
        pick: (d) => (d.lane === '블로그' ? 0 : 1),
      },
      {
        name: '주운 것 ↔ 내 글',
        a: '주운 것', b: '내 글',
        /* 주운 것 = 갈래가 「북마크」이거나 **파일 이름이 북마크인 것**(예전에 memo 로 옮겨
           적어 둔 것들이 여기 있다 — 처음엔 갈래만 보고 0편으로 셌다). 블로그는 이 견줌에서 뺀다. */
        pick: (d) => (d.lane === '북마크' || /bookmark/i.test(d.id) ? 0 : (d.lane === '블로그' ? -1 : 1)),
      },
    ];
    let diffMode = -1;                    // -1 = 꺼짐
    let diffCache: { key: string; cells: Array<{ i: number; j: number; v: number }>; aCells: number; bCells: number; mixCells: number; empty?: string } | null = null;

    function diffGrid(): { cells: Array<{ i: number; j: number; v: number }>; aCells: number; bCells: number; mixCells: number; empty?: string } | null {
      if (!atlas || diffMode < 0) return null;
      const mode = DIFF_MODES[diffMode];
      const key = `${mode.name}|${layout}|${atlas.count}`;
      if (diffCache && diffCache.key === key) return diffCache;
      const A = new Float64Array(DIFF_SIDE * DIFF_SIDE);
      const B = new Float64Array(DIFF_SIDE * DIFF_SIDE);
      let na = 0; let nb = 0;
      for (const d of atlas.docs) {
        const p = placed.get(d.id);
        if (!p) continue;
        const side = mode.pick(d);
        if (side < 0) continue;                       // 이 견줌에 안 끼는 글
        const [ux, uy] = unit(p);
        const i = Math.max(0, Math.min(DIFF_SIDE - 1, Math.floor(ux * DIFF_SIDE)));
        const j = Math.max(0, Math.min(DIFF_SIDE - 1, Math.floor(uy * DIFF_SIDE)));
        if (side === 0) { A[j * DIFF_SIDE + i] += 1; na += 1; } else { B[j * DIFF_SIDE + i] += 1; nb += 1; }
      }
      /* **한쪽이 비면 견줄 게 없다.** 그대로 그리면 온 지도가 한 색이 되어 「저쪽엔 아무것도
         없다」가 아니라 「이쪽이 다 이겼다」처럼 보인다 — 그건 거짓말이다. */
      if (!na || !nb) {
        diffCache = { key, cells: [], aCells: 0, bCells: 0, mixCells: 0, empty: na ? mode.b : mode.a };
        return diffCache;
      }
      const cells: Array<{ i: number; j: number; v: number }> = [];
      let aCells = 0; let bCells = 0; let mixCells = 0;
      for (let j = 0; j < DIFF_SIDE; j += 1) {
        for (let i = 0; i < DIFF_SIDE; i += 1) {
          const a = na ? A[j * DIFF_SIDE + i] / na : 0;
          const b = nb ? B[j * DIFF_SIDE + i] / nb : 0;
          if (!a && !b) continue;
          const v = (a - b) / (a + b);
          cells.push({ i, j, v });
          if (v > DIFF_STRONG) aCells += 1; else if (v < -DIFF_STRONG) bCells += 1; else mixCells += 1;
        }
      }
      diffCache = { key, cells, aCells, bCells, mixCells };
      return diffCache;
    }

    /**
     * **이 글 둘레** — 고른 글에서 깊이 N 까지의 이웃만 남긴다 (옵시디언의 local graph).
     *
     * 글이 늘면 통짜 그래프는 못 쓰게 된다 — 그때부터 쓸모는 전부 「이 글 둘레」에서 나온다.
     * 우리 이웃은 **두 종류**다: 내가 적어 둔 **링크**와 뜻으로 가까운 **닮은 글**.
     * 둘 다 걸어가되 **갈라서 센다** — 「내가 이어 둔 것」과 「저절로 닮은 것」은 다른 이야기다.
     *
     * 자리는 그대로 둔다(지도를 새로 그리지 않는다) — 외운 자리가 살아 있어야 둘레가 뜻이 있다.
     */
    let egoDepth = 0;                      // 0 = 꺼짐
    let nearAt = -1;                       // 자판으로 닮은 글을 몇 번째까지 돌았나
    /**
     * **어느 글의 닮은 목록을 훑는 중인가.**
     *
     * ★ 이게 없어서 `]` 가 갇혔다 — 매번 **새로 고른 글의** 목록으로 갈아타는 바람에,
     * 서로가 서로의 가장 닮은 글인 짝(A↔B)을 만나면 A→B→A 로 핑퐁했다(실측: 세 번 눌러
     * 두 글). 훑는 **출발점을 붙잡아 두고**, 사람이 다른 길로 글을 고를 때만 놓는다.
     */
    let nearFrom: Doc | null = null;
    let egoCache: { key: string; keep: Set<number>; byLink: number; byNear: number } | null = null;

    /** 글 하나를 **고른다** — 마우스·자판·밖에서 부르는 것이 같은 길을 쓴다. */
    function pickDoc(d: Doc | null, keepWalk = false): void {
      chosen = d;
      if (!keepWalk) { nearAt = -1; nearFrom = d; }
      egoCache = null;
      if (d) showCard(d); else card.hidden = true;
      draw();
    }
    /* 밖에서 고를 창구 — 재는 쪽이 「손으로 눌러 보는」 것과 같은 길로 고를 수 있어야 한다
       (자가 딴 길을 쓰면 그 자는 딴 것을 잰다). */
    (window as unknown as Record<string, unknown>).__atlasPick = (id: string) => {
      pickDoc((atlas?.docs || []).find((x) => x.id === id) || null);
    };

    function egoSet(): { keep: Set<number>; byLink: number; byNear: number } | null {
      if (!atlas || !egoDepth || !chosen) return null;
      const key = `${chosen.id}|${egoDepth}`;
      if (egoCache && egoCache.key === key) return egoCache;
      const idx = atlas.docs.indexOf(chosen);
      if (idx < 0) return null;
      /* 링크는 양방향으로 걷는다 — 「내가 A 에서 B 를 불렀다」는 둘을 잇는 사실이다. */
      const link = new Map<number, number[]>();
      for (const [a, b] of atlas.edges || []) {
        if (!link.has(a)) link.set(a, []);
        if (!link.has(b)) link.set(b, []);
        link.get(a)!.push(b); link.get(b)!.push(a);
      }
      const keep = new Set<number>([idx]);
      const viaLink = new Set<number>();
      const viaNear = new Set<number>();
      let front = [idx];
      for (let step = 0; step < egoDepth; step += 1) {
        const next: number[] = [];
        for (const i of front) {
          for (const j of link.get(i) || []) {
            if (keep.has(j)) continue;
            keep.add(j); viaLink.add(j); next.push(j);
          }
          for (const j of atlas.docs[i]?.near || []) {
            if (keep.has(j)) continue;
            keep.add(j); viaNear.add(j); next.push(j);
          }
        }
        front = next;
      }
      egoCache = { key, keep, byLink: viaLink.size, byNear: viaNear.size };
      return egoCache;
    }

    /* **밀도로 진짜 뭉친 자리**(HDBSCAN). 층(구획)과 다른 것이다 — 층은 모든 글을
       억지로 나누고, 이건 뭉친 몇 군데만 집고 나머지는 「허허벌판」으로 둔다. */
    let denseOn = false;
    let loopOn = false;   // 뼈대에서 고리를 굵게 그린다 (H1)
    let warpOn = false;   // 어긋남을 바탕에 칠한다 (CheckViz)
    let terrainOn = false;  // 등고선 — 높이 = 몰린 정도, 경계는 없다 (ThemeScape)
    /**
     * **행렬 보기** — 자리 대신 **순서**만 쓰는 그릇.
     *
     * 통제 실험(Ghoniem 외, InfoVis 2004)이 말한다: 마디가 스무 개를 넘으면 대부분의
     * 과제에서 행렬이 점-선을 이기고, 점-선이 이기는 건 **「길 찾기」 하나뿐**.
     * 우리는 1918개 점에 점-선인데다 **자리를 못 믿는다**(18차원·씨앗이 정함) — 행렬은
     * 자리를 안 쓰니 그 병이 덜 아프다. 그래서 재 보고(정렬로 얻는 것 35% vs 섞은 자료
     * 14%) **값이 있어서** 만들었다.
     */
    let matrixOn = false;
    /**
     * **어긋남을 바탕에 칠한다** (CheckViz, Lespinats·Aupetit CGF 2011).
     *
     * 차원 줄인 그림의 어긋남은 **두 종류뿐**이다 — **찢김**(원래 가까운데 화면에서 멀어짐)과
     * **거짓 이웃**(원래 먼데 화면에서 붙음). 어긋남은 **점의 성질이 아니라 자리의 성질**이라
     * 점 테두리로 그리면 「이 점이 이상하다」로 읽힌다. 그 자리에 **칠해야** 「여기서는
     * 지도를 믿지 마라」가 된다 — 목적은 **과잉 해석을 막는 것**이다.
     *
     * 두 축의 색: **주황 = 찢김 · 파랑 = 거짓 이웃**(오카베-이토 짝 — 색약 셋에서도 갈린다).
     * 둘 다 낮으면 안 칠한다(성한 자리는 조용해야 한다).
     */
    const WARP_SIDE = 24;
    function warpGrid(): Array<{ i: number; j: number; tear: number; fake: number; n: number }> | null {
      if (!atlas || !warpOn) return null;
      const cells = new Map<string, { i: number; j: number; tear: number; fake: number; n: number }>();
      for (const d of atlas.docs) {
        const p = placed.get(d.id);
        if (!p || d.honest == null) continue;
        const [ux, uy] = unit(p);
        const i = Math.min(WARP_SIDE - 1, Math.max(0, Math.floor(ux * WARP_SIDE)));
        const j = Math.min(WARP_SIDE - 1, Math.max(0, Math.floor(uy * WARP_SIDE)));
        const k = `${i},${j}`;
        const c = cells.get(k) || { i, j, tear: 0, fake: 0, n: 0 };
        c.tear += 1 - (d.honest / 8);
        c.fake += d.fakeOf ? d.fake! / d.fakeOf : 0;
        c.n += 1;
        cells.set(k, c);
      }
      const out = [...cells.values()].filter((c) => c.n >= 2)
        .map((c) => ({ ...c, tear: c.tear / c.n, fake: c.fake / c.n }));
      (window as unknown as Record<string, unknown>).__atlasWarp = {
        side: WARP_SIDE, cells: out.length,
        tear: out.length ? Number((out.reduce((a, c) => a + c.tear, 0) / out.length).toFixed(3)) : 0,
        fake: out.length ? Number((out.reduce((a, c) => a + c.fake, 0) / out.length).toFixed(3)) : 0,
      };
      return out;
    }
    /**
     * **있을 법한 결과 그림(HOPs)** — 흔든 스무 판을 **한 판 400ms**로 돌린다.
     *
     * 정본이 준 값: 한 판 400ms(초당 2.5판) · **판 사이 부드러운 전환은 넣지 않는다**
     * (전환을 넣으면 눈이 「중간 어딘가」를 보게 되어 판마다의 흔들림이 뭉개진다) ·
     * 스무 판이면 8초에 한 바퀴. **사람이 켜야 돈다** — 움직임은 아주 강한 채널이라
     * 저 혼자 돌면 다른 걸 못 읽는다.
     * 움직임을 싫어하는 설정이면 돌리는 대신 **작은 여러 판**으로 늘어놓는다(정본의 다른 형태).
     */
    const HOP_MS = 400;
    let hopsOn = false;
    let hopFrame = 0;
    let hopTimer: ReturnType<typeof setInterval> | null = null;
    const reducedMotion = (): boolean => {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
    };
    const publishHops = (): void => {
      (window as unknown as Record<string, unknown>).__atlasHops = {
        on: hopsOn, ms: HOP_MS, frame: hopFrame,
        frames: atlas?.skeleton?.hops?.length || 0,
        reduced: reducedMotion(),
      };
    };
    /* **견주기.** 덩어리 이름표를 누르면 하나 잡히고, 다른 이름표를 누르면 둘을 견준다.
       과업 유형론(Brehmer & Munzner 2013)에 대 보니 「찾기」 네 칸은 다 찼는데 견주기만
       비어 있었다 — 두 덩어리가 뭐가 다른지 알 길이 이름뿐이었다.
       단추를 새로 안 만든다: 이름표가 이미 화면에 있고, 누를 자리가 곧 그 덩어리다. */
    /* 레포에서 바로 읽었나, 기억해 둔 것에서 왔나. */
    let fromMemory = false;
    let vsA: number | null = null;
    let vsB: number | null = null;
    /* 이웃 갈래가 이만큼 되면 만나는 자리로 친다 (굽는 쪽과 같은 값). */
    const MEET_AT = 1.5;
    /* 못 믿는 자리로 치는 문턱. 닮은 글 8개 중 지도에서 가까운 게 이 수 이하. */
    const LIE_AT = 1;
    /* 시간 손잡이. -1 = 안 씀(전부 똑같이). 그 외 = 그 달만 밝다.
       저절로 흐르게 하지 않는다 — 처음 보는 지도에서 흐르면 어디를 볼지 몰라 놓친다. */
    let timeAt = -1;
    /* 점 옆에 붙인 제목 앞머리 수 — 밖에서 잴 수 있게 남긴다. */
    /* 찾는 말. 빈 문자열 = 안 찾는 중. */
    let query = '';
    /* 고른 글 — 닮은 글로 줄을 긋는다. */
    let chosen: Doc | null = null;
    let labelHeads = 0;
    let labelBoxes: Array<{ c: number; box: [number, number, number, number] }> = [];
    const placed = new Map<string, [number, number]>();
    /* 점이 실제로 놓인 범위. **-1..1 이라고 넘겨짚지 않는다** — 굽는 쪽이 테두리로
       접는 걸 그만두면서(그래야 판마다 안 기어간다) 8%가 자 밖으로 나갔고, 그대로
       두면 화면 밖에 그려져 58개가 안 보였다. 데이터에 맞춰 담는다. */
    let bounds = { x0: -1, x1: 1, y0: -1, y1: 1 };

    /** 놓인 점들을 다 담는 네모를 구한다. 가장자리 점이 잘리지 않게 살짝 여유를 준다. */
    /** 0~1 자리를 화면 자리로 — 격자를 그릴 때 쓴다(점 자리와 **같은 손**). */
    function toScreenUnit(ux: number, uy: number): [number, number] {
      const pad = 26;
      const w = canvas.width - pad * 2;
      const h = canvas.height - pad * 2;
      return [view.x + pad + ux * w * view.scale, view.y + pad + uy * h * view.scale];
    }

    function fitBounds(): void {
      const all = [...placed.values()];
      if (!all.length) { bounds = { x0: -1, x1: 1, y0: -1, y1: 1 }; return; }
      const xs = all.map((p) => p[0]);
      const ys = all.map((p) => p[1]);
      const x0 = Math.min(...xs); const x1 = Math.max(...xs);
      const y0 = Math.min(...ys); const y1 = Math.max(...ys);
      const mx = Math.max(0.02, (x1 - x0) * 0.02);
      const my = Math.max(0.02, (y1 - y0) * 0.02);
      bounds = { x0: x0 - mx, x1: x1 + mx, y0: y0 - my, y1: y1 + my };
    }

    /** 지도 자리 → 0..1 (그리는 쪽이 공통으로 쓴다). */
    function unit(p: [number, number]): [number, number] {
      return [
        (p[0] - bounds.x0) / ((bounds.x1 - bounds.x0) || 1),
        (p[1] - bounds.y0) / ((bounds.y1 - bounds.y0) || 1),
      ];
    }

    /** 배치 규칙마다 자리를 새로 준다. 같은 데이터, 다른 질문. */
    /** 자리를 잡고 **범위를 다시 잰다** — 배치마다 퍼진 정도가 다르다. */
    function computePositions(): void {
      computePositionsInner();
      fitBounds();
    }

    function computePositionsInner(): void {
      if (!atlas) return;
      placed.clear();
      const docs = atlas.docs.filter((d) => d.xy);
      if (layout === 'meaning' || layout === 'skeleton') {
        for (const d of docs) placed.set(d.id, d.xy!);
        return;
      }
      /* 축 배치는 따로 구워 둔 자리를 쓴다. 없는 글은 뜻자리로 대신한다 —
         빈 화면보다 낫다. */
      if (layout === 'axis') {
        for (const d of docs) placed.set(d.id, d.axis || d.xy!);
        return;
      }
      const keyOf = (d: Doc): string => (layout === 'cluster' ? String(d.cluster ?? -1) : d.lane);
      const keys = [...new Set(docs.map(keyOf))].sort();
      const cols = Math.ceil(Math.sqrt(keys.length));
      const rows = Math.ceil(keys.length / cols);
      keys.forEach((key, gi) => {
        const members = docs.filter((d) => keyOf(d) === key);
        const gx = (((gi % cols) + 0.5) / cols) * 2 - 1;
        const gy = ((Math.floor(gi / cols) + 0.5) / rows) * 2 - 1;
        const r = (0.36 / cols) * 2;
        members.forEach((d, i) => {
          /* 덩어리 안에서는 나선으로 흩는다 — 겹쳐서 한 점이 되는 걸 막는다. */
          const a = i * 2.39996;
          const rad = r * Math.sqrt(i / Math.max(members.length, 1));
          placed.set(d.id, [gx + Math.cos(a) * rad, gy + Math.sin(a) * rad]);
        });
      });
    }

    function toScreen(p: [number, number]): [number, number] {
      const pad = 26;
      const w = canvas.width - pad * 2;
      const h = canvas.height - pad * 2;
      const [ux, uy] = unit(p);
      return [
        pad + ux * w * view.scale + view.x,
        pad + uy * h * view.scale + view.y,
      ];
    }

    /** toScreen 의 반대. 화면 어디를 눌렀는지 → 지도의 어느 자리인지. */
    function toMap(sx: number, sy: number): [number, number] {
      const pad = 26;
      const w = canvas.width - pad * 2;
      const h = canvas.height - pad * 2;
      return [
        bounds.x0 + ((sx - pad - view.x) / (w * view.scale)) * (bounds.x1 - bounds.x0),
        bounds.y0 + ((sy - pad - view.y) / (h * view.scale)) * (bounds.y1 - bounds.y0),
      ];
    }


    /**
     * **덩어리 이름을 놓는다** — 큰 것부터, 겹치면 비켜 보고, 그래도 안 되면 버린다.
     *
     * 그리기와 **재기**가 같은 손을 쓰게 밖으로 뺐다. `dry` 로 부르면 자리만 잡아 보고
     * 「몇 개가 들어가고 몇 개가 밀려났나」만 돌려준다 — **당기기 문턱을 재서 고르는 데**
     * 쓴다: ZMLT 가 못 박은 「이름 겹침 0」이 곧 그 문턱이다.
     */
    let nameAnchors: Array<{ name: string; inView: boolean; placed: boolean; vis: number; all: number }> = [];
    let nameOldOff = 0;
    function placeNames(li: number, names: string[], docs: Doc[], dpr: number, dry: boolean):
      { dropped: number; off: number; cover: number } {
      labelBoxes = [];
      let off = 0;
      let ink = 0;
        /**
         * **닻은 「보이는 글들」의 무게중심이다.**
         *
         * ★ 재 보고 고쳤다. 전에는 덩어리의 **모든** 글로 무게중심을 냈다. 그래서 배율 8
         * 에서 이름 30개 중 **1개만** 남았다 — 버려서가 아니라(충돌로 버린 이름은 어느
         * 배율에서도 **0개**였다) 닻이 화면 밖으로 날아가서다. 그 덩어리를 코앞에서
         * 보고 있는데 이름만 없었다. 이건 동적 지도 라벨 3계명의 첫 줄
         * 「당길 때 이름이 사라지면 안 된다」(Been·Daiches·Yap, InfoVis 2006) 위반이다.
         *
         * 고친 규칙 = **화면 안에 있는 그 덩어리의 글들**로만 무게중심을 낸다. 지금 화면
         * 상태만의 함수라 히스토리 독립(R3)도 그대로다.
         */
        const sums = new Map<number, [number, number, number]>();
        /* **옛 방식(모든 글로 무게중심)도 같이 낸다** — 나란히 안 적으면 「0개 사라짐」이
           자랑인지 원래 그런 건지 알 수 없다. 화면엔 안 쓴다, 재는 쪽에서만 쓴다. */
        const whole = new Map<number, [number, number, number]>();
        for (const d of docs) {
          const c = clusterAt(d, li);
          if (c == null) continue;
          const [x, y] = toScreen(placed.get(d.id)!);
          const w = whole.get(c) || [0, 0, 0];
          whole.set(c, [w[0] + x, w[1] + y, w[2] + 1]);
          if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) continue;
          const s = sums.get(c) || [0, 0, 0];
          sums.set(c, [s[0] + x, s[1] + y, s[2] + 1]);
        }
        const all = new Map<number, number>([...whole].map(([c, w]) => [c, w[2]]));
        /* 옛 방식이었다면 닻이 화면 밖으로 나갔을 이름이 몇인가. */
        let oldOff = 0;
        for (const [c, w] of whole) {
          if (w[2] < 3) continue;
          const ox = w[0] / w[2]; const oy = w[1] / w[2];
          if (ox < 0 || oy < 0 || ox > canvas.width || oy > canvas.height) oldOff += 1;
        }
        nameOldOff = oldOff;
        ctx.textAlign = 'center';
        ctx.font = fontPx(13);

        const H = 20 * dpr;
        const placedBoxes: Array<[number, number, number, number]> = [];
        const hits = (b: [number, number, number, number]): boolean =>
          placedBoxes.some((p) => !(b[0] + b[2] < p[0] || p[0] + p[2] < b[0]
            || b[1] + b[3] < p[1] || p[1] + p[3] < b[1]));

        // 큰 덩어리가 먼저 자리를 고른다 — 중요한 이름이 살아남아야 한다
        /* 순서는 **덩어리 전체 크기**로 매긴다 — 보이는 수로 매기면 조금만 밀어도
           순서가 뒤집혀 이름이 자리를 바꾼다(3계명 둘째 줄, 자리 불변). */
        const ordered = [...sums.entries()].sort((a, b) => (all.get(b[0]) || 0) - (all.get(a[0]) || 0));
        let dropped = 0;
        /* **이름마다 「닻이 화면 안인가 · 놓였나」를 남긴다.** 이게 없으면 화면 밖으로
           나가서 사라진 것과 **화면 안에 있는데 버려진 것**을 못 가른다 — 앞의 것은
           당연하고(R1), 뒤의 것만 단조성 위반이다(Been 외 InfoVis 2006 R2). */
        nameAnchors = [];
        for (const [c, agg] of ordered) {
          if (agg[2] < 3) continue;
          const name = names[c];
          if (!name) continue;
          const cx = agg[0] / agg[2];
          const cy = agg[1] / agg[2];
          const w = ctx.measureText(name).width + 12 * dpr;
          // 가운데가 막히면 위·아래·왼·오른 순으로 비켜 본다
          const cands: Array<[number, number]> = [
            [cx, cy], [cx, cy - H * 1.4], [cx, cy + H * 1.4],
            [cx - w * 0.65, cy], [cx + w * 0.65, cy],
            [cx, cy - H * 2.6], [cx, cy + H * 2.6],
          ];
          const inView = cx >= 0 && cy >= 0 && cx <= canvas.width && cy <= canvas.height;
          /**
           * ★ **후보를 만들 때부터 화면 안으로 물린다.**
           *
           * 전에는 자리를 고른 **뒤에** 화면 밖이면 버렸다. 그런데 닻(보이는 글들의 무게중심)은
           * 정의상 늘 화면 안이라, 밖으로 나가는 건 이름표 **상자**뿐이다 — 그 덩어리를 보고
           * 있는데 이름만 사라진다(3계명 첫 줄 위반, 290프레임에 한 번 났다).
           * 물린 자리가 남과 부딪치면 **다음 후보를 물려서** 또 시도한다. 다 부딪쳐야 버린다.
           */
          const fit = (px: number, py: number): [number, number, number, number] => {
            const bx = Math.min(canvas.width - w - 2 * dpr, Math.max(2 * dpr, px - w / 2));
            const by = Math.min(canvas.height - H - 2 * dpr, Math.max(2 * dpr, py - 11 * dpr));
            return [bx, by, w, H];
          };
          let put: [number, number, number, number] | null = null;
          for (const [px, py] of cands) {
            const box = fit(px, py);
            if (!hits(box)) { put = box; break; }
          }
          if (!put) { dropped += 1; nameAnchors.push({ name, inView, placed: false, vis: agg[2], all: all.get(c) || 0 }); continue; }
          /* 화면보다 넓은 이름표는 물려도 밖으로 삐져나온다 — 그건 진짜로 못 놓는 것이다. */
          if (put[0] + put[2] < 0 || put[0] > canvas.width || put[1] + put[3] < 0 || put[1] > canvas.height) {
            off += 1; nameAnchors.push({ name, inView, placed: false, vis: agg[2], all: all.get(c) || 0 }); continue;
          }
          nameAnchors.push({ name, inView, placed: true, vis: agg[2], all: all.get(c) || 0 });
          placedBoxes.push(put);
          labelBoxes.push({ c, box: put });
          ink += put[2] * put[3];
          if (dry) continue;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(put[0], put[1], put[2], put[3]);
          /* 이름표는 흰 글씨로 통일한다 — 이름은 지금 층인데 색은 성긴 층이라
             둘을 색으로 묶으면 어긋난 짝을 보여주게 된다. */
          ctx.fillStyle = 'rgba(240,244,250,0.95)';
          ctx.fillText(name, put[0] + put[2] / 2, put[1] + 15 * dpr);
        }
      return { dropped, off, cover: canvas.width * canvas.height ? ink / (canvas.width * canvas.height) : 0 };
    }

    /** 그 자리가 화면 한가운데 오게 옮긴다. */
    function centerOn(mx: number, my: number): void {
      const pad = 26;
      const w = canvas.width - pad * 2;
      const h = canvas.height - pad * 2;
      const [ux, uy] = unit([mx, my]);
      view.x = canvas.width / 2 - (pad + ux * w * view.scale);
      view.y = canvas.height / 2 - (pad + uy * h * view.scale);
    }

    /* 멀리서 보면 큰 덩어리 몇 개, 당기면 그게 갈라진다.
       한 화면에 이름이 스물씩 뜨면 못 읽고, 여섯만 뜨면 뭉툭하다. */
    /* 층이 바뀌면 덩어리 번호가 딴 뜻이 된다 — 잡아 둔 것을 놓는다. */
    let lastLevel = -2;
    function forgetVsOnLevelChange(li: number): void {
      if (li !== lastLevel) {
        lastLevel = li;
        if (vsA != null || vsB != null) { vsA = null; vsB = null; vsEl.hidden = true; }
      }
    }

    /**
     * **당기면 층이 바뀐다 — 문턱은 박지 않고 잰다** (TASK-KAR-233).
     *
     * 뜻 있는 당기기(semantic zoom)의 요점은 「그냥 커진다」가 아니라 **내용이 뜻을 바꾼다**
     * 이다. 우리는 이미 배율로 층을 갈랐지만 문턱이 **1.6·3.2 로 박혀** 있었다.
     * ZMLT 가 못 박은 제약이 그대로 문턱이 된다: **이름이 겹치지 않고 다 들어가는 가장 이른
     * 배율**부터 그 층을 보여 준다. 그래서 층마다 그 배율을 이분법으로 **재서** 고른다.
     */
    let switchAt: number[] = [];
    function measureSwitches(): number[] {
      if (!atlas?.levels?.length || !canvas.width) return [];
      const dpr = window.devicePixelRatio || 1;
      const docsAll = atlas.docs.filter((d) => placed.has(d.id));
      const save = { x: view.x, y: view.y, scale: view.scale };
      const midX = (bounds.x0 + bounds.x1) / 2;
      const midY = (bounds.y0 + bounds.y1) / 2;
      /* ★ **「이름 겹침 0」은 문턱이 안 됐다.** 재 보니 층 30 의 이름 서른 개가 0.65배에서도
         안 겹친다 — 자리를 일곱 군데나 비켜 보기 때문이다. 겹침은 넉넉히 통과하지만 그 화면은
         읽히지 않는다. 그래서 잣대를 **덮는 넓이**로 바꿨다(이 코드가 이미 쓰던 잣대다 —
         자리 이름 칸도 「화면의 34%가 이름 일곱 개 넘게 되면 못 읽는다」로 골랐다).
         예산은 박지 않는다: **처음 화면(배율 1)에서 가장 성긴 층이 덮던 만큼**이 예산이다 —
         「처음에 편했던 만큼만 덮는다」. 깊은 층은 당겨서 그만큼 한산해질 때 나온다. */
      view.scale = 1;
      centerOn(midX, midY);
      const budget = Math.max(placeNames(0, atlas.levels[0].names, docsAll, dpr, true).cover, 0.0025);
      const out: number[] = [0];
      for (let i = 1; i < atlas.levels.length; i += 1) {
        let lo = 0.4; let hi = 8; let found = 8;
        for (let t = 0; t < 12; t += 1) {
          const mid = (lo + hi) / 2;
          view.scale = mid;
          centerOn(midX, midY);
          const r = placeNames(i, atlas.levels[i].names, docsAll, dpr, true);
          if (r.cover <= budget && r.dropped === 0) { found = mid; hi = mid; } else lo = mid;
        }
        /* 문턱은 층이 깊어질수록 커야 한다 — 아니면 층이 거꾸로 뒤집힌다. */
        out.push(Math.max(Number(found.toFixed(2)), out[i - 1] + 0.01));
      }
      (window as unknown as Record<string, unknown>).__atlasNameBudget = Number(budget.toFixed(4));
      view.x = save.x; view.y = save.y; view.scale = save.scale;
      labelBoxes = [];
      (window as unknown as Record<string, unknown>).__atlasSwitchAt = out;
      return out;
    }

    function levelIndex(): number {
      if (!atlas?.levels?.length) return -1;
      if (!switchAt.length) return view.scale < 1.6 ? 0 : (view.scale < 3.2 ? Math.min(1, atlas.levels.length - 1) : atlas.levels.length - 1);
      let li = 0;
      for (let i = 1; i < switchAt.length; i += 1) if (view.scale >= switchAt[i]) li = i;
      return li;
    }

    function clusterAt(d: Doc, li: number): number | null {
      if (li < 0 || !d.levels) return d.cluster;
      return d.levels[li] ?? d.cluster;
    }

    /** 색만은 늘 가장 성긴 층을 따른다 — 색 수를 사람이 구분 가능한 범위에 묶어 둔다. */
    function colorGroup(d: Doc): number | null {
      if (!atlas?.levels?.length || !d.levels) return d.cluster;
      return d.levels[0] ?? d.cluster;
    }

    /**
     * **읽는 법** — 지금 화면이 쓰는 눈금만 적는다.
     *
     * 세어 보니 눈금이 여덟인데(자리·색·크기·모양·테두리·밝기·흰 선·주황 점선) 화면이
     * 설명하는 건 범례의 색 하나뿐이었다. 나머지 일곱은 코드 주석에만 있었다.
     *
     * 안내는 **복잡한 그림에서만** 값이 있고, 있을 땐 **글로 된 인라인**이 제일 빨랐다 —
     * 스크롤 안내 41초 < 단계별 50초 < 없음 58초 ≒ 동영상 58초(Stoiber 외 2022, 596명).
     * 그래서 동영상도 모달 투어도 안 만든다. 한 줄 띠면 된다.
     *
     * **안 쓰는 눈금은 안 적는다.** 뼈대 배치엔 크기·모양이 없다 — 적으면 그게 거짓말이다.
     */
    /**
     * 이 층을 **뭐라고 부를까** — 「덩어리」인가 「구획」인가.
     *
     * 자 **둘**로 잰다. 실루엣(거리 기반)은 어느 층도 0.06 을 못 넘었고, DBCV(밀도 기반)는
     * 아예 음수였다(-0.22~-0.30). 즉 통계적으로는 **무리랄 게 없다** — 연속된 구름을
     * 자른 것이다. 그런데도 화면이 「덩어리」라 부르면 없는 경계를 있다고 말하는 셈이다.
     * 기능은 그대로 두고 **말만 정직하게** 바꾼다.
     *
     * 자 하나로 안 재는 이유: 실루엣은 거리만 보고 밀도를 안 본다 — 우리 같은 모양에서는
     * 「무리가 없다」와 **「이 자로는 못 잰다」**를 못 가른다. 둘이 엇갈리면 그것도 적는다.
     */
    const SIL_REAL = 0.15;
    const DBCV_REAL = 0.3;   // 지어낸 눈금: 뚜렷이 갈린 셋 0.91 · 자른 구름 -0.04
    function levelNow(): Level | null {
      const li = levelIndex();
      return li >= 0 ? (atlas?.levels?.[li] ?? null) : null;
    }
    /** 자 둘이 서로 다른 말을 하나 — 그럼 그 사실을 적는다(한쪽만 믿지 않는다). */
    function rulersSplit(): boolean {
      const lv = levelNow();
      if (!lv || lv.sil == null || lv.dbcv == null) return false;
      return (lv.sil < SIL_REAL) !== (lv.dbcv < DBCV_REAL);
    }
    /** 이 덩어리 이름이 **남의 무리에서 더 잘 맞나** (응집도로 견줘 둔 것). */
    function offName(ci: number): boolean {
      const f = levelNow()?.fit?.names?.[ci];
      return !!(f && f.own != null && f.other != null && f.own <= f.other);
    }

    function groupWord(): string {
      const lv = levelNow();
      if (!lv || lv.sil == null) return '덩어리';
      const loose = lv.sil < SIL_REAL && (lv.dbcv == null || lv.dbcv < DBCV_REAL);
      return loose ? '구획' : '덩어리';
    }

    /**
     * **채널 예산** — 색·모양이 감당할 가짓수와 자료의 가짓수를 맞춘다 (Munzner 의 구별 가능성).
     *
     * 색은 여덟(Wong)뿐이라 갈래가 **열**이면 두 갈래가 남과 같은 색이 된다(나머지 연산).
     * 모양도 마찬가지로 겹친다(동그라미가 넷). 그래도 **(색, 모양) 짝**이 모두 다르면
     * 둘을 같이 보고 가를 수 있다 — 그게 두 채널을 같이 쓰는 이유다.
     * 그러니 재야 할 것은 「색이 겹치나」가 아니라 **「짝까지 겹치나」**이고,
     * 색만으로 안 갈리면 화면이 그렇게 말해야 한다(모르면 색만 보고 같은 갈래로 읽는다).
     */
    /**
     * **글자 크기는 한 손에서 나온다** — 브라우저 글자 크기를 따르고(rem), 12px 밑으로 안 간다.
     *
     * 접근성 정본(Chartability 짧은 목록)이 두 가지를 못 박는다: 글자는 **12px 이상**,
     * 그리고 **사용자가 키운 글자 크기를 존중**해야 한다. 우리는 캔버스에 `10 * dpr px` 처럼
     * 박아 두고 있었다 — 작고, 키워도 안 커진다(캔버스라 CSS 가 안 닿는다).
     * 그래서 뿌리 글자 크기를 읽어 배율로 쓰고, 바닥을 12 로 둔다.
     */
    const fontsUsed = new Set<number>();
    function fontPx(base: number): string {
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const css = Math.max(12, base * (rootPx / 16));
      fontsUsed.add(Math.round(css * 10) / 10);
      const dpr = window.devicePixelRatio || 1;
      return `${css * dpr}px system-ui, sans-serif`;
    }

    function channelBudget(): { groups: number; hues: number; hueClash: number; pairClash: number; where: string } | null {
      if (!atlas) return null;
      if (layout === 'lane') {
        const lanes = atlas.lanes || [];
        const seenHue = new Map<number, string>();
        const seenPair = new Map<string, string>();
        let hueClash = 0; let pairClash = 0;
        lanes.forEach((lane, i) => {
          const hue = i % CLUSTER_COLORS.length;
          const shape = LANE_SHAPE[lane] ?? 0;
          if (seenHue.has(hue)) hueClash += 1; else seenHue.set(hue, lane);
          const key = `${hue}|${shape}`;
          if (seenPair.has(key)) pairClash += 1; else seenPair.set(key, lane);
        });
        return { groups: lanes.length, hues: CLUSTER_COLORS.length, hueClash, pairClash, where: '갈래' };
      }
      const li = levelIndex();
      const k = li >= 0 ? (atlas.levels?.[li]?.k ?? 0) : 0;
      /* 뜻자리·축에서는 색이 **가장 성긴 층**만 따른다(그래서 겹칠 일이 없다). */
      const shown = atlas.levels?.[0]?.k ?? 0;
      return { groups: shown, hues: CLUSTER_COLORS.length, hueClash: Math.max(0, shown - CLUSTER_COLORS.length), pairClash: 0, where: `구획(색은 성긴 층 ${shown})${k && k !== shown ? ` · 지금 층 ${k}` : ''}` };
    }

    function channelsNow(): Array<[string, string]> {
      const out: Array<[string, string]> = [['자리', '뜻이 가까우면 가까이']];
      if (layout === 'skeleton') {
        out.push(['마디', '글 뭉치 하나'], ['이음', '두 뭉치가 글을 나눠 가짐']);
        /* **자 하나로 그림을 판정하면 안 된다.** 자 값을 그대로 둔 채 그림을 아무 모양으로나
           바꿀 수 있고(2025), stress 와 얽힘은 서로 싸운다(2024). 그래서 셋을 다 적는다. */
        const dr = atlas?.skeleton?.draw;
        if (dr) {
          out.push(['그림 자 셋', `얽힘 ${dr.cross}개 · 그린 거리 어긋남 ${dr.stress} (0이 딱 맞음)`
            + ` · 이웃 지킴 ${Math.round((dr.np ?? 0) * 100)}% — 하나만 보면 나쁜 그림도 좋아 보인다`]);
          /* **자리를 다시 잡았으면 반드시 말한다.** 뼈대 마디는 원래 지도 자리에 찍혀 있었다 —
             옮겨 놓고 안 적으면 사람은 뼈대와 뜻자리를 같은 지도로 읽는다. 나빠진 것도 적는다. */
          const an = dr.anchored;
          if (an?.used) {
            const b = an.before;
            out.push(['자리를 다시 잡음', `마디를 **매어 둔 채** 거리 어긋남을 줄였다`
              + ` (${b.stress}→${dr.stress} · 이웃 지킴 ${Math.round((b.np ?? 0) * 100)}→${Math.round((dr.np ?? 0) * 100)}%`
              + ` · 얽힘 ${b.cross}→${dr.cross})`
              + ` — 그 대신 마디가 지도 자리에서 평균 **${Math.round(an.moved * 100)}%** 옮겨졌다.`
              + ` 뜻자리 화면과 같은 자리가 아니다`]);
          } else if (an) {
            out.push(['자리는 그대로', '다시 잡아 봤지만 세 자 중 둘을 좋게 못 만들어 **안 썼다** — 지도 자리 그대로다']);
          }
        }
        /* **눈금을 하나 고른 그림이라는 것**을 말한다 — 여러 눈금에서 사는 조각만 진짜다. */
        const tw = atlas?.skeleton?.tower;
        if (tw && tw.bars.length) {
          const lo = tw.bins[0]; const hi = tw.bins[tw.bins.length - 1];
          out.push(['눈금 사다리', `구간 수를 ${lo}~${hi} 로 바꿔 가며 다시 지어 보면 —`
            + ` 조각 ${tw.full}개는 **전 구간**에서 살고`
            + (tw.bars.length > tw.full
              ? ` 나머지 ${tw.bars.length - tw.full}개는 ${tw.bars.filter((b) => b.span < tw.bins.length).map((b) => `눈금 ${b.from}부터`).join('·')} 갈라져 나온다`
              : ' 갈라져 나오는 조각은 없다')
            + (tw.once ? ` · 눈금 하나에서만 사는 조각 ${tw.once}개(눈금이 만든 것)` : '')]);
        }
        /* **고리는 자랑거리가 아니다.** 마구 섞은 점이 더 많이 낸다 — 그 말을 같이 적는다. */
        /* **흔들림을 글이 아니라 그림으로** — 흔든 판을 그대로 돌려 본다(HOPs). */
        if (atlas?.skeleton?.hops?.length) {
          out.push(['흔들어 보기', `글을 열에 하나씩 빼고 눈금을 밀어 다시 지은 **${atlas.skeleton.hops.length}판**을`
            + ` 한 판 ${HOP_MS}ms 로 돌린다 — 살아남은 비율(수)과 **같은 흔들기**다.`
            + ` 움직임을 줄이는 설정이면 한눈에 늘어놓는다`]);
        }
        const hh = atlas?.skeleton?.h1;
        if (hh) {
          const rr = hh.rand?.rank;
          out.push(['고리', `${hh.rank}개 (가장 짧은 것은 마디 ${hh.shortest}개를 돈다)`
            + (typeof rr === 'number'
              ? ` — 그런데 **자리를 마구 섞은 점이 ${rr}개**를 낸다. 겹치는 구간으로 잇는 셈이라`
                + `${hh.rank > rr * 1.5 ? ' 그래도 우리 쪽이 뚜렷이 많다' : ' 고리는 자료가 아니라 셈이 만든 것이다'}`
              : '')
            + (tw?.loopByBins ? ` · 눈금마다 ${tw.loopByBins.map((c) => c.loops).join('·')}` : '')]);
        }
        const cf = atlas?.skeleton?.confidence;
        if (cf) {
          out.push(['흐린 마디 · 점선', `글을 열에 하나씩 빼고 눈금을 밀어 ${cf.runs}판을 다시 지으면 사라진 적이 있다`
            + ` (${cf.shaky}개 · 나머지 ${cf.full}개는 ${cf.runs}판을 다 버텼다)`]);
          /* **바탕값 없이는 살아남은 비율이 아무 뜻이 없다.** 자리를 마구 섞은 지도도
             이만큼은 살아남는다 — 그걸 안 적으면 「단단한 뼈대」로 읽힌다. */
          if (typeof cf.baseline === 'number') {
            out.push(['바탕값', `자리를 마구 섞은 지도도 ${Math.round(cf.baseline * 100)}% 는 살아남는다`
              + ` — 마디의 상당 부분은 자료가 아니라 **눈금이 만든 것**이다`]);
          }
        }
        return out;
      }
      out.push(['색', `큰 ${groupWord()}`], ['크기', '글 길이'], ['모양', '갈래']);
      if (layout === 'axis') out[0] = ['자리', '전체를 가르는 큰 두 방향'];
      out.push(['흰 선', '손 얹은 글이 부르는 글']);
      if (chosen && chosen.near && chosen.near.length) out.push(['주황 점선', '뜻으로 닮은 글']);
      if (buriedOn) out.push(['노란 테두리', '묻힌 글']);
      /* ★ 이 말이 **수와 어긋나 있었다.** `honest` 는 「닮은 글이 지도에서도 가까운 수」라
         낮다는 건 **닮은 글이 흩어졌다**(찢김)는 뜻이지, 옆 사람이 남남이라는 뜻이 아니다.
         옆 사람이 남남인 것은 **거짓 이웃**이고 그건 따로 잰다(어긋남 바탕). */
      if (lieOn) out.push(['붉은 테두리', '닮은 글이 지도에서 흩어졌다 (찢김)']);
      if (meetOn) out.push(['파란 테두리', '갈래가 만나는 자리']);
      if (lonelyOn) out.push(['보라 테두리', '어디에도 안 붙는 글']);
      if (denseOn) out.push(['초록 테두리', '밀도로 뭉친 자리 (굵을수록 한가운데)']);
      /* **지형** — 우리 수가 「구획이지 무리가 아니다」라고 말하므로, 그림도 선을 안 긋는다. */
      if (terrainOn) {
        const tf = (window as unknown as Record<string, unknown>).__atlasTerrain as
          Record<string, unknown> | undefined;
        out.push(['등고선', `**높이 = 몰린 정도 · 경계는 없다** — 봉우리 ${tf?.peaks ?? '?'}개`
          + ` · 높낮이 ${tf?.relief ?? '?'} (같은 수를 **고르게 흩으면** ${tf?.base ?? '?'})`
          + `. 여기서부터 남이라는 선은 **안 긋는다**`
          + ` — 우리 수가 덩어리들이 실제로 겹쳐 있다고 말하기 때문이다`]);
        /* 봉우리 수가 **어디서 온 값인지** 적는다 — 안 적으면 손으로 고른 상수처럼 읽힌다. */
        out.push(['봉우리 세는 법', `**두드러짐**(안장에서 낮은 쪽이 죽는다)으로 센다`
          + ` — 문턱 ${tf?.cut ?? '?'} 은 **되뽑기 ${tf?.runs ?? '?'}판**으로 낸 값이다(α ${tf?.alpha ?? '?'}).`
          + ` 두드러짐 ${JSON.stringify(tf?.bars ?? [])}`
          + ` · 옛 방식(꼭대기의 ${Math.round(TERRAIN_CUT * 100)}%에서 자르기)이면 ${tf?.cutPeaks ?? '?'}개`]);
      }
      /* 겹치는 글은 렌즈가 아니라 **늘 켜져 있는 사실**이라 여기 적는다. */
      /* **나누지 않고 본 답도 적는다** — 반지름을 키우면 조각이 언제 합쳐지나(H0 지속).
         또렷이 갈리는 자리가 없으면 그렇다고 적는다: 우리 지도의 답이 그거다. */
      /* **색만으로 못 가르는 판이면 그렇게 말한다** — 모르면 색만 보고 같은 갈래로 읽는다. */
      /* **당기면 층이 바뀐다**는 것과 그 문턱이 어디서 왔는지 적는다 — 안 적으면
         화면이 저 혼자 바뀌는 것처럼 보인다(그리고 문턱이 박힌 값인지 잰 값인지 모른다). */
      if (atlas?.levels?.length && switchAt.length > 1) {
        const li2 = levelIndex();
        out.push(['당기면', `지금 층 ${atlas.levels[li2]?.k ?? '?'}`
          + ` — 당기면 갈라진다 (` + atlas.levels.slice(1).map((L, i) => `층 ${L.k}은 ${switchAt[i + 1]}배부터`).join(' · ')
          + `). 문턱은 **이름이 안 겹치고 다 들어가는 가장 이른 배율**을 재서 골랐다`]);
      }
      /* **왜 안 갈리는지** — 「안 갈린다」만 적으면 고칠 수가 없다. 요인 이름으로 말한다.
         그리고 같은 논문의 경고를 같이 적는다: **이런 자동 잣대는 절반쯤 틀린다.** */
      /* ★ **p 값** — 여기까지의 근거는 전부 문턱을 손으로 고른 자이거나 섞은 대조군이었다.
         dip 은 「이 둘 사이에 골짜기가 있나」에 p 를 붙인다. 자 둘(실루엣·DBCV)과 **묻는 게
         다르다**: 앞엣것은 「동떨어진 덩어리인가」, dip 은 「사이에 골짜기가 있는가」. */
      /**
       * ★★ **이 줄이 제일 위에 와야 한다.** 씨앗만 바꿔 여러 판 구워 보니 **자리가 자료의
       * 것이 아니다** — 구조 없는 난수 벡터보다도 더 흔들린다. 반면 **이웃 관계는 자료의
       * 것이다**(우연의 수십 배). 그래서 이 지도에서 믿을 것은 「어디에 있나」가 아니라
       * 「누구 옆에 있나」다. 이걸 안 적으면 화면이 매번 거짓말을 한다.
       */
      const wb = atlas?.wobble;
      if (wb) {
        const dia = Math.SQRT2;      // 자리는 0~1 두 축이라 대각선이 √2 다
        const pct = (v: number): string => (v / dia * 100).toFixed(1) + '%';
        /* 세 갈래로 말한다 — 「반쯤」과 「씨앗의 것」은 다른 말이다. */
        const half = wb.ratio > 0.33;
        const mostly = wb.ratio > 0.6;
        out.unshift([mostly ? '⚠ 자리는 씨앗이 정한다'
          : half ? '⚠ 자리는 반쯤 씨앗이 정한다' : '자리는 자료가 정한다',
          `씨앗만 바꿔 **${wb.m}판**을 구우면 점이 화면 대각선의 **${pct(wb.med)}**씩 움직인다`
          + ` (90분위 ${pct(wb.p90)}). **구조가 아예 없는 난수 벡터로 구우면 ${pct(wb.nullMed)}**`
          + ` — 우리 쪽이 덜 움직이지만 그 **${wb.ratio}배**다.`
          + (mostly ? ' 즉 **자리는 대체로 난수가 정한다.**' : half ? ' 즉 **자리의 절반쯤은 난수가 정한다.**' : '')
          + ` **믿을 것은 이웃 관계** — 화면 이웃 여덟 중 판을 바꿔도 그대로인 비율이`
          + ` **${(wb.keep * 100).toFixed(0)}%** 다(구조 없는 벡터면 ${(wb.nullKeep * 100).toFixed(1)}%,`
          + ` 곧 **${Math.round(wb.keep / Math.max(1e-9, wb.nullKeep))}배**). 그래도 셋 중 둘은 바뀐다.`
          + ` → **「저기 있다」로 읽지 말고 「이 옆에 있다」로 읽어라**`]);
      }
      /**
       * ★★★ **이 줄이 다른 모든 줄의 원인이다.** (그래서 떨림 줄보다 **뒤에** 넣는다 —
       * 둘 다 맨 앞에 끼우므로 **나중에 넣는 쪽이 맨 위**가 된다. 원인이 먼저, 증상이 다음.)
       *
       * 이 글 무더기는 약 18차원이다(그것도 **하한** — 눈금을 보면 추정기가 아래로 치우친다).
       * 그걸 2차원 종이에 눕히고 있다. 그러면 찢김·거짓 이웃·씨앗 떨림·「무리가 아니다」는
       * **고칠 수 있는 결함이 아니라 치러야 하는 값**이다. 이걸 안 적으면 화면이 매번
       * 「고치면 되는 문제」인 척하게 된다.
       */
      const idm = atlas?.idim;
      if (idm) {
        const cal = idm.calibration.find((c) => c.truth === 20);
        out.unshift(['⚠ 이 무더기는 2차원이 아니다',
          `재 보니 **약 ${Math.round(idm.id)}차원**이다`
          + ` (이웃 둘로 재면 ${idm.ours.twoNN} · 이웃 ${idm.ours.mle.map((m) => `${m.k}명이면 ${m.id}`).join(' · ')}).`
          + ` **축을 따로 섞어 상관을 없애면 ${Math.round(idm.shuffled.twoNN)}차원**으로 뛰니, 이 낮은 수는 진짜 구조다.`
          + (cal ? ` 그리고 이건 **하한**이다 — 같은 표본 수로 **${cal.truth}차원인 걸 알고 있는 자료**를 재면`
            + ` ${cal.twoNN}/${cal.mle} 로 낮게 나온다.` : '')
          + ` **${Math.round(idm.id)}차원을 2차원 종이에 눕히면 찢김은 고칠 수 있는 결함이 아니라 치러야 하는 값이다**`
          + ` — 아래의 찢김·거짓 이웃·씨앗 떨림·「무리가 아니다」는 전부 그 대가다`]);
      }
      /* ★ **굽은 2차원으로 도망갈 수 있나** — 18차원을 알고 나면 바로 나오는 질문이다.
         재 봤고 **아니다.** 그 답도 화면에 있어야 다음 사람이 같은 것을 또 해 보지 않는다. */
      /**
       * ★ **이 파일을 남에게 주면 무엇이 드러나나.**
       *
       * 지도 파일은 공개 레포에 안 담긴다. 하지만 다른 기계에서 보려고 **옮기는 순간**
       * 좌표와 이웃이 함께 나간다. 임베딩 역변환 연구가 못 박은 대목 = **짝거리·저차원
       * 투영 같은 파생 정보도 취약하다.** 그래서 재 봤고, **제목을 가려도 소용없었다.**
       */
      /**
       * ★★★ **일깨움에 필요한 건 지도가 아니라 편집 이력이었다.**
       *
       * 앞 바퀴에서 「곧 다시 손댈 글」을 지도로 짚으니 0% 였다. Mylyn 을 따라 **git 을
       * 상호작용 자취**로 삼아(잦기+최근성+감쇠) 다시 재니 상위 10편 중 90% 다.
       * 그런데 거기에 **이웃을 섞으면 오히려 떨어진다** — 지도는 이 일에 안 보탠다.
       * 이건 지도의 패배지만, 적어야 할 패배다.
       */
      /**
       * ★★★ **우리가 적는 수 아홉 개는 사실 몇 개인가.**
       *
       * DR 품질 잣대는 **설계 의도가 실제 거동을 못 맞힌다**(arXiv 2507.02225). 상관 높은
       * 잣대를 여럿 대면 그 성질만 최적화한 쪽으로 평가가 기운다. 우리는 수를 여러 개
       * 적으면서 **그게 여러 개인지 하나인지 재 본 적이 없었다.** 그래서 판 40개 위에서
       * 잣대끼리 상관을 내고 무리를 지어, **효과적 개수**와 **같은 말 하는 쌍**을 적는다.
       */
      const zo = atlas?.zoo;
      if (zo) {
        const L = (k: string): string => zo.label[k] || k;
        /* 심은 대조군 둘은 겹침 수에서 뺀다 — 쌍둥이는 **겹치라고 넣은 것**이라 세면 부풀린다. */
        const isCtl = (k: string): boolean => k === 'noise' || k === 'keep10b';
        const dupReal = zo.dup.filter((d) => !isCtl(d.a) && !isCtl(d.b));
        const top = dupReal.slice(0, 3).map((d) => `${L(d.a)}↔${L(d.b)} ${d.rho}`).join(' · ');
        out.push([zo.eff <= 2 ? '우리 수는 **사실 한둘이다**' : '우리가 적는 수는 몇 개인가',
          `품질 잣대는 **설계 의도와 실제 거동이 다르다** — 그래서 우리 수도 재 봤다.`
          + ` 같은 글 ${zo.n}편에 판 ${zo.runs}개(손잡이 격자·선형·흐린 판)를 굽고 잣대끼리 순위상관을 냈다.`
          + ` **우리 잣대 ${zo.real}개는 사실 ${zo.eff}개다** (1−|ρ| 로 묶은 무리 수).`
          + ` |ρ| ≥ ${zo.dupAt} 인 **같은 말 하는 쌍이 ${dupReal.length}개**${top ? ` — ${top}` : ''}`
          + ` (심은 쌍둥이는 뺐다).`
          + ` 무리: ${zo.clusters.map((c) => `[${c.members.map(L).join(' · ')}]`).join(' ')}.`
          + ` ⚠ 셈이 서는지 **심어서** 봤다 — 같은 잣대를 절반 표본으로 두 번 잰 쌍둥이는 ρ ${zo.twin.rho}`
          + ` 로 ${zo.twin.same ? '같은 무리에 들었고' : '**다른 무리에 갈렸고**'},`
          + ` 판마다 뽑은 **무작위 수**는 어느 잣대와도 최대 |ρ| ${zo.noiseCtl.max}`
          + ` (판 순서를 ${zo.noiseCtl.boots}번 섞어 만든 밴드 ${zo.noiseCtl.limit})`
          + ` 로 **${zo.noiseCtl.alone ? '혼자 무리를 이뤘다' : '남의 무리에 붙었다'}**`
          + ` → **${zo.sane ? '셈이 선다' : '셈이 틀렸다 — 위 수를 믿지 마라'}**`]);
      }
      const td = atlas?.taskDoi;
      if (td && !td.skipped) {
        out.push([td.mapAdds ? '지금 손대는 것 주변' : '재 보고 **안 된 것**: 지도가 보태기',
          `「곧 다시 손댈 글」은 **지도 말고 편집 이력**으로 짚힌다 — git 커밋을 상호작용으로 보고`
          + ` 잦기·최근성·감쇠로 매기면 상위 ${td.ks[0]}편 중 **${Math.round(td.doi[0].rate * 100)}%**`
          + ` (바탕 ${Math.round(td.base * 100)}% · 아무거나 ${Math.round(td.chance[0].rate * 100)}%).`
          + ` 커밋 ${td.events}개 중 **${td.dropped}개는 일괄 커밋이라 뺐다**(한 커밋 ${td.bulkCut}개 초과 · 파일 ${td.droppedFiles}개분).`
          + ` ★ 그런데 **이웃의 관심도를 섞으면 ${Math.round(td.both[0].rate * 100)}% 로 떨어진다**`
          + ` (이웃만 쓰면 ${Math.round(td.near[0].rate * 100)}%). → **이 일에 지도는 아무것도 안 보탠다.**`
          + ` 일깨움이 필요하면 지도가 아니라 **최근에 고친 글 목록**을 봐라`]);
      }
      /**
       * ★★ **쓰이는가.** 개인 정보관리 쪽 고전(Barreau & Nardi 1995)은 냉정하다 —
       * **묵힌 것은 거의 안 보고, 정교한 분류 체계는 번번이 버려진다.** 우리 지도가 정확히
       * 그 「묵힌 것을 위한 정교한 분류 체계」라, 재 봤다. 결과도 냉정했다.
       */
      const rv = atlas?.revisit;
      if (rv && !rv.skipped) {
        const old = rv.ages.filter((a2) => a2.rate === 0).map((a2) => a2.year);
        out.push([rv.useful ? '다시 손댈 글 짚기' : '재 보고 **못 한 것**: 다시 손댈 글 짚기',
          `**묵힌 글은 정말로 안 본다** — 다시 손댄 비율이`
          + ` ${old.length ? `${old[0]}~${old[old.length - 1]}년 글은 전부 **0%**` : ''},`
          + ` ${rv.ages[rv.ages.length - 1]?.year}년 글만 ${Math.round((rv.ages[rv.ages.length - 1]?.rate ?? 0) * 100)}% 다.`
          + ` 그럼 이 지도가 **「곧 다시 손댈 글」을 미리 짚어 줄 수는 있나** — 최근 전에 태어난`
          + ` ${rv.older}편 중 ${rv.back}편(${Math.round(rv.base * 100)}%)이 최근에 손대졌는데,`
          + ` **앞 시기 정보만으로 상위 ${rv.ks[0]}편을 짚으면 ${Math.round(rv.strict.hits[0].rate * 100)}%**`
          + ` (아무거나 짚으면 ${Math.round(rv.chance.hits[0].rate * 100)}% · 우리가 만든 「묻힌 글」로 짚으면`
          + ` ${Math.round(rv.buried.hits[0].rate * 100)}%). → **${rv.useful ? '쓸 만하다' : '못 짚는다.'}**`
          + ` 이웃이 **같은 시기에** 움직였나로 짚으면 ${Math.round(rv.ours.hits[0].rate * 100)}% 지만,`
          + ` 그건 앞날을 맞힌 게 아니라 **지금 손대는 일이 이웃으로 번진다**는 뜻이다`]);
      }
      /* **이어야 할 둘** — 「찾았다」가 아니라 **이만큼 중 몇 등**으로 말한다. */
      const sg = atlas?.suggest;
      if (sg && sg.tooFew) {
        out.push(['재지 못한 것: 이어야 할 둘',
          `사람이 쓴 링크가 모자라 **시간 절단 평가를 못 했다** — 숨길 링크 ${sg.tooFew.test}개`
          + ` · 근거 링크 ${sg.tooFew.known}개 (둘 다 ${sg.tooFew.need}개 초과 필요).`
          + ` 글끼리 링크를 더 이으면 저절로 다시 잰다`]);
      }
      if (sg && !sg.skipped && !sg.tooFew) {
        const at = (k: number): number => Math.round((sg.real.p.find((x) => x.k === k)?.rate ?? 0) * 100);
        const rat = (k: number): number => Math.round((sg.rand.p.find((x) => x.k === k)?.rate ?? 0) * 100);
        out.push([sg.useful ? '이어야 할 둘' : '재 보고 **안 내놓는 것**: 이어야 할 둘,',
          `뜻으로 가까운데 **사람이 쓴 링크가 없는 쌍** — 그게 「이어야 하는데 안 이은 것」이다.`
          + ` 맞는지 **시간으로 잘라** 봤다: 최근 ${sg.cutMonths.join(', ')} 에 쓴 링크 ${sg.test}개를 숨기고`
          + ` 나머지 ${sg.known}개만 보고 후보를 냈더니, 숨긴 링크가 **상위 10등 안에 ${at(10)}%**`
          + ` (상위 1: ${at(1)}% · 상위 50: ${at(50)}% · MAP ${sg.real.map}).`
          + ` **아무 순서로 늘어놓으면 상위 10 안에 ${rat(10)}%** (MAP ${sg.rand.map}).`
          + ` ⚠ 다만 **후보는 한 글당 ${sg.pool}개, 통틀어 ${Math.round(sg.pairsAll / 1000)}천 쌍**이다 —`
          + ` 「찾았다」가 아니라 **이만큼 중 몇 등**으로 읽어야 한다`]);
        /* ★ **확률을 붙일 만한지도 재 봤다** — 붙이면 설득력은 오르지만 효과는 안 오를 수 있다. */
        const C = sg.calib;
        if (C) {
          out.push([C.better ? '이 제안이 맞을 확률' : '재 보고 **안 붙인 것**: 확률',
            `제안 옆에 「이건 ${Math.round(C.rate[0] * 100)}% 맞습니다」를 붙일 수 있다 —`
            + ` 하지만 **그럴듯한 수를 붙이면 수락률만 오르고 결정은 안 좋아질 수 있다**`
            + ` (추천 설명의 목표 중 **설득력과 효과는 서로 어긋난다**).`
            + ` 그래서 그 확률이 **실제와 맞는지** 숨긴 링크를 반으로 갈라 재 봤다:`
            + ` 우리 확률의 어긋남(ECE) **${C.ours.ece}**, **늘 같은 확률(${(C.baseRate * 100).toFixed(2)}%)을 부르면 ${C.flat.ece}**.`
            + ` ${C.better ? '우리 쪽이 더 잘 맞아서 적는다.' : '**우리 쪽이 더 안 맞아서 확률은 안 적고 등수만 적는다.**'}`
            + ` (Brier 는 ${C.ours.brier} vs ${C.flat.brier} 로 우리가 조금 낫다 — 날카롭지만 덜 맞는다는 뜻이다)`]);
        }
      }
      /* **새로 생긴 관심사** — 자리가 아니라 이웃으로 재고, 달을 섞은 대조군을 나란히. */
      const nv = atlas?.novelty;
      if (nv) {
        out.push([nv.clustered ? '새로 생긴 관심사' : '재 보고 **안 적는 것**: 새 관심사',
          `최근 ${nv.recentMonths.length}달(${nv.recentMonths.join(', ')})에 쓴 글끼리 서로 뭉치나 —`
          + ` 최근 글의 이웃 여덟 중 **${Math.round(nv.real.near * 100)}%** 가 최근 글이다`
          + ` (최근 글이 원래 차지하는 몫 ${Math.round(nv.real.share * 100)}% → **${nv.real.lift}배**).`
          + ` **달을 마구 섞으면 ${nv.shuffled.lift}배** 라, 이 뭉침은 자료의 것이다.`
          + (nv.clustered ? ` 몰리는 갈래 — ${nv.lanes.slice(0, 3).map((l) => `**${l.lane}** ${l.lift}배`).join(' · ')}.` : '')
          + ` ⚠ **달을 모르는 글이 ${nv.unknown}편**(${Math.round(nv.unknown / (nv.known + nv.unknown) * 100)}%) 이라 그건 셈에서 뺐다.`
          + ` 그리고 **자리가 아니라 이웃으로 쟀다** — 자리는 절반이 씨앗이 정하므로 그걸로 변화를 재면 난수를 변화로 읽는다`]);
      }
      /* ★ **일반화로도 못 막았다** — 그 표를 지우면 다음 사람이 같은 것을 또 해 본다. */
      const sh = atlas?.share;
      if (sh) {
        const floor = sh.rows.find((r) => r.attack <= sh.chance * 1.05);
        out.push(['재 보고 **못 만든 것**: 남 줄 판',
          `가리는 게 안 되니 **일반화**를 재 봤다 — 개별 자리를 빼고 **격자 칸**만 주고,`
          + ` 글이 k개 미만인 칸은 아예 뺀다(k-익명성). k 를 ${sh.rows[0].k} 에서`
          + ` ${sh.rows[sh.rows.length - 1].k} 까지 키웠는데 공격 적중이`
          + ` ${Math.round(sh.rows[0].attack * 100)}% → ${Math.round((sh.rows[sh.rows.length - 1].attack) * 100)}% 로만 내려간다`
          + ` (우연 ${Math.round(sh.chance * 100)}%).`
          + (floor ? ` 우연에 닿는 건 **칸이 ${floor.cells}개**일 때뿐이고, 바로 그때`
            + ` 값어치도 우연과 같아진다(닮은 글이 곁에 ${Math.round(floor.keepNear * 100)}% ·`
            + ` 우연 ${Math.round(floor.randNear * 100)}%).` : '')
          + ` → **자리 자체가 새는 것이라 굵게 뭉개는 걸로는 못 막는다.**`
          + ` 공짜가 없다 — 남에게 주려면 자리를 아예 빼야 한다`]);
      }
      const lk = atlas?.leak;
      if (lk) {
        out.push(['⚠ 남에게 주면 드러나는 것',
          `이 파일에는 글 ${lk.n}편의 자리와 이웃이 들어 있다. 제목을 ${Math.round(lk.maskRate * 100)}% 가려 놓고`
          + ` **가리지 않은 이웃만으로** 가려진 글의 갈래를 맞혀 봤더니 **${Math.round(lk.rate * 100)}%** 맞혔다`
          + ` (그냥 제일 흔한 갈래를 찍으면 ${Math.round(lk.commonRate * 100)}% · 이웃을 마구 섞으면 ${Math.round(lk.shuffledRate * 100)}%`
          + ` — 우연의 **${lk.lift}배**).`
          + ` **이웃 목록을 아예 빼고 좌표만 줘도 ${Math.round(lk.xyRate * 100)}%** 맞힌다 —`
          + ` 목록을 빼는 것만으로는 못 막는다. → **제목을 가리는 것으로 안전해지지 않는다.`
          + ` 이 파일은 비공개 지식베이스와 같은 급으로 다뤄라**`]);
      }
      /* 행렬은 **자리를 안 쓰는 그릇**이다 — 자리를 못 믿는 우리에겐 그게 요점이다. */
      const sr0 = atlas?.seriation;
      if (sr0) {
        out.push([matrixOn ? '행렬 (자리 대신 순서)' : (sr0.worth ? '행렬로도 볼 수 있다' : '재 보고 **안 만든 것**: 행렬'),
          `마디가 스무 개를 넘으면 대부분의 과제에서 **행렬이 점-선을 이긴다**`
          + ` (일관되게 점-선이 이기는 건 **길 찾기 하나뿐**, Ghoniem 외 InfoVis 2004). 우리는 점이 ${sr0.of}개다.`
          + ` 행렬은 **자리를 안 쓰고 순서만** 쓰니, 우리 병(18차원을 2차원에 눕힘)이 덜 아프다.`
          + ` 재 보니 정렬로 얻는 것이 **${Math.round(sr0.gain * 100)}%** —`
          + ` **축을 섞은 자료에서도 ${Math.round(sr0.shufGain * 100)}% 는 얻으므로**`
          + ` 그게 바탕값이고, 한 줄로 세울 수 있는 지어낸 자료는 ${Math.round(sr0.calGain * 100)}%.`
          + ` ${sr0.worth ? '그래서 **만들었다** — 「행렬」 단추.' : '그래서 **안 만들었다**.'}`
          + ` 우리 지도의 x축도 거의 그만큼 좋은 정렬이다`
          + ` (어긋남 ${sr0.ours.find((r) => r.way === '우리 지도 x축')?.ar} vs 피들러 ${sr0.ours.find((r) => r.way === 'fiedler')?.ar}`
          + ` · 아무 순서나 놓으면 ${sr0.chance})`]);
      }
      const dl = atlas?.delta;
      if (dl) {
        const tree = dl.calibration.find((c) => c.shape === '나무');
        out.push([dl.treeLike ? '나무 같은 정도' : '재 보고 **안 간 길**: 굽은 2차원',
          `평평한 2차원이 모자라면 **굽은 2차원**(쌍곡)으로 옮기는 길이 있다 — 자리가 훨씬 많다.`
          + ` 다만 **나무처럼 뻗은 자료에만** 듣는다. 재 보니 우리 나무 같은 정도는`
          + ` **δ_rel ${dl.ours.relMean}** 인데, 눈금이 나무 ${tree?.relMean ?? 0} ·`
          + ` **우리와 같은 축 ${dl.dim}개짜리 순수 잡음 ${dl.matched}** 다`
          + ` — 즉 우리는 잡음보다도 **${(dl.ours.relMean / Math.max(1e-9, dl.matched ?? 1)).toFixed(1)}배 덜** 나무 같다.`
          + ` **${dl.treeLike ? '굽은 2차원이 도움이 될 자료다' : '굽은 2차원으로 옮겨도 소용없다'}** — 그래서 안 간다.`
          + ` (축을 마구 섞으면 ${dl.shuffled.relMean} 로 **더 작아진다** — 거리가 서로 비슷해지면`
          + ` 이 수는 나무가 돼서가 아니라 **잴 것이 없어서** 작아진다. 그래서 잡음 기준선을 우리 축 수에서 쟀다)`]);
      }
      /* ★ **진 것도 적는다** — 초기화를 바꿔 봤고 사전에 박은 문턱을 못 넘었다. */
      const il = atlas?.initLadder;
      if (il && il.winner && il.control) {
        out.push([il.used ? '자리를 물려준 초기값' : '재 보고 **안 바꾼 것**: 초기값',
          `전역 배치는 최적화가 아니라 **초기값이 물려준다** — 그래서 난수 초기값을`
          + ` 「${il.winner.name}」 로 바꿔 봤다. 고차원 거리와 화면 거리의 상관이`
          + ` ${il.control.r} → **${il.winner.r}** (선형으로 눕힌 천장 ${il.ceiling}).`
          + ` 넘어야 할 폭 ${il.margin} 을 못 넘어 **안 바꿨다**.`
          + ` 다만 **판마다 흔들리는 폭은 확 줄었다** — 상관이 [${il.control.rLo}~${il.control.rHi}]`
          + ` 에서 [${il.winner.rLo}~${il.winner.rHi}] 로, 자리 떨림도 ${il.control.wobble} → ${il.winner.wobble},`
          + ` 이웃 유지는 ${(il.control.keep * 100).toFixed(0)}% → ${(il.winner.keep * 100).toFixed(0)}% 로 **오히려 나아졌다**`]);
      }
      /* ★ **진 것도 적는다.** 관심도(DOI)를 재 봤고 **졌다** — 표를 지우면 다음 사람이
         같은 것을 또 해 본다. 이 프로젝트에서 PaCMAP·MMR 도 같은 자리에 있다. */
      const dd = atlas?.doi;
      if (dd && dd.tooFew) {
        out.push(['재지 못한 것: 관심도',
          `2홉 밖 정답을 가진 초점이 ${dd.tooFew.focuses}개뿐이라 **못 쟀다**`
          + ` (고르기 ${dd.tooFew.pick}/${dd.tooFew.needPick} · 판정 ${dd.tooFew.test}/${dd.tooFew.needTest})`]);
      }
      if (dd && !dd.tooFew) {
        out.push([dd.used ? '무엇을 남길까 (관심도)' : '재 보고 **안 쓴 것**: 관심도',
          `초점에서 **2홉 밖**에 있는 「사람이 손으로 쓴 링크」를 예산 ${dd.S}개 안에서 얼마나 건지나 —`
          + ` 관심도 ${Math.round(dd.recall * 100)}% · 확산 없이 ${Math.round(dd.zero * 100)}%`
          + ` · **지금 방식(가까운 ${dd.S}개) ${Math.round(dd.cosine * 100)}%**`
          + ` · 링크를 마구 다시 이으면 ${Math.round(dd.rand * 100)}%.`
          + (dd.used ? ' 그래서 쓴다' : ` 그래서 **안 쓴다** — ${dd.why}`)]);
      }
      const dp = atlas?.levels?.[levelIndex()]?.dip;
      if (dp && dp.pairs) {
        const top = dp.rows[0];
        out.push(['갈리나 (p 값)', `짝 ${dp.pairs}개 중 **${dp.split}개가 갈린다**`
          + ` (p ≤ ${dp.alpha} · 되뽑기 ${dp.runs}판 · p 바닥 ${dp.floor})`
          + ` — 대조군: **아무 방향**에 투영하면 ${dp.randSplit}개,`
          + ` **한 덩어리를 억지로 쪼개면** ${dp.fakeSplit}/${dp.fakes.length}개.`
          + (top ? ` 가장 뚜렷한 짝 「${top.a}」↔「${top.b}」 dip ${top.dip} (아무 방향이면 ${top.randDip}).` : '')
          + ` **실루엣·DBCV 와 어긋나 보이지만 묻는 게 다르다** —`
          + ` 저쪽은 「동떨어진 덩어리인가」, 이쪽은 「둘 사이에 골짜기가 있는가」다`]);
      }
      const wy = atlas?.levels?.[levelIndex()]?.why;
      if (wy) {
        out.push(['안 갈리는 까닭', `**${wy.why}** — 가장 안 갈리는 짝 「${wy.worst.a}」↔「${wy.worst.b}」`
          + ` (중심 거리가 퍼짐의 ${wy.worst.std}배 · 1보다 작으면 겹친 것)`
          + ` · 늘어짐 ${wy.elongMed} · 이상치 ${(wy.outlierMed * 100).toFixed(1)}%`
          + ` — 다만 이런 자동 잣대는 **그림 800장 대조에서 절반 넘게 틀렸다**(눈으로도 봐라)`]);
      }
      /* **저 덩어리 진짜 있나** — 점 단위 잣대로는 못 재는 것(Jeon 2022).
         화면에서 뭉쳐 보이는 자리를 뽑아 원래 공간에서도 뭉치는지 본다. */
      if (atlas?.group) {
        const g = atlas.group;
        out.push(['덩어리가 진짜인가', `화면에서 뭉친 자리가 원래도 뭉치는 정도 **${g.steady}**`
          + ` · 원래 뭉친 자리가 화면에서도 붙는 정도 **${g.cohesive}**`
          + ` (자리를 마구 섞으면 ${g.randSteady} · ${g.randCohesive})`
          + ` — 섞은 것보단 훨씬 높지만 1 과는 멀다: **눈에 보이는 덩어리를 곧이곧대로 믿지 마라**`]);
      }
      /* **인기 있는 이웃(허브)** — 차원이 높으면 몇 편이 모두의 이웃 자리를 먹고
         나머지는 이웃이 없어진다. 이걸 안 적으면 「닮은 글」 목록을 곧이곧대로 읽게 된다. */
      if (atlas?.hub?.rows?.length) {
        const h8 = atlas.hub.rows.find((r) => r.k === 8) || atlas.hub.rows[0];
        out.push(['인기 있는 이웃', `가장 인기 있는 글이 남의 「닮은 글」 목록에 **${h8.raw.max}번** 뜬다`
          + ` (여덟씩이면 평균 ${h8.raw.mean}번) · **한 번도 안 불리는 글 ${h8.raw.orphans}편**`
          + ` · 쏠림 ${h8.raw.skew}`
          + ` — 거리를 다시 재면 쏠림 ${h8.fixed.skew} · 안 불리는 글 ${h8.fixed.orphans}편`
          + (atlas.hub.best ? ` (셋을 견줘 「${atlas.hub.best}」 가 제일 낫다`
            + (h8.mp ? ` · 상호 근접도 ${h8.mp.skew} · 공유 이웃 ${h8.snn?.skew}` : '') + ')' : '')]);
      }
      /* **어긋남은 늘 적는다** — 켜든 안 켜든, 지도를 얼마나 믿을지가 먼저다. */
      if (atlas?.warp) {
        const wp = atlas.warp;
        out.push(['어긋남', `**찢김** 닮은 글 여덟 중 평균 ${(8 - (wp.tearMean ?? 0) * 8).toFixed(1)}개만 지도에서도 가깝다`
          + ` (하나도 안 남은 글 ${wp.tearAll}개) · **거짓 이웃** 화면 이웃 ${wp.k}개 중`
          + ` ${Math.round(wp.fakeMean * 100)}%는 진짜로는 멀다`
          + `${warpOn ? ' — 바탕의 주황이 찢김, 파랑이 거짓 이웃' : ' — 「어긋남」을 켜면 어디서 그런지 바탕에 칠한다'}`]);
      }
      const bud = channelBudget();
      (window as unknown as Record<string, unknown>).__atlasBudget = bud;
      if (bud && bud.hueClash > 0) {
        out.push(['색 겹침', `${bud.where} ${bud.groups}가지인데 색은 ${bud.hues}가지 — ${bud.hueClash}가지가 남과 같은 색이다`
          + (bud.pairClash ? ` · 모양까지 겹치는 것 ${bud.pairClash}` : ' (모양과 함께 보면 갈린다)')]);
      }
      /* **우리 자 중 유일하게 바깥에 물어보는 것.** 나머지는 다 자기 자신에게만 묻는다.
         셋을 다 적고(하나만 적으면 고르기가 된다) **라벨을 섞은 값**을 나란히 놓는다. */
      const curK = atlas?.levels?.[levelIndex()]?.k ?? -1;
      const ex = atlas?.external?.rows?.filter((r) => r.k === curK) || [];
      /* **지도를 쓰는 방식대로 재 본 것.** 나머지 자는 「나눔이 좋은가」를 묻는데, 이건
         「대표 글 몇 편만 보고 새 글이 여기 속하는지 알아맞힐 수 있나」를 묻는다. */
      const px = atlas?.prox?.rows?.find((r) => r.k === curK);
      if (px) {
        out.push(['써 보면', `대표 글 ${px.reps}편으로 갈래를 잡고 **남겨 둔 글**에 대면`
          + ` ${Math.round(px.auc * 100)}% 를 가려낸다 (찍기 50% · 배정을 마구 섞으면 ${Math.round((px.randAuc ?? 0.5) * 100)}%)`
          + ` · 차례 맞음 ${px.tau} · 가장 나쁜 덩어리 ${Math.round(px.worst * 100)}%`
          + ` — 다만 **판정자가 이 지도를 만든 그 셈**이라 완전한 바깥은 아니다`]);
      }

      for (const r of ex) {
        out.push([`${r.of}와 견주면`, `조화 순도 ${r.harmonic} · ARI ${r.ari} · NMI ${r.nmi}`
          + ` (라벨을 마구 섞으면 ${r.randHarmonic} · ${r.randAri} · ${r.randNmi})`
          + ` — ${r.classes}가지·글 ${r.n}편`]);
      }
      /* **「나눔이 좋은가」가 아니라 「읽히나」.** 우리 자는 전부 앞쪽만 쟀다
         (Reading Tea Leaves: 자동 점수가 높아도 사람이 읽기엔 나쁠 수 있다).
         맞춘 비율은 **찍기 옆에 놓지 않으면 아무 뜻이 없다.** */
      if (atlas?.intrusion) {
        const it = atlas.intrusion;
        const pct = Math.round(it.mp * 100);
        const ch = Math.round(it.chance * 100);
        out.push(['낱말 침입자', `한 덩어리의 말 ${it.words}개에 **남의 말 하나**를 섞어 골라내게 하면`
          + ` ${pct}% 를 맞힌다 (찍기 ${ch}%)`
          + (it.mp > it.chance + 0.05
            ? ` — 찍기보단 낫지만 ${100 - pct}% 는 못 골라낸다`
            : ' — **찍기와 다를 게 없다. 이 이름들은 안 읽힌다**')]);
      }
      /* **문턱을 어디서 얻었나**를 적는다 — 「낙차 1.5배」는 우리가 지어낸 눈대중이었고,
         이제 붓스트랩 띠(재표본 30판의 병목 거리 95% 분위수 × 2)가 잡음 크기를 준다. */
      if (atlas?.h0?.boot) {
        const bt = atlas.h0.boot;
        out.push(['조각 문턱', `잡음 크기 ${bt.band} (재표본 ${bt.B}판으로 잰 붓스트랩 띠)`
          + ` · 막대 사이 가장 큰 낙차 ${bt.gap}`
          + ` → ${bt.long > 0 ? `긴 막대 ${bt.long}개 = 조각 ${bt.long + 1}개` : '어느 자리도 잡음과 못 가른다'}`
          + ` — 문턱은 **재서** 잡았다(옛 「낙차 1.5배」는 지어낸 값이었다)`]);
      }
      /* **이상치에 덜 흔들리는 답도 나란히.** 우리 자료는 HDBSCAN 이 75%를 「어디에도 안
         붙는다」고 하는 이상치 투성이다 — 순수 거리 하나로만 답하면 그 답이 흔들린다. */
      if (atlas?.h0?.dtm?.rows?.length) {
        const dm = atlas.h0.dtm;
        out.push(['이상치에 덜 흔들리는 답', `빽빽한 데서 얼마나 먼가(DTM)로 무게를 줘 다시 재면 —`
          + ` 손잡이 ${dm.ms.length}가지 중 **갈린다고 나온 것 ${dm.split}가지**`
          + ` (낙차 ${dm.rows.map((r) => r.gap).join('·')} · 잡음 크기 ${dm.band})`
          + (dm.split === 0 ? ' — 거리로 본 답과 같다' : '')]);
      }
      if (atlas?.h0) {
        out.push(['조각', atlas.h0.clear
          ? `반지름을 키우면 ${atlas.h0.pieces}조각에서 합쳐진다`
          /* 여기서 「덩어리」라는 말을 쓰지 않는다 — 그 말은 층(구획)의 이름이라
             화면에 두 뜻으로 놓이고, 자도 그걸 층 이름으로 읽는다(실제로 그렇게 빨개졌다). */
          : '어느 반지름에서도 또렷이 안 갈린다 (전부 이어져 있다)']);
      }
      if (atlas?.twins?.marked) out.push(['흐린 점', `거의 같은 글 ${atlas.twins.marked}편 (대표만 또렷)`]);
      if (egoDepth) out.push(['둘레', `고른 글에서 ${egoDepth}칸 안 (링크 + 닮은 글)`]);
      if (trailOn) out.push(['흰 선', '달마다 무게중심 (내 관심이 움직인 길)']);
      if (diffMode >= 0) out.push(['바탕색', `${DIFF_MODES[diffMode].a} 주황 · ${DIFF_MODES[diffMode].b} 파랑 (밀도 차)`]);
      if (timeAt >= 0) out.push(['밝기', '그 달에 생긴 글만 밝게']);
      return out;
    }

    /** 접었나 — 한 번 접으면 다음에도 안 뜬다. */
    function howtoHidden(): boolean {
      try { return localStorage.getItem('atlas-howto') === 'off'; } catch { return false; }
    }

    function refreshHowto(): void {
      const list = channelsNow();
      (window as unknown as Record<string, unknown>).__atlasChannels = list.map(([k]) => k);
      if (howtoHidden()) {
        howtoEl.innerHTML = '<button data-howto-on="1">읽는 법</button>';
        howtoEl.querySelector('[data-howto-on]')?.addEventListener('click', () => {
          try { localStorage.removeItem('atlas-howto'); } catch { /* 안 되면 이번 판만 */ }
          refreshHowto();
        });
        return;
      }
      /* 배치 단추 이름도 같은 말을 쓴다 — 띠는 「구획」이라 하고 단추는 「덩어리」라 하면
         화면이 두 말을 동시에 한다. 층이 바뀔 때마다 여기서 같이 고친다. */
      const layoutBtn = root.querySelector('[data-layout="cluster"]') as HTMLElement | null;
      if (layoutBtn) layoutBtn.textContent = groupWord();
      /* **정본 경고를 화면에 옮긴다.** UMAP 문서가 못 박는 것: 덩어리 **사이 거리는 뜻이 없다**
         (국소 이웃을 맞추지 전역 거리를 맞추는 게 아니다). 손잡이만 적고 이걸 안 적으면
         보는 사람은 「저 둘은 멀리 있으니 아주 다르구나」로 읽는다 — 그건 이 그림이 못 하는 말이다. */
      const um = atlas?.umap;
      const umapSay = um
        ? ` · 자리 잡기 이웃 ${um.nn} · 최소거리 ${um.md} (재서 고름) — 덩어리 사이 거리는 뜻이 없다`
        : '';
      howtoEl.innerHTML = '<b>읽는 법</b>'
        + list.map(([k, v]) => '<span>' + esc(k) + ' = ' + esc(v) + '</span>').join('<span style="opacity:.4">·</span>')
        /* 자 둘이 엇갈리면 **숨기지 않고 적는다** — 한쪽만 골라 말하면 그게 거짓말이다. */
        + (rulersSplit() ? '<span style="opacity:.4">·</span><span>자 둘이 엇갈림 — 거리로는 덜 뭉치고 밀도로는 뭉친다</span>' : '')
        + (umapSay ? '<span style="opacity:.4">·</span><span>' + esc(umapSay.replace(/^ · /, '')) + '</span>' : '')
        + '<button data-howto-off="1">접기</button>';
      howtoEl.querySelector('[data-howto-off]')?.addEventListener('click', () => {
        try { localStorage.setItem('atlas-howto', 'off'); } catch { /* 안 되면 이번 판만 */ }
        refreshHowto();
      });
    }

    function refreshLegend(): void {
      if (!atlas) return;
      const li = levelIndex();
      const names = li >= 0 ? atlas.levels[li].names : atlas.clusterNames;
      /* 범례는 **색이 실제로 뜻하는 것**만 보여준다 = 가장 성긴 층. 지금 보는 층의
         이름은 지도 위에 직접 얹혀 있으므로 여기서 또 늘어놓지 않는다. */
      const base = atlas.levels?.[0]?.names || atlas.clusterNames;
      legend.innerHTML = base
        .map((n, i) => { const [r, g, b] = rgbOf(i);
          return '<span class="atlas-chip" style="--c:' + r + ',' + g + ',' + b + '">' + esc(n) + '</span>'; })
        .join('');
    }

    /**
     * 뼈대 그림 — 점 하나하나 대신 **덩어리와 그 사이 이음**을 그린다.
     * 원본이 쓴 방식이다. 더 정확한 그림이 아니라 **다른 질문에 답하는 그림**이다:
     * 「무엇이 무엇으로 이어지는가」.
     */
    function drawSkeleton(dpr: number): void {
      const sk = atlas?.skeleton;
      if (!sk?.nodes.length) {
        ctx.fillStyle = 'rgba(226,232,240,0.7)';
        ctx.font = fontPx(14);
        ctx.textAlign = 'center';
        ctx.fillText('뼈대를 아직 안 구웠어요', canvas.width / 2, canvas.height / 2);
        return;
      }
      /* **흔들어 보기** — 진짜 그림 대신 흔든 판을 그린다(또는 작은 여러 판으로 늘어놓는다). */
      const hops = sk.hops || [];
      if (hopsOn && hops.length) {
        drawHops(hops, dpr);
        return;
      }
      /* **고리를 켰으면 먼저 굵게 깔아 둔다** — 그 위에 보통 이음과 마디가 온다.
         고리는 자료의 순환일 수도, 셈이 만든 것일 수도 있다(읽는 법 띠가 그걸 말한다). */
      const loops = sk.h1?.loops || [];
      if (loopOn && loops.length) {
        let drawnLoops = 0;
        loops.slice(0, 8).forEach((path, li) => {
          if (path.length < 3) return;
          const [r, g, b] = rgbOf(li);
          ctx.strokeStyle = `rgba(${r},${g},${b},0.75)`;
          ctx.lineWidth = 5 * dpr;
          ctx.beginPath();
          path.forEach((n, i) => {
            const nd = sk.nodes[n];
            if (!nd) return;
            const [x, y] = toScreen(nd.xy);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.closePath();
          ctx.stroke();
          drawnLoops += 1;
        });
        (window as unknown as Record<string, unknown>).__atlasLoopsDrawn = drawnLoops;
      } else {
        (window as unknown as Record<string, unknown>).__atlasLoopsDrawn = 0;
      }
      /* 이음 먼저 — 나중에 그린 마디가 위로 온다. 굵기는 나눠 가진 글 수. */
      ctx.strokeStyle = 'rgba(150,170,210,0.45)';
      for (const [i, j, shared] of sk.links) {
        const [x1, y1] = toScreen(sk.nodes[i].xy);
        const [x2, y2] = toScreen(sk.nodes[j].xy);
        ctx.lineWidth = Math.max(1, Math.min(6, Math.sqrt(shared) / 2)) * dpr;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.font = fontPx(11);
      sk.nodes.forEach((nd, i) => {
        const [x, y] = toScreen(nd.xy);
        /* 마디 크기 = 거기 몰린 글 수. 넓이가 개수에 비례하게 제곱근을 쓴다 —
           지름에 비례시키면 큰 마디가 실제보다 훨씬 커 보인다. */
        const r = Math.max(6, Math.min(46, Math.sqrt(nd.n) * 2.4)) * dpr;
        /* **흔들면 사라지는 마디는 흐리게.** 진하기 = 스무 판 중 살아남은 비율.
           안 흐리게 그리면 「한 판이 만든 마디」와 「자료의 마디」가 똑같이 단단해 보인다.
           살아남은 비율을 안 실은 옛 지도는 다 진하게 그린다(모르는 걸 흐리다고 하지 않는다). */
        const keep = typeof nd.keep === 'number' ? nd.keep : 1;
        ctx.fillStyle = paint(atlas!.lanes.indexOf(nd.lane), 0.18 + 0.54 * keep);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        /* 흔들리는 마디는 테두리도 점선으로 — 색만 흐리면 화면 밝기 탓으로 읽힌다(채널 둘).
           문턱은 안 박는다: **한 판이라도 사라진 적이 있으면** 점선이다. */
        const weak = keep < 1;
        ctx.setLineDash(weak ? [3 * dpr, 3 * dpr] : []);
        /* 점선도 **흐리게** — 하얀 점선은 어두운 바탕에서 오히려 눈에 띈다(자가 잡았다:
           약하게 그렸더니 화면이 11% 더 밝아졌다). 덜 확실한 것이 더 도드라지면 거짓말이다. */
        ctx.strokeStyle = weak ? 'rgba(226,232,240,0.22)' : 'rgba(8,9,13,0.8)';
        ctx.lineWidth = dpr;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = weak ? 'rgba(240,244,250,0.5)' : 'rgba(240,244,250,0.95)';
        ctx.fillText(String(nd.n), x, y + 4 * dpr);
        if (i === 0) { /* 첫 마디에만 뜻을 적는다 — 다 적으면 숫자를 못 읽는다 */ }
      });
      (window as unknown as Record<string, unknown>).__atlasSkeletonConf = sk.confidence
        ? { ...sk.confidence, drawn: sk.nodes.map((n) => (typeof n.keep === 'number' ? n.keep : 1)) }
        : null;
      /* 마디가 **화면 어디에 얼마나 크게** 그려졌나 — 자가 그 자리의 픽셀을 직접 읽어
         「정말 흐린가」를 본다(빛 총량으로 재면 테두리·글자에 속는다). */
      (window as unknown as Record<string, unknown>).__atlasSkeletonNodes = sk.nodes.map((nd) => {
        const [x, y] = toScreen(nd.xy);
        return { x: Math.round(x), y: Math.round(y),
          r: Math.round(Math.max(6, Math.min(46, Math.sqrt(nd.n) * 2.4)) * dpr),
          keep: typeof nd.keep === 'number' ? nd.keep : 1 };
      });
    }

    /** 흔든 판 하나를 그린다 — 진짜 그림과 **같은 자리 셈**을 쓴다(견줄 수 있어야 한다). */
    function drawHopFrame(fr: { nodes: Array<[number, number, number]>; links: Array<[number, number]> },
      dpr: number, box?: [number, number, number, number]): void {
      const put = (xy: [number, number]): [number, number] => {
        const [sx, sy] = toScreen(xy);
        if (!box) return [sx, sy];
        return [box[0] + (sx / canvas.width) * box[2], box[1] + (sy / canvas.height) * box[3]];
      };
      const k = box ? Math.min(box[2] / canvas.width, box[3] / canvas.height) : 1;
      ctx.strokeStyle = 'rgba(150,170,210,0.45)';
      ctx.lineWidth = Math.max(1, 1.5 * dpr * k);
      for (const [i, j] of fr.links) {
        const a = fr.nodes[i]; const b = fr.nodes[j];
        if (!a || !b) continue;
        const [x1, y1] = put([a[0], a[1]]);
        const [x2, y2] = put([b[0], b[1]]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(120,150,200,0.7)';
      for (const nd of fr.nodes) {
        const [x, y] = put([nd[0], nd[1]]);
        const r = Math.max(2 * k, Math.min(46, Math.sqrt(nd[2]) * 2.4) * dpr * k);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }

    /** 돌리거나(움직임 OK) 늘어놓거나(움직임 싫어함) — 정본이 주는 두 형태다. */
    function drawHops(hops: Array<{ nodes: Array<[number, number, number]>; links: Array<[number, number]> }>,
      dpr: number): void {
      if (reducedMotion()) {
        const cols = 5;
        const rows = Math.ceil(hops.length / cols);
        const cw = canvas.width / cols; const ch = canvas.height / rows;
        hops.forEach((fr, i) => {
          const bx = (i % cols) * cw; const by = Math.floor(i / cols) * ch;
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = dpr;
          ctx.strokeRect(bx, by, cw, ch);
          drawHopFrame(fr, dpr, [bx, by, cw, ch]);
        });
        return;
      }
      const fr = hops[hopFrame % hops.length];
      if (fr) drawHopFrame(fr, dpr);
    }

    /**
     * 화면 낭독기를 위한 **대체 내용** — 캔버스 안에 넣는다.
     *
     * 캔버스는 그림이라 그 안의 것이 문서에 없다. 실측: 낭독기가 읽을 수 있는 글자가
     * 위젯 전체에서 165자(단추 이름 정도)뿐이었다. 자판 길은 냈지만 **조작만 되고
     * 내용은 깜깜**했다.
     *
     * 여는 태그와 닫는 태그 사이의 것은 **화면엔 안 뜨고 낭독기만 읽는다.**
     * 글 1516줄을 다 넣지 않는다 — 그건 줄줄이 읽기라 지도가 아니다.
     * 표로 주는 이유: 낭독기가 위아래좌우로 훑을 수 있어 공간을 더듬을 수 있다.
     */
    function refreshAltTable(): void {
      if (!atlas) return;
      const li = levelIndex();
      const names = li >= 0 ? atlas.levels[li].names : atlas.clusterNames;
      const rows = new Map<number, { n: number; lanes: Map<string, number>; buried: number }>();
      for (const d of atlas.docs) {
        const c = clusterAt(d, li);
        if (c == null) continue;
        const r = rows.get(c) || { n: 0, lanes: new Map(), buried: 0 };
        r.n += 1;
        r.lanes.set(d.lane, (r.lanes.get(d.lane) || 0) + 1);
        if (d.buried) r.buried += 1;
        rows.set(c, r);
      }
      const sorted = [...rows.entries()].sort((a, b) => b[1].n - a[1].n);
      const total = atlas.count || 1;
      const body = sorted.map(([c, r]) => {
        const who = [...r.lanes.entries()].sort((a, b) => b[1] - a[1])[0][0];
        /* 이름을 **단추**로 둔다. 캔버스 안 대체 내용은 낭독기만 보는 게 아니라
           **자판 초점도 받는다** — 마우스로만 되던 「덩어리 견주기」와 「그리로 건너뛰기」가
           여기서 열린다. 새 화면을 안 만들고 이미 있는 표를 쓴다. */
        const nm = names[c] || '이름 없음';
        return '<tr><th scope="row">'
          + '<button type="button" data-goto-cluster="' + c + '" aria-label="'
          + esc(nm) + ' ' + esc(groupWord()) + ' — 눌러서 그리로 가기, 다른 것을 또 누르면 둘을 견줍니다'
          + (offName(c) ? '. 이 이름은 남의 무리에서 더 잘 맞습니다' : '') + '">'
          + esc(nm) + (offName(c) ? ' <span title="이 이름은 남의 무리에서 더 잘 맞는다">?</span>' : '') + '</button></th>'
          + '<td>' + r.n + '개</td>'
          + '<td>' + Math.round((r.n / total) * 100) + '%</td>'
          + '<td>' + esc(who) + '</td>'
          + '<td>' + (r.buried ? r.buried + '개 묻힘' : '없음') + '</td></tr>';
      }).join('');
      /* **이름이 제 무리 것인지도 적는다.** 이름은 c-TF-IDF 로 뽑는데, 글에 있는 말이어도
         그 무리를 대표 못 할 수 있다 — 응집도(c_npmi)를 제 무리 글과 남의 무리 글로 각각
         재서 견줬다. 여기에 적어야 사람이 「이 이름 이상한데」를 확인할 수 있다. */
      const fit = levelNow()?.fit;
      const fitLine = fit && fit.judged
        ? ' · 이름이 제 무리에 맞는 것 ' + fit.better + '/' + fit.judged
        : '';
      canvas.innerHTML = '<table><caption>'
        + esc(headline(atlas) || '내 글 지형도')
        + ' — ' + esc(groupWord()) + ' ' + sorted.length + '개, 글 ' + atlas.count + '개'
        + esc(fitLine) + '</caption>'
        + '<thead><tr><th scope="col">' + esc(groupWord()) + '</th><th scope="col">글 수</th>'
        + '<th scope="col">전체 대비</th><th scope="col">주로 어디서</th>'
        + '<th scope="col">묻힌 것</th></tr></thead><tbody>' + body + '</tbody></table>';
    }

    /* 표 안 단추 누름을 **한 자리에서** 받는다. 표는 다시 그려지므로 줄마다 달면
       다시 그릴 때 떨어진다 — 캔버스에 한 번 달고 올라오는 것을 본다. */
    canvas.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      const btn = t?.closest?.('[data-goto-cluster]') as HTMLElement | null;
      if (!btn || !atlas) return;
      e.stopPropagation();
      const c = Number(btn.dataset.gotoCluster);
      const li = levelIndex();
      const mine = atlas.docs.filter((d) => clusterAt(d, li) === c && d.xy);
      /* 마우스로 이름표를 누르는 것과 **같은 규칙**으로 잡는다 — 손이 달라도 결과는 같아야 한다. */
      if (vsA == null || vsB != null || c === vsA) { vsA = c; vsB = null; } else vsB = c;
      /* **날아가지 않는다.** 처음엔 그 덩어리로 데려갔는데, 날아가면 배율이 올라 층이
         바뀌고 층이 바뀌면 잡아 둔 것을 놓는다 — 그래서 자판으로는 영영 못 견줬다.
         마우스로 이름표를 누를 때도 안 날아간다. 손이 달라도 규칙은 같아야 한다. */
      void mine;
      showVs();
      draw();
    });

    /* 작은 지도가 화면에서 차지하는 네모 — 밖에서 잴 수 있게 남긴다. */
    let miniBox: { x: number; y: number; w: number; h: number } | null = null;

    /**
     * **작은 지도.** 당겨 들어간 자리에 아무것도 없으면 사람은 길을 잃는다 —
     * 이름이 있는 문제다(사막 안개, Jul & Furnas 1998). 우리 지도도 8배로 당기면
     * 화면 225칸 중 47칸(21%)이 글 열 개도 안 되는 허허벌판이었다(실측).
     * 그런데 지금 어디쯤인지 알 방법이 하나도 없었다.
     *
     * 구석에 전체를 작게 두고 **지금 보는 자리를 네모로** 그린다. 점이 있는 곳이
     * 곧 「가 봐야 뭐가 있는 자리」라 안개로 들어가기 전에 보인다.
     * 눌러서 그리로 건너뛸 수도 있다 — 안개에 빠져도 나올 길이 생긴다.
     *
     * 멀리서 볼 땐 안 그린다. 전체가 이미 화면인데 또 전체를 그리면 자리만 먹는다.
     */
    function drawMinimap(dpr: number): void {
      miniBox = null;
      (window as unknown as Record<string, unknown>).__atlasMinimap = null;
      if (!atlas || view.scale < 1.2 || layout === 'skeleton') return;
      const W = 150 * dpr;
      const H = 96 * dpr;
      const M = 12 * dpr;
      const x0 = canvas.width - W - M;
      const y0 = canvas.height - H - M;
      miniBox = { x: x0, y: y0, w: W, h: H };

      ctx.save();
      ctx.fillStyle = 'rgba(10,12,18,0.78)';
      ctx.fillRect(x0, y0, W, H);
      ctx.strokeStyle = 'rgba(148,163,184,0.45)';
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, W - 1, H - 1);

      /* 점은 아주 작게. 색은 안 쓴다 — 작은 지도에서 색까지 구분하려 들면 둘 다 못 읽는다. */
      ctx.fillStyle = 'rgba(190,205,230,0.65)';
      for (const d of atlas.docs) {
        const q = placed.get(d.id);
        if (!q) continue;
        const [ux, uy] = unit(q);
        ctx.fillRect(x0 + ux * W, y0 + uy * H, 1.2 * dpr, 1.2 * dpr);
      }

      /* 지금 보는 자리. 화면 네 귀퉁이를 지도 자리로 되돌려 그린다 —
         배율·밀기를 따로 계산하면 둘이 어긋나 거짓 네모가 된다. */
      const [ax, ay] = toMap(0, 0);
      const [bx, by] = toMap(canvas.width, canvas.height);
      const [uax, uay] = unit([ax, ay]);
      const [ubx, uby] = unit([bx, by]);
      const rx = x0 + uax * W;
      const ry = y0 + uay * H;
      const rw = (ubx - uax) * W;
      const rh = (uby - uay) * H;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.4 * dpr;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
      (window as unknown as Record<string, unknown>).__atlasMinimap = {
        box: [x0, y0, W, H], rect: [rx - x0, ry - y0, rw, rh],
      };
    }

    /* **고치기 전에 잰다.** 한 판 그리기가 중간 5.3ms 인데 90% 가 14.1ms 였다(60프레임
       예산 16.7ms). 꼬리가 예산에 붙었는데 **뭐가 시간을 먹는지는 모르는 상태**였다.
       토막마다 재서 남긴다 — 짐작으로 고치면 엉뚱한 데를 깎는다. */
    /* 범례·표를 다시 짤 이유가 생겼는지 알아보는 열쇠. */
    let lastSideKey = '';
    const times: Record<string, number> = {};
    let markAt = 0;
    function markStart(): void { markAt = performance.now(); }
    function mark(name: string): void {
      const now = performance.now();
      times[name] = (times[name] || 0) + (now - markAt);
      markAt = now;
    }

    function draw(): void {
      if (!atlas) return;
      for (const k of Object.keys(times)) delete times[k];
      markStart();
      /* 범례와 낭독기용 표는 **밀거나 당길 때 바뀌지 않는다** — 층·배치·손잡이가 바뀔
         때만 다시 짠다. 매 판 30줄짜리 표를 새로 쓰고 있었다(토막 재기: 0.8ms).
         지금 상태를 한 줄로 접어 두고, 달라졌을 때만 손댄다. */
      const sideKey = [levelIndex(), layout, buriedOn, lieOn, meetOn, lonelyOn, denseOn, egoDepth, diffMode, trailOn, timeAt, query, atlas.count, chosen ? chosen.id : ''].join('|');
      if (sideKey !== lastSideKey) {
        lastSideKey = sideKey;
        refreshLegend();
        refreshAltTable();
        refreshHowto();
      }
      mark('곁다리(범례·표)');
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const wantW = Math.max(320, rect.width * dpr);
      const wantH = Math.max(240, rect.height * dpr);
      /* **크기가 그대로면 건드리지 않는다.** canvas.width 에 값을 넣으면 같은 값이어도
         그림판을 통째로 새로 잡는다 — 밀 때마다 그 값을 치르고 있었다(토막 재기: 「바탕」
         1.0ms). 창 크기가 바뀔 때만 새로 잡는다. */
      if (canvas.width !== wantW || canvas.height !== wantH) {
        canvas.width = wantW;
        canvas.height = wantH;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      /* **큰 점부터 그린다.** 점 다섯 중 하나가 다른 점에 가려 안 보였다(실측 301짝).
         나중에 그린 것이 위로 오므로, 작은 점이 마지막에 그려져야 살아난다.
         자리는 안 건드린다 — 흔들어 밀어내면 「가까이 있으면 정말 가깝다」가 깨진다. */
      if (layout === 'skeleton') {
        drawSkeleton(dpr);
        labelHeads = 0; droppedLabels = 0; labelBoxes = [];
        /* **어떤 손잡이로 그린 그림인지 같이 적는다.** 구간 수를 한 칸만 옮겨도 조각
           수가 뒤집히던 그림이다 — 안 적으면 손잡이가 만든 모양을 데이터로 읽는다.
           흔들림 폭 0 일 때만 「조각 N 개다」라고 단정한다. */
        const sk = atlas.skeleton;
        /* **흔들어 보기 중이면 그 말이 먼저다** — 안 그러면 아래 손잡이 줄이 덮어쓴다
           (자가 「늘어놨다는 말을 화면이 안 한다」로 잡았다). */
        const hopSay = hopsOn && sk?.hops?.length
          ? (reducedMotion()
            ? `흔든 ${sk.hops.length}판을 한눈에 늘어놨어요 (움직임을 줄이는 설정이라 안 돌립니다)`
            : `흔든 ${sk.hops.length}판을 한 판 ${HOP_MS}ms 로 돌립니다 — ${hopFrame + 1}번째 판`)
          : '';
        if (sk?.params) {
          const w = sk.wobble;
          const said = w && w.comp[0] === w.comp[1]
            ? '조각 ' + w.comp[0] + '개 — 손잡이를 흔들어도 안 변한다'
            : w ? '조각 ' + (sk.comp ?? '?') + '개 — 흔들면 ' + w.comp[0] + '~' + w.comp[1] + '개로 바뀐다'
              : '';
          (window as unknown as Record<string, unknown>).__atlasSkeletonSay = said;
          countEl.innerHTML = (hopSay ? '<b>' + esc(hopSay) + '</b> · ' : '')
            + '<b>' + esc(said) + '</b>'
            /* **무엇으로 훑었는지도 적는다** — mapper 는 렌즈가 절반이다. 손잡이만 적고
               렌즈를 안 적으면, 보는 사람은 이 그림이 「가로로 훑은 그림」인 걸 모른다. */
            + '<span style="opacity:.55"> · 마디 ' + sk.nodes.length
            + ' · 렌즈 ' + esc(String(sk.params.lens || 'x'))
            + ' · 구간 ' + sk.params.bins
            + ' 겹침 ' + sk.params.overlap + ' (렌즈·손잡이 다 안정도로 고름)</span>'
            /* **한 판이 아니라 스무 판의 답을 적는다** — 조각 수가 몇 판에서 같았나,
               그리고 흔들면 사라지는 마디가 몇 개인가. */
            + (sk.confidence
              ? '<span style="opacity:.55"> · 글을 열에 하나씩 빼고 ' + sk.confidence.runs + '판: 조각 '
                + sk.confidence.mode + '개가 ' + sk.confidence.modeRuns + '판'
                + (sk.confidence.comps.length > 1
                  ? ' (나머지 ' + sk.confidence.comps.slice(1).map((c) => c[0] + '개 ' + c[1] + '판').join(' · ') + ')'
                  : '')
                + ' · 스무 판을 다 버틴 마디 ' + sk.confidence.full + '/' + sk.confidence.survival.length
                + (sk.confidence.shaky ? ' · 흔들리는 마디 ' + sk.confidence.shaky + '개(흐리게·점선)' : '')
                + (sk.tower
              ? '<span style="opacity:.55"> · 눈금 ' + sk.tower.bins[0] + '~' + sk.tower.bins[sk.tower.bins.length - 1]
                + ' 사다리: ' + sk.tower.counts.map((c) => c.bins + ':' + c.comps).join(' ')
                + ' — 전 구간을 사는 조각 ' + sk.tower.full + '개</span>'
              : '')
            + (sk.draw?.anchored?.used
              ? '<span style="opacity:.55"> · 자리를 다시 잡음(매어 둔 채 · '
                + Math.round(sk.draw.anchored.moved * 100) + '% 옮김)</span>'
              : '')
            + (sk.draw
              ? '<span style="opacity:.55"> · 그림 자 셋: 얽힘 ' + sk.draw.cross
                + ' · stress ' + sk.draw.stress + ' · 이웃 지킴 ' + Math.round((sk.draw.np ?? 0) * 100) + '%</span>'
              : '')
            + (typeof sk.confidence.baseline === 'number'
                  ? ' · 자리를 마구 섞은 지도의 바탕값 ' + Math.round(sk.confidence.baseline * 100) + '%'
                  : '')
                + '</span>'
              : '');
        }
        return;
      }

      const docs = atlas.docs
        .filter((d) => placed.has(d.id))
        .slice()
        .sort((a, b) => b.bytes - a.bytes);

      /* **어긋남 바탕** — 밀도 차보다도 먼저 깐다. 「여기서는 지도를 믿지 마라」는
         다른 무엇보다 아래에 깔려 있어야 방해가 안 되면서 늘 보인다. */
      /**
       * **행렬 보기** — 점 대신 **이웃 그래프를 격자로** 그린다.
       *
       * 줄·칸 순서는 굽는 쪽에서 재서 고른 자리 정렬(피들러). 이웃이면 칸을 칠한다.
       * 정렬이 뜻을 가지면 **대각선 둘레로 띠**가 생기고, 아니면 소금 뿌린 것처럼 흩어진다.
       * 자리를 안 쓰므로 「18차원을 2차원에 눕혀서 생긴 병」이 여기엔 없다 — 다만
       * **길 찾기**는 점-선이 낫다는 게 문헌의 답이라, 이건 점-선을 대신하는 게 아니라 **곁에 둔다.**
       */
      const ser = atlas?.seriation;
      if (matrixOn && ser?.order && ser.order.length) {
        const ord = ser.order;
        const N = ord.length;
        const side = Math.min(canvas.width, canvas.height) - 8 * dpr;
        const x0 = (canvas.width - side) / 2;
        const y0 = (canvas.height - side) / 2;
        const cell = side / N;
        const pos = new Int32Array(atlas.docs.length).fill(-1);
        ord.forEach((d, i) => { if (d >= 0 && d < pos.length) pos[d] = i; });
        ctx.fillStyle = 'rgba(10,12,18,0.92)';
        ctx.fillRect(x0, y0, side, side);
        /* 칸이 1픽셀보다 작으면 겹쳐 찍힌다 — 그래도 띠는 보인다(그게 이 그림의 요점). */
        let painted = 0;
        ctx.fillStyle = 'rgba(120,190,255,0.85)';
        for (let a = 0; a < N; a += 1) {
          const d = atlas.docs[ord[a]];
          if (!d?.near) continue;
          for (const j of d.near) {
            const b = pos[j];
            if (b < 0) continue;
            const w = Math.max(1, cell);
            ctx.fillRect(x0 + b * cell, y0 + a * cell, w, w);
            ctx.fillRect(x0 + a * cell, y0 + b * cell, w, w);
            painted += 2;
          }
        }
        /* 대각선을 얇게 — 어디가 「자기 자신」인지 알아야 띠가 읽힌다. */
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = Math.max(1, dpr * 0.6);
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(x0 + side, y0 + side);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.strokeRect(x0, y0, side, side);
        (window as unknown as Record<string, unknown>).__atlasMatrix = {
          on: true, n: N, painted, cell: Number(cell.toFixed(4)), order: ser.best,
        };
        mark('행렬');
        return;
      }
      (window as unknown as Record<string, unknown>).__atlasMatrix = { on: false };

      const warp = warpGrid();
      if (warp) {
        for (const c of warp) {
          const p0 = toScreenUnit(c.i / WARP_SIDE, c.j / WARP_SIDE);
          const p1 = toScreenUnit((c.i + 1) / WARP_SIDE, (c.j + 1) / WARP_SIDE);
          const w = p1[0] - p0[0]; const h = p1[1] - p0[1];
          if (p1[0] < 0 || p1[1] < 0 || p0[0] > canvas.width || p0[1] > canvas.height) continue;
          /* 주황 = 찢김 · 파랑 = 거짓 이웃. 둘 다 낮으면 안 칠한다. */
          const t = Math.max(0, (c.tear - 0.35) / 0.65);
          const f = Math.max(0, (c.fake - 0.35) / 0.65);
          if (t < 0.02 && f < 0.02) continue;
          ctx.fillStyle = `rgba(${Math.round(230 * t + 0 * f)},${Math.round(159 * t + 114 * f)},${Math.round(0 * t + 178 * f)},${Math.min(0.5, 0.12 + 0.38 * Math.max(t, f))})`;
          ctx.fillRect(p0[0], p0[1], w, h);
        }
      }
      /* **밀도 차는 맨 밑에 깐다** — 점과 선이 그 위에 온다(바탕 노릇). */
      const diff = diffGrid();
      (window as unknown as Record<string, unknown>).__atlasDiff = diff
        ? { mode: DIFF_MODES[diffMode].name, a: DIFF_MODES[diffMode].a, b: DIFF_MODES[diffMode].b,
          aCells: diff.aCells, bCells: diff.bCells, mixCells: diff.mixCells, side: DIFF_SIDE, empty: diff.empty || null }
        : null;
      if (diff) {
        for (const c of diff.cells) {
          const [x0, y0] = toScreen([0, 0]);
          void x0; void y0;
          const p0 = toScreenUnit(c.i / DIFF_SIDE, c.j / DIFF_SIDE);
          const p1 = toScreenUnit((c.i + 1) / DIFF_SIDE, (c.j + 1) / DIFF_SIDE);
          const w = p1[0] - p0[0]; const h = p1[1] - p0[1];
          if (p1[0] < 0 || p1[1] < 0 || p0[0] > canvas.width || p0[1] > canvas.height) continue;
          /* 오카베-이토 주황(A) · 파랑(B) — 색약 셋에서도 갈리는 짝이다. 가운데는 안 칠한다. */
          const t = Math.min(1, Math.abs(c.v));
          if (t < 0.08) continue;
          ctx.fillStyle = c.v > 0
            ? `rgba(230,159,0,${(t * 0.30).toFixed(3)})`
            : `rgba(0,114,178,${(t * 0.30).toFixed(3)})`;
          ctx.fillRect(p0[0], p0[1], w, h);
        }
      }

      /* **지형** — 켜면 등고선을 깐다. **선만** 긋고 안을 안 채운다: 채우면 그것도
         「여기부터 저기까지가 한 무리」라는 말이 된다. 우리가 안 하려는 게 바로 그거다. */
      let terrainInfo: Record<string, unknown> | null = null;
      if (terrainOn) {
        const upts: Array<[number, number]> = [];
        for (const d of docs) { const p = placed.get(d.id); if (p) upts.push(unit(p)); }
        const f = densityField(upts, TERRAIN_SIDE);
        /* ★ 봉우리는 **두드러짐**으로 센다. 고정 자르기(55%)는 밀도가 서로 다른 봉우리를
           하나로 뭉갠다 — 지어낸 자료(700개·150개 두 무리)에서 실제로 그랬다(2 vs 1).
           그래도 옛 값을 같이 낸다: 나란히 안 적으면 어느 쪽이 나은지 알 수 없다. */
        const pm = peaksByProminence(upts);
        const peaks = pm.peaks;
        const cutPeaks = peaksAt(f, f.max * TERRAIN_CUT);
        let drawn = 0;
        ctx.lineJoin = 'round';
        for (let b = 1; b <= TERRAIN_BANDS; b += 1) {
          const t = b / (TERRAIN_BANDS + 1);
          const segs = contourAt(f, f.max * t);
          drawn += segs.length;
          /* 높을수록 밝고 굵게 — 높이를 **밝기**로 말한다(색은 이미 갈래가 쓴다). */
          ctx.strokeStyle = `rgba(226,232,240,${(0.10 + t * 0.34).toFixed(3)})`;
          ctx.lineWidth = Math.max(0.6, dpr * (0.5 + t * 1.1));
          ctx.beginPath();
          for (const [x1, y1, x2, y2] of segs) {
            const a = toScreenUnit(x1 / TERRAIN_SIDE, y1 / TERRAIN_SIDE);
            const c2 = toScreenUnit(x2 / TERRAIN_SIDE, y2 / TERRAIN_SIDE);
            ctx.moveTo(a[0], a[1]); ctx.lineTo(c2[0], c2[1]);
          }
          ctx.stroke();
        }
        terrainInfo = { peaks, cutPeaks, relief: Number(reliefOf(f).toFixed(3)), lines: drawn, bands: TERRAIN_BANDS,
          base: Number(flatRelief(upts.length).toFixed(3)),
          cut: pm.cut, runs: pm.runs, alpha: pm.alpha, bars: pm.bars, gap: pm.gap };
      }
      (window as unknown as Record<string, unknown>).__atlasTerrain = terrainOn
        ? { on: true, side: TERRAIN_SIDE, fixedCut: TERRAIN_CUT, ...terrainInfo }
        : { on: false };

      mark('바탕');
      /* 글끼리 서로 부르는 자리를 선으로 잇는다. 실측 1082개 — 성겨서 다 그려도
         털뭉치가 안 된다. 평소엔 거의 안 보이게 깔고, 손을 얹은 점에 붙은 선만
         밝힌다. 선이 주인공이면 점을 못 읽는다. */
      /* 그린 선분을 밖에서 읽을 창구. 화면엔 아무 영향 없다 — 재는 쪽에서만 쓴다.
         이음을 **묶을지 말지**(edge bundling)를 취향이 아니라 수로 정하려면 먼저
         지금 선이 얼마나 겹치고 남의 점 위를 지나는지 알아야 한다. */
      const edgeSegs: Array<[number, number, number, number]> = [];
      if (atlas.edges?.length) {
        const hoverIdx = hover ? atlas.docs.indexOf(hover) : -1;
        ctx.lineWidth = Math.max(0.5, dpr * 0.6);
        /* 선 하나의 짙기. **밖에서 읽을 수 있게 상수로 둔다** — 재는 쪽이 이 값을 모르면
           「잉크」를 재고 「눈에 보이는 것」은 못 잰다(알파 0.10 짜리 선 한 겹은 사실상 안 보인다). */
        const EDGE_ALPHA = 0.10;
        (window as unknown as Record<string, unknown>).__atlasEdgeAlpha = EDGE_ALPHA;
        ctx.strokeStyle = `rgba(150,170,210,${EDGE_ALPHA})`;
        ctx.beginPath();
        for (const [a, b] of atlas.edges) {
          if (a === hoverIdx || b === hoverIdx) continue;    // 밝힐 것은 나중에 따로
          const pa = placed.get(atlas.docs[a]?.id);
          const pb = placed.get(atlas.docs[b]?.id);
          if (!pa || !pb) continue;
          const [x1, y1] = toScreen(pa);
          const [x2, y2] = toScreen(pb);
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          edgeSegs.push([x1, y1, x2, y2]);
        }
        ctx.stroke();

        /* **점 둘레의 선을 지운다** (지도 제작의 오래된 손버릇 — 선을 끊어 읽게 한다).
           재 보니 점의 **35%** 가 자기 것도 아닌 선 위에 얹혀 있었다 — 화면만 보면
           「이어져 있다」로 읽힌다(이음 묶기 지표의 모호도와 같은 병). 선을 지우는 게
           아니라 **점 둘레만 도려낸다**: 이음은 그대로 보이고, 점은 선에서 떨어진다.
           `destination-out` 은 그린 것을 지워 바탕(CSS 그러데이션)이 드러나게 한다. */
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        const knock = 4.5 * dpr;
        (window as unknown as Record<string, unknown>).__atlasEdgeKnock = knock;
        /* **한 번에 한 길로 채운다** — 점마다 begin/fill 을 부르면 1532번이라 한 판이
           4.1ms → 5.5ms 로 늘었다(예산 자가 판 안에서 빨개졌다). 길 하나에 원을 다 담고
           채우기는 한 번만 한다. */
        ctx.beginPath();
        for (const d of docs) {
          const p = placed.get(d.id);
          if (!p) continue;
          const [kx, ky] = toScreen(p);
          if (kx < -knock || ky < -knock || kx > canvas.width + knock || ky > canvas.height + knock) continue;
          /* **원 대신 네모.** 1532개를 원으로 파면 한 판이 1.4ms 늘어 예산 자가 판 안에서
             빨개졌다. 9픽셀짜리 구멍은 원이든 네모든 눈에 같다 — 싼 쪽을 쓴다. */
          ctx.rect(kx - knock, ky - knock, knock * 2, knock * 2);
        }
        ctx.fill();
        ctx.restore();

        if (hoverIdx >= 0) {
          ctx.lineWidth = Math.max(1.2, dpr * 1.4);
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          let linked = 0;
          for (const [a, b] of atlas.edges) {
            if (a !== hoverIdx && b !== hoverIdx) continue;
            const pa = placed.get(atlas.docs[a]?.id);
            const pb = placed.get(atlas.docs[b]?.id);
            if (!pa || !pb) continue;
            const [x1, y1] = toScreen(pa);
            const [x2, y2] = toScreen(pb);
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            linked += 1;
          }
          ctx.stroke();
          hoverLinks = linked;
        } else {
          hoverLinks = 0;
        }

        /* 고른 글에서 **뜻으로 가까운 글**로 줄을 긋는다. 위의 흰 줄(서로 부르는
           링크)과 색을 달리한다 — 둘은 다른 뜻이다. 링크는 「내가 적어 둔 것」,
           이 줄은 「적어 두지 않았는데 닮은 것」이다. 후자가 이 지도의 값어치다. */
        if (chosen && chosen.near && chosen.near.length) {
          const from = placed.get(chosen.id);
          if (from) {
            ctx.lineWidth = Math.max(1.1, dpr * 1.2);
            ctx.strokeStyle = 'rgba(240,180,60,0.7)';
            ctx.setLineDash([5 * dpr, 4 * dpr]);
            ctx.beginPath();
            const [fx, fy] = toScreen(from);
            for (const j of chosen.near) {
              const to = placed.get(atlas.docs[j] ? atlas.docs[j].id : '');
              if (!to) continue;
              const [tx, ty] = toScreen(to);
              ctx.moveTo(fx, fy);
              ctx.lineTo(tx, ty);
            }
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      mark('선');
      /* 둘레는 **한 판에 한 번만** 센다 — 점마다 세면 1908번 걷는다. */
      const ego = egoSet();
      (window as unknown as Record<string, unknown>).__atlasEgo = ego
        ? { depth: egoDepth, kept: ego.keep.size, byLink: ego.byLink, byNear: ego.byNear }
        : null;
      /** 색마다 길 하나 — 점마다 색을 갈아 끼우지 않는다(점이 1908개가 되자 그 값이 보였다). */
      const fillBags = new Map<string, Array<[number, number, number, number]>>();
      const outlineBag: Array<[number, number, number, number]> = [];
      for (const d of docs) {
        const [x, y] = toScreen(placed.get(d.id)!);
        const size = Math.max(3, Math.min(11, Math.sqrt(d.bytes) / 12)) * dpr * Math.min(view.scale, 2.4);
        const cg = layout === 'lane' ? atlas.lanes.indexOf(d.lane) : colorGroup(d);
        /* 끝난 것은 가라앉힌다 — 살아 있는 것이 먼저 눈에 걸려야 한다. */
        /* 시간 손잡이를 쓰면 그 달 글만 밝다. 색·모양·테두리는 이미 다른 뜻을
           지고 있으므로 시간은 **밝기**로만 말한다. */
        const offTime = timeAt >= 0 && d.born !== atlas.months[timeAt];
        const faded = (buriedOn && !d.buried) || offTime || (query !== '' && !matches(d))
          || (lieOn && (d.honest ?? 8) > LIE_AT)
          || (meetOn && (d.mix ?? 1) < MEET_AT)
          || (lonelyOn && !d.lonely)
          || (denseOn && (d.dense ?? -1) < 0)
          || (ego != null && !ego.keep.has(atlas.docs.indexOf(d)));
        /* **거의 같은 글은 가라앉힌다** — 같은 생각이 두세 번 놓이면 지도가 **없는 밀도**를
           만든다(발행 글 ↔ 초안 ↔ 옮겨 적은 메모). 지우지는 않는다: 있는 건 있는 거고,
           다만 대표 하나만 또렷하다. */
        /* **지형을 켜면 덩어리 색은 물러난다** — 등고선이 「몰린 정도」를 말하는 동안
           색까지 「여긴 한 무리」라고 우기면 두 그림이 서로 반대말을 한다. 지우지는
           않는다: 갈래는 여전히 읽혀야 하고, 다만 주장을 멈춘다. */
        const cAlpha = terrainOn ? 0.34 : 1;
        ctx.fillStyle = faded ? paint(cg, 0.16 * cAlpha, true)
          : d.twin ? paint(cg, 0.30 * cAlpha, true)      // 거의 같은 글 = 대표가 따로 있다
            : d.done ? paint(cg, 0.40 * cAlpha, true)    // 끝난 것은 가라앉힌다
              : paint(cg, 0.88 * cAlpha, terrainOn);
        markPath(ctx, x, y, size, LANE_SHAPE[d.lane] ?? 0);
        ctx.fill();
        /* 작은 점에 얇은 어두운 테두리 — 큰 점 위에 얹혀도 윤곽이 남는다.
           색을 안 쓰므로 다른 뜻과 안 부딪친다. */
        if (size < 6 * dpr && !faded) {
          ctx.strokeStyle = 'rgba(8,9,13,0.85)';
          ctx.lineWidth = Math.max(0.8, dpr * 0.9);
          ctx.stroke();
        }
        /* 묻힌 글은 **테두리**로 알린다. 색은 이미 덩어리가 쓰고 있어서, 색을
           두 가지 뜻으로 쓰면 둘 다 안 읽힌다. */
        if (buriedOn && d.buried) {
          ctx.strokeStyle = 'rgba(255,214,102,0.95)';
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        }
        /* **못 믿는 자리** — 닮은 글이 지도에서 하나도(또는 하나만) 곁에 없는 점.
           여기서는 「옆에 있다」가 거짓이다. 붉은 테두리로 알린다 — 묻힘(노랑)과
           같은 자리를 쓰지만 둘을 동시에 켜지 않으므로 안 부딪친다. */
        if (lieOn && (d.honest ?? 8) <= LIE_AT) {
          ctx.strokeStyle = 'rgba(214,64,64,0.95)';
          ctx.lineWidth = 2.2 * dpr;
          ctx.stroke();
        }
        /* **만나는 자리** — 이웃에 여러 갈래가 낀 점. 이 지도를 만든 이유가 여기다.
           많이 섞일수록 굵게 — 두 갈래보다 넷이 만나는 자리가 더 값지다. */
        /* **혼자 있는 글** — 뜻으로 이웃이 없는 점. 보라색으로 둔다: 묻힘(노랑)·
           못 믿음(빨강)·만남(파랑)과 안 부딪치는 마지막 자리다. 넷을 동시에 켜지
           않으므로 색이 겹칠 일은 없지만, 하나씩 켜도 같은 색이면 헷갈린다. */
        if (lonelyOn && d.lonely) {
          ctx.strokeStyle = 'rgba(204,121,167,0.95)';
          ctx.lineWidth = 2.2 * dpr;
          ctx.stroke();
        }
        /* **뭉친 자리** — 밀도로 진짜 무리를 이룬 점. 초록(오카베-이토 청록)으로 둔다:
           묻힘(노랑)·못 믿음(빨강)·만남(파랑)·혼자(보라)와 안 부딪치는 자리다.
           **한가운데일수록 굵게** — 확신(λ_p/λ_max)이 낮은 점은 가장자리에 걸친 것이다. */
        if (denseOn && (d.dense ?? -1) >= 0) {
          ctx.strokeStyle = 'rgba(0,158,115,0.95)';
          ctx.lineWidth = (1 + (d.densep ?? 0) * 2.2) * dpr;
          ctx.stroke();
        }
        if (meetOn && (d.mix ?? 1) >= MEET_AT) {
          ctx.strokeStyle = 'rgba(86,180,233,0.95)';
          ctx.lineWidth = Math.min(3.4, 1.2 + ((d.mix ?? 1) - MEET_AT) * 1.1) * dpr;
          ctx.stroke();
        }
        if (hover && hover.id === d.id) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        }
      }

      /* **궤적은 점 위에 그린다** — 흐름이 주인공일 때는 점이 배경이다. */
      const tr = trail();
      (window as unknown as Record<string, unknown>).__atlasTrail = tr
        ? { months: tr.pts.length, skipped: tr.skipped, moved: Number(tr.moved.toFixed(3)), at: tr.pts.map((q) => q.m) }
        : null;
      if (tr && tr.pts.length > 1) {
        ctx.strokeStyle = 'rgba(240,240,255,0.55)';
        ctx.lineWidth = Math.max(1.4, dpr * 1.6);
        ctx.beginPath();
        tr.pts.forEach((q, i) => {
          const [sx, sy] = toScreenUnit(q.x, q.y);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
        ctx.font = fontPx(10);
        tr.pts.forEach((q, i) => {
          const [sx, sy] = toScreenUnit(q.x, q.y);
          const last = i === tr.pts.length - 1;
          ctx.beginPath();
          ctx.arc(sx, sy, (last ? 5 : 3.2) * dpr, 0, Math.PI * 2);
          ctx.fillStyle = last ? 'rgba(255,255,255,0.95)' : 'rgba(200,210,240,0.8)';
          ctx.fill();
          /* 처음·끝·해가 바뀌는 달에만 글자를 붙인다 — 62개를 다 적으면 못 읽는다. */
          if (i === 0 || last || q.m.endsWith('-01')) {
            ctx.fillStyle = 'rgba(235,240,255,0.85)';
            ctx.fillText(q.m, sx + 6 * dpr, sy - 4 * dpr);
          }
        });
      }

      mark('점');
      /* 아주 가까이 당기면 점 옆에 제목 앞머리를 붙인다 — 그림이 없으니 글자가
         그림 노릇을 한다. 멀리서 켜면 화면이 글자로 뒤덮이므로 배율이 넉넉할 때만.
         **여기도 겹치면 안 그린다** — 덩어리 이름엔 넣어 놓고 여기엔 안 넣어서
         날짜 글자들이 서로 뭉개졌었다(같은 실수를 두 번 했다). */
      if (view.scale >= 3 && docs.length) {
        const near = docs.filter((d) => {
          const [x, y] = toScreen(placed.get(d.id)!);
          return x > 0 && y > 0 && x < canvas.width && y < canvas.height;
        });
        if (near.length <= 120) {
          ctx.textAlign = 'left';
          ctx.font = fontPx(11);
          ctx.fillStyle = 'rgba(226,232,240,0.78)';
          const taken: Array<[number, number, number, number]> = [];
          const H = 14 * dpr;
          let drawn = 0;
          /* 큰 글부터 이름을 가져간다 — 자리가 모자라면 작은 것이 양보한다. */
          for (const d of [...near].sort((a, b) => b.bytes - a.bytes)) {
            const head = headOf(d.title);
            if (!head) continue;
            const [x, y] = toScreen(placed.get(d.id)!);
            const w = ctx.measureText(head).width;
            const box: [number, number, number, number] = [x + 9 * dpr, y - 7 * dpr, w, H];
            const hit = taken.some((p) => !(box[0] + box[2] < p[0] || p[0] + p[2] < box[0]
              || box[1] + box[3] < p[1] || p[1] + p[3] < box[1]));
            if (hit) continue;
            taken.push(box);
            ctx.fillText(head, box[0], y + 4 * dpr);
            drawn += 1;
          }
          labelHeads = drawn;
        } else {
          labelHeads = 0;
        }
      } else {
        labelHeads = 0;
      }

      mark('제목 앞머리');
      /* 덩어리 이름을 무리 한가운데 얹는다 — 이름이 붙어야 쏠림이 읽힌다.
         겹치면 못 읽으므로 **큰 덩어리부터** 자리를 잡고, 겹치면 옆 후보로 옮기고,
         어디에도 자리가 없으면 그 이름은 **안 그린다.**
         겹친 글씨보다 없는 글씨가 낫다. */
      const li = levelIndex();
      forgetVsOnLevelChange(li);
      const names = li >= 0 ? atlas.levels[li].names : atlas.clusterNames;
      labelBoxes = [];
      if (layout !== 'lane' && names.length) {
        const nameFit2 = placeNames(li, names, docs, dpr, false);
        droppedLabels = nameFit2.dropped;
        (window as unknown as Record<string, unknown>).__atlasNameCover = Number(nameFit2.cover.toFixed(4));
        (window as unknown as Record<string, unknown>).__atlasNameOff = nameFit2.off;
        /* 자리 이름은 **덩어리 이름이 잡은 자리를 피해** 놓는다 — 놓은 자리를 여기서 잇는다. */
        const placedBoxes: Array<[number, number, number, number]> = labelBoxes.map((l) => l.box);
        const hits = (b: [number, number, number, number]): boolean =>
          placedBoxes.some((q) => !(b[0] + b[2] < q[0] || q[0] + q[2] < b[0]
            || b[1] + b[3] < q[1] || q[1] + q[3] < b[1]));

        /* **자리 이름** — 당기면 덩어리 이름이 화면 밖으로 나간다. 덩어리 이름은
           무리 한가운데 한 점에만 붙기 때문이다 — 8배 당김 기준 글 10개 이상 들은
           화면의 **절반이 이름 0개**였다(측정). 그래서 판을 칸으로 나눠 칸마다
           그 안 글로 만든 이름을 굽어 둔다(WizMap 방식).

           덩어리 이름이 **먼저** 자리를 가져간다 — 자리 이름은 빈 곳만 메운다.
           칸 크기는 배율이 고른다: 4배에 8칸을 쓰면 화면의 34%가 이름 일곱 개 넘게
           되어 다시 못 읽는다(재 보고 골랐다). */
        const tiles = atlas.tiles || [];
        const side = view.scale < 3.2 ? 0 : view.scale < 5 ? 4 : 8;
        let tileDrawn = 0;
        const tileBoxes: Array<[number, number, number, number]> = [];
        const shownNames = new Set(labelBoxes.map((l) => names[l.c]));
        function drawCells(t: Tile | undefined, sd: number): number {
          if (!t) return 0;
          let drew = 0;
          ctx.font = fontPx(11);
          for (const c of t.cells) {
            if (shownNames.has(c.name)) continue;     // 덩어리 이름과 같은 말이면 두 번 안 적는다
            /* 칸은 굽는 쪽에서 -1..1 격자로 나눴다 — 그 좌표계 그대로 넘긴다.
               toScreen 이 지금 범위에 맞춰 옮겨 준다. */
            /* **칸 한가운데가 아니라 「보이는 부분」의 한가운데에 적는다.**
               당기면 칸이 화면보다 커진다 — 그때 한가운데는 화면 밖이라 이름이 통째로
               사라졌다(글이 있는 자리의 13%가 이름 0개). 칸을 화면과 겹쳐 잘라 내고
               그 조각 한가운데 적으면, 그 칸 위에 있는 한 이름이 따라온다. */
            const [x0, y0] = toScreen([(c.i / sd) * 2 - 1, (c.j / sd) * 2 - 1]);
            const [x1, y1] = toScreen([((c.i + 1) / sd) * 2 - 1, ((c.j + 1) / sd) * 2 - 1]);
            const lx = Math.max(0, Math.min(x0, x1)); const rx = Math.min(canvas.width, Math.max(x0, x1));
            const ty0 = Math.max(0, Math.min(y0, y1)); const by = Math.min(canvas.height, Math.max(y0, y1));
            /* 귀퉁이만 스친 칸에 이름을 적으면 엉뚱한 자리를 가리킨다 — 한 뼘은 겹쳐야 한다. */
            if (rx - lx < 70 * dpr || by - ty0 < 24 * dpr) continue;
            const tx = (lx + rx) / 2; const ty = (ty0 + by) / 2;
            const w = ctx.measureText(c.name).width + 10 * dpr;
            const box: [number, number, number, number] = [tx - w / 2, ty - 9 * dpr, w, 17 * dpr];
            if (hits(box)) continue;                  // 겹친 글씨보다 없는 글씨가 낫다
            placedBoxes.push(box);
            tileBoxes.push(box);
            shownNames.add(c.name);
            /* 덩어리 이름보다 **흐리게** — 둘이 같은 무게로 보이면 어느 쪽이
               진짜 덩어리인지 못 구분한다. */
            ctx.fillStyle = 'rgba(0,0,0,0.38)';
            ctx.fillRect(box[0], box[1], box[2], box[3]);
            ctx.fillStyle = 'rgba(198,208,224,0.72)';
            ctx.fillText(c.name, box[0] + box[2] / 2, box[1] + 12.5 * dpr);
            drew += 1;
          }
          return drew;
        }
        if (side) {
          tileDrawn = drawCells(tiles.find((t) => t.side === side), side);
          /* **아무 이름도 안 뜬 자리엔 굵은 칸 이름이라도 적는다.** 잘게 나눈 칸은
             글이 적은 칸에 이름을 안 붙인다(그게 맞다 — 서너 편으로 지은 이름은
             거짓말이다). 그 결과 8배로 당기면 글이 있는 자리의 13%가 이름 0개였다.
             거친 칸(4)은 그 자리를 덮는 이름이 반드시 있다. 정확도는 떨어져도
             **어디쯤인지**는 알려 준다 — 아무것도 없는 것보다 낫다. */
          if (!tileDrawn && !labelBoxes.length && side !== 4) {
            tileDrawn = drawCells(tiles.find((t) => t.side === 4), 4);
          }
        }
        (window as unknown as Record<string, unknown>).__atlasTileLabels = tileDrawn;
        (window as unknown as Record<string, unknown>).__atlasTileBoxes = tileBoxes;
      }
      /* 겹침을 눈으로만 보고 「됐다」 하지 않으려고 밖에서 읽을 창구를 낸다.
         화면엔 아무 영향 없다 — 재는 쪽에서만 쓴다. */
      (window as unknown as Record<string, unknown>).__atlasLabelBoxes = labelBoxes.map((l) => l.box);
      /* **어떤 이름이 떴는지**도 낸다 — 네모만으로는 「같은 이름이 떴다 꺼졌다」를 못 잰다
         (동적 지도 라벨 3계명 R2, Been·Daiches·Yap InfoVis 2006). 화면엔 영향 없다. */
      (window as unknown as Record<string, unknown>).__atlasNameAnchors = nameAnchors;
      (window as unknown as Record<string, unknown>).__atlasNameOldOff = nameOldOff;
      (window as unknown as Record<string, unknown>).__atlasLabelNames = labelBoxes
        .map((l) => (atlas?.levels?.[levelIndex()]?.names?.[l.c] ?? String(l.c)));
      (window as unknown as Record<string, unknown>).__atlasDropped = droppedLabels;
      (window as unknown as Record<string, unknown>).__atlasScale = view.scale;
      (window as unknown as Record<string, unknown>).__atlasFonts = [...fontsUsed].sort((x, y) => x - y);
      /* 화면 안에 실제로 점이 몇 개 보이는지도 같이 낸다. 이게 없으면 전부
         화면 밖으로 밀려나도 「겹침 0」 으로 통과해 버린다. */
      let visible = 0;
      for (const d of docs) {
        const [x, y] = toScreen(placed.get(d.id)!);
        if (x >= 0 && y >= 0 && x <= canvas.width && y <= canvas.height) visible += 1;
      }
      mark('이름표');
      drawMinimap(dpr);
      mark('작은 지도');
      /* 밖에서 「작은 지도의 네모가 진짜 그 자리인가」를 재려면 점 자리가 필요하다.
         자를 위젯 식대로 다시 계산하게 두면 같이 틀려도 모른다 — 뜻으로 재게 넘긴다. */
      (window as unknown as Record<string, unknown>).__atlasPlaced = docs.map((d) => placed.get(d.id)!);
      /* **화면 좌표로도 낸다.** 위(`__atlasPlaced`)는 지도 좌표라 선분(화면 좌표)과 못 견준다 —
         그걸 모르고 견줬다가 「남의 선 위에 얹힌 점 0개」라는 무효 측정을 얻었다. */
      (window as unknown as Record<string, unknown>).__atlasDotScreen = docs
        .map((d) => placed.get(d.id))
        .filter(Boolean)
        .map((p) => toScreen(p as [number, number]));
      (window as unknown as Record<string, unknown>).__atlasBounds = bounds;
      /* 밖에서 「이 점이 화면 어디에 있나」를 계산하려면 보는 자세도 필요하다. */
      (window as unknown as Record<string, unknown>).__atlasView = { x: view.x, y: view.y, scale: view.scale };
      mark('마무리');
      (window as unknown as Record<string, unknown>).__atlasTimes = { ...times };
      (window as unknown as Record<string, unknown>).__atlasVisible = visible;
      (window as unknown as Record<string, unknown>).__atlasEdges = atlas.edges?.length || 0;
      (window as unknown as Record<string, unknown>).__atlasEdgeSegs = edgeSegs;
      (window as unknown as Record<string, unknown>).__atlasBuriedOn = buriedOn;
      (window as unknown as Record<string, unknown>).__atlasHeads = labelHeads;
      /* 색이 몇 가지나 쓰이고 있나 — 사람이 구분 가능한 범위를 넘는지 밖에서 잰다. */
      const usedColors = new Set(docs.map((d) => colorGroup(d)));
      (window as unknown as Record<string, unknown>).__atlasColors = usedColors.size;
      (window as unknown as Record<string, unknown>).__atlasTimeAt = timeAt;
    }

    /**
     * 찾는 말에 걸리나. 제목·경로에 **덩어리 이름**까지 본다.
     *
     * 몸통은 지도에 안 실려 있다(비공개라 제목과 경로만 담긴다). 그러니 화면에 보이는
     * 덩어리 이름을 그대로 쳋는데 「없다」가 나왔다 — 보이는 말로 못 찾는 것은 고장처럼 보인다.
     */
    function matches(d: Doc): boolean {
      const q = query.toLowerCase();
      if (d.title.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)) return true;
      if (!atlas) return false;
      const ls = atlas.levels || [];
      for (let i = 0; i < ls.length; i += 1) {
        const c = d.levels ? d.levels[i] : null;
        const nm = c != null ? ls[i].names[c] : null;
        if (nm && nm.toLowerCase().includes(q)) return true;
      }
      return false;
    }

    /**
     * 찾은 것들이 **한 화면에 들어오게** 옮긴다.
     *
     * 밝게만 해 두면 소용이 없다 — 맞는 점이 화면 밖에 있으면 사람은 아무것도 못 본다.
     * 하나면 그 자리로, 여럿이면 전부 들어오는 배율로.
     */
    function flyTo(list: Doc[]): void {
      if (!atlas || !list.length) return;
      const pts = list.map((d) => placed.get(d.id)).filter(Boolean) as Array<[number, number]>;
      if (!pts.length) return;
      const dpr = window.devicePixelRatio || 1;
      const pad = 34 * dpr;
      const w = canvas.width - pad * 2;
      const h = canvas.height - pad * 2;
      /* **자리 → 0~1 은 `unit()` 한 손으로만 한다.** 여기서만 `(q+1)/2` 로 따로 셈하고
         있었는데, 테두리로 접는 짓을 그만둔 뒤로 자리가 ±1 을 넘어가서(실측 -1.02~1.49)
         이 셈이 딴 데를 가리켰다 — 걸린 글이 **하나**일 때 날아가면 화면이 텅 비었다
         (실측: 찾은 글 1개 · 화면 속 점 0개 · 배율 8). 지도 그리기와 같은 손을 쓴다. */
      const us = pts.map((q) => unit(q));
      const xs = us.map((u) => u[0]);
      const ys = us.map((u) => u[1]);
      const x0 = Math.min(...xs); const x1 = Math.max(...xs);
      const y0 = Math.min(...ys); const y1 = Math.max(...ys);
      /* 점 하나거나 다 붙어 있으면 나누기가 튄다 — 최소 폭을 준다. */
      const spanX = Math.max(0.06, x1 - x0);
      const spanY = Math.max(0.06, y1 - y0);
      const scale = Math.max(0.4, Math.min(8, Math.min(1 / spanX, 1 / spanY)));
      view.scale = scale;
      view.x = pad + w / 2 - (pad + ((x0 + x1) / 2) * w * scale);
      view.y = pad + h / 2 - (pad + ((y0 + y1) / 2) * h * scale);
    }

    /**
     * 그 자리에 있는 글을 집는다.
     *
     * `reach` 는 **얼마나 멀리까지 손을 뻗나**. 마우스는 겨냥할 수 있으니 18픽셀이 맞다 —
     * 멀리 뻗으면 빈 곳을 눌러도 엉뚱한 글이 잡힌다. **자판은 겨냥을 못 한다**: 화면
     * 한가운데를 누르는 것 말곤 방법이 없어서, 마침 그 자리에 점이 없으면 아무것도 안
     * 잡혔다(글이 늘어 자리가 밀리자 실제로 그렇게 됐다). 그럴 땐 손을 화면만큼 뻗어
     * **가장 가까운 글**을 집는다 — 자판으로도 같은 일을 할 수 있어야 한다.
     */
    function pick(mx: number, my: number, reach = 18): Doc | null {
      if (!atlas) return null;
      const dpr = window.devicePixelRatio || 1;
      let best: Doc | null = null;
      let bestD = reach * dpr;
      for (const d of atlas.docs) {
        const p = placed.get(d.id);
        if (!p) continue;
        const [x, y] = toScreen(p);
        const dist = Math.hypot(x - mx * dpr, y - my * dpr);
        if (dist < bestD) { bestD = dist; best = d; }
      }
      return best;
    }

    /**
     * 눌러서 **원본까지 간다.** 여기서 회수 루프가 닫힌다 — 지도를 보다가
     * 「이게 뭐였지」 하면 그 자리에서 글을 열 수 있어야 한다.
     *
     * 어디로 보내나:
     *  - 바깥에서 주운 것(북마크) → 원래 글 주소
     *  - 내가 쓴 것 → 지식베이스 저장소의 그 파일
     * 저장소가 비공개라 남에겐 안 열리지만, **주인에겐 열린다.** 그게 이 도구의 손님이다.
     */
    const MEMO_REPO = 'https://github.com/mascari4615/memo/blob/main/';

    function openTarget(d: Doc): { href: string; label: string } | null {
      if (d.url) return { href: d.url, label: '원래 글 열기' };
      if (d.id && !d.id.startsWith('bookmark/')) {
        return { href: MEMO_REPO + d.id.split('/').map(encodeURIComponent).join('/'), label: '원본 열기' };
      }
      return null;
    }

    /** 평균을 낸다. 값이 없는 글은 뺀다 — 없는 걸 0 으로 세면 거짓말이 된다. */
    function avg(docs: Doc[], get: (d: Doc) => number | null | undefined): string {
      const v = docs.map(get).filter((x): x is number => x != null);
      return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—';
    }

    function showVs(): void {
      if (!atlas || vsA == null || vsB == null) { vsEl.hidden = true; return; }
      const li = levelIndex();
      const lv = li >= 0 ? atlas.levels[li] : null;
      if (!lv) { vsEl.hidden = true; return; }
      const words = lv.words || [];
      const wa = words[vsA] || [];
      const wb = words[vsB] || [];
      const both = wa.filter((w) => wb.includes(w));
      const onlyA = wa.filter((w) => !wb.includes(w)).slice(0, 3);
      const onlyB = wb.filter((w) => !wa.includes(w)).slice(0, 3);
      const da = atlas.docs.filter((d) => clusterAt(d, li) === vsA);
      const db = atlas.docs.filter((d) => clusterAt(d, li) === vsB);
      const row = (label: string, x: string, y: string): string =>
        '<tr><td>' + esc(x) + '</td><th class="mid">' + esc(label) + '</th><td>' + esc(y) + '</td></tr>';
      vsEl.hidden = false;
      vsEl.innerHTML = [
        '<h4>' + esc(lv.names[vsA] || '?') + '  ↔  ' + esc(lv.names[vsB] || '?') + '</h4>',
        '<table>',
        row('만 쓰는 말', onlyA.join(', ') || '—', onlyB.join(', ') || '—'),
        row('둘 다 쓰는 말', both.slice(0, 3).join(', ') || '없다', ''),
        row('글', String(da.length) + '개', String(db.length) + '개'),
        row('손댄 지', avg(da, (d) => d.days) + '일', avg(db, (d) => d.days) + '일'),
        row('믿음', avg(da, (d) => d.honest) + '/8', avg(db, (d) => d.honest) + '/8'),
        row('갈래 섞임', avg(da, (d) => d.mix) + '종', avg(db, (d) => d.mix) + '종'),
        '</table>',
        '<button data-vs-close="1">그만 견주기</button>',
      ].join('');
      vsEl.querySelector('[data-vs-close]')?.addEventListener('click', () => {
        vsA = null; vsB = null;
        vsEl.hidden = true;
        draw();
      });
    }

    function showCard(d: Doc): void {
      const li = levelIndex();
      const c = clusterAt(d, li);
      const cname = c != null && atlas ? (li >= 0 ? atlas.levels[li].names : atlas.clusterNames)[c] : '';
      card.hidden = false;
      card.innerHTML = [
        /* **어느 글인지**는 제목이 아니라 id 로 알린다 — 우리 지도엔 제목까지 같은 글이
           넷 있어서, 제목으로 세면 서로 다른 글이 같은 글로 보인다(자 하나가 그걸로 헛빨개졌다). */
        '<div class="atlas-card-title" data-doc-id="' + esc(d.id) + '">' + esc(d.title) + '</div>',
        '<div class="atlas-card-meta">' + esc(d.lane)
          + (cname ? ' · ' + esc(cname) : '')
          + (d.status ? ' · ' + esc(d.status) : '') + '</div>',
        '<div class="atlas-card-path">' + esc(d.id) + '</div>',
        (() => {
          const t = openTarget(d);
          return t ? '<a class="atlas-open" href="' + esc(t.href) + '" target="_blank" rel="noopener noreferrer">'
            + t.label + ' ↗</a>' : '';
        })(),
        '<div class="atlas-card-meta">'
          + (d.days != null ? '마지막으로 손댄 지 ' + d.days + '일' : '손댄 날 모름')
          + ' · 엮인 글 ' + (d.links ?? 0) + '곳'
          + (d.buried ? ' · 묻힘' : '') + '</div>',
        /* 이 자리를 얼마나 믿어도 되나. 숫자만 던지지 않고 뜻을 붙인다 —
           「3/8」 만 보면 좋은 건지 나쁜 건지 모른다. */
        (d.alone != null
          ? '<div class="atlas-card-meta">붙는 정도 ' + d.alone.toFixed(2)
            + (d.lonely ? ' — <b>어디에도 안 붙는 글</b>' : ' (1 쯤이면 이웃과 어울린다)') + '</div>'
          : ''),
        (d.mix != null
          ? '<div class="atlas-card-meta">이웃에 낀 갈래 ' + d.mix.toFixed(1) + '종'
            + (d.mix >= MEET_AT ? ' — <b>갈래가 만나는 자리</b>' : ' — 같은 갈래끼리 모여 있다') + '</div>'
          : ''),
        (d.honest != null
          ? '<div class="atlas-card-meta">이 자리 믿음 ' + d.honest + '/8'
            + (d.honest <= LIE_AT ? ' — <b>닮은 글이 지도에서 멀다 (찢김)</b>'
              : d.honest >= 6 ? ' — 옆에 있으면 정말 가깝다' : '') + '</div>'
          : ''),
        /* **닮은 글** — 이 지도에서 제일 값어치 있는 자리다. 링크로 엮어 둔 글은
           내가 이미 아는 사이고, 여기 뜨는 것은 **엮어 두지 않았는데 닮은** 글이다.
           벡터로 미리 구해 둔 것이라 여기서 모델을 부르지 않는다. */
        (() => {
          if (!atlas || !d.near || !d.near.length) return '';
          const rows = d.near.slice(0, 5).map((j) => {
            const o = atlas!.docs[j];
            if (!o) return '';
            return '<button data-goto="' + esc(o.id) + '">' + esc(headOf(o.title)) + '</button>';
          }).join('');
          return rows ? '<div class="atlas-near"><b>닮은 글</b>' + rows + '</div>' : '';
        })(),
      ].join('');
      /* 목록에서 누르면 그 글로 **간다** — 읽기만 되고 못 가면 목록이 아니라 장식이다. */
      card.querySelectorAll('[data-goto]').forEach((el) => {
        el.addEventListener('click', () => {
          const id = (el as HTMLElement).dataset.goto!;
          const o = atlas?.docs.find((x) => x.id === id);
          if (!o) return;
          chosen = o;
          flyTo([o]);
          showCard(o);
          draw();
        });
      });
    }

    /* 손 얹기는 **마우스·펜에만** 있다 — 손가락엔 「얹기」가 없다(대면 곧 누른 것이다). */
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || touches.size) return;
      const r = canvas.getBoundingClientRect();
      const h = pick(e.clientX - r.left, e.clientY - r.top);
      if (h !== hover) { hover = h; draw(); }
      canvas.style.cursor = h ? 'pointer' : 'grab';
    });
    canvas.addEventListener('click', (e) => {
      /* 작은 지도를 눌렀으면 그리로 건너뛴다 — 여기서 안개를 빠져나온다.
         점 고르기보다 **먼저** 본다. 안 그러면 작은 지도 위의 점이 잡힌다. */
      /* **이름표를 눌렀으면 그 덩어리를 잡는다.** 하나 잡히면 다음 이름표와 견준다.
         점보다 먼저 본다 — 이름표 아래에 점이 있으면 점이 먼저 잡혀 버린다. */
      {
        const r1 = canvas.getBoundingClientRect();
        const dpr1 = window.devicePixelRatio || 1;
        const lx = (e.clientX - r1.left) * dpr1;
        const ly = (e.clientY - r1.top) * dpr1;
        const hitLabel = labelBoxes.find((l) => lx >= l.box[0] && lx <= l.box[0] + l.box[2]
          && ly >= l.box[1] && ly <= l.box[1] + l.box[3]);
        if (hitLabel) {
          if (vsA == null || vsB != null || hitLabel.c === vsA) { vsA = hitLabel.c; vsB = null; }
          else vsB = hitLabel.c;
          showVs();
          draw();
          return;
        }
      }

      if (miniBox) {
        const r0 = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const px = (e.clientX - r0.left) * dpr;
        const py = (e.clientY - r0.top) * dpr;
        if (px >= miniBox.x && px <= miniBox.x + miniBox.w && py >= miniBox.y && py <= miniBox.y + miniBox.h) {
          centerOn(((px - miniBox.x) / miniBox.w) * 2 - 1, ((py - miniBox.y) / miniBox.h) * 2 - 1);
          draw();
          return;
        }
      }
      const r = canvas.getBoundingClientRect();
      const d = pick(e.clientX - r.left, e.clientY - r.top);
      pickDoc(d);
    });
    /* 확대는 **손가락 아래를 붙잡고** 해야 한다. 원점 기준으로 곱하면 보고 있던
       곳이 화면 밖으로 밀려나 지도가 통째로 사라진다 (실제로 그랬다 — 이름표는
       계속 그려지는데 전부 화면 밖이라 「겹침 0」 이라는 거짓 초록까지 났다). */
    /**
     * **조종 입구 하나.** 마우스든 자판이든 작은 지도든 폰이든, 지도를 움직이는 길은
     * 여기 하나다.
     *
     * 왜 모으나: 지금은 마우스가 지도를 직접 만진다. 나중에 폰(TASK-KAR-230 파이프)이나
     * 손짓이 붙으면 각자 지도를 만지게 되고, 그러면 **같은 동작이 입력마다 달라진다**
     * (한쪽은 배율 한계가 있고 한쪽은 없는 식). 입구가 하나면 그런 갈라짐이 안 생긴다.
     * 밖에서도 부를 수 있게 창구를 낸다 — 자가 마우스 흉내를 안 내고 바로 밀 수 있다.
     *
     * 좌표는 **화면 픽셀**(dpr 곱한 값)이다. 지도 자리를 쓰는 건 `center` 뿐이다.
     */
    const control = {
      /** 화면을 dx·dy 픽셀만큼 민다. */
      pan(dx: number, dy: number): void {
        view.x += dx;
        view.y += dy;
      },
      /** (px,py) 를 붙잡은 채 factor 배 당긴다. 0.4~8 배로 묶는다. */
      zoom(factor: number, px?: number, py?: number): void {
        const cx = px == null ? canvas.width / 2 : px;
        const cy = py == null ? canvas.height / 2 : py;
        const next = Math.max(0.4, Math.min(8, view.scale * factor));
        const applied = next / view.scale;
        view.x = cx - (cx - view.x) * applied;
        view.y = cy - (cy - view.y) * applied;
        view.scale = next;
      },
      /** 지도 자리 (mx,my) 가 화면 한가운데 오게 옮긴다. */
      center(mx: number, my: number): void {
        centerOn(mx, my);
      },
      /** 처음 자리로. */
      reset(): void {
        view = { x: 0, y: 0, scale: 1 };
      },
      /** 지금 자세 — 밖에서 재려면 필요하다. */
      state(): { x: number; y: number; scale: number } {
        return { x: view.x, y: view.y, scale: view.scale };
      },
      /** 그린다. 밖에서 밀었으면 이걸 불러야 화면이 바뀐다. */
      draw(): void {
        draw();
      },
    };
    (window as unknown as Record<string, unknown>).__atlasControl = control;

    /** 옛 이름 — 안에서 쓰던 자리들이 그대로 돌게 둔다. 하는 일은 입구를 부르는 것뿐. */
    function zoomAt(px: number, py: number, factor: number): void {
      control.zoom(factor, px, py);
    }

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      zoomAt((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr, e.deltaY < 0 ? 1.12 : 0.89);
      draw();
    }, { passive: false });

    /* 마우스만으로는 못 쓰는 그림이 되면 안 된다. 끌기·확대·고르기 전부
       자판으로도 되게 한다 — 화살표로 밀고, +/- 로 확대, Enter 로 고른다.
       Tab 으로 초점을 받게 하고, 무엇인지 소리로도 알린다. */
    canvas.tabIndex = 0;
    /* 역할을 img 로 둔다 — 낭독기가 「그림」으로 알리고 안의 표를 대체 내용으로 읽는다. */
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '내 글 지형도. 화살표로 움직이고, 더하기·빼기로 확대·축소하고, 엔터로 가운데 글을 고르고, 대괄호로 닮은 글을 오간다. 배치는 뜻자리·축·덩어리·갈래 넷 중에 고른다.');
    canvas.addEventListener('keydown', (e) => {
      /* 표 안 단추에 초점이 있으면 그쪽 Enter 다 — 가로채면 자판으로 아무것도 못 누른다. */
      if (e.target !== canvas) return;
      const step = e.shiftKey ? 96 : 32;
      let used = true;
      switch (e.key) {
        case 'ArrowLeft': control.pan(step, 0); break;
        case 'ArrowRight': control.pan(-step, 0); break;
        case 'ArrowUp': control.pan(0, step); break;
        case 'ArrowDown': control.pan(0, -step); break;
        case '+': case '=': zoomAt(canvas.width / 2, canvas.height / 2, 1.2); break;
        case '-': case '_': zoomAt(canvas.width / 2, canvas.height / 2, 1 / 1.2); break;
        case 'Home': control.reset(); break;
        /**
         * **글에서 글로 옮겨 다닌다** — 자판만 쓰는 사람에게 「가운데 하나」는 길이 아니다.
         *
         * 접근성 정본이 「오가는 수고」를 따로 센다. 우리는 Enter 로 화면 가운데 글 하나만
         * 고를 수 있었다 — 옆 글로 가려면 마우스로 밀어야 했다. `]` 는 지금 글의 **닮은 글**
         * 다음 것, `[` 는 이전 것. 고른 게 없으면 가운데에서 시작한다.
         * (Tab 은 브라우저가 쓰고, 화살표는 이미 밀기라 남는 자리를 쓴다.)
         */
        case ']': case '[': {
          if (chosen && !nearFrom) nearFrom = chosen;
          const list = nearFrom?.near || [];
          if (!nearFrom || !list.length) {
            const r0 = canvas.getBoundingClientRect();
            pickDoc(pick(r0.width / 2, r0.height / 2) || pick(r0.width / 2, r0.height / 2, Math.max(r0.width, r0.height)));
            break;
          }
          const step2 = e.key === ']' ? 1 : -1;
          nearAt = ((nearAt + step2) % list.length + list.length) % list.length;
          const to = atlas?.docs[list[nearAt]];
          if (to) { pickDoc(to, true); centerOn(...(placed.get(to.id) as [number, number])); }
          break;
        }
        case 'Enter': case ' ': {
          const r = canvas.getBoundingClientRect();
          const d = pick(r.width / 2, r.height / 2)
            || pick(r.width / 2, r.height / 2, Math.max(r.width, r.height));
          /* 마우스로 누를 때처럼 **같은 길로 고른다** — 안 그러면 자판으로 고른 글에는
             닮은 글 줄이 안 그려진다(같은 일인데 손에 따라 결과가 달랐다). */
          pickDoc(d);
          break;
        }
        default: used = false;
      }
      if (used) { e.preventDefault(); draw(); }
    });

    let drag: { x: number; y: number } | null = null;
    /**
     * **마우스·손가락·펜을 한 코드로** (Pointer Events).
     *
     * 마우스 이벤트만 듣고 있었더니 폰에서 지도가 **한 픽셀도 안 움직였다**(실측).
     * 포인터로 바꾸면 셋 다 같은 길로 들어온다 — 그게 이 규격의 요점이다.
     * 끌기는 여전히 **조종 입구를 거친다**: 손이 달라도 규칙이 같아야 한다.
     *
     * 손가락 둘이면 **집기**(pinch) — 두 점 사이 거리가 벌어진 만큼 당긴다.
     * 배율 한계·중심 잡기는 입구가 이미 하니 여기서는 「얼마나」만 넘긴다.
     */
    const touches = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;

    function pointerMid(): { x: number; y: number } {
      const list = [...touches.values()];
      const n = list.length || 1;
      return {
        x: list.reduce((a, t) => a + t.x, 0) / n,
        y: list.reduce((a, t) => a + t.y, 0) / n,
      };
    }
    function pointerSpread(): number {
      const list = [...touches.values()];
      if (list.length < 2) return 0;
      return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
    }

    canvas.addEventListener('pointerdown', (e) => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      /* 포획해 둔다 — 손가락이 캔버스 밖으로 나가도 계속 우리 것이다. */
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 안 되면 그냥 둔다 */ }
      drag = pointerMid();
      pinchDist = pointerSpread();
    });
    const letGo = (e: PointerEvent): void => {
      touches.delete(e.pointerId);
      drag = touches.size ? pointerMid() : null;
      pinchDist = pointerSpread();
    };
    canvas.addEventListener('pointerup', letGo);
    canvas.addEventListener('pointercancel', letGo);
    canvas.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const mid = pointerMid();
      if (drag) {
        control.pan(mid.x - drag.x, mid.y - drag.y);
        drag = mid;
      }
      /* 손가락 둘 — 벌어진 비율만큼 당긴다. 잡는 자리는 두 손가락 한가운데. */
      const spread = pointerSpread();
      if (spread && pinchDist) {
        const dpr = window.devicePixelRatio || 1;
        const r = canvas.getBoundingClientRect();
        control.zoom(spread / pinchDist, (mid.x - r.left) * dpr, (mid.y - r.top) * dpr);
      }
      if (spread) pinchDist = spread;
      draw();
    });

    /* 없는 선은 그릴 수 없다 — 「한 번도 안 만난 덩어리 짝」은 목록으로 보여준다.
       다시 보는 데서 끝나지 않고 아직 안 해 본 조합을 짚어 주는 자리다. */
    const holesBtn = root.querySelector<HTMLButtonElement>('[data-holes]');
    holesBtn?.addEventListener('click', () => {
      const show = holesEl.hidden;
      holesEl.hidden = !show;
      holesBtn.classList.toggle('on', show);
      if (show && atlas) {
        holesEl.innerHTML = atlas.holes?.length
          ? '<b>아직 한 번도 서로를 안 부른 덩어리 짝</b>'
            + '<ol>' + atlas.holes.map((h) => '<li>' + esc(h.a) + ' ✕ ' + esc(h.b)
              + ' <span style="opacity:.55">(' + h.size[0] + '·' + h.size[1] + '개)</span></li>').join('') + '</ol>'
          : '안 만난 짝이 없다 — 모든 덩어리가 서로 이어져 있다.';
      }
    });

    /* 찾는 칸. 치는 대로 맞는 것만 남기고, **그리로 데려간다.**
       밝게만 하고 안 옮기면 맞는 점이 화면 밖에 있어 아무것도 안 보인다. */
    const findEl = root.querySelector('.atlas-find') as HTMLInputElement | null;
    findEl?.addEventListener('input', () => {
      query = findEl.value.trim();
      const hit = query && atlas ? atlas.docs.filter((d) => d.xy && matches(d)) : [];
      /* 못 찾았으면 화면을 옮기지 않는다 — 빈 들판으로 데려가면 길을 잃는다. */
      if (hit.length) flyTo(hit);
      (window as unknown as Record<string, unknown>).__atlasFound = hit.length;
      /* 몇 개 걸렸는지 머리말에 적는다 — 0 개면 「고장인가」 싶어진다. */
      if (query) countEl.innerHTML = '<b>' + esc('「' + query + '」' + (hit.length ? ' ' + hit.length + '개' : ' 없다')) + '</b>';
      else if (atlas) mount(atlas);
      draw();
    });

    const moreBtn = root.querySelector<HTMLButtonElement>('[data-more]');
    const extra = root.querySelector<HTMLElement>('.atlas-extra');
    moreBtn?.addEventListener('click', () => {
      const show = !!extra?.hidden;
      if (extra) extra.hidden = !show;
      moreBtn.classList.toggle('on', show);
      /* 펼치면 이름을 되풀이할 필요가 없다 — 단추들이 이미 보인다. */
      moreBtn.textContent = show ? '접기' : '더 보기 — 축 · 묻힌 것 · 안 만난 조합 · 시간';
    });

    const timeBtn = root.querySelector<HTMLButtonElement>('[data-time]');
    timeBtn?.addEventListener('click', () => {
      const show = timeEl.hidden;
      timeEl.hidden = !show;
      timeBtn.classList.toggle('on', show);
      if (!show) { timeAt = -1; draw(); return; }
      const months = atlas?.months || [];
      if (!months.length) { timeEl.textContent = '생일을 아는 글이 없어요.'; return; }
      timeAt = months.length - 1;
      timeEl.innerHTML = '<span>언제 쓴 글</span>'
        + '<input type="range" min="0" max="' + (months.length - 1) + '" value="' + timeAt + '">'
        + '<span class="now"></span>';
      const range = timeEl.querySelector('input') as HTMLInputElement;
      const now = timeEl.querySelector('.now') as HTMLElement;
      const paintNow = (): void => {
        const n = atlas?.docs.filter((d) => d.born === months[timeAt]).length ?? 0;
        now.textContent = months[timeAt] + ' · ' + n + '개';
      };
      range.addEventListener('input', () => { timeAt = Number(range.value); paintNow(); draw(); });
      paintNow();
      draw();
    });

    const lonelyBtn = root.querySelector('[data-lonely]') as HTMLElement | null;
    lonelyBtn?.addEventListener('click', () => {
      lonelyOn = !lonelyOn;
      lonelyBtn.classList.toggle('on', lonelyOn);
      (window as unknown as Record<string, unknown>).__atlasLonelyOn = lonelyOn;
      if (atlas) {
        const st = atlas.lonelyStat;
        const cnt = st ? st.marked : atlas.docs.filter((x) => x.lonely).length;
        const folded = (st as unknown as { folded?: { overlapBuried: number; marked: number } } | null)?.folded;
        countEl.innerHTML = lonelyOn
          ? '<b>' + esc(folded
            ? `이 판에선 접었다 — 「묻힌 글」과 ${folded.overlapBuried}/${folded.marked} 겹쳐 새 렌즈가 아니었다`
            : '어디에도 안 붙는 글 ' + cnt + '개 — 새 씨앗이거나 잘못 쓴 글이다') + '</b>'
          : '';
        if (!lonelyOn) mount(atlas);
      }
      draw();
    });

    /* **뭉친 자리** — 층과 헷갈리지 않게 말을 다르게 쓴다. 층은 「구획」(모두를 나눈다),
       이건 「뭉친 자리」(몇 군데만 집고 나머지는 허허벌판). 같은 말을 두 뜻으로 쓰면
       둘 다 안 읽힌다 — 「어디에도 안 붙는 글」은 이미 혼자(LOF)가 쓰고 있다. */
    /* 깊이는 **누를 때마다 한 칸씩** 늘고 넷째에 꺼진다 — 슬라이더를 새로 만들지 않는다
       (단추 하나면 자판으로도 같은 길이다). */
    const trailBtn = root.querySelector('[data-trail]') as HTMLElement | null;
    trailBtn?.addEventListener('click', () => {
      trailOn = !trailOn;
      trailCache = null;
      trailBtn.classList.toggle('on', trailOn);
      const t = trail();
      countEl.innerHTML = trailOn && t
        ? '<b>' + esc(`달 ${t.pts.length}개를 이었다 — 지도 폭의 ${(t.moved * 100).toFixed(0)}%를 움직였다`) + '</b>'
          + '<span style="opacity:.55">' + esc(` · 글이 적어 못 찍은 달 ${t.skipped}개`) + '</span>'
        : '';
      refreshHowto();
      draw();
    });

    const diffBtn = root.querySelector('[data-diff]') as HTMLElement | null;
    diffBtn?.addEventListener('click', () => {
      diffMode = diffMode + 1 >= DIFF_MODES.length ? -1 : diffMode + 1;
      diffCache = null;
      diffBtn.classList.toggle('on', diffMode >= 0);
      diffBtn.textContent = diffMode >= 0 ? `밀도 차 — ${DIFF_MODES[diffMode].name}` : '밀도 차';
      const g = diffGrid();
      const m = diffMode >= 0 ? DIFF_MODES[diffMode] : null;
      countEl.innerHTML = g && m
        ? (g.empty
          ? '<b>' + esc(`${g.empty} 이(가) 아직 0편이라 견줄 수 없다`) + '</b>'
          : '<b>' + esc(`${m.a} 쪽이 진한 칸 ${g.aCells} · ${m.b} 쪽 ${g.bCells} · 반반 ${g.mixCells}`) + '</b>'
            + '<span style="opacity:.55"> · 무리 크기로 나눠서 견준다</span>')
        : '';
      refreshHowto();
      draw();
    });

    const egoBtn = root.querySelector('[data-ego]') as HTMLElement | null;
    egoBtn?.addEventListener('click', () => {
      egoDepth = (egoDepth + 1) % 4;
      egoCache = null;
      egoBtn.classList.toggle('on', egoDepth > 0);
      egoBtn.textContent = egoDepth ? `이 글 둘레 ${egoDepth}` : '이 글 둘레';
      const e = egoSet();
      countEl.innerHTML = egoDepth
        ? (chosen
          ? '<b>' + esc(`「${headOf(chosen.title)}」 둘레 ${egoDepth}칸 — 글 ${e ? e.keep.size : 1}편`
            + (e ? ` (링크로 ${e.byLink} · 닮은 글로 ${e.byNear})` : '')) + '</b>'
          : '<b>' + esc('둘레를 보려면 먼저 글을 하나 고른다 (점을 누르거나 Enter)') + '</b>')
        : '';
      refreshHowto();
      draw();
    });

    /**
     * **폰을 조종기로** (TASK-KAR-233).
     *
     * 정본이 못 박는 제약 둘이 이 설계를 정한다:
     *  · `deviceorientation`·`devicemotion` 은 **보안 컨텍스트(HTTPS)에서만** 온다.
     *    폰이 데스크톱을 `http://192.168.x.x:8813` 로 열면 **센서 API 가 아예 없다** —
     *    그래서 **조용히 안 되게 두지 않고** 왜 안 되는지 화면에 적는다.
     *  · iOS 는 `requestPermission()` 을 **누름 안에서** 불러야 한다.
     *
     * 그리고 팔은 금방 지친다(어깨를 45° 넘게 벌리면 버티는 시간이 반으로 준다) — 그래서
     *  · **클러치**: 「잡기」를 누르고 있는 동안만 움직인다. 떼면 즉시 멈춘다.
     *  · **누를 때 그 자세가 0점**이다 — alpha 는 기기 기준이라 흐르고, 무엇보다 사람이
     *    편한 자세에서 잡을 수 있어야 한다.
     *  · 몇 초 안 쓰면 **저절로 꺼진다**.
     */
    const phone = {
      on: false, secure: false, supported: false, permission: 'unasked',
      holding: false, zero: null as [number, number] | null,
      last: null as [number, number] | null, moves: 0, reason: '',
    };
    const publishPhone = (): void => {
      (window as unknown as Record<string, unknown>).__atlasPhone = { ...phone };
    };
    publishPhone();
    let phoneIdle: ReturnType<typeof setTimeout> | null = null;
    const phoneBtn = root.querySelector('[data-phone]') as HTMLElement | null;
    const grabBtn = root.querySelector('[data-grab]') as HTMLElement | null;

    /** 화면이 세로냐 가로냐에 따라 앞뒤·좌우가 바뀐다. */
    function tiltOf(beta: number, gamma: number): [number, number] {
      const ang = (screen as unknown as { orientation?: { angle?: number } }).orientation?.angle ?? 0;
      if (ang === 90) return [-beta, gamma];
      if (ang === 180) return [-gamma, -beta];
      if (ang === 270) return [beta, -gamma];
      return [gamma, beta];
    }

    function phoneSay(msg: string): void {
      countEl.innerHTML = '<b>' + esc(msg) + '</b>';
    }

    function phoneOff(why: string): void {
      phone.on = false; phone.holding = false; phone.zero = null; phone.reason = why;
      window.removeEventListener('deviceorientation', onTilt);
      if (phoneIdle) { clearTimeout(phoneIdle); phoneIdle = null; }
      phoneBtn?.classList.remove('on');
      if (grabBtn) grabBtn.hidden = true;
      publishPhone();
      refreshHowto();
    }

    function touchIdle(): void {
      if (phoneIdle) clearTimeout(phoneIdle);
      const ms = Number((window as unknown as Record<string, unknown>).__atlasPhoneIdleMs) || 30000;
      phoneIdle = setTimeout(() => {
        phoneOff('idle');
        phoneSay('폰 조종을 껐어요 — 한동안 안 움직였습니다');
      }, ms);
    }

    /** 기울인 만큼 지도를 민다. **잡고 있는 동안만.** */
    let grabView = { x: 0, y: 0 };
    function onTilt(e: DeviceOrientationEvent): void {
      const beta = e.beta ?? 0; const gamma = e.gamma ?? 0;
      phone.last = tiltOf(beta, gamma);
      touchIdle();
      if (!phone.holding) { publishPhone(); return; }
      if (!phone.zero) { phone.zero = phone.last; grabView = { x: view.x, y: view.y }; publishPhone(); return; }
      const CAP = 45;
      const dx = Math.max(-CAP, Math.min(CAP, phone.last[0] - phone.zero[0]));
      const dy = Math.max(-CAP, Math.min(CAP, phone.last[1] - phone.zero[1]));
      const gain = canvas.width / 90;
      view.x = grabView.x - dx * gain;
      view.y = grabView.y - dy * gain;
      phone.moves += 1;
      publishPhone();
      draw();
    }

    phoneBtn?.addEventListener('click', async () => {
      if (phone.on) { phoneOff('off'); phoneSay(''); return; }
      phone.secure = window.isSecureContext === true;
      phone.supported = typeof (window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent !== 'undefined';
      if (!phone.secure) {
        phone.reason = 'insecure'; publishPhone();
        phoneSay(`폰 센서는 HTTPS 에서만 옵니다 — 지금은 ${location.origin} 이라 쓸 수 없어요 (터널로 여세요)`);
        refreshHowto();
        return;
      }
      if (!phone.supported) {
        phone.reason = 'unsupported'; publishPhone();
        phoneSay('이 기기·브라우저에는 기울기 센서가 없어요');
        refreshHowto();
        return;
      }
      const ask = (window as unknown as { DeviceOrientationEvent: { requestPermission?: () => Promise<string> } })
        .DeviceOrientationEvent.requestPermission;
      if (typeof ask === 'function') {
        /* **누름 안에서** 물어야 한다 (iOS). 거절도 화면이 말한다 — 조용히 안 되면 못 고친다. */
        let st = 'denied';
        try { st = await ask(); } catch { st = 'denied'; }
        phone.permission = st;
        if (st !== 'granted') {
          phone.reason = 'denied'; publishPhone();
          phoneSay('센서 쓰기를 거절했어요 — 브라우저 설정에서 다시 허락해야 합니다');
          refreshHowto();
          return;
        }
      } else {
        phone.permission = 'notneeded';
      }
      phone.on = true; phone.reason = ''; phone.moves = 0;
      phoneBtn.classList.add('on');
      if (grabBtn) grabBtn.hidden = false;
      window.addEventListener('deviceorientation', onTilt);
      touchIdle();
      publishPhone();
      phoneSay('「잡기」를 누르고 있는 동안만 움직여요 — 누른 그 자세가 가운데입니다');
      refreshHowto();
    });

    const grabDown = (): void => {
      if (!phone.on) return;
      phone.holding = true; phone.zero = null; grabView = { x: view.x, y: view.y };
      grabBtn?.classList.add('on');
      publishPhone();
    };
    const grabUp = (): void => {
      if (!phone.holding) return;
      phone.holding = false; phone.zero = null;
      grabBtn?.classList.remove('on');
      publishPhone();
    };
    grabBtn?.addEventListener('pointerdown', grabDown);
    grabBtn?.addEventListener('pointerup', grabUp);
    grabBtn?.addEventListener('pointercancel', grabUp);
    grabBtn?.addEventListener('pointerleave', grabUp);
    /* 창을 떠나도 놓은 것으로 — 잡은 채로 잊히면 지도가 혼자 움직인다. */
    window.addEventListener('blur', grabUp);
    /* 위젯이 갈아 끼워질 때 창에 건 것을 걷는다 — 안 걷으면 판마다 쌓인다(셸 규칙). */
    const box = (typeof Toolbox !== 'undefined' && Toolbox) ? Toolbox : (window as unknown as { Toolbox?: unknown }).Toolbox;
    (box as { onDispose?: (fn: () => void) => void } | undefined)?.onDispose?.(() => {
      window.removeEventListener('deviceorientation', onTilt);
      window.removeEventListener('blur', grabUp);
      if (phoneIdle) clearTimeout(phoneIdle);
      if (hopTimer) clearInterval(hopTimer);
    });

    const matrixBtn = root.querySelector('[data-matrix]') as HTMLElement | null;
    matrixBtn?.addEventListener('click', () => {
      matrixOn = !matrixOn;
      matrixBtn.classList.toggle('on', matrixOn);
      draw();
      const sr = atlas?.seriation;
      countEl.innerHTML = matrixOn && sr
        ? '<b>' + esc(`행렬 — 자리 대신 **순서**만 쓴다. 줄·칸은 재서 고른 정렬(${sr.best}).`
          + ` 대각선 둘레에 띠가 보이면 정렬이 뜻을 가진 것이다`
          + ` (정렬로 얻는 것 ${Math.round(sr.gain * 100)}% · 섞은 자료면 ${Math.round(sr.shufGain * 100)}%)`) + '</b>'
        : matrixOn ? '<b>' + esc('행렬로 그릴 순서를 아직 안 구웠다') + '</b>' : '';
      refreshHowto();
    });

    const terrainBtn = root.querySelector('[data-terrain]') as HTMLElement | null;
    terrainBtn?.addEventListener('click', () => {
      terrainOn = !terrainOn;
      terrainBtn.classList.toggle('on', terrainOn);
      draw();
      const tf = (window as unknown as Record<string, unknown>).__atlasTerrain as
        Record<string, unknown> | undefined;
      countEl.innerHTML = terrainOn
        ? '<b>' + esc(`지형 — 높이 = 몰린 정도 · 경계는 없다. 봉우리 ${tf?.peaks ?? '?'}개`
          + ` (두드러짐 문턱 ${tf?.cut ?? '?'} · 되뽑기 ${tf?.runs ?? '?'}판)`
          + ` · 높낮이 ${tf?.relief ?? '?'} (고르게 흩으면 ${tf?.base ?? '?'}). 덩어리 색은 물러난다`) + '</b>'
        : '';
      refreshHowto();
    });

    const warpBtn = root.querySelector('[data-warp]') as HTMLElement | null;
    warpBtn?.addEventListener('click', () => {
      warpOn = !warpOn;
      warpBtn.classList.toggle('on', warpOn);
      (window as unknown as Record<string, unknown>).__atlasWarpOn = warpOn;
      const wp = atlas?.warp;
      countEl.innerHTML = warpOn && wp
        ? '<b>' + esc(`어긋남 — 찢김: 닮은 글 여덟 중 평균 ${(8 - wp.tearMean! * 8).toFixed(1)}개만 지도에서도 가깝다`
          + ` · 거짓 이웃: 화면 이웃 ${wp.k}개 중 ${Math.round(wp.fakeMean * 100)}%는 진짜로는 멀다`) + '</b>'
        : '';
      refreshHowto();
      draw();
    });

    const hopsBtn = root.querySelector('[data-hops]') as HTMLElement | null;
    hopsBtn?.addEventListener('click', () => {
      hopsOn = !hopsOn;
      hopsBtn.classList.toggle('on', hopsOn);
      if (hopTimer) { clearInterval(hopTimer); hopTimer = null; }
      if (hopsOn) {
        const n = atlas?.skeleton?.hops?.length || 0;
        if (!n) {
          hopsOn = false; hopsBtn.classList.remove('on');
          countEl.innerHTML = '<b>' + esc('흔든 판을 아직 안 구웠어요') + '</b>';
        } else if (reducedMotion()) {
          /* 움직임을 싫어하는 설정 — 돌리지 않고 **작은 여러 판**으로 늘어놓는다. */
          countEl.innerHTML = '<b>' + esc(`흔든 ${n}판을 한눈에 늘어놨어요 (움직임을 줄이는 설정이라 안 돌립니다)`) + '</b>';
        } else {
          hopFrame = 0;
          /* **탭이 숨으면 멈춘다.** 안 보이는 화면을 계속 다시 그리면 배터리만 태운다 —
             돌아오면 그 자리에서 다시 돈다(판 번호는 그대로 두니 이어 보인다). */
          const spin = (): void => {
            if (hopTimer) { clearInterval(hopTimer); hopTimer = null; }
            if (!hopsOn || document.hidden) return;
            hopTimer = setInterval(() => {
              hopFrame = (hopFrame + 1) % n;
              publishHops();
              draw();
            }, HOP_MS);
          };
          document.addEventListener('visibilitychange', spin);
          (window as unknown as { Toolbox?: { onDispose?: (fn: () => void) => void } }).Toolbox?.onDispose?.(() => {
            document.removeEventListener('visibilitychange', spin);
            if (hopTimer) { clearInterval(hopTimer); hopTimer = null; }
          });
          spin();
          countEl.innerHTML = '<b>' + esc(`흔든 ${n}판을 한 판 ${HOP_MS}ms 로 돌립니다 — 판마다 얼마나 달라지는지 보세요`) + '</b>';
        }
      } else {
        countEl.innerHTML = '';
      }
      if (hopsOn && layout !== 'skeleton') {
        countEl.innerHTML = '<b>' + esc('흔들어 보기는 뼈대 화면에서 보입니다 — 「뼈대」를 누르세요') + '</b>';
      }
      publishHops();
      refreshHowto();
      draw();
    });

    const loopBtn = root.querySelector('[data-loop]') as HTMLElement | null;
    loopBtn?.addEventListener('click', () => {
      loopOn = !loopOn;
      loopBtn.classList.toggle('on', loopOn);
      (window as unknown as Record<string, unknown>).__atlasLoopOn = loopOn;
      if (loopOn && layout !== 'skeleton') {
        countEl.innerHTML = '<b>' + esc('고리는 뼈대 화면에서 보입니다 — 「뼈대」를 누르세요') + '</b>';
      }
      refreshHowto();
      draw();
    });

    const denseBtn = root.querySelector('[data-dense]') as HTMLElement | null;
    denseBtn?.addEventListener('click', () => {
      denseOn = !denseOn;
      denseBtn.classList.toggle('on', denseOn);
      (window as unknown as Record<string, unknown>).__atlasDenseOn = denseOn;
      if (atlas) {
        const dn = atlas.dense;
        countEl.innerHTML = denseOn && dn
          ? '<b>' + esc(`밀도로 뭉친 자리 ${dn.k}군데 (${dn.names.join(' · ')}) — 나머지 ${dn.noise}편은 허허벌판`) + '</b>'
          : denseOn ? '<b>' + esc('밀도로 뭉친 자리를 아직 안 구웠다') + '</b>' : '';
        if (!denseOn) mount(atlas);
      }
      refreshHowto();
      draw();
    });

    const meetBtn = root.querySelector('[data-meet]') as HTMLElement | null;
    meetBtn?.addEventListener('click', () => {
      meetOn = !meetOn;
      meetBtn.classList.toggle('on', meetOn);
      (window as unknown as Record<string, unknown>).__atlasMeetOn = meetOn;
      if (atlas) {
        const st = atlas.mixStat;
        countEl.innerHTML = meetOn
          ? '<b>' + esc('갈래가 만나는 자리 ' + (st ? st.meet : atlas.docs.filter((x) => (x.mix ?? 1) >= MEET_AT).length) + '곳'
            + (st ? ' — 이웃 갈래 평균 ' + st.mean.toFixed(2) + '종' : '')) + '</b>'
          : '';
        if (!meetOn) mount(atlas);
      }
      draw();
    });

    const lieBtn = root.querySelector('[data-lie]') as HTMLElement | null;
    lieBtn?.addEventListener('click', () => {
      lieOn = !lieOn;
      lieBtn.classList.toggle('on', lieOn);
      (window as unknown as Record<string, unknown>).__atlasLieOn = lieOn;
      if (atlas) {
        const bad = atlas.docs.filter((d) => (d.honest ?? 8) <= LIE_AT).length;
        countEl.innerHTML = lieOn
          ? '<b>' + esc('못 믿는 자리 ' + bad + '곳 — 여기선 「옆에 있다」가 거짓이다') + '</b>'
          : '';
        if (!lieOn) mount(atlas);
      }
      draw();
    });

    const buriedBtn = root.querySelector<HTMLButtonElement>('[data-buried]');
    buriedBtn?.addEventListener('click', () => {
      buriedOn = !buriedOn;
      buriedBtn.classList.toggle('on', buriedOn);
      draw();
    });

    root.querySelectorAll<HTMLButtonElement>('.atlas-modes button[data-layout]').forEach((b) => {
      b.addEventListener('click', () => {
        root.querySelectorAll('.atlas-modes button[data-layout]').forEach((o) => o.classList.remove('on'));
        b.classList.add('on');
        layout = (b.dataset.layout || 'meaning') as Layout;
        view = { x: 0, y: 0, scale: 1 };
        computePositions();
        draw();
      });
    });
    window.addEventListener('resize', () => draw());

    /**
     * 지도가 아무 말도 안 하면 보는 사람이 스스로 찾아야 한다. 원래 목적이
     * 「내가 어디에 쏠려 있나」를 보는 것이므로, 열자마자 **가장 센 사실 한 줄**을 말한다.
     *
     * 한 줄만이다. 여럿 적으면 어디를 볼지 몰라 되레 나빠진다 —
     * 그림 위 글자는 많을수록 좋은 게 아니다.
     */
    function headline(data: Atlas): string {
      const n = data.count || 0;
      if (!n) return '';
      const facts: Array<{ weight: number; say: string }> = [];

      /* ① 한 덩어리가 유난히 크면 그게 쏠림이다. */
      const size = new Map<number, number>();
      for (const d of data.docs) {
        const c = d.levels ? d.levels[0] : d.cluster;
        if (c == null) continue;
        size.set(c, (size.get(c) || 0) + 1);
      }
      const top = [...size.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) {
        const share = top[1] / n;
        const name = data.levels?.[0]?.names[top[0]] || '한 덩어리';
        facts.push({
          weight: share,
          say: `글 ${Math.round(1 / share)}개 중 1개가 「${name}」 쪽이에요 (${Math.round(share * 100)}%)`,
        });
      }

      /* ② 아무도 안 부르는 글이 많으면 그게 「쌓아만 둔 것」이다. */
      const linked = new Set<number>();
      for (const [a, b] of data.edges || []) { linked.add(a); linked.add(b); }
      const alone = data.docs.length - linked.size;
      if (alone > 0) {
        const share = alone / data.docs.length;
        facts.push({ weight: share * 0.9, say: `${alone}개(${Math.round(share * 100)}%)는 아무 글도 부르지 않아요` });
      }

      /* ③ 묻힌 글은 「다시 안 본 것」 — 이 지도의 원래 이유다. */
      if (data.buried > 0) {
        facts.push({ weight: (data.buried / n) * 6, say: `${data.buried}개는 오래됐고 아무도 안 불러요 — 묻힌 것` });
      }

      facts.sort((a, b) => b.weight - a.weight);
      return facts[0]?.say || '';
    }

    /** 지도를 화면에 앉힌다. 어디서 왔든(레포·기억해 둔 파일·방금 고른 파일) 여기로 온다. */
    function mount(data: Atlas): void {
      atlas = data;
      /* 기억해 둔 지도로 띄웠으면 **지워질 수 있는지**를 말해 준다. 레포에서 바로 읽은
         경우엔 해당 없다(fromMemory 가 false). */
      if (fromMemory) {
        void askPersist().then((ok) => {
          const el = root.querySelector('.atlas-kept') as HTMLElement | null;
          if (!el) return;
          el.hidden = false;
          el.textContent = ok === true
            ? '이 기계에 기억해 뒀어요 — 브라우저가 안 지웁니다'
            : ok === false
              ? '이 기계에 기억해 뒀어요 — 다만 공간이 모자라면 브라우저가 지울 수 있어요'
              : '이 기계에 기억해 뒀어요 — 이 브라우저는 「지우지 마라」를 청할 데가 없어요';
        });
      }
      /* 숫자만 있던 자리를 **뜻 있는 한 줄**로 바꾼다. 숫자는 작게 뒤에 붙인다. */
      const say = headline(data);
      countEl.innerHTML = (say ? '<b>' + esc(say) + '</b> · ' : '')
        + '<span style="opacity:.55">글 ' + data.count + '개 · 묻힌 것 ' + (data.buried ?? 0) + '개</span>';
      card.hidden = true;
      publishHops();
      computePositions();
      /* 한 번 그려서 캔버스 크기·자리를 잡은 뒤에 **문턱을 잰다** — 화면 크기가 문턱을 바꾼다. */
      draw();
      switchAt = measureSwitches();
      refreshHowto();
      draw();
    }

    /** 지도가 없을 때. 빈 화면은 고장과 구별이 안 되므로 왜 없는지와 무엇을 하면 되는지를 말한다. */
    function showEmpty(): void {
      countEl.textContent = '아직 안 구웠다';
      card.hidden = false;
      card.innerHTML = [
        '<div class="atlas-card-title">지도를 아직 안 불러왔어요</div>',
        '<div class="atlas-card-meta">지도 데이터는 이 레포에 담지 않아요 — 글 제목이 다 들어 있어서예요.',
        ' 파일은 <b>이 기계 밖으로 안 나갑니다.</b></div>',
        '<div class="atlas-card-path">내 기계에서 한 번 굽고: cd apps/karmolab &amp;&amp; node scripts/build-memo-atlas.mjs</div>',
        '<button class="atlas-pick">내 지도 불러오기</button>',
      ].join('');
      card.querySelector('.atlas-pick')?.addEventListener('click', () => {
        void pickAtlas().then((d) => { if (d) { fromMemory = true; mount(d as Atlas); } });
      });
    }

    /* 순서: ① 레포에 있으면 그것 ② 지난번에 골라 둔 것 ③ 아무것도 없으면 단추 */
    void fetch('/apps/karmolab/data/memo-atlas.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('없음'))))
      .catch(() => { fromMemory = true; return loadRemembered(); })
      .then((d) => { if (d) mount(d as Atlas); else showEmpty(); })
      .catch(() => showEmpty());
  }

  /**
   * **등록은 맨바깥 이름 `Toolbox` 로 한다.**
   *
   * 여기서 크게 데었다: `window.Toolbox` 만 보고 등록했더니 **진짜 화면에서 한 번도 안 떴다.**
   * 셸은 `const Toolbox = (() => {…})()` 로 만든다 — `const` 는 window 에 안 붙는다.
   * 다른 위젯들은 전부 맨바깥 이름을 그대로 쓴다(`declare const Toolbox`).
   * 그런데 우리 자 스물여섯은 **자기가 window.Toolbox 를 만들어 놓고** 위젯을 얹어 재는 통에
   * 전부 초록이었다 — 흉내가 진짜보다 살아 있으면 초록은 「흉내에서만 된다」는 뜻이다.
   * 그래서 맨바깥 이름을 **먼저** 보고, 없으면 window 를 본다(재는 판을 위해 남겨 둔다).
   */
  const w = window as unknown as {
    Toolbox?: { register: (m: unknown) => void; getLazyWidgetPublicMeta?: (id: string) => object };
  };
  const box = ((typeof Toolbox !== 'undefined' && Toolbox) ? Toolbox : w.Toolbox) as typeof w.Toolbox;
  if (box) {
    /* **이름·설명·아이콘은 여기서 또 적지 않는다.** 정본은 `widgets-lazy-meta.ts` 한 곳이고
       (도구 목록·찾기창·첫 화면이 거기서 읽는다) 여기서 따로 적으면 두 곳이 어긋난다.
       가져오는 자리가 없으면(재는 판) 예전 값으로 버틴다. */
    const meta = box.getLazyWidgetPublicMeta
      ? box.getLazyWidgetPublicMeta('memo-atlas')
      : { title: '내 글 지형도', category: 'lab', desc: '내가 쓴 글이 어디에 쏠려 있는지 한 장으로' };
    box.register({
      id: 'memo-atlas',
      ...meta,
      /* **셸은 `tabs[].build` 로만 그린다.** `render` 를 건네고 있었는데 셸에 그런 자리는
         없다 — 등록은 되는데 화면은 영영 「장비 꺼내는 중이에요…」였다. 우리 자들은
         `render` 를 직접 불러서 재느라 이걸 못 봤다(가짜 셸의 두 번째 구멍). */
      tabs: [{ id: 'map', label: '지도', build: render }],
    });
  }
})();

export {};
