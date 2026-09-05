/**
 * 오늘의 하나 맞히기 화면 (change.arcade-absorbs-play 단계 4)
 *
 * 주제와 갈래를 첫 화면에서. 표는 여기서 받아 쓰고 규칙에는 그날 것(정답, 질문, 격자)만 실어 보냄
 * 이름 찾기와 자동완성도 여기 몫. 그래서 방과 다시보기가 표 천 줄을 안 나름
 *
 * 갈래가 설 수 있나는 표가 정한다. 그림이 다 있으면 실루엣, 질문이 여덟 개면 전부대기,
 * 축 둘을 만들 만하면 격자판. 표를 넣으면 갈래가 저절로 붙는 옛 계약 그대로
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import {
  answerOf, describeRow, gridPuzzleOf, hasGridMode, hasListMode, hasSilhouetteMode, listQuestionOf, puzzleNumber, suggest, findItem,
  type DailyItem, type DailyTopic
} from './daily-engine';
import { MODE_ATTR, MODE_SILHOUETTE, MODE_LIST, MODE_GRID, TRIES_ATTR, TRIES_SILHOUETTE, GRID_TRIES, type DailyMode, type DailyState, type DailyAction } from './daily';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface TopicRow {
  id: string;
  title: string;
  emoji: string;
  items: number;
}

const MODE_KEYS: Record<DailyMode, string> = { 0: 'attr', 1: 'silhouette', 2: 'list', 3: 'grid' };

export const dailyView: GameView<DailyState, DailyAction> = {
  id: 'daily',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-wc ac-dy">' +
      '<div class="ac-wcpick" id="acDyPick">' +
      '<p class="ac-wcask">' + esc(t('arcade.daily.pickTopic')) + '</p>' +
      '<div class="ac-wcchips" id="acDyTopics"></div>' +
      '<p class="ac-wcask">' + esc(t('arcade.daily.pickMode')) + '</p>' +
      '<div class="ac-wcchips" id="acDyModes"></div>' +
      '<p class="ac-wcmsg" id="acDyMsg" aria-live="polite"></p>' +
      '<button type="button" class="ac-wcstart" id="acDyStart" hidden>' + esc(t('arcade.daily.start')) + '</button>' +
      '</div>' +
      '<div class="ac-wcplay" id="acDyPlay" hidden>' +
      '<p class="ac-wcask" id="acDyHead"></p>' +
      '<div class="ac-dyboard" id="acDyBoard"></div>' +
      '<form class="ac-qsrow" id="acDyForm" autocomplete="off">' +
      '<input type="text" id="acDyIn" class="ac-qsin" autocomplete="off" spellcheck="false" aria-label="' + esc(t('arcade.daily.inputAria')) + '" placeholder="' + esc(t('arcade.daily.inputPh')) + '">' +
      '<button type="submit" class="btn btn-primary">' + esc(t('arcade.daily.submit')) + '</button>' +
      '</form>' +
      '<div class="ac-dysug" id="acDySug"></div>' +
      '<p class="ac-wcmsg" id="acDyLine" aria-live="polite"></p>' +
      '<div class="ac-rxrow" id="acDyRow"></div>' +
      '</div>' +
      '</div>';
    const $ = <T extends HTMLElement>(id: string): T => el.querySelector<T>('#' + id)!;

    let topics: TopicRow[] = [];
    let picked: TopicRow | null = null;
    let mode: DailyMode = MODE_ATTR;
    let topic: DailyTopic | null = null;
    let loading = false;
    /** 격자판에서 지금 채우려는 칸 */
    let cellAt: [number, number] | null = null;
    let drawnRows = -1;
    let started = false;

    function paintTopics(): void {
      const box = $('acDyTopics');
      box.innerHTML = '';
      for (const row of topics) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = (row.emoji ? row.emoji + ' ' : '') + row.title + ' (' + row.items + ')';
        b.setAttribute('aria-pressed', String(picked === row));
        b.onclick = () => {
          picked = row;
          topic = null;
          $('acDyStart').hidden = false;
          paintTopics();
          void loadTopic();
        };
        box.appendChild(b);
      }
    }
    function paintModes(): void {
      const box = $('acDyModes');
      box.innerHTML = '';
      const all: DailyMode[] = [MODE_ATTR, MODE_SILHOUETTE, MODE_LIST, MODE_GRID];
      for (const m of all) {
        const ok = m === MODE_ATTR || !topic
          ? true
          : m === MODE_SILHOUETTE ? hasSilhouetteMode(topic) : m === MODE_LIST ? hasListMode(topic) : hasGridMode(topic);
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = t('arcade.daily.mode.' + MODE_KEYS[m]);
        b.setAttribute('aria-pressed', String(m === mode));
        b.disabled = !ok;
        b.onclick = () => {
          mode = m;
          paintModes();
        };
        box.appendChild(b);
      }
    }
    async function loadTopic(): Promise<void> {
      if (!picked) return;
      loading = true;
      $('acDyMsg').textContent = t('arcade.daily.loading');
      const got = await fetch('/apps/karmolab/data/daily/' + picked.id + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      loading = false;
      if (!el.isConnected) return;
      if (!got || !Array.isArray(got.items)) {
        $('acDyMsg').textContent = t('arcade.daily.loadFail');
        return;
      }
      topic = got as DailyTopic;
      $('acDyMsg').textContent = '';
      paintModes();
    }

    void fetch('/apps/karmolab/data/daily/index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { topics?: TopicRow[] } | null) => {
        if (!el.isConnected) return;
        topics = j?.topics ?? [];
        if (topics.length) {
          picked = topics[0];
          $('acDyStart').hidden = false;
          void loadTopic();
        }
        paintTopics();
        paintModes();
      })
      .catch(() => {
        if (el.isConnected) $('acDyMsg').textContent = t('arcade.daily.loadFail');
      });
    paintModes();

    $('acDyStart').onclick = () => {
      if (!picked || loading) return;
      if (!topic) {
        void loadTopic();
        return;
      }
      const now = new Date();
      if (mode === MODE_LIST) {
        const q = listQuestionOf(topic, now);
        if (!q) {
          $('acDyMsg').textContent = t('arcade.daily.noMode');
          return;
        }
        act({ kind: 'load', mode, topicId: topic.id, title: topic.title, fields: topic.fields, question: q });
        return;
      }
      if (mode === MODE_GRID) {
        const g = gridPuzzleOf(topic, now);
        if (!g) {
          $('acDyMsg').textContent = t('arcade.daily.noMode');
          return;
        }
        act({ kind: 'load', mode, topicId: topic.id, title: topic.title, fields: topic.fields, grid: g });
        return;
      }
      act({ kind: 'load', mode, topicId: topic.id, title: topic.title, fields: topic.fields, answer: answerOf(topic, now, mode === MODE_SILHOUETTE ? 'silhouette' : '') });
    };

    /* 자동완성. 첫 자음만 쳐도 찾아짐 */
    const input = $<HTMLInputElement>('acDyIn');
    input.addEventListener('input', () => {
      const box = $('acDySug');
      if (!topic || !input.value.trim()) {
        box.innerHTML = '';
        return;
      }
      const rows = suggest(topic.items, input.value, { limit: 6 });
      box.innerHTML = rows.map((r) => '<button type="button" class="ac-dysugb">' + esc(r.name) + '</button>').join('');
      box.querySelectorAll<HTMLButtonElement>('.ac-dysugb').forEach((b) => {
        b.onclick = () => {
          input.value = b.textContent ?? '';
          box.innerHTML = '';
          $('acDyForm').dispatchEvent(new Event('submit', { cancelable: true }));
        };
      });
    });
    $('acDyForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw || !topic) return;
      $('acDySug').innerHTML = '';
      const item = findItem(topic.items, raw);
      if (!item) {
        $('acDyLine').textContent = t('arcade.daily.unknown', { name: raw });
        return;
      }
      input.value = '';
      if (started && cellAt) {
        act({ kind: 'place', row: cellAt[0], col: cellAt[1], name: item.name });
        return;
      }
      if (currentMode === MODE_LIST) act({ kind: 'name', name: item.name });
      else if (currentMode === MODE_GRID) $('acDyLine').textContent = t('arcade.daily.pickCell');
      else act({ kind: 'guess', item: item as DailyItem });
    });

    let currentMode: DailyMode = MODE_ATTR;

    function paintAttr(s: DailyState, lane: DailyState['lanes'][number]): void {
      const board = $('acDyBoard');
      const head = s.fields.map((f) => '<span class="ac-dyf">' + esc(f.label) + '</span>').join('');
      const rows = lane.rows
        .map((r) =>
          '<div class="ac-dyrow"><span class="ac-dyname">' + esc(r.name) + '</span>' +
          r.cells
            .map((c) => {
              const v = Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '');
              const arrow = c.dir ? (c.dir === 'up' ? ' ▲' : ' ▼') : '';
              return '<span class="ac-dyc ac-dy-' + c.state + '">' + esc(v) + arrow + '</span>';
            })
            .join('') +
          '</div>')
        .join('');
      board.innerHTML =
        (s.mode === MODE_SILHOUETTE && s.answer?.img
          ? '<div class="ac-dysil"><img src="' + esc(s.answer.img) + '" alt="" style="filter:brightness(' + Math.min(1, 0.06 + lane.tries * 0.16) + ')' + (lane.won ? ';filter:none' : '') + '"></div>'
          : '') +
        '<div class="ac-dyrow ac-dyhead"><span class="ac-dyname"></span>' + head + '</div>' + rows;
      const last = lane.rows[lane.rows.length - 1];
      if (last) board.setAttribute('aria-label', describeRow(s.fields, last.cells, last.name));
    }

    function paintList(s: DailyState, lane: DailyState['lanes'][number], now: number): void {
      const total = s.question?.answers.length ?? 0;
      $('acDyBoard').innerHTML =
        '<p class="ac-dyq">' + esc(s.question?.text ?? '') + '</p>' +
        '<div class="ac-dyfound">' + lane.found.map((n) => '<span>' + esc(n) + '</span>').join('') + '</div>';
      const left = Math.max(0, Math.ceil((s.endsAt - now) / 1000));
      $('acDyHead').textContent = t('arcade.daily.listHead', { found: String(lane.found.length), total: String(total), sec: String(left) });
    }

    function paintGrid(s: DailyState, lane: DailyState['lanes'][number]): void {
      if (!s.grid) return;
      const g = s.grid;
      let html = '<table class="ac-dygrid"><tr><td></td>' + g.cols.map((c) => '<th>' + esc(c.short) + '</th>').join('') + '</tr>';
      for (let r = 0; r < 3; r += 1) {
        html += '<tr><th>' + esc(g.rows[r].short) + '</th>';
        for (let c = 0; c < 3; c += 1) {
          const got = lane.grid[r][c];
          const on = cellAt && cellAt[0] === r && cellAt[1] === c;
          html += '<td><button type="button" class="ac-dycell' + (got ? ' ac-dyfill' : '') + (on ? ' ac-dyon' : '') + '" data-r="' + r + '" data-c="' + c + '"' + (got ? ' disabled' : '') + '>' + esc(got ?? '') + '</button></td>';
        }
        html += '</tr>';
      }
      $('acDyBoard').innerHTML = html + '</table>';
      $('acDyBoard').querySelectorAll<HTMLButtonElement>('.ac-dycell').forEach((b) => {
        b.onclick = () => {
          cellAt = [Number(b.dataset.r), Number(b.dataset.c)];
          paintGrid(s, lane);
          input.focus();
        };
      });
    }

    return (v, mySeat, now) => {
      const s = v.state;
      const seat = mySeat < 0 ? 0 : mySeat;
      if (!s.topicId) {
        $('acDyPick').hidden = mySeat > 0;
        $('acDyPlay').hidden = true;
        if (mySeat > 0) $('acDyMsg').textContent = t('arcade.daily.waitHost');
        started = false;
        drawnRows = -1;
        return;
      }
      $('acDyPick').hidden = true;
      $('acDyPlay').hidden = false;
      if (!started) {
        started = true;
        currentMode = s.mode;
        cellAt = s.mode === MODE_GRID ? [0, 0] : null;
        input.disabled = false;
        input.focus();
      }
      const lane = s.lanes[seat];
      if (!lane) return;
      const stamp = lane.rows.length * 100 + lane.found.length * 10 + lane.tries + (lane.done ? 1000 : 0);
      if (s.mode === MODE_LIST) paintList(s, lane, now);
      else if (stamp !== drawnRows) {
        if (s.mode === MODE_GRID) paintGrid(s, lane);
        else paintAttr(s, lane);
      }
      if (stamp !== drawnRows) {
        drawnRows = stamp;
        const max = s.mode === MODE_SILHOUETTE ? TRIES_SILHOUETTE : s.mode === MODE_GRID ? GRID_TRIES : TRIES_ATTR;
        if (s.mode !== MODE_LIST) {
          $('acDyHead').textContent = t('arcade.daily.head', { title: s.title, n: String(puzzleNumber()), used: String(lane.tries), max: String(max) });
        }
        $('acDyLine').textContent = lane.won
          ? t('arcade.daily.won', { n: String(lane.tries) })
          : lane.done
            ? t('arcade.daily.lost')
            : s.mode === MODE_GRID
              ? t('arcade.daily.pickCell')
              : '';
        if (lane.done) input.disabled = true;
      }
      $('acDyRow').innerHTML = v.seats
        .map((sq, i) => {
          const l = s.lanes[i];
          const mark = !l ? '' : s.mode === MODE_LIST ? String(l.found.length) : s.mode === MODE_GRID ? String(l.grid.flat().filter(Boolean).length) : l.won ? '🟩 ' + l.tries : l.done ? '🟥' : String(l.tries);
          return '<span class="ac-dts' + (i === seat ? ' ac-me' : '') + '">' + esc(sq.name) + (mark ? ' <b>' + mark + '</b>' : '') + '</span>';
        })
        .join('');
    };
  }
};
