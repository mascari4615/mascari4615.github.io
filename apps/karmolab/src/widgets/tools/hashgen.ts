/**
 * 해시 생성기 · 파일 체크섬 — 화면 (TASK-KL-088)
 * - 텍스트 = crypto-js (MD5/SHA-1/SHA-256/SHA-512/SHA-3/RIPEMD-160)
 * - 파일 = WebCrypto subtle.digest (스트리밍 대신 ArrayBuffer 1회 — 브라우저 메모리 한도 안에서만 씀)
 * 어느 쪽도 네트워크로 나가지 않는다.
 *
 * 알고리즘 목록·16진수 표기·체크섬 대조는 `src/core/hashgen.ts` 가 정한다. 여기는 CryptoJS 라는
 * **손**만 빌려 준다 — Node 쪽은 같은 알맹이에 `node:crypto` 를 준다 (`src/core/README.md`).
 */
import { type Algo, bufToHex, FILE_ALGOS, findMatch, hashAll, type HashBackend, spec } from '../../core/hashgen';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /**
   * CryptoJS 를 알맹이가 아는 모양으로 감싼다. 없으면 던진다 — 조용히 빈 값을 내면 원인이 안 보인다.
   * SHA3-512·Keccak-512 는 여기 안 온다 — 알맹이가 `core/sha3.ts` 로 직접 계산한다.
   */
  const cryptoJsBackend: HashBackend = (algo: Algo, text: string): string => {
    if (typeof CryptoJS === 'undefined' || !CryptoJS) throw new Error('lib-missing');
    const lib = CryptoJS as unknown as Record<string, ((msg: string) => { toString: () => string }) | undefined>;
    const fn = lib[algo];
    if (typeof fn !== 'function') throw new Error('algo-missing:' + algo);
    return fn(text).toString();
  };

  Toolbox.register({
    id: 'hashgen',
    title: t('widgets.hashgen.title', undefined, '해시 생성기'),
    category: 'tool',
    desc: t(
      'widgets-desc.hashgen.desc',
      undefined,
      '텍스트나 파일의 MD5·SHA-1·SHA-256·SHA-512 해시(체크섬)를 브라우저에서 바로 계산합니다'
    ),
    layout: 'form',
    icon: '<path d="M9 3L7 21M17 3l-2 18M4 8h16M3 16h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'text',
        label: t('hashgen.tab.text', undefined, '텍스트'),
        build: function (container: HTMLElement): void {
          void loadNamespace('hashgen').then(function () {
            drawText(container);
          });
        }
      },
      {
        id: 'file',
        label: t('hashgen.tab.file', undefined, '파일 체크섬'),
        build: function (container: HTMLElement): void {
          void loadNamespace('hashgen').then(function () {
            drawFile(container);
          });
        }
      }
    ]
  });

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function drawText(container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: t('hashgen.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('hashgen.label.input'))}</label>
              <textarea id="hgInput" placeholder="${esc(t('hashgen.ph.input'))}" style="min-height:120px;"></textarea>
            </div>
            <div class="field-group">
              <div class="field-row" style="margin-bottom:8px;">
                <label class="field-label" style="margin:0;">${esc(t('hashgen.label.out'))}</label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="hgUpper" style="width:auto;"> ${esc(t('hashgen.opt.upper'))}
                </label>
              </div>
              <div id="hgOut" class="tool-list"></div>
            </div>
            <div class="tool-status" id="hgNote">${esc(t('hashgen.note'))}</div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#hgInput');
          const out = $<HTMLElement>('#hgOut');
          const upper = $<HTMLInputElement>('#hgUpper');

          function render(): void {
            let rows;
            try {
              rows = hashAll(input.value, cryptoJsBackend, upper.checked);
            } catch {
              out.innerHTML = `<div class="tool-status error">${esc(t('hashgen.err.lib'))}</div>`;
              return;
            }
            out.innerHTML = rows
              .map(
                (r) => `<div class="tool-list-row hg-row" data-hash="${r.hex}" data-algo="${r.algo}">
                        <span class="tool-list-key"${
                          r.caveat ? ` title="${esc(t(`hashgen.caveat.${r.algo}`, undefined, r.caveat))}"` : ''
                        }>${r.label}</span>
                        <span class="tool-list-val hg-hash">${r.hex || '-'}</span>
                        <button class="btn btn-ghost hg-copy" type="button">${esc(t('hashgen.btn.copy'))}</button>
                      </div>`
              )
              .join('');
            container.querySelectorAll('.hg-copy').forEach((btn) => {
              (btn as HTMLButtonElement).onclick = async () => {
                const hash = (btn.closest('.hg-row') as HTMLElement)?.dataset.hash || '';
                if (!hash) return;
                await Toolbox.copyText?.(hash, { message: t('hashgen.copy.done') });
              };
            });
          }
          input.addEventListener('input', render);
          upper.addEventListener('change', render);
          /* 빈 칸으로 시작하면 무엇이 나오는 도구인지 안 보인다 — 예시 한 줄을 넣어
             결과를 먼저 보여 준다. 치는 순간 그 값으로 바뀐다 (TASK-KL-133).
             주소로 불렀으면(`?op=text&text=…`) 그 값이 예시를 대신한다 (TASK-KL-205). */
          const call = readInvocation(spec);
          input.value = 'KarmoLab';
          if (call !== null && call.error === undefined && call.op === 'text') {
            input.value = String(call.args.text ?? '');
            upper.checked = call.args.upper === true;
          }
          render();
          if (call?.error !== undefined) {
            const note = $<HTMLElement>('#hgNote');
            note.textContent = call.error;
            note.className = 'tool-status error';
          }
  }

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function drawFile(container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('hashgen.label.file'))}</label>
              <div id="hfDrop" class="tool-drop">
                <input type="file" id="hfFile" style="display:none;">
                <div>${esc(t('hashgen.drop'))} <button class="btn btn-ghost" id="hfPick" type="button">${esc(
                  t('hashgen.btn.pick')
                )}</button></div>
                <div class="tool-status" id="hfName">${esc(t('hashgen.file.empty'))}</div>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('hashgen.label.checksum'))}</label>
              <div id="hfOut" class="tool-list"></div>
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('hashgen.label.expect'))}</label>
              <input type="text" id="hfExpect" placeholder="${esc(t('hashgen.ph.expect'))}">
              <div class="tool-status" id="hfMatch" style="margin-top:8px;"></div>
            </div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#hfDrop');
          const fileInput = $<HTMLInputElement>('#hfFile');
          const nameEl = $<HTMLElement>('#hfName');
          const out = $<HTMLElement>('#hfOut');
          const expect = $<HTMLInputElement>('#hfExpect');
          const match = $<HTMLElement>('#hfMatch');
          let hashes: Record<string, string> = {};

          function compare(): void {
            if (expect.value.trim() === '' || Object.keys(hashes).length === 0) {
              match.textContent = '';
              match.className = 'tool-status';
              return;
            }
            const hit = findMatch(hashes, expect.value);
            match.textContent = hit ? t('hashgen.match.ok', { algo: hit }) : t('hashgen.match.no');
            match.className = 'tool-status ' + (hit ? 'ok' : 'error');
          }

          async function run(file: File): Promise<void> {
            nameEl.textContent = t('hashgen.file.working', {
              name: file.name,
              mb: (file.size / 1024 / 1024).toFixed(2)
            });
            out.innerHTML = '';
            hashes = {};
            try {
              const buf = await file.arrayBuffer();
              for (const algo of FILE_ALGOS) {
                const digest = await crypto.subtle.digest(algo, buf);
                hashes[algo] = bufToHex(digest);
              }
              out.innerHTML = Object.keys(hashes)
                .map(
                  (k) =>
                    `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${hashes[k]}</span></div>`
                )
                .join('');
              nameEl.textContent = t('hashgen.file.done', {
                name: file.name,
                mb: (file.size / 1024 / 1024).toFixed(2)
              });
              Toolbox.trackUse?.('file-checksum');
              compare();
            } catch (e) {
              nameEl.textContent = t('hashgen.err.read', {
                msg: e instanceof Error ? e.message : String(e)
              });
            }
          }

          $<HTMLButtonElement>('#hfPick').onclick = () => fileInput.click();
          fileInput.addEventListener('change', () => {
            const f = fileInput.files && fileInput.files[0];
            if (f) void run(f);
          });
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) void run(f);
          });
          expect.addEventListener('input', compare);
  }
})();
