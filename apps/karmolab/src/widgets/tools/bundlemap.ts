/**
 * 번들 지도 (TASK-KL-316 / 19)
 *
 * 파일을 받아 넓이로 그린다 — 이건 로그 보기와 같은 이유로 **새 위젯**이다:
 * `stats.json` 은 수 MB 라 붙여넣는 자리가 아니고, 보는 방식(그림)이 글 도구와 다르다.
 *
 * 알맹이는 `core/bundlemap`. 그림은 우리가 직접 그린다(칸 나누기까지 알맹이에 있다) —
 * 차트 꾸러미를 들이면 그 무게가 화면으로 따라 나간다(번들 예산, KL-128). 이 도구가 그 얘기를 하는데
 * 자기가 무거우면 앞뒤가 안 맞는다.
 */
import { duplicates, heaviest, human, layout, readStats, tree, spec, type Item } from '../../core/bundlemap';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'bundlemap',
    title: t('widgets.bundlemap.title', undefined, '번들 지도'),
    category: 'tool',
    desc: t(
      'widgets-desc.bundlemap.desc',
      undefined,
      'webpack stats.json 이나 esbuild metafile 을 넣으면 어디가 무거운지 넓이로 보여 주고, 두 번 들어간 꾸러미를 찾아 줍니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="3" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="16" y="3" width="5" height="7" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="12" y="12" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('bundlemap.tab', undefined, '번들'),
        build: function (container: HTMLElement): void {
          void loadNamespace('bundlemap').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('bundlemap.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="bmFile">${esc(t('bundlemap.label.file'))}</label>
        <input type="file" id="bmFile" name="stats" accept=".json,application/json" aria-label="${esc(t('bundlemap.label.file'))}">
      </div>
      <div class="field-group">
        <label class="field-label" for="bmText">${esc(t('bundlemap.label.paste'))}</label>
        <textarea id="bmText" name="text" aria-label="${esc(t('bundlemap.label.paste'))}" class="mono-input" style="min-height:90px;"></textarea>
      </div>
      <div id="bmPic" style="overflow:auto; margin-bottom:10px;"></div>
      <div class="tool-sublabel">${esc(t('bundlemap.label.heavy'))}</div>
      <div id="bmHeavy" class="tool-list"></div>
      <div class="tool-sublabel">${esc(t('bundlemap.label.dupes'))}</div>
      <div id="bmDupes" class="tool-list"></div>
      <div class="tool-status" id="bmStatus">${esc(t('bundlemap.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#bmStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    /** 깊이마다 다른 색 — 같은 폴더가 같은 색이라야 눈이 묶는다. */
    function color(name: string, depth: number): string {
      let hash = 0;
      for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
      return 'hsl(' + hash + ' 55% ' + (72 - depth * 12) + '% / ' + (0.85 - depth * 0.15) + ')';
    }

    function paint(items: Item[]): void {
      const root = tree(items);
      const width = 900;
      const height = 420;
      const rects = layout(root, 0, 0, width, height, 0, 2);
      const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="100%" style="max-width:' + width + 'px" font-family="system-ui, sans-serif" font-size="11">'
      ];
      for (const r of rects) {
        svg.push(
          '<rect x="' + r.x + '" y="' + r.y + '" width="' + Math.max(0, r.w) + '" height="' + Math.max(0, r.h) + '" fill="' + color(r.name, r.depth) +
            '" stroke="rgba(0,0,0,.35)" stroke-width="0.8"><title>' + esc(r.name + ' · ' + human(r.bytes)) + '</title></rect>'
        );
        if (r.w> 60 && r.h> 16) {
          svg.push(
            '<text x="' + (r.x + 5) + '" y="' + (r.y + 12) + '" fill="#111" style="pointer-events:none">' +
              esc(r.name.length> Math.floor(r.w / 6) ? r.name.slice(0, Math.floor(r.w / 6)) + '…' : r.name) +
              (r.w> 140 ? ' <tspan opacity=".6">' + esc(human(r.bytes)) + '</tspan>' : '') +
              '</text>'
          );
        }
      }
      svg.push('</svg>');
      $<HTMLElement>('#bmPic').innerHTML = svg.join('');

      $<HTMLElement>('#bmHeavy').innerHTML = heaviest(root, 2)
        .slice(0, 20)
        .map(
          (h) =>
            '<div class="tool-list-row"><span class="tool-list-key">' + esc(human(h.bytes)) + '</span>' +
            '<span class="mono tool-list-val">' + esc(h.path) + '</span>' +
            '<span class="tool-list-dim">' + Math.round((h.bytes / root.bytes) * 100) + '%</span></div>'
        )
        .join('');

      const dupes = duplicates(items);
      $<HTMLElement>('#bmDupes').innerHTML =
        dupes.length === 0
          ? '<div class="tool-list-row"><span class="tool-list-val">' + esc(t('bundlemap.dupes.none')) + '</span></div>'
          : dupes
              .slice(0, 10)
              .map(
                (d) =>
                  '<div class="tool-list-row"><span class="tool-list-key">' + esc(human(d.bytes)) + '</span>' +
                  '<span class="tool-list-val">' + esc(d.name) + '</span>' +
                  '<span class="tool-list-dim">' + esc(d.places.join('  ·  ')) + '</span></div>'
              )
              .join('');

      status.textContent = t('bundlemap.status.ok', { total: human(root.bytes), n: items.length, dupes: dupes.length });
    }

    function load(text: string): void {
      if (text.trim() === '') {
        $<HTMLElement>('#bmPic').innerHTML = '';
        $<HTMLElement>('#bmHeavy').innerHTML = '';
        $<HTMLElement>('#bmDupes').innerHTML = '';
        status.textContent = t('bundlemap.status.idle');
        return;
      }
      try {
        paint(readStats(text));
      } catch (e) {
        $<HTMLElement>('#bmPic').innerHTML = '';
        status.textContent = t('bundlemap.status.bad', { msg: String((e as Error).message) });
      }
    }

    $<HTMLInputElement>('#bmFile').addEventListener('change', (): void => {
      const file = $<HTMLInputElement>('#bmFile').files?.[0];
      if (file === undefined) return;
      status.textContent = t('bundlemap.status.reading');
      void file.text().then((text) => load(text));
    });
    $<HTMLTextAreaElement>('#bmText').addEventListener('input', () => load($<HTMLTextAreaElement>('#bmText').value));
  }
})();
