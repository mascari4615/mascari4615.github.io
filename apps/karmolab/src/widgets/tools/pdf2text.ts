/**
 * PDF 에서 글자 뽑기 (TASK-KL-088)
 *
 * 논문·계약서·안내문에서 한 문단만 인용하려고 드래그하면 줄마다 끊기거나 아예 안 잡힌다.
 * PDF 는 「글자가 놓인 자리」만 담고 있어서, 줄과 문단은 **좌표를 보고 되살려야** 한다.
 *
 * 그래서 이 도구는 단순 추출이 아니라 ① 줄을 y 좌표로 묶고 ② 줄 간격이 벌어지면 문단으로 끊는다.
 * 그리고 스캔 문서라 글자가 아예 없으면 **빈 결과를 성공처럼 내놓지 않고** 그렇다고 말한다 —
 * 그게 이 도구에서 가장 흔한 헛걸음이다.
 */
import { acceptPastedFiles } from './shared/paste';

(function (): void {
  interface TextItem {
    str?: string;
    transform?: number[];
    width?: number;
  }
  interface PdfPage {
    getTextContent: () => Promise<{ items: TextItem[] }>;
  }
  interface PdfDoc {
    numPages: number;
    getPage: (n: number) => Promise<PdfPage>;
  }
  interface PdfJs {
    getDocument: (o: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
    GlobalWorkerOptions: { workerSrc: string };
  }

  /**
   * 글자 조각들을 사람이 읽는 줄·문단으로 되살린다.
   * PDF 는 조각을 아무 순서로나 담을 수 있어, 자리(y)로 줄을 묶고 x 로 정렬해야 한다.
   */
  function rebuild(items: TextItem[]): string {
    const lines: Array<{ y: number; parts: Array<{ x: number; s: string }> }> = [];
    for (const it of items) {
      const s = it.str || '';
      if (!s) continue;
      const t = it.transform || [];
      const x = t[4] || 0;
      const y = t[5] || 0;
      // 같은 줄로 볼 만큼 y 가 가까운 줄을 찾는다 (완전히 같은 값은 거의 없다)
      const line = lines.find((l) => Math.abs(l.y - y) < 2.5);
      if (line) line.parts.push({ x, s });
      else lines.push({ y, parts: [{ x, s }] });
    }
    // PDF 의 y 는 아래에서 위로 커진다 — 위에서 아래 순서로 읽으려면 내림차순
    lines.sort((a, b) => b.y - a.y);

    const out: string[] = [];
    let prevY: number | null = null;
    let gaps: number[] = [];
    for (const l of lines) {
      if (prevY !== null) gaps.push(prevY - l.y);
      prevY = l.y;
    }
    // 줄 간격의 중앙값보다 눈에 띄게 벌어지면 문단이 바뀐 것으로 본다
    const sorted = gaps.slice().sort((a, b) => a - b);
    const typical = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    prevY = null;
    for (const l of lines) {
      const text = l.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      if (prevY !== null && typical > 0 && prevY - l.y > typical * 1.6) out.push('');
      out.push(text);
      prevY = l.y;
    }
    return out.join('\n');
  }

  Toolbox.register({
    id: 'pdf2text',
    // 다른 도구가 만든 PDF 를 그대로 받는다 (TASK-KL-133)
    accepts: ['application/pdf'],
    title: 'PDF 에서 글자 뽑기',
    category: 'tool',
    desc: 'PDF 의 글자를 줄·문단을 살려 뽑아냅니다. 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.5 12h7M8.5 15h7M8.5 18h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '글자 뽑기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="ptDrop">
              <input type="file" id="ptFile" accept="application/pdf" hidden>
              PDF 를 끌어다 놓거나 눌러서 고르세요
            </div>

            <div id="ptEditor" style="display:none; margin-top:var(--space-lg);">
              <div class="field-group">
                <label class="field-label" for="ptRange">쪽 범위 — 비우면 전체 (예: 1-3, 5)</label>
                <input type="text" id="ptRange" placeholder="전체" spellcheck="false">
              </div>

              <div class="tool-chips" style="margin-bottom:var(--space-lg);">
                <label class="tool-chip"><input type="checkbox" id="ptMark" checked> 쪽 구분 표시 넣기</label>
              </div>

              <div class="cc-stats" id="ptStats"></div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="ptRun">글자 뽑기</button>
                <button class="btn btn-ghost" id="ptCopy" disabled>복사</button>
                <button class="btn btn-ghost" id="ptSave" disabled>txt 로 받기</button>
              </div>

              <textarea id="ptOut" rows="16" spellcheck="false" style="width:100%;" placeholder="뽑은 글자가 여기에 나옵니다"></textarea>
            </div>

            <div class="tool-status" id="ptStatus">파일은 브라우저 안에서만 다뤄집니다 — 문서를 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#ptDrop');
          const fileInput = $<HTMLInputElement>('#ptFile');
          const editor = $<HTMLElement>('#ptEditor');
          const stats = $<HTMLElement>('#ptStats');
          const status = $<HTMLElement>('#ptStatus');
          const out = $<HTMLTextAreaElement>('#ptOut');
          const copyBtn = $<HTMLButtonElement>('#ptCopy');
          const saveBtn = $<HTMLButtonElement>('#ptSave');

          let fileName = '';
          let doc: PdfDoc | null = null;
          let pdfjs: PdfJs | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function parseRange(spec: string, total: number): number[] {
            const list: number[] = [];
            const seen = new Set<number>();
            for (const chunk of spec.split(',')) {
              const s = chunk.trim();
              if (!s) continue;
              const m = s.match(/^(\d+)?\s*-\s*(\d+)?$/);
              if (m) {
                const from = m[1] ? parseInt(m[1], 10) : 1;
                const to = m[2] ? parseInt(m[2], 10) : total;
                for (let i = from; i <= Math.min(to, total); i++) if (i >= 1 && !seen.has(i)) (seen.add(i), list.push(i));
              } else if (/^\d+$/.test(s)) {
                const n = parseInt(s, 10);
                if (n >= 1 && n <= total && !seen.has(n)) (seen.add(n), list.push(n));
              }
            }
            return list;
          }

          async function loadLib(): Promise<PdfJs> {
            if (pdfjs) return pdfjs;
            say('PDF 처리기를 불러오는 중…');
            await Toolbox.ensureScript?.('vendor/pdfjs.min');
            const g = (window as unknown as { pdfjsLib: PdfJs }).pdfjsLib;
            if (!g) throw new Error('PDF 처리기를 불러오지 못했습니다');
            g.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
            pdfjs = g;
            return g;
          }

          async function load(f: File): Promise<void> {
            fileName = f.name;
            out.value = '';
            copyBtn.disabled = true;
            saveBtn.disabled = true;
            say(`${f.name} 을 여는 중…`);
            try {
              const lib = await loadLib();
              doc = await lib.getDocument({ data: await f.arrayBuffer() }).promise;
              editor.style.display = '';
              stats.innerHTML = stat('쪽 수', `${doc.numPages}쪽`, true);
              say('쪽 범위를 정하고 글자 뽑기를 누르세요.', 'ok');
            } catch (e) {
              say('이 PDF 를 열지 못했어요: ' + (e as Error).message, 'error');
            }
          }

          async function run(): Promise<void> {
            if (!doc) {
              say('PDF 를 먼저 넣어 주세요.', 'error');
              return;
            }
            const spec = $<HTMLInputElement>('#ptRange').value.trim();
            const pages = spec ? parseRange(spec, doc.numPages) : Array.from({ length: doc.numPages }, (_, i) => i + 1);
            if (!pages.length) {
              say(`그 범위에 해당하는 쪽이 없어요. 이 PDF 는 ${doc.numPages}쪽이니 그 안에서 적어 주세요 (예: 1-3, 5).`, 'error');
              return;
            }
            const mark = $<HTMLInputElement>('#ptMark').checked;
            const chunks: string[] = [];
            let empty = 0;
            for (const n of pages) {
              say(`${n}쪽에서 글자를 찾는 중…`);
              const page = await doc.getPage(n);
              const text = rebuild((await page.getTextContent()).items);
              if (!text.trim()) empty++;
              if (mark) chunks.push(`— ${n}쪽 —`);
              chunks.push(text);
              chunks.push('');
            }
            const joined = chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
            out.value = joined;
            copyBtn.disabled = !joined;
            saveBtn.disabled = !joined;

            const chars = joined.replace(/\s/g, '').length;
            stats.innerHTML =
              stat('뽑은 쪽', `${pages.length}쪽`, true) +
              stat('글자 수', `${chars.toLocaleString()}자`) +
              stat('빈 쪽', `${empty}쪽`);

            // 스캔 문서는 글자가 아예 없다. 빈 결과를 성공처럼 내놓으면 사용자는 한참 뒤에야 안다.
            if (!chars) {
              say('이 PDF 에는 글자가 없습니다 — 종이를 찍은 스캔 문서로 보입니다. 이 도구는 글자를 그림에서 읽어 내지는 못합니다.', 'error');
            } else if (empty) {
              say(`${chars.toLocaleString()}자를 뽑았어요. 다만 ${empty}쪽은 글자가 없었습니다 (그림이나 스캔일 수 있어요).`);
            } else {
              say(`${chars.toLocaleString()}자를 뽑았어요.`, 'ok');
            }
            Toolbox.trackUse?.('extract');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 파일이 다시 들어와 방금 한 일을 덮는다. */
          {
            const handed = Toolbox.takeResult?.();
            if (handed && handed.blob && handed.blob.type === 'application/pdf') {
              void load(new File([handed.blob], handed.name || '넘겨받은.pdf', { type: 'application/pdf' }));
            }
          }
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) void load(f);
          });
          // 캡처나 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { void load(files[0]); }, (f) => f.type === 'application/pdf');

          $<HTMLButtonElement>('#ptRun').onclick = () => {
            void run().catch((err: Error) => say('뽑는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
          copyBtn.onclick = () => {
            void Toolbox.copyText?.(out.value, { message: '뽑은 글자를 복사했어요' });
          };
          saveBtn.onclick = () => {
            const blob = new Blob([out.value], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName.replace(/\.pdf$/i, '') + '.txt';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say('내려받았어요.', 'ok');
          };
        }
      }
    ]
  });
})();
