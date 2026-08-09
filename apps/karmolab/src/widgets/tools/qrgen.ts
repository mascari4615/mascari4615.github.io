/**
 * QR 코드 생성기 (TASK-KL-088) — 텍스트·URL·WiFi·연락처를 QR 로. PNG/SVG 다운로드.
 * qrcode-generator 를 번들해 오프라인에서도 동작 (외부 API 호출 0 = 입력 데이터가 밖으로 안 나감).
 */
import qrcode from 'qrcode-generator';
import { escapeWifi, type Level, makeGrid, spec, toSvg } from '../../core/qrgen';
import { readInvocation } from '../../lib/tool-url';

import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {

  /* WiFi·vCard 문법 이스케이프와 SVG 만들기는 `src/core/qrgen.ts` 가 소유한다 —
     비밀번호에 `;` 하나로 QR 이 조용히 다른 뜻이 되는 자리라 시험이 거기 붙어 있다 (TASK-KL-205). */

  Toolbox.register({
    id: 'qrgen',
    title: t('widgets.qrgen.title', undefined, 'QR 코드 생성'),
    category: 'tool',
    desc: t(
      'widgets-desc.qrgen.desc',
      undefined,
      'URL·텍스트·WiFi·연락처를 QR 코드로 만들고 PNG/SVG 로 저장합니다. 서버 전송 없이 브라우저에서 생성'
    ),
    layout: 'form',
    icon: '<rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: 'QR',
        build: function (container: HTMLElement): void {
          void loadNamespace('qrgen').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          Mdd.linePreset('tool_run', { msg: t('qrgen.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('qrgen.label.kind'))}</label>
              <select id="qrKind" aria-label="만들 종류">
                <option value="text">${esc(t('qrgen.kind.text'))}</option>
                <option value="wifi">${esc(t('qrgen.kind.wifi'))}</option>
                <option value="contact">${esc(t('qrgen.kind.contact'))}</option>
                <option value="sms">${esc(t('qrgen.kind.sms'))}</option>
              </select>
            </div>

            <div class="field-group" id="qrPanelText">
              <label class="field-label">${esc(t('qrgen.label.content'))}</label>
              <textarea id="qrText" placeholder="https://blog.mascari4615.com/karmolab/" style="min-height:90px;"></textarea>
            </div>

            <div class="field-group" id="qrPanelWifi" style="display:none;">
              <label class="field-label">${esc(t('qrgen.label.wifi'))}</label>
              <div class="tool-grid-2">
                <input type="text" id="qrWifiSsid" placeholder="${esc(t('qrgen.ph.ssid'))}">
                <input type="text" id="qrWifiPass" placeholder="${esc(t('qrgen.ph.pass'))}">
              </div>
              <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
                <select id="qrWifiEnc" style="flex:1;" aria-label="${esc(t('qrgen.label.security'))}">
                  <option value="WPA">WPA / WPA2</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">${esc(t('qrgen.enc.nopass'))}</option>
                </select>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary); white-space:nowrap;">
                  <input type="checkbox" id="qrWifiHidden" style="width:auto;"> ${esc(t('qrgen.opt.hidden'))}
                </label>
              </div>
            </div>

            <div class="field-group" id="qrPanelContact" style="display:none;">
              <label class="field-label">${esc(t('qrgen.label.contact'))}</label>
              <div class="tool-grid-2">
                <input type="text" id="qrCName" placeholder="${esc(t('qrgen.ph.name'))}">
                <input type="text" id="qrCTel" placeholder="${esc(t('qrgen.ph.tel'))}">
                <input type="text" id="qrCEmail" placeholder="${esc(t('qrgen.ph.email'))}">
                <input type="text" id="qrCOrg" placeholder="${esc(t('qrgen.ph.org'))}">
              </div>
            </div>

            <div class="field-group" id="qrPanelSms" style="display:none;">
              <label class="field-label">${esc(t('qrgen.label.sms'))}</label>
              <div class="tool-grid-2">
                <input type="text" id="qrSmsTel" placeholder="${esc(t('qrgen.ph.smsTo'))}">
                <input type="text" id="qrSmsBody" placeholder="${esc(t('qrgen.ph.smsBody'))}">
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">${esc(t('qrgen.label.look'))}</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('qrgen.label.level'))}</div>
                  <select id="qrLevel" aria-label="오류 정정 수준">
                    <option value="L">${esc(t('qrgen.level.L'))}</option>
                    <option value="M" selected>${esc(t('qrgen.level.M'))}</option>
                    <option value="Q">${esc(t('qrgen.level.Q'))}</option>
                    <option value="H">${esc(t('qrgen.level.H'))}</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('qrgen.label.size'))} <span id="qrSizeVal" class="range-value">320px</span></div>
                  <input type="range" id="qrSize" aria-label="크기 (픽셀)" min="128" max="1024" step="32" value="320">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('qrgen.label.fg'))}</div>
                  <input type="color" id="qrFg" aria-label="전경색" value="#000000" style="width:100%; height:38px; padding:2px; background:var(--bg-secondary); border:1px solid var(--border);">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('qrgen.label.bg'))}</div>
                  <input type="color" id="qrBg" aria-label="배경색" value="#ffffff" style="width:100%; height:38px; padding:2px; background:var(--bg-secondary); border:1px solid var(--border);">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('qrgen.label.logo'))}</div>
                  <input type="file" id="qrLogo" accept="image/*" aria-label="가운데 로고 이미지">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('qrgen.label.logoSize'))} <span id="qrLogoVal" class="range-value">20%</span></div>
                  <input type="range" id="qrLogoSize" aria-label="로고 크기 (%)" min="10" max="35" step="1" value="20">
                </div>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; align-items:center; gap:12px;">
              <div id="qrPreview" style="display:flex; align-items:center; justify-content:center; min-height:180px; padding:16px; background:var(--bg-tertiary); border:1px solid var(--border); width:100%; box-sizing:border-box;"></div>
              <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                <button class="btn btn-primary" id="qrPng">${esc(t('qrgen.btn.png'))}</button>
                <button class="btn btn-secondary" id="qrSvg">${esc(t('qrgen.btn.svg'))}</button>
                <button class="btn btn-ghost" id="qrCopy">${esc(t('qrgen.btn.copy'))}</button>
              </div>
              <div class="tool-status" id="qrStatus">${esc(t('qrgen.status.idle'))}</div>
              <div class="tool-status" id="qrScan">${esc(t('qrgen.status.scan'))}</div>
            </div>
          `;

          const $ = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
          const kind = $<HTMLSelectElement>('#qrKind');
          const preview = $<HTMLElement>('#qrPreview');
          const status = $<HTMLElement>('#qrStatus');
          const sizeInput = $<HTMLInputElement>('#qrSize');
          const sizeVal = $<HTMLElement>('#qrSizeVal');

          const panels: Record<string, HTMLElement> = {
            text: $('#qrPanelText'),
            wifi: $('#qrPanelWifi'),
            contact: $('#qrPanelContact'),
            sms: $('#qrPanelSms')
          };

          function payload(): string {
            const v = (sel: string): string => ($<HTMLInputElement>(sel).value || '').trim();
            switch (kind.value) {
              case 'wifi': {
                const enc = $<HTMLSelectElement>('#qrWifiEnc').value;
                const hidden = $<HTMLInputElement>('#qrWifiHidden').checked;
                if (!v('#qrWifiSsid')) return '';
                return `WIFI:T:${enc};S:${escapeWifi(v('#qrWifiSsid'))};${enc === 'nopass' ? '' : 'P:' + escapeWifi(v('#qrWifiPass')) + ';'}${hidden ? 'H:true;' : ''};`;
              }
              case 'contact': {
                if (!v('#qrCName')) return '';
                return [
                  'BEGIN:VCARD',
                  'VERSION:3.0',
                  `N:${v('#qrCName')}`,
                  `FN:${v('#qrCName')}`,
                  v('#qrCOrg') ? `ORG:${v('#qrCOrg')}` : '',
                  v('#qrCTel') ? `TEL:${v('#qrCTel')}` : '',
                  v('#qrCEmail') ? `EMAIL:${v('#qrCEmail')}` : '',
                  'END:VCARD'
                ]
                  .filter(Boolean)
                  .join('\n');
              }
              case 'sms': {
                if (!v('#qrSmsTel')) return '';
                return `SMSTO:${v('#qrSmsTel')}:${v('#qrSmsBody')}`;
              }
              default:
                return $<HTMLTextAreaElement>('#qrText').value.trim();
            }
          }

          /* 가운데 로고 — 남들(QR Tiger 등)이 앞세우는 기능이다. 다만 로고를 얹으면 그 자리 칸이
             가려져 **안 읽히는 QR** 이 되기 쉬워서, 얹은 뒤 실제로 다시 읽어 확인한다. */
          let logoImg: HTMLImageElement | null = null;
          let lastCanvas: HTMLCanvasElement | null = null;
          let lastModules = 0;

          function render(): void {
            const data = payload();
            lastCanvas = null;
            if (!data) {
              preview.innerHTML =
                `<span style="color:var(--text-tertiary); font-size:var(--font-size-sm);">${esc(t('qrgen.status.empty'))}</span>`;
              status.textContent = t('qrgen.status.idle');
              status.className = 'tool-status';
              return;
            }
            try {
              qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
              const qr = qrcode(0, $<HTMLSelectElement>('#qrLevel').value as Level);
              qr.addData(data);
              qr.make();
              const count = qr.getModuleCount();
              lastModules = count;
              const size = parseInt(sizeInput.value, 10);
              const margin = 4;
              const cell = size / (count + margin * 2);
              const canvas = document.createElement('canvas');
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext('2d');
              if (!ctx) return;
              ctx.fillStyle = $<HTMLInputElement>('#qrBg').value;
              ctx.fillRect(0, 0, size, size);
              ctx.fillStyle = $<HTMLInputElement>('#qrFg').value;
              for (let r = 0; r < count; r++) {
                for (let c = 0; c < count; c++) {
                  if (qr.isDark(r, c)) {
                    ctx.fillRect(
                      Math.round((c + margin) * cell),
                      Math.round((r + margin) * cell),
                      Math.ceil(cell),
                      Math.ceil(cell)
                    );
                  }
                }
              }
              canvas.style.maxWidth = '100%';
              canvas.style.height = 'auto';
              canvas.style.imageRendering = 'pixelated';
              preview.innerHTML = '';
              preview.appendChild(canvas);
              if (logoImg) {
                const pct = parseInt($<HTMLInputElement>('#qrLogoSize').value, 10) / 100;
                const w = size * pct;
                const x = (size - w) / 2;
                /* 로고 뒤에 배경색을 깔아 준다 — 안 깔면 코드 무늬 위에 겹쳐 더 안 읽힌다. */
                ctx.fillStyle = $<HTMLInputElement>('#qrBg').value;
                ctx.fillRect(x - w * 0.06, x - w * 0.06, w * 1.12, w * 1.12);
                ctx.drawImage(logoImg, x, x, w, w);
              }
              lastCanvas = canvas;
              status.textContent = t('qrgen.status.made', {
                n: data.length.toLocaleString(locale()),
                size: count,
                level: $<HTMLSelectElement>('#qrLevel').value
              });
              status.className = 'tool-status ok';
              void verify(canvas, data);
            } catch (e) {
              preview.innerHTML = '';
              status.textContent = t('qrgen.status.tooLong');
              status.className = 'tool-status error';
              void e;
            }
          }

          /**
           * 만든 QR 을 **다시 읽어** 본다 (남들이 안 하는 자리).
           *
           * 로고를 얹거나 색 대비를 낮추면 화면에는 멀쩡한 QR 이 그려지는데 폰으로는 안 읽힌다.
           * 인쇄해 붙이고 나서야 아는 사고가 흔하다. 여기서는 만든 그림을 그대로 해독해
           * 원래 내용과 같은지 확인한다 — 다르면 그 자리에서 말해 준다.
           *
           * 못 읽어 오는 환경이면 「확인 못 했다」고 말한다(통과로 삼지 않는다).
           */
          async function verify(canvas: HTMLCanvasElement, expected: string): Promise<void> {
            const scan = $<HTMLElement>('#qrScan');
            const say = (msg: string, kind: '' | 'ok' | 'error'): void => {
              scan.textContent = msg;
              scan.className = 'tool-status' + (kind ? ' ' + kind : '');
            };
            try {
              const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(c: HTMLCanvasElement): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
              let read: string | null = null;
              if (BD) {
                const found = await new BD({ formats: ['qr_code'] }).detect(canvas);
                read = found.length ? found[0].rawValue : null;
              } else {
                await Toolbox.ensureScript?.('vendor/jsqr.min');
                const jsQR = (window as unknown as { jsQR?: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null }).jsQR;
                if (!jsQR) { say(t('qrgen.scan.unsupported'), ''); return; }
                const c2 = canvas.getContext('2d', { willReadFrequently: true });
                if (!c2) return;
                const img = c2.getImageData(0, 0, canvas.width, canvas.height);
                const hit = jsQR(img.data, canvas.width, canvas.height);
                read = hit ? hit.data : null;
              }
              if (read === expected) say(t('qrgen.scan.ok'), 'ok');
              else if (read) say(t('qrgen.scan.mismatch'), 'error');
              else say(t('qrgen.scan.fail'), 'error');
            } catch (_) {
              say('이 브라우저에서는 확인을 못 했어요 (QR 자체는 만들어졌습니다).', '');
            }
          }

          function download(href: string, name: string): void {
            const a = document.createElement('a');
            a.href = href;
            a.download = name;
            a.click();
          }

          $<HTMLInputElement>('#qrLogo').addEventListener('change', (e: Event) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (!f) { logoImg = null; render(); return; }
            const url = URL.createObjectURL(f);
            const img = new Image();
            img.onload = () => { logoImg = img; URL.revokeObjectURL(url); render(); };
            img.onerror = () => { URL.revokeObjectURL(url); logoImg = null; render(); };
            img.src = url;
          });
          $<HTMLInputElement>('#qrLogoSize').addEventListener('input', () => {
            $<HTMLElement>('#qrLogoVal').textContent = $<HTMLInputElement>('#qrLogoSize').value + '%';
          });

          kind.addEventListener('change', () => {
            Object.keys(panels).forEach((k) => {
              panels[k].style.display = k === kind.value ? '' : 'none';
            });
            render();
          });
          container.querySelectorAll('input, select, textarea').forEach((el) => {
            el.addEventListener('input', render);
            el.addEventListener('change', render);
          });

          /* 열자마자 **QR 한 장이 이미 그려져 있게** 한다 (TASK-KL-133).
             빈 칸만 있으면 「여기 뭘 넣으라는 거지」로 시작한다 — 결과를 먼저 보여 주면
             무엇을 하는 도구인지 한 번에 안다. 사람이 치는 순간 그 값으로 바뀐다. */
          $<HTMLTextAreaElement>('#qrText').value = 'https://blog.mascari4615.com/karmolab/';
          render();
          sizeInput.addEventListener('input', () => {
            sizeVal.textContent = sizeInput.value + 'px';
          });

          $<HTMLButtonElement>('#qrPng').onclick = () => {
            if (!lastCanvas) return;
            download(lastCanvas.toDataURL('image/png'), 'karmolab-qr.png');
            Toolbox.trackUse?.('save-png');
          };
          $<HTMLButtonElement>('#qrSvg').onclick = () => {
            const data = payload();
            if (!data) return;
            const svg = toSvg(
              makeGrid(data, $<HTMLSelectElement>('#qrLevel').value as Level),
              Number(sizeInput.value),
              $<HTMLInputElement>('#qrFg').value,
              $<HTMLInputElement>('#qrBg').value
            );
            download('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), 'karmolab-qr.svg');
            Toolbox.trackUse?.('save-svg');
            void lastModules;
          };
          $<HTMLButtonElement>('#qrCopy').onclick = () => {
            if (!lastCanvas) return;
            lastCanvas.toBlob(async (blob) => {
              if (!blob) return;
              try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                Toolbox.trackUse?.('copy-image');
                Toolbox.showToast?.(t('qrgen.copy.done'), 'success', undefined);
              } catch {
                Toolbox.showToast?.(t('qrgen.copy.unsupported'), 'warning', undefined);
              }
            });
          };

          // 주소로 부른 경우 (`?op=svg&text=…` / `?op=wifi&ssid=…`) (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined) {
            if (call.op === 'svg') {
              kind.value = 'text';
              $<HTMLTextAreaElement>('#qrText').value = String(call.args.text ?? '');
            } else if (call.op === 'wifi') {
              kind.value = 'wifi';
              $<HTMLInputElement>('#qrWifiSsid').value = String(call.args.ssid ?? '');
              $<HTMLInputElement>('#qrWifiPass').value = String(call.args.password ?? '');
              if (call.args.hidden === true) $<HTMLInputElement>('#qrWifiHidden').checked = true;
            } else if (call.op === 'contact') {
              kind.value = 'contact';
              $<HTMLInputElement>('#qrCName').value = String(call.args.name ?? '');
              if (call.args.org !== undefined) $<HTMLInputElement>('#qrCOrg').value = String(call.args.org);
              if (call.args.tel !== undefined) $<HTMLInputElement>('#qrCTel').value = String(call.args.tel);
              if (call.args.email !== undefined) $<HTMLInputElement>('#qrCEmail').value = String(call.args.email);
            }
            kind.dispatchEvent(new Event('change'));
          }
          render();
  }
})();
