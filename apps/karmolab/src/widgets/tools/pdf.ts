/**
 * PDF 도구 — **파일 하나, 할 일은 골라서** (TASK-KL-088 → TASK-KL-259 에서 화면 갈아엎음)
 *
 * 전에는 할 일 열하나가 **탭으로 나란히** 있었다. 두 가지가 나빴다(2026-08-13 사용자):
 *   ① 탭 열한 개가 한 줄에 늘어서 「이쁘지도 않고 가독성도 안 좋다」 — 고르려면 다 읽어야 한다.
 *   ② 탭을 옮기면 **파일을 다시 올려야** 했다. 자르고 나서 쪽번호를 넣으려면 두 번 올린다.
 *
 * 그래서 순서를 뒤집었다: **손에 든 것(파일)이 먼저, 할 일은 그다음.**
 * 사람은 「PDF 를 어쩌지」를 들고 오지 「여백 자르기를 하고 싶다」를 들고 오지 않는다.
 *
 * 도구 열하나는 **한 줄도 고치지 않았다.** 이 껍데기가 하는 일은 셋뿐이다:
 *   - 파일을 한 자리에 받아 두고 미리보기를 그린다(`shared/pdf`)
 *   - 고른 할 일을 `Toolbox.mountTool` 로 그 자리에 그려 넣는다(전에 탭이 하던 것과 같다)
 *   - 그 도구의 파일 칸에 **들고 있던 파일을 넣어 준다** — 그래서 다시 안 올린다
 *
 * 바깥을 보고 두 개를 더 들여왔다 (2026-08-13 레퍼런스 조사, [[TASK-KL-260]]):
 *   - **쪽 격자** (Sejda Organize) — 「1/12 ◀▶」 로 넘겨 보는 것보다 **전 쪽이 한눈에** 보이는 게
 *     PDF 를 다루는 사람의 기본 화면이다. 눌러서 크게 본다.
 *   - **결과 이어받기** (iLovePDF Workflows 의 「한 번 올리면 끝까지」) — 할 일이 결과를 내놓으면
 *     그것을 **손에 든 파일로 갈아 끼운다.** 자르고 → 쪽번호 → 압축을 한 번 올려서 끝낸다.
 *     도구는 여전히 무수정 — 이미 있는 `Toolbox.peekResult()` 를 이 껍데기가 주워 간다.
 */
import { openForRead, renderPage } from './shared/pdf';
import { fileSize } from './shared/media';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** 할 일 — 갈래별로 묶어 격자에 놓는다. 새 도구는 여기 한 줄. */
  const GROUPS = (): Array<{ label: string; jobs: Array<[string, string]> }> => [
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
    const esc = (v: string): string =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    injectStyles();

    container.innerHTML = `
      <div class="pf-head" id="pfHead">
        <div class="pf-drop" id="pfDrop">
          <strong>${esc(t('pdf.drop.title', undefined, 'PDF 를 여기에 놓거나 눌러서 고르세요'))}</strong>
          <span>${esc(t('pdf.drop.hint', undefined, '문서는 이 브라우저를 벗어나지 않습니다'))}</span>
          <input type="file" id="pfFile" accept="application/pdf,.pdf" hidden>
        </div>
        <div class="pf-file" id="pfFileBar" hidden>
          <span class="pf-name" id="pfName"></span>
          <span class="pf-meta" id="pfMeta"></span>
          <button type="button" class="btn" id="pfChange">${esc(t('pdf.btn.change', undefined, '바꾸기'))}</button>
        </div>
      </div>

      <div class="pf-body">
        <div class="pf-left">
          <div class="pf-preview" id="pfPreview">
            <div class="pf-empty">${esc(t('pdf.preview.empty', undefined, '미리보기'))}</div>
          </div>
          <div class="pf-pages" id="pfPages" hidden></div>
          <button type="button" class="btn pf-more" id="pfMore" hidden>${esc(t('pdf.btn.more', undefined, '더 보기'))}</button>
        </div>

        <div class="pf-right">
          <div class="pf-jobs" id="pfJobs">
            ${GROUPS()
              .map(
                (g) => `
              <div class="pf-group">
                <div class="pf-group-label">${esc(g.label)}</div>
                <div class="pf-grid">
                  ${g.jobs
                    .map(
                      ([id, label]) =>
                        `<button type="button" class="pf-job" data-job="${esc(id)}">${esc(label)}</button>`
                    )
                    .join('')}
                </div>
              </div>`
              )
              .join('')}
          </div>
          <div class="pf-mount" id="pfMount" hidden>
            <button type="button" class="pf-back" id="pfBack">← ${esc(t('pdf.btn.back', undefined, '할 일 고르기'))}</button>
            <div class="pf-chain" id="pfChain" hidden>
              <span id="pfChainName"></span>
              <button type="button" class="btn" id="pfChainUse">${esc(t('pdf.btn.chain', undefined, '이 결과로 이어서'))}</button>
            </div>
            <div id="pfHost"></div>
          </div>
        </div>
      </div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const fileInput = $<HTMLInputElement>('#pfFile');
    const preview = $<HTMLElement>('#pfPreview');
    const pagesBox = $<HTMLElement>('#pfPages');
    const moreBtn = $<HTMLButtonElement>('#pfMore');
    const host = $<HTMLElement>('#pfHost');

    let file: File | null = null;
    let pageCount = 1;
    /** 격자에 이미 그린 쪽 수 — 쪽이 많은 문서는 한 번에 다 그리면 화면이 멎는다. */
    let drawn = 0;
    /** 이 파일을 그리는 중이라는 표 — 파일이 바뀌면 앞의 그리기는 버린다. */
    let drawToken = 0;
    /** 지금 열어 둔 할 일 — 파일이 바뀌면 그 자리에 새 파일을 다시 넣어 준다. */
    let openJob: string | null = null;

    /** 한 번에 그릴 쪽 수. 나머지는 「더 보기」로 이어 그린다. */
    const CHUNK = 24;

    /* ── 파일 ─────────────────────────────────────────────────────── */

    async function setFile(f: File): Promise<void> {
      file = f;
      $('#pfDrop').hidden = true;
      const bar = $('#pfFileBar');
      bar.hidden = false;
      $('#pfName').textContent = f.name;
      const token = ++drawToken;
      drawn = 0;
      pagesBox.textContent = '';
      pagesBox.hidden = true;
      moreBtn.hidden = true;
      try {
        const doc = await openForRead(f);
        pageCount = doc.numPages;
        $('#pfMeta').textContent = t('pdf.meta', { n: pageCount, size: fileSize(f.size) }, `${pageCount}쪽 · ${fileSize(f.size)}`);
        preview.hidden = true;
        pagesBox.hidden = false;
        await drawMore(doc, token);
      } catch {
        pageCount = 1;
        $('#pfMeta').textContent = t('pdf.meta.unreadable', undefined, '미리보기를 못 그렸습니다');
        preview.hidden = false;
        preview.innerHTML = `<div class="pf-empty">${esc(t('pdf.preview.fail', undefined, '이 문서는 미리 못 봅니다'))}</div>`;
      }
      /* 열어 둔 할 일이 있으면 **거기에도** 새 파일을 넣어 준다 — 이게 이 화면의 요점이다. */
      if (openJob) handOver();
    }

    /**
     * **쪽 격자** — 전 쪽을 작게 늘어놓는다 (Sejda Organize 를 보고 바꿨다).
     *
     * 「1 / 12 ◀ ▶」 로 한 장씩 넘기는 건 문서를 **모르는 채로** 다루게 한다. 어디를 자를지,
     * 어느 쪽에 서명할지는 전 쪽이 한눈에 보일 때 정해진다. 대신 쪽이 많으면 한 번에 다 그리다
     * 화면이 멎으므로 스물넷씩 끊어 그리고, 나머지는 「더 보기」로 잇는다.
     */
    async function drawMore(docIn: Awaited<ReturnType<typeof openForRead>> | null, token: number): Promise<void> {
      if (!file) return;
      const doc = docIn || (await openForRead(file));
      const end = Math.min(doc.numPages, drawn + CHUNK);
      for (let n = drawn + 1; n <= end; n++) {
        if (token !== drawToken) return; // 파일이 바뀌었다 — 옛 그림을 붙이지 않는다
        try {
          const page = await doc.getPage(n);
          const { canvas } = await renderPage(page, 0.34);
          if (token !== drawToken) return;
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
          cell.onclick = (): void => void zoom(n);
          pagesBox.appendChild(cell);
        } catch {
          /* 한 쪽을 못 그려도 나머지는 보여 준다 */
        }
      }
      drawn = end;
      moreBtn.hidden = drawn >= doc.numPages;
      moreBtn.textContent = t('pdf.btn.more', { n: doc.numPages - drawn }, `더 보기 (${doc.numPages - drawn}쪽)`);
    }

    /** 눌러서 크게 — 작은 격자만 있으면 「이 쪽이 맞나」를 확인할 수가 없다. */
    async function zoom(n: number): Promise<void> {
      if (!file) return;
      const back = document.createElement('div');
      back.className = 'pf-zoom';
      back.id = 'pfZoom';
      back.innerHTML = `<div class="pf-zoom-inner"><span class="pf-zoom-tag">${n} / ${pageCount}</span></div>`;
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

    fileInput.onchange = (): void => {
      const f = fileInput.files?.[0];
      if (f) void setFile(f);
    };
    $('#pfDrop').onclick = (): void => fileInput.click();
    $('#pfChange').onclick = (): void => fileInput.click();

    const drop = $('#pfHead');
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('pf-over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('pf-over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('pf-over');
      const f = (e as DragEvent).dataTransfer?.files?.[0];
      if (f) void setFile(f);
    });

    moreBtn.onclick = (): void => void drawMore(null, drawToken);

    /* ── 할 일 ────────────────────────────────────────────────────── */

    /**
     * 들고 있는 파일을 **그 도구의 파일 칸에 넣어 준다.**
     *
     * 도구 열하나를 고치지 않으려고 이렇게 한다: 도구가 이미 갖고 있는 `input[type=file]` 에
     * 파일을 담고 `change` 를 울려 주면, 도구는 사람이 고른 것과 똑같이 받아들인다.
     * (도구마다 「파일을 받는 함수」를 새로 노출하게 만들면 열한 곳을 고쳐야 한다.)
     */
    function handOver(): void {
      if (!file) return;
      const input = host.querySelector<HTMLInputElement>('input[type=file]');
      if (!input) return;
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {
        /* 이 손잡이를 막는 브라우저에서는 사람이 그 도구에서 한 번 더 고르면 된다 */
      }
    }

    function openJobById(id: string): void {
      openJob = id;
      $('#pfJobs').hidden = true;
      $('#pfMount').hidden = false;
      host.textContent = '';
      const ok = Toolbox.mountTool?.(id, host);
      if (!ok) {
        host.innerHTML = `<div class="tool-status error">${esc(t('pdf.err.mount', undefined, '이 할 일을 불러오지 못했습니다'))}</div>`;
        return;
      }
      /* 도구가 다 그려진 뒤에 넣어야 한다 — 그리는 중에는 파일 칸이 아직 없다. */
      if (!NO_PDF_NEEDED.has(id)) setTimeout(handOver, 60);
    }

    container.querySelectorAll<HTMLButtonElement>('[data-job]').forEach((b) => {
      b.onclick = (): void => openJobById(b.dataset.job as string);
    });

    $('#pfBack').onclick = (): void => {
      openJob = null;
      $('#pfMount').hidden = true;
      $('#pfJobs').hidden = false;
      $('#pfChain').hidden = true;
    };

    /* ── 결과 이어받기 (iLovePDF Workflows 의 「한 번 올리면 끝까지」) ─────────
     *
     * 여태 이 화면의 한계는 **한 판이 끝이라는 것**이었다. 여백을 자르면 그 결과가 내려받기로
     * 나가고, 쪽번호를 넣으려면 그 파일을 **다시 올려야** 했다. 껍데기가 파일을 들고 있는데도.
     *
     * 도구를 또 고치지 않고 잇는 길이 이미 있었다 — 도구들은 결과를 낼 때 `offerNext` 를 부르고,
     * 그 순간 `karmolab-result` 가 울리며 결과물이 `peekResult()` 에 놓인다. 여기서는 그것을
     * **주워서 손에 든 파일로 갈아 끼우기만** 하면 된다. 도구 열하나는 이번에도 무수정.
     *
     * 자동으로 갈아 끼우지는 않는다 — 사람이 결과를 확인하기 전에 원본이 사라지면 안 된다.
     */
    const onResult = (e: Event): void => {
      if (!openJob) return;
      const d = (e as CustomEvent).detail as { type?: string; name?: string } | undefined;
      if (!d || !/pdf/i.test(d.type || '')) return; // 글자·이미지 결과는 이 껍데기가 못 받는다
      const bar = $('#pfChain');
      bar.hidden = false;
      $('#pfChainName').textContent = t('pdf.chain.ready', { name: d.name || '' }, `결과 「${d.name || 'PDF'}」`);
    };
    window.addEventListener('karmolab-result', onResult);
    Toolbox.onDispose?.(() => window.removeEventListener('karmolab-result', onResult));

    $('#pfChainUse').onclick = (): void => {
      const item = Toolbox.peekResult?.();
      if (!item || !item.blob) return;
      const name = item.name || 'result.pdf';
      void setFile(new File([item.blob], name, { type: 'application/pdf' }));
      $('#pfChain').hidden = true;
      /* 이어서 다른 할 일을 고르러 간다 — 방금 한 일을 또 하려고 여기 온 게 아니다. */
      openJob = null;
      $('#pfMount').hidden = true;
      $('#pfJobs').hidden = false;
    };
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const css = `
.pf-head{margin-bottom:var(--space-lg);}
.pf-head.pf-over .pf-drop,.pf-head.pf-over .pf-file{outline:2px dashed rgba(128,160,255,.8);outline-offset:3px;}
.pf-drop{display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;
  padding:26px 16px;border:1px dashed rgba(128,128,128,.4);border-radius:12px;cursor:pointer;text-align:center;}
.pf-drop:hover{background:rgba(128,128,128,.06);}
.pf-drop span{font-size:12px;opacity:.6;}
.pf-file{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:10px 14px;border:1px solid rgba(128,128,128,.28);border-radius:12px;}
.pf-name{font-weight:600;word-break:break-all;}
.pf-meta{font-size:12px;opacity:.65;}
.pf-file .btn{margin-left:auto;}
.pf-body{display:grid;grid-template-columns:minmax(200px,300px) 1fr;gap:var(--space-lg);align-items:start;}
@media (max-width:720px){.pf-body{grid-template-columns:1fr;}}
.pf-preview{border:1px solid rgba(128,128,128,.22);border-radius:10px;padding:8px;
  min-height:180px;display:flex;align-items:center;justify-content:center;background:rgba(128,128,128,.05);}
.pf-empty{font-size:12px;opacity:.5;}
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
.pf-chain{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;
  padding:8px 12px;border-radius:10px;border:1px solid rgba(128,200,140,.5);background:rgba(128,200,140,.1);}
.pf-group{margin-bottom:14px;}
.pf-group-label{font-size:12px;opacity:.6;margin-bottom:6px;}
.pf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;}
.pf-job{appearance:none;text-align:left;padding:14px;border-radius:10px;cursor:pointer;
  border:1px solid rgba(128,128,128,.28);background:transparent;font-size:14px;}
.pf-job:hover{background:rgba(128,160,255,.12);border-color:rgba(128,160,255,.5);}
.pf-back{appearance:none;background:transparent;border:0;cursor:pointer;padding:4px 0;
  font-size:13px;opacity:.7;margin-bottom:10px;}
.pf-back:hover{opacity:1;}
`;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }
})();
