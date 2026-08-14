/**
 * 글 — **붙여넣고, 할 일은 골라서** (TASK-KL-088 → TASK-KL-262 에서 PDF·이미지와 같은 화면으로)
 *
 * 전에는 여기도 탭 열셋이었다. PDF·이미지와 같은 두 가지가 나빴다: 탭을 옮기면 **글을 다시
 * 붙여넣어야** 했고, 무엇이 있는지 보려면 탭을 다 읽어야 했다.
 *
 * 다만 글은 **파일로 오지 않는다** — 사람은 글을 복사해서 온다. 그래서 같은 껍데기를 쓰되
 * 받는 칸이 다르다(`intake: 'text'`): 놓는 자리 대신 **붙여넣는 칸**이고, 도구에 건네는 자리도
 * 파일 칸이 아니라 **글 칸**이다. 도구 열셋은 여기서도 한 줄도 안 고쳤다.
 *
 * 왼쪽 칸에 그리는 것 = **글자·낱말·줄 수와 앞머리**. 글 작업의 판단은 늘 「얼마나 긴가,
 * 지금 뭐가 들어 있나」에서 갈린다(ConvertCase 도 결과 칸을 늘 띄워 둔다).
 */
import { materialShell, type MaterialGroup } from './shared/material-shell';
import { countText, head as clip } from './shared/text';
import { t, loadNamespace } from '../../lib/i18n';
import { TEXT_OPERATIONS } from './text-operations';
import { mountTextOperation } from './shared/text-operation';

(function (): void {
  const GROUPS = (): MaterialGroup[] => [
    {
      label: t('text.group.tidy', undefined, '다듬기'),
      jobs: [
        ['textclean', t('text.part.textclean', undefined, '정리')],
        ['linebreak', t('text.part.linebreak', undefined, '줄바꿈')],
        ['replace', t('text.part.replace', undefined, '찾아 바꾸기')],
        ['textredact', t('text.part.textredact', undefined, '가리개')],
        ['encdetective', t('text.part.encdetective', undefined, '깨진 글자')],
        ['unicodex', t('text.part.unicodex', undefined, '안 보이는 글자')]
      ]
    },
    {
      label: t('text.group.shape', undefined, '표기 바꾸기'),
      jobs: [
        ['case', t('text.part.caseconv', undefined, '표기법')],
        ['slug', t('text.part.slug', undefined, '슬러그')],
        ['hangulkey', t('text.part.hangulkey', undefined, '한영타')],
        ['jamo', t('text.part.jamo', undefined, '자모 분해')]
      ]
    },
    {
      label: t('text.group.count', undefined, '세기·살펴보기'),
      jobs: [
        ['charcount', t('text.part.charcount', undefined, '글자수')],
        ['wordfreq', t('text.part.wordfreq', undefined, '단어 빈도')],
        ['textdiff', t('text.part.textdiff', undefined, '비교')],
        ['listdiff', t('text.part.listdiff', undefined, '목록 비교')]
      ]
    },
    {
      label: t('text.group.out', undefined, '내보내기'),
      jobs: [
        ['text2pdf', t('text.part.text2pdf', undefined, '글 → PDF')],
        ['text2img', t('text.part.text2img', undefined, '글자 카드')],
        ['tts', t('text.part.tts', undefined, '읽어 주기')],
        ['lorem', t('text.part.lorem', undefined, '더미 텍스트')],
        ['checklist', t('text.part.checklist', undefined, '체크리스트')]
      ]
    }
  ];

  /** 글을 안 들고 와도 되는 할 일 — 없는 데서 글을 **만드는** 쪽. */
  const NO_TEXT_NEEDED = new Set(['lorem', 'checklist']);

  Toolbox.register({
    id: 'text',
    title: t('widgets.text.title', undefined, '텍스트 도구'),
    category: 'tool',
    desc: t(
      'widgets-desc.text.desc',
      undefined,
      '글자수 세기·줄 정리·두 글 비교·표기법 변환·한영타 되돌리기를 한 곳에서'
    ),
    layout: 'wide',
    icon: '<path d="M4 5h16M4 5v2M20 5v2M12 5v14M9 19h6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M4 12h4M4 16h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>',
    tabs: [
      {
        id: 'app',
        label: t('text.tab', undefined, '글'),
        build: function (container: HTMLElement): void {
          void loadNamespace('text').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    injectStyles();
    materialShell(container, {
      id: 'text',
      intake: 'text',
      accept: 'text/*,.txt,.md,.csv',
      groups: GROUPS,
      noInputNeeded: NO_TEXT_NEEDED,
      accepts: /^text\//i,
      drop: {
        title: t('text.drop.title', undefined, '여기에 글을 붙여넣으세요'),
        hint: t('text.drop.hint', undefined, '글은 이 브라우저를 벗어나지 않습니다 · 파일을 끌어다 놓아도 됩니다')
      },
      labels: {
        change: t('text.btn.change', undefined, '다시 붙여넣기'),
        recent: t('text.btn.recent', undefined, '방금 하던 것'),
        back: t('text.btn.back', undefined, '할 일 고르기'),
        chain: t('text.btn.chain', undefined, '이 결과로 이어서'),
        fail: t('text.preview.fail', undefined, '이 글은 미리 못 봅니다'),
        pasted: t('text.pasted', undefined, '붙여넣은 글')
      },
      preview: drawStats
      ,mountOperation: (id, host, input): boolean => {
        const operation = TEXT_OPERATIONS.find((candidate) => candidate.id === id);
        if (!operation) return false;
        mountTextOperation(host, operation, input);
        return true;
      }
    });
  }

  /** 왼쪽 칸 = 세 숫자와 앞머리. **이 함수만 글을 안다.** */
  async function drawStats(file: File, box: HTMLElement, alive: () => boolean): Promise<string> {
    const v = await file.text();
    if (!alive()) return '';
    /* 세는 법은 「글자수」 도구와 **같은 것**을 쓴다 (TASK-KL-275) — 두 화면이 서로 다른 수를
     * 말하면 어느 쪽을 믿어야 할지 알 수 없다. 이모지 한 덩이는 한 자로 센다. */
    const { chars, words, lines } = countText(v);

    const nums = document.createElement('div');
    nums.className = 'tx-nums';
    nums.id = 'txNums';
    for (const [n, label] of [
      [chars, t('text.n.chars', undefined, '글자')],
      [words, t('text.n.words', undefined, '낱말')],
      [lines, t('text.n.lines', undefined, '줄')]
    ] as Array<[number, string]>) {
      const cell = document.createElement('div');
      cell.className = 'tx-num';
      const big = document.createElement('strong');
      big.textContent = n.toLocaleString();
      const cap = document.createElement('span');
      cap.textContent = label;
      cell.appendChild(big);
      cell.appendChild(cap);
      nums.appendChild(cell);
    }
    box.appendChild(nums);

    const head = document.createElement('pre');
    head.className = 'tx-head';
    head.id = 'txHead';
    head.textContent = clip(v, 1200);
    box.appendChild(head);

    return t('text.meta', { chars, lines }, `${chars.toLocaleString()}자 · ${lines.toLocaleString()}줄`);
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = `
.tx-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;}
.tx-num{border:1px solid rgba(128,128,128,.24);border-radius:10px;padding:10px 6px;text-align:center;}
.tx-num strong{display:block;font-size:18px;font-variant-numeric:tabular-nums;}
.tx-num span{font-size:11px;opacity:.6;}
.tx-head{margin:0;max-height:40vh;overflow:auto;white-space:pre-wrap;word-break:break-word;
  font-size:12px;line-height:1.5;padding:10px 12px;border-radius:10px;
  border:1px solid rgba(128,128,128,.22);background:rgba(128,128,128,.05);}
`;
    document.head.appendChild(el);
  }
})();
