/**
 * 코드를 그림으로 — 재는 일과 그리는 일 (TASK-KL-245)
 *
 * `text2img`(글자를 그림으로)와 규칙이 정반대라 같은 자리에 못 넣는다:
 * 저쪽은 넘치는 줄을 **접고** 글자를 **줄이지만**, 코드는 접으면 들여쓰기가 무너지고
 * 크기를 줄이면 읽을 수 없다. 코드는 **줄이 곧 뜻**이라 줄을 건드리지 않는다.
 *
 * 재는 일(`layout`)은 캔버스 없이도 돌아간다 — 글자 폭을 재는 함수만 주면 된다.
 * 그래서 「가장 긴 줄이 그림 폭을 정하는가」 같은 규칙을 브라우저 없이 검사할 수 있다.
 */
import { frameById, type Frame, type FrameMeta } from './code-frames';

/** 색칠된 한 조각 — 글자와 그 종류. */
export interface Seg {
  text: string;
  kind: string;
}

export interface LayoutOpts {
  fontSize: number;
  lineHeight: number;
  /** 줄 번호를 붙이나 */
  numbers: boolean;
  /** 탭 한 칸을 몇 칸으로 펴나 */
  tab: number;
  frame: Frame;
  /** 그림 둘레 여백(껍데기 바깥) */
  margin: number;
  /** 한 글자 폭 (등폭이라 하나면 된다) */
  charW: number;
}

export interface Layout {
  width: number;
  height: number;
  /** 껍데기가 차지하는 네모 */
  box: { x: number; y: number; w: number; h: number };
  /** 코드 첫 글자가 앉는 자리 */
  codeX: number;
  codeY: number;
  /** 줄 번호가 차지하는 폭 (0 이면 안 붙인다) */
  gutter: number;
}

/**
 * 탭을 칸으로 편다. **다음 눈금까지** 채우는 게 맞다 — 탭 하나를 무조건 네 칸으로 바꾸면
 * 탭과 공백이 섞인 파일에서 줄이 어긋난다(그 어긋남이 코드에서는 곧 오해다).
 */
export function expandTabs(line: string, tab = 4): string {
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(tab - (out.length % tab));
    else out += ch;
  }
  return out;
}

/** 그림의 크기를 정한다. **가장 긴 줄**이 폭을, 줄 수가 높이를 정한다. */
export function layout(lines: string[], o: LayoutOpts): Layout {
  const rows = lines.length || 1;
  let longest = 0;
  for (const l of lines) {
    const n = expandTabs(l, o.tab).length;
    if (n > longest) longest = n;
  }
  const gutter = o.numbers ? String(rows).length * o.charW + 18 : 0;
  const codeW = Math.max(longest * o.charW, 120);
  const innerW = gutter + codeW;
  const boxW = innerW + o.frame.pad.left + o.frame.pad.right;
  const boxH = rows * o.lineHeight + o.frame.pad.top + o.frame.pad.bottom;
  return {
    width: Math.ceil(boxW + o.margin * 2),
    height: Math.ceil(boxH + o.margin * 2),
    box: { x: o.margin, y: o.margin, w: boxW, h: boxH },
    codeX: o.margin + o.frame.pad.left + gutter,
    codeY: o.margin + o.frame.pad.top,
    gutter
  };
}

/* ── 색 ───────────────────────────────────────────────────────────────── */

/** 어두운 바닥 위. 우리 팔레트에서 고른다 — 남의 테마를 그대로 들고 오지 않는다. */
const DARK: Record<string, string> = {
  comment: '#5d6b7d',
  string: '#9fe0c8',
  number: '#f0c98b',
  boolean: '#f0c98b',
  keyword: '#8fb8ff',
  function: '#c7a6ff',
  'class-name': '#7fe3e3',
  operator: '#b9c4d4',
  punctuation: '#7c8798',
  property: '#8fd6ff',
  tag: '#8fb8ff',
  'attr-name': '#c7a6ff',
  regex: '#f2a5b8'
};

/** 밝은 바닥 위(종이). 잉크로 인쇄한 듯 채도를 낮춘다. */
const LIGHT: Record<string, string> = {
  comment: '#9a927f',
  string: '#2f7a5e',
  number: '#9a5b1f',
  boolean: '#9a5b1f',
  keyword: '#2f5ea8',
  function: '#6b3fa0',
  'class-name': '#1f6f75',
  operator: '#4a4a4a',
  punctuation: '#8a8578',
  property: '#2f5ea8',
  tag: '#2f5ea8',
  'attr-name': '#6b3fa0',
  regex: '#a03f5a'
};

export function colorFor(kind: string, dark: boolean, fallback: string): string {
  const table = dark ? DARK : LIGHT;
  // Prism 은 `token keyword control-flow` 처럼 여러 이름을 준다 — 아는 것 중 첫 번째를 쓴다
  for (const k of kind.split(/\s+/)) {
    if (table[k]) return table[k];
  }
  return fallback;
}

/* ── 색칠 ─────────────────────────────────────────────────────────────── */

/**
 * Prism 이 만든 DOM 을 **조각 배열**로 편다.
 *
 * 왜 DOM 을 거치나: Prism 은 언어 문법을 이미 알고 있고(34종이 우리 안에 있다), 우리가
 * 다시 만들 이유가 없다. 대신 그 결과를 그대로 화면에 붙이지 않고 조각으로 바꿔 **캔버스에
 * 우리 손으로 그린다** — 그래야 글꼴·자간·줄 높이를 우리가 정하고, 한글 주석이 섞여도
 * 글자마다 재서 그리므로 정렬이 안 무너진다.
 */
export function flatten(node: Node, kind = ''): Seg[] {
  const out: Seg[] = [];
  const walk = (n: Node, k: string): void => {
    if (n.nodeType === 3) {
      const t = n.nodeValue || '';
      if (t) out.push({ text: t, kind: k });
      return;
    }
    const el = n as HTMLElement;
    const own = el.className ? String(el.className).replace(/\btoken\b/g, '').trim() : '';
    const next = own || k;
    for (const child of Array.from(el.childNodes)) walk(child, next);
  };
  walk(node, kind);
  return out;
}

/** 조각 배열을 **줄 단위**로 자른다. 줄바꿈이 조각 한가운데 있을 수 있다(여러 줄 주석). */
export function toLines(segs: Seg[]): Seg[][] {
  const lines: Seg[][] = [[]];
  for (const s of segs) {
    const parts = s.text.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ text: p, kind: s.kind });
    });
  }
  return lines;
}

/* ── 그리기 ───────────────────────────────────────────────────────────── */

export interface PaintOpts {
  frameId: string;
  fontSize: number;
  numbers: boolean;
  tab: number;
  meta: FrameMeta;
  /** 화면 배율 (선명하게 뽑으려고 2배로 그린다) */
  scale: number;
}

const MONO = 'KarmoMono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * 캔버스에 한 장 그린다. 반환값은 잰 크기 — 부르는 쪽이 화면에 얼마로 보일지 정할 때 쓴다.
 */
export function paint(canvas: HTMLCanvasElement, lineSegs: Seg[][], o: PaintOpts): Layout {
  const frame = frameById(o.frameId);
  const c = canvas.getContext('2d')!;
  const fontSize = o.fontSize;
  const lineHeight = Math.round(fontSize * 1.62);

  c.font = `400 ${fontSize}px ${MONO}`;
  const charW = c.measureText('0').width;

  const plain = lineSegs.map((segs) => segs.map((s) => s.text).join(''));
  const L = layout(plain, {
    fontSize,
    lineHeight,
    numbers: o.numbers,
    tab: o.tab,
    frame,
    margin: Math.round(fontSize * 2.2),
    charW
  });

  canvas.width = Math.round(L.width * o.scale);
  canvas.height = Math.round(L.height * o.scale);
  c.setTransform(o.scale, 0, 0, o.scale, 0, 0);

  // 바깥 바탕
  c.fillStyle = frame.palette.outer;
  c.fillRect(0, 0, L.width, L.height);

  frame.back(c, L.box, o.meta);

  c.font = `400 ${fontSize}px ${MONO}`;
  c.textBaseline = 'middle';
  lineSegs.forEach((segs, i) => {
    const y = L.codeY + i * lineHeight + lineHeight / 2;
    if (o.numbers) {
      const n = String(i + 1);
      c.fillStyle = frame.palette.faint;
      const w = c.measureText(n).width;
      c.fillText(n, L.codeX - 14 - w, y);
    }
    let x = L.codeX;
    for (const s of segs) {
      const text = expandTabs(s.text, o.tab);
      c.fillStyle = colorFor(s.kind, frame.palette.dark, frame.palette.text);
      c.fillText(text, x, y);
      x += c.measureText(text).width;
    }
  });

  frame.front?.(c, L.box, o.meta);
  return L;
}
