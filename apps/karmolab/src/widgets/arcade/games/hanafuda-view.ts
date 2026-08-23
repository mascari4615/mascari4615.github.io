/**
 * 화투 짝맞추기 화면 (TASK-KL-242)
 *
 * 내 패를 고르면 **짝이 되는 바닥 패가 밝아진다** — 열두 달을 외운 사람만 놀 수 있으면 안 된다.
 * 짝이 하나뿐이면 바로 가져가고, 없으면 「버리기」가 뜬다(막히지 않게).
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardMark } from '../card';
import type { HanafudaState, HanafudaAction } from './hanafuda';

/** 달마다 다른 꽃 — 그림 없이 글자와 색만으로 열둘을 구분한다. */
const FLOWER = ['松', '梅', '桜', '藤', '菖', '牡', '萩', '芒', '菊', '楓', '柳', '桐'];
const HUE = [
  '#166534', '#be185d', '#f472b6', '#7c3aed', '#0891b2', '#dc2626',
  '#a16207', '#64748b', '#ca8a04', '#b45309', '#15803d', '#7c2d12'
];

export const hanafudaView: GameView<HanafudaState, HanafudaAction> = {
  id: 'hanafuda',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-hf">' +
      '<div class="ac-hfrow"><small id="acHfFl"></small><div id="acHfFloor"></div></div>' +
      '<div class="ac-hfrow"><small id="acHfMl"></small><div id="acHfHand"></div></div>' +
      '<div class="ac-hfbar" id="acHfBar"></div>' +
      '<div class="ac-hfwho" id="acHfWho"></div>' +
      '</div>';
    const floorEl = el.querySelector('#acHfFloor') as HTMLElement;
    const handEl = el.querySelector('#acHfHand') as HTMLElement;
    const bar = el.querySelector('#acHfBar') as HTMLElement;
    const who = el.querySelector('#acHfWho') as HTMLElement;
    let picked = -1;

    /* 종이는 공용 부품이 정한다 — 여기서는 **무엇이 적혀 있는지**(꽃·달·색)만 준다. */
    const card = (m: number, o: { can?: boolean; pick?: boolean; data: Record<string, number> }): string =>
      cardMark(FLOWER[m], {
        ...o,
        hue: HUE[m],
        note: String(m + 1),
        label: FLOWER[m] + ' ' + (m + 1)
      });

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.turn === mySeat && !v.finished && (s.hands[mySeat]?.length ?? 0) > 0;
      const hand = s.hands[mySeat] ?? [];
      if (!myTurn) picked = -1;

      const wanted = picked >= 0 ? hand[picked] : -1;

      (el.querySelector('#acHfFl') as HTMLElement).textContent = t('arcade.hana.floor');
      (el.querySelector('#acHfMl') as HTMLElement).textContent = t('arcade.hana.mine');

      floorEl.innerHTML = s.floor
        .map((m, i) => card(m, { can: myTurn && m === wanted, data: { f: i } }))
        .join('');
      floorEl.querySelectorAll<HTMLButtonElement>('.ac-pc').forEach((b) => {
        const i = Number(b.dataset.f);
        b.onclick = () => {
          act({ hand: picked, floor: i });
          picked = -1;
        };
      });

      handEl.innerHTML = hand
        .map((m, i) => card(m, { can: myTurn, pick: i === picked, data: { h: i } }))
        .join('');
      handEl.querySelectorAll<HTMLButtonElement>('.ac-pc').forEach((b) => {
        const i = Number(b.dataset.h);
        b.onclick = () => {
          picked = picked === i ? -1 : i;
          /* 짝이 하나뿐이면 두 번 누르게 하지 않는다. */
          if (picked >= 0) {
            const only = s.floor.map((m, k) => (m === hand[picked] ? k : -1)).filter((k) => k >= 0);
            if (only.length === 1) {
              act({ hand: picked, floor: only[0] });
              picked = -1;
            }
          }
        };
      });

      const none = picked >= 0 && !s.floor.includes(hand[picked]);
      bar.innerHTML = none
        ? '<button class="btn btn-ghost" id="acHfDrop">' + t('arcade.hana.drop') + '</button>'
        : '<small>' + (myTurn ? t('arcade.hana.hint') : t('arcade.hana.waiting')) + '</small>';
      const drop = bar.querySelector('#acHfDrop') as HTMLButtonElement | null;
      if (drop) {
        drop.onclick = () => {
          act({ hand: picked, floor: -1 });
          picked = -1;
        };
      }

      who.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + (s.taken[i]?.length ?? 0) + '</b></span>')
        .join('');
    };
  }
};
