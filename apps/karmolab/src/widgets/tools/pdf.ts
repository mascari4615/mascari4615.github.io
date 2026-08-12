/**
 * PDF 도구 — **파일 하나, 할 일은 골라서** (KL-088 → KL-259 화면 갈아엎음 → KL-260 레퍼런스 → KL-261 공용화)
 *
 * 전에는 할 일 열하나가 **탭으로 나란히** 있었다. 두 가지가 나빴다(2026-08-13 사용자):
 *   ① 탭 열한 개가 한 줄에 늘어서 「이쁘지도 않고 가독성도 안 좋다」 — 고르려면 다 읽어야 한다.
 *   ② 탭을 옮기면 **파일을 다시 올려야** 했다. 자르고 나서 쪽번호를 넣으려면 두 번 올린다.
 *
 * 그래서 순서를 뒤집었다: **손에 든 것(파일)이 먼저, 할 일은 그다음.**
 * 사람은 「PDF 를 어쩌지」를 들고 오지 「여백 자르기를 하고 싶다」를 들고 오지 않는다.
 *
 * 그 껍데기는 이제 `shared/material-shell` 에 있다 — 이미지·영상·소리도 같은 화면을 쓴다.
 * **이 파일에 남은 것은 「PDF 다움」뿐이다**: 무엇을 받나 · 왼쪽에 무엇을 그리나 · 할 일 목록.
 *
 * 왼쪽에 그리는 것 = **쪽 격자** (Sejda Organize 를 보고 바꿨다, [[TASK-KL-260]]).
 * 「1 / 12 ◀ ▶」 로 한 장씩 넘기는 건 문서를 **모르는 채로** 다루게 한다. 어디를 자를지,
 * 어느 쪽에 서명할지는 전 쪽이 한눈에 보일 때 정해진다.
 */
import { openForRead, renderPage } from './shared/pdf';
import { fileSize } from './shared/media';
import { materialShell, type MaterialGroup } from './shared/material-shell';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** 할 일 — 갈래별로 묶어 격자에 놓는다. 새 도구는 여기 한 줄. */
  const GROUPS = (): MaterialGroup[] => [
    {
      label: t('pdf.group.pages', undefined, '쪽 다루기'),
      jobs: [
        ['pdftool', t('pdf.part.pdftool', undefined, '합치기·나누기')],
        ['pdfcrop', t('pdf.part.pdfcrop', undefined, '여백 자르기')],
        ['pdfcompress', t('pdf.part.pdfcompress', undefined, '용량 줄이기')]
      ]
    },
    {
      label: t('pdf.group.stamp', undefined, '얹기'),
      jobs: [
        ['pdfsign', t('pdf.part.pdfsign', undefined, '서명 넣기')],
        ['pdfpagenum', t('pdf.part.pdfpagenum', undefined, '쪽 번호')],
        ['pdfwatermark', t('pdf.part.pdfwatermark', undefined, '워터마크')]
      ]
    },
    {
      label: t('pdf.group.hide', undefined, '가리기'),
      jobs: [['pdfredact', t('pdf.part.pdfredact', undefined, 'PDF 가리개')]]
    },
    {
      label: t('pdf.group.convert', undefined, '바꾸기'),
      jobs: [
        ['pdf2text', t('pdf.part.pdf2text', undefined, 'PDF → 글자')],
        ['pdf2img', t('pdf.part.pdf2img', undefined, 'PDF → 이미지')],
        ['text2pdf', t('pdf.part.text2pdf', undefined, '글 → PDF')],
        ['img2pdf', t('pdf.part.img2pdf', undefined, '이미지 → PDF')]
      ]
    }
  ];

  /** 파일을 안 들고 와도 되는 할 일 — 다른 것에서 PDF 를 **만드는** 쪽. */
  const NO_PDF_NEEDED = new Set(['text2pdf', 'img2pdf']);

  /** 한 번에 그릴 쪽 수. 나머지는 「더 보기」로 잇는다 — 200쪽을 한꺼번에 그리면 화면이 멎는다. */
  const CHUNK = 24;

  Toolbox.register({
    id: 'pdf',
    title: t('widgets.pdf.title', undefined, 'PDF 도구'),
    category: 'tool',
    desc: t(
      'widgets-desc.pdf.desc',
      undefined,
      'PDF 를 합치고 나누고 줄이고, 서명·워터마크를 넣습니다. 문서가 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.5 13h7M8.5 16.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('pdf.tab', undefined, 'PDF'),
        build: function (container: HTMLElement): void {
          void loadNamespace('pdf').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    injectStyles();
    materialShell(container, {
      accept: 'application/pdf,.pdf',
      groups: GROUPS,
      noInputNeeded: NO_PDF_NEEDED,
      accepts: /pdf/i,
      drop: {
        title: t('pdf.drop.title', undefined, 'PDF 를 여기에 놓거나 눌러서 고르세요'),
        hint: t('pdf.drop.hint', undefined, '문서는 이 브라우저를 벗어나지 않습니다')
      },
      labels: {
        change: t('pdf.btn.change', undefined, '바꾸기'),
        back: t('pdf.btn.back', undefined, '할 일 고르기'),
        chain: t('pdf.btn.chain', undefined, '이 결과로 이어서'),
        fail: t('pdf.preview.fail', undefined, '이 문서는 미리 못 봅니다')
      },
      preview: drawGrid
    });
  }

  /** 왼쪽 칸 = **쪽 격자**. 이 함수만 PDF 를 안다. */
  async function drawGrid(file: File, box: HTMLElement, alive: () => boolean): Promise<string> {
    const doc = await openForRead(file);
    const pages = document.createElement('div');
    pages.className = 'pf-pages';
    pages.id = 'pfPages';
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'btn pf-more';
    more.id = 'pfMore';
    more.hidden = true;
    box.appendChild(pages);
    box.appendChild(more);

    let drawn = 0;
    async function drawMore(): Promise<void> {
      const end = Math.min(doc.numPages, drawn + CHUNK);
      for (let n = drawn + 1; n <= end; n++) {
        if (!alive()) return; // 파일이 바뀌었다 — 옛 그림을 붙이지 않는다
        try {
          const page = await doc.getPage(n);
          const { canvas } = await renderPage(page, 0.34);
          if (!alive()) return;
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'pf-thumb';
          cell.dataset.page = String(n);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          cell.appendChild(canvas);
          const tag = document.createElement('span');
          tag.textContent = String(n);
          cell.appendChild(tag);
          cell.onclick = (): void => void zoom(file, n, doc.numPages);
          pages.appendChild(cell);
        } catch {
          /* 한 쪽을 못 그려도 나머지는 보여 준다 */
        }
      }
      drawn = end;
      more.hidden = drawn >= doc.numPages;
      more.textContent = t('pdf.btn.more', { n: doc.numPages - drawn }, `더 보기 (${doc.numPages - drawn}쪽)`);
    }
    more.onclick = (): void => void drawMore();
    await drawMore();

    return t('pdf.meta', { n: doc.numPages, size: fileSize(file.size) }, `${doc.numPages}쪽 · ${fileSize(file.size)}`);
  }

  /** 눌러서 크게 — 작은 격자만 있으면 「이 쪽이 맞나」를 확인할 수가 없다. */
  async function zoom(file: File, n: number, total: number): Promise<void> {
    const back = document.createElement('div');
    back.className = 'pf-zoom';
    back.id = 'pfZoom';
    back.innerHTML = `<div class="pf-zoom-inner"><span class="pf-zoom-tag">${n} / ${total}</span></div>`;
    back.onclick = (): void => back.remove();
    document.body.appendChild(back);
    try {
      const doc = await openForRead(file);
      const page = await doc.getPage(Math.min(n, doc.numPages));
      const { canvas } = await renderPage(page, 1.6);
      canvas.style.maxWidth = '100%';
      canvas.style.maxHeight = '82vh';
      canvas.style.height = 'auto';
      back.querySelector('.pf-zoom-inner')?.appendChild(canvas);
    } catch {
      back.remove();
    }
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = `
.pf-pages{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;
  max-height:60vh;overflow:auto;padding:2px;}
.pf-thumb{position:relative;appearance:none;padding:0;cursor:zoom-in;background:#fff;
  border:1px solid rgba(128,128,128,.3);border-radius:6px;overflow:hidden;line-height:0;}
.pf-thumb:hover{border-color:rgba(128,160,255,.7);box-shadow:0 0 0 2px rgba(128,160,255,.25);}
.pf-thumb span{position:absolute;right:3px;bottom:3px;font-size:10px;line-height:1;padding:2px 4px;
  border-radius:4px;background:rgba(0,0,0,.6);color:#fff;}
.pf-more{margin-top:8px;width:100%;}
.pf-zoom{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.78);cursor:zoom-out;
  display:flex;align-items:center;justify-content:center;padding:16px;}
.pf-zoom-inner{position:relative;max-width:100%;}
.pf-zoom-tag{position:absolute;left:0;top:-22px;font-size:12px;color:#fff;opacity:.8;}
`;
    document.head.appendChild(el);
  }
})();
