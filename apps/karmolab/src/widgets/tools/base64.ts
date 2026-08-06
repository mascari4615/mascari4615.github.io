/**
 * Base64 인코딩 · 디코딩 (TASK-KL-088)
 *
 * 브라우저 기본 함수(btoa/atob)는 **바이트 단위**라 한글을 넣으면 그냥 터진다.
 * 그래서 UTF-8 로 바꿔 넣고 되돌릴 때 다시 UTF-8 로 읽는다 — 한글이 깨지지 않는 이유.
 * URL-safe 표기(+/ → -_)도 함께 다룬다. 주소나 토큰에 실린 값은 대개 그쪽이다.
 */
(function (): void {
  function encode(text: string, urlSafe: boolean): string {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    const b64 = btoa(bin);
    return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64;
  }

  function decode(code: string): string {
    const norm = code.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    const padded = norm.padEnd(Math.ceil(norm.length / 4) * 4, '=');
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  Toolbox.register({
    id: 'base64',
    title: 'Base64 인코딩 · 디코딩',
    category: 'tool',
    desc: '텍스트와 Base64 를 서로 바꿉니다. 한글 안 깨짐, URL-safe 표기 지원',
    layout: 'wide',
    icon: '<path d="M4 7h6v10H4zM14 7h6v10h-6z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 12h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'Base64',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">텍스트</label>
              <textarea id="b6Text" rows="5" spellcheck="false" placeholder="안녕하세요"></textarea>
            </div>
            <div class="field-group">
              <label class="field-label">Base64</label>
              <textarea id="b6Code" rows="5" spellcheck="false" placeholder="7JWI64WV7ZWY7IS47JqU"></textarea>
            </div>
            <div class="field-group">
              <label class="tool-chip" style="display:inline-flex; align-items:center;">
                <input type="checkbox" id="b6Url"> URL-safe 표기 (+ / 대신 - _)
              </label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="b6CopyCode">Base64 복사</button>
              <button class="btn btn-ghost" id="b6CopyText">텍스트 복사</button>
              <button class="btn btn-ghost" id="b6Clear">지우기</button>
            </div>
            <div class="tool-status" id="b6Status">어느 칸에 적어도 반대쪽이 따라 바뀝니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const text = $<HTMLTextAreaElement>('#b6Text');
          const code = $<HTMLTextAreaElement>('#b6Code');
          const urlSafe = $<HTMLInputElement>('#b6Url');
          const status = $<HTMLElement>('#b6Status');
          let syncing = false;

          function say(msg: string, kind = ''): void {
            status.textContent = msg;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          }

          function fromText(): void {
            if (syncing) return;
            syncing = true;
            code.value = text.value ? encode(text.value, urlSafe.checked) : '';
            syncing = false;
            say(text.value ? `${new TextEncoder().encode(text.value).length} 바이트 → ${code.value.length} 글자` : '어느 칸에 적어도 반대쪽이 따라 바뀝니다.', 'ok');
            Toolbox.trackUse?.('encode');
          }

          text.addEventListener('input', fromText);
          urlSafe.addEventListener('change', fromText);
          code.addEventListener('input', () => {
            if (syncing) return;
            syncing = true;
            try {
              text.value = code.value.trim() ? decode(code.value) : '';
              say(code.value.trim() ? '읽었습니다.' : '어느 칸에 적어도 반대쪽이 따라 바뀝니다.', 'ok');
            } catch {
              say('Base64 로 읽을 수 없는 글자가 섞여 있어요.', 'error');
            }
            syncing = false;
            Toolbox.trackUse?.('decode');
          });

          $<HTMLButtonElement>('#b6CopyCode').onclick = () => {
            if (code.value) void Toolbox.copyText?.(code.value, { message: 'Base64 를 복사했어요' });
          };
          $<HTMLButtonElement>('#b6CopyText').onclick = () => {
            if (text.value) void Toolbox.copyText?.(text.value, { message: '텍스트를 복사했어요' });
          };
          $<HTMLButtonElement>('#b6Clear').onclick = () => {
            text.value = '';
            code.value = '';
            say('어느 칸에 적어도 반대쪽이 따라 바뀝니다.');
          };

          text.value = '안녕하세요';
          fromText();
        }
      }
    ]
  });
})();
