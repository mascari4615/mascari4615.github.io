/**
 * 놀이터 (TASK-KL-089) — 놀이 셋으로 가는 한 자리.
 *
 * 왜: 놀이 둘이 앱 안으로 들어오면서(`#higher`·`#quest`) **들어갈 문이 없어졌다** —
 * 주소를 아는 사람만 갈 수 있었다. 첫 화면 카드가 여기로 오고, 여기서 셋으로 갈린다.
 *
 * 목록은 손으로 적지 않는다. `apps/play/games.json` 하나가 관문·전환 줄·이 화면을 전부 먹인다
 * (`apps/play/scripts/build.mjs` 가 이 앱의 data/ 로 실어 준다). 두 벌로 적으면 그날부터 갈라진다.
 */
(function (): void {
  interface Game {
    id: string;
    title: string;
    lead: string;
    emoji: string;
    url: string;
  }

  Toolbox.register({
    id: 'play',
    title: '놀이터',
    category: 'tool',
    desc: '하루 한 판씩 — 하나 맞히기 · 높은 쪽 고르기 · 오늘의 문제',
    // 커뮤니티와 같은 틀 — 넓게 쓰고 도구 제목 카드는 안 그린다.
    layout: 'wide',
    noHero: true,
    icon:
      '<rect x="3" y="7" width="18" height="11" rx="4" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M7.5 11v3M6 12.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="16" cy="12" r="1.1" fill="currentColor"/><circle cx="18" cy="14.5" r="1.1" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: '놀이터',
        build: function (container: HTMLElement): void {
          Mdd.linePreset?.('tool_run', { msg: '하루 한 판씩이에요. 오늘 건 하셨어요?' });
          container.innerHTML = `
            <p class="pl-lead">하루 한 판씩. 하나 하다 다른 것으로 바로 건너가세요.</p>
            <div class="pl-grid" id="plGrid"></div>
          `;
          const grid = container.querySelector<HTMLElement>('#plGrid')!;

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
                if (done) return `오늘 ${done}판 끝냈어요`;
                if (playing) return '풀던 판이 있어요';
              }
              if (id === 'quest') {
                const q = read('karmolab_quest');
                const t = q && q[dayLabel()];
                if (t) return t.win ? `오늘 맞혔어요 (${t.tries}번)` : '오늘은 아쉬웠어요';
              }
              if (id === 'higher') {
                const h = read('karmolab_higher_best');
                if (h) {
                  const top = Math.max(0, ...Object.keys(h).map((k) => Number(h[k]) || 0));
                  if (top) return `최고 ${top}연승`;
                }
              }
            } catch {
              /* 사생활 모드 — 딱지만 안 붙고 놀이는 된다 */
            }
            return '';
          }

          const esc = (s: string): string =>
            String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
            .then((j: { games: Game[] }) => paint(j.games))
            .catch(() => {
              grid.innerHTML = '<p class="tool-status">놀이 목록을 못 불러왔습니다.</p>';
            });
        }
      }
    ]
  });
})();
