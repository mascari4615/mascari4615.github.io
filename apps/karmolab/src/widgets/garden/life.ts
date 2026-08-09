/**
 * 격자 한 판 (TASK-KL-211)
 *
 * 규칙은 **9칸**만 본다: 자기 자신과 둘러싼 여덟. 그 한 줄이 세계 전부다.
 *
 * 가장자리는 **이어 붙인다**(토러스). 벽을 세우면 거기서만 이상한 일이 생겨, 규칙이 만든 것과
 * 벽이 만든 것을 구별할 수 없게 된다 — 관찰물로서는 그게 제일 나쁘다.
 *
 * 나이(`age`)를 따로 센다. 색을 나이로 칠하면 **방금 태어난 것과 오래 버틴 것이 구별되고**,
 * 그 순간 화면이 「점의 무리」에서 「살고 있는 것」으로 바뀐다.
 */

export interface Stats {
  gen: number;
  pop: number;
  born: number;
  died: number;
  /** 살아있는 칸들의 무게중심 (0~1). 무리가 흘러가는지 보는 데 쓴다. */
  cx: number;
  cy: number;
  /** 이 판의 지문 — 같은 모습으로 돌아왔는지 알아채는 데 쓴다. */
  hash: number;
}

export class Life {
  readonly w: number;
  readonly h: number;
  cells: Uint8Array;
  age: Uint16Array;
  private back: Uint8Array;
  private backAge: Uint16Array;
  gen = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cells = new Uint8Array(w * h);
    this.age = new Uint16Array(w * h);
    this.back = new Uint8Array(w * h);
    this.backAge = new Uint16Array(w * h);
  }

  /** 온 판에 뿌리기. `density` = 살아 있는 칸의 비율. */
  seed(rand: () => number, density = 0.28): void {
    this.gen = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const on = rand() < density ? 1 : 0;
      this.cells[i] = on;
      this.age[i] = on;
    }
  }

  /** 가운데 한 점에서 키우기 — 퍼져 나가는 것 자체가 볼거리인 규칙들을 위해. */
  seedPoint(rand: () => number, density = 0.5, radius = 9): void {
    this.gen = 0;
    this.cells.fill(0);
    this.age.fill(0);
    const cx = this.w >> 1;
    const cy = this.h >> 1;
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y > radius * radius) continue;
        const yy = cy + y;
        const xx = cx + x;
        if (yy < 0 || yy >= this.h || xx < 0 || xx >= this.w) continue;
        const on = rand() < density ? 1 : 0;
        this.cells[yy * this.w + xx] = on;
        this.age[yy * this.w + xx] = on;
      }
    }
  }

  /** 한 세대. 이웃 수는 가장자리를 이어 붙여 센다. */
  step(born: Uint8Array, stay: Uint8Array): Stats {
    const { w, h, cells, age, back, backAge } = this;
    let pop = 0;
    let bornN = 0;
    let diedN = 0;
    let sx = 0;
    let sy = 0;
    let hash = 2166136261;

    for (let y = 0; y < h; y++) {
      const yUp = ((y - 1 + h) % h) * w;
      const yMid = y * w;
      const yDn = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const xL = (x - 1 + w) % w;
        const xR = (x + 1) % w;
        const n =
          cells[yUp + xL] + cells[yUp + x] + cells[yUp + xR] +
          cells[yMid + xL] + cells[yMid + xR] +
          cells[yDn + xL] + cells[yDn + x] + cells[yDn + xR];

        const i = yMid + x;
        const alive = cells[i];
        const next = alive ? stay[n] : born[n];
        back[i] = next;
        if (next) {
          backAge[i] = alive ? Math.min(65535, age[i] + 1) : 1;
          pop++;
          sx += x;
          sy += y;
          if (!alive) bornN++;
          hash = Math.imul(hash ^ (i + 1), 16777619);
        } else {
          backAge[i] = 0;
          if (alive) diedN++;
        }
      }
    }

    this.cells.set(back);
    this.age.set(backAge);
    this.gen++;

    return {
      gen: this.gen,
      pop,
      born: bornN,
      died: diedN,
      cx: pop ? sx / pop / w : 0.5,
      cy: pop ? sy / pop / h : 0.5,
      hash: hash >>> 0
    };
  }
}

/* ── 무슨 일이 일어났나 ───────────────────────────────────────────────── */

export type EventKind =
  | 'extinct'   // 아무도 안 남았다
  | 'frozen'    // 더 이상 변하지 않는다
  | 'cycle'     // 같은 모습으로 돌아온다
  | 'bloom'     // 갑자기 불어났다
  | 'collapse'  // 갑자기 줄었다
  | 'drift'     // 무리가 한쪽으로 흘러간다
  | 'steady';   // 오래 아무도 죽지 않는다

export interface Event {
  kind: EventKind;
  gen: number;
  /** 문장에 채워 넣을 값 */
  value?: number;
}

/**
 * 사건 판정기.
 *
 * 개체수·지문·무게중심만 보고 판정한다 — 「글라이더를 찾아내라」 같은 건 하지 않는다.
 * 그건 패턴 인식이고, 우리가 하려는 건 **관찰자가 느끼는 것을 말로 옮기는 일**이다:
 * 「멈췄다」 「돌아왔다」 「흘러간다」 「갑자기 불어났다」.
 */
export class Watcher {
  private seen = new Map<number, number>(); // 지문 → 그때의 세대
  private pops: number[] = [];
  private lastCx = 0.5;
  private lastCy = 0.5;
  private driftAcc = 0;
  private lastEventGen = -999;
  private lastKind: EventKind | null = null;

  observe(s: Stats): Event | null {
    this.pops.push(s.pop);
    if (this.pops.length > 64) this.pops.shift();

    let ev: Event | null = null;

    if (s.pop === 0) {
      ev = { kind: 'extinct', gen: s.gen };
    } else if (s.born === 0 && s.died === 0) {
      ev = { kind: 'frozen', gen: s.gen };
    } else {
      const at = this.seen.get(s.hash);
      if (at !== undefined && s.gen - at >= 2 && s.gen - at <= 240) {
        ev = { kind: 'cycle', gen: s.gen, value: s.gen - at };
      }
    }

    // 무게중심이 한 방향으로 계속 밀리면 「흘러간다」
    const dx = s.cx - this.lastCx;
    const dy = s.cy - this.lastCy;
    // 토러스라 한 바퀴 돌면 좌표가 튄다 — 튄 프레임은 흐름으로 안 센다
    if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) this.driftAcc += Math.hypot(dx, dy);
    this.lastCx = s.cx;
    this.lastCy = s.cy;

    if (!ev && this.pops.length >= 24) {
      const prev = this.pops[this.pops.length - 12];
      if (prev > 40 && s.pop > prev * 1.9) ev = { kind: 'bloom', gen: s.gen, value: Math.round((s.pop / prev) * 10) / 10 };
      else if (prev > 40 && s.pop < prev * 0.45) ev = { kind: 'collapse', gen: s.gen, value: Math.round((1 - s.pop / prev) * 100) };
      else if (this.driftAcc > 0.55) {
        ev = { kind: 'drift', gen: s.gen };
        this.driftAcc = 0;
      } else if (s.died === 0 && s.gen > 30) ev = { kind: 'steady', gen: s.gen };
    }

    this.seen.set(s.hash, s.gen);
    if (this.seen.size > 4096) this.seen.clear();

    if (!ev) return null;
    // 같은 말을 연달아 하지 않는다 — 관찰 일지지 경보기가 아니다
    if (ev.kind === this.lastKind && s.gen - this.lastEventGen < 90) return null;
    if (s.gen - this.lastEventGen < 12) return null;
    this.lastEventGen = s.gen;
    this.lastKind = ev.kind;
    return ev;
  }

  reset(): void {
    this.seen.clear();
    this.pops = [];
    this.driftAcc = 0;
    this.lastEventGen = -999;
    this.lastKind = null;
  }
}
