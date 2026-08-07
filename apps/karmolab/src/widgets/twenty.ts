/**
 * 스무고개 (TASK-KL-089) — 사람이 하나를 마음에 정하고, 여기가 물어서 맞힌다.
 *
 * 왜 이 놀이인가: 있던 놀이 셋은 전부 **사람이 맞히는** 쪽이었다. 방향을 뒤집으면 같은 표로
 * 전혀 다른 재미가 나온다 — 「어떻게 알았지?」가 이 놀이의 전부다.
 *
 * 질문은 손으로 안 적는다. 표의 칸에서 **저절로** 나온다:
 *   - 여럿 중 하나(타입·색·원소 …) → 「타입에 전기가 있나요?」
 *   - 숫자(세대·키·체력 …) → 남은 후보의 중앙값을 기준으로 「1.0m 보다 큰가요?」
 * 그중에서 **후보를 가장 반으로 가르는** 질문을 고른다. 그래서 표가 늘면 질문도 같이 는다.
 *
 * 표는 「오늘의 하나 맞히기」의 것을 그대로 쓴다(/daily/data/<주제>.json) — 놀이마다 표를
 * 따로 두면 그날부터 서로 다른 세상을 말한다.
 */
import { mountCourseNext } from './play-course';

(function (): void {
  type Val = string | string[] | number;
  interface Item {
    name: string;
    img?: string;
    [k: string]: Val | undefined;
  }
  interface Field {
    key: string;
    label: string;
    kind?: 'number' | 'set' | 'category';
    unit?: string;
  }
  interface Topic {
    fields: Field[];
    items: Item[];
  }
  /** 하나의 질문 — 후보를 「예」쪽과 「아니오」쪽으로 가른다. */
  interface Ask {
    text: string;
    hit: (it: Item) => boolean;
  }

  const TOPICS: Array<{ id: string; title: string; emoji: string }> = [
    { id: 'pokemon', title: '포켓몬', emoji: '🔴' },
    { id: 'lol', title: '롤 챔피언', emoji: '⚔️' },
    { id: 'genshin', title: '원신 캐릭터', emoji: '🌠' }
  ];
  const MAX_ASK = 20;
  const DAY_KEY = 'karmolab_twenty_day';

  Toolbox.register({
    id: 'twenty',
    title: '스무고개',
    category: 'tool',
    desc: '하나를 마음에 정하세요. 스무 번 안에 맞혀 보겠습니다 — 포켓몬·롤·원신',
    // 커뮤니티와 같은 틀 — 넓게 쓰고 도구 제목 카드는 안 그린다.
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M9 9a3 3 0 1 1 4 2.8c-.8.3-1 .9-1 1.7v.4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: '스무고개',
        build: function (container: HTMLElement): void {
          Mdd.linePreset?.('tool_run', { msg: '하나만 마음에 정해 보세요. 제가 맞혀 볼게요.' });
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-sublabel">무엇을 생각할까요</div>
              <div id="twTopics" class="hi-chips" role="group" aria-label="주제 고르기"></div>
            </div>
            <p class="tw-lead">하나를 마음에 정하세요. 스무 번 안에 맞혀 보겠습니다.</p>
            <section class="tw-card">
              <div class="tw-head"><span id="twCount">준비 중…</span><span id="twLeft"></span></div>
              <p class="tw-q" id="twQ">표를 불러오는 중…</p>
              <div class="tw-row" id="twRow">
                <button type="button" class="btn btn-primary" data-say="yes">예</button>
                <button type="button" class="btn btn-ghost" data-say="no">아니오</button>
                <button type="button" class="btn btn-ghost" data-say="skip">모르겠어요</button>
              </div>
              <div class="tw-guess" id="twGuess" hidden></div>
              <p class="tool-status" id="twMsg" aria-live="polite"></p>
              <p class="pc-line" id="twCourse" hidden></p>
              <div class="tw-after" id="twAfter" hidden>
                <button type="button" class="btn btn-primary" id="twAgain">다시</button>
                <button type="button" class="btn btn-ghost" id="twShare">결과 복사</button>
              </div>
            </section>
            <details class="tw-log" id="twLog" hidden><summary>지금까지 물어본 것</summary><ol id="twLogList"></ol></details>
          `;

          const $ = (id: string) => container.querySelector<HTMLElement>('#' + id)!;
          let topic: Topic | null = null;
          let topicId = TOPICS[0].id;
          let pool: Item[] = [];
          let asked = 0;
          let cur: Ask | null = null;
          let guessing: Item | null = null;
          const history: string[] = [];
          const refused: string[] = []; // 「아니에요」를 들은 추측 — 다시 내밀지 않는다

          const esc = (s: string): string =>
            String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

          /* ── 질문 만들기 ─────────────────────────────
           * 남은 후보만 보고 만든다. 「전기 타입인가요?」를 물어도 남은 후보에 전기가 하나도
           * 없으면 아무것도 못 가른다 — 그런 질문은 애초에 후보에 안 오른다. */
          function asksFor(items: Item[], fields: Field[]): Ask[] {
            const out: Ask[] = [];
            for (const f of fields) {
              const kind = f.kind || 'category';
              if (kind === 'number') {
                const nums = items
                  .map((it) => it[f.key])
                  .filter((v): v is number => typeof v === 'number')
                  .sort((a, b) => a - b);
                if (nums.length < 2) continue;
                const mid = nums[Math.floor(nums.length / 2)];
                if (mid === nums[0]) continue; // 다 같은 값 — 못 가른다
                const shown = Number.isInteger(mid) ? String(mid) : mid.toFixed(1);
                out.push({
                  text: `${f.label}이(가) ${shown}${f.unit || ''} 보다 큰가요?`,
                  hit: (it) => typeof it[f.key] === 'number' && (it[f.key] as number) > mid
                });
                continue;
              }
              // 값마다 「그 값인가요?」 하나씩. 흔한 값일수록 잘 가른다 — 고르는 건 아래가 한다.
              const seen = new Map<string, number>();
              for (const it of items) {
                const v = it[f.key];
                const list = Array.isArray(v) ? v : v === undefined ? [] : [String(v)];
                for (const one of list) seen.set(String(one), (seen.get(String(one)) || 0) + 1);
              }
              for (const [v, n] of seen) {
                if (n === items.length) continue; // 전부가 그렇다 — 못 가른다
                out.push({
                  text:
                    kind === 'set'
                      ? `${f.label}에 「${v}」 가 있나요?`
                      : `${f.label}이(가) 「${v}」 인가요?`,
                  hit: (it) => {
                    const x = it[f.key];
                    return Array.isArray(x) ? x.map(String).indexOf(v) >= 0 : String(x) === v;
                  }
                });
              }
            }
            return out;
          }

          /** 후보를 가장 반으로 가르는 질문. 반으로 가를수록 남은 수가 빨리 준다. */
          function bestAsk(): Ask | null {
            if (!topic) return null;
            const cand = asksFor(pool, topic.fields).filter((a) => history.indexOf(a.text) < 0);
            let best: Ask | null = null;
            let bestGap = Infinity;
            for (const a of cand) {
              let yes = 0;
              for (const it of pool) if (a.hit(it)) yes++;
              if (yes === 0 || yes === pool.length) continue;
              const gap = Math.abs(pool.length / 2 - yes);
              if (gap < bestGap) {
                bestGap = gap;
                best = a;
              }
            }
            return best;
          }

          /** 오늘 이 놀이를 했다는 한 줄 — 코스가 나중에 이걸 읽는다. */
          function markToday(): void {
            const k = new Date(Date.now() + 9 * 3600e3);
            const day = `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
            try {
              const raw = JSON.parse(localStorage.getItem(DAY_KEY) || '{}');
              const cur2 = raw.day === day ? raw : { day, rounds: 0 };
              cur2.rounds = (cur2.rounds || 0) + 1;
              localStorage.setItem(DAY_KEY, JSON.stringify(cur2));
            } catch {
              /* 사생활 모드 */
            }
          }

          function paintLog(): void {
            if (!history.length) return;
            $('twLog').hidden = false;
            $('twLogList').innerHTML = history.map((h) => `<li>${esc(h)}</li>`).join('');
          }

          function endRound(msg: string, win: boolean): void {
            cur = null;
            guessing = null;
            $('twRow').hidden = true;
            $('twGuess').hidden = true;
            $('twQ').textContent = win ? '맞혔습니다!' : '졌습니다.';
            $('twMsg').textContent = msg;
            $('twAfter').hidden = false;
            $('twLeft').textContent = '';
            markToday();
            mountCourseNext($('twCourse'), 'twenty');
          }

          /** 후보가 몇 안 남았거나 물을 게 없으면 찍는다. */
          function tryGuess(): boolean {
            const live = pool.filter((it) => refused.indexOf(it.name) < 0);
            if (!live.length) {
              endRound('제 표에 없는 것 같아요. 알려 주시면 다음엔 맞힐게요.', false);
              return true;
            }
            if (live.length > 2 && asked < MAX_ASK && bestAsk()) return false;
            guessing = live[0];
            $('twRow').hidden = true;
            $('twGuess').hidden = false;
            $('twGuess').innerHTML =
              `<div class="tw-face">${guessing.img ? `<img src="${esc(String(guessing.img))}" alt="">` : ''}` +
              `<strong>${esc(guessing.name)}</strong></div>` +
              `<div class="tw-row"><button type="button" class="btn btn-primary" data-hit="yes">맞아요</button>` +
              `<button type="button" class="btn btn-ghost" data-hit="no">아니에요</button></div>`;
            $('twQ').textContent = '혹시 이것인가요?';
            return true;
          }

          function nextAsk(): void {
            if (tryGuess()) return;
            cur = bestAsk();
            if (!cur) {
              tryGuess();
              return;
            }
            $('twQ').textContent = cur.text;
            $('twCount').textContent = `${asked + 1}번째 질문`;
            $('twLeft').textContent = `후보 ${pool.length}`;
            $('twRow').hidden = false;
            $('twGuess').hidden = true;
          }

          function say(kind: 'yes' | 'no' | 'skip'): void {
            if (!cur) return;
            const q = cur;
            asked++;
            history.push(`${q.text} → ${kind === 'yes' ? '예' : kind === 'no' ? '아니오' : '모르겠어요'}`);
            if (kind !== 'skip') {
              const keep = pool.filter((it) => (kind === 'yes' ? q.hit(it) : !q.hit(it)));
              // 대답이 표와 어긋나 후보가 0이 되면 놀이가 죽는다 — 그 대답만 흘려보낸다.
              if (keep.length) pool = keep;
              else $('twMsg').textContent = '음… 그 답이면 남는 게 없네요. 방금 건 없던 걸로 할게요.';
            }
            paintLog();
            if (asked >= MAX_ASK) {
              tryGuess();
              return;
            }
            nextAsk();
          }

          $('twRow').addEventListener('click', (e) => {
            const b = (e.target as HTMLElement).closest('[data-say]') as HTMLElement | null;
            if (b) say(b.dataset.say as 'yes' | 'no' | 'skip');
          });
          $('twGuess').addEventListener('click', (e) => {
            const b = (e.target as HTMLElement).closest('[data-hit]') as HTMLElement | null;
            if (!b || !guessing) return;
            if (b.dataset.hit === 'yes') {
              endRound(`${asked}번 만에 맞혔습니다.`, true);
              return;
            }
            // 아니라면 그것만 빼고 계속 — 남은 것이 없으면 그때 진다.
            refused.push(guessing.name);
            pool = pool.filter((it) => it.name !== guessing!.name);
            $('twMsg').textContent = '아, 아니군요. 계속해 볼게요.';
            $('twGuess').hidden = true;
            nextAsk();
          });

          $('twAgain').addEventListener('click', () => start(topicId));
          $('twShare').addEventListener('click', () => {
            const t = TOPICS.filter((x) => x.id === topicId)[0];
            const text =
              `KarmoLab 스무고개 — ${t ? t.title : ''}\n` +
              `${asked}번 만에${guessing ? '' : ''} ${$('twQ').textContent === '맞혔습니다!' ? '맞힘' : '못 맞힘'}\n` +
              'blog.mascari4615.com/karmolab/#twenty';
            void navigator.clipboard.writeText(text).then(() => {
              $('twShare').textContent = '복사했습니다';
            });
          });

          function start(id: string): void {
            topicId = id;
            asked = 0;
            history.length = 0;
            refused.length = 0;
            guessing = null;
            $('twLog').hidden = true;
            $('twAfter').hidden = true;
            $('twCourse').hidden = true;
            $('twMsg').textContent = '';
            $('twShare').textContent = '결과 복사';
            $('twQ').textContent = '표를 불러오는 중…';
            $('twRow').hidden = true;
            $('twGuess').hidden = true;
            fetch(`/daily/data/${id}.json`)
              .then((r) => r.json())
              .then((j: Topic) => {
                topic = j;
                pool = j.items.slice();
                nextAsk();
              })
              .catch(() => {
                $('twQ').textContent = '표를 못 불러왔습니다.';
                $('twMsg').textContent = '인터넷이 잠깐 끊겼을 수 있어요.';
              });
          }

          TOPICS.forEach((t, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `${t.emoji} ${t.title}`;
            btn.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
            btn.addEventListener('click', () => {
              [...$('twTopics').children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
              btn.setAttribute('aria-pressed', 'true');
              start(t.id);
            });
            $('twTopics').appendChild(btn);
          });

          start(TOPICS[0].id);
        }
      }
    ]
  });
})();
