/**
 * 가짜 데이터 만들기 — 스키마 한 줄씩 (TASK-KL-316 / 6)
 *
 * 화면·표·쿼리를 시험하려면 **그럴듯한 줄 100개**가 필요한데, 손으로 적으면 열 줄에서 지치고
 * 다 「홍길동1·홍길동2」가 된다. 여기서는 칸의 **종류**만 적으면(`이름:name`) 나머지를 채운다.
 *
 * 씨앗(`seed`)을 받는다 — 같은 씨앗이면 **같은 데이터**가 나온다. 시험이 매번 달라지면
 * 그 시험은 아무것도 못 잠근다(그래서 `Math.random` 을 안 쓴다).
 * 이름·주소는 ko/en/ja 를 갈라 둔다. 한국 화면을 영어 이름으로 시험하면 폭이 안 맞는다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'mockdata',
  ops: {
    generate: {
      desc:
        'Generate fake rows from a tiny schema (one "field:type" per line).' +
        ' Types: name, email, phone, address, company, job, id, uuid, int(a,b), float(a,b),' +
        ' bool, date(from,to), enum(a|b|c), lorem(n), url. to = json (default), csv, tsv, sql.',
      in: { schema: 'string', count: 'number?', locale: 'string?', to: 'string?', seed: 'number?', table: 'string?' },
      out: 'string'
    }
  }
};

export type Locale = 'ko' | 'en' | 'ja';
export type Out = 'json' | 'csv' | 'tsv' | 'sql';

export interface Field {
  name: string;
  type: string;
  args: string[];
}

/** 씨앗을 받는 난수 — 같은 씨앗이면 같은 줄이 나온다(mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL: Record<Locale, Record<string, string[]>> = {
  ko: {
    family: ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'],
    given: ['서준', '하윤', '도윤', '지우', '시우', '하은', '주원', '유진', '민재', '수아', '지호', '예린', '건우', '나윤', '태윤'],
    city: ['서울시', '부산시', '대구시', '인천시', '광주시', '대전시', '수원시', '성남시', '고양시', '청주시'],
    street: ['테헤란로', '세종대로', '올림픽로', '가로수길', '중앙로', '학동로', '신촌로', '봉은사로'],
    company: ['도토리소프트', '한빛테크', '푸른물산', '새벽컴퍼니', '오름랩스', '달빛스튜디오', '나무공작소'],
    job: ['개발자', '디자이너', '기획자', '마케터', '연구원', '교사', '간호사', '요리사', '작가'],
    word: ['도토리', '겨울', '마법', '인형', '마을', '숲', '별빛', '오후', '이야기', '주머니']
  },
  en: {
    family: ['Smith', 'Johnson', 'Brown', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Lee'],
    given: ['Alex', 'Jamie', 'Riley', 'Morgan', 'Casey', 'Avery', 'Quinn', 'Rowan', 'Sage', 'Emery'],
    city: ['Springfield', 'Riverton', 'Fairview', 'Kingston', 'Ashford', 'Bridgeport', 'Clearwater'],
    street: ['Main St', 'Oak Ave', 'Maple Rd', 'Cedar Ln', 'Sunset Blvd', 'Pine Way'],
    company: ['Acorn Soft', 'Bluewater Labs', 'Northwind', 'Lantern Works', 'Quiet Forge'],
    job: ['Engineer', 'Designer', 'Analyst', 'Teacher', 'Nurse', 'Chef', 'Writer', 'Researcher'],
    word: ['acorn', 'winter', 'magic', 'doll', 'village', 'forest', 'starlight', 'afternoon', 'pocket']
  },
  ja: {
    family: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤'],
    given: ['陽菜', '大翔', '結衣', '悠斗', '葵', '陸', '芽依', '蓮', '莉子', '颯太'],
    city: ['東京都', '大阪市', '名古屋市', '札幌市', '福岡市', '横浜市', '京都市'],
    street: ['桜通り', '中央通り', '銀座', '本町', '緑町', '若葉台'],
    company: ['どんぐりソフト', '青葉テック', '北風商事', '灯工房', '静かな鍛冶'],
    job: ['エンジニア', 'デザイナー', '企画', '研究員', '教師', '看護師', '作家'],
    word: ['どんぐり', '冬', '魔法', '人形', '村', '森', '星明かり', '午後', 'ポケット']
  }
};

const DOMAINS = ['example.com', 'example.org', 'test.dev', 'mail.example'];

/** `이름:name` · `나이:int(20,40)` · `등급:enum(a|b|c)` 를 읽는다. */
export function parseSchema(text: string): Field[] {
  const out: Field[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const at = line.indexOf(':');
    const name = (at < 0 ? line : line.slice(0, at)).trim();
    const rest = (at < 0 ? 'lorem' : line.slice(at + 1)).trim();
    const call = /^(\w+)\s*\(([^)]*)\)$/.exec(rest);
    if (call !== null) out.push({ name, type: call[1].toLowerCase(), args: call[2].split(/[|,]/).map((s) => s.trim()) });
    else out.push({ name, type: rest.toLowerCase(), args: [] });
  }
  return out;
}

const pick = <T>(list: T[], r: () => number): T => list[Math.floor(r() * list.length)];
const romanize = (text: string): string => text.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

function isoDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

export type Cell = string | number | boolean | null;

export function makeCell(field: Field, r: () => number, locale: Locale, index: number): Cell {
  const pool = POOL[locale];
  switch (field.type) {
    case 'name': {
      const fam = pick(pool.family, r);
      const giv = pick(pool.given, r);
      return locale === 'en' ? giv + ' ' + fam : fam + giv;
    }
    case 'email': {
      const user = romanize(pick(POOL.en.given, r)) + Math.floor(r() * 900 + 100);
      return user + '@' + pick(DOMAINS, r);
    }
    case 'phone':
      return locale === 'ja'
        ? '090-' + String(Math.floor(r() * 9000 + 1000)) + '-' + String(Math.floor(r() * 9000 + 1000))
        : '010-' + String(Math.floor(r() * 9000 + 1000)) + '-' + String(Math.floor(r() * 9000 + 1000));
    case 'address':
      return pick(pool.city, r) + ' ' + pick(pool.street, r) + ' ' + Math.floor(r() * 200 + 1);
    case 'company':
      return pick(pool.company, r);
    case 'job':
      return pick(pool.job, r);
    case 'id':
      return index + 1;
    case 'uuid': {
      const hexes = '0123456789abcdef';
      let out = '';
      for (let i = 0; i < 32; i++) out += hexes[Math.floor(r() * 16)];
      return (
        out.slice(0, 8) + '-' + out.slice(8, 12) + '-4' + out.slice(13, 16) + '-a' + out.slice(17, 20) + '-' + out.slice(20, 32)
      );
    }
    case 'int': {
      const lo = Number(field.args[0] ?? 0);
      const hi = Number(field.args[1] ?? 100);
      return Math.floor(r() * (hi - lo + 1)) + lo;
    }
    case 'float': {
      const lo = Number(field.args[0] ?? 0);
      const hi = Number(field.args[1] ?? 1);
      return Math.round((r() * (hi - lo) + lo) * 100) / 100;
    }
    case 'bool':
      return r() < 0.5;
    case 'date': {
      const from = Date.parse((field.args[0] ?? '2020-01-01') + 'T00:00:00Z');
      const to = Date.parse((field.args[1] ?? '2026-12-31') + 'T00:00:00Z');
      return isoDate(from + r() * (to - from));
    }
    case 'enum':
      return field.args.length > 0 ? pick(field.args, r) : '';
    case 'url':
      return 'https://' + pick(DOMAINS, r) + '/' + romanize(pick(POOL.en.word, r));
    case 'lorem': {
      const n = Number(field.args[0] ?? 6);
      const words: string[] = [];
      for (let i = 0; i < n; i++) words.push(pick(pool.word, r));
      return words.join(locale === 'ja' ? '' : ' ');
    }
    default:
      return pick(pool.word, r);
  }
}

export interface GenOpts {
  count?: number;
  locale?: Locale;
  seed?: number;
}

export function generate(schemaText: string, opts: GenOpts = {}): Array<Record<string, Cell>> {
  const fields = parseSchema(schemaText);
  const count = Math.max(0, Math.min(5000, opts.count ?? 10));
  const locale: Locale = opts.locale ?? 'ko';
  const r = rng(opts.seed ?? 1);
  const rows: Array<Record<string, Cell>> = [];
  for (let i = 0; i < count; i++) {
    const row: Record<string, Cell> = {};
    for (const f of fields) row[f.name] = makeCell(f, r, locale, i);
    rows.push(row);
  }
  return rows;
}

function csvCell(v: Cell, sep: string): string {
  const s = v === null ? '' : String(v);
  if (s.includes(sep) || s.includes('"') || s.includes('\n')) return '"' + s.split('"').join('""') + '"';
  return s;
}

function sqlCell(v: Cell): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String.fromCharCode(39) + String(v).split(String.fromCharCode(39)).join(String.fromCharCode(39, 39)) + String.fromCharCode(39);
}

export function emit(rows: Array<Record<string, Cell>>, to: Out, table = 'sample'): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  if (to === 'json') return JSON.stringify(rows, null, 2);
  if (to === 'csv' || to === 'tsv') {
    const sep = to === 'csv' ? ',' : '\t';
    return [keys.join(sep), ...rows.map((row) => keys.map((k) => csvCell(row[k], sep)).join(sep))].join('\n');
  }
  const cols = keys.map((k) => '"' + k + '"').join(', ');
  return rows
    .map((row) => 'INSERT INTO ' + table + ' (' + cols + ') VALUES (' + keys.map((k) => sqlCell(row[k])).join(', ') + ');')
    .join('\n');
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'generate') throw new Error('mockdata: 모르는 연산 ' + op);
  const rows = generate(String(args.schema ?? ''), {
    count: args.count === undefined ? undefined : Number(args.count),
    locale: args.locale === undefined ? undefined : (String(args.locale) as Locale),
    seed: args.seed === undefined ? undefined : Number(args.seed)
  });
  return emit(rows, (String(args.to ?? 'json') as Out), String(args.table ?? 'sample'));
};
