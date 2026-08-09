/**
 * 진법 변환 (TASK-KL-088) — 2·8·10·16 + 임의 진법(2~36).
 *
 * 한 칸에 치면 나머지 칸이 동시에 갱신되는 형태. 「입력 → 변환 → 출력」 왕복이 없어야
 * 진법 사이를 오가며 확인하는 실제 쓰임에 맞는다. 큰 수는 BigInt 라 자릿수 손실이 없다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    title: t('widgets.radix.title', undefined, "진법 변환"),
    category: 'tool',
    desc: t('widgets-desc.radix.desc', undefined, "2·8·10·16진수를 한 화면에서 동시에 변환합니다. 임의 진법(2~36)과 비트 연산도 함께"),
    layout: 'form',
    icon: '<path d="M4 6h4v4H4zM4 14h4v4H4z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8h8M12 16h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 4v4M16 16v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('radix.tab', undefined, "변환"),
        build: function (container: HTMLElement): void {
          void loadNamespace('radix').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('radix.label.dec'))}</label>
              <input type="text" class="rx-in" data-base="10" placeholder="255" spellcheck="false">
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('radix.label.hex'))}</label>
              <input type="text" class="rx-in" data-base="16" placeholder="ff" spellcheck="false">
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('radix.label.oct'))}</label>
              <input type="text" class="rx-in" data-base="8" placeholder="377" spellcheck="false">
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('radix.label.bin'))}</label>
              <input type="text" class="rx-in" data-base="2" placeholder="11111111" spellcheck="false">
              <div class="tool-sublabel" id="rxBinGroup" style="margin-top:6px; font-family:var(--font-mono, monospace);"></div>
            </div>

            <div class="field-group">
              <label class="field-label">${esc(t('radix.label.custom'))}</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('radix.label.base'))} <span id="rxCustomVal" class="range-value">36</span></div>
                  <input type="range" id="rxCustomBase" aria-label="${esc(t('radix.aria.base'))}" min="2" max="36" value="36">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('radix.label.value'))}</div>
                  <input type="text" class="rx-in" data-base="36" spellcheck="false" aria-label="${esc(t('radix.aria.customValue'))}">
                </div>
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="rxClear">${esc(t('radix.btn.clear'))}</button>
              <button class="btn btn-ghost" data-preset="255">255</button>
              <button class="btn btn-ghost" data-preset="1024">1024</button>
              <button class="btn btn-ghost" data-preset="65535">65535</button>
            </div>

            <div id="rxFacts" class="tool-list"></div>
            <div class="tool-status" id="rxStatus">${esc(t('radix.status.idle'))}</div>
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
              [t('radix.row.bits'), `${bits} bit`],
              [t('radix.row.bytes'), `${Math.ceil(bits / 8)} byte`],
              [t('radix.row.ones'), String((bin.match(/1/g) || []).length)],
              [t('radix.row.int8'), value >= -128n && value <= 127n ? t('radix.verdict.fits') : t('radix.verdict.overflow')],
              [t('radix.row.uint32'), value >= 0n && value <= 4294967295n ? t('radix.verdict.fits') : t('radix.verdict.overflow')]
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
            status.textContent = t('radix.status.idle');
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
                status.textContent = t('radix.err.digit', { base: baseOf(el) });
                status.className = 'tool-status error';
                return;
              }
              spread(v, el);
              status.textContent = t('radix.say.done');
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
                  });
        }
      }
    ]
  });
})();
