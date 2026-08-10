import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'toast',
    title: t('widgets.toast.title', undefined, "토스트"),
    category: 'play',
    desc: t('widgets-desc.toast.desc', undefined, "토스트 알림을 띄웁니다"),
    layout: 'form',
    icon: '<path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M8 10h8 M8 14h8" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('toast.t01', undefined, "토스트"),
        build: function (container: HTMLElement): void {
          void loadNamespace('toast').then(function () {

          Mdd.linePreset('meme_done', { msg: t('toast.t03') });
          container.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:360px; gap:16px;">
                        <div id="toastStatus" style="font-size:15px; font-weight:600; color:var(--text-secondary);">${esc(t('toast.label.status'))}</div>
                        <div id="toastImg" style="font-size:80px; cursor:pointer; transition:all 80ms; user-select:none;">🍞</div>
                        <div style="width:200px; height:8px; background:var(--bg-tertiary); border-radius:4px; overflow:hidden;">
                            <div id="toastProgress" style="width:0%; height:100%; background:var(--accent); transition:width 50ms;"></div>
                        </div>
                        <button class="btn btn-ghost" id="resetToast">${esc(t('toast.btn.resetToast'))}</button>
                    </div>
                `;
          const imgEl = container.querySelector('#toastImg') as HTMLElement | null;
          const statusEl = container.querySelector('#toastStatus') as HTMLElement | null;
          const progressEl = container.querySelector('#toastProgress') as HTMLElement | null;
          const resetBtn = container.querySelector('#resetToast') as HTMLButtonElement | null;
          if (!imgEl || !statusEl || !progressEl || !resetBtn) return;

          const img = imgEl;
          const status = statusEl;
          const progress = progressEl;

          let heat = 0;
          let isHover = false;

          img.onmouseenter = () => {
            isHover = true;
          };
          img.onmouseleave = () => {
            isHover = false;
          };
          resetBtn.onclick = () => {
            heat = 0;
            update();
          };

          let interval: ReturnType<typeof setInterval> | undefined;
          function startLoop(): void {
            if (interval) return;
            interval = setInterval(() => {
              if (isHover) {
                heat = Math.min(100, heat + 0.6);
              } else {
                heat = Math.max(0, heat - 0.15);
              }
              update();
            }, 50);
          }
          function stopLoop(): void {
            if (interval !== undefined) clearInterval(interval);
            interval = undefined;
          }

          const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) startLoop();
            else stopLoop();
          });
          observer.observe(container);

          function update(): void {
            progress.style.width = `${heat}%`;

            let sep = heat * 0.7;
            let br = 1 - heat * 0.006;
            let ct = 1 + heat * 0.005;
            if (heat > 80) {
              br = Math.max(0.2, 0.52 - (heat - 80) * 0.03);
            }
            img.style.filter = `sepia(${sep}%) brightness(${br}) contrast(${ct})`;

            if (heat < 30) status.textContent = t('toast.t04');
            else if (heat < 65) status.textContent = t('toast.t05');
            else if (heat < 80)
              status.innerHTML =
                `<span style='color:var(--success)'>${t('toast.golden')}</span>`;
            else if (heat < 95)
              status.innerHTML =
                `<span style='color:var(--warning)'>${t('toast.burning')}</span>`;
            else status.innerHTML = `<span style='color:var(--error)'>${t('toast.charcoal')}</span>`;
          }
                  });
        }
      }
    ]
  });
})();
