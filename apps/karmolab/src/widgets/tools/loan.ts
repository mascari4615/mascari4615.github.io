/**
 * 대출 상환 계산기 (TASK-KL-088)
 *
 * 이자 계산기에는 월 상환액만 있다. 실제로 궁금한 건 그 다음이다 —
 * **원금과 이자가 달마다 어떻게 갈리는지**, 중도상환하면 얼마나 줄어드는지.
 * 초반 상환액이 거의 이자라는 사실은 표를 봐야 실감이 나므로 상환표를 편다.
 */
(function (): void {
  const won = (n: number): string => Math.round(n).toLocaleString('ko-KR') + '원';

  interface Row {
    n: number;
    pay: number;
    interest: number;
    principal: number;
    left: number;
  }

  /** 원리금균등: 매달 갚는 금액이 같다. 초반엔 이자 비중이 크다. */
  function equalPayment(P: number, rate: number, months: number): Row[] {
    const r = rate / 100 / 12;
    const pay = r === 0 ? P / months : (P * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
    const rows: Row[] = [];
    let left = P;
    for (let n = 1; n <= months; n++) {
      const interest = left * r;
      const principal = pay - interest;
      left = Math.max(0, left - principal);
      rows.push({ n, pay, interest, principal, left });
    }
    return rows;
  }

  /** 원금균등: 원금을 똑같이 나눠 갚아 상환액이 점점 줄어든다. 총이자는 더 적다. */
  function equalPrincipal(P: number, rate: number, months: number): Row[] {
    const r = rate / 100 / 12;
    const principal = P / months;
    const rows: Row[] = [];
    let left = P;
    for (let n = 1; n <= months; n++) {
      const interest = left * r;
      left = Math.max(0, left - principal);
      rows.push({ n, pay: principal + interest, interest, principal, left });
    }
    return rows;
  }

  /** 만기일시: 이자만 내다 마지막에 원금을 한 번에. */
  function bullet(P: number, rate: number, months: number): Row[] {
    const r = rate / 100 / 12;
    const rows: Row[] = [];
    for (let n = 1; n <= months; n++) {
      const last = n === months;
      rows.push({ n, pay: P * r + (last ? P : 0), interest: P * r, principal: last ? P : 0, left: last ? 0 : P });
    }
    return rows;
  }

  Toolbox.register({
    id: 'loan',
    title: '대출 상환표',
    category: 'tool',
    desc: '원리금균등·원금균등·만기일시 상환을 비교하고 달별 원금·이자를 봅니다',
    layout: 'wide',
    icon: '<path d="M3 20h18M6 20V10M11 20V6M16 20v-8M21 20v-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '상환표',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">대출 금액</div>
                  <input type="number" id="loP" value="100000000" step="1000000" min="0">
                </div>
                <div>
                  <div class="tool-sublabel">연 이자율 (%)</div>
                  <input type="number" id="loR" value="4.5" step="0.1" min="0">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">기간 (개월)</div>
                  <input type="number" id="loM" value="360" step="12" min="1">
                </div>
                <div>
                  <div class="tool-sublabel">상환 방식</div>
                  <select id="loType">
                    <option value="ep">원리금균등 — 매달 같은 금액</option>
                    <option value="pp">원금균등 — 점점 줄어듦</option>
                    <option value="bu">만기일시 — 이자만 내다 한 번에</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="cc-stats" id="loStats"></div>
            <div class="tool-list" id="loCompare"></div>

            <div class="tool-sublabel" style="margin:16px 0 6px;">달별 상환표 — 처음 12개월과 마지막 달</div>
            <div class="tool-list" id="loTable"></div>
            <div class="tool-status" id="loStatus">부대비용·중도상환수수료는 넣지 않았습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const stats = $<HTMLElement>('#loStats');
          const compare = $<HTMLElement>('#loCompare');
          const table = $<HTMLElement>('#loTable');

          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function run(): void {
            const P = parseFloat($<HTMLInputElement>('#loP').value) || 0;
            const rate = parseFloat($<HTMLInputElement>('#loR').value) || 0;
            const months = Math.max(1, Math.round(parseFloat($<HTMLInputElement>('#loM').value) || 1));
            const type = $<HTMLSelectElement>('#loType').value;

            const build = type === 'pp' ? equalPrincipal : type === 'bu' ? bullet : equalPayment;
            const rows = build(P, rate, months);
            const totalInterest = rows.reduce((a, r) => a + r.interest, 0);

            stats.innerHTML =
              stat(type === 'ep' ? '월 상환액' : '첫 달 상환액', won(rows[0].pay), true) +
              stat('총 이자', won(totalInterest)) +
              stat('총 상환액', won(P + totalInterest));

            // 세 방식을 나란히 놓아야 「총이자가 적은 대신 초반이 무겁다」 는 맞바꿈이 보인다
            const alts: Array<[string, Row[]]> = [
              ['원리금균등', equalPayment(P, rate, months)],
              ['원금균등', equalPrincipal(P, rate, months)],
              ['만기일시', bullet(P, rate, months)]
            ];
            compare.innerHTML = alts
              .map(([name, rs]) => {
                const ti = rs.reduce((a, r) => a + r.interest, 0);
                return row(name, `총이자 ${won(ti)} · 첫 달 ${won(rs[0].pay)}`);
              })
              .join('');

            const show = [...rows.slice(0, 12), ...(months > 12 ? [rows[rows.length - 1]] : [])];
            table.innerHTML = show
              .map(
                (r) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${r.n}개월</span><span class="tool-list-val">${won(r.pay)} <span class="tool-list-dim">원금 ${won(r.principal)} · 이자 ${won(r.interest)} · 잔액 ${won(r.left)}</span></span></div>`
              )
              .join('');

            const firstRatio = rows[0].pay ? (rows[0].interest / rows[0].pay) * 100 : 0;
            $<HTMLElement>('#loStatus').textContent = `첫 달 상환액의 ${firstRatio.toFixed(0)}%가 이자입니다. 부대비용·중도상환수수료는 넣지 않았습니다.`;
            Toolbox.trackUse?.(type);
          }

          container.querySelectorAll('input, select').forEach((el) => {
            el.addEventListener('input', run);
            el.addEventListener('change', run);
          });
          run();
        }
      }
    ]
  });
})();
