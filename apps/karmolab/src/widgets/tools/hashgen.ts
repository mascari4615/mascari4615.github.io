/**
 * 해시 생성기 · 파일 체크섬 (TASK-KL-088)
 * - 텍스트 = crypto-js (MD5/SHA-1/SHA-256/SHA-512/SHA-3/RIPEMD-160)
 * - 파일 = WebCrypto subtle.digest (스트리밍 대신 ArrayBuffer 1회 — 브라우저 메모리 한도 안에서만 씀)
 * 어느 쪽도 네트워크로 나가지 않는다.
 */
(function (): void {
  const TEXT_ALGOS = ['MD5', 'SHA1', 'SHA256', 'SHA512', 'SHA3', 'RIPEMD160'] as const;
  const LABEL: Record<string, string> = {
    MD5: 'MD5',
    SHA1: 'SHA-1',
    SHA256: 'SHA-256',
    SHA512: 'SHA-512',
    SHA3: 'SHA-3 (512)',
    RIPEMD160: 'RIPEMD-160'
  };

  function bufToHex(buf: ArrayBuffer): string {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  Toolbox.register({
    id: 'hashgen',
    title: '해시 생성기',
    category: 'tool',
    desc: '텍스트나 파일의 MD5·SHA-1·SHA-256·SHA-512 해시(체크섬)를 브라우저에서 바로 계산합니다',
    layout: 'form',
    icon: '<path d="M9 3L7 21M17 3l-2 18M4 8h16M3 16h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'text',
        label: '텍스트',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '지문 찍듯이 해시 떠 드릴게요.' });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">입력 텍스트</label>
              <textarea id="hgInput" placeholder="해시를 구할 문자열" style="min-height:120px;"></textarea>
            </div>
            <div class="field-group">
              <div class="field-row" style="margin-bottom:8px;">
                <label class="field-label" style="margin:0;">해시 결과 (16진수)</label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="hgUpper" style="width:auto;"> 대문자
                </label>
              </div>
              <div id="hgOut" class="tool-list"></div>
            </div>
            <div class="tool-status" id="hgNote">MD5·SHA-1 은 충돌이 알려져 있어 무결성 확인 용도로만 쓰고, 비밀번호 저장에는 쓰지 마세요.</div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#hgInput');
          const out = $<HTMLElement>('#hgOut');
          const upper = $<HTMLInputElement>('#hgUpper');

          function render(): void {
            const text = input.value;
            if (typeof CryptoJS === 'undefined' || !CryptoJS) {
              out.innerHTML = '<div class="tool-status error">해시 라이브러리를 불러오지 못했어요. 새로고침해 주세요.</div>';
              return;
            }
            const lib = CryptoJS as unknown as Record<string, (msg: string) => { toString: () => string }>;
            out.innerHTML = TEXT_ALGOS.map((algo) => {
              const fn = lib[algo];
              if (typeof fn !== 'function') return '';
              let hex = text ? fn(text).toString() : '';
              if (upper.checked) hex = hex.toUpperCase();
              return `<div class="tool-list-row hg-row" data-hash="${hex}">
                        <span class="tool-list-key">${LABEL[algo]}</span>
                        <span class="tool-list-val hg-hash">${hex || '-'}</span>
                        <button class="btn btn-ghost hg-copy" type="button">복사</button>
                      </div>`;
            }).join('');
            container.querySelectorAll('.hg-copy').forEach((btn) => {
              (btn as HTMLButtonElement).onclick = async () => {
                const hash = (btn.closest('.hg-row') as HTMLElement)?.dataset.hash || '';
                if (!hash) return;
                await Toolbox.copyText?.(hash, { message: '해시를 복사했어요' });
              };
            });
          }
          input.addEventListener('input', render);
          upper.addEventListener('change', render);
          render();
        }
      },
      {
        id: 'file',
        label: '파일 체크섬',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">파일 선택 (드래그해서 놓아도 됩니다)</label>
              <div id="hfDrop" class="tool-drop">
                <input type="file" id="hfFile" style="display:none;">
                <div>여기로 파일을 끌어다 놓거나 <button class="btn btn-ghost" id="hfPick" type="button">파일 선택</button></div>
                <div class="tool-status" id="hfName">아직 선택된 파일이 없어요.</div>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">체크섬</label>
              <div id="hfOut" class="tool-list"></div>
            </div>
            <div class="field-group">
              <label class="field-label">기대값과 비교 (선택)</label>
              <input type="text" id="hfExpect" placeholder="배포처가 알려준 체크섬을 붙여넣으면 일치 여부를 알려줍니다">
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
            const want = expect.value.trim().toLowerCase().replace(/\s/g, '');
            if (!want || !Object.keys(hashes).length) {
              match.textContent = '';
              match.className = 'tool-status';
              return;
            }
            const hit = Object.keys(hashes).find((k) => hashes[k] === want);
            match.textContent = hit ? `일치 — ${hit} 해시가 같습니다.` : '일치하는 해시가 없습니다. 파일이 손상되었거나 다른 파일이에요.';
            match.className = 'tool-status ' + (hit ? 'ok' : 'error');
          }

          async function run(file: File): Promise<void> {
            nameEl.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB — 계산 중…`;
            out.innerHTML = '';
            hashes = {};
            try {
              const buf = await file.arrayBuffer();
              for (const algo of ['SHA-1', 'SHA-256', 'SHA-512']) {
                const digest = await crypto.subtle.digest(algo, buf);
                hashes[algo] = bufToHex(digest);
              }
              out.innerHTML = Object.keys(hashes)
                .map(
                  (k) =>
                    `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${hashes[k]}</span></div>`
                )
                .join('');
              nameEl.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
              Toolbox.trackUse?.('file-checksum');
              compare();
            } catch (e) {
              nameEl.textContent = '파일을 읽지 못했어요: ' + (e instanceof Error ? e.message : String(e));
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
      }
    ]
  });
})();
