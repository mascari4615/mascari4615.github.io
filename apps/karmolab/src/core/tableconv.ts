/**
 * 표 바꾸기 — 알맹이 (TASK-KL-088 / S1)
 *
 * 엑셀에서 복사한 표를 깃허브 글이나 노션에 붙이려면 마크다운 표로 바꿔야 하고, 반대로
 * 문서의 표를 계산기로 옮기려면 다시 엑셀 붙여넣기 꼴이 필요하다. 손으로 하면 세로줄 맞추다 끝난다.
 *
 * MCP 로 내놓는 이유(A등급): LLM 이 표를 옮겨 적으면 **줄이 사라지거나 열이 밀린다.** 게다가
 * 한글은 글자 하나가 두 칸을 차지해서, 세로줄을 맞춰 준다고 해 놓고 실제로는 어긋난 표를 낸다.
 * 여기선 들어온 꼴(엑셀 탭 · CSV · 마크다운)을 스스로 알아보고, 폭도 한글 두 칸으로 센다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'tableconv',
  ops: {
    convert: {
      desc:
        '표를 다른 꼴로 바꾼다. 들어온 것이 엑셀 붙여넣기(탭)·CSV·마크다운 표 중 무엇인지 스스로 알아본다.'
        + ' to = markdown(기본) · csv · tsv · json. align 을 끄면 마크다운 세로줄을 안 맞춘다.',
      in: { table: 'string', to: 'string?', align: 'boolean?' },
      out: 'string'
    }
  }
};

export type Rows = string[][];

/** 엑셀 붙여넣기(탭 구분) · CSV · 마크다운 표를 모두 받아 표로 만든다. */
export function parse(text: string): { rows: Rows; kind: string } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return { rows: [], kind: '' };

  // 마크다운 표: 두 번째 줄이 --- 로 된 구분선
  if (lines.length > 1 && /^\s*\|?[\s:|-]+\|[\s:|-]+$/.test(lines[1]) && lines[0].includes('|')) {
    const rows = lines
      .filter((l, i) => i !== 1)
      .map((l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()));
    return { rows, kind: '마크다운 표' };
  }

  // 탭이 있으면 엑셀에서 복사한 것이다 (가장 잦은 경우)
  if (lines[0].includes('\t')) return { rows: lines.map((l) => l.split('\t')), kind: '엑셀 붙여넣기' };

  // 그 외에는 CSV — 따옴표 안의 쉼표를 지켜야 한다
  const rows = lines.map((line) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  });
  return { rows, kind: 'CSV' };
}

/** 한글은 글자 하나가 두 칸을 차지한다 — 그걸 세지 않으면 세로줄이 안 맞는다. */
export function width(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return w;
}
export const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - width(s)));

export function toMarkdown(rows: Rows, align: boolean): string {
  if (!rows.length) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
  if (!align) {
    const head = `| ${grid[0].join(' | ')} |`;
    const sep = `| ${grid[0].map(() => '---').join(' | ')} |`;
    return [head, sep, ...grid.slice(1).map((r) => `| ${r.join(' | ')} |`)].join('\n');
  }
  const widths = Array.from({ length: cols }, (_, i) => Math.max(3, ...grid.map((r) => width(r[i]))));
  const line = (r: string[]): string => `| ${r.map((c, i) => pad(c, widths[i])).join(' | ')} |`;
  const sep = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;
  return [line(grid[0]), sep, ...grid.slice(1).map(line)].join('\n');
}

export const toCsv = (rows: Rows): string =>
  rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(',')).join('\n');

export const toTsv = (rows: Rows): string => rows.map((r) => r.join('\t')).join('\n');

export function toJson(rows: Rows): string {
  if (rows.length < 2) return '[]';
  const keys = rows[0];
  return JSON.stringify(
    rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k || `열${i + 1}`, r[i] ?? '']))),
    null,
    2
  );
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'convert') throw new Error(`tableconv 에 「${op}」 는 없습니다`);
  const { rows, kind } = parse(String(args.table ?? ''));
  if (rows.length === 0) throw new Error('표를 못 읽었습니다 — 엑셀에서 복사한 것·CSV·마크다운 표를 넣어 주세요');

  const to = String(args.to ?? 'markdown');
  const align = args.align !== false;
  const body =
    to === 'csv' ? toCsv(rows)
    : to === 'tsv' ? toTsv(rows)
    : to === 'json' ? toJson(rows)
    : to === 'markdown' ? toMarkdown(rows, align)
    : null;
  if (body === null) throw new Error(`모르는 꼴입니다: ${to} (markdown · csv · tsv · json)`);

  return `읽은 꼴: ${kind} · ${rows.length}줄 × ${Math.max(...rows.map((r) => r.length))}열

${body}`;
};
