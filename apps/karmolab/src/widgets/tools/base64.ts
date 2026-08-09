/**
 * Base64 인코딩 · 디코딩 — 화면 (TASK-KL-088)
 *
 * 계산은 `src/core/base64.ts` 가 한다. 여기는 그리는 일만 한다 (`src/core/README.md`).
 * 주소로 부른 경우(`?op=encode&text=…`)도 여기서 받아 칸을 채운다 — 규약은 `lib/tool-url.ts`.
 */
import { byteLength, decode, encode, spec } from '../../core/base64';
import { buildToolUrl, readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* 안내 문구도 **쓸 때** 가져온다 (모듈 바닥에서 부르면 말 묶음 전이라 한국어로 굳는다). */
  const idle = (): string => t('base64.status.idle');

  Toolbox.register({
    id: 'base64',
    title: t('widgets.base64.title', undefined, "Base64 인코딩 · 디코딩"),
    category: 'tool',
    desc: t('widgets-desc.base64.desc', undefined, "텍스트와 Base64 를 서로 바꿉니다. 한글 안 깨짐, URL-safe 표기 지원"),
    layout: 'wide',
    icon: '<path d="M4 7h6v10H4zM14 7h6v10h-6z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 12h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'Base64',
        build: function (container: HTMLElement): void {
          void loadNamespace('base64').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('base64.label.text'))}</label>
              <textarea id="b6Text" rows="5" spellcheck="false" placeholder="${esc(t('base64.ph.text'))}"></textarea>
            </div>
            <div class="field-group">
              <label class="field-label">Base64</label>
              <textarea id="b6Code" rows="5" spellcheck="false" placeholder="7JWI64WV7ZWY7IS47JqU"></textarea>
            </div>
            <div class="field-group">
              <label class="tool-chip" style="display:inline-flex; align-items:center;">
                <input type="checkbox" id="b6Url"> ${esc(t('base64.opt.urlSafe'))}
              </label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="b6CopyCode">${esc(t('base64.btn.copyCode'))}</button>
              <button class="btn btn-ghost" id="b6CopyText">${esc(t('base64.btn.copyText'))}</button>
              <button class="btn btn-ghost" id="b6CopyLink">${esc(t('base64.btn.copyLink'))}</button>
              <button class="btn btn-ghost" id="b6Clear">${esc(t('base64.btn.clear'))}</button>
            </div>
            <div class="tool-status" id="b6Status">${esc(idle())}</div>
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
            say(text.value ? t('base64.say.size', { bytes: byteLength(text.value), chars: code.value.length }) : idle(), 'ok');
            Toolbox.trackUse?.('encode');
          }

          function fromCode(): void {
            if (syncing) return;
            syncing = true;
            try {
              text.value = code.value.trim() ? decode(code.value) : '';
              say(code.value.trim() ? t('base64.say.decoded') : idle(), 'ok');
            } catch {
              say(t('base64.err.decode'), 'error');
            }
            syncing = false;
            Toolbox.trackUse?.('decode');
          }

          text.addEventListener('input', fromText);
          urlSafe.addEventListener('change', fromText);
          code.addEventListener('input', fromCode);

          $<HTMLButtonElement>('#b6CopyCode').onclick = () => {
            if (code.value) void Toolbox.copyText?.(code.value, { message: t('base64.copy.code') });
          };
          $<HTMLButtonElement>('#b6CopyText').onclick = () => {
            if (text.value) void Toolbox.copyText?.(text.value, { message: t('base64.copy.text') });
          };
          $<HTMLButtonElement>('#b6CopyLink').onclick = () => {
            if (text.value === '') {
              say(t('base64.err.noText'));
              return;
            }
            // 열어 보면 지금 화면 그대로 나오는 주소. 받는 사람은 붙여넣기 없이 결과를 본다.
            const path = buildToolUrl(spec, 'encode', { text: text.value, urlSafe: urlSafe.checked });
            const full = location.origin + path;
            void Toolbox.copyText?.(full, { message: t('base64.copy.link') });
          };
          $<HTMLButtonElement>('#b6Clear').onclick = () => {
            text.value = '';
            code.value = '';
            say(idle());
          };

          // 주소로 부른 경우. 없으면(=평소) 예시로 시작한다.
          const call = readInvocation(spec);
          if (call === null) {
            text.value = t('base64.ph.text');
            fromText();
            return;
          }
          if (call.error !== undefined) {
            text.value = t('base64.ph.text');
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
                  });
        }
      }
    ]
  });
})();
