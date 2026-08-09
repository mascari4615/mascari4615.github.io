/**
 * 색각 시뮬레이터 (TASK-KL-088)
 *
 * 「빨강은 실패, 초록은 성공」 처럼 색만으로 뜻을 나누면 적록 색각 이상이 있는 사람에게는
 * 같은 색으로 보인다. 남성 약 8%가 해당하므로 드문 경우가 아니다.
 * 색을 바꿔 보여주는 데 그치지 않고, **어떤 유형에서 두 색이 구분되지 않는지** 판정한다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  type RGB = [number, number, number];

  /** 유형별 변환 행렬 (Brettel/Viénot 계열의 널리 쓰이는 근사값) */
  const MATRIX: Record<string, number[][]> = {
    protanopia: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
    deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
    tritanopia: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
    achromatopsia: [[0.299, 0.587, 0.114], [0.299, 0.587, 0.114], [0.299, 0.587, 0.114]]
  };
  /* 이름은 **쓸 때** 붙인다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const labels = (): Record<string, string> => ({
    normal: t('colorblind.kind.normal'),
    protanopia: t('colorblind.kind.protanopia'),
    deuteranopia: t('colorblind.kind.deuteranopia'),
    tritanopia: t('colorblind.kind.tritanopia'),
    achromatopsia: t('colorblind.kind.achromatopsia')
  });

  function parse(s: string): RGB | null {
    const hex = s.trim().replace('#', '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(hex)) return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
    if (/^[0-9a-f]{6}$/.test(hex)) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    const m = s.match(/(\d+)\D+(\d+)\D+(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }
  const hex = (c: RGB): string => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  function simulate(c: RGB, type: string): RGB {
    if (type === 'normal') return c;
    const m = MATRIX[type];
    return [
      m[0][0] * c[0] + m[0][1] * c[1] + m[0][2] * c[2],
      m[1][0] * c[0] + m[1][1] * c[1] + m[1][2] * c[2],
      m[2][0] * c[0] + m[2][1] * c[1] + m[2][2] * c[2]
    ];
  }

  /** 두 색이 얼마나 떨어져 보이는지 — 거리가 작으면 구분이 안 된다는 뜻 */
  const distance = (a: RGB, b: RGB): number =>
    Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

  Toolbox.register({
    id: 'colorblind',
    title: t('widgets.colorblind.title', undefined, "색각 시뮬레이터"),
    category: 'tool',
    desc: t('widgets-desc.colorblind.desc', undefined, "두 색이 색각 이상에서 어떻게 보이는지 확인하고 구분 가능한지 판정합니다"),
    layout: 'wide',
    icon: '<circle cx="9" cy="12" r="5.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="15" cy="12" r="5.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7.5a5.5 5.5 0 0 0 0 9" stroke="currentColor" stroke-width="1.3"/>',
    tabs: [
      {
        id: 'app',
        label: t('colorblind.tab', undefined, "색각"),
        build: function (container: HTMLElement): void {
          void loadNamespace('colorblind').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('colorblind.label.a'))}</div>
                  <input type="text" id="cbA" aria-label="${esc(t('colorblind.label.a'))}" value="#e05252" spellcheck="false">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('colorblind.label.b'))}</div>
                  <input type="text" id="cbB" aria-label="${esc(t('colorblind.label.b'))}" value="#4caf50" spellcheck="false">
                </div>
              </div>
            </div>
            <div class="cb-grid" id="cbOut"></div>
            <div class="tool-status" id="cbStatus">${esc(t('colorblind.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const aEl = $<HTMLInputElement>('#cbA');
          const bEl = $<HTMLInputElement>('#cbB');
          const out = $<HTMLElement>('#cbOut');
          const status = $<HTMLElement>('#cbStatus');

          function run(): void {
            const a = parse(aEl.value);
            const b = parse(bEl.value);
            if (!a || !b) {
              status.textContent = t('colorblind.err.color');
              status.className = 'tool-status error';
              return;
            }
            let hardCount = 0;
            out.innerHTML = Object.keys(labels())
              .map((type) => {
                const sa = simulate(a, type);
                const sb = simulate(b, type);
                const d = distance(sa, sb);
                // 경험적 문턱 — 이보다 가까우면 나란히 놓아도 같은 색으로 읽힌다
                const hard = d < 60;
                if (hard && type !== 'normal') hardCount++;
                return `<div class="cb-card">
                          <div class="cb-swatches">
                            <span style="background:${hex(sa)}"></span>
                            <span style="background:${hex(sb)}"></span>
                          </div>
                          <div class="cb-label">${labels()[type]}</div>
                          <div class="cb-verdict ${hard ? 'bad' : 'good'}">${esc(
                            t('colorblind.value.verdict', {
                              verdict: hard ? t('colorblind.verdict.hard') : t('colorblind.verdict.ok'),
                              d: Math.round(d)
                            })
                          )}</div>
                        </div>`;
              })
              .join('');
            status.textContent = hardCount
              ? t('colorblind.say.hard', { n: hardCount })
              : t('colorblind.say.allFine');
            status.className = 'tool-status' + (hardCount ? ' error' : ' ok');
            Toolbox.trackUse?.('simulate');
          }

          [aEl, bEl].forEach((el) => el.addEventListener('input', run));
          run();
                  });
        }
      }
    ]
  });
})();
