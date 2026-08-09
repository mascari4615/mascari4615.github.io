/**
 * 놀이터 (TASK-KL-089) — 놀이 셋으로 가는 한 자리.
 *
 * 왜: 놀이 둘이 앱 안으로 들어오면서(`#higher`·`#quest`) **들어갈 문이 없어졌다** —
 * 주소를 아는 사람만 갈 수 있었다. 첫 화면 카드가 여기로 오고, 여기서 셋으로 갈린다.
 *
 * 목록은 손으로 적지 않는다. `apps/play/games.json` 하나가 관문·전환 줄·이 화면을 전부 먹인다
 * (`apps/play/scripts/build.mjs` 가 이 앱의 data/ 로 실어 준다). 두 벌로 적으면 그날부터 갈라진다.
 */
import { courseRun, courseSteps } from './play-course';
import { loadPacks } from './pack-store';
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  interface Game {
    id: string;
    title: string;
    lead: string;
    emoji: string;
    url: string;
  }

  Toolbox.register({
    id: 'play',
    title: t('widgets.play.title', undefined, "놀이터"),
    category: 'tool',
    desc: t('widgets-desc.play.desc', undefined, "하루 한 판씩 — 하나 맞히기 · 높은 쪽 고르기 · 오늘의 문제"),
    // 커뮤니티와 같은 틀 — 넓게 쓰고 도구 제목 카드는 안 그린다.
    layout: 'wide',
    noHero: true,
    icon:
      '<rect x="3" y="7" width="18" height="11" rx="4" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M7.5 11v3M6 12.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="16" cy="12" r="1.1" fill="currentColor"/><circle cx="18" cy="14.5" r="1.1" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('play.t06', undefined, "놀이터"),
        build: function (container: HTMLElement): void {
          void loadNamespace('play').then(function () {

          if (typeof Mdd !== 'undefined') Mdd.linePreset?.('tool_run', { msg: t('play.t08') });
          container.innerHTML = `
            <p class="pl-lead">${esc(t('play.t01'))}</p>
            <section class="pl-course" id="plCourse"></section>
            <div class="pl-grid" id="plGrid"></div>
            <!-- 표를 사람이 만들 수 있게 됐는데 **거기로 가는 문이 없었다** — 주소를 아는
                 사람만 닿았다. 놀이 다음 자리가 그 문이다(놀이의 재료가 표이므로). -->
            <section class="pl-mine" id="plWell"></section>
            <section class="pl-mine" id="plMine"></section>
          `;
          const grid = container.querySelector<HTMLElement>('#plGrid')!;
          let games: Game[] = [];

          /* 놀이를 하고 이 화면으로 **돌아오면** 앱은 그려 둔 화면을 그대로 다시 보여 준다 —
           * 방금 한 판이 코스에 안 비쳤다(실측). 돌아온 그 순간에 다시 센다.
           * 다는 일은 여기서(그리는 중에) 해야 뒷정리를 맡길 수 있다 — 나중에 걸면 주인을 모른다. */
          const again = (): void => {
            if (!games.length || !container.isConnected) return;
            paintCourse(games);
            paint(games);
            paintMine();
            paintWell();
          };
          /* 화면을 바꾸는 일은 주소가 아니라 **이 칸에 붙는 표시**로 일어난다(pushState 라
           * hashchange 가 안 온다 — 그걸로 걸었더니 안 돌았다). 그 표시가 켜지는 것을 본다.
           *
           * 붙일 칸은 **그리는 도중에는 아직 없을 수 있다** — 화면에 얹기 전에 그리는 길이 있어서,
           * 그때 찾으면 못 찾고 조용히 안 걸린다(처음 연 화면이 그랬다). 한 박자 뒤에 찾는다. */
          const eye = new MutationObserver((recs) => {
            for (const r of recs) {
              if ((r.target as HTMLElement).classList.contains('active')) {
                again();
                return;
              }
            }
          });
          setTimeout(() => {
            const page = container.closest('.tool-page') || container.parentElement;
            if (page) eye.observe(page, { attributes: true, attributeFilter: ['class'] });
          }, 0);
          Toolbox.onDispose?.(() => eye.disconnect());

          /** 이 브라우저에 남은 것만 읽는다 — 여기서 새로 저장하는 것은 없다. */
          const read = (k: string): any => {
            try {
              return JSON.parse(localStorage.getItem(k) || 'null');
            } catch {
              return null;
            }
          };
          const dayLabel = (): string => {
            const d = new Date(Date.now() + 9 * 3600e3);
            return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`;
          };

          /** 「오늘 내가 뭘 했나」 한 줄. 없으면 빈 문자열 — 빈 딱지는 안 붙인다. */
          function mine(id: string): string {
            try {
              if (id === 'daily') {
                let done = 0;
                let playing = 0;
                Object.keys(localStorage).forEach((k) => {
                  if (!/^daily:[^:]+:[^:]+$/.test(k)) return;
                  const v = read(k);
                  if (!v || !v.day) return;
                  if (v.status === 'won' || v.status === 'lost') done++;
                  else if ((v.guesses || []).length) playing++;
                });
                if (done) return t('play.doneToday', { n: done });
                if (playing) return t('play.t09');
              }
              if (id === 'quest') {
                const q = read('karmolab_quest');
                const today = q && q[dayLabel()];
                if (today) return today.win ? t('play.gotToday', { n: today.tries }) : t('play.t10');
              }
              if (id === 'higher') {
                const h = read('karmolab_higher_best');
                if (h) {
                  const top = Math.max(0, ...Object.keys(h).map((k) => Number(h[k]) || 0));
                  if (top) return t('play.bestStreak', { n: top });
                }
              }
            } catch {
              /* 사생활 모드 — 딱지만 안 붙고 놀이는 된다 */
            }
            return '';
          }

          /* 오늘의 코스 — 셈은 놀이들과 **같은 한 벌**을 쓴다 (play-course).
           * 여기와 놀이 안에 따로 적으면 그날부터 서로 다른 코스를 말한다. */
          function paintCourse(list: Game[]): void {
            const box = container.querySelector<HTMLElement>('#plCourse')!;
            const state = courseSteps(list);
            const left = state.filter((s) => !s.done).length;
            const all = left === 0;
            const run = all ? courseRun(true) : 0;

            const marks = state
              .map(
                (s) => `<span class="pl-step${s.done ? ' is-done' : ''}">${s.done ? '●' : '○'} ${esc(s.title)}</span>`,
              )
              .join('');
            box.innerHTML =
              `<div class="pl-course-head">` +
              `<strong>${esc(t('play.t02'))}</strong>` +
              (all
                ? `<span class="pl-stamp">${t('play.finishedRun', { n: run })}</span>`
                : `<span class="pl-course-left">${t('play.left', { n: left })}</span>`) +
              `</div><div class="pl-steps">${marks}</div>` +
              `<p class="pl-course-note">${
                all ? t('play.t11') : t('play.t12')
              }</p>`;
          }


          /**
           * 오늘의 표 (TASK-KL-153) — 바깥 우물에서 매일 한 벌.
           *
           * 왜 여기인가: 놀이의 재료는 표인데, 표를 **만드는** 사람만 새 재료를 얻었다.
           * 길어 오는 문이 놀이터 안에 없으면 우물을 파 놓고 아무도 안 들어간다.
           * 서버가 날짜(KST)로 고르므로 오늘은 누구에게나 같은 표다 — 그래야 겨룰 수 있다.
           *
           * fail-open: 못 닿으면 이 줄만 없다. 놀이터는 그대로다.
           */
          function paintWell(): void {
            const box = container.querySelector<HTMLElement>('#plWell')!;
            fetch('https://yawnbot.mascari4615.com/kl/wells')
              .then((r) => (r.ok ? r.json() : null))
              .then((body: { wells?: Array<{ id: string; title: string; emoji: string }>; today?: string } | null) => {
                if (!body || !container.isConnected) return;
                const today = (body.wells || []).filter((w) => w.id === body.today)[0];
                if (!today) return;
                box.innerHTML =
                  `<div class="pl-mine-head"><strong>${esc(t('play.t03'))}</strong>` +
                  `<button type="button" class="btn btn-ghost" id="plWellGo">${esc(t('play.btn.plWellGo'))}</button></div>` +
                  `<div class="pl-chips"><span class="pl-chip">${esc(today.emoji)} ${esc(today.title)}</span></div>` +
                  `<p class="pl-course-note">${esc(t('play.t04'))}</p>`;
                box.querySelector('#plWellGo')!.addEventListener('click', () => Toolbox.switchPage('packwell'));
              })
              .catch(() => {
                /* 우물에 못 닿으면 이 줄만 없다 */
              });
          }

          /** 내가 만든 표 — 있으면 늘어놓고, 없으면 만들러 가는 문 하나. */
          function paintMine(): void {
            const box = container.querySelector<HTMLElement>('#plMine')!;
            const packs = loadPacks();
            box.innerHTML =
              `<div class="pl-mine-head"><strong>${esc(t('play.t05'))}</strong>` +
              `<button type="button" class="btn btn-ghost" id="plNew">${packs.length ? t('play.t13') : t('play.t14')}</button></div>` +
              (packs.length
                ? `<div class="pl-chips">${packs
                    .map((p) => `<span class="pl-chip">${esc(p.emoji)} ${esc(p.title)} <b>${p.items.length}</b></span>`)
                    .join('')}</div>` +
                  t('play.t15')
                : t('play.t16'));
            box.querySelector('#plNew')!.addEventListener('click', () => Toolbox.switchPage('packs'));
          }

          function paint(list: Game[]): void {
            grid.innerHTML = list
              .map((g) => {
                const tag = mine(g.id);
                return (
                  `<a class="pl-card" href="${esc(g.url)}" data-play="${esc(g.id)}">` +
                  `<span class="pl-emoji">${esc(g.emoji)}</span>` +
                  `<strong>${esc(g.title)}</strong>` +
                  `<span class="pl-lead-sm">${esc(g.lead)}</span>` +
                  (tag ? `<span class="pl-mine">${esc(tag)}</span>` : '') +
                  '</a>'
                );
              })
              .join('');

            /* 앱 안의 놀이는 새로 페이지를 받을 이유가 없다 — 그 자리에서 화면만 바꾼다.
             * 밖에 있는 것(`/daily/`)은 그냥 링크로 둔다. */
            grid.querySelectorAll<HTMLAnchorElement>('a[href^="/karmolab/#"]').forEach((a) => {
              a.addEventListener('click', (e) => {
                e.preventDefault();
                Toolbox.switchPage(a.getAttribute('href')!.split('#')[1]);
              });
            });
          }

          fetch('/apps/karmolab/data/games.json')
            .then((r) => r.json())
            .then((j: { games: Game[] }) => {
              paintCourse(j.games);
              paint(j.games);
              paintMine();
              paintWell();
              games = j.games;
            })
            .catch(() => {
              grid.innerHTML = t('play.t17');
            });
                  });
        }
      }
    ]
  });
})();
