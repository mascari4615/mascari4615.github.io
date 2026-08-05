/**
 * 진법 변환 (TASK-KL-088) — 2·8·10·16 + 임의 진법(2~36).
 *
 * 한 칸에 치면 나머지 칸이 동시에 갱신되는 형태. 「입력 → 변환 → 출력」 왕복이 없어야
 * 진법 사이를 오가며 확인하는 실제 쓰임에 맞는다. 큰 수는 BigInt 라 자릿수 손실이 없다.
 */
(function (): void {
  const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

  /** 진법 문자열 → BigInt. 잘못된 글자가 하나라도 있으면 null. */
  function parse(raw: string, base: number): bigint | null {
    const s = raw.trim().toLowerCase().replace(/[\s_,]/g, '');
    if (!s) return null;
    const neg = s.startsWith('-');
    const body = neg ? s.slice(1) : s;
    if (!body) return null;
    let out = 0n;
    const b = BigInt(base);
    for (const ch of body) {
      const d = DIGITS.indexOf(ch);
      if (d < 0 || d >= base) return null;
      out = out * b + BigInt(d);
    }
    return neg ? -out : out;
  }

  function format(v: bigint, base: number): string {
    if (v === 0n) return '0';
    const neg = v < 0n;
    let n = neg ? -v : v;
    const b = BigInt(base);
    let out = '';
    while (n > 0n) {
      out = DIGITS[Number(n % b)] + out;
      n /= b;
    }
    return (neg ? '-' : '') + out;
  }

  /** 2진수를 4자리씩 끊어 눈으로 읽히게 (1010 1100). */
  function groupBin(s: string): string {
    const neg = s.startsWith('-');
    const body = neg ? s.slice(1) : s;
    const pad = body.padStart(Math.ceil(body.length / 4) * 4, '0');
    return (neg ? '-' : '') + (pad.match(/.{4}/g) || []).join(' ');
  }

  Toolbox.register({
    id: 'radix',
    title: '진법 변환',
    category: 'tool',
    desc: '2·8·10·16진수를 한 화면에서 동시에 변환합니다. 임의 진법(2~36)과 비트 연산도 함께',
    layout: 'form',
    icon: '<path d="M4 6h4v4H4zM4 14h4v4H4z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8h8M12 16h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 4v4M16 16v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '변환',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">10진수 (DEC)</label>
              <input type="text" class="rx-in" data-base="10" placeholder="255" spellcheck="false">
            </div>
            <div class="field-group">
              <label class="field-label">16진수 (HEX)</label>
              <input type="text" class="rx-in" data-base="16" placeholder="ff" spellcheck="false">
            </div>
            <div class="field-group">
              <label class="field-label">8진수 (OCT)</label>
              <input type="text" class="rx-in" data-base="8" placeholder="377" spellcheck="false">
            </div>
            <div class="field-group">
              <label class="field-label">2진수 (BIN)</label>
              <input type="text" class="rx-in" data-base="2" placeholder="11111111" spellcheck="false">
              <div class="tool-sublabel" id="rxBinGroup" style="margin-top:6px; font-family:var(--font-mono, monospace);"></div>
            </div>

            <div class="field-group">
              <label class="field-label">임의 진법</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">밑 <span id="rxCustomVal" class="range-value">36</span></div>
                  <input type="range" id="rxCustomBase" min="2" max="36" value="36">
                </div>
                <div>
                  <div class="tool-sublabel">값</div>
                  <input type="text" class="rx-in" data-base="36" spellcheck="false">
                </div>
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="rxClear">지우기</button>
              <button class="btn btn-ghost" data-preset="255">255</button>
              <button class="btn btn-ghost" data-preset="1024">1024</button>
              <button class="btn btn-ghost" data-preset="65535">65535</button>
            </div>

            <div id="rxFacts" class="tool-list"></div>
            <div class="tool-status" id="rxStatus">아무 칸에나 입력하면 나머지가 함께 바뀝니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const inputs = [...container.querySelectorAll('.rx-in')] as HTMLInputElement[];
          const custom = $<HTMLInputElement>('#rxCustomBase');
          const customVal = $<HTMLElement>('#rxCustomVal');
          const binGroup = $<HTMLElement>('#rxBinGroup');
          const facts = $<HTMLElement>('#rxFacts');
          const status = $<HTMLElement>('#rxStatus');
          const customInput = inputs[inputs.length - 1];

          function baseOf(el: HTMLInputElement): number {
            return el === customInput ? parseInt(custom.value, 10) : parseInt(el.dataset.base || '10', 10);
          }

          function spread(value: bigint, from: HTMLInputElement | null): void {
            inputs.forEach((el) => {
              if (el === from) return;
              el.value = format(value, baseOf(el));
            });
            const bin = format(value, 2);
            binGroup.textContent = bin.replace('-', '').length > 4 ? groupBin(bin) : '';

            // 실제로 궁금해지는 것 = 자릿수·바이트·부호 없는 표현. 표 하나로 붙여 둔다.
            const bits = value < 0n ? format(-value, 2).length : bin.length;
            facts.innerHTML = [
              ['비트 수', `${bits} bit`],
              ['바이트', `${Math.ceil(bits / 8)} byte`],
              ['1의 개수', String((bin.match(/1/g) || []).length)],
              ['부호 있는 8bit 범위', value >= -128n && value <= 127n ? '들어감' : '넘침'],
              ['부호 없는 32bit 범위', value >= 0n && value <= 4294967295n ? '들어감' : '넘침']
            ]
              .map(
                ([k, v]) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`
              )
              .join('');
          }

          function clearAll(): void {
            inputs.forEach((el) => (el.value = ''));
            binGroup.textContent = '';
            facts.innerHTML = '';
            status.textContent = '아무 칸에나 입력하면 나머지가 함께 바뀝니다.';
            status.className = 'tool-status';
          }

          inputs.forEach((el) => {
            el.addEventListener('input', () => {
              if (!el.value.trim()) {
                clearAll();
                return;
              }
              const v = parse(el.value, baseOf(el));
              if (v === null) {
                status.textContent = `${baseOf(el)}진수에 없는 글자가 섞여 있어요.`;
                status.className = 'tool-status error';
                return;
              }
              spread(v, el);
              status.textContent = '변환됨 · 칸을 눌러 그대로 복사하세요.';
              status.className = 'tool-status ok';
              Toolbox.trackUse?.('convert');
            });
            el.addEventListener('focus', () => el.select());
          });

          custom.addEventListener('input', () => {
            customVal.textContent = custom.value;
            const dec = parse(inputs[0].value, 10);
            if (dec !== null) customInput.value = format(dec, parseInt(custom.value, 10));
          });

          $<HTMLButtonElement>('#rxClear').onclick = clearAll;
          container.querySelectorAll('[data-preset]').forEach((b) => {
            (b as HTMLButtonElement).onclick = () => {
              inputs[0].value = (b as HTMLElement).dataset.preset || '';
              inputs[0].dispatchEvent(new Event('input'));
            };
          });

          inputs[0].value = '255';
          inputs[0].dispatchEvent(new Event('input'));
        }
      }
    ]
  });
})();
