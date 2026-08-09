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
 *   - 지도 타일도 안 받는다 → 남의 서버로 나가는 요청 0, 색을 우리가 정한다.
 *   - 땅의 윤곽만 한 파일(`data/coastline-110m.json`, 64KB)로 들고 온다.
 *   - 명암은 벡터 내적 하나다. 구면 위 한 점의 밝기 = (그 점의 법선)·(태양 방향).
 *     화면 좌표에서 법선이 곧 (x, y, √(1-x²-y²)) 이므로, 낮은 해상도(160×160)로 한 번 계산해
 *     크게 늘여 덮으면 경계가 부드럽게 나온다. 픽셀마다 매 프레임 도는 것보다 40배 싸다.
 *
 * 안 보이면 멈춘다 — 켜 두는 물건이라 더 중요하다(탭이 가려지면 rAF·받아오기 둘 다 정지).
 */
import { t, loadNamespace, fmtRelative } from '../../lib/i18n';
import { CITIES } from './cities';
import { subsolar, toVec, distanceKm } from './sky';
import { quakes, aurora, kpIndex, iss, launches, type Quake, type AuroraPoint, type IssFix, type Launch } from './sources';

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

  interface Coastline {
    rings: number[][];
  }

  type LayerId = 'quake' | 'aurora' | 'iss' | 'city' | 'launch';
  const LAYERS: Array<{ id: LayerId; glyph: string }> = [
    { id: 'city', glyph: '✦' },
    { id: 'quake', glyph: '◎' },
    { id: 'aurora', glyph: '≈' },
    { id: 'iss', glyph: '✧' },
    { id: 'launch', glyph: '▲' }
  ];
  const STORE_KEY = 'karmolab_bluemarble_v1';

  interface Prefs {
    on: Record<LayerId, boolean>;
    spin: boolean;
  }
  function loadPrefs(): Prefs {
    const base: Prefs = { on: { quake: true, aurora: true, iss: true, city: true, launch: true }, spin: true };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const p = JSON.parse(raw) as Partial<Prefs>;
      return { on: { ...base.on, ...(p.on || {}) }, spin: p.spin !== false };
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
.bm-wrap{position:relative;width:100%;height:100%;min-height:420px;display:flex;flex-direction:column;
  border-radius:var(--radius-md,12px);overflow:hidden;background:#04060d;}
.bm-canvas{flex:1;display:block;width:100%;height:100%;touch-action:none;cursor:grab;}
.bm-canvas.bm-drag{cursor:grabbing;}
.bm-chips{position:absolute;top:10px;left:10px;display:flex;flex-wrap:wrap;gap:6px;z-index:2;}
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
          const chips = document.createElement('div');
          chips.className = 'bm-chips';
          const ticker = document.createElement('div');
          ticker.className = 'bm-ticker';
          const line = document.createElement('span');
          line.className = 'bm-line';
          const sub = document.createElement('span');
          sub.className = 'bm-sub';
          ticker.append(line, sub);
          wrap.append(canvas, chips, ticker);
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
          let coast: number[][] = [];
          let stars: HTMLCanvasElement | null = null;
          let qs: Quake[] = [];
          let au: AuroraPoint[] = [];
          let kp: number | null = null;
          let issFix: IssFix | null = null;
          let issTrail: Array<[number, number]> = [];
          let ls: Launch[] = [];
          let raf: number | undefined;
          let alive = true;

          /* 명암 판(작게 계산해서 크게 늘인다) */
          const SHADE = 160;
          const shadeCv = document.createElement('canvas');
          shadeCv.width = SHADE;
          shadeCv.height = SHADE;
          const shadeCtx = shadeCv.getContext('2d', { willReadFrequently: true })!;
          const shadeImg = shadeCtx.createImageData(SHADE, SHADE);

          /* ── 화면 크기 ────────────────────────────────────────────────── */
          function resize(): void {
            const r = wrap.getBoundingClientRect();
            dpr = Math.min(2, window.devicePixelRatio || 1);
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

          const dot = (a: [number, number, number], b: [number, number, number]): number =>
            a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

          /** 위경도 → 화면. `z` 가 음수면 지구 반대편(안 보임). */
          function project(lat: number, lon: number): { x: number; y: number; z: number } {
            const v = toVec(lat, lon);
            return { x: cx + R * dot(v, ex), y: cy - R * dot(v, ey), z: dot(v, ez) };
          }

          /* ── 그리기 ───────────────────────────────────────────────────── */
          function drawGlobe(now: number): void {
            const c = ctx!;
            if (stars) c.drawImage(stars, 0, 0, W, H);
            else {
              c.fillStyle = '#04060d';
              c.fillRect(0, 0, W, H);
            }

            setCamera();
            const sun = subsolar();
            const sv = toVec(sun.lat, sun.lon);
            const S: [number, number, number] = [dot(sv, ex), dot(sv, ey), dot(sv, ez)];

            /* 대기 — 지구 바깥으로 새어 나오는 파란 테. 이게 없으면 종이에 오린 원처럼 보인다. */
            const halo = c.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.16);
            halo.addColorStop(0, 'rgba(90,150,255,.34)');
            halo.addColorStop(0.5, 'rgba(70,130,240,.12)');
            halo.addColorStop(1, 'rgba(60,120,230,0)');
            c.fillStyle = halo;
            c.beginPath();
            c.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
            c.fill();

            /* 바다 */
            const sea = c.createRadialGradient(cx - R * 0.28, cy - R * 0.34, R * 0.1, cx, cy, R);
            sea.addColorStop(0, '#1d4f8f');
            sea.addColorStop(0.62, '#12376b');
            sea.addColorStop(1, '#0a2247');
            c.save();
            c.beginPath();
            c.arc(cx, cy, R, 0, Math.PI * 2);
            c.clip();
            c.fillStyle = sea;
            c.fillRect(cx - R, cy - R, R * 2, R * 2);

            /* 땅 — 뒤쪽으로 넘어간 점은 가장자리(limb)에 붙여 실루엣을 닫는다.
               정확한 구면 자르기 대신 쓰는 고전적인 싼 방법이고, 이 축척에선 눈에 안 띈다. */
            /* 땅 색 — 원색 초록이면 지구가 아니라 지도가 된다. 위성에서 본 땅에 가깝게
               올리브 쪽으로 죽이고, 해안선만 얇게 밝혀 물가를 살린다. */
            const soil = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
            soil.addColorStop(0, '#4a6b46');
            soil.addColorStop(0.5, '#3c5c3c');
            soil.addColorStop(1, '#54603a');
            c.fillStyle = soil;
            c.strokeStyle = 'rgba(150,205,180,.2)';
            c.lineWidth = 0.6;
            for (const ring of coast) {
              let started = false;
              let anyVisible = false;
              c.beginPath();
              for (let i = 0; i < ring.length; i += 2) {
                const p = project(ring[i + 1], ring[i]);
                let { x, y } = p;
                if (p.z < 0) {
                  const dx = x - cx;
                  const dy = y - cy;
                  const d = Math.hypot(dx, dy) || 1;
                  x = cx + (dx / d) * R;
                  y = cy + (dy / d) * R;
                } else anyVisible = true;
                if (!started) {
                  c.moveTo(x, y);
                  started = true;
                } else c.lineTo(x, y);
              }
              if (!anyVisible) continue;
              c.closePath();
              c.fill();
              c.stroke();
            }

            /* 명암 — 밤은 덮개다. 낮은 그대로 둔다. */
            paintShade(S);
            c.drawImage(shadeCv, cx - R, cy - R, R * 2, R * 2);

            /* 밤이 된 쪽에만 도시가 켜진다 */
            if (prefs.on.city) drawCities(S, now);
            if (prefs.on.aurora) drawAurora(S);
            if (prefs.on.quake) drawQuakes(now);
            if (prefs.on.launch) drawLaunches();
            c.restore();

            /* ISS 는 지구 밖(궤도 위)이라 자르기 밖에서 그린다 */
            if (prefs.on.iss) drawIss();

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

          /**
           * 낮/밤 덮개를 낮은 해상도로 계산한다.
           * 화면 위 원 안의 점 (nx, ny) 은 곧 그 지점의 법선이다 — nz = √(1-nx²-ny²).
           * 밝기 = 법선·태양. 그래서 픽셀당 곱셈 세 번이면 끝이다.
           */
          function paintShade(S: [number, number, number]): void {
            const d = shadeImg.data;
            let k = 0;
            for (let j = 0; j < SHADE; j++) {
              const ny = 1 - ((j + 0.5) / SHADE) * 2;
              for (let i = 0; i < SHADE; i++, k += 4) {
                const nx = ((i + 0.5) / SHADE) * 2 - 1;
                const r2 = nx * nx + ny * ny;
                if (r2 >= 1) {
                  d[k + 3] = 0;
                  continue;
                }
                const nz = Math.sqrt(1 - r2);
                const lum = nx * S[0] + ny * S[1] + nz * S[2];
                // -0.10 ~ 0.22 사이를 여명으로 둔다 — 딱 끊으면 종이 오린 자국이 난다
                let night = (0.22 - lum) / 0.32;
                night = night < 0 ? 0 : night > 1 ? 1 : night;
                night = night * night * (3 - 2 * night); // 부드럽게
                // 가장자리 1px 은 알파를 눌러 톱니를 없앤다
                const edge = Math.min(1, (1 - Math.sqrt(r2)) * SHADE * 0.5);
                d[k] = 3;
                d[k + 1] = 6;
                d[k + 2] = 18;
                d[k + 3] = Math.round(night * 214 * edge);
              }
            }
            shadeCtx.putImageData(shadeImg, 0, 0);
          }

          function lumAt(v: [number, number, number], S: [number, number, number]): number {
            return dot(v, ex) * S[0] + dot(v, ey) * S[1] + dot(v, ez) * S[2];
          }

          function drawCities(S: [number, number, number], now: number): void {
            const c = ctx!;
            c.save();
            c.globalCompositeOperation = 'lighter';
            for (const city of CITIES) {
              const v = toVec(city.lat, city.lon);
              if (dot(v, ez) <= 0.02) continue;
              const lum = lumAt(v, S);
              if (lum > 0.06) continue; // 낮인 곳은 안 보인다
              const dark = Math.min(1, (0.06 - lum) / 0.3);
              const p = project(city.lat, city.lon);
              const tw = 0.82 + 0.18 * Math.sin(now / 900 + city.lon * 0.7 + city.lat);
              const a = dark * city.w * tw * 0.9;
              const r = (1.1 + city.w * 2.1) * Math.max(0.55, R / 260);
              const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
              g.addColorStop(0, `rgba(255,226,160,${a})`);
              g.addColorStop(0.35, `rgba(255,190,110,${a * 0.35})`);
              g.addColorStop(1, 'rgba(255,180,90,0)');
              c.fillStyle = g;
              c.beginPath();
              c.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
              c.fill();
            }
            c.restore();
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
              const r = 2.1 * Math.max(0.6, R / 300);
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
            const tnow = Date.now();
            for (const q of qs) {
              const v = toVec(q.lat, q.lon);
              if (dot(v, ez) <= 0.02) continue;
              const ageH = (tnow - q.time) / 3600000;
              if (ageH > 24) continue;
              const fresh = Math.max(0.12, 1 - ageH / 24);
              const p = project(q.lat, q.lon);
              const base = (2 + Math.max(0, q.mag - 2.5) * 2.6) * Math.max(0.6, R / 280);

              // 파문 — 규모가 클수록 크게, 최근일수록 진하게. 계속 반복해 「지금도 살아있음」을 만든다
              const period = 2600;
              const phase = ((now + q.time) % period) / period;
              const rr = base * (1 + phase * 4.2);
              c.strokeStyle = `rgba(255,150,120,${(1 - phase) * fresh * 0.65})`;
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

          function drawLaunches(): void {
            if (!ls.length) return;
            const c = ctx!;
            for (const l of ls) {
              const v = toVec(l.lat, l.lon);
              if (dot(v, ez) <= 0.04) continue;
              const p = project(l.lat, l.lon);
              const s = 3.4 * Math.max(0.6, R / 300);
              c.fillStyle = 'rgba(255,255,255,.8)';
              c.beginPath();
              c.moveTo(p.x, p.y - s * 1.6);
              c.lineTo(p.x + s * 0.8, p.y + s * 0.5);
              c.lineTo(p.x - s * 0.8, p.y + s * 0.5);
              c.closePath();
              c.fill();
            }
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
            const sun = subsolar();
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
          function cycleLine(): void {
            if (!alive) return;
            lines = sentences();
            if (!lines.length) return;
            lineIdx = (lineIdx + 1) % lines.length;
            line.classList.remove('bm-show');
            window.setTimeout(() => {
              if (!alive) return;
              line.textContent = lines[lineIdx];
              line.classList.add('bm-show');
            }, 420);
          }

          /* ── 받아오기 ─────────────────────────────────────────────────── */
          async function refresh(): Promise<void> {
            if (!alive) return;
            const [q, k, i] = await Promise.all([quakes(), kpIndex(), iss()]);
            if (!alive) return;
            if (q) qs = q;
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
            const [a, l] = await Promise.all([prefs.on.aurora ? aurora() : Promise.resolve(null), launches()]);
            if (!alive) return;
            if (a) au = a;
            if (l) ls = l;
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
              zoom = Math.max(0.75, Math.min(3.2, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
              idleAt = performance.now();
            },
            { passive: false }
          );

          /* ── 단추 ─────────────────────────────────────────────────────── */
          function renderChips(): void {
            chips.textContent = '';
            for (const l of LAYERS) {
              const b = document.createElement('button');
              b.type = 'button';
              b.className = 'bm-chip';
              b.setAttribute('aria-pressed', String(prefs.on[l.id]));
              b.textContent = `${l.glyph} ${t('bluemarble.layer.' + l.id)}`;
              b.onclick = () => {
                prefs.on[l.id] = !prefs.on[l.id];
                b.setAttribute('aria-pressed', String(prefs.on[l.id]));
                save();
                if (l.id === 'aurora' && prefs.on.aurora && !au.length) void refreshSlow();
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
          function save(): void {
            try {
              localStorage.setItem(STORE_KEY, JSON.stringify({ on: prefs.on, spin }));
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
            if (spin && !drag && now - idleAt > 4000) camLon += dt * 0.0035;
            if (camLon > 180) camLon -= 360;
            if (camLon < -180) camLon += 360;
            drawGlobe(now);
          }

          /* ── 시작 ─────────────────────────────────────────────────────── */
          let tick: number | undefined;
          let tickSlow: number | undefined;
          let lineTimer: number | undefined;

          function start(): void {
            if (raf === undefined) {
              last = performance.now();
              raf = requestAnimationFrame(loop);
            }
            if (tick === undefined) tick = window.setInterval(() => void refresh(), 5000);
            if (tickSlow === undefined) tickSlow = window.setInterval(() => void refreshSlow(), 60000);
            if (lineTimer === undefined) lineTimer = window.setInterval(cycleLine, 7000);
          }
          function stop(): void {
            if (raf !== undefined) cancelAnimationFrame(raf);
            raf = undefined;
            if (tick !== undefined) window.clearInterval(tick);
            tick = undefined;
            if (tickSlow !== undefined) window.clearInterval(tickSlow);
            tickSlow = undefined;
            if (lineTimer !== undefined) window.clearInterval(lineTimer);
            lineTimer = undefined;
          }

          void (async () => {
            await loadNamespace(NS);
            if (!alive) return;
            renderChips();
            sub.textContent = t('bluemarble.hint');
            resize();

            try {
              const res = await fetch(dataUrl('coastline-110m.json'));
              const data = (await res.json()) as Coastline;
              if (Array.isArray(data.rings)) coast = data.rings;
            } catch (_) {
              /* 땅이 없으면 바다만 도는 파란 구슬이 된다 — 그래도 멈추지는 않는다 */
            }
            if (!alive) return;

            start();
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
            stop();
            ro.disconnect();
            eye.disconnect();
          });
        }
      }
    ]
  });
})();
