/**
 * 인쇄해서 쓰는 종이 (TASK-KL-316 / 35)
 *
 * 모눈종이·원고지·오선지·달력·라벨은 **필요할 때 딱 없다**. 사서 쓰기엔 아깝고,
 * 인터넷에서 받은 PDF 는 여백이 안 맞아 잘린다(프린터마다 못 찍는 가장자리가 있다).
 *
 * 그래서 **mm 로 그린다**. 종이 크기와 여백을 알고 그리면 어느 프린터에서도 자리가 맞는다.
 * 여기서는 「어디에 선이 있나」만 낸다 — 그리는 일은 화면(SVG)과 PDF 가 각각 한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'printkit',
  ops: {
    sheet: {
      desc:
        'Lay out a printable sheet in millimetres: grid, manuscript (원고지), music staves, a month calendar or labels.',
      in: { kind: 'string', paper: 'string?', size: 'number?', year: 'number?', month: 'number?' },
      out: 'string'
    }
  }
};

export type Paper = 'a4' | 'a5' | 'letter' | 'b5';
export type Kind = 'grid' | 'dots' | 'manuscript' | 'staff' | 'calendar' | 'label';

export const PAPER_MM: Record<Paper, [number, number]> = {
  a4: [210, 297],
  a5: [148, 210],
  b5: [176, 250],
  letter: [215.9, 279.4]
};

/** 대부분의 프린터가 못 찍는 가장자리 — 이보다 안쪽에만 그린다. */
export const SAFE_MARGIN_MM = 8;

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 굵기(mm). 없으면 얇은 선 */
  weight?: number;
  /** 옅게 그릴까 */
  faint?: boolean;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sheet {
  paper: Paper;
  widthMm: number;
  heightMm: number;
  lines: Line[];
  boxes: Box[];
  /** 글자 자리 (달력의 날짜 등) — 글은 화면이 넣는다 */
  labels: Array<{ x: number; y: number; text: string; size: number }>;
  /** 사람이 읽을 한 줄 요약 열쇠 */
  what: string;
}

const empty = (paper: Paper, what: string): Sheet => ({
  paper,
  widthMm: PAPER_MM[paper][0],
  heightMm: PAPER_MM[paper][1],
  lines: [],
  boxes: [],
  labels: [],
  what
});

/** 모눈 — `size` mm 간격. 5칸마다 진하게(세다가 놓치지 않게). */
export function grid(paper: Paper = 'a4', size = 5, landscape = false): Sheet {
  const sheet = empty(paper, 'grid');
  if (landscape) {
    const w = sheet.widthMm;
    sheet.widthMm = sheet.heightMm;
    sheet.heightMm = w;
  }
  const m = SAFE_MARGIN_MM;
  for (let x = m; x <= sheet.widthMm - m + 0.001; x += size) {
    const strong = Math.round((x - m) / size) % 5 === 0;
    sheet.lines.push({ x1: x, y1: m, x2: x, y2: sheet.heightMm - m, faint: !strong });
  }
  for (let y = m; y <= sheet.heightMm - m + 0.001; y += size) {
    const strong = Math.round((y - m) / size) % 5 === 0;
    sheet.lines.push({ x1: m, y1: y, x2: sheet.widthMm - m, y2: y, faint: !strong });
  }
  return sheet;
}

/** 점 모눈 — 선이 없어 그림이 덜 방해받는다(불렛 저널에서 쓰는 그것). */
export function dots(paper: Paper = 'a4', size = 5): Sheet {
  const sheet = empty(paper, 'dots');
  const m = SAFE_MARGIN_MM;
  for (let y = m; y <= sheet.heightMm - m + 0.001; y += size) {
    for (let x = m; x <= sheet.widthMm - m + 0.001; x += size) {
      /* 점은 아주 짧은 선으로 그린다 — 그리는 쪽이 원·선 둘 중 뭘 쓰든 같은 자리에 찍힌다. */
      sheet.lines.push({ x1: x, y1: y, x2: x + 0.2, y2: y, weight: 0.3 });
    }
  }
  return sheet;
}

/** 원고지 — 한 칸에 한 글자. 200자(20×10)가 기본. */
export function manuscript(paper: Paper = 'a4', cols = 20, rows = 10): Sheet {
  const sheet = empty(paper, 'manuscript');
  const m = SAFE_MARGIN_MM + 4;
  const usableW = sheet.widthMm - m * 2;
  const usableH = sheet.heightMm - m * 2;
  /* 칸은 **정사각**이어야 글자가 눌리지 않는다 — 좁은 쪽에 맞춘다. */
  const cell = Math.min(usableW / cols, usableH / rows);
  const startX = (sheet.widthMm - cell * cols) / 2;
  const startY = (sheet.heightMm - cell * rows) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sheet.boxes.push({ x: startX + c * cell, y: startY + r * cell, w: cell, h: cell });
    }
  }
  return sheet;
}

/** 오선지 — 다섯 줄 한 묶음. 묶음 사이는 넉넉히 띄운다(가사·화음 적을 자리). */
export function staff(paper: Paper = 'a4', staves = 10, staffHeight = 7): Sheet {
  const sheet = empty(paper, 'staff');
  const m = SAFE_MARGIN_MM + 4;
  const gap = (sheet.heightMm - m * 2 - staves * staffHeight) / Math.max(1, staves - 1);
  for (let s = 0; s < staves; s++) {
    const top = m + s * (staffHeight + gap);
    for (let i = 0; i < 5; i++) {
      const y = top + (i * staffHeight) / 4;
      sheet.lines.push({ x1: m, y1: y, x2: sheet.widthMm - m, y2: y, weight: 0.25 });
    }
  }
  return sheet;
}

/** 그 달의 첫날이 무슨 요일인가 (0=일). */
export function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 달력 — 날짜 숫자만 자리에 놓는다(요일 이름은 화면이 말로 넣는다). */
export function calendar(year: number, month: number, paper: Paper = 'a4', startMonday = false): Sheet {
  const sheet = empty(paper, 'calendar');
  /* 달력은 가로가 넓어야 쓰기 좋다 — 종이를 눕힌다. */
  const w = sheet.widthMm;
  sheet.widthMm = sheet.heightMm;
  sheet.heightMm = w;

  const m = SAFE_MARGIN_MM + 4;
  const headerH = 16;
  const cols = 7;
  const first = (firstWeekday(year, month) - (startMonday ? 1 : 0) + 7) % 7;
  const total = daysInMonth(year, month);
  const rows = Math.ceil((first + total) / 7);
  const cellW = (sheet.widthMm - m * 2) / cols;
  const cellH = (sheet.heightMm - m * 2 - headerH) / rows;

  for (let c = 0; c < cols; c++) {
    sheet.labels.push({ x: m + c * cellW + cellW / 2, y: m + headerH - 4, text: '#weekday' + c, size: 4 });
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      const day = index - first + 1;
      const box = { x: m + c * cellW, y: m + headerH + r * cellH, w: cellW, h: cellH };
      sheet.boxes.push(box);
      if (day >= 1 && day <= total) sheet.labels.push({ x: box.x + 2.5, y: box.y + 5.5, text: String(day), size: 4.5 });
    }
  }
  sheet.labels.push({ x: m, y: m + 7, text: year + '-' + String(month).padStart(2, '0'), size: 7 });
  return sheet;
}

/** 라벨 시트 — 흔한 규격 몇 가지. 「몇 칸이 나오나」가 사람이 궁금한 값이다. */
export const LABELS: Record<string, { w: number; h: number; cols: number; rows: number; top: number; left: number; gapX: number; gapY: number }> = {
  '24': { w: 63.5, h: 33.9, cols: 3, rows: 8, top: 12.7, left: 7.2, gapX: 2.5, gapY: 0 },
  '21': { w: 63.5, h: 38.1, cols: 3, rows: 7, top: 15.1, left: 7.2, gapX: 2.5, gapY: 0 },
  '12': { w: 63.5, h: 72, cols: 3, rows: 4, top: 4.5, left: 7.2, gapX: 2.5, gapY: 0 },
  '65': { w: 38.1, h: 21.2, cols: 5, rows: 13, top: 10.7, left: 4.7, gapX: 2.5, gapY: 0 }
};

export function labels(kind: keyof typeof LABELS = '24'): Sheet {
  const sheet = empty('a4', 'label');
  const spec2 = LABELS[kind];
  if (spec2 === undefined) throw new Error('모르는 라벨 규격입니다: ' + String(kind));
  for (let r = 0; r < spec2.rows; r++) {
    for (let c = 0; c < spec2.cols; c++) {
      sheet.boxes.push({
        x: spec2.left + c * (spec2.w + spec2.gapX),
        y: spec2.top + r * (spec2.h + spec2.gapY),
        w: spec2.w,
        h: spec2.h
      });
    }
  }
  return sheet;
}

/** 그린 것이 종이를 넘지 않는가 — 넘으면 인쇄에서 잘린다. */
export function fits(sheet: Sheet): boolean {
  const okLine = sheet.lines.every((l) => l.x1 >= 0 && l.y1 >= 0 && l.x2 <= sheet.widthMm + 0.01 && l.y2 <= sheet.heightMm + 0.01);
  const okBox = sheet.boxes.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= sheet.widthMm + 0.01 && b.y + b.h <= sheet.heightMm + 0.01);
  return okLine && okBox;
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'sheet') throw new Error('printkit: 모르는 연산 ' + op);
  const paper = (String(args.paper ?? 'a4') as Paper);
  const kind = String(args.kind ?? 'grid') as Kind;
  const size = args.size === undefined ? undefined : Number(args.size);
  const sheet =
    kind === 'dots'
      ? dots(paper, size ?? 5)
      : kind === 'manuscript'
        ? manuscript(paper)
        : kind === 'staff'
          ? staff(paper)
          : kind === 'calendar'
            ? calendar(Number(args.year ?? new Date().getFullYear()), Number(args.month ?? new Date().getMonth() + 1), paper)
            : kind === 'label'
              ? labels('24')
              : grid(paper, size ?? 5);
  return sheet.what + ' ' + sheet.widthMm + '×' + sheet.heightMm + 'mm · lines ' + sheet.lines.length + ' · boxes ' + sheet.boxes.length;
};
