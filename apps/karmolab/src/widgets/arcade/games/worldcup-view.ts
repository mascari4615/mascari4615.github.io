/**
 * 이상형 월드컵 화면 (change.arcade-absorbs-play 단계 1)
 *
 * 규칙은 표를 모르므로 표를 고르고 받아 오는 일은 전부 여기다. 이 브라우저의 내 표, 남이 올린 표,
 * 사이트에 붙박이로 있는 표(서버가 `siteBoard` 로 표시), 지난 우승자끼리. 받으면 첫 수 `load` 로
 * 규칙에 실음. 그 뒤로 화면은 상태만 그림
 *
 * 끝나면 이 브라우저에 우승을 남기고, 올라간 표면 서버 통계와 취향 지문. 서버가 없으면
 * 그 칸만 없음. 놀이는 끝까지 돎
 */
import { t, locale } from '../../../lib/i18n';
import type { GameView } from '../views';
import { loadPacks, type Pack, type PackItem } from '../../pack-store';
import { listShared, adoptShared, type SharedPackSummary } from '../../../lib/shared-packs';
import { takePick } from '../../pack-pick';
import { copyResultCard } from '../../../lib/result-card';
import { roundChoices, agreement, MIN_RUNNERS, type WcState, type WcAction, type WcRunner, type WcMatch } from './worldcup';

const API_BASE = 'https://yawnbot.mascari4615.com';
/** 옛 위젯과 같은 열쇠. 옮겨 와도 지난 우승이 그대로 보인다 */
const HISTORY_KEY = 'karmolab_worldcup_history';
const CHAMPIONS_KEY = 'champions';
const TODAY_KEY = 'today';

interface Choice {
  key: string;
  title: string;
  emoji: string;
  runners: number;
  sharedId?: string;
  local?: Pack;
  /** 붙박이나 특별한 표면 그 이름. 항목은 그때 받아 온다 */
  special?: string;
}

interface Past {
  at: string;
  title: string;
  champion: string;
  img: string;
}

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** KST 기준 며칠째인가. 서버 없이도 모두가 같은 답을 얻는다 */
function dayNumber(now: Date = new Date()): number {
  return Math.floor((now.getTime() + 9 * 3600e3) / 86400000);
}

/** 그림이 있는 항목만 달린다. 그림 없는 칸이 섞이면 고르는 재미가 통째로 죽는다 */
function runnersOf(items: PackItem[]): WcRunner[] {
  return items.filter((i) => typeof i.img === 'string' && i.img).map((i) => ({ name: i.name, img: String(i.img) }));
}

function readHistory(): Past[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function pushHistory(entry: Past): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...readHistory()].slice(0, 30)));
  } catch {
    /* 사생활 모드. 이번 판 화면은 그대로 맞다 */
  }
}

function uniqueChampions(): Past[] {
  const seen = readHistory();
  return seen.filter((h, i) => h.img && seen.findIndex((x) => x.champion === h.champion) === i);
}

export const worldcupView: GameView<WcState, WcAction> = {
  id: 'worldcup',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-wc">' +
      '<div class="ac-wcpick" id="acWcPick">' +
      '<p class="ac-wcask">' + esc(t('arcade.worldcup.pick')) + '</p>' +
      '<div class="ac-wcchips" id="acWcPacks" role="group" aria-label="' + esc(t('arcade.worldcup.pick')) + '"></div>' +
      '<p class="ac-wcmsg" id="acWcMsg" aria-live="polite"></p>' +
      '<div id="acWcRoundBox" hidden><p class="ac-wcask">' + esc(t('arcade.worldcup.rounds')) + '</p>' +
      '<div class="ac-wcchips" id="acWcRounds" role="group" aria-label="' + esc(t('arcade.worldcup.rounds')) + '"></div></div>' +
      '<button type="button" class="ac-wcstart" id="acWcStart" hidden>' + esc(t('arcade.worldcup.start')) + '</button>' +
      '<div id="acWcHistory"></div>' +
      '</div>' +
      '<div class="ac-wcplay" id="acWcPlay" hidden>' +
      '<p class="ac-wcask" id="acWcAsk"></p>' +
      '<div class="ac-wcpair">' +
      '<button type="button" class="ac-wcside" id="acWcA"></button>' +
      '<button type="button" class="ac-wcside" id="acWcB"></button>' +
      '</div>' +
      '<p class="ac-wcmsg">' + esc(t('arcade.worldcup.arrows')) + '</p>' +
      '</div>' +
      '<div class="ac-wcdone" id="acWcDone" hidden>' +
      '<div class="ac-wcchamp" id="acWcChamp"></div>' +
      '<div class="ac-wcacts"><button type="button" class="ac-wcstart" id="acWcShare">' + esc(t('arcade.worldcup.share')) + '</button>' +
      '<span class="ac-wcmsg" id="acWcShareMsg" aria-live="polite"></span></div>' +
      '<div id="acWcTogether"></div>' +
      '<div id="acWcPath"></div>' +
      '<div id="acWcTally"></div>' +
      '</div>' +
      '</div>';
    const $ = <T extends HTMLElement>(id: string): T => el.querySelector<T>('#' + id)!;

    let choices: Choice[] = [];
    let picked: Choice | null = null;
    let size = 0;
    let loading = false;
    /** 이 판의 마무리(기록, 통계)를 한 번만 */
    let settled = false;
    let shown: WcState['phase'] | '' = '';

    function paintPacks(): void {
      const box = $('acWcPacks');
      box.innerHTML = '';
      if (!choices.length) {
        $('acWcMsg').textContent = loading ? t('arcade.worldcup.loading') : t('arcade.worldcup.none');
        return;
      }
      if (!loading) $('acWcMsg').textContent = '';
      for (const c of choices) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = c.special && c.special !== CHAMPIONS_KEY ? c.emoji + ' ' + c.title : c.emoji + ' ' + c.title + ' (' + c.runners + ')';
        btn.setAttribute('aria-pressed', String(picked === c));
        btn.onclick = () => {
          picked = c;
          paintPacks();
          paintRounds();
        };
        box.appendChild(btn);
      }
    }

    function paintRounds(): void {
      if (!picked) return;
      const options = roundChoices(picked.runners);
      /* 처음 고르는 값은 가장 큰 것이 아니라 16강. 128강은 첫 판에 백 번을 누르게 한다 */
      if (!options.length) options.push(MIN_RUNNERS);
      if (options.indexOf(size) < 0) size = options.indexOf(16) >= 0 ? 16 : options[options.length - 1];
      /* 오늘의 월드컵은 라운드도 같아야 한다. 8강 우승과 64강 우승을 같은 통계에 넣으면 그 수는 아무 말도 안 한다 */
      const fixed = picked.special === TODAY_KEY;
      $('acWcRoundBox').hidden = fixed;
      $('acWcStart').hidden = false;
      const box = $('acWcRounds');
      box.innerHTML = '';
      if (fixed) return;
      for (const n of options) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = t('arcade.worldcup.roundOf', { n: String(n) });
        btn.setAttribute('aria-pressed', String(n === size));
        btn.onclick = () => {
          size = n;
          paintRounds();
        };
        box.appendChild(btn);
      }
    }

    /**
     * 고를 수 있는 표 모으기. 이 브라우저 표를 먼저, 서버 것은 도착하는 대로 뒤에.
     * 붙박이 표는 서버가 `siteBoard` 로 표시한 것. 맨 앞에 두어 처음 온 사람도 바로 한 판
     */
    function loadChoices(): void {
      const champions = uniqueChampions();
      const mine: Choice[] = loadPacks()
        .map((p) => ({ key: 'local:' + p.id, title: p.title, emoji: p.emoji, runners: runnersOf(p.items).length, sharedId: p.sharedId, local: p }))
        .filter((c) => c.runners >= MIN_RUNNERS);
      const past: Choice[] =
        champions.length >= MIN_RUNNERS
          ? [{ key: 'special:' + CHAMPIONS_KEY, title: t('arcade.worldcup.pastChampions', { n: String(champions.length) }), emoji: '👑', runners: champions.length, special: CHAMPIONS_KEY }]
          : [];
      choices = past.concat(mine);
      loading = true;
      paintPacks();
      void listShared({ needs: 'image', sort: 'popular', limit: 40 }).then((got) => {
        loading = false;
        if (!el.isConnected) return;
        if (!got) {
          paintPacks();
          return;
        }
        const mineShared = new Set(choices.map((c) => c.sharedId).filter(Boolean));
        const builtin: Choice[] = got.packs
          .filter((r: SharedPackSummary) => !!r.siteBoard && r.images >= MIN_RUNNERS)
          .map((r: SharedPackSummary) => ({ key: 'shared:' + r.id, title: r.title, emoji: r.emoji, runners: r.images, sharedId: r.id }));
        /* 오늘의 월드컵. 날짜가 표를 고른다. 모두가 같은 판을 돌아야 승률과 순위가 모인다 */
        const pool = got.packs.filter((r: SharedPackSummary) => !r.siteBoard && r.images >= MIN_RUNNERS).slice().sort((a, b) => a.id.localeCompare(b.id));
        const today: Choice[] = pool.length
          ? [(() => {
              const pick = pool[dayNumber() % pool.length];
              return { key: 'today:' + pick.id, title: t('arcade.worldcup.today', { title: pick.title }), emoji: '📅', runners: pick.images, sharedId: pick.id, special: TODAY_KEY };
            })()]
          : [];
        const others: Choice[] = got.packs
          .filter((r: SharedPackSummary) => !r.siteBoard && r.images >= MIN_RUNNERS && !mineShared.has(r.id))
          .map((r: SharedPackSummary) => ({ key: 'shared:' + r.id, title: r.title, emoji: r.emoji, runners: r.images, sharedId: r.id }));
        choices = today.concat(builtin, choices, others);
        /* 내 표에서 밀어 준 표가 있으면 그것부터 골라 둔다 */
        const handed = takePick();
        const found = handed ? choices.find((c) => c.local && c.local.id === handed) : null;
        if (found) picked = found;
        paintPacks();
        if (picked) paintRounds();
      });
    }

    /** 표를 실제 항목으로 편다. 남의 표는 이때 이 브라우저로 들인다 */
    async function runnersFor(c: Choice): Promise<WcRunner[]> {
      if (c.special === CHAMPIONS_KEY) return uniqueChampions().map((h) => ({ name: h.champion, img: h.img }));
      if (c.local) return runnersOf(c.local.items);
      const adopted = c.sharedId ? await adoptShared(c.sharedId) : null;
      return adopted ? runnersOf(adopted.items) : [];
    }

    async function start(): Promise<void> {
      if (!picked || loading) return;
      /* 받는 동안 아무 말이 없으면 고장으로 보인다. 표는 천 장짜리도 있다 */
      loading = true;
      $<HTMLButtonElement>('acWcStart').disabled = true;
      $('acWcMsg').textContent = t('arcade.worldcup.loading');
      const all = await runnersFor(picked);
      loading = false;
      if (!el.isConnected) return;
      $<HTMLButtonElement>('acWcStart').disabled = false;
      $('acWcMsg').textContent = '';
      if (all.length < MIN_RUNNERS) {
        $('acWcMsg').textContent = t('arcade.worldcup.few');
        return;
      }
      act({ kind: 'load', key: picked.key, title: picked.title, sharedId: picked.sharedId, size, runners: all });
    }

    function paintHistory(): void {
      const list = readHistory().slice(0, 8);
      $('acWcHistory').innerHTML = list.length
        ? '<p class="ac-wcsub">' + esc(t('arcade.worldcup.history')) + '</p><div class="ac-wchist">' +
          list.map((h) => '<span title="' + esc(h.title) + '"><img src="' + esc(h.img) + '" alt=""><b>' + esc(h.champion) + '</b></span>').join('') +
          '</div>'
        : '';
    }

    const roundName = (n: number): string => (n === 2 ? t('arcade.worldcup.final') : t('arcade.worldcup.roundOf', { n: String(n) }));

    function paintPlay(s: WcState, mySeat: number): void {
      const lane = s.lanes[mySeat];
      if (!lane) return;
      if (!lane.pair) {
        $('acWcAsk').textContent = t('arcade.worldcup.waitOther');
        $('acWcA').innerHTML = '';
        $('acWcB').innerHTML = '';
        return;
      }
      const face = (i: number): string => {
        const r = s.runners[i];
        return (r.img ? '<img src="' + esc(r.img) + '" alt="" loading="lazy">' : '') + '<b>' + esc(r.name) + '</b>';
      };
      $('acWcAsk').textContent = t('arcade.worldcup.progress', {
        round: roundName(lane.roundOf),
        i: String(lane.matches.filter((m) => m.round === lane.roundOf).length + 1),
        n: String(Math.max(1, Math.floor(lane.roundOf / 2)))
      });
      $('acWcA').innerHTML = face(lane.pair[0]);
      $('acWcB').innerHTML = face(lane.pair[1]);
    }

    const byName = (s: WcState, m: WcMatch): { win: string; lose: string; round: number } => ({
      win: s.runners[m.win]?.name ?? '',
      lose: s.runners[m.lose]?.name ?? '',
      round: m.round
    });

    /** 올라간 표면 판 결과를 표의 통계로 보낸다. 서버 없으면 통계 칸만 없다 */
    function sendTournament(s: WcState, lane: WcState['lanes'][number], champion: WcRunner): void {
      const sharedId = s.pack?.sharedId;
      const box = $('acWcTally');
      if (!sharedId) {
        box.innerHTML = '<p class="ac-wcmsg">' + esc(t('arcade.worldcup.notShared')) + '</p>';
        return;
      }
      const matches = lane.matches.map((m) => byName(s, m));
      fetch(API_BASE + '/kl/packs/' + encodeURIComponent(sharedId) + '/tournament', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches, champion: champion.name })
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { tally?: Array<{ name: string; rate: number; seen: number; champion: number }> } | null) => {
          if (!el.isConnected || !body?.tally?.length) return;
          const total = body.tally.reduce((sum, row) => sum + (row.champion ?? 0), 0);
          const mine = body.tally.find((row) => row.name === champion.name);
          const pct = total >= 2 && mine ? '<p class="ac-wcmsg">' + esc(t('arcade.worldcup.pickOf', { pct: String(Math.round(((mine.champion ?? 0) / total) * 100)), name: champion.name, n: String(total) })) + '</p>' : '';
          box.innerHTML =
            pct + '<p class="ac-wcsub">' + esc(t('arcade.worldcup.popular')) + '</p><ol class="ac-wclist">' +
            body.tally.slice(0, 10).map((row, i) =>
              '<li><span>' + (i + 1) + '. ' + esc(row.name) + '</span><span>' + Math.round(row.rate * 100) + '%, ' +
              esc(t('arcade.worldcup.seen', { n: String(row.seen) })) + (row.champion ? ', ' + esc(t('arcade.worldcup.won', { n: String(row.champion) })) : '') + '</span></li>').join('') +
            '</ol>';
        })
        .catch(() => {
          /* 통계만 없다 */
        });
      /* 취향 지문. 같은 표를 돌린 남과 얼마나 같은지. 로그인 안 했으면 조용히 없음 */
      fetch(API_BASE + '/kl/taste', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant: sharedId, matches: matches.map((m) => ({ win: m.win, lose: m.lose })) })
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { signedIn?: boolean; closest?: Array<{ handle: string; agreePct: number }>; opposite?: Array<{ handle: string; agreePct: number }> } | null) => {
          if (!el.isConnected || !body?.signedIn) return;
          const near = body.closest?.[0];
          const far = body.opposite?.[0];
          const line = near
            ? t('arcade.worldcup.taste.near', { who: near.handle, pct: String(near.agreePct) }) +
              (far && far.handle !== near.handle ? '. ' + t('arcade.worldcup.taste.far', { who: far.handle, pct: String(far.agreePct) }) : '')
            : t('arcade.worldcup.taste.alone');
          const p = document.createElement('p');
          p.className = 'ac-wcmsg';
          p.textContent = line;
          box.prepend(p);
        })
        .catch(() => {});
    }

    function paintDone(s: WcState, mySeat: number): void {
      const lane = s.lanes[mySeat] ?? s.lanes[0];
      const champion = s.runners[lane.champion];
      if (!champion) return;
      $('acWcChamp').innerHTML =
        '<p class="ac-wcsub">' + esc(t('arcade.worldcup.champion')) + '</p>' +
        (champion.img ? '<img src="' + esc(champion.img) + '" alt="">' : '') + '<b>' + esc(champion.name) + '</b>';
      /* 내가 고른 길. 마지막 판부터 거슬러. 우승만 남기면 누구를 버렸나가 사라진다 */
      const path = lane.matches.slice().reverse().filter((m) => m.round <= 8);
      $('acWcPath').innerHTML = path.length
        ? '<p class="ac-wcsub">' + esc(t('arcade.worldcup.path')) + '</p><ol class="ac-wclist">' +
          path.map((m) => '<li><span>' + esc(roundName(m.round)) + '. ' + esc(s.runners[m.win]?.name ?? '') + '</span><span>' + esc(s.runners[m.lose]?.name ?? '') + '</span></li>').join('') +
          '</ol>'
        : '';
      /* 둘이 같이 한 판이면 상대 우승과 두 길의 겹침 */
      const other = s.lanes.find((_, i) => i !== mySeat);
      $('acWcTogether').innerHTML = other && other.champion >= 0
        ? '<p class="ac-wcmsg">' + esc(t('arcade.worldcup.theirs', { name: s.runners[other.champion]?.name ?? '' })) + '. ' +
          esc(t('arcade.worldcup.sameRate', { rate: String(agreement(lane.matches, other.matches).rate) })) + '</p>'
        : '';
      if (settled) return;
      settled = true;
      pushHistory({ at: new Date().toISOString(), title: s.pack?.title ?? '', champion: champion.name, img: champion.img });
      sendTournament(s, lane, champion);
    }

    $('acWcStart').onclick = () => void start();
    $('acWcA').onclick = () => act({ kind: 'pick', side: 0 });
    $('acWcB').onclick = () => act({ kind: 'pick', side: 1 });
    $('acWcShare').onclick = () => {
      const last = readHistory()[0];
      if (!last) return;
      $('acWcShareMsg').textContent = t('arcade.worldcup.sharing');
      void copyResultCard(
        {
          kicker: t('arcade.game.worldcup.name') + ', ' + last.title,
          headline: last.champion,
          lines: [new Date(last.at).toLocaleDateString(locale())],
          imageUrl: last.img
        },
        'karmolab-worldcup-' + last.champion + '.png'
      ).then((msg) => {
        if (el.isConnected) $('acWcShareMsg').textContent = msg;
      });
    };

    /* 왼쪽, 오른쪽 화살표로도 고른다. 몇십 번을 누르는 놀이라 손이 마우스에 묶이면 지친다 */
    const keys = (e: KeyboardEvent): void => {
      if (!el.isConnected) {
        removeEventListener('keydown', keys);
        return;
      }
      if ($('acWcPlay').hidden) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        act({ kind: 'pick', side: 0 });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        act({ kind: 'pick', side: 1 });
      }
    };
    addEventListener('keydown', keys);

    loadChoices();
    paintHistory();

    return (v, mySeat) => {
      const s = v.state;
      const seat = mySeat < 0 ? 0 : mySeat;
      if (s.phase !== shown) {
        shown = s.phase;
        $('acWcPick').hidden = s.phase !== 'pick';
        $('acWcPlay').hidden = s.phase !== 'play';
        $('acWcDone').hidden = s.phase !== 'done';
        if (s.phase === 'pick') {
          settled = false;
          paintHistory();
          if (mySeat > 0) $('acWcMsg').textContent = t('arcade.worldcup.waitHost');
        }
      }
      if (s.phase === 'play') paintPlay(s, seat);
      else if (s.phase === 'done') paintDone(s, seat);
    };
  }
};
