/**
 * 거짓말 주사위 입체 (2026-09-03, D1)
 *
 * 야추의 주사위 무대(`dice-stage`)를 빌린다. 쟁반 위에 **내 주사위만** 구르고(남의 것은 뒷면이 없으니 안 보임),
 * 종이에는 걸린 말과 지난 말이 적힌다. 부르기와 거짓말은 HUD 버튼.
 * 컵과 주사위는 누를 일이 없어 손을 뗌(`canAct(false)`)
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountDiceStage, type DiceStage } from '../dice-stage';
import { sceneOf } from '../scenes';
import { diePip } from '../die';
import { expectOf, type LiarsState, type LiarsAction } from './liars';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const view3d: GameView<LiarsState, LiarsAction> = {
  id: 'liars',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acLiHud"><div class="ac-bjlines" id="acLiLines"></div><div class="ac-bjacts ac-tbacts" id="acLiActs"></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acLiHud') as HTMLElement;
    const lineBox = el.querySelector('#acLiLines') as HTMLElement;
    const actBox = el.querySelector('#acLiActs') as HTMLElement;

    /* 종이에 적을 것. 걸린 말과 방금 일 */
    let sheet = { bid: '', last: '', hint: '' };
    const stage: DiceStage | null = mountDiceStage(host, {
      count: 5,
      scene: sceneOf('liars'),
      onDie: () => {},
      onCup: () => {},
      onPaper: () => {},
      drawSheet: (c, w, h) => {
        c.fillStyle = '#2a1e12';
        c.font = `${Math.round(h * 0.11)}px "Noto Serif KR", serif`;
        c.textAlign = 'center';
        c.fillText(sheet.bid || t('arcade.liars.nobid'), w / 2, h * 0.3);
        c.font = `${Math.round(h * 0.075)}px "Noto Sans KR", sans-serif`;
        if (sheet.last) c.fillText(sheet.last, w / 2, h * 0.5);
        c.fillText(sheet.hint, w / 2, h * 0.7);
      }
    });
    if (!stage || !stage.ok) {
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }
    stage.canAct(false);
    stage.rollsLeft(0);

    let diceKey = '';
    let actsKey = '';
    let linesKey = '';
    let sheetKey = '';

    const nope = (b: HTMLElement): void => {
      blip('bad');
      b.classList.remove('ac-bjnope');
      void b.offsetWidth;
      b.classList.add('ac-bjnope');
    };
    hudEl.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (!b) return;
      if (b.disabled) {
        nope(b);
        return;
      }
      blip('tap');
      if (b.dataset.do === 'call') act({ kind: 'call' });
      else act({ kind: 'bid', face: Number(b.dataset.f), count: Number(b.dataset.c) });
    };
    const btn = (kind: string, text: string, ghost: boolean, data = ''): string =>
      '<button type="button" class="ac-bjbtn' + (ghost ? ' ac-ghost' : '') + '" data-do="' + kind + '"' + data + '>' + text + '</button>';

    return (v, mySeat) => {
      const s = v.state;
      const names = v.seats.map((x) => x.name);
      const total = s.dice.reduce((a, d) => a + d.length, 0);
      const myTurn = s.showAt === 0 && s.alive[mySeat] && s.turn === mySeat && !v.finished;

      /* 내 주사위. 눈이 바뀌면(새 판) 굴린다. 개수가 줄면 그만큼만 */
      const mine = s.dice[mySeat] ?? [];
      const dk = mine.join(',');
      if (dk !== diceKey) {
        const fresh = diceKey !== '';
        diceKey = dk;
        const five = [...mine, ...new Array(Math.max(0, 5 - mine.length)).fill(1)].slice(0, 5);
        stage.set(five, five.map((_, i) => i >= mine.length), fresh);
      }

      /* 종이는 캔버스라 HTML 을 못 읽는다. 주사위 눈은 글자로 (평면의 diePip 은 <i> 마크업) */
      const plain = (x: string): string => x.replace(/<[^>]+>/g, '');
      const bidText = s.bid ? plain(t('arcade.liars.bid', { n: String(s.bid.count), f: String(s.bid.face) })) : '';
      const lastText = plain(s.showAt !== 0 && s.last?.kind === 'call' ? t('arcade.liars.real', { n: s.last.text }) : (s.last?.text ?? ''));
      const hintText = t('arcade.liars.hint', { n: String(total), m: String(expectOf(total)) });
      const sk = bidText + '|' + lastText + '|' + hintText;
      if (sk !== sheetKey) {
        sheetKey = sk;
        sheet = { bid: bidText, last: lastText, hint: hintText };
        stage.sheetDirty();
      }

      const lines = [
        v.finished ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: names[s.turn] ?? '' }),
        ...v.seats.map((seat, i) => seat.name + ' ' + (s.dice[i]?.length ?? 0) + (s.alive[i] ? '' : ' x'))
      ];
      const lk = lines.join('|');
      if (lk !== linesKey) {
        linesKey = lk;
        lineBox.innerHTML = lines
          .map((x, i) => (x ? '<div class="ac-bjline' + (i === 0 ? ' ac-me' : ' ac-bjother') + '"><span>' + esc(x) + '</span></div>' : ''))
          .join('');
      }

      const ak = myTurn ? 'on|' + (s.bid ? s.bid.count + 'x' + s.bid.face : '-') : 'off';
      if (ak === actsKey) return;
      actsKey = ak;
      if (!myTurn) {
        actBox.innerHTML = '';
        return;
      }
      /* 부를 수 있는 말만. 개수는 앞말 +0/+1, 눈은 그보다 높은 것만 (평면과 같은 셈) */
      const opts: Array<{ face: number; count: number }> = [];
      const base = s.bid;
      for (let count = base ? base.count : 1; count <= (base ? base.count + 1 : 3); count++) {
        for (let face = 2; face <= 6; face++) {
          if (base && !(count > base.count || (count === base.count && face > base.face))) continue;
          opts.push({ face, count });
        }
      }
      actBox.innerHTML =
        opts.slice(0, 10).map((o) => btn('bid', o.count + '×' + diePip(o.face), true, ' data-f="' + o.face + '" data-c="' + o.count + '"')).join('') +
        (base ? btn('call', esc(t('arcade.liars.call')), false) : '');
    };
  }
};
