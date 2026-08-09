/**
 * 파일 검사값 확인 (TASK-KL-088)
 *
 * 내려받은 설치 파일이 중간에 바뀌지 않았는지 확인하려면 배포처가 적어 둔 검사값(체크섬)과
 * 내 파일의 값을 비교해야 한다. 그런데 그 값을 **눈으로 대조하면 반드시 놓친다** — 64자리다.
 * 그래서 기대값을 붙여 넣으면 기계가 맞춰 준다. 파일은 브라우저 밖으로 나가지 않는다.
 */
import { acceptPastedFiles } from './shared/paste';
import { FILE_ALGOS as ALGOS, hashBytes, size, verify } from '../../core/filehash';

(function (): void {
  Toolbox.register({
    id: 'filehash',
    title: '파일 검사값 확인',
    category: 'tool',
    desc: '내려받은 파일의 체크섬을 계산하고 배포처가 적어 둔 값과 맞춰 봅니다',
    layout: 'wide',
    icon: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '검사값',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="fhDrop" role="button" tabindex="0">
              <input type="file" id="fhFile" hidden>
              파일을 끌어다 놓거나 눌러서 고르세요
            </div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label">배포처가 적어 둔 값 — 붙여 넣으면 자동으로 맞춰 봅니다</label>
              <input type="text" id="fhExpect" spellcheck="false" placeholder="e3b0c44298fc1c14...">
            </div>

            <div class="tool-display" id="fhVerdict">—</div>
            <div class="tool-list" id="fhOut"></div>
            <div class="tool-status" id="fhStatus">파일은 브라우저 안에서만 읽습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#fhDrop');
          const fileInput = $<HTMLInputElement>('#fhFile');
          const expect = $<HTMLInputElement>('#fhExpect');
          const verdict = $<HTMLElement>('#fhVerdict');
          const out = $<HTMLElement>('#fhOut');
          const status = $<HTMLElement>('#fhStatus');
          let hashes: Record<string, string> = {};
          let fileName = '';

          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

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
                void Toolbox.copyText?.((el as HTMLElement).dataset.v || '', { message: '검사값을 복사했어요' });
              };
            });

            if (!want || !Object.keys(hashes).length) {
              verdict.textContent = Object.keys(hashes).length ? '계산 완료' : '—';
              verdict.className = 'tool-display';
              return;
            }
            /* 맞추는 규칙은 알맹이가 소유한다 — `hashgen`(문자열 해시) 과 **같은 정리 규칙**을
               써야 두 도구가 서로 다른 답을 내지 않는다 (TASK-KL-205). */
            const matched = verify(hashes, expect.value).matched;
            verdict.textContent = matched ? '일치' : '불일치';
            verdict.className = 'tool-display' + (matched ? '' : ' tool-display-done');
            say(
              matched
                ? `${matched} 값이 배포처와 같습니다 — 파일이 온전합니다.`
                : '어떤 방식으로도 값이 다릅니다 — 받다가 깨졌거나 다른 파일일 수 있습니다.',
              matched ? 'ok' : 'error'
            );
          }

          async function run(file: File): Promise<void> {
            fileName = file.name;
            hashes = {};
            verdict.textContent = '계산 중…';
            say(`${file.name} · ${size(file.size)} 를 읽는 중…`);
            /* 계산·정리는 `src/core/filehash.ts` 가 한다 — 바이트를 넘긴다(바이트 규약, TASK-KL-205). */
            hashes = await hashBytes(new Uint8Array(await file.arrayBuffer()));
            render();
            if (!expect.value.trim()) say(`${fileName} · ${size(file.size)} · 줄을 누르면 값이 복사됩니다.`, 'ok');
            Toolbox.trackUse?.('hash');
          }

          drop.onclick = () => fileInput.click();
          // 파일 고르는 칸은 감춰 두고 이 상자를 누르게 되어 있다. 마우스가 없으면 길이 막히므로
          // 키보드에서도 열리게 한다 (TASK-KL-089).
          drop.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInput.click();
            }
          });
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void run(fileInput.files[0]);
          };
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
          // 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { void run(files[0]); }, () => true);
          expect.addEventListener('input', render);
        }
      }
    ]
  });
})();
