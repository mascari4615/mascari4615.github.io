/**
 * 박동(Pulse) — 방송국 화면.
 *
 * 켜 두는 물건이다. 아무것도 안 눌러도 방송들이 저 혼자 뛴다.
 * 갈리는 순간에는 카드가 한 번 번쩍인다 — 그 순간을 놓치지 않으려고 보게 되는 것이 전부다.
 *
 * 모든 박동은 시각의 순수 함수라(`core.ts`) 되감기와 미리보기가 공짜다.
 * 화면은 그 사실을 **보여주는 데**만 쓴다 — 지난 것 6개, 앞으로 올 것 3개를 나란히 둔다.
 */
import type { Beat, Channel } from './channels';
import { CHANNELS } from './channels';
import { humanLeft, stampOf, tickOf, tickProgress, tickStart } from './core';

(function (): void {
  const SEED_PREF = 'pulse.seed';

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    );
  }

  /** 「10분」 처럼 주기를 사람 말로. */
  function periodLabel(ms: number): string {
    if (ms < 3600000) return `${ms / 60000}분`;
    if (ms < 86400000) return `${ms / 3600000}시간`;
    return `${ms / 86400000}일`;
  }

  function beatHtml(beat: Beat, size: 'big' | 'small'): string {
    const cls = `pl-body pl-${size}${beat.mono ? ' pl-mono' : ''}`;
    const sub = beat.sub ? `<div class="pl-sub">${escapeHtml(beat.sub)}</div>` : '';
    return `<div class="${cls}">${escapeHtml(beat.text)}</div>${sub}`;
  }

  function injectStyles(): void {
    if (document.getElementById('pl-styles')) return;
    const style = document.createElement('style');
    style.id = 'pl-styles';
    style.textContent = `
.pl-wrap { padding: 18px; display: flex; flex-direction: column; gap: 16px; }
.pl-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.pl-head h2 { margin: 0; font-size: 20px; color: var(--text-primary, #e8e8e8); letter-spacing: .04em; }
.pl-tag { font-size: 12px; color: var(--text-tertiary, #8a8a92); flex: 1; min-width: 200px; }
.pl-now { font-family: var(--font-mono, monospace); font-size: 13px; color: var(--accent, #a99bf5);
  font-variant-numeric: tabular-nums; }
.pl-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
/* display 를 못 박아야 한다 — 이건 <button> 이고, 셸의 단추 스타일이 flex row 를 걸어 둔다.
   그대로 두면 이름·몸통·눈금이 **가로로** 늘어서서 이름이 세로로 쪼개진다(그렇게 됐었다). */
.pl-card { display: block; width: 100%; position: relative; overflow: hidden; padding: 14px;
  cursor: pointer; text-align: left; font: inherit;
  background: var(--bg-secondary, #17171b); border: 1px solid var(--border, #2a2a31);
  border-radius: var(--radius-md, 10px); transition: border-color .2s, transform .12s; }
.pl-card:hover { border-color: var(--accent, #a99bf5); transform: translateY(-1px); }
.pl-card.on { border-color: var(--accent, #a99bf5); }
.pl-name { display: flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap;
  color: var(--text-tertiary, #8a8a92); margin-bottom: 10px; }
.pl-name .pl-per { margin-left: auto; flex: 0 0 auto; font-family: var(--font-mono, monospace); }
.pl-body { color: var(--text-primary, #e8e8e8); word-break: break-word; }
.pl-big { font-size: 26px; line-height: 1.25; min-height: 34px; }
.pl-small { font-size: 15px; }
.pl-mono { font-family: var(--font-mono, monospace); white-space: pre; font-size: 12px;
  line-height: 1.35; letter-spacing: 0; overflow-x: auto; }
.pl-big.pl-mono { font-size: 13px; }
.pl-sub { margin-top: 6px; font-size: 11px; color: var(--text-tertiary, #8a8a92); line-height: 1.5; }
.pl-meter { margin-top: 12px; height: 2px; background: var(--bg-tertiary, #232329); border-radius: 2px; }
.pl-meter i { display: block; height: 100%; background: var(--accent, #a99bf5); border-radius: 2px;
  transition: width .9s linear; }
.pl-left { margin-top: 5px; font-size: 10px; color: var(--text-tertiary, #8a8a92);
  font-family: var(--font-mono, monospace); }
.pl-card.beating { animation: pl-flash .9s ease-out; }
@keyframes pl-flash {
  0% { box-shadow: inset 0 0 0 999px var(--accent, #a99bf5); opacity: .55; }
  100% { box-shadow: inset 0 0 0 999px transparent; opacity: 1; }
}
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
  color: var(--text-tertiary, #8a8a92); }
.pl-row span { white-space: pre-wrap; word-break: break-word; }
.pl-row.soon span { color: var(--text-tertiary, #8a8a92); }
.pl-seed { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pl-seed input { flex: 1; min-width: 140px; }
.pl-mine { padding: 12px; background: var(--bg-tertiary, #232329);
  border-radius: var(--radius-sm, 6px); }
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
                <div class="pl-tag">아무 의미 없는 것을, 아주 규칙적으로. 서버도 저장도 없다 — 시계만 있으면 지금 이걸 보는 모두가 같은 것을 본다.</div>
                <div class="pl-now" id="plNow"></div>
              </div>
              <div class="pl-grid" id="plGrid"></div>
              <div class="pl-detail" id="plDetail"></div>
            </div>`;

          const nowEl = container.querySelector('#plNow') as HTMLElement;
          const grid = container.querySelector('#plGrid') as HTMLElement;
          const detail = container.querySelector('#plDetail') as HTMLElement;
          if (!nowEl || !grid || !detail) return;

          /** 카드 한 장이 기억하는 것 — 마지막으로 그린 박동 번호(갈리는 순간을 잡으려고). */
          type Card = { ch: Channel; root: HTMLElement; body: HTMLElement; meter: HTMLElement; left: HTMLElement; tick: number };
          const cards: Card[] = [];

          let selected: Channel = CHANNELS[0];

          for (const ch of CHANNELS) {
            const root = document.createElement('button');
            root.type = 'button';
            root.className = 'pl-card';
            root.innerHTML = `
              <div class="pl-name">${ch.glyph} ${escapeHtml(ch.name)}<span class="pl-per">${periodLabel(ch.period)}</span></div>
              <div class="pl-slot"></div>
              <div class="pl-meter"><i style="width:0%"></i></div>
              <div class="pl-left"></div>`;
            const body = root.querySelector('.pl-slot') as HTMLElement;
            const meter = root.querySelector('.pl-meter i') as HTMLElement;
            const left = root.querySelector('.pl-left') as HTMLElement;
            root.onclick = () => {
              selected = ch;
              renderDetail();
              for (const c of cards) c.root.classList.toggle('on', c.ch === ch);
            };
            grid.appendChild(root);
            cards.push({ ch, root, body, meter, left, tick: Number.NaN });
          }
          cards[0].root.classList.add('on');

          /* ── 상세 — 되감기와 미리보기 ──────────────────────────
             봇으로는 불가능했던 것이 여기 둘 다 있다. 지난 것은 저장한 적이 없고,
             앞으로 올 것은 아직 일어나지 않았다. 둘 다 그냥 계산이다. */
          function renderDetail(): void {
            const ch = selected;
            const now = Date.now();
            const cur = tickOf(ch, now);

            const past = [];
            for (let i = 1; i <= 6; i++) {
              const t = cur - i;
              past.push(
                `<div class="pl-row"><time>${stampOf(tickStart(ch, t), ch.period >= 86400000)}</time><span>${escapeHtml(
                  ch.beat(t).text
                )}</span></div>`
              );
            }
            const soon = [];
            for (let i = 1; i <= 3; i++) {
              const t = cur + i;
              soon.push(
                `<div class="pl-row soon"><time>${stampOf(tickStart(ch, t), ch.period >= 86400000)}</time><span>${escapeHtml(
                  ch.beat(t).text
                )}</span></div>`
              );
            }

            const seed = Toolbox.getPref?.(SEED_PREF, '') ?? '';
            const mine = ch.personal
              ? `<div class="pl-col">
                   <h4>나만의 박동</h4>
                   <div class="pl-seed">
                     <input class="input" id="plSeed" placeholder="이름·별명 아무거나" value="${escapeHtml(seed)}">
                     <button class="btn primary" id="plSeedGo">받기</button>
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
                <div class="pl-col"><h4>지나간 박동</h4>${past.join('')}</div>
                <div class="pl-col"><h4>앞으로 올 박동</h4>${soon.join('')}
                  <div class="pl-note" style="margin-top:8px">이미 정해져 있다. 저장한 적도, 받아온 적도 없다.</div>
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
              mineBox.style.display = '';
              mineBox.innerHTML = beatHtml(ch.personal?.(value) ?? { text: '' }, 'small');
              Mdd?.bounce?.();
            };
            seedGo.onclick = give;
            seedInput.onkeydown = (e: KeyboardEvent) => {
              if (e.key === 'Enter') give();
            };
            if (seed) give();
          }

          function update(): void {
            const now = Date.now();
            const d = new Date(now);
            const pad = (n: number): string => String(n).padStart(2, '0');
            nowEl.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} KST`;

            for (const card of cards) {
              const tick = tickOf(card.ch, now);
              if (tick !== card.tick) {
                const first = Number.isNaN(card.tick);
                card.tick = tick;
                card.body.innerHTML = beatHtml(card.ch.beat(tick), 'big');
                /* 첫 그림까지 번쩍이면 「갈렸다」는 신호가 값을 잃는다 — 진짜 갈릴 때만 친다. */
                if (!first) {
                  card.root.classList.remove('beating');
                  void card.root.offsetWidth; // 애니메이션을 다시 태우려면 한 번 재계산시켜야 한다
                  card.root.classList.add('beating');
                  if (card.ch === selected) renderDetail();
                }
              }
              const p = tickProgress(card.ch, now);
              card.meter.style.width = `${(p * 100).toFixed(2)}%`;
              card.left.textContent = `다음까지 ${humanLeft(card.ch.period * (1 - p))}`;
            }
          }

          update();
          renderDetail();
          const timer = window.setInterval(update, 1000);
          Toolbox.onDispose?.(() => window.clearInterval(timer));
        }
      }
    ]
  });
})();
