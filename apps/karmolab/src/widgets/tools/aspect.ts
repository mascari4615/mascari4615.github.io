/**
 * 비율 계산기 (TASK-KL-088)
 *
 * 「가로를 1280 으로 줄이면 세로는?」 을 손으로 하면 소수점에서 1px 씩 어긋나고,
 * 그 1px 이 쌓여 이미지가 미묘하게 눌린다. 원본 비율을 유지한 채 한쪽만 정하면
 * 나머지를 채워 주고, 흔한 화면비(16:9 등)로 맞출 때 필요한 여백도 함께 낸다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

  /* 이름은 **쓸 때** 붙인다 — 표로 굳히면 그 시점엔 말 묶음이 아직 안 와서 한국어로 박힌다. */
  const common = (): Array<[number, number, string]> => [
    [16, 9, t('aspect.name.169')],
    [4, 3, t('aspect.name.43')],
    [1, 1, t('aspect.name.11')],
    [3, 2, t('aspect.name.32')],
    [21, 9, t('aspect.name.219')],
    [9, 16, t('aspect.name.916')],
    [2, 3, t('aspect.name.23')],
    [1.618, 1, t('aspect.name.golden')]
  ];

  Toolbox.register({
    id: 'aspect',
    title: t('widgets.aspect.title', undefined, "화면 비율 계산기"),
    category: 'tool',
    desc: t('widgets-desc.aspect.desc', undefined, "가로·세로 비율을 유지한 채 크기를 계산합니다. 화면비 목록과 여백 계산 포함"),
    layout: 'form',
    icon: '<rect x="3" y="6" width="18" height="12" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 6l18 12" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>',
    tabs: [
      {
        id: 'app',
        label: t('aspect.t16', undefined, "비율"),
        build: function (container: HTMLElement): void {
          void loadNamespace('aspect').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('aspect.label.source'))}</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('aspect.label.w'))}</div>
                  <input type="number" id="asW" aria-label="${esc(t('aspect.label.w'))}" value="1920" min="1" step="1">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('aspect.label.h'))}</div>
                  <input type="number" id="asH" aria-label="${esc(t('aspect.label.h'))}" value="1080" min="1" step="1">
                </div>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">${esc(t('aspect.label.target'))}</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('aspect.label.newW'))}</div>
                  <input type="number" id="asNewW" placeholder="1280" min="1" step="1">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('aspect.label.newH'))}</div>
                  <input type="number" id="asNewH" placeholder="${esc(t('aspect.ph.auto'))}" min="1" step="1">
                </div>
              </div>
            </div>

            <div class="tool-list" id="asOut"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label">${esc(t('aspect.label.common'))}</label>
              <div class="tool-chips" id="asPresets"></div>
            </div>

            <div class="tool-status" id="asStatus">${esc(t('aspect.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const w = $<HTMLInputElement>('#asW');
          const h = $<HTMLInputElement>('#asH');
          const nw = $<HTMLInputElement>('#asNewW');
          const nh = $<HTMLInputElement>('#asNewH');
          const out = $<HTMLElement>('#asOut');
          const status = $<HTMLElement>('#asStatus');
          let lastEdited: 'w' | 'h' = 'w';

          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          $<HTMLElement>('#asPresets').innerHTML = common().map(
            ([a, b, name]) =>
              `<button type="button" class="tool-chip" data-a="${a}" data-b="${b}">${a === 1.618 ? '1.618:1' : `${a}:${b}`} <span class="tool-list-dim">${name}</span></button>`
          ).join('');

          function render(): void {
            const W = parseFloat(w.value);
            const H = parseFloat(h.value);
            if (!(W > 0 && H > 0)) {
              out.innerHTML = '';
              return;
            }
            const g = gcd(Math.round(W), Math.round(H)) || 1;
            const ratio = W / H;

            // 한쪽만 채워져 있으면 나머지를 비율대로 맞춘다.
            let outW = parseFloat(nw.value);
            let outH = parseFloat(nh.value);
            if (lastEdited === 'w' && outW > 0) outH = Math.round(outW / ratio);
            else if (lastEdited === 'h' && outH > 0) outW = Math.round(outH * ratio);

            const rows = [
              row(t('aspect.row.reduced'), `${Math.round(W / g)} : ${Math.round(H / g)}`),
              row(t('aspect.row.decimal'), `${ratio.toFixed(4)} : 1`),
              row(t('aspect.row.area'), `${(W * H).toLocaleString('ko-KR')} px²`),
              row(t('aspect.row.orientation'), ratio > 1 ? t('aspect.orient.landscape') : ratio < 1 ? t('aspect.orient.portrait') : t('aspect.orient.square'))
            ];
            if (outW > 0 && outH > 0) {
              rows.push(row(t('aspect.row.newSize'), `${outW} × ${outH}`));
              rows.push(row(t('aspect.row.scale'), t('aspect.value.scale', { n: (outW / W).toFixed(3) })));
              // 16:9 화면에 넣을 때 생기는 위아래(또는 좌우) 여백 — 영상 작업에서 자주 필요하다.
              const box169 = outW / (16 / 9);
              rows.push(
                row(
                  t('aspect.row.fit169'),
                  box169 > outH
                    ? t('aspect.value.padY', { n: Math.round((box169 - outH) / 2) })
                    : t('aspect.value.padX', { n: Math.round((outH * (16 / 9) - outW) / 2) })
                )
              );
            }
            out.innerHTML = rows.join('');
            status.textContent = outW > 0 && outH > 0 ? t('aspect.say.kept') : t('aspect.status.idle');
            status.className = 'tool-status' + (outW > 0 && outH > 0 ? ' ok' : '');
          }

          nw.addEventListener('input', () => {
            lastEdited = 'w';
            if (nw.value) nh.value = '';
            render();
            Toolbox.trackUse?.('resize');
          });
          nh.addEventListener('input', () => {
            lastEdited = 'h';
            if (nh.value) nw.value = '';
            render();
          });
          [w, h].forEach((el) => el.addEventListener('input', render));

          container.querySelectorAll('#asPresets .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              const a = parseFloat((chip as HTMLElement).dataset.a || '16');
              const b = parseFloat((chip as HTMLElement).dataset.b || '9');
              const W = parseFloat(w.value) || 1920;
              w.value = String(Math.round(W));
              h.value = String(Math.round(W / (a / b)));
              render();
            };
          });

          render();
                  });
        }
      }
    ]
  });
})();
