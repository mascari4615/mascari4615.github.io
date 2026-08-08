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

const API_BASE = 'https://yawnbot.mascari4615.com';
/** 이 브라우저에 남기는 지난 판 (「작년의 나는 누구를 골랐나」). */
const HISTORY_KEY = 'karmolab_worldcup_history';

interface Runner {
  name: string;
  img: string;
}

/**
 * 처음부터 있는 표 (TASK-KL-151).
 *
 * 왜 필요한가: 사람이 만든 표만 쓰게 두면 **처음 온 사람에게는 빈 화면**이 뜬다.
 * 「표를 먼저 만드세요」는 놀러 온 사람에게 숙제를 내미는 것이다 — 일단 한 판 해 보고
 * 재밌으면 자기 표를 만든다. 표는 「높은 쪽 고르기」가 쓰던 것을 그대로 쓴다(그림이 다 있다).
 */
const BUILTIN = [
  { id: 'pokemon', title: '포켓몬', emoji: '🔴' },
  { id: 'lol', title: '롤 챔피언', emoji: '⚔️' },
  { id: 'genshin', title: '원신 캐릭터', emoji: '🌠' },
];

interface Match {
  win: string;
  lose: string;
  /** 몇 강에서 붙었나 (16 = 16강). 「내가 고른 길」이 이걸로 선다. */
  round: number;
}

(function (): void {
  const esc = (s: string): string =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** 몇 강까지 할 수 있나 — 표 크기가 정한다. 4강은 되어야 놀이가 된다. */
  function roundChoices(count: number): number[] {
    const out: number[] = [];
    for (let size = 4; size <= 128; size *= 2) if (size <= count) out.push(size);
    return out;
  }

  function shuffled<T>(list: T[]): T[] {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

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
    title: '이상형 월드컵',
    category: 'play',
    desc: '둘 중 하나만 고르는 토너먼트. 표를 만들면 그대로 내 월드컵이 됩니다',
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M7 4h10v3a5 5 0 0 1-10 0V4z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M12 12v4M9 20h6M10 16h4v4h-4z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '놀기',
        build: function (container: HTMLElement): void {
          if (typeof Mdd !== 'undefined') Mdd.linePreset?.('tool_run', { msg: '둘 중 하나만 고르세요. 못 고르겠죠? 그게 재미예요.' });

          container.innerHTML = `
            <div id="wcSetup">
              <div class="field-group">
                <div class="tool-sublabel">무엇으로 겨룰까요</div>
                <div id="wcPacks" class="hi-chips" role="group" aria-label="표 고르기"></div>
                <p class="tool-status" id="wcPackMsg">표를 불러오는 중…</p>
              </div>
              <div class="field-group" id="wcRoundBox" hidden>
                <div class="tool-sublabel">몇 강으로 할까요</div>
                <div id="wcRounds" class="hi-chips" role="group" aria-label="라운드 고르기"></div>
              </div>
              <div class="pk-row" id="wcStartRow" hidden>
                <button type="button" class="btn btn-primary" id="wcStart">시작</button>
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
                <button type="button" class="btn btn-primary" id="wcAgain">다시</button>
                <button type="button" class="btn btn-ghost" id="wcShare">결과 복사</button>
                <button type="button" class="btn btn-ghost" id="wcOther">다른 표로</button>
              </div>
              <div id="wcPath" style="margin-top:14px"></div>
              <div id="wcTally" style="margin-top:18px"></div>
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
                '그림이 있는 표가 아직 없습니다 — 「내 표 만들기」에서 「그림」 칸에 주소를 넣어 만들어 보세요.';
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
              btn.textContent = `${n}강`;
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
            const builtins: typeof choices = BUILTIN.map((b) => ({
              key: `builtin:${b.id}`,
              title: b.title,
              emoji: b.emoji,
              /* 항목 수는 파일을 받아 봐야 안다. 여기서는 「128강까지 열어 둔다」는 뜻으로만 쓴다 —
                 실제로 받은 뒤 그보다 적으면 그만큼만 달린다(`start`). */
              runners: 128,
              builtin: b.id,
            }));
            choices = builtins.concat(
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
            $('wcAsk').textContent = `${roundOf === 2 ? '결승' : `${roundOf}강`} · ${winners.length + 1} / ${roundOf / 2}`;
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
              `<div style="font-size:var(--font-size-sm);color:var(--text-tertiary)">우승</div>` +
              `<img src="${esc(champion.img)}" alt="" style="max-width:320px;max-height:320px;object-fit:contain;border-radius:12px">` +
              `<div style="font-size:20px;font-weight:800;margin-top:8px">${esc(champion.name)}</div></div>`;

            // 내가 고른 길 — 마지막 판부터 거슬러. 우승만 남기면 「누구를 버렸나」가 사라진다.
            const path = matches
              .slice()
              .reverse()
              .filter((m) => m.round <= 8)
              .map((m) => `<li>${m.round === 2 ? '결승' : `${m.round}강`} — ${esc(m.win)} <span style="color:var(--text-tertiary)">▸ ${esc(m.lose)}</span></li>`)
              .join('');
            $('wcPath').innerHTML = path
              ? `<div class="tool-sublabel">내가 고른 길</div><ol style="list-style:none;padding:0;margin:6px 0 0;line-height:1.8">${path}</ol>`
              : '';

            pushHistory({ at: new Date().toISOString(), title: picked?.title ?? '', champion: champion.name, img: champion.img });
            paintHistory();
            if (typeof Mdd !== 'undefined') Mdd.linePreset?.('success', { msg: `${champion.name} 이(가) 우승이네요!` });
            sendTournament(champion);
          }

          /** 판 결과를 표의 통계로 보낸다. 서버 없으면 통계 칸만 없다. */
          function sendTournament(champion: Runner): void {
            const sharedId = picked?.sharedId;
            if (!sharedId) {
              $('wcTally').innerHTML =
                '<p class="tool-status">이 표는 아직 안 올라가 있어서 남들과의 승률은 안 나옵니다 — 「내 표」에서 올리면 생깁니다.</p>';
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
                $('wcTally').innerHTML =
                  `<div class="tool-sublabel">이 표의 인기 (실제로 붙어 본 판만)</div>` +
                  `<ol style="list-style:none;padding:0;margin:6px 0 0">` +
                  body.tally
                    .slice(0, 10)
                    .map(
                      (t, i) =>
                        `<li style="display:flex;justify-content:space-between;gap:12px;padding:4px 0">` +
                        `<span>${i + 1}. ${esc(t.name)}</span>` +
                        `<span style="color:var(--text-secondary)">${Math.round(t.rate * 100)}% · ${t.seen}번 마주침${t.champion ? ` · 우승 ${t.champion}` : ''}</span></li>`,
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
              `<div class="tool-sublabel">지난 우승</div>` +
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
              $('wcPackMsg').textContent = '그 표에서 그림이 있는 항목이 넷도 안 됩니다.';
              return;
            }
            runners = shuffled(all).slice(0, Math.min(size, all.length));
            queue = runners.slice();
            winners = [];
            matches = [];
            roundOf = queue.length;
            $('wcSetup').hidden = true;
            $('wcDone').hidden = true;
            $('wcPlay').hidden = false;
            nextMatch();
          }

          $('wcA').addEventListener('click', () => choose(0));
          $('wcB').addEventListener('click', () => choose(1));
          $('wcStart').addEventListener('click', () => void start());
          $('wcAgain').addEventListener('click', () => void start());
          $('wcOther').addEventListener('click', () => {
            $('wcDone').hidden = true;
            $('wcSetup').hidden = false;
          });
          $('wcShare').addEventListener('click', () => {
            const last = readHistory()[0];
            if (!last) return;
            const text = `KarmoLab 이상형 월드컵 — ${last.title}\n내 우승: ${last.champion}\n${location.origin}/karmolab/#worldcup`;
            void navigator.clipboard.writeText(text).then(() => {
              $('wcMsg').textContent = '결과를 복사했습니다.';
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

          loadChoices();
          paintHistory();
        }
      }
    ]
  });
})();
