/**
 * 작업물 — 「해온 것」 (change.blog-surfaces-as-widgets ②).
 *
 * 보기 둘을 **같은 자료 한 벌**로 그린다 (사용자 확정 2026-08-28: 「내가 보기엔 지도, 남이
 * 보기엔 진열」):
 *   ① 진열 — 지금 붙들고 있는 것이 큰 칸, 나머지는 연도별 그림 벽. 처음 온 사람이 읽는 순서.
 *   ② 지도 — 가로가 시간, 가로줄이 소속. 몇 해씩 이어 온 것과 한 번 스친 것이 갈려 보인다.
 *
 * 원료 = `data/works.json` (배포 산출, `gen-post-pages.mjs`). 메타 정본은 **각 글의
 * frontmatter `work:`** 이고, 글이 없는 바깥 링크만 `apps/blog/_data/works.yml` 이 든다.
 * 「그 외 참여」 18건은 소품 목록 글에서 읽어 온 것 — 예전에는 카드 한 장 뒤에 숨어 있었다.
 *
 * 색·글꼴은 앱 토큰을 그대로 쓰되 **틀은 이 장 전용**이다 (사용자 확정: 「톤은 유지, 틀만 다르게」).
 */
import { t, loadNamespace } from '../lib/i18n';

export interface WorkRow {
    url: string;
    slug: string | null;
    title: string;
    image: string;
    description: string;
    field: string;
    at: string;
    period: string | null;
    ongoing: boolean;
    org: string;
    roles: string[];
    platform: string;
    tags: string[];
}

export interface MinorRow {
    when: string | null;
    title: string;
    client: string;
    role: string;
    links: { label: string; href: string }[];
}

(function (): void {
    const esc = (v: unknown): string =>
        String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /* 자리는 **갈래(field) + 소속(org)** 두 겹이다 (사용자 확정 2026-08-28).
       「버추얼」 안에 왁타버스도 있고 패러블 계약도 있고, 소속을 굳이 안 적는 것도 있다 —
       한 줄로 늘어놓으면 성격이 다른 것들이 같은 무게로 보인다. */
    const laneOf = (w: WorkRow): string => (w.org ? `${w.field} (${w.org})` : w.field || '·');

    /** 빛깔은 소속이 정한다 — 점·배지·레인이 같은 색이어야 셋이 한 자료로 읽힌다. */
    const ORG_HUE: Record<string, string> = {
        '개인': 'var(--accent)',
        '패러블 엔터테인먼트': '#d4a04f',
        '왁타버스': 'var(--secondary, #7ba7d4)'
    };
    const hueOf = (org: string): string => ORG_HUE[org] ?? 'var(--text-tertiary)';

    Mdd.injectCSS(
        'works',
        `
        .wk { display:flex; flex-direction:column; gap:18px; }

        /* ── 머리: 보기 전환 · 찾기 · 소속 칩 ── */
        .wk-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .wk-seg { display:flex; border:1px solid var(--border); border-radius:999px; overflow:hidden; }
        .wk-seg button { background:none; border:0; color:var(--text-secondary); font-size:13px;
            padding:6px 15px; cursor:pointer; }
        .wk-seg button.on { background:var(--bg-tertiary); color:var(--text-primary); }
        .wk-bar input { flex:1; min-width:150px; background:var(--bg-secondary); border:1px solid var(--border);
            border-radius:var(--radius-sm, 8px); color:var(--text-primary); padding:7px 12px; font-size:13.5px; }
        .wk-chip { background:none; border:1px solid var(--border); border-radius:999px; color:var(--text-secondary);
            padding:4px 12px; cursor:pointer; font-size:12.5px; display:inline-flex; align-items:center; gap:6px; }
        .wk-chip i { width:7px; height:7px; border-radius:50%; display:inline-block; }
        .wk-chip.on { border-color:var(--accent); color:var(--text-primary); }
        .wk-count { color:var(--text-tertiary); font-size:12.5px; margin-left:auto; }

        /* ── 진열 ── */
        .wk-now { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px; }
        .wk-now a { position:relative; display:block; aspect-ratio:16/10; border-radius:14px; overflow:hidden;
            border:1px solid var(--border); color:inherit; text-decoration:none; }
        .wk-now img { width:100%; height:100%; object-fit:cover; display:block; }
        .wk-now .veil { position:absolute; inset:auto 0 0 0; padding:30px 14px 12px;
            background:linear-gradient(transparent, rgba(0,0,0,.86) 60%); }
        .wk-now b { display:block; font-size:16px; color:#fff; }
        .wk-now span { font-size:12px; color:#d9d6ea; font-family:var(--font-mono, ui-monospace, monospace); }
        .wk-now em { position:absolute; top:10px; left:10px; font-style:normal; font-size:11px; color:#e7e3fb;
            background:rgba(0,0,0,.5); border:1px solid rgba(255,255,255,.35); border-radius:999px; padding:3px 9px; }

        .wk-year { display:grid; grid-template-columns:56px 1fr; gap:12px; }
        .wk-ytag { font:700 26px/1 var(--font-mono, ui-monospace, monospace); color:transparent;
            -webkit-text-stroke:1px var(--text-tertiary); padding-top:3px; }
        .wk-wall { display:grid; grid-template-columns:repeat(auto-fill,minmax(132px,1fr)); gap:8px; }
        .wk-tile { position:relative; aspect-ratio:1; border-radius:10px; overflow:hidden; background:var(--bg-tertiary);
            border:1px solid transparent; display:block; color:inherit; text-decoration:none; }
        .wk-tile img { width:100%; height:100%; object-fit:cover; display:block;
            filter:grayscale(.4) brightness(.85); transition:filter .2s, transform .25s; }
        .wk-tile:hover { border-color:var(--accent); }
        .wk-tile:hover img { filter:none; transform:scale(1.05); }
        .wk-tile .cap { position:absolute; inset:auto 0 0 0; padding:18px 8px 7px; font-size:11.5px; line-height:1.35;
            background:linear-gradient(transparent, rgba(0,0,0,.9)); opacity:0; transition:opacity .18s; color:#fff; }
        .wk-tile:hover .cap { opacity:1; }
        .wk-tile .cap i { display:block; font-style:normal; color:#c9c6d8; font-size:10.5px; }
        .wk-tile .pin { position:absolute; top:6px; right:6px; width:7px; height:7px; border-radius:50%; }

        /* ── 지도 ── */
        .wk-map { border:1px solid var(--border); border-radius:14px; padding:14px 16px 8px; background:var(--bg-primary); }
        .wk-ruler { display:grid; grid-template-columns:110px 1fr; align-items:end; }
        .wk-ruler .yy { display:grid; font:600 11.5px var(--font-mono, ui-monospace, monospace); color:var(--text-tertiary); }
        .wk-ruler .yy span { border-left:1px solid var(--border); padding:0 0 4px 7px; }
        .wk-lane { display:grid; grid-template-columns:110px 1fr; align-items:center; min-height:46px;
            border-top:1px solid var(--border); }
        .wk-lane .who { font-size:12px; color:var(--text-tertiary); padding-right:10px; }
        .wk-lane .who b { display:block; color:var(--text-primary); font-size:13px; }
        .wk-track { position:relative; height:46px; }
        .wk-bar2 { position:absolute; top:11px; height:24px; border-radius:12px; display:flex; align-items:center;
            gap:7px; padding:0 10px; font-size:12px; white-space:nowrap; color:var(--text-primary);
            border:1px solid currentColor; cursor:pointer; overflow:hidden; }
        .wk-bar2 span { overflow:hidden; text-overflow:ellipsis; }
        .wk-bar2 img { width:16px; height:16px; border-radius:4px; object-fit:cover; }
        .wk-dot { position:absolute; top:18px; width:10px; height:10px; margin-left:-5px; border-radius:50%;
            background:var(--bg-secondary); border:1.5px solid currentColor; cursor:pointer; transition:transform .12s; }
        .wk-dot:hover { transform:scale(1.7); }
        .wk-pick { display:grid; grid-template-columns:150px 1fr; gap:14px; margin-top:12px; border:1px solid var(--border);
            border-radius:12px; overflow:hidden; background:var(--bg-secondary); min-height:104px; }
        .wk-pick img { width:100%; height:100%; object-fit:cover; display:block; background:var(--bg-tertiary); }
        .wk-pick .txt { padding:12px 14px 14px 0; }
        .wk-pick h3 { margin:0 0 4px; font-size:16px; }
        .wk-pick .sub { font:12px var(--font-mono, ui-monospace, monospace); color:var(--text-tertiary); }
        .wk-pick .none { padding:16px; color:var(--text-tertiary); font-size:13px; grid-column:1 / -1; }

        /* ── 그 외 참여 ── */
        .wk-tail { border-top:1px solid var(--border); padding-top:14px; }
        .wk-tail h3 { font-size:14px; margin:0 0 8px; color:var(--text-secondary); font-weight:600; }
        .wk-tail ul { list-style:none; margin:0; padding:0; display:grid;
            grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:4px 22px; }
        .wk-tail li { font-size:13px; color:var(--text-secondary); }
        .wk-tail li b { color:var(--text-primary); font-weight:500; }
        .wk-tail li i { font-style:normal; color:var(--text-tertiary);
            font-family:var(--font-mono, ui-monospace, monospace); font-size:11.5px; margin-right:6px; }
        .wk-tail li a { color:var(--text-tertiary); }
        .wk-empty { color:var(--text-tertiary); padding:36px; text-align:center; }
    `
    );

    interface Payload {
        works: WorkRow[];
        minor: MinorRow[];
    }
    let cache: Payload | null = null;

    /** 한 판 안에서 한 번만 받는다 — 보기를 오갈 때마다 다시 받으면 화면이 깜빡인다. */
    async function loadWorks(): Promise<Payload | null> {
        if (cache) return cache;
        try {
            const response = await fetch('/apps/karmolab/data/works.json');
            if (response.ok === false) return null;
            cache = (await response.json()) as Payload;
            return cache;
        } catch {
            return null;
        }
    }

    const yearOf = (w: WorkRow): string => (w.at || '').slice(0, 4);
    const human = (at: string): string => at.replace('-', '.');

    function tile(w: WorkRow): string {
        const meta = `${human(w.at)} · ${laneOf(w)}`;
        return (
            `<a class="wk-tile" href="${esc(w.url)}"${w.slug ? '' : ' target="_blank" rel="noopener"'}>` +
            (w.image ? `<img src="${esc(w.image)}" alt="" loading="lazy">` : '') +
            `<span class="pin" style="background:${hueOf(w.org)}"></span>` +
            `<span class="cap"><b>${esc(w.title)}</b><i>${esc(meta)}</i></span></a>`
        );
    }

    /** ① 진열 — 지금 붙들고 있는 것 → 연도 벽 → 그 외 참여. */
    function renderShelf(host: HTMLElement, works: WorkRow[], minor: MinorRow[]): void {
        const now = works.filter((w) => w.ongoing);
        const rest = works.filter((w) => !w.ongoing);
        const byYear = new Map<string, WorkRow[]>();
        for (const w of rest) {
            const y = yearOf(w) || '·';
            if (!byYear.has(y)) byYear.set(y, []);
            byYear.get(y)!.push(w);
        }
        const years = [...byYear.keys()].sort().reverse();

        host.innerHTML =
            (now.length
                ? `<div class="wk-now">` +
                  now
                      .map(
                          (w) =>
                              `<a href="${esc(w.url)}">${w.image ? `<img src="${esc(w.image)}" alt="">` : ''}` +
                              `<em>${esc(t('works.ongoing', undefined, '지금도 만드는 중'))}</em>` +
                              `<span class="veil"><b>${esc(w.title)}</b>` +
                              `<span>${esc(human(w.at))} ~ · ${esc(laneOf(w))}</span></span></a>`
                      )
                      .join('') +
                  `</div>`
                : '') +
            years
                .map(
                    (y) =>
                        `<div class="wk-year"><div class="wk-ytag">${esc(y)}</div>` +
                        `<div class="wk-wall">${byYear.get(y)!.map(tile).join('')}</div></div>`
                )
                .join('') +
            (minor.length
                ? `<div class="wk-tail"><h3>${esc(
                      t('works.minor', { n: String(minor.length) }, '그 외 참여 — 따로 글을 안 쓴 것들 {n}건')
                  )}</h3><ul>` +
                  minor
                      .map(
                          (m) =>
                              `<li><i>${esc((m.when ?? '').replace('-', '.'))}</i><b>${esc(m.title)}</b>` +
                              `${m.client ? ` · ${esc(m.client)}` : ''}${m.role ? ` · ${esc(m.role)}` : ''}` +
                              `${m.links[0] ? ` <a href="${esc(m.links[0].href)}" target="_blank" rel="noopener">↗</a>` : ''}</li>`
                      )
                      .join('') +
                  `</ul></div>`
                : '');
    }

    /** ② 지도 — 가로가 시간, 가로줄이 소속. */
    function renderMap(host: HTMLElement, works: WorkRow[]): void {
        const yearsAll = works.map(yearOf).filter(Boolean).map(Number);
        const from = Math.min(...yearsAll);
        const to = Math.max(...yearsAll) + 1;
        const span = Math.max(to - from, 1);
        const at = (ym: string): number => {
            const [y, m] = ym.split('-').map(Number);
            return ((y + ((m || 1) - 1) / 12 - from) / span) * 100;
        };
        /* 자리 순서 — 내 것이 맨 위, 그다음 계약처, 그다음 커뮤니티, 소속을 안 적은 것이 끝.
           건수 순으로 하면 왁타버스 34건이 늘 맨 위라, 몇 해씩 이어 온 내 것이 아래로 밀린다. */
        const RANK = ['개인', '패러블 엔터테인먼트', '왁타버스', ''];
        const lanesOf = [...new Set(works.map(laneOf))].sort((a, b) => {
            const orgOf = (n: string): string => /\((.*)\)$/.exec(n)?.[1] ?? '';
            const gap = RANK.indexOf(orgOf(a)) - RANK.indexOf(orgOf(b));
            return gap !== 0 ? gap : a.localeCompare(b);
        });

        host.innerHTML =
            `<div class="wk-map"><div class="wk-ruler"><div></div><div class="yy" id="wkYears" ` +
            `style="grid-template-columns:repeat(${span},1fr)"></div></div><div id="wkLanes"></div></div>` +
            `<div class="wk-pick" id="wkPick"><div class="none">${esc(
                t('works.mapHint', undefined, '점이나 막대에 손을 대면 여기에 나온다.')
            )}</div></div>`;

        (host.querySelector('#wkYears') as HTMLElement).innerHTML = Array.from(
            { length: span },
            (_v, i) => `<span>${from + i}</span>`
        ).join('');

        const lanes = host.querySelector('#wkLanes') as HTMLElement;
        for (const name of lanesOf) {
            const mine = works.filter((w) => laneOf(w) === name);
            const lane = document.createElement('div');
            lane.className = 'wk-lane';
            /* 큰 글자는 **누구와 한 일인가**(소속), 작은 글자가 갈래다. 갈래를 크게 적으면
               「버추얼」이 네 줄에 되풀이돼, 정작 줄을 가르는 값이 안 보인다. */
            const paren = /^(.*?)\s*\((.*)\)$/.exec(name);
            const head = paren ? paren[2] : name;
            const sub = paren ? paren[1] : '';
            lane.innerHTML =
                `<div class="who"><b>${esc(head)}</b>${sub ? `${esc(sub)} · ` : ''}${mine.length}건</div>` +
                `<div class="wk-track"></div>`;
            const track = lane.querySelector('.wk-track') as HTMLElement;
            /* 막대끼리 겹치면 **아래 줄로 내린다**. 한 줄에 겹쳐 그리면 뒤엣것이 앞엣것의
               글자를 덮어 둘 다 못 읽는다 (패러블 레인에서 실제로 그랬다). */
            const rowEnds: number[] = [];
            for (const w of mine) {
                if (!w.at) continue;
                const left = at(w.at);
                const end = w.period?.includes('~')
                    ? at(w.period.split('~')[1].trim() || `${to}-01`)
                    : null;
                const el = document.createElement('div');
                if (end !== null && end - left > 1) {
                    const width = Math.max(end - left, 5);
                    let row = rowEnds.findIndex((edge) => left >= edge + 1);
                    if (row < 0) row = rowEnds.length;
                    rowEnds[row] = left + width;
                    el.className = 'wk-bar2';
                    el.style.left = `${left}%`;
                    el.style.width = `${width}%`;
                    el.style.top = `${11 + row * 30}px`;
                    el.style.color = hueOf(w.org);
                    el.title = `${w.title} · ${w.period ?? w.at}`;
                    el.innerHTML =
                        (w.image ? `<img src="${esc(w.image)}" alt="">` : '') + `<span>${esc(w.title)}</span>`;
                } else {
                    el.className = 'wk-dot';
                    el.style.left = `${left}%`;
                    el.style.color = hueOf(w.org);
                }
                el.addEventListener('mouseenter', () => pick(w));
                el.addEventListener('click', () => {
                    location.href = w.url;
                });
                track.appendChild(el);
            }
            /* 줄이 늘면 **레인 자체가 커져야 한다** — 안 그러면 넘친 막대가 아래 레인을 덮는다. */
            const rows = Math.max(rowEnds.length, 1);
            if (rows > 1) {
                track.style.height = `${16 + rows * 30}px`;
                lane.style.minHeight = track.style.height;
            }
            lanes.appendChild(lane);
        }

        const pick = (w: WorkRow): void => {
            (host.querySelector('#wkPick') as HTMLElement).innerHTML =
                `<img src="${esc(w.image)}" alt=""><div class="txt"><h3>${esc(w.title)}</h3>` +
                `<div class="sub">${esc(w.period ?? human(w.at))} · ${esc(laneOf(w))}` +
                `${w.platform ? ` · ${esc(w.platform)}` : ''}</div>` +
                `${w.roles.length ? `<div class="sub">${esc(w.roles.join(' · '))}</div>` : ''}</div>`;
        };
        const first = works.find((w) => w.ongoing) ?? works[0];
        if (first) pick(first);
    }

    function build(container: HTMLElement, data: Payload): void {
        const all = data.works.filter((w) => w.at);
        const wrap = document.createElement('div');
        wrap.className = 'wk';
        const chips = [...new Set(all.map(laneOf))];

        wrap.innerHTML =
            `<div class="wk-bar">
                <div class="wk-seg">
                    <button type="button" data-view="shelf" class="on">${esc(t('works.viewShelf', undefined, '진열'))}</button>
                    <button type="button" data-view="map">${esc(t('works.viewMap', undefined, '지도'))}</button>
                </div>
                <input type="search" placeholder="${esc(t('works.search', undefined, '제목·설명 찾기'))}"
                    aria-label="${esc(t('works.search', undefined, '제목·설명 찾기'))}">
                ${chips
                    .map(
                        (c) =>
                            `<button type="button" class="wk-chip" data-lane="${esc(c)}">` +
                            `<i style="background:${hueOf(c.replace(/^.*\((.*)\)$/, '$1'))}"></i>${esc(c)}</button>`
                    )
                    .join('')}
                <span class="wk-count"></span>
            </div>
            <div id="wkBody"></div>`;
        container.innerHTML = '';
        container.appendChild(wrap);

        const body = wrap.querySelector('#wkBody') as HTMLElement;
        const count = wrap.querySelector('.wk-count') as HTMLElement;
        const search = wrap.querySelector('input') as HTMLInputElement;
        let view: 'shelf' | 'map' = 'shelf';
        let org = '';
        let query = '';

        const draw = (): void => {
            const rows = all.filter(
                (w) =>
                    (org === '' || laneOf(w) === org) &&
                    (query === '' || `${w.title} ${w.description} ${laneOf(w)}`.toLowerCase().includes(query))
            );
            count.textContent = t('works.count', { n: String(rows.length) }, '{n}건');
            if (rows.length === 0) {
                body.innerHTML = `<div class="wk-empty">${esc(t('works.none', undefined, '해당하는 것이 없다'))}</div>`;
                return;
            }
            if (view === 'shelf') renderShelf(body, rows, org === '' && query === '' ? data.minor : []);
            else renderMap(body, rows);
        };

        for (const button of wrap.querySelectorAll<HTMLButtonElement>('.wk-seg button')) {
            button.addEventListener('click', () => {
                wrap.querySelectorAll('.wk-seg button').forEach((el) => el.classList.remove('on'));
                button.classList.add('on');
                view = button.dataset.view as 'shelf' | 'map';
                draw();
            });
        }
        for (const chip of wrap.querySelectorAll<HTMLButtonElement>('.wk-chip')) {
            chip.addEventListener('click', () => {
                const was = chip.classList.contains('on');
                wrap.querySelectorAll('.wk-chip.on').forEach((el) => el.classList.remove('on'));
                org = was ? '' : (chip.dataset.lane ?? '');
                if (!was) chip.classList.add('on');
                draw();
            });
        }
        search.addEventListener('input', () => {
            query = search.value.trim().toLowerCase();
            draw();
        });
        draw();
    }

    Toolbox.register({
        ...(Toolbox.getLazyWidgetPublicMeta?.('works') ?? {}),
        id: 'works',
        tabs: [
            {
                id: 'app',
                label: t('widgets.works.title', undefined, '작업물'),
                build: function (container: HTMLElement): void {
                    void loadNamespace('works').then(async () => {
                        const data = await loadWorks();
                        if (!data) {
                            container.innerHTML = `<div class="wk-empty">${esc(
                                t('works.failed', undefined, '작업물 목록을 못 받았습니다')
                            )}</div>`;
                            return;
                        }
                        build(container, data);
                    });
                }
            }
        ]
    });
})();
