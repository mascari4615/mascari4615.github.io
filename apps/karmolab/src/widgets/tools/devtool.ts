/**
 * 데이터·코드 — **붙여넣으면 무엇인지 알아본다** (TASK-KL-088 → TASK-KL-263)
 *
 * 전에는 탭 열둘이었다(JSON·JWT·정규식·해시·UUID·크론·URL·암호화·Base64·CSV·표·타입).
 * PDF·이미지·글과 같은 문제 — 탭을 옮기면 다시 붙여넣어야 했고, 무엇이 있는지 다 읽어야 했다.
 *
 * 여기엔 **하나 더** 있다. JSON Crack 은 붙여넣기만 하면 JSON·CSV·YAML 을 알아서 가르고,
 * JSON Hero 는 값 하나까지 보고 「이건 URL·날짜·색」이라고 말해 준다. 사람은 자기가 든 것이
 * 뭔지 **이미 안다** — 열둘을 다 읽게 할 이유가 없다. 그래서 붙여넣는 순간 갈래를 짚고
 * (`shared/sniff`), 그 갈래의 할 일을 앞에 띄운다. 짚는 것뿐이라 나머지도 그대로 눌린다.
 */
import { materialShell, type MaterialGroup } from './shared/material-shell';
import { sniff, type DataKind } from './shared/sniff';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const GROUPS = (): MaterialGroup[] => [
    {
      label: t('devtool.group.shape', undefined, '모양 잡기'),
      jobs: [
        ['jsonfmt', 'JSON'],
        ['json2ts', t('devtool.part.json2ts', undefined, 'JSON → 타입')],
        ['csvjson', 'CSV ↔ JSON'],
        ['tableconv', t('devtool.part.tableconv', undefined, '표 바꾸기')]
      ]
    },
    {
      label: t('devtool.group.open', undefined, '뜯어보기'),
      jobs: [
        ['jwt', 'JWT'],
        ['base64', 'Base64'],
        ['urlparse', 'URL'],
        ['cron', t('devtool.part.cron', undefined, '크론')]
      ]
    },
    {
      label: t('devtool.group.make', undefined, '만들기'),
      jobs: [
        ['hashgen', t('devtool.part.hashgen', undefined, '해시')],
        ['uuidgen', 'UUID'],
        ['crypto', t('devtool.part.crypto', undefined, '암호화')],
        ['radix', t('devtool.part.radix', undefined, '진법')]
      ]
    },
    {
      label: t('devtool.group.check', undefined, '살펴보기'),
      jobs: [
        ['regextest', t('devtool.part.regextest', undefined, '정규식')],
        ['codeshot', t('devtool.part.codeshot', undefined, '코드 사진')],
        ['epoch', t('devtool.part.epoch', undefined, '유닉스 시각')],
        ['colorconv', t('devtool.part.colorconv', undefined, '색 변환')]
      ]
    }
  ];

  /** 들고 온 것이 없어도 되는 할 일 — 없는 데서 **만드는** 쪽. */
  const NO_INPUT_NEEDED = new Set(['uuidgen', 'crypto', 'cron', 'colorconv']);

  /** 갈래마다 앞에 띄울 할 일. 첫 번째가 「가장 맞는 것」이다. */
  const FOR: Record<DataKind, string[]> = {
    json: ['jsonfmt', 'json2ts', 'csvjson'],
    jwt: ['jwt'],
    base64: ['base64'],
    url: ['urlparse'],
    csv: ['csvjson', 'tableconv'],
    hex: ['hashgen', 'radix'],
    epoch: ['epoch'],
    uuid: ['uuidgen'],
    cron: ['cron'],
    text: []
  };

  Toolbox.register({
    id: 'devtool',
    title: t('widgets.devtool.title', undefined, '개발 도구'),
    category: 'tool',
    desc: t(
      'widgets-desc.devtool.desc',
      undefined,
      'JSON 포맷·JWT 디코드·정규식 테스트·해시·UUID·크론·URL·암호화를 한 곳에서'
    ),
    layout: 'wide',
    icon: '<path d="M9 6 3 12l6 6M15 6l6 6-6 6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('devtool.tab', undefined, '데이터'),
        build: function (container: HTMLElement): void {
          void loadNamespace('devtool').then(function () {
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
      accept: 'text/*,.json,.csv,.txt',
      groups: GROUPS,
      noInputNeeded: NO_INPUT_NEEDED,
      accepts: /^(text|application\/json)/i,
      drop: {
        title: t('devtool.drop.title', undefined, 'JSON·JWT·Base64·표… 아무거나 붙여넣으세요'),
        hint: t('devtool.drop.hint', undefined, '무엇인지 알아보고 맞는 할 일을 짚어 드립니다')
      },
      labels: {
        change: t('devtool.btn.change', undefined, '다시 붙여넣기'),
        back: t('devtool.btn.back', undefined, '할 일 고르기'),
        chain: t('devtool.btn.chain', undefined, '이 결과로 이어서'),
        fail: t('devtool.preview.fail', undefined, '이건 미리 못 봅니다'),
        pasted: t('devtool.pasted', undefined, '붙여넣은 것')
      },
      preview: drawWhat,
      suggest: async (file) => {
        const s = sniff(await file.text());
        const ids = FOR[s.kind] || [];
        return {
          ids,
          why: ids.length
            ? t('devtool.tip', { what: s.why }, `${s.why} 같습니다 — 초록으로 짚은 것이 맞을 거예요`)
            : ''
        };
      }
    });
  }

  /** 왼쪽 칸 = 「무엇인가」 한 줄 + 앞머리. **이 함수만 데이터를 안다.** */
  async function drawWhat(file: File, box: HTMLElement, alive: () => boolean): Promise<string> {
    const v = await file.text();
    if (!alive()) return '';
    const s = sniff(v);

    const badge = document.createElement('div');
    badge.className = 'dv-what';
    badge.id = 'dvWhat';
    badge.dataset.kind = s.kind;
    badge.textContent = s.why || t('devtool.what.plain', undefined, '그냥 글');
    if (s.detail) {
      const d = document.createElement('span');
      d.textContent = s.detail;
      badge.appendChild(d);
    }
    box.appendChild(badge);

    const head = document.createElement('pre');
    head.className = 'dv-head';
    head.id = 'dvHead';
    head.textContent = v.slice(0, 1600);
    box.appendChild(head);

    const chars = [...v].length;
    return t('devtool.meta', { what: s.why || '글', chars }, `${s.why || '글'} · ${chars.toLocaleString()}자`);
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = `
.dv-what{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;margin-bottom:10px;
  padding:8px 12px;border-radius:10px;border:1px solid rgba(128,160,255,.45);background:rgba(128,160,255,.1);}
.dv-what[data-kind="text"]{border-color:rgba(128,128,128,.3);background:rgba(128,128,128,.07);font-weight:500;}
.dv-what span{font-weight:400;font-size:12px;opacity:.7;margin-left:auto;}
.dv-head{margin:0;max-height:44vh;overflow:auto;white-space:pre-wrap;word-break:break-all;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;
  padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,.22);background:rgba(128,128,128,.05);}
`;
    document.head.appendChild(el);
  }
})();
