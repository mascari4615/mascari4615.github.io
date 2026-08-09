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
import { mountPlayBoard, renderPlayResult, submitPlay, type PlaySpec } from '../lib/plays';
import { variantFor } from '../lib/shared-packs';
import { ensureLocal, localChoices, sharedChoices } from '../lib/pack-choices';
import { absorbFromUrl, getPack, loadPacks, packToCode, type Pack } from './pack-store';
import { onPageActive, takePick } from './pack-pick';
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    { id: 'pokemon', title: t('higher.t04'), emoji: '🔴' },
    { id: 'lol', title: t('higher.t05'), emoji: '⚔️' },
    { id: 'genshin', title: t('higher.t06'), emoji: '🌠' }
  ];
  const BEST_KEY = 'karmolab_higher_best';

  Toolbox.register({
    id: 'higher',
    title: t('widgets.higher.title', undefined, "높은 쪽 고르기"),
    category: 'tool',
    desc: t('widgets-desc.higher.desc', undefined, "둘 중 어느 쪽이 더 큰지만 고르는 연승 놀이. 포켓몬·롤·원신 표로 겨룹니다"),
    // 커뮤니티와 같은 틀 — 넓게 쓰고 도구 제목 카드는 안 그린다 (TASK-KL-089).
    // 놀이는 앱의 일원이되 화면은 놀이 제 구조다. 도구 상세 페이지도 만들지 않는다.
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M4 18l5-6 4 3 7-9" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 6h5v5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('higher.t09', undefined, "놀기"),
        build: function (container: HTMLElement): void {
          void loadNamespace('higher').then(function () {

          if (typeof Mdd !== 'undefined') Mdd.linePreset?.('tool_run', { msg: t('higher.t10') });
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-sublabel">${esc(t('higher.t01'))}</div>
              <div id="hiBoards" class="hi-chips" role="group" aria-label="${esc(t('higher.aria.hiBoards'))}"></div>
            </div>
            <p class="hi-ask" id="hiAsk">${esc(t('higher.label.hiAsk'))}</p>
            <div class="hi-pair">
              <button class="hi-side" id="hiA" type="button"></button>
              <button class="hi-side" id="hiB" type="button"></button>
            </div>
            <p class="hi-score"><span>${esc(t('higher.t02'))} <b id="hiStreak">0</b></span><span>${esc(t('higher.t03'))} <b id="hiBest">0</b></span></p>
            <p class="tool-status" id="hiMsg" aria-live="polite"></p>
            <p class="pc-line" id="hiCourse" hidden></p>
            <p id="hiRecord" hidden></p>
            <div id="hiBoard" hidden></div>
            <div id="hiAgain" style="display:none; gap:6px; flex-wrap:wrap;">
              <button class="btn btn-primary" id="hiRetry">${esc(t('higher.btn.hiRetry'))}</button>
              <button class="btn btn-ghost" id="hiShare">${esc(t('higher.btn.hiShare'))}</button>
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
          /** 몇 번째 불러오기인가 — 판을 빨리 바꾸면 먼저 부른 표가 나중에 도착해 덮는다. */
          let loadSeq = 0;
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
          /**
           * 이 판(표)의 순위판 이름 (TASK-KL-148).
           * 포켓몬 10연승과 롤 10연승은 같은 기록이 아니다 — 표마다 순위판이 갈린다.
           */
          const specOf = (id: string): PlaySpec => ({
            game: 'higher',
            /* 사람이 만든 표는 **올라간 주소**로 가른다 (TASK-KL-150).
             * 이 브라우저 안의 이름으로 가르면, 같은 표를 이어받은 두 사람이 서로 다른
             * 순위판에 서서 각자 혼자 1등이 된다. */
            variant: id.indexOf('pack:') === 0 ? variantFor(getPack(id.slice(5)) ?? { id: id.slice(5) }) : id,
            better: 'high',
            unit: t('higher.t02'),
            decimals: 0,
          });

          /**
           * 한 연승이 끝났다 — 기록 원장에 남긴다. 0연승은 안 보낸다(기록이 아니다).
           * 실패해도 놀이는 이미 다 끝나 있다.
           */
          const sendRun = (id: string, last: number): void => {
            if (last < 1 || !id) return;
            const spec = specOf(id);
            void submitPlay(spec, last).then((r) => {
              const slot = container.querySelector<HTMLElement>('#hiRecord');
              if (!slot || !slot.isConnected) return;
              renderPlayResult(slot, spec, r);
              if (r.server && r.server.improved) mountPlayBoard($('hiBoard'), spec);
            });
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
              t('higher.ask', { field: field.label }) +
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
              /* 최고 기록은 **오를 때마다** 남긴다. 예전에는 지는 순간에만 적어서, 이기고 있는
               * 중에 판을 바꾸거나 창을 닫으면 그 연승이 통째로 사라졌다(실측: 2연승 → 최고 0). */
              $('hiBest').textContent = String(bestOf(boardId, streak));
              $('hiMsg').textContent = t('higher.t11');
              setTimeout(() => {
                left = right!.v[field!.key] > left!.v[field!.key] ? right : left;
                nextRound(true);
              }, 1100);
            } else {
              // 첫 판에 지면 「0연승에서 끝났습니다」가 된다 — 아깝지도 않은데 아깝다고 말한다.
              $('hiMsg').textContent = streak
                ? t('higher.lostAt', { n: streak })
                : t('higher.t12');
              $('hiBest').textContent = String(bestOf(boardId, streak));
              $('hiAgain').style.display = 'flex';
              markToday(streak);
              sendRun(boardId, streak);
              // 끝낸 그 자리에서 오늘 남은 놀이를 말해 준다 — 여기서 안 하면 그냥 창을 닫는다.
              mountCourseNext($('hiCourse'), 'higher');
            }
          }

          /**
           * 사람이 만든 표를 이 놀이의 모양으로 옮긴다 (TASK-KL-089).
           * 여기서 겨룰 수 있는 칸은 **숫자 칸**뿐이다 — 「분류」로는 어느 쪽이 더 큰지 물을 수 없다.
           * 값이 두 개도 안 되는 칸은 빼고, 하나도 안 남으면 그 표는 이 놀이에 안 걸린다.
           */
          function packBoard(p: Pack): Board | null {
            const nums = p.fields.filter(
              (f) => f.kind === 'number' && p.items.filter((it) => typeof it[f.key] === 'number').length >= 2
            );
            if (!nums.length) return null;
            return {
              title: p.title,
              emoji: p.emoji,
              fields: nums.map((f) => ({ key: f.key, label: f.label, unit: f.unit })),
              items: p.items.map((it) => {
                const v: Record<string, number> = {};
                for (const f of nums) if (typeof it[f.key] === 'number') v[f.key] = it[f.key] as number;
                return { n: it.name, i: String(it.img || ''), v };
              })
            };
          }

          function load(id: string): void {
            /* 쌓던 연승이 있는데 판을 바꾸면 **말없이 0** 이 됐다 — 실수로 눌러도 그냥 잃었다.
             * 기록은 이미 남아 있으니(이길 때마다 적는다) 그 사실을 말해 주고, 오늘 한 판으로도 센다. */
            let note = '';
            if (streak > 0 && boardId && boardId !== id) {
              markToday(streak);
              // 판을 바꿔 끝난 연승도 기록이다 — **떠나는 표**의 순위판에 남긴다.
              sendRun(boardId, streak);
              // 새 판을 다 그린 **뒤에** 말해야 한다 — 먼저 적으면 새 판이 그리면서 지운다(실측).
              note = t('higher.switchedBoard', { n: streak });
            }
            boardId = id;
            /* 판마다 그림의 결이 다르다 — 포켓몬은 96px 도트라 키우면 뭉개진다. 도트는 도트답게
             * 각지게 늘리고(그게 원래 모양이다), 초상화인 롤·원신은 그냥 매끄럽게 둔다. */
            const pair = container.querySelector<HTMLElement>('.hi-pair');
            if (pair) pair.dataset.board = id;
            const mine = id.indexOf('pack:') === 0 ? getPack(id.slice(5)) : null;
            const src: Promise<Board> = mine
              ? (() => {
                  const bd = packBoard(mine);
                  return bd ? Promise.resolve(bd) : Promise.reject(new Error('no-number'));
                })()
              : fetch(`/apps/karmolab/data/higher-${id}.json`).then((r) => r.json());
            const mySeq = ++loadSeq;
            src
              .then((j: Board) => {
                if (mySeq !== loadSeq) return;
                board = j;
                field = null; // 첫 기준도 nextRound 가 뽑는다 — 뽑는 자리를 두 곳에 두지 않는다
                streak = 0;
                left = null;
                $('hiStreak').textContent = '0';
                $('hiBest').textContent = String(bestOf(id));
                // 이 표의 순위판을 붙인다 (표를 바꾸면 순위판도 그 표의 것으로 갈린다).
                $('hiRecord').hidden = true;
                $('hiBoard').hidden = true;
                mountPlayBoard($('hiBoard'), specOf(id));
                nextRound(false);
                if (note) $('hiMsg').textContent = note;
              })
              .catch((err) => {
                if (mySeq !== loadSeq) return;
                $('hiAsk').textContent =
                  err && err.message === 'no-number'
                    ? t('higher.t13')
                    : t('higher.t14');
              });
          }

          /* 사람이 만든 표도 판으로 나란히 선다 — 숫자 칸이 있는 것만(그래야 겨룰 수 있다).
           * 표는 놀다가도 새로 생긴다. 그래서 목록은 **화면이 보일 때마다** 다시 그린다. */
          let boards: Array<{ id: string; title: string; emoji: string }> = [];

          function drawChips(active: string): void {
            $('hiBoards').innerHTML = '';
            boards.forEach((b) => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = `${b.emoji} ${b.title}`;
              btn.setAttribute('aria-pressed', String(b.id === active));
              btn.addEventListener('click', () => {
                [...$('hiBoards').children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
                btn.setAttribute('aria-pressed', 'true');
                /* 남의 표는 고른 **그때** 받아 들인다 (TASK-KL-150 ②) — 목록을 그릴 때 전부
                   받으면 안 고를 표까지 수백 KB 씩 받게 된다. */
                if (b.id.indexOf('shared:') === 0) {
                  $('hiAsk').textContent = t('higher.t15');
                  void ensureLocal(b.id).then((got) => {
                    if (!got) {
                      $('hiAsk').textContent = t('higher.t16');
                      return;
                    }
                    b.id = got; // 이제 이 브라우저 표다 — 다시 안 받는다
                    load(got);
                  });
                  return;
                }
                load(b.id);
              });
              $('hiBoards').appendChild(btn);
            });
          }

          function paintBoards(active: string): void {
            // 이 브라우저 표를 **먼저** 그린다 — 서버를 기다리는 동안 목록이 비면 안 된다.
            boards = BOARDS.concat(localChoices('number').map((c) => ({ id: c.id, title: c.title, emoji: c.emoji })));
            drawChips(active);
            void sharedChoices('number').then((rows) => {
              if (!container.isConnected || !rows.length) return;
              boards = boards.concat(rows.map((c) => ({ id: c.id, title: `${c.title} · ${c.owner ?? t('higher.t17')}`, emoji: c.emoji })));
              drawChips(active);
            });
          }

          /** 「내 표」가 밀어 준 판이 있으면 그걸로, 없으면 있던 대로. */
          function useHandoff(fallback: string): void {
            const got = absorbFromUrl();
            const pick = got ? got.id : takePick();
            const id = pick && getPack(pick) ? 'pack:' + pick : fallback;
            paintBoards(id);
            if (id !== fallback || !boardId) load(id);
          }

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
           * 한 번에 한 판씩 몇십 번을 누르는 놀이인데 좌우 화살표가 아무 일도 안 했다.
           * ← → 로 고르고, 끝난 뒤에는 Enter 로 다시 시작한다. */
          const keys = (e: KeyboardEvent): void => {
            /* 「지금 보이는 화면인가」는 **페이지 칸**에게 물어야 한다. 위로 훑기만 하면
             * 탭 속살에도 같은 표시가 있어서, 딴 화면에서 누른 화살표가 이 놀이를 움직였다(실측). */
            const page = container.closest('.tool-page');
            if (!container.isConnected || !page || !page.classList.contains('active')) return;
            const target = e.target as HTMLElement | null;
            if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
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
            /* 주소는 **이 놀이가 실제로 사는 곳**이어야 한다. 도구 상세 주소를 퍼뜨리던 시절엔
             * 자랑을 받은 사람이 없는 곳으로 갔다. 기준(몸무게 따위)도 안 적는다 — 판마다 바뀐다.
             *
             * 내 표로 논 판이면 **표를 실은 주소**를 준다. 안 그러면 받은 사람에게는 그 표가 없어
             * 열어도 남의 표로 놀게 된다 — 자랑이 자랑이 안 된다. */
            const b = boards.filter((x) => x.id === boardId)[0];
            const mine = boardId.indexOf('pack:') === 0 ? getPack(boardId.slice(5)) : null;
            const url = mine
              ? `blog.mascari4615.com/karmolab/?pack=${packToCode(mine)}#higher`
              : 'blog.mascari4615.com/karmolab/#higher';
            const text = t('higher.shareText', {
              board: b ? b.title : '',
              n: streak,
              best: bestOf(boardId),
              url,
            });
            void navigator.clipboard.writeText(text).then(() => {
              $('hiShare').textContent = t('higher.t18');
            });
          });

          onPageActive(container, () => useHandoff(boardId || BOARDS[0].id));
          useHandoff(BOARDS[0].id);
                  });
        }
      }
    ]
  });
})();
