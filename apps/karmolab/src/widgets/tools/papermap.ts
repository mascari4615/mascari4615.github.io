/**
 * 논문 지도 (TASK-KL-253)
 *
 * 논문 하나를 찍으면 그 논문이 **무엇을 딛고 서 있는지**를 그림으로 본다.
 * 목록이 아니라 지도인 이유: 「무엇을 먼저 읽어야 하나」가 목록에서는 안 보인다.
 * 크기가 인용 수, 가로 자리가 연도이므로 — **큰 것이 바닥이고, 왼쪽이 시작**이다.
 *
 * 재료는 OpenAlex(`lib/openalex.ts`). 그림은 KarmoGraph 가 읽는 모양으로 내보낸다 —
 * 새 그리기 엔진을 만들지 않는다.
 */
import { buildMap, fetchMany, search, toCanvas, type Paper } from '../../lib/openalex';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  Toolbox.register({
    id: 'papermap',
    title: t('widgets.papermap.title', undefined, '논문 지도'),
    category: 'tool',
    desc: t(
      'widgets-desc.papermap.desc',
      undefined,
      '논문 하나가 무엇 위에 서 있는지 지도로 봅니다. 크기가 인용 수, 왼쪽이 옛 논문이라 무엇부터 읽을지가 한눈에 보입니다'
    ),
    layout: 'wide',
    icon: '<circle cx="12" cy="6" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="5" cy="18" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="18" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="19" cy="18" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 9v6M11 8.6L6.3 15.8M13 8.6l4.7 7.2" stroke="currentColor" stroke-width="1.4" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('papermap.tab', undefined, '지도'),
        build: function (container: HTMLElement): void {
          void loadNamespace('papermap').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    const esc = (v: string): string =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="pmQuery">${esc(t('papermap.label.query', undefined, '논문 제목이나 낱말'))}</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <input type="text" id="pmQuery" spellcheck="false" style="flex:1; min-width:220px;"
                 value="attention is all you need">
          <button class="btn btn-primary" id="pmSearch">${esc(t('papermap.btn.search', undefined, '찾기'))}</button>
        </div>
      </div>

      <div id="pmHits"></div>
      <div id="pmMapWrap" style="display:none;">
        <div class="tool-sublabel" id="pmMapTitle"></div>
        <div class="pm-legend">${esc(t('papermap.legend', undefined, '큰 것 = 많이 인용된 것(이 분야의 바닥) · 왼쪽 = 옛 논문'))}</div>
        <svg id="pmMap" class="pm-map" role="img"></svg>
        <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
          <button class="btn" id="pmExport">${esc(t('papermap.btn.export', undefined, '캔버스로 내보내기'))}</button>
        </div>
      </div>

      <div class="tool-status" id="pmStatus">${esc(t('papermap.status.idle', undefined, '논문을 찾아 보세요'))}</div>
    `;

    injectStyles();

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#pmStatus');
    const say = (m: string, kind = ''): void => {
      status.textContent = m;
      status.className = 'tool-status' + (kind ? ' ' + kind : '');
    };

    let lastCanvas: unknown = null;

    async function openMap(root: Paper): Promise<void> {
      say(t('papermap.status.loading', undefined, '이 논문이 딛고 선 것들을 받는 중…'));
      /* 참고문헌은 **한 번의 요청으로** 받는다 — 스무 편을 스무 번 부르면 곧 막힌다. */
      const refs = await fetchMany(root.refs.slice(0, 40));
      if (!refs.length) {
        say(t('papermap.status.norefs', undefined, '이 논문의 참고문헌이 공개돼 있지 않습니다'), 'warn');
        return;
      }
      const map = buildMap(root, refs);
      lastCanvas = toCanvas(map);
      renderSvg(map);
      $('#pmMapWrap').style.display = '';
      $('#pmMapTitle').textContent = t('papermap.map.title', { n: refs.length }, `${refs.length}편 위에 서 있습니다`);
      say(t('papermap.status.done', undefined, '지도를 그렸습니다'), 'ok');
    }

    function renderSvg(map: ReturnType<typeof buildMap>): void {
      const svg = container.querySelector('#pmMap') as SVGSVGElement;
      const maxY = Math.max(...map.nodes.map((n) => n.y + n.h)) + 40;
      const W = 1200;
      svg.setAttribute('viewBox', `0 0 ${W} ${maxY}`);
      const rootNode = map.nodes.find((n) => n.root)!;
      const lines = map.nodes
        .filter((n) => !n.root)
        .map(
          (n) =>
            `<line x1="${rootNode.x + rootNode.w / 2}" y1="${rootNode.y + rootNode.h}" x2="${n.x + n.w / 2}" y2="${n.y}" class="pm-edge"/>`
        )
        .join('');
      const boxes = map.nodes
        .map((n) => {
          const label = n.paper.title.length > 64 ? n.paper.title.slice(0, 62) + '…' : n.paper.title;
          const sub = `${n.paper.year || '?'} · ${n.paper.cited.toLocaleString()}`;
          return `<g class="pm-node ${n.root ? 'pm-root' : ''}" data-url="${esc(n.paper.url)}">
            <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10"/>
            <text x="${n.x + 12}" y="${n.y + 24}" class="pm-t">${esc(label.slice(0, 40))}</text>
            <text x="${n.x + 12}" y="${n.y + 44}" class="pm-s">${esc(sub)}</text>
            <title>${esc(n.paper.title)}</title>
          </g>`;
        })
        .join('');
      svg.innerHTML = lines + boxes;
      svg.querySelectorAll<SVGGElement>('.pm-node').forEach((g) => {
        g.addEventListener('click', () => {
          const url = g.getAttribute('data-url');
          if (url) window.open(url, '_blank', 'noopener');
        });
      });
    }

    async function doSearch(): Promise<void> {
      const q = $<HTMLInputElement>('#pmQuery').value;
      say(t('papermap.status.searching', undefined, '찾는 중…'));
      const hits = await search(q, 8);
      if (!hits.length) {
        $('#pmHits').innerHTML = '';
        say(t('papermap.status.none', undefined, '못 찾았습니다'), 'warn');
        return;
      }
      $('#pmHits').innerHTML = hits
        .map(
          (p, i) => `
        <button type="button" class="pm-hit" data-i="${i}">
          <span class="pm-hit-t">${esc(p.title)}</span>
          <span class="pm-hit-s">${p.year || '?'} · ${esc(t('papermap.cited', { n: p.cited.toLocaleString() }, `인용 ${p.cited.toLocaleString()}`))} · ${esc(p.authors[0] || '')}</span>
        </button>`
        )
        .join('');
      container.querySelectorAll<HTMLButtonElement>('.pm-hit').forEach((b) => {
        b.onclick = (): void => void openMap(hits[Number(b.dataset.i)]);
      });
      say(t('papermap.status.hits', { n: hits.length }, `${hits.length}편 찾았습니다 — 하나를 고르세요`), 'ok');
    }

    $('#pmSearch').onclick = (): void => void doSearch();
    $<HTMLInputElement>('#pmQuery').addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void doSearch();
    });

    $('#pmExport').onclick = (): void => {
      if (!lastCanvas) return;
      const blob = new Blob([JSON.stringify(lastCanvas, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'papermap.canvas';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      say(t('papermap.status.exported', undefined, '캔버스 파일로 내보냈습니다 — 카모그래프에서 열 수 있습니다'), 'ok');
    };
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const css = `
.pm-hit{display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px;
  border:1px solid rgba(128,128,128,.25);border-radius:10px;background:transparent;cursor:pointer;}
.pm-hit:hover{background:rgba(128,128,128,.10);}
.pm-hit-t{display:block;font-size:14px;line-height:1.4;}
.pm-hit-s{display:block;font-size:12px;opacity:.6;margin-top:3px;}
.pm-legend{font-size:12px;opacity:.65;margin:4px 0 10px;}
.pm-map{width:100%;height:auto;border:1px solid rgba(128,128,128,.22);border-radius:10px;background:rgba(128,128,128,.04);}
.pm-edge{stroke:rgba(128,128,128,.45);stroke-width:1.2;}
.pm-node rect{fill:rgba(128,128,128,.14);stroke:rgba(128,128,128,.4);cursor:pointer;}
.pm-node:hover rect{fill:rgba(128,160,255,.22);}
.pm-root rect{fill:rgba(159,224,200,.20);stroke:rgba(159,224,200,.7);stroke-width:1.8;}
.pm-t{font-size:13px;fill:currentColor;}
.pm-s{font-size:11px;fill:currentColor;opacity:.6;}
`;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }
})();
