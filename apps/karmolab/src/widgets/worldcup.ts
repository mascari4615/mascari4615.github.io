/**
 * 이상형 월드컵 (TASK-KL-151) — 둘 중 하나만 고르고, 이긴 쪽만 올라간다.
 *
 * 왜 이 놀이인가: 있던 놀이는 전부 **정답이 있는** 것이었다(빠른가·큰가·맞혔나).
 * 이건 정답이 없다 — 고르는 사람이 곧 답이다. 그래서 표만 있으면 무한히 늘어나고,
 * 표를 만드는 사람이 놀이를 만드는 사람이 된다(KL-150).
 *
 * 무엇을 베꼈나(PIKU): 라운드 수를 **노는 사람이 고른다** · 끝나면 순위와 승률을 본다 ·
 * 만든 표가 목록에 서고 열린 만큼 오른다.
 *
 * 무엇을 더 하나:
 *  ① **내가 고른 길**이 남는다 — 우승만이 아니라 8강·4강에서 누구를 버렸는지.
 *  ② 승률은 **마주친 판**으로 나눈다 — 골라진 횟수만 세면 대진운 좋은 항목이 무조건 이긴다.
 *  ③ 표가 사본이 아니라 **주소**다 — 만든 사람이 고치면 다음 판부터 반영된다.
 *
 * fail-open: 서버에 못 닿으면 통계만 없다. 놀이는 이 브라우저 표로 끝까지 돈다.
 */
import { loadPacks, type Pack, type PackItem } from './pack-store';
import { listShared, adoptShared, type SharedPackSummary } from '../lib/shared-packs';
import { onPageActive, takePick } from './pack-pick';
import { joinRoom, selfId } from 'trystero/nostr';
import { agreement, roundChoices, seededRandom, shuffled, type Match, type Runner } from '../lib/tournament';
import { copyResultCard } from '../lib/result-card';
import { t, loadNamespace } from '../lib/i18n';

const API_BASE = 'https://yawnbot.mascari4615.com';
/** 이 브라우저에 남기는 지난 판 (「작년의 나는 누구를 골랐나」). */
const HISTORY_KEY = 'karmolab_worldcup_history';

/**
 * 처음부터 있는 표 (TASK-KL-151).
 *
 * 왜 필요한가: 사람이 만든 표만 쓰게 두면 **처음 온 사람에게는 빈 화면**이 뜬다.
 * 「표를 먼저 만드세요」는 놀러 온 사람에게 숙제를 내미는 것이다 — 일단 한 판 해 보고
 * 재밌으면 자기 표를 만든다. 표는 「높은 쪽 고르기」가 쓰던 것을 그대로 쓴다(그림이 다 있다).
 */
/** 지난 우승자들끼리 붙이는 판 (TASK-KL-151 심화). 표가 아니라 **내 기록**이 재료다. */
const CHAMPIONS_KEY = 'champions';

const BUILTIN = [
  { id: 'pokemon', title: t('worldcup.t09'), emoji: '🔴' },
  { id: 'lol', title: t('worldcup.t10'), emoji: '⚔️' },
  { id: 'genshin', title: t('worldcup.t11'), emoji: '🌠' },
];

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


  /** 그림이 있는 항목만 달린다 — 그림 없는 칸이 섞이면 고르는 재미가 통째로 죽는다. */
  function runnersOf(items: PackItem[]): Runner[] {
    return items
      .filter((i) => typeof i.img === 'string' && i.img)
      .map((i) => ({ name: i.name, img: String(i.img) }));
  }

  function readHistory(): Array<{ at: string; title: string; champion: string; img: string }> {
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function pushHistory(entry: { at: string; title: string; champion: string; img: string }): void {
    try {
      const list = [entry, ...readHistory()].slice(0, 30);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {
      /* 사생활 모드 — 이번 판 화면은 그대로 맞다 */
    }
  }

  Toolbox.register({
    id: 'worldcup',
    title: t('widgets.worldcup.title', undefined, "이상형 월드컵"),
    category: 'play',
    desc: t('widgets-desc.worldcup.desc', undefined, "둘 중 하나만 고르는 토너먼트. 표를 만들면 그대로 내 월드컵이 됩니다"),
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M7 4h10v3a5 5 0 0 1-10 0V4z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M12 12v4M9 20h6M10 16h4v4h-4z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('worldcup.t14', undefined, "놀기"),
        build: function (container: HTMLElement): void {
          void loadNamespace('worldcup').then(function () {

          if (typeof Mdd !== 'undefined') Mdd.linePreset?.('tool_run', { msg: t('worldcup.t15') });

          container.innerHTML = `
            <div id="wcSetup">
              <div class="field-group">
                <div class="tool-sublabel">${esc(t('worldcup.t01'))}</div>
                <div id="wcPacks" class="hi-chips" role="group" aria-label="${esc(t('worldcup.aria.wcPacks'))}"></div>
                <p class="tool-status" id="wcPackMsg">${esc(t('worldcup.label.wcPackMsg'))}</p>
              </div>
              <div class="field-group" id="wcRoundBox" hidden>
                <div class="tool-sublabel">${esc(t('worldcup.t02'))}</div>
                <div id="wcRounds" class="hi-chips" role="group" aria-label="${esc(t('worldcup.aria.wcRounds'))}"></div>
              </div>
              <div class="pk-row" id="wcStartRow" hidden>
                <button type="button" class="btn btn-primary" id="wcStart">${esc(t('worldcup.btn.wcStart'))}</button>
              </div>
            </div>

            <div id="wcPlay" hidden>
              <p class="hi-ask" id="wcAsk"></p>
              <div class="hi-pair">
                <button class="hi-side" id="wcA" type="button"></button>
                <button class="hi-side" id="wcB" type="button"></button>
              </div>
              <p class="tool-status" id="wcMsg" aria-live="polite"></p>
            </div>

            <div id="wcDone" hidden>
              <div id="wcChampion"></div>
              <div class="pk-row">
                <button type="button" class="btn btn-primary" id="wcAgain">${esc(t('worldcup.btn.wcAgain'))}</button>
                <button type="button" class="btn btn-ghost" id="wcShare">${esc(t('worldcup.btn.wcShare'))}</button>
                <button type="button" class="btn btn-ghost" id="wcOther">${esc(t('worldcup.btn.wcOther'))}</button>
              </div>
              <div id="wcPath" style="margin-top:14px"></div>
              <div id="wcTally" style="margin-top:18px"></div>
            </div>

            <div id="wcTogether" class="pk-card" style="margin-top:18px">
              <div class="tool-sublabel">${esc(t('worldcup.t03'))}</div>
              <p class="tool-status" id="wcTogetherMsg">${esc(t('worldcup.label.wcTogetherMsg'))}</p>
              <div class="pk-row">
                <button type="button" class="btn btn-ghost" id="wcMakeRoom">${esc(t('worldcup.btn.wcMakeRoom'))}</button>
                <button type="button" class="btn btn-ghost" id="wcJoinRoom">${esc(t('worldcup.btn.wcJoinRoom'))}</button>
              </div>
            </div>

            <div id="wcHistory" style="margin-top:22px"></div>
          `;

          const $ = (id: string) => container.querySelector<HTMLElement>('#' + id)!;

          /** 고를 수 있는 표 — 이 브라우저 것 + 남이 올린 것. 그림 넷 이상인 것만. */
          let choices: Array<{
            key: string;
            title: string;
            emoji: string;
            runners: number;
            sharedId?: string;
            local?: Pack;
            /** 처음부터 있는 표면 그 이름 (`pokemon` …). 항목은 그때 받아 온다. */
            builtin?: string;
          }> = [];
          let picked: (typeof choices)[number] | null = null;
          let size = 0;

          let runners: Runner[] = [];
          let queue: Runner[] = [];
          let winners: Runner[] = [];
          let matches: Match[] = [];
          let current: [Runner, Runner] | null = null;
          let roundOf = 0;

          function paintPacks(): void {
            $('wcPacks').innerHTML = '';
            if (!choices.length) {
              $('wcPackMsg').textContent =
                t('worldcup.t16');
              return;
            }
            $('wcPackMsg').textContent = '';
            choices.forEach((c) => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = c.builtin ? `${c.emoji} ${c.title}` : `${c.emoji} ${c.title} (${c.runners})`;
              btn.setAttribute('aria-pressed', String(picked === c));
              btn.addEventListener('click', () => {
                picked = c;
                [...$('wcPacks').children].forEach((x) => x.setAttribute('aria-pressed', 'false'));
                btn.setAttribute('aria-pressed', 'true');
                paintRounds();
              });
              $('wcPacks').appendChild(btn);
            });
          }

          function paintRounds(): void {
            if (!picked) return;
            const options = roundChoices(picked.runners);
            // 처음 고르는 값은 **가장 큰 것이 아니라 16강**이다 — 128강은 첫 판에 백 번을 누르게 한다.
            size = options.indexOf(16) >= 0 ? 16 : options[options.length - 1];
            $('wcRoundBox').hidden = false;
            $('wcStartRow').hidden = false;
            $('wcRounds').innerHTML = '';
            options.forEach((n) => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = t('worldcup.roundOf', { n });
              btn.setAttribute('aria-pressed', String(n === size));
              btn.addEventListener('click', () => {
                size = n;
                [...$('wcRounds').children].forEach((x) => x.setAttribute('aria-pressed', 'false'));
                btn.setAttribute('aria-pressed', 'true');
              });
              $('wcRounds').appendChild(btn);
            });
          }

          /**
           * 고를 수 있는 표를 모은다.
           *
           * 이 브라우저 표를 **먼저** 그린다 — 서버를 기다리는 동안 화면이 비면 「할 게 없는 곳」이
           * 된다. 남의 표는 도착하는 대로 뒤에 붙는다.
           */
          function loadChoices(): void {
            // 처음부터 있는 표를 **맨 앞에** 둔다 — 처음 온 사람이 바로 한 판 할 수 있어야 한다.
            /* 지난 우승자들끼리 (TASK-KL-151 심화).
               왜: 표를 여러 번 돌리면 우승자가 쌓이는데, 그것들끼리 붙여 보고 싶어지는 게
               이 놀이의 자연스러운 다음 수다. 재료가 이미 이 브라우저에 있으니 새로 받을 것이 없다.
               넷은 모여야 판이 선다 — 둘로는 「토너먼트」가 아니다. */
            const champions = readHistory();
            const uniqueChampions = champions.filter(
              (h, i) => h.img && champions.findIndex((x) => x.champion === h.champion) === i
            );

            const builtins: typeof choices = BUILTIN.map((b) => ({
              key: `builtin:${b.id}`,
              title: b.title,
              emoji: b.emoji,
              /* 항목 수는 파일을 받아 봐야 안다. 여기서는 「128강까지 열어 둔다」는 뜻으로만 쓴다 —
                 실제로 받은 뒤 그보다 적으면 그만큼만 달린다(`start`). */
              runners: 128,
              builtin: b.id,
            }));
            const championChoice: typeof choices =
              uniqueChampions.length >= 4
                ? [
                    {
                      key: `builtin:${CHAMPIONS_KEY}`,
                      title: t('worldcup.pastChampions', { n: uniqueChampions.length }),
                      emoji: '👑',
                      runners: uniqueChampions.length,
                      builtin: CHAMPIONS_KEY,
                    },
                  ]
                : [];

            choices = championChoice.concat(builtins).concat(
              loadPacks()
                .map((p) => ({ key: `local:${p.id}`, title: p.title, emoji: p.emoji, runners: runnersOf(p.items).length, sharedId: p.sharedId, local: p }))
                .filter((c) => c.runners >= 4)
            );
            paintPacks();

            void listShared({ needs: 'image', sort: 'popular', limit: 30 }).then((got) => {
              if (!container.isConnected || !got) return;
              const mineShared = new Set(choices.map((c) => c.sharedId).filter(Boolean));
              const extra = got.packs
                .filter((r: SharedPackSummary) => !mineShared.has(r.id))
                .map((r: SharedPackSummary) => ({
                  key: `shared:${r.id}`,
                  title: r.title,
                  emoji: r.emoji,
                  runners: r.images,
                  sharedId: r.id,
                }));
              choices = choices.concat(extra);
              paintPacks();
            });
          }

          /** 표를 실제 항목으로 편다. 남의 표는 이때 이 브라우저로 들인다(이어받기와 같은 문). */
          async function runnersFor(choice: (typeof choices)[number]): Promise<Runner[]> {
            if (choice.builtin === CHAMPIONS_KEY) {
              const seen = readHistory();
              return seen
                .filter((h, i) => h.img && seen.findIndex((x) => x.champion === h.champion) === i)
                .map((h) => ({ name: h.champion, img: h.img }));
            }
            if (choice.builtin) {
              const got = await fetch(`/apps/karmolab/data/higher-${choice.builtin}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
              const items: Array<{ n: string; i?: string }> = got && Array.isArray(got.items) ? got.items : [];
              return items.filter((x) => x.i).map((x) => ({ name: x.n, img: String(x.i) }));
            }
            if (choice.local) return runnersOf(choice.local.items);
            const adopted = choice.sharedId ? await adoptShared(choice.sharedId) : null;
            return adopted ? runnersOf(adopted.items) : [];
          }

          function paintCurrent(): void {
            if (!current) return;
            const left = current[0];
            const right = current[1];
            $('wcAsk').textContent = `${roundOf === 2 ? t('worldcup.t17') : t('worldcup.roundOf', { n: roundOf })} · ${winners.length + 1} / ${roundOf / 2}`;
            const face = (r: Runner): string =>
              `<img src="${esc(r.img)}" alt="" loading="lazy" style="width:100%;max-height:260px;object-fit:contain;border-radius:10px">` +
              `<span class="hi-nm" style="display:block;margin-top:8px;font-weight:700">${esc(r.name)}</span>`;
            $('wcA').innerHTML = face(left);
            $('wcB').innerHTML = face(right);
          }

          function nextMatch(): void {
            if (queue.length >= 2) {
              current = [queue.shift()!, queue.shift()!];
              paintCurrent();
              return;
            }
            // 홀수로 남으면 부전승 — 다음 판으로 그냥 올린다(대결이 아니므로 안 센다).
            if (queue.length === 1) winners.push(queue.shift()!);
            if (winners.length === 1) {
              finish(winners[0]);
              return;
            }
            queue = winners;
            winners = [];
            roundOf = queue.length;
            nextMatch();
          }

          function choose(index: 0 | 1): void {
            if (!current) return;
            const win = current[index];
            const lose = current[index === 0 ? 1 : 0];
            matches.push({ win: win.name, lose: lose.name, round: roundOf });
            winners.push(win);
            current = null;
            nextMatch();
          }

          function finish(champion: Runner): void {
            $('wcPlay').hidden = true;
            $('wcDone').hidden = false;
            $('wcChampion').innerHTML =
              `<div style="text-align:center">` +
              `<div style="font-size:var(--font-size-sm);color:var(--text-tertiary)">${esc(t('worldcup.t04'))}</div>` +
              `<img src="${esc(champion.img)}" alt="" style="max-width:320px;max-height:320px;object-fit:contain;border-radius:12px">` +
              `<div style="font-size:20px;font-weight:800;margin-top:8px">${esc(champion.name)}</div></div>`;

            // 내가 고른 길 — 마지막 판부터 거슬러. 우승만 남기면 「누구를 버렸나」가 사라진다.
            const path = matches
              .slice()
              .reverse()
              .filter((m) => m.round <= 8)
              .map((m) => `<li>${m.round === 2 ? t('worldcup.t17') : t('worldcup.roundOf', { n: m.round })} — ${esc(m.win)} <span style="color:var(--text-tertiary)">▸ ${esc(m.lose)}</span></li>`)
              .join('');
            $('wcPath').innerHTML = path
              ? `<div class="tool-sublabel">${esc(t('worldcup.t05'))}</div><ol style="list-style:none;padding:0;margin:6px 0 0;line-height:1.8">${path}</ol>`
              : '';

            pushHistory({ at: new Date().toISOString(), title: picked?.title ?? '', champion: champion.name, img: champion.img });
            // 같이 하는 판이면 내 길을 보낸다 — 상대가 도착하면 그때 견준다.
            myPath = matches.slice();
            myChampion = champion.name;
            const send = sendResult;
            if (send && together) {
              send({ champion: champion.name, path: matches });
              $('wcTogetherMsg').textContent = t('worldcup.t18');
            }
            paintHistory();
            if (typeof Mdd !== 'undefined') Mdd.linePreset?.('success', { msg: t('worldcup.championIs', { name: champion.name }) });
            sendTournament(champion);
          }

          /** 판 결과를 표의 통계로 보낸다. 서버 없으면 통계 칸만 없다. */
          function sendTournament(champion: Runner): void {
            const sharedId = picked?.sharedId;
            if (!sharedId) {
              $('wcTally').innerHTML =
                t('worldcup.t19');
              return;
            }
            fetch(`${API_BASE}/kl/packs/${encodeURIComponent(sharedId)}/tournament`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ matches, champion: champion.name }),
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((body: { tally?: Array<{ name: string; rate: number; seen: number; champion: number }> } | null) => {
                if (!container.isConnected || !body || !body.tally || !body.tally.length) return;
                /* 나 vs 남 (TASK-KL-151 심화) — 「내 우승이 남들과 같나 다르나」가 이 놀이의
                   진짜 재미다. 우승 횟수 합이 곧 지금까지 돌린 판 수다(따로 안 센다). */
                const totalRuns = body.tally.reduce((sum, t) => sum + (t.champion ?? 0), 0);
                const mine = body.tally.filter((t) => t.name === champion.name)[0];
                const taste =
                  totalRuns >= 2 && mine
                    ? `<p class="tool-status">지금까지 ${totalRuns}판 중 <b>${Math.round(
                        ((mine.champion ?? 0) / totalRuns) * 100
                      )}%</b> 가 ${esc(champion.name)} 를 뽑았습니다 — ${
                        (mine.champion ?? 0) * 2 >= totalRuns ? t('worldcup.t20') : t('worldcup.t21')
                      }</p>`
                    : '';
                $('wcTally').innerHTML =
                  taste +
                  `<div class="tool-sublabel">${esc(t('worldcup.t06'))}</div>` +
                  `<ol style="list-style:none;padding:0;margin:6px 0 0">` +
                  body.tally
                    .slice(0, 10)
                    .map(
                      /* `t` 는 말 묶음 함수 이름이다 — 여기서 가리면 이 안에서 t() 를 못 부른다. */
                      (row, i) =>
                        `<li style="display:flex;justify-content:space-between;gap:12px;padding:4px 0">` +
                        `<span>${i + 1}. ${esc(row.name)}</span>` +
                        `<span style="color:var(--text-secondary)">${Math.round(row.rate * 100)}% · ${t('worldcup.seen', { n: row.seen })}${row.champion ? ` · ${t('worldcup.wonCount', { n: row.champion })}` : ''}</span></li>`,
                    )
                    .join('') +
                  `</ol>`;
              })
              .catch(() => {
                /* 통계만 없다 */
              });
          }

          function paintHistory(): void {
            const list = readHistory();
            if (!list.length) {
              $('wcHistory').innerHTML = '';
              return;
            }
            $('wcHistory').innerHTML =
              `<div class="tool-sublabel">${esc(t('worldcup.t07'))}</div>` +
              `<div class="hi-chips">` +
              list
                .slice(0, 8)
                .map(
                  (h) =>
                    `<span class="pk-emoji" title="${esc(h.title)}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:100px">` +
                    `<img src="${esc(h.img)}" alt="" style="width:22px;height:22px;object-fit:cover;border-radius:50%">` +
                    `<b>${esc(h.champion)}</b></span>`,
                )
                .join('') +
              `</div>`;
          }

          async function start(): Promise<void> {
            if (!picked) return;
            $('wcStart').setAttribute('disabled', 'true');
            const all = await runnersFor(picked);
            $('wcStart').removeAttribute('disabled');
            if (all.length < 4) {
              $('wcPackMsg').textContent = t('worldcup.t22');
              return;
            }
            /* 같이 하는 판이면 **같은 씨앗**으로 섞는다 — 그래야 라운드끼리 맞댈 수 있다. */
            runners = shuffled(all, together ? seededRandom(together.seed) : Math.random).slice(
              0,
              Math.min(size, all.length)
            );
            queue = runners.slice();
            winners = [];
            matches = [];
            roundOf = queue.length;
            $('wcSetup').hidden = true;
            $('wcDone').hidden = true;
            $('wcPlay').hidden = false;
            nextMatch();
          }

          /* ── 같이 하기 (TASK-KL-151 ⑧) ───────────────────────────────────
           *
           * 왜 「기다렸다 같이 누르기」가 아닌가: 한 명이 고민하면 다른 한 명은 그냥 멈춰 있다.
           * 몇십 판을 그렇게 하면 지친다. 그래서 **대진만 맞추고 각자 돌린다** —
           * 재미는 「같이 누르기」가 아니라 **끝나고 갈리는 데** 있다.
           *
           * 서버는 없다(트리스테로). 우리 쪽에 방도 기록도 안 남는다.
           */
          const APP_ID = 'karmolab-worldcup';
          let room: ReturnType<typeof joinRoom> | null = null;
          let sendResult: ((data: unknown) => void) | null = null;
          let together: { seed: number; size: number; packKey: string } | null = null;
          let myPath: Match[] | null = null;
          let myChampion: string | null = null;

          function closeRoom(): void {
            try {
              room?.leave();
            } catch {
              /* 이미 닫혔다 */
            }
            room = null;
            sendResult = null;
          }
          Toolbox.onDispose?.(closeRoom);

          /** 둘의 결과를 견준다 — 같은 대진이라 라운드끼리 그대로 맞댈 수 있다. */
          function compare(theirs: { champion: string; path: Array<{ win: string; lose: string; round: number }> }): void {
            const { rate } = agreement(myPath ?? [], theirs.path);
            $('wcTogetherMsg').innerHTML =
              `${t('worldcup.theirChampion')}: <b>${esc(theirs.champion)}</b> ${esc(t('worldcup.t08'))} <b>${esc(myChampion ?? '')}</b><br>` +
              t('worldcup.sameRate', { rate }) +
              (theirs.champion === myChampion ? t('worldcup.t23') : rate >= 60 ? t('worldcup.t24') : t('worldcup.t25'));
          }

          function connect(code: string, host: boolean): void {
            closeRoom();
            const r = joinRoom({ appId: APP_ID }, code);
            room = r;
            // 받는 자리를 만들 때 같이 건다 (트리스테로 0.25 부터 이 모양이다 — duel.ts 와 같은 길).
            let pendingSetup: { seed: number; size: number; packKey: string } | null = null;
            const setupChannel = r.makeAction('setup', {
              onMessage: (data: unknown) => {
                const d = data as { seed?: number; size?: number; packKey?: string };
                if (typeof d?.seed !== 'number' || typeof d.size !== 'number' || !d.packKey) return;
                pendingSetup = { seed: d.seed, size: d.size, packKey: d.packKey };
                applySetup(pendingSetup);
              }
            });
            const sendSetup = setupChannel.send as (data: unknown) => void;

            const resultChannel = r.makeAction('result', {
              onMessage: (data: unknown) => {
                const d = data as { champion?: string; path?: Match[] };
                if (!d || !Array.isArray(d.path) || typeof d.champion !== 'string') return;
                compare({ champion: d.champion, path: d.path });
              }
            });
            sendResult = resultChannel.send as (data: unknown) => void;

            if (host) {
              $('wcTogetherMsg').textContent = t('worldcup.roomWaiting', { code });
              r.onPeerJoin = (): void => {
                if (!picked) {
                  $('wcTogetherMsg').textContent = t('worldcup.t26');
                  return;
                }
                together = { seed: Math.floor(Math.random() * 2 ** 31), size, packKey: picked.key };
                sendSetup(together);
                $('wcTogetherMsg').textContent = t('worldcup.t27');
                void start();
              };
              return;
            }

            $('wcTogetherMsg').textContent = t('worldcup.t28');
          }

          /** 상대가 정한 대진으로 맞춘다. 그 표가 여기 없으면 말해 준다(조용히 다른 표로 놀면 안 된다). */
          function applySetup(setup: { seed: number; size: number; packKey: string }): void {
            together = setup;
            const found = choices.filter((c) => c.key === setup.packKey)[0];
            if (!found) {
              $('wcTogetherMsg').textContent = t('worldcup.t29');
              return;
            }
            picked = found;
            size = setup.size;
            paintPacks();
            void start();
          }

          $('wcMakeRoom').addEventListener('click', () => {
            if (!picked) {
              $('wcTogetherMsg').textContent = t('worldcup.t30');
              return;
            }
            const code = 'wc' + selfId.slice(0, 6) + Math.random().toString(36).slice(2, 5);
            void navigator.clipboard.writeText(code).catch(() => undefined);
            connect(code, true);
            $('wcTogetherMsg').textContent = t('worldcup.roomCopied', { code });
          });

          $('wcJoinRoom').addEventListener('click', () => {
            const code = prompt(t('worldcup.t31'));
            if (!code) return;
            connect(code.trim(), false);
          });

          $('wcA').addEventListener('click', () => choose(0));
          $('wcB').addEventListener('click', () => choose(1));
          $('wcStart').addEventListener('click', () => void start());
          $('wcAgain').addEventListener('click', () => void start());
          $('wcOther').addEventListener('click', () => {
            $('wcDone').hidden = true;
            $('wcSetup').hidden = false;
          });
          /* 자랑은 **그림**으로 나간다 (TASK-KL-151 ②).
             글만 복사하면 아무도 안 붙여넣는다 — 사람이 자랑하는 자리는 그림이 먼저 보인다.
             그림을 못 얹거나 복사가 막히면 카드가 글자만으로 서거나 파일로 내려간다. */
          $('wcShare').addEventListener('click', () => {
            const last = readHistory()[0];
            if (!last) return;
            const beat = matches.filter((m) => m.round === 2)[0];
            $('wcMsg').textContent = t('worldcup.t32');
            void copyResultCard(
              {
                kicker: `이상형 월드컵 · ${last.title}`,
                headline: last.champion,
                lines: [
                  `${runners.length}강`,
                  beat ? `결승에서 ${beat.lose} 를 이겼습니다` : '',
                  new Date(last.at).toLocaleDateString('ko-KR')
                ].filter(Boolean),
                imageUrl: last.img
              },
              `karmolab-worldcup-${last.champion}.png`
            ).then((msg) => {
              /* 그림만 주면 **받은 사람이 같은 판을 할 수가 없다**. 올라간 표면 그 주소도 같이
                 남긴다(미리보기가 뜨는 주소다 — 봇이 제목·그림을 내준다). */
              const shared = picked?.sharedId;
              if (shared) {
                void navigator.clipboard
                  .writeText(`https://yawnbot.mascari4615.com/kl/w/${shared}`)
                  .catch(() => undefined);
                $('wcMsg').textContent = `${msg} 같은 표로 놀 수 있는 주소도 함께 복사했습니다.`;
                return;
              }
              $('wcMsg').textContent = msg;
            });
          });

          /* 왼쪽·오른쪽 화살표로도 고른다 — 몇십 번을 누르는 놀이라 손이 마우스에 묶이면 지친다. */
          const keys = (e: KeyboardEvent): void => {
            const page = container.closest('.tool-page');
            if (!container.isConnected || !page || !page.classList.contains('active')) return;
            if ($('wcPlay').hidden || !current) return;
            const t = e.target as HTMLElement | null;
            if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              choose(0);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              choose(1);
            }
          };
          addEventListener('keydown', keys);
          Toolbox.onDispose?.(() => removeEventListener('keydown', keys));

          /* 「내 표」에서 밀어 준 표가 있으면 그것부터 골라 둔다 (TASK-KL-089 와 같은 문).
             화면이 다시 보일 때마다 확인한다 — 앱은 한 번 그린 화면을 그대로 다시 보여 주므로,
             나중에 밀어 넣은 표는 이 갱신이 없으면 영영 안 뜬다. */
          /** 자랑 주소(`?wc=<표>`)로 들어왔나 — 그 표를 바로 골라 준다 (TASK-KL-151 ⑤). */
          function wantedShared(): string | null {
            const got = new URLSearchParams(location.search).get('wc');
            return got && /^[a-z0-9]{4,16}$/.test(got) ? got : null;
          }

          function refresh(): void {
            const handed = takePick();
            loadChoices();
            const wanted = wantedShared();
            if (wanted) {
              /* 받은 사람은 **그 표로 놀러 온 것**이다. 목록에서 찾아 눌러 달라고 하면
                 한 단계가 더 생기고, 대부분 거기서 나간다. 바로 골라 둔다. */
              void adoptShared(wanted).then((pack) => {
                if (!pack || !container.isConnected) return;
                loadChoices();
                const found = choices.filter((c) => c.local && c.local.id === pack.id)[0];
                if (!found) return;
                picked = found;
                paintPacks();
                paintRounds();
                $('wcPackMsg').textContent = `「${pack.title}」 로 놀러 오셨네요 — 몇 강으로 할지 고르고 시작하세요.`;
              });
              return;
            }
            if (!handed) return;
            const found = choices.filter((c) => c.local && c.local.id === handed)[0];
            if (found) {
              picked = found;
              paintPacks();
              paintRounds();
            }
          }
          onPageActive(container, refresh);

          refresh();
          paintHistory();
                  });
        }
      }
    ]
  });
})();
