/**
 * curl 옮기기. 붙여넣으면 내 언어로 (TASK-KL-316 / 2)
 *
 * 개발 도구 작업대의 할 일 한 칸이다. 알맹이는 `core/curlkit`.
 * 여기서 **보내 볼 수도 있다**. 다만 브라우저가 남의 집 문을 두드리는 일이라
 * 상대가 문을 안 열어 주면(CORS) 그 사실을 그대로 적는다. 감추면 도구를 의심하게 된다.
 */
import { parseCurl, toCode, describe, spec, type Request, type Target } from '../../core/curlkit';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'curlkit',
    title: t('widgets.curlkit.title', undefined, 'curl 옮기기'),
    category: 'tool',
    desc: t(
      'widgets-desc.curlkit.desc',
      undefined,
      'curl 명령을 fetch, axios, 파이썬, Go 코드로 옮기고, 그 자리에서 보내 봅니다'
    ),
    layout: 'wide',
    icon: '<path d="M4 7h16M4 12h10M4 17h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M17 15l3 2-3 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('curlkit.tab', undefined, 'curl'),
        build: function (container: HTMLElement): void {
          void loadNamespace('curlkit').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('curlkit.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="ckIn">${esc(t('curlkit.label.in'))}</label>
        <textarea id="ckIn" name="curl" aria-label="${esc(t('curlkit.label.in'))}" class="mono-input" style="min-height:120px;" placeholder="curl -X POST https://api.example.com/v1/items -H 'Content-Type: application/json' -d '{&quot;name&quot;:&quot;yon&quot;}'"></textarea>
      </div>
      <div class="field-group">
        <label class="field-label" for="ckTo">${esc(t('curlkit.label.to'))}</label>
        <select id="ckTo" name="to" aria-label="${esc(t('curlkit.label.to'))}">
          <option value="fetch">fetch (브라우저, Node 18+)</option>
          <option value="axios">axios</option>
          <option value="python">Python requests</option>
          <option value="go">Go net/http</option>
          <option value="node">Node https</option>
          <option value="httpie">HTTPie</option>
          <option value="curl">${esc(t('curlkit.opt.curl'))}</option>
        </select>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-lg);">
        <button class="btn btn-primary" id="ckRun">${esc(t('curlkit.btn.run'))}</button>
        <button class="btn btn-ghost" id="ckSend">${esc(t('curlkit.btn.send'))}</button>
        <button class="btn btn-ghost" id="ckCopy">${esc(t('curlkit.btn.copy'))}</button>
      </div>
      <textarea id="ckOut" name="out" aria-label="${esc(t('curlkit.aria.out'))}" class="mono-input" readonly style="min-height:220px;"></textarea>
      <div class="tool-sublabel">${esc(t('curlkit.label.read'))}</div>
      <div id="ckRead" class="mono-input" style="min-height:80px; white-space:pre-wrap; padding:10px;"></div>
      <div class="tool-status" id="ckStatus">${esc(t('curlkit.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const input = $<HTMLTextAreaElement>('#ckIn');
    const target = $<HTMLSelectElement>('#ckTo');
    const out = $<HTMLTextAreaElement>('#ckOut');
    const read = $<HTMLElement>('#ckRead');
    const status = $<HTMLElement>('#ckStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let current: Request | undefined;

    function render(): void {
      const text = input.value.trim();
      if (text === '') {
        out.value = '';
        read.textContent = '';
        current = undefined;
        status.textContent = t('curlkit.status.idle');
        return;
      }
      try {
        const req = parseCurl(text);
        current = req;
        out.value = toCode(req, target.value as Target);
        read.textContent = describe(req);
        status.textContent = t('curlkit.status.ok', { method: req.method, n: Object.keys(req.headers).length });
      } catch (e) {
        current = undefined;
        out.value = '';
        read.textContent = '';
        status.textContent = t('curlkit.status.bad', { msg: String((e as Error).message) });
      }
    }

    input.addEventListener('input', render);
    target.addEventListener('change', render);
    $<HTMLButtonElement>('#ckRun').onclick = render;
    $<HTMLButtonElement>('#ckCopy').onclick = async (): Promise<void> => {
      if (out.value === '') return;
      await Toolbox.copyText?.(out.value, { message: t('curlkit.copy.done') });
    };

    /* 진짜로 보내 본다. 남의 집 문이라 안 열릴 수 있고, 그때는 그렇다고 적는다. */
    $<HTMLButtonElement>('#ckSend').onclick = async (): Promise<void> => {
      if (current === undefined) {
        render();
        if (current === undefined) return;
      }
      const req = current;
      status.textContent = t('curlkit.status.sending');
      const started = performance.now();
      try {
        const res = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body === undefined || req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body
        });
        const text = await res.text();
        const took = Math.round(performance.now() - started);
        const head = [...res.headers.entries()].map(([k, v]) => k + ': ' + v).join('\n');
        read.textContent = res.status + ' ' + res.statusText + '\n' + head + '\n\n' + text.slice(0, 20000);
        status.textContent = t('curlkit.status.sent', { code: res.status, ms: took });
      } catch (e) {
        read.textContent = String((e as Error).message);
        status.textContent = t('curlkit.status.blocked');
      }
    };

    // 주소로 부른 경우 (`?op=convert&curl=...&to=python`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.curl !== undefined) input.value = String(call.args.curl);
      if (call.args.to !== undefined) target.value = String(call.args.to);
    }

    render();
  }
})();
