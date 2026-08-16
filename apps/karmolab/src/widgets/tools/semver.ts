/**
 * 버전 범위 보기 (TASK-KL-316 / 13)
 *
 * 「개발 도구」 작업대의 **살펴보기** 칸. 알맹이는 `core/semver`.
 * `^1.2.3` 을 **「1.2.3 이상 2.0.0 미만」**으로 펴서 보여 준다 — 다툴 일이 없어진다.
 * 두 번째 칸에 다른 범위를 적으면 **겹치는 판이 있는지**(꾸러미가 두 벌 깔릴 상황) 말해 준다.
 */
import { edges, overlaps, satisfies, maxSatisfying, spec } from '../../core/semver';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'semver',
    title: t('widgets.semver.title', undefined, '버전 범위 보기'),
    category: 'tool',
    desc: t(
      'widgets-desc.semver.desc',
      undefined,
      '^1.2.3 이 실제로 어디까지 받는지 이상·미만으로 펴 주고, 두 범위가 겹치는지 봅니다'
    ),
    layout: 'wide',
    icon: '<path d="M4 12h4l3-7 3 14 3-7h3" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('semver.tab', undefined, '버전'),
        build: function (container: HTMLElement): void {
          void loadNamespace('semver').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('semver.mdd') });
    container.innerHTML = `
      <div class="tool-grid-2">
        <div>
          <label class="field-label" for="svRange">${esc(t('semver.label.range'))}</label>
          <input type="text" id="svRange" name="range" aria-label="${esc(t('semver.label.range'))}" class="mono-input" value="^1.2.3">
        </div>
        <div>
          <label class="field-label" for="svOther">${esc(t('semver.label.other'))}</label>
          <input type="text" id="svOther" name="other" aria-label="${esc(t('semver.label.other'))}" class="mono-input" placeholder="~1.1.0">
        </div>
      </div>
      <div id="svBounds" class="tool-list" style="margin-top:12px;"></div>
      <div id="svClash" style="display:none; padding:10px; border-radius:10px; margin:10px 0;"></div>
      <div class="field-group" style="margin-top:12px;">
        <label class="field-label" for="svVersions">${esc(t('semver.label.versions'))}</label>
        <textarea id="svVersions" name="versions" aria-label="${esc(t('semver.label.versions'))}" class="mono-input" style="min-height:110px;">1.0.0
1.2.3
1.4.2
2.0.0-beta.1
2.0.0</textarea>
      </div>
      <div id="svChecks" class="tool-list"></div>
      <div class="tool-status" id="svStatus">${esc(t('semver.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const range = $<HTMLInputElement>('#svRange');
    const other = $<HTMLInputElement>('#svOther');
    const versions = $<HTMLTextAreaElement>('#svVersions');
    const status = $<HTMLElement>('#svStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    function render(): void {
      const text = range.value.trim();
      if (text === '') {
        $<HTMLElement>('#svBounds').innerHTML = '';
        $<HTMLElement>('#svChecks').innerHTML = '';
        status.textContent = t('semver.status.idle');
        return;
      }
      try {
        const rows = edges(text);
        $<HTMLElement>('#svBounds').innerHTML = rows
          .map((e) => {
            const low = e.from === undefined ? t('semver.noLower') : t(e.fromInclusive ? 'semver.atLeast' : 'semver.above', { v: e.from });
            const high = e.to === undefined ? t('semver.noUpper') : t(e.toInclusive ? 'semver.atMost' : 'semver.below', { v: e.to });
            return (
              '<div class="tool-list-row"><span class="tool-list-key">' + esc(t('semver.gets')) + '</span>' +
              '<span class="tool-list-val">' + esc(low) + '  ·  ' + esc(high) + '</span></div>'
            );
          })
          .join('');

        const list = versions.value.split(/\r?\n/).map((v) => v.trim()).filter((v) => v !== '');
        const checks = list.map((v) => {
          let ok = false;
          try {
            ok = satisfies(v, text);
          } catch {
            ok = false;
          }
          return (
            '<div class="tool-list-row"><span class="tool-list-key" style="color:' + (ok ? 'var(--success)' : 'var(--text-tertiary)') + '">' +
            esc(ok ? t('semver.in') : t('semver.out')) +
            '</span><span class="mono tool-list-val">' + esc(v) + '</span></div>'
          );
        });
        $<HTMLElement>('#svChecks').innerHTML = checks.join('');
        const best = maxSatisfying(list, text);

        const clash = $<HTMLElement>('#svClash');
        const second = other.value.trim();
        if (second === '') {
          clash.style.display = 'none';
        } else {
          const together = overlaps(text, second);
          clash.style.display = '';
          clash.style.background = together ? 'rgba(46,125,50,.12)' : 'rgba(198,40,40,.12)';
          clash.textContent = together ? t('semver.overlap.yes') : t('semver.overlap.no');
        }

        status.textContent = best === undefined ? t('semver.status.none') : t('semver.status.best', { v: best });
      } catch (e) {
        $<HTMLElement>('#svBounds').innerHTML = '';
        status.textContent = t('semver.status.bad', { msg: String((e as Error).message) });
      }
    }

    [range, other, versions].forEach((el) => el.addEventListener('input', render));

    // 주소로 부른 경우 (`?op=explain&range=^1.2.3`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.range !== undefined) range.value = String(call.args.range);
      if (call.args.a !== undefined) range.value = String(call.args.a);
      if (call.args.b !== undefined) other.value = String(call.args.b);
    }

    render();
  }
})();
