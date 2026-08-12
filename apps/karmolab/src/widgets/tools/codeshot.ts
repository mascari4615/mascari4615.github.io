/**
 * 코드 사진 (TASK-KL-245)
 *
 * 코드 한 조각을 남에게 보이려고 바깥 사이트를 열지 않게. 껍데기는 **갈아 끼운다**
 * (`shared/code-frames.ts`) — carbon·ray.so 는 「둥근 창 + 신호등」 하나뿐이지만,
 * 그건 그 사이트가 정한 것이지 쓰는 사람이 정한 게 아니다.
 *
 * 문법 색칠은 이미 우리 안에 있는 Prism(34개 언어)에 맡기고, 그 결과를 **캔버스에 우리 손으로**
 * 그린다. 그래야 글꼴·줄 높이를 우리가 정하고, 한글 주석이 섞여도 글자마다 재서 그리므로
 * 정렬이 안 무너진다(한글 등폭 글꼴은 우리에게 없다).
 */
import { FRAMES } from './shared/code-frames';
import { flatten, paint, toLines, type Seg } from './shared/code-shot';
import { fileSize } from './shared/media';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** 화면에 내놓을 언어. Prism 이 아는 것 중 자주 쓰는 것만 — 34개를 다 늘어놓으면 고르기가 일이 된다. */
  const LANGS: Array<[string, string]> = [
    ['typescript', 'TypeScript'],
    ['javascript', 'JavaScript'],
    ['tsx', 'TSX'],
    ['python', 'Python'],
    ['rust', 'Rust'],
    ['go', 'Go'],
    ['java', 'Java'],
    ['csharp', 'C#'],
    ['cpp', 'C++'],
    ['bash', 'Bash'],
    ['powershell', 'PowerShell'],
    ['sql', 'SQL'],
    ['json', 'JSON'],
    ['yaml', 'YAML'],
    ['css', 'CSS'],
    ['markup', 'HTML'],
    ['markdown', 'Markdown']
  ];

  const SAMPLE = `export function toSpots(list: Station[]): Spot[] {
  const map = new Map<string, Spot>();
  for (const s of list) {
    // 5km 안쪽은 같은 자리로 본다
    const key = round(s.lat) + ',' + round(s.lon);
    const spot = map.get(key);
    if (spot) spot.stations.push(s);
    else map.set(key, { lat: s.lat, lon: s.lon, stations: [s] });
  }
  return [...map.values()];
}`;

  Toolbox.register({
    id: 'codeshot',
    title: t('widgets.codeshot.title', undefined, '코드 사진'),
    category: 'tool',
    desc: t(
      'widgets-desc.codeshot.desc',
      undefined,
      '코드를 붙여넣으면 문법 색칠된 이미지로 만듭니다. 껍데기를 골라 쓰며 파일이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 10l-2 2 2 2M15 10l2 2-2 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('codeshot.tab', undefined, '코드 → 그림'),
        build: function (container: HTMLElement): void {
          void loadNamespace('codeshot').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    const esc = (v: string): string =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="csCode">${esc(t('codeshot.label.code', undefined, '코드'))}</label>
        <textarea id="csCode" rows="10" spellcheck="false" style="width:100%; font-family:var(--font-mono,monospace);">${esc(SAMPLE)}</textarea>
      </div>

      <div class="field-group">
        <div class="tool-grid-2">
          <div>
            <div class="tool-sublabel">${esc(t('codeshot.label.lang', undefined, '언어'))}</div>
            <select id="csLang" aria-label="${esc(t('codeshot.label.lang', undefined, '언어'))}">
              ${LANGS.map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <div class="tool-sublabel">${esc(t('codeshot.label.frame', undefined, '껍데기'))}</div>
            <select id="csFrame" aria-label="${esc(t('codeshot.label.frame', undefined, '껍데기'))}">
              ${FRAMES.map((f) => `<option value="${f.id}">${esc(t('codeshot.frame.' + f.id))}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="tool-grid-2" style="margin-top:10px;">
          <div>
            <div class="tool-sublabel">${esc(t('codeshot.label.file', undefined, '파일 이름 (선택)'))}</div>
            <input type="text" id="csFile" spellcheck="false" placeholder="radio.ts" aria-label="${esc(t('codeshot.label.file', undefined, '파일 이름 (선택)'))}">
          </div>
          <div>
            <div class="tool-sublabel">${esc(t('codeshot.label.size', undefined, '글자 크기'))} <span id="csSizeVal" class="range-value">16</span></div>
            <input type="range" id="csSize" min="12" max="26" value="16" aria-label="${esc(t('codeshot.label.size', undefined, '글자 크기'))}">
          </div>
        </div>
        <div class="tool-chips" style="margin-top:10px;">
          <label class="tool-chip"><input type="checkbox" id="csNums" checked> ${esc(t('codeshot.opt.numbers', undefined, '줄 번호'))}</label>
        </div>
      </div>

      <div class="tool-sublabel">${esc(t('codeshot.label.preview', undefined, '미리보기'))}</div>
      <canvas id="csCanvas" style="max-width:100%; border-radius:10px; display:block; border:1px solid rgba(128,128,128,0.25);"></canvas>

      <div class="cc-stats" id="csStats"></div>

      <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
        <button class="btn btn-primary" id="csSave">${esc(t('codeshot.btn.save', undefined, 'PNG 저장'))}</button>
        <button class="btn" id="csCopy">${esc(t('codeshot.btn.copy', undefined, '클립보드로'))}</button>
      </div>

      <div class="tool-status" id="csStatus">${esc(t('codeshot.status.idle', undefined, '코드를 붙여넣으면 바로 그려집니다'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const codeEl = $<HTMLTextAreaElement>('#csCode');
    const langEl = $<HTMLSelectElement>('#csLang');
    const frameEl = $<HTMLSelectElement>('#csFrame');
    const fileEl = $<HTMLInputElement>('#csFile');
    const sizeEl = $<HTMLInputElement>('#csSize');
    const numsEl = $<HTMLInputElement>('#csNums');
    const canvas = $<HTMLCanvasElement>('#csCanvas');
    const stats = $<HTMLElement>('#csStats');
    const status = $<HTMLElement>('#csStatus');

    const say = (m: string, kind = ''): void => {
      status.textContent = m;
      status.className = 'tool-status' + (kind ? ' ' + kind : '');
    };
    const stat = (l: string, v: string, primary = false): string =>
      `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

    /**
     * 색칠. Prism 이 없거나 그 언어를 모르면 **색 없이** 그린다 — 그림이 안 나오는 것보다
     * 검은 글씨로라도 나오는 편이 낫다.
     */
    async function segsOf(code: string, lang: string): Promise<Seg[][]> {
      try {
        await Toolbox.ensureScript?.('vendor/prism.min');
        await Toolbox.ensureScript?.('vendor/prism-autoloader.min');
      } catch {
        /* 아래에서 색 없이 간다 */
      }
      const P = (window as unknown as { Prism?: { highlightElement: (el: Element) => void } }).Prism;
      if (!P) return toLines([{ text: code, kind: '' }]);

      const pre = document.createElement('pre');
      const el = document.createElement('code');
      el.className = 'language-' + lang;
      el.textContent = code;
      pre.appendChild(el);
      /* 화면 밖에 두고 색칠만 시킨다 — 보이지 않지만 `display:none` 은 아니어야 한다
         (autoloader 가 뒤늦게 언어를 받아 와 다시 칠하는 경우가 있다). */
      pre.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:pre;';
      document.body.appendChild(pre);
      try {
        P.highlightElement(el);
        /* autoloader 는 언어 파일을 받아 온 **뒤에** 다시 칠한다. 한 박자 기다렸다가 읽는다 —
           안 기다리면 처음 고른 언어만 색이 없다(그게 더 헷갈린다). */
        if (!el.querySelector('.token')) {
          await new Promise((r) => setTimeout(r, 260));
          if (!el.querySelector('.token')) P.highlightElement(el);
        }
        return toLines(flatten(el));
      } finally {
        pre.remove();
      }
    }

    let busy = false;
    let again = false;
    async function render(): Promise<void> {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        const code = codeEl.value.replace(/\r\n/g, '\n').replace(/\s+$/, '');
        const lines = await segsOf(code, langEl.value);
        const size = Number(sizeEl.value);
        $('#csSizeVal').textContent = String(size);
        const L = paint(canvas, lines, {
          frameId: frameEl.value,
          fontSize: size,
          numbers: numsEl.checked,
          tab: 4,
          scale: 2,
          meta: {
            lang: LANGS.find(([id]) => id === langEl.value)?.[1] || langEl.value,
            lines: lines.length,
            file: fileEl.value.trim().slice(0, 40),
            today: new Date().toISOString().slice(0, 10)
          }
        });
        canvas.style.width = Math.min(L.width, 900) + 'px';
        stats.innerHTML =
          stat(t('codeshot.stat.lines', undefined, '줄'), String(lines.length), true) +
          stat(t('codeshot.stat.size', undefined, '그림 크기'), `${L.width}×${L.height}`);
        say(t('codeshot.status.ready', undefined, '다 그렸습니다'), 'ok');
      } finally {
        busy = false;
        if (again) {
          again = false;
          void render();
        }
      }
    }

    const bump = (): void => void render();
    codeEl.addEventListener('input', bump);
    langEl.addEventListener('change', bump);
    frameEl.addEventListener('change', bump);
    fileEl.addEventListener('input', bump);
    sizeEl.addEventListener('input', bump);
    numsEl.addEventListener('change', bump);

    $('#csSave').onclick = (): void => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (fileEl.value.trim().replace(/\W+/g, '-') || 'code') + '.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        say(t('codeshot.status.saved', undefined, '저장했습니다') + ` (${fileSize(blob.size)})`, 'ok');
      }, 'image/png');
    };

    $('#csCopy').onclick = (): void => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const anyNav = navigator as unknown as { clipboard?: { write?: (d: unknown[]) => Promise<void> } };
        const CI = (window as unknown as { ClipboardItem?: new (d: Record<string, Blob>) => unknown }).ClipboardItem;
        if (!anyNav.clipboard?.write || !CI) {
          say(t('codeshot.status.noclip', undefined, '이 브라우저는 그림 복사를 막습니다 — 저장을 쓰세요'), 'warn');
          return;
        }
        void anyNav.clipboard
          .write([new CI({ 'image/png': blob })])
          .then(() => say(t('codeshot.status.copied', undefined, '클립보드에 넣었습니다'), 'ok'))
          .catch(() => say(t('codeshot.status.noclip', undefined, '이 브라우저는 그림 복사를 막습니다 — 저장을 쓰세요'), 'warn'));
      }, 'image/png');
    };

    void render();
  }
})();
