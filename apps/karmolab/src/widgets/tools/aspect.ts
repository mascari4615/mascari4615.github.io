/**
 * 비율 계산기 (TASK-KL-088)
 *
 * 「가로를 1280 으로 줄이면 세로는?」 을 손으로 하면 소수점에서 1px 씩 어긋나고,
 * 그 1px 이 쌓여 이미지가 미묘하게 눌린다. 원본 비율을 유지한 채 한쪽만 정하면
 * 나머지를 채워 주고, 흔한 화면비(16:9 등)로 맞출 때 필요한 여백도 함께 낸다.
 */
(function (): void {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

  const COMMON: Array<[number, number, string]> = [
    [16, 9, '와이드 영상·모니터'],
    [4, 3, '옛 화면·문서'],
    [1, 1, '정사각 (인스타 등)'],
    [3, 2, 'DSLR 사진'],
    [21, 9, '울트라와이드'],
    [9, 16, '세로 영상 (쇼츠·릴스)'],
    [2, 3, '세로 사진·포스터'],
    [1.618, 1, '황금비']
  ];

  Toolbox.register({
    id: 'aspect',
    title: '비율 계산기',
    category: 'tool',
    desc: '가로·세로 비율을 유지한 채 크기를 계산합니다. 화면비 목록과 여백 계산 포함',
    layout: 'form',
    icon: '<rect x="3" y="6" width="18" height="12" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 6l18 12" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>',
    tabs: [
      {
        id: 'app',
        label: '비율',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">원본 크기</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">가로</div>
                  <input type="number" id="asW" value="1920" min="1" step="1">
                </div>
                <div>
                  <div class="tool-sublabel">세로</div>
                  <input type="number" id="asH" value="1080" min="1" step="1">
                </div>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">바꿀 크기 — 한쪽만 넣으면 나머지를 채웁니다</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">새 가로</div>
                  <input type="number" id="asNewW" placeholder="1280" min="1" step="1">
                </div>
                <div>
                  <div class="tool-sublabel">새 세로</div>
                  <input type="number" id="asNewH" placeholder="비워 두면 자동" min="1" step="1">
                </div>
              </div>
            </div>

            <div class="tool-list" id="asOut"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label">자주 쓰는 화면비 — 누르면 원본에 적용</label>
              <div class="tool-chips" id="asPresets"></div>
            </div>

            <div class="tool-status" id="asStatus">가로만 정하면 세로가 따라옵니다.</div>
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

          $<HTMLElement>('#asPresets').innerHTML = COMMON.map(
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
              row('약분한 비', `${Math.round(W / g)} : ${Math.round(H / g)}`),
              row('소수 비율', `${ratio.toFixed(4)} : 1`),
              row('넓이', `${(W * H).toLocaleString('ko-KR')} px²`),
              row('방향', ratio > 1 ? '가로형' : ratio < 1 ? '세로형' : '정사각')
            ];
            if (outW > 0 && outH > 0) {
              rows.push(row('바뀐 크기', `${outW} × ${outH}`));
              rows.push(row('배율', `${(outW / W).toFixed(3)}배`));
              // 16:9 화면에 넣을 때 생기는 위아래(또는 좌우) 여백 — 영상 작업에서 자주 필요하다.
              const box169 = outW / (16 / 9);
              rows.push(
                row(
                  '16:9 에 넣으면',
                  box169 > outH
                    ? `위아래 여백 각 ${Math.round((box169 - outH) / 2)}px`
                    : `좌우 여백 각 ${Math.round((outH * (16 / 9) - outW) / 2)}px`
                )
              );
            }
            out.innerHTML = rows.join('');
            status.textContent = outW > 0 && outH > 0 ? '비율을 지킨 크기입니다.' : '가로만 정하면 세로가 따라옵니다.';
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
        }
      }
    ]
  });
})();
