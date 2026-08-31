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
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountDiceStage, type DiceStage } from '../dice-stage';
import { barAmbience } from '../bar-ambience';
import { roomAmbience } from '../ambience';
import { sceneOf, specOf } from '../scenes';
import { die } from '../die';
import { castByName, faceSvg, lineOf, type Cast, type Mood } from '../cast';
import { noteYachtGame, readYachtStats, avgOf } from '../yacht-stats';
import { CATS, scoreOf, totalOf, type Cat, type YachtState, type YachtAction } from './yacht';

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
      '<button type="button" class="ac-ycpin" id="acYcPin" aria-pressed="false"></button>' +
      '<div class="ac-yctoast" id="acYcToast" role="status"></div>' +
      '<div class="ac-yccombo" id="acYcCombo" aria-hidden="true"></div>' +
      '<div class="ac-ychud" id="acYcHud"></div>' +
      '<div class="ac-ycpaper" id="acYcPaper" hidden></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const paperEl = el.querySelector('#acYcPaper') as HTMLElement;
    /* 알림. 차례가 넘어가거나 누가 적으면 화면 위쪽 가운데에 한 줄(사용자 요청). 레퍼런스도 "X's ROUND" 오버레이 */
    const toastEl = el.querySelector('#acYcToast') as HTMLElement;
    /* 족보 연출. 큰 글자가 판 위에 떠오르고(레퍼런스 스팀: 큰 글자 + 별), 요트와 큰 스트레이트는 종이 조각이 내린다 */
    const comboEl = el.querySelector('#acYcCombo') as HTMLElement;
    let comboTimer = 0;
    const celebrate = (text: string, level: number): void => {
      comboEl.innerHTML = '<b>' + esc(text) + '</b>' + (level >= 2 ? Array.from({ length: level >= 3 ? 28 : 16 }, (_, i) => '<i style="--x:' + (Math.random() * 100).toFixed(1) + '%;--d:' + (Math.random() * 0.5).toFixed(2) + 's;--r:' + Math.round(Math.random() * 360) + 'deg;--h:' + (i % 3) + '"></i>').join('') : '');
      comboEl.className = 'ac-yccombo ac-show ac-lv' + level;
      amb.fanfare(level);
      if (comboTimer) window.clearTimeout(comboTimer);
      comboTimer = window.setTimeout(() => { comboEl.className = 'ac-yccombo'; comboEl.innerHTML = ''; comboTimer = 0; }, level >= 3 ? 2600 : 1900);
    };
    const comboLevel = (cat: Cat): number => (cat === 'yacht' ? 3 : cat === 'lstraight' || cat === 'fourkind' || cat === 'fullhouse' ? 2 : cat === 'sstraight' ? 1 : 0);
    /**
     * 탁자 위 상황판(사용자 요청: 누가 있고, 차례 순서, 지금 누구, 예상 점수). 레퍼런스 공통 다섯:
     * 라운드, 차례 표시된 사람 목록, 남은 굴림, 지금 적으면 몇 점, 상태 띠. 자리 카드는 숨김
     */
    const hudEl = el.querySelector('#acYcHud') as HTMLElement;
    let hudKey = '';
    /* 저택 사람(MDD). 얼굴은 기하 도형, 표정과 대사는 임시(`cast.ts`). 자리 이름이 사람이면 붙는다 */
    const moods = new Map<number, Mood>();
    const bubbles = new Map<number, { text: string; until: number }>();
    let hudTimer = 0;
    const repaintSoon = (ms: number): void => {
      if (hudTimer) window.clearTimeout(hudTimer);
      hudTimer = window.setTimeout(() => { hudTimer = 0; hudKey = ''; if (shown) paintHud(shown, lastFin); }, ms);
    };
    const castAt = (seat: number): Cast | null => castByName(seatNames[seat] ?? '');
    const sayAs = (seat: number, text: string, ms = 2600): void => {
      if (!text) return;
      bubbles.set(seat, { text, until: performance.now() + ms });
      hudKey = '';
      if (shown) paintHud(shown, lastFin);
      repaintSoon(ms + 50);
    };
    const castSay = (seat: number, key: Parameters<typeof lineOf>[1], chance = 1): void => {
      const c = castAt(seat);
      if (!c || Math.random() > chance) return;
      sayAs(seat, lineOf(c, key, seatNames[mySeat] ?? ''));
    };
    const moodOf = (seat: number, m: Mood, ms = 2600): void => {
      moods.set(seat, m);
      hudKey = '';
      if (shown) paintHud(shown, lastFin);
      window.setTimeout(() => { if (moods.get(seat) === m) { moods.set(seat, 'calm'); hudKey = ''; if (shown) paintHud(shown, lastFin); } }, ms);
    };
    let lastFin = false;
    /* 주사위가 구르는 동안은 결과를 안 보여 준다. 표의 미리보기와 카드의 최고 칸이 먼저 답을
       알려 줘서, 굴림을 볼 이유가 없었다(2026-08-31 사용자 지적: 다 멈추기도 전에 스포당함) */
    let rolling = false;
    /* 끝의 의식. 순위는 합계로, 같으면 같은 순위 */
    let ranks: number[] = [];
    let lastStats: ReturnType<typeof readYachtStats> | null = null;
    let lastRound = -1;
    const rankOf = (totals: number[]): number[] => totals.map((tv) => 1 + totals.filter((o) => o > tv).length);
    /* 결과 종이 아래 내역 한 줄씩. 셸의 결과창(`#acOver`)에 끼워 넣는다. 셸은 순위와 합계만 안다 */
    const paintResult = (s: YachtState): void => {
      const over = document.getElementById('acOver');
      if (!over) return;
      over.querySelector('#acYcResult')?.remove();
      const box = document.createElement('div');
      box.id = 'acYcResult';
      box.className = 'ac-ycresult';
      const totals = s.sheet.map((sh) => (sh ? totalOf(sh) : 0));
      const rk = rankOf(totals);
      const order = seatNames.map((_, i) => i).sort((a, b) => rk[a] - rk[b] || a - b);
      box.innerHTML = order.map((i) => {
        const sh = s.sheet[i];
        if (!sh) return '';
        const upper = upperOf(sh);
        let bestCat: Cat | null = null;
        for (const c of CATS) if (sh[c] !== null && (bestCat === null || (sh[c] as number) > (sh[bestCat] as number))) bestCat = c;
        const bits = [
          t('arcade.yacht.result.upper', { n: String(upper) }) + (upper >= 63 ? ' +35' : ''),
          sh.yacht ? t('arcade.yacht.result.yacht') : '',
          bestCat ? t('arcade.yacht.cat.' + bestCat) + ' ' + sh[bestCat] : ''
        ].filter(Boolean).join(' <i></i> ');
        return '<div class="ac-ycresrow' + (i === mySeat ? ' ac-me' : '') + (rk[i] === 1 ? ' ac-win' : '') + '"><b>' + esc(t('arcade.yacht.hud.rank', { n: String(rk[i]) })) + '</b><span>' + esc(seatNames[i] ?? '') + '</span><em>' + totals[i] + '</em><small>' + bits + '</small></div>';
      }).join('');
      const st = lastStats ?? readYachtStats();
      if (st.games > 0) {
        const line = document.createElement('div');
        line.className = 'ac-ycstats';
        line.textContent = t('arcade.yacht.result.stats', { games: String(st.games), best: String(st.best), avg: String(avgOf(st)), yachts: String(st.yachts), bonus: String(st.games ? Math.round((st.bonuses / st.games) * 100) : 0) });
        box.appendChild(line);
        /* 최근 여덟 판 막대. 오늘이 잘한 판인지 한눈에(기록이 숫자로만 있으면 안 읽힌다) */
        const last8 = st.recent.slice(-8);
        if (last8.length >= 2) {
          const hi = Math.max(...last8.map((r) => r.score), 1);
          const spark = document.createElement('div');
          spark.className = 'ac-ycspark';
          spark.setAttribute('aria-label', t('arcade.yacht.result.spark'));
          spark.innerHTML = last8.map((r, k) => '<i style="--h:' + Math.max(6, Math.round((r.score / hi) * 100)) + '%"' + (k === last8.length - 1 ? ' class="ac-now"' : '') + '><b>' + r.score + '</b></i>').join('');
          box.appendChild(spark);
        }
      }
      const list = over.querySelector('#acOverList');
      if (list) list.after(box);
      else over.appendChild(box);
    };
    let seatBots: boolean[] = [];
    const bestOpen = (s: YachtState, seat: number): { cat: Cat; n: number } | null => {
      const sheet = s.sheet[seat];
      if (!sheet) return null;
      let best: { cat: Cat; n: number } | null = null;
      for (const c of CATS) {
        if (sheet[c] !== null) continue;
        const n = scoreOf(c, s.dice);
        if (!best || n > best.n) best = { cat: c, n };
      }
      return best;
    };
    const paintHud = (s: YachtState, fin: boolean): void => {
      lastFin = fin;
      const now = performance.now();
      bubbles.forEach((b, i) => { if (b.until <= now) bubbles.delete(i); });
      const key = JSON.stringify([s.sheet, s.dice, s.turn, s.rolled, mySeat, fin, rolling, seatNames, [...bubbles.entries()].map(([i, b]) => i + b.text), [...moods.entries()]]);
      if (key === hudKey) return;
      hudKey = key;
      const done0 = s.sheet[0] ? CATS.filter((c) => s.sheet[0][c] !== null).length : 0;
      const round = Math.min(CATS.length, done0 + 1);
      const best = fin || rolling ? null : bestOpen(s, s.turn);
      /* 화면 아래 한 줄. 차례 순서대로 카드, 지금 차례는 금테(사용자 구상). 라운드는 줄 왼쪽 끝 */
      hudEl.innerHTML =
        '<div class="ac-ychudround">' + esc(t('arcade.yacht.hud.round', { n: String(round), m: String(CATS.length) })) + '</div>' +
        seatNames.map((name, i) => {
          const sheet = s.sheet[i];
          const total = sheet ? totalOf(sheet) : 0;
          const cur = !fin && i === s.turn;
          const mineNow = cur && i === mySeat;
          /* 내 차례 카드에는 굴리기 버튼(레퍼런스 bloob: "굴리기 (n/3)" 버튼 하나가 상태를 다 말한다). 컵과 스페이스는 그대로 */
          const rollBtn = mineNow
            ? (s.rolled < 3
                ? '<button type="button" class="ac-ycroll" id="acYcRoll"' + (idle() ? '' : ' disabled') + '>' + esc(idle() ? t(s.keep.every(Boolean) ? 'arcade.yacht.hud.rollall' : s.rolled === 1 ? 'arcade.yacht.hud.roll2' : 'arcade.yacht.hud.roll3', { n: String(s.rolled + 1) }) : t('arcade.yacht.deny.busy')) + '</button>'
                : '<span class="ac-ycroll ac-ycroll-off">' + esc(t('arcade.yacht.sheet.pick')) + '</span>')
            : '';
          const sub = cur
            ? '<span class="ac-ychudsub">' + esc(t('arcade.yacht.hud.rolls', { n: String(s.rolled) })) +
              (best ? ' <i></i> ' + esc(t('arcade.yacht.hud.best', { cat: t('arcade.yacht.cat.' + best.cat), n: String(best.n) })) : '') + '</span>' + rollBtn
            : '';
          const cast = castAt(i);
          const face = cast ? '<span class="ac-ychudface">' + faceSvg(cast, cur ? (moods.get(i) ?? 'think') : (moods.get(i) ?? 'calm')) + '</span>' : '';
          const rank = fin && ranks[i] ? '<i class="ac-ychudrank' + (ranks[i] === 1 ? ' ac-first' : '') + '">' + esc(t('arcade.yacht.hud.rank', { n: String(ranks[i]) })) + '</i>' : '';
          const b = bubbles.get(i);
          const bubble = b ? '<span class="ac-ychudbubble">' + esc(b.text) + '</span>' : '';
          return '<div class="ac-ychudcard' + (cur ? ' ac-cur' : '') + (i === mySeat ? ' ac-me' : '') + (cast ? ' ac-cast' : '') + (fin && ranks[i] === 1 ? ' ac-winner' : '') + '">' + bubble + face + rank +
            '<span class="ac-ychudname">' + esc(name) + (i === mySeat ? ' <small>' + esc(t('arcade.yacht.hud.me')) + '</small>' : seatBots[i] && !cast ? ' <small>' + esc(t('arcade.yacht.hud.bot')) + '</small>' : '') + '</span>' +
            '<b class="ac-ychudscore">' + total + '</b>' + sub + '</div>';
        }).join('');
      const rb = hudEl.querySelector<HTMLButtonElement>('#acYcRoll');
      /* 손 모델상 굴린 다섯은 전부 홈에 있다. 아무것도 안 내렸으면 버튼이 **전부 내리고** 굴린다(안 그러면 버튼이 늘 거절) */
      if (rb) rb.onclick = () => {
        if (!last || last.turn !== mySeat || last.rolled >= 3) { blip('bad'); toast(whyNot('roll') ?? t('arcade.yacht.deny.rolls'), 1600, true); return; }
        if (!idle()) { blip('bad'); toast(t('arcade.yacht.deny.busy'), 1600, true); return; }
        if (last.keep.every(Boolean)) last.keep.forEach((_, i) => act({ kind: 'keep', index: i }));
        act({ kind: 'roll' });
      };
    };
    let toastTimer = 0;
    const toast = (text: string, ms = 1700, deny = false): void => {
      toastEl.textContent = text;
      toastEl.classList.toggle('ac-deny', deny);
      toastEl.classList.add('ac-show');
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { toastEl.classList.remove('ac-show'); toastTimer = 0; }, ms);
    };
    /* 방은 취향(`scenes.ts`). 바 카운터는 야추 전용, 나머지 넷은 오목과 같은 방. 갈아 끼우면 오락실이 화면을 새로 세운다 */
    const sceneId = sceneOf('yacht');
    const isBar = sceneId === 'bar';
    /* 주사위 소리는 어느 방이든 바 소리 모듈. 배경(웅성거림, 잔)은 바에서만. 다른 방은 오목과 같은 방 소리 */
    const amb = barAmbience(host, isBar);
    const roomAmb = isBar ? null : roomAmbience(host, specOf(sceneId).voice);
    host.addEventListener('pointerdown', () => { amb.wake(); roomAmb?.wake(); }, { passive: true });

    let last: YachtState | null = null;
    let seatNames: string[] = [];
    let mySeat = -1;
    let sheetOpen = false;
    /* 점수표는 왼쪽에 **늘 보인다**(레퍼런스: 클럽하우스 51 야추는 종이, 쟁반, 컵이 한 화면).
       Tab 또는 왼쪽 위 버튼으로 숨긴다. 사람마다 남는다 */
    let pinned = true;
    try {
      pinned = localStorage.getItem('karmolab.arcade.yacht.pin') !== '0';
    } catch {
      /* 저장 못 하면 이번 판만 */
    }
    let autoTimer = 0;
    let dead = false;

    const myTurn = (): boolean => !!last && last.turn === mySeat;
    const canRoll = (): boolean => myTurn() && (last as YachtState).rolled < 3;
    /* 못 하는 조작에는 삑과 이유(사용자 요구: 왜 안 되는지 알려야 한다). 조용히 무시하면 고장으로 보인다 */
    const deny = (key: string, params?: Record<string, string>): void => {
      blip('bad');
      toast(t(key, params), 1600, true);
    };
    /* 손의 조합. 높은 것부터. 없으면 null */
    const comboOf = (dice: number[]): Cat | null => {
      for (const c of ['yacht', 'lstraight', 'sstraight', 'fullhouse', 'fourkind'] as Cat[]) if (scoreOf(c, dice) > 0) return c;
      return null;
    };
    const whyNot = (what: 'roll' | 'keep'): string | null => {
      if (!last) return null;
      if (last.turn !== mySeat) return t('arcade.yacht.deny.turn', { who: seatNames[last.turn] ?? '' });
      if (last.rolled >= 3) return t(what === 'roll' ? 'arcade.yacht.deny.rolls' : 'arcade.yacht.deny.keep3');
      if (what === 'roll' && last.keep.every(Boolean)) return t('arcade.yacht.deny.allkept');
      if (!idle()) return t('arcade.yacht.deny.busy');
      return null;
    };

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
      scene: sceneId,
      onDie: (i) => {
        const why = whyNot('keep');
        if (why) { blip('bad'); toast(why, 1600, true); return; }
        act({ kind: 'keep', index: i });
      },
      onCup: () => {
        const why = whyNot('roll');
        if (why) { blip('bad'); toast(why, 1600, true); return; }
        act({ kind: 'roll' });
      },
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

    const pinBtn = el.querySelector('#acYcPin') as HTMLButtonElement;
    const paintPin = (): void => {
      pinBtn.textContent = t('arcade.yacht.sheet.pin');
      pinBtn.setAttribute('aria-pressed', String(pinned));
      paperEl.classList.toggle('ac-pin', pinned);
      /* 두 칸 나란히. 점수표가 왼쪽 칸, 무대는 나머지(해체 분석 §4. 레퍼런스 넷 다 한 화면) */
      el.classList.toggle('ac-ycsplit', pinned);
      if (pinned) {
        paperKey = '';
        paperEl.hidden = false;
        paperEl.classList.add('ac-show');
        paintPaper();
      } else if (!sheetOpen) {
        paperEl.hidden = true;
        paperEl.classList.remove('ac-show');
      }
    };
    const togglePin = (): void => {
      pinned = !pinned;
      try {
        localStorage.setItem('karmolab.arcade.yacht.pin', pinned ? '1' : '0');
      } catch {
        /* 위와 같다 */
      }
      if (pinned && sheetOpen) closeSheet();
      paintPin();
    };
    pinBtn.onclick = togglePin;

    /* 스페이스로 굴린다. 컵까지 손이 안 가도 되게. Tab 은 종이 고정 */
    const onKey = (ev: KeyboardEvent): void => {
      /* 셸(`#acStage`)은 Space 와 Enter 를 무대 안 첫 버튼 클릭으로 돌린다. 여기서 끊지 않으면 점수표 버튼이 눌린다(실측) */
      if (ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        const why = whyNot('roll');
        if (why) { blip('bad'); toast(why, 1600, true); return; }
        if (!sheetOpen) act({ kind: 'roll' });
      } else if (ev.key === 'Escape' && sheetOpen) {
        closeSheet();
      } else if (ev.key === 's' || ev.key === 'S' || ev.key === 'ㄴ') {
        /* Tab 은 안 가로챈다. 키보드로 화면을 도는 유일한 길이라 뺏으면 손이 막힌다(접근성) */
        ev.preventDefault();
        ev.stopPropagation();
        togglePin();
      }
    };
    el.addEventListener('keydown', onKey);

    /* ── 종이 ── 카메라가 내려오고 HTML 점수표가 종이 위에 겹친다 */
    let paperKey = '';
    /* 방금 적힌 칸. 종이에 잉크가 번지듯 한 번 강조한다(레퍼런스 bloob 은 확정 색이 갈릴 뿐이라 우리 쪽 손맛) */
    let justWrote: { seat: number; cat: Cat } | null = null;
    function paintPaper(): void {
      const s = last;
      if (!s || (!sheetOpen && !pinned)) return;
      const key = JSON.stringify([s.sheet, s.dice, s.turn, s.rolled, mySeat, rolling]);
      if (key === paperKey) return;
      paperKey = key;
      const mine = s.sheet[mySeat];
      const my = myTurn();
      /* 지금 제일 값진 칸. 레퍼런스 클론이 최고 칸을 색으로 짚어 준다. 눈이 표를 훑지 않아도 된다 */
      const top = my && mine && !rolling ? bestOpen(s, mySeat) : null;
      const cell = (i: number, cat: Cat): string => {
        const sheet = s.sheet[i];
        const done = sheet?.[cat];
        if (done !== null && done !== undefined) return '<td class="ac-ycdone' + (justWrote && justWrote.seat === i && justWrote.cat === cat ? ' ac-ink' : '') + '" data-done="1">' + done + '</td>';
        if (i === mySeat && my && mine) {
          /* 구르는 중에는 칸을 자리만 남기고 비운다. 레이아웃은 그대로(사용자 지적: 글자 유무로 표가 달라지면 안 된다) */
          if (rolling) return '<td><button type="button" class="ac-yccell ac-zero" disabled></button></td>';
          const would = scoreOf(cat, s.dice);
          /* 0점 칸은 숫자를 안 적는다(레퍼런스 bloob: 빈 칸에 옅은 강조만). 0 이 열두 개면 표가 시끄럽다 */
          return '<td><button type="button" class="ac-yccell' + (would === 0 ? ' ac-zero' : '') + (top && top.cat === cat && would > 0 ? ' ac-top' : '') + '" data-c="' + cat + '">' + (would === 0 ? '' : would) + '</button></td>';
        }
        return '<td></td>';
      };
      /* 칸 이름에 규칙 한 줄(레퍼런스는 "게임 방법" 창. 판 안에서 규칙을 볼 길이 없었다) */
      const row = (cat: Cat): string =>
        '<tr><th title="' + esc(t('arcade.yacht.rule.' + cat)) + '">' + esc(t('arcade.yacht.cat.' + cat)) + '</th>' + seatNames.map((_, i) => cell(i, cat)).join('') + '</tr>';
      const totalRow = (label: string, f: (sheet: Record<Cat, number | null>) => string, cls = ''): string =>
        '<tr class="ac-yctot' + cls + '"><th>' + esc(label) + '</th>' + seatNames.map((_, i) => '<td>' + (s.sheet[i] ? f(s.sheet[i]) : '') + '</td>').join('') + '</tr>';
      paperEl.innerHTML =
        '<div class="ac-ycpaperin">' +
        '<div class="ac-ychead">' +
        '<div class="ac-ycdice' + (rolling ? ' ac-ycrolling' : '') + '">' + s.dice.map((d, i) => (rolling ? '<span class="ac-die ac-die-roll" aria-hidden="true"></span>' : die(d, { keep: s.keep[i], can: false, label: String(d) }))).join('') + '</div>' +
        '<div class="ac-ycleft">' + esc(rolling ? t('arcade.yacht.sheet.rolling') : lastFin ? t('arcade.yacht.sheet.done') : my ? (s.rolled < 3 ? t('arcade.yacht.sheet.keep', { n: String(3 - s.rolled) }) : (comboOf(s.dice) ? t('arcade.yacht.sheet.combo', { cat: t('arcade.yacht.cat.' + (comboOf(s.dice) as Cat)) }) : t('arcade.yacht.sheet.pick'))) : t('arcade.yacht.sheet.wait', { who: seatNames[s.turn] ?? '' })) + '</div>' +
        '<button type="button" class="ac-ycclose" aria-label="' + esc(t('arcade.yacht.sheet.close')) + '">×</button>' +
        '</div>' +
        '<table class="ac-yctable"><thead><tr><th></th>' +
        seatNames.map((n, i) => '<th' + (i === mySeat ? ' class="ac-me"' : '') + (i === s.turn && !lastFin ? ' data-turn="1"' : '') + (lastFin && ranks[i] === 1 ? ' data-win="1"' : '') + '>' + esc(n) + '</th>').join('') +
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
          if (!pinned) closeSheet();
        };
      });
      (paperEl.querySelector('.ac-ycclose') as HTMLButtonElement).onclick = () => closeSheet();
      /* 이미 적은 칸, 남의 열을 누르면 왜 안 되는지 */
      paperEl.querySelectorAll<HTMLElement>('td[data-done]').forEach((td) => { td.onclick = () => deny('arcade.yacht.deny.written'); });
    }
    function openSheet(): void {
      if (sheetOpen || dead || pinned) return;
      sheetOpen = true;
      paperKey = '';
      stage?.sheetMode(true);
      stage?.canAct(false);
      paintPaper();
      paperEl.hidden = false;
      /* 카메라가 닿을 즈음 종이가 떠오른다 */
      paperEl.classList.remove('ac-show');
      /* 떠오른 뒤에도 0.4초는 칸을 안 받는다. 방금 누르던 손이 그대로 떨어지는 것을 막는다 */
      paperEl.classList.add('ac-arm');
      window.setTimeout(() => { if (sheetOpen) paperEl.classList.add('ac-show'); }, 380);
      window.setTimeout(() => { if (sheetOpen) paperEl.classList.remove('ac-arm'); }, 380 + 400);
    }
    function closeSheet(): void {
      if (!sheetOpen) return;
      sheetOpen = false;
      if (autoTimer) window.clearTimeout(autoTimer);
      autoTimer = 0;
      paperEl.classList.remove('ac-show');
      paperEl.classList.remove('ac-arm');
      paperEl.hidden = true;
      stage?.sheetMode(false);
      stage?.canAct(canRoll());
      if (pinned) paintPin();
    }
    paperEl.addEventListener('pointerdown', (ev) => {
      /* 종이 밖(어두운 자리)을 누르면 닫는다 */
      if (ev.target === paperEl && !pinned) closeSheet();
    });
    paintPin();

    let sig = '';
    let sheetSig = '';
    let seatSig = '';
    let prevTurn = -1;
    let prevRolled = -1;
    let finished = false;
    /**
     * 화면은 수를 **차례대로**. 봇은 0.25~0.9초마다 수를 두고 굴림 연출은 2초 넘음
     * 오는 대로 그리면 쏟는 중에 남기고, 남기는 중에 또 쏟음(사용자 지적). 줄을 세워 앞 연출이
     * 끝난 뒤 다음 것. 규칙은 이미 끝나 있고 화면만 늦게 따라감
     */
    const seq: Array<{ s: YachtState; finished: boolean }> = [];
    let busyUntil = 0;
    let seqTimer = 0;
    let shown: YachtState | null = null;
    const ROLL_MS = 4000; /* 모으기와 낙하 0.72 + 흔들기와 기울이기 0.62 + 굴림 최대 2.6 */
    /* 남의 차례는 1.8배속. 그대로 두니 봇 한 차례가 15초, 셋이면 판이 200초였다(실측) */
    const BOT_SPEED = 1.8;
    const KEEP_MS = 380;
    const present = (s: YachtState, fin: boolean): void => {
      if (!stage) return;
      const before = shown;
      const rolled = before !== null && (s.turn !== prevTurn || s.rolled > prevRolled);
      const kept = before !== null && !rolled && s.keep.some((k, i) => k !== before.keep[i]);
      if (rolled && sheetOpen) closeSheet();
      const mul = s.turn === mySeat ? 1 : BOT_SPEED;
      stage.speed(mul);
      /* 누가 적었나. 앞 상태와 점수표를 비교해 새로 찬 칸 */
      if (before) {
        before.sheet.forEach((sh, i) => {
          const now = s.sheet[i];
          if (!now) return;
          const cat = (Object.keys(now) as Cat[]).find((c) => sh[c] === null && now[c] !== null);
          if (!cat) return;
          const who = seatNames[i] ?? '';
          const got = now[cat] ?? 0;
          justWrote = { seat: i, cat };
          window.setTimeout(() => { if (justWrote && justWrote.cat === cat && justWrote.seat === i) { justWrote = null; paperKey = ''; if (last) paintPaper(); } }, 1400);
          paperKey = '';
          const lv = got > 0 ? comboLevel(cat) : 0;
          if (lv) celebrate(t('arcade.yacht.cat.' + cat) + (lv >= 3 ? '!' : ''), lv);
          if (cat === 'yacht' && got) toast(t('arcade.yacht.toast.yacht', { who }), 2600);
          else toast(t('arcade.yacht.toast.wrote', { who, cat: t('arcade.yacht.cat.' + cat), n: String(got) }), 2200);
          stage?.write();
          if (castAt(i)) {
            if (got >= 20) { moodOf(i, 'glad'); castSay(i, 'good', 0.6); }
            else if (got === 0) moodOf(i, 'sad');
          }
          if (i === mySeat && (cat === 'yacht' && got > 0 || got >= 25)) {
            seatNames.forEach((_, j) => { if (j !== mySeat && castAt(j)) { moodOf(j, 'tease', 2200); castSay(j, 'danger', 0.7); } });
          }
          /* 위 여섯 합이 63을 넘는 순간. 덤 35 */
          if (upperOf(sh) < 63 && upperOf(now) >= 63) window.setTimeout(() => { toast(t('arcade.yacht.toast.bonus', { who }), 2300); celebrate(t('arcade.yacht.sheet.bonus'), 1); }, 2300);
        });
        if (!fin && s.turn !== before.turn) {
          window.setTimeout(() => {
            if (last && last.turn === s.turn) toast(s.turn === mySeat ? t('arcade.yacht.toast.me') : t('arcade.yacht.toast.turn', { who: seatNames[s.turn] ?? '' }));
          }, 1500);
        }
      }
      /* 사람의 말과 표정. 봇 차례의 굴림, 좋은 점수, 0점, 내 요트에 놀람 */
      if (rolled && s.turn !== mySeat && castAt(s.turn)) {
        moodOf(s.turn, 'think', 2000);
        castSay(s.turn, 'move', s.rolled === 1 ? 0.5 : 0.25);
      }
      if (before === null) {
        seatNames.forEach((_, i) => { if (i !== mySeat && castAt(i)) window.setTimeout(() => { if (host.isConnected) castSay(i, 'hello'); }, 900 + i * 700); });
      }
      /* 굴림 알림. 첫 굴림은 차례 알림이 대신한다 */
      if (rolled && s.rolled >= 2) {
        toast(s.turn === mySeat ? t('arcade.yacht.toast.roll.me', { n: String(s.rolled) }) : t('arcade.yacht.toast.roll', { who: seatNames[s.turn] ?? '', n: String(s.rolled) }), 1400);
      }
      stage.set(s.dice, s.keep, rolled);
      stage.rollsLeft(fin ? 0 : Math.max(0, 3 - s.rolled));
      if (rolled) rolling = true;
      paintHud(s, fin);
      prevTurn = s.turn;
      prevRolled = s.rolled;
      shown = s;
      busyUntil = performance.now() + (rolled ? ROLL_MS / mul : kept ? KEEP_MS / mul : 0);
      /* 마지막 라운드. 열두 번째 칸을 채우기 시작하면 한 번 알린다(긴장감. 레퍼런스 스팀도 라운드를 셈) */
      const doneMin = Math.min(...s.sheet.map((sh) => (sh ? CATS.filter((c) => sh[c] !== null).length : 0)));
      if (before && doneMin === CATS.length - 1 && lastRound !== doneMin) {
        lastRound = doneMin;
        window.setTimeout(() => { if (host.isConnected) toast(t('arcade.yacht.toast.last'), 2400); }, 700);
      }
      /* 첫 차례. 판이 서자마자 내 차례인데 알 길이 없었다(사용자 지적). 알림 한 줄 */
      if (before === null && s.turn === mySeat && !fin) {
        window.setTimeout(() => { if (last && last.turn === mySeat && host.isConnected) toast(t('arcade.yacht.toast.first'), 2600); }, 900);
      }
      /* 세 번째 굴림이 멎으면 다섯이 선반 홈으로 옮겨져 **손이 완성**된다(클럽하우스 51 순서: 굴림 -> 홈 -> 적기.
         사용자 지적: 배치도 안 하고 점수판부터 띄운다). 그 뒤 조합 이름을 알린다 */
      /* 굴린 다섯은 멎은 뒤 전부 홈으로(규칙이 그렇다). 세 번째면 손이 완성된 것이라 조합을 알린다 */
      if (rolled) busyUntil += 500 / mul;
      /* 다섯이 멎고 홈에 들어간 뒤에 결과를 편다 */
      if (rolled) {
        window.setTimeout(() => {
          if (shown !== s || !host.isConnected) return;
          rolling = false;
          hudKey = '';
          paperKey = '';
          paintHud(s, fin);
          paintPaper();
        }, ROLL_MS / mul + 500 / mul);
      }
      if (rolled && s.rolled >= 3) {
        window.setTimeout(() => {
          if (shown !== s || !stage || !host.isConnected) return;
          const combo = comboOf(s.dice);
          const best = bestOpen(s, s.turn);
          toast(combo ? t('arcade.yacht.toast.combo', { cat: t('arcade.yacht.cat.' + combo) }) : t('arcade.yacht.toast.nocombo', { cat: best ? t('arcade.yacht.cat.' + best.cat) : '', n: String(best?.n ?? 0) }), 2400);
        }, ROLL_MS / mul - 350);
      }
      /* 세 번 다 굴렸고 내 차례면, 멎은 뒤 종이가 온다 */
      if (autoTimer) window.clearTimeout(autoTimer);
      autoTimer = 0;
      if (rolled && s.rolled >= 3 && s.turn === mySeat && !fin) {
        autoTimer = window.setTimeout(() => { autoTimer = 0; if (last && last.turn === mySeat && last.rolled >= 3 && host.isConnected) openSheet(); }, ROLL_MS / mul - 300);
      }
    };
    const pump = (): void => {
      if (seqTimer) window.clearTimeout(seqTimer);
      seqTimer = 0;
      if (!seq.length || !host.isConnected) return;
      const wait = busyUntil - performance.now();
      if (wait > 0) {
        seqTimer = window.setTimeout(pump, wait);
        return;
      }
      const next = seq.shift() as { s: YachtState; finished: boolean };
      present(next.s, next.finished);
      pump();
    };
    const idle = (): boolean => seq.length === 0 && performance.now() >= busyUntil;
    let idleWas = true;
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
        seatBots = v.seats.map((x) => x.bot);
        sheetSig = '';
        hudKey = '';
        if (shown) paintHud(shown, v.finished);
      }
      /* 주사위. 차례가 바뀌었거나 굴린 횟수가 늘었으면 컵에서 쏟는다. 줄을 서서 */
      const key = s.turn + ':' + s.rolled + ':' + s.dice.join('') + ':' + s.keep.map((k) => (k ? 1 : 0)).join('');
      if (key !== sig) {
        sig = key;
        seq.push({ s, finished: v.finished });
        pump();
      }
      /* 내 손은 연출이 끝난 뒤에. 굴리는 중에 또 굴리면 컵이 두 번 뒤집힌다 */
      const idleNow = idle();
      stage.canAct(canRoll() && !sheetOpen && idleNow);
      if (idleNow !== idleWas) { idleWas = idleNow; hudKey = ''; if (shown) paintHud(shown, lastFin); }
      pinBtn.hidden = v.finished;
      /* 종이. 점수가 바뀔 때만 다시 그린다 */
      const sk = JSON.stringify(s.sheet) + '|' + seat;
      if (sk !== sheetSig) {
        sheetSig = sk;
        stage.sheetDirty();
      }
      if (sheetOpen || pinned) paintPaper();
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
        const totals = s.sheet.map((sh) => (sh ? totalOf(sh) : 0));
        const top = Math.max(...totals);
        ranks = rankOf(totals);
        hudKey = '';
        paintHud(s, true);
        /* 내 기록. 이 브라우저에만(bloob 의 등급과 경험치는 계정 몫, 온라인 Change) */
        const mine = s.sheet[mySeat];
        if (mine) {
          const r = noteYachtGame(totals[mySeat] ?? 0, !!mine.yacht, upperOf(mine) >= 63);
          lastStats = r.stats;
          if (r.newBest) window.setTimeout(() => toast(t('arcade.yacht.toast.newbest', { n: String(totals[mySeat] ?? 0) }), 2600), 1200);
        }
        /* 셸의 결과창은 조금 뒤에 뜬다(판 사이 쉬는 시간). 그 뒤에 내역을 끼운다 */
        window.setTimeout(() => { if (host.isConnected) paintResult(s); }, 1000);
        window.setTimeout(() => { if (host.isConnected) paintResult(s); }, 2500);
        seatNames.forEach((_, i) => { if (i !== mySeat && castAt(i)) { moodOf(i, totals[i] === top ? 'glad' : 'sad', 8000); window.setTimeout(() => castSay(i, totals[i] === top ? 'win' : 'lose'), 600 + i * 500); } });
        if (autoTimer) window.clearTimeout(autoTimer);
        autoTimer = 0;
        closeSheet();
        stage.finish();
      }
    };
  }
};
