/**
 * CSS·HTML 정리 (TASK-KL-316 / 21)
 *
 * 「개발 도구」 작업대의 **모양 잡기** 칸. 알맹이는 `core/prettyall`.
 * JSON·SQL·XML 을 붙여넣으면 **그 도구로 가라고 말한다** — 같은 일을 두 곳에서 하면 답이 갈린다.
 * 자바스크립트는 일부러 안 맡는다(어설픈 포맷은 뜻을 바꾼다). 그 말도 화면에 적어 둔다.
 */
import { detect, format, goTo, minify, spec, type Kind } from '../../core/prettyall';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'prettyall',
    title: t('widgets.prettyall.title', undefined, 'CSS·HTML 정리'),
    category: 'tool',
    desc: t(
      'widgets-desc.prettyall.desc',
      undefined,
      'CSS 와 HTML 을 읽기 좋게 펴거나 눌러서 줄입니다. 따옴표 안과 pre·script 속은 건드리지 않습니다'
    ),
    layout: 'wide',
    icon: '<path d="M8 4L4 12l4 8M16 4l4 8-4 8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 15h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('prettyall.tab', undefined, '정리'),
        build: function (container: HTMLElement): void {
          void loadNamespace('prettyall').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('prettyall.mdd') });
    container.innerHTML = `
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('prettyall.label.in'))} <span id="paKind" class="range-value"></span></div>
          <textarea id="paIn" name="text" aria-label="${esc(t('prettyall.label.in'))}" class="mono-input" style="min-height:260px;" placeholder=".a{color:red}   ·   &lt;div&gt;&lt;p&gt;가&lt;/p&gt;&lt;/div&gt;"></textarea>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('prettyall.label.out'))}</div>
          <textarea id="paOut" name="out" aria-label="${esc(t('prettyall.aria.out'))}" class="mono-input" readonly style="min-height:260px;"></textarea>
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0;">
        <button class="btn btn-primary" id="paFormat">${esc(t('prettyall.btn.format'))}</button>
        <button class="btn btn-ghost" id="paMinify">${esc(t('prettyall.btn.minify'))}</button>
        <button class="btn btn-ghost" id="paCopy">${esc(t('prettyall.btn.copy'))}</button>
      </div>
      <div id="paGoTo" style="display:none; padding:10px; border-radius:10px; background:rgba(128,128,128,.12); margin-bottom:10px;"></div>
      <div class="tool-status" id="paStatus">${esc(t('prettyall.status.idle'))}</div>
      <p style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('prettyall.note.noJs'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const input = $<HTMLTextAreaElement>('#paIn');
    const out = $<HTMLTextAreaElement>('#paOut');
    const status = $<HTMLElement>('#paStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let kind: Kind = 'unknown';

    function sniff(): void {
      kind = detect(input.value);
      $<HTMLElement>('#paKind').textContent = kind === 'unknown' ? '' : kind.toUpperCase();
      const where = goTo(kind);
      const box = $<HTMLElement>('#paGoTo');
      if (where === undefined) {
        box.style.display = 'none';
        return;
      }
      box.style.display = '';
      /* 그 도구의 **자기 주소**로 보낸다 — 옮겨 주는 길을 새로 만들지 않는다(도구 장은 늘 있다). */
      box.innerHTML =
        esc(t('prettyall.goTo', { kind: kind.toUpperCase() })) +
        ' <a class="btn btn-ghost" style="margin-left:8px;" href="/karmolab/t/' + esc(where) + '/">' + esc(t('prettyall.goTo.btn')) + '</a>';
    }

    function run(pretty: boolean): void {
      sniff();
      if (input.value.trim() === '') {
        out.value = '';
        status.textContent = t('prettyall.status.idle');
        return;
      }
      try {
        out.value = pretty ? format(input.value, kind) : minify(input.value, kind);
        const before = input.value.length;
        const after = out.value.length;
        status.textContent = pretty
          ? t('prettyall.status.formatted', { kind: kind.toUpperCase(), n: out.value.split('\n').length })
          : t('prettyall.status.minified', { before, after, cut: Math.max(0, Math.round((1 - after / Math.max(1, before)) * 100)) });
      } catch (e) {
        out.value = '';
        status.textContent = String((e as Error).message);
      }
    }

    input.addEventListener('input', () => run(true));
    $<HTMLButtonElement>('#paFormat').onclick = (): void => run(true);
    $<HTMLButtonElement>('#paMinify').onclick = (): void => run(false);
    $<HTMLButtonElement>('#paCopy').onclick = async (): Promise<void> => {
      if (out.value === '') return;
      await Toolbox.copyText?.(out.value, { message: t('prettyall.copy.done') });
    };

    // 주소로 부른 경우 (`?op=format&text=...`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined && call.args.text !== undefined) input.value = String(call.args.text);

    run(true);
  }
})();
