/**
 * 높은 쪽 고르기 (TASK-KL-089) — 둘 중 큰 쪽만 고르는 연승 놀이.
 *
 * 자리: 커뮤니티와 같다 — 앱 안의 한 화면(`/karmolab/#higher`). 도구 상세 페이지는 만들지 않는다.
 * (한 번 도구로 넣었다가 「쓰는 법·자주 묻는 것」 틀이 딸려 와 놀이가 글에 파묻혔다.)
 *
 * 왜 여기 있나: 처음에는 KarmoLab 바깥에 따로 만든 페이지였다. 그러니 색도 글씨도 제각각이라
 * 같은 사이트로 보이지 않았다. 놀이도 KarmoLab 이다 — 다른 도구와 똑같이 위젯으로 둔다.
 * 그러면 머리·이동 경로·검색용 정보·방문 기록이 전부 공짜로 따라온다.
 *
 * 표는 「오늘의 하나 맞히기」가 모아 둔 것을 쓴다(data/higher-<주제>.json 으로 추려 둔 것).
 */
import { mountCourseNext } from './play-course';

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
    // 커뮤니티와 같은 틀 — 넓게 쓰고 도구 제목 카드는 안 그린다 (TASK-KL-089).
    // 놀이는 앱의 일원이되 화면은 놀이 제 구조다. 도구 상세 페이지도 만들지 않는다.
    layout: 'wide',
    noHero: true,
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
            <p class="pc-line" id="hiCourse" hidden></p>
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
          /* 오늘 이 놀이를 했는지 (TASK-KL-089 — 「오늘의 코스」).
           * 최고 기록만으로는 **오늘 했는지**를 알 수 없다(작년에 세운 10연승이 그대로 남는다).
           * 놀이터가 코스를 세려면 「오늘 한 판 끝냈다」가 있어야 한다 — 그 한 줄을 여기서 남긴다. */
          const markToday = (last: number): void => {
            const k = new Date(Date.now() + 9 * 3600e3);
            const day = `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
            try {
              const raw = JSON.parse(localStorage.getItem('karmolab_higher_day') || '{}');
              const cur = raw.day === day ? raw : { day, rounds: 0, best: 0 };
              cur.rounds = (cur.rounds || 0) + 1;
              cur.best = Math.max(cur.best || 0, last);
              localStorage.setItem('karmolab_higher_day', JSON.stringify(cur));
            } catch {
              /* 사생활 모드 — 코스에만 안 세어지고 놀이는 그대로다 */
            }
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

          /* 이긴 쪽은 자리에 남는다 — 방금 본 값과 계속 견주게 되는 것이 이 놀이의 문법이다.
           *
           * 겨루는 기준은 **판마다 새로 뽑는다**. 예전에는 표를 열 때 한 번 뽑고 끝이라,
           * 열 판을 이어 가도 계속 「키」였고 「다시」를 눌러도 그대로였다 — 같은 질문을
           * 반복하는 놀이가 된다. 남은 쪽의 값도 새 기준으로 다시 보여 주므로 견주는 데 지장 없다. */
          function nextRound(keepLeft?: boolean): void {
            if (!board) return;
            locked = false;
            $('hiAgain').style.display = 'none';
            $('hiCourse').hidden = true;
            const usable = board.fields.filter((f) => board!.items.filter((x) => x.v[f.key] !== undefined).length >= 2);
            const others = usable.filter((f) => f !== field);
            field = others.length ? pick(others) : usable[0] || field;
            if (!field) return;
            const pool = board.items.filter((x) => x.v[field!.key] !== undefined);
            // 남기려던 쪽이 새 기준의 값을 안 가진 경우가 있다 — 그때는 그 쪽도 새로 뽑는다.
            if (!keepLeft || !left || left.v[field.key] === undefined) left = pick(pool);
            let tries = 0;
            do {
              right = pick(pool);
              tries++;
            } while ((right === left || right.v[field.key] === left.v[field.key]) && tries < 50);
            $('hiAsk').innerHTML =
              `<b>${field.label}</b> — 어느 쪽이 더 클까요?` +
              '<span class="hi-keys">← →</span>';
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
            /* 지면 내가 고른 쪽만 빨개졌다 — 더 큰 쪽이 어디였는지는 값을 견줘 봐야 알았다.
             * 끝나는 순간이야말로 「아, 저쪽이었구나」가 눈에 들어와야 하는 자리다. */
            if (!win) {
              const bigger = chosen === left ? $('hiB') : $('hiA');
              bigger.classList.add('is-win');
            }
            if (win) {
              streak++;
              $('hiStreak').textContent = String(streak);
              $('hiMsg').textContent = '맞았습니다';
              setTimeout(() => {
                left = right!.v[field!.key] > left!.v[field!.key] ? right : left;
                nextRound(true);
              }, 1100);
            } else {
              // 첫 판에 지면 「0연승에서 끝났습니다」가 된다 — 아깝지도 않은데 아깝다고 말한다.
              $('hiMsg').textContent = streak
                ? `아깝습니다 — ${streak}연승에서 끝났습니다`
                : '아쉽네요. 한 번 더 해 보세요.';
              $('hiBest').textContent = String(bestOf(boardId, streak));
              $('hiAgain').style.display = 'flex';
              markToday(streak);
              // 끝낸 그 자리에서 오늘 남은 놀이를 말해 준다 — 여기서 안 하면 그냥 창을 닫는다.
              mountCourseNext($('hiCourse'), 'higher');
            }
          }

          function load(id: string): void {
            boardId = id;
            /* 판마다 그림의 결이 다르다 — 포켓몬은 96px 도트라 키우면 뭉개진다. 도트는 도트답게
             * 각지게 늘리고(그게 원래 모양이다), 초상화인 롤·원신은 그냥 매끄럽게 둔다. */
            const pair = container.querySelector<HTMLElement>('.hi-pair');
            if (pair) pair.dataset.board = id;
            fetch(`/apps/karmolab/data/higher-${id}.json`)
              .then((r) => r.json())
              .then((j: Board) => {
                board = j;
                field = null; // 첫 기준도 nextRound 가 뽑는다 — 뽑는 자리를 두 곳에 두지 않는다
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
          function retry(): void {
            streak = 0;
            left = null;
            $('hiStreak').textContent = '0';
            nextRound(false);
          }
          $('hiRetry').addEventListener('click', retry);

          /* 손으로만 놀 수 있었다 (TASK-KL-089).
           * 한 번에 한 판씩 몇십 번을 누르는 놀이인데 좌우 화살표가 아무 일도 안 했다 —
           * 마우스에서 손을 못 뗀다. ← → 로 고르고, 끝난 뒤에는 Enter 로 다시 시작한다.
           * 글자를 치는 중(입력칸 안)에는 안 가로챈다 — 여기엔 입력칸이 없지만 앱 어디서든 안전하게. */
          const keys = (e: KeyboardEvent): void => {
            /* 「지금 보이는 화면인가」는 **페이지 칸**에게 물어야 한다. 그냥 위로 훑으면
             * 탭 속살(panel)에도 같은 표시가 붙어 있어서, 딴 화면에 가 있어도 참이 나온다 —
             * 그렇게 놀이터에서 누른 화살표가 이 놀이의 연승을 올렸다(실측). */
            const page = container.closest('.tool-page');
            if (!container.isConnected || !page || !page.classList.contains('active')) return;
            const t = e.target as HTMLElement | null;
            if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              if (locked || !left || !right) return;
              e.preventDefault();
              const goLeft = e.key === 'ArrowLeft';
              answer($(goLeft ? 'hiA' : 'hiB'), goLeft ? left : right, goLeft ? right : left);
              return;
            }
            if (e.key === 'Enter' && $('hiAgain').style.display === 'flex') {
              e.preventDefault();
              retry();
            }
          };
          addEventListener('keydown', keys);
          Toolbox.onDispose?.(() => removeEventListener('keydown', keys));
          $('hiShare').addEventListener('click', () => {
            /* 주소는 **이 놀이가 실제로 사는 곳**이어야 한다. 앱 안으로 옮긴 뒤에도 도구
             * 상세 주소(/karmolab/t/higher/)를 퍼뜨리고 있었는데 그 페이지는 만들지 않는다 —
             * 자랑을 받은 사람이 누르면 없는 곳으로 갔다.
             * 기준도 빼야 한다. 이제 판마다 바뀌므로 마지막 판 것 하나만 적으면 거짓말이 된다. */
            const b = BOARDS.filter((x) => x.id === boardId)[0];
            const text = `KarmoLab 높은 쪽 고르기 — ${b ? b.title : ''}\n${streak}연승 (최고 ${bestOf(
              boardId
            )})\nblog.mascari4615.com/karmolab/#higher`;
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
