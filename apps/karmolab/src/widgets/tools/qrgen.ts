/**
 * QR 코드 생성기 (TASK-KL-088) — 텍스트·URL·WiFi·연락처를 QR 로. PNG/SVG 다운로드.
 * qrcode-generator 를 번들해 오프라인에서도 동작 (외부 API 호출 0 = 입력 데이터가 밖으로 안 나감).
 */
import qrcode from 'qrcode-generator';

(function (): void {
  type Level = 'L' | 'M' | 'Q' | 'H';

  function escapeWifi(s: string): string {
    return s.replace(/([\\;,:"])/g, '\\$1');
  }

  Toolbox.register({
    id: 'qrgen',
    title: 'QR 코드 생성',
    category: 'tool',
    desc: 'URL·텍스트·WiFi·연락처를 QR 코드로 만들고 PNG/SVG 로 저장합니다. 서버 전송 없이 브라우저에서 생성',
    layout: 'form',
    icon: '<rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: 'QR',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '네모네모 도장 찍어 드릴게요!' });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">종류</label>
              <select id="qrKind">
                <option value="text">텍스트 / URL</option>
                <option value="wifi">WiFi 접속 정보</option>
                <option value="contact">연락처 (vCard)</option>
                <option value="sms">문자 메시지</option>
              </select>
            </div>

            <div class="field-group" id="qrPanelText">
              <label class="field-label">내용</label>
              <textarea id="qrText" placeholder="https://blog.mascari4615.com/karmolab/" style="min-height:90px;"></textarea>
            </div>

            <div class="field-group" id="qrPanelWifi" style="display:none;">
              <label class="field-label">WiFi</label>
              <div class="tool-grid-2">
                <input type="text" id="qrWifiSsid" placeholder="네트워크 이름 (SSID)">
                <input type="text" id="qrWifiPass" placeholder="비밀번호">
              </div>
              <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
                <select id="qrWifiEnc" style="flex:1;">
                  <option value="WPA">WPA / WPA2</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">비밀번호 없음</option>
                </select>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary); white-space:nowrap;">
                  <input type="checkbox" id="qrWifiHidden" style="width:auto;"> 숨김 네트워크
                </label>
              </div>
            </div>

            <div class="field-group" id="qrPanelContact" style="display:none;">
              <label class="field-label">연락처</label>
              <div class="tool-grid-2">
                <input type="text" id="qrCName" placeholder="이름">
                <input type="text" id="qrCTel" placeholder="전화번호">
                <input type="text" id="qrCEmail" placeholder="이메일">
                <input type="text" id="qrCOrg" placeholder="소속 / 회사">
              </div>
            </div>

            <div class="field-group" id="qrPanelSms" style="display:none;">
              <label class="field-label">문자</label>
              <div class="tool-grid-2">
                <input type="text" id="qrSmsTel" placeholder="받는 번호">
                <input type="text" id="qrSmsBody" placeholder="메시지 내용">
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">모양</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">오류 정정 수준</div>
                  <select id="qrLevel">
                    <option value="L">L — 7% (가장 단순)</option>
                    <option value="M" selected>M — 15% (권장)</option>
                    <option value="Q">Q — 25%</option>
                    <option value="H">H — 30% (로고 얹을 때)</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">크기 <span id="qrSizeVal" class="range-value">320px</span></div>
                  <input type="range" id="qrSize" min="128" max="1024" step="32" value="320">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">전경색</div>
                  <input type="color" id="qrFg" value="#000000" style="width:100%; height:38px; padding:2px; background:var(--bg-secondary); border:1px solid var(--border);">
                </div>
                <div>
                  <div class="tool-sublabel">배경색</div>
                  <input type="color" id="qrBg" value="#ffffff" style="width:100%; height:38px; padding:2px; background:var(--bg-secondary); border:1px solid var(--border);">
                </div>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; align-items:center; gap:12px;">
              <div id="qrPreview" style="display:flex; align-items:center; justify-content:center; min-height:180px; padding:16px; background:var(--bg-tertiary); border:1px solid var(--border); width:100%; box-sizing:border-box;"></div>
              <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                <button class="btn btn-primary" id="qrPng">PNG 저장</button>
                <button class="btn btn-secondary" id="qrSvg">SVG 저장</button>
                <button class="btn btn-ghost" id="qrCopy">이미지 복사</button>
              </div>
              <div class="tool-status" id="qrStatus">내용을 입력하면 바로 QR 이 만들어집니다.</div>
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

          let lastCanvas: HTMLCanvasElement | null = null;
          let lastModules = 0;

          function render(): void {
            const data = payload();
            lastCanvas = null;
            if (!data) {
              preview.innerHTML = '<span style="color:var(--text-tertiary); font-size:var(--font-size-sm);">내용을 입력하세요</span>';
              status.textContent = '내용을 입력하면 바로 QR 이 만들어집니다.';
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
              lastCanvas = canvas;
              status.textContent = `${data.length.toLocaleString('ko-KR')}자 · ${count}×${count} 모듈 · 오류정정 ${$<HTMLSelectElement>('#qrLevel').value}`;
              status.className = 'tool-status ok';
            } catch (e) {
              preview.innerHTML = '';
              status.textContent = '내용이 너무 길어요. 오류 정정 수준을 낮추거나 내용을 줄여 주세요.';
              status.className = 'tool-status error';
              void e;
            }
          }

          function download(href: string, name: string): void {
            const a = document.createElement('a');
            a.href = href;
            a.download = name;
            a.click();
          }

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
            qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
            const qr = qrcode(0, $<HTMLSelectElement>('#qrLevel').value as Level);
            qr.addData(data);
            qr.make();
            const count = qr.getModuleCount();
            const margin = 4;
            const total = count + margin * 2;
            let path = '';
            for (let r = 0; r < count; r++) {
              for (let c = 0; c < count; c++) {
                if (qr.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
              }
            }
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizeInput.value}" height="${sizeInput.value}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${$<HTMLInputElement>('#qrBg').value}"/><path d="${path}" fill="${$<HTMLInputElement>('#qrFg').value}"/></svg>`;
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
                Toolbox.showToast?.('QR 이미지를 복사했어요', 'success', undefined);
              } catch {
                Toolbox.showToast?.('이 브라우저는 이미지 복사를 지원하지 않아요. PNG 로 저장해 주세요.', 'warning', undefined);
              }
            });
          };

          render();
        }
      }
    ]
  });
})();
