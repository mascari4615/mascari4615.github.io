/**
 * 높은 쪽 고르기 (TASK-KL-089) — 둘 중 큰 쪽만 고르는 연승 놀이.
 *
 * 왜 여기 있나: 처음에는 KarmoLab 바깥에 따로 만든 페이지였다. 그러니 색도 글씨도 제각각이라
 * 같은 사이트로 보이지 않았다. 놀이도 KarmoLab 이다 — 다른 도구와 똑같이 위젯으로 둔다.
 * 그러면 머리·이동 경로·검색용 정보·방문 기록이 전부 공짜로 따라온다.
 *
 * 표는 「오늘의 하나 맞히기」가 모아 둔 것을 쓴다(data/higher-<주제>.json 으로 추려 둔 것).
 */
(function (): void {
  interface Item {
    n: string;
    i: string;
    v: Record<string, number>;
  }
  interface Field {
    key: string;
    label: string;
    unit?: string;
  }
  interface Board {
    title: string;
    emoji?: string;
    fields: Field[];
    items: Item[];
  }

  const BOARDS: Array<{ id: string; title: string; emoji: string }> = [
    { id: 'pokemon', title: '포켓몬', emoji: '🔴' },
    { id: 'lol', title: '롤 챔피언', emoji: '⚔️' },
    { id: 'genshin', title: '원신 캐릭터', emoji: '🌠' }
  ];
  const BEST_KEY = 'karmolab_higher_best';

  Toolbox.register({
    id: 'higher',
    title: '높은 쪽 고르기',
    category: 'tool',
    desc: '둘 중 어느 쪽이 더 큰지만 고르는 연승 놀이. 포켓몬·롤·원신 표로 겨룹니다',
    layout: 'wide',
    icon:
      '<path d="M4 18l5-6 4 3 7-9" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 6h5v5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '놀기',
        build: function (container: HTMLElement): void {
          Mdd.linePreset?.('tool_run', { msg: '한 번 틀리면 끝이에요. 조심조심.' });
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-sublabel">무엇으로 겨룰까요</div>
              <div id="hiBoards" class="hi-chips" role="group" aria-label="판 고르기"></div>
            </div>
            <p class="hi-ask" id="hiAsk">불러오는 중…</p>
            <div class="hi-pair">
              <button class="hi-side" id="hiA" type="button"></button>
              <button class="hi-side" id="hiB" type="button"></button>
            </div>
            <p class="hi-score"><span>연승 <b id="hiStreak">0</b></span><span>최고 <b id="hiBest">0</b></span></p>
            <p class="tool-status" id="hiMsg" aria-live="polite"></p>
            <div id="hiAgain" style="display:none; gap:6px; flex-wrap:wrap;">
              <button class="btn btn-primary" id="hiRetry">다시</button>
              <button class="btn btn-ghost" id="hiShare">결과 복사</button>
            </div>
          `;

          const $ = (id: string) => container.querySelector<HTMLElement>('#' + id)!;
          let board: Board | null = null;
          let boardId = '';
          let field: Field | null = null;
          let left: Item | null = null;
          let right: Item | null = null;
          let streak = 0;
          let locked = false;
          const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

          const bestOf = (id: string, put?: number): number => {
            let all: Record<string, number> = {};
            try {
              all = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
            } catch {
              all = {};
            }
            if (put !== undefined && put > (all[id] || 0)) {
              all[id] = put;
              try {
                localStorage.setItem(BEST_KEY, JSON.stringify(all));
              } catch {
                /* 저장 못 해도 놀이는 그대로 된다 */
              }
            }
            return all[id] || 0;
          };
          const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
          const fmt = (v: number): string => String(v) + (field && field.unit ? ' ' + field.unit : '');

          /* 값을 0 부터 세어 올린다 — 「넘을까 말까」를 눈으로 보게 하는 것이 이 놀이의 재미다. */
          function countUp(el: HTMLElement, target: number): void {
            if (calm) {
              el.textContent = fmt(target);
              return;
            }
            const dur = 700;
            const t0 = performance.now();
            const dec = String(target).indexOf('.') >= 0 ? String(target).split('.')[1].length : 0;
            const step = (now: number): void => {
              const k = Math.min(1, (now - t0) / dur);
              const eased = 1 - Math.pow(1 - k, 3);
              el.textContent = fmt(Number((target * eased).toFixed(dec)));
              if (k < 1) requestAnimationFrame(step);
              else el.textContent = fmt(target);
            };
            requestAnimationFrame(step);
          }

          function paintSide(el: HTMLElement, item: Item, show: boolean): void {
            el.className = 'hi-side';
            (el as HTMLButtonElement).disabled = false;
            el.innerHTML = `<img src="${item.i}" alt="" loading="lazy"><span class="hi-nm">${item.n}</span><span class="hi-vl">${
              show ? fmt(item.v[field!.key]) : '?'
            }</span>`;
          }

          /* 이긴 쪽은 자리에 남는다 — 방금 본 값과 계속 견주게 되는 것이 이 놀이의 문법이다. */
          function nextRound(keepLeft?: boolean): void {
            if (!board || !field) return;
            locked = false;
            $('hiAgain').style.display = 'none';
            const pool = board.items.filter((x) => x.v[field!.key] !== undefined);
            if (!keepLeft || !left) left = pick(pool);
            let tries = 0;
            do {
              right = pick(pool);
              tries++;
            } while ((right === left || right.v[field.key] === left.v[field.key]) && tries < 50);
            $('hiAsk').innerHTML = `<b>${field.label}</b> — 어느 쪽이 더 클까요?`;
            paintSide($('hiA'), left, true);
            paintSide($('hiB'), right!, false);
            $('hiMsg').textContent = '';
          }

          function answer(el: HTMLElement, chosen: Item, other: Item): void {
            if (locked || !field) return;
            locked = true;
            const win = chosen.v[field.key] > other.v[field.key];
            ($('hiA') as HTMLButtonElement).disabled = true;
            ($('hiB') as HTMLButtonElement).disabled = true;
            countUp($('hiB').querySelector('.hi-vl') as HTMLElement, right!.v[field.key]);
            el.classList.add(win ? 'is-win' : 'is-lose');
            if (win) {
              streak++;
              $('hiStreak').textContent = String(streak);
              $('hiMsg').textContent = '맞았습니다';
              setTimeout(() => {
                left = right!.v[field!.key] > left!.v[field!.key] ? right : left;
                nextRound(true);
              }, 1100);
            } else {
              $('hiMsg').textContent = `아깝습니다 — ${streak}연승에서 끝났습니다`;
              $('hiBest').textContent = String(bestOf(boardId, streak));
              $('hiAgain').style.display = 'flex';
            }
          }

          function load(id: string): void {
            boardId = id;
            fetch(`/apps/karmolab/data/higher-${id}.json`)
              .then((r) => r.json())
              .then((j: Board) => {
                board = j;
                field = pick(j.fields);
                streak = 0;
                left = null;
                $('hiStreak').textContent = '0';
                $('hiBest').textContent = String(bestOf(id));
                nextRound(false);
              })
              .catch(() => {
                $('hiAsk').textContent = '표를 못 불러왔습니다. 잠시 뒤 다시 열어 주세요.';
              });
          }

          BOARDS.forEach((b, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `${b.emoji} ${b.title}`;
            btn.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
            btn.addEventListener('click', () => {
              [...$('hiBoards').children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
              btn.setAttribute('aria-pressed', 'true');
              load(b.id);
            });
            $('hiBoards').appendChild(btn);
          });

          $('hiA').addEventListener('click', () => answer($('hiA'), left!, right!));
          $('hiB').addEventListener('click', () => answer($('hiB'), right!, left!));
          $('hiRetry').addEventListener('click', () => {
            streak = 0;
            left = null;
            $('hiStreak').textContent = '0';
            nextRound(false);
          });
          $('hiShare').addEventListener('click', () => {
            const b = BOARDS.filter((x) => x.id === boardId)[0];
            const text = `KarmoLab 높은 쪽 고르기 — ${b ? b.title : ''} / ${field ? field.label : ''}\n${streak}연승 (최고 ${bestOf(
              boardId
            )})\nblog.mascari4615.com/karmolab/t/higher/`;
            void navigator.clipboard.writeText(text).then(() => {
              $('hiShare').textContent = '복사했습니다';
            });
          });

          load(BOARDS[0].id);
        }
      }
    ]
  });
})();
