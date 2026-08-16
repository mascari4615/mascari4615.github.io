/**
 * 로그 보기 — 좁히고, 언제 몰렸는지 본다 (TASK-KL-316 / 15)
 *
 * 이건 **새 위젯이 맞다**. 글 작업대는 「붙여넣고 한 번 바꾸는」 자리인데, 로그는
 * ① 파일이 크고 ② 한 번 바꾸는 게 아니라 **여러 번 좁히는** 일이라 화면이 다르다.
 *
 * 큰 파일에서 화면이 멎지 않게 두 가지를 지킨다:
 *   - 그리는 줄 수를 막는다(기본 2000줄) — 셈은 다 하고 **그리기만** 막는다.
 *   - 시각 없는 줄은 그림에서 빼되 목록에는 남긴다(로그에서 버려진 줄이 대개 범인이다).
 */
import { filter, parse, summarise, timeline, spec, type Level, type Row } from '../../core/logview';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  const LEVELS: Level[] = ['error', 'warn', 'info', 'debug', 'trace', 'other'];
  const COLOR: Record<Level, string> = {
    error: 'var(--accent-danger, #c62828)',
    warn: 'var(--accent-warn, #b26a00)',
    info: 'inherit',
    debug: 'var(--text-tertiary)',
    trace: 'var(--text-tertiary)',
    other: 'inherit'
  };
  const DRAW_CAP = 2000;

  Toolbox.register({
    id: 'logview',
    title: t('widgets.logview.title', undefined, '로그 보기'),
    category: 'tool',
    desc: t(
      'widgets-desc.logview.desc',
      undefined,
      '큰 로그를 끌어다 놓으면 언제 몰렸는지 보여 주고, 급·정규식으로 좁혀 봅니다. 파일은 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<path d="M4 5h16M4 9h10M4 13h16M4 17h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="18" cy="17" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M20.2 19.2L22 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('logview.tab', undefined, '로그'),
        build: function (container: HTMLElement): void {
          void loadNamespace('logview').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('logview.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="lgFile">${esc(t('logview.label.file'))}</label>
        <input type="file" id="lgFile" name="file" accept=".log,.txt,.jsonl,text/*" aria-label="${esc(t('logview.label.file'))}">
      </div>
      <div class="field-group">
        <label class="field-label" for="lgText">${esc(t('logview.label.paste'))}</label>
        <textarea id="lgText" name="text" aria-label="${esc(t('logview.label.paste'))}" class="mono-input" style="min-height:110px;"></textarea>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:8px;">
        <div style="flex:1; min-width:220px;">
          <label class="field-label" for="lgPattern">${esc(t('logview.label.find'))}</label>
          <input type="text" id="lgPattern" name="pattern" aria-label="${esc(t('logview.label.find'))}" class="mono-input" placeholder="timeout|refused">
        </div>
        <label class="tool-checkline">
          <input type="checkbox" id="lgInvert" name="invert"> ${esc(t('logview.opt.invert'))}
        </label>
      </div>
      <div class="tool-chips" id="lgLevels" style="margin-bottom:10px;">
        ${LEVELS.map((l) => `<button type="button" class="tool-chip" data-level="${l}">${esc(t('logview.level.' + l))}</button>`).join('')}
      </div>
      <div id="lgTimeline" style="display:flex; align-items:flex-end; gap:1px; height:70px; margin-bottom:6px;"></div>
      <div id="lgSpan" style="font-size:var(--font-size-xs); color:var(--text-secondary); margin-bottom:10px;"></div>
      <div id="lgCommon" class="tool-list" style="margin-bottom:10px;"></div>
      <pre id="lgOut" class="mono-input" style="min-height:240px; overflow:auto; white-space:pre-wrap; padding:10px; margin:0;"></pre>
      <div class="tool-status" id="lgStatus">${esc(t('logview.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#lgStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let rows: Row[] = [];
    const picked = new Set<Level>();

    function paintTimeline(list: Row[]): void {
      const buckets = timeline(list, 80);
      const box = $<HTMLElement>('#lgTimeline');
      if (buckets.length === 0) {
        box.innerHTML = '';
        $<HTMLElement>('#lgSpan').textContent = t('logview.span.none');
        return;
      }
      const top = Math.max(...buckets.map((b) => b.total));
      box.innerHTML = buckets
        .map((b) => {
          const h = top === 0 ? 0 : Math.round((b.total / top) * 100);
          const bad = b.error > 0;
          return (
            '<div title="' + esc(new Date(b.at).toLocaleString()) + ' · ' + b.total + '" style="flex:1; height:' + h + '%; min-height:1px; background:' +
            (bad ? 'var(--accent-danger, #c62828)' : 'var(--accent, #4a7dff)') + '; opacity:' + (bad ? 0.85 : 0.55) + ';"></div>'
          );
        })
        .join('');
      const s = summarise(list);
      $<HTMLElement>('#lgSpan').textContent =
        s.from === undefined || s.to === undefined
          ? t('logview.span.none')
          : t('logview.span', { from: new Date(s.from).toLocaleString(), to: new Date(s.to).toLocaleString() });
    }

    function render(): void {
      if (rows.length === 0) {
        $<HTMLElement>('#lgOut').textContent = '';
        $<HTMLElement>('#lgTimeline').innerHTML = '';
        $<HTMLElement>('#lgCommon').innerHTML = '';
        status.textContent = t('logview.status.idle');
        return;
      }
      const shown = filter(rows, {
        pattern: $<HTMLInputElement>('#lgPattern').value,
        levels: [...picked],
        invert: $<HTMLInputElement>('#lgInvert').checked
      });
      paintTimeline(shown);

      const summary = summarise(shown);
      $<HTMLElement>('#lgCommon').innerHTML = summary.common
        .map((c) => '<div class="tool-list-row"><span class="tool-list-key">' + c.count + '</span><span class="tool-list-val" style="font-family:var(--font-mono)">' + esc(c.shape) + '</span></div>')
        .join('');

      const draw = shown.slice(0, DRAW_CAP);
      $<HTMLElement>('#lgOut').innerHTML = draw
        .map((r) => '<div style="color:' + COLOR[r.level] + '"><span style="opacity:.4">' + r.no + '</span>  ' + esc(r.raw) + '</div>')
        .join('');
      status.textContent =
        shown.length > DRAW_CAP
          ? t('logview.status.capped', { shown: DRAW_CAP, all: shown.length, total: rows.length })
          : t('logview.status.ok', { shown: shown.length, total: rows.length });
    }

    function load(text: string): void {
      rows = parse(text);
      render();
    }

    $<HTMLInputElement>('#lgFile').addEventListener('change', (): void => {
      const file = $<HTMLInputElement>('#lgFile').files?.[0];
      if (file === undefined) return;
      status.textContent = t('logview.status.reading');
      void file.text().then((text) => load(text));
    });
    $<HTMLTextAreaElement>('#lgText').addEventListener('input', (): void => load($<HTMLTextAreaElement>('#lgText').value));
    [$<HTMLInputElement>('#lgPattern'), $<HTMLInputElement>('#lgInvert')].forEach((el) => el.addEventListener('input', render));
    container.querySelectorAll('#lgLevels .tool-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const level = chip.getAttribute('data-level') as Level;
        if (picked.has(level)) picked.delete(level);
        else picked.add(level);
        chip.classList.toggle('active', picked.has(level));
        render();
      });
    });

    render();
  }
})();
