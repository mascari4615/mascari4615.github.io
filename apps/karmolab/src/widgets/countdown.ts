import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'countdown',
    title: t('widgets.countdown.title', undefined, "카운트다운"),
    category: 'tool',
    desc: t('widgets-desc.countdown.desc', undefined, "카운트다운 타이머를 설정합니다"),
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('countdown.t10', undefined, "카운트다운"),
        build: function (container: HTMLElement): void {
          void loadNamespace('countdown').then(function () {

          Mdd.linePreset('tool_run', { msg: t('countdown.t12') });
          container.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; gap:20px; text-align:center; padding-top:40px;">
                        <div style="font-size:14px; color:var(--text-secondary);">${esc(t('countdown.t01'))}</div>
                        <div id="countdownMs" style="font-size:54px; font-variant-numeric: tabular-nums; font-family:monospace; font-weight:900; color:var(--accent); text-shadow:0 0 10px rgba(100,100,250,0.4); letter-spacing:-2px;">0000000000</div>
                        <div style="display:flex; gap:12px; margin-top:20px; align-items:center;">
                            <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">${esc(t('countdown.t02'))}</span>
                            <input type="datetime-local" id="countdownTarget" class="input" style="width:200px; padding:6px; font-size:var(--font-size-sm);">
                        </div>
                        <div style="margin-top:15px; font-size:var(--font-size-xs); color:var(--text-tertiary); display:grid; grid-template-columns:1fr; gap:6px; text-align:left; background:var(--bg-secondary); border:1px solid var(--border); padding:15px; border-radius:8px; width:100%; max-width:350px;">
                            <div style="font-weight:bold; margin-bottom:4px; color:var(--text-secondary); text-align:center;">${esc(t('countdown.t03'))}</div>
                            <div style="display:flex; justify-content:space-between;"><span>${esc(t('countdown.t04'))}</span> <span>60,000 ms</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>${esc(t('countdown.t05'))}</span> <span>3,600,000 ms</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>${esc(t('countdown.t06'))}</span> <span>86,400,000 ms</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>${esc(t('countdown.t07'))}</span> <span>604,800,000 ms</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>${esc(t('countdown.t08'))}</span> <span>2,592,000,000 ms</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>${esc(t('countdown.t09'))}</span> <span>31,536,000,000 ms</span></div>
                        </div>
                    </div>
                `;
          const msDisplayEl = container.querySelector('#countdownMs') as HTMLElement | null;
          const targetInputEl = container.querySelector('#countdownTarget') as HTMLInputElement | null;
          if (!msDisplayEl || !targetInputEl) return;

          const msDisplay = msDisplayEl;
          const targetInput = targetInputEl;

          const now = new Date();
          const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

          const tzoffset = now.getTimezoneOffset() * 60000;
          const localISOTime = new Date(tomorrow.getTime() - tzoffset).toISOString().slice(0, 16);
          targetInput.value = localISOTime;

          let animId: number | undefined;
          function update(): void {
            const targetTime = new Date(targetInput.value).getTime();
            const diff = targetTime - Date.now();

            if (Number.isNaN(diff) || diff < 0) {
              msDisplay.textContent = t('countdown.t13');
              msDisplay.style.color = 'var(--error)';
            } else {
              msDisplay.style.color = 'var(--accent)';
              msDisplay.textContent = diff.toString().padStart(10, '0');
            }

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
