/**
 * 색 대비 검사 (TASK-KL-088)
 *
 * 「연한 회색 글씨가 예쁘다」 로 정한 색이 밝은 곳에서는 안 읽힌다.
 * 감으로는 못 가리므로 웹 접근성 기준(WCAG)의 대비비를 계산해 **통과/실패로 못 박는다** —
 * 본문 4.5:1, 큰 글씨 3:1 이 최소선이다.
 * 통과하는 가장 가까운 색까지 제안해서, 실패했을 때 무엇을 고칠지 바로 알 수 있게 한다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  type RGB = [number, number, number];

  function parse(input: string): RGB | null {
    const s = input.trim().toLowerCase();
    const hex = s.replace('#', '');
    if (/^[0-9a-f]{3}$/.test(hex)) return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
    if (/^[0-9a-f]{6}$/.test(hex)) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    const m = s.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    return null;
  }

  const hex = (c: RGB): string => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  /** 상대 휘도 — 사람 눈이 초록에 민감한 것을 반영한 가중치 */
  function luminance(c: RGB): number {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function ratio(a: RGB, b: RGB): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /** 배경은 두고 글자색만 밝기를 밀어 기준을 넘기는 가장 가까운 색을 찾는다. */
  function nearestPassing(fg: RGB, bg: RGB, target: number): RGB | null {
    const bgLight = luminance(bg) > 0.5;
    let best: RGB | null = null;
    for (let step = 1; step <= 100; step++) {
      const t = step / 100;
      const c: RGB = bgLight
        ? [fg[0] * (1 - t), fg[1] * (1 - t), fg[2] * (1 - t)]
        : [fg[0] + (255 - fg[0]) * t, fg[1] + (255 - fg[1]) * t, fg[2] + (255 - fg[2]) * t];
      if (ratio(c, bg) >= target) {
        best = c;
        break;
      }
    }
    return best;
  }

  Toolbox.register({
    id: 'contrast',
    title: t('widgets.contrast.title', undefined, "색 대비 검사"),
    category: 'tool',
    desc: t('widgets-desc.contrast.desc', undefined, "글자색과 배경색의 대비비를 재고 접근성 기준 통과 여부를 알려줍니다"),
    layout: 'wide',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('contrast.tab', undefined, "대비"),
        build: function (container: HTMLElement): void {
          void loadNamespace('contrast').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('contrast.label.fg'))}</div>
                  <input type="text" id="coFg" aria-label="${esc(t('contrast.label.fg'))}" value="#767676" spellcheck="false">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('contrast.label.bg'))}</div>
                  <input type="text" id="coBg" aria-label="${esc(t('contrast.label.bg'))}" value="#ffffff" spellcheck="false">
                </div>
              </div>
            </div>

            <div id="coPreview" class="co-preview">
              <div class="co-sample-lg">${esc(t('contrast.sample.large'))}</div>
              <div class="co-sample-sm">${esc(t('contrast.sample.body'))}</div>
            </div>

            <div class="cc-stats" id="coStats"></div>
            <div class="tool-list" id="coOut"></div>
            <div class="tool-status" id="coStatus"></div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const fgEl = $<HTMLInputElement>('#coFg');
          const bgEl = $<HTMLInputElement>('#coBg');
          const preview = $<HTMLElement>('#coPreview');
          const stats = $<HTMLElement>('#coStats');
          const out = $<HTMLElement>('#coOut');
          const status = $<HTMLElement>('#coStatus');

          const stat = (label: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${label}</div><div class="cc-stat-value">${v}</div></div>`;
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function render(): void {
            const fg = parse(fgEl.value);
            const bg = parse(bgEl.value);
            if (!fg || !bg) {
              status.textContent = t('contrast.err.color');
              status.className = 'tool-status error';
              return;
            }
            preview.style.background = hex(bg);
            preview.style.color = hex(fg);

            const r = ratio(fg, bg);
            const mark = (ok: boolean): string => (ok ? t('contrast.verdict.pass') : t('contrast.verdict.fail'));
            stats.innerHTML =
              stat(t('contrast.row.ratio'), `${r.toFixed(2)} : 1`, true) +
              stat(t('contrast.stat.body'), mark(r >= 4.5)) +
              stat(t('contrast.stat.large'), mark(r >= 3));

            const rows = [
              row(t('contrast.row.aaBody'), t('contrast.note.aaBody', { mark: mark(r >= 4.5) })),
              row(t('contrast.row.aaLarge'), t('contrast.note.aaLarge', { mark: mark(r >= 3) })),
              row(t('contrast.row.aaaBody'), t('contrast.note.aaaBody', { mark: mark(r >= 7) })),
              row(t('contrast.row.nonText'), t('contrast.note.nonText', { mark: mark(r >= 3) }))
            ];
            if (r < 4.5) {
              const fix = nearestPassing(fg, bg, 4.5);
              if (fix) rows.push(row(t('contrast.row.toPass'), t('contrast.value.suggest', { hex: hex(fix), ratio: ratio(fix, bg).toFixed(2) })));
            }
            out.innerHTML = rows.join('');

            status.textContent =
              r >= 7 ? t('contrast.say.great') : r >= 4.5 ? t('contrast.say.ok') : r >= 3 ? t('contrast.say.largeOnly') : t('contrast.say.bad');
            status.className = 'tool-status' + (r >= 4.5 ? ' ok' : r >= 3 ? '' : ' error');
            Toolbox.trackUse?.('check');
          }

          [fgEl, bgEl].forEach((el) => el.addEventListener('input', render));
          render();
                  });
        }
      }
    ]
  });
})();
