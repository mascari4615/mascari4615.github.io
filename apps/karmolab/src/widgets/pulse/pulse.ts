/**
 * 박동(Pulse) — 방송국 화면.
 *
 * 켜 두는 물건이다. 아무것도 안 눌러도 방송들이 저 혼자 뛴다.
 * 갈리는 순간에는 카드가 한 번 번쩍이고, 정각에는 종이 **실제로 울린다**.
 *
 * 화면 둘:
 *   벤토   — 방송마다 크기가 다른 격자. 그림 방송은 캔버스에 제 얼굴을 직접 그린다.
 *   타임라인 — 모든 방송이 한 줄기로 흐른다. 원본이 트위터였으니 그 형식을 되돌려 놓은 것.
 *
 * **다음 박동은 절대 안 보여준다.** 계산은 되지만 보여 주면 기다림이 사라진다 —
 * 기다림이 이 갈래의 알맹이다(사용자 지적, 2026-08-09).
 */
import type { Beat, Channel, Ink } from './core';
import { CHANNELS } from './channels';
import { humanLeft, rngFor, stampOf, tickOf, tickProgress, tickStart } from './core';

(function (): void {
  const SEED_PREF = 'pulse.seed';
  const SOUND_PREF = 'pulse.sound';

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    );
  }

  function periodLabel(ms: number): string {
    if (ms < 3600000) return `${ms / 60000}분`;
    if (ms < 86400000) return `${ms / 3600000}시간`;
    return `${ms / 86400000}일`;
  }

  /** 테마 색을 읽어 방송에게 넘긴다 — 방송이 제 색을 박으면 밝은 테마에서 안 보인다. */
  function inkOf(el: HTMLElement): Ink {
    const s = getComputedStyle(el);
    const v = (name: string, fallback: string): string => (s.getPropertyValue(name) || '').trim() || fallback;
    return {
      bg: v('--bg-tertiary', '#232329'),
      fg: v('--text-primary', '#e8e8e8'),
      dim: v('--text-tertiary', '#8a8a92'),
      accent: v('--accent', '#a99bf5')
    };
  }

  /** 캔버스 한 장에 박동 하나를 그린다. 화면 배율까지 맞춰야 선이 안 뭉갠다. */
  function paintInto(canvas: HTMLCanvasElement, ch: Channel, tick: number, beat: Beat, ink: Ink): void {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const c = canvas.getContext('2d');
    if (!c || !beat.paint) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    beat.paint(c, w, h, rngFor(`${ch.id}/art`, tick), ink);
  }

  function injectStyles(): void {
    if (document.getElementById('pl-styles')) return;
    const style = document.createElement('style');
    style.id = 'pl-styles';
    style.textContent = `
.pl-wrap { padding: 18px; display: flex; flex-direction: column; gap: 16px; }
.pl-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.pl-head h2 { margin: 0; font-size: 20px; color: var(--text-primary, #e8e8e8); letter-spacing: .04em; }
.pl-tag { font-size: 12px; color: var(--text-tertiary, #8a8a92); flex: 1; min-width: 200px; line-height: 1.6; }
.pl-now { font-family: var(--font-mono, monospace); font-size: 13px; color: var(--accent, #a99bf5);
  font-variant-numeric: tabular-nums; }
.pl-switch { display: flex; gap: 6px; align-items: center; }
.pl-sw { padding: 5px 12px; font-size: 12px; cursor: pointer; font: inherit; font-size: 12px;
  background: transparent; color: var(--text-tertiary, #8a8a92);
  border: 1px solid var(--border, #2a2a31); border-radius: 999px; }
.pl-sw.on { color: var(--bg-primary, #0f0f12); background: var(--accent, #a99bf5);
  border-color: var(--accent, #a99bf5); }

/* ── 벤토 ── 방송마다 칸 크기가 다르다. 그림은 넓게, 신호는 좁게. */
.pl-grid { display: grid; gap: 12px; grid-auto-rows: 156px;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); }
.pl-card { display: flex; flex-direction: column; width: 100%; height: 100%; position: relative;
  overflow: hidden; padding: 12px; cursor: pointer; text-align: left; font: inherit;
  background: var(--bg-secondary, #17171b); border: 1px solid var(--border, #2a2a31);
  border-radius: var(--radius-md, 10px); transition: border-color .2s, transform .12s; }
.pl-card:hover { border-color: var(--accent, #a99bf5); transform: translateY(-1px); }
.pl-card.on { border-color: var(--accent, #a99bf5); }
.pl-card.wide { grid-column: span 2; }
.pl-card.tall { grid-row: span 2; }
.pl-card.big { grid-column: span 2; grid-row: span 2; }
@media (max-width: 560px) { .pl-card.wide, .pl-card.big { grid-column: span 1; } }
.pl-name { display: flex; align-items: center; gap: 6px; font-size: 11px; white-space: nowrap;
  color: var(--text-tertiary, #8a8a92); letter-spacing: .04em; }
.pl-name .pl-per { margin-left: auto; flex: 0 0 auto; font-family: var(--font-mono, monospace); }
.pl-face { flex: 1; min-height: 0; margin: 8px 0; display: flex; flex-direction: column;
  justify-content: center; overflow: hidden; }
.pl-face canvas { width: 100%; height: 100%; display: block;
  border-radius: var(--radius-sm, 6px); background: var(--bg-tertiary, #232329); }
.pl-body { color: var(--text-primary, #e8e8e8); word-break: break-word; font-size: 26px; line-height: 1.2; }
.pl-mono { font-family: var(--font-mono, monospace); white-space: pre; font-size: 12px;
  line-height: 1.45; letter-spacing: 0; }
.pl-sub { margin-top: 6px; font-size: 10px; color: var(--text-tertiary, #8a8a92); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pl-foot { margin-top: auto; }
.pl-meter { height: 2px; background: var(--bg-tertiary, #232329); border-radius: 2px; }
.pl-meter i { display: block; height: 100%; background: var(--accent, #a99bf5); border-radius: 2px;
  transition: width .9s linear; }
.pl-left { margin-top: 5px; font-size: 10px; color: var(--text-tertiary, #8a8a92);
  font-family: var(--font-mono, monospace); }
.pl-card.beating { animation: pl-flash .9s ease-out; }
@keyframes pl-flash {
  0% { box-shadow: inset 0 0 0 999px var(--accent, #a99bf5); opacity: .5; }
  100% { box-shadow: inset 0 0 0 999px transparent; opacity: 1; }
}

/* ── 타임라인 ── 원본이 트위터였으니, 한 줄기로 흐르는 형식을 되돌려 놓는다. */
.pl-feed { display: flex; flex-direction: column; }
.pl-item { display: flex; gap: 12px; padding: 12px 4px; align-items: flex-start;
  border-top: 1px solid var(--border, #2a2a31); }
.pl-item:first-child { border-top: 0; }
.pl-item time { font-family: var(--font-mono, monospace); font-size: 11px; min-width: 84px;
  padding-top: 3px; color: var(--text-tertiary, #8a8a92); flex: 0 0 auto; }
.pl-item .pl-who { font-size: 11px; color: var(--text-tertiary, #8a8a92); min-width: 62px;
  padding-top: 3px; flex: 0 0 auto; }
.pl-item .pl-said { font-size: 15px; color: var(--text-primary, #e8e8e8); white-space: pre-wrap;
  word-break: break-word; }
.pl-item canvas { width: 120px; height: 62px; border-radius: var(--radius-sm, 6px); flex: 0 0 auto;
  background: var(--bg-tertiary, #232329); }

/* ── 상세 ── */
.pl-detail { background: var(--bg-secondary, #17171b); border: 1px solid var(--border, #2a2a31);
  border-radius: var(--radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.pl-dhead { font-size: 13px; color: var(--text-primary, #e8e8e8); }
.pl-lineage { font-size: 11px; color: var(--text-tertiary, #8a8a92); margin-top: 4px; }
.pl-cols { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.pl-col h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--text-tertiary, #8a8a92); font-weight: 600; }
.pl-row { display: flex; gap: 10px; padding: 6px 0; border-top: 1px solid var(--border, #2a2a31);
  font-size: 13px; color: var(--text-primary, #e8e8e8); align-items: baseline; }
.pl-row:first-of-type { border-top: 0; }
.pl-row time { font-family: var(--font-mono, monospace); font-size: 11px; min-width: 78px;
  color: var(--text-tertiary, #8a8a92); flex: 0 0 auto; }
.pl-row span { white-space: pre-wrap; word-break: break-word; }
.pl-seed { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pl-seed input { flex: 1; min-width: 140px; }
.pl-mine { padding: 12px; background: var(--bg-tertiary, #232329); border-radius: var(--radius-sm, 6px);
  font-size: 22px; color: var(--text-primary, #e8e8e8); }
.pl-note { font-size: 11px; color: var(--text-tertiary, #8a8a92); line-height: 1.6; }
`;
    document.head.appendChild(style);
  }

  Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta?.('pulse') ?? {}),
    tabs: [
      {
        id: 'app',
        label: '방송국',
        build: function (container: HTMLElement): void {
          injectStyles();
          Mdd?.linePreset?.('tool_run', { mood: 'idle', msg: '아무 의미 없는 것을, 아주 규칙적으로...' });

          container.innerHTML = `
            <div class="pl-wrap">
              <div class="pl-head">
                <h2>📻 박동</h2>
                <div class="pl-tag">아무 의미 없는 것을, 아주 규칙적으로. 서버도 저장도 없다 — 시계만 있으면 지금 이걸 보는 모두가 같은 것을 본다. 다음에 뭐가 올지는 안 알려준다.</div>
                <div class="pl-switch">
                  <button class="pl-sw on" id="plViewGrid" type="button">벤토</button>
                  <button class="pl-sw" id="plViewFeed" type="button">타임라인</button>
                  <button class="pl-sw" id="plSound" type="button">🔇 소리</button>
                </div>
                <div class="pl-now" id="plNow"></div>
              </div>
              <div class="pl-grid" id="plGrid"></div>
              <div class="pl-feed" id="plFeed" style="display:none"></div>
              <div class="pl-detail" id="plDetail"></div>
            </div>`;

          const nowEl = container.querySelector('#plNow') as HTMLElement;
          const grid = container.querySelector('#plGrid') as HTMLElement;
          const feed = container.querySelector('#plFeed') as HTMLElement;
          const detail = container.querySelector('#plDetail') as HTMLElement;
          const btnGrid = container.querySelector('#plViewGrid') as HTMLButtonElement;
          const btnFeed = container.querySelector('#plViewFeed') as HTMLButtonElement;
          const btnSound = container.querySelector('#plSound') as HTMLButtonElement;
          if (!nowEl || !grid || !feed || !detail) return;

          let ink = inkOf(container);

          /* ── 소리 ─────────────────────────────────────────────
             브라우저는 사람이 한 번 눌러 주기 전엔 소리를 안 낸다(자동재생 정책).
             그래서 스위치가 필요하다 — 끄고 켜는 게 아니라, **허락을 받는** 자리다. */
          let audio: AudioContext | null = null;
          let soundOn = (Toolbox.getPref?.(SOUND_PREF, '') ?? '') === 'on';

          function ensureAudio(): AudioContext | null {
            if (!soundOn) return null;
            if (!audio) {
              const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
              if (!Ctor) return null;
              audio = new Ctor();
            }
            if (audio.state === 'suspended') void audio.resume();
            return audio;
          }
          function paintSoundBtn(): void {
            if (!btnSound) return;
            btnSound.textContent = soundOn ? '🔔 소리' : '🔇 소리';
            btnSound.classList.toggle('on', soundOn);
          }
          if (btnSound) {
            paintSoundBtn();
            btnSound.onclick = () => {
              soundOn = !soundOn;
              Toolbox.setPref?.(SOUND_PREF, soundOn ? 'on' : 'off');
              paintSoundBtn();
              const ac = ensureAudio();
              if (ac) {
                /* 켠 자리에서 한 번 울려 준다 — 안 그러면 켠 게 맞는지 알 길이 없다
                   (다음 정각까지 최대 한 시간이다). */
                const bell = CHANNELS.find((c) => c.id === 'bell');
                bell?.beat(tickOf(bell, Date.now())).sound?.(ac, ac.currentTime + 0.05);
              }
            };
          }

          /* ── 벤토 ───────────────────────────────────────────── */
          type Card = {
            ch: Channel;
            root: HTMLElement;
            face: HTMLElement;
            canvas: HTMLCanvasElement | null;
            meter: HTMLElement;
            left: HTMLElement;
            tick: number;
          };
          const cards: Card[] = [];
          let selected: Channel = CHANNELS[0];

          for (const ch of CHANNELS) {
            const root = document.createElement('button');
            root.type = 'button';
            root.className = `pl-card ${ch.tile ?? 'unit'}`;
            root.innerHTML = `
              <div class="pl-name">${ch.glyph} ${escapeHtml(ch.name)}<span class="pl-per">${periodLabel(ch.period)}</span></div>
              <div class="pl-face"></div>
              <div class="pl-foot">
                <div class="pl-meter"><i style="width:0%"></i></div>
                <div class="pl-left"></div>
              </div>`;
            const face = root.querySelector('.pl-face') as HTMLElement;
            const meter = root.querySelector('.pl-meter i') as HTMLElement;
            const left = root.querySelector('.pl-left') as HTMLElement;
            root.onclick = () => {
              selected = ch;
              renderDetail();
              for (const c of cards) c.root.classList.toggle('on', c.ch === ch);
            };
            grid.appendChild(root);
            cards.push({ ch, root, face, canvas: null, meter, left, tick: Number.NaN });
          }
          cards[0].root.classList.add('on');

          /** 카드 얼굴 = 그림이면 캔버스, 아니면 큰 활자. */
          function drawFace(card: Card, tick: number, beat: Beat): void {
            if (beat.paint) {
              if (!card.canvas) {
                card.face.innerHTML = '';
                const canvas = document.createElement('canvas');
                card.face.appendChild(canvas);
                card.canvas = canvas;
              }
              /* 레이아웃이 아직 안 잡힌 프레임에서 재면 0×0 이 나온다 — 다음 프레임에 그린다. */
              requestAnimationFrame(() => {
                if (card.canvas) paintInto(card.canvas, card.ch, tick, beat, ink);
              });
              return;
            }
            card.canvas = null;
            card.face.innerHTML = `<div class="pl-body${beat.mono ? ' pl-mono' : ''}">${escapeHtml(beat.line)}</div>${
              beat.sub ? `<div class="pl-sub">${escapeHtml(beat.sub)}</div>` : ''
            }`;
          }

          /* ── 타임라인 ────────────────────────────────────────
             모든 방송의 지난 박동을 한 줄기로 섞는다. 지나간 것만 — 앞은 없다. */
          function renderFeed(): void {
            const now = Date.now();
            type Item = { at: number; ch: Channel; tick: number; beat: Beat };
            const items: Item[] = [];
            for (const ch of CHANNELS) {
              const cur = tickOf(ch, now);
              const depth = ch.period >= 21600000 ? 3 : 10;
              for (let i = 0; i < depth; i++) {
                const t = cur - i;
                items.push({ at: tickStart(ch, t), ch, tick: t, beat: ch.beat(t) });
              }
            }
            items.sort((a, b) => b.at - a.at);
            const shown = items.slice(0, 40);

            feed.innerHTML = shown
              .map(
                (it, i) => `
                <div class="pl-item">
                  <time>${stampOf(it.at, true)}</time>
                  <div class="pl-who">${it.ch.glyph} ${escapeHtml(it.ch.name)}</div>
                  ${
                    it.beat.paint
                      ? `<canvas data-i="${i}"></canvas>`
                      : `<div class="pl-said${it.beat.mono ? ' pl-mono' : ''}">${escapeHtml(it.beat.line)}</div>`
                  }
                </div>`
              )
              .join('');

            requestAnimationFrame(() => {
              for (const canvas of Array.from(feed.querySelectorAll('canvas'))) {
                const it = shown[Number((canvas as HTMLCanvasElement).dataset.i)];
                if (it) paintInto(canvas as HTMLCanvasElement, it.ch, it.tick, it.beat, ink);
              }
            });
          }

          /* ── 상세 ──────────────────────────────────────────── */
          function renderDetail(): void {
            const ch = selected;
            const now = Date.now();
            const cur = tickOf(ch, now);

            const past: string[] = [];
            for (let i = 1; i <= 6; i++) {
              const t = cur - i;
              past.push(
                `<div class="pl-row"><time>${stampOf(tickStart(ch, t), ch.period >= 86400000)}</time><span>${escapeHtml(
                  ch.beat(t).line
                )}</span></div>`
              );
            }

            const seed = Toolbox.getPref?.(SEED_PREF, '') ?? '';
            const mine = ch.personal
              ? `<div class="pl-col">
                   <h4>나만의 박동</h4>
                   <div class="pl-seed">
                     <input class="input" id="plSeed" placeholder="이름·별명 아무거나" value="${escapeHtml(seed)}">
                     <button class="btn primary" id="plSeedGo" type="button">받기</button>
                   </div>
                   <div class="pl-mine" id="plMine" style="margin-top:10px; display:none"></div>
                   <div class="pl-note" style="margin-top:8px">원본 봇은 팔로우하면 「너만의 세 글자」를 답장해 줬다. 여기선 이름이 씨앗이라 언제 눌러도 같은 것이 나온다.</div>
                 </div>`
              : '';

            detail.innerHTML = `
              <div>
                <div class="pl-dhead">${ch.glyph} <b>${escapeHtml(ch.name)}</b> — ${escapeHtml(ch.blurb)}</div>
                <div class="pl-lineage">계보 · ${escapeHtml(ch.lineage)}</div>
              </div>
              <div class="pl-cols">
                <div class="pl-col"><h4>지나간 박동</h4>${past.join('')}
                  <div class="pl-note" style="margin-top:8px">저장한 적 없다 — 시각만 넣으면 다시 계산된다. <b>앞으로 올 것은 안 보여준다.</b> 기다리는 게 이 방송이다.</div>
                </div>
                ${mine}
              </div>`;

            if (!ch.personal) return;
            const seedInput = detail.querySelector('#plSeed') as HTMLInputElement | null;
            const seedGo = detail.querySelector('#plSeedGo') as HTMLButtonElement | null;
            const mineBox = detail.querySelector('#plMine') as HTMLElement | null;
            if (!seedInput || !seedGo || !mineBox) return;

            const give = (): void => {
              const value = seedInput.value.trim();
              if (!value) {
                Toolbox.showToast?.('이름을 아무거나 적어 주세요', 'warning');
                return;
              }
              Toolbox.setPref?.(SEED_PREF, value);
              const b = ch.personal?.(value);
              mineBox.style.display = '';
              mineBox.innerHTML = `${escapeHtml(b?.line ?? '')}<div class="pl-sub">${escapeHtml(b?.sub ?? '')}</div>`;
              Mdd?.bounce?.();
            };
            seedGo.onclick = give;
            seedInput.onkeydown = (e: KeyboardEvent) => {
              if (e.key === 'Enter') give();
            };
            if (seed) give();
          }

          /* ── 화면 전환 ─────────────────────────────────────── */
          let view: 'grid' | 'feed' = 'grid';
          function setView(next: 'grid' | 'feed'): void {
            view = next;
            grid.style.display = next === 'grid' ? '' : 'none';
            feed.style.display = next === 'feed' ? '' : 'none';
            btnGrid?.classList.toggle('on', next === 'grid');
            btnFeed?.classList.toggle('on', next === 'feed');
            if (next === 'feed') renderFeed();
            else for (const card of cards) card.tick = Number.NaN; // 돌아오면 다시 그린다
            update();
          }
          if (btnGrid) btnGrid.onclick = () => setView('grid');
          if (btnFeed) btnFeed.onclick = () => setView('feed');

          function update(): void {
            const now = Date.now();
            const d = new Date(now);
            const pad = (n: number): string => String(n).padStart(2, '0');
            nowEl.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} KST`;

            let anyChanged = false;
            for (const card of cards) {
              const tick = tickOf(card.ch, now);
              if (tick !== card.tick) {
                const first = Number.isNaN(card.tick);
                card.tick = tick;
                const beat = card.ch.beat(tick);
                drawFace(card, tick, beat);
                /* 첫 그림까지 번쩍이면 「갈렸다」는 신호가 값을 잃는다 — 진짜 갈릴 때만 친다. */
                if (!first) {
                  anyChanged = true;
                  card.root.classList.remove('beating');
                  void card.root.offsetWidth; // 애니메이션을 다시 태우려면 한 번 재계산시켜야 한다
                  card.root.classList.add('beating');
                  if (card.ch === selected) renderDetail();
                  const ac = ensureAudio();
                  if (ac && beat.sound) beat.sound(ac, ac.currentTime + 0.05);
                }
              }
              const p = tickProgress(card.ch, now);
              card.meter.style.width = `${(p * 100).toFixed(2)}%`;
              card.left.textContent = `다음까지 ${humanLeft(card.ch.period * (1 - p))}`;
            }
            if (anyChanged && view === 'feed') renderFeed();
          }

          update();
          renderDetail();
          const timer = window.setInterval(update, 1000);

          /* 창이 넓어지면 캔버스 픽셀 수가 안 맞는다 — 다시 그려야 뭉개지지 않는다. */
          const onResize = (): void => {
            ink = inkOf(container);
            for (const card of cards) {
              if (card.canvas) paintInto(card.canvas, card.ch, card.tick, card.ch.beat(card.tick), ink);
            }
            if (view === 'feed') renderFeed();
          };
          window.addEventListener('resize', onResize);

          Toolbox.onDispose?.(() => {
            window.clearInterval(timer);
            window.removeEventListener('resize', onResize);
            void audio?.close();
          });
        }
      }
    ]
  });
})();
