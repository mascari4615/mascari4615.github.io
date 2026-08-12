/**
 * 명령줄 뜯어보기 — 자르는 일 (TASK-KL-250)
 *
 * 이 조각은 **화면을 모른다.** 줄 하나를 받아 조각으로 자르고 뜻을 붙일 뿐이다.
 *
 * 자르는 일이 이 도구의 알맹이다. 공백으로 나누면 거의 항상 틀린다:
 *   `git commit -m "두 낱말"` → 따옴표 안은 한 덩어리
 *   `tar -xzvf`              → `-x -z -v -f` 넷이 붙은 것
 *   `ls | grep x`            → 파이프 = 명령이 둘
 * 그래서 ① 따옴표를 살려 자르고 ② 이음말(`|` `&&` `;`)로 명령을 나누고
 * ③ 붙은 짧은 옵션을 펴고 ④ 그다음에 사전을 본다.
 *
 * 바깥으로 아무것도 안 보낸다 — 명령줄에는 서버 주소·사용자 이름·토큰이 섞여 있다.
 */
import { DANGERS, lookupCommand, lookupFlag, type CommandDoc } from './shell-dict';

export type PartKind = 'command' | 'flag' | 'value' | 'operator' | 'redirect' | 'subshell';

export interface Part {
  /** 화면에 그대로 보일 글자 */
  text: string;
  kind: PartKind;
  /** 한 줄 설명. 모르면 빈 문자열 */
  what: string;
  /** 이 조각이 속한 명령 (`git`, `tar` …) */
  of?: string;
  /** 되돌릴 수 없거나 위험한 것 */
  danger?: string;
}

export interface Segment {
  /** 이 도막을 앞 도막과 잇는 말 (`|`, `&&`, `;`) — 첫 도막은 없다 */
  join?: string;
  /** 이음말이 무슨 뜻인가 */
  joinWhat?: string;
  parts: Part[];
  /** 이 도막이 부르는 명령 이름 */
  name: string;
  /** 그 명령이 뭘 하는가 */
  summary: string;
}

/* ── 자르기 ───────────────────────────────────────────────────────────── */

/**
 * 따옴표와 이스케이프를 살려 낱말로 자른다.
 *
 * 따옴표 안의 공백은 자르지 않고, 따옴표 자체는 **지우지 않는다** — 화면에 원래 모습
 * 그대로 보여야 사람이 자기가 붙여넣은 줄을 알아본다.
 */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '\\' && i + 1 < line.length) {
      cur += c + line[i + 1];
      i += 1;
      continue;
    }
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    /* 이음말과 방향 바꾸기는 붙어 있어도 낱말이다 — `ls|grep` 처럼 띄어쓰기 없이 쓴다. */
    const two = line.slice(i, i + 2);
    if (two === '&&' || two === '||' || two === '>>' || two === '2>') {
      if (cur) out.push(cur);
      out.push(two);
      cur = '';
      i += 1;
      continue;
    }
    if (c === '|' || c === ';' || c === '>' || c === '<') {
      if (cur) out.push(cur);
      out.push(c);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

const JOINERS: Record<string, string> = {
  '|': '앞 명령의 결과를 뒤 명령에 넘긴다',
  '&&': '앞이 성공했을 때만 뒤를 실행한다',
  '||': '앞이 실패했을 때만 뒤를 실행한다',
  ';': '성공하든 말든 이어서 실행한다'
};

const REDIRECTS: Record<string, string> = {
  '>': '결과를 파일에 쓴다 (있던 내용은 지운다)',
  '>>': '결과를 파일 끝에 덧붙인다',
  '<': '파일 내용을 입력으로 넣는다',
  '2>': '오류 메시지를 파일로 보낸다'
};

/**
 * 붙어 있는 짧은 옵션을 편다. `-xzvf` → `-x -z -v -f`.
 *
 * 다만 **긴 옵션(`--all`)과 음수·경로처럼 보이는 것은 건드리지 않는다** — `-1` 은 옵션이지만
 * `-2.5` 는 값이고, `--` 는 「여기부터는 옵션이 아니다」라는 뜻이다.
 */
export function expandFlags(token: string): string[] {
  if (!token.startsWith('-') || token.startsWith('--') || token === '-' || token === '--') return [token];
  const body = token.slice(1);
  if (!/^[A-Za-z]{2,}$/.test(body)) return [token];
  return body.split('').map((c) => '-' + c);
}

/* ── 뜻 붙이기 ────────────────────────────────────────────────────────── */

function dangerOf(name: string, tokens: string[]): string | undefined {
  const joined = (name + ' ' + tokens.join(' ')).toLowerCase();
  for (const d of DANGERS) {
    if (d.match.test(joined)) return d.why;
  }
  return undefined;
}

/** 한 도막(이음말로 나뉜 한 명령)을 뜯는다. */
function explainSegment(tokens: string[], join?: string): Segment {
  const parts: Part[] = [];
  let name = '';
  let doc: CommandDoc | null = null;
  let sub = '';

  const danger = dangerOf(tokens[0] || '', tokens.slice(1));

  for (let i = 0; i < tokens.length; i += 1) {
    const tk = tokens[i];

    if (REDIRECTS[tk]) {
      parts.push({ text: tk, kind: 'redirect', what: REDIRECTS[tk] });
      continue;
    }

    if (!name) {
      name = tk;
      doc = lookupCommand(tk);
      parts.push({ text: tk, kind: 'command', what: doc ? doc.what : '', of: tk, danger });
      continue;
    }

    if (tk.startsWith('-')) {
      for (const one of expandFlags(tk)) {
        const f = lookupFlag(name, one, sub);
        parts.push({ text: one, kind: 'flag', what: f, of: name });
      }
      continue;
    }

    /* 첫 낱말이 하위 명령인 경우(`git commit`, `docker run`) — 사전이 그렇게 적어 두었을 때만. */
    if (!sub && doc?.subs && doc.subs[tk]) {
      sub = tk;
      parts.push({ text: tk, kind: 'command', what: doc.subs[tk], of: name });
      continue;
    }

    parts.push({ text: tk, kind: 'value', what: '', of: name });
  }

  return {
    join,
    joinWhat: join ? JOINERS[join] : undefined,
    parts,
    name,
    summary: doc ? (sub && doc.subs?.[sub] ? doc.subs[sub] : doc.what) : ''
  };
}

/**
 * 줄 하나를 도막들로 뜯는다.
 *
 * 도막이 여럿이면 그건 **명령이 여럿**이라는 뜻이다 — 그 사실 자체가 설명의 절반이다
 * (`curl … | sh` 가 왜 위험한지는 「둘로 나뉜다」를 봐야 보인다).
 */
export function explain(line: string): Segment[] {
  const tokens = tokenize(line.trim());
  if (!tokens.length) return [];
  const segs: Segment[] = [];
  let cur: string[] = [];
  let join: string | undefined;
  for (const tk of tokens) {
    if (JOINERS[tk]) {
      if (cur.length) segs.push(explainSegment(cur, join));
      cur = [];
      join = tk;
      continue;
    }
    cur.push(tk);
  }
  if (cur.length) segs.push(explainSegment(cur, join));
  return segs;
}

/** 이 줄에서 되돌릴 수 없는 것들. 화면 맨 위에 크게 띄운다. */
export function dangersOf(segs: Segment[]): string[] {
  const out: string[] = [];
  for (const s of segs) {
    for (const p of s.parts) {
      if (p.danger && !out.includes(p.danger)) out.push(p.danger);
    }
  }
  /* 「받아서 바로 실행」은 도막 둘이 만나야 생기는 위험이라 조각 하나만 봐선 안 보인다. */
  const names = segs.map((s) => s.name);
  const fetches = names.some((n) => /^(curl|wget)$/.test(n));
  const runs = names.some((n) => /^(sh|bash|zsh|python|node|powershell|pwsh)$/.test(n));
  if (fetches && runs) {
    const why = '인터넷에서 받은 것을 **읽어 보지도 않고 바로 실행**합니다. 그 파일이 바뀌면 그대로 당합니다';
    if (!out.includes(why)) out.unshift(why);
  }
  return out;
}
