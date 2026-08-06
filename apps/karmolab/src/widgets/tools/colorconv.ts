/**
 * 색상 변환 · 팔레트 (TASK-KL-088)
 * HEX/RGB/HSL 상호 변환 + 대비비(WCAG) 계산 + 조화 팔레트.
 * 내부 정본은 HSL 하나로 두고 표기만 바꾼다 (표기별 상태를 따로 들면 반올림 왕복에서 색이 흐른다).
 */
(function (): void {
  interface RGB {
    r: number;
    g: number;
    b: number;
  }

  function hexToRgb(hex: string): RGB | null {
    let h = hex.trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  const toHex = ({ r, g, b }: RGB): string =>
    '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
      else if (max === gg) h = ((bb - rr) / d + 2) * 60;
      else h = ((rr - gg) / d + 4) * 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToRgb(h: number, s: number, l: number): RGB {
    const S = s / 100;
    const L = l / 100;
    const c = (1 - Math.abs(2 * L - 1)) * S;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = L - c / 2;
    const seg = Math.floor((((h % 360) + 360) % 360) / 60);
    const table: RGB[] = [
      { r: c, g: x, b: 0 },
      { r: x, g: c, b: 0 },
      { r: 0, g: c, b: x },
      { r: 0, g: x, b: c },
      { r: x, g: 0, b: c },
      { r: c, g: 0, b: x }
    ];
    const t = table[seg];
    return { r: Math.round((t.r + m) * 255), g: Math.round((t.g + m) * 255), b: Math.round((t.b + m) * 255) };
  }

  function rgbToCmyk({ r, g, b }: RGB): string {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const k = 1 - Math.max(rr, gg, bb);
    if (k === 1) return 'cmyk(0%, 0%, 0%, 100%)';
    const c = ((1 - rr - k) / (1 - k)) * 100;
    const m = ((1 - gg - k) / (1 - k)) * 100;
    const y = ((1 - bb - k) / (1 - k)) * 100;
    return `cmyk(${c.toFixed(0)}%, ${m.toFixed(0)}%, ${y.toFixed(0)}%, ${(k * 100).toFixed(0)}%)`;
  }

  const luminance = ({ r, g, b }: RGB): number => {
    const f = (v: number): number => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a: RGB, b: RGB): number => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  Toolbox.register({
    id: 'colorconv',
    title: '색상 변환',
    category: 'tool',
    desc: 'HEX·RGB·HSL·CMYK 를 서로 변환하고, 대비비(가독성)와 조화 팔레트를 함께 봅니다',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3a9 9 0 0 1 0 18 4.5 4.5 0 0 1 0-9 4.5 4.5 0 0 0 0-9z" fill="currentColor" opacity="0.5"/>',
    tabs: [
      {
        id: 'app',
        label: '색상',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '색은 숫자로도 예뻐요.' });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">색 선택</label>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <input type="color" id="ccColor" value="#5865f2" style="width:64px; height:44px; padding:2px; background:var(--bg-secondary); border:1px solid var(--border);">
                <input type="text" id="ccHex" class="mono-input" value="#5865F2" style="flex:1; min-width:140px;">
                <button class="btn btn-ghost" id="ccRandom">랜덤</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">표기</label>
              <div id="ccFormats" class="tool-list"></div>
            </div>

            <div class="field-group">
              <label class="field-label">가독성 (WCAG 대비비)</label>
              <div id="ccContrast" class="tool-grid-2"></div>
            </div>

            <div class="field-group">
              <label class="field-label">조화 팔레트 — 클릭하면 그 색으로 이동</label>
              <div id="ccPalette"></div>
            </div>

            <div class="field-group">
              <label class="field-label">밝기 단계</label>
              <div id="ccShades" class="cc-swatch-row"></div>
            </div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const picker = $<HTMLInputElement>('#ccColor');
          const hexInput = $<HTMLInputElement>('#ccHex');
          const formats = $<HTMLElement>('#ccFormats');
          const contrastEl = $<HTMLElement>('#ccContrast');
          const paletteEl = $<HTMLElement>('#ccPalette');
          const shadesEl = $<HTMLElement>('#ccShades');

          // 견본 글자색은 견본 자기 밝기로 정한다 — 흰 글자로 고정하면 노란색 같은
          // 밝은 견본에서 이름과 코드가 안 보인다 (테마와 무관하게 안 보였다).
          function swatchInk(hex: string): string {
            const rgb = hexToRgb(hex);
            if (rgb == null) return '#fff';
            return luminance(rgb) > 0.45 ? '#12100c' : '#fff';
          }

          function swatches(list: Array<{ hex: string; label: string }>): string {
            return list
              .map((s) => {
                const ink = swatchInk(s.hex);
                const shadow = ink === '#fff' ? '0 1px 3px rgba(0,0,0,0.55)' : 'none';
                return `<button type="button" class="cc-swatch" data-hex="${s.hex}" style="background:${s.hex};color:${ink};text-shadow:${shadow}" title="${s.hex}"><span>${s.label}</span><span class="cc-swatch-hex">${s.hex.toUpperCase()}</span></button>`;
              })
              .join('');
          }

          function render(hex: string): void {
            const rgb = hexToRgb(hex);
            if (!rgb) return;
            const norm = toHex(rgb);
            picker.value = norm;
            if (hexInput.value.trim().toLowerCase() !== norm) hexInput.value = norm.toUpperCase();
            const hsl = rgbToHsl(rgb);

            const rows: Array<[string, string]> = [
              ['HEX', norm.toUpperCase()],
              ['RGB', `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`],
              ['HSL', `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`],
              ['CMYK', rgbToCmyk(rgb)],
              ['CSS 변수', `--color: ${norm};`],
              ['Android', `0xFF${norm.slice(1).toUpperCase()}`]
            ];
            formats.innerHTML = rows
              .map(
                ([k, v]) =>
                  `<div class="tool-list-row cc-copy-row" data-copy="${v}"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span><span class="tool-list-dim">복사</span></div>`
              )
              .join('');
            container.querySelectorAll('.cc-copy-row').forEach((row) => {
              (row as HTMLElement).onclick = async () => {
                await Toolbox.copyText?.((row as HTMLElement).dataset.copy || '', { message: '복사했어요' });
              };
            });

            const white = { r: 255, g: 255, b: 255 };
            const black = { r: 0, g: 0, b: 0 };
            const cw = contrast(rgb, white);
            const cb = contrast(rgb, black);
            const verdict = (v: number): string =>
              v >= 7 ? 'AAA (본문 OK)' : v >= 4.5 ? 'AA (본문 OK)' : v >= 3 ? 'AA 큰 글자만' : '기준 미달';
            contrastEl.innerHTML = `
              <div class="cc-contrast" style="background:${norm}; color:#fff;">
                <div style="font-weight:700;">흰 글자 ${cw.toFixed(2)} : 1</div>
                <div style="font-size:var(--font-size-xs); opacity:0.85;">${verdict(cw)}</div>
              </div>
              <div class="cc-contrast" style="background:${norm}; color:#000;">
                <div style="font-weight:700;">검은 글자 ${cb.toFixed(2)} : 1</div>
                <div style="font-size:var(--font-size-xs); opacity:0.85;">${verdict(cb)}</div>
              </div>`;

            const rot = (deg: number): string => toHex(hslToRgb(hsl.h + deg, hsl.s, hsl.l));
            paletteEl.innerHTML = `
              <div class="cc-swatch-row">${swatches([
                { hex: norm, label: '기준' },
                { hex: rot(180), label: '보색' },
                { hex: rot(120), label: '삼색 1' },
                { hex: rot(240), label: '삼색 2' },
                { hex: rot(30), label: '유사 +30°' },
                { hex: rot(-30), label: '유사 -30°' }
              ])}</div>`;

            shadesEl.innerHTML = swatches(
              [90, 75, 60, 45, 30, 15].map((l) => ({ hex: toHex(hslToRgb(hsl.h, hsl.s, l)), label: `L ${l}%` }))
            );

            container.querySelectorAll('.cc-swatch').forEach((sw) => {
              (sw as HTMLButtonElement).onclick = () => {
                const h = (sw as HTMLElement).dataset.hex || '';
                hexInput.value = h.toUpperCase();
                render(h);
              };
            });
          }

          picker.addEventListener('input', () => render(picker.value));
          hexInput.addEventListener('input', () => {
            if (hexToRgb(hexInput.value)) render(hexInput.value);
          });
          $<HTMLButtonElement>('#ccRandom').onclick = () => {
            const hex = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
            hexInput.value = hex.toUpperCase();
            render(hex);
          };

          render('#5865f2');
        }
      }
    ]
  });
})();
