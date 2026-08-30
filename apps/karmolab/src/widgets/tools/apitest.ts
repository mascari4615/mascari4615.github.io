/**
 * OpenAPI 눌러 보기 (TASK-KL-316 / 16)
 *
 * 개발 도구 작업대의 **살펴보기** 칸. 알맹이는 `core/apitest`.
 * 스펙을 붙여넣으면 연산 목록이 서고, 하나 고르면 **보낼 수 있는 요청**이 완성된다.
 * 보내는 것은 브라우저가 직접 한다. 남의 집 문이 안 열리면(CORS) 그 사실을 그대로 적는다.
 *
 * 목 서버는 안 만든다(사이트에 이미 Service Worker 가 있다. `core/apitest` 머리말).
 * 대신 **목 응답 표**를 만들어 준다: 그대로 자기 목 서버에 붙이면 된다.
 */
import { fill, mockTable, parse, spec, type Doc, type Operation } from '../../core/apitest';
import { textPane, twoPane } from './shared/markup';
import { escapeHtml as esc } from './shared/text';
import { compareText } from '../../core/apidiff';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'apitest',
    title: t('widgets.apitest.title', undefined, 'API 눌러 보기'),
    category: 'dev',
    desc: t(
      'widgets-desc.apitest.desc',
      undefined,
      'OpenAPI 스펙을 붙여넣으면 연산 목록이 서고, 값을 채워 그 자리에서 보내 봅니다. 목 응답도 만들어 줍니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 10h4M7 14h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M16 9l3 3-3 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('apitest.tab', undefined, 'API'),
        build: function (container: HTMLElement): void {
          void loadNamespace('apitest').then(function () {
            draw(container);
          });
        }
      },
      {
        /*
         * 두 판 견주기 (TASK-KL-316 / 17). 같은 위젯의 탭인 이유: **같은 문서를 놓고 하는 다른 질문**이다
         *. 이거 눌러 보자와 이거 바뀌면 우리 깨지나. 도구를 둘로 나누면 스펙을 두 번 붙여넣게 된다.
         */
        id: 'diff',
        label: t('apidiff.tab', undefined, '두 판 견주기'),
        build: function (container: HTMLElement): void {
          void Promise.all([loadNamespace('apitest'), loadNamespace('apidiff')]).then(function () {
            drawDiff(container);
          });
        }
      }
    ]
  });

  function drawDiff(container: HTMLElement): void {
    container.innerHTML = `
      ${twoPane(
        textPane({ id: 'adBefore', name: 'before', label: esc(t('apidiff.label.before')), minHeight: 200 }),
        textPane({ id: 'adAfter', name: 'after', label: esc(t('apidiff.label.after')), minHeight: 200 })
      )}
      <div id="adOut" class="tool-list" style="margin-top:12px;"></div>
      <div class="tool-status" id="adStatus">${esc(t('apidiff.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#adStatus');
    markLive(status);

    function render(): void {
      const before = $<HTMLTextAreaElement>('#adBefore').value.trim();
      const after = $<HTMLTextAreaElement>('#adAfter').value.trim();
      if (before === '' || after === '') {
        $<HTMLElement>('#adOut').innerHTML = '';
        status.textContent = t('apidiff.status.idle');
        return;
      }
      try {
        const changes = compareText(before, after);
        $<HTMLElement>('#adOut').innerHTML = changes
          .map((c) => {
            const color = c.breaking ? 'var(--error)' : 'var(--text-tertiary)';
            const tail = [c.what, c.from === undefined ? '' : c.from + ' → ' + String(c.to)].filter((s) => s !== undefined && s !== '').join(', ');
            return (
              '<div class="tool-list-row"><span class="tool-list-key" style="color:' + color + '">' +
              esc(c.breaking ? t('apidiff.breaking') : t('apidiff.safe')) + '</span>' +
              '<span class="tool-list-val">' + esc(t('apidiff.what.' + c.key)) + '. ' + esc(c.where) + '</span>' +
              '<span class="tool-list-dim">' + esc(tail) + '</span></div>'
            );
          })
          .join('');
        const broken = changes.filter((c) => c.breaking).length;
        status.textContent =
          changes.length === 0
            ? t('apidiff.status.same')
            : broken === 0
              ? t('apidiff.status.safe', { n: changes.length })
              : t('apidiff.status.broken', { n: broken, all: changes.length });
      } catch (e) {
        $<HTMLElement>('#adOut').innerHTML = '';
        status.textContent = t('apidiff.status.bad', { msg: String((e as Error).message) });
      }
    }

    [$<HTMLTextAreaElement>('#adBefore'), $<HTMLTextAreaElement>('#adAfter')].forEach((el) => el.addEventListener('input', render));
    render();
  }

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('apitest.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="apDoc">${esc(t('apitest.label.doc'))}</label>
        <textarea id="apDoc" name="doc" aria-label="${esc(t('apitest.label.doc'))}" class="mono-input" style="min-height:140px;" placeholder="openapi: 3.0.0&#10;info: { title: 내 API, version: 1.0.0 }&#10;paths: ..."></textarea>
      </div>
      <div class="tool-grid-2">
        <div>
          <label class="field-label" for="apOp">${esc(t('apitest.label.op'))}</label>
          <select id="apOp" name="op" aria-label="${esc(t('apitest.label.op'))}"></select>
        </div>
        <div>
          <label class="field-label" for="apServer">${esc(t('apitest.label.server'))}</label>
          <input type="text" id="apServer" name="server" aria-label="${esc(t('apitest.label.server'))}" class="mono-input">
        </div>
      </div>
      <div id="apParams" style="margin:10px 0;"></div>
      <div class="tool-sublabel">${esc(t('apitest.label.request'))}</div>
      <pre id="apRequest" class="mono-input" style="white-space:pre-wrap; padding:10px; margin:0 0 10px;"></pre>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <button class="btn btn-primary" id="apSend">${esc(t('apitest.btn.send'))}</button>
        <button class="btn btn-ghost" id="apCurl">${esc(t('apitest.btn.curl'))}</button>
        <button class="btn btn-ghost" id="apMock">${esc(t('apitest.btn.mock'))}</button>
      </div>
      <div class="tool-sublabel">${esc(t('apitest.label.answer'))}</div>
      <pre id="apAnswer" class="mono-input" style="white-space:pre-wrap; padding:10px; margin:0; min-height:120px; overflow:auto;"></pre>
      <div class="tool-status" id="apStatus">${esc(t('apitest.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const docBox = $<HTMLTextAreaElement>('#apDoc');
    const opBox = $<HTMLSelectElement>('#apOp');
    const server = $<HTMLInputElement>('#apServer');
    const status = $<HTMLElement>('#apStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let doc: Doc | undefined;

    const current = (): Operation | undefined => (doc === undefined ? undefined : doc.operations[Number(opBox.value)]);

    function renderParams(): void {
      const op = current();
      const box = $<HTMLElement>('#apParams');
      if (op === undefined) {
        box.innerHTML = '';
        return;
      }
      box.innerHTML = op.params
        .map(
          (p, i) =>
            '<div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">' +
            '<label class="tool-list-key" style="min-width:9em" for="apP' + i + '">' + esc(p.name) + (p.required ? ' *' : '') + '</label>' +
            '<input type="text" id="apP' + i + '" name="' + esc(p.name) + '" aria-label="' + esc(p.name) + '" class="mono-input" style="flex:1" data-name="' + esc(p.name) + '" placeholder="' + esc(p.example === undefined ? p.where : String(p.example)) + '">' +
            '<span class="tool-list-dim">' + esc(p.where) + '</span></div>'
        )
        .join('');
      box.querySelectorAll('input').forEach((el) => el.addEventListener('input', renderRequest));
    }

    function values(): Record<string, string> {
      const out: Record<string, string> = {};
      $<HTMLElement>('#apParams')
        .querySelectorAll<HTMLInputElement>('input')
        .forEach((el) => {
          const name = el.getAttribute('data-name') ?? '';
          if (el.value !== '') out[name] = el.value;
        });
      return out;
    }

    function renderRequest(): void {
      const op = current();
      if (op === undefined) {
        $<HTMLElement>('#apRequest').textContent = '';
        return;
      }
      const req = fill(op, server.value, values());
      const head = Object.entries(req.headers).map(([k, v]) => k + ': ' + v);
      $<HTMLElement>('#apRequest').textContent = [req.method + ' ' + req.url, ...head, req.body === undefined ? '' : '\n' + req.body]
        .filter((s) => s !== '')
        .join('\n');
    }

    function renderDoc(): void {
      const text = docBox.value.trim();
      if (text === '') {
        doc = undefined;
        opBox.innerHTML = '';
        $<HTMLElement>('#apParams').innerHTML = '';
        $<HTMLElement>('#apRequest').textContent = '';
        status.textContent = t('apitest.status.idle');
        return;
      }
      try {
        doc = parse(text);
        opBox.innerHTML = doc.operations
          .map((o, i) => '<option value="' + i + '">' + esc(o.method + ' ' + o.path + (o.summary === undefined ? '' : ' . ' + o.summary)) + '</option>')
          .join('');
        if (server.value === '' && doc.servers.length> 0) server.value = doc.servers[0];
        renderParams();
        renderRequest();
        status.textContent = t('apitest.status.ok', { n: doc.operations.length, title: doc.title ?? '' });
      } catch (e) {
        doc = undefined;
        status.textContent = t('apitest.status.bad', { msg: String((e as Error).message) });
      }
    }

    docBox.addEventListener('input', renderDoc);
    server.addEventListener('input', renderRequest);
    opBox.addEventListener('change', () => {
      renderParams();
      renderRequest();
    });

    $<HTMLButtonElement>('#apSend').onclick = async (): Promise<void> => {
      const op = current();
      if (op === undefined) return;
      const req = fill(op, server.value, values());
      status.textContent = t('apitest.status.sending');
      const started = performance.now();
      try {
        const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
        const text = await res.text();
        let shown = text;
        try {
          shown = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          /* JSON 이 아니면 그대로 보여 준다 */
        }
        $<HTMLElement>('#apAnswer').textContent = res.status + ' ' + res.statusText + '\n\n' + shown.slice(0, 40000);
        status.textContent = t('apitest.status.answered', { code: res.status, ms: Math.round(performance.now() - started) });
      } catch (e) {
        $<HTMLElement>('#apAnswer').textContent = String((e as Error).message);
        status.textContent = t('apitest.status.blocked');
      }
    };

    $<HTMLButtonElement>('#apCurl').onclick = async (): Promise<void> => {
      const op = current();
      if (op === undefined) return;
      const req = fill(op, server.value, values());
      const APOS = String.fromCharCode(39);
      const q = (s: string): string => APOS + s.split(APOS).join(String.fromCharCode(92) + APOS) + APOS;
      const parts = ['curl'];
      if (req.method !== 'GET') parts.push('-X ' + req.method);
      parts.push(q(req.url));
      for (const [k, v] of Object.entries(req.headers)) parts.push('-H ' + q(k + ': ' + v));
      if (req.body !== undefined) parts.push('-d ' + q(req.body));
      await Toolbox.copyText?.(parts.join(' \\\n  '), { message: t('apitest.copy.curl') });
    };

    $<HTMLButtonElement>('#apMock').onclick = async (): Promise<void> => {
      if (doc === undefined) return;
      const table = mockTable(doc);
      $<HTMLElement>('#apAnswer').textContent = JSON.stringify(table, null, 2);
      status.textContent = t('apitest.status.mock', { n: Object.keys(table).length });
      await Toolbox.copyText?.(JSON.stringify(table, null, 2), { message: t('apitest.copy.mock') });
    };

    // 주소로 부른 경우 (`?op=list&doc=...`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined && call.args.doc !== undefined) docBox.value = String(call.args.doc);

    renderDoc();
  }
})();
