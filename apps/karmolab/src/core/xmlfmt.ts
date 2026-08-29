/**
 * XML 을 사람이 읽게, 기계가 먹게 (TASK-KL-238 / 42 codebeautify)
 *
 * 우리에겐 JSON(`jsonfmt`), SQL(`sqlfmt`), 설정 다섯(`configconv`)이 있는데 **XML 만 없었다.**
 * 그런데 밖에서 오는 것 중 XML 이 여전히 많다. RSS, 사이트맵, SVG, 안드로이드 레이아웃, 
 * 은행/공공 API 응답. 한 줄로 뭉쳐 온 그것을 읽으려고 매번 남의 사이트에 **본문을 붙여넣는다.**
 *
 * 그래서 여기서 셋을 한다: **펴기, 뭉치기, JSON 으로**. 그리고 안 되는 것은 *어디서* 안 되는지
 * 줄, 칸으로 짚는다. Invalid XML 한 마디는 아무 것도 알려 주지 않는다.
 *
 * ★ 브라우저의 `DOMParser` 를 안 쓴다. 알맹이는 화면, MCP, Node 세 곳에서 같은 답을 내야 하는데
 *   `DOMParser` 는 브라우저에만 있고, 오류 문구도 브라우저마다 다르다(그 차이를 흡수하려다
 *   `jsonfmt` 가 이미 한 번 데었다). 그래서 여기서 직접 읽는다.
 *
 * **일부러 안 하는 것**: DTD 해석, 이름공간 검사, 스키마(XSD) 검증, 엔티티 정의. 여기서 맞다는
 * *모양이 맞다*(well-formed)는 뜻이지 *규격에 맞다*(valid)가 아니다. 답에도 그렇게 적는다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'xmlfmt',
  ops: {
    format: {
      desc:
        'Pretty-print XML with indentation. Reports the line and column of the first problem instead of' +
        ' a bare "invalid XML". / XML 을 들여쓰기로 편다. 틀린 자리는 줄, 칸으로 짚는다.',
      in: { text: 'string', indent: 'number?' },
      out: 'string'
    },
    minify: {
      desc: 'Strip formatting whitespace between XML tags, keeping text content intact.',
      in: { text: 'string' },
      out: 'string'
    },
    toJson: {
      desc:
        'Convert XML to JSON. Attributes become "@name" keys, text becomes "#text", repeated children' +
        ' become arrays.',
      in: { text: 'string' },
      out: 'string'
    }
  }
};

export interface XmlText {
  kind: 'text' | 'comment' | 'cdata' | 'decl';
  value: string;
}
export interface XmlElement {
  kind: 'element';
  name: string;
  attrs: Array<[string, string]>;
  children: XmlNode[];
  /** 스스로 닫은 태그(`<br/>`)인가. 다시 찍을 때 그 모양을 지킨다. */
  selfClose: boolean;
}
export type XmlNode = XmlElement | XmlText;

/** 어디서 틀렸나. Invalid XML 대신 이걸 던진다. */
export class XmlError extends Error {
  line: number;
  col: number;
  constructor(message: string, line: number, col: number) {
    super(`${message} (${line}번째 줄 ${col}칸)`);
    this.name = 'XmlError';
    this.line = line;
    this.col = col;
  }
}

const at = (src: string, i: number): { line: number; col: number } => {
  const before = src.slice(0, i).split('\n');
  return { line: before.length, col: before[before.length - 1].length + 1 };
};

const fail = (src: string, i: number, msg: string): never => {
  const p = at(src, i);
  throw new XmlError(msg, p.line, p.col);
};

/** 이름에 쓸 수 있는 글자. 이름공간 접두사(`ns:tag`)와 점, 밑줄, 붙임표까지만 받는다. */
const NAME = /[A-Za-z_:][\w.:-]*/y;

export function parse(src: string): XmlNode[] {
  const roots: XmlNode[] = [];
  const stack: XmlElement[] = [];
  const push = (node: XmlNode): void => {
    (stack.length > 0 ? stack[stack.length - 1].children : roots).push(node);
  };

  let i = 0;
  while (i < src.length) {
    if (src[i] !== '<') {
      const next = src.indexOf('<', i);
      const end = next === -1 ? src.length : next;
      const value = src.slice(i, end);
      if (value.trim() !== '') push({ kind: 'text', value });
      i = end;
      continue;
    }

    // 주석, CDATA, 선언(`<?xml ?>`, `<!DOCTYPE >`)
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end === -1) fail(src, i, '주석이 안 닫혔습니다');
      push({ kind: 'comment', value: src.slice(i + 4, end) });
      i = end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i + 9);
      if (end === -1) fail(src, i, 'CDATA 가 안 닫혔습니다');
      push({ kind: 'cdata', value: src.slice(i + 9, end) });
      i = end + 3;
      continue;
    }
    if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2);
      if (end === -1) fail(src, i, '<? ... ?> 가 안 닫혔습니다');
      push({ kind: 'decl', value: src.slice(i, end + 2) });
      i = end + 2;
      continue;
    }
    if (src.startsWith('<!', i)) {
      const end = src.indexOf('>', i + 2);
      if (end === -1) fail(src, i, '<! ... > 가 안 닫혔습니다');
      push({ kind: 'decl', value: src.slice(i, end + 1) });
      i = end + 1;
      continue;
    }

    // 닫는 태그
    if (src.startsWith('</', i)) {
      NAME.lastIndex = i + 2;
      const m = NAME.exec(src);
      if (m === null) fail(src, i, '닫는 태그에 이름이 없습니다');
      const name = (m as RegExpExecArray)[0];
      const gt = src.indexOf('>', NAME.lastIndex);
      if (gt === -1) fail(src, i, '닫는 태그가 안 닫혔습니다');
      const open = stack.pop();
      if (open === undefined) fail(src, i, `여는 태그 없이 </${name}> 가 닫혔습니다`);
      else if (open.name !== name) fail(src, i, `<${open.name}> 를 열고 </${name}> 로 닫았습니다`);
      i = gt + 1;
      continue;
    }

    // 여는 태그
    NAME.lastIndex = i + 1;
    const m = NAME.exec(src);
    if (m === null) fail(src, i, '태그 이름이 없습니다');
    const el: XmlElement = { kind: 'element', name: (m as RegExpExecArray)[0], attrs: [], children: [], selfClose: false };
    i = NAME.lastIndex;

    // 속성들
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (i >= src.length) fail(src, i, `<${el.name}> 가 안 닫혔습니다`);
      if (src[i] === '>') {
        i++;
        break;
      }
      if (src.startsWith('/>', i)) {
        el.selfClose = true;
        i += 2;
        break;
      }
      NAME.lastIndex = i;
      const an = NAME.exec(src);
      if (an === null) fail(src, i, `<${el.name}> 의 속성 이름을 못 읽었습니다`);
      const aname = (an as RegExpExecArray)[0];
      i = NAME.lastIndex;
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] !== '=') {
        // 값 없는 속성(HTML 버릇). XML 에선 틀렸지만 읽기는 한다. 빈 값으로 둔다.
        el.attrs.push([aname, '']);
        continue;
      }
      i++;
      while (i < src.length && /\s/.test(src[i])) i++;
      const quote = src[i];
      if (quote !== '"' && quote !== "'") fail(src, i, `${aname} 의 값이 따옴표로 안 싸였습니다`);
      const end = src.indexOf(quote, i + 1);
      if (end === -1) fail(src, i, `${aname} 의 따옴표가 안 닫혔습니다`);
      el.attrs.push([aname, src.slice(i + 1, end)]);
      i = end + 1;
    }

    push(el);
    if (!el.selfClose) stack.push(el);
  }

  if (stack.length > 0) {
    const open = stack[stack.length - 1];
    throw new XmlError(`<${open.name}> 가 안 닫혔습니다`, at(src, src.length).line, at(src, src.length).col);
  }
  if (roots.length === 0) throw new XmlError('읽을 것이 없습니다', 1, 1);
  return roots;
}

const escapeText = (s: string): string => s.replace(/&(?![a-zA-Z#][\w]*;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;');

const openTag = (el: XmlElement): string => {
  const attrs = el.attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  return `<${el.name}${attrs}${el.selfClose ? ' />' : '>'}`;
};

const raw = (n: XmlText): string =>
  n.kind === 'comment' ? `<!--${n.value}-->` : n.kind === 'cdata' ? `<![CDATA[${n.value}]]>` : n.value;

/**
 * 편다. **글자만 든 칸은 한 줄에 둔다**. `<title>\n  제목\n</title>` 은 보기에도 나쁘고,
 * 그 사이 공백이 값의 일부인지 아닌지 사람이 헷갈린다.
 */
export function format(nodes: XmlNode[], indent = 2, depth = 0): string {
  const pad = ' '.repeat(indent * depth);
  const lines: string[] = [];
  for (const n of nodes) {
    if (n.kind !== 'element') {
      if (n.kind === 'text') {
        const v = n.value.trim();
        if (v !== '') lines.push(pad + escapeText(v));
      } else if (n.kind === 'decl') {
        lines.push(pad + n.value);
      } else {
        lines.push(pad + raw(n));
      }
      continue;
    }
    if (n.selfClose || n.children.length === 0) {
      lines.push(pad + (n.selfClose ? openTag(n) : `${openTag(n)}</${n.name}>`));
      continue;
    }
    const onlyText = n.children.every((c) => c.kind === 'text' || c.kind === 'cdata');
    if (onlyText) {
      const inner = n.children.map((c) => (c.kind === 'text' ? escapeText(c.value.trim()) : raw(c as XmlText))).join('');
      lines.push(`${pad}${openTag(n)}${inner}</${n.name}>`);
      continue;
    }
    lines.push(pad + openTag(n));
    lines.push(format(n.children, indent, depth + 1));
    lines.push(`${pad}</${n.name}>`);
  }
  return lines.filter((l) => l !== '').join('\n');
}

/** 뭉친다. 태그 *사이의* 공백만 버리고 **글자 안의 공백은 그대로 둔다**(값이 바뀌면 안 된다). */
export function minify(nodes: XmlNode[]): string {
  let out = '';
  for (const n of nodes) {
    if (n.kind === 'element') {
      out += openTag(n);
      if (!n.selfClose) out += `${minify(n.children)}</${n.name}>`;
    } else if (n.kind === 'text') {
      const v = n.value.trim();
      if (v !== '') out += escapeText(v);
    } else {
      out += raw(n);
    }
  }
  return out;
}

/**
 * JSON 으로. 속성은 `@이름`, 글자는 `#text`, 같은 이름이 여럿이면 배열. 널리 쓰이는 약속이다.
 * 우리가 새 약속을 만들면 받는 쪽에서 또 옮겨야 한다.
 */
export function toJson(nodes: XmlNode[]): unknown {
  const one = (el: XmlElement): unknown => {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of el.attrs) obj[`@${k}`] = v;
    const texts = el.children
      .filter((c) => c.kind === 'text' || c.kind === 'cdata')
      .map((c) => (c as XmlText).value.trim())
      .filter((v) => v !== '');
    const kids = el.children.filter((c): c is XmlElement => c.kind === 'element');
    for (const kid of kids) {
      const value = one(kid);
      if (kid.name in obj) {
        const prev = obj[kid.name];
        if (Array.isArray(prev)) prev.push(value);
        else obj[kid.name] = [prev, value];
      } else {
        obj[kid.name] = value;
      }
    }
    if (texts.length > 0) {
      // 속성도 자식도 없으면 **값 그 자체**로 둔다. `{"#text":"제목"}` 은 쓸 때마다 거슬린다.
      if (Object.keys(obj).length === 0) return texts.join(' ');
      obj['#text'] = texts.join(' ');
    }
    return obj;
  };
  const out: Record<string, unknown> = {};
  for (const n of nodes) {
    if (n.kind !== 'element') continue;
    out[n.name] = one(n);
  }
  return out;
}

export const run: ToolRunner = (op, args) => {
  const text = String(args.text ?? '');
  if (text.trim() === '') throw new Error('XML 을 넣어 주세요');
  const nodes = parse(text);
  if (op === 'format') {
    const indent = typeof args.indent === 'number' ? Math.max(0, Math.min(8, args.indent)) : 2;
    return format(nodes, indent);
  }
  if (op === 'minify') return minify(nodes);
  if (op === 'toJson') return JSON.stringify(toJson(nodes), null, 2);
  throw new Error(`xmlfmt 에 ${op} 는 없습니다`);
};
