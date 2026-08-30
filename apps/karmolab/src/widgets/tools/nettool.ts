/**
 * 대역, 포트 (TASK-KL-316 / 25)
 *
 * 개발 도구 작업대의 **살펴보기** 칸. 알맹이는 `core/nettool`.
 * 방화벽 규칙을 적기 전에 이 대역이 어디부터 어디까지인가를 확인하는 자리다 . 
 * 머리로 세면 꼭 하나 틀리고, 그 하나가 문을 열어 두거나 닫아 버린다.
 */
import { findPort, isWellKnown, overlaps, parseCidr, split, summarize, spec } from '../../core/nettool';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'nettool',
    title: t('widgets.nettool.title', undefined, '대역, 포트'),
    category: 'dev',
    desc: t(
      'widgets-desc.nettool.desc',
      undefined,
      'CIDR 이 어디부터 어디까지인지, 몇 대가 들어가는지 세고, 두 대역이 겹치는지 봅니다. 포트 번호도 찾습니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="14" width="18" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 7h.01M7 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('nettool.tab', undefined, '대역'),
        build: function (container: HTMLElement): void {
          void loadNamespace('nettool').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('nettool.mdd') });
    container.innerHTML = `
      <div class="tool-grid-2">
        <div>
          <label class="field-label" for="ntCidr">${esc(t('nettool.label.cidr'))}</label>
          <input type="text" id="ntCidr" name="cidr" aria-label="${esc(t('nettool.label.cidr'))}" class="mono-input" value="10.0.4.0/22">
        </div>
        <div>
          <label class="field-label" for="ntOther">${esc(t('nettool.label.other'))}</label>
          <input type="text" id="ntOther" name="other" aria-label="${esc(t('nettool.label.other'))}" class="mono-input" placeholder="10.0.0.0/8">
        </div>
      </div>
      <div id="ntFacts" class="tool-list" style="margin-top:12px;"></div>
      <div id="ntClash" style="display:none; padding:10px; border-radius:10px; margin:10px 0;"></div>
      <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin:10px 0;">
        <div>
          <label class="field-label" for="ntPrefix">${esc(t('nettool.label.split'))}</label>
          <input type="number" id="ntPrefix" name="prefix" aria-label="${esc(t('nettool.label.split'))}" class="mono-input" min="1" max="32" value="24" style="width:90px;">
        </div>
        <button class="btn btn-ghost" id="ntSplit">${esc(t('nettool.btn.split'))}</button>
      </div>
      <pre id="ntBlocks" class="mono-input" style="white-space:pre-wrap; padding:10px; margin:0 0 12px; max-height:220px; overflow:auto;"></pre>
      <div class="field-group">
        <label class="field-label" for="ntPort">${esc(t('nettool.label.port'))}</label>
        <input type="text" id="ntPort" name="port" aria-label="${esc(t('nettool.label.port'))}" class="mono-input" placeholder="5432 ,  postgres">
      </div>
      <div id="ntPorts" class="tool-list"></div>
      <div class="tool-status" id="ntStatus">${esc(t('nettool.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const cidr = $<HTMLInputElement>('#ntCidr');
    const other = $<HTMLInputElement>('#ntOther');
    const status = $<HTMLElement>('#ntStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    const row = (k: string, v: string): string =>
      '<div class="tool-list-row"><span class="tool-list-key">' + esc(k) + '</span><span class="mono tool-list-val">' + esc(v) + '</span></div>';

    function render(): void {
      const text = cidr.value.trim();
      if (text === '') {
        $<HTMLElement>('#ntFacts').innerHTML = '';
        status.textContent = t('nettool.status.idle');
        return;
      }
      try {
        const b = parseCidr(text);
        const rows = [
          row(t('nettool.row.range'), b.network + '  -  ' + b.broadcast),
          b.firstHost === undefined ? '' : row(t('nettool.row.hosts'), b.firstHost + '  -  ' + String(b.lastHost)),
          row(t('nettool.row.count'), b.total.toLocaleString() + '  (' + t('nettool.row.usable', { n: b.usable.toLocaleString() }) + ')'),
          row(t('nettool.row.mask'), b.mask + '  ,   ' + t('nettool.row.wildcard') + ' ' + b.wildcard),
          row(t('nettool.row.kind'), b.private ? t('nettool.private') : t('nettool.public'))
        ].filter((s) => s !== '');
        $<HTMLElement>('#ntFacts').innerHTML = rows.join('');

        const second = other.value.trim();
        const clash = $<HTMLElement>('#ntClash');
        if (second === '') clash.style.display = 'none';
        else {
          const together = overlaps(text, second);
          clash.style.display = '';
          clash.style.background = together ? 'rgba(230,160,30,.14)' : 'rgba(46,125,50,.12)';
          clash.textContent = together ? t('nettool.overlap.yes') : t('nettool.overlap.no');
        }
        status.textContent = b.cidr === text ? t('nettool.status.ok') : t('nettool.status.fixed', { cidr: b.cidr });
      } catch (e) {
        $<HTMLElement>('#ntFacts').innerHTML = '';
        status.textContent = String((e as Error).message);
      }
    }

    function renderPorts(): void {
      const query = $<HTMLInputElement>('#ntPort').value;
      const hits = findPort(query);
      $<HTMLElement>('#ntPorts').innerHTML =
        query.trim() === ''
          ? ''
          : hits.length === 0
            ? '<div class="tool-list-row"><span class="tool-list-val">' + esc(t('nettool.port.none')) + '</span></div>'
            : hits
                .map(
                  (p) =>
                    '<div class="tool-list-row"><span class="tool-list-key">' + p.port + '</span>' +
                    '<span class="tool-list-val">' + esc(p.name) + '</span>' +
                    '<span class="tool-list-dim">' + esc(isWellKnown(p.port) ? t('nettool.port.wellKnown') : '') + '</span></div>'
                )
                .join('');
    }

    [cidr, other].forEach((el) => el.addEventListener('input', render));
    $<HTMLInputElement>('#ntPort').addEventListener('input', renderPorts);
    $<HTMLButtonElement>('#ntSplit').onclick = (): void => {
      try {
        const got = split(cidr.value, Number($<HTMLInputElement>('#ntPrefix').value));
        $<HTMLElement>('#ntBlocks').textContent =
          got.blocks.join('\n') + (got.count> got.blocks.length ? '\n' + t('nettool.split.more', { n: got.count.toLocaleString() }) : '');
        status.textContent = t('nettool.status.split', { n: got.count.toLocaleString() });
      } catch (e) {
        $<HTMLElement>('#ntBlocks').textContent = '';
        status.textContent = String((e as Error).message);
      }
    };

    // 주소로 부른 경우 (`?op=cidr&cidr=10.0.0.0/22`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.cidr !== undefined) cidr.value = String(call.args.cidr);
      if (call.args.query !== undefined) $<HTMLInputElement>('#ntPort').value = String(call.args.query);
    }

    render();
    renderPorts();
  }
})();
