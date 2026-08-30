import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const PROGRESS_KEY = 'pet_strokes';

  type MilestoneDef = {
    msg: string;
    mood: string;
    achievement?: string;
    badge?: string;
  };

  /* 이 표는 **쓸 때 만든다**. 모듈이 뜨는 순간에 굳으면 한국어로 굳는다. */
  const milestones = (): Record<number, MilestoneDef> => ({
    100: { msg: t('pet.t06'), mood: 'happy', achievement: 'pet_100' },
    1000: { msg: t('pet.t07'), mood: 'smug', achievement: 'pet_1000' },
    10000: { msg: t('pet.t08'), mood: 'happy', achievement: 'pet_10000' },
    100000: { msg: t('pet.t09'), mood: 'shock', achievement: 'pet_100000' },
    500000: { msg: t('pet.t10'), mood: 'love', achievement: 'pet_500000' },
    1000000: { msg: '', mood: 'love', badge: 'pet_marriage' }
  });

  Toolbox.register({
    id: 'pet',
    title: t('widgets.pet.title', undefined, "쓰다듬기"),
    category: 'play',
    desc: t('widgets-desc.pet.desc', undefined, "고양이를 쓰다듬고 호감도를 올립니다"),
    layout: 'form',
    icon: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14c-2.67 0-5.18-1.08-7.07-2.83C6.46 15.83 9.11 14 12 14s5.54 1.83 7.07 3.17C17.18 18.92 14.67 20 12 20z" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('pet.t11', undefined, "쓰다듬기"),
        build: function (container: HTMLElement): void {
          void loadNamespace('pet').then(function () {

          container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:380px; gap:16px; text-align:center; position:relative; overflow:hidden;">
                    <div style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('pet.t01'))}</div>
                    <div style="font-size:var(--font-size-xs); color:var(--text-tertiary);">${esc(t('pet.t02'))}</div>
                    <div id="petArea" style="font-size:100px; cursor:grab; user-select:none; filter:drop-shadow(0 4px 4px rgba(0,0,0,0.3)); transition:transform 0.1s;">🐱</div>
                    <div style="font-size:var(--font-size-title); font-weight:bold; color:var(--accent-ink);">${esc(t('pet.t03'))} <span id="petCount">0</span></div>
                    <div id="petMilestone" style="font-size:var(--font-size-xs); color:var(--success); min-height:16px;"></div>
                </div>
            `;
          const petAreaEl = container.querySelector('#petArea') as HTMLElement | null;
          const countLabelEl = container.querySelector('#petCount') as HTMLElement | null;
          const milestoneEl = container.querySelector('#petMilestone') as HTMLElement | null;
          if (!petAreaEl || !countLabelEl || !milestoneEl) return;

          const petArea = petAreaEl;
          const countLabel = countLabelEl;
          const milestone = milestoneEl;

          let count = Toolbox.getProgress?.(PROGRESS_KEY) ?? 0;
          countLabel.textContent = count.toLocaleString();

          Mdd.linePreset('achievement', { msg: t('pet.t13') });

          let isDragging = false;
          petArea.addEventListener('mousedown', () => {
            isDragging = true;
          });
          window.addEventListener('mouseup', () => {
            isDragging = false;
          });

          /* 쓰다듬는 일 자체를 함수로 뽑는다. 마우스로 문지르든 자판을 누르든 **같은 한 번**이다.
           * (2026-08-14, `audit:mouse-only`: 문지르기만 있으면 자판 쓰는 사람은 아예 못 쓰다듬는다.) */
          function petOnce(): void {
            count = Toolbox.incrementProgress?.(PROGRESS_KEY) ?? count + 1;
            countLabel.textContent = count.toLocaleString();
            petArea.style.transform = `scale(${1 + Math.random() * 0.1}) rotate(${(Math.random() - 0.5) * 10}deg)`;

            const m = milestones()[count];
            if (m) {
              if (m.badge) {
                Toolbox.unlockBadge?.(m.badge, { title: t('pet.t14') });
                showMarriagePopup();
              } else if (m.achievement) {
                Toolbox.completeAchievement?.(m.achievement);
              }
              if (m.msg) {
                milestone.textContent = m.msg;
                Mdd.linePreset('achievement', { mood: m.mood, msg: m.msg });
                Mdd.bounce();
              }
            }
          }

          petArea.addEventListener('mousemove', () => {
            if (isDragging) petOnce();
          });

          /* 자판 길. 누르면 한 번 쓰다듬는다. 고양이는 단추가 아니지만, 하는 일이 단추와 같다
           * (누르면 한 번 일어난다)라서 `role="button"` 이 맞다. */
          petArea.tabIndex = 0;
          petArea.setAttribute('role', 'button');
          petArea.setAttribute('aria-label', t('pet.kb.label'));
          petArea.addEventListener('keydown', (e) => {
            if (!['Enter', ' ', 'Spacebar', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            petOnce();
          });

          function showMarriagePopup(): void {
            Mdd.linePreset('achievement', { msg: t('pet.t15') });
            const overlay = document.createElement('div');
            overlay.style.cssText =
              'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; display:flex; align-items:center; justify-content:center; flex-direction:column; color:#fff;';
            overlay.innerHTML = `
                    <div style="font-size:60px; animation:mdd-bounce 1s infinite;">💖💍🎉</div>
                    <div style="font-size:32px; font-weight:bold; margin-top:20px;">${esc(t('pet.t04'))}</div>
                    <div style="font-size:var(--font-size-xs); margin-top:10px; color:pink;">${esc(t('pet.t05'))}</div>
                `;
            document.body.appendChild(overlay);
          }
                  });
        }
      }
    ]
  });
})();
