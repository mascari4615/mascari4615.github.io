#!/usr/bin/env node
/**
 * 새 도구 한 방 — 딸린 자리를 전부 같이 만든다 (TASK-KL-311)
 *
 * 왜 있나: 도구를 하나 더하면 **여섯 자리**를 손으로 채워야 했다 —
 * 위젯 파일 · `widgets-lazy-meta.ts` 등록 · (알맹이면) `src/core/<id>.ts` ·
 * `data/tools-seo.json` · `data/tool-aliases.json` · `i18n/ko/<id>.json`.
 * 한 자리를 빠뜨리면 그 도구만 조용히 손해를 본다(주소가 없거나 · 영문 검색에 안 걸리거나 ·
 * 화면이 한국어로만 남거나). 검사는 이미 그걸 잡지만, **잡히기 전에 안 빠뜨리는 것**이 낫다.
 *
 * 정본은 그대로다 — `src/widgets-lazy-meta.ts` 가 이름·갈래·경로의 단일 출처고, 여기서 하는 일은
 * **그 정본에 한 칸을 더하고 나머지를 그 칸에서 파생**시키는 것뿐이다(이름·설명·목록·i18n·페이지).
 * 사람이 정해야 하는 것(설명 글·별칭·아이콘)은 `TODO:` 로 남고 `audit:data` 가 그걸 세운다 —
 * 자리표시자가 배포로 새어 나가지 않는다.
 *
 * 사용:
 *   node scripts/new-tool.mjs <id> --title "부가세 계산기" --desc "한 줄 설명"
 *        [--category tool|lab|ref|play] [--layout form|wide|full]
 *        [--core] [--no-page] [--aliases "vat tax 부가세"] [--lead "A · B · C"]
 *        [--task TASK-KL-311] [--sync]
 *
 *   --core   알맹이(`src/core/<id>.ts`)도 만든다 = MCP·주소 호출까지 열린다
 *   --sync   공유 카드·자리 높이·도구 페이지까지 이어서 굽는다(몇 분, 브라우저 필요)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (...s) => path.join(root, ...s);

// ── 말 받기 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else {
      flags[key] = next;
      i++;
    }
  } else positional.push(a);
}

const die = (msg) => {
  console.error(`[new-tool] ${msg}`);
  process.exit(1);
};

const id = positional[0];
if (!id) die('도구 id 가 없다 — 예: node scripts/new-tool.mjs vat --title "부가세 계산기" --desc "..."');
if (/^[a-z][a-z0-9]{1,23}$/.test(id) === false)
  die(`id 「${id}」 는 못 쓴다 — 소문자·숫자만, 2~24자 (주소 /karmolab/t/<id>/ 가 된다)`);

const title = typeof flags.title === 'string' ? flags.title : null;
const desc = typeof flags.desc === 'string' ? flags.desc : null;
if (!title || !desc) die('--title 과 --desc 는 있어야 한다 (목록·찾기창·첫 화면이 이 둘로 산다)');

const category = typeof flags.category === 'string' ? flags.category : 'tool';
if (['tool', 'lab', 'ref', 'play'].includes(category) === false)
  die(`--category 는 tool·lab·ref·play 중 하나다 (받은 값: ${category})`);
const layout = typeof flags.layout === 'string' ? flags.layout : 'form';
if (['form', 'wide', 'full'].includes(layout) === false)
  die(`--layout 은 form·wide·full 중 하나다 (받은 값: ${layout})`);

const wantCore = flags.core === true;
/* 도구 페이지(= 주소·검색 유입)는 갈래가 `tool` 이면 기본으로 만든다. settings·status 처럼
   **페이지가 없어야 맞는** 화면은 `--no-page` 로 뺀다 (`audit:data` 가 그 기준을 쓴다). */
const wantPage = flags['no-page'] === true ? false : category === 'tool';
if (wantCore && !wantPage) die('--core 인데 --no-page 다 — 알맹이가 있으면 주소가 있어야 한다(audit:data 가 세운다)');
const task = typeof flags.task === 'string' ? flags.task : 'TASK-KL-311';

// ── 이미 있나 ──────────────────────────────────────────────────────────────
const metaPath = p('src/widgets-lazy-meta.ts');
const metaSrc = fs.readFileSync(metaPath, 'utf8');
const takenIds = new Set([...metaSrc.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]));

const widgetPath = category === 'tool' ? p('src/widgets/tools/' + id + '.ts') : p('src/widgets/' + id + '.ts');
const corePath = p('src/core/' + id + '.ts');
const koPath = p('i18n/ko/' + id + '.json');
const seoPath = p('data/tools-seo.json');
const aliasPath = p('data/tool-aliases.json');

const seoRaw = fs.readFileSync(seoPath, 'utf8');
const seo = JSON.parse(seoRaw);
const aliasDoc = JSON.parse(fs.readFileSync(aliasPath, 'utf8'));

const clashes = [];
if (takenIds.has(id)) clashes.push('widgets-lazy-meta.ts 에 이미 등록됨');
if (fs.existsSync(widgetPath)) clashes.push(path.relative(root, widgetPath));
if (fs.existsSync(corePath)) clashes.push(path.relative(root, corePath));
if (fs.existsSync(koPath)) clashes.push(path.relative(root, koPath));
if (seo.tools[id]) clashes.push('data/tools-seo.json 에 이미 있음');
if (aliasDoc.aliases[id]) clashes.push('data/tool-aliases.json 에 이미 있음');
/* 하나라도 겹치면 **아무것도 안 쓴다** — 반쯤 덮어쓴 상태가 제일 고치기 어렵다. */
if (clashes.length > 0) die(`「${id}」 는 이미 자리가 있다: ${clashes.join(' · ')}`);

// ── 만들 것 ────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const escSingle = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** 기본 아이콘 = 연장 한 자루. 눈에 보이는 것이라 사람이 바꾼다(끝 안내에 적는다). */
const ICON =
  '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.2 2.2-2-2z"' +
  ' fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';

const metaEntry = [
  '',
  '  /* ' + title + ' (' + task + ')',
  '   * TODO: 왜 있나 — 사람이 손으로 하면 틀리는 무엇을 이 도구가 정확히 하는지 한 줄. */',
  '  {',
  "    id: '" + id + "',",
  "    get title() { return t('widgets." + id + '.title\', undefined, "' + esc(title) + '"); },',
  "    category: '" + category + "',",
  "    get desc() { return t('widgets-desc." + id + '.desc\', undefined, "' + esc(desc) + '"); },',
  "    layout: '" + layout + "',",
  "    icon: '" + escSingle(ICON) + "',",
  "    lazyScriptPaths: ['" + (category === 'tool' ? 'tools/' : '') + id + "']",
  '  }'
].join('\n');

const CLOSE = '\n] as KarmoLabLazyWidgetStub[];';
if (metaSrc.includes(CLOSE) === false) die('widgets-lazy-meta.ts 의 끝 모양이 바뀌었다 — 이 스크립트를 먼저 고쳐라');
const metaNext = metaSrc.replace(CLOSE, ',\n' + metaEntry + CLOSE);

/* 위젯 뼈대. 처음부터 **읽히는 자리**(markLive)와 **이름 붙은 칸**(label+aria-label)을 갖고 태어난다 —
   그 둘은 나중에 붙이면 검사(`test:names`·`test:status-live`)가 빨개진 뒤에야 알게 된다. */
const q = '`';
const widgetSrc =
  '/**\n' +
  ' * ' + title + ' (' + task + ')\n' +
  ' *\n' +
  ' * TODO: 왜 있나 — 이 도구가 없으면 사람이 무엇을 손으로 하다 틀리는지 한 문단.\n' +
  ' */\n' +
  (wantCore ? "import { run } from '../../core/" + id + "';\n" : '') +
  "import { markLive, statusLine } from './shared/say';\n" +
  "import { copyOnClick } from './shared/copyable';\n" +
  "import { t, loadNamespace } from '../../lib/i18n';\n" +
  '\n' +
  '(function (): void {\n' +
  '  const esc = (v: string): string =>\n' +
  "    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');\n" +
  '\n' +
  '  function draw(container: HTMLElement): void {\n' +
  '    container.innerHTML = ' + q + '\n' +
  '      <div class="field-group">\n' +
  '        <label class="field-label" for="' + id + 'In">${esc(t(\'' + id + '.label.in\'))}</label>\n' +
  '        <textarea id="' + id + 'In" rows="6" aria-label="${esc(t(\'' + id + '.label.in\'))}"></textarea>\n' +
  '      </div>\n' +
  '      <div class="tool-list" id="' + id + 'Out"></div>\n' +
  '      <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">\n' +
  '        <button class="btn btn-ghost" id="' + id + 'Copy">${esc(t(\'' + id + '.btn.copy\'))}</button>\n' +
  '      </div>\n' +
  '      <div class="tool-status" id="' + id + 'Status">${esc(t(\'' + id + '.status.idle\'))}</div>\n' +
  '    ' + q + ';\n' +
  '\n' +
  '    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;\n' +
  "    const input = $<HTMLTextAreaElement>('#" + id + "In');\n" +
  "    const out = $<HTMLElement>('#" + id + "Out');\n" +
  '    /* 이 줄은 **읽히는 자리**다 — 표시가 없으면 화면낭독기가 아무 말도 안 한다. */\n' +
  '    markLive(out);\n' +
  "    const say = statusLine($<HTMLElement>('#" + id + "Status'));\n" +
  '\n' +
  "    let last = '';\n" +
  '    function render(): void {\n' +
  '      const value = input.value;\n' +
  "      if (value.trim() === '') {\n" +
  "        out.textContent = '';\n" +
  "        last = '';\n" +
  "        say(t('" + id + ".status.idle'));\n" +
  '        return;\n' +
  '      }\n' +
  '      /* TODO: 진짜 계산으로 바꿔라' +
  (wantCore ? ' — 알맹이는 src/core/' + id + '.ts 의 run() 이다.' : '.') + ' */\n' +
  '      last = ' + (wantCore ? "String(run('main', { text: value }))" : 'value') + ';\n' +
  '      out.textContent = last;\n' +
  "      say(t('" + id + ".status.done'), 'ok');\n" +
  '    }\n' +
  '\n' +
  "    input.addEventListener('input', render);\n" +
  "    copyOnClick($<HTMLElement>('#" + id + "Copy'), () => last, t('" + id + ".btn.copy'));\n" +
  '    render();\n' +
  '  }\n' +
  '\n' +
  '  Toolbox.register({\n' +
  "    ...Toolbox.getLazyWidgetPublicMeta('" + id + "'),\n" +
  '    tabs: [\n' +
  '      {\n' +
  "        id: 'app',\n" +
  "        label: t('" + id + ".tab.main', undefined, '" + escSingle(title) + "'),\n" +
  '        build: function (container: HTMLElement): void {\n' +
  "          void loadNamespace('" + id + "').then(function () {\n" +
  '            draw(container);\n' +
  '          });\n' +
  '        }\n' +
  '      }\n' +
  '    ]\n' +
  '  });\n' +
  '})();\n';

const coreSrc =
  '/**\n' +
  ' * ' + title + ' core (' + task + ')\n' +
  ' *\n' +
  ' * TODO: why this exists - what a person or an LLM gets wrong doing this by hand.\n' +
  ' * The core is the headless half: the widget draws it, MCP calls it, and /karmolab/t/' + id + '/\n' +
  ' * can be invoked by URL. Keep it free of DOM.\n' +
  ' */\n' +
  "import type { ToolRunner, ToolSpec } from './types';\n" +
  '\n' +
  'export const spec: ToolSpec = {\n' +
  "  id: '" + id + "',\n" +
  '  ops: {\n' +
  '    main: {\n' +
  "      desc: 'TODO: what this operation does, and the mistake it prevents.',\n" +
  "      in: { text: 'string' },\n" +
  "      out: 'string'\n" +
  '    }\n' +
  '  }\n' +
  '};\n' +
  '\n' +
  'export const run: ToolRunner = (op, args) => {\n' +
  "  if (op !== 'main') throw new Error(" + q + id + ' has no operation named "${op}"' + q + ');\n' +
  "  const text = String(args.text ?? '');\n" +
  "  if (text === '') throw new Error('text is required');\n" +
  '  // TODO: real work here.\n' +
  '  return text;\n' +
  '};\n';

const koSrc =
  JSON.stringify(
    {
      [id + '.tab.main']: title,
      [id + '.label.in']: 'TODO: 입력칸 이름',
      [id + '.btn.copy']: '결과 복사',
      [id + '.status.idle']: 'TODO: 무엇을 넣으면 되는지 한 줄',
      [id + '.status.done']: '됐어요'
    },
    null,
    2
  ) + '\n';

const seoEntry = {
  description: 'TODO: ' + title + ' 상세 페이지 설명 — 담백한 사실 서술 두어 문장 (광고 문구 X).',
  lead: typeof flags.lead === 'string' ? flags.lead : 'TODO: 짧은 조각 · 세 개쯤 · 점으로 잇는다',
  howto: ['TODO: 첫 단계', 'TODO: 둘째 단계', 'TODO: 셋째 단계'],
  faq: [{ q: 'TODO: 사람들이 실제로 묻는 것', a: 'TODO: 답.' }],
  related: []
};

// ── 쓴다 ───────────────────────────────────────────────────────────────────
fs.writeFileSync(metaPath, metaNext, 'utf8');
fs.mkdirSync(path.dirname(widgetPath), { recursive: true });
fs.writeFileSync(widgetPath, widgetSrc, 'utf8');
if (wantCore) fs.writeFileSync(corePath, coreSrc, 'utf8');
fs.writeFileSync(koPath, koSrc, 'utf8');

/* 별칭 파일은 통째로 다시 찍어도 형식이 그대로다(확인함) — 그래서 파싱해서 쓴다. */
aliasDoc.aliases[id] =
  typeof flags.aliases === 'string' ? flags.aliases : 'TODO: ' + id + ' 를 영문·다른 말로 찾을 때 걸릴 낱말들';
fs.writeFileSync(aliasPath, JSON.stringify(aliasDoc, null, 2) + '\n', 'utf8');

if (wantPage) {
  /* tools-seo.json 은 CRLF 에 사람이 읽는 순서로 쌓여 있다 — 통째로 다시 찍으면 13만 자가
     전부 diff 로 잡힌다. 그래서 **끝에 한 칸만 끼운다**. */
  const eol = seoRaw.includes('\r\n') ? '\r\n' : '\n';
  const tail = eol + '  }' + eol + '}';
  const at = seoRaw.lastIndexOf(tail);
  if (at < 0) die('tools-seo.json 의 끝 모양이 바뀌었다 — 이 스크립트를 먼저 고쳐라');
  const block = JSON.stringify({ [id]: seoEntry }, null, 2)
    .split('\n')
    .slice(1, -1) /* 감싼 중괄호를 벗긴다 */
    .map((line) => '  ' + line) /* tools 안쪽 들여쓰기 */
    .join(eol);
  fs.writeFileSync(seoPath, seoRaw.slice(0, at) + ',' + eol + block + seoRaw.slice(at), 'utf8');
  JSON.parse(fs.readFileSync(seoPath, 'utf8')); /* 끼운 뒤에도 말이 되는지 그 자리에서 본다 */
}

// ── 파생시킬 것 ────────────────────────────────────────────────────────────
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const runNpm = (script) => {
  console.log('\n[new-tool] npm run ' + script);
  const r = spawnSync(npm, ['run', '--silent', script], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  return r.status === 0;
};

/* 이름·설명·페이지 글은 **여기서 파생된다** — 손으로 옮겨 적는 자리를 안 만든다. */
runNpm('build:i18n');
if (wantCore) runNpm('gen:core-tools');
if (flags.sync === true) runNpm('sync:tools');

// ── 남은 것 ────────────────────────────────────────────────────────────────
const made = [
  path.relative(root, widgetPath),
  wantCore ? path.relative(root, corePath) : null,
  'src/widgets-lazy-meta.ts (+1)',
  path.relative(root, koPath),
  'data/tool-aliases.json (+1)',
  wantPage ? 'data/tools-seo.json (+1)' : null
].filter(Boolean);

console.log('\n[new-tool] 「' + title + '」(' + id + ') 자리를 다 만들었다:');
for (const f of made) console.log('  · ' + f);
console.log('\n남은 것 — 사람이 정할 것 (`npm run audit:data` 가 TODO 를 세운다):');
console.log(
  '  1. ' + path.relative(root, widgetPath) + ' 의 진짜 계산' +
    (wantCore ? ' + ' + path.relative(root, corePath) + ' 의 run()' : '')
);
console.log('  2. data/tool-aliases.json — 영문·다른 말로 찾을 낱말');
if (wantPage) console.log('  3. data/tools-seo.json — 설명·lead·howto·faq (검색으로 들어오는 문)');
console.log('  4. widgets-lazy-meta.ts 의 icon — 지금은 연장 아이콘 기본값이다');
if (flags.sync !== true) console.log('  5. npm run sync:tools  (공유 카드·자리 높이·도구 페이지 — 몇 분)');
