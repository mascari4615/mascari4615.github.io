import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Mdd.injectCSS(
    'hacker',
    `
        .hacker-container { width:100%; flex:1; min-height:300px; background:#000; color:#00ff00; font-family:'SF Mono','Cascadia Code','Consolas',monospace; font-size:14px; padding:24px; border:1px solid var(--border); border-radius:var(--radius-lg); overflow-y:auto; white-space:pre-wrap; word-break:break-all; position:relative; user-select:none; }
        .hacker-cursor { display:inline-block; width:8px; height:16px; background:#00ff00; animation:hacker-blink 1s step-end infinite; vertical-align:middle; margin-left:2px; }
        @keyframes hacker-blink { 50% { opacity:0; } }
    `
  );

  let hackerText = '';
  let hackerIndex = 0;

  Toolbox.register({
    id: 'hacker',
    title: t('widgets.hacker.title', undefined, "해커"),
    category: 'play',
    desc: t('widgets-desc.hacker.desc', undefined, "키보드를 연타해 해커 느낌의 텍스트를 출력합니다"),
    layout: 'form',
    icon: '<path d="M4 17l6-6-6-6 M12 19h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('hacker.t02', undefined, "해커"),
        build: function (container: HTMLElement): void {
          void loadNamespace('hacker').then(function () {

          container.innerHTML = `
                    <div style="margin-bottom:12px; font-size:var(--font-size-xs); color:var(--text-tertiary);">${esc(t('hacker.t01'))}</div>
                    <div class="hacker-container" id="hackerScreen" tabindex="0">${esc(t('hacker.label.screen'))}<span class="hacker-cursor"></span></div>
                `;
          const screenEl = container.querySelector('#hackerScreen') as HTMLElement | null;
          if (!screenEl) return;

          const screen = screenEl;

          Mdd.linePreset('meme_done', { msg: t('hacker.t04') });

          fetch('/apps/karmolab/js/toolbox.js')
            .then((r) => r.text())
            .then((body) => {
              hackerText = body;
            })
            .catch(() => {
              hackerText =
                "/* ACCESS GRANTED */\n\nfunction activateMainframe() {\n    const node = '0xDEADAES';\n    console.log('[SYSTEM]: CONNECTED');\n}";
            });

          let keystrokeCount = 0;
          screen.onkeydown = (e: KeyboardEvent) => {
            e.preventDefault();
            if (!hackerText) return;
            if (hackerIndex === 0) screen.innerHTML = '';

            const chunk = hackerText.substring(hackerIndex, hackerIndex + 5);
            const oldCur = screen.querySelector('.hacker-cursor');
            oldCur?.remove();
            screen.innerHTML += chunk.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            hackerIndex += 5;
            if (hackerIndex >= hackerText.length) hackerIndex = 0;

            const cur = document.createElement('span');
            cur.className = 'hacker-cursor';
            screen.appendChild(cur);
            screen.scrollTop = screen.scrollHeight;

            keystrokeCount++;
            if (keystrokeCount % 30 === 0) {
              Mdd.bounce();
              const quips = [t('hacker.t05'), t('hacker.t06'), t('hacker.t07'), t('hacker.t08')];
              Mdd.linePreset('meme_done', { msg: quips[Math.floor(Math.random() * quips.length)] });
            }
          };

          setTimeout(() => screen.focus(), 200);
                  });
        }
      }
    ]
  });
})();
