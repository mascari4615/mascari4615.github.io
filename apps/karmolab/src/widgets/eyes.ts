import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  Toolbox.register({
    id: 'eyes',
    title: t('widgets.eyes.title', undefined, "눈동자"),
    category: 'play',
    desc: t('widgets-desc.eyes.desc', undefined, "마우스를 따라오는 눈동자"),
    layout: 'form',
    icon: '<path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('eyes.t01', undefined, "눈동자"),
        build: function (container: HTMLElement): void {
          void loadNamespace('eyes').then(function () {

          Mdd.linePreset('tool_run', { mood: 'idle', msg: t('eyes.t03') });
          container.innerHTML = `
                    <div id="eyesArena" style="position:relative; width:100%; flex:1; min-height:300px; background:#1e1e2d; border-radius:var(--radius-lg); overflow:hidden; cursor:crosshair; box-shadow:inset 0 0 20px rgba(0,0,0,0.5);">
                    </div>
                `;
          const arenaEl = container.querySelector('#eyesArena') as HTMLElement | null;
          if (!arenaEl) return;

          const arena = arenaEl;

          type Eye = {
            box: HTMLDivElement;
            pupil: HTMLDivElement;
            top: HTMLDivElement;
            bot: HTMLDivElement;
          };
          const eyes: Eye[] = [];

          for (let i = 0; i < 40; i++) {
            const eyeBox = document.createElement('div');
            eyeBox.style.cssText = `
                        position:absolute; width:36px; height:36px; background:#fff; border-radius:50%;
                        box-shadow: 0 0 5px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center;
                        overflow:hidden;
                    `;
            eyeBox.style.left = `${Math.random() * 90}%`;
            eyeBox.style.top = `${Math.random() * 90}%`;

            const pupil = document.createElement('div');
            pupil.style.cssText = `
                        width:14px; height:14px; background:#111; border-radius:50%; transition: transform 0.05s linear;
                    `;

            const eyelidTop = document.createElement('div');
            eyelidTop.style.cssText = `
                        position:absolute; top:0; left:0; width:100%; height:50%; background:#1e1e2d; transform-origin:top; transition:transform 0.15s ease-in-out; transform:scaleY(0); border-bottom:2px solid #000;
                    `;
            const eyelidBot = document.createElement('div');
            eyelidBot.style.cssText = `
                        position:absolute; bottom:0; left:0; width:100%; height:50%; background:#1e1e2d; transform-origin:bottom; transition:transform 0.15s ease-in-out; transform:scaleY(0); border-top:2px solid #000;
                    `;

            eyeBox.appendChild(pupil);
            eyeBox.appendChild(eyelidTop);
            eyeBox.appendChild(eyelidBot);
            arena.appendChild(eyeBox);

            eyes.push({ box: eyeBox, pupil: pupil, top: eyelidTop, bot: eyelidBot });
          }

          let mx = 0;
          let my = 0;
          /* 「어디를 보나」를 함수로 뽑는다 — 마우스든 자판이든 **같은 계산**이다
           * (2026-08-14, `audit:mouse-only`: 마우스만 받으면 눈이 영영 한 곳만 본다). */
          function lookAt(x: number, y: number): void {
            mx = x;
            my = y;
            eyes.forEach((eye) => {
              const ex = eye.box.offsetLeft + 18;
              const ey = eye.box.offsetTop + 18;
              const angle = Math.atan2(my - ey, mx - ex);
              const dist = Math.min(8, Math.hypot(mx - ex, my - ey) / 10);
              const px = Math.cos(angle) * dist;
              const py = Math.sin(angle) * dist;
              eye.pupil.style.transform = `translate(${px}px, ${py}px)`;
            });
          }

          arena.onmousemove = (e: MouseEvent) => {
            const rect = arena.getBoundingClientRect();
            lookAt(e.clientX - rect.left, e.clientY - rect.top);
          };

          const blink = (): void => {
            eyes.forEach((eye) => {
              eye.top.style.transform = 'scaleY(1)';
              eye.bot.style.transform = 'scaleY(1)';
            });
          };

          /* 자판 길 — 화살표로 보는 자리를 옮기고 Enter 로 깜빡인다. 걸음은 마당의 1/12. */
          arena.tabIndex = 0;
          arena.setAttribute('role', 'application');
          arena.setAttribute('aria-label', t('eyes.kb.label'));
          arena.addEventListener('keydown', (e) => {
            const stepX = Math.max(8, arena.clientWidth / 12);
            const stepY = Math.max(8, arena.clientHeight / 12);
            switch (e.key) {
              case 'ArrowLeft': lookAt(Math.max(0, mx - stepX), my); break;
              case 'ArrowRight': lookAt(Math.min(arena.clientWidth, mx + stepX), my); break;
              case 'ArrowUp': lookAt(mx, Math.max(0, my - stepY)); break;
              case 'ArrowDown': lookAt(mx, Math.min(arena.clientHeight, my + stepY)); break;
              case 'Enter': case ' ': {
                blink();
                window.setTimeout(() => arena.onmouseup?.(new MouseEvent('mouseup')), 150);
                break;
              }
              default: return;
            }
            e.preventDefault();
          });

          arena.onmousedown = blink;
          arena.onmouseup = () => {
            setTimeout(() => {
              eyes.forEach((eye) => {
                eye.top.style.transform = 'scaleY(0)';
                eye.bot.style.transform = 'scaleY(0)';
              });
            }, 200);
          };
          arena.onmouseleave = arena.onmouseup;
                  });
        }
      }
    ]
  });
})();
