/**
 * 화투 짝맞추기 화면 (TASK-KL-242)
 *
 * 내 패를 고르면 같은 달의 바닥 패가 밝아짐. 짝이 하나뿐이면 바로 가져감
 * 2D 공용 상(`table2d.ts`)을 탄다 (2026-09-03). 상대는 위 자리 카드와 뒷면 부채, 가운데 바닥, 아래 내 패
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardMark } from '../card';
import { mountTable } from '../table2d';
import { FLOWER, HUE } from '../hana';
import { monthOf, pointOf, yakuOf, type HanafudaState, type HanafudaAction } from './hanafuda';

export const hanafudaView: GameView<HanafudaState, HanafudaAction> = {
  id: 'hanafuda',
  table: true,
  mount(el, act) {
    const tb = mountTable(el);
    tb.center.innerHTML = '<div class="ac-hffloor" id="acHfFloor"></div>';
    tb.acts.innerHTML = '<span id="acHfBar"></span>';
    const floorEl = el.querySelector('#acHfFloor') as HTMLElement;
    const bar = el.querySelector('#acHfBar') as HTMLElement;
    let picked = -1;
    let floorKey = '';
    let handKey = '';
    let barKey = '';

    /* 종이는 공용 부품 몫. 여기서는 **무엇이 적혀 있는지**(꽃, 달, 색)만.
       카드 번호에서 달을 떼고 끗수를 종이에 적음. 광 스물과 피 하나가 같아 보이면 고를 것이 없음 */
    const card = (n: number, o: { can?: boolean; pick?: boolean; data: Record<string, number> }): string => {
      const m = monthOf(n);
      const pt = pointOf(n);
      return cardMark(FLOWER[m], {
        ...o,
        hue: HUE[m],
        note: (m + 1) + '월 ' + pt,
        label: FLOWER[m] + ' ' + (m + 1) + '월 ' + pt + '끗'
      });
    };

    return (v, mySeat) => {
      const s = v.state;
      const deciding = s.pending?.seat === mySeat && !v.finished;
      const myTurn = !s.pending && s.turn === mySeat && !v.finished && (s.hands[mySeat]?.length ?? 0) > 0;
      const hand = s.hands[mySeat] ?? [];
      if (!myTurn) picked = -1;
      const wanted = picked >= 0 ? hand[picked] : -1;

      tb.paint(v as never, mySeat, (i) => s.hands[i]?.length ?? 0, v.finished ? -1 : s.pending?.seat ?? s.turn);
      tb.toast(
        (v.finished
          ? ''
          : s.pending
            ? t('arcade.hana.koi.turn', { who: v.seats[s.pending.seat]?.name ?? '' }) + '. '
            : myTurn
              ? t('arcade.table.myTurn') + '. '
              : t('arcade.table.turnOf', { who: v.seats[s.turn]?.name ?? '' }) + '. ') +
        v.seats.map((seat, i) => {
          /* 가져간 장수와 족보. 족보가 서면 그 이름을 붙인다 (광3, 피10) */
          const yaku = yakuOf(s.taken[i] ?? []).map((y) => t('arcade.hana.yaku.' + y.key, { n: String(y.n) })).join(' ');
      const koi = s.koi[i] ? ', ' + t('arcade.hana.koi.count', { n: String(s.koi[i]) }) : '';
          return seat.name + ' ' + (s.taken[i]?.length ?? 0) + (yaku ? ' (' + yaku + ')' : '') + koi;
        }).join(', ')
      );

      const fk = s.floor.join(',') + '|' + wanted + '|' + (myTurn ? 1 : 0);
      if (fk !== floorKey) {
        floorKey = fk;
        floorEl.innerHTML = s.floor
          .map((c, i) => card(c, { can: myTurn && wanted >= 0 && monthOf(c) === monthOf(wanted), data: { f: i } }))
          .join('');
        floorEl.querySelectorAll<HTMLButtonElement>('.ac-pc').forEach((b) => {
          const i = Number(b.dataset.f);
          b.onclick = () => {
            act({ hand: picked, floor: i });
            picked = -1;
          };
        });
      }

      const hk = hand.join(',') + '|' + picked + '|' + (myTurn ? 1 : 0);
      if (hk !== handKey) {
        handKey = hk;
        tb.hand.innerHTML = hand
          .map((m, i) => card(m, { can: myTurn, pick: i === picked, data: { h: i } }))
          .join('');
        tb.hand.querySelectorAll<HTMLButtonElement>('.ac-pc').forEach((b) => {
          const i = Number(b.dataset.h);
          b.onclick = () => {
            picked = picked === i ? -1 : i;
            /* 짝이 하나뿐이면 두 번 누르게 하지 않는다 */
            if (picked >= 0) {
              const only = s.floor.map((c, k) => (monthOf(c) === monthOf(hand[picked]) ? k : -1)).filter((k) => k >= 0);
              if (only.length === 1) {
                act({ hand: picked, floor: only[0] });
                picked = -1;
              }
            }
          };
        });
      }

      const none = picked >= 0 && !s.floor.some((c) => monthOf(c) === monthOf(hand[picked]));
      const bk = deciding ? 'koi:' + s.pending?.pts : none ? 'drop' : myTurn ? 'hint' : 'wait';
      if (bk !== barKey) {
        barKey = bk;
        bar.innerHTML = deciding
          ? '<span>' + t('arcade.hana.koi.offer', { n: String(s.pending?.pts ?? 0) }) + '</span>' +
            '<button class="btn btn-primary" id="acHfStop">' + t('arcade.hana.koi.stop') + '</button>' +
            '<button class="btn btn-ghost" id="acHfKoi">' + t('arcade.hana.koi.go') + '</button>'
          : none
          ? '<button class="btn btn-ghost" id="acHfDrop">' + t('arcade.hana.drop') + '</button>'
          : '<small>' + (myTurn ? t('arcade.hana.hint') : t('arcade.hana.waiting')) + '</small>';
        const stop = bar.querySelector('#acHfStop') as HTMLButtonElement | null;
        const koi = bar.querySelector('#acHfKoi') as HTMLButtonElement | null;
        if (stop) stop.onclick = () => act({ kind: 'koi', continue: false });
        if (koi) koi.onclick = () => act({ kind: 'koi', continue: true });
        const drop = bar.querySelector('#acHfDrop') as HTMLButtonElement | null;
        if (drop) {
          drop.onclick = () => {
            act({ hand: picked, floor: -1 });
            picked = -1;
          };
        }
      }
    };
  }
};
