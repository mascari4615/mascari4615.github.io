/**
 * Base64 인코딩 · 디코딩 — 화면 (TASK-KL-088)
 *
 * 계산은 `src/core/base64.ts` 가 한다. 여기는 그리는 일만 한다 (`src/core/README.md`).
 * 주소로 부른 경우(`?op=encode&text=…`)도 여기서 받아 칸을 채운다 — 규약은 `lib/tool-url.ts`.
 */
import { byteLength, decode, encode, spec } from '../../core/base64';
import { buildToolUrl, readInvocation } from '../../lib/tool-url';

(function (): void {
  const IDLE = '어느 칸에 적어도 반대쪽이 따라 바뀝니다.';

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
              <button class="btn btn-ghost" id="b6CopyLink">이 상태 링크 복사</button>
              <button class="btn btn-ghost" id="b6Clear">지우기</button>
            </div>
            <div class="tool-status" id="b6Status">${IDLE}</div>
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
            say(text.value ? `${byteLength(text.value)} 바이트 → ${code.value.length} 글자` : IDLE, 'ok');
            Toolbox.trackUse?.('encode');
          }

          function fromCode(): void {
            if (syncing) return;
            syncing = true;
            try {
              text.value = code.value.trim() ? decode(code.value) : '';
              say(code.value.trim() ? '읽었습니다.' : IDLE, 'ok');
            } catch {
              say('Base64 로 읽을 수 없는 글자가 섞여 있어요.', 'error');
            }
            syncing = false;
            Toolbox.trackUse?.('decode');
          }

          text.addEventListener('input', fromText);
          urlSafe.addEventListener('change', fromText);
          code.addEventListener('input', fromCode);

          $<HTMLButtonElement>('#b6CopyCode').onclick = () => {
            if (code.value) void Toolbox.copyText?.(code.value, { message: 'Base64 를 복사했어요' });
          };
          $<HTMLButtonElement>('#b6CopyText').onclick = () => {
            if (text.value) void Toolbox.copyText?.(text.value, { message: '텍스트를 복사했어요' });
          };
          $<HTMLButtonElement>('#b6CopyLink').onclick = () => {
            if (text.value === '') {
              say('먼저 텍스트를 적어 주세요 — 그 상태를 링크로 만듭니다.');
              return;
            }
            // 열어 보면 지금 화면 그대로 나오는 주소. 받는 사람은 붙여넣기 없이 결과를 본다.
            const path = buildToolUrl(spec, 'encode', { text: text.value, urlSafe: urlSafe.checked });
            const full = location.origin + path;
            void Toolbox.copyText?.(full, { message: '이 상태로 열리는 링크를 복사했어요' });
          };
          $<HTMLButtonElement>('#b6Clear').onclick = () => {
            text.value = '';
            code.value = '';
            say(IDLE);
          };

          // 주소로 부른 경우. 없으면(=평소) 예시로 시작한다.
          const call = readInvocation(spec);
          if (call === null) {
            text.value = '안녕하세요';
            fromText();
            return;
          }
          if (call.error !== undefined) {
            text.value = '안녕하세요';
            fromText();
            say(call.error, 'error');
            return;
          }
          if (call.op === 'encode') {
            text.value = String(call.args.text ?? '');
            urlSafe.checked = call.args.urlSafe === true;
            fromText();
          } else {
            code.value = String(call.args.code ?? '');
            fromCode();
          }
        }
      }
    ]
  });
})();
