import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'fontgacha',
    title: t('widgets.font.title', undefined, "폰트가챠"),
    category: 'play',
    desc: t('widgets-desc.font.desc', undefined, "가챠로 폰트를 바꿉니다"),
    layout: 'form',
    icon: '<path d="M4 7V4h16v3 M9 20h6 M12 4v16" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('font.t02', undefined, "폰트가챠"),
        build: function (container: HTMLElement): void {
          void loadNamespace('font').then(function () {

          container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:380px; gap:16px; text-align:center;">
                    <div style="font-size:14px; color:var(--text-secondary);">${esc(t('font.t01'))}</div>
                    <div id="fontDisplay" style="font-size:24px; font-weight:bold; margin:10px 0; min-height:36px; transition:all 0.3s;">${esc(t('font.label.display'))}</div>
                    <div id="fontGrade" style="font-size:40px; min-height:50px; transition:transform 0.3s;"></div>
                    <button class="btn btn-accent" id="drawFontBtn">${esc(t('font.btn.drawFontBtn'))}</button>
                    <div id="fontResult" style="font-size:14px; font-weight:bold; color:var(--accent); min-height:18px;"></div>
                    <div id="fontCollection" style="font-size:var(--font-size-xs); color:var(--text-tertiary);">${esc(t('font.label.collection'))} <span id="fontCollected">0</span> / 7</div>
                </div>
            `;
          const displayEl = container.querySelector('#fontDisplay') as HTMLElement | null;
          const btnEl = container.querySelector('#drawFontBtn') as HTMLButtonElement | null;
          const resultEl = container.querySelector('#fontResult') as HTMLElement | null;
          const gradeEl = container.querySelector('#fontGrade') as HTMLElement | null;
          const collectedEl = container.querySelector('#fontCollected') as HTMLElement | null;
          if (!displayEl || !btnEl || !resultEl || !gradeEl || !collectedEl) return;

          const display = displayEl;
          const btn = btnEl;
          const result = resultEl;
          const grade = gradeEl;
          const collected = collectedEl;

          Mdd.linePreset('tool_run', { mood: 'idle', msg: t('font.t04') });

          type FontEntry = {
            name: string;
            style: string;
            grade: string;
            color: string;
          };

          const fonts: FontEntry[] = [
            { name: t('font.t05'), style: 'sans-serif', grade: 'C', color: '#888' },
            { name: t('font.t06'), style: 'Gulim, sans-serif', grade: 'B', color: '#4FC3F7' },
            { name: t('font.t07'), style: 'Gungsuh, serif', grade: 'B', color: '#4FC3F7' },
            { name: t('font.t08'), style: 'Batang, serif', grade: 'A', color: '#AB47BC' },
            { name: t('font.t09'), style: '"Nanum Gothic", sans-serif', grade: 'A', color: '#AB47BC' },
            { name: t('font.t10'), style: 'GungsuhChe, serif', grade: 'SR', color: '#FFD700' },
            { name: 'Comic Sans', style: '"Comic Sans MS", cursive', grade: 'UR', color: '#FF5722' }
          ];

          const collectedSet = new Set<string>();

          btn.onclick = () => {
            btn.disabled = true;
            Mdd.linePreset('idle_wake', { msg: t('font.t11') });
            let spinCount = 0;
            const spinInterval = window.setInterval(() => {
              const r = fonts[Math.floor(Math.random() * fonts.length)];
              display.style.fontFamily = r.style;
              grade.textContent = r.grade;
              grade.style.color = r.color;
              spinCount++;
              if (spinCount > 15) {
                clearInterval(spinInterval);
                const rand = fonts[Math.floor(Math.random() * fonts.length)];
                display.style.fontFamily = rand.style;
                document.body.style.fontFamily = rand.style;
                grade.textContent = `[${rand.grade}]`;
                grade.style.color = rand.color;
                grade.style.transform = 'scale(1.3)';
                setTimeout(() => {
                  grade.style.transform = 'scale(1)';
                }, 300);

                result.innerHTML = t('font.got', {
                  grade: `<span style="color:${rand.color}">[${rand.grade}]</span>`,
                  name: rand.name,
                });
                collectedSet.add(rand.name);
                collected.textContent = String(collectedSet.size);

                if (rand.grade === 'UR') {
                  Mdd.linePreset('success', { msg: t('font.t12') });
                  Mdd.bounce();
                } else if (rand.grade === 'SR') {
                  Mdd.linePreset('success', { mood: 'happy', msg: t('font.t13') });
                  Mdd.bounce();
                } else if (rand.grade === 'C') {
                  Mdd.linePreset('error', { msg: t('font.t14') });
                } else {
                  Mdd.linePreset('success', { mood: 'happy', msg: `${rand.name} 나왔어요!` });
                }

                btn.disabled = false;
                Toolbox.showToast?.(t('font.gotToast', { name: rand.name }), undefined, undefined);
              }
            }, 80);
          };
                  });
        }
      }
    ]
  });
})();
