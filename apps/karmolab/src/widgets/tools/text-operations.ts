import type { TextOperation, TextOperationResult } from './shared/text-operation';
import { engToKor, korToEng } from '../../core/hangulkey';
import { compose, decompose, initials, split } from '../../core/jamo';
import { countChars, countWords } from './shared/text';
import { byteLength, manuscriptSheets, sentenceCount } from '../../core/charcount';
import { STOP, stripParticle } from '../../core/wordfreq';
import { loadPdfLib, pdfBlob } from './shared/pdf';
import { countEdits, diffLines } from '../../core/diff';
import { bestFix, candidates as encCandidates, explain as encExplain, losses as encLosses } from '../../core/encdetective';
import { clean as uxClean, report as uxReport, scan as uxScan } from '../../core/unicodex';

const CHO = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const JUNG = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const JONG = ['','k','k','k','n','n','n','t','l','k','m','p','t','t','p','t','m','p','p','t','t','ng','t','t','k','t','p','t'];

function romanize(text: string): string { return [...text].map((character) => { const code = character.charCodeAt(0) - 0xac00; return code < 0 || code> 11171 ? character : CHO[Math.floor(code / 588)] + JUNG[Math.floor((code % 588) / 28)] + JONG[code % 28]; }).join(''); }
function splitWords(text: string): string[] { return text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_\-.\s]+/g, ' ').trim().split(/\s+/).filter(Boolean).map((word) => word.toLowerCase()); }
function unwrap(text: string): string { return text.split(/\n\s*\n/).map((paragraph) => paragraph.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reduce((whole, line) => !whole ? line : /[A-Za-z]-$/.test(whole) ? whole.slice(0, -1) + line : `${whole} ${line}`, '')).filter(Boolean).join('\n\n'); }
function wrap(text: string, width: number): string { return text.split(/\n\s*\n/).map((paragraph) => { const lines: string[] = []; let line = ''; paragraph.replace(/\s+/g, ' ').trim().split(' ').forEach((word) => { if (!line) line = word; else if (`${line} ${word}`.length <= width) line += ` ${word}`; else { lines.push(line); line = word; } }); if (line) lines.push(line); return lines.join('\n'); }).join('\n\n'); }
function joinParagraphLines(text: string): string {
  const merged: string[] = [];
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line) { merged.push(''); continue; }
    const previous = merged.length ? merged[merged.length - 1] : '';
    if (!previous || /[.!?。？！:;]$/.test(previous)) { merged.push(line); continue; }
    merged[merged.length - 1] = previous + (/[가-힣]$/.test(previous) && /^[가-힣]/.test(line) ? '' : ' ') + line;
  }
  return merged.join('\n');
}
function autoHangul(input: string): { output: string; korean: number; english: number } {
  const kind = (character: string): 'korean' | 'english' | 'other' => /[가-힣ㄱ-ㅣ]/.test(character) ? 'korean' : /[a-zA-Z]/.test(character) ? 'english' : 'other';
  let output = ''; let korean = 0; let english = 0; let index = 0;
  while (index < input.length) {
    const current = kind(input[index]); let end = index;
    while (end < input.length && (kind(input[end]) === current || kind(input[end]) === 'other')) end++;
    const segment = input.slice(index, end);
    if (current === 'korean') { output += korToEng(segment); korean++; }
    else if (current === 'english') { output += engToKor(segment); english++; }
    else output += segment;
    index = end;
  }
  return { output, korean, english };
}
function replaceText(input: string, values: Record<string, string | boolean | number>): TextOperationResult {
  const find = String(values.find || '');
  if (!find) return { output: input, status: '찾을 글을 넣어 주세요' };
  const escaped = values.regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = values.word ? `\\b${escaped}\\b` : escaped;
  try {
    const expression = new RegExp(source, values.case ? 'g' : 'gi');
    const count = [...input.matchAll(new RegExp(source, values.case ? 'g' : 'gi'))].length;
    return { output: input.replace(expression, String(values.replace || '')), status: count ? `${count}곳을 바꿨습니다` : '찾는 글이 없습니다' };
  } catch { return { output: input, status: '정규식이 올바르지 않습니다' }; }
}
function listDiff(input: string, values: Record<string, string | boolean | number>): TextOperationResult {
  const normalize = (value: string): string => values.trim ? value.trim() : value;
  const left = input.split(/\r?\n/).map(normalize).filter(Boolean);
  const right = String(values.other || '').split(/\r?\n/).map(normalize).filter(Boolean);
  const rightSet = new Set(right); const leftSet = new Set(left);
  const both = left.filter((value) => rightSet.has(value));
  const onlyLeft = left.filter((value) => !rightSet.has(value));
  const onlyRight = right.filter((value) => !leftSet.has(value));
  const output = [`둘 다 (${both.length})`, ...both, '', `첫 목록만 (${onlyLeft.length})`, ...onlyLeft, '', `둘째 목록만 (${onlyRight.length})`, ...onlyRight].join('\n');
  return { output, status: `공통 ${both.length}개 · 첫 목록만 ${onlyLeft.length}개 · 둘째 목록만 ${onlyRight.length}개` };
}
function clean(input: string, values: Record<string, string | boolean | number>): string {
  let source = input;
  if (values.invisible) source = source.replace(/[   -   　]/g, ' ').replace(/[​-‍﻿]/g, '');
  if (values.nfc) source = source.normalize('NFC');
  if (values.join) source = joinParagraphLines(source);
  let lines = source.split(/\r?\n/);
  if (values.trim) lines = lines.map((line) => line.trim());
  if (values.squeeze) lines = lines.map((line) => line.replace(/[ \t]+/g, ' '));
  if (values.dropEmpty) lines = lines.filter((line) => line.trim() !== '');
  if (values.dedupe) lines = lines.filter((line, index) => lines.indexOf(line) === index);
  if (values.sort === 'asc') lines.sort((left, right) => left.localeCompare(right, 'ko-KR'));
  if (values.sort === 'desc') lines.sort((left, right) => right.localeCompare(left, 'ko-KR'));
  if (values.sort === 'length') lines.sort((left, right) => left.length - right.length);
  if (values.sort === 'shuffle') for (let index = lines.length - 1; index> 0; index--) { const target = Math.floor(Math.random() * (index + 1)); [lines[index], lines[target]] = [lines[target], lines[index]]; }
  if (values.reverse) lines.reverse();
  if (values.case === 'upper') lines = lines.map((line) => line.toUpperCase());
  if (values.case === 'lower') lines = lines.map((line) => line.toLowerCase());
  if (values.case === 'title') lines = lines.map((line) => line.replace(/\b[a-z]/g, (character) => character.toUpperCase()));
  const prefix = String(values.prefix || ''); const suffix = String(values.suffix || '');
  if (prefix || suffix) lines = lines.map((line) => prefix + line + suffix);
  if (values.number) lines = lines.map((line, index) => `${index + 1}. ${line}`);
  return lines.join('\n');
}

function redact(input: string, values: Record<string, string | boolean | number>): TextOperationResult {
  const rules: Array<[string, RegExp]> = [
    ['주민등록번호', /\b(\d{6})[-\s]?([1-4]\d{6})\b/g], ['전화번호', /\b01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g],
    ['이메일', /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g], ['IP', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
    ['토큰', /\b(?:sk|pk|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{16,}\b/g], ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g]
  ];
  const enabled = new Set(String(values.kinds || ''));
  const hits: Array<{ start: number; end: number; kind: string; value: string }> = [];
  for (const [kind, expression] of rules) {
    if (enabled.size && !enabled.has(kind)) continue;
    expression.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(input)) !== null) {
      if (hits.some((hit) => match!.index < hit.end && match!.index + match![0].length> hit.start)) continue;
      hits.push({ start: match.index, end: match.index + match[0].length, kind, value: match[0] });
    }
  }
  hits.sort((left, right) => left.start - right.start);
  const style = String(values.style || 'kind'); const numbered = Boolean(values.numbered); const seen = new Map<string, number>();
  let cursor = 0; let output = '';
  for (const hit of hits) {
    output += input.slice(cursor, hit.start);
    const number = seen.get(hit.value) || seen.size + 1; seen.set(hit.value, number);
    output += style === 'drop' ? '' : style === 'mask' ? hit.value.replace(/[^\s\-.@]/g, '*') : `[${hit.kind}${numbered ? number : ''}]`;
    cursor = hit.end;
  }
  output += input.slice(cursor);
  return { output, status: hits.length ? `${hits.length}개 항목을 가렸습니다.` : '가릴 개인 정보가 없습니다.' };
}

function frequency(input: string, values: Record<string, string | boolean | number>): TextOperationResult {
  const lower = Boolean(values.case) ? (word: string): string => word : (word: string): string => word.toLowerCase();
  const words = (input.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []).map(lower).map((word) => Boolean(values.particle) ? stripParticle(word) : word).filter((word) => word.length> 1 && (!Boolean(values.stop) || !STOP.has(word)));
  const counts = new Map<string, number>(); for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  const rows = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ko-KR')).slice(0, 100);
  return { output: rows.map(([word, count]) => `${word}\t${count}`).join('\n'), status: `${words.length}개 단어에서 ${rows.length}개 상위 항목을 찾았습니다.` };
}

function characterStats(input: string): TextOperationResult {
  const withoutSpace = countChars(input.replace(/\s/g, ''));
  const lines = input ? input.split(/\r?\n/).length : 0;
  const paragraphs = input.trim() ? input.trim().split(/\n\s*\n/).length : 0;
  const output = [
    `공백 포함\t${countChars(input)}`, `공백 제외\t${withoutSpace}`, `단어\t${countWords(input)}`, `줄\t${lines}`,
    `문장\t${sentenceCount(input)}`, `문단\t${paragraphs}`, `원고지\t${manuscriptSheets(input)}`, `UTF-8 bytes\t${byteLength(input, 'utf8')}`
  ].join('\n');
  return { output, status: input ? '글 통계를 계산했습니다.' : '글을 붙여 넣어 주세요.' };
}

/* 견주는 셈은 `core/diff` 하나만 쓴다 (TASK-KL-316) — 여기와 `diff` 도구가 따로 세면 같은 두 글에
   다른 답이 나온다. 여기 남는 건 이 화면의 말투(추가/삭제 표시)뿐이다. */
function textDiff(input: string, values: Record<string, string | boolean | number>): TextOperationResult {
  const trimEnds = (text: string): string => (Boolean(values.trim) ? text.split(/\r?\n/).map((line) => line.replace(/\s+$/, '')).join('\n') : text);
  const edits = diffLines(trimEnds(input), trimEnds(String(values.other || '')), { ignoreCase: !Boolean(values.case) });
  const output = edits.filter((edit) => !(Boolean(values.changed) && edit.kind === 'same')).map((edit) => (edit.kind === 'add' ? '+ ' : edit.kind === 'del' ? '- ' : '  ') + edit.text);
  const stat = countEdits(edits);
  return { output: output.join('\n'), status: stat.added || stat.removed ? `추가 ${stat.added}줄 · 삭제 ${stat.removed}줄` : '두 글이 같습니다.' };
}

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat'.split(' ');
function lorem(values: Record<string, string | boolean | number>): TextOperationResult {
  const count = Number(values.count || 3); const korean = String(values.language) === 'ko';
  const words = korean ? ['가벼운', '예시', '문장을', '자연스럽게', '배치해', '레이아웃을', '확인합니다', '내용은', '임시', '텍스트입니다'] : LOREM;
  const pick = (): string => words[Math.floor(Math.random() * words.length)];
  const sentence = (): string => Array.from({ length: 6 + Math.floor(Math.random() * 8) }, pick).join(' ') + '.';
  const unit = String(values.unit || 'para');
  const rows = Array.from({ length: count }, () => unit === 'word' ? pick() : unit === 'sentence' ? sentence() : Array.from({ length: 3 + Math.floor(Math.random() * 3) }, sentence).join(' '));
  return { output: rows.join(unit === 'word' ? ' ' : unit === 'sentence' ? '\n' : '\n\n'), status: `${count}개 ${unit === 'word' ? '단어' : unit === 'sentence' ? '문장' : '문단'}을 만들었습니다.` };
}

function checklist(input: string): TextOperationResult {
  const items = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { output: items.map((item) => `- [ ] ${item}`).join('\n'), status: items.length ? `${items.length}개 항목을 체크리스트로 만들었습니다.` : '항목을 한 줄에 하나씩 써 주세요.' };
}

function textCanvas(input: string, values: Record<string, string | boolean | number>): HTMLCanvasElement {
  const ratio = String(values.ratio || 'square'); const dimensions: Record<string, [number, number]> = { square: [1080, 1080], wide: [1200, 675], story: [1080, 1350], banner: [1200, 400] };
  const [width, height] = dimensions[ratio] || dimensions.square; const dark = String(values.theme || 'dark') === 'dark';
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!; context.fillStyle = dark ? '#12141a' : '#f7f8fa'; context.fillRect(0, 0, width, height); context.fillStyle = dark ? '#f2f4f8' : '#1a1d24';
  const padding = Math.round(width * 0.09); let fontSize = Number(values.size || 0) || Math.round(width * 0.09); let lines: string[] = [];
  for (let attempt = 0; attempt < 40; attempt++) { context.font = `700 ${fontSize}px sans-serif`; lines = []; for (const paragraph of input.split('\n')) { let line = ''; for (const character of paragraph || ' ') { if (context.measureText(line + character).width> width - padding * 2 && line) { lines.push(line); line = character; } else line += character; } lines.push(line); } if (lines.length * fontSize * 1.45 <= height - padding * 2 || Number(values.size)) break; fontSize = Math.max(12, Math.round(fontSize * 0.92)); }
  context.textBaseline = 'middle'; const step = fontSize * 1.45; let y = height / 2 - lines.length * step / 2 + step / 2; for (const line of lines) { const measured = context.measureText(line).width; context.fillText(line, (width - measured) / 2, y); y += step; }
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> { return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('이미지를 만들지 못했습니다.')), 'image/png')); }

async function makePdf(input: string, values: Record<string, string | boolean | number>): Promise<{ blob: Blob; name: string; status: string }> {
  if (!input.trim()) throw new Error('글을 붙여 넣어 주세요.'); const library = await loadPdfLib(); if (!library) throw new Error('PDF 라이브러리를 불러오지 못했습니다.');
  const canvas = textCanvas(input, { ...values, ratio: 'story', theme: 'light' }); const image = await library.PDFDocument.create(); const png = await image.embedPng(await (await canvasBlob(canvas)).arrayBuffer()); image.addPage([595, 842]).drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
  return { blob: pdfBlob(await image.save()), name: 'text.pdf', status: 'PDF를 만들었습니다.' };
}

/**
 * 깨진 글자를 되살린다 (TASK-KL-316) — 셈은 `core/encdetective`, 여기는 말투만.
 *
 * 「고쳤다」가 아니라 **무엇이 잘못 읽혔는지**를 같이 적는다. 그래야 다음에 안 겪는다.
 */
function encFix(input: string, values: Record<string, string | boolean | number>): TextOperationResult {
  if (input.trim() === '') return { output: '', status: '깨진 글을 붙여 넣어 주세요.' };
  const mode = String(values.mode || 'auto');
  if (mode === 'explain') return { output: encExplain(input), status: `되짚기 ${encCandidates(input).length}가지를 해 봤습니다.` };
  if (mode === 'all') {
    const rows = encCandidates(input).map((c) => `[${String(c.score).padStart(3, ' ')}] ${c.how}\n${c.text}`);
    return { output: rows.join('\n\n'), status: `되짚기 ${rows.length}가지를 점수순으로 놓았습니다.` };
  }
  const best = bestFix(input);
  const lost = encLosses(input);
  const warn = lost.replacement> 0 ? ` (되살릴 수 없는 자리 ${lost.replacement}곳은 그대로 둡니다)` : '';
  if (best.text === input) return { output: input, status: `되살릴 것이 없습니다 — 안 깨진 글로 보입니다.${warn}` };
  return { output: best.text, status: `${best.how}${warn}` };
}

export const TEXT_OPERATIONS: TextOperation[] = [
  { id: 'text2pdf', title: '글을 PDF로', description: '글을 브라우저 안에서 A4 PDF로 만듭니다.', controls: [{ id: 'size', label: '글자 크기', kind: 'range', initial: 0, min: 0, max: 120 }], run: (input) => ({ output: input, status: input ? 'PDF 만들기를 누르면 내려받습니다.' : '글을 붙여 넣어 주세요.' }), action: { label: 'PDF 만들기', run: makePdf } },
  { id: 'text2img', title: '글 카드', description: '글을 PNG 이미지 카드로 만듭니다.', controls: [{ id: 'ratio', label: '비율', kind: 'select', initial: 'square', options: [{ value: 'square', label: '정사각형' }, { value: 'wide', label: '가로' }, { value: 'story', label: '세로' }, { value: 'banner', label: '배너' }] }, { id: 'theme', label: '색', kind: 'select', initial: 'dark', options: [{ value: 'dark', label: '어두움' }, { value: 'light', label: '밝음' }] }, { id: 'size', label: '글자 크기', kind: 'range', initial: 0, min: 0, max: 160 }], run: (input) => ({ output: input, status: input ? 'PNG 만들기를 누르면 내려받습니다.' : '글을 붙여 넣어 주세요.' }), action: { label: 'PNG 만들기', run: async (input, values) => ({ blob: await canvasBlob(textCanvas(input, values)), name: 'text-card.png', status: 'PNG를 만들었습니다.' }) } },
  { id: 'charcount', title: '글자 수', description: '공백·문장·문단·바이트까지 한 번에 셉니다.', run: (input) => characterStats(input) },
  { id: 'wordfreq', title: '단어 빈도', description: '자주 나온 단어를 빈도순으로 정리합니다.', controls: [{ id: 'particle', label: '한국어 조사 덜어내기', kind: 'checkbox', initial: true }, { id: 'stop', label: '불용어 제외', kind: 'checkbox', initial: true }, { id: 'case', label: '대소문자 구분', kind: 'checkbox', initial: false }], run: frequency },
  { id: 'textredact', title: '글 가리기', description: '문서의 개인 정보와 토큰을 찾아 안전한 표기로 바꿉니다.', controls: [{ id: 'kinds', label: '종류 (비우면 모두)', kind: 'text', initial: '' }, { id: 'style', label: '표기', kind: 'select', initial: 'kind', options: [{ value: 'kind', label: '종류 이름' }, { value: 'mask', label: '별표 마스킹' }, { value: 'drop', label: '삭제' }] }, { id: 'numbered', label: '같은 값에 같은 번호', kind: 'checkbox', initial: true }], run: redact },
  { id: 'lorem', title: '더미 텍스트', description: '레이아웃을 확인할 임시 글을 만듭니다.', controls: [{ id: 'language', label: '언어', kind: 'select', initial: 'ko', options: [{ value: 'ko', label: '한국어' }, { value: 'en', label: 'Lorem ipsum' }] }, { id: 'unit', label: '단위', kind: 'select', initial: 'para', options: [{ value: 'para', label: '문단' }, { value: 'sentence', label: '문장' }, { value: 'word', label: '단어' }] }, { id: 'count', label: '개수', kind: 'range', initial: 3, min: 1, max: 20 }], run: (_input, values) => lorem(values) },
  { id: 'textdiff', title: '글 비교', description: '두 글의 달라진 줄을 추가와 삭제로 보여 줍니다.', controls: [{ id: 'other', label: '비교할 글', kind: 'textarea', initial: '' }, { id: 'trim', label: '줄 끝 공백 무시', kind: 'checkbox', initial: true }, { id: 'case', label: '대소문자 구분', kind: 'checkbox', initial: false }, { id: 'changed', label: '바뀐 줄만', kind: 'checkbox', initial: false }], run: textDiff },
  { id: 'unicodex', title: '안 보이는 글자 찾기', description: '눈에 안 보이는 글자·닮은 글자(키릴 а 같은 것)를 찾아 보여 주고, 골라서 지웁니다.', controls: [{ id: 'mode', label: '어떻게', kind: 'select', initial: 'scan', options: [{ value: 'scan', label: '찾아서 보여 주기' }, { value: 'clean', label: '지우고 바로잡기' }] }, { id: 'keep', label: '닮은 글자는 두기', kind: 'checkbox', initial: false }], run: (input, values) => { if (!input) return { output: '', status: '글을 붙여 넣어 주세요.' }; if (String(values.mode) === 'clean') { const output = uxClean(input, { keepConfusables: Boolean(values.keep) }); const n = uxScan(input).length; return { output, status: n ? '수상한 글자 ' + n + '군데를 손봤습니다.' : '손볼 것이 없었습니다.' }; } const found = uxScan(input); return { output: uxReport(input), status: found.length ? found.length + '군데 찾았습니다 — 지우려면 위에서 「지우고 바로잡기」' : '수상한 글자가 없습니다.' }; } },
  { id: 'encdetective', title: '깨진 글자 되살리기', description: '「뷁」·「í•œêµ­ì–´」 처럼 잘못 읽힌 글을 되짚어 원문으로 돌립니다.', controls: [{ id: 'mode', label: '어떻게', kind: 'select', initial: 'auto', options: [{ value: 'auto', label: '가장 그럴듯한 것으로' }, { value: 'all', label: '되짚기 전부 보기' }, { value: 'explain', label: '무슨 일이 있었나' }] }], run: encFix },
  { id: 'checklist', title: '체크리스트', description: '한 줄씩 쓴 항목을 Markdown 체크리스트로 만듭니다.', run: (input) => checklist(input) },
  { id: 'listdiff', title: '목록 비교', description: '두 목록에서 공통인 것과 한쪽에만 있는 것을 가릅니다.', controls: [{ id: 'other', label: '둘째 목록', kind: 'textarea', initial: '' }, { id: 'trim', label: '앞뒤 공백 무시', kind: 'checkbox', initial: true }], run: listDiff },
  { id: 'replace', title: '찾아 바꾸기', description: '찾을 글과 바꿀 글을 정해 본문 전체를 한 번에 바꿉니다.', controls: [{ id: 'find', label: '찾을 글', kind: 'text', initial: '' }, { id: 'replace', label: '바꿀 글', kind: 'text', initial: '' }, { id: 'case', label: '대소문자 구분', kind: 'checkbox', initial: false }, { id: 'word', label: '온전한 낱말만', kind: 'checkbox', initial: false }, { id: 'regex', label: '정규식으로 찾기', kind: 'checkbox', initial: false }], run: replaceText },
  { id: 'jamo', title: '한글 자모', description: '글자를 자모로 풀거나, 자모를 다시 글자로 합치고 초성만 뽑습니다.', controls: [{ id: 'mode', label: '할 일', kind: 'select', initial: 'decompose', options: [{ value: 'decompose', label: '자모로 풀기' }, { value: 'initials', label: '초성만 뽑기' }, { value: 'compose', label: '글자로 합치기' }, { value: 'detail', label: '글자별 초·중·종성 보기' }] }], run: (input, values) => { const mode = String(values.mode); if (mode === 'compose') return { output: compose(input), status: input ? '자모를 글자로 합쳤습니다' : '글을 넣어 주세요' }; if (mode === 'initials') return { output: initials(input), status: input ? '초성을 뽑았습니다' : '글을 넣어 주세요' }; if (mode === 'detail') { const output = [...input].map((character) => { const parts = split(character); return parts ? `${character}: 초성 ${parts[0]} · 중성 ${parts[1]} · 종성 ${parts[2] || '없음'}` : ''; }).filter(Boolean).join('\n'); return { output, status: input ? '글자별 자모를 살펴봅니다' : '글을 넣어 주세요' }; } return { output: decompose(input), status: input ? '글자를 자모로 풀었습니다' : '글을 넣어 주세요' }; } },
  { id: 'hangulkey', title: '한영타 되돌리기', description: '한영키를 안 누르고 친 글을 두벌식 자판 기준으로 되돌립니다.', controls: [{ id: 'direction', label: '바꾸는 방향', kind: 'select', initial: 'auto', options: [{ value: 'auto', label: '자동으로 판단' }, { value: 'toKorean', label: '영문 → 한글' }, { value: 'toEnglish', label: '한글 → 영문' }] }], run: (input, values) => { const direction = String(values.direction); if (direction === 'toKorean') return { output: engToKor(input), status: input ? '영문을 한글 자판으로 바꿨습니다' : '글을 넣어 주세요' }; if (direction === 'toEnglish') return { output: korToEng(input), status: input ? '한글을 영문 자판으로 바꿨습니다' : '글을 넣어 주세요' }; const result = autoHangul(input); return { output: result.output, status: input ? result.korean && result.english ? `한글 ${result.korean}조각 · 영문 ${result.english}조각을 각각 바꿨습니다` : result.korean ? '한글을 영문 자판으로 바꿨습니다' : result.english ? '영문을 한글 자판으로 바꿨습니다' : '바꿀 한글·영문 글자가 없습니다' : '글을 넣어 주세요' }; } },
  { id: 'textclean', title: '글 정리', description: '여러 줄의 공백·중복·순서·표기를 한 번에 다듬습니다.', controls: [{ id: 'trim', label: '앞뒤 공백 지우기', kind: 'checkbox', initial: true }, { id: 'squeeze', label: '공백 하나로 모으기', kind: 'checkbox', initial: false }, { id: 'dropEmpty', label: '빈 줄 지우기', kind: 'checkbox', initial: true }, { id: 'dedupe', label: '중복 줄 지우기', kind: 'checkbox', initial: false }, { id: 'invisible', label: '보이지 않는 글자 정리', kind: 'checkbox', initial: true }, { id: 'nfc', label: '한글 자모 합치기', kind: 'checkbox', initial: true }, { id: 'join', label: '문단 안 줄 잇기', kind: 'checkbox', initial: false }, { id: 'reverse', label: '순서 뒤집기', kind: 'checkbox', initial: false }, { id: 'number', label: '번호 붙이기', kind: 'checkbox', initial: false }, { id: 'sort', label: '정렬', kind: 'select', initial: 'none', options: [{ value: 'none', label: '그대로' }, { value: 'asc', label: '가나다순' }, { value: 'desc', label: '역순' }, { value: 'length', label: '짧은 줄부터' }] }, { id: 'case', label: '대소문자', kind: 'select', initial: 'none', options: [{ value: 'none', label: '그대로' }, { value: 'upper', label: '대문자' }, { value: 'lower', label: '소문자' }, { value: 'title', label: 'Title Case' }] }, { id: 'prefix', label: '앞에 붙일 글', kind: 'text', initial: '' }, { id: 'suffix', label: '뒤에 붙일 글', kind: 'text', initial: '' }], run: (input, values) => { const output = clean(input, values); return { output, status: input ? `${input.split(/\r?\n/).length}줄 → ${output ? output.split(/\r?\n/).length : 0}줄` : '글을 넣어 주세요' }; } },
  { id: 'slug', title: '슬러그 만들기', description: '제목을 주소에 쓸 형태로 바꿉니다.', controls: [{ id: 'romanize', label: '한글 로마자 표기', kind: 'checkbox', initial: true }, { id: 'lower', label: '소문자', kind: 'checkbox', initial: true }, { id: 'separator', label: '구분 기호', kind: 'select', initial: '-', options: [{ value: '-', label: '하이픈 (-)' }, { value: '_', label: '밑줄 (_)' }] }], run: (input, values) => { const separator = String(values.separator); const output = input.split(/\r?\n/).map((line) => { let value = values.romanize ? romanize(line) : line; value = value.normalize('NFKD').replace(/[̀-ͯ]/g, ''); if (values.lower) value = value.toLowerCase(); return value.replace(/['"’`]/g, '').replace(/[^a-zA-Z0-9가-힣]+/g, separator).replace(new RegExp(`\\${separator}{2,}`, 'g'), separator).replace(new RegExp(`^\\${separator}|\\${separator}$`, 'g'), ''); }).join('\n'); return { output, status: input ? `가장 긴 결과 ${Math.max(0, ...output.split('\n').map((line) => line.length))}자` : '글을 넣어 주세요' }; } },
  { id: 'case', title: '표기법 바꾸기', description: '이름을 원하는 코드 표기법으로 바꿉니다.', controls: [{ id: 'style', label: '표기법', kind: 'select', initial: 'camel', options: [{ value: 'camel', label: 'camelCase' }, { value: 'pascal', label: 'PascalCase' }, { value: 'snake', label: 'snake_case' }, { value: 'screaming', label: 'SCREAMING_SNAKE' }, { value: 'kebab', label: 'kebab-case' }, { value: 'dot', label: 'dot.case' }, { value: 'title', label: 'Title Case' }] }], run: (input, values) => { const style = String(values.style); const output = input.split(/\r?\n/).filter(Boolean).map((line) => { const words = splitWords(line); const caps = words.map((word) => word[0].toUpperCase() + word.slice(1)); if (style === 'camel') return words[0] + caps.slice(1).join(''); if (style === 'pascal') return caps.join(''); if (style === 'snake') return words.join('_'); if (style === 'screaming') return words.join('_').toUpperCase(); if (style === 'kebab') return words.join('-'); if (style === 'dot') return words.join('.'); return caps.join(' '); }).join('\n'); return { output, status: input ? `${output.split('\n').length}줄을 바꿨습니다` : '글을 넣어 주세요' }; } },
  { id: 'linebreak', title: '줄바꿈 정리', description: '복사해 온 글을 잇거나 읽기 좋은 폭으로 다시 나눕니다.', controls: [{ id: 'mode', label: '할 일', kind: 'select', initial: 'unwrap', options: [{ value: 'unwrap', label: '문단 안 줄 잇기' }, { value: 'wrap', label: '다시 줄 나누기' }, { value: 'single', label: '한 줄로 만들기' }] }, { id: 'width', label: '한 줄 길이', kind: 'range', initial: 60, min: 20, max: 120 }], run: (input, values) => { const mode = String(values.mode); const output = mode === 'unwrap' ? unwrap(input) : mode === 'wrap' ? wrap(unwrap(input), Number(values.width)) : input.replace(/\s+/g, ' ').trim(); return { output, status: input ? `${input.split(/\r?\n/).length}줄 → ${output.split(/\r?\n/).length}줄` : '글을 넣어 주세요' }; } }
];
