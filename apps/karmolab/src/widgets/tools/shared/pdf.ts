/**
 * PDF 를 다루는 **한 자리** (TASK-KL-258)
 *
 * PDF 도구가 열셋인데, 그 열셋이 각자 이렇게 하고 있었다(2026-08-12 실측):
 *   - `interface PDFLib` 를 **4곳**에서 따로 선언
 *   - `interface PdfJs`·`PdfDoc`·`PdfPage` 를 **7곳**에서 따로 선언
 *   - 라이브러리 불러오기(`ensureScript`)·`PDFDocument.load`·`save()`·내려주기를 각자 다시 씀
 *
 * 같은 것을 열 번 적으면 **열 곳이 서로 다르게 낡는다** — 한 곳에서 「암호 걸린 PDF 도 열기」를
 * 배워도 나머지 아홉은 모른다. 그래서 여기 하나만 둔다(SSOT).
 *
 * 두 라이브러리를 쓰는 이유가 갈린다 — 섞으면 안 된다:
 *   - **pdf.js** = 보여 주기(그려서 화면에 · 글자 뽑기). 고칠 수는 없다.
 *   - **pdf-lib** = 고치기(쪽 옮기기·자르기·그려 넣기·저장). 그릴 수는 없다.
 * 그래서 「보고 → 고치는」 도구(자르기 같은)는 **둘 다** 쓴다.
 */

/* ── 타입 (전에는 11개 파일에 흩어져 있던 것들의 합집합) ────────────── */

export interface PdfPage {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  getTextContent?: () => Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
}

export interface PdfJsDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}

export interface PdfJs {
  getDocument: (o: { data: ArrayBuffer }) => { promise: Promise<PdfJsDoc> };
  GlobalWorkerOptions: { workerSrc: string };
}

/** pdf-lib 의 페이지 — 고치는 쪽. 쓰는 도구마다 필요한 손잡이가 달라 합집합으로 둔다. */
export interface PdfLibPage {
  getSize: () => { width: number; height: number };
  setCropBox: (x: number, y: number, w: number, h: number) => void;
  setRotation: (d: unknown) => void;
  getRotation: () => { angle: number };
  drawImage: (img: unknown, o: { x: number; y: number; width: number; height: number; opacity?: number; rotate?: unknown }) => void;
  drawRectangle?: (o: { x: number; y: number; width: number; height: number; color?: unknown; opacity?: number }) => void;
}

export interface PdfLibDoc {
  getPageCount: () => number;
  getPages: () => PdfLibPage[];
  copyPages: (src: PdfLibDoc, idx: number[]) => Promise<unknown[]>;
  addPage: (p?: unknown) => PdfLibPage;
  removePage: (i: number) => void;
  embedPng: (b: ArrayBuffer | Uint8Array) => Promise<{ width: number; height: number }>;
  embedJpg?: (b: ArrayBuffer | Uint8Array) => Promise<{ width: number; height: number }>;
  save: () => Promise<Uint8Array>;
}

export interface PDFLib {
  PDFDocument: {
    create: () => Promise<PdfLibDoc>;
    load: (b: ArrayBuffer, o?: { ignoreEncryption?: boolean }) => Promise<PdfLibDoc>;
  };
  degrees: (n: number) => unknown;
  rgb?: (r: number, g: number, b: number) => unknown;
  StandardFonts?: Record<string, string>;
}

/* ── 불러오기 (한 번만) ──────────────────────────────────────────────── */

let pdfjsCache: PdfJs | null = null;
let pdflibCache: PDFLib | null = null;

/** 보여 주기용. 두 번째부터는 이미 받아 둔 것을 쓴다. */
export async function loadPdfJs(): Promise<PdfJs> {
  if (pdfjsCache) return pdfjsCache;
  await Toolbox.ensureScript?.('vendor/pdfjs.min');
  const lib = (window as unknown as { pdfjsLib?: PdfJs }).pdfjsLib;
  if (!lib) throw new Error('pdfjs-missing');
  /* 일꾼(worker)도 **같은 자리에서** 받아야 한다 — 남의 CDN 을 따로 두면 판이 어긋나 조용히 깨진다. */
  lib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
  pdfjsCache = lib;
  return lib;
}

/** 고치기용. */
export async function loadPdfLib(): Promise<PDFLib> {
  if (pdflibCache) return pdflibCache;
  await Toolbox.ensureScript?.('vendor/pdf-lib.min');
  const lib = (window as unknown as { PDFLib?: PDFLib }).PDFLib;
  if (!lib) throw new Error('pdf-lib-missing');
  pdflibCache = lib;
  return lib;
}

/* ── 열기 ────────────────────────────────────────────────────────────── */

/**
 * 파일을 **읽기용**으로 연다(그리기·글자 뽑기).
 *
 * `slice(0)` 이 붙어 있는 이유: pdf.js 는 받은 바이트 통을 자기 것으로 삼아 **비워 버린다**.
 * 같은 파일을 다시 열거나 pdf-lib 에 넘기려면 사본을 줘야 한다 — 안 그러면 두 번째가 빈손이다.
 */
export async function openForRead(file: File | Blob): Promise<PdfJsDoc> {
  const lib = await loadPdfJs();
  const bytes = await file.arrayBuffer();
  return lib.getDocument({ data: bytes.slice(0) }).promise;
}

/** 파일을 **고치기용**으로 연다. 암호가 걸린 것도 열어 본다(막힌 채로 두면 아무것도 못 한다). */
export async function openForEdit(file: File | Blob): Promise<PdfLibDoc> {
  const lib = await loadPdfLib();
  return lib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
}

/** 빈 PDF 하나. */
export async function createPdf(): Promise<PdfLibDoc> {
  const lib = await loadPdfLib();
  return lib.PDFDocument.create();
}

/* ── 그리기 ──────────────────────────────────────────────────────────── */

export interface RenderedPage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * 한 장을 캔버스에 굽는다. `scale` 은 1 이 원래 크기.
 *
 * 미리보기와 「내용이 어디 있나」 찾기가 둘 다 이걸 쓴다 — 전에는 그 굽는 코드가 파일마다 있었다.
 */
export async function renderPage(
  page: PdfPage,
  scale = 1,
  /** 바탕색 — JPG 로 내보낼 때 필요하다(투명을 못 담아 **검게** 나온다). */
  background?: string
): Promise<RenderedPage> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no-2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, width: canvas.width, height: canvas.height };
}

/** 여러 장을 차례로 굽는다. 한 장씩 넘겨주므로 부르는 쪽이 진행 상황을 말할 수 있다. */
export async function renderPages(
  doc: PdfJsDoc,
  scale: number,
  each: (r: RenderedPage, index: number, total: number) => void | Promise<void>
): Promise<void> {
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const r = await renderPage(page, scale);
    await each(r, i - 1, doc.numPages);
  }
}

/* ── 내보내기 ────────────────────────────────────────────────────────── */

/**
 * 고친 PDF 를 내려준다.
 *
 * 바이트를 **사본으로 감싸서** 넘긴다: pdf-lib 이 돌려주는 통은 더 큰 저장소의 한 조각일 수
 * 있어서, 그대로 `Blob` 에 넣으면 엉뚱한 데까지 붙어 나가거나 나중에 비워진다.
 */
export function pdfBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: 'application/pdf' });
}

/** 이름을 다듬어 내려준다. 확장자가 없으면 붙인다. */
export function download(blob: Blob, filename: string): void {
  const name = /\.\w{2,4}$/.test(filename) ? filename : filename + '.pdf';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 고친 문서를 바로 내려주기까지. 열셋이 각자 적던 마지막 세 줄. */
export async function saveAs(doc: PdfLibDoc, filename: string): Promise<number> {
  const bytes = await doc.save();
  const blob = pdfBlob(bytes);
  download(blob, filename);
  return blob.size;
}

/** `문서.pdf` → `문서-자름.pdf` 처럼 꼬리를 붙인다(원본을 덮어쓰지 않게). */
export function suffixName(original: string, suffix: string): string {
  const base = original.replace(/\.pdf$/i, '');
  return `${base}-${suffix}.pdf`;
}
