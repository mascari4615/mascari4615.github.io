/**
 * 가위바위보 화면 (TASK-KL-242)
 *
 * **상대가 못 내는 손도 보여 준다** — 그게 이 놀이의 정보 전부다. 안 보여 주면 규칙은 있는데
 * 아무도 그 규칙으로 생각하지 않는다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { HANDS, type RpsState, type RpsAction } from './rps';

const GLYPH = ['✊', '✋', '✌️'];

export const rpsView: GameView<RpsState, RpsAction> = {
  id: 'rps',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-rp">' +
      '<div class="ac-rpfoe" id="acRpFoe"></div>' +
      '<div class="ac-rpvs" id="acRpVs"></div>' +
      '<div class="ac-rphands" id="acRpHands"></div>' +
      '<div class="ac-rpwho" id="acRpWho"></div>' +
      '</div>';
    const foe = el.querySelector('#acRpFoe') as HTMLElement;
    const vs = el.querySelector('#acRpVs') as HTMLElement;
    const hands = el.querySelector('#acRpHands') as HTMLElement;
    const who = el.querySelector('#acRpWho') as HTMLElement;

    return (v, mySeat) => {
      const s = v.state;
      const other = 1 - mySeat;
      const reveal = s.showAt !== 0;
      const mine = s.picks[mySeat];

      foe.innerHTML =
        '<small>' + v.seats[other].name + '</small>' +
        (s.locked[other] >= 0
          ? '<span class="ac-rplock">' + t('arcade.rps.locked', { h: GLYPH[s.locked[other]] }) + '</span>'
          : '<span class="ac-rplock">' + t('arcade.rps.noLock') + '</span>');

      vs.innerHTML = reveal
        ? '<b>' + GLYPH[s.picks[mySeat]] + '</b><i>vs</i><b>' + GLYPH[s.picks[other]] + '</b>'
        : '<b>' + (mine >= 0 ? GLYPH[mine] : '·') + '</b><i>vs</i><b>' +
          (s.picks[other] === -1 ? '·' : '?') + '</b>';

      hands.innerHTML = Array.from({ length: HANDS }, (_, h) => {
        const locked = s.locked[mySeat] === h;
        return (
          '<button class="ac-rph' + (locked ? ' ac-lock' : '') + (mine === h ? ' ac-pick' : '') +
          '" data-h="' + h + '"' + (locked ? ' disabled' : '') + '>' + GLYPH[h] + '</button>'
        );
      }).join('');
      hands.querySelectorAll<HTMLButtonElement>('.ac-rph').forEach((b) => {
        const h = Number(b.dataset.h);
        b.disabled = b.disabled || reveal || mine !== -1 || v.finished;
        b.onclick = () => act({ hand: h });
      });

      who.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + (s.score[i] ?? 0) + '</b></span>')
        .join('') + '<span class="ac-dts">' + t('arcade.rps.round', { n: String(s.round + 1) }) + '</span>';
    };
  }
};
