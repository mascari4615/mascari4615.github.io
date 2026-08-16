/**
 * SSH 열쇠 줄 보기 (TASK-KL-316 / 24)
 *
 * 「개발 도구」 작업대의 **뜯어보기** 칸. 알맹이는 `core/sshkey`.
 * `authorized_keys` 를 붙여넣으면 줄마다 **누구 것 · 어떤 종류 · 지문**을 낸다.
 * 지문은 서버에서 그 줄을 지울 때 쓰는 그 값이다 — 여기서는 **열쇠가 브라우저를 안 벗어난다.**
 */
import { fingerprint, parseAuthorized, toOpenSsh, spec, type Entry } from '../../core/sshkey';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'sshkey',
    title: t('widgets.sshkey.title', undefined, 'SSH 열쇠 보기'),
    category: 'tool',
    desc: t(
      'widgets-desc.sshkey.desc',
      undefined,
      'authorized_keys 를 붙여넣으면 줄마다 종류·길이·주석·지문을 냅니다. 공개키 PEM 을 OpenSSH 줄로도 바꿉니다'
    ),
    layout: 'wide',
    icon: '<circle cx="8" cy="12" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 12h9M18 12v3M15 12v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('sshkey.tab', undefined, 'SSH 열쇠'),
        build: function (container: HTMLElement): void {
          void loadNamespace('sshkey').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('sshkey.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="skIn">${esc(t('sshkey.label.in'))}</label>
        <textarea id="skIn" name="text" aria-label="${esc(t('sshkey.label.in'))}" class="mono-input" style="min-height:140px;" placeholder="ssh-ed25519 AAAAC3Nza... yon@laptop"></textarea>
      </div>
      <div id="skRows" class="tool-list"></div>
      <div class="field-group" style="margin-top:12px;">
        <label class="field-label" for="skPem">${esc(t('sshkey.label.pem'))}</label>
        <textarea id="skPem" name="pem" aria-label="${esc(t('sshkey.label.pem'))}" class="mono-input" style="min-height:110px;" placeholder="-----BEGIN PUBLIC KEY-----"></textarea>
      </div>
      <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <label class="field-label" for="skComment">${esc(t('sshkey.label.comment'))}</label>
          <input type="text" id="skComment" name="comment" aria-label="${esc(t('sshkey.label.comment'))}" class="mono-input" placeholder="yon@desktop">
        </div>
        <button class="btn btn-primary" id="skConvert">${esc(t('sshkey.btn.convert'))}</button>
        <button class="btn btn-ghost" id="skCopy">${esc(t('sshkey.btn.copy'))}</button>
      </div>
      <textarea id="skOut" name="out" aria-label="${esc(t('sshkey.aria.out'))}" class="mono-input" readonly style="min-height:80px;"></textarea>
      <div class="tool-status" id="skStatus">${esc(t('sshkey.status.idle'))}</div>
      <p class="tool-hint">${esc(t('sshkey.note.local'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const input = $<HTMLTextAreaElement>('#skIn');
    const status = $<HTMLElement>('#skStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    /** 지문은 브라우저의 해시로 낸다 — 알맹이는 해시를 직접 못 쓴다(core 규약). */
    async function digest(bytes: Uint8Array): Promise<Uint8Array> {
      /* 새 판 타입은 `Uint8Array<ArrayBufferLike>` 라 그대로는 안 받는다 — 바탕 버퍼를 새로 뜬다. */
      const buffer = new ArrayBuffer(bytes.length);
      new Uint8Array(buffer).set(bytes);
      return new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
    }

    function row(entry: Entry, print: string): string {
      const bad = entry.problem !== undefined;
      const head = entry.type + (entry.bits === undefined ? '' : ' · ' + entry.bits);
      const tail = [entry.comment ?? '', entry.options === undefined ? '' : t('sshkey.hasOptions')].filter((s) => s !== '').join(' · ');
      return (
        '<div class="tool-list-row"><span class="tool-list-key" style="color:' + (bad ? 'var(--accent-danger, #c62828)' : 'inherit') + '">' + esc(head) + '</span>' +
        '<span class="tool-list-val" style="font-family:var(--font-mono)">' + esc(bad ? t('sshkey.problem.' + entry.problem) : print) + '</span>' +
        '<span class="tool-list-dim">' + esc(tail) + '</span></div>'
      );
    }

    async function render(): Promise<void> {
      const entries = parseAuthorized(input.value);
      if (entries.length === 0) {
        $<HTMLElement>('#skRows').innerHTML = '';
        status.textContent = t('sshkey.status.idle');
        return;
      }
      /* 지문은 하나씩 비동기라, 다 모아서 한 번에 그린다 (그리다 말면 줄이 튄다). */
      const rows: string[] = [];
      for (const entry of entries) {
        let print = '';
        if (entry.problem === undefined && entry.base64 !== '') {
          const bytes = await digest(Uint8Array.from(atob(entry.base64), (c) => c.charCodeAt(0)));
          print = fingerprint(entry.base64, () => bytes);
        }
        rows.push(row(entry, print));
      }
      $<HTMLElement>('#skRows').innerHTML = rows.join('');
      const bad = entries.filter((e) => e.problem !== undefined).length;
      status.textContent = bad === 0 ? t('sshkey.status.ok', { n: entries.length }) : t('sshkey.status.some', { n: entries.length, bad });
    }

    input.addEventListener('input', () => void render());

    $<HTMLButtonElement>('#skConvert').onclick = (): void => {
      try {
        const line = toOpenSsh($<HTMLTextAreaElement>('#skPem').value, $<HTMLInputElement>('#skComment').value);
        $<HTMLTextAreaElement>('#skOut').value = line;
        status.textContent = t('sshkey.status.converted');
      } catch (e) {
        $<HTMLTextAreaElement>('#skOut').value = '';
        status.textContent = String((e as Error).message);
      }
    };
    $<HTMLButtonElement>('#skCopy').onclick = async (): Promise<void> => {
      const out = $<HTMLTextAreaElement>('#skOut').value;
      if (out === '') return;
      await Toolbox.copyText?.(out, { message: t('sshkey.copied') });
    };

    // 주소로 부른 경우 (`?op=read&text=...`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.text !== undefined) input.value = String(call.args.text);
      if (call.args.pem !== undefined) $<HTMLTextAreaElement>('#skPem').value = String(call.args.pem);
    }

    void render();
  }
})();
