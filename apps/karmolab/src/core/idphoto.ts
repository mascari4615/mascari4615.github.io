/**
 * 증명사진 규격과 인화 배치 (TASK-KL-316 / 27)
 *
 * 증명사진에서 사람이 막히는 건 셋이다: **크기(mm)**, **얼굴이 차지해야 하는 비율**, **인화 배치**.
 * 사진관은 그걸 알아서 해 주지만, 온라인 접수는 파일을 직접 만들어야 한다.
 *
 * 얼굴을 **자동으로 찾지는 않는다**. 그건 학습 모형이 필요하고 이 사이트는 안 받는다(26번과 같은 이유).
 * 대신 규격이 요구하는 **눈높이, 머리 크기 자리를 선으로 그려** 사람이 맞추게 한다.
 * 자동으로 어긋나게 잘리는 것보다, 선을 보고 맞춘 사진이 접수에서 안 튕긴다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'idphoto',
  ops: {
    specs: {
      desc: 'List the ID photo sizes this tool knows (country, purpose, mm, face ratio rules).',
      in: {},
      out: 'string'
    },
    plan: {
      desc: 'Work out the pixel size and guide lines for one spec at a given DPI.',
      in: { id: 'string', dpi: 'number?' },
      out: 'string'
    },
    sheet: {
      desc: 'Lay copies of a photo out on a print sheet (4x6 inch or A4) and say how many fit.',
      in: { id: 'string', paper: 'string?', dpi: 'number?' },
      out: 'string'
    }
  }
};

export interface Spec {
  id: string;
  /** 나라 코드. 화면이 이름을 붙인다 */
  country: 'kr' | 'jp' | 'us' | 'eu' | 'cn';
  /** 쓰임새 열쇠 (i18n) */
  use: string;
  widthMm: number;
  heightMm: number;
  /** 머리(턱~정수리)가 사진 높이에서 차지해야 하는 비율 */
  headMin: number;
  headMax: number;
  /** 눈이 아래에서부터 있어야 하는 높이 비율 */
  eyeMin: number;
  eyeMax: number;
  /** 배경 규정 (i18n 열쇠) */
  background: 'white' | 'lightGray' | 'plain';
}

/** **아는 것만** 적는다. 규정은 나라마다 바뀌므로 화면에서 접수처 안내를 확인이라고 같이 말한다. */
export const SPECS: Spec[] = [
  { id: 'kr-passport', country: 'kr', use: 'passport', widthMm: 35, heightMm: 45, headMin: 0.5, headMax: 0.7, eyeMin: 0.55, eyeMax: 0.72, background: 'white' },
  { id: 'kr-id', country: 'kr', use: 'idCard', widthMm: 35, heightMm: 45, headMin: 0.5, headMax: 0.72, eyeMin: 0.55, eyeMax: 0.75, background: 'white' },
  { id: 'kr-resume', country: 'kr', use: 'resume', widthMm: 30, heightMm: 40, headMin: 0.45, headMax: 0.7, eyeMin: 0.55, eyeMax: 0.78, background: 'plain' },
  { id: 'kr-visa', country: 'kr', use: 'visa', widthMm: 35, heightMm: 45, headMin: 0.5, headMax: 0.7, eyeMin: 0.55, eyeMax: 0.72, background: 'white' },
  { id: 'jp-passport', country: 'jp', use: 'passport', widthMm: 35, heightMm: 45, headMin: 0.6, headMax: 0.75, eyeMin: 0.55, eyeMax: 0.72, background: 'plain' },
  { id: 'jp-resume', country: 'jp', use: 'resume', widthMm: 30, heightMm: 40, headMin: 0.5, headMax: 0.72, eyeMin: 0.55, eyeMax: 0.78, background: 'plain' },
  { id: 'us-passport', country: 'us', use: 'passport', widthMm: 51, heightMm: 51, headMin: 0.5, headMax: 0.69, eyeMin: 0.56, eyeMax: 0.69, background: 'white' },
  { id: 'us-visa', country: 'us', use: 'visa', widthMm: 51, heightMm: 51, headMin: 0.5, headMax: 0.69, eyeMin: 0.56, eyeMax: 0.69, background: 'white' },
  { id: 'eu-passport', country: 'eu', use: 'passport', widthMm: 35, heightMm: 45, headMin: 0.7, headMax: 0.8, eyeMin: 0.55, eyeMax: 0.75, background: 'lightGray' },
  { id: 'cn-visa', country: 'cn', use: 'visa', widthMm: 33, heightMm: 48, headMin: 0.58, headMax: 0.69, eyeMin: 0.55, eyeMax: 0.72, background: 'white' }
];

export const findSpec = (id: string): Spec | undefined => SPECS.find((s) => s.id === id);

const MM_PER_INCH = 25.4;
export const mmToPx = (mm: number, dpi: number): number => Math.round((mm / MM_PER_INCH) * dpi);

export interface Plan {
  widthPx: number;
  heightPx: number;
  /** 머리 높이(픽셀) 이 사이면 규격 안 */
  headMinPx: number;
  headMaxPx: number;
  /** 눈이 와야 하는 자리(위에서부터 픽셀) */
  eyeTopPx: number;
  eyeBottomPx: number;
  dpi: number;
}

export function plan(spec: Spec, dpi = 300): Plan {
  const heightPx = mmToPx(spec.heightMm, dpi);
  return {
    widthPx: mmToPx(spec.widthMm, dpi),
    heightPx,
    headMinPx: Math.round(heightPx * spec.headMin),
    headMaxPx: Math.round(heightPx * spec.headMax),
    /* 규정은 아래에서부터인데 그림은 위에서부터 그린다. 여기서 한 번만 뒤집는다. */
    eyeTopPx: Math.round(heightPx * (1 - spec.eyeMax)),
    eyeBottomPx: Math.round(heightPx * (1 - spec.eyeMin)),
    dpi
  };
}

export type Paper = '4x6' | 'a4' | '5x7';

const PAPER_MM: Record<Paper, [number, number]> = {
  '4x6': [152.4, 101.6],
  '5x7': [177.8, 127],
  a4: [297, 210]
};

export interface Sheet {
  paper: Paper;
  widthPx: number;
  heightPx: number;
  /** 한 장씩 놓을 자리 */
  slots: Array<{ x: number; y: number; w: number; h: number }>;
  cols: number;
  rows: number;
  /** 자르는 여유 (픽셀) */
  gap: number;
}

/** 인화지에 몇 장이 들어가나. **자르는 여유**를 빼고 센다(붙여 놓으면 못 자른다). */
export function sheet(spec: Spec, paper: Paper = '4x6', dpi = 300, gapMm = 2, marginMm = 4): Sheet {
  const [pw, ph] = PAPER_MM[paper];
  const widthPx = mmToPx(pw, dpi);
  const heightPx = mmToPx(ph, dpi);
  const cellW = mmToPx(spec.widthMm, dpi);
  const cellH = mmToPx(spec.heightMm, dpi);
  const gap = mmToPx(gapMm, dpi);
  const margin = mmToPx(marginMm, dpi);

  const cols = Math.max(0, Math.floor((widthPx - margin * 2 + gap) / (cellW + gap)));
  const rows = Math.max(0, Math.floor((heightPx - margin * 2 + gap) / (cellH + gap)));
  const slots: Array<{ x: number; y: number; w: number; h: number }> = [];
  /* 남는 자리는 **가운데로 모은다**. 한쪽으로 몰리면 자를 때 한 장이 종이 끝에 걸린다. */
  const usedW = cols * cellW + Math.max(0, cols - 1) * gap;
  const usedH = rows * cellH + Math.max(0, rows - 1) * gap;
  const startX = Math.round((widthPx - usedW) / 2);
  const startY = Math.round((heightPx - usedH) / 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({ x: startX + c * (cellW + gap), y: startY + r * (cellH + gap), w: cellW, h: cellH });
    }
  }
  return { paper, widthPx, heightPx, slots, cols, rows, gap };
}

/** 자른 사진이 규격을 지키나. 머리 높이와 눈 자리를 픽셀로 받아 본다. */
export function check(spec: Spec, planned: Plan, headPx: number, eyeYPx: number): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (headPx < planned.headMinPx) problems.push('headTooSmall');
  if (headPx > planned.headMaxPx) problems.push('headTooBig');
  if (eyeYPx < planned.eyeTopPx) problems.push('eyesTooHigh');
  if (eyeYPx > planned.eyeBottomPx) problems.push('eyesTooLow');
  return { ok: problems.length === 0, problems };
}

export const run: ToolRunner = (op, args) => {
  if (op === 'specs') return SPECS.map((s) => s.id + '  ' + s.widthMm + '×' + s.heightMm + 'mm  head ' + Math.round(s.headMin * 100) + '-' + Math.round(s.headMax * 100) + '%').join('\n');
  const found = findSpec(String(args.id ?? ''));
  if (found === undefined) throw new Error('모르는 규격입니다: ' + String(args.id));
  const dpi = args.dpi === undefined ? 300 : Number(args.dpi);
  if (op === 'plan') {
    const p = plan(found, dpi);
    return [
      p.widthPx + '×' + p.heightPx + ' px @ ' + dpi + ' dpi',
      'head  ' + p.headMinPx + '-' + p.headMaxPx + ' px',
      'eyes  ' + p.eyeTopPx + '-' + p.eyeBottomPx + ' px from top'
    ].join('\n');
  }
  if (op === 'sheet') {
    const s = sheet(found, (String(args.paper ?? '4x6') as Paper), dpi);
    return s.paper + ': ' + s.cols + '×' + s.rows + ' = ' + s.slots.length + ' photos (' + s.widthPx + '×' + s.heightPx + ' px)';
  }
  throw new Error('idphoto: 모르는 연산 ' + op);
};
