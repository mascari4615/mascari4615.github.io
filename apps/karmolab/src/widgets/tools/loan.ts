/**
 * 대출 상환 계산기 (TASK-KL-088)
 *
 * 이자 계산기에는 월 상환액만 있다. 실제로 궁금한 건 그 다음이다 —
 * **원금과 이자가 달마다 어떻게 갈리는지**, 중도상환하면 얼마나 줄어드는지.
 * 초반 상환액이 거의 이자라는 사실은 표를 봐야 실감이 나므로 상환표를 편다.
 */
import { bullet, equalPayment, equalPrincipal, spec, withExtra, withGrace, won, type Row } from '../../core/loan';
import { readInvocation } from '../../lib/tool-url';

(function (): void {
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

          // 주소로 부른 경우 (`?op=schedule&amount=…&rate=…&months=…&method=principal`) (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined) {
            $<HTMLInputElement>('#loP').value = String(call.args.amount ?? $<HTMLInputElement>('#loP').value);
            $<HTMLInputElement>('#loR').value = String(call.args.rate ?? $<HTMLInputElement>('#loR').value);
            $<HTMLInputElement>('#loM').value = String(call.args.months ?? $<HTMLInputElement>('#loM').value);
            if (call.args.grace !== undefined) $<HTMLInputElement>('#loG').value = String(call.args.grace);
            if (call.args.extra !== undefined) $<HTMLInputElement>('#loX').value = String(call.args.extra);
            const m = String(call.args.method ?? 'equal');
            $<HTMLSelectElement>('#loType').value = m === 'principal' ? 'pp' : m === 'bullet' ? 'bu' : 'ep';
          }
          run();
        }
      }
    ]
  });
})();
