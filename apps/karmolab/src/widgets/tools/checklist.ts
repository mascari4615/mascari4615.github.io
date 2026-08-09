/**
 * 체크리스트 (TASK-KL-088)
 *
 * 메모장에 적은 할 일은 「지금 몇 개 남았나」 가 안 보인다. 반대로 무거운 할 일 앱은
 * 계정을 만들어야 한다. 그 사이 — **주소만 있으면 되는 목록**을 만든다.
 * 내용을 주소에 담으므로 서버도 계정도 없이 그대로 공유되고, 링크를 잃으면 사라진다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  interface Item {
    text: string;
    done: boolean;
  }

  /** 주소 해시에 담을 때 한글이 깨지지 않도록 UTF-8 → base64 (URL-safe) */
  function encodeState(title: string, items: Item[]): string {
    const json = JSON.stringify({ t: title, i: items.map((x) => [x.text, x.done ? 1 : 0]) });
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeState(code: string): { title: string; items: Item[] } | null {
    try {
      const norm = code.replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(norm.padEnd(Math.ceil(norm.length / 4) * 4, '='));
      const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      return { title: data.t || '', items: (data.i || []).map((x: [string, number]) => ({ text: x[0], done: !!x[1] })) };
    } catch {
      return null;
    }
  }

  Toolbox.register({
    id: 'checklist',
    title: t('widgets.checklist.title', undefined, "체크리스트"),
    category: 'tool',
    desc: t('widgets-desc.checklist.desc', undefined, "할 일 목록을 만들고 주소 하나로 공유합니다. 계정도 서버도 없이"),
    layout: 'form',
    icon: '<path d="M4 7l2 2 4-4M4 14l2 2 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 7h7M13 16h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('checklist.tab', undefined, "체크리스트"),
        build: function (container: HTMLElement): void {
          void loadNamespace('checklist').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <input type="text" id="clTitle" placeholder="${esc(t('checklist.ph.title'))}">
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('checklist.label.items'))}</label>
              <textarea id="clInput" rows="6" spellcheck="false" placeholder="${esc(t('checklist.ph.items'))}"></textarea>
            </div>

            <div class="cc-stats" id="clStats"></div>
            <div class="tool-list" id="clList"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="clShare">${esc(t('checklist.btn.share'))}</button>
              <button class="btn btn-ghost" id="clReset">${esc(t('checklist.btn.reset'))}</button>
            </div>
            <div class="tool-status" id="clStatus">${esc(t('checklist.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const titleEl = $<HTMLInputElement>('#clTitle');
          const inputEl = $<HTMLTextAreaElement>('#clInput');
          const listEl = $<HTMLElement>('#clList');
          const stats = $<HTMLElement>('#clStats');
          let items: Item[] = [];

          function syncFromText(): void {
            const lines = inputEl.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            // 이미 체크한 항목은 글자가 같으면 상태를 이어받는다 (편집 중에 체크가 풀리면 안 된다)
            const doneMap = new Map(items.map((i) => [i.text, i.done]));
            items = lines.map((t) => ({ text: t, done: doneMap.get(t) || false }));
            render();
          }

          function render(): void {
            const done = items.filter((i) => i.done).length;
            stats.innerHTML =
              `<div class="cc-stat cc-stat-primary"><div class="cc-stat-label">${esc(t('checklist.stat.left'))}</div><div class="cc-stat-value">${esc(t('checklist.value.count', { n: items.length - done }))}</div></div>` +
              `<div class="cc-stat"><div class="cc-stat-label">${esc(t('checklist.stat.done'))}</div><div class="cc-stat-value">${esc(t('checklist.value.count', { n: done }))}</div></div>` +
              `<div class="cc-stat"><div class="cc-stat-label">${esc(t('checklist.stat.progress'))}</div><div class="cc-stat-value">${items.length ? Math.round((done / items.length) * 100) : 0}%</div></div>`;

            listEl.innerHTML = items
              .map(
                (it, i) =>
                  `<div class="tool-list-row cc-copy-row cl-row${it.done ? ' cl-done' : ''}" data-i="${i}">
                     <span class="tool-list-key">${it.done ? '✓' : '○'}</span>
                     <span class="tool-list-val">${esc(it.text)}</span>
                   </div>`
              )
              .join('');
            listEl.querySelectorAll('[data-i]').forEach((el) => {
              (el as HTMLElement).onclick = () => {
                const i = Number((el as HTMLElement).dataset.i);
                items[i].done = !items[i].done;
                render();
                Toolbox.trackUse?.('toggle');
              };
            });
          }

          inputEl.addEventListener('input', syncFromText);
          titleEl.addEventListener('input', render);

          $<HTMLButtonElement>('#clShare').onclick = () => {
            const code = encodeState(titleEl.value, items);
            const url = `${location.origin}/karmolab/t/checklist/#list=${code}`;
            void Toolbox.copyText?.(url, { message: t('checklist.copy.done') });
            Toolbox.trackUse?.('share');
          };
          $<HTMLButtonElement>('#clReset').onclick = () => {
            items = items.map((i) => ({ ...i, done: false }));
            render();
          };

          // 주소에 목록이 실려 있으면 그걸 연다
          const m = location.hash.match(/list=([^&]+)/);
          const loaded = m ? decodeState(m[1]) : null;
          if (loaded && loaded.items.length) {
            titleEl.value = loaded.title;
            items = loaded.items;
            inputEl.value = items.map((i) => i.text).join('\n');
            render();
          } else {
            inputEl.value = t('checklist.sample');
            syncFromText();
          }
                  });
        }
      }
    ]
  });
})();
