/**
 * 정규식을 사람 말과 그림으로 (TASK-KL-316 / 11)
 *
 * 정규식은 **읽는 게 어렵지 쓰는 게 어려운 게 아니다**. 남이 준 한 줄이 무엇을 잡는지
 * 알아내려고 한 글자씩 짚어 보는 시간이 대부분이다. 여기서는 그 한 줄을 나무로 읽어
 * ① 조각마다 무슨 뜻인지 ② 철길 그림(왼→오로 흐르는 길)로 내놓는다.
 *
 * 말은 여기서 **짓지 않는다**. `Piece.kind` 만 돌려주고 문장은 화면(i18n)이 만든다.
 * 알맹이가 한국어 문장을 들고 있으면 영어, 일본어 화면에서 한국어가 새어 나온다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'regexplain',
  ops: {
    explain: {
      desc: 'Break a regular expression into pieces and say what each piece matches (structured, one line per piece).',
      in: { pattern: 'string', flags: 'string?' },
      out: 'string'
    },
    railroad: {
      desc: 'Draw a regular expression as a railroad diagram (SVG).',
      in: { pattern: 'string', dark: 'boolean?' },
      out: 'string'
    }
  }
};

/* ── 나무로 읽기 ───────────────────────────────────────────────────── */

export type NodeKind =
  | 'literal'      // 글자 그대로
  | 'any'          // .
  | 'class'        // [a-z], \d, \w, \s
  | 'group'        // ( ... )
  | 'alt'          // a|b
  | 'seq'          // 이어 붙임
  | 'anchor'       // ^ $ \b
  | 'backref'      // \1
  | 'look';        // (?= ...) (?! ...) (?<= ...) (?<! ...)

export interface Quant {
  min: number;
  /** 없으면 끝없이 */
  max?: number;
  lazy?: boolean;
}

export interface Node {
  kind: NodeKind;
  /** literal 의 글자, class 의 속, anchor 의 기호 */
  text?: string;
  /** group, look 의 이름 */
  name?: string;
  /** 잡아 두는 묶음인가 (`(?:` 는 아니다) */
  capturing?: boolean;
  /** look 의 방향, 부정 */
  ahead?: boolean;
  negate?: boolean;
  children?: Node[];
  quant?: Quant;
}

class Reader {
  private at = 0;
  private groupNo = 0;
  constructor(private readonly src: string) {}

  parse(): Node {
    const node = this.alternation();
    if (this.at < this.src.length) throw new Error('' + this.src[this.at] + ' 에서 막혔습니다 (' + this.at + '번째)');
    return node;
  }

  private alternation(): Node {
    const branches: Node[] = [this.sequence()];
    while (this.src[this.at] === '|') {
      this.at++;
      branches.push(this.sequence());
    }
    return branches.length === 1 ? branches[0] : { kind: 'alt', children: branches };
  }

  private sequence(): Node {
    const items: Node[] = [];
    while (this.at < this.src.length && this.src[this.at] !== '|' && this.src[this.at] !== ')') {
      const piece = this.piece();
      if (piece !== undefined) items.push(piece);
    }
    if (items.length === 1) return items[0];
    return { kind: 'seq', children: items };
  }

  private piece(): Node | undefined {
    const atom = this.atom();
    if (atom === undefined) return undefined;
    const quant = this.quantifier();
    if (quant !== undefined) atom.quant = quant;
    return atom;
  }

  private quantifier(): Quant | undefined {
    const c = this.src[this.at];
    let q: Quant | undefined;
    if (c === '*') q = { min: 0 };
    else if (c === '+') q = { min: 1 };
    else if (c === '?') q = { min: 0, max: 1 };
    else if (c === '{') {
      const close = this.src.indexOf('}', this.at);
      const body = close < 0 ? '' : this.src.slice(this.at + 1, close);
      const m = /^(\d+)(,(\d*)?)?$/.exec(body);
      if (m === null) return undefined;
      this.at = close;
      q = m[2] === undefined ? { min: Number(m[1]), max: Number(m[1]) } : { min: Number(m[1]), max: m[3] === '' || m[3] === undefined ? undefined : Number(m[3]) };
    }
    if (q === undefined) return undefined;
    this.at++;
    if (this.src[this.at] === '?') {
      q.lazy = true;
      this.at++;
    }
    return q;
  }

  private atom(): Node | undefined {
    const c = this.src[this.at];
    if (c === undefined) return undefined;

    if (c === '(') {
      this.at++;
      let capturing = true;
      let name: string | undefined;
      let look: { ahead: boolean; negate: boolean } | undefined;
      if (this.src[this.at] === '?') {
        const two = this.src.slice(this.at, this.at + 2);
        const three = this.src.slice(this.at, this.at + 3);
        if (two === '?:') {
          capturing = false;
          this.at += 2;
        } else if (two === '?=') {
          look = { ahead: true, negate: false };
          this.at += 2;
        } else if (two === '?!') {
          look = { ahead: true, negate: true };
          this.at += 2;
        } else if (three === '?<=') {
          look = { ahead: false, negate: false };
          this.at += 3;
        } else if (three === '?<!') {
          look = { ahead: false, negate: true };
          this.at += 3;
        } else if (this.src[this.at + 1] === '<') {
          const close = this.src.indexOf('>', this.at);
          name = this.src.slice(this.at + 2, close);
          this.at = close + 1;
        }
      }
      if (capturing && look === undefined) this.groupNo++;
      const no = this.groupNo;
      const inner = this.alternation();
      if (this.src[this.at] !== ')') throw new Error('닫는 괄호가 없습니다');
      this.at++;
      if (look !== undefined) return { kind: 'look', ahead: look.ahead, negate: look.negate, children: [inner] };
      return { kind: 'group', capturing, name: name ?? (capturing ? String(no) : undefined), children: [inner] };
    }

    if (c === '[') {
      const start = this.at;
      this.at++;
      if (this.src[this.at] === '^') this.at++;
      if (this.src[this.at] === ']') this.at++;
      while (this.at < this.src.length && this.src[this.at] !== ']') {
        if (this.src[this.at] === String.fromCharCode(92)) this.at++;
        this.at++;
      }
      this.at++;
      return { kind: 'class', text: this.src.slice(start, this.at) };
    }

    if (c === '.') {
      this.at++;
      return { kind: 'any' };
    }

    if (c === '^' || c === '$') {
      this.at++;
      return { kind: 'anchor', text: c };
    }

    if (c === String.fromCharCode(92)) {
      const next = this.src[this.at + 1];
      this.at += 2;
      if (next === 'b' || next === 'B') return { kind: 'anchor', text: String.fromCharCode(92) + next };
      if (/[0-9]/.test(next)) return { kind: 'backref', text: next };
      if (/[dDwWsS]/.test(next)) return { kind: 'class', text: String.fromCharCode(92) + next };
      return { kind: 'literal', text: next === 'n' ? '\n' : next === 't' ? '\t' : next };
    }

    this.at++;
    return { kind: 'literal', text: c };
  }
}

export function parse(pattern: string): Node {
  return new Reader(pattern).parse();
}

/* ── 조각으로 펴기 (말은 화면이 만든다) ────────────────────────────── */

export interface Piece {
  depth: number;
  kind: NodeKind;
  /** 화면이 문장을 고르는 열쇠. `class.digit` 처럼 */
  what: string;
  /** 그 조각의 글자 (있으면) */
  text?: string;
  /** 몇 번 (`1..1` 이면 없음) */
  quant?: Quant;
  /** 묶음 번호, 이름 */
  name?: string;
  negate?: boolean;
  ahead?: boolean;
}

const CLASS_WHAT: Record<string, string> = {
  '\\d': 'class.digit',
  '\\D': 'class.notDigit',
  '\\w': 'class.word',
  '\\W': 'class.notWord',
  '\\s': 'class.space',
  '\\S': 'class.notSpace'
};

const ANCHOR_WHAT: Record<string, string> = {
  '^': 'anchor.start',
  $: 'anchor.end',
  '\\b': 'anchor.wordEdge',
  '\\B': 'anchor.notWordEdge'
};

export function pieces(node: Node, depth = 0, out: Piece[] = []): Piece[] {
  switch (node.kind) {
    case 'seq':
      for (const child of node.children ?? []) pieces(child, depth, out);
      return out;
    case 'alt':
      out.push({ depth, kind: 'alt', what: 'alt', quant: node.quant });
      for (const child of node.children ?? []) pieces(child, depth + 1, out);
      return out;
    case 'group':
      out.push({ depth, kind: 'group', what: node.capturing === false ? 'group.plain' : 'group.capture', name: node.name, quant: node.quant });
      for (const child of node.children ?? []) pieces(child, depth + 1, out);
      return out;
    case 'look':
      out.push({ depth, kind: 'look', what: 'look.' + (node.ahead === true ? 'ahead' : 'behind') + (node.negate === true ? 'Not' : ''), quant: node.quant, ahead: node.ahead, negate: node.negate });
      for (const child of node.children ?? []) pieces(child, depth + 1, out);
      return out;
    case 'class': {
      const text = node.text ?? '';
      out.push({ depth, kind: 'class', what: CLASS_WHAT[text] ?? (text.startsWith('[^') ? 'class.noneOf' : 'class.oneOf'), text, quant: node.quant });
      return out;
    }
    case 'anchor':
      out.push({ depth, kind: 'anchor', what: ANCHOR_WHAT[node.text ?? ''] ?? 'anchor.start', text: node.text, quant: node.quant });
      return out;
    case 'backref':
      out.push({ depth, kind: 'backref', what: 'backref', text: node.text, quant: node.quant });
      return out;
    case 'any':
      out.push({ depth, kind: 'any', what: 'any', quant: node.quant });
      return out;
    default:
      out.push({ depth, kind: 'literal', what: 'literal', text: node.text, quant: node.quant });
      return out;
  }
}

/** 이어진 글자 조각을 한 덩이로 모은다. abc 세 줄보다 abc 한 줄이 읽힌다. */
export function merged(list: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const p of list) {
    const last = out[out.length - 1];
    if (
      p.kind === 'literal' &&
      p.quant === undefined &&
      last !== undefined &&
      last.kind === 'literal' &&
      last.quant === undefined &&
      last.depth === p.depth
    ) {
      last.text = (last.text ?? '') + (p.text ?? '');
      continue;
    }
    out.push({ ...p });
  }
  return out;
}

/* ── 철길 그림 ─────────────────────────────────────────────────────── */

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Box {
  label: string;
  /** 되풀이 표시 */
  loop?: boolean;
  /** 건너뛸 수 있나 */
  skip?: boolean;
  /** 여러 갈래 */
  branches?: Box[][];
}

function boxesOf(node: Node): Box[] {
  const quantMark = (q?: Quant): { loop: boolean; skip: boolean } => ({
    loop: q !== undefined && (q.max === undefined || q.max > 1),
    skip: q !== undefined && q.min === 0
  });
  switch (node.kind) {
    case 'seq':
      return (node.children ?? []).flatMap(boxesOf);
    case 'alt':
      return [{ label: '', branches: (node.children ?? []).map(boxesOf), ...quantMark(node.quant) }];
    case 'group':
    case 'look': {
      const inner = (node.children ?? []).flatMap(boxesOf);
      const mark = quantMark(node.quant);
      if (!mark.loop && !mark.skip) return inner;
      return [{ label: '', branches: [inner], ...mark }];
    }
    case 'class':
      return [{ label: node.text ?? '', ...quantMark(node.quant) }];
    case 'any':
      /* 그림 속 글자는 **정규식 기호 그대로** 둔다. 말은 화면(i18n)이 맡는다. */
      return [{ label: '.', ...quantMark(node.quant) }];
    case 'anchor':
      return [{ label: node.text ?? '', ...quantMark(node.quant) }];
    case 'backref':
      return [{ label: String.fromCharCode(92) + (node.text ?? ''), ...quantMark(node.quant) }];
    default:
      return [{ label: node.text ?? '', ...quantMark(node.quant) }];
  }
}

function width(box: Box): number {
  if (box.branches === undefined) return Math.max(54, box.label.length * 9 + 24);
  return Math.max(...box.branches.map((row) => row.reduce((sum, b) => sum + width(b) + 18, 0))) + 30;
}

function height(box: Box): number {
  if (box.branches === undefined) return 34;
  return box.branches.reduce((sum, row) => sum + Math.max(34, ...row.map(height)) + 12, 8);
}

export function toRailroad(node: Node, dark = false): string {
  const ink = dark ? '#e8eaf0' : '#1b1e24';
  const line = dark ? '#8a93a6' : '#5b6474';
  const fill = dark ? '#232833' : '#ffffff';
  const boxes = boxesOf(node);
  const pad = 20;
  const totalW = boxes.reduce((sum, b) => sum + width(b) + 22, 0) + pad * 2;
  const totalH = Math.max(70, ...boxes.map(height)) + pad * 2 + 20;
  const parts: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + totalW + ' ' + totalH + '" width="' + totalW + '" height="' + totalH + '" font-family="ui-monospace, monospace" font-size="12">'
  ];

  const drawRow = (row: Box[], x0: number, y: number): number => {
    let x = x0;
    for (const box of row) {
      const w = width(box);
      const h = box.branches === undefined ? 30 : height(box);
      parts.push('<line x1="' + (x - 12) + '" y1="' + y + '" x2="' + x + '" y2="' + y + '" stroke="' + line + '" stroke-width="1.4"/>');
      if (box.branches === undefined) {
        parts.push('<rect x="' + x + '" y="' + (y - h / 2) + '" width="' + w + '" height="' + h + '" rx="8" fill="' + fill + '" stroke="' + line + '" stroke-width="1.4"/>');
        parts.push('<text x="' + (x + w / 2) + '" y="' + (y + 4) + '" fill="' + ink + '" text-anchor="middle">' + esc(box.label) + '</text>');
      } else {
        parts.push('<rect x="' + x + '" y="' + (y - h / 2) + '" width="' + w + '" height="' + h + '" rx="10" fill="none" stroke="' + line + '" stroke-width="1" stroke-dasharray="4 4"/>');
        let inner = y - h / 2 + 20;
        for (const branch of box.branches) {
          drawRow(branch, x + 16, inner);
          inner += 40;
        }
      }
      if (box.loop === true) {
        parts.push(
          '<path d="M' + (x + w) + ' ' + (y - h / 2 - 6) + ' q ' + (-w / 2) + ' -14 ' + -w + ' 0" fill="none" stroke="' + line + '" stroke-width="1.2" stroke-dasharray="3 3"/>'
        );
      }
      if (box.skip === true) {
        parts.push(
          '<path d="M' + (x - 10) + ' ' + y + ' q ' + w / 2 + ' ' + (h / 2 + 14) + ' ' + (w + 20) + ' 0" fill="none" stroke="' + line + '" stroke-width="1.2"/>'
        );
      }
      x += w + 22;
    }
    return x;
  };

  const endX = drawRow(boxes, pad + 12, totalH / 2);
  parts.push('<circle cx="' + pad + '" cy="' + totalH / 2 + '" r="5" fill="' + line + '"/>');
  parts.push('<circle cx="' + (endX - 12) + '" cy="' + totalH / 2 + '" r="5" fill="none" stroke="' + line + '" stroke-width="2"/>');
  parts.push('</svg>');
  return parts.join('\n');
}

export const run: ToolRunner = (op, args) => {
  const node = parse(String(args.pattern ?? ''));
  if (op === 'railroad') return toRailroad(node, args.dark === true);
  if (op === 'explain') {
    return merged(pieces(node))
      .map((p) => '  '.repeat(p.depth) + p.what + (p.text === undefined ? '' : ' ' + p.text) + (p.quant === undefined ? '' : ' {' + p.quant.min + ',' + (p.quant.max ?? '') + '}'))
      .join('\n');
  }
  throw new Error('regexplain: 모르는 연산 ' + op);
};
