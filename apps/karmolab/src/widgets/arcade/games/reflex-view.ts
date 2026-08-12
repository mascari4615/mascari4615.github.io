/**
 * 반응 측정 화면 (TASK-KL-242)
 *
 * 고르는 곳은 **늘 같은 자리에 넷**이다 — 판마다 버튼이 옮겨 다니면 읽는 시간이 반응 시간에
 * 섞여서 무엇을 재고 있는지 알 수 없게 된다.
 */
import type { GameView } from '../views';
import type { ReflexState, ReflexAction } from './reflex';

export const reflexView: GameView<ReflexState, ReflexAction> = {
  id: 'reflex',
  mount(el, act) {
    el.innerHTML = `
      <div class="ac-stage">
        <div class="ac-order" id="acOrder"></div>
        <div class="ac-choices" id="acChoices"></div>
        <div class="ac-bar"><div class="ac-fill" id="acFill"></div></div>
      </div>`;
    const orderEl = el.querySelector('#acOrder') as HTMLElement;
    const choicesEl = el.querySelector('#acChoices') as HTMLElement;
    const fill = el.querySelector('#acFill') as HTMLElement;
    let drawnFor = '';

    return (v, mySeat, now) => {
      const s = v.state;
      if (orderEl.textContent !== s.order) orderEl.textContent = s.order;

      /* 버튼은 문제가 바뀔 때만 다시 만든다 — 매 프레임 다시 만들면 누르는 순간 사라진다. */
      const key = `${v.round}:${s.order}:${s.choices.join('|')}`;
      if (key !== drawnFor) {
        drawnFor = key;
        choicesEl.innerHTML = s.choices
          .map((c, i) => {
            const [label, tint] = c.split('\u0000');
            return `<button class="ac-choice" data-i="${i}"${tint ? ` style="color:${tint}"` : ''}>${label
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')}</button>`;
          })
          .join('');
        choicesEl.querySelectorAll<HTMLButtonElement>('.ac-choice').forEach((b) => {
          b.onclick = () => act({ choice: Number(b.dataset.i) });
        });
      }

      const mine = s.picks[mySeat];
      choicesEl.querySelectorAll<HTMLButtonElement>('.ac-choice').forEach((b, i) => {
        b.disabled = !!mine || v.roundOver;
        b.classList.toggle('ac-right', (!!mine || v.roundOver) && i === s.answer);
        b.classList.toggle('ac-wrong', !!mine && mine.choice === i && i !== s.answer);
      });

      const total = Math.max(1, s.endsAt - s.startedAt);
      const left = Math.max(0, s.endsAt - now);
      fill.style.width = `${Math.max(0, Math.min(100, (left / total) * 100))}%`;
    };
  }
};
