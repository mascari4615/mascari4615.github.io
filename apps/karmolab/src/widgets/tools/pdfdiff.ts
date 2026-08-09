/**
 * 판본 대조 — 문서 두 벌에서 바뀐 자리만 짚어 준다 (TASK-KL-130)
 *
 * 왜 만들었나: 대조 도구는 흔한데 **전부 글자만 본다.** 계약서에서 표가 밀렸거나 도장이 빠진 건
 * 글자 대조로는 안 잡힌다. 그림까지 보는 대조는 대개 파일을 서버로 올리는데, 계약서는 그걸 못 한다.
 * 그래서 **글자층 + 그림** 둘 다 보고, 전부 브라우저 안에서 끝낸다.
 *
 * 두 갈래를 쓰는 이유가 서로를 메운다 —
 *   글자층: 무엇이 사라지고 무엇이 들어왔는지 *읽을 수 있게* 말해 준다. 스캔본에는 아예 없다.
 *   그림  : 글자가 없어도(스캔·도장·표 이동) 잡힌다. 대신 「무엇이」는 못 말한다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const MAX_PAGES = 30; // 이보다 길면 브라우저가 오래 잡힌다 — 자르고 그 사실을 말한다
  const BLOCK = 8; // 픽셀을 이 크기 칸으로 묶어 본다 (글자 한 획 단위 잡음을 걸러낸다)
  const DIFF_THRESHOLD = 24; // 칸 평균 밝기 차가 이보다 크면 「달라졌다」

  interface TextItem {
    str: string;
    transform: number[];
  }
  interface PdfPage {
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
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

  type Box = { x: number; y: number; w: number; h: number };
  type Op = { type: 'same' | 'add' | 'del'; text: string };

  /** 글자 조각을 줄로 묶는다 — PDF 는 한 줄이 여러 조각으로 쪼개져 들어온다. */
  function linesOf(items: TextItem[]): string[] {
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]); // 같은 줄은 y 가 거의 같다
      const key = Math.round(y / 3) * 3; // 미세한 흔들림 흡수
      if (!rows.has(key)) rows.set(key, []);
      (rows.get(key) as { x: number; s: string }[]).push({ x: it.transform[4], s: it.str });
    }
    return [...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // PDF 의 y 는 아래에서 위로 — 위쪽 줄이 먼저
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.s)
          .join('')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((l) => l.length > 0);
  }

  /** 줄 단위 LCS — textdiff 와 같은 방식. 여기선 「사라진 줄 / 들어온 줄」만 쓴다. */
  function diffLines(a: string[], b: string[]): Op[] {
    const n = a.length;
    const m = b.length;
    const dp: Uint32Array[] = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops: Op[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        ops.push({ type: 'same', text: a[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: 'del', text: a[i++] });
      } else {
        ops.push({ type: 'add', text: b[j++] });
      }
    }
    while (i < n) ops.push({ type: 'del', text: a[i++] });
    while (j < m) ops.push({ type: 'add', text: b[j++] });
    return ops;
  }

  /**
   * 두 그림에서 달라진 칸을 찾아 상자로 묶는다.
   * 칸 단위로 보고(글자 한 획의 안티에일리어싱을 걸러낸다), 붙어 있는 칸끼리 이어 붙인다.
   */
  function diffBoxes(A: ImageData, B: ImageData, w: number, h: number): Box[] {
    const cols = Math.ceil(w / BLOCK);
    const rows = Math.ceil(h / BLOCK);
    const hit = new Uint8Array(cols * rows);
    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < cols; bx++) {
        let sum = 0;
        let cnt = 0;
        const x1 = Math.min(bx * BLOCK + BLOCK, w);
        const y1 = Math.min(by * BLOCK + BLOCK, h);
        for (let y = by * BLOCK; y < y1; y++) {
          for (let x = bx * BLOCK; x < x1; x++) {
            const p = (y * w + x) * 4;
            // 밝기만 본다 — 색이 조금 도는 것보다 글자가 있고 없고가 중요하다
            const la = (A.data[p] * 299 + A.data[p + 1] * 587 + A.data[p + 2] * 114) / 1000;
            const lb = (B.data[p] * 299 + B.data[p + 1] * 587 + B.data[p + 2] * 114) / 1000;
            sum += Math.abs(la - lb);
            cnt++;
          }
        }
        if (cnt > 0 && sum / cnt > DIFF_THRESHOLD) hit[by * cols + bx] = 1;
      }
    }

    // 붙어 있는 칸 뭉치를 하나의 상자로 (4-이웃 flood fill, 재귀 X — 큰 페이지에서 스택이 터진다)
    const seen = new Uint8Array(cols * rows);
    const boxes: Box[] = [];
    const stack: number[] = [];
    for (let start = 0; start < hit.length; start++) {
      if (hit[start] === 0 || seen[start] === 1) continue;
      let minX = cols;
      let minY = rows;
      let maxX = -1;
      let maxY = -1;
      stack.push(start);
      seen[start] = 1;
      while (stack.length > 0) {
        const cur = stack.pop() as number;
        const cx = cur % cols;
        const cy = (cur - cx) / cols;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;
        const near = [
          cx > 0 ? cur - 1 : -1,
          cx < cols - 1 ? cur + 1 : -1,
          cy > 0 ? cur - cols : -1,
          cy < rows - 1 ? cur + cols : -1
        ];
        for (const nb of near) {
          if (nb >= 0 && hit[nb] === 1 && seen[nb] === 0) {
            seen[nb] = 1;
            stack.push(nb);
          }
        }
      }
      boxes.push({
        x: minX * BLOCK,
        y: minY * BLOCK,
        w: (maxX - minX + 1) * BLOCK,
        h: (maxY - minY + 1) * BLOCK
      });
    }
    return boxes;
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  Toolbox.register({
    id: 'pdfdiff',
    title: t('widgets.pdfdiff.title', undefined, 'PDF 판본 대조'),
    category: 'tool',
    desc: t(
      'widgets-desc.pdfdiff.desc',
      undefined,
      '문서 두 판본에서 바뀐 자리만 형광으로 짚어 줍니다. 글자와 그림을 함께 보아 표·도장이 밀린 것도 잡습니다'
    ),
    layout: 'wide',
    icon: '<path d="M9 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M15 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M7 8h3M7 12h2M14 8h3M14 12h3M14 16h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('pdfdiff.tab', undefined, '판본 대조'),
        build: function (container: HTMLElement): void {
          void loadNamespace('pdfdiff').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: t('pdfdiff.mdd') });
          container.innerHTML = `
            <div class="tool-grid-2">
              <div class="tool-drop" id="pdDropA">
                <input type="file" id="pdFileA" accept="application/pdf" hidden>
                <b>${esc(t('pdfdiff.side.a'))}</b><br>${esc(t('pdfdiff.drop.a'))}
              </div>
              <div class="tool-drop" id="pdDropB">
                <input type="file" id="pdFileB" accept="application/pdf" hidden>
                <b>${esc(t('pdfdiff.side.b'))}</b><br>${esc(t('pdfdiff.drop.b'))}
              </div>
            </div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('pdfdiff.label.sens'))} <span id="pdSensVal" class="range-value">${esc(t('pdfdiff.sens.mid'))}</span></div>
                  <input type="range" id="pdSens" aria-label="민감도" min="1" max="3" step="1" value="2">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('pdfdiff.label.mode'))}</div>
                  <select id="pdMode" aria-label="비교 방식">
                    <option value="both">${esc(t('pdfdiff.mode.both'))}</option>
                    <option value="text">${esc(t('pdfdiff.mode.text'))}</option>
                    <option value="pixel">${esc(t('pdfdiff.mode.pixel'))}</option>
                  </select>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="pdRun">${esc(t('pdfdiff.btn.run'))}</button>
              <button class="btn btn-ghost" id="pdSwap">A ↔ B</button>
              <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                <input type="checkbox" id="pdOnlyChanged" style="width:auto;" checked> ${esc(t('pdfdiff.opt.onlyChanged'))}
              </label>
            </div>

            <div class="tool-status" id="pdStatus">${esc(t('pdfdiff.status.idle'))}</div>
            <div id="pdOut" class="pd-out"></div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const out = $<HTMLElement>('#pdOut');
          const status = $<HTMLElement>('#pdStatus');
          const sens = $<HTMLInputElement>('#pdSens');
          const files: { A: File | null; B: File | null } = { A: null, B: null };
          let pdfjs: PdfJs | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          function wireDrop(side: 'A' | 'B'): void {
            const drop = $<HTMLElement>('#pdDrop' + side);
            const input = $<HTMLInputElement>('#pdFile' + side);
            const take = (f: File | null | undefined): void => {
              if (!f) return;
              files[side] = f;
              drop.innerHTML = `<b>${esc(t(side === 'A' ? 'pdfdiff.side.a' : 'pdfdiff.side.b'))}</b><br>${esc(f.name)}`;
            };
            drop.onclick = () => input.click();
            input.onchange = () => take(input.files?.[0]);
            drop.ondragover = (e) => {
              e.preventDefault();
              drop.classList.add('over');
            };
            drop.ondragleave = () => drop.classList.remove('over');
            drop.ondrop = (e) => {
              e.preventDefault();
              drop.classList.remove('over');
              take(e.dataTransfer?.files?.[0]);
            };
          }
          wireDrop('A');
          wireDrop('B');

          async function loadLib(): Promise<PdfJs> {
            if (pdfjs) return pdfjs;
            say(t('pdfdiff.say.engine'));
            await Toolbox.ensureScript?.('vendor/pdfjs.min');
            const g = (window as unknown as { pdfjsLib: PdfJs }).pdfjsLib;
            if (!g) throw new Error(t('pdfdiff.err.engine'));
            // 워커도 같은 자리에서 받아야 한다 (CDN 을 따로 두면 버전이 어긋난다)
            g.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
            pdfjs = g;
            return g;
          }

          /** 한 페이지를 캔버스에 그린다. 두 판본의 종이 크기가 달라도 같은 칸에 놓기 위해 크기를 받는다. */
          async function draw(page: PdfPage, scale: number, w?: number, h?: number): Promise<HTMLCanvasElement> {
            const vp = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(w ?? vp.width);
            canvas.height = Math.round(h ?? vp.height);
            const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
            ctx.fillStyle = '#fff'; // PDF 는 배경이 비어 있다 — 흰 종이를 깔아야 두 장을 비교할 수 있다
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            return canvas;
          }

          function overlay(base: HTMLCanvasElement, boxes: Box[], color: string): HTMLCanvasElement {
            const c = document.createElement('canvas');
            c.width = base.width;
            c.height = base.height;
            const ctx = c.getContext('2d') as CanvasRenderingContext2D;
            ctx.drawImage(base, 0, 0);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.fillStyle = color.replace('rgb', 'rgba').replace(')', ', 0.16)');
            for (const b of boxes) {
              ctx.fillRect(b.x, b.y, b.w, b.h);
              ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
            }
            return c;
          }

          async function run(): Promise<void> {
            if (!files.A || !files.B) {
              say(t('pdfdiff.err.needBoth'), 'error');
              return;
            }
            const mode = $<HTMLSelectElement>('#pdMode').value;
            const onlyChanged = $<HTMLInputElement>('#pdOnlyChanged').checked;
            // 민감도는 「칸을 얼마나 잘게 볼까」가 아니라 「얼마나 달라야 다르다고 할까」로 푼다.
            const level = parseInt(sens.value, 10);
            const threshold = level === 1 ? DIFF_THRESHOLD * 2 : level === 3 ? DIFF_THRESHOLD / 2 : DIFF_THRESHOLD;
            out.innerHTML = '';
            try {
              const lib = await loadLib();
              say(t('pdfdiff.say.opening'));
              const [docA, docB] = await Promise.all([
                lib.getDocument({ data: await files.A.arrayBuffer() }).promise,
                lib.getDocument({ data: await files.B.arrayBuffer() }).promise
              ]);
              const total = Math.max(docA.numPages, docB.numPages);
              const limit = Math.min(total, MAX_PAGES);
              let changedPages = 0;
              let textless = 0;

              for (let n = 1; n <= limit; n++) {
                say(t('pdfdiff.say.progress', { n, total: limit }));
                const hasA = n <= docA.numPages;
                const hasB = n <= docB.numPages;
                const card = document.createElement('div');
                card.className = 'pd-card';

                if (!hasA || !hasB) {
                  changedPages++;
                  card.innerHTML =
                    `<div class="pd-head"><b>${esc(t('pdfdiff.page', { n }))}</b> ` +
                    `<span class="pd-badge pd-${hasB ? 'add' : 'del'}">${esc(
                      t(hasB ? 'pdfdiff.badge.onlyB' : 'pdfdiff.badge.onlyA')
                    )}</span></div>`;
                  out.appendChild(card);
                  continue;
                }

                const [pa, pb] = await Promise.all([docA.getPage(n), docB.getPage(n)]);
                const vpa = pa.getViewport({ scale: 1.5 });
                const vpb = pb.getViewport({ scale: 1.5 });
                // 종이 크기가 다르면 큰 쪽에 맞춘다 — 크기가 다른 것 자체도 「달라진 것」이다
                const W = Math.round(Math.max(vpa.width, vpb.width));
                const H = Math.round(Math.max(vpa.height, vpb.height));

                let boxesA: Box[] = [];
                let boxesB: Box[] = [];
                let canvasA: HTMLCanvasElement | null = null;
                let canvasB: HTMLCanvasElement | null = null;
                if (mode !== 'text') {
                  canvasA = await draw(pa, 1.5, W, H);
                  canvasB = await draw(pb, 1.5, W, H);
                  const ctxA = canvasA.getContext('2d') as CanvasRenderingContext2D;
                  const ctxB = canvasB.getContext('2d') as CanvasRenderingContext2D;
                  const boxes = diffBoxesWith(
                    ctxA.getImageData(0, 0, W, H),
                    ctxB.getImageData(0, 0, W, H),
                    W,
                    H,
                    threshold
                  );
                  boxesA = boxes;
                  boxesB = boxes;
                }

                let added: string[] = [];
                let removed: string[] = [];
                if (mode !== 'pixel') {
                  const [ta, tb] = await Promise.all([pa.getTextContent(), pb.getTextContent()]);
                  const la = linesOf(ta.items);
                  const lb = linesOf(tb.items);
                  if (la.length === 0 && lb.length === 0) textless++;
                  const ops = diffLines(la, lb);
                  removed = ops.filter((o) => o.type === 'del').map((o) => o.text);
                  added = ops.filter((o) => o.type === 'add').map((o) => o.text);
                }

                const changed = boxesB.length > 0 || added.length > 0 || removed.length > 0;
                if (changed) changedPages++;
                if (onlyChanged && !changed) continue;

                const bits: string[] = [];
                bits.push(
                  `<div class="pd-head"><b>${esc(t('pdfdiff.page', { n }))}</b> ` +
                    (changed
                      ? `<span class="pd-badge pd-chg">${esc(
                          t('pdfdiff.badge.changed', { n: Math.max(boxesB.length, added.length + removed.length) })
                        )}</span>`
                      : `<span class="pd-badge pd-same">${esc(t('pdfdiff.badge.same'))}</span>`) +
                    '</div>'
                );
                if (canvasA && canvasB) {
                  bits.push('<div class="pd-pair"><div class="pd-pane" data-side="A"></div><div class="pd-pane" data-side="B"></div></div>');
                }
                if (removed.length > 0 || added.length > 0) {
                  bits.push(
                    '<div class="pd-lines">' +
                      removed.slice(0, 12).map((t) => `<div class="pd-line pd-del">− ${esc(t)}</div>`).join('') +
                      added.slice(0, 12).map((t) => `<div class="pd-line pd-add">+ ${esc(t)}</div>`).join('') +
                      (removed.length + added.length > 24
                        ? `<div class="pd-more">${esc(t('pdfdiff.more', { n: removed.length + added.length - 24 }))}</div>`
                        : '') +
                      '</div>'
                  );
                }
                card.innerHTML = bits.join('');
                if (canvasA && canvasB) {
                  const panes = card.querySelectorAll('.pd-pane');
                  panes[0].appendChild(overlay(canvasA, boxesA, 'rgb(220, 70, 70)'));
                  panes[1].appendChild(overlay(canvasB, boxesB, 'rgb(60, 160, 90)'));
                }
                out.appendChild(card);
              }

              const notes: string[] = [];
              if (total > limit) notes.push(t('pdfdiff.note.limit', { limit, total }));
              if (textless > 0) notes.push(t('pdfdiff.note.textless', { n: textless }));
              if (changedPages === 0) {
                say(t('pdfdiff.say.same') + (notes.length > 0 ? ' · ' + notes.join(' · ') : ''), 'ok');
                if (out.children.length === 0)
                  out.innerHTML = `<div class="tool-status ok">${esc(t('pdfdiff.say.noChangedPages'))}</div>`;
              } else {
                say(t('pdfdiff.say.changed', { n: changedPages }) + (notes.length > 0 ? ' · ' + notes.join(' · ') : ''));
              }
              Toolbox.trackUse?.('compare');
            } catch (e) {
              say(t('pdfdiff.err.compare', { msg: e instanceof Error ? e.message : String(e) }), 'error');
            }
          }

          /** diffBoxes 의 민감도 조절판 — 기준값만 바꿔 같은 알고리즘을 쓴다. */
          function diffBoxesWith(A: ImageData, B: ImageData, w: number, h: number, threshold: number): Box[] {
            if (threshold === DIFF_THRESHOLD) return diffBoxes(A, B, w, h);
            // 기준값이 다르면 밝기 차를 미리 키우거나 줄여서 같은 판정기를 태운다
            const scale = DIFF_THRESHOLD / threshold;
            const A2 = new ImageData(new Uint8ClampedArray(A.data), w, h);
            for (let p = 0; p < A2.data.length; p += 4) {
              for (let k = 0; k < 3; k++) {
                const d = (A.data[p + k] - B.data[p + k]) * scale;
                A2.data[p + k] = Math.max(0, Math.min(255, B.data[p + k] + d));
              }
            }
            return diffBoxes(A2, B, w, h);
          }

          $<HTMLButtonElement>('#pdRun').onclick = () => {
            void run();
          };
          $<HTMLButtonElement>('#pdSwap').onclick = () => {
            const t = files.A;
            files.A = files.B;
            files.B = t;
            for (const side of ['A', 'B'] as const) {
              const f = files[side];
              const drop = $<HTMLElement>('#pdDrop' + side);
              drop.innerHTML = `<b>${side === 'A' ? '원본 (A)' : '변경본 (B)'}</b><br>${f ? esc(f.name) : 'PDF 를 끌어다 놓거나 눌러서 고르세요'}`;
            }
            if (files.A && files.B) void run();
          };
          sens.oninput = () => {
            $<HTMLElement>('#pdSensVal').textContent = t(
              ['pdfdiff.sens.low', 'pdfdiff.sens.mid', 'pdfdiff.sens.high'][parseInt(sens.value, 10) - 1]
            );
          };
  }
})();
