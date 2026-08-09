import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'password',
    title: t('widgets.password.title', undefined, "비번"),
    desc: t('widgets-desc.password.desc', undefined, "4자리 비밀번호를 힌트 보며 맞히는 놀이"),
    layout: 'form',
    icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="16" r="1" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('password.t06', undefined, "비번"),
        build: function (container: HTMLElement): void {
          void loadNamespace('password').then(function () {

          Mdd.linePreset('meme_done', { msg: t('password.t08') });
          container.innerHTML = `
                    <div style="display:flex; flex-direction:column; padding:20px; height:100%; box-sizing:border-box;">
                        <div style="font-size:18px; font-weight:bold; color:var(--text-primary); margin-bottom:8px;">${esc(t('password.t01'))}</div>
                        <div style="font-size:var(--font-size-sm); color:var(--text-secondary); margin-bottom:20px;">
                            알파벳(대/소문자) + 숫자 + 일부 기호(!@#$%^&*)가 섞인 <b>${esc(t('password.t02'))}</b> ${esc(t('password.t03'))}<br>
                            ${esc(t('password.t04'))}
                        </div>
                    
                        <div style="display:flex; gap:10px; margin-bottom:20px;">
                            <input type="text" id="pwInput" class="input" style="flex:1; font-family:monospace; font-size:16px; letter-spacing:2px; text-align:center;" maxlength="4" placeholder="${esc(t('password.ph.pwInput'))}">
                            <button class="btn btn-primary" id="pwSubmit">${esc(t('password.btn.pwSubmit'))}</button>
                            <button class="btn btn-ghost" id="pwReset">${esc(t('password.btn.pwReset'))}</button>
                        </div>

                        <div id="pwLogs" style="flex:1; background:var(--bg-primary); border:1px solid var(--border); border-radius:8px; padding:15px; overflow-y:auto; font-size:var(--font-size-sm); font-family:monospace; display:flex; flex-direction:column; gap:8px;">
                        </div>
                    </div>
                `;
          const inputEl = container.querySelector('#pwInput') as HTMLInputElement | null;
          const btnSubmitEl = container.querySelector('#pwSubmit') as HTMLButtonElement | null;
          const btnResetEl = container.querySelector('#pwReset') as HTMLButtonElement | null;
          const logsEl = container.querySelector('#pwLogs') as HTMLElement | null;
          if (!inputEl || !btnSubmitEl || !btnResetEl || !logsEl) return;

          const input = inputEl;
          const btnSubmit = btnSubmitEl;
          const btnReset = btnResetEl;
          const logs = logsEl;

          const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
          let answer = '';

          function generateAnswer(): void {
            answer = '';
            for (let i = 0; i < 4; i++) {
              answer += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            logs.innerHTML =
              t('password.t09');
            input.value = '';
            input.focus();
          }

          function getSneakyHint(_guess: string): string {
            const hints: string[] = [];
            let hasLower = false;
            let hasUpper = false;
            let hasNum = false;
            let hasSym = false;
            for (let i = 0; i < 4; i++) {
              const c = answer[i];
              if (/[a-z]/.test(c)) hasLower = true;
              else if (/[A-Z]/.test(c)) hasUpper = true;
              else if (/[0-9]/.test(c)) hasNum = true;
              else hasSym = true;
            }

            if (hasLower) hints.push(t('password.t10'));
            if (hasUpper) hints.push(t('password.t11'));
            if (hasNum) hints.push(t('password.t12'));
            if (hasSym) hints.push(t('password.t13'));

            const randPos = Math.floor(Math.random() * 4);
            const tgt = answer[randPos];
            let typeStr = '';
            if (/[a-z]/.test(tgt)) typeStr = t('password.t14');
            else if (/[A-Z]/.test(tgt)) typeStr = t('password.t15');
            else if (/[0-9]/.test(tgt)) typeStr = t('password.t16');
            else typeStr = t('password.t17');

            hints.push(t('password.hintChar', { n: randPos + 1, type: typeStr }));
            hints.push(t('password.t18'));
            hints.push(t('password.t19'));

            return hints[Math.floor(Math.random() * hints.length)];
          }

          function checkGuess(): void {
            const guess = input.value;
            if (guess.length !== 4) {
              Toolbox.showToast?.(t('password.t20'), 'warning', undefined);
              return;
            }

            let strike = 0;
            let ball = 0;
            const ansLetters: (string | null)[] = answer.split('');
            const guessLetters = guess.split('');
            const colors = ['#333', '#333', '#333', '#333'];

            for (let i = 0; i < 4; i++) {
              if (guessLetters[i] === ansLetters[i]) {
                colors[i] = 'var(--success)';
                ansLetters[i] = null;
                strike++;
              }
            }

            for (let i = 0; i < 4; i++) {
              const g = guessLetters[i];
              if (colors[i] !== 'var(--success)' && g !== undefined && ansLetters.includes(g)) {
                colors[i] = 'var(--warning)';
                const idx = ansLetters.indexOf(g);
                if (idx !== -1) ansLetters[idx] = null;
                ball++;
              }
            }

            const tilesHtml = guessLetters
              .map(
                (g, i) => `
                        <div style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; background:${colors[i]}; font-weight:bold; font-size:18px; border-radius:4px; color:#fff; box-shadow:inset 0 0 4px rgba(0,0,0,0.3);">${g}</div>
                    `
              )
              .join('');

            const logEntry = document.createElement('div');
            logEntry.style.padding = '10px';
            logEntry.style.background = 'var(--bg-tertiary)';
            logEntry.style.borderRadius = '6px';
            logEntry.style.borderLeft = strike === 4 ? '3px solid var(--success)' : '3px solid #444';

            if (strike === 4) {
              logEntry.innerHTML = `
                            <div style="display:flex; gap:6px; margin-bottom:8px; justify-content:center;">${tilesHtml}</div>
                            <div style="text-align:center; color:var(--success); font-weight:bold;">${esc(t('password.t05'))}</div>
                        `;
              setTimeout(generateAnswer, 3000);
            } else {
              const hintMsg = getSneakyHint(guess);
              logEntry.innerHTML = `
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <div style="display:flex; gap:6px;">${tilesHtml}</div>
                                <span style="color:var(--text-secondary); font-size:var(--font-size-xs); font-weight:bold; letter-spacing:1px;">${strike}S ${ball}B</span>
                            </div>
                            <div style="color:var(--text-tertiary); font-size:var(--font-size-xs); background:var(--bg-tertiary); padding:8px; border-radius:4px;">💡 ${hintMsg}</div>
                        `;
            }

            logs.insertBefore(logEntry, logs.firstChild);
            input.value = '';
            input.focus();
          }

          btnSubmit.onclick = checkGuess;
          input.onkeypress = (e: KeyboardEvent) => {
            if (e.key === 'Enter') checkGuess();
          };
          btnReset.onclick = generateAnswer;

          generateAnswer();
                  });
        }
      }
    ]
  });
})();
