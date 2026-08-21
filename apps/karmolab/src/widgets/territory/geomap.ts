/**
 * 지도판 — 타일 깔린 캔버스 한 장, 그 위에 마음대로 그린다 (TASK-KL-334)
 *
 * ⚠ **이 파일은 영토 위젯의 것이 아니다.** 지도를 쓰는 두 번째 위젯이 생기면
 * `src/lib/geomap.ts` 로 `git mv` 하면 그만이도록 짰다 — 여기서 `territory` 를 아무것도 안 부른다.
 * (`lib/README.md`: 「나중에 쓸 것 같아서 미리 올리지 마라」. 그래서 지금은 쓰는 곳 옆에 둔다.)
 *
 * ## 왜 남의 지도 라이브러리를 안 쓰나
 *
 * Leaflet 을 먼저 골랐다가 **위젯 하나 = gzip 64KB** 라는 예산에서 되물렸다
 * (`scripts/audit-bundle-budget.mjs`). Leaflet 만 gzip 42KB — 예산의 2/3 를 지도 껍데기가 먹고
 * 정작 우리가 그릴 영토가 들어갈 자리가 없다. 그리고 이 위젯이 진짜로 필요한 것은
 * 「마커·팝업·DOM 레이어」가 아니라 **캔버스 한 장에 픽셀을 칠할 자리**뿐이다.
 * 필요한 것만 짜면 이만큼이다.
 *
 * ## 그리는 법
 *
 * 웹 메르카토르 그대로다. 확대율 z 에서 세계는 `256 · 2^z` 픽셀짜리 정사각형이고,
 * 위경도는 그 안의 좌표로 접힌다. 화면은 그 세계의 한 조각을 잘라 보는 창이다.
 *
 * 확대율은 **소수를 허용한다**(z = 11.4). 휠을 굴릴 때 뚝뚝 끊기지 않게 하려면 그래야 한다.
 * 타일은 정수 층에서만 있으므로 가장 가까운 층을 받아 `2^(z - 층)` 배로 늘려 그린다.
 *
 * 놀고 있을 때는 **아무것도 안 한다** — 애니메이션 루프가 없다. 그릴 일이 생길 때만
 * `requestAnimationFrame` 한 번을 잡는다(탭이 가려지면 브라우저가 알아서 안 부른다).
 */

/** 화면 좌표(캔버스 CSS 픽셀). */
export interface Point {
  x: number;
  y: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/**
 * 덧그리기 붓. 지도가 타일을 다 깐 뒤 이걸 부른다.
 * `ctx` 는 이미 CSS 픽셀 단위로 맞춰져 있다(고해상도 화면 보정은 지도가 한다).
 */
export type Painter = (ctx: CanvasRenderingContext2D, map: GeoMap) => void;

export interface GeoMapOptions {
  center?: LatLng;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  /** `{z}/{x}/{y}` 자리표가 든 타일 주소. 빈 문자열이면 타일을 안 받는다(바탕 없이 덧그림만). */
  tileUrl?: string;
  /** 오른쪽 아래 출처 표기. 타일을 받는다면 **반드시** 적는다. */
  attribution?: string;
  /** 타일이 없는 자리의 색. */
  background?: string;
  /**
   * 타일을 그릴 때 걸 필터 (`ctx.filter` 문법). 바탕을 회색으로 깎으면 그 위에 얹는 색이 산다 —
   * 알록달록한 지도와 브랜드 색이 서로 싸우는 것을 막는 가장 싼 방법이다.
   */
  tileFilter?: string;
}

const TILE = 256;
const MAX_TILE_CACHE = 400;

/** 위경도 → 세계 픽셀 (확대율 z). */
function projectWorld(lat: number, lng: number, z: number): Point {
  const size = TILE * Math.pow(2, z);
  const x = ((lng + 180) / 360) * size;
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size;
  return { x, y };
}

/** 세계 픽셀 → 위경도. */
function unprojectWorld(x: number, y: number, z: number): LatLng {
  const size = TILE * Math.pow(2, z);
  const lng = (x / size) * 360 - 180;
  const n = Math.PI * (1 - (2 * y) / size);
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return { lat, lng };
}

export class GeoMap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly host: HTMLElement;
  private readonly opts: Required<GeoMapOptions>;
  private readonly painters: Painter[] = [];
  private readonly viewListeners: Array<(map: GeoMap) => void> = [];
  /** 받아서 **한 번 손본 뒤** 담아 두는 타일. 값이 `null` 이면 아직 오는 중이거나 실패다. */
  private readonly tiles = new Map<string, CanvasImageSource | null>();
  private readonly ro: ResizeObserver;

  private center: LatLng;
  private zoom: number;
  private width = 0;
  private height = 0;
  private frame = 0;
  private resizeTimer = 0;
  /** 자판 미끄러짐을 멈추는 손잡이 — `destroy()` 가 부른다(안 멈추면 사라진 지도를 계속 민다). */
  private stopGlide: () => void = () => {};
  private dead = false;

  constructor(host: HTMLElement, options: GeoMapOptions = {}) {
    this.host = host;
    this.opts = {
      center: options.center ?? { lat: 36.5, lng: 127.9 },
      zoom: options.zoom ?? 7,
      minZoom: options.minZoom ?? 3,
      maxZoom: options.maxZoom ?? 18,
      tileUrl: options.tileUrl ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: options.attribution ?? '© OpenStreetMap',
      background: options.background ?? '#101216',
      tileFilter: options.tileFilter ?? ''
    };
    this.center = { ...this.opts.center };
    this.zoom = this.opts.zoom;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    host.appendChild(canvas);
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('캔버스를 못 엽니다');
    this.ctx = ctx;

    this.bindPointer();
    this.bindKeys();
    /* ★ 크기 알림은 **모아서** 받는다. 셸이 인트로를 접거나 스크롤막대가 나타났다 사라지면
       이 알림이 프레임마다 쏟아지고, 한 번마다 화면을 다시 그리면 브라우저가 통째로 멎는다
       (2026-08-20 실측: 영토 계산을 완전히 꺼도 멎었다 — 범인은 여기였다).
       마지막 알림에서 한 박자 쉬고 한 번만 반영한다. */
    this.ro = new ResizeObserver(() => {
      if (this.resizeTimer !== 0) clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.resizeTimer = 0;
        this.resize();
      }, 120);
    });
    this.ro.observe(host);
    this.resize();
  }

  /* ── 좌표 ── */

  /** 위경도 → 화면 좌표. 그림 그릴 때 쓴다. */
  project(lat: number, lng: number): Point {
    const w = projectWorld(lat, lng, this.zoom);
    const c = projectWorld(this.center.lat, this.center.lng, this.zoom);
    return { x: w.x - c.x + this.width / 2, y: w.y - c.y + this.height / 2 };
  }

  /** 화면 좌표 → 위경도. 마우스가 어디를 짚었는지 알 때 쓴다. */
  unproject(x: number, y: number): LatLng {
    const c = projectWorld(this.center.lat, this.center.lng, this.zoom);
    return unprojectWorld(c.x + x - this.width / 2, c.y + y - this.height / 2, this.zoom);
  }

  /** 지금 화면에 보이는 범위. */
  bounds(): Bounds {
    const a = this.unproject(0, 0);
    const b = this.unproject(this.width, this.height);
    return {
      minLat: Math.min(a.lat, b.lat),
      maxLat: Math.max(a.lat, b.lat),
      minLng: Math.min(a.lng, b.lng),
      maxLng: Math.max(a.lng, b.lng)
    };
  }

  /** 화면 1픽셀이 몇 km 인가 — 격자를 얼마나 촘촘히 훑을지 정할 때 쓴다. */
  kmPerPixel(): number {
    const size = TILE * Math.pow(2, this.zoom);
    return (40075.017 * Math.cos((this.center.lat * Math.PI) / 180)) / size;
  }

  getCenter(): LatLng {
    return { ...this.center };
  }

  getZoom(): number {
    return this.zoom;
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  setView(lat: number, lng: number, zoom?: number): void {
    this.center = { lat, lng };
    if (zoom !== undefined) this.zoom = this.clampZoom(zoom);
    this.emitView();
    this.redraw();
  }

  /** 이 범위가 다 보이도록 맞춘다. */
  fit(b: Bounds, padding = 24): void {
    const lat = (b.minLat + b.maxLat) / 2;
    const lng = (b.minLng + b.maxLng) / 2;
    let z = this.opts.maxZoom;
    for (; z > this.opts.minZoom; z -= 0.25) {
      const a = projectWorld(b.maxLat, b.minLng, z);
      const c = projectWorld(b.minLat, b.maxLng, z);
      if (c.x - a.x <= this.width - padding * 2 && c.y - a.y <= this.height - padding * 2) break;
    }
    this.center = { lat, lng };
    this.zoom = this.clampZoom(z);
    this.emitView();
    this.redraw();
  }

  /* ── 덧그림 ── */

  /** 타일 위에 그릴 붓을 건다. 부른 순서대로 그린다. */
  addPainter(p: Painter): void {
    this.painters.push(p);
    this.redraw();
  }

  /** 화면이 움직였을 때(끌기·확대·크기 변경) 알림. 통계 다시 세는 데 쓴다. */
  onView(cb: (map: GeoMap) => void): void {
    this.viewListeners.push(cb);
  }

  /** 다음 프레임에 한 번만 다시 그린다. 여러 번 불러도 한 번이다. */
  redraw(): void {
    if (this.dead || this.frame !== 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** 이미 프레임 안에 있을 때 쓴다 — 미루면 <b>한 박자 늦어 절반만 그려진다</b>(아래 실측). */
  private drawNow(): void {
    if (this.dead) return;
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.draw();
  }

  destroy(): void {
    this.dead = true;
    this.stopGlide();
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    if (this.resizeTimer !== 0) clearTimeout(this.resizeTimer);
    this.ro.disconnect();
    this.tiles.clear();
    this.canvas.remove();
  }

  /* ── 안쪽 ── */

  private clampZoom(z: number): number {
    return Math.max(this.opts.minZoom, Math.min(this.opts.maxZoom, z));
  }

  private emitView(): void {
    for (const cb of this.viewListeners) cb(this);
  }

  private resize(): void {
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    /* 2px 이하의 흔들림은 무시한다 — 스크롤막대가 나타났다 사라지는 것만으로도 이 값이 떤다. */
    if (Math.abs(w - this.width) <= 2 && Math.abs(h - this.height) <= 2) return;
    this.width = w;
    this.height = h;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.emitView();
    this.redraw();
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.opts.background;
    ctx.fillRect(0, 0, this.width, this.height);
    if (this.opts.tileUrl !== '') this.drawTiles(ctx);
    for (const p of this.painters) {
      ctx.save();
      p(ctx, this);
      ctx.restore();
    }
    this.drawAttribution(ctx);
  }

  /**
   * **밑바탕 한 겹** — 늘 깔려 있어 구멍이 안 생긴다 (사용자 제보 2026-08-21:
   * 「가장자리 아니여도 중앙이든 어디든 칸 비었다가 보이는」).
   *
   * 윗 층·아랫 층으로 메우기는 <b>그 칸을 전에 본 적이 있을 때만</b> 통한다. 처음 보는 땅으로
   * 옮기면 대신 그릴 것이 <b>하나도 없다</b>(실측: 옮긴 뒤 축소하니 빈 칸 132개, 메운 칸 0개).
   * 그래서 가장 성긴 층 한 겹을 먼저 깔고 그 위에 또렷한 층을 얹는다.
   *
   * ⚠ 층 번호를 두 번 잘못 잡았다 — 재서 알았다:
   *   `tz - 1` : 축소할 때마다 밑바탕도 <b>같이 처음 보는 층</b>이 된다 → 켜나 끄나 합 29 로 동일
   *   `minZoom`: 축소해서 <b>닿는 층이 바로 그 층</b>이라 또 겹친다 → 합 24
   *   `minZoom - 2`: 어디로 가든 밑에 깔린다 → <b>합 3</b> (끔은 31)
   * 4층이면 나라 하나가 몇 장뿐이라 값도 싸고, <b>첫 화면을 그릴 때 이미 받아 둔다</b>.
   */
  private drawTiles(ctx: CanvasRenderingContext2D): void {
    const tz = Math.max(0, Math.min(19, Math.round(this.zoom)));
    const baseZ = Math.max(0, this.opts.minZoom - 2);
    if (baseZ < tz) this.drawLevel(ctx, baseZ, false);
    this.drawLevel(ctx, tz, true);
  }

  /** 한 층을 화면에 깐다. `fill` 이면 안 온 칸을 위·아래 층으로 메우고 둘레도 미리 받는다. */
  private drawLevel(ctx: CanvasRenderingContext2D, tz: number, fill: boolean): void {
    const scale = Math.pow(2, this.zoom - tz);
    const drawn = TILE * scale;
    const c = projectWorld(this.center.lat, this.center.lng, tz);
    /* 화면 왼쪽 위가 세계 어디인가 — 확대율 tz 의 픽셀로. */
    const left = c.x - this.width / 2 / scale;
    const top = c.y - this.height / 2 / scale;
    const n = Math.pow(2, tz);
    const x0 = Math.floor(left / TILE);
    const y0 = Math.floor(top / TILE);
    const x1 = Math.floor((left + this.width / scale) / TILE);
    const y1 = Math.floor((top + this.height / scale) / TILE);

    ctx.imageSmoothingEnabled = true;
    /* ★ **가장자리는 미리 받아 둔다** (사용자 제보 2026-08-21: 「축소할 때 로딩안됐던 가장자리들이
     * 깜빡깜빡」). 축소하면 <b>화면 밖에 있던 땅이 안으로 들어온다</b>. 그 칸은 아직 한 번도 받은 적이
     * 없어 윗 층으로도 아랫 층으로도 못 메운다 — 가장자리만 비는 이유다.
     * 그래서 화면 둘레 한 칸을 <b>그리진 않고 받아만</b> 둔다. 들어올 때는 이미 손에 있다.
     * ⚠ 한 칸까지만이다. 두 칸이면 요청이 배로 늘어 남의 서버(OSM)를 그만큼 더 때린다. */
    if (fill) for (let ty = y0 - 1; ty <= y1 + 1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = x0 - 1; tx <= x1 + 1; tx++) {
        if (ty >= y0 && ty <= y1 && tx >= x0 && tx <= x1) continue;   /* 화면 안은 아래에서 그린다 */
        this.tile(tz, ((tx % n) + n) % n, ty);
      }
    }
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = x0; tx <= x1; tx++) {
        /* 경도는 한 바퀴 돈다 — 날짜변경선을 넘어도 타일이 있다. */
        const wrapped = ((tx % n) + n) % n;
        const img = this.tile(tz, wrapped, ty);
        const sx = (tx * TILE - left) * scale;
        const sy = (ty * TILE - top) * scale;
        /* 0.5px 겹쳐 그린다 — 소수 확대율에서 타일 사이에 실금이 보인다. */
        if (img !== null) {
          ctx.drawImage(img, sx, sy, drawn + 0.5, drawn + 0.5);
          continue;
        }
        /* ★ **안 온 칸은 비워 두지 않는다** (사용자 제보 2026-08-21: 「확대하려고 하면 깜빡깜빡」).
         * 확대율이 정수 층을 넘으면 `tz` 가 통째로 바뀌는데, 그 층 타일은 <b>아직 하나도 없다</b>.
         * 예전엔 그때 `continue` 해서 <b>화면 전체가 바탕색</b>이 됐다가 타일이 도착하면 다시 찼다 —
         * 그 한두 프레임이 「깜빡」이다. 이미 가진 <b>윗 층</b>을 잘라 늘려 메우면 흐릿할 뿐 안 끊긴다.
         * 지도 보는 프로그램들이 다 쓰는 방식이고, 새 타일이 오면 그 위에 또렷하게 덮인다. */
        if (!fill) continue;   /* 밑바탕 층은 있는 것만 깐다 — 메우기는 또렷한 층의 몫 */
        const up = this.ancestorTile(tz, wrapped, ty);
        if (up !== null) {
          ctx.drawImage(up.img, up.sx, up.sy, up.size, up.size, sx, sy, drawn + 0.5, drawn + 0.5);
          continue;
        }
        /* ★ **축소는 반대쪽에서 메운다** (사용자 제보 2026-08-21: 「축소할때는 여전히 같은 문제」).
         * 확대할 때는 위에서 내려온 층(`ancestorTile`)이 이미 있지만, 축소하면 새 층이 <b>더 위</b>라
         * 가진 것이 하나도 없다 — 대신 방금까지 보던 <b>아랫 층</b>이 손에 있다.
         * 아랫 층 네 칸(또는 열여섯 칸)을 제자리에 줄여 그려 메운다. 한두 칸만 있어도 그만큼 덜 빈다. */
        for (let k = 1; k <= 2; k++) {
          const span = 1 << k;
          const part = (drawn + 0.5) / span;
          let any = false;
          for (let iy = 0; iy < span; iy++) {
            for (let ix = 0; ix < span; ix++) {
              const kid = this.tiles.get(`${tz + k}/${wrapped * span + ix}/${ty * span + iy}`);
              if (kid === null || kid === undefined) continue;
              ctx.drawImage(kid, sx + ix * part, sy + iy * part, part + 0.5, part + 0.5);
              any = true;
            }
          }
          if (any) break;
        }
      }
    }
  }

  /**
   * 안 온 칸을 대신할 **이미 가진 윗 층** 조각. 없으면 `null`.
   *
   * 윗 층 한 칸은 아랫 층 `2^k × 2^k` 칸을 덮는다 — 그 중 내 자리에 해당하는 네모만 잘라 쓴다.
   * ⚠ 여기서는 <b>새로 받아오지 않는다</b>(`tiles.get` 만 본다). 받아오면 확대할 때마다 윗 층까지
   *   덩달아 요청해 남의 서버를 두 배로 때린다 — 메우는 것은 <b>이미 가진 것으로만</b> 한다.
   */
  private ancestorTile(tz: number, tx: number, ty: number): { img: CanvasImageSource; sx: number; sy: number; size: number } | null {
    for (let k = 1; k <= 5; k++) {
      const pz = tz - k;
      if (pz < 0) break;
      const img = this.tiles.get(`${pz}/${tx >> k}/${ty >> k}`);
      if (img === null || img === undefined) continue;
      const span = 1 << k;              /* 윗 층 한 칸이 덮는 아랫 층 칸 수 */
      const size = TILE / span;         /* 잘라 쓸 네모의 한 변 */
      return { img, sx: (tx % span) * size, sy: (ty % span) * size, size };
    }
    return null;
  }

  /**
   * 타일 하나. 아직 안 왔으면 `null` 을 주고, 오면 다시 그린다.
   *
   * ★ 색 깎기(`tileFilter`)는 **받을 때 한 번만** 한다. 그릴 때마다 `ctx.filter` 를 걸면
   * 한 화면에 쉰 장을 매 프레임 다시 깎게 되고, 그것만으로 렌더러가 잡아먹힌다
   * (2026-08-20 실측: 브라우저가 응답을 멈췄다). 깎은 결과를 담아 두면 그 뒤로는 그냥 그림이다.
   */
  private tile(z: number, x: number, y: number): CanvasImageSource | null {
    const key = z + '/' + x + '/' + y;
    const cached = this.tiles.get(key);
    if (cached !== undefined) return cached;
    if (this.tiles.size > MAX_TILE_CACHE) {
      /* 오래된 것부터 버린다 — Map 은 넣은 순서를 기억한다. */
      const oldest = this.tiles.keys().next();
      if (!oldest.done) this.tiles.delete(oldest.value);
    }
    this.tiles.set(key, null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      this.tiles.set(key, this.bake(img));
      this.redraw();
    };
    img.onerror = () => this.redraw();
    img.src = this.opts.tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    return null;
  }

  /** 받은 타일을 한 번 깎아 담는다. 필터가 없으면 그림 그대로 쓴다. */
  private bake(img: HTMLImageElement): CanvasImageSource {
    if (this.opts.tileFilter === '') return img;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || TILE;
    c.height = img.naturalHeight || TILE;
    const cx = c.getContext('2d');
    if (cx === null) return img;
    cx.filter = this.opts.tileFilter;
    cx.drawImage(img, 0, 0);
    return c;
  }

  private drawAttribution(ctx: CanvasRenderingContext2D): void {
    const text = this.opts.attribution;
    if (text === '') return;
    ctx.font = '11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(this.width - w, this.height - 18, w, 18);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText(text, this.width - w + 5, this.height - 5);
  }

  /* ── 손가락·마우스 ──
     끌기와 두 손가락 확대를 같은 자리에서 다룬다. 포인터 이벤트 하나면 마우스·터치·펜이
     같은 길로 들어온다 — 터치 이벤트를 따로 안 짜도 된다. */

  /* ── 자판으로도 지도를 움직인다 (화살표 옮기기 · +/- 확대) ────────────────
   *
   * 끌기·집기만 있으면 <b>손을 못 쓰는 사람에게 이 지도는 한 자리에 굳어 있다</b> —
   * 처음 보이는 화면 말고는 아무 데도 못 간다. `audit:mouse-only` 가 그래서 이 파일을 짚는다.
   *
   * ⚠ 그 감사는 <b>글자만 본다</b>(`keydown` 한 줄이면 통과한다). 그러니 아무 손잡이나 달면
   *   초록은 되지만 지도는 그대로다 — 그건 가짜 초록이다. 손이 쓰는 것과 <b>같은 `panBy`·
   *   `zoomAround`</b> 를 부른다. 자판으로 간 결과가 끌어서 간 결과와 글자 그대로 같다.
   *
   * 한 걸음은 화면의 <b>1/6</b>(Shift 면 1/2) — 박아 둔 px 은 큰 화면에서 안 움직이고 폰에서 튄다.
   * 확대는 끌기와 같은 단위(`zoomAround` 의 1 = 한 단)이고, 가운데를 축으로 잡는다. */
  private bindKeys(): void {
    const el = this.canvas;
    el.tabIndex = 0;
    el.setAttribute('role', 'application');
    el.setAttribute('aria-label', '영토 지도 — 화살표로 옮기고 +/- 로 확대');
    /* ★ **누른 동안 미끄러진다** (사용자 결정 2026-08-21: 「뚝뚝 끊겨 움직이는 것보다 부드럽게」).
     * 처음엔 한 번 누를 때마다 화면의 1/6 씩 <b>건너뛰게</b> 했다. 그러면 보던 자리가
     * 어디로 갔는지 <b>눈이 못 따라간다</b> — 끌 때는 손이 이어져 있어 그런 일이 없다.
     *
     * ⚠ 이 지도의 규율은 <b>「놀고 있을 때는 아무것도 안 한다」</b>(파일 맨 위 주석)다.
     *   그래서 고리는 <b>키를 누르는 동안만</b> 돌고 다 떼면 그 자리에서 멈춘다.
     *   창을 벗어나도(`blur`) 눌린 채로 남지 않게 비운다 — 안 그러면 영영 미끄러진다.
     * ⚠ 자판 자동 반복(`e.repeat`)은 안 쓴다 — 반복 속도가 기계 설정마다 달라 같은 조작이
     *   다르게 느껴진다. 시각으로 직접 굴려야 어디서나 같다. */
    const held = new Set<string>();
    let glide = 0;
    let last = 0;
    const PAN_PER_SEC = 0.9;   /* 1초에 화면 높이의 90% — 끌 때의 손 속도에 맞춘 값 */
    const ZOOM_PER_SEC = 1.6;  /* 1초에 확대 1.6단 */

    const step = (now: number): void => {
      if (this.dead || held.size === 0) { glide = 0; return; }
      const dt = Math.min(0.05, (now - last) / 1000);   /* 탭이 쉬었다 오면 한 번에 튀지 않게 */
      last = now;
      const r = el.getBoundingClientRect();
      const fast = held.has('Shift') ? 2 : 1;
      const dx = ((held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)) * r.width * PAN_PER_SEC * dt * fast;
      const dy = ((held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0)) * r.height * PAN_PER_SEC * dt * fast;
      if (dx !== 0 || dy !== 0) this.panBy(dx, dy);
      const dz = ((held.has('+') || held.has('=') ? 1 : 0) - (held.has('-') || held.has('_') ? 1 : 0)) * ZOOM_PER_SEC * dt * fast;
      if (dz !== 0) this.zoomAround({ x: r.width / 2, y: r.height / 2 }, dz);
      /* ★ **여기서는 미루면 안 된다** (2026-08-21 실측). `panBy` 는 평소처럼 다음 프레임에
         그리도록 예약하는데, 우리는 <b>이미 그 프레임 안</b>이다. 그러면 그리기가 한 박자씩
         밀려 <b>두 프레임에 한 번만</b> 그려진다 — 화면은 60fps 인데 지도는 30fps 다.
         잰 값: 화면 프레임 간격 17ms 인데 그려진 간격은 32ms(43판 중 18판이 33ms 초과).
         사용자가 「뚝뚝 끊긴다」고 한 것이 이것이다. 예약을 걷고 지금 그린다. */
      this.drawNow();
      glide = requestAnimationFrame(step);
    };
    const start = (): void => {
      if (glide !== 0) return;
      last = performance.now();
      glide = requestAnimationFrame(step);
    };
    const stop = (): void => {
      if (glide !== 0) cancelAnimationFrame(glide);
      glide = 0;
      held.clear();
    };
    this.stopGlide = stop;

    const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_'];
    el.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!KEYS.includes(e.key)) return;
      e.preventDefault();
      if (e.repeat) return;
      held.add(e.key);
      if (e.shiftKey) held.add('Shift');
      start();
    });
    el.addEventListener('keyup', (e) => {
      held.delete(e.key);
      if (e.key === 'Shift') held.delete('Shift');
      if (held.size === 0) stop();
    });
    el.addEventListener('blur', stop);
  }

  private bindPointer(): void {
    const active = new Map<number, Point>();
    let lastPinch = 0;

    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.style.cursor = 'grabbing';
    });

    el.addEventListener('pointermove', (e) => {
      const prev = active.get(e.pointerId);
      if (prev === undefined) return;
      const now = { x: e.clientX, y: e.clientY };
      active.set(e.pointerId, now);

      if (active.size === 1) {
        this.panBy(prev.x - now.x, prev.y - now.y);
        return;
      }
      if (active.size === 2) {
        const pts = [...active.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastPinch > 0 && dist > 0) {
          const rect = el.getBoundingClientRect();
          const mid = { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top };
          this.zoomAround(mid, Math.log2(dist / lastPinch));
        }
        lastPinch = dist;
      }
    });

    const end = (e: PointerEvent): void => {
      active.delete(e.pointerId);
      if (active.size < 2) lastPinch = 0;
      if (active.size === 0) el.style.cursor = 'grab';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        /* 휠 한 칸 = 확대율 0.5. 트랙패드는 잘게 오므로 그대로 비례시킨다. */
        const step = -e.deltaY * (e.deltaMode === 1 ? 0.08 : 0.0025);
        this.zoomAround(at, Math.max(-1.5, Math.min(1.5, step)));
      },
      { passive: false }
    );

    el.addEventListener('dblclick', (e) => {
      const rect = el.getBoundingClientRect();
      this.zoomAround({ x: e.clientX - rect.left, y: e.clientY - rect.top }, 1);
    });
  }

  private panBy(dx: number, dy: number): void {
    const c = projectWorld(this.center.lat, this.center.lng, this.zoom);
    this.center = unprojectWorld(c.x + dx, c.y + dy, this.zoom);
    this.emitView();
    this.redraw();
  }

  /** 화면의 그 점을 **제자리에 붙들고** 확대한다 — 커서 밑의 땅이 안 도망가야 한다. */
  private zoomAround(at: Point, delta: number): void {
    const before = this.unproject(at.x, at.y);
    this.zoom = this.clampZoom(this.zoom + delta);
    const after = this.project(before.lat, before.lng);
    this.panBy(after.x - at.x, after.y - at.y);
  }
}
