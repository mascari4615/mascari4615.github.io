/**
 * 보안 헤더 — 읽고, 짓고 (TASK-KL-316 / 14)
 *
 * 「개발 도구」 작업대의 **만들기** 칸(들고 온 것이 없어도 된다). 알맹이는 `core/csp`.
 * 점수는 안 매긴다 — 「A 등급」은 안심만 주고 무엇이 위험한지는 안 알려 준다.
 * 대신 **어느 갈래의 무엇이 왜 위험한지**를 한 줄씩 적는다.
 */
import { build, reviewHeaders, reviewCsp, parseCsp, spec, type Finding } from '../../core/csp';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'csp',
    title: t('widgets.csp.title', undefined, '보안 헤더'),
    category: 'tool',
    desc: t(
      'widgets-desc.csp.desc',
      undefined,
      'CSP 를 갈래별로 펴서 약한 자리를 짚고, 필요한 것만 골라 헤더 한 줄을 지어 줍니다'
    ),
    layout: 'wide',
    icon: '<path d="M12 3l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('csp.tab', undefined, '헤더'),
        build: function (container: HTMLElement): void {
          void loadNamespace('csp').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('csp.mdd') });
    container.innerHTML = `
      <div class="tool-chips" style="margin-bottom:10px;">
        <button type="button" class="tool-chip active" id="cspModeRead">${esc(t('csp.mode.read'))}</button>
        <button type="button" class="tool-chip" id="cspModeMake">${esc(t('csp.mode.make'))}</button>
      </div>

      <div id="cspRead">
        <div class="field-group">
          <label class="field-label" for="cspIn">${esc(t('csp.label.in'))}</label>
          <textarea id="cspIn" name="headers" aria-label="${esc(t('csp.label.in'))}" class="mono-input" style="min-height:150px;" placeholder="Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'&#10;Strict-Transport-Security: max-age=600"></textarea>
        </div>
        <div id="cspDirs" class="tool-list"></div>
        <div id="cspFindings" class="tool-list"></div>
      </div>

      <div id="cspMake" style="display:none;">
        <div class="tool-grid-2">
          <div>
            <label class="field-label" for="cspImages">${esc(t('csp.label.images'))}</label>
            <input type="text" id="cspImages" name="images" aria-label="${esc(t('csp.label.images'))}" class="mono-input" placeholder="https://cdn.example.com">
          </div>
          <div>
            <label class="field-label" for="cspConnect">${esc(t('csp.label.connect'))}</label>
            <input type="text" id="cspConnect" name="connect" aria-label="${esc(t('csp.label.connect'))}" class="mono-input" placeholder="https://api.example.com wss://api.example.com">
          </div>
        </div>
        <div class="tool-grid-2" style="margin-top:var(--space-sm);">
          <div>
            <label class="field-label" for="cspFonts">${esc(t('csp.label.fonts'))}</label>
            <input type="text" id="cspFonts" name="fonts" aria-label="${esc(t('csp.label.fonts'))}" class="mono-input" placeholder="https://fonts.gstatic.com">
          </div>
          <div style="display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap;">
            <label class="tool-checkline">
              <input type="checkbox" id="cspInline" name="inlineStyles"> ${esc(t('csp.opt.inlineStyles'))}
            </label>
            <label class="tool-checkline">
              <input type="checkbox" id="cspFrames" name="frames"> ${esc(t('csp.opt.frames'))}
            </label>
          </div>
        </div>
        <textarea id="cspOut" name="out" aria-label="${esc(t('csp.aria.out'))}" class="mono-input" readonly style="min-height:120px;"></textarea>
        <button class="btn btn-ghost" id="cspCopy" style="margin-top:var(--space-sm);">${esc(t('csp.btn.copy'))}</button>
      </div>

      <div class="tool-status" id="cspStatus">${esc(t('csp.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#cspStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    function findingRow(f: Finding): string {
      const color = f.level === 'weak' ? 'var(--accent-danger, #c62828)' : f.level === 'missing' ? 'var(--accent-warn, #b26a00)' : 'var(--text-tertiary)';
      return (
        '<div class="tool-list-row"><span class="tool-list-key" style="color:' + color + '">' + esc(t('csp.level.' + f.level)) + '</span>' +
        '<span class="tool-list-val">' + esc(f.where) + (f.value === undefined ? '' : ' — ' + esc(f.value)) + '</span>' +
        '<span class="tool-list-dim">' + esc(t('csp.find.' + f.key)) + '</span></div>'
      );
    }

    function renderRead(): void {
      const text = $<HTMLTextAreaElement>('#cspIn').value;
      if (text.trim() === '') {
        $<HTMLElement>('#cspDirs').innerHTML = '';
        $<HTMLElement>('#cspFindings').innerHTML = '';
        status.textContent = t('csp.status.idle');
        return;
      }
      /* 헤더 뭉치로 왔나, CSP 한 줄만 왔나 — 둘 다 받는다(사람은 아무거나 붙여넣는다). */
      const looksHeaders = /^[\w-]+\s*:/m.test(text) && /\n/.test(text.trim());
      const findings = looksHeaders ? reviewHeaders(text) : reviewCsp(text);
      const dirs = parseCsp(looksHeaders ? (text.split('\n').find((l) => /^content-security-policy\s*:/i.test(l)) ?? '') : text);
      $<HTMLElement>('#cspDirs').innerHTML = Object.entries(dirs)
        .map(([k, v]) => '<div class="tool-list-row"><span class="tool-list-key">' + esc(k) + '</span><span class="tool-list-val" style="font-family:var(--font-mono)">' + esc(v.join(' ')) + '</span></div>')
        .join('');
      $<HTMLElement>('#cspFindings').innerHTML = findings.map(findingRow).join('');
      const weak = findings.filter((f) => f.level === 'weak').length;
      status.textContent = findings.length === 0 ? t('csp.status.clean') : t('csp.status.found', { n: findings.length, weak });
    }

    function renderMake(): void {
      const header = build({
        images: $<HTMLInputElement>('#cspImages').value,
        connect: $<HTMLInputElement>('#cspConnect').value,
        fonts: $<HTMLInputElement>('#cspFonts').value,
        inlineStyles: $<HTMLInputElement>('#cspInline').checked,
        frames: $<HTMLInputElement>('#cspFrames').checked
      });
      $<HTMLTextAreaElement>('#cspOut').value = 'Content-Security-Policy: ' + header;
      status.textContent = t('csp.status.built');
    }

    function setMode(read: boolean): void {
      $<HTMLElement>('#cspRead').style.display = read ? '' : 'none';
      $<HTMLElement>('#cspMake').style.display = read ? 'none' : '';
      $<HTMLElement>('#cspModeRead').classList.toggle('active', read);
      $<HTMLElement>('#cspModeMake').classList.toggle('active', !read);
      if (read) renderRead();
      else renderMake();
    }

    $<HTMLTextAreaElement>('#cspIn').addEventListener('input', renderRead);
    container.querySelectorAll('#cspMake input').forEach((el) => el.addEventListener('input', renderMake));
    $<HTMLElement>('#cspModeRead').addEventListener('click', () => setMode(true));
    $<HTMLElement>('#cspModeMake').addEventListener('click', () => setMode(false));
    $<HTMLButtonElement>('#cspCopy').onclick = async (): Promise<void> => {
      const out = $<HTMLTextAreaElement>('#cspOut').value;
      if (out === '') return;
      await Toolbox.copyText?.(out, { message: t('csp.copy.done') });
    };

    // 주소로 부른 경우 (`?op=review&headers=...`) (TASK-KL-205).
    const call = readInvocation(spec);
    let read = true;
    if (call !== null && call.error === undefined) {
      if (call.args.headers !== undefined) $<HTMLTextAreaElement>('#cspIn').value = String(call.args.headers);
      if (call.args.header !== undefined) $<HTMLTextAreaElement>('#cspIn').value = String(call.args.header);
      if (call.op === 'build') read = false;
    }
    setMode(read);
  }
})();
