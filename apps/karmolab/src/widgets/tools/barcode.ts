/**
 * 바코드 만들기 (TASK-KL-088)
 *
 * 재고 라벨, 도서 정리, 물품 관리에 바코드가 필요할 때가 있다. QR 과 달리 바코드는 **규격이
 * 여러 개**이고, 규격을 잘못 고르면 스캐너가 아예 못 읽는다.
 *
 * 신경 쓴 곳:
 *  - **못 만드는 값은 만들기 전에 말해 준다.** EAN-13 은 숫자 13자리여야 하고 마지막 자리는
 *    검사 숫자다. 그냥 그려 놓으면 라벨을 다 뽑고 나서야 안 읽히는 걸 알게 된다.
 *  - 검사 숫자는 **자동으로 채워 준다** (12자리만 넣으면 된다). 손으로 계산할 것이 아니다.
 *  - 여백(quiet zone)을 반드시 남긴다. 이걸 빼면 스캐너가 시작을 못 찾는다 — 직접 그린
 *    바코드가 안 읽히는 가장 흔한 이유다.
 */
(function (): void {
  /** Code128 (B/C 자동) — 글자·숫자 아무거나 담을 수 있어 물품 관리에 두루 쓴다 */
  const CODE128: string[] = [
    '11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000',
    '11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100',
    '11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010',
    '11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000',
    '11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110',
    '11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010',
    '11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000',
    '10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010',
    '10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110',
    '11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110',
    '10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','11000111010'
  ];
  const STOP = '1100011101011';

  /** EAN-13 검사 숫자 — 홀수 자리는 1배, 짝수 자리는 3배 */
  function eanCheck(d12: string): number {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10;
  }

  const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  /** 값 → 검은/흰 막대 문자열(1/0). 못 만들면 이유를 던진다 */
  function encode(value: string, kind: string): string {
    if (kind === 'ean13') {
      const digits = value.replace(/\D/g, '');
      if (digits.length !== 12 && digits.length !== 13) {
        throw new Error('EAN-13 은 숫자 12자리(검사 숫자 자동) 또는 13자리여야 합니다');
      }
      const base = digits.slice(0, 12);
      const check = digits.length === 13 ? Number(digits[12]) : eanCheck(base);
      if (digits.length === 13 && check !== eanCheck(base)) {
        throw new Error(`마지막 검사 숫자가 맞지 않습니다 (${digits[12]} → ${eanCheck(base)} 이어야 합니다)`);
      }
      const full = base + check;
      const parity = EAN_PARITY[Number(full[0])];
      let bits = '101';
      for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[Number(full[i])];
      bits += '01010';
      for (let i = 7; i <= 12; i++) bits += EAN_R[Number(full[i])];
      return bits + '101';
    }

    // Code128-B — 아스키 32~126
    if (/[^\x20-\x7e]/.test(value)) throw new Error('Code128 은 영문·숫자·기호만 담을 수 있습니다 (한글 X)');
    if (!value) throw new Error('담을 값을 적어 주세요');
    let sum = 104; // START B
    let bits = CODE128[104];
    for (let i = 0; i < value.length; i++) {
      const v = value.charCodeAt(i) - 32;
      bits += CODE128[v];
      sum += v * (i + 1);
    }
    return bits + CODE128[sum % 103] + STOP;
  }

  Toolbox.register({
    id: 'barcode',
    title: '바코드 만들기',
    category: 'tool',
    desc: '재고·도서·물품 라벨용 바코드를 만듭니다. 안 읽히는 값은 미리 알려 줍니다',
    layout: 'wide',
    icon: '<path d="M4 5v14M7 5v14M9.5 5v14M13 5v14M16 5v14M18 5v14M20 5v14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '바코드',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips" id="bcKind">
                <button type="button" class="tool-chip active" data-kind="code128">Code128 — 글자·숫자 아무거나</button>
                <button type="button" class="tool-chip" data-kind="ean13">EAN-13 — 상품 바코드</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label" for="bcValue">담을 값</label>
              <input type="text" id="bcValue" aria-label="담을 값" value="KARMOLAB-001" spellcheck="false">
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">막대 굵기 <span id="bcWidthVal" class="range-value">2px</span></div>
                  <input type="range" id="bcWidth" aria-label="막대 굵기" min="1" max="6" value="2">
                </div>
                <div>
                  <div class="tool-sublabel">높이 <span id="bcHeightVal" class="range-value">80px</span></div>
                  <input type="range" id="bcHeight" aria-label="높이" min="30" max="200" step="5" value="80">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="bcText" checked> 아래에 값 적기</label>
              </div>
            </div>

            <canvas id="bcCanvas" style="max-width:100%; background:#fff; border-radius:8px; display:block; border:1px solid rgba(128,128,128,0.25);"></canvas>

            <div class="cc-stats" id="bcStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="bcSave">PNG 으로 받기</button>
            </div>

            <div class="tool-status" id="bcStatus">값은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const canvas = $<HTMLCanvasElement>('#bcCanvas');
          const status = $<HTMLElement>('#bcStatus');
          const stats = $<HTMLElement>('#bcStats');
          let kind = 'code128';

          const say = (m: string, k = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (k ? ' ' + k : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function draw(): void {
            const value = $<HTMLInputElement>('#bcValue').value;
            const unit = parseInt($<HTMLInputElement>('#bcWidth').value, 10);
            const barH = parseInt($<HTMLInputElement>('#bcHeight').value, 10);
            const withText = $<HTMLInputElement>('#bcText').checked;
            let bits: string;
            try {
              bits = encode(value, kind);
            } catch (e) {
              // 라벨을 다 뽑고 나서 안 읽히는 걸 아는 것보다, 지금 말해 주는 편이 낫다
              canvas.width = 1;
              canvas.height = 1;
              stats.innerHTML = '';
              say((e as Error).message, 'error');
              return;
            }

            // 여백을 반드시 남긴다 — 이게 없으면 스캐너가 시작을 못 찾는다
            const quiet = unit * 10;
            const textH = withText ? 22 : 0;
            canvas.width = bits.length * unit + quiet * 2;
            canvas.height = barH + textH + 16;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000000';
            for (let i = 0; i < bits.length; i++) {
              if (bits[i] === '1') ctx.fillRect(quiet + i * unit, 8, unit, barH);
            }
            if (withText) {
              ctx.font = '600 14px monospace';
              ctx.textBaseline = 'top';
              const shown = kind === 'ean13' ? eanFull(value) : value;
              const w = ctx.measureText(shown).width;
              ctx.fillText(shown, (canvas.width - w) / 2, barH + 12);
            }

            stats.innerHTML =
              stat('규격', kind === 'ean13' ? 'EAN-13' : 'Code128', true) +
              stat('막대 수', `${bits.length}개`) +
              stat('그림 크기', `${canvas.width}×${canvas.height}`);
            say(
              kind === 'ean13'
                ? `읽히는 값: ${eanFull(value)} (검사 숫자 포함). 인쇄해도 여백을 자르지 마세요.`
                : '만들었어요. 인쇄할 때 양옆 여백을 자르지 마세요 — 그러면 안 읽힙니다.',
              'ok'
            );
            Toolbox.trackUse?.('barcode');
          }

          function eanFull(v: string): string {
            const d = v.replace(/\D/g, '').slice(0, 12);
            return d.length === 12 ? d + eanCheck(d) : d;
          }

          container.querySelectorAll('#bcKind .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#bcKind .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              kind = (chip as HTMLElement).dataset.kind || 'code128';
              // 규격을 바꾸면 담을 수 있는 값도 달라진다 — 예시를 갈아 준다
              const input = $<HTMLInputElement>('#bcValue');
              if (kind === 'ean13' && /\D/.test(input.value)) input.value = '880123456789';
              if (kind === 'code128' && /^\d{12,13}$/.test(input.value)) input.value = 'KARMOLAB-001';
              draw();
            };
          });
          $<HTMLInputElement>('#bcValue').addEventListener('input', draw);
          $<HTMLInputElement>('#bcWidth').addEventListener('input', () => {
            $<HTMLElement>('#bcWidthVal').textContent = $<HTMLInputElement>('#bcWidth').value + 'px';
            draw();
          });
          $<HTMLInputElement>('#bcHeight').addEventListener('input', () => {
            $<HTMLElement>('#bcHeightVal').textContent = $<HTMLInputElement>('#bcHeight').value + 'px';
            draw();
          });
          $<HTMLInputElement>('#bcText').addEventListener('change', draw);
          $<HTMLButtonElement>('#bcSave').onclick = () => {
            if (canvas.width < 10) {
              say('먼저 담을 수 있는 값을 넣어 주세요.', 'error');
              return;
            }
            canvas.toBlob((blob) => {
              if (!blob) return;
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = '바코드.png';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say('받았어요. 인쇄할 때 양옆 여백을 자르지 마세요.', 'ok');
            }, 'image/png');
          };
          draw();
        }
      }
    ]
  });
})();
