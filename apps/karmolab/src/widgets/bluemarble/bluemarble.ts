/**
 * 블루마블 — 살아있는 지구본 (TASK-KL-206)
 *
 * 사용자: "그냥 말 그대로 블루마블이 이 공허한 우주속에서 살아있음을 느끼는거야.
 * 나처럼 자취방에서 고독을 느낄때, 지구는 살아있음을 느끼는거지."
 *
 * 그래서 이건 **계기판이 아니라 창문**이다. 숫자를 늘어놓지 않는다. 지구가 돌고, 낮과 밤의
 * 경계가 기어가고, 밤이 된 쪽에 도시가 켜지고, 방금 어딘가가 흔들리면 그 자리에 파문이 인다.
 * 아래 한 줄이 그걸 문장으로 말해 준다 — 「규모 4.1」이 아니라 「방금 티모르 앞바다가 흔들렸다」.
 *
 * 그리는 법: **정사영(orthographic) 지구본을 손으로 그린다.** three.js/globe.gl 을 안 쓴다.
 * 표면은 폴리곤이 아니라 **픽셀 단위 구면 샘플링**이다 (`surface.ts` 머리말에 이유가 있다 —
 * 폴리곤 시절엔 돌리다 보면 땅이 화면을 통째로 덮었고, 땅이 초록 한 색이었고, 구름을 얹을
 * 자리가 없었다). 표면 그림은 `data/earth/` 에 담아 두고, **구름만 오늘 것을 받아 온다**.
 *
 * 안 보이면 멈춘다 — 켜 두는 물건이라 더 중요하다(탭이 가려지면 rAF·받아오기 둘 다 정지).
 */
import { t, loadNamespace, fmtRelative } from '../../lib/i18n';
import { CITIES } from './cities';
import { subsolar, subsolarBody, toVec, distanceKm } from './sky';
import { quakes, quakesOn, aurora, kpIndex, iss, launches, issOmm, catalog, solarWind, windEta, apod, type Apod, type Quake, type AuroraPoint, type IssFix, type Launch } from './sources';
import { paintSurface, type Tex, type Region, type View as SurfaceView } from './surface';
import { loadTex, loadClouds, loadCloudsOn } from './textures';
import { loadRegion, levelFor, fitLevel, regionKey, type BBox } from './tiles';
import { elementsFrom, propagate, propagateAll, nextPass, EARTH_RADIUS_KM, type Elements, type Pass } from './orbit';
import { fromTimezone, askPrecise, type Me } from './me';
import { EarthSound } from './sound';

(function (): void {
  if (typeof Toolbox === 'undefined') return;

  const NS = 'bluemarble';
  const RAD = Math.PI / 180;

  /** 데이터 파일 주소 — Tauri 에서도 같은 출처로 풀리게 위젯 스크립트 자리에서 되짚는다. */
  function dataUrl(name: string): string {
    const w = window as unknown as { KARMOLAB_WIDGET_SCRIPT_BASE?: string };
    // 스크립트 자리 = `…/apps/karmolab/js/widgets/` → 두 칸 올라가야 `…/apps/karmolab/data/` 다
    if (w.KARMOLAB_WIDGET_SCRIPT_BASE) return new URL('../../data/' + name, w.KARMOLAB_WIDGET_SCRIPT_BASE).href;
    return (typeof location !== 'undefined' ? location.origin : '') + '/apps/karmolab/data/' + name;
  }

  type LayerId = 'quake' | 'aurora' | 'iss' | 'city' | 'launch' | 'cloud' | 'zoom' | 'me' | 'sats' | 'sound' | 'sun' | 'clock' | 'apod' | 'tour' | 'dusk';
  /** `earthOnly` = 지구에서만 뜻이 있는 겹. 달·화성에선 단추 자체를 감춘다 —
      눌러도 아무 일이 없는 단추가 남아 있으면 그건 고장으로 보인다. */
  const LAYERS: Array<{ id: LayerId; glyph: string; earthOnly?: boolean }> = [
    { id: 'me', earthOnly: true, glyph: '◉' },
    { id: 'sats', earthOnly: true, glyph: '⁘' },
    { id: 'sound', glyph: '♪' },
    { id: 'sun', glyph: '☀' },
    { id: 'clock', earthOnly: true, glyph: '◷' },
    { id: 'apod', glyph: '✧' },
    { id: 'tour', earthOnly: true, glyph: '▶' },
    { id: 'dusk', earthOnly: true, glyph: '◐' },
    { id: 'zoom', earthOnly: true, glyph: '⊕' },
    { id: 'cloud', earthOnly: true, glyph: '☁' },
    { id: 'city', earthOnly: true, glyph: '✦' },
    { id: 'quake', earthOnly: true, glyph: '◎' },
    { id: 'aurora', earthOnly: true, glyph: '≈' },
    { id: 'iss', earthOnly: true, glyph: '✧' },
    { id: 'launch', earthOnly: true, glyph: '▲' }
  ];
  const STORE_KEY = 'karmolab_bluemarble_v1';

  interface Prefs {
    on: Record<LayerId, boolean>;
    spin: boolean;
    /** 조작부를 펼쳐 둔 채로 쓰는 사람도 있다 — 그 선택을 기억한다. */
    panel: boolean;
  }
  function loadPrefs(): Prefs {
    const base: Prefs = { on: { quake: true, aurora: true, iss: true, city: true, launch: true, cloud: true, zoom: true, me: true, sats: false, sound: false, sun: true, clock: true, apod: true, tour: false, dusk: false }, spin: true, panel: false };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const p = JSON.parse(raw) as Partial<Prefs>;
      return { on: { ...base.on, ...(p.on || {}) }, spin: p.spin !== false, panel: p.panel === true };
    } catch (_) {
      return base;
    }
  }

  function injectStyles(): void {
    if (document.getElementById('bm-style')) return;
    const el = document.createElement('style');
    el.id = 'bm-style';
    /* 지구본 안쪽은 우주다 — 여기만은 테마 색을 안 따른다(밝은 테마에서 흰 우주는 우주가 아니다).
       바깥 껍데기·단추는 전부 공용 토큰을 쓴다. */
    el.textContent = `
/* 높이를 **부모에게 안 묻는다**. 폰에서 부모가 높이를 안 정해 주면 height 100% 가
   내용 높이로 풀려, 캔버스가 87,000px 짜리로 자랐다(실측 — 프레임 1166ms). 화면 기준으로
   스스로 정한다: 작은 화면에서도 420px 는 되고, 커도 900px 를 안 넘는다. */
.bm-wrap{position:relative;width:100%;height:clamp(420px,78svh,900px);max-height:900px;
  display:flex;flex-direction:column;
  border-radius:var(--radius-md,12px);overflow:hidden;background:#04060d;}
.bm-canvas{flex:1;display:block;width:100%;height:100%;touch-action:none;cursor:grab;}
.bm-canvas.bm-drag{cursor:grabbing;}
/* 첫 화면은 **조용해야 한다** — 지구와 한 줄. 조작부는 「⋯」 뒤에 접어 둔다.
   (칩이 12개가 되자 화면이 창문이 아니라 계기판이 됐다.) */
.bm-menu{position:absolute;top:10px;left:10px;z-index:4;appearance:none;border:1px solid rgba(255,255,255,.16);
  background:rgba(8,12,22,.55);color:rgba(255,255,255,.6);font-size:13px;line-height:1;padding:7px 11px;
  border-radius:999px;cursor:pointer;backdrop-filter:blur(6px);}
.bm-menu[aria-expanded="true"]{color:#eaf2ff;border-color:rgba(150,190,255,.5);}
.bm-chips{position:absolute;top:46px;left:10px;right:104px;display:flex;flex-wrap:wrap;gap:6px;z-index:2;
  opacity:0;pointer-events:none;transform:translateY(-4px);transition:opacity .28s ease,transform .28s ease;}
.bm-wrap.bm-panel .bm-chips{opacity:1;pointer-events:auto;transform:none;}
.bm-wrap.bm-ambient .bm-menu{opacity:0;pointer-events:none;transition:opacity 1.2s ease;}
.bm-chip{appearance:none;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,22,.55);
  color:rgba(255,255,255,.55);font-size:11px;line-height:1;padding:6px 9px;border-radius:999px;
  cursor:pointer;backdrop-filter:blur(6px);font-family:var(--font-mono,ui-monospace,monospace);}
.bm-chip[aria-pressed="true"]{color:#eaf2ff;border-color:rgba(150,190,255,.5);background:rgba(30,52,96,.55);}
.bm-chip:hover{border-color:rgba(255,255,255,.4);}
.bm-ticker{position:absolute;left:0;right:0;bottom:0;padding:14px 16px 16px;z-index:2;pointer-events:none;
  background:linear-gradient(to top,rgba(2,4,10,.85),rgba(2,4,10,0));}
.bm-line{display:block;color:#dbe6ff;font-size:14px;line-height:1.5;letter-spacing:-.01em;
  opacity:0;transition:opacity .8s ease;text-shadow:0 1px 12px rgba(0,0,0,.9);}
.bm-line.bm-show{opacity:1;}
/* 상시 모드 — 켜 두는 물건이 되면 조작부는 사라져야 한다. 지구와 한 줄만 남는다.
   사라지는 것은 **투명도**지 존재가 아니다(포커스·탭 이동이 끊기지 않게). */
.bm-wrap.bm-ambient .bm-chips,.bm-wrap.bm-ambient .bm-time{opacity:0;pointer-events:none;
  transition:opacity 1.2s ease;}
.bm-wrap.bm-ambient .bm-sub{opacity:0;transition:opacity 1.2s ease;}
.bm-wrap.bm-ambient{border-radius:0;}
/* 해 — 지구를 보는 창 옆에 붙은 **두 번째 창**. SDO 가 30초마다 새로 찍는 실사다.
   픽셀을 읽지 않으므로 교차 출처 허가가 필요 없다(그냥 그림으로 붙인다). */
.bm-sun{position:absolute;right:14px;bottom:96px;width:96px;height:96px;border-radius:50%;z-index:3;
  object-fit:cover;box-shadow:0 0 38px rgba(255,170,60,.42),0 0 0 1px rgba(255,200,120,.28) inset;
  opacity:.94;transition:opacity .6s ease;}
.bm-sun[hidden]{display:none;}
.bm-wrap.bm-ambient .bm-sun{opacity:.8;}
@media (max-width:520px){.bm-sun{width:64px;height:64px;bottom:88px}}
.bm-body{position:absolute;top:10px;right:52px;z-index:4;}
.bm-wrap.bm-ambient .bm-body{opacity:0;pointer-events:none;transition:opacity 1.2s ease;}
/* 오늘의 우주 사진 — 지구 창 곁에 붙은 작은 액자. 누르면 원본으로 간다. */
.bm-apod{position:absolute;left:14px;bottom:96px;width:132px;border-radius:10px;z-index:3;cursor:pointer;
  border:1px solid rgba(255,255,255,.18);box-shadow:0 6px 22px rgba(0,0,0,.55);opacity:.92;
  transition:opacity .5s ease,transform .5s ease;}
.bm-apod:hover{opacity:1;transform:translateY(-2px);}
.bm-apod[hidden]{display:none;}
@media (max-width:520px){.bm-apod{width:92px;bottom:88px}}
.bm-fs{position:absolute;top:10px;right:10px;z-index:4;appearance:none;border:1px solid rgba(255,255,255,.16);
  background:rgba(8,12,22,.55);color:rgba(255,255,255,.6);font-size:13px;line-height:1;padding:7px 9px;
  border-radius:999px;cursor:pointer;backdrop-filter:blur(6px);}
.bm-wrap.bm-ambient .bm-fs{opacity:0;pointer-events:none;transition:opacity 1.2s ease;}
.bm-time{position:absolute;left:0;right:0;bottom:58px;z-index:3;display:flex;align-items:center;gap:10px;
  padding:0 16px;opacity:0;pointer-events:none;transition:opacity .28s ease;}
.bm-wrap.bm-panel .bm-time{opacity:1;pointer-events:auto;}
.bm-time input[type=range]{flex:1;accent-color:#8fb8ff;height:2px;cursor:pointer;}
.bm-date{color:#cfe0ff;font-size:12px;font-family:var(--font-mono,ui-monospace,monospace);min-width:92px;
  text-align:right;text-shadow:0 1px 8px rgba(0,0,0,.9);}
.bm-now{appearance:none;border:1px solid rgba(255,255,255,.2);background:rgba(8,12,22,.6);color:#eaf2ff;
  font-size:11px;padding:5px 9px;border-radius:999px;cursor:pointer;font-family:var(--font-mono,ui-monospace,monospace);}
.bm-now[hidden]{display:none;}
.bm-sub{display:block;margin-top:3px;color:rgba(190,205,235,.45);font-size:11px;
  font-family:var(--font-mono,ui-monospace,monospace);}
@media (max-width:520px){.bm-line{font-size:13px}.bm-chip{font-size:10px;padding:5px 8px}}
@media (prefers-reduced-motion:reduce){.bm-line{transition:none}}
`;
    document.head.appendChild(el);
  }

  /* 이름과 설명은 여기 안 적는다 — `widgets-lazy-meta.ts` 가 정본이고 거기서 말 묶음으로
     뽑혀 나간다. 여기 한 벌 더 적으면 그날부터 두 벌이 갈라진다. 그래서 아래 기본값은
     **정본을 못 읽었을 때만** 쓰이도록 폈다(`...meta` 를 뒤에 둔다). */
  Toolbox.register({
    id: 'bluemarble',
    title: 'Blue Marble',
    category: 'lab',
    layout: 'full',
    icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3.5 10h17M4.2 15h15.6" stroke="currentColor" stroke-width="1.1" opacity=".5" fill="none"/><path d="M12 3c3 3.6 3 13.4 0 18M12 3C9 6.6 9 16.4 12 21" stroke="currentColor" stroke-width="1.1" opacity=".5" fill="none"/>',
    ...(Toolbox.getLazyWidgetPublicMeta ? Toolbox.getLazyWidgetPublicMeta('bluemarble') : {}),
    tabs: [
      {
        id: 'globe',
        label: 'Blue Marble',
        build: function (container: HTMLElement): void {
          injectStyles();
          const prefs = loadPrefs();

          const wrap = document.createElement('div');
          wrap.className = 'bm-wrap';
          const canvas = document.createElement('canvas');
          canvas.className = 'bm-canvas';
          const menuBtn = document.createElement('button');
          menuBtn.type = 'button';
          menuBtn.className = 'bm-menu';
          menuBtn.textContent = '⋯';

          const chips = document.createElement('div');
          chips.className = 'bm-chips';
          const ticker = document.createElement('div');
          ticker.className = 'bm-ticker';
          const line = document.createElement('span');
          line.className = 'bm-line';
          const sub = document.createElement('span');
          sub.className = 'bm-sub';
          ticker.append(line, sub);

          /* 시간 손잡이 — 지구를 과거로 되감는다. 오른쪽 끝이 오늘이다. */
          const timeBar = document.createElement('div');
          timeBar.className = 'bm-time';
          const slider = document.createElement('input');
          slider.type = 'range';
          const dateLabel = document.createElement('span');
          dateLabel.className = 'bm-date';
          const nowBtn = document.createElement('button');
          nowBtn.type = 'button';
          nowBtn.className = 'bm-now';
          nowBtn.hidden = true;
          timeBar.append(slider, dateLabel, nowBtn);
          const apodImg = document.createElement('img');
          apodImg.className = 'bm-apod';
          apodImg.alt = '';
          apodImg.decoding = 'async';
          apodImg.hidden = true;

          const bodyBtn = document.createElement('button');
          bodyBtn.type = 'button';
          bodyBtn.className = 'bm-chip bm-body';

          const sunImg = document.createElement('img');
          sunImg.className = 'bm-sun';
          sunImg.alt = '';
          sunImg.decoding = 'async';
          sunImg.hidden = true;

          const fsBtn = document.createElement('button');
          fsBtn.type = 'button';
          fsBtn.className = 'bm-fs';
          fsBtn.textContent = '⛶';
          wrap.append(canvas, menuBtn, chips, bodyBtn, sunImg, apodImg, fsBtn, timeBar, ticker);
          container.appendChild(wrap);

          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          /* ── 상태 ─────────────────────────────────────────────────────── */
          let camLon = 126; // 처음 보이는 곳 = 우리가 있는 자리
          let camLat = 20;
          let zoom = 1;
          let spin = prefs.spin;
          let W = 0;
          let H = 0;
          let dpr = 1;
          let small = false;
          let stars: HTMLCanvasElement | null = null;
          let dayTex: Tex | null = null;
          let nightTex: Tex | null = null;
          let cloudTex: { w: number; h: number; a: Uint8ClampedArray } | null = null;
          let region: Region | null = null;
          let regionAt = '';        // 지금 들고 있는 조각의 이름표
          let regionWanted = '';    // 받아 오는 중인 조각
          let regionTimer: number | undefined;
          let regionNight = false;
          let qs: Quake[] = [];
          let au: AuroraPoint[] = [];
          let kp: number | null = null;
          let issFix: IssFix | null = null;
          let issTrail: Array<[number, number]> = [];
          let ls: Launch[] = [];
          let me: Me | null = null;
          let issEl: Elements | null = null;
          let issPass: Pass | null = null;
          let seenQuakes: Set<string> | null = null; // null = 첫 판(전부 「새 것」이 아니다)
          /* 되감은 시각. null = 지금. 이 값 하나가 해·구름·지진·실사 타일을 전부 그날로 옮긴다. */
          let atTime: number | null = null;
          let liveCloud: { w: number; h: number; a: Uint8ClampedArray } | null = null;
          let liveQuakes: Quake[] = [];
          let pastDay = '';
          /* 궤도 위의 것 전부 — 요소 목록과, 그것을 굴려 담아 두는 한 덩어리 배열 */
          let satEls: Elements[] = [];
          let satXyz: Float32Array | null = null;
          let satAt = 0;
          let satLoading = false;
          let wind: { speed: number; at: number } | null = null;
          let pic: Apod | null = null;

          /* 지구 뉴스 상영 — 오늘 지구에 일어난 일을 카메라가 차례로 찾아가 읽어 준다.
             지구본은 「보는 것」이었는데, 이걸 켜면 「들려주는 것」이 된다. */
          interface TourStop {
            lat: number;
            lon: number;
            zoom: number;
            line: string;
          }
          let tour: TourStop[] = [];
          let tourIdx = -1;
          let tourAt = 0;
          /* 노을 따라가기 — 카메라를 낮과 밤의 경계 위에 두고 남북으로 훑는다.
             경계선은 실시간으로는 시간당 15° 씩만 움직여 거의 멎어 보인다. 그래서 지구를
             빨리 돌리는 대신(그건 거짓말이 된다) **우리가 그 선을 따라 오르내린다**. */
          let duskAt = 0;
          let duskSaid = 0;
          /* 어느 곳을 보고 있나. 그리기 장치는 그대로고 **그림만 갈아 끼운다**. */
          type Body = 'earth' | 'moon' | 'mars';
          let body: Body = 'earth';
          const bodyTex: Record<Body, Tex | null> = { earth: null, moon: null, mars: null };
          const sound = new EarthSound();
          let raf: number | undefined;
          let alive = true;

          /* 표면 판 — 화면 해상도로 안 그린다. 작은 판에 그린 뒤 늘여 덮는다
             (한 점마다 asin·atan2 가 드니, 계산량을 화면 크기에서 떼어 놓는다).
             판이 덮는 화면 영역 = **지구가 화면보다 작으면 지구, 크면 화면**. 확대해 들어가면
             지구 대부분이 화면 밖이므로, 원판 기준으로 잡으면 안 보이는 곳을 계산하게 된다. */
          let surfW = 0;
          let surfH = 0;
          const surfCv = document.createElement('canvas');
          const surfCtx = surfCv.getContext('2d', { willReadFrequently: true })!;
          let surfImg: ImageData | null = null;
          let surfView: SurfaceView | null = null;
          let surfAt = 0;
          /** 크기·그림이 바뀌면 다음 프레임에 반드시 다시 계산한다 */
          let surfDirty = true;

          function ensureSurface(): void {
            const x0 = Math.max(0, cx - R);
            const y0 = Math.max(0, cy - R);
            const x1 = Math.min(W, cx + R);
            const y1 = Math.min(H, cy + R);
            const rectW = Math.max(1, x1 - x0);
            const rectH = Math.max(1, y1 - y0);
            // 긴 변이 384칸을 넘지 않게 — 여기서 프레임 시간이 정해진다
            // 폰은 더 작은 판에 그린다 — 여기서 프레임 시간이 정해진다
            const step = Math.max(1, Math.max(rectW, rectH) / (small ? 256 : 384));
            const w = Math.max(1, Math.round(rectW / step));
            const h = Math.max(1, Math.round(rectH / step));
            if (w !== surfW || h !== surfH) {
              surfDirty = true;
              surfW = w;
              surfH = h;
              surfCv.width = w;
              surfCv.height = h;
              surfImg = surfCtx.createImageData(w, h);
            }
            surfView = { cx, cy, R, x0, y0, step, w, h };
          }

          /* ── 화면 크기 ────────────────────────────────────────────────── */
          function resize(): void {
            const r = wrap.getBoundingClientRect();
            /* 폰에서는 아낀다. 화면이 작고 화소 밀도가 높으면 같은 그림에 픽셀이 세 배 든다 —
               지구는 부드러운 물체라 촘촘하게 그려도 티가 안 나고, 팬만 돈다. */
            small = r.width < 620 || (window.devicePixelRatio || 1) > 2;
            dpr = Math.min(small ? 1.6 : 2, window.devicePixelRatio || 1);
            W = Math.max(1, Math.round(r.width));
            H = Math.max(1, Math.round(r.height));
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
            stars = makeStars(W, H);
          }

          /** 별은 매 프레임 다시 찍지 않는다 — 한 번 찍어 두고 통째로 깐다. */
          function makeStars(w: number, h: number): HTMLCanvasElement {
            const cv = document.createElement('canvas');
            cv.width = Math.round(w * dpr);
            cv.height = Math.round(h * dpr);
            const c = cv.getContext('2d')!;
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            c.fillStyle = '#04060d';
            c.fillRect(0, 0, w, h);
            const n = Math.round((w * h) / 2600);
            for (let i = 0; i < n; i++) {
              const x = Math.random() * w;
              const y = Math.random() * h;
              const r = Math.random() < 0.92 ? Math.random() * 0.8 + 0.25 : Math.random() * 1.3 + 0.9;
              const a = 0.18 + Math.random() * 0.6;
              c.globalAlpha = a;
              c.fillStyle = Math.random() < 0.12 ? '#bcd4ff' : '#ffffff';
              c.beginPath();
              c.arc(x, y, r, 0, Math.PI * 2);
              c.fill();
            }
            c.globalAlpha = 1;
            return cv;
          }

          /* ── 투영 ─────────────────────────────────────────────────────── */
          // 카메라 축 (지구 중심 좌표계). 매 프레임 한 번만 만든다.
          let ex: [number, number, number] = [0, 0, 0];
          let ey: [number, number, number] = [0, 0, 0];
          let ez: [number, number, number] = [0, 0, 0];
          let cx = 0;
          let cy = 0;
          let R = 1;

          function setCamera(): void {
            const la = camLat * RAD;
            const lo = camLon * RAD;
            ex = [-Math.sin(lo), Math.cos(lo), 0];
            ey = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
            ez = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
            cx = W / 2;
            cy = H / 2;
            R = (Math.min(W, H) / 2 - 24) * zoom;
          }

          /** 지금 이 지구본이 보고 있는 시각. 되감았으면 그때, 아니면 지금. */
          const clockMs = (): number => atTime ?? Date.now();
          const dayString = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
          const isPast = (): boolean => atTime !== null;

          const dot = (a: [number, number, number], b: [number, number, number]): number =>
            a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

          /** 위경도 → 화면. `z` 가 음수면 지구 반대편(안 보임). */
          function project(lat: number, lon: number): { x: number; y: number; z: number } {
            const v = toVec(lat, lon);
            return { x: cx + R * dot(v, ex), y: cy - R * dot(v, ey), z: dot(v, ez) };
          }

          /* ── 반응하는 카메라 ──────────────────────────────────────────── */

          /* 사건이 들어오면 지구가 **천천히 그쪽으로 돈다**. 순간이동시키면 사람이 방향을
             잃는다 — 어디서 어디로 갔는지가 안 보이면 그건 새 화면이지 같은 지구가 아니다.
             그래서 각도로 보간하고(짧은 쪽으로), 다 돌면 다시 제 속도로 자전한다. */
          let fly: {
            lon: number;
            lat: number;
            from: number;
            ms: number;
            startLon: number;
            startLat: number;
            zoom: number;
            startZoom: number;
          } | null = null;

          function flyTo(lat: number, lon: number, ms = 2600, toZoom?: number): void {
            let d = lon - camLon;
            while (d > 180) d -= 360;
            while (d < -180) d += 360;
            fly = {
              lon: camLon + d,
              lat: Math.max(-70, Math.min(70, lat)),
              from: performance.now(),
              ms,
              startLon: camLon,
              startLat: camLat,
              zoom: toZoom ?? zoom,
              startZoom: zoom
            };
            idleAt = performance.now() + ms; // 도착할 때까진 자전이 끼어들지 않는다
          }

          function stepFly(now: number): void {
            if (!fly) return;
            const p = Math.min(1, (now - fly.from) / fly.ms);
            const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // ease-in-out
            camLon = fly.startLon + (fly.lon - fly.startLon) * e;
            camLat = fly.startLat + (fly.lat - fly.startLat) * e;
            // 멀어졌다 가까워지는 것까지 같이 보간해야 「찾아간다」로 보인다
            zoom = fly.startZoom + (fly.zoom - fly.startZoom) * e;
            if (p >= 1) {
              fly = null;
              scheduleRegion();
            }
          }

          /* ── 확대하면 실사로 갈아타기 ─────────────────────────────────── */

          /** 화면의 한 점이 지구 위 어디인가. 원 밖이면 null. */
          function unproject(sx: number, sy: number): { lat: number; lon: number } | null {
            const nx = (sx - cx) / R;
            const ny = (cy - sy) / R;
            const r2 = nx * nx + ny * ny;
            if (r2 >= 1) return null;
            const nz = Math.sqrt(1 - r2);
            const px = nx * ex[0] + ny * ey[0] + nz * ez[0];
            const py = nx * ex[1] + ny * ey[1] + nz * ez[1];
            const pz = nx * ex[2] + ny * ey[2] + nz * ez[2];
            return { lat: Math.asin(Math.max(-1, Math.min(1, pz))) / RAD, lon: Math.atan2(py, px) / RAD };
          }

          /**
           * 지금 보이는 자리를 경위도 상자로. 화면을 격자로 훑어 실제로 지구에 닿는 점만 모은다
           * (원 밖·뒤쪽은 애초에 안 나온다). 경도는 **가운데를 기준으로 이어 붙인다** —
           * 안 그러면 날짜변경선을 걸칠 때 상자가 지구 한 바퀴로 부풀어 타일 수천 장이 된다.
           */
          function visibleBox(): BBox | null {
            const mid = unproject(Math.min(Math.max(cx, 0), W) , Math.min(Math.max(cy, 0), H)) || unproject(cx, cy);
            if (!mid) return null;
            let west = Infinity;
            let east = -Infinity;
            let south = Infinity;
            let north = -Infinity;
            const N = 7;
            for (let j = 0; j <= N; j++) {
              for (let i = 0; i <= N; i++) {
                const p = unproject((i / N) * W, (j / N) * H);
                if (!p) continue;
                let d = p.lon - mid.lon;
                while (d > 180) d -= 360;
                while (d < -180) d += 360;
                const lon = mid.lon + d;
                if (lon < west) west = lon;
                if (lon > east) east = lon;
                if (p.lat < south) south = p.lat;
                if (p.lat > north) north = p.lat;
              }
            }
            if (!Number.isFinite(west)) return null;
            const padX = (east - west) * 0.08 + 0.02;
            const padY = (north - south) * 0.08 + 0.02;
            return { west: west - padX, east: east + padX, south: south - padY, north: north + padY };
          }

          /** 화면 한 픽셀이 몇 도인가 — 이 값이 몇 층짜리 타일을 받을지 정한다. */
          const degPerScreenPx = (): number => 57.29578 / R;

          function scheduleRegion(): void {
            if (regionTimer !== undefined) window.clearTimeout(regionTimer);
            // 손을 놀리는 동안엔 안 받는다 — 끌 때마다 받으면 회선이 타일로 가득 찬다
            regionTimer = window.setTimeout(() => {
              regionTimer = undefined;
              if (!alive || !prefs.on.zoom || body !== 'earth') return;
              // 담아 둔 그림(2048px = 0.176°/px)보다 화면이 촘촘할 때부터 의미가 있다
              if (degPerScreenPx() > 0.16) {
                if (region) {
                  region = null;
                  regionAt = '';
                }
                return;
              }
              const box = visibleBox();
              if (!box) return;

              /* 이 자리가 밤이면 참색 사진은 새까맣다 — 밤의 눈(주야간 밴드)으로 바꿔 받는다. */
              const sun = subsolar(new Date(clockMs()));
              const midLat = (box.north + box.south) / 2;
              const midLon = (box.east + box.west) / 2;
              const night = dot(toVec(midLat, midLon), toVec(sun.lat, sun.lon)) < -0.02;

              const dayKey = isPast() ? pastDay : '';
              const wantZ = fitLevel(box, levelFor(degPerScreenPx()), night);
              const key = regionKey(box, wantZ, dayKey, night);
              if (key === regionAt || key === regionWanted) return;
              regionWanted = key;

              void (async () => {
                /* 계단식 — 아직 아무 조각도 없으면 **성긴 층을 먼저** 깐다.
                   타일이 적어 금방 오고, 그 위에 촘촘한 층이 도착하면 갈아 낀다.
                   이게 없으면 확대한 순간부터 도착할 때까지 뭉갠 그림만 보인다. */
                if (!region && wantZ >= 3) {
                  const coarse = await loadRegion(box, fitLevel(box, wantZ - 2, night), dayKey || undefined, night);
                  if (!alive || regionWanted !== key) return;
                  if (coarse && !region) {
                  region = coarse;
                  regionNight = night;
                }
                }
                const got = await loadRegion(box, wantZ, dayKey || undefined, night);
                if (!alive || regionWanted !== key) return;
                regionWanted = '';
                if (!got) return;
                region = got;
                regionNight = night;
                regionAt = key;
              })();
            }, 320);
          }

          /* ── 겹쳐 그리는 것들의 크기·수명 ─────────────────────────────
           *
           * 표식은 **지리가 아니라 주석**이다. 그런데 크기를 지구 반지름에 비례시켜 두었더니
           * 확대할수록 같이 부풀어, 도시 하나를 들여다보는데 지진 파문 하나가 화면을 덮었다.
           * 그래서 두 가지를 나눈다:
           *   markerScale() — 점·고리의 크기. 조금만 자라고 **거기서 멈춘다**.
           *   globeFade()   — 「지구 전체를 볼 때만 뜻이 있는 것」(시간대 링·궤도 무리·발사대)의
           *                   투명도. 표면을 들여다보는 배율이 되면 조용히 사라진다.
           */
          const markerScale = (): number => Math.max(0.6, Math.min(2, R / 280));
          const globeFade = (): number => Math.max(0, Math.min(1, (3.2 - zoom) / 1.4));

          /* ── 그리기 ───────────────────────────────────────────────────── */
          function drawGlobe(now: number): void {
            const c = ctx!;
            if (stars) c.drawImage(stars, 0, 0, W, H);
            else {
              c.fillStyle = '#04060d';
              c.fillRect(0, 0, W, H);
            }

            setCamera();
            const sun = body === 'earth' ? subsolar(new Date(clockMs())) : subsolarBody(body, new Date(clockMs()));
            const sv = toVec(sun.lat, sun.lon);
            const S: [number, number, number] = [dot(sv, ex), dot(sv, ey), dot(sv, ez)];

            /* 대기 — 지구 바깥으로 새어 나오는 파란 테. 이게 없으면 종이에 오린 원처럼 보인다.
               달은 대기가 없어 테가 없고(그래서 가장자리가 칼같다), 화성은 얇고 붉다. */
            const halo = c.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.16);
            if (body === 'moon') {
              halo.addColorStop(0, 'rgba(190,190,200,.07)');
              halo.addColorStop(1, 'rgba(190,190,200,0)');
            } else if (body === 'mars') {
              halo.addColorStop(0, 'rgba(255,150,90,.2)');
              halo.addColorStop(0.5, 'rgba(230,120,70,.07)');
              halo.addColorStop(1, 'rgba(220,110,60,0)');
            } else {
              halo.addColorStop(0, 'rgba(90,150,255,.34)');
              halo.addColorStop(0.5, 'rgba(70,130,240,.12)');
              halo.addColorStop(1, 'rgba(60,120,230,0)');
            }
            c.fillStyle = halo;
            c.beginPath();
            c.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
            c.fill();

            /* 표면 — 땅·바다·구름·도시 불빛·명암을 한 번에. 픽셀마다 구면 위 한 점을 되짚는다.
               (자를 것이 없으므로 「돌리면 땅이 화면을 덮는」 사고가 원리적으로 안 생긴다) */
            ensureSurface();
            /* 표면은 **매 프레임 다시 계산하지 않는다.** 지구는 천천히 돌고, 사람 눈은 30번이면
               충분하다. 파문·궤도처럼 빠른 것만 매 프레임 위에 덧그린다. (폰에서 프레임의
               대부분이 이 한 겹에 들어가고 있었다 — 4배 느린 기기에서 233ms.) */
            const needSurface = now - surfAt > (small ? 42 : 33) || surfDirty;
            if (needSurface) surfAt = now;
            surfDirty = false;
            if (needSurface && surfImg && surfView) {
              const onEarth = body === 'earth';
              paintSurface(surfImg, surfView, {
                day: onEarth ? dayTex : bodyTex[body],
                region: onEarth && prefs.on.zoom ? region : null,
                regionNight,
                night: onEarth && prefs.on.city ? nightTex : null,
                cloud: onEarth && prefs.on.cloud ? cloudTex : null,
                ex,
                ey,
                ez,
                sun: sv
              });
              surfCtx.putImageData(surfImg, 0, 0);
            }
            c.save();
            c.beginPath();
            c.arc(cx, cy, R, 0, Math.PI * 2);
            c.clip();
            c.imageSmoothingEnabled = true;
            c.imageSmoothingQuality = 'high';
            if (surfView) {
              c.drawImage(surfCv, surfView.x0, surfView.y0, surfView.w * surfView.step, surfView.h * surfView.step);
            }

            if (body === 'earth' && prefs.on.aurora && !isPast()) drawAurora(S);
            if (body === 'earth' && prefs.on.quake) drawQuakes(now);
            if (body === 'earth' && prefs.on.launch && !isPast()) drawLaunches();
            if (body === 'earth' && prefs.on.me) drawMe(now);
            c.restore();

            /* ISS 는 지구 밖(궤도 위)이라 자르기 밖에서 그린다 */
            if (body === 'earth' && prefs.on.iss && !isPast()) drawIss();
            if (body === 'earth' && prefs.on.sats && !isPast()) drawSats(now);
            if (body === 'earth' && prefs.on.clock) drawClockRing(sun);

            /* 해가 바로 위인 자리에 옅은 빛무리 */
            const sp = project(sun.lat, sun.lon);
            if (sp.z > 0) {
              const g = c.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, R * 0.55);
              g.addColorStop(0, 'rgba(255,246,214,.16)');
              g.addColorStop(1, 'rgba(255,246,214,0)');
              c.save();
              c.beginPath();
              c.arc(cx, cy, R, 0, Math.PI * 2);
              c.clip();
              c.fillStyle = g;
              c.fillRect(cx - R, cy - R, R * 2, R * 2);
              c.restore();
            }
          }

          function lumAt(v: [number, number, number], S: [number, number, number]): number {
            return dot(v, ex) * S[0] + dot(v, ey) * S[1] + dot(v, ez) * S[2];
          }

          function drawAurora(S: [number, number, number]): void {
            if (!au.length) return;
            const c = ctx!;
            c.save();
            c.globalCompositeOperation = 'lighter';
            for (const pt of au) {
              /* 격자가 1°라 극으로 갈수록 경도 방향으로 점이 촘촘해진다 — 그대로 찍으면
                 오로라가 아니라 **빗살무늬**가 된다. 위도에 따라 솎아 실제 밀도로 되돌린다. */
              const keep = Math.max(1, Math.round(1 / Math.max(0.06, Math.cos(pt.lat * RAD))));
              if (keep > 1 && Math.abs(Math.round(pt.lon)) % keep !== 0) continue;
              const v = toVec(pt.lat, pt.lon);
              const face = dot(v, ez);
              if (face <= 0.16) continue; // 가장자리에 붙은 점은 띠가 아니라 얼룩으로 보인다
              if (lumAt(v, S) > 0.04) continue;
              const p = project(pt.lat, pt.lon);
              const a = Math.min(0.34, pt.v / 260) * Math.min(1, (face - 0.16) * 4);
              const r = 2.1 * markerScale();
              const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6);
              g.addColorStop(0, pt.v > 45 ? `rgba(200,255,205,${a})` : `rgba(105,235,160,${a})`);
              g.addColorStop(1, 'rgba(80,220,150,0)');
              c.fillStyle = g;
              c.beginPath();
              c.arc(p.x, p.y, r * 2.6, 0, Math.PI * 2);
              c.fill();
            }
            c.restore();
          }

          function drawQuakes(now: number): void {
            if (!qs.length) return;
            const c = ctx!;
            const tnow = clockMs();
            for (const q of qs) {
              const v = toVec(q.lat, q.lon);
              if (dot(v, ez) <= 0.02) continue;
              const ageH = (tnow - q.time) / 3600000;
              if (ageH > 24) continue;
              const fresh = Math.max(0.12, 1 - ageH / 24);
              const p = project(q.lat, q.lon);
              const base = (2 + Math.max(0, q.mag - 2.5) * 2.6) * markerScale();

              // 파문 — 규모가 클수록 크게, 최근일수록 진하게. 계속 반복해 「지금도 살아있음」을 만든다
              const period = 2600;
              const phase = ((now + q.time) % period) / period;
              const rr = base * (1 + phase * 4.2);
              const ripAlpha = (1 - phase) * fresh * 0.65 * Math.max(0.18, globeFade());
              c.strokeStyle = `rgba(255,150,120,${ripAlpha})`;
              c.lineWidth = 1.3;
              c.beginPath();
              c.arc(p.x, p.y, rr, 0, Math.PI * 2);
              c.stroke();

              c.fillStyle = `rgba(255,190,150,${0.35 + fresh * 0.45})`;
              c.beginPath();
              c.arc(p.x, p.y, base * 0.55, 0, Math.PI * 2);
              c.fill();
            }
          }

          /**
           * 궤도 위의 것 전부. 지금 지구를 도는 물체가 만 개가 넘는다 —
           * 한 점씩 찍으면 그게 곧 「머리 위가 이렇게 붐빈다」는 그림이 된다.
           *
           * 매 프레임 다시 굴리지 않는다(만 번의 케플러 계산이다). 0.4초에 한 번만 굴리고
           * 그 사이에는 같은 자리를 그린다 — 초속 7.6km 라도 0.4초면 지구본에서 0.2px 다.
           */
          function drawSats(now: number): void {
            if (!satEls.length || !satXyz) return;
            const fade = globeFade();
            if (fade <= 0.01) return;
            const t = clockMs();
            if (now - satAt > 400) {
              propagateAll(satEls, t, satXyz);
              satAt = now;
            }
            const c = ctx!;
            const k = R / EARTH_RADIUS_KM;
            c.save();
            c.globalAlpha = fade;
            c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < satEls.length; i++) {
              const i3 = i * 3;
              const x = satXyz[i3];
              const y = satXyz[i3 + 1];
              const z = satXyz[i3 + 2];
              const px = x * ex[0] + y * ex[1] + z * ex[2];
              const py = x * ey[0] + y * ey[1] + z * ey[2];
              const pz = x * ez[0] + y * ez[1] + z * ez[2];
              const sx = cx + px * k;
              const sy = cy - py * k;
              // 지구 뒤로 넘어가 **가려진** 것은 안 그린다 (원판 안쪽이면서 뒤쪽)
              if (pz < 0 && Math.hypot(sx - cx, sy - cy) < R) continue;
              if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
              const alt = Math.hypot(x, y, z) - EARTH_RADIUS_KM;
              c.fillStyle =
                alt < 2000 ? 'rgba(190,225,255,.55)' : alt < 30000 ? 'rgba(150,190,255,.5)' : 'rgba(255,215,150,.6)';
              c.fillRect(sx - 0.6, sy - 0.6, 1.2, 1.2);
            }
            c.restore();
          }

          /** 그 경도에서 지금 몇 시인가 (해 기준 = 진태양시). */
          function solarHour(lon: number, sunLon: number): number {
            return ((((lon - sunLon) / 15 + 12) % 24) + 24) % 24;
          }

          /**
           * 시간대 링 — 지구를 두른 시계.
           *
           * 지구본만 보면 「저기가 밤이구나」까지는 알아도 「지금 새벽 3시인 사람들이 있다」는
           * 안 보인다. 그래서 24시간을 원으로 펴서 지구 밖에 두른다. 큰 도시를 자기 시각 자리에
           * 점으로 찍으면, 새벽 쪽에 점이 몇 개 몰려 있는지가 그냥 보인다.
           * 맨 위가 자정, 아래가 정오다.
           */
          function drawClockRing(sun: { lat: number; lon: number }): void {
            const fade = globeFade();
            if (fade <= 0.01) return;
            const c = ctx!;
            const rr = Math.min(Math.min(W, H) / 2 - 8, R * 1.22);
            if (rr < 60) return;
            const ang = (hour: number): number => (hour / 24) * Math.PI * 2 - Math.PI / 2;

            c.save();
            c.globalAlpha = fade;
            c.lineWidth = Math.max(3, rr * 0.026);
            for (let i = 0; i < 96; i++) {
              const h0 = (i / 96) * 24;
              const h1 = ((i + 1) / 96) * 24;
              // 그 시각의 하늘색 — 밤은 남색, 여명은 호박색, 낮은 옅은 하늘색
              const dist = Math.min(Math.abs(h0 - 12), 24 - Math.abs(h0 - 12));
              const dayness = Math.max(0, Math.min(1, (7.5 - dist) / 5));
              const dawn = Math.max(0, 1 - Math.abs(dist - 6.2) / 1.5);
              const r0 = 12 + dayness * 120 + dawn * 150;
              const g0 = 18 + dayness * 160 + dawn * 78;
              const b0 = 38 + dayness * 210 + dawn * 10;
              c.strokeStyle = `rgba(${r0 | 0},${g0 | 0},${b0 | 0},${0.5 + dayness * 0.3})`;
              c.beginPath();
              c.arc(cx, cy, rr, ang(h0), ang(h1));
              c.stroke();
            }

            // 세 시간마다 눈금
            c.strokeStyle = 'rgba(255,255,255,.28)';
            c.lineWidth = 1;
            for (let h = 0; h < 24; h += 3) {
              const a = ang(h);
              const co = Math.cos(a);
              const si = Math.sin(a);
              c.beginPath();
              c.moveTo(cx + co * (rr - rr * 0.03), cy + si * (rr - rr * 0.03));
              c.lineTo(cx + co * (rr + rr * 0.032), cy + si * (rr + rr * 0.032));
              c.stroke();
            }

            // 큰 도시를 제 시각 자리에 — 새벽 쪽에 몇 개나 몰려 있나
            for (const city of CITIES) {
              const a = ang(solarHour(city.lon, sun.lon));
              const x = cx + Math.cos(a) * rr;
              const y = cy + Math.sin(a) * rr;
              c.fillStyle = 'rgba(255,235,190,.75)';
              c.beginPath();
              c.arc(x, y, 1.5, 0, Math.PI * 2);
              c.fill();
            }

            // 나 — 링 위에서 지금 내가 서 있는 시각
            if (me) {
              const a = ang(solarHour(me.lon, sun.lon));
              const x = cx + Math.cos(a) * rr;
              const y = cy + Math.sin(a) * rr;
              c.strokeStyle = 'rgba(190,230,255,.95)';
              c.lineWidth = 1.6;
              c.beginPath();
              c.arc(x, y, 5.5, 0, Math.PI * 2);
              c.stroke();
              c.fillStyle = 'rgba(225,245,255,.95)';
              c.beginPath();
              c.arc(x, y, 2, 0, Math.PI * 2);
              c.fill();
            }
            c.restore();
          }

          /** 내 자리 — 숨 쉬듯 커졌다 작아지는 고리 하나. 이름표는 안 붙인다(문장이 말한다). */
          function drawMe(now: number): void {
            if (!me) return;
            const v = toVec(me.lat, me.lon);
            if (dot(v, ez) <= 0.02) return;
            const p = project(me.lat, me.lon);
            const c = ctx!;
            const pulse = 0.5 + 0.5 * Math.sin(now / 1100);
            const base = 3.4 * markerScale();
            c.strokeStyle = `rgba(180,225,255,${0.28 + pulse * 0.34})`;
            c.lineWidth = 1.4;
            c.beginPath();
            c.arc(p.x, p.y, base * (1.4 + pulse * 1.5), 0, Math.PI * 2);
            c.stroke();
            c.fillStyle = 'rgba(225,245,255,.95)';
            c.beginPath();
            c.arc(p.x, p.y, base * 0.5, 0, Math.PI * 2);
            c.fill();
          }

          function drawLaunches(): void {
            if (!ls.length) return;
            const fade = globeFade();
            if (fade <= 0.01) return;
            const c = ctx!;
            c.save();
            c.globalAlpha = fade;
            for (const l of ls) {
              const v = toVec(l.lat, l.lon);
              if (dot(v, ez) <= 0.04) continue;
              const p = project(l.lat, l.lon);
              const s = 3.4 * markerScale();
              c.fillStyle = 'rgba(255,255,255,.8)';
              c.beginPath();
              c.moveTo(p.x, p.y - s * 1.6);
              c.lineTo(p.x + s * 0.8, p.y + s * 0.5);
              c.lineTo(p.x - s * 0.8, p.y + s * 0.5);
              c.closePath();
              c.fill();
            }
            c.restore();
          }

          function drawIss(): void {
            if (!issFix) return;
            const c = ctx!;
            // 궤도 고도 약 420km → 지구 반지름의 1.066 배 자리에 띄운다
            const scale = 1 + issFix.alt / 6371;
            const proj = (lat: number, lon: number): { x: number; y: number; z: number } => {
              const v = toVec(lat, lon);
              return { x: cx + R * scale * dot(v, ex), y: cy - R * scale * dot(v, ey), z: dot(v, ez) };
            };
            if (issTrail.length > 1) {
              c.strokeStyle = 'rgba(150,210,255,.35)';
              c.lineWidth = 1.1;
              c.beginPath();
              let started = false;
              for (const [la, lo] of issTrail) {
                const p = proj(la, lo);
                if (p.z <= 0) {
                  started = false;
                  continue;
                }
                if (!started) {
                  c.moveTo(p.x, p.y);
                  started = true;
                } else c.lineTo(p.x, p.y);
              }
              c.stroke();
            }
            const p = proj(issFix.lat, issFix.lon);
            if (p.z <= -0.15) return;
            c.fillStyle = 'rgba(220,240,255,.95)';
            c.beginPath();
            c.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = 'rgba(160,215,255,.5)';
            c.lineWidth = 1;
            c.beginPath();
            c.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
            c.stroke();
          }

          /* ── 말 — 사건을 문장으로 ─────────────────────────────────────── */
          function nearestCity(lat: number, lon: number, withinKm: number): string | null {
            let best: string | null = null;
            let bestD = withinKm;
            for (const city of CITIES) {
              const d = distanceKm(lat, lon, city.lat, city.lon);
              if (d < bestD) {
                bestD = d;
                best = city.name;
              }
            }
            return best;
          }

          function sentences(): string[] {
            const out: string[] = [];

            if (body !== 'earth') {
              out.push(t('bluemarble.line.' + body));
              out.push(t('bluemarble.line.' + body + '2'));
              if (body === 'mars') out.push(t('bluemarble.credit.mars'));
              return out;
            }
            const sun = subsolar(new Date(clockMs()));

            if (isPast()) {
              const d = new Date(clockMs());
              const when = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
              out.push(t('bluemarble.line.pastDay', { date: when }));
              if (qs.length) {
                const big = qs.slice().sort((a, b) => b.mag - a.mag)[0];
                const near = nearestCity(big.lat, big.lon, 900);
                out.push(
                  t('bluemarble.line.pastQuake', {
                    mag: big.mag.toFixed(1),
                    where: near || t('bluemarble.word.openSea'),
                    n: qs.length
                  })
                );
              } else {
                out.push(t('bluemarble.line.pastQuiet'));
              }
              out.push(t('bluemarble.line.pastSun', { lat: sun.lat.toFixed(0), lon: sun.lon.toFixed(0) }));
              return out;
            }
            const sunCity = nearestCity(sun.lat, sun.lon, 1400);
            out.push(
              sunCity
                ? t('bluemarble.line.sunCity', { city: sunCity })
                : t('bluemarble.line.sunSea', { lat: sun.lat.toFixed(0), lon: sun.lon.toFixed(0) })
            );

            const nightCities = CITIES.filter((city) => {
              const sv = toVec(sun.lat, sun.lon);
              const v = toVec(city.lat, city.lon);
              return dot(v, sv) < 0.05;
            }).length;
            out.push(t('bluemarble.line.night', { n: nightCities, total: CITIES.length }));

            if (qs.length) {
              const last = qs[qs.length - 1];
              const near = nearestCity(last.lat, last.lon, 900);
              out.push(
                t('bluemarble.line.quake', {
                  mag: last.mag.toFixed(1),
                  where: near || t('bluemarble.word.openSea'),
                  ago: fmtRelative(last.time)
                })
              );
              out.push(t('bluemarble.line.quakeCount', { n: qs.length }));
            }

            if (issFix) {
              const near = nearestCity(issFix.lat, issFix.lon, 1200);
              out.push(
                near
                  ? t('bluemarble.line.issCity', { city: near, kmh: Math.round(issFix.vel).toLocaleString() })
                  : t('bluemarble.line.issSea', { alt: Math.round(issFix.alt), kmh: Math.round(issFix.vel).toLocaleString() })
              );
            }

            /* 나 — 이 지구본의 주제는 「나는 여기 혼자인데 지구는 살아있다」다.
               그래서 내 자리 이야기가 문장 목록의 한가운데 있어야 한다. */
            if (me) {
              const sv2 = toVec(sun.lat, sun.lon);
              const night = dot(toVec(me.lat, me.lon), sv2) < 0.05;
              const clock = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
              const place = me.label || t('bluemarble.word.here');
              out.push(t(night ? 'bluemarble.line.meNight' : 'bluemarble.line.meDay', { place, time: clock }));

              if (issPass) {
                out.push(
                  t('bluemarble.line.issPass', {
                    when: fmtRelative(issPass.peak),
                    clock: new Date(issPass.peak).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
                    el: Math.round(issPass.maxEl)
                  })
                );
              } else if (issEl) {
                out.push(t('bluemarble.line.issPassNone'));
              }
            }

            {
              const dawnCities = CITIES.filter((c2) => {
                const h = solarHour(c2.lon, sun.lon);
                return h >= 2 && h < 5;
              }).length;
              if (dawnCities) out.push(t('bluemarble.line.dawn', { n: dawnCities }));
            }

            if (pic) {
              out.push(
                pic.copyright
                  ? t('bluemarble.line.apodBy', { title: pic.title, who: pic.copyright.replace(/\s+/g, ' ').trim() })
                  : t('bluemarble.line.apod', { title: pic.title })
              );
            }

            if (wind) {
              out.push(t('bluemarble.line.wind', { speed: Math.round(wind.speed), min: windEta(wind.speed) }));
            }

            if (satEls.length && prefs.on.sats) out.push(t('bluemarble.line.sats', { n: satEls.length.toLocaleString() }));

            if (kp != null) out.push(kp >= 5 ? t('bluemarble.line.kpStorm', { kp: kp.toFixed(0) }) : t('bluemarble.line.kpCalm'));
            if (au.length) out.push(t('bluemarble.line.aurora'));

            if (ls.length) {
              const next = ls.slice().sort((a, b) => a.net - b.net)[0];
              out.push(t('bluemarble.line.launch', { name: next.name, when: fmtRelative(next.net) }));
            }

            return out;
          }

          let lines: string[] = [];
          let lineIdx = 0;

          /** 한 줄을 바꿔 말한다 (상영 중에는 여기로만 말한다). */
          function say(text: string): void {
            line.classList.remove('bm-show');
            window.setTimeout(() => {
              if (!alive) return;
              line.textContent = text;
              line.classList.add('bm-show');
            }, 380);
          }
          function cycleLine(): void {
            if (!alive) return;
            // 상영·노을 따라가기 중에는 그쪽이 말한다 — 두 목소리가 겹치면 안 된다
            if ((prefs.on.tour || prefs.on.dusk) && body === 'earth' && !isPast()) return;
            lines = sentences();
            if (sound.running) {
              const sunv = toVec(subsolar(new Date(clockMs())).lat, subsolar(new Date(clockMs())).lon);
              const nightCities = CITIES.filter((c2) => dot(toVec(c2.lat, c2.lon), sunv) < 0.05).length;
              sound.update(nightCities / CITIES.length, Math.min(1, au.length / 900));
            }
            if (!lines.length) return;
            lineIdx = (lineIdx + 1) % lines.length;
            line.classList.remove('bm-show');
            window.setTimeout(() => {
              if (!alive) return;
              line.textContent = lines[lineIdx];
              line.classList.add('bm-show');
            }, 420);
          }

          /* ── 노을 따라가기 ────────────────────────────────────────────── */

          /**
           * 해가 지는 선 위에 카메라를 세운다.
           *
           * 해가 바로 위인 경도에서 **동쪽으로 90°** 떨어진 자오선이 지금 해가 지고 있는 선이다
           * (지구는 동쪽으로 돌고, 그래서 해는 서쪽으로 진다 — 지표 입장에서 해가 지평선에 닿는
           * 자리가 그 선이다). 위도는 천천히 오르내려, 그 선 위를 북에서 남으로 훑는다.
           */
          function stepDusk(now: number): void {
            if (!prefs.on.dusk || body !== 'earth') return;
            const sun = subsolar(new Date(clockMs()));
            /* +90° 가 기하학적 경계지만, 여명을 넓게 칠하고 대기 테까지 있어 화면에서는
               낮 쪽으로 치우쳐 보인다(실측: 가로줄의 70% 가 밝았다). 조금 더 밤 쪽으로 민다. */
            const lon = ((((sun.lon + 104) % 360) + 540) % 360) - 180;
            // 60초에 한 번 남북을 오간다 — 더 빠르면 어지럽고, 더 느리면 멎은 것처럼 보인다
            const lat = Math.sin(now / 9500) * 52;
            camLon = lon;
            camLat = lat;
            if (zoom < 1.35 || zoom > 1.45) zoom += (1.4 - zoom) * 0.05;
            idleAt = now; // 자전이 끼어들지 않게

            if (now - duskSaid > 11000) {
              duskSaid = now;
              const near = nearestCity(lat, lon, 1600);
              say(near ? t('bluemarble.line.duskCity', { city: near }) : t('bluemarble.line.dusk'));
            }
            duskAt = now;
          }

          /* ── 지구 뉴스 상영 ───────────────────────────────────────────── */

          /**
           * 오늘 무슨 일이 있었나를 **자리와 함께** 모은다. 문장만 흘리면 「어디」가 안 남는다 —
           * 카메라가 그 자리로 찾아가야 「거기서 일어난 일」이 된다.
           */
          function buildTour(): TourStop[] {
            const stops: TourStop[] = [];
            const sun = subsolar(new Date(clockMs()));

            // 오늘 가장 크게 흔들린 곳 셋
            for (const q of qs.slice().sort((a, b) => b.mag - a.mag).slice(0, 3)) {
              const near = nearestCity(q.lat, q.lon, 900);
              stops.push({
                lat: q.lat,
                lon: q.lon,
                zoom: 2.6,
                line: t('bluemarble.line.quake', {
                  mag: q.mag.toFixed(1),
                  where: near || t('bluemarble.word.openSea'),
                  ago: fmtRelative(q.time)
                })
              });
            }

            // 사람이 지금 지나가는 자리
            if (issFix) {
              const near = nearestCity(issFix.lat, issFix.lon, 1200);
              stops.push({
                lat: issFix.lat,
                lon: issFix.lon,
                zoom: 1.5,
                line: near
                  ? t('bluemarble.line.issCity', { city: near, kmh: Math.round(issFix.vel).toLocaleString() })
                  : t('bluemarble.line.issSea', { alt: Math.round(issFix.alt), kmh: Math.round(issFix.vel).toLocaleString() })
              });
            }

            // 다음에 지구 밖으로 나가는 자리
            if (ls.length) {
              const next = ls.slice().sort((a, b) => a.net - b.net)[0];
              stops.push({
                lat: next.lat,
                lon: next.lon,
                zoom: 2.2,
                line: t('bluemarble.line.launch', { name: next.name, when: fmtRelative(next.net) })
              });
            }

            // 해가 바로 위인 자리
            const sunCity = nearestCity(sun.lat, sun.lon, 1400);
            stops.push({
              lat: sun.lat,
              lon: sun.lon,
              zoom: 1.2,
              line: sunCity
                ? t('bluemarble.line.sunCity', { city: sunCity })
                : t('bluemarble.line.sunSea', { lat: sun.lat.toFixed(0), lon: sun.lon.toFixed(0) })
            });

            // 마지막은 나 — 돌고 돌아 자기 자리로 온다
            if (me) {
              const night = dot(toVec(me.lat, me.lon), toVec(sun.lat, sun.lon)) < 0.05;
              const clock = new Date(clockMs()).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
              stops.push({
                lat: me.lat,
                lon: me.lon,
                zoom: 1.8,
                line: t(night ? 'bluemarble.line.meNight' : 'bluemarble.line.meDay', {
                  place: me.label || t('bluemarble.word.here'),
                  time: clock
                })
              });
            }
            return stops;
          }

          /** 한 자리에 머무는 시간. 읽고 보기에 충분하되 지루하지 않은 선. */
          const TOUR_MS = 9000;

          function stepTour(now: number): void {
            if (!prefs.on.tour || body !== 'earth' || isPast()) return;
            if (now - tourAt < TOUR_MS) return;
            if (tourIdx < 0 || tourIdx >= tour.length - 1) {
              tour = buildTour();
              tourIdx = -1;
            }
            if (!tour.length) return;
            tourIdx = (tourIdx + 1) % tour.length;
            tourAt = now;
            const stop = tour[tourIdx];
            flyTo(stop.lat, stop.lon, 2800, stop.zoom);
            say(stop.line);
          }

          /* ── 받아오기 ─────────────────────────────────────────────────── */
          async function refresh(): Promise<void> {
            if (!alive) return;
            const [q, k, i] = await Promise.all([quakes(), kpIndex(), iss()]);
            if (!alive) return;
            if (q) {
              /* 첫 판은 「전부 새 것」이 아니다 — 열자마자 24시간 치 지진으로 카메라가
                 튀면 그건 사건이 아니라 소음이다. 두 번째 판부터가 진짜 새 소식이다. */
              if (seenQuakes) {
                const fresh = q.filter((x) => !seenQuakes!.has(x.id) && Date.now() - x.time < 3600000);
                const biggest = fresh.sort((a, b) => b.mag - a.mag)[0];
                if (biggest) sound.quake(biggest.mag);
                if (biggest && !drag && zoom < 2.2) {
                  flyTo(biggest.lat, biggest.lon);
                  lineIdx = -1; // 다음 문장이 그 지진이 되게
                }
              }
              seenQuakes = new Set(q.map((x) => x.id));
              liveQuakes = q;
              if (!isPast()) qs = q;
            }
            if (k != null) kp = k;
            if (i) {
              issFix = i;
              const lastPt = issTrail[issTrail.length - 1];
              if (!lastPt || Math.abs(lastPt[0] - i.lat) > 0.02 || Math.abs(lastPt[1] - i.lon) > 0.02) {
                issTrail.push([i.lat, i.lon]);
                if (issTrail.length > 240) issTrail.shift();
              }
            }
          }

          async function refreshSlow(): Promise<void> {
            if (!alive) return;
            const [a, l, omm] = await Promise.all([
              prefs.on.aurora ? aurora() : Promise.resolve(null),
              launches(),
              issOmm()
            ]);
            if (!alive) return;
            if (a) au = a;
            if (l) ls = l;
            if (omm) issEl = elementsFrom(omm);
            refreshSun();
            recomputePass();
          }

          /**
           * 가벼운 것들은 **줄을 안 선다**.
           *
           * 처음엔 태양풍·오늘의 사진을 무거운 갱신(오로라 920KB)과 한 줄에 세워 뒀다. 그랬더니
           * 몇 바이트짜리 값이 1MB 짜리 내려받기가 끝날 때까지 화면에 안 나왔다 — 실측으로
           * 30초 넘게 액자가 비어 있었다. 크기가 다른 것을 같은 줄에 세우면 항상 이렇게 된다.
           */
          async function refreshLight(): Promise<void> {
            if (!alive) return;
            const w2 = await solarWind();
            if (!alive) return;
            if (w2) wind = w2;
            if (!pic) {
              pic = await apod();
              if (!alive) return;
              renderApod();
            }
          }

          function renderApod(): void {
            if (!pic || !prefs.on.apod) {
              apodImg.hidden = true;
              return;
            }
            const src = pic.media_type === 'image' ? pic.url : pic.thumbnail_url;
            if (!src) {
              apodImg.hidden = true;
              return;
            }
            apodImg.hidden = false;
            apodImg.src = src;
            apodImg.title = pic.title;
          }
          apodImg.onclick = () => {
            if (pic) window.open(pic.hdurl || pic.url, '_blank', 'noopener');
          };

          /** SDO 는 몇 분마다 새 그림을 올린다. 주소가 같아서 시각을 붙여 캐시를 피한다. */
          function refreshSun(): void {
            if (!prefs.on.sun || isPast()) {
              sunImg.hidden = true;
              return;
            }
            sunImg.hidden = false;
            sunImg.src = `https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg?t=${Math.floor(Date.now() / 300000)}`;
          }

          /** 목록은 6.9MB 다 — 켤 때만 받는다. 받은 뒤 담아 두므로 다음부터는 즉시 뜬다. */
          async function loadSats(): Promise<void> {
            if (satLoading || satEls.length) return;
            satLoading = true;
            const rows = await catalog();
            satLoading = false;
            if (!alive || !rows) return;
            satEls = rows.map(elementsFrom).filter((el) => Number.isFinite(el.a) && Number.isFinite(el.epoch));
            satXyz = new Float32Array(satEls.length * 3);
            satAt = 0;
            lines = sentences();
          }

          /** 다음 통과는 24시간을 30초 간격으로 훑는다(2,880번) — 몇 ms 라 매번 새로 내도 된다. */
          function recomputePass(): void {
            if (!issEl || !me) {
              issPass = null;
              return;
            }
            issPass = nextPass(issEl, me.lat, me.lon);
          }

          /* ── 조작 ─────────────────────────────────────────────────────── */
          let drag: { x: number; y: number; lon: number; lat: number } | null = null;
          let idleAt = 0;
          canvas.addEventListener('pointerdown', (e: PointerEvent) => {
            drag = { x: e.clientX, y: e.clientY, lon: camLon, lat: camLat };
            canvas.classList.add('bm-drag');
            canvas.setPointerCapture(e.pointerId);
          });
          canvas.addEventListener('pointermove', (e: PointerEvent) => {
            if (!drag) return;
            const k = 0.32 / zoom;
            camLon = drag.lon - (e.clientX - drag.x) * k;
            camLat = Math.max(-85, Math.min(85, drag.lat + (e.clientY - drag.y) * k));
            idleAt = performance.now();
            scheduleRegion();
          });
          const endDrag = (): void => {
            if (drag) idleAt = performance.now();
            drag = null;
            canvas.classList.remove('bm-drag');
          };
          canvas.addEventListener('pointerup', endDrag);
          canvas.addEventListener('pointercancel', endDrag);
          canvas.addEventListener(
            'wheel',
            (e: WheelEvent) => {
              e.preventDefault();
              // 위쪽 한계 = 담아 둔 그림이 아니라 위성 타일의 한계(250m/px)까지 간다
              zoom = Math.max(0.75, Math.min(420, zoom * (e.deltaY < 0 ? 1.18 : 0.847)));
              idleAt = performance.now();
              scheduleRegion();
            },
            { passive: false }
          );

          /* ── 단추 ─────────────────────────────────────────────────────── */
          function renderChips(): void {
            chips.textContent = '';
            for (const l of LAYERS) {
              if (l.earthOnly && body !== 'earth') continue;
              const b = document.createElement('button');
              b.type = 'button';
              b.className = 'bm-chip';
              b.setAttribute('aria-pressed', String(prefs.on[l.id]));
              b.textContent = `${l.glyph} ${t('bluemarble.layer.' + l.id)}`;
              b.onclick = () => {
                /* 「내 자리」를 켤 때만 정확한 위치를 묻는다 — 열자마자 권한 창을 띄우지 않는다.
                   이미 켜져 있는데 또 누르면 끄는 것이므로 묻지 않는다. */
                const turningOn = !prefs.on[l.id];
                prefs.on[l.id] = turningOn;
                b.setAttribute('aria-pressed', String(prefs.on[l.id]));
                save();
                if (l.id === 'aurora' && prefs.on.aurora && !au.length) void refreshSlow();
                if (l.id === 'sats' && turningOn) void loadSats();
                if (l.id === 'sun') refreshSun();
                if (l.id === 'apod') renderApod();
                if (l.id === 'dusk') {
                  duskSaid = 0;
                  if (!turningOn) zoom = 1;
                  else prefs.on.tour = false;
                }
                if (l.id === 'tour') {
                  tourIdx = -1;
                  tourAt = turningOn ? 0 : performance.now();
                  if (!turningOn) zoom = 1;
                }
                if (l.id === 'sound') {
                  // **이 클릭 안에서** 시작해야 한다 — 브라우저가 제스처 밖의 소리를 막는다
                  if (turningOn) sound.start();
                  else sound.stop();
                }
                if (l.id === 'me' && turningOn && me && !me.precise) {
                  void askPrecise().then((got) => {
                    if (!alive || !got) return;
                    me = got;
                    recomputePass();
                    flyTo(me.lat, me.lon, 1800);
                  });
                }
              };
              chips.appendChild(b);
            }
            const s = document.createElement('button');
            s.type = 'button';
            s.className = 'bm-chip';
            s.setAttribute('aria-pressed', String(spin));
            s.textContent = `↻ ${t('bluemarble.layer.spin')}`;
            s.onclick = () => {
              spin = !spin;
              s.setAttribute('aria-pressed', String(spin));
              save();
            };
            chips.appendChild(s);
          }
          /* ── 시간 되감기 ─────────────────────────────────────────────── */

          const DAY = 86400000;
          /* 되감을 수 있는 바닥 = Terra 위성이 지구를 찍기 시작한 날. 그 앞은 그림이 없다. */
          const FLOOR = Date.parse('2000-02-24T00:00:00Z');

          function renderDate(): void {
            const ms = clockMs();
            dateLabel.textContent = new Date(ms).toLocaleDateString(undefined, {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            nowBtn.hidden = !isPast();
          }

          /** 되감은 날의 지구를 불러온다. 못 받아오면 그날 구름 없이 지형만 보인다. */
          async function applyTime(): Promise<void> {
            renderDate();
            refreshSun();
            if (!isPast()) {
              cloudTex = liveCloud;
              qs = liveQuakes;
              region = null;
              regionAt = '';
              return;
            }
            const day = dayString(clockMs());
            pastDay = day;
            region = null;
            regionAt = '';
            const [cm, qq] = await Promise.all([loadCloudsOn(day), quakesOn(day)]);
            if (!alive || pastDay !== day) return;
            cloudTex = cm;
            qs = qq || [];
            lines = sentences();
          }

          let applyTimer: number | undefined;
          slider.min = String(Math.floor(FLOOR / DAY));
          slider.step = '1';
          slider.oninput = () => {
            const dayIdx = Number(slider.value);
            const todayIdx = Math.floor(Date.now() / DAY);
            atTime = dayIdx >= todayIdx ? null : dayIdx * DAY + 12 * 3600000;
            renderDate();
            if (applyTimer !== undefined) window.clearTimeout(applyTimer);
            applyTimer = window.setTimeout(() => void applyTime(), 260);
          };
          nowBtn.onclick = () => {
            atTime = null;
            slider.value = String(Math.floor(Date.now() / DAY));
            void applyTime();
          };

          /* ── 이웃으로 건너가기 ───────────────────────────────────────── */

          const BODIES: Body[] = ['earth', 'moon', 'mars'];

          function renderBodyBtn(): void {
            bodyBtn.textContent = t('bluemarble.body.' + body);
            bodyBtn.setAttribute('aria-pressed', String(body !== 'earth'));
          }

          async function setBody(next: Body): Promise<void> {
            body = next;
            renderBodyBtn();
            renderChips();
            /* 대기 테는 지구의 것이다 — 달·화성엔 없다. 그리기 쪽에서 본다. */
            if (next !== 'earth' && !bodyTex[next]) {
              const tex = await loadTex(dataUrl(`earth/${next}.webp`), next === 'mars' ? 2048 : 1024, next === 'mars' ? 1024 : 512);
              if (!alive) return;
              bodyTex[next] = tex;
            }
            lines = sentences();
            lineIdx = 0;
            line.textContent = lines[0] || '';
          }

          bodyBtn.onclick = () => {
            const i = BODIES.indexOf(body);
            void setBody(BODIES[(i + 1) % BODIES.length]);
          };

          /* ── 상시 모드 (전체화면) ────────────────────────────────────── */

          let wakeLock: { release: () => Promise<void> } | null = null;
          let idleHide: number | undefined;

          function showUi(): void {
            wrap.classList.remove('bm-ambient');
            if (idleHide !== undefined) window.clearTimeout(idleHide);
            // 전체화면일 때만 다시 숨는다 — 창 안에서는 조작부가 계속 보여야 한다
            if (document.fullscreenElement === wrap) {
              idleHide = window.setTimeout(() => wrap.classList.add('bm-ambient'), 3500);
            }
          }

          async function enterAmbient(): Promise<void> {
            try {
              await wrap.requestFullscreen();
            } catch (_) {
              /* 막혔으면 전체화면 없이도 상시 모드는 된다 */
              wrap.classList.add('bm-ambient');
              return;
            }
            /* 켜 두는 물건이라 화면이 꺼지면 안 된다. 되는 브라우저에서만 잡는다. */
            try {
              const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
              if (nav.wakeLock) wakeLock = await nav.wakeLock.request('screen');
            } catch (_) {
              /* 없으면 없는 대로 */
            }
          }

          function exitAmbient(): void {
            wrap.classList.remove('bm-ambient');
            if (idleHide !== undefined) window.clearTimeout(idleHide);
            idleHide = undefined;
            if (wakeLock) {
              void wakeLock.release().catch(() => undefined);
              wakeLock = null;
            }
          }

          function renderPanel(): void {
            wrap.classList.toggle('bm-panel', prefs.panel);
            menuBtn.setAttribute('aria-expanded', String(prefs.panel));
          }
          menuBtn.onclick = () => {
            prefs.panel = !prefs.panel;
            renderPanel();
            save();
          };

          fsBtn.onclick = () => {
            if (document.fullscreenElement === wrap) void document.exitFullscreen();
            else void enterAmbient();
          };

          const onFsChange = (): void => {
            if (document.fullscreenElement === wrap) showUi();
            else exitAmbient();
          };
          document.addEventListener('fullscreenchange', onFsChange);
          wrap.addEventListener('pointermove', showUi);
          wrap.addEventListener('pointerdown', showUi);

          function save(): void {
            try {
              localStorage.setItem(STORE_KEY, JSON.stringify({ on: prefs.on, spin, panel: prefs.panel }));
            } catch (_) {
              /* 저장 못 해도 지구는 돈다 */
            }
          }

          /* ── 돌리기 ───────────────────────────────────────────────────── */
          let last = performance.now();
          function loop(now: number): void {
            raf = requestAnimationFrame(loop);
            const dt = Math.min(100, now - last);
            last = now;
            // 손을 뗀 뒤 4초쯤 지나면 다시 스스로 돈다 — 만지던 자리에서 이어서 돈다
            /* 확대해 들어갔으면 자전을 멈춘다 — 들여다보는 중에 화면이 흘러가면 못 본다.
               (그리고 자전 중 실사 조각을 계속 새로 받는 것은 회선 낭비였다 — 실측으로 멎었다) */
            stepFly(now);
            stepTour(now);
            stepDusk(now);
            if (!fly && !prefs.on.tour && !prefs.on.dusk && spin && !drag && zoom < 2.2 && now - idleAt > 4000) {
              camLon += dt * 0.0035;
            }
            if (camLon > 180) camLon -= 360;
            if (camLon < -180) camLon += 360;
            drawGlobe(now);
          }

          /* ── 시작 ─────────────────────────────────────────────────────── */
          let tick: number | undefined;
          let tickSlow: number | undefined;
          let tickLight: number | undefined;
          let lineTimer: number | undefined;

          function start(): void {
            if (raf === undefined) {
              last = performance.now();
              raf = requestAnimationFrame(loop);
            }
            if (tick === undefined) tick = window.setInterval(() => void refresh(), 5000);
            if (tickSlow === undefined) tickSlow = window.setInterval(() => void refreshSlow(), 60000);
            if (tickLight === undefined) tickLight = window.setInterval(() => void refreshLight(), 10 * 60000);
            if (lineTimer === undefined) lineTimer = window.setInterval(cycleLine, 7000);
          }
          function stop(): void {
            if (raf !== undefined) cancelAnimationFrame(raf);
            raf = undefined;
            if (tick !== undefined) window.clearInterval(tick);
            tick = undefined;
            if (tickSlow !== undefined) window.clearInterval(tickSlow);
            tickSlow = undefined;
            if (tickLight !== undefined) window.clearInterval(tickLight);
            tickLight = undefined;
            if (lineTimer !== undefined) window.clearInterval(lineTimer);
            lineTimer = undefined;
          }

          void (async () => {
            await loadNamespace(NS);
            if (!alive) return;
            renderChips();
            renderPanel();
            renderBodyBtn();
            sub.textContent = t('bluemarble.hint');
            /* 아무것도 안 물어보고 알 수 있는 만큼은 바로 안다 (시간대 → 도시).
               정확한 자리는 사용자가 「내 자리」를 눌렀을 때만 묻는다. */
            const DAY0 = 86400000;
            slider.max = String(Math.floor(Date.now() / DAY0));
            slider.value = slider.max;
            nowBtn.textContent = t('bluemarble.now');
            renderDate();

            me = fromTimezone();
            if (me) {
              camLon = me.lon;
              camLat = Math.max(-60, Math.min(60, me.lat));
            }
            resize();

            /* 표면 그림 — 담아 둔 것이라 빠르다. 못 읽어도 멈추지 않는다(맨 파란 구슬이 된다). */
            const [d, n] = await Promise.all([
              loadTex(dataUrl('earth/day.webp'), 2048, 1024),
              loadTex(dataUrl('earth/night.webp'), 1024, 512)
            ]);
            if (!alive) return;
            dayTex = d;
            nightTex = n;

            start();

            /* 구름은 밖에서 온다 — 늦게 와도 되니 지구부터 띄우고 뒤따라 얹는다 */
            void loadClouds().then((cm) => {
              if (!alive) return;
              liveCloud = cm;
              if (!isPast()) cloudTex = cm;
            });

            /* 가벼운 것 먼저 띄운다 — 지진·ISS 를 기다리는 동안 액자가 비어 있을 이유가 없다 */
            void refreshLight();
            await refresh();
            void refreshSlow();
            if (!alive) return;
            lines = sentences();
            lineIdx = 0;
            line.textContent = lines[0] || '';
            line.classList.add('bm-show');
          })();

          const ro = new ResizeObserver(() => resize());
          ro.observe(wrap);

          const eye = new IntersectionObserver(
            (entries) => {
              if (entries[0]?.isIntersecting) {
                resize();
                start();
              } else stop();
            },
            { threshold: 0.02 }
          );
          eye.observe(wrap);

          Toolbox.onDispose?.(() => {
            alive = false;
            sound.stop();
            document.removeEventListener('fullscreenchange', onFsChange);
            exitAmbient();
            stop();
            ro.disconnect();
            eye.disconnect();
          });
        }
      }
    ]
  });
})();
