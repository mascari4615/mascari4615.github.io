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
import { calcSheet } from './shared/calc';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const GROUPS = (): MaterialGroup[] => [
    {
      label: t('calc.group.money', undefined, '돈'),
      jobs: [
        ['vat', t('calc.part.vat', undefined, '부가세')],
        ['interest', t('calc.part.interest', undefined, '이자')],
        ['loan', t('calc.part.loan', undefined, '대출 상환')],
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
        back: t('calc.btn.back', undefined, '할 일 고르기'),
        chain: t('calc.btn.chain', undefined, '이 결과로 이어서'),
        fail: t('calc.preview.fail', undefined, '이건 못 셉니다'),
        pasted: t('calc.pasted', undefined, '셈 공책')
      },
      preview: drawSheet
    });

    /* 빈 화면에 「무엇을 쓰라는 건지」를 글로 설명하면 아무도 안 읽는다 — **한 판 적어 둔다.**
     * 사람이 지우고 자기 것을 쓰면 그만이다. */
    const box = container.querySelector<HTMLTextAreaElement>('#pfText');
    if (box && !box.value) {
      box.value = SAMPLE;
      box.dispatchEvent(new Event('input', { bubbles: true }));
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
      row.appendChild(src);
      row.appendChild(ans);
      sheet.appendChild(row);
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
.ca-ans{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--accent,#6aa9ff);}
.ca-bad .ca-ans{color:rgba(220,120,120,.9);font-weight:500;cursor:help;}
`;
    document.head.appendChild(el);
  }
})();
