/**
 * build-worldbook: memo/wm/design/** → apps/karmolab/data/worldbook.json (단방향)
 *
 * 왜: KarmoLab 이 WM 의 메인 웹이 된다(정본 memo/projects/karmolab/wm-hub.md). 그런데 WM 은
 * 한창 개발 중이라 문서 모양이 자주 바뀐다. 그래서 이 수집기는 **WM 의 현재 스키마를 모른다** —
 * frontmatter 에 있는 키를 그대로 싣고, 없는 것은 조용히 뺀다. 필드가 늘어도 웹 코드는 안 고친다.
 *
 * 기존 sync-wiki.mjs 와의 차이: sync-wiki 는 `slug/entityId/type/title` 을 강제하는 **엄격한**
 * entity 파이프(캐릭터 카드·챗봇 바인딩용). 이쪽은 설정 문서 전체를 **느슨하게** 긁는 도감용이다.
 * 파서(frontmatter 부분집합)는 같은 규약을 쓴다.
 *
 * 공개 범위: memo/wm/design/web-policy.json (폴더 단위) + 문서 frontmatter `web:` (문서가 이김).
 *   public = 본문까지 / summary = 제목·한 줄만 / private = 산출에 없음
 *
 * 사용:
 *   node scripts/build-worldbook.mjs            # 수집 후 data/worldbook.json 갱신
 *   node scripts/build-worldbook.mjs --check    # 갱신 없이 검사만 (CI 게이트)
 */
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(KARMOLAB_ROOT, '../..');
const MEMO_PATH = process.env.KARMODDRINE_MEMO_PATH || path.resolve(REPO_ROOT, '../memo');
const DESIGN_ROOT = path.join(MEMO_PATH, 'wm/design');
const POLICY_PATH = path.join(DESIGN_ROOT, 'web-policy.json');
const OUT_PATH = path.join(KARMOLAB_ROOT, 'data/worldbook.json');

const CHECK = process.argv.includes('--check');

/** 폴더명 → 사람이 읽는 종류 이름. 없으면 폴더명 그대로 — 새 폴더가 생겨도 탭이 자동으로 뜬다. */
const KIND_LABEL = {
  characters: '인물',
  world: '세계',
  gameplay: '규칙',
  art: '그림·소리',
  vision: '방향',
  content: '콘텐츠',
  systems: '시스템',
};

// ── frontmatter (sync-wiki.mjs / src/world/parse-md.ts 와 같은 부분집합) ────────────────────
function splitFrontmatter(md) {
  const lines = md.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { fm: '', body: md };
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '---' || t === '...') {
      return {
        fm: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n').replace(/^\n+/, ''),
      };
    }
  }
  return { fm: '', body: md };
}

function unquoteScalar(s) {
  const t = String(s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\n/g, '\n');
  }
  // 인라인 목록 [a, b, c]
  if (t.startsWith('[') && t.endsWith(']')) {
    const inner = t.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((x) => unquoteScalar(x));
  }
  return t;
}

function parseYamlSimple(yaml) {
  const lines = yaml.split(/\r?\n/);
  const obj = {};
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) { i++; continue; }
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw);
    if (!m) { i++; continue; }
    const key = m[1];
    const rest = m[2];
    if (rest === '|' || rest === '|+' || rest === '|-' || rest === '>') {
      i++;
      const block = [];
      let indent = null;
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === '') { block.push(''); i++; continue; }
        if (!/^\s/.test(l)) break;
        const ind = l.match(/^(\s*)/)[1].length;
        if (indent === null) indent = ind;
        block.push(l.slice(indent));
        i++;
      }
      obj[key] = block.join('\n').replace(/\n+$/, '');
      continue;
    }
    if (rest === '') {
      i++;
      if (i < lines.length && /^\s*-\s/.test(lines[i])) {
        const list = [];
        while (i < lines.length && /^\s*-\s/.test(lines[i])) {
          list.push(unquoteScalar(lines[i].replace(/^\s*-\s*/, '')));
          i++;
        }
        obj[key] = list;
        continue;
      }
      obj[key] = '';
      continue;
    }
    obj[key] = unquoteScalar(rest);
    i++;
  }
  return obj;
}

// ── 문서에서 사람이 읽는 조각 뽑기 (없으면 조용히 생략 — 필수는 title 하나) ─────────────────
function firstHeading(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

/** 첫 문단 = 한 줄 소개. 인용(>)·표·목록·머리말은 건너뛴다. */
function firstParagraph(body) {
  const lines = body.split(/\r?\n/);
  const buf = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === '') { if (buf.length > 0) break; continue; }
    if (t.startsWith('#') || t.startsWith('>') || t.startsWith('|') || t.startsWith('```')) {
      if (buf.length > 0) break;
      continue;
    }
    if (/^[-*]\s/.test(t)) { if (buf.length > 0) break; continue; }
    buf.push(t);
    if (buf.join(' ').length > 200) break;
  }
  const s = buf.join(' ').replace(/\*\*/g, '').replace(/`/g, '');
  return s.length > 220 ? s.slice(0, 217) + '…' : s;
}

function toArray(v) {
  if (v == null || v === '') return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

// ── 수집 ────────────────────────────────────────────────────────────────────────────────────
async function walk(dir, out = []) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      await walk(p, out);
      continue;
    }
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    if (e.name.toLowerCase() === 'readme.md') continue;
    out.push(p);
  }
  return out;
}

function slugify(rel) {
  return rel
    .replace(/\\/g, '/')
    .replace(/\.md$/, '')
    .replace(/[^\p{Letter}\p{Number}/-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function collect() {
  const problems = [];
  const notes = [];

  if (!fs.existsSync(DESIGN_ROOT)) {
    return { ok: false, problems: [`memo 정본을 못 찾음: ${DESIGN_ROOT}`], notes, book: null };
  }

  let policy = { _default: 'private' };
  if (fs.existsSync(POLICY_PATH)) {
    policy = JSON.parse(await fsp.readFile(POLICY_PATH, 'utf8'));
  } else {
    problems.push(`공개 정책 파일 없음: ${POLICY_PATH} — 전부 비공개로 떨어진다`);
  }
  const fallback = policy._default || 'private';

  const files = await walk(DESIGN_ROOT);
  const docs = [];
  const kinds = new Map();
  const unknownFolders = new Set();
  let skippedPrivate = 0;

  for (const file of files) {
    const rel = path.relative(DESIGN_ROOT, file).replace(/\\/g, '/');
    const topFolder = rel.includes('/') ? rel.split('/')[0] : '(root)';
    const text = await fsp.readFile(file, 'utf8');
    const { fm, body } = splitFrontmatter(text);

    let meta = {};
    if (fm) {
      try {
        meta = parseYamlSimple(fm);
      } catch (err) {
        problems.push(`${rel}: frontmatter 파싱 실패 — ${err.message}`);
        continue;
      }
    }

    // 공개 범위: 문서(web:) 가 폴더 정책을 이긴다.
    let visibility = policy[topFolder];
    if (visibility === undefined) {
      if (topFolder !== '(root)') unknownFolders.add(topFolder);
      visibility = fallback;
    }
    const docWeb = String(meta.web || '').trim();
    if (docWeb === 'public' || docWeb === 'summary' || docWeb === 'private') visibility = docWeb;
    if (docWeb !== '' && !['public', 'summary', 'private'].includes(docWeb)) {
      problems.push(`${rel}: 알 수 없는 web 값 "${docWeb}" (public|summary|private)`);
      continue;
    }
    if (visibility === 'private') { skippedPrivate++; continue; }

    const title = String(meta.title || '').trim() || firstHeading(body) || path.basename(rel, '.md');
    if (!title) { problems.push(`${rel}: 제목을 찾을 수 없음(frontmatter title 도 H1 도 없음)`); continue; }

    // frontmatter 의 나머지 키를 **그대로** 싣는다 — 웹은 모르는 키도 그린다.
    const fields = {};
    for (const [k, v] of Object.entries(meta)) {
      if (['title', 'web'].includes(k)) continue;
      if (v === '' || v == null) continue;
      fields[k] = v;
    }

    const doc = {
      id: slugify(rel),
      kind: topFolder,
      kindLabel: KIND_LABEL[topFolder] || topFolder,
      title,
      summary: firstParagraph(body),
      tags: toArray(meta.tags),
      updated: String(meta.updated || ''),
      fields,
      source: `memo/wm/design/${rel}`,
      visibility,
    };
    if (visibility === 'public') doc.body = body.trim();

    docs.push(doc);
    kinds.set(doc.kind, (kinds.get(doc.kind) || 0) + 1);
  }

  for (const f of unknownFolders) {
    notes.push(`정책 없는 새 폴더 "${f}" — 기본값(${fallback}) 적용. web-policy.json 에서 한 번 판정할 것`);
  }

  docs.sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title, 'ko') : a.kind.localeCompare(b.kind)));

  const book = {
    generatedAt: new Date().toISOString(),
    source: 'memo/wm/design',
    counts: { docs: docs.length, kinds: kinds.size, privateSkipped: skippedPrivate },
    kinds: [...kinds.entries()]
      .map(([id, count]) => ({ id, label: KIND_LABEL[id] || id, count }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    docs,
  };

  if (docs.length === 0) problems.push('공개 문서가 0 건 — 도감이 백지가 된다');
  return { ok: problems.length === 0, problems, notes, book };
}

// ── main ────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const hasMemo = fs.existsSync(DESIGN_ROOT);
  if (!hasMemo) {
    // memo 는 비공개 레포 — CI 에는 없다. 커밋된 worldbook.json 을 그대로 쓴다.
    if (!fs.existsSync(OUT_PATH)) {
      console.error(`[worldbook] memo 도 없고 커밋된 산출도 없다: ${OUT_PATH}`);
      process.exit(1);
    }
    const prev = JSON.parse(await fsp.readFile(OUT_PATH, 'utf8'));
    console.log(`[worldbook] memo 없음 — 커밋된 산출 사용 (문서 ${prev.counts?.docs ?? '?'}건)`);
    return;
  }

  const { problems, notes, book } = await collect();
  for (const n of notes) console.warn(`[worldbook] ⚠ ${n}`);

  let prev = null;
  if (fs.existsSync(OUT_PATH)) {
    try { prev = JSON.parse(await fsp.readFile(OUT_PATH, 'utf8')); } catch (_) {}
  }
  if (prev && book && prev.counts?.docs > 0) {
    const drop = 1 - book.counts.docs / prev.counts.docs;
    if (drop > 0.3) {
      problems.push(`문서 수가 ${prev.counts.docs} → ${book.counts.docs} 로 ${Math.round(drop * 100)}% 줄었다 — 수집이 깨진 것 아닌지 확인`);
    }
  }

  if (problems.length > 0) {
    console.error('[worldbook] ❌ 문제:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }

  console.log(`[worldbook] 문서 ${book.counts.docs}건 · 종류 ${book.counts.kinds}개 · 비공개 제외 ${book.counts.privateSkipped}건`);
  for (const k of book.kinds) console.log(`  - ${k.id} (${k.label}) ${k.count}`);

  if (CHECK) {
    if (!prev) { console.error('[worldbook] --check: 커밋된 산출이 없다'); process.exit(1); }
    const a = JSON.stringify(prev.docs);
    const b = JSON.stringify(book.docs);
    if (a !== b) {
      console.error('[worldbook] ❌ --check: memo 정본과 커밋된 worldbook.json 이 다르다 — `npm run build:worldbook` 후 커밋할 것');
      process.exit(1);
    }
    console.log('[worldbook] --check 통과 (정본과 산출 일치)');
    return;
  }

  /* 내용이 그대로면 「만든 시각」도 그대로 둔다 — 안 그러면 빌드할 때마다 이 파일 한 줄이
   * 바뀌어 커밋이 지저분해지고, 남의 세션과 부딪힌다(실측으로 매 빌드마다 dirty). */
  if (prev && JSON.stringify(prev.docs) === JSON.stringify(book.docs) && prev.generatedAt) {
    book.generatedAt = prev.generatedAt;
  }

  await fsp.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fsp.writeFile(OUT_PATH, JSON.stringify(book, null, 2) + '\n', 'utf8');
  console.log(`[worldbook] 씀: ${path.relative(KARMOLAB_ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error('[worldbook] 실패:', err);
  process.exit(1);
});
