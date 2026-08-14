/**
 * 수·돈 — **셈 공책** (TASK-KL-088 → TASK-KL-264)
 *
 * 전에는 탭 열셋이었다(퍼센트·이자·BMI·단위·진법·부가세·대출…). 전부 **칸 채우는 양식**이다.
 * 양식은 「이 하나」를 셀 때는 빠른데, **여러 개를 이어서** 셀 때 무너진다 —
 * 「밥값 더하고 → 부가세 붙이고 → 넷으로 나누면 1인당」 은 양식 세 번에 종이 한 장이다.
 *
 * 바깥에서 이걸 제대로 하는 것이 **Soulver·Numi**(공책 계산기)다. 한 줄씩 적으면 그 줄의 답이
 * 서고, 앞 줄을 이름으로 부르고, 「25% of 400」·「3km in mi」 가 그대로 통한다.
 * 그래서 이 화면의 가운데는 **공책**이고(`shared/calc`), 도구 열셋은 옆의 할 일로 남는다 —
 * 정확한 상환표·학점 계산은 그쪽이 낫다. 공책은 **이어서 셈하는 자리**다.
 */
import { materialShell, type MaterialGroup } from './shared/material-shell';
import { calcSheet, type Plot } from './shared/calc';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const GROUPS = (): MaterialGroup[] => [
    {
      label: t('calc.group.money', undefined, '돈'),
      jobs: [
        ['vat', t('calc.part.vat', undefined, '부가세')],
        ['interest', t('calc.part.interest', undefined, '이자')],
        ['loan', t('calc.part.loan', undefined, '대출 상환')],
        ['dutchpay', t('calc.part.dutchpay', undefined, '나눠 내기')],
        ['payslip', t('calc.part.payslip', undefined, '실수령액')],
        ['percent', t('calc.part.percent', undefined, '퍼센트')]
      ]
    },
    {
      label: t('calc.group.convert', undefined, '바꾸기'),
      jobs: [
        ['unitconv', t('calc.part.unitconv', undefined, '단위')],
        ['radix', t('calc.part.radix', undefined, '진법')],
        ['numword', t('calc.part.numword', undefined, '숫자 ↔ 한글')],
        ['bytesize', t('calc.part.bytesize', undefined, '용량')]
      ]
    },
    {
      label: t('calc.group.body', undefined, '몸·비율'),
      jobs: [
        ['bmi', 'BMI'],
        ['pace', t('calc.part.pace', undefined, '달리기 페이스')],
        ['aspect', t('calc.part.aspect', undefined, '비율')],
        ['cssunit', t('calc.part.cssunit', undefined, 'CSS 단위')]
      ]
    },
    {
      label: t('calc.group.check', undefined, '따져보기'),
      jobs: [
        ['grade', t('calc.part.grade', undefined, '학점')],
        ['bizno', t('calc.part.bizno', undefined, '사업자번호')]
      ]
    }
  ];

  /* 수·돈 도구는 전부 **자기 칸에 숫자를 받는** 양식이라, 공책의 글을 넘겨줄 자리가 없다.
   * 넘기는 시늉을 하면 엉뚱한 칸에 들어간다 — 아예 안 넘긴다. */
  const NO_INPUT_NEEDED = new Set(GROUPS().flatMap((g) => g.jobs.map(([id]) => id)));

  /** 적어 둔 공책을 두는 자리 */
  const KEEP = 'calc_sheet';

  const SAMPLE = ['밥값 = 32000', '술값 = 18000', '밥값 + 술값', '앞 + 10%', '앞 / 4'].join('\n');

  Toolbox.register({
    id: 'calc',
    title: t('widgets.calc.title', undefined, '계산기'),
    category: 'tool',
    desc: t('widgets-desc.calc.desc', undefined, '퍼센트·이자·BMI·단위·진법 계산을 한 곳에서'),
    layout: 'wide',
    icon: '<rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 7h8M8 12h2M12 12h2M16 12h1M8 16h2M12 16h2M16 16h1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('calc.tab', undefined, '셈 공책'),
        build: function (container: HTMLElement): void {
          void loadNamespace('calc').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    injectStyles();
    materialShell(container, {
      id: 'calc',
      intake: 'text',
      live: true,
      accept: 'text/*',
      groups: GROUPS,
      noInputNeeded: NO_INPUT_NEEDED,
      accepts: /^text\//i,
      drop: {
        title: t('calc.drop.title', undefined, '한 줄씩 적으면 그 줄의 답이 옆에 섭니다'),
        hint: t(
          'calc.drop.hint',
          undefined,
          '밥값 = 32000 · 앞 + 10% · 3km in mi · 25% of 400 · 합계'
        )
      },
      labels: {
        change: t('calc.btn.change', undefined, '지우고 새로'),
        recent: t('calc.btn.recent', undefined, '방금 하던 것'),
        back: t('calc.btn.back', undefined, '할 일 고르기'),
        chain: t('calc.btn.chain', undefined, '이 결과로 이어서'),
        fail: t('calc.preview.fail', undefined, '이건 못 셉니다'),
        pasted: t('calc.pasted', undefined, '셈 공책')
      },
      preview: drawSheet
    });

    /* **공책은 남는다** (TASK-KL-288 — Soulver 의 「시트」를 우리 크기로 줄인 것).
     * 정산은 한 번에 안 끝난다 — 창을 닫았다 와도 어제 적던 줄이 그대로 있어야 공책이다.
     * 처음 오는 사람에게는 예시를 적어 둔다(빈 칸에 「무엇을 쓰는 곳인지」를 글로 설명하면 안 읽는다). */
    const box = container.querySelector<HTMLTextAreaElement>('#pfText');
    if (box && !box.value) {
      box.value = Toolbox.getPref?.(KEEP, '') || SAMPLE;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (box) {
      box.addEventListener('input', () => {
        /* 지우고 새로 쓸 때 빈 칸도 그대로 기억한다 — 「지웠는데 또 나온다」가 제일 나쁘다 */
        Toolbox.setPref?.(KEEP, box.value);
      });
    }
  }

  /** 왼쪽 칸 = 줄마다의 답. **이 함수만 셈을 안다.** */
  async function drawSheet(file: File, box: HTMLElement, alive: () => boolean): Promise<string> {
    const v = await file.text();
    if (!alive()) return '';
    const lines = calcSheet(v);

    const sheet = document.createElement('div');
    sheet.className = 'ca-sheet';
    sheet.id = 'caSheet';
    let counted = 0;
    let total = 0;
    for (const l of lines) {
      const row = document.createElement('div');
      row.className = 'ca-row';
      if (l.error) row.classList.add('ca-bad');
      const src = document.createElement('span');
      src.className = 'ca-src';
      src.textContent = l.raw || ' ';
      const ans = document.createElement('span');
      ans.className = 'ca-ans';
      ans.textContent = l.text || (l.error ? '?' : '');
      if (l.error) ans.title = l.error;
      /* 답은 **눌러서 복사**된다 — 셈한 값을 다른 데 옮겨 적으려고 보는 것이다.
       * (Soulver 도 답 쪽을 따로 집게 해 둔다. 줄 전체를 복사하면 식까지 딸려 간다.) */
      if (l.value !== null) {
        ans.classList.add('ca-copy');
        ans.title = t('calc.copy.hint', undefined, '눌러서 답 복사');
        ans.onclick = (): void => {
          void Toolbox.copyText?.(String(l.value), { message: t('calc.copy.done', { v: l.text }, `복사: ${l.text}`) });
        };
      }
      row.appendChild(src);
      row.appendChild(ans);
      sheet.appendChild(row);
      /* 그리는 줄이면 **그 줄 밑에** 그림을 둔다 (TASK-KL-238 / 13) — 공책은 위에서 아래로 읽는다.
       * 그림을 따로 모아 두면 어느 식의 그림인지 다시 찾아야 한다. */
      if (l.plot) {
        ans.textContent = t('calc.plot.mark', undefined, '그림');
        sheet.appendChild(plotRow(l.plot));
      }
      if (l.value !== null) {
        counted += 1;
        total += l.value;
      }
    }
    box.appendChild(sheet);

    /* 마지막 답이 대개 **찾던 것**이다 — 파일 줄에 그걸 올린다 */
    const lastVal = [...lines].reverse().find((l) => l.value !== null);
    return t(
      'calc.meta',
      { n: counted, last: lastVal?.text || '' },
      lastVal ? `${counted}줄 셈 · 마지막 ${lastVal.text}` : `${counted}줄 셈`
    ) + (counted > 1 ? ` · ${t('calc.sum', undefined, '합')} ${total.toLocaleString('ko-KR')}` : '');
  }

  /**
   * 표본을 선으로. **자를 같이 그린다** — 눈금 없는 곡선은 모양만 보여 주고 값을 못 읽게 한다.
   * SVG 한 장이라 저장·복사도 그대로 된다(그림 파일을 만들 필요가 없다).
   */
  function plotRow(p: Plot): HTMLElement {
    const W = 320;
    const H = 140;
    const pad = 4;
    const sx = (x: number): number => pad + ((x - p.from) / (p.to - p.from)) * (W - pad * 2);
    const sy = (y: number): number => H - pad - ((y - p.minY) / (p.maxY - p.minY)) * (H - pad * 2);
    const d = p.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join(' ');
    const axes: string[] = [];
    if (p.minY <= 0 && p.maxY >= 0) axes.push(`M${pad} ${sy(0).toFixed(1)} H${W - pad}`);
    if (p.from <= 0 && p.to >= 0) axes.push(`M${sx(0).toFixed(1)} ${pad} V${H - pad}`);

    const row = document.createElement('div');
    row.className = 'ca-row ca-plotrow';
    row.innerHTML =
      `<svg class="ca-plot" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img"` +
      ` aria-label="${esc(t('calc.plot.alt', { expr: p.expr, from: String(p.from), to: String(p.to) }, `${p.expr} 그래프`))}">` +
      `<path d="${axes.join(' ')}" stroke="currentColor" stroke-width="1" opacity=".25" fill="none"/>` +
      `<path d="${d}" fill="none" stroke="var(--accent, #6aa9ff)" stroke-width="1.8" stroke-linejoin="round"/>` +
      '</svg>' +
      `<span class="ca-plotmeta">x ${p.from}~${p.to} · y ${fmtShort(p.minY)}~${fmtShort(p.maxY)}</span>`;
    return row;
  }

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmtShort = (n: number): string => (Math.abs(n) >= 1000 ? n.toExponential(1) : String(Math.round(n * 100) / 100));

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = `
.ca-sheet{border:1px solid rgba(128,128,128,.22);border-radius:10px;overflow:hidden;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;}
.ca-row{display:flex;gap:10px;align-items:baseline;padding:5px 10px;
  border-bottom:1px solid rgba(128,128,128,.12);}
.ca-row:last-child{border-bottom:0;}
.ca-src{flex:1;min-width:0;white-space:pre-wrap;word-break:break-all;opacity:.75;}
.ca-copy{cursor:copy;}
.ca-copy:hover{text-decoration:underline;}
.ca-ans{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--accent,#6aa9ff);}
.ca-bad .ca-ans{color:rgba(220,120,120,.9);font-weight:500;cursor:help;}
.ca-plotrow{display:block;padding:8px 10px;}
.ca-plot{display:block;color:var(--text-secondary,#999);}
.ca-plotmeta{display:block;margin-top:4px;font-size:11px;opacity:.6;}
`;
    document.head.appendChild(el);
  }
})();
