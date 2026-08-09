/**
 * 대출 상환 계산기 (TASK-KL-088)
 *
 * 이자 계산기에는 월 상환액만 있다. 실제로 궁금한 건 그 다음이다 —
 * **원금과 이자가 달마다 어떻게 갈리는지**, 중도상환하면 얼마나 줄어드는지.
 * 초반 상환액이 거의 이자라는 사실은 표를 봐야 실감이 나므로 상환표를 편다.
 */
import { bullet, equalPayment, equalPrincipal, spec, withExtra, withGrace, type Row } from '../../core/loan';
import { t, loadNamespace, locale } from '../../lib/i18n';
import { regionMeta } from '../../lib/region';
import { readInvocation } from '../../lib/tool-url';

(function (): void {
  Toolbox.register({
    id: 'loan',
    title: t('widgets.loan.title', undefined, '대출 상환표'),
    category: 'tool',
    desc: t(
      'widgets-desc.loan.desc',
      undefined,
      '원리금균등·원금균등·만기일시 상환을 비교하고 달별 원금·이자를 봅니다'
    ),
    layout: 'wide',
    icon: '<path d="M3 20h18M6 20V10M11 20V6M16 20v-8M21 20v-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('loan.tab', undefined, '상환표'),
        build: function (container: HTMLElement): void {
          void loadNamespace('loan').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          /* 돈은 **사는 곳**의 통화로 적는다 — 알맹이의 `won()` 은 「원」이 박혀 있어
             글로 답하는 쪽(MCP)에만 쓴다. 화면은 그 나라 돈으로 (₩ · ¥ · $). */
          const money = (n: number): string => {
            try {
              return new Intl.NumberFormat(locale(), {
                style: 'currency',
                currency: regionMeta().currency,
                maximumFractionDigits: 0
              }).format(Math.round(n));
            } catch {
              return Math.round(n).toLocaleString(locale());
            }
          };
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('loan.label.amount'))}</div>
                  <input type="number" id="loP" value="100000000" step="1000000" min="0" aria-label="대출 금액">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('loan.label.rate'))}</div>
                  <input type="number" id="loR" value="4.5" step="0.1" min="0" aria-label="연 이자율 (%)">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('loan.label.months'))}</div>
                  <input type="number" id="loM" value="360" step="12" min="1" aria-label="기간 (개월)">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('loan.label.method'))}</div>
                  <select id="loType" aria-label="상환 방식">
                    <option value="ep">${esc(t('loan.method.ep'))}</option>
                    <option value="pp">${esc(t('loan.method.pp'))}</option>
                    <option value="bu">${esc(t('loan.method.bu'))}</option>
                  </select>
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('loan.label.grace'))}</div>
                  <input type="number" id="loG" value="0" step="6" min="0" aria-label="거치기간 (개월)">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('loan.label.extra'))}</div>
                  <input type="number" id="loX" value="0" step="100000" min="0" aria-label="매달 더 갚기 (원)">
                </div>
              </div>
            </div>

            <div class="cc-stats" id="loStats"></div>
            <div class="tool-list" id="loCompare"></div>

            <div class="field-row" style="margin:16px 0 6px;">
              <div class="tool-sublabel" id="loTableHead" style="margin:0;">${esc(t('loan.table.head'))}</div>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-ghost" id="loAll">${esc(t('loan.btn.all'))}</button>
                <button class="btn btn-ghost" id="loCsv">${esc(t('loan.btn.csv'))}</button>
              </div>
            </div>
            <div class="tool-list" id="loTable"></div>
            <div class="tool-status" id="loStatus">${esc(t('loan.status.idle'))}</div>
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
              stat(t(type === 'ep' ? 'loan.stat.monthly' : 'loan.stat.firstMonth'), money(rows[0].pay), true) +
              stat(t('loan.stat.totalInterest'), money(totalInterest)) +
              stat(t('loan.stat.totalPaid'), money(P + totalInterest)) +
              (grace > 0 ? stat(t('loan.stat.graceInterest'), money(P * (rate / 100 / 12))) : '') +
              (아낀이자 > 0 ? stat(t('loan.stat.saved'), money(아낀이자), true) : '') +
              (줄어든달 > 0 ? stat(t('loan.stat.faster'), t('loan.value.months', { n: 줄어든달 })) : '');

            // 세 방식을 나란히 놓아야 「총이자가 적은 대신 초반이 무겁다」 는 맞바꿈이 보인다
            const alts: Array<[string, Row[]]> = [
              [t('loan.name.ep'), equalPayment(P, rate, months)],
              [t('loan.name.pp'), equalPrincipal(P, rate, months)],
              [t('loan.name.bu'), bullet(P, rate, months)]
            ];
            compare.innerHTML = alts
              .map(([name, rs]) => {
                const ti = rs.reduce((a, r) => a + r.interest, 0);
                return row(name, t('loan.compare.line', { total: money(ti), first: money(rs[0].pay) }));
              })
              .join('');

            마지막표 = rows;
            const show = 전체보기 ? rows : [...rows.slice(0, 12), ...(rows.length > 12 ? [rows[rows.length - 1]] : [])];
            $<HTMLElement>('#loTableHead').textContent = 전체보기
              ? `달별 상환표 — ${rows.length}개월 전부`
              : t('loan.table.head');
            table.innerHTML = show
              .map(
                (r) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${esc(t('loan.row.month', { n: r.n }))}</span><span class="tool-list-val">${money(
                    r.pay
                  )} <span class="tool-list-dim">${esc(
                    t('loan.row.detail', {
                      principal: money(r.principal),
                      interest: money(r.interest),
                      left: money(r.left)
                    })
                  )}</span></span></div>`
              )
              .join('');

            const firstRatio = rows[0].pay ? (rows[0].interest / rows[0].pay) * 100 : 0;
            $<HTMLElement>('#loStatus').textContent =
              t('loan.status.ratio', { pct: firstRatio.toFixed(0) }) +
              (grace > 0 ? t('loan.status.grace', { n: grace }) : '') +
              (아낀이자 > 0
                ? t('loan.status.extra', {
                    extra: money(extra),
                    months: 줄어든달,
                    saved: money(아낀이자)
                  })
                : '') +
              t('loan.status.note');
            Toolbox.trackUse?.(type);
          }

          /* 표를 접어 두는 것이 기본이다 — 360개월을 다 펴면 화면이 통째로 표가 된다.
             그래도 「전부 보고 싶다」는 사람이 있어서 한 번 누르면 편다. */
          let 전체보기 = false;
          let 마지막표: Row[] = [];

          $<HTMLButtonElement>('#loAll').onclick = () => {
            전체보기 = !전체보기;
            $<HTMLButtonElement>('#loAll').textContent = t(전체보기 ? 'loan.btn.fold' : 'loan.btn.all');
            run();
          };
          /* 표는 옮겨 붙여 쓰는 물건이다 — 엑셀에서 열리는 모양으로 준다.
             한글이 깨지지 않게 앞머리 표식(BOM)을 붙인다. */
          $<HTMLButtonElement>('#loCsv').onclick = () => {
            if (!마지막표.length) return;
            const BR = String.fromCharCode(10);
            const BOM = String.fromCharCode(0xfeff);
            const head = t('loan.csv.head');
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
})();
