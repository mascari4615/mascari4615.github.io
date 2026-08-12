/**
 * 소리 풍경 (TASK-KL-248)
 *
 * 집중할 때 트는 배경음. **내려받는 음원이 0바이트다** — 잡음을 만들어 거르고 몇 개의 진동을
 * 겹치는 것으로 비·파도·모닥불이 된다(`lib/soundscape.ts`). 그래서 같은 소리가 두 번
 * 반복되지 않는다: 녹음이라면 반드시 이음매가 들리는데, 오래 틀어 두는 소리에서 그 이음매가
 * 가장 거슬리는 부분이다.
 *
 * 같은 엔진을 지구본(`widgets/bluemarble/sound.ts`)도 쓴다. 거기서는 **자리**가 크기를 정하고
 * 여기서는 **사람**이 정한다 — 손잡이를 누가 잡느냐만 다르다.
 */
import { LAYERS, PRESETS, Soundscape, type LayerId } from '../../lib/soundscape';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const STORE = 'karmolab_soundscape_v1';

  Toolbox.register({
    id: 'soundscape',
    title: t('widgets.soundscape.title', undefined, '소리 풍경'),
    category: 'tool',
    desc: t(
      'widgets-desc.soundscape.desc',
      undefined,
      '비·파도·모닥불을 섞어 집중용 배경음을 만듭니다. 음원을 내려받지 않고 그 자리에서 소리를 만들어 같은 소리가 반복되지 않습니다'
    ),
    layout: 'wide',
    icon: '<path d="M4 12h2l2-5 3 12 3-16 3 14 2-5h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('soundscape.tab', undefined, '섞기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('soundscape').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    const esc = (v: string): string =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    container.innerHTML = `
      <div class="field-group">
        <div class="tool-sublabel">${esc(t('soundscape.label.presets', undefined, '미리 섞어 둔 것'))}</div>
        <div class="tool-chips" id="ssPresets">
          ${PRESETS.map(
            (p) => `<button type="button" class="tool-chip" data-preset="${p.id}">${esc(t('soundscape.preset.' + p.id))}</button>`
          ).join('')}
        </div>
      </div>

      <div class="field-group">
        <div class="tool-sublabel">${esc(t('soundscape.label.layers', undefined, '겹'))}</div>
        <div id="ssLayers" class="tool-grid-2"></div>
      </div>

      <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
        <button class="btn btn-primary" id="ssPower">${esc(t('soundscape.btn.on', undefined, '틀기'))}</button>
        <button class="btn" id="ssSilence">${esc(t('soundscape.btn.clear', undefined, '전부 0으로'))}</button>
      </div>

      <div class="tool-status" id="ssStatus">${esc(t('soundscape.status.idle', undefined, '겹을 올리고 틀기를 누르세요'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const layersEl = $<HTMLElement>('#ssLayers');
    const powerEl = $<HTMLButtonElement>('#ssPower');
    const status = $<HTMLElement>('#ssStatus');

    const say = (m: string, kind = ''): void => {
      status.textContent = m;
      status.className = 'tool-status' + (kind ? ' ' + kind : '');
    };

    const scape = new Soundscape();

    /** 마지막으로 섞어 둔 것을 기억한다 — 매번 처음부터 맞추게 하면 아무도 두 번 안 쓴다. */
    const load = (): Partial<Record<LayerId, number>> => {
      try {
        return JSON.parse(localStorage.getItem(STORE) || '{}') as Partial<Record<LayerId, number>>;
      } catch {
        return {};
      }
    };
    const save = (): void => {
      try {
        const mix: Record<string, number> = {};
        for (const l of LAYERS) mix[l.id] = scape.get(l.id);
        localStorage.setItem(STORE, JSON.stringify(mix));
      } catch {
        /* 자리가 없으면 그냥 안 기억한다 */
      }
    };

    const sliders = new Map<LayerId, HTMLInputElement>();
    layersEl.innerHTML = LAYERS.map(
      (l) => `
      <div>
        <div class="tool-sublabel">${esc(t('soundscape.layer.' + l.id))} <span class="range-value" id="ssV-${l.id}">0</span></div>
        <input type="range" id="ss-${l.id}" min="0" max="100" value="0"
               aria-label="${esc(t('soundscape.layer.' + l.id))}">
      </div>`
    ).join('');

    const paint = (id: LayerId): void => {
      const v = Math.round(scape.get(id) * 100);
      const el = sliders.get(id);
      if (el && Number(el.value) !== v) el.value = String(v);
      const label = container.querySelector('#ssV-' + id);
      if (label) label.textContent = String(v);
    };

    for (const l of LAYERS) {
      const el = $<HTMLInputElement>('#ss-' + l.id);
      sliders.set(l.id, el);
      el.addEventListener('input', () => {
        scape.set(l.id, Number(el.value) / 100);
        paint(l.id);
        save();
        /* 슬라이더를 올렸는데 아무 소리도 안 나면 고장으로 보인다 — 그 손짓 안에서 켠다. */
        if (!scape.running && Number(el.value) > 0) power(true);
        else if (scape.running) report();
      });
    }

    const saved = load();
    for (const [k, v] of Object.entries(saved)) {
      scape.set(k as LayerId, Number(v) || 0);
      paint(k as LayerId);
    }

    function report(): void {
      const on = scape.active();
      if (!scape.running) {
        say(t('soundscape.status.idle', undefined, '겹을 올리고 틀기를 누르세요'));
        return;
      }
      say(
        on.length
          ? t('soundscape.status.playing', { n: on.length }, `${on.length}겹이 울리고 있습니다`)
          : t('soundscape.status.silent', undefined, '켜져 있지만 모든 겹이 0입니다'),
        on.length ? 'ok' : 'warn'
      );
    }

    function power(on: boolean): void {
      if (on) {
        scape.start(); // 이 클릭 안에서 — 브라우저가 제스처 밖의 소리를 막는다
        powerEl.textContent = t('soundscape.btn.off', undefined, '멈추기');
      } else {
        scape.stop();
        powerEl.textContent = t('soundscape.btn.on', undefined, '틀기');
      }
      report();
    }

    powerEl.onclick = (): void => power(!scape.running);

    $('#ssSilence').onclick = (): void => {
      for (const l of LAYERS) {
        scape.set(l.id, 0);
        paint(l.id);
      }
      save();
      report();
    };

    container.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
      btn.onclick = (): void => {
        const p = PRESETS.find((x) => x.id === btn.dataset.preset);
        if (!p) return;
        for (const l of LAYERS) scape.set(l.id, 0);
        scape.apply(p.mix);
        for (const l of LAYERS) paint(l.id);
        save();
        if (!scape.running) power(true);
        else report();
      };
    });

    Toolbox.onDispose?.(() => scape.stop());
    report();
  }
})();
