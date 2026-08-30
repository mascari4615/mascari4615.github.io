/**
 * 주사위 요트. 입체 화면 (같은 규칙, 다른 표현)
 *
 * 규칙(`yacht.ts`)은 이 파일을 모름. `views.ts` 의 좁은 구멍 하나로만 연결
 * 무대는 `dice-stage.ts`(밤의 바 카운터). 여기 있는 일은 **상태를 주사위와 종이로 옮기는 것**,
 * 그리고 적을 때 종이 위에 HTML 점수표를 띄우는 것뿐.
 *
 * 글자는 종이에만. 굴리기는 컵, 남기기는 주사위, 적기는 종이 클릭
 * 세 번째 굴림이 멎으면 종이가 저절로 다가온다(어차피 적어야 한다).
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { mountDiceStage, type DiceStage } from '../dice-stage';
import { barAmbience } from '../bar-ambience';
import { die } from '../die';
import { scoreOf, totalOf, type Cat, type YachtState, type YachtAction } from './yacht';

const UPPER: Cat[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const LOWER: Cat[] = ['choice', 'fourkind', 'fullhouse', 'sstraight', 'lstraight', 'yacht'];
const upperOf = (sheet: Record<Cat, number | null>): number => UPPER.reduce((a, c) => a + (sheet[c] ?? 0), 0);

function seatCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('#acSeats .ac-seat:not(.ac-watch)'));
}
function sub(card: HTMLElement, cls: string): HTMLElement {
  let e = card.querySelector<HTMLElement>('.' + cls);
  if (!e) {
    e = document.createElement('small');
    e.className = cls;
    card.appendChild(e);
  }
  return e;
}
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const view3d: GameView<YachtState, YachtAction> = {
  id: 'yacht',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room ac-t3bar" id="acT3"></div>' +
      '<div class="ac-ycpaper" id="acYcPaper" hidden></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const paperEl = el.querySelector('#acYcPaper') as HTMLElement;
    const amb = barAmbience(host);
    host.addEventListener('pointerdown', () => amb.wake(), { passive: true });

    let last: YachtState | null = null;
    let seatNames: string[] = [];
    let mySeat = -1;
    let sheetOpen = false;
    let autoTimer = 0;
    let dead = false;

    const myTurn = (): boolean => !!last && last.turn === mySeat;
    const canRoll = (): boolean => myTurn() && (last as YachtState).rolled < 3;

    /* 종이 위 점수표. 캔버스에 직접 그린다. 이름과 칸과 점수. 지금 적을 수 있는 값은 안 그린다(종이는 기록이다) */
    const drawSheet = (c: CanvasRenderingContext2D, w: number): void => {
      const s = last;
      const cols = Math.max(1, seatNames.length);
      const left = 24;
      const nameW = 178;
      const colW = (w - left * 2 - nameW) / cols;
      const rowH = 40;
      const top = 30;
      c.fillStyle = '#3a2a18';
      c.strokeStyle = 'rgba(80,55,30,.55)';
      c.lineWidth = 1.2;
      c.font = '600 20px "Noto Serif KR","Nanum Myeongjo",Georgia,serif';
      c.textBaseline = 'middle';
      /* 제목줄. 자리 이름 */
      seatNames.forEach((name, i) => {
        c.textAlign = 'center';
        c.font = (i === mySeat ? '700 ' : '400 ') + '17px "Noto Serif KR","Nanum Myeongjo",Georgia,serif';
        c.fillText(name.slice(0, 6), left + nameW + colW * (i + 0.5), top + rowH / 2);
      });
      const rows: Array<{ label: string; cat?: Cat; total?: 'upper' | 'bonus' | 'sum' }> = [
        ...UPPER.map((cat) => ({ label: t('arcade.yacht.cat.' + cat), cat })),
        { label: t('arcade.yacht.sheet.upper'), total: 'upper' as const },
        { label: t('arcade.yacht.sheet.bonus'), total: 'bonus' as const },
        ...LOWER.map((cat) => ({ label: t('arcade.yacht.cat.' + cat), cat })),
        { label: t('arcade.yacht.sheet.sum'), total: 'sum' as const }
      ];
      rows.forEach((row, r) => {
        const y = top + rowH * (r + 1);
        c.beginPath();
        c.moveTo(left, y);
        c.lineTo(w - left, y);
        c.stroke();
        c.textAlign = 'left';
        c.fillStyle = row.total ? '#5c4630' : '#3a2a18';
        c.font = (row.total ? '600 ' : '400 ') + '17px "Noto Serif KR","Nanum Myeongjo",Georgia,serif';
        c.fillText(row.label, left + 8, y + rowH / 2);
        for (let i = 0; i < cols; i += 1) {
          const sheet = s?.sheet[i];
          let text = '';
          if (sheet) {
            if (row.cat) text = sheet[row.cat] === null ? '' : String(sheet[row.cat]);
            else if (row.total === 'upper') text = String(upperOf(sheet));
            else if (row.total === 'bonus') text = upperOf(sheet) >= 63 ? '35' : '';
            else text = String(totalOf(sheet));
          }
          c.textAlign = 'center';
          /* 손으로 적은 숫자. 연필 회색, 살짝 기울여 */
          c.fillStyle = row.total ? '#3a2a18' : '#2f2a2a';
          c.font = (row.total ? '700 ' : '500 ') + '19px "Noto Serif KR","Nanum Myeongjo",Georgia,serif';
          c.fillText(text, left + nameW + colW * (i + 0.5), y + rowH / 2);
        }
      });
      /* 세로줄 */
      c.beginPath();
      for (let i = 0; i <= cols; i += 1) {
        const x = left + nameW + colW * i;
        c.moveTo(x, top);
        c.lineTo(x, top + rowH * (rows.length + 1));
      }
      c.stroke();
      c.strokeStyle = 'rgba(80,55,30,.85)';
      c.lineWidth = 2;
      c.strokeRect(left, top, w - left * 2, rowH * (rows.length + 1));
    };

    let stage: DiceStage | null = mountDiceStage(host, {
      count: 5,
      onDie: (i) => { if (canRoll()) act({ kind: 'keep', index: i }); },
      onCup: () => { if (canRoll()) act({ kind: 'roll' }); },
      onPaper: () => openSheet(),
      onSound: (kind, force) => {
        if (kind === 'rattle') amb.rattle();
        else if (kind === 'clatter') amb.clatter(force);
        else amb.slide();
      },
      drawSheet
    });
    if (!stage.ok) {
      stage = null;
      dead = true;
      host.innerHTML = '';
    } else if (stage.software && !el.querySelector('.ac-t3warn')) {
      const warn = document.createElement('div');
      warn.className = 'ac-t3warn';
      warn.setAttribute('role', 'status');
      const msg = document.createElement('span');
      msg.textContent = t('arcade.t3.software');
      const to2d = document.createElement('button');
      to2d.type = 'button';
      to2d.className = 'btn btn-ghost';
      to2d.textContent = t('arcade.t3.software.btn');
      to2d.onclick = () => document.getElementById('acDim')?.click();
      warn.append(msg, to2d);
      el.prepend(warn);
    }

    /* 스페이스로 굴린다. 컵까지 손이 안 가도 되게 */
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === ' ' && canRoll() && !sheetOpen) {
        ev.preventDefault();
        act({ kind: 'roll' });
      } else if (ev.key === 'Escape' && sheetOpen) {
        closeSheet();
      }
    };
    host.addEventListener('keydown', onKey);

    /* ── 종이 ── 카메라가 내려오고 HTML 점수표가 종이 위에 겹친다 */
    let paperKey = '';
    function paintPaper(): void {
      const s = last;
      if (!s || !sheetOpen) return;
      const key = JSON.stringify([s.sheet, s.dice, s.turn, s.rolled, mySeat]);
      if (key === paperKey) return;
      paperKey = key;
      const mine = s.sheet[mySeat];
      const my = myTurn();
      const cell = (i: number, cat: Cat): string => {
        const sheet = s.sheet[i];
        const done = sheet?.[cat];
        if (done !== null && done !== undefined) return '<td class="ac-ycdone">' + done + '</td>';
        if (i === mySeat && my && mine) {
          const would = scoreOf(cat, s.dice);
          return '<td><button type="button" class="ac-yccell' + (would === 0 ? ' ac-zero' : '') + '" data-c="' + cat + '">' + would + '</button></td>';
        }
        return '<td></td>';
      };
      const row = (cat: Cat): string =>
        '<tr><th>' + esc(t('arcade.yacht.cat.' + cat)) + '</th>' + seatNames.map((_, i) => cell(i, cat)).join('') + '</tr>';
      const totalRow = (label: string, f: (sheet: Record<Cat, number | null>) => string, cls = ''): string =>
        '<tr class="ac-yctot' + cls + '"><th>' + esc(label) + '</th>' + seatNames.map((_, i) => '<td>' + (s.sheet[i] ? f(s.sheet[i]) : '') + '</td>').join('') + '</tr>';
      paperEl.innerHTML =
        '<div class="ac-ycpaperin">' +
        '<div class="ac-ychead">' +
        '<div class="ac-ycdice">' + s.dice.map((d, i) => die(d, { keep: s.keep[i], can: false, label: String(d) })).join('') + '</div>' +
        '<div class="ac-ycleft">' + esc(my ? t('arcade.yacht.sheet.pick') : t('arcade.yacht.sheet.wait', { who: seatNames[s.turn] ?? '' })) + '</div>' +
        '<button type="button" class="ac-ycclose" aria-label="' + esc(t('arcade.yacht.sheet.close')) + '">×</button>' +
        '</div>' +
        '<table class="ac-yctable"><thead><tr><th></th>' +
        seatNames.map((n, i) => '<th' + (i === mySeat ? ' class="ac-me"' : '') + (i === s.turn ? ' data-turn="1"' : '') + '>' + esc(n) + '</th>').join('') +
        '</tr></thead><tbody>' +
        UPPER.map(row).join('') +
        totalRow(t('arcade.yacht.sheet.upper'), (sh) => upperOf(sh) + ' / 63') +
        totalRow(t('arcade.yacht.sheet.bonus'), (sh) => (upperOf(sh) >= 63 ? '35' : '')) +
        LOWER.map(row).join('') +
        totalRow(t('arcade.yacht.sheet.sum'), (sh) => String(totalOf(sh)), ' ac-ycsum') +
        '</tbody></table></div>';
      paperEl.querySelectorAll<HTMLButtonElement>('.ac-yccell').forEach((b) => {
        b.onclick = () => {
          const cat = b.dataset.c as Cat;
          if (!myTurn()) return;
          amb.scratch();
          act({ kind: 'write', cat });
          closeSheet();
        };
      });
      (paperEl.querySelector('.ac-ycclose') as HTMLButtonElement).onclick = () => closeSheet();
    }
    function openSheet(): void {
      if (sheetOpen || dead) return;
      sheetOpen = true;
      paperKey = '';
      stage?.sheetMode(true);
      stage?.canAct(false);
      paintPaper();
      paperEl.hidden = false;
      /* 카메라가 닿을 즈음 종이가 떠오른다 */
      paperEl.classList.remove('ac-show');
      window.setTimeout(() => { if (sheetOpen) paperEl.classList.add('ac-show'); }, 380);
    }
    function closeSheet(): void {
      if (!sheetOpen) return;
      sheetOpen = false;
      if (autoTimer) window.clearTimeout(autoTimer);
      autoTimer = 0;
      paperEl.classList.remove('ac-show');
      paperEl.hidden = true;
      stage?.sheetMode(false);
      stage?.canAct(canRoll());
    }
    paperEl.addEventListener('pointerdown', (ev) => {
      /* 종이 밖(어두운 자리)을 누르면 닫는다 */
      if (ev.target === paperEl) closeSheet();
    });

    let sig = '';
    let sheetSig = '';
    let seatSig = '';
    let prevTurn = -1;
    let prevRolled = -1;
    let finished = false;
    return (v, seat) => {
      const s = v.state;
      mySeat = seat;
      last = s;
      if (dead || !stage) return;
      const names = v.seats.map((x) => x.name);
      const nk = names.join('');
      if (nk !== seatSig) {
        seatSig = nk;
        seatNames = names;
        sheetSig = '';
      }
      /* 주사위. 차례가 바뀌었거나 굴린 횟수가 늘었으면 컵에서 쏟는다 */
      const key = s.turn + ':' + s.rolled + ':' + s.dice.join('') + ':' + s.keep.map((k) => (k ? 1 : 0)).join('');
      if (key !== sig) {
        const first = sig === '';
        sig = key;
        const rolled = !first && (s.turn !== prevTurn || s.rolled > prevRolled);
        if (rolled && sheetOpen) closeSheet();
        stage.set(s.dice, s.keep, rolled);
        prevTurn = s.turn;
        prevRolled = s.rolled;
        /* 세 번 다 굴렸고 내 차례면, 멎은 뒤 종이가 온다 */
        if (autoTimer) window.clearTimeout(autoTimer);
        autoTimer = 0;
        if (rolled && s.rolled >= 3 && s.turn === seat && !v.finished) {
          autoTimer = window.setTimeout(() => { autoTimer = 0; if (last === s || (last && last.turn === seat && last.rolled >= 3)) openSheet(); }, 2100);
        }
      }
      stage.rollsLeft(v.finished ? 0 : Math.max(0, 3 - s.rolled));
      stage.canAct(canRoll() && !sheetOpen);
      /* 종이. 점수가 바뀔 때만 다시 그린다 */
      const sk = JSON.stringify(s.sheet) + '|' + seat;
      if (sk !== sheetSig) {
        sheetSig = sk;
        stage.sheetDirty();
      }
      if (sheetOpen) paintPaper();
      /* 자리 카드. 합계와 차례 */
      const cards = seatCards();
      cards.forEach((card, i) => {
        const sheet = s.sheet[i];
        const total = sheet ? totalOf(sheet) : 0;
        const e = sub(card, 'ac-rule');
        const txt = t('arcade.yacht.total', { n: String(total) });
        if (e.textContent !== txt) e.textContent = txt;
        card.classList.toggle('ac-turn', !v.finished && i === s.turn);
      });
      host.classList.toggle('ac-waiting', !myTurn());
      if (v.finished && !finished) {
        finished = true;
        if (autoTimer) window.clearTimeout(autoTimer);
        autoTimer = 0;
        closeSheet();
        stage.finish();
      }
    };
  }
};
