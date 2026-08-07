/**
 * 오늘의 문제 (TASK-KL-089) — 도구를 열어야 풀리는 하루 한 문제.
 *
 * 자리: 커뮤니티와 같다 — 앱 안의 한 화면(`/karmolab/#quest`). 도구 상세 페이지는 만들지 않는다.
 * 정답은 원문 대신 지문(sha-256 앞 16자)만 둔다 — 소스를 열어도 답이 안 보인다.
 * 대조는 이 브라우저 안에서만 한다.
 */
(function (): void {
  interface Puzzle {
    id: string;
    q: string;
    tool: string;
    hint: string;
    a: string[];
  }

  const KEY = 'karmolab_quest';
  const EPOCH = Date.UTC(2026, 7, 8); // 2026-08-08 (KST 자정)

  const kst = (): Date => new Date(Date.now() + 9 * 3600e3);
  const dayNo = (): number => {
    const k = kst();
    return Math.max(0, Math.floor((Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - EPOCH) / 86400e3));
  };
  const dayLabel = (): string => {
    const k = kst();
    return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
  };
  const norm = (s: string): string => s.toLowerCase().replace(/[\s,]/g, '');
  async function fingerprint(s: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm(s)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }

  Toolbox.register({
    id: 'quest',
    title: '오늘의 문제',
    category: 'tool',
    desc: '도구를 열어야 풀리는 하루 한 문제 — 진법·모스·해시·단위',
    // 커뮤니티와 같은 틀 — 넓게 쓰고 도구 제목 카드는 안 그린다.
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M9 8a3 3 0 1 1 4 2.8c-.8.3-1 .9-1 1.7v.5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.2" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: '오늘의 문제',
        build: function (container: HTMLElement): void {
          Mdd.linePreset?.('tool_run', { msg: '도구를 열어서 푸는 거예요. 머리 안 써도 돼요.' });
          container.innerHTML = `
            <p class="qs-lead">하루에 하나. 머리로 짜내지 말고 도구를 열어서 푸세요.</p>
            <section class="qs-card">
              <div class="qs-day" id="qsDay"></div>
              <p class="qs-q" id="qsQ">문제를 불러오는 중…</p>
              <form class="qs-row" id="qsForm" autocomplete="off">
                <input type="text" id="qsAns" aria-label="답" placeholder="답을 적으세요">
                <button type="submit" class="btn btn-primary">맞히기</button>
                <button type="button" class="btn btn-ghost" id="qsHintBtn">힌트</button>
              </form>
              <button type="button" class="qs-tool" id="qsTool">이 문제에 쓰는 도구 열기</button>
              <div class="qs-slot" id="qsSlot" hidden></div>
              <p class="qs-hint" id="qsHint" hidden></p>
              <p class="tool-status" id="qsMsg" aria-live="polite"></p>
              <p class="qs-tries" id="qsTries"></p>
              <div class="qs-after" id="qsAfter" style="display:none; gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn btn-ghost" id="qsShare">결과 복사</button>
                <button type="button" class="btn btn-primary" id="qsMore">다른 문제 하나 더</button>
              </div>
            </section>
          `;

          const $ = (id: string) => container.querySelector<HTMLElement>('#' + id)!;
          const ans = () => container.querySelector<HTMLInputElement>('#qsAns')!;
          let all: Puzzle[] = [];
          let current: Puzzle | null = null;
          let tries = 0;
          let done = false;
          let practice = false;

          const load = (): Record<string, { win: boolean; tries: number }> => {
            try {
              return JSON.parse(localStorage.getItem(KEY) || '{}');
            } catch {
              return {};
            }
          };
          const save = (o: unknown): void => {
            try {
              localStorage.setItem(KEY, JSON.stringify(o));
            } catch {
              /* 사생활 모드 — 기록만 못 남고 놀이는 된다 */
            }
          };

          /* 「도구를 열어야 풀리는 문제」인데 도구를 열면 이 화면을 떠나야 했다 —
           * 적던 답도 몇 번째인지도 날아갔다. 도구를 **문제 밑에서** 편다.
           * 못 펴면(스크립트를 못 받거나 그 도구가 없으면) 그때만 도구 페이지로 보낸다. */
          function openTool(id: string): void {
            const slot = $('qsSlot');
            const btn = $('qsTool') as HTMLButtonElement;
            if (!slot.hidden) {
              slot.hidden = true;
              slot.innerHTML = '';
              btn.textContent = '이 문제에 쓰는 도구 열기';
              return;
            }
            btn.disabled = true;
            btn.textContent = '도구 여는 중…';
            void Promise.resolve(Toolbox.kickLazyLoad?.(id))
              .catch(() => undefined)
              .then(() => {
                const ok = Toolbox.renderInline?.(id, slot);
                btn.disabled = false;
                /* 스크립트를 못 받으면 자리표(「불러오는 중…」)가 그려지고 `ok` 는 참으로 온다 —
                 * 그것만 믿으면 영영 안 끝나는 상자가 남는다. 자리표가 보이면 못 편 것이다. */
                if (!ok || slot.querySelector('.tb-lazy-loading')) {
                  location.href = `/karmolab/t/${id}/`;
                  return;
                }
                slot.hidden = false;
                btn.textContent = '도구 접기';
              });
          }

          function paint(p: Puzzle): void {
            $('qsDay').textContent = practice ? '연습' : `#${dayNo() + 1} · ${dayLabel()}`;
            $('qsQ').textContent = p.q;
            $('qsHint').textContent = p.hint;
            // 문제가 바뀌면 펴 둔 도구도 그 문제의 것으로 — 남겨 두면 딴 문제의 도구가 붙어 있다.
            const slot = $('qsSlot');
            slot.hidden = true;
            slot.innerHTML = '';
            ($('qsTool') as HTMLButtonElement).textContent = '이 문제에 쓰는 도구 열기';
          }

          function finish(win: boolean): void {
            done = true;
            ans().disabled = true;
            $('qsAfter').style.display = 'flex';
            if (practice) return; // 연습은 오늘 성적을 흐리지 않는다
            const st = load();
            st[dayLabel()] = { win, tries };
            save(st);
          }

          /* 오늘 것을 끝내면 할 게 없어 그냥 나가게 된다 — 지난 문제를 연습으로 더 풀게 한다. */
          function practiceRound(): void {
            const todayId = all[dayNo() % all.length].id;
            const pool = all.filter((x) => x.id !== todayId && x.id !== current?.id);
            if (!pool.length) return;
            current = pool[Math.floor(Math.random() * pool.length)];
            practice = true;
            done = false;
            tries = 0;
            ans().disabled = false;
            ans().value = '';
            ans().focus();
            $('qsAfter').style.display = 'none';
            $('qsHint').hidden = true;
            $('qsTries').textContent = '';
            $('qsMsg').textContent = '연습 문제입니다 — 오늘 기록에는 안 들어갑니다.';
            paint(current);
          }

          function start(): void {
            fetch('/apps/karmolab/data/quest-puzzles.json')
              .then((r) => r.json())
              .then((j: { puzzles: Puzzle[] }) => {
                all = j.puzzles;
                current = all[dayNo() % all.length];
                paint(current);
                const st = load()[dayLabel()];
                if (st) {
                  tries = st.tries;
                  $('qsMsg').textContent = st.win ? '오늘 문제는 맞혔습니다.' : '오늘은 여기까지.';
                  $('qsTries').textContent = st.win ? '🟩' : '🟥';
                  finish(st.win);
                } else {
                  // 매일 오는 놀이라 열자마자 칠 수 있어야 한다 — 화면은 안 밀리게.
                  ans().focus({ preventScroll: true });
                }
              })
              .catch(() => {
                // 잠깐 끊긴 것뿐인데 새로고침을 시키지 않는다 — 그 자리에서 다시 받는다.
                $('qsQ').textContent = '문제를 못 불러왔습니다.';
                $('qsMsg').textContent = '인터넷이 잠깐 끊겼을 수 있어요.';
                const again = document.createElement('button');
                again.type = 'button';
                again.className = 'btn btn-primary';
                again.textContent = '다시 받기';
                again.addEventListener('click', () => {
                  again.remove();
                  $('qsQ').textContent = '문제를 불러오는 중…';
                  $('qsMsg').textContent = '';
                  start();
                });
                $('qsForm').insertAdjacentElement('afterend', again);
              });
          }

          $('qsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (done || !current) return;
            const v = ans().value.trim();
            if (!v) return;
            tries++;
            const f = await fingerprint(v);
            if (current.a.indexOf(f) !== -1) {
              $('qsMsg').textContent = `맞았습니다 — ${tries}번 만에.`;
              $('qsTries').textContent = '🟩';
              finish(true);
            } else if (tries >= 5) {
              $('qsMsg').textContent = '다섯 번을 다 썼습니다. 내일 또 하나 나옵니다.';
              $('qsTries').textContent = '🟥';
              finish(false);
            } else {
              $('qsMsg').textContent = `아닙니다 (${tries}/5) — 도구를 열어서 확인해 보세요.`;
              ans().select();
            }
          });

          $('qsTool').addEventListener('click', () => {
            if (current) openTool(current.tool);
          });
          $('qsHintBtn').addEventListener('click', () => {
            $('qsHint').hidden = false;
          });
          $('qsMore').addEventListener('click', practiceRound);
          $('qsShare').addEventListener('click', () => {
            const st = load()[dayLabel()] || { win: false, tries: 5 };
            const text =
              `KarmoLab 오늘의 문제 #${dayNo() + 1}\n` +
              (st.win ? `🟩 ${st.tries}/5` : '🟥 5/5') +
              '\nblog.mascari4615.com/karmolab/#quest';
            void navigator.clipboard.writeText(text).then(() => {
              $('qsShare').textContent = '복사했습니다';
            });
          });

          start();
        }
      }
    ]
  });
})();
