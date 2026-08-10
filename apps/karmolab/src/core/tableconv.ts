/**
 * Table conversion core (TASK-KL-088 / S1)
 *
 * Table conversion between Excel paste, CSV, and Markdown.
 *
 * MCP exposes this because models often drop rows or misalign columns.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'tableconv',
  ops: {
    convert: {
      desc:
        'Convert a table between formats, detecting the input (Excel paste / CSV / Markdown) on its own.' +
        ' Column widths count CJK characters as two cells, so aligned Markdown actually lines up.' +
        ' to = markdown (default), csv, tsv, json.',
      in: { table: 'string', to: 'string?', align: 'boolean?' },
      out: 'string'
    }
  }
};

export type Rows = string[][];

/** Parse Excel paste, CSV, or Markdown table into rows. */
export function parse(text: string): { rows: Rows; kind: string } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return { rows: [], kind: '' };

  // Markdown table: second line is the separator.
  if (lines.length > 1 && /^\s*\|?[\s:|-]+\|[\s:|-]+$/.test(lines[1]) && lines[0].includes('|')) {
    const rows = lines
      .filter((l, i) => i !== 1)
      .map((l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()));
    return { rows, kind: 'Markdown table' };
  }

  // Tabs usually mean pasted spreadsheet data.
  if (lines[0].includes('\t')) return { rows: lines.map((l) => l.split('\t')), kind: 'Excel paste' };

  // Otherwise parse CSV.
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

/** CJK characters count as width 2. */
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
    rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k || `col${i + 1}`, r[i] ?? '']))),
    null,
    2
  );
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'convert') throw new Error(`tableconv has no operation named "${op}"`);
  const { rows, kind } = parse(String(args.table ?? ''));
  if (rows.length === 0) throw new Error('No table data found - paste Excel, CSV, or Markdown table text');

  const to = String(args.to ?? 'markdown');
  const align = args.align !== false;
  const body =
    to === 'csv' ? toCsv(rows)
    : to === 'tsv' ? toTsv(rows)
    : to === 'json' ? toJson(rows)
    : to === 'markdown' ? toMarkdown(rows, align)
    : null;
  if (body === null) throw new Error(`Unknown output format: ${to} (markdown, csv, tsv, json)`);

  return `Input: ${kind} · ${rows.length} rows × ${Math.max(...rows.map((r) => r.length))} columns

${body}`;
};
