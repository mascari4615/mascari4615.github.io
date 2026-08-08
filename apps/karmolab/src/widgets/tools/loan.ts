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

  /**
   * 거치기간 — 그동안은 **이자만** 낸다 (2026-08-08, 남들 기준 맞추기).
   *
   * 국내 계산기(핀다·부동산계산기·은행 금융계산기)는 전부 거치기간을 받는다. 주담대에서
   * 흔한 조건인데 우리 도구에는 아예 없어서, 실제 조건을 넣어 볼 수가 없었다.
   */
  function withGrace(P: number, rate: number, grace: number, rows: Row[]): Row[] {
    if (grace <= 0) return rows;
    const r = rate / 100 / 12;
    const 앞 = [];
    for (let n = 1; n <= grace; n++) 앞.push({ n, pay: P * r, interest: P * r, principal: 0, left: P });
    return 앞.concat(rows.map((row) => ({ ...row, n: row.n + grace })));
  }

  /**
   * 매달 조금씩 더 갚으면 얼마나 줄어드나 (남들이 표로만 보여 주고 안 재 주는 자리).
   *
   * 「중도상환하면 얼마나 줄어드는지」는 이 도구를 만든 이유로 적혀 있었는데 정작 없었다.
   * 수수료는 대출마다 달라 넣지 않는다 — 대신 **기간이 얼마나 짧아지고 이자가 얼마나 주는지**
   * 두 숫자를 준다. 그게 사람이 결정할 때 보는 값이다.
   */
  function withExtra(rows: Row[], rate: number, extra: number): Row[] {
    if (extra <= 0) return rows;
    const r = rate / 100 / 12;
    const out: Row[] = [];
    let left = rows[0] ? rows[0].left + rows[0].principal : 0;
    for (const base of rows) {
      if (left <= 0) break;
      const interest = left * r;
      const 예정원금 = Math.min(base.principal + extra, left);
      left = Math.max(0, left - 예정원금);
      out.push({ n: base.n, pay: interest + 예정원금, interest, principal: 예정원금, left });
    }
    return out;
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
                  <input type="number" id="loP" value="100000000" step="1000000" min="0" aria-label="대출 금액">
                </div>
                <div>
                  <div class="tool-sublabel">연 이자율 (%)</div>
                  <input type="number" id="loR" value="4.5" step="0.1" min="0" aria-label="연 이자율 (%)">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">기간 (개월)</div>
                  <input type="number" id="loM" value="360" step="12" min="1" aria-label="기간 (개월)">
                </div>
                <div>
                  <div class="tool-sublabel">상환 방식</div>
                  <select id="loType" aria-label="상환 방식">
                    <option value="ep">원리금균등 — 매달 같은 금액</option>
                    <option value="pp">원금균등 — 점점 줄어듦</option>
                    <option value="bu">만기일시 — 이자만 내다 한 번에</option>
                  </select>
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">거치기간 (개월) — 이자만 내는 기간</div>
                  <input type="number" id="loG" value="0" step="6" min="0" aria-label="거치기간 (개월)">
                </div>
                <div>
                  <div class="tool-sublabel">매달 더 갚기 (원)</div>
                  <input type="number" id="loX" value="0" step="100000" min="0" aria-label="매달 더 갚기 (원)">
                </div>
              </div>
            </div>

            <div class="cc-stats" id="loStats"></div>
            <div class="tool-list" id="loCompare"></div>

            <div class="field-row" style="margin:16px 0 6px;">
              <div class="tool-sublabel" id="loTableHead" style="margin:0;">달별 상환표 — 처음 12개월과 마지막 달</div>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-ghost" id="loAll">전체 보기</button>
                <button class="btn btn-ghost" id="loCsv">표 내려받기</button>
              </div>
            </div>
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

            const grace = Math.max(0, Math.round(parseFloat($<HTMLInputElement>('#loG').value) || 0));
            const extra = Math.max(0, parseFloat($<HTMLInputElement>('#loX').value) || 0);

            const build = type === 'pp' ? equalPrincipal : type === 'bu' ? bullet : equalPayment;
            const 기본 = withGrace(P, rate, grace, build(P, rate, months));
            /* 만기일시는 매달 갚는 원금이 없어서 「더 갚기」의 뜻이 다르다 — 그 방식엔 안 태운다. */
            const rows = type === 'bu' ? 기본 : withExtra(기본, rate, extra);
            const totalInterest = rows.reduce((a, r) => a + r.interest, 0);
            const 원래이자 = 기본.reduce((a, r) => a + r.interest, 0);
            const 아낀이자 = 원래이자 - totalInterest;
            const 줄어든달 = 기본.length - rows.length;

            stats.innerHTML =
              stat(type === 'ep' ? '월 상환액' : '첫 달 상환액', won(rows[0].pay), true) +
              stat('총 이자', won(totalInterest)) +
              stat('총 상환액', won(P + totalInterest)) +
              (grace > 0 ? stat('거치 중 월 이자', won(P * (rate / 100 / 12))) : '') +
              (아낀이자 > 0 ? stat('더 갚아 아낀 이자', won(아낀이자), true) : '') +
              (줄어든달 > 0 ? stat('빨라진 기간', `${줄어든달}개월`) : '');

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

            마지막표 = rows;
            const show = 전체보기 ? rows : [...rows.slice(0, 12), ...(rows.length > 12 ? [rows[rows.length - 1]] : [])];
            $<HTMLElement>('#loTableHead').textContent = 전체보기
              ? `달별 상환표 — ${rows.length}개월 전부`
              : '달별 상환표 — 처음 12개월과 마지막 달';
            table.innerHTML = show
              .map(
                (r) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${r.n}개월</span><span class="tool-list-val">${won(r.pay)} <span class="tool-list-dim">원금 ${won(r.principal)} · 이자 ${won(r.interest)} · 잔액 ${won(r.left)}</span></span></div>`
              )
              .join('');

            const firstRatio = rows[0].pay ? (rows[0].interest / rows[0].pay) * 100 : 0;
            $<HTMLElement>('#loStatus').textContent =
              `첫 달 상환액의 ${firstRatio.toFixed(0)}%가 이자입니다.` +
              (grace > 0 ? ` 거치 ${grace}개월 동안은 원금이 안 줄어듭니다.` : '') +
              (아낀이자 > 0 ? ` 매달 ${won(extra)} 더 갚으면 ${줄어든달}개월 빨리 끝나고 이자 ${won(아낀이자)}을 아낍니다.` : '') +
              ' 부대비용·중도상환수수료는 넣지 않았습니다.';
            Toolbox.trackUse?.(type);
          }

          /* 표를 접어 두는 것이 기본이다 — 360개월을 다 펴면 화면이 통째로 표가 된다.
             그래도 「전부 보고 싶다」는 사람이 있어서 한 번 누르면 편다. */
          let 전체보기 = false;
          let 마지막표: Row[] = [];

          $<HTMLButtonElement>('#loAll').onclick = () => {
            전체보기 = !전체보기;
            $<HTMLButtonElement>('#loAll').textContent = 전체보기 ? '접기' : '전체 보기';
            run();
          };
          /* 표는 옮겨 붙여 쓰는 물건이다 — 엑셀에서 열리는 모양으로 준다.
             한글이 깨지지 않게 앞머리 표식(BOM)을 붙인다. */
          $<HTMLButtonElement>('#loCsv').onclick = () => {
            if (!마지막표.length) return;
            const BR = String.fromCharCode(10);
            const BOM = String.fromCharCode(0xfeff);
            const head = '회차,상환액,원금,이자,잔액';
            const body = 마지막표
              .map((r) => [r.n, Math.round(r.pay), Math.round(r.principal), Math.round(r.interest), Math.round(r.left)].join(','))
              .join(BR);
            const blob = new Blob([BOM + head + BR + body], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '대출상환표.csv';
            a.click();
            URL.revokeObjectURL(url);
            Toolbox.trackUse?.('csv');
          };

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
