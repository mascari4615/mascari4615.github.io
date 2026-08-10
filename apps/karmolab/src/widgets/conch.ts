import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta?.('conch') ?? {}),
    tabs: [
      {
        id: 'app',
        label: t('conch.t02', undefined, "소라고동"),
        build: function (container: HTMLElement): void {
          void loadNamespace('conch').then(function () {

          container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:380px; gap:16px; text-align:center;">
                    <div style="font-size:14px; color:var(--text-secondary);">${esc(t('conch.t01'))}</div>
                    <input type="text" id="conchInput" class="input" style="width:80%; max-width:300px; text-align:center;" placeholder="${esc(t('conch.ph.input'))}">
                    <div id="conchVisual" style="font-size:70px; cursor:pointer; transition:transform 0.3s; user-select:none;">🐚</div>
                    <div id="conchResult" style="font-size:16px; font-weight:bold; color:var(--accent); min-height:24px;"></div>
                    <button class="btn primary" id="conchBtn">${esc(t('conch.btn.btn'))}</button>
                </div>
            `;
          const inputEl = container.querySelector('#conchInput') as HTMLInputElement | null;
          const visualEl = container.querySelector('#conchVisual') as HTMLElement | null;
          const resultEl = container.querySelector('#conchResult') as HTMLElement | null;
          const btnEl = container.querySelector('#conchBtn') as HTMLButtonElement | null;
          if (!inputEl || !visualEl || !resultEl || !btnEl) return;

          const input = inputEl;
          const visual = visualEl;
          const result = resultEl;
          const btn = btnEl;

          Mdd.linePreset('tool_run', { mood: 'idle', msg: t('conch.t03') });

          const answers = [
            t('conch.t04'),
            t('conch.t05'),
            t('conch.t06'),
            t('conch.t07'),
            t('conch.t08'),
            t('conch.t09'),
            t('conch.t10'),
            t('conch.t11'),
            t('conch.t12'),
            t('conch.t13'),
            t('conch.t14'),
            t('conch.t15')
          ];

          function ask(): void {
            const text = input.value.trim();
            if (!text) {
              Toolbox.showToast?.(t('conch.t16'), 'warning', undefined);
              return;
            }

            visual.style.transform = 'scale(1.2) rotate(15deg)';
            result.textContent = t('conch.t17');
            Mdd.linePreset('tool_run', { msg: t('conch.t18') });

            setTimeout(() => {
              visual.style.transform = 'scale(1) rotate(0deg)';
              const rand = answers[Math.floor(Math.random() * answers.length)];
              result.textContent = `"${rand}"`;
              input.value = '';
              Mdd.linePreset('meme_done', { msg: `소라고동님의 답변: "${rand}"` });
              Mdd.bounce();
            }, 800);
          }

          btn.onclick = ask;
          input.onkeypress = (e: KeyboardEvent) => {
            if (e.key === 'Enter') ask();
          };
                  });
        }
      }
    ]
  });
})();
