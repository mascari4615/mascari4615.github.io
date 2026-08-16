/**
 * 파일 검사값 확인 (TASK-KL-088)
 *
 * 내려받은 설치 파일이 중간에 바뀌지 않았는지 확인하려면 배포처가 적어 둔 검사값(체크섬)과
 * 내 파일의 값을 비교해야 한다. 그런데 그 값을 **눈으로 대조하면 반드시 놓친다** — 64자리다.
 * 그래서 기대값을 붙여 넣으면 기계가 맞춰 준다. 파일은 브라우저 밖으로 나가지 않는다.
 */
import { statusLine } from './shared/say';
import { escapeHtml as esc } from './shared/text';
import { wireDrop } from './shared/drop-well';
import { FILE_ALGOS as ALGOS, hashBytes, hashLookups, size, verify } from '../../core/filehash';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'filehash',
    title: t('widgets.filehash.title', undefined, "파일 검사값 확인"),
    category: 'tool',
    desc: t('widgets-desc.filehash.desc', undefined, "내려받은 파일의 체크섬을 계산하고 배포처가 적어 둔 값과 맞춰 봅니다"),
    layout: 'wide',
    icon: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('filehash.stat.digest', undefined, "검사값"),
        build: function (container: HTMLElement): void {
          void loadNamespace('filehash').then(function () {

          container.innerHTML = `
            <div class="tool-drop" id="fhDrop" role="button" tabindex="0">
              <input type="file" id="fhFile" hidden>
              ${esc(t('filehash.drop'))}
            </div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label">${esc(t('filehash.label.expect'))}</label>
              <input type="text" id="fhExpect" spellcheck="false" placeholder="e3b0c44298fc1c14...">
            </div>

            <div class="tool-display" id="fhVerdict">—</div>
            <div class="tool-list" id="fhOut"></div>

            <div id="fhLookup" hidden style="margin-top:var(--space-lg);">
              <div class="tool-sublabel">${esc(t('filehash.lookup.title', undefined, '이 검사값으로 물어보기'))}</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <a class="btn btn-ghost btn-sm" id="fhLookupVt" target="_blank" rel="noopener noreferrer">${esc(t('filehash.lookup.virustotal', undefined, 'VirusTotal'))}</a>
                <a class="btn btn-ghost btn-sm" id="fhLookupBz" target="_blank" rel="noopener noreferrer">${esc(t('filehash.lookup.bazaar', undefined, 'MalwareBazaar'))}</a>
              </div>
              <p class="tool-sublabel" style="margin-top:var(--space-sm);">${esc(t('filehash.lookup.how', undefined, '파일은 여전히 안 나갑니다 — 누르면 64자리 검사값만 그 사이트 주소에 실립니다. 해시로는 파일을 되돌릴 수 없습니다.'))}</p>
            </div>
            <div class="tool-status" id="fhStatus">${esc(t('filehash.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#fhDrop');
          const fileInput = $<HTMLInputElement>('#fhFile');
          const expect = $<HTMLInputElement>('#fhExpect');
          const verdict = $<HTMLElement>('#fhVerdict');
          const out = $<HTMLElement>('#fhOut');
          const lookup = $<HTMLElement>('#fhLookup');
          const lookupVt = $<HTMLAnchorElement>('#fhLookupVt');
          const lookupBz = $<HTMLAnchorElement>('#fhLookupBz');
          const status = $<HTMLElement>('#fhStatus');
          let hashes: Record<string, string> = {};
          let fileName = '';

          /* 상태 줄은 **공용 하나**를 쓴다 (TASK-KL-291) — `aria-live` 가 여기 붙어 있어서
           * 화면낭독기가 「다 됐습니다」·「못 엽니다」를 실제로 읽어 준다. */
          const say = statusLine(status);

          /* 남의 창고로 넘겨주는 자리 (TASK-KL-238 / 24). 64자리 SHA-256 이 나왔을 때만 뜬다 —
           * 반쪽 값으로 열면 아무것도 못 찾고 사람은 「깨끗하다」로 오해한다. */
          function renderLookup(): void {
            const links = hashLookups(hashes['SHA-256'] ?? '');
            lookup.hidden = links.length === 0;
            for (const l of links) {
              if (l.id === 'virustotal') lookupVt.href = l.url;
              if (l.id === 'bazaar') lookupBz.href = l.url;
            }
          }

          function render(): void {
            const want = expect.value.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
            out.innerHTML = Object.keys(hashes)
              .map((algo) => {
                const v = hashes[algo];
                const hit = want && v === want;
                return `<div class="tool-list-row cc-copy-row" data-v="${v}"><span class="tool-list-key">${algo}${hit ? ' ✓' : ''}</span><span class="tool-list-val" style="word-break:break-all;">${esc(v)}</span></div>`;
              })
              .join('');
            out.querySelectorAll('[data-v]').forEach((el) => {
              (el as HTMLElement).onclick = () => {
                void Toolbox.copyText?.((el as HTMLElement).dataset.v || '', { message: t('filehash.copy.done') });
              };
            });

            if (!want || !Object.keys(hashes).length) {
              verdict.textContent = Object.keys(hashes).length ? t('filehash.say.done') : '—';
              verdict.className = 'tool-display';
              return;
            }
            /* 맞추는 규칙은 알맹이가 소유한다 — `hashgen`(문자열 해시) 과 **같은 정리 규칙**을
               써야 두 도구가 서로 다른 답을 내지 않는다 (TASK-KL-205). */
            const matched = verify(hashes, expect.value).matched;
            verdict.textContent = matched ? t('filehash.verdict.match') : t('filehash.verdict.differ');
            verdict.className = 'tool-display' + (matched ? '' : ' tool-display-done');
            say(
              matched
                ? t('filehash.say.match', { algo: matched })
                : t('filehash.say.noMatch'),
              matched ? 'ok' : 'error'
            );
          }

          async function run(file: File): Promise<void> {
            fileName = file.name;
            hashes = {};
            lookup.hidden = true; // 앞 파일의 검사값으로 남의 창고를 열면 안 된다
            verdict.textContent = t('filehash.say.working');
            say(t('filehash.say.reading', { name: file.name, size: size(file.size) }));
            /* 계산·정리는 `src/core/filehash.ts` 가 한다 — 바이트를 넘긴다(바이트 규약, TASK-KL-205). */
            hashes = await hashBytes(new Uint8Array(await file.arrayBuffer()));
            render();
            renderLookup();
            if (!expect.value.trim()) say(t('filehash.say.ready', { name: fileName, size: size(file.size) }), 'ok');
            Toolbox.trackUse?.('hash');
          }

          /* 파일 받는 자리는 **공용 하나**를 쓴다 (TASK-KL-290) — 키보드로 열기·붙여넣기가 딸려 온다. */
          wireDrop({ drop, input: fileInput, scope: container, onFiles: (files) => void run(files[0]) });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) void run(f);
          });
          // 파일을 바로 붙여넣는 것이 잦다
          expect.addEventListener('input', render);
                  });
        }
      }
    ]
  });
})();
