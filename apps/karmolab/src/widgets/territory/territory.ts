/**
 * 영토. 이 땅의 주인은 누구인가 (TASK-KL-334)
 *
 * 사용자: "편의점 뿐만아니라 카페나 햄버거가게 같이 여러 좋류의 영토 점령을 보고 싶어잉"
 *
 * 화면 픽셀마다 **가장 가까운 가게**를 묻고 그 브랜드 색으로 칠한다. 그러면 지도 위에
 * 여기부터 저 골목까지는 GS25 땅이 눈으로 보인다. 계산은 `core/territory` 에 있고
 * (화면 없이 돌고 MCP 로도 나간다), 지도판은 `geomap.ts` 다. 여기는 그 둘을 붙이는 껍데기다.
 *
 * ## 폴리곤을 안 만든다
 *
 * 원본(conbini.kikkia.dev)은 보로노이 폴리곤을 미리 만들어 geojson 으로 8MB 를 보낸다.
 * 우리는 **점만 보내고 칠하기는 화면에서** 한다. 자료가 126KB 로 줄고, 업종을 바꿔도 즉시고,
 * 무엇보다 **면적 점유율이 픽셀을 세는 것만으로 나온다**(원본에 없는 수다).
 *
 * 다만 픽셀마다 묻는 것은 공짜가 아니다. 그래서 ① 실제로는 몇 픽셀에 한 번만 묻고(`step`)
 * 작은 그림을 늘려 그린다 ② 끌고 있는 동안에는 성기게, 손을 떼면 촘촘하게 다시 그린다.
 */
import { t, loadNamespace } from '../../lib/i18n';
import { GeoMap } from './geomap';
import { buildGrid, nearest, share, type Grid, type Industry, type Store } from '../../core/territory';

(function (): void {
  if (typeof Toolbox === 'undefined') return;

  const NS = 'territory';

  /** 자료 파일 주소. Tauri 에서도 같은 출처로 풀리게 위젯 스크립트 자리에서 되짚는다. */
  function dataUrl(name: string): string {
    const w = window as unknown as { KARMOLAB_WIDGET_SCRIPT_BASE?: string };
    if (w.KARMOLAB_WIDGET_SCRIPT_BASE) return new URL('../../data/' + name, w.KARMOLAB_WIDGET_SCRIPT_BASE).href;
    return (typeof location !== 'undefined' ? location.origin : '') + '/apps/karmolab/data/' + name;
  }

  interface BrandMeta {
    id: string;
    label: string;
    color: string;
  }

  interface Dataset {
    industry: Industry;
    source: string;
    sample: boolean;
    scale: number;
    brands: BrandMeta[];
    counts: Record<string, number>;
    points: Record<string, number[]>;
  }

  /** 시군구 하나. 화면에 그릴 (단순화한) 경계와 미리 잰 점유율. */
  interface District {
    code: string;
    name: string;
    /** MultiPolygon 좌표 [poly][ring][pt][lng,lat] */
    rings: number[][][][];
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
    /** 브랜드 id → 이 구에서 먹은 땅 % */
    share: Record<string, number>;
    stores: Record<string, number>;
    /** 주인 있는 땅이 이 구의 몇 % 인가 */
    covered: number;
  }

  interface Loaded {
    meta: Dataset;
    grid: Grid;
    color: Map<string, string>;
    /** 색을 RGB 로 미리 풀어 둔다. 픽셀 수만큼 문자열을 파싱할 수는 없다. */
    rgb: Map<string, [number, number, number]>;
  }

  const INDUSTRIES: Array<{ id: Industry; label: () => string }> = [
    { id: 'convenience', label: () => t('territory.industry.convenience', undefined, '편의점') },
    { id: 'cafe', label: () => t('territory.industry.cafe', undefined, '카페') },
    { id: 'burger', label: () => t('territory.industry.burger', undefined, '햄버거') }
  ];

  /** 접어 둔 좌표를 되편다. 만든 자리는 `scripts/gen-territory-data.mjs`. */
  function unpack(meta: Dataset): Store[] {
    const out: Store[] = [];
    for (const [brand, flat] of Object.entries(meta.points)) {
      let lat = 0;
      let lng = 0;
      for (let i = 0; i < flat.length; i += 2) {
        lat += flat[i];
        lng += flat[i + 1];
        out.push({ lat: lat / meta.scale, lng: lng / meta.scale, brand });
      }
    }
    return out;
  }

  function hexRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'territory',
    title: t('widgets.territory.title', undefined, '영토'),
    category: 'lab',
    desc: t('widgets-desc.territory.desc', undefined, '우리 동네 땅 주인은 CU 인가 GS25 인가. 편의점, 카페, 햄버거 브랜드 점령도'),
    layout: 'full',
    icon:
      '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M9 4v13.5M15 6.5V20" fill="none" stroke="currentColor" stroke-width="1.1" opacity=".55"/>',
    tabs: [
      {
        id: 'app',
        label: t('territory.tab.map', undefined, '지도'),
        build: function (container: HTMLElement): void {
          void loadNamespace(NS).then(function () {
            render(container);
          });
        }
      }
    ]
  });

  /**
   * 화면 옷. 블루마블이 먼저 푼 문제를 그대로 쓴다. 위젯 상자 안에 지도를 가두면
   * 창문이 아니라 계기판 안의 썸네일이 된다. 머리띠 높이만큼 음수 여백으로 올라타
   * 화면을 통째로 쓰고, 조작부는 전부 지도 **위에** 떠 있는다.
   */
  const CSS = `
.terr-wrap{--terr-head:52px;--terr-side:52px;position:relative;width:100%;
  margin-top:calc(var(--terr-head) * -1);
  height:100svh;max-height:100svh;
  border-radius:var(--radius-md,12px);overflow:hidden;background:#0c0e12;}
.terr-wrap:fullscreen{--terr-head:0px;--terr-side:16px;margin-top:0;height:100%;max-height:none;border-radius:0;}
.terr-map{position:absolute;inset:0;}
/* --terr-side = 왼쪽 셸 난간이 지도 위를 덮는 폭. 지도는 화면 끝까지 그리되(그게 목적이다)
   **조작부와 범례는 난간 오른쪽부터** 놓는다. 안 그러면 첫 칩과 순위표 왼쪽이 잘린다. */
/* 위아래 그늘. 글자가 지도 위에서 묻히지 않게. 지도는 그대로 비친다. */
.terr-scrim-top{position:absolute;top:0;left:0;right:0;height:calc(var(--terr-head) + 74px);z-index:1;
  pointer-events:none;background:linear-gradient(to bottom,rgba(6,8,12,.72),rgba(6,8,12,0));}
.terr-scrim-bottom{position:absolute;left:0;right:0;bottom:0;height:120px;z-index:1;
  pointer-events:none;background:linear-gradient(to top,rgba(6,8,12,.86),rgba(6,8,12,0));}
.terr-bar{position:absolute;top:calc(10px + var(--terr-head));left:var(--terr-side);right:16px;z-index:4;
  display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.terr-chip{appearance:none;border:1px solid rgba(255,255,255,.16);background:rgba(10,14,22,.55);
  color:rgba(255,255,255,.58);font-size:12px;line-height:1;padding:7px 11px;border-radius:999px;
  cursor:pointer;backdrop-filter:blur(6px);}
.terr-chip:hover{border-color:rgba(255,255,255,.4);}
.terr-chip[aria-pressed="true"]{color:#eaf2ff;border-color:rgba(150,190,255,.5);background:rgba(30,52,96,.55);}
.terr-right{margin-inline-start:auto;display:flex;gap:6px;}
/* 범례 = 순위표. 색, 이름, 땅 넓이 막대, 퍼센트. 원본에 없던 면적이 주인공이다. */
.terr-legend{position:absolute;left:var(--terr-side);bottom:18px;z-index:3;min-width:216px;max-width:min(52%,280px);
  background:rgba(10,14,22,.62);backdrop-filter:blur(7px);border:1px solid rgba(255,255,255,.09);
  border-radius:var(--radius-md,12px);padding:10px 12px;pointer-events:none;}
.terr-row{display:grid;grid-template-columns:11px 1fr auto;gap:8px;align-items:center;
  padding:3px 0;font-size:12px;color:#e6ebf3;}
.terr-sw{width:11px;height:11px;border-radius:3px;}
.terr-bararea{position:relative;height:5px;border-radius:3px;background:rgba(255,255,255,.09);overflow:hidden;}
.terr-fill{position:absolute;inset:0 auto 0 0;border-radius:3px;}
.terr-pct{font-family:var(--font-mono,ui-monospace,monospace);font-size:11px;color:rgba(255,255,255,.72);
  font-variant-numeric:tabular-nums;}
.terr-name{font-size:11px;color:rgba(255,255,255,.82);margin-bottom:2px;}
/* 아래 한 줄. 숫자를 늘어놓지 않고 문장으로 말한다. */
.terr-note{position:absolute;left:var(--terr-side);right:16px;bottom:0;z-index:3;padding:0 2px 12px;
  font-size:13px;line-height:1.55;color:#dbe3f0;pointer-events:none;text-shadow:0 1px 10px rgba(0,0,0,.8);}
.terr-warn{color:#ffc98a;}
@media (max-width:520px){
  .terr-wrap{--terr-side:10px;}
  .terr-legend{right:10px;bottom:64px;max-width:none;}
  .terr-note{font-size:12px;}
}`;

  function render(container: HTMLElement): void {
    if (document.getElementById('terr-css') === null) {
      const style = document.createElement('style');
      style.id = 'terr-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    /* ★ 조작부, 범례는 전부 지도 **위에** 얹는다(absolute). 흐름으로 지도 아래에 두었더니
       글이 길어짐 → 지도 높이 바뀜 → 화면 범위 바뀜 → 통계 다시 셈 → 글 길어짐이
       끝없이 돌아 브라우저가 멎었다 (2026-08-20 실측). 칠하는 값이 제 크기에 되먹임되면 안 된다. */
    container.innerHTML = `
      <div class="terr-wrap">
        <div class="terr-map"></div>
        <div class="terr-scrim-top"></div>
        <div class="terr-scrim-bottom"></div>
        <div class="terr-bar">
          <div class="terr-tabs" style="display:flex;gap:6px"></div>
          <div style="display:flex;gap:6px;margin-inline-start:14px">
            <button type="button" class="terr-chip terr-mode" data-mode="auto" aria-pressed="true">${esc(t('territory.mode.auto', undefined, '자동'))}</button>
            <button type="button" class="terr-chip terr-mode" data-mode="area" aria-pressed="false">${esc(t('territory.mode.area', undefined, '단색'))}</button>
            <button type="button" class="terr-chip terr-mode" data-mode="store" aria-pressed="false">${esc(t('territory.mode.store', undefined, '얼룩'))}</button>
          </div>
          <div class="terr-right">
            <button type="button" class="terr-chip terr-dots" aria-pressed="false">${esc(t('territory.label.dots', undefined, '가게 점 보기'))}</button>
            <!-- ★ 글자(⛶)로 그리지 않는다 (사용자 제보 2026-08-21: 뭘 누르라는건지 문자가 깨져서
                 안보이는데). 그 기호는 흔한 글꼴에 없어 두부 네모로 뜬다. 재 봤다: 이 기계의
                 Arial 에서 그 기호의 폭이 없는 글자와 똑같았다(= 대체 글리프). 그러면 무슨
                 단추인지 알 길이 없다. 그림(svg)은 글꼴을 안 탄다. 이름은 aria-label 로 말한다. -->
            <button type="button" class="terr-chip terr-full" title="${esc(t('territory.label.full', undefined, '전체 화면'))}" aria-label="${esc(t('territory.label.full', undefined, '전체 화면'))}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
          </div>
        </div>
        <div class="terr-legend"></div>
        <div class="terr-note"></div>
      </div>`;

    const wrapEl = container.querySelector('.terr-wrap') as HTMLElement;
    const tabsEl = container.querySelector('.terr-tabs') as HTMLElement;
    const mapEl = container.querySelector('.terr-map') as HTMLElement;
    const legendEl = container.querySelector('.terr-legend') as HTMLElement;
    const noteEl = container.querySelector('.terr-note') as HTMLElement;
    const dotsEl = container.querySelector('.terr-dots') as HTMLButtonElement;
    const fullEl = container.querySelector('.terr-full') as HTMLButtonElement;

    /**
     * 보기 방식.
     *
     * - `auto`. **보는 거리에 따라 말하는 단위가 달라진다.** 전국을 보면 시도 17개, 당겨 오면
     *   시군구 250개, 더 당기면 가게마다 제 땅을 칠하는 얼룩. 원본(conbini)도 도도부현↔셀
     *   두 단계였다. 멀리서 250개는 이미 모래알이고, 가까이서 17개는 아무 말도 안 한다.
     * - `area`. 늘 단색(1등이 통째로). 판세만 보고 싶을 때.
     * - `store`. 늘 얼룩. 사실에 가장 가깝다.
     */
    type Mode = 'auto' | 'area' | 'store';
    type Unit = 'sido' | 'sgg' | 'store';
    let mode: Mode = 'auto';

    /**
     * 지금 무엇으로 말할 것인가.
     *
     * ★ 문턱을 **확대율 숫자가 아니라 보이는 폭(km)** 으로 잡는다. 같은 z 라도 4K 모니터는
     * 전국이 다 보이고 폰은 시 하나만 보인다. 숫자로 자르면 화면 크기에 따라 말이 달라진다.
     * 폭으로 자르면 전국이 보이면 시도, 시 몇 개면 시군구, 동네가 보이면 가게가 늘 같다.
     */
    function unitNow(): Unit {
      if (mode === 'store') return 'store';
      const km = map.kmPerPixel() * map.size.width;
      if (mode === 'area') return km > 320 ? 'sido' : 'sgg';
      return km > 320 ? 'sido' : km > 45 ? 'sgg' : 'store';
    }

    const modeEls = Array.from(container.querySelectorAll('.terr-mode')) as HTMLButtonElement[];
    for (const b of modeEls) {
      b.onclick = () => {
        const next = (b.dataset.mode ?? 'auto') as Mode;
        if (next === mode) return;
        mode = next;
        for (const x of modeEls) x.setAttribute('aria-pressed', x.dataset.mode === mode ? 'true' : 'false');
        syncUnit();
      };
    }

    /** 단위가 바뀌면 필요한 것만 다시 준비한다. 얼룩은 계산이 있고, 단색은 미리 잰 값이라 공짜다. */
    let lastUnit: Unit | null = null;
    function syncUnit(): void {
      const u = unitNow();
      if (u === lastUnit) return;
      lastUnit = u;
      if (u === 'store') {
        raster = null;
        startJob(map);
      } else {
        stopJob();
      }
      map.redraw();
      updateSide();
    }

    let dotsOn = false;
    dotsEl.onclick = () => {
      dotsOn = !dotsOn;
      dotsEl.setAttribute('aria-pressed', dotsOn ? 'true' : 'false');
      map.redraw();
    };
    fullEl.onclick = () => {
      if (document.fullscreenElement === wrapEl) void document.exitFullscreen();
      else void wrapEl.requestFullscreen();
    };

    const map = new GeoMap(mapEl, {
      center: { lat: 36.6, lng: 127.9 },
      zoom: 7,
      minZoom: 6,
      maxZoom: 17,
      attribution: '© OpenStreetMap',
      /* 바탕을 회색으로 깎고 살짝 어둡게. 그 위의 브랜드 색만 살아난다.
         원본(conbini)이 기본 OSM 위에 색을 얹어 서로 싸우던 것이 안 예뻤던 진짜 이유다. */
      tileFilter: 'grayscale(1) brightness(.72) contrast(.88)',
      background: '#0c0e12'
    });
    Toolbox.onDispose(() => map.destroy());

    let loaded: Loaded | null = null;
    let current: Industry = 'convenience';
    /* 끌고 있는 동안에는 성기게 칠한다. 손을 떼면 촘촘하게 한 번 더. 그래야 안 끊긴다. */
    let settle = 0;

    const cache = new Map<Industry, Loaded>();

    /* 업종 단추 */
    for (const ind of INDUSTRIES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'terr-chip';
      b.dataset.ind = ind.id;
      b.textContent = ind.label();
      b.onclick = () => {
        void select(ind.id);
      };
      tabsEl.appendChild(b);
    }

    function markTabs(): void {
      for (const b of Array.from(tabsEl.children) as HTMLButtonElement[]) {
        b.setAttribute('aria-pressed', b.dataset.ind === current ? 'true' : 'false');
      }
    }

    async function load(industry: Industry): Promise<Loaded> {
      const hit = cache.get(industry);
      if (hit !== undefined) return hit;
      const res = await fetch(dataUrl('territory/' + industry + '.json'));
      if (!res.ok) throw new Error('자료를 못 받았습니다 (' + res.status + ')');
      const meta = (await res.json()) as Dataset;
      const stores = unpack(meta);
      const color = new Map<string, string>();
      const rgb = new Map<string, [number, number, number]>();
      for (const b of meta.brands) {
        color.set(b.id, b.color);
        rgb.set(b.id, hexRgb(b.color));
      }
      const made: Loaded = { meta, grid: buildGrid(stores), color, rgb };
      cache.set(industry, made);
      return made;
    }

    /* ── 시군구 ──
       지금 보이는 만큼이 아니라 **행정구역** 단위로 묻는 것이 사람의 진짜 질문이다 . 
       우리 구는 누구 땅인가. 그 답은 화면과 무관하게 고정이라 `scripts/gen-territory-sgg.mjs`
       가 미리 재 두었다(방문자 계산 0). 여기서는 받아서 경계를 그리고, 짚은 구를 찾을 뿐이다. */
    /** 단위별 경계, 점유율. `sgg` = 시군구 250, `sido` = 시도 17. */
    const areas = new Map<string, District[]>();
    let hovered: District | null = null;
    let sggWanted = false;

    /** 지금 단위의 구역들. 얼룩 단위면 없다. */
    function areasNow(): District[] | null {
      const u = unitNow();
      if (u === 'store') return null;
      return areas.get(u + ':' + current) ?? null;
    }

    async function loadAreas(level: 'sgg' | 'sido', industry: Industry): Promise<void> {
      if (areas.has(level + ':' + industry)) return;
      const [shapeRes, shareRes] = await Promise.all([
        fetch(dataUrl('territory/' + level + '.json')),
        fetch(dataUrl('territory/' + level + '-' + industry + '.json'))
      ]);
      if (!shapeRes.ok || !shareRes.ok) throw new Error('구 자료를 못 받았습니다');
      const shapes = (await shapeRes.json()) as { features: Array<{ code: string; name: string; geometry: { coordinates: number[][][][] } }> };
      const stats = (await shareRes.json()) as { rows: Array<{ code: string; share: Record<string, number>; stores: Record<string, number>; covered: number }> };
      const byCode = new Map(stats.rows.map((r) => [r.code, r]));
      const list = shapes.features.map((f) => {
        let minLat = Infinity;
        let minLng = Infinity;
        let maxLat = -Infinity;
        let maxLng = -Infinity;
        for (const poly of f.geometry.coordinates) {
          for (const ring of poly) {
            for (const [x, y] of ring) {
              if (y < minLat) minLat = y;
              if (y > maxLat) maxLat = y;
              if (x < minLng) minLng = x;
              if (x > maxLng) maxLng = x;
            }
          }
        }
        const st = byCode.get(f.code);
        return {
          code: f.code,
          name: f.name,
          rings: f.geometry.coordinates,
          minLat,
          minLng,
          maxLat,
          maxLng,
          share: st?.share ?? {},
          stores: st?.stores ?? {},
          covered: st?.covered ?? 0
        };
      });
      areas.set(level + ':' + industry, list);
    }

    /** 광선 교차. 링 안인가. */
    function inRing(ring: number[][], x: number, y: number): boolean {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }

    /** 이 위경도가 어느 구인가. 상자로 먼저 걸러 250개를 몇 개로 줄인다. */
    function districtAt(lat: number, lng: number): District | null {
      const list = areasNow();
      if (list === null) return null;
      for (const d of list) {
        if (lat < d.minLat || lat > d.maxLat || lng < d.minLng || lng > d.maxLng) continue;
        for (const poly of d.rings) {
          if (!inRing(poly[0], lng, lat)) continue;
          let hole = false;
          for (let h = 1; h < poly.length; h++) {
            if (inRing(poly[h], lng, lat)) {
              hole = true;
              break;
            }
          }
          if (!hole) return d;
        }
      }
      return null;
    }

    async function select(industry: Industry): Promise<void> {
      current = industry;
      markTabs();
      noteEl.textContent = t('territory.msg.loading', undefined, '자료를 받는 중...');
      try {
        loaded = await load(industry);
      } catch (e) {
        noteEl.textContent = String(e instanceof Error ? e.message : e);
        return;
      }
      stopJob();
      raster = null;
      hovered = null;
      /* 구 자료는 곁들이다. 못 받아도 지도는 그대로 돈다. */
      sggWanted = true;
      void Promise.all([loadAreas('sido', industry), loadAreas('sgg', industry)])
        .then(() => {
          lastUnit = null;
          syncUnit();
        })
        .catch(() => undefined);
      /* 통계는 칠하기와 무관하게 바로 낼 수 있다(12ms). 범례가 빈 채로 기다리지 않게 먼저 채운다. */
      updateSide();
      startJob(map);
    }

    /* ── 칠하기 ──
       화면 픽셀마다 가장 가까운 가게를 묻는 일은 전국 한 장에 수십만 번이다. 이걸 한 프레임에
       다 하면 그 동안 브라우저가 통째로 멎는다. 끌지도, 누르지도, 스크롤하지도 못한다.
       (2026-08-20: 그렇게 짰다가 너무 느려서 쓸 수가 없다는 말을 들었다.)

       그래서 둘로 나눈다.

       ① **움직이는 동안에는 계산하지 않는다.** 이미 칠해 둔 그림에는 그때의 위경도 두 귀퉁이가
          붙어 있다. 지금 화면에 그 두 점을 다시 찍으면 어디에 얼마 크기로 얹을지가 나온다 . 
          끌면 따라 움직이고 확대하면 같이 커진다. 살짝 뭉개질 뿐 즉시 반응한다.
       ② **멈추면 조금씩 다시 칠한다.** 한 프레임에 6ms 어치 줄만 계산하고 다음 프레임에 이어서
          한다. 위에서 아래로 채워지는 게 보이고, 그 사이에도 지도는 계속 끌린다.

       결과: 무거운 계산이 얼마가 걸리든 **화면은 절대 멎지 않는다.** */
    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    /** 갈아 칠하는 동안 밑그림으로 쓸 직전 그림. */
    const prev = document.createElement('canvas');
    const prevCtx = prev.getContext('2d');

    /** 다 칠해 둔 그림 한 장과, 그것이 덮고 있던 땅의 두 귀퉁이. */
    interface Raster {
      tl: { lat: number; lng: number };
      br: { lat: number; lng: number };
      industry: Industry;
    }
    let raster: Raster | null = null;

    /** 지금 조금씩 칠하고 있는 일감. */
    interface Job {
      img: ImageData;
      cols: number;
      rows: number;
      step: number;
      maxKm: number;
      tl: { lat: number; lng: number };
      br: { lat: number; lng: number };
      /** 화면 좌표 → 위경도를 job 이 만들어질 때의 화면 기준으로 고정해 둔다. */
      at: (x: number, y: number) => { lat: number; lng: number };
      industry: Industry;
    }
    let job: Job | null = null;
    let jobFrame = 0;
    /** 마지막으로 칠하기 시작한 화면. 같은 화면이면 다시 칠하지 않는다. */
    let lastView = '';

    /** 지금 화면을 한 줄로. 중심, 확대율, 크기가 같으면 칠할 이유가 없다. */
    function viewKey(m: GeoMap): string {
      const c = m.getCenter();
      return [current, m.size.width, m.size.height, m.getZoom().toFixed(3), c.lat.toFixed(5), c.lng.toFixed(5)].join('|');
    }


    function startJob(m: GeoMap): void {
      if (loaded === null || offCtx === null) return;
      lastView = viewKey(m);
      const { width, height } = m.size;
      if (width < 2 || height < 2) return;
      /* ★ 화면보다 **넓게** 칠한다. 딱 화면만 칠하면 조금만 끌어도 가장자리가 빈 채로 따라온다
         (사용자: 화면 바깥 나가면 사라지는데 정상인가요?. 정상 아니었다).
         사방으로 20% 씩(가로세로 각 1.4배) 더 물어 두면 어지간히 끌어도 채운 자리가 따라온다. */
      const PAD = 0.2;
      const padX = Math.round(width * PAD);
      const padY = Math.round(height * PAD);
      const owidth = width + padX * 2;
      const oheight = height + padY * 2;
      /* 간격은 화면 크기에 맞춘다. 큰 창일수록 성기게 물어야 전체 시간이 안 늘어난다. */
      let step = 3;
      while ((owidth / step) * (oheight / step) > 130000) step += 1;
      const cols = Math.max(1, Math.ceil(owidth / step));
      const rows = Math.max(1, Math.ceil(oheight / step));
      /* 새로 칠하는 동안 화면이 비지 않게, **있던 그림을 밑그림으로 깔고** 그 위에 덮어쓴다.
         안 그러면 멈출 때마다 영토가 사라졌다가 위에서부터 다시 채워진다(깜빡임).

         ★ 순서가 전부다. `canvas.width` 는 **같은 값을 넣어도 지운다**. 먼저 크기를 맞추면
         베낄 그림이 이미 지워진 뒤다(그렇게 짰다가 밑그림이 늘 빈 채였다). 베끼고, 맞추고, 얹는다. */
      const hadRaster = raster !== null && prevCtx !== null && off.width > 0 && off.height > 0;
      let a = { x: 0, y: 0 };
      let b = { x: 0, y: 0 };
      if (hadRaster && raster !== null) {
        prev.width = off.width;
        prev.height = off.height;
        (prevCtx as CanvasRenderingContext2D).drawImage(off, 0, 0);
        a = m.project(raster.tl.lat, raster.tl.lng);
        b = m.project(raster.br.lat, raster.br.lng);
      }
      off.width = cols;
      off.height = rows;
      if (hadRaster && b.x > a.x && b.y > a.y) {
        offCtx.imageSmoothingEnabled = true;
        offCtx.drawImage(prev, (a.x + padX) / step, (a.y + padY) / step, (b.x - a.x) / step, (b.y - a.y) / step);
      }
      const center = m.getCenter();
      const zoom = m.getZoom();
      job = {
        img: offCtx.getImageData(0, 0, cols, rows),
        cols,
        rows,
        step,
        /* 주인 없음선. **보이는 폭에 맞춘다.**
           칸 간격(step)에 맞췄더니 확대할수록 선이 좁아져(2km) 시골에서는 화면이 통째로 비었다
           (2026-08-20 실측: 강화 교동면에서 색이 하나도 안 남았다. 가게가 2km 밖이라서).
           보고 있는 폭의 60% 까지는 그 땅의 주인이라 부를 만하다. 20km 에서 끊는 것은 그대로 . 
           그 밖 가게를 주인이라 하는 건 어차피 거짓말이고, 이 값이 곧 걸리는 시간이다. */
        maxKm: Math.min(20, Math.max(2, m.kmPerPixel() * m.size.width * 0.6)),
        tl: m.unproject(-padX, -padY),
        br: m.unproject(width + padX, height + padY),
        at: (x, y) => m.unproject(x, y),
        industry: current
      };
      /* 일감이 만들어진 뒤에 지도가 움직여도 좌표가 어긋나지 않게, 그때의 화면을 붙잡아 둔다. */
      const snap = { center, zoom, width, height };
      job.at = (x, y) => unprojectAt(snap, x - padX, y - padY);
      tick();
    }

    /** 붙잡아 둔 화면 기준의 화면좌표 → 위경도 (웹 메르카토르). */
    function unprojectAt(
      snap: { center: { lat: number; lng: number }; zoom: number; width: number; height: number },
      x: number,
      y: number
    ): { lat: number; lng: number } {
      const size = 256 * Math.pow(2, snap.zoom);
      const cxx = ((snap.center.lng + 180) / 360) * size;
      const sn = Math.sin((snap.center.lat * Math.PI) / 180);
      const cyy = (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * size;
      const wx = cxx + x - snap.width / 2;
      const wy = cyy + y - snap.height / 2;
      const lng = (wx / size) * 360 - 180;
      const n = Math.PI * (1 - (2 * wy) / size);
      return { lat: (Math.atan(Math.sinh(n)) * 180) / Math.PI, lng };
    }

    /** 한 번에 다 칠한다. 상한(6만 칸)과 거리 상한(20km) 덕에 전국 화면도 수십 ms 다. */
    function tick(): void {
      if (job === null || loaded === null || offCtx === null) return;
      const j = job;
      const data = j.img.data;
      for (let r = 0; r < j.rows; r++) {
        const y = r * j.step + j.step / 2;
        for (let c = 0; c < j.cols; c++) {
          const ll = j.at(c * j.step + j.step / 2, y);
          const owner = nearest(loaded.grid, ll.lat, ll.lng, j.maxKm);
          if (owner === null) continue;
          const rgb = loaded.rgb.get(owner.brand);
          if (rgb === undefined) continue;
          const o = (r * j.cols + c) * 4;
          data[o] = rgb[0];
          data[o + 1] = rgb[1];
          data[o + 2] = rgb[2];
          data[o + 3] = 150;
        }
      }
      offCtx.putImageData(j.img, 0, 0);
      raster = { tl: j.tl, br: j.br, industry: j.industry };
      job = null;
      map.redraw();
      /* ★ 여기서 범례를 갱신하지 않는다. 갱신 → DOM 바뀜 → 크기 알림 → 다시 칠하기 → 또 갱신 ...
         이 고리가 이 위젯을 세 번 멎게 했다 (2026-08-20). 범례는 **칠하기 전에** 한 번만 낸다. */
    }

    function stopJob(): void {
      if (jobFrame !== 0) cancelAnimationFrame(jobFrame);
      jobFrame = 0;
      job = null;
    }
    Toolbox.onDispose(stopJob);

    map.addPainter((ctx, m) => {
      const { width, height } = m.size;
      if (unitNow() === 'store' && raster !== null && off.width > 0) {
        /* 칠할 때의 두 귀퉁이를 지금 화면에 다시 찍는다. 그게 얹을 자리와 크기다. */
        const a = m.project(raster.tl.lat, raster.tl.lng);
        const b = m.project(raster.br.lat, raster.br.lng);
        const w = b.x - a.x;
        const h = b.y - a.y;
        if (w > 0 && h > 0) {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(off, a.x, a.y, w, h);
        }
      }
      paintDistricts(ctx, m);
      paintDots(ctx, m, width, height);
    });

    /** 구 경계는 **아주 옅게** 깐다. 영토 색이 주인공이고 이건 그 위의 눈금이다.
        짚은 구만 밝은 테두리 + 살짝 밝힘. */
    function paintDistricts(ctx: CanvasRenderingContext2D, m: GeoMap): void {
      const list = areasNow();
      if (list === null || !sggWanted) return;
      const b = m.bounds();
      const trace = (d: District): void => {
        ctx.beginPath();
        for (const poly of d.rings) {
          for (const ring of poly) {
            for (let i = 0; i < ring.length; i++) {
              const p = m.project(ring[i][1], ring[i][0]);
              if (i === 0) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
          }
        }
      };
      /* ── 개표 칠하기 ──
         선거 결과 지도의 문법을 그대로 쓴다: **1등이 구 전체를 가져가고**, 진하기가 격차다.
         압도적인 곳은 진하고 접전인 곳은 옅어서, 색만 봐도 여긴 확실한 CU 땅, 저긴 반반이 읽힌다.
         얼룩(가게 단위) 지도는 사실에 가깝지만 전국을 볼 때는 모래알이라 판세가 안 보인다 . 
         두 그림은 서로 다른 질문에 답한다. */
      if (mode !== 'store' && loaded !== null) {
        for (const d of list) {
          if (d.maxLat < b.minLat || d.minLat > b.maxLat || d.maxLng < b.minLng || d.minLng > b.maxLng) continue;
          const ranked = Object.entries(d.share).sort((x, y) => y[1] - x[1]);
          const win = ranked[0];
          if (win === undefined || win[1] <= 0) continue;
          const margin = (win[1] - (ranked[1]?.[1] ?? 0)) / 100;
          const rgb = loaded.rgb.get(win[0]);
          if (rgb === undefined) continue;
          trace(d);
          /* 진하기 = 격차. 다만 **바탕 지도가 비쳐야** 어디인지 읽힌다. 가까이 볼수록(구 단위)
             지명이 중요해지므로 한 겹 더 옅게 깐다. */
          const base = unitNow() === 'sido' ? 0.2 : 0.15;
          const span = unitNow() === 'sido' ? 0.32 : 0.28;
          ctx.fillStyle =
            'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (base + span * Math.min(1, margin * 2)).toFixed(3) + ')';
          ctx.fill('evenodd');
        }
      }

      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.3)';
      ctx.lineWidth = 1;
      for (const d of list) {
        if (d.maxLat < b.minLat || d.minLat > b.maxLat || d.maxLng < b.minLng || d.minLng > b.maxLng) continue;
        if (d === hovered) continue;
        trace(d);
        ctx.stroke();
      }
      if (hovered !== null) {
        trace(hovered);
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    /* 마우스가 짚은 구를 따라간다. 바뀔 때만 다시 그리고 순위표를 갈아 끼운다. */
    map.canvas.addEventListener('pointermove', (e) => {
      if (areasNow() === null) return;
      const rect = map.canvas.getBoundingClientRect();
      const ll = map.unproject(e.clientX - rect.left, e.clientY - rect.top);
      const found = districtAt(ll.lat, ll.lng);
      if (found === hovered) return;
      hovered = found;
      map.redraw();
      updateSide();
    });
    map.canvas.addEventListener('pointerleave', () => {
      if (hovered === null) return;
      hovered = null;
      map.redraw();
      updateSide();
    });

    function paintDots(ctx: CanvasRenderingContext2D, m: GeoMap, width: number, height: number): void {
      if (loaded === null || !dotsOn) return;
      for (const s of loaded.grid.stores) {
        const p = m.project(s.lat, s.lng);
        if (p.x < -4 || p.y < -4 || p.x > width + 4 || p.y > height + 4) continue;
        ctx.fillStyle = loaded.color.get(s.brand) ?? '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.5)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }


    /* 움직이는 동안 성기게 → 멈추면 촘촘하게. */
    /* 움직이는 동안에는 칠하지 않는다. 있던 그림을 늘려 얹어 즉시 따라오게만 한다.
       손을 떼고 180ms 가 지나면 그때부터 조금씩 다시 칠한다. */
    map.onView(() => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        /* ★ 화면이 실제로 달라졌을 때만 다시 칠한다.
           범례를 갱신하면 레이아웃이 흔들리고, 그게 크기 알림으로 돌아와 다시 칠하기를 부르고,
           그 끝에서 또 범례를 갱신한다. 칠하기가 첫 줄에서 영영 못 벗어난다 (2026-08-20 실측:
           위쪽 몇 줄만 칠해진 채 멈춰 있었다). 같은 화면이면 아무것도 하지 않는 것이 답이다. */
        /* 확대율이 단위 문턱을 넘었으면 말하는 단위부터 갈아 끼운다. */
        const u = unitNow();
        if (u !== lastUnit) {
          syncUnit();
          return;
        }
        if (u !== 'store') {
          updateSide();
          return;
        }
        if (viewKey(map) === lastView) return;
        stopJob();
        updateSide();
        startJob(map);
      }, 180);
    });

    /* ── 범례와 통계 ── */
    function updateSide(): void {
      if (loaded === null) return;

      /* 구를 짚고 있으면 **그 구의 미리 잰 값**을 보여 준다. 화면 기준 수와 달리 어제와 오늘이 같다.
         짚지 않았으면 지금 보이는 만큼을 즉석에서 센다. */
      const d = hovered;
      let title = d !== null ? d.name : t('territory.msg.owner', undefined, '지금 보이는 땅의 주인');
      let pctOf: (id: string) => number;
      let countOf: (id: string) => number;
      if (d !== null) {
        pctOf = (id) => d.share[id] ?? 0;
        countOf = (id) => d.stores[id] ?? 0;
      } else if (unitNow() !== 'store' && areasNow() !== null) {
        const list = areasNow() as District[];
        /* 개표 모드의 순위표는 몇 개 구에서 1등을 했나다. 선거에서 의석 수를 세는 것과 같다.
           땅 넓이 %(가게 단위)와는 다른 수라, 같은 자리에 다른 뜻을 넣지 않게 제목도 바꾼다. */
        const won = new Map<string, number>();
        let seen = 0;
        for (const x of list) {
          const ranked = Object.entries(x.share).sort((p1, p2) => p2[1] - p1[1]);
          if (ranked.length === 0 || ranked[0][1] <= 0) continue;
          seen++;
          won.set(ranked[0][0], (won.get(ranked[0][0]) ?? 0) + 1);
        }
        title =
          (unitNow() === 'sido'
            ? t('territory.msg.wonSido', undefined, '시도 몇 곳에서 1등인가')
            : t('territory.msg.wonTitle', undefined, '구 몇 곳에서 1등인가')) +
          ' (' + seen + ')';
        pctOf = (id) => ((won.get(id) ?? 0) / (seen || 1)) * 100;
        countOf = (id) => won.get(id) ?? 0;
      } else {
        const rows = share(loaded.grid, map.bounds(), 90, Math.min(20, Math.max(2, map.kmPerPixel() * 40)));
        const byBrand = new Map(rows.map((r) => [r.brand, r]));
        pctOf = (id) => (byBrand.get(id)?.ratio ?? 0) * 100;
        countOf = (id) => byBrand.get(id)?.stores ?? 0;
      }

      /* 순위표. 색, 이름, 점포 수, **땅 넓이 막대**, %. 주인공은 면적이다.
         0% 인 브랜드는 여기 땅이 없다는 뜻이라 흐리게 남겨 둔다(사라지면 순위가 요동친다). */
      const brands = [...loaded.meta.brands].sort((a, b) => pctOf(b.id) - pctOf(a.id));
      const top = pctOf(brands[0]?.id ?? '') || 0;

      /* 아무도 땅이 없으면 전부 0.0%를 늘어놓지 않는다. 그건 순위표가 아니라 소음이고,
         읽는 사람은 고장났나로 읽는다. 바다, 산으로 나가면 실제로 이렇게 된다. */
      if (top <= 0) {
        legendEl.innerHTML =
          '<div class="terr-name">' + esc(title) + '</div>' +
          '<div class="terr-row" style="grid-template-columns:1fr;opacity:.7">' +
          esc(t('territory.msg.empty', undefined, '이 화면엔 가게가 없다')) +
          '</div>';
        noteEl.innerHTML =
          '<div>' + esc(t('territory.msg.emptyHint', undefined, '가게가 있는 곳으로 끌거나 축소해 보라.')) + '</div>';
        return;
      }

      legendEl.innerHTML =
        '<div class="terr-name">' + esc(title) + '</div>' +
        brands
          .map((brand) => {
            const pct = pctOf(brand.id);
            const n = countOf(brand.id);
            return (
              '<div class="terr-row" style="opacity:' + (pct > 0 ? 1 : 0.42) + '">' +
              '<i class="terr-sw" style="background:' + esc(brand.color) + '"></i>' +
              '<span>' +
              '<span class="terr-name">' + esc(brand.label) + ' <span style="opacity:.55">' + n.toLocaleString('ko-KR') + '</span></span>' +
              '<span class="terr-bararea"><i class="terr-fill" style="width:' + ((pct / (top || 1)) * 100).toFixed(1) + '%;background:' + esc(brand.color) + '"></i></span>' +
              '</span>' +
              '<span class="terr-pct">' + pct.toFixed(1) + '%</span>' +
              '</div>'
            );
          })
          .join('');

      const total = Object.values(loaded.meta.counts).reduce((a, c) => a + c, 0);
      noteEl.innerHTML =
        '<div>' +
        (d !== null
          ? esc(t('territory.msg.districtHint', undefined, '구 하나를 짚고 있다. 미리 재 둔 값이다. 지도를 벗어나면 화면 기준으로 돌아간다.'))
          : unitNow() !== 'store'
            ? esc(t('territory.msg.electionHint', undefined, '구마다 1등이 통째로 가져간다. 진할수록 격차가 크고, 옅으면 접전이다.'))
            : esc(t('territory.msg.hint', undefined, '색은 그 자리에서 가장 가까운 가게의 브랜드다. 끌어서 옮기고 굴려서 확대한다.'))) +
        '</div>' +
        '<div style="opacity:.62;font-size:11px;margin-top:2px">' +
        esc(loaded.meta.source) + ', ' + total.toLocaleString('ko-KR') + esc(t('territory.msg.stores', undefined, '곳')) +
        ', ' + esc(t('territory.msg.boundary', undefined, '경계: 통계청 시군구(2018)')) +
        (loaded.meta.sample
          ? ', <span class="terr-warn">' +
            esc(t('territory.msg.sample', undefined, '표본 주의. OSM 에 등록된 가게만이라 실제의 3분의 1 수준이다. 동네 단위로는 빠진 가게가 있다.')) +
            '</span>'
          : '') +
        '</div>';
    }

    markTabs();
    void select('convenience');
  }
})();
