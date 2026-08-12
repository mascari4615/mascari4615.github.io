/**
 * 사라지는 쪽지 (TASK-KL-251)
 *
 * 비밀을 적으면 링크가 나오고, 상대가 **한 번 열면 영원히 사라진다**.
 *
 * 열쇠는 주소의 `#` 뒤에 있어 우리 서버로 오지 않는다 — 서버가 들고 있는 것은 알아볼 수 없는
 * 덩어리 하나뿐이다. 그래서 「우리도 못 본다」가 말이 아니라 구조다. 그 사실을 화면에도
 * 적어 둔다: 믿음이 알맹이인 도구에서 그 근거가 안 보이면 값어치가 없다.
 */
import { linkFor, open, packFile, parseLink, seal, unpackFile } from '../../lib/burn-note';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const API = 'https://yawnbot.mascari4615.com/kl/note';

  Toolbox.register({
    id: 'burnnote',
    title: t('widgets.burnnote.title', undefined, '사라지는 쪽지'),
    category: 'tool',
    desc: t(
      'widgets-desc.burnnote.desc',
      undefined,
      '비밀번호 같은 것을 한 번만 열리는 링크로 건넵니다. 브라우저에서 잠그고 열쇠는 주소에만 담겨 서버는 내용을 볼 수 없습니다'
    ),
    layout: 'wide',
    icon: '<path d="M12 3l7 4v6c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M9.5 12l1.8 1.8L15 10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('burnnote.tab', undefined, '쪽지'),
        build: function (container: HTMLElement): void {
          void loadNamespace('burnnote').then(function () {
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
      <div id="bnWrite">
        <div class="field-group">
          <label class="field-label" for="bnText">${esc(t('burnnote.label.text', undefined, '건넬 것'))}</label>
          <textarea id="bnText" rows="6" spellcheck="false" style="width:100%;"
                    placeholder="${esc(t('burnnote.ph.text', undefined, '비밀번호, 주소, 한 번만 보일 말…'))}"></textarea>
        </div>
        <div class="field-group">
          <div class="tool-sublabel">${esc(t('burnnote.label.file', undefined, '파일도 함께 (하나, 5MB 까지)'))}</div>
          <input type="file" id="bnFile">
          <p class="bn-note" id="bnFileNote" style="display:none;"></p>
        </div>
        <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
          <button class="btn btn-primary" id="bnMake">${esc(t('burnnote.btn.make', undefined, '링크 만들기'))}</button>
        </div>
        <div class="field-group" id="bnResult" style="display:none;">
          <div class="tool-sublabel">${esc(t('burnnote.label.link', undefined, '이 링크를 건네세요'))}</div>
          <input type="text" id="bnLink" readonly aria-label="${esc(t('burnnote.label.link', undefined, '이 링크를 건네세요'))}" style="width:100%; font-family:var(--font-mono,monospace);">
          <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
            <button class="btn" id="bnCopy">${esc(t('burnnote.btn.copy', undefined, '복사'))}</button>
          </div>
          <p class="bn-note">${esc(t('burnnote.note.once', undefined, '이 링크는 딱 한 번 열립니다. 열리는 순간 서버에서도 지워집니다. 아무도 안 열면 7일 뒤 사라집니다.'))}</p>
        </div>
      </div>

      <div id="bnRead" style="display:none;">
        <div class="bn-open">
          <div class="tool-sublabel">${esc(t('burnnote.label.got', undefined, '받은 쪽지'))}</div>
          <p class="bn-warn">${esc(t('burnnote.note.warn', undefined, '지금 열면 사라집니다. 옮겨 적을 준비가 됐을 때 누르세요.'))}</p>
          <button class="btn btn-primary" id="bnOpen">${esc(t('burnnote.btn.open', undefined, '열기 (한 번뿐)'))}</button>
          <textarea id="bnGot" rows="6" readonly aria-label="${esc(t('burnnote.label.got', undefined, '받은 쪽지'))}" style="width:100%; display:none; margin-top:10px;"></textarea>
          <button class="btn btn-primary" id="bnSave" style="display:none; margin-top:10px;">${esc(t('burnnote.btn.save', undefined, '파일 받기'))}</button>
        </div>
      </div>

      <p class="bn-how">${esc(t('burnnote.how', undefined, '어떻게 우리도 못 보나: 글은 이 브라우저에서 잠기고, 여는 열쇠는 링크의 # 뒤에 담깁니다. 브라우저는 # 뒤를 서버로 보내지 않습니다.'))}</p>
      <div class="tool-status" id="bnStatus"></div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#bnStatus');
    const say = (m: string, kind = ''): void => {
      status.textContent = m;
      status.className = 'tool-status' + (kind ? ' ' + kind : '');
    };

    injectStyles();

    /* 받은 링크로 들어왔나 — 그러면 쓰는 화면 대신 여는 화면을 보여 준다. */
    const incoming = parseLink(location.hash);
    if (incoming) {
      $('#bnWrite').style.display = 'none';
      $('#bnRead').style.display = '';
      $('#bnOpen').onclick = (): void => {
        void (async () => {
          try {
            const res = await fetch(`${API}/${encodeURIComponent(incoming.id)}`, { cache: 'no-store' });
            if (!res.ok) {
              say(t('burnnote.status.gone', undefined, '이미 열렸거나 사라진 쪽지입니다'), 'warn');
              return;
            }
            const { body } = (await res.json()) as { body: string };
            const text = await open(body, incoming.key);
            $('#bnOpen').setAttribute('disabled', 'true');
            const file = unpackFile(text);
            if (file) {
              /* 파일은 화면에 못 보여 준다 — 받는 단추 하나로 끝낸다. 이 창을 닫으면
                 서버에도 없으므로 **지금 받지 않으면 영영 없다**. */
              const save = $<HTMLButtonElement>('#bnSave');
              save.style.display = '';
              save.onclick = (): void => {
                const blob = new Blob([file.bytes], { type: file.type || 'application/octet-stream' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = file.name;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
              };
              say(t('burnnote.status.openedFile', { name: file.name }, `파일 「${file.name}」 — 지금 받으세요. 창을 닫으면 없습니다`), 'ok');
            } else {
              const box = $<HTMLTextAreaElement>('#bnGot');
              box.value = text;
              box.style.display = '';
              say(t('burnnote.status.opened', undefined, '열었습니다 — 이 쪽지는 이제 없습니다'), 'ok');
            }
          } catch {
            /* 열쇠가 틀리면 조용히 넘어가면 안 된다 — 「빈 쪽지였나 보다」로 읽힌다. */
            say(t('burnnote.status.badkey', undefined, '열쇠가 맞지 않습니다 — 링크가 잘렸을 수 있습니다'), 'warn');
          }
        })();
      };
      return;
    }

    $('#bnMake').onclick = (): void => {
      void (async () => {
        const text = $<HTMLTextAreaElement>('#bnText').value;
        const picked = $<HTMLInputElement>('#bnFile').files?.[0] || null;
        if (!text.trim() && !picked) {
          say(t('burnnote.status.empty', undefined, '건넬 것을 적거나 파일을 고르세요'), 'warn');
          return;
        }
        if (picked && picked.size > 5 * 1024 * 1024) {
          say(t('burnnote.status.big', undefined, '파일이 5MB 를 넘습니다'), 'warn');
          return;
        }
        try {
          /* 파일을 골랐으면 파일이 앞선다 — 하나의 덩어리에 하나만 담는다(둘을 섞으면
             받는 쪽 화면이 「글이냐 파일이냐」로 갈려 둘 다 어정쩡해진다). */
          const payload = picked
            ? packFile(picked.name, picked.type, new Uint8Array(await picked.arrayBuffer()))
            : text;
          const { body, key } = await seal(payload);
          const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body })
          });
          if (!res.ok) {
            say(t('burnnote.status.failed', undefined, '맡기지 못했습니다 — 잠시 뒤 다시'), 'warn');
            return;
          }
          const { id } = (await res.json()) as { id: string };
          const link = linkFor(location.origin, id, key);
          const el = $<HTMLInputElement>('#bnLink');
          el.value = link;
          $('#bnResult').style.display = '';
          el.select();
          say(t('burnnote.status.made', undefined, '링크를 만들었습니다'), 'ok');
        } catch {
          say(t('burnnote.status.failed', undefined, '맡기지 못했습니다 — 잠시 뒤 다시'), 'warn');
        }
      })();
    };

    $('#bnCopy').onclick = (): void => {
      const el = $<HTMLInputElement>('#bnLink');
      el.select();
      void navigator.clipboard
        ?.writeText(el.value)
        .then(() => say(t('burnnote.status.copied', undefined, '복사했습니다'), 'ok'))
        .catch(() => say(t('burnnote.status.copyfail', undefined, '복사가 막혔습니다 — 직접 골라 복사해 주세요'), 'warn'));
    };
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const css = `
.bn-note{margin:10px 0 0;font-size:13px;opacity:.75;line-height:1.6;}
.bn-how{margin:18px 0 0;font-size:12px;opacity:.6;line-height:1.6;}
.bn-open{padding:16px;border-radius:10px;border:1px solid rgba(128,128,128,.25);}
.bn-warn{margin:6px 0 12px;font-size:13px;line-height:1.6;
  padding:10px 12px;border-radius:8px;
  border:1px solid rgba(240,180,90,.45);background:rgba(240,180,90,.10);}
`;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }
})();
