import { t, loadNamespace } from '../lib/i18n';
import { parseDer, readPem, show, toPem } from '../core/pem';
import { readChain } from '../core/certview';
import { markLive } from './tools/shared/say';

(function() {
    async function loadFromTxt(): Promise<void> {
        try {
            // 시각을 붙이지 않는다. 저장소에 담긴 파일이라 우리가 바꿀 때만 바뀐다 (KL-088)
            const res = await fetch('/apps/karmolab/data/crypto-sample.txt');
            if (!res.ok) throw new Error(t('crypto.err.01'));
            (document.getElementById('cryptoInput') as HTMLTextAreaElement).value = (await res.text()).trim();
            Toolbox.showToast!(t('crypto.t02'));
        } catch (e) { Toolbox.showToast!((e as Error).message, 'error'); }
    }
    window.loadFromTxt = loadFromTxt;

    function toggleCryptoFields(): void {
        const method = (document.getElementById('cryptoMethod') as HTMLInputElement).value;
        const mode = (document.getElementById('cryptoMode') as HTMLInputElement).value;
        const aesFields = document.getElementById('cryptoAesFields');
        const execBtn = document.getElementById('cryptoExecBtn');
        const inputEl = document.getElementById('cryptoInput') as HTMLTextAreaElement | null;

        if (aesFields) aesFields.style.display = method === 'aes' ? '' : 'none';
        if (execBtn) execBtn.textContent = mode === 'encrypt' ? t('crypto.t03') : t('crypto.t04');
        if (inputEl) {
            inputEl.placeholder = mode === 'encrypt'
                ? t('crypto.t05')
                : t('crypto.t06');
        }
    }
    window.toggleCryptoFields = toggleCryptoFields;

    function swapResultToInput(): void {
        const resultContent = document.getElementById('cryptoResultContent');
        const inputEl = document.getElementById('cryptoInput') as HTMLTextAreaElement | null;
        const hiddenMode = document.getElementById('cryptoMode') as HTMLInputElement | null;
        const modeBtns = document.querySelectorAll<HTMLElement>('.crypto-mode-btn');
        if (!resultContent || !inputEl) return;
        const text = resultContent.textContent?.trim();
        if (!text) { Toolbox.showToast!(t('crypto.t07'), 'error'); return; }
        inputEl.value = text;
        const nextMode = hiddenMode?.value === 'encrypt' ? 'decrypt' : 'encrypt';
        if (hiddenMode) hiddenMode.value = nextMode;
        modeBtns.forEach(b => { b.classList.toggle('active', b.dataset.mode === nextMode); });
        toggleCryptoFields();
        Toolbox.showToast!(t('crypto.t08'));
    }
    window.swapResultToInput = swapResultToInput;

    function doEncrypt(text: string, method: string): void {
        if (method === 'base64') {
            try {
                const encoded = btoa(unescape(encodeURIComponent(text)));
                Toolbox.displayResult!('crypto', t('crypto.t09'), encoded, null);
                Toolbox.showToast!(t('crypto.t10'));
            } catch (e) {
                Toolbox.displayResult!('crypto', t('crypto.t11'), t('crypto.t12') + (e as Error).message, null, true);
                Toolbox.showToast!(t('crypto.t13'), 'error');
            }
            return;
        }

        if (method === 'url') {
            try {
                const encoded = encodeURIComponent(text);
                Toolbox.displayResult!('crypto', t('crypto.t09'), encoded, null);
                Toolbox.showToast!(t('crypto.t10'));
            } catch (e) {
                Toolbox.displayResult!('crypto', t('crypto.t11'), t('crypto.t12') + (e as Error).message, null, true);
                Toolbox.showToast!(t('crypto.t13'), 'error');
            }
            return;
        }

        if (!CryptoJS) { Toolbox.showToast!(t('crypto.t14'), 'error'); return; }
        const pass = (document.getElementById('cryptoPass') as HTMLInputElement).value;
        const iterSlider = document.getElementById('cryptoIterSlider') as HTMLInputElement | null;
        const iterations = parseInt(iterSlider?.value || '10000', 10);
        /* ★ **왜 아무 일도 안 났는지 화면에 남긴다** (2026-08-13). 비밀번호가 비면 잠깐 뜨는
           알림만 띄우고 끝냈다. 알림은 사라지고, 사람 눈에는 눌렀는데 아무 반응이 없다로
           남는다(라이브 검사도 그렇게 읽었다). 결과 자리에 이유를 적어 둔다. */
        if (!pass) {
          Toolbox.displayResult!('crypto', t('crypto.t11'), t('crypto.t15'), null, true);
          Toolbox.showToast!(t('crypto.t15'), 'error');
          return;
        }

        const t0 = performance.now();
        try {
            const salt = CryptoJS.lib.WordArray.random(16) as { toString: (e: unknown) => string };
            const iv = CryptoJS.lib.WordArray.random(16) as { toString: (e: unknown) => string };
            const key = CryptoJS.PBKDF2(pass, salt, { keySize: 256 / 32, iterations, hasher: CryptoJS.algo.SHA256 });
            const encrypted = CryptoJS.AES.encrypt(text, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });

            const hex = salt.toString(CryptoJS.enc.Hex) + iv.toString(CryptoJS.enc.Hex) + iterations.toString(16).padStart(8, '0') + encrypted.ciphertext.toString(CryptoJS.enc.Hex);
            const result = CryptoJS.enc.Hex.parse(hex).toString(CryptoJS.enc.Base64);

            Toolbox.displayResult!('crypto', t('crypto.t16'), result, (performance.now() - t0) / 1000);
            Toolbox.showToast!(t('crypto.t17'));
        } catch (e) {
            Toolbox.displayResult!('crypto', t('crypto.t11'), t('crypto.t18') + (e as Error).message, null, true);
            Toolbox.showToast!(t('crypto.t19'), 'error');
        }
    }

    function doDecrypt(input: string, method: string): void {
        if (method === 'base64') {
            try {
                const decoded = decodeURIComponent(escape(atob(input.trim())));
                Toolbox.displayResult!('crypto', t('crypto.t20'), decoded, null);
                Toolbox.showToast!(t('crypto.t21'));
            } catch (e) {
                Toolbox.displayResult!('crypto', t('crypto.t11'), t('crypto.t22'), null, true);
                Toolbox.showToast!(t('crypto.t23'), 'error');
            }
            return;
        }

        if (method === 'url') {
            try {
                const decoded = decodeURIComponent(input.trim().replace(/\+/g, '%20'));
                Toolbox.displayResult!('crypto', t('crypto.t20'), decoded, null);
                Toolbox.showToast!(t('crypto.t21'));
            } catch (e) {
                Toolbox.displayResult!('crypto', t('crypto.t11'), t('crypto.t24'), null, true);
                Toolbox.showToast!(t('crypto.t23'), 'error');
            }
            return;
        }

        if (!CryptoJS) { Toolbox.showToast!(t('crypto.t14'), 'error'); return; }
        const pass = (document.getElementById('cryptoPass') as HTMLInputElement).value;
        /* 푸는 쪽도 같다. 알림만 띄우고 끝내면 눌러도 아무 반응 없음으로 남는다. */
        if (!pass) {
          Toolbox.displayResult!('crypto', t('crypto.t11'), t('crypto.t15'), null, true);
          Toolbox.showToast!(t('crypto.t15'), 'error');
          return;
        }

        const t0 = performance.now();
        try {
            const hex = CryptoJS.enc.Base64.parse(input).toString(CryptoJS.enc.Hex);
            if (hex.length < 72) throw new Error(t('crypto.err.25'));

            const salt = CryptoJS.enc.Hex.parse(hex.substring(0, 32));
            const iv = CryptoJS.enc.Hex.parse(hex.substring(32, 64));
            const iterations = parseInt(hex.substring(64, 72), 16);
            const ciphertext = CryptoJS.enc.Hex.parse(hex.substring(72));

            if (isNaN(iterations) || iterations <= 0 || iterations > 1000000) throw new Error(t('crypto.err.26'));

            const key = CryptoJS.PBKDF2(pass, salt, { keySize: 256 / 32, iterations, hasher: CryptoJS.algo.SHA256 });
            const decrypted = CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext }), key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
            const result = decrypted.toString(CryptoJS.enc.Utf8);

            if (!result) throw new Error(t('crypto.err.27'));

            Toolbox.displayResult!('crypto', `복호화 완료, iterations: ${iterations.toLocaleString()}`, result, (performance.now() - t0) / 1000);
            Toolbox.showToast!(t('crypto.t28'));
        } catch (e) {
            Toolbox.displayResult!('crypto', t('crypto.t11'), t('crypto.t29') + (e as Error).message, null, true);
            Toolbox.showToast!(t('crypto.t30'), 'error');
        }
    }

    function doCrypto(): void {
        const mode = (document.getElementById('cryptoMode') as HTMLInputElement).value;
        const method = (document.getElementById('cryptoMethod') as HTMLInputElement).value;
        const text = (document.getElementById('cryptoInput') as HTMLTextAreaElement).value;

        if (!text) {
            Toolbox.showToast!(mode === 'encrypt' ? t('crypto.t31') : t('crypto.t32'), 'error');
            return;
        }

        if (mode === 'encrypt') {
            doEncrypt(text, method);
        } else {
            doDecrypt(text, method);
        }
    }
    window.doCrypto = doCrypto;

    const lazyMeta = Toolbox.getLazyWidgetPublicMeta!('crypto') as Record<string, unknown>;
    Toolbox.register({
        ...(lazyMeta as { id: string; title: string }),
        tabs: [
            {
                id: 'crypto',
                label: t('crypto.t33', undefined, "암호화 / 복호화"),
                build(c: HTMLElement) {
                    /* ★ **말 묶음을 먼저 받는다** (2026-08-13). 이 파일은 `loadNamespace` 를
                       들여오기만 하고 **한 번도 부르지 않았다**. `t()` 는 묶음이 없고 되받을 글도
                       없으면 **던진다**. 그래서 화면 짓기가 첫 줄에서 통째로 엎어졌고,
                       실사이트에서 암호화를 눌러도 세 방식 모두 아무 일도 안 일어났다
                       (오류도 안 떴다. 던진 자리가 만들기 단계라 조용했다). 실측: 라이브 점검이
                       `MissingTranslationError: [i18n ...]` 로 잡았고, 이 도구는 그 상태로 살아 있었다. */
                    void loadNamespace('crypto').then(function () {

                    Mdd.linePreset('meme_done', { msg: t('crypto.t34') });

                    const modeGroup = document.createElement('div');
                    modeGroup.className = 'field-group';
                    modeGroup.innerHTML = `<label class="field-label" for="cvIn">${t('crypto.label.mode')}</label>`;
                    const modeWrap = document.createElement('div');
                    modeWrap.className = 'crypto-mode-btns';
                    modeWrap.style.display = 'flex'; modeWrap.style.gap = '8px';
                    const encBtn = document.createElement('button');
                    encBtn.type = 'button'; encBtn.className = 'btn crypto-mode-btn active';
                    encBtn.textContent = t('crypto.t03'); encBtn.dataset.mode = 'encrypt';
                    const decBtn = document.createElement('button');
                    decBtn.type = 'button'; decBtn.className = 'btn crypto-mode-btn';
                    decBtn.textContent = t('crypto.t04'); decBtn.dataset.mode = 'decrypt';
                    const hiddenMode = document.createElement('input');
                    hiddenMode.type = 'hidden'; hiddenMode.id = 'cryptoMode'; hiddenMode.value = 'encrypt';
                    [encBtn, decBtn].forEach(btn => {
                        btn.onclick = function() {
                            modeWrap.querySelectorAll<HTMLElement>('.crypto-mode-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            hiddenMode.value = btn.dataset.mode!;
                            toggleCryptoFields();
                        };
                        modeWrap.appendChild(btn);
                    });
                    modeGroup.appendChild(modeWrap);
                    modeGroup.appendChild(hiddenMode);
                    c.appendChild(modeGroup);

                    Mdd.injectCSS('crypto-mode', '.crypto-mode-btn { background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-secondary); }.crypto-mode-btn:hover { background:var(--bg-hover); color:var(--text-primary); }.crypto-mode-btn.active { background:var(--fill-strong); color:var(--fill-strong-ink); border-color:var(--fill-strong); }');

                    const methodGroup = document.createElement('div');
                    methodGroup.className = 'field-group';
                    methodGroup.innerHTML = `<label class="field-label">${t('crypto.label.method')}</label>`;
                    const methodWrap = document.createElement('div');
                    methodWrap.className = 'crypto-method-btns';
                    methodWrap.style.display = 'flex'; methodWrap.style.gap = '8px'; methodWrap.style.flexWrap = 'wrap';
                    const methods = [
                        { value: 'base64', label: 'Base64' },
                        { value: 'aes', label: 'AES-256' },
                        { value: 'url', label: 'URL' },
                    ];
                    const hiddenMethod = document.createElement('input');
                    hiddenMethod.type = 'hidden'; hiddenMethod.id = 'cryptoMethod'; hiddenMethod.value = 'base64';
                    methods.forEach((m, i) => {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'btn crypto-mode-btn crypto-method-btn' + (i === 0 ? ' active' : '');
                        btn.textContent = m.label;
                        btn.dataset.method = m.value;
                        btn.onclick = function() {
                            methodWrap.querySelectorAll<HTMLElement>('.crypto-method-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            hiddenMethod.value = btn.dataset.method!;
                            toggleCryptoFields();
                        };
                        methodWrap.appendChild(btn);
                    });
                    methodGroup.appendChild(methodWrap);
                    methodGroup.appendChild(hiddenMethod);
                    c.appendChild(methodGroup);

                    const loadBtn = document.createElement('button');
                    loadBtn.className = 'btn btn-ghost'; loadBtn.textContent = t('crypto.t37');
                    loadBtn.onclick = function () { window.loadFromTxt!(); };

                    Toolbox.field!(c, {
                        id: 'cryptoInput', label: t('crypto.t38'),
                        placeholder: t('crypto.t39'),
                        type: undefined,
                        topRight: loadBtn, mono: true
                    });

                    const passGroup = document.createElement('div');
                    passGroup.id = 'cryptoAesFields';
                    Toolbox.field!(passGroup, { tag: 'input', id: 'cryptoPass', label: t('crypto.t40'), placeholder: t('crypto.t41'), type: 'password', topRight: undefined, mono: false });

                    const trigger = document.createElement('button');
                    trigger.className = 'collapsible-trigger';
                    trigger.innerHTML = `<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>${t('crypto.label.advanced')}`;
                    trigger.onclick = function () { Toolbox.toggleCollapsible!(trigger); };
                    passGroup.appendChild(trigger);

                    const body = document.createElement('div');
                    body.className = 'collapsible-body';
                    body.innerHTML = `<div class="field-group"><div class="field-row"><label class="field-label" style="margin-bottom:0">${t('crypto.label.iterations')}</label><span class="range-value" id="cryptoIterVal">10,000</span></div><input type="range" id="cryptoIterSlider" min="1000" max="100000" step="1000" value="10000"></div>`;
                    passGroup.appendChild(body);
                    c.appendChild(passGroup);

                    const btnRow = document.createElement('div');
                    btnRow.className = 'field-group';
                    btnRow.style.display = 'flex'; btnRow.style.gap = '8px'; btnRow.style.flexWrap = 'wrap';
                    const execBtn = document.createElement('button');
                    execBtn.className = 'btn btn-primary';
                    execBtn.id = 'cryptoExecBtn';
                    execBtn.textContent = t('crypto.t44');
                    execBtn.onclick = function () { window.doCrypto!(); };
                    btnRow.appendChild(execBtn);
                    const swapBtn = document.createElement('button');
                    swapBtn.className = 'btn btn-ghost';
                    swapBtn.textContent = t('crypto.t45');
                    swapBtn.onclick = function () { window.swapResultToInput!(); };
                    btnRow.appendChild(swapBtn);
                    c.appendChild(btnRow);

                    Toolbox.resultBox!(c, 'crypto');

                    requestAnimationFrame(() => {
                        window.toggleCryptoFields!();
                        const slider = document.getElementById('cryptoIterSlider') as HTMLInputElement | null;
                        if (slider) slider.oninput = function () { (document.getElementById('cryptoIterVal') as HTMLElement).textContent = Number(slider.value).toLocaleString(); };
                    });

                    });
                }
            },
            {
                /*
                 * 열쇠 다루기 (TASK-KL-316 / 22). 새 도구가 아니라 **이 도구의 탭**인 이유:
                 * 사람은 암호화를 찾아 여기 오고, 열쇠는 그 옆에 있어야 한다.
                 * 만드는 일은 브라우저의 WebCrypto 가 한다. 우리가 난수를 만들지 않는다.
                 * 읽는 일은 `core/pem` (인증서 도구와 **같은 것**을 쓴다).
                 */
                id: 'keys',
                label: t('crypto.keys.tab', undefined, '열쇠'),
                build(c: HTMLElement) {
                    void loadNamespace('crypto').then(function () {
                        drawKeys(c);
                    });
                }
            },
            {
                /*
                 * 인증서 보기 (TASK-KL-316 / 23). 같은 위젯의 탭인 이유: 열쇠, 인증서, CSR 은
                 * **같은 봉투(PEM)** 에 담겨 오고, 사람은 그걸 가른 뒤에야 어느 도구인지 안다.
                 * 여기서는 누구 것, 언제까지, 어떤 이름들만 앞에 세운다. 나머지는 열쇠 탭의 나무로.
                 */
                id: 'cert',
                label: t('crypto.cert.tab', undefined, '인증서'),
                build(c: HTMLElement) {
                    void loadNamespace('crypto').then(function () {
                        drawCert(c);
                    });
                }
            }
        ]
    });

    function drawCert(c: HTMLElement): void {
        c.innerHTML = `
            <div class="field-group">
              <label class="field-label" for="cvIn">${esc(t('crypto.cert.label.in'))}</label>
              <textarea id="cvIn" name="pem" aria-label="${esc(t('crypto.cert.label.in'))}" class="mono-input" style="min-height:150px;" placeholder="-----BEGIN CERTIFICATE-----"></textarea>
            </div>
            <div id="cvCards"></div>
            <div class="tool-status" id="cvStatus">${esc(t('crypto.cert.status.idle'))}</div>
            <p style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('crypto.cert.note.local'))}</p>
        `;

        const q = <T extends HTMLElement>(s: string): T => c.querySelector(s) as T;
        const status = q<HTMLElement>('#cvStatus');
        markLive(status);

        q<HTMLTextAreaElement>('#cvIn').addEventListener('input', (): void => {
            const text = q<HTMLTextAreaElement>('#cvIn').value;
            if (text.trim() === '') {
                q<HTMLElement>('#cvCards').innerHTML = '';
                status.textContent = t('crypto.cert.status.idle');
                return;
            }
            try {
                const chain = readChain(text);
                q<HTMLElement>('#cvCards').innerHTML = chain.certs
                    .map((cert, i) => {
                        const rows: string[] = [];
                        const row = (k: string, v: string): string =>
                            '<div class="tool-list-row"><span class="tool-list-key">' + esc(k) + '</span><span class="tool-list-val">' + esc(v) + '</span></div>';
                        rows.push(row(t('crypto.cert.row.subject'), cert.subject === '' ? '. ' : cert.subject));
                        if (cert.issuer !== '') rows.push(row(t('crypto.cert.row.issuer'), cert.issuer + (cert.selfSigned ? ' , ' + t('crypto.cert.selfSigned') : '')));
                        if (cert.notAfter !== undefined) {
                            const left = i === 0 && chain.daysLeft !== undefined ? ' , ' + t(chain.daysLeft < 0 ? 'crypto.cert.expired' : 'crypto.cert.daysLeft', { n: Math.abs(chain.daysLeft) }) : '';
                            rows.push(row(t('crypto.cert.row.until'), String(cert.notAfter) + left));
                        }
                        if (cert.names.length > 0) rows.push(row(t('crypto.cert.row.names'), cert.names.join(', ')));
                        rows.push(row(t('crypto.cert.row.key'), (cert.keyAlgorithm ?? '?') + ' ,  ' + (cert.signatureAlgorithm ?? '?')));
                        if (cert.isCa === true) rows.push(row(t('crypto.cert.row.ca'), t('crypto.cert.isCa')));
                        return '<div class="tool-list" style="margin-bottom:12px;">' + rows.join('') + '</div>';
                    })
                    .join('');
                status.textContent =
                    chain.certs.length === 1
                        ? t('crypto.cert.status.one')
                        : t(chain.linked ? 'crypto.cert.status.chain' : 'crypto.cert.status.broken', { n: chain.certs.length });
            } catch (e) {
                q<HTMLElement>('#cvCards').innerHTML = '';
                status.textContent = t('crypto.cert.status.failed', { msg: String((e as Error).message) });
            }
        });
    }

    function esc(v: string): string {
        return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function drawKeys(c: HTMLElement): void {
        c.innerHTML = `
            <div class="field-group" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
              <div>
                <label class="field-label" for="ckKind">${esc(t('crypto.keys.label.kind'))}</label>
                <select id="ckKind" name="kind" aria-label="${esc(t('crypto.keys.label.kind'))}">
                  <option value="RSA-2048">RSA 2048</option>
                  <option value="RSA-4096">RSA 4096</option>
                  <option value="EC-P-256">EC P-256</option>
                  <option value="EC-P-384">EC P-384</option>
                </select>
              </div>
              <button class="btn btn-primary" id="ckMake">${esc(t('crypto.keys.btn.make'))}</button>
              <button class="btn btn-ghost" id="ckCopyPub">${esc(t('crypto.keys.btn.copyPub'))}</button>
            </div>
            <div class="tool-grid-2">
              <div>
                <div class="tool-sublabel">${esc(t('crypto.keys.label.private'))}</div>
                <textarea id="ckPriv" name="private" aria-label="${esc(t('crypto.keys.label.private'))}" class="mono-input" readonly style="min-height:180px;"></textarea>
              </div>
              <div>
                <div class="tool-sublabel">${esc(t('crypto.keys.label.public'))}</div>
                <textarea id="ckPub" name="public" aria-label="${esc(t('crypto.keys.label.public'))}" class="mono-input" readonly style="min-height:180px;"></textarea>
              </div>
            </div>
            <div class="field-group" style="margin-top:12px;">
              <label class="field-label" for="ckLook">${esc(t('crypto.keys.label.look'))}</label>
              <textarea id="ckLook" name="pem" aria-label="${esc(t('crypto.keys.label.look'))}" class="mono-input" style="min-height:120px;" placeholder="-----BEGIN PUBLIC KEY-----"></textarea>
            </div>
            <pre id="ckTree" class="mono-input" style="white-space:pre-wrap; padding:10px; margin:0; min-height:120px; overflow:auto;"></pre>
            <div class="tool-status" id="ckStatus">${esc(t('crypto.keys.status.idle'))}</div>
            <p style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('crypto.keys.note.local'))}</p>
        `;

        const q = <T extends HTMLElement>(s: string): T => c.querySelector(s) as T;
        const status = q<HTMLElement>('#ckStatus');
        markLive(status);

        q<HTMLButtonElement>('#ckMake').onclick = async (): Promise<void> => {
            const kind = q<HTMLSelectElement>('#ckKind').value;
            status.textContent = t('crypto.keys.status.making');
            try {
                const algorithm: RsaHashedKeyGenParams | EcKeyGenParams = kind.startsWith('RSA')
                    ? {
                          name: 'RSASSA-PKCS1-v1_5',
                          modulusLength: Number(kind.split('-')[1]),
                          publicExponent: new Uint8Array([1, 0, 1]),
                          hash: 'SHA-256'
                      }
                    : { name: 'ECDSA', namedCurve: kind.replace('EC-', '') };
                const pair = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
                const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
                const pub = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
                q<HTMLTextAreaElement>('#ckPriv').value = toPem('PRIVATE KEY', priv);
                q<HTMLTextAreaElement>('#ckPub').value = toPem('PUBLIC KEY', pub);
                status.textContent = t('crypto.keys.status.made', { kind });
            } catch (e) {
                status.textContent = t('crypto.keys.status.failed', { msg: String((e as Error).message) });
            }
        };

        q<HTMLButtonElement>('#ckCopyPub').onclick = async (): Promise<void> => {
            const pub = q<HTMLTextAreaElement>('#ckPub').value;
            if (pub === '') return;
            await Toolbox.copyText?.(pub, { message: t('crypto.keys.copied') });
        };

        q<HTMLTextAreaElement>('#ckLook').addEventListener('input', (): void => {
            const text = q<HTMLTextAreaElement>('#ckLook').value;
            if (text.trim() === '') {
                q<HTMLElement>('#ckTree').textContent = '';
                status.textContent = t('crypto.keys.status.idle');
                return;
            }
            try {
                const blocks = readPem(text);
                if (blocks.length === 0) throw new Error(t('crypto.keys.err.noPem'));
                q<HTMLElement>('#ckTree').textContent = blocks
                    .map((b) => b.label + ' (' + b.der.length + ' bytes)\n' + show(parseDer(b.der)))
                    .join('\n\n');
                status.textContent = t('crypto.keys.status.read', { n: blocks.length, label: blocks[0].label });
            } catch (e) {
                q<HTMLElement>('#ckTree').textContent = '';
                status.textContent = t('crypto.keys.status.failed', { msg: String((e as Error).message) });
            }
        });
    }

    window.toggleCryptoFields = toggleCryptoFields;
    window.swapResultToInput = swapResultToInput;
    window.doCrypto = doCrypto;
    window.loadFromTxt = loadFromTxt;
})();
