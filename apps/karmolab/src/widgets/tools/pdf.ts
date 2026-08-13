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
import { openForRead, openForEdit, loadPdfLib, pdfBlob, renderPage, suffixName } from './shared/pdf';
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

  /* ── 쪽 위에서 바로 고치기 (TASK-KL-282) ─────────────────────────
   *
   * Sejda Organize 가 하는 것 중 우리에게 없던 것: **격자 위에서 돌리고 빼기**.
   * 고친 것은 화면에만 쌓아 두었다가 「바뀐 대로 만들기」를 누를 때 한 번에 새 PDF 로 만든다.
   * 그리고 그 결과를 **손에 든 파일로 갈아 끼운다** — 이어서 쪽번호를 넣든 압축하든 그대로 이어진다.
   */
  let turns = new Map<number, number>();
  let tossed = new Set<number>();
  let editBar: HTMLElement | null = null;

  function refreshEditBar(): void {
    if (!editBar) return;
    const n = turns.size + tossed.size;
    editBar.hidden = n === 0;
    const label = editBar.querySelector('span');
    if (label) {
      label.textContent = t(
        'pdf.edit.count',
        { turn: turns.size, drop: tossed.size },
        `돌린 쪽 ${turns.size} · 뺀 쪽 ${tossed.size}`
      );
    }
  }

  /** 오른쪽으로 90°. 화면은 곧바로 돌려 보여 주고, 실제 문서는 만들 때 돌린다. */
  function turn(n: number, cell: HTMLElement, canvas: HTMLCanvasElement): void {
    const deg = ((turns.get(n) || 0) + 90) % 360;
    if (deg === 0) turns.delete(n);
    else turns.set(n, deg);
    /* 돌리면 가로세로가 바뀐다 — 칸 안에 들어가게 줄여 준다(안 그러면 옆칸을 덮는다). */
    const side = deg % 180 === 90;
    canvas.style.transform = `rotate(${deg}deg)${side ? ' scale(0.72)' : ''}`;
    refreshEditBar();
  }

  /** 뺄 쪽은 **지우지 않고 표시만** 한다 — 한 번 더 누르면 되살아난다. */
  function toss(n: number, cell: HTMLElement): void {
    if (tossed.has(n)) tossed.delete(n);
    else tossed.add(n);
    cell.classList.toggle('pf-tossed', tossed.has(n));
    refreshEditBar();
  }

  /** 모아 둔 것을 한 번에 새 PDF 로. 그리고 그 결과가 곧 다음 판의 입력이 된다. */
  async function applyEdits(file: File): Promise<void> {
    const bar = document.getElementById('pfApply') as HTMLButtonElement | null;
    if (bar) bar.disabled = true;
    try {
      const lib = await loadPdfLib();
      const doc = await openForEdit(file);
      /* 뒤에서부터 빼야 한다 — 앞에서 빼면 뒤쪽 번호가 밀려 엉뚱한 쪽이 빠진다. */
      const drop = [...tossed].sort((a, b) => b - a);
      const list = doc.getPages();
      for (const [n, deg] of turns) {
        if (tossed.has(n)) continue; // 뺄 쪽은 돌릴 필요가 없다
        const page = list[n - 1];
        if (!page) continue;
        page.setRotation(lib.degrees(((page.getRotation().angle || 0) + deg) % 360));
      }
      for (const n of drop) doc.removePage(n - 1);
      const bytes = await doc.save();
      const blob = pdfBlob(bytes);
      const name = suffixName(file.name, t('pdf.edit.suffix', undefined, '-정리'));
      /* 내려주지 않는다 — **손에 든 파일로 갈아 끼운다**. 사람이 원하면 다음 할 일에서 받는다. */
      Toolbox.offerResult?.({ blob, name, from: 'pdf' });
      window.dispatchEvent(
        new CustomEvent('karmolab-result', { detail: { type: 'application/pdf', name, size: blob.size, from: 'pdf' } })
      );
      const input = document.getElementById('pfFile') as HTMLInputElement | null;
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(new File([blob], name, { type: 'application/pdf' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch {
      const label = editBar?.querySelector('span');
      if (label) label.textContent = t('pdf.edit.fail', undefined, '이 문서는 못 고칩니다');
    } finally {
      if (bar) bar.disabled = false;
    }
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

    /* 고친 것은 **아직 파일이 아니다** — 다 고르고 나서 한 번에 새 PDF 로 만든다.
     * 쪽마다 곧바로 파일을 다시 쓰면 200쪽짜리에서 화면이 멎는다. */
    turns = new Map();
    tossed = new Set();
    editBar = document.createElement('div');
    editBar.className = 'pf-editbar';
    editBar.id = 'pfEditBar';
    editBar.hidden = true;
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn btn-primary';
    apply.id = 'pfApply';
    apply.textContent = t('pdf.btn.apply', undefined, '바뀐 대로 만들기');
    apply.onclick = (): void => void applyEdits(file);
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'btn';
    undo.id = 'pfUndo';
    undo.textContent = t('pdf.btn.undoAll', undefined, '되돌리기');
    undo.onclick = (): void => {
      turns.clear();
      tossed.clear();
      pages.querySelectorAll<HTMLElement>('.pf-thumb').forEach((c) => {
        c.classList.remove('pf-tossed');
        const cv = c.querySelector<HTMLElement>('canvas');
        if (cv) cv.style.transform = '';
      });
      refreshEditBar();
    };
    editBar.appendChild(document.createElement('span'));
    editBar.appendChild(apply);
    editBar.appendChild(undo);
    box.appendChild(editBar);

    let drawn = 0;
    async function drawMore(): Promise<void> {
      const end = Math.min(doc.numPages, drawn + CHUNK);
      for (let n = drawn + 1; n <= end; n++) {
        if (!alive()) return; // 파일이 바뀌었다 — 옛 그림을 붙이지 않는다
        try {
          const page = await doc.getPage(n);
          const { canvas } = await renderPage(page, 0.34);
          if (!alive()) return;
          const cell = document.createElement('div');
          cell.className = 'pf-thumb';
          cell.dataset.page = String(n);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          const see = document.createElement('button');
          see.type = 'button';
          see.className = 'pf-see';
          see.title = t('pdf.thumb.zoom', undefined, '크게 보기');
          see.appendChild(canvas);
          see.onclick = (): void => void zoom(file, n, doc.numPages);
          cell.appendChild(see);
          const tag = document.createElement('span');
          tag.className = 'pf-no';
          tag.textContent = String(n);
          cell.appendChild(tag);

          /* **쪽 위에서 바로 돌리고 지운다** (TASK-KL-282 — Sejda Organize 를 보고).
           * 여태 격자는 보기만 했다. 그런데 사람이 쪽을 들여다보는 이유의 태반이
           * 「이 쪽 뒤집혔네」·「이 쪽 빼야지」다 — 그걸 하려고 다른 도구로 옮겨 가야 했다. */
          const bar = document.createElement('div');
          bar.className = 'pf-acts';
          const spin = document.createElement('button');
          spin.type = 'button';
          spin.className = 'pf-act';
          spin.dataset.act = 'rotate';
          spin.title = t('pdf.thumb.rotate', undefined, '오른쪽으로 90° 돌리기');
          spin.textContent = '⟳';
          spin.onclick = (): void => turn(n, cell, canvas);
          const kill = document.createElement('button');
          kill.type = 'button';
          kill.className = 'pf-act';
          kill.dataset.act = 'drop';
          kill.title = t('pdf.thumb.drop', undefined, '이 쪽 빼기');
          kill.textContent = '✕';
          kill.onclick = (): void => toss(n, cell);
          bar.appendChild(spin);
          bar.appendChild(kill);
          cell.appendChild(bar);
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
.pf-thumb{position:relative;padding:0;background:#fff;
  border:1px solid rgba(128,128,128,.3);border-radius:6px;overflow:hidden;line-height:0;}
.pf-thumb:hover{border-color:rgba(128,160,255,.7);box-shadow:0 0 0 2px rgba(128,160,255,.25);}
.pf-thumb span{position:absolute;right:3px;bottom:3px;font-size:10px;line-height:1;padding:2px 4px;
  border-radius:4px;background:rgba(0,0,0,.6);color:#fff;}
.pf-more{margin-top:8px;width:100%;}
.pf-see{appearance:none;border:0;padding:0;margin:0;background:transparent;display:block;width:100%;cursor:zoom-in;line-height:0;}
.pf-no{position:absolute;right:3px;bottom:3px;font-size:10px;line-height:1;padding:2px 4px;
  border-radius:4px;background:rgba(0,0,0,.6);color:#fff;pointer-events:none;}
.pf-acts{position:absolute;left:0;right:0;top:0;display:flex;gap:2px;justify-content:flex-end;padding:2px;
  opacity:0;transition:opacity .12s;}
.pf-thumb:hover .pf-acts,.pf-thumb:focus-within .pf-acts{opacity:1;}
.pf-act{appearance:none;border:0;cursor:pointer;font-size:11px;line-height:1;padding:3px 5px;border-radius:5px;
  background:rgba(0,0,0,.62);color:#fff;}
.pf-act:hover{background:rgba(0,0,0,.85);}
.pf-tossed{opacity:.32;}
.pf-tossed .pf-see{filter:grayscale(1);}
.pf-tossed::after{content:'';position:absolute;left:8%;right:8%;top:50%;height:2px;background:rgba(220,90,90,.9);}
.pf-editbar[hidden]{display:none;}
.pf-editbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;font-size:12px;
  padding:8px 10px;border-radius:10px;border:1px solid rgba(128,160,255,.45);background:rgba(128,160,255,.1);}
.pf-editbar span{margin-right:auto;}
.pf-zoom{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.78);cursor:zoom-out;
  display:flex;align-items:center;justify-content:center;padding:16px;}
.pf-zoom-inner{position:relative;max-width:100%;}
.pf-zoom-tag{position:absolute;left:0;top:-22px;font-size:12px;color:#fff;opacity:.8;}
`;
    document.head.appendChild(el);
  }
})();
