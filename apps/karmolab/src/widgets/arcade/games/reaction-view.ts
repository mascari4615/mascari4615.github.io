/**
 * 반응속도 화면 (change.arcade-absorbs-play 단계 2)
 *
 * 칸 하나가 곧 판. 기다리는 동안 어둡고, 초록이 켜지면 통째로 초록. 누르는 곳은 칸 전체라
 * 손이 어디 있든 됨. 스페이스와 엔터로도 누름
 *
 * 내 최고 기록은 이 브라우저에 남김 (옛 놀이의 열쇠 그대로라 기록이 이어짐). 도전과제 둘도 그대로
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { EARLY, type ReactionState, type ReactionAction } from './reaction';

const BEST_KEY = 'reaction_best';

function readBest(): number {
  const v = Toolbox.getProgress?.(BEST_KEY);
  return typeof v === 'number' && v > 0 ? v : 0;
}

export const reactionView: GameView<ReactionState, ReactionAction> = {
  id: 'reaction',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-rx">' +
      '<button type="button" class="ac-rxbox" id="acRxBox">' +
      '<span class="ac-rxicon" id="acRxIcon">🎯</span>' +
      '<b class="ac-rxtext" id="acRxText"></b>' +
      '<small class="ac-rxsub" id="acRxSub"></small>' +
      '</button>' +
      '<div class="ac-rxrow" id="acRxRow"></div>' +
      '<p class="ac-rxbest" id="acRxBest"></p>' +
      '</div>';
    const box = el.querySelector('#acRxBox') as HTMLButtonElement;
    const icon = el.querySelector('#acRxIcon') as HTMLElement;
    const text = el.querySelector('#acRxText') as HTMLElement;
    const sub = el.querySelector('#acRxSub') as HTMLElement;
    const row = el.querySelector('#acRxRow') as HTMLElement;
    const bestEl = el.querySelector('#acRxBest') as HTMLElement;
    let phase = '';
    let noted = -1;

    const paintBest = (): void => {
      const best = readBest();
      bestEl.textContent = best ? t('arcade.reaction.best', { ms: String(best) }) : '';
    };
    paintBest();

    box.onclick = () => act({ kind: 'tap' });
    const keys = (e: KeyboardEvent): void => {
      if (!el.isConnected) {
        removeEventListener('keydown', keys);
        return;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      e.preventDefault();
      act({ kind: 'tap' });
    };
    addEventListener('keydown', keys);

    const setPhase = (next: string, ic: string, main: string, small: string): void => {
      if (phase === next) return;
      phase = next;
      box.className = 'ac-rxbox ac-rx-' + next;
      icon.textContent = ic;
      text.textContent = main;
      sub.textContent = small;
    };

    return (v, mySeat, now) => {
      const s = v.state;
      const mine = mySeat >= 0 ? s.picks[mySeat] : null;
      const key = v.round + ':' + s.greenAt;
      if (mine === null || mine === undefined) {
        if (now < s.greenAt) setPhase('wait' + key, '⏳', t('arcade.reaction.wait'), t('arcade.reaction.hint'));
        else setPhase('go' + key, '⚡', t('arcade.reaction.go'), '');
      } else if (mine === EARLY) {
        setPhase('early' + key, '❌', t('arcade.reaction.early'), t('arcade.reaction.earlySub'));
      } else {
        setPhase('done' + key, '🏆', mine + 'ms', mine < 200 ? t('arcade.reaction.fast') : mine < 300 ? t('arcade.reaction.good') : '');
        if (noted !== v.round) {
          noted = v.round;
          const best = readBest();
          if (!best || mine < best) {
            Toolbox.setProgress?.(BEST_KEY, mine);
            paintBest();
          }
          if (mine < 200) Toolbox.completeAchievement?.('reaction_200', { title: t('arcade.reaction.ach200') });
          if (mine < 150) Toolbox.completeAchievement?.('reaction_150', { title: t('arcade.reaction.ach150') });
        }
      }
      /* 자리마다 이번 판 결과. 아직이면 빈 칸 */
      row.innerHTML = v.seats
        .map((seat, i) => {
          const p = s.picks[i];
          const val = p === null || p === undefined ? '' : p === EARLY ? t('arcade.reaction.earlyShort') : p + 'ms';
          return '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' + seat.name + (val ? ' <b>' + val + '</b>' : '') + '</span>';
        })
        .join('');
    };
  }
};
