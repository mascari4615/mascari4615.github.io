import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'stone',
    title: t('widgets.stone.title', undefined, "돌"),
    category: 'play',
    desc: t('widgets-desc.stone.desc', undefined, "돌을 던져 점을 봅니다"),
    layout: 'form',
    icon: '<path d="M12 3C7 3 4 8 4 12s2 8 8 8 8-4 8-8-3-9-8-9z M8 12h8" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('stone.t04', undefined, "돌"),
        build: function (container: HTMLElement): void {
          void loadNamespace('stone').then(function () {

          container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:380px; gap:20px; text-align:center;">
                    <div style="font-size:14px; color:var(--text-secondary);">${esc(t('stone.t01'))}</div>
                    <div id="stoneEmoji" style="font-size:100px; user-select:none; cursor:default; filter:drop-shadow(0 5px 5px rgba(0,0,0,0.5)); transition:transform 0.2s;">🪨</div>
                    <div id="stoneStatus" style="font-size:var(--font-size-sm); color:var(--text-tertiary); min-height:18px;">${esc(t('stone.label.status'))}</div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-ghost" id="stoneFeed">${esc(t('stone.btn.feed'))}</button>
                        <button class="btn btn-ghost" id="stoneWalk">${esc(t('stone.btn.walk'))}</button>
                        <button class="btn btn-ghost" id="stonePraise">${esc(t('stone.btn.praise'))}</button>
                    </div>
                    <div style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-top:10px;">${esc(t('stone.t02'))} <span id="stoneTime">0</span>${esc(t('stone.t03'))}</div>
                </div>
            `;
          const statusEl = container.querySelector('#stoneStatus') as HTMLElement | null;
          const stoneEmojiEl = container.querySelector('#stoneEmoji') as HTMLElement | null;
          const timeElEl = container.querySelector('#stoneTime') as HTMLElement | null;
          const feedEl = container.querySelector('#stoneFeed') as HTMLButtonElement | null;
          const walkEl = container.querySelector('#stoneWalk') as HTMLButtonElement | null;
          const praiseEl = container.querySelector('#stonePraise') as HTMLButtonElement | null;
          if (!statusEl || !stoneEmojiEl || !timeElEl || !feedEl || !walkEl || !praiseEl) return;

          const status = statusEl;
          const stoneEmoji = stoneEmojiEl;
          const timeEl = timeElEl;

          let seconds = 0;

          Mdd.linePreset('idle_sleep', { msg: t('stone.t06') });

          const reactions: Record<'feed' | 'walk' | 'praise', string[]> = {
            feed: [t('stone.t07'), t('stone.t08'), t('stone.t09')],
            walk: [t('stone.t10'), t('stone.t11'), t('stone.t12')],
            praise: [t('stone.t13'), t('stone.t14'), t('stone.t15')]
          };

          function react(type: 'feed' | 'walk' | 'praise'): void {
            const msgs = reactions[type];
            const msg = msgs[Math.floor(Math.random() * msgs.length)];
            status.textContent = msg;
            stoneEmoji.style.transform = 'rotate(3deg)';
            setTimeout(() => {
              stoneEmoji.style.transform = 'rotate(0deg)';
            }, 200);

            if (type === 'feed') {
              Mdd.linePreset('tool_run', { mood: 'eating', msg: t('stone.t16') });
            } else if (type === 'walk') {
              Mdd.linePreset('error', { msg: t('stone.t17') });
            } else {
              Mdd.linePreset('tool_run', { mood: 'idle', msg: t('stone.t18') });
            }

            setTimeout(() => Mdd.setMood('sleep'), 2000);
          }

          feedEl.onclick = () => react('feed');
          walkEl.onclick = () => react('walk');
          praiseEl.onclick = () => react('praise');

          const timer = window.setInterval(() => {
            if (!container.offsetParent) {
              clearInterval(timer);
              return;
            }
            seconds++;
            timeEl.textContent = seconds.toLocaleString();
          }, 1000);
                  });
        }
      }
    ]
  });
})();
