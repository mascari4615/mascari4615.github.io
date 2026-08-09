import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'moon',
    title: t('widgets.moon.title', undefined, "달 위상"),
    category: 'tool',
    desc: t('widgets-desc.moon.desc', undefined, "오늘의 달 위상을 확인합니다"),
    layout: 'form',
    icon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('moon.t06', undefined, "문페이즈"),
        build: function (container: HTMLElement): void {
          void loadNamespace('moon').then(function () {

          Mdd.linePreset('achievement', { msg: t('moon.t07') });
          container.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:380px; gap:16px; background:#020205; overflow:hidden; position:relative; border-radius:var(--radius-lg);">
                        <div style="font-size:14px; color:#cfccc3; letter-spacing:4px; z-index:2; text-shadow:0 0 4px #000;">THE MOON PHASE</div>
                        <div id="moonVisual" style="font-size:140px; line-height:1; z-index:2; filter:drop-shadow(0 0 20px rgba(255,255,200,0.15)); user-select:none; cursor:default;">🌕</div>
                        <div id="moonDesc" style="font-size:14px; color:#9a968d; z-index:2; font-family:monospace;">${esc(t('moon.label.desc'))}</div>
                        <div style="font-size:var(--font-size-xs); color:#8a867e; text-align:center; max-width:80%; margin-top:10px; line-height:1.5; z-index:2;">
                            <span style="color:#aaa; font-weight:bold;">TMI 🌕</span><br>
                            ${esc(t('moon.t01'))}<br>
                            ${esc(t('moon.t02'))}<br>
                            ${esc(t('moon.t03'))}
                        </div>
                    </div>
                `;
          const visualEl = container.querySelector('#moonVisual') as HTMLElement | null;
          const descEl = container.querySelector('#moonDesc') as HTMLElement | null;
          if (!visualEl || !descEl) return;

          const visual = visualEl;
          const desc = descEl;

          function getMoonPhase(): number {
            const now = new Date();
            const lp = 2551443;
            const new_moon = new Date(1970, 0, 7, 20, 35, 0).getTime() / 1000;
            return ((now.getTime() / 1000 - new_moon) % lp) / lp;
          }

          let animId: number | undefined;
          function update(): void {
            const phases = [
              t('moon.t08'),
              t('moon.t09'),
              t('moon.t10'),
              t('moon.t11'),
              t('moon.t12'),
              t('moon.t13'),
              t('moon.t14'),
              t('moon.t15')
            ];

            const p = getMoonPhase();
            const phaseIndex = Math.floor(p * 8 + 0.5) % 8;

            visual.textContent = phases[phaseIndex].split(' ')[0];
            desc.textContent = phases[phaseIndex].split(' ').slice(1).join(' ') + ` (${(p * 100).toFixed(6)}%)`;

            animId = requestAnimationFrame(update);
          }

          const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) update();
            else if (animId !== undefined) cancelAnimationFrame(animId);
          });
          observer.observe(container);
                  });
        }
      }
    ]
  });
})();
