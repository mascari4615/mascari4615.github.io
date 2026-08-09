/**
 * 박동(Pulse) — 방송국 화면.
 *
 * 화면 구조는 **한 번에 하나**다(사용자, 2026-08-09: "하나하나에 집중할 수 있게").
 * 벤토 격자에 열두 칸을 늘어놓았다가 걷어냈다 — 열두 개가 동시에 뛰면 어느 것도 안 보인다.
 *
 *   위    방송 고르는 칩 한 줄
 *   가운데 **무대** — 지금 그 방송의 판 하나. 이 판이 곧 공유될 그림이다(같은 붓, `card.ts`)
 *   아래   지나간 박동 — 작은 판들. 누르면 무대에 올라온다
 *
 * 무대와 공유 그림이 같은 함수로 그려지는 것이 핵심이다. 두 벌로 나뉘면 언젠가 한쪽만
 * 고쳐지고, 그날부터 「보던 것과 다른 게 나간다」.
 *
 * **다음 박동은 절대 안 보여준다.** 계산은 되지만 보여 주면 기다림이 사라진다.
 */
import type { Beat, Channel, Ink } from './core';
import { CHANNELS } from './channels';
import { paintCard, shareCard } from './card';
import { humanLeft, rngFor, stampOf, tickOf, tickProgress, tickStart } from './core';

(function (): void {
  const SEED_PREF = 'pulse.seed';
  const SOUND_PREF = 'pulse.sound';
  const CHANNEL_PREF = 'pulse.channel';

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

  function inkOf(el: HTMLElement): Ink {
    const s = getComputedStyle(el);
    const v = (name: string, fallback: string): string => (s.getPropertyValue(name) || '').trim() || fallback;
    return {
      bg: v('--bg-secondary', '#17171b'),
      fg: v('--text-primary', '#e8e8e8'),
      dim: v('--text-tertiary', '#8a8a92'),
      accent: v('--accent', '#a99bf5')
    };
  }

  function injectStyles(): void {
    if (document.getElementById('pl-styles')) return;
    const style = document.createElement('style');
    style.id = 'pl-styles';
    style.textContent = `
.pl-wrap { padding: 18px; display: flex; flex-direction: column; gap: 14px; max-width: 940px; margin: 0 auto; }
.pl-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.pl-head h2 { margin: 0; font-size: 19px; color: var(--text-primary, #e8e8e8); letter-spacing: .04em; }
.pl-tag { font-size: 12px; color: var(--text-tertiary, #8a8a92); flex: 1; min-width: 200px; line-height: 1.6; }
.pl-now { font-family: var(--font-mono, monospace); font-size: 13px; color: var(--accent, #a99bf5);
  font-variant-numeric: tabular-nums; }

/* 방송 고르는 줄 — 좁으면 가로로 민다(줄바꿈해서 세 줄이 되면 무대가 밀려난다) */
.pl-chips { display: flex; flex-wrap: nowrap; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
.pl-chip { flex: 0 0 auto; display: flex; align-items: center; gap: 5px; padding: 6px 12px;
  font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap;
  background: transparent; color: var(--text-tertiary, #8a8a92);
  border: 1px solid var(--border, #2a2a31); border-radius: 999px; }
.pl-chip:hover { color: var(--text-primary, #e8e8e8); border-color: var(--accent, #a99bf5); }
.pl-chip.on { color: var(--bg-primary, #0f0f12); background: var(--accent, #a99bf5);
  border-color: var(--accent, #a99bf5); }
.pl-chip b { font-weight: 600; }
.pl-chip .pl-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .5; }

/* 무대 — 이 판이 곧 공유될 그림이다 */
.pl-stage { position: relative; width: 100%; aspect-ratio: 1200 / 630;
  border: 1px solid var(--border, #2a2a31); border-radius: var(--radius-md, 10px); overflow: hidden; }
.pl-stage canvas { width: 100%; height: 100%; display: block; }
.pl-stage.beating { animation: pl-flash 1s ease-out; }
@keyframes pl-flash {
  0% { box-shadow: inset 0 0 0 999px var(--accent, #a99bf5); opacity: .45; }
  100% { box-shadow: inset 0 0 0 999px transparent; opacity: 1; }
}
.pl-under { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pl-meter { flex: 1; min-width: 120px; height: 2px; background: var(--bg-tertiary, #232329); border-radius: 2px; }
.pl-meter i { display: block; height: 100%; background: var(--accent, #a99bf5); border-radius: 2px;
  transition: width .9s linear; }
.pl-left { font-size: 11px; color: var(--text-tertiary, #8a8a92); font-family: var(--font-mono, monospace); }
.pl-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.pl-blurb { font-size: 12px; color: var(--text-tertiary, #8a8a92); line-height: 1.7; }
.pl-blurb b { color: var(--text-primary, #e8e8e8); font-weight: 600; }

/* 지나간 박동 — 작은 판들. 누르면 무대에 올라온다 */
.pl-past h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--text-tertiary, #8a8a92); font-weight: 600; }
.pl-strip { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); }
.pl-thumb { padding: 0; border: 1px solid var(--border, #2a2a31); border-radius: var(--radius-sm, 6px);
  overflow: hidden; cursor: pointer; background: transparent; font: inherit; position: relative; }
.pl-thumb:hover { border-color: var(--accent, #a99bf5); }
.pl-thumb.on { border-color: var(--accent, #a99bf5); }
.pl-thumb canvas { width: 100%; aspect-ratio: 1200 / 630; display: block; }
.pl-thumb time { position: absolute; left: 6px; bottom: 4px; font-size: 9px;
  color: var(--text-tertiary, #8a8a92); font-family: var(--font-mono, monospace); }
.pl-back { font-size: 11px; color: var(--accent, #a99bf5); }
.pl-seed { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pl-seed input { flex: 1; min-width: 120px; max-width: 220px; }
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
                <div class="pl-tag">뜻 없는 글자가 규칙적으로 흐른다. 가끔 진짜 낱말이 나오는데 — 그때 그림으로 공유하면 된다. 다음에 뭐가 올지는 안 알려준다.</div>
                <button class="pl-chip" id="plSound" type="button">🔇 소리</button>
                <div class="pl-now" id="plNow"></div>
              </div>
              <div class="pl-chips" id="plChips"></div>
              <div class="pl-stage" id="plStage"><canvas></canvas></div>
              <div class="pl-under">
                <div class="pl-meter"><i style="width:0%"></i></div>
                <div class="pl-left" id="plLeft"></div>
                <div class="pl-acts">
                  <button class="btn primary" id="plShare" type="button">그림으로 공유</button>
                </div>
              </div>
              <div class="pl-blurb" id="plBlurb"></div>
              <div class="pl-seed" id="plSeedRow" style="display:none">
                <input class="input" id="plSeed" placeholder="이름·별명 아무거나">
                <button class="btn" id="plSeedGo" type="button">나만의 것 받기</button>
              </div>
              <div class="pl-past">
                <h4>지나간 박동 <span class="pl-back" id="plBack"></span></h4>
                <div class="pl-strip" id="plStrip"></div>
              </div>
            </div>`;

          const nowEl = container.querySelector('#plNow') as HTMLElement;
          const chips = container.querySelector('#plChips') as HTMLElement;
          const stage = container.querySelector('#plStage') as HTMLElement;
          const stageCanvas = stage?.querySelector('canvas') as HTMLCanvasElement;
          const meter = container.querySelector('.pl-meter i') as HTMLElement;
          const leftEl = container.querySelector('#plLeft') as HTMLElement;
          const blurbEl = container.querySelector('#plBlurb') as HTMLElement;
          const strip = container.querySelector('#plStrip') as HTMLElement;
          const backEl = container.querySelector('#plBack') as HTMLElement;
          const seedRow = container.querySelector('#plSeedRow') as HTMLElement;
          const seedInput = container.querySelector('#plSeed') as HTMLInputElement;
          const shareBtn = container.querySelector('#plShare') as HTMLButtonElement;
          const soundBtn = container.querySelector('#plSound') as HTMLButtonElement;
          if (!nowEl || !chips || !stage || !stageCanvas || !meter || !strip) return;

          let ink = inkOf(container);
          const saved = Toolbox.getPref?.(CHANNEL_PREF, '') ?? '';
          let channel: Channel = CHANNELS.find((c) => c.id === saved) ?? CHANNELS[0];
          /** 무대에 올라와 있는 박동. null = 지금 것(계속 따라간다). */
          let pinned: number | null = null;
          /** 「나만의 것」을 무대에 올린 상태 — 시각과 무관하므로 따로 둔다. */
          let mine: Beat | null = null;
          let lastTick = Number.NaN;

          /* ── 소리 ───────────────────────────────────────────── */
          let audio: AudioContext | null = null;
          let soundOn = (Toolbox.getPref?.(SOUND_PREF, '') ?? '') === 'on';
          function ensureAudio(): AudioContext | null {
            if (!soundOn) return null;
            if (!audio) {
              const Ctor =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
              if (!Ctor) return null;
              audio = new Ctor();
            }
            if (audio.state === 'suspended') void audio.resume();
            return audio;
          }
          function paintSoundBtn(): void {
            soundBtn.textContent = soundOn ? '🔔 소리' : '🔇 소리';
            soundBtn.classList.toggle('on', soundOn);
          }
          paintSoundBtn();
          soundBtn.onclick = () => {
            soundOn = !soundOn;
            Toolbox.setPref?.(SOUND_PREF, soundOn ? 'on' : 'off');
            paintSoundBtn();
            const ac = ensureAudio();
            if (!ac) return;
            /* 켠 자리에서 한 번 울려 준다 — 안 그러면 다음 정각까지 켠 게 맞는지 알 길이 없다. */
            const bell = CHANNELS.find((c) => c.id === 'bell');
            bell?.beat(tickOf(bell, Date.now())).sound?.(ac, ac.currentTime + 0.05);
          };

          /* ── 한 판 그리기 — 무대·작은 판·공유 그림이 전부 이 함수를 쓴다 ── */
          function renderBeat(
            c: CanvasRenderingContext2D,
            w: number,
            h: number,
            ch: Channel,
            tick: number,
            beat: Beat
          ): void {
            if (beat.paint) {
              beat.paint(c, w, h, rngFor(`${ch.id}/art`, tick), ink);
              return;
            }
            paintCard(
              c,
              w,
              h,
              {
                text: beat.line,
                channel: `${ch.name} · ${periodLabel(ch.period)}`,
                stamp: mine ? '나만의 것' : stampOf(tickStart(ch, tick), ch.period >= 86400000),
                mark: beat.mark
              },
              ink
            );
          }

          function fit(canvas: HTMLCanvasElement): { c: CanvasRenderingContext2D; w: number; h: number } | null {
            const rect = canvas.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width));
            const h = Math.max(1, Math.round(rect.height));
            const dpr = Math.min(3, window.devicePixelRatio || 1);
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            const c = canvas.getContext('2d');
            if (!c) return null;
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            return { c, w, h };
          }

          function currentTick(): number {
            return pinned ?? tickOf(channel, Date.now());
          }
          function currentBeat(): Beat {
            return mine ?? channel.beat(currentTick());
          }

          function drawStage(): void {
            const box = fit(stageCanvas);
            if (!box) return;
            const tick = currentTick();
            renderBeat(box.c, box.w, box.h, channel, tick, currentBeat());
            /* 무대가 **어느 판을 그렸는지** 남긴다. 캔버스는 안을 들여다볼 수가 없어서,
               이게 없으면 「누른 판이 올라왔나」를 사람도 검사도 확인할 방법이 없다.
               (무대와 작은 판은 해상도가 달라 화소 지문끼리도 못 맞춘다.) */
            stage.dataset.tick = mine ? 'mine' : String(tick);
            stage.dataset.channel = channel.id;
          }

          /* ── 방송 고르는 줄 ─────────────────────────────────── */
          function renderChips(): void {
            chips.innerHTML = CHANNELS.map(
              (ch) =>
                `<button class="pl-chip${ch === channel ? ' on' : ''}" type="button" data-id="${ch.id}">
                   <b>${escapeHtml(ch.glyph)}</b> ${escapeHtml(ch.name)}
                 </button>`
            ).join('');
            for (const el of Array.from(chips.querySelectorAll('.pl-chip'))) {
              (el as HTMLElement).onclick = () => {
                const next = CHANNELS.find((c) => c.id === (el as HTMLElement).dataset.id);
                if (!next) return;
                channel = next;
                pinned = null;
                mine = null;
                lastTick = Number.NaN;
                Toolbox.setPref?.(CHANNEL_PREF, next.id);
                renderChips();
                renderMeta();
                renderStrip();
                update();
              };
            }
          }

          function renderMeta(): void {
            blurbEl.innerHTML = `<b>${escapeHtml(channel.name)}</b> — ${escapeHtml(channel.blurb)}<br>계보 · ${escapeHtml(channel.lineage)}`;
            seedRow.style.display = channel.personal ? '' : 'none';
            const seed = Toolbox.getPref?.(SEED_PREF, '') ?? '';
            if (seed && !seedInput.value) seedInput.value = seed;
            backEl.textContent = pinned !== null || mine ? '← 지금으로 돌아가기' : '';
          }
          backEl.onclick = () => {
            pinned = null;
            mine = null;
            lastTick = Number.NaN;
            renderMeta();
            renderStrip();
            update();
          };

          /* ── 지나간 박동 ────────────────────────────────────── */
          function renderStrip(): void {
            const cur = tickOf(channel, Date.now());
            const ticks = Array.from({ length: 8 }, (_, i) => cur - 1 - i);
            strip.innerHTML = ticks
              .map(
                (t) =>
                  `<button class="pl-thumb${pinned === t ? ' on' : ''}" type="button" data-t="${t}">
                     <canvas></canvas>
                     <time>${stampOf(tickStart(channel, t), channel.period >= 86400000)}</time>
                   </button>`
              )
              .join('');
            const buttons = Array.from(strip.querySelectorAll('.pl-thumb')) as HTMLElement[];
            buttons.forEach((el, i) => {
              el.onclick = () => {
                pinned = ticks[i];
                mine = null;
                renderMeta();
                renderStrip();
                drawStage();
                update(); // 안내 줄을 **그 자리에서** 바꾼다 — 안 그러면 다음 초까지 옛말이 남는다
              };
            });
            requestAnimationFrame(() => {
              buttons.forEach((el, i) => {
                const canvas = el.querySelector('canvas') as HTMLCanvasElement;
                const box = fit(canvas);
                if (box) renderBeat(box.c, box.w, box.h, channel, ticks[i], channel.beat(ticks[i]));
              });
            });
          }

          /* ── 공유 ───────────────────────────────────────────── */
          shareBtn.onclick = async () => {
            const tick = currentTick();
            const beat = currentBeat();
            shareBtn.disabled = true;
            try {
              const said = await shareCard((c, w, h) => renderBeat(c, w, h, channel, tick, beat), {
                text: beat.line,
                channel: channel.name
              });
              if (said) Toolbox.showToast?.(said);
              Toolbox.trackUse?.('share');
            } finally {
              shareBtn.disabled = false;
            }
          };

          /* ── 나만의 것 ──────────────────────────────────────── */
          const seedGo = container.querySelector('#plSeedGo') as HTMLButtonElement;
          const give = (): void => {
            const value = seedInput.value.trim();
            if (!value) {
              Toolbox.showToast?.('이름을 아무거나 적어 주세요', 'warning');
              return;
            }
            Toolbox.setPref?.(SEED_PREF, value);
            mine = channel.personal?.(value) ?? null;
            pinned = null;
            renderMeta();
            drawStage();
            update();
            Mdd?.bounce?.();
          };
          seedGo.onclick = give;
          seedInput.onkeydown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') give();
          };

          /* ── 시계 ───────────────────────────────────────────── */
          function update(): void {
            const now = Date.now();
            const d = new Date(now);
            const pad = (n: number): string => String(n).padStart(2, '0');
            nowEl.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} KST`;

            const tick = tickOf(channel, now);
            if (tick !== lastTick) {
              const first = Number.isNaN(lastTick);
              lastTick = tick;
              if (pinned === null && !mine) drawStage();
              if (!first) {
                stage.classList.remove('beating');
                void stage.offsetWidth; // 애니메이션을 다시 태우려면 한 번 재계산시켜야 한다
                stage.classList.add('beating');
                renderStrip();
                const ac = ensureAudio();
                const beat = channel.beat(tick);
                if (ac && beat.sound) beat.sound(ac, ac.currentTime + 0.05);
              }
            }

            /* 소리는 **지금 보고 있지 않은 방송**에서도 울려야 한다 — 종은 정각에 울리는 것이 전부다.
               처음 본 박동 번호는 「방금 갈렸다」가 아니라 「원래 그거였다」이므로 울리지 않는다. */
            for (const ch of CHANNELS) {
              const t = tickOf(ch, now);
              const beat = ch.beat(t);
              if (!beat.sound) continue;
              const last = rung.get(ch.id);
              rung.set(ch.id, t);
              if (last === undefined || last === t) continue;
              const ac = ensureAudio();
              if (ac) beat.sound(ac, ac.currentTime + 0.05);
            }

            const p = tickProgress(channel, now);
            meter.style.width = `${(p * 100).toFixed(2)}%`;
            leftEl.textContent =
              pinned !== null || mine
                ? '지나간 판을 보고 있어요'
                : `다음까지 ${humanLeft(channel.period * (1 - p))}`;
          }
          /** 방송마다 마지막으로 본 박동 번호 — 같은 종을 두 번 울리지 않으려고 둔다. */
          const rung = new Map<string, number>();

          renderChips();
          renderMeta();
          renderStrip();
          update();
          requestAnimationFrame(drawStage);

          const timer = window.setInterval(update, 1000);
          const onResize = (): void => {
            ink = inkOf(container);
            drawStage();
            renderStrip();
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
