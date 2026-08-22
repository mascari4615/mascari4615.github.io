/**
 * 블로그 글을 표준 마크다운으로 옮긴다 (TASK-KL-353 — 이관 Phase 0).
 *
 * 왜 있나: `apps/blog/_posts` 의 글 530장은 Jekyll(Chirpy) 방언을 쓴다 — Liquid `{% include %}`,
 * Kramdown `{: .attr}`, `YYYY-MM-DD. HH:MM` 날짜. 이 글을 KarmoLab 파이프(marked 렌더러)가
 * 읽으려면 **방언을 걷어낸 표준 md** 가 필요하다. 손으로 530장을 고치면 틀리고, 다시 못 돌린다 —
 * 그래서 변환은 전부 이 도구가 하고, 몇 번을 다시 돌려도 같은 결과가 나온다(멱등).
 *
 * 어디로: `apps/karmolab/content/posts/**` (발행) · `content/drafts/**` (초안).
 * 원본 `_posts` 는 건드리지 않는다 — Jekyll 병행 검증(Phase 1)이 끝날 때까지 원본이 정본이다.
 *
 * 변환 규칙 (실측 전수 — TASK-KL-353 설계 표):
 *  - `{% include embed/youtube.html id="…" %}` 576건 → 유튜브 주소 한 줄 (렌더러가 카드로 그린다).
 *    id 가 비었거나 자리표시면 줄을 지우고 리포트에 남긴다.
 *  - `{% include custom/**.html %}` ~45건 → 그 파일 내용을 그대로 펼친다 (old-post 배너는 callout 으로).
 *  - `{% raw %}` / `{% endraw %}` → 마커만 제거.
 *  - `{: .prompt-*}` / `{: .notice*}` → 직전 인용/문단을 `> [!NOTE]` 계열 callout 으로.
 *  - 그 외 `{: …}` 속성 → 폐기 + 리포트 (꾸밈은 렌더러 기본 스타일이 맡는다).
 *  - frontmatter: date/last_modified_at → ISO 8601(+09:00) · 이모지 카테고리 → 한글 · hidden 보존.
 *
 * 끝나면 스스로 검사한다: 산출물에 `{%` 나 `{:` 가 한 줄이라도 남으면 실패(exit 1).
 * 리포트 = `content/convert-report.md` (몇 장을 옮겼고, 무엇을 지웠는지).
 *
 * 사용: node scripts/convert-blog-posts.mjs   (npm run convert:posts)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BLOG = path.join(APP_ROOT, '..', 'blog');
const SRC_POSTS = path.join(BLOG, '_posts');
const OUT_ROOT = path.join(APP_ROOT, 'content');
const OUT_POSTS = path.join(OUT_ROOT, 'posts');
const OUT_DRAFTS = path.join(OUT_ROOT, 'drafts');

/** 이모지 시절 카테고리 → 지금 쓰는 한글 이름. 새 이모지 카테고리를 만나면 여기 한 줄. */
const CATEGORY_MAP = new Map([
  ['🌒Programming', '프로그래밍'],
  ['🌚Computer-General', '컴퓨터 일반'],
  ['🌑Computer-OS', '운영체제'],
]);

/** Chirpy prompt/notice 클래스 → 표준 callout 이름. */
const CALLOUT_MAP = new Map([
  ['prompt-info', 'NOTE'],
  ['prompt-tip', 'TIP'],
  ['prompt-warning', 'WARNING'],
  ['prompt-danger', 'CAUTION'],
  ['notice', 'NOTE'],
  ['notice--info', 'NOTE'],
  ['notice--primary', 'NOTE'],
  ['notice--success', 'TIP'],
  ['notice--warning', 'WARNING'],
  ['notice--danger', 'CAUTION'],
]);

/** 리포트에 쌓는 것 — 무엇을 어디서 지웠거나 못 옮겼는지. */
const report = {
  posts: 0,
  drafts: 0,
  droppedYoutube: [], // 빈/기형 id 로 줄을 지운 곳
  droppedAttrs: [], // 폐기한 {: …} 속성
  expandedIncludes: [], // 펼친 custom include
  categoryFixes: [], // 카테고리 손질
  filenameOddities: [], // 날짜 규약 안 맞는 파일명
  dateFallbacks: [], // date 를 못 읽어 파일명 날짜로 대신한 곳
};

// ---------------------------------------------------------------- frontmatter

/**
 * frontmatter 를 줄 단위로 읽는다. 이 글들의 머리말은 단순한 `key: value` 뿐이고
 * (객체형 image 0건 — 실측), 주석 줄(`# description: …`)과 값 뒤 주석(`# Init`)이 섞여 있다.
 * 범용 YAML 파서를 들이지 않는 이유: 여기 없는 문법을 지원할수록 조용히 다른 뜻으로 읽는다.
 */
function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return null;
  return { head: m[1], body: text.slice(m[0].length) };
}

function parseHead(head) {
  const out = new Map();
  for (const rawLine of head.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue; // 주석 처리된 키는 버린다 — git 이 이력이다
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    out.set(kv[1], kv[2].trim());
  }
  return out;
}

/** `2023-10-31. 14:43 # Init` · `2019-01-02 13:00` · `2019-01-02` 전부 → ISO(+09:00). */
function toIso(raw, fallbackDate, file) {
  if (!raw) return null;
  const cleaned = raw.replace(/#.*$/, '').replace(/["']/g, '').trim();
  const m = /^(\d{4}-\d{2}-\d{2})(?:[.\s]+(\d{2}:\d{2})(?::(\d{2}))?)?$/.exec(cleaned);
  if (!m) {
    if (fallbackDate) {
      report.dateFallbacks.push(`${file}: "${cleaned}" → 파일명 날짜`);
      return `${fallbackDate}T00:00:00+09:00`;
    }
    return null;
  }
  return `${m[1]}T${m[2] ?? '00:00'}:${m[3] ?? '00'}+09:00`;
}

/** `[a, b]` → 배열. 따옴표 벗기고 빈 항목 버림. */
function parseInlineList(raw) {
  if (!raw) return [];
  const inner = /^\[(.*)\]$/.exec(raw.trim());
  const items = (inner ? inner[1] : raw).split(',');
  return items.map((s) => s.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
}

function fixCategories(list, raw, file, tags) {
  // 배열이 아니었던 한 건 (`categories: Programming Java MinecraftPlugin`) — 공백 나열.
  if (raw && !raw.startsWith('[')) {
    report.categoryFixes.push(`${file}: "${raw}" → [프로그래밍] (+tags Java·MinecraftPlugin)`);
    for (const extra of raw.split(/\s+/).slice(1)) if (!tags.includes(extra)) tags.push(extra);
    return ['프로그래밍'];
  }
  return list.map((c) => {
    const mapped = CATEGORY_MAP.get(c);
    if (mapped) report.categoryFixes.push(`${file}: ${c} → ${mapped}`);
    return mapped ?? c;
  });
}

function yamlValue(s) {
  // 따옴표가 필요한 값만 감싼다 — 전부 감싸면 diff 만 시끄럽다.
  return /[:#\[\]{}"'|>&*!%@`,]|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
}

function buildHead(meta) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(meta)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) lines.push(`${key}: [${value.map(yamlValue).join(', ')}]`);
    else if (typeof value === 'boolean') lines.push(`${key}: ${value}`);
    else lines.push(`${key}: ${yamlValue(String(value))}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

// ---------------------------------------------------------------- 본문 변환

/** custom include → 펼칠 마크다운. 파일 다섯 개뿐이라 읽어서 캐시한다. */
const includeCache = new Map();
function includeBody(name) {
  if (includeCache.has(name)) return includeCache.get(name);
  const file = path.join(BLOG, '_includes', name);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    text = null;
  }
  includeCache.set(name, text);
  return text;
}

/** 유튜브 id 손질 — 폭 없는 문자·따옴표 찌꺼기·꺾쇠가 실측으로 섞여 있었다. */
function cleanYoutubeId(raw) {
  const id = raw.replace(/[​‌﻿'">]/g, '').trim();
  return /^[A-Za-z0-9_-]{6,}$/.test(id) && !/^프로젝트/.test(id) ? id : null;
}

function transformBody(body, file) {
  // 폭 없는 문자(U+200B 류)가 태그 뒤에 숨어 치환을 빗나가게 했다 (실측 1건) — 먼저 걷어낸다.
  let text = body.replace(/[​‌‍﻿]/g, '');

  // 1) 유튜브 embed → 주소 한 줄 (렌더러가 카드로 그린다 — KL-354).
  text = text.replace(
    /^[ \t]*\{%\s*include\s+embed\/youtube\.html\s+id\s*=\s*(['"])(.*?)\1\s*%\}[ \t]*$/gm,
    (whole, _q, rawId) => {
      const id = cleanYoutubeId(rawId);
      if (id) return `https://youtu.be/${id}`;
      report.droppedYoutube.push(`${file}: ${whole.trim()}`);
      return '';
    }
  );

  // 2) custom include → 내용 펼치기. old-post 배너는 callout 으로 바꾼다.
  text = text.replace(/^[ \t]*\{%\s*include\s+(custom\/[^\s%]+)\s*%\}[ \t]*$/gm, (whole, name) => {
    const raw = includeBody(name);
    if (raw === null) {
      report.droppedAttrs.push(`${file}: 없는 include ${name} — 줄 삭제`);
      return '';
    }
    report.expandedIncludes.push(`${file}: ${name}`);
    return raw.trim();
  });

  // 3) raw 마커 제거 — 내용은 그대로 (marked 는 Liquid 를 모르니 보호가 필요 없다).
  //    줄 한가운데 끼운 인라인 raw 도 있다 (JSX 예제 실측 1건) — 전역으로 지운다.
  text = text.replace(/\{%\s*(?:raw|endraw)\s*%\}/g, '');

  // 4) prompt/notice 속성 → 직전 블록을 callout 으로.
  //    Chirpy 는 「블록 다음 줄의 {: .prompt-x}」 로 앞 블록을 칠한다. 우리는 그 블록 자체를
  //    `> [!X]` 인용으로 만든다 — 인용이면 첫 줄만 바꾸고, 문단이면 통째로 인용으로 감싼다.
  {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const attr = /^[ \t]*\{:\s*\.?([a-z-]+(?:--[a-z]+)?)\s*\}[ \t]*$/.exec(lines[i]);
      const callout = attr && CALLOUT_MAP.get(attr[1]);
      if (!callout) continue;
      lines[i] = ''; // 속성 줄 제거
      let end = i - 1;
      while (end >= 0 && lines[end].trim() === '') end -= 1;
      if (end < 0) continue;
      let start = end;
      while (start > 0 && lines[start - 1].trim() !== '') start -= 1;
      const isQuote = lines[start].trimStart().startsWith('>');
      for (let j = start; j <= end; j += 1) {
        if (!isQuote) lines[j] = `> ${lines[j]}`;
      }
      lines.splice(start, 0, `> [!${callout}]`);
      i += 1; // 한 줄 끼워 넣었으니 자리 보정
    }
    text = lines.join('\n');
  }

  // 5) 남은 {: …} 속성 — 꾸밈이니 폐기하되, 무엇을 버렸는지는 남긴다.
  text = text.replace(/\{:[^}\n]*\}/g, (whole) => {
    report.droppedAttrs.push(`${file}: ${whole}`);
    return '';
  });

  // 6) 빈 줄 정리 — 위 치환들이 남긴 3연속 이상 빈 줄만 줄인다 (원문 문단 간격은 보존).
  text = text.replace(/\n{3,}/g, '\n\n');
  return `${text.trim()}\n`;
}

// ---------------------------------------------------------------- 한 장 변환

function convertFile(srcFile, relDir) {
  const base = path.basename(srcFile);
  const text = fs.readFileSync(srcFile, 'utf8');
  const split = splitFrontmatter(text);
  if (!split) {
    report.filenameOddities.push(`${path.join(relDir, base)}: frontmatter 없음 — 건너뜀`);
    return null;
  }
  const head = parseHead(split.head);

  const nameDate = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(base);
  if (!nameDate) report.filenameOddities.push(path.join(relDir, base));

  const tags = parseInlineList(head.get('tags'));
  const meta = {
    title: (head.get('title') ?? '').replace(/^["']|["']$/g, ''),
    description: (head.get('description') ?? '').replace(/^["']|["']$/g, ''),
    date: toIso(head.get('date'), nameDate?.[1], path.join(relDir, base)),
    last_modified_at: toIso(head.get('last_modified_at'), null, path.join(relDir, base)),
    categories: fixCategories(
      parseInlineList(head.get('categories')),
      head.get('categories'),
      path.join(relDir, base),
      tags
    ),
    tags,
    image: (head.get('image') ?? '').replace(/^["']|["']$/g, ''),
    hidden: head.get('hidden') === 'true' ? true : null,
  };
  if (!meta.date && nameDate) meta.date = `${nameDate[1]}T00:00:00+09:00`;

  return buildHead(meta) + '\n' + transformBody(split.body, path.join(relDir, base));
}

// ---------------------------------------------------------------- 걷기 + 쓰기

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function run() {
  // 멱등 — 산출 폴더를 비우고 새로 찍는다. 원본은 안 건드린다.
  for (const dir of [OUT_POSTS, OUT_DRAFTS]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  for (const src of walk(SRC_POSTS)) {
    const rel = path.relative(SRC_POSTS, src);
    const isDraft = /_drafts[\\/]/.test(rel) || /-DRAFT\.md$/i.test(rel) || /-TEMPLATE\.md$/i.test(rel);
    const outBase = isDraft ? OUT_DRAFTS : OUT_POSTS;
    const outRel = rel.replace(/^_drafts[\\/]/, '');
    const converted = convertFile(src, path.dirname(rel));
    if (converted === null) continue;
    const dest = path.join(outBase, outRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, converted);
    if (isDraft) report.drafts += 1;
    else report.posts += 1;
  }

  // 자기 검사 — 산출물에 Jekyll 방언이 한 조각이라도 남으면 실패다.
  const leftovers = [];
  for (const file of [...walk(OUT_POSTS), ...walk(OUT_DRAFTS)]) {
    const body = fs.readFileSync(file, 'utf8');
    for (const [index, line] of body.split('\n').entries()) {
      if (/\{%|\{:/.test(line)) leftovers.push(`${path.relative(OUT_ROOT, file)}:${index + 1}: ${line.trim()}`);
    }
  }

  const section = (title, items) =>
    items.length ? `\n## ${title} (${items.length})\n\n${items.map((s) => `- ${s}`).join('\n')}\n` : '';
  fs.writeFileSync(
    path.join(OUT_ROOT, 'convert-report.md'),
    `# 블로그 글 변환 리포트 (TASK-KL-353)\n\n` +
      `> \`npm run convert:posts\` 가 매번 새로 쓴다 — 손으로 고치지 마라.\n\n` +
      `- 발행 ${report.posts}장 → \`content/posts/\`\n- 초안 ${report.drafts}장 → \`content/drafts/\`\n` +
      section('지운 유튜브 embed (id 없음/기형)', report.droppedYoutube) +
      section('펼친 include', report.expandedIncludes) +
      section('폐기한 속성', report.droppedAttrs) +
      section('카테고리 손질', report.categoryFixes) +
      section('파일명 규약 밖', report.filenameOddities) +
      section('date 를 파일명으로 대체', report.dateFallbacks) +
      section('⚠ 남은 Jekyll 방언', leftovers)
  );

  console.log(`[convert-posts] 발행 ${report.posts} · 초안 ${report.drafts} · ` +
    `유튜브 삭제 ${report.droppedYoutube.length} · include 펼침 ${report.expandedIncludes.length} · ` +
    `속성 폐기 ${report.droppedAttrs.length} · 리포트 = content/convert-report.md`);
  if (leftovers.length) {
    console.error(`[convert-posts] ✗ 산출물에 Jekyll 방언 ${leftovers.length}줄 잔존 — 리포트 참고`);
    process.exit(1);
  }
}

run();
