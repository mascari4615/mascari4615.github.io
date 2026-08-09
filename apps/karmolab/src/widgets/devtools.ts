/**
 * 개발·디버그용 패널 (Tauri 전용 기능 등). 항목은 섹션 단위로 추가.
 */
import { invoke as tauriInvoke } from '../tauri-bridge';
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  'use strict';

  type NotifyPayload = {
    title: string;
    body: string;
    sound?: string;
    image_path?: string;
  };

  function buildNotifyPayload(
    titleIn: HTMLInputElement,
    bodyIn: HTMLTextAreaElement,
    soundSel: HTMLSelectElement,
    imageIn: HTMLInputElement
  ): NotifyPayload {
    const title = (titleIn.value || '').trim() || 'KarmoLab';
    const body = (bodyIn.value || '').trim() || 'KarmoLab';
    const o: NotifyPayload = { title: title.slice(0, 120), body: body.slice(0, 2000) };
    const snd = soundSel.value;
    if (snd && snd !== 'silent') o.sound = snd;
    const img = (imageIn.value || '').trim();
    if (img) o.image_path = img;
    return o;
  }

  function buildNotifySection(wrap: HTMLElement): void {
    const sec = document.createElement('section');
    sec.className = 'devtools-section';

    const h = document.createElement('h3');
    h.className = 'devtools-section-title';
    h.textContent = t('devtools.t03');

    const notifyLevelKey = 'karmolab_os_notify_level';
    const initLevel = localStorage.getItem(notifyLevelKey) || 'important';

    const pLevel = document.createElement('p');
    pLevel.className = 'devtools-section-desc';
    pLevel.innerHTML = t('devtools.t04');
    const levelSel = document.createElement('select');
    levelSel.className = 'devtools-select';
    levelSel.style.width = 'auto';
    [
      ['all', t('devtools.t05')],
      ['important', t('devtools.t06')],
      ['off', t('devtools.t07')],
    ].forEach(([v, text]) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = text;
      if (v === initLevel) opt.selected = true;
      levelSel.appendChild(opt);
    });
    levelSel.addEventListener('change', () => {
      localStorage.setItem(notifyLevelKey, levelSel.value);
      if (typeof Toolbox !== 'undefined') Toolbox.showToast(t('devtools.t08'), 'success', undefined);
    });
    pLevel.appendChild(levelSel);

    const p = document.createElement('p');
    const isApp = typeof Toolbox.isDesktopApp === 'function' && Toolbox.isDesktopApp();
    p.className = 'devtools-section-desc';
    p.innerHTML = isApp
      ? t('devtools.t09')
      : t('devtools.t10');

    sec.appendChild(h);
    sec.appendChild(pLevel);
    sec.appendChild(p);

    const mkField = function (labelText: string, inner: HTMLElement): HTMLElement {
      const row = document.createElement('div');
      row.className = 'devtools-field';
      const lab = document.createElement('label');
      lab.className = 'devtools-field-label';
      lab.textContent = labelText;
      row.appendChild(lab);
      row.appendChild(inner);
      return row;
    };

    const titleIn = document.createElement('input');
    titleIn.type = 'text';
    titleIn.className = 'devtools-input';
    titleIn.value = t('devtools.t11');
    titleIn.disabled = !isApp;

    const bodyIn = document.createElement('textarea');
    bodyIn.className = 'devtools-textarea';
    bodyIn.rows = 3;
    bodyIn.value = t('devtools.t12') + new Date().toLocaleString();
    bodyIn.disabled = !isApp;

    const soundSel = document.createElement('select');
    soundSel.className = 'devtools-select';
    soundSel.disabled = !isApp;
    (
      [
        ['silent', t('devtools.t13')],
        ['Default', t('devtools.t14')],
        ['IM', 'IM'],
        ['Mail', 'Mail'],
        ['SMS', 'SMS'],
        ['Reminder', 'Reminder'],
        ['Alarm', 'Alarm'],
        ['Call', 'Call']
      ] as const
    ).forEach(function (opt) {
      const o = document.createElement('option');
      o.value = opt[0];
      o.textContent = opt[1];
      soundSel.appendChild(o);
    });
    soundSel.value = 'Default';

    const imageIn = document.createElement('input');
    imageIn.type = 'text';
    imageIn.className = 'devtools-input';
    imageIn.placeholder = 'image_path (선택) 예: C:\\\\path\\\\icon.png';
    imageIn.disabled = !isApp;

    const previewLabel = document.createElement('div');
    previewLabel.className = 'devtools-preview-label';
    previewLabel.textContent = t('devtools.t15');

    const preview = document.createElement('pre');
    preview.className = 'devtools-preview';
    preview.setAttribute('aria-label', t('devtools.t16'));

    const syncPreview = function (): void {
      preview.textContent = JSON.stringify(buildNotifyPayload(titleIn, bodyIn, soundSel, imageIn), null, 2);
    };

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = t('devtools.t17');
    btn.disabled = !isApp;

    const status = document.createElement('div');
    status.className = 'devtools-log';
    status.textContent = isApp ? t('devtools.t18') : t('devtools.t19');

    [titleIn, bodyIn, soundSel, imageIn].forEach(function (el) {
      el.addEventListener('input', syncPreview);
      el.addEventListener('change', syncPreview);
    });

    btn.addEventListener('click', function () {
      syncPreview();
      const payload = buildNotifyPayload(titleIn, bodyIn, soundSel, imageIn);
      if (typeof window.__karmolabSetNotifyInvokeDebug === 'function') {
        window.__karmolabSetNotifyInvokeDebug(payload);
      }
      status.className = 'devtools-log';
      status.textContent = '요청 중…\n\n' + JSON.stringify(payload, null, 2);
      void tauriInvoke('desktop_notify', payload)
        .then(function () {
          status.className = 'devtools-log devtools-log-ok';
          status.textContent = 'invoke 성공.\n\n전송 페이로드:\n' + JSON.stringify(payload, null, 2);
        })
        .catch(function (e: unknown) {
          status.className = 'devtools-log devtools-log-err';
          const errMsg = e instanceof Error ? e.message : String(e);
          status.textContent = errMsg + '\n\n전송 시도 페이로드:\n' + JSON.stringify(payload, null, 2);
          Toolbox.showToast?.(t('devtools.t20'), 'error', e);
        });
    });

    sec.appendChild(mkField('title', titleIn));
    sec.appendChild(mkField('body', bodyIn));
    sec.appendChild(mkField('sound', soundSel));
    sec.appendChild(mkField('image_path', imageIn));
    sec.appendChild(previewLabel);
    sec.appendChild(preview);
    sec.appendChild(btn);
    sec.appendChild(status);
    wrap.appendChild(sec);

    syncPreview();
  }

  function buildReleaseSection(wrap: HTMLElement): void {
    const sec = document.createElement('section');
    sec.className = 'devtools-section';

    const h = document.createElement('h3');
    h.className = 'devtools-section-title';
    h.textContent = t('devtools.t21');

    const p = document.createElement('p');
    const isApp = typeof Toolbox.isDesktopApp === 'function' && Toolbox.isDesktopApp();
    const currentVersion = isApp ? window.__KARMOLAB_VERSION__ || '?' : '-';
    p.className = 'devtools-section-desc';
    p.innerHTML = isApp
      ? t('devtools.releaseNote', { version: currentVersion })
      : t('devtools.t10');

    const row = document.createElement('div');
    row.className = 'devtools-field';

    const lab = document.createElement('label');
    lab.className = 'devtools-field-label';
    lab.textContent = 'ref (branch/tag)';

    const refIn = document.createElement('input');
    refIn.type = 'text';
    refIn.className = 'devtools-input';
    refIn.value = 'master';
    refIn.placeholder = 'master';
    refIn.disabled = !isApp;

    const bumpRow = document.createElement('div');
    bumpRow.className = 'devtools-field';
    const bumpLab = document.createElement('label');
    bumpLab.className = 'devtools-field-label';
    bumpLab.textContent = 'version bump';
    const bumpSel = document.createElement('select');
    bumpSel.className = 'devtools-select';
    bumpSel.disabled = !isApp;

    const verParts = (isApp ? currentVersion.split('.').map((n) => parseInt(n, 10)) : []);
    const [maj, min, pat] = [verParts[0], verParts[1], verParts[2]];
    const valid = Number.isFinite(maj) && Number.isFinite(min) && Number.isFinite(pat);
    const preview = (label: string, next: string): string =>
      valid ? t('devtools.bumpLabel', { label, from: currentVersion, to: next }) : label;
    const opts: ReadonlyArray<readonly [string, string]> = [
      ['patch', preview('patch', `${maj}.${min}.${pat + 1}`)],
      ['minor', preview('minor', `${maj}.${min + 1}.0`)],
      ['major', preview('major', `${maj + 1}.0.0`)],
      ['none', t('devtools.t22')]
    ];
    opts.forEach(function (opt) {
      const o = document.createElement('option');
      o.value = opt[0];
      o.textContent = opt[1];
      bumpSel.appendChild(o);
    });
    bumpSel.value = 'patch';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = t('devtools.t23');
    btn.disabled = !isApp;

    const status = document.createElement('div');
    status.className = 'devtools-log';
    status.textContent = isApp
      ? t('devtools.t24')
      : t('devtools.t19');

    btn.addEventListener('click', function () {
      const selectedRef = (refIn.value || '').trim() || 'master';
      const selectedBump = bumpSel.value || 'patch';
      status.className = 'devtools-log';
      status.textContent = t('devtools.requesting', { ref: selectedRef, bump: selectedBump });
      void tauriInvoke('desktop_trigger_release_workflow', {
        refName: selectedRef,
        bumpType: selectedBump
      })
        .then(function (res: unknown) {
          status.className = 'devtools-log devtools-log-ok';
          status.textContent = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
        })
        .catch(function (e: unknown) {
          status.className = 'devtools-log devtools-log-err';
          const errMsg = e instanceof Error ? e.message : String(e);
          status.textContent = errMsg;
          Toolbox.showToast?.(t('devtools.t25'), 'error', e);
        });
    });

    row.appendChild(lab);
    row.appendChild(refIn);
    bumpRow.appendChild(bumpLab);
    bumpRow.appendChild(bumpSel);
    sec.appendChild(h);
    sec.appendChild(p);
    sec.appendChild(row);
    sec.appendChild(bumpRow);
    sec.appendChild(btn);
    sec.appendChild(status);
    wrap.appendChild(sec);
  }

  function build(container: HTMLElement): void {
    Mdd.injectCSS(
      'devtools',
      `
            .devtools-root { max-width: 560px; }
            .devtools-intro { font-size: var(--font-size-sm); color: var(--text-tertiary); margin: 0 0 20px 0; line-height: 1.5; }
            .devtools-section { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
            .devtools-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
            .devtools-section-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 8px 0; }
            .devtools-section-desc { font-size: var(--font-size-sm); color: var(--text-secondary); line-height: 1.55; margin: 0 0 12px 0; }
            .devtools-field { margin-bottom: 12px; }
            .devtools-field-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
            .devtools-input, .devtools-textarea, .devtools-select {
                width: 100%; max-width: 520px; box-sizing: border-box;
                padding: 8px 10px; border-radius: var(--radius-md);
                border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary);
                font-size: var(--font-size-sm); font-family: inherit;
            }
            .devtools-textarea { resize: vertical; min-height: 72px; }
            .devtools-preview-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin: 16px 0 6px 0; }
            .devtools-preview {
                margin: 0 0 12px 0; padding: 12px 14px; border-radius: var(--radius-md);
                background: var(--bg-tertiary); border: 1px solid var(--border);
                font-size: var(--font-size-xs); font-family: ui-monospace, monospace;
                color: var(--text-secondary); white-space: pre-wrap; word-break: break-word;
                max-width: 560px; max-height: 220px; overflow: auto;
            }
            .devtools-log { margin-top: 12px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--bg-tertiary); border: 1px solid var(--border); font-size: var(--font-size-xs); font-family: ui-monospace, monospace; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; min-height: 2.5em; }
            .devtools-log-ok { border-color: var(--success-subtle, rgba(34,197,94,0.35)); color: var(--text-primary); }
            .devtools-log-err { border-color: var(--error-subtle); color: var(--error); }
        `
    );

    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'devtools-root';

    const intro = document.createElement('p');
    intro.className = 'devtools-intro';
    intro.textContent = t('devtools.t26');

    root.appendChild(intro);
    buildReleaseSection(root);
    buildNotifySection(root);
    container.appendChild(root);
  }

  /* 메타는 `widgets-lazy-meta.ts` 한 곳에 산다. */
  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('devtools'),
    tabs: [
      {
        id: 'devtools-main',
        label: t('devtools.tab.panel', undefined, '패널'),
        /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 이 안에서 만들어진다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('devtools').then(function () {
            build(container);
          });
        }
      }
    ]
  });
})();
