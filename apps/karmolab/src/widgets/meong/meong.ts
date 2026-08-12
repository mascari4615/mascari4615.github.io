/**
 * 멍 — 멍때리며 보는 화면 (TASK-KL-247)
 *
 * 사용자: "이런 식으로 뭔가 이쁜것들 멍때리면서 보기 좋은 것들 계속 더 만들건데"
 *
 * 그래서 이건 **작품 한 개가 아니라 자리**다. 껍데기(캔버스·손잡이·멈춤·저장·전체화면·
 * 안 보이면 멈추기)는 여기 한 번만 짓고, 작품은 `pieces.ts` 규약만 지키면 파일 하나씩
 * 늘어난다. 두 번째 작품을 만들 때 다시 지을 것이 없어야 실제로 계속 늘어난다.
 *
 * 화면은 **그림이 주인공**이다. 손잡이는 손을 떼면 사라지고(2.6초), 움직이면 돌아온다.
 * 계기판을 옆에 세워 두면 그림이 「설정 미리보기」가 되어 버린다 — 그건 멍때릴 수 없다.
 *
 * 안 보이면 멈춘다. 다른 탭으로 가거나 앱 안의 다른 도구로 넘어가면 시각이 안 흐르고
 * 그리지도 않는다 — 켜 두는 물건이라 이게 배터리 문제로 직결된다.
 */
import { t, loadNamespace } from '../../lib/i18n';
import { droste } from './droste';
import { sanitize, type ParamValues, type Piece } from './pieces';

(function (): void {
  if (typeof Toolbox === 'undefined') return;

  const ID = 'meong';
  const NS = 'meong';
  const STORE = 'karmolab.meong.v1';
  const HINT_SEEN = 'karmolab.meong.hint';

  /** 작품 목록 — 늘리는 자리는 여기 한 줄이다. */
  const PIECES: Piece[] = [droste];

  const meta: Record<string, unknown> = Toolbox.getLazyWidgetPublicMeta
    ? Toolbox.getLazyWidgetPublicMeta(ID)
    : {};
  const title = typeof meta.title === 'string' ? meta.title : 'Meong';

  interface Saved {
    piece: string;
    seed: number;
    params: Record<string, unknown>;
  }

  function loadSaved(): Saved {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const p = JSON.parse(raw) as Saved;
        if (p && typeof p === 'object') return p;
      }
    } catch {
      /* 저장본이 깨졌으면 그냥 기본값으로 시작한다 — 여기서 죽으면 화면이 통째로 빈다 */
    }
    return { piece: PIECES[0].id, seed: Math.random(), params: {} };
  }

  function injectStyles(): void {
    if (document.getElementById('meong-styles')) return;
    const el = document.createElement('style');
    el.id = 'meong-styles';
    el.textContent = `
.meong-root { position: relative; width: 100%; height: 100%; min-height: 420px; flex: 1;
  overflow: hidden; border-radius: var(--radius-md, 10px); background: #0b0d12; outline: none; }
.meong-root:fullscreen { border-radius: 0; }
.meong-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.meong-ui { position: absolute; inset: 0; pointer-events: none;
  transition: opacity .45s ease; opacity: 1; }
.meong-root.is-idle .meong-ui { opacity: 0; }
.meong-dock { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
  display: flex; gap: 6px; padding: 6px; pointer-events: auto;
  background: rgba(12,14,20,.62); backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,.10); border-radius: 999px; }
.meong-btn { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 999px; cursor: pointer; font-size: 14px; line-height: 1;
  color: rgba(255,255,255,.78); background: transparent; transition: background .15s, color .15s; }
.meong-btn:hover { background: rgba(255,255,255,.12); color: #fff; }
.meong-btn[aria-pressed="true"] { background: rgba(255,255,255,.16); color: #fff; }
.meong-chips { position: absolute; left: 14px; top: 14px; display: flex; gap: 6px;
  pointer-events: auto; flex-wrap: wrap; max-width: calc(100% - 28px); }
.meong-chip { padding: 5px 12px; border-radius: 999px; cursor: pointer; font-size: 12px;
  border: 1px solid rgba(255,255,255,.12); background: rgba(12,14,20,.55);
  color: rgba(255,255,255,.7); backdrop-filter: blur(10px); }
.meong-chip[aria-pressed="true"] { color: #fff; border-color: rgba(255,255,255,.34); }
.meong-panel { position: absolute; right: 14px; top: 14px; width: 232px; pointer-events: auto;
  padding: 14px; display: none; flex-direction: column; gap: 13px;
  background: rgba(12,14,20,.72); backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,.10); border-radius: var(--radius-md, 10px); }
.meong-panel.is-open { display: flex; }
.meong-row { display: flex; flex-direction: column; gap: 6px; }
.meong-row > label { font-size: 11px; letter-spacing: .04em; text-transform: uppercase;
  color: rgba(255,255,255,.52); display: flex; justify-content: space-between; gap: 8px; }
.meong-row > label > b { font-weight: 600; color: rgba(255,255,255,.82); font-variant-numeric: tabular-nums; }
.meong-row input[type="range"] { width: 100%; accent-color: #d4a849; }
.meong-seg { display: flex; gap: 4px; flex-wrap: wrap; }
.meong-seg > button { flex: 1 1 auto; min-width: 40px; padding: 5px 4px; font-size: 11px; cursor: pointer;
  border-radius: var(--radius-sm, 6px); border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04); color: rgba(255,255,255,.6); }
.meong-seg > button[aria-pressed="true"] { background: rgba(212,168,73,.20);
  border-color: rgba(212,168,73,.55); color: #fff; }
.meong-hint { position: absolute; left: 0; right: 0; bottom: 60px; text-align: center;
  font-size: 11px; color: rgba(255,255,255,.34); }
@media (max-width: 620px) { .meong-panel { left: 14px; right: 14px; width: auto; } }
@media (prefers-reduced-motion: reduce) { .meong-ui { transition: none; } }
`;
    document.head.appendChild(el);
  }

  function build(container: HTMLElement): void {
    injectStyles();

    const saved = loadSaved();
    let piece = PIECES.find((p) => p.id === saved.piece) ?? PIECES[0];
    let params: ParamValues = sanitize(piece, saved.params);
    let seed = typeof saved.seed === 'number' ? saved.seed : Math.random();

    const root = document.createElement('div');
    root.className = 'meong-root';
    root.tabIndex = 0;
    const canvas = document.createElement('canvas');
    canvas.className = 'meong-canvas';
    canvas.setAttribute('role', 'img');
    root.appendChild(canvas);
    const ui = document.createElement('div');
    ui.className = 'meong-ui';
    root.appendChild(ui);
    container.appendChild(root);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* ── 그리기 ────────────────────────────────────────────────────── */

    let w = 0;
    let h = 0;
    let dpr = 1;
    let time = 0;
    let last = 0;
    let running = true;
    let raf = 0;

    function fit(): void {
      const rect = root.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }

    function paint(): void {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      piece.frame({ ctx, w, h, dpr, time, params, seed });
    }

    /** 화면에 없으면 그리지도 시간을 흘리지도 않는다 (다른 도구 탭으로 갔을 때) */
    function onScreen(): boolean {
      return root.isConnected && !document.hidden && root.offsetParent !== null;
    }

    function tick(now: number): void {
      raf = requestAnimationFrame(tick);
      if (!last) last = now;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!onScreen()) return;
      if (running) time += dt;
      paint();
    }

    fit();
    root.style.background = piece.bg(params);

    /** 작품이 고른 첫 장면부터 연다 — t=0 이 볼 만하다는 보장이 없다. */
    function rewind(): void {
      time = piece.startTime ? piece.startTime(w, h, params) : 0;
    }
    rewind();

    /* 「움직임 줄이기」를 켜 둔 사람에게 끝없이 도는 화면을 들이밀지 않는다. 멈춘 채로 열고,
       보고 싶으면 누르면 된다. 그림 자체는 그대로 한 장 그려 둔다(빈 화면이 아니다). */
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) running = false;

    paint();
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(function () {
      const was = w;
      fit();
      // 멈춰 있는 동안 창이 크게 바뀌면 첫 장면 계산이 어긋난다 — 그때만 다시 맞춘다.
      if (!running && Math.abs(w - was) > 1) rewind();
      if (onScreen()) paint();
    });
    ro.observe(root);

    /* ── 손잡이가 사라지고 돌아오는 것 ──────────────────────────────── */

    let idleTimer = 0;
    let panelOpen = false;
    function wake(): void {
      root.classList.remove('is-idle');
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(function () {
        if (!panelOpen) root.classList.add('is-idle');
      }, 2600);
    }
    root.addEventListener('pointermove', wake);
    root.addEventListener('pointerdown', wake);
    wake();

    /* ── 저장 ──────────────────────────────────────────────────────── */

    function persist(): void {
      try {
        localStorage.setItem(STORE, JSON.stringify({ piece: piece.id, seed, params } as Saved));
      } catch {
        /* 저장이 막혀 있어도 보는 데는 지장이 없다 */
      }
    }

    /* ── 손잡이 (말 묶음이 온 뒤에 그린다) ──────────────────────────── */

    void loadNamespace(NS).then(function () {
      const chips = document.createElement('div');
      chips.className = 'meong-chips';
      const panel = document.createElement('div');
      panel.className = 'meong-panel';
      const dock = document.createElement('div');
      dock.className = 'meong-dock';
      canvas.setAttribute('aria-label', t('meong.a11y.canvas'));

      /* 안내는 **처음 온 사람에게 한 번만**. 켜 둘 때마다 조작법이 뜨면 그건 잔소리고,
         멍때리는 화면에 글씨가 하나 더 있는 것 자체가 방해다. */
      let seenHint = true;
      try {
        seenHint = localStorage.getItem(HINT_SEEN) === '1';
      } catch {
        /* 저장이 막혀 있으면 그냥 안 띄운다 */
      }
      const hint = document.createElement('div');
      hint.className = 'meong-hint';
      if (!seenHint) {
        hint.textContent = t('meong.hint');
        window.setTimeout(function () {
          hint.textContent = '';
          try {
            localStorage.setItem(HINT_SEEN, '1');
          } catch {
            /* 못 적어도 화면엔 지장 없다 */
          }
        }, 9000);
      }
      ui.append(chips, panel, dock, hint);

      function pieceLabel(p: Piece): string {
        return t('meong.piece.' + p.id);
      }

      /* 작품 고르개 — 하나뿐이면 안 그린다(고를 게 없는 고르개는 고장으로 보인다) */
      function renderChips(): void {
        chips.innerHTML = '';
        if (PIECES.length < 2) return;
        for (const p of PIECES) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'meong-chip';
          b.textContent = pieceLabel(p);
          b.setAttribute('aria-pressed', String(p.id === piece.id));
          b.addEventListener('click', function () {
            piece = p;
            params = sanitize(piece, {});
            root.style.background = piece.bg(params);
            time = 0;
            persist();
            renderChips();
            renderPanel();
          });
          chips.appendChild(b);
        }
      }

      function renderPanel(): void {
        panel.innerHTML = '';
        for (const spec of piece.params) {
          const row = document.createElement('div');
          row.className = 'meong-row';
          const id = 'meong-' + piece.id + '-' + spec.key;
          const label = document.createElement('label');
          label.htmlFor = id;
          const name = document.createElement('span');
          name.textContent = t('meong.param.' + spec.key);
          const val = document.createElement('b');
          label.append(name, val);
          row.appendChild(label);

          if (spec.kind === 'range') {
            const input = document.createElement('input');
            input.type = 'range';
            input.id = id;
            input.name = id;
            input.min = String(spec.min ?? 0);
            input.max = String(spec.max ?? 1);
            input.step = String(spec.step ?? 0.01);
            input.value = String(params[spec.key]);
            input.setAttribute('aria-label', t('meong.param.' + spec.key));
            val.textContent = Number(params[spec.key]).toFixed(2);
            input.addEventListener('input', function () {
              params[spec.key] = Number(input.value);
              val.textContent = Number(input.value).toFixed(2);
              persist();
              if (!running && onScreen()) paint();
            });
            row.appendChild(input);
          } else {
            const seg = document.createElement('div');
            seg.className = 'meong-seg';
            seg.id = id;
            const choices = spec.choices ?? [];
            val.textContent = '';
            for (const c of choices) {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = t('meong.choice.' + spec.key + '.' + c);
              b.setAttribute('aria-pressed', String(params[spec.key] === c));
              b.addEventListener('click', function () {
                params[spec.key] = c;
                root.style.background = piece.bg(params);
                persist();
                renderPanel();
                if (!running && onScreen()) paint();
              });
              seg.appendChild(b);
            }
            row.appendChild(seg);
          }
          panel.appendChild(row);
        }
      }

      function iconBtn(glyph: string, key: string, onClick: () => void): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'meong-btn';
        b.textContent = glyph;
        b.title = t('meong.btn.' + key);
        b.setAttribute('aria-label', t('meong.btn.' + key));
        b.addEventListener('click', onClick);
        dock.appendChild(b);
        return b;
      }

      const playBtn = iconBtn('❚❚', 'pause', function () {
        running = !running;
        playBtn.textContent = running ? '❚❚' : '▶';
        playBtn.title = t('meong.btn.' + (running ? 'pause' : 'play'));
        playBtn.setAttribute('aria-label', playBtn.title);
      });

      iconBtn('✦', 'seed', function () {
        seed = Math.random();
        persist();
        if (!running && onScreen()) paint();
      });

      const panelBtn = iconBtn('☰', 'panel', function () {
        panelOpen = !panelOpen;
        panel.classList.toggle('is-open', panelOpen);
        panelBtn.setAttribute('aria-pressed', String(panelOpen));
        wake();
      });
      panelBtn.setAttribute('aria-pressed', 'false');

      iconBtn('⤓', 'save', function () {
        /* 화면 그대로 뜨면 배경화면으로 쓰기엔 잘다. 같은 구도를 두 배 해상도로 다시 그린다 —
           작품이 CSS 픽셀 기준으로 그리므로 `dpr` 만 올리면 구도는 그대로고 선만 촘촘해진다. */
        const big = document.createElement('canvas');
        big.width = Math.round(w * 2);
        big.height = Math.round(h * 2);
        const bctx = big.getContext('2d');
        if (bctx) {
          bctx.setTransform(2, 0, 0, 2, 0, 0);
          piece.frame({ ctx: bctx, w, h, dpr: 2, time, params, seed });
        }
        (bctx ? big : canvas).toBlob(function (blob) {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'karmolab-meong-' + piece.id + '-' + Math.round(seed * 1e6) + '.png';
          a.click();
          setTimeout(function () {
            URL.revokeObjectURL(url);
          }, 4000);
          Toolbox.showToast?.(t('meong.saved'), 'success');
          Toolbox.trackUse?.('meong-save');
        }, 'image/png');
      });

      iconBtn('⛶', 'full', function () {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void root.requestFullscreen?.();
      });

      root.addEventListener('keydown', function (e) {
        if (e.key === ' ') {
          e.preventDefault();
          playBtn.click();
        } else if (e.key === 'f') {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void root.requestFullscreen?.();
        }
      });

      renderChips();
      renderPanel();
    });

    Toolbox.onDispose?.(function () {
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      ro.disconnect();
    });
  }

  Toolbox.register({
    ...meta,
    id: ID,
    title,
    category: 'lab',
    layout: 'full',
    noHero: true,
    tabs: [{ id: 'app', label: title, build }]
  });
})();
