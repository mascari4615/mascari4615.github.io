/**
 * 표 사이 관계 보기 (TASK-KL-316 / 9)
 *
 * 개발 도구 작업대의 **살펴보기** 칸. 알맹이는 `core/erd`.
 *
 * 그림은 **우리 렌더러**(`core/mermaidlite`)로 그린다. 이 저장소엔 mermaid 꾸러미가 없다.
 * 그래도 mermaid 원문과 글 요약을 늘 먼저 내놓는다: 원문은 깃허브, 노션에 그대로 붙일 수 있고,
 * 요약은 그림이 못 떠도 남는다.
 */
import { outline, parse, toMermaid, spec } from '../../core/erd';
import { escapeHtml as esc } from './shared/text';
import { parse as parseMermaid, toSvg } from '../../core/mermaidlite';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  const SAMPLE = 'CREATE TABLE users (\n  id INT PRIMARY KEY,\n  email VARCHAR(255) NOT NULL UNIQUE,\n  city_id INT REFERENCES cities(id)\n);\nCREATE TABLE cities ( id INT PRIMARY KEY, name VARCHAR(80) NOT NULL );';

  Toolbox.register({
    id: 'erd',
    title: t('widgets.erd.title', undefined, '표 관계 보기'),
    category: 'tool',
    desc: t(
      'widgets-desc.erd.desc',
      undefined,
      'CREATE TABLE 이나 Prisma 스키마를 붙여넣으면 표, 칸, 이어짐을 그림과 글로 보여 줍니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="7" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="14" y="14" width="7" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 7h4a3 3 0 0 1 3 3v4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('erd.tab', undefined, '스키마'),
        build: function (container: HTMLElement): void {
          void loadNamespace('erd').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('erd.mdd') });
    container.innerHTML = `
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('erd.label.in'))}</div>
          <textarea id="erIn" name="schema" aria-label="${esc(t('erd.label.in'))}" class="mono-input" style="min-height:260px;"></textarea>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('erd.label.outline'))}</div>
          <pre id="erOutline" class="mono-input" style="min-height:260px; overflow:auto; white-space:pre-wrap; padding:10px; margin:0;"></pre>
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0;">
        <button class="btn btn-primary" id="erDraw">${esc(t('erd.btn.draw'))}</button>
        <button class="btn btn-ghost" id="erCopy">${esc(t('erd.btn.copy'))}</button>
      </div>
      <div id="erPic" style="overflow:auto; margin-bottom:10px;"></div>
      <div class="tool-sublabel">${esc(t('erd.label.mermaid'))}</div>
      <textarea id="erText" name="mermaid" aria-label="${esc(t('erd.aria.mermaid'))}" class="mono-input" readonly style="min-height:160px;"></textarea>
      <div class="tool-status" id="erStatus">${esc(t('erd.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const input = $<HTMLTextAreaElement>('#erIn');
    const text = $<HTMLTextAreaElement>('#erText');
    const pic = $<HTMLElement>('#erPic');
    const status = $<HTMLElement>('#erStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    input.value = SAMPLE;

    function render(): void {
      const schema = parse(input.value);
      $<HTMLElement>('#erOutline').textContent = outline(schema);
      if (schema.tables.length === 0) {
        text.value = '';
        pic.textContent = '';
        status.textContent = t('erd.status.none');
        return;
      }
      text.value = toMermaid(schema);
      status.textContent = t('erd.status.ok', { tables: schema.tables.length, links: schema.links.length });
    }

    /**
     * 그림은 **우리 것**으로 그린다 (`core/mermaidlite`).
     *
     * 처음엔 `vendor/mermaid.min.js` 를 부르려 했는데 **이 저장소엔 그 파일이 없다**
     * (문서 위젯도 같은 경로를 부르고 있어 그림이 안 뜬다. TASK-KL-316 에 적어 뒀다).
     * 3MB 짜리 꾸러미를 들이는 대신 표 관계, 흐름도만 그리는 작은 것을 직접 갖는다.
     */
    function drawPicture(): void {
      if (text.value === '') return;
      try {
        pic.innerHTML = toSvg(parseMermaid(text.value), { dark: matchMedia('(prefers-color-scheme: dark)').matches });
        status.textContent = t('erd.status.drawn');
      } catch {
        pic.textContent = '';
        /* 못 그려도 mermaid 글은 그대로 남는다. 깃허브, 노션에 붙이면 거기서 그려진다. */
        status.textContent = t('erd.status.noPic');
      }
    }

    input.addEventListener('input', render);
    $<HTMLButtonElement>('#erDraw').onclick = (): void => {
      render();
      drawPicture();
    };
    $<HTMLButtonElement>('#erCopy').onclick = async (): Promise<void> => {
      if (text.value === '') return;
      await Toolbox.copyText?.(text.value, { message: t('erd.copy.done') });
    };

    // 주소로 부른 경우 (`?op=diagram&schema=...`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined && call.args.schema !== undefined) {
      input.value = String(call.args.schema);
    }

    render();
  }
})();
