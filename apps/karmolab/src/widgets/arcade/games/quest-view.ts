/**
 * 오늘의 문제 화면 (change.arcade-absorbs-play 단계 4)
 *
 * 오늘 것은 하루는 표의 문제, 하루는 그날 만든 문제(진법, 단위, 용량, 시간). 글은 여기서 만들고 값과 함께
 * 첫 수로 실음. 도구는 문제 밑에서 편다(떠나면 적던 답이 날아감). 표 문제의 답은 지문으로 보냄
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { toolPage } from '../../../lib/site-base';
import { norm, MAX_TRIES, type QuestState, type QuestAction, type QuestPuzzle, type QuestGen } from './quest';

const EPOCH = Date.UTC(2026, 7, 8);
const kst = (): Date => new Date(Date.now() + 9 * 3600e3);
const dayNo = (): number => {
  const k = kst();
  return Math.max(0, Math.floor((Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - EPOCH) / 86400e3));
};

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function fingerprint(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm(s)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/* 날짜에서 나오는 난수. 같은 날이면 누구에게나 같은 문제 */
function seeded(n: number): () => number {
  let x = (n + 0x9e3779b9) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x21f0aaad) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x735a2d97) >>> 0;
  x ^= x >>> 15;
  x = x >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}
/** 그날의 갈래. 앞서 나온 갈래와 겹치면 옮김 */
function kindOf(day: number): number {
  const raw = (d: number): number => Math.floor(seeded(d)() * 4);
  const start = Math.max(1, day - 16);
  let prev = -1;
  let k = raw(start);
  for (let d = start; d <= day; d += 2) {
    k = raw(d);
    if (k === prev) k = (k + 1) % 4;
    prev = k;
  }
  return k;
}
function eul(word: string): string {
  const digit = /[0-9]$/.test(word);
  const last = digit ? '0123456789'.indexOf(word[word.length - 1]) : -1;
  const hasBatchim = digit ? [true, true, false, true, false, false, true, true, true, false][last] : true;
  return word + (hasBatchim ? t('arcade.quest.eul') : t('arcade.quest.reul'));
}
function neun(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  return word + (hangul && (last - 0xac00) % 28 !== 0 ? t('arcade.quest.eun') : t('arcade.quest.neun'));
}
/** 그날 만들어지는 문제. 표는 열여섯뿐이라 하루씩 번갈아 그날 것을 만든다 */
function madeToday(day: number): QuestPuzzle {
  const rnd = seeded(day);
  const pickOf = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  rnd();
  const kind = kindOf(day);
  if (kind === 0) {
    const n = 100 + Math.floor(rnd() * 3900);
    const base = pickOf([2, 8, 16]);
    const gen: QuestGen = { kind: 'radix', n, base };
    return { id: 'g' + day, q: t('arcade.quest.q.radix', { subject: eul(String(n)), base: String(base) }), tool: 'radix', hint: t('arcade.quest.hint.radix', { subject: eul(String(n)), base: String(base) }), gen };
  }
  if (kind === 1) {
    const n = 1 + Math.floor(rnd() * 60);
    const [from, to, f] = pickOf<[string, string, (x: number) => number]>([
      [t('arcade.quest.km'), t('arcade.quest.mile'), (x) => x / 1.609344],
      [t('arcade.quest.kg'), t('arcade.quest.lb'), (x) => x * 2.2046226],
      [t('arcade.quest.c'), t('arcade.quest.f'), (x) => (x * 9) / 5 + 32],
      [t('arcade.quest.inch'), t('arcade.quest.cm'), (x) => x * 2.54]
    ]);
    const gen: QuestGen = { kind: 'unit', want: f(n) };
    const subject = from === t('arcade.quest.c') ? t('arcade.quest.celsius', { n: String(n) }) : n + neun(from);
    return { id: 'g' + day, q: t('arcade.quest.q.unit', { subject, to }), tool: 'unitconv', hint: t('arcade.quest.hint.unit', { from, to, n: String(n) }), gen };
  }
  if (kind === 2) {
    const mb = pickOf([2, 4, 8, 16, 32, 64, 128]);
    return { id: 'g' + day, q: t('arcade.quest.q.bytes', { mb: String(mb) }), tool: 'bytesize', hint: t('arcade.quest.hint.bytes', { mb: String(mb) }), gen: { kind: 'bytes', mb } };
  }
  const h = Math.floor(rnd() * 20) + 1;
  const m = pickOf([5, 10, 15, 20, 25, 40, 50]);
  return { id: 'g' + day, q: t('arcade.quest.q.time', { h: String(h), m: String(m) }), tool: 'timecalc', hint: t('arcade.quest.hint.time', { h: String(h), m: String(m) }), gen: { kind: 'time', total: h * 60 + m } };
}

export const questView: GameView<QuestState, QuestAction> = {
  id: 'quest',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-wc ac-qs">' +
      '<div class="ac-wcpick" id="acQsPick">' +
      '<p class="ac-wcask" id="acQsHead"></p>' +
      '<p class="ac-wcmsg">' + esc(t('arcade.quest.lead')) + '</p>' +
      '<div class="ac-wcchips" id="acQsChips"></div>' +
      '<p class="ac-wcmsg" id="acQsMsg"></p>' +
      '<button type="button" class="ac-wcstart" id="acQsStart" hidden>' + esc(t('arcade.quest.start')) + '</button>' +
      '</div>' +
      '<div class="ac-wcplay" id="acQsPlay" hidden>' +
      '<p class="ac-wcask" id="acQsDay"></p>' +
      '<p class="ac-qsq" id="acQsQ"></p>' +
      '<form class="ac-qsrow" id="acQsForm" autocomplete="off">' +
      '<input type="text" id="acQsAns" class="ac-qsin" aria-label="' + esc(t('arcade.quest.ansAria')) + '" placeholder="' + esc(t('arcade.quest.ansPh')) + '">' +
      '<button type="submit" class="btn btn-primary">' + esc(t('arcade.quest.guess')) + '</button>' +
      '<button type="button" class="btn btn-ghost" id="acQsHintBtn">' + esc(t('arcade.quest.hintBtn')) + '</button>' +
      '<button type="button" class="btn btn-ghost" id="acQsTool">' + esc(t('arcade.quest.openTool')) + '</button>' +
      '</form>' +
      '<div class="ac-qsslot" id="acQsSlot" hidden></div>' +
      '<p class="ac-wcmsg" id="acQsHint" hidden></p>' +
      '<p class="ac-wcmsg" id="acQsLine" aria-live="polite"></p>' +
      '<div class="ac-rxrow" id="acQsRow"></div>' +
      '</div>' +
      '</div>';
    const $ = <T extends HTMLElement>(id: string): T => el.querySelector<T>('#' + id)!;

    let table: QuestPuzzle[] = [];
    let picked: QuestPuzzle | null = null;
    let shownId = '';
    let seenTries = -1;
    const d = dayNo();
    $('acQsHead').textContent = t('arcade.quest.head', { n: String(d + 1) });

    function paintChips(): void {
      const box = $('acQsChips');
      box.innerHTML = '';
      const add = (label: string, p: QuestPuzzle | null): void => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.setAttribute('aria-pressed', String(!!p && picked === p));
        b.onclick = () => {
          picked = p ?? (table.length ? table[Math.floor(Math.random() * table.length)] : null);
          $('acQsStart').hidden = !picked;
          paintChips();
        };
        box.appendChild(b);
      };
      const todays = d % 2 === 1 ? madeToday(d) : table[Math.floor(d / 2) % Math.max(1, table.length)] ?? null;
      add(t('arcade.quest.todayChip', { n: String(d + 1) }), todays);
      if (table.length) add(t('arcade.quest.practiceChip'), null);
    }
    void fetch('/apps/karmolab/data/quest-puzzles.json')
      .then((r) => r.json())
      .then((j: { puzzles: Array<{ id: string; q: string; tool: string; hint: string; a: string[] }> }) => {
        if (!el.isConnected) return;
        table = j.puzzles.map((p) => ({ id: p.id, q: p.q, tool: p.tool, hint: p.hint, a: p.a }));
        paintChips();
      })
      .catch(() => {
        if (!el.isConnected) return;
        $('acQsMsg').textContent = t('arcade.quest.loadFail');
        paintChips();
      });
    paintChips();
    $('acQsStart').onclick = () => {
      if (picked) act({ kind: 'load', puzzle: picked });
    };

    let toolOpen = false;
    function openTool(id: string): void {
      const slot = $('acQsSlot');
      const btn = $<HTMLButtonElement>('acQsTool');
      if (toolOpen) {
        toolOpen = false;
        slot.hidden = true;
        slot.innerHTML = '';
        btn.textContent = t('arcade.quest.openTool');
        return;
      }
      btn.disabled = true;
      void Promise.resolve(Toolbox.kickLazyLoad?.(id))
        .catch(() => undefined)
        .then(() => {
          const ok = Toolbox.renderInline?.(id, slot);
          btn.disabled = false;
          if (!ok || slot.querySelector('.tb-lazy-loading')) {
            location.href = toolPage(id);
            return;
          }
          toolOpen = true;
          slot.hidden = false;
          btn.textContent = t('arcade.quest.closeTool');
        });
    }

    $('acQsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>('acQsAns');
      const raw = input.value.trim();
      if (!raw || !shownId) return;
      const p = picked;
      if (p && p.gen) {
        act({ kind: 'try', raw });
        input.select();
        return;
      }
      void fingerprint(raw).then((fp) => {
        if (!el.isConnected) return;
        act({ kind: 'try', raw, fp });
        input.select();
      });
    });
    $('acQsHintBtn').onclick = () => { $('acQsHint').hidden = false; };
    $('acQsTool').onclick = () => { if (picked) openTool(picked.tool); };

    return (v, mySeat) => {
      const s = v.state;
      const seat = mySeat < 0 ? 0 : mySeat;
      if (!s.puzzle) {
        $('acQsPick').hidden = false;
        $('acQsPlay').hidden = true;
        if (mySeat > 0) $('acQsHead').textContent = t('arcade.quest.waitHost');
        return;
      }
      $('acQsPick').hidden = true;
      $('acQsPlay').hidden = false;
      if (shownId !== s.puzzle.id) {
        shownId = s.puzzle.id;
        seenTries = -1;
        if (!picked || picked.id !== s.puzzle.id) picked = s.puzzle;
        $('acQsDay').textContent = s.puzzle.id.indexOf('g') === 0 || s.puzzle.id === (table[Math.floor(d / 2) % Math.max(1, table.length)]?.id ?? '') ? t('arcade.quest.dayLabel', { n: String(d + 1) }) : t('arcade.quest.practice');
        $('acQsQ').textContent = s.puzzle.q;
        $('acQsHint').textContent = s.puzzle.hint;
        $('acQsHint').hidden = true;
        $<HTMLInputElement>('acQsAns').value = '';
        $<HTMLInputElement>('acQsAns').disabled = false;
        $<HTMLInputElement>('acQsAns').focus();
      }
      const lane = s.lanes[seat];
      if (!lane) return;
      if (lane.tries !== seenTries) {
        seenTries = lane.tries;
        const line = lane.won
          ? t('arcade.quest.correct', { n: String(lane.tries) })
          : lane.out
            ? t('arcade.quest.usedUp')
            : lane.tries
              ? t('arcade.quest.wrong', { n: String(lane.tries), max: String(MAX_TRIES) })
              : t('arcade.quest.triesLeft', { n: String(MAX_TRIES) });
        $('acQsLine').textContent = line;
        if (lane.won || lane.out) $<HTMLInputElement>('acQsAns').disabled = true;
      }
      $('acQsRow').innerHTML = v.seats
        .map((sq, i) => {
          const l = s.lanes[i];
          const mark = l?.won ? '🟩 ' + l.tries : l?.out ? '🟥' : l?.tries ? l.tries + '/' + MAX_TRIES : '';
          return '<span class="ac-dts' + (i === seat ? ' ac-me' : '') + '">' + esc(sq.name) + (mark ? ' <b>' + mark + '</b>' : '') + '</span>';
        })
        .join('');
    };
  }
};
