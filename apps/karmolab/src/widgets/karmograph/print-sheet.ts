/**
 * print-sheet.ts. **종이 한 장으로** (TASK-KL-271 O7).
 *
 * 관계도를 탁자에 펼쳐 놓고 여럿이 보는 자리가 있다. TRPG 세션, 회의, 수업. 그때 필요한 건
 * 링크도 파일도 아니고 **종이**다. 브라우저 인쇄를 그냥 쓰면 도구의 손잡이, 패널까지 같이 찍히고,
 * 판이 A4 밖으로 잘린다. 그래서 **뽑을 것만 담은 한 장**을 따로 만들어 인쇄한다.
 *
 * 담는 그림은 자랑할 한 장(poster.ts)이 만든 그것. 제목과 범례가 이미 붙어 있으므로,
 * 여기서는 **종이에 맞추는 일**만 한다(A4, 여백, 가운데, 넘치면 줄이기).
 *
 * 왜 순수 함수인가: 인쇄는 눈으로만 확인되는 일이라 더더욱 **글자로 잠가 둘** 필요가 있다.
 * 무엇이 종이에 실리는지를 검사가 읽을 수 있어야 한다.
 */

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export interface PrintOptions {
  /** 창 제목 = 인쇄 미리보기와 PDF 파일 이름이 된다. */
  title: string;
  /** 자랑할 한 장 SVG 문자열. */
  svg: string;
  /** 가로로 긴 판은 눕혀 찍는다. 세로로 우겨넣으면 글자가 못 읽게 작아진다. */
  landscape?: boolean;
}

/**
 * 인쇄용 한 장. 통째로 독립된 문서다(도구의 CSS 를 안 물려받는다).
 * 스크립트는 **뽑기 창을 여는 쪽**이 붙인다. 여기서 `print()` 를 넣으면 검사에서도 인쇄창이 뜬다.
 */
export function printSheetHtml(opts: PrintOptions): string {
  const dir = opts.landscape ? 'landscape' : 'portrait';
  return `<!doctype html><html><head><meta charset="utf-8" />`
    + `<title>${esc(opts.title)}</title><style>`
    + `@page { size: A4 ${dir}; margin: 12mm; }`
    // 종이는 흰 바탕이다. 어두운 판 색을 그대로 실으면 잉크를 다 먹고 글자도 안 읽힌다.
    + `html, body { margin:0; padding:0; background:#fff; }`
    + `.sheet { display:flex; align-items:center; justify-content:center; min-height:100vh; }`
    // 넘치면 줄인다(넘친 채로 자르면 오른쪽 인물이 통째로 사라진다).
    + `svg { max-width:100%; max-height:100vh; height:auto; }`
    + `@media print { .sheet { min-height:auto; } }`
    + `</style></head><body><div class="sheet">${opts.svg}</div></body></html>`;
}

/** 가로로 긴 판인가. 종이 방향을 정한다. 1.25 는 A4 의 가로세로 비(1.41)보다 조금 앞선 자리. */
export function isWide(svg: string): boolean {
  const open = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const w = Number(/\bwidth="([\d.]+)"/.exec(open)?.[1]);
  const h = Number(/\bheight="([\d.]+)"/.exec(open)?.[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return false;
  return w / h > 1.25;
}
