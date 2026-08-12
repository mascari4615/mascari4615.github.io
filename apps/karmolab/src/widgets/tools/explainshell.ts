/**
 * 명령줄 뜯어보기 (TASK-KL-250)
 *
 * 남의 글에서 복사한 명령을 실행하기 전에, 그게 무엇을 하는지 조각마다 알려 준다.
 *
 * **바깥으로 한 글자도 안 나간다.** 명령줄에는 서버 주소·사용자 이름·토큰이 섞여 있는데,
 * 원래 이 일을 하던 사이트는 그걸 남의 서버로 보낸다. 여기서는 브라우저 안에서 끝난다.
 *
 * 그리고 설명서를 통째로 붙이지 않는다 — 「이거 실행해도 되나」를 묻는 사람에게 필요한 건
 * 설명서가 아니라 한 문장이다.
 */
import { dangersOf, explain, type Part, type Segment } from '../../lib/shell-explain';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const SAMPLES = [
    'tar -xzvf backup.tar.gz',
    'ls -la | grep ".log" | wc -l',
    'git commit -am "고침" && git push -f',
    'curl -sL https://example.com/install.sh | sh',
    'find . -name "*.tmp" -delete'
  ];

  Toolbox.register({
    id: 'explainshell',
    title: t('widgets.explainshell.title', undefined, '명령줄 뜯어보기'),
    category: 'tool',
    desc: t(
      'widgets-desc.explainshell.desc',
      undefined,
      '명령줄을 붙여넣으면 조각마다 무슨 뜻인지 알려 줍니다. 되돌릴 수 없는 명령에는 경고가 붙고, 붙여넣은 줄은 브라우저 밖으로 나가지 않습니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 9l3 3-3 3M12 15h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('explainshell.tab', undefined, '뜯어보기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('explainshell').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    const esc = (v: string): string =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /** `**굵게**` 만 살린다 — 사전에 적어 둔 강조가 화면에서 그대로 별표로 보이면 안 된다. */
    const strong = (v: string): string =>
      esc(v).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="exLine">${esc(t('explainshell.label.line', undefined, '명령줄'))}</label>
        <input type="text" id="exLine" spellcheck="false" autocomplete="off"
               style="width:100%; font-family:var(--font-mono,monospace);"
               value="${esc(SAMPLES[0])}">
        <div class="tool-chips" style="margin-top:8px;">
          ${SAMPLES.map((s, i) => `<button type="button" class="tool-chip" data-sample="${i}">${esc(s.slice(0, 26))}${s.length > 26 ? '…' : ''}</button>`).join('')}
        </div>
      </div>

      <div id="exDanger"></div>
      <div id="exOut"></div>

      <div class="tool-status" id="exStatus">${esc(t('explainshell.status.local', undefined, '붙여넣은 줄은 이 브라우저를 벗어나지 않습니다'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const lineEl = $<HTMLInputElement>('#exLine');
    const outEl = $<HTMLElement>('#exOut');
    const dangerEl = $<HTMLElement>('#exDanger');

    const KIND_LABEL: Record<Part['kind'], string> = {
      command: t('explainshell.kind.command', undefined, '명령'),
      flag: t('explainshell.kind.flag', undefined, '옵션'),
      value: t('explainshell.kind.value', undefined, '값'),
      operator: t('explainshell.kind.operator', undefined, '이음말'),
      redirect: t('explainshell.kind.redirect', undefined, '방향'),
      subshell: t('explainshell.kind.subshell', undefined, '안쪽')
    };

    function renderSeg(seg: Segment, i: number): string {
      const head = seg.join
        ? `<div class="ex-join"><code>${esc(seg.join)}</code> <span>${esc(seg.joinWhat || '')}</span></div>`
        : '';
      const rows = seg.parts
        .map((p) => {
          const unknown = !p.what;
          return `
            <tr class="${unknown ? 'ex-unknown' : ''}">
              <td class="ex-tok"><code>${esc(p.text)}</code></td>
              <td class="ex-kind">${esc(KIND_LABEL[p.kind] || '')}</td>
              <td class="ex-what">${p.what ? strong(p.what) : `<span class="ex-dim">${esc(t('explainshell.unknown', undefined, '사전에 없습니다'))}</span>`}</td>
            </tr>`;
        })
        .join('');
      return `
        <div class="ex-seg">
          ${head}
          <div class="ex-title">${esc(t('explainshell.seg', { n: i + 1 }, `명령 ${i + 1}`))}${
            seg.summary ? ` — <span class="ex-sum">${strong(seg.summary)}</span>` : ''
          }</div>
          <table class="ex-table"><tbody>${rows}</tbody></table>
        </div>`;
    }

    function render(): void {
      const segs = explain(lineEl.value);
      if (!segs.length) {
        outEl.innerHTML = '';
        dangerEl.innerHTML = '';
        return;
      }
      const dangers = dangersOf(segs);
      dangerEl.innerHTML = dangers.length
        ? `<div class="ex-danger">
             <div class="ex-danger-head">${esc(t('explainshell.danger.head', undefined, '조심하세요'))}</div>
             <ul>${dangers.map((d) => `<li>${strong(d)}</li>`).join('')}</ul>
           </div>`
        : '';
      outEl.innerHTML = segs.map(renderSeg).join('');
    }

    lineEl.addEventListener('input', render);
    container.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((b) => {
      b.onclick = (): void => {
        lineEl.value = SAMPLES[Number(b.dataset.sample)];
        render();
      };
    });

    injectStyles();
    render();
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const css = `
.ex-seg{margin:14px 0;border:1px solid rgba(128,128,128,.22);border-radius:10px;overflow:hidden;}
.ex-title{padding:9px 12px;font-size:13px;background:rgba(128,128,128,.08);}
.ex-sum{opacity:.85;}
.ex-join{padding:8px 12px;font-size:12px;opacity:.8;display:flex;gap:8px;align-items:center;}
.ex-join code{padding:1px 6px;border-radius:5px;background:rgba(128,128,128,.18);}
.ex-table{width:100%;border-collapse:collapse;font-size:13px;}
.ex-table td{padding:7px 12px;border-top:1px solid rgba(128,128,128,.14);vertical-align:top;}
.ex-tok{width:1%;white-space:nowrap;}
.ex-tok code{font-family:var(--font-mono,monospace);font-weight:600;}
.ex-kind{width:1%;white-space:nowrap;opacity:.6;font-size:12px;}
.ex-what strong{font-weight:700;}
.ex-dim{opacity:.45;}
.ex-unknown .ex-tok code{opacity:.7;}
.ex-danger{margin:14px 0;padding:12px 14px;border-radius:10px;
  border:1px solid rgba(240,120,120,.5);background:rgba(240,90,90,.10);}
.ex-danger-head{font-weight:700;margin-bottom:6px;}
.ex-danger ul{margin:0;padding-left:18px;}
.ex-danger li{margin:3px 0;line-height:1.5;}
`;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }
})();
