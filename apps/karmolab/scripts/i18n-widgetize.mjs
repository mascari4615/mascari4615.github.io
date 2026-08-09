#!/usr/bin/env node
/**
 * 위젯 하나를 **말 묶음 쓰는 구조**로 갈아 끼운다 (TASK-KL-203).
 *
 * 왜 있나: 도구 129개 중 남은 60여 개를 손으로 옮기고 있었다. 회차마다 하는 일이 똑같다 —
 * ① 화면에 나가는 한국어를 찾아 열쇠로 바꾸고 ② `i18n/ko/<id>.json` 을 만들고
 * ③ `build` 를 「말 묶음 받은 뒤 그린다」로 감싼다. 셋 다 기계가 할 수 있는 일이고,
 * 사람이 해야 하는 건 **en/ja 를 뭐라고 쓸지**뿐이다. 그 둘을 갈라 놓는 것이 이 대본이다.
 *
 * 안 하는 것 (일부러):
 *  - **모르는 건 손대지 않는다.** `${}` 가 섞인 한국어 문장처럼 자리표시가 필요한 것은
 *    바꾸지 않고 「남은 것」으로 적어 낸다. 어설프게 바꾸면 조용히 깨진 글이 나간다 —
 *    이 대본에서 제일 나쁜 결과다.
 *  - 주석·`import` 경로·`console` 문구는 화면에 안 나가므로 건드리지 않는다.
 *
 * 쓰는 법:
 *   node scripts/i18n-widgetize.mjs ziptool            # 미리보기 (파일 안 건드림)
 *   node scripts/i18n-widgetize.mjs ziptool --write    # 실제로 고치고 ko 묶음 생성
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HANGUL = /[가-힣]/;

const id = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!id || id.startsWith('--')) {
  console.error('사용: node scripts/i18n-widgetize.mjs <도구 id> [--write]');
  process.exit(2);
}

/* 도구 위젯이 `src/widgets/tools/` 밖에 있는 경우가 있다 — 찾아보기표(ref/…)·이미지 편집 등
 * **19개가 그렇다.** 장(en/ja)은 다 찍히는데 위젯 화면만 한국어로 남아 있었고, 여기서
 * `tools/` 만 보느라 「남은 것 없음」으로 세어졌다. id 로 못 찾으면 **src 전체에서 찾는다.** */
function findWidget(id) {
  const direct = path.join(ROOT, 'src/widgets/tools', `${id}.ts`);
  if (fs.existsSync(direct)) return direct;
  const hit = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith('.ts')) {
        const body = fs.readFileSync(f, 'utf8');
        /* 등록하는 이름은 두 가지 꼴로 적힌다 — 직접 적거나(`id: 'moon'`), 미리 박아 둔 것을
         * 꺼내 쓰거나(`getLazyWidgetPublicMeta?.('memo')`). 뒤엣것을 못 알아보면 파일을 못 찾고,
         * 그러면 `tools/` 로 넘어가 엉뚱한 곳을 만진다. */
        if (body.includes(`id: '${id}'`) || body.includes(`getLazyWidgetPublicMeta?.('${id}')`)) hit.push(f);
      }
    }
  })(path.join(ROOT, 'src/widgets'));
  if (hit.length === 1) return hit[0];
  if (hit.length > 1) {
    console.error(`id '${id}' 를 여러 곳에서 찾았다 — 경로를 직접 줘라:`);
    for (const f of hit) console.error('  ' + path.relative(ROOT, f).split(path.sep).join('/'));
    process.exit(2);
  }
  return direct;
}

const file = id.endsWith('.ts') ? path.resolve(ROOT, id) : findWidget(id);
if (!fs.existsSync(file)) {
  console.error(`그런 위젯이 없다: ${path.relative(ROOT, file)}`);
  process.exit(2);
}
let src = fs.readFileSync(file, 'utf8');
if (src.includes('loadNamespace')) {
  console.error(`${id} 은 이미 말 묶음을 쓴다 — 손대지 않는다.`);
  process.exit(0);
}

/**
 * 글자마다 **여기가 무엇인지** 적어 둔 자(尺)를 만든다.
 *
 * 왜 이렇게까지: 처음엔 `>…<` 를 그냥 찾았다. 그러자 `files.reduce((s, f) => s + f.size, 0)` 의
 * `=>` 와 뒤쪽 `<` 사이가 「화면 글자」로 잡혀 코드가 통째로 깨졌다. 정규식만으로는
 * *생김새가 같은 두 가지*(HTML 마디 · 화살표 함수)를 가를 수 없다. 그래서 한 번 훑으며
 * 자리를 표시한다:
 *   H = 템플릿 안 HTML 글자 · J = 그냥 코드 · S/D = 홑·겹따옴표 글월 · C = 주석
 * `${…}` 안은 다시 코드(J)다 — 거기 든 `>` 는 화면 글자가 아니다.
 */
let mark = '';
function scan() {
  const m = new Array(src.length).fill('J');
  /* 쌓아 두고 본다. `${ … }` 안은 **다시 코드**이고, 그 코드 안에서 또 템플릿이 열릴 수 있다
   * (`items.map((x) => `<li>…</li>`).join('')` — 이 모양이 실제로 제일 흔하다).
   * 앞선 판은 그 자리에서 훑기를 그만두는 바람에, 거기서부터 자가 통째로 어긋났다.
   * 그래서 **스스로를 되부르는 대신 쌓기(stack)** 로 끝까지 따라간다. */
  const stack = [{ kind: 'code', brace: 0 }];
  const top = () => stack[stack.length - 1];
  let i = 0;
  while (i < src.length) {
    const here = top();
    const c = src[i];
    const n = src[i + 1];

    if (here.kind === 'tpl') {
      if (c === '\\') {
        m[i++] = 'H';
        if (i < src.length) m[i++] = 'H';
        continue;
      }
      if (c === '`') {
        m[i++] = 'H';
        stack.pop();
        continue;
      }
      if (c === '$' && n === '{') {
        m[i++] = 'J';
        m[i++] = 'J';
        stack.push({ kind: 'code', brace: 0, inTpl: true });
        continue;
      }
      m[i++] = 'H';
      continue;
    }

    // ── 코드 자리
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') m[i++] = 'C';
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      while (i < stop) m[i++] = 'C';
      continue;
    }
    if (c === "'" || c === '"') {
      const kind = c === "'" ? 'S' : 'D';
      m[i++] = kind;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') m[i++] = kind;
        if (i < src.length) m[i++] = kind;
      }
      if (i < src.length) m[i++] = kind;
      continue;
    }
    if (c === '`') {
      m[i++] = 'H';
      stack.push({ kind: 'tpl' });
      continue;
    }
    /* 정규식 리터럴. **꼭 필요하다** — `.replace(/['"`]/g, '')` 처럼 따옴표를 *담고 있는* 정규식이
     * 흔한데, 그걸 글월 시작으로 읽으면 거기서부터 자가 통째로 어긋난다(slug 에서 실제로
     * 그래서 뽑힌 열쇠가 0개였다 — 조용히 아무것도 안 한 것이라 더 나빴다).
     * `/` 가 나눗셈인지 정규식인지는 **앞의 뜻 있는 글자**로 가른다(자바스크립트의 오랜 방법). */
    if (c === '/') {
      let k = i - 1;
      while (k >= 0 && ' \t\n\r'.includes(src[k])) k--;
      const prev = k >= 0 ? src[k] : '';
      const word = /[A-Za-z0-9_$]/.test(prev) ? /[A-Za-z_$][\w$]*$/.exec(src.slice(0, k + 1))?.[0] : null;
      const KEYWORD = ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'do', 'else', 'yield', 'await'];
      const isRegex = !prev || '(,=:[!&|?{};+-*%~^<>'.includes(prev) || (word && KEYWORD.includes(word));
      if (isRegex) {
        m[i++] = 'J';
        let inClass = false;
        while (i < src.length) {
          const ch = src[i];
          if (ch === '\\') {
            m[i++] = 'J';
            if (i < src.length) m[i++] = 'J';
            continue;
          }
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) {
            m[i++] = 'J';
            break;
          } else if (ch === '\n') break; // 정규식이 아니었다 — 더 삼키지 않는다
          m[i++] = 'J';
        }
        while (i < src.length && /[a-z]/.test(src[i])) m[i++] = 'J'; // 뒤에 붙는 g·i·m…
        continue;
      }
    }
    if (c === '{') {
      here.brace++;
      m[i++] = 'J';
      continue;
    }
    if (c === '}') {
      if (here.brace === 0 && here.inTpl) {
        m[i++] = 'J';
        stack.pop(); // `${ … }` 가 닫혔다 — 다시 템플릿 글자
        continue;
      }
      if (here.brace > 0) here.brace--;
      m[i++] = 'J';
      continue;
    }
    m[i++] = 'J';
  }
  mark = m.join('');
}
scan();
/** 앞 단계가 글자를 바꾸면 자리가 밀린다 — 단계마다 자를 다시 댄다. */
const reblank = () => scan();

const catalog = {};
const used = new Set();
const leftovers = [];
let seq = 0;

/** 같은 글은 같은 열쇠를 쓴다 — 안 그러면 번역을 두 번 쓰게 된다. */
const byText = new Map();
function keyFor(text, hint) {
  if (byText.has(text)) return byText.get(text);
  let base = hint ? `${id}.${hint}` : `${id}.t${String(++seq).padStart(2, '0')}`;
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}${n}`;
  used.add(key);
  byText.set(text, key);
  catalog[key] = text;
  return key;
}

const slug = (v) =>
  String(v)
    .replace(new RegExp(`^${id}`, 'i'), '')
    .replace(/[^A-Za-z0-9]/g, '')
    .replace(/^./, (c) => c.toLowerCase()) || null;

/** 한 마디가 **통째로** 그 자리인지 본다. 앞 글자만 보면, 문자열이 끝난 자리에서 시작한 짝이
 *  다음 문자열까지 삼켜 코드를 먹는다 — `'ko-KR')}개 매치` : '` 가 실제로 그렇게 잡혔다. */
const allMark = (offset, len, kind) => {
  for (let i = offset; i < offset + len; i++) if (mark[i] !== kind) return false;
  return true;
};

/* ── ① 템플릿 속성값: placeholder="…" / aria-label="…" / title="…" / alt="…" ── */
src = src.replace(
  /\b(placeholder|aria-label|title|alt)="([^"$`<>]*)"/g,
  (whole, attr, text, offset) => {
    if (!HANGUL.test(text) || !allMark(offset, whole.length, 'H')) return whole;
    // 같은 태그 안의 id 를 힌트로 쓴다 — `<input id="zpName" placeholder="…">` → zip.ph.name
    const tagStart = src.lastIndexOf('<', offset);
    const idm = /\sid="([^"]+)"/.exec(src.slice(tagStart, offset + whole.length));
    const kind = attr === 'placeholder' ? 'ph' : attr === 'aria-label' ? 'aria' : attr;
    const key = keyFor(text, idm ? `${kind}.${slug(idm[1])}` : null);
    return `${attr}="\${esc(t('${key}'))}"`;
  }
);

reblank();
/* ── ② 템플릿 속 글자 마디: `>여기<` 사이의 한국어 ── */
src = src.replace(/>([^<>`${}]*[가-힣][^<>`${}]*)</g, (whole, raw, offset) => {
  if (!allMark(offset, whole.length, 'H')) return whole;
  const text = raw.trim();
  if (!text) return whole;
  const tagStart = src.lastIndexOf('<', offset);
  const tag = src.slice(tagStart, offset + 1);
  const idm = /\sid="([^"]+)"/.exec(tag);
  const forM = /\sfor="([^"]+)"/.exec(tag);
  const valM = /^<option[^>]*\svalue="([^"]+)"/.exec(tag);
  const isBtn = /^<button/.test(tag);
  const hint = valM
    ? `opt.${slug(valM[1])}`
    : idm
      ? `${isBtn ? 'btn' : 'label'}.${slug(idm[1])}`
      : forM
        ? `label.${slug(forM[1])}`
        : null;
  const key = keyFor(text, hint);
  const [lead] = /^\s*/.exec(raw);
  const [tail] = /\s*$/.exec(raw);
  return `>${lead}\${esc(t('${key}'))}${tail}<`;
});

reblank();
/* ── ③ 그냥 홑따옴표 글월: say('…') · throw new Error('…') · 그 밖 ── */
src = src.replace(/'([^'\\\n]*[가-힣][^'\\\n]*)'/g, (whole, text, offset) => {
  if (!allMark(offset, whole.length, 'S')) return whole;
  const before = src.slice(Math.max(0, offset - 40), offset);
  const hint = /\bsay\($/.test(before)
    ? `say.${String(++seq).padStart(2, '0')}`
    : /new Error\($/.test(before)
      ? `err.${String(++seq).padStart(2, '0')}`
      : /\btitle:\s*$/.test(before)
        ? null // 등록 title 은 아래에서 따로 (기본값 딸린 t)
        : null;
  /* 객체의 **열쇠 자리**면 계산된 열쇠로 감싼다 — `t(x): [` 는 문법 오류라 그 파일만 컴파일이
   * 깨진다(markdown 문법표의 묶음 이름 8개가 그랬다). 삼항(`x ? '가' : '나'`)도 뒤에 `:` 가
   * 오므로, **앞이 `{` 나 `,` 일 때만** 열쇠 자리로 본다. */
  const after = src.slice(offset + whole.length, offset + whole.length + 3);
  const call = `t('${keyFor(text, hint)}')`;
  const prev = before.replace(/\s+$/, '').slice(-1);
  return /^\s*:/.test(after) && (prev === '{' || prev === ',') ? `[${call}]` : call;
});

/* ── ④ 등록 title/desc/label 은 **기본값 딸린 t()** 로 (묶음이 늦게 와도 이름이 빈칸이 안 되게) ── */
for (const field of ['title', 'desc', 'label']) {
  const re = new RegExp(`(\\n\\s*${field}: )t\\('([^']+)'\\)`, 'g');
  src = src.replace(re, (whole, head, key) => {
    const ko = catalog[key];
    const named =
      field === 'title' ? `widgets.${id}.title` : field === 'desc' ? `widgets-desc.${id}.desc` : key;
    /* ★ 지우지 않는다. 같은 글이 탭 이름으로도 쓰이면(같은 글 = 같은 열쇠) 여기서 지운 순간
     *   그쪽이 「없는 열쇠」가 되고, 기본값 자리에 `undefined` 가 박힌다 — 실제로 그렇게 깨졌다
     *   (replace.t05 · tableconv.t01). 안 쓰이게 된 열쇠는 맨 끝에서 한꺼번에 턴다. */
    return `${head}t('${named}', undefined, ${JSON.stringify(ko)})`;
  });
}

/* ── ⑤ build 를 「말 묶음 받은 뒤 그린다」로 감싼다 ──
 * 몸통을 밖으로 끌어내지 않고 **감싸기만** 한다. 끌어내면 닫는 괄호 개수를 사람이 다시 세야 하고,
 * 실제로 그 자리에서 매번 깨졌다. 감싸기는 여는 줄 하나 + 닫는 줄 하나로 끝난다. */
const BUILD = 'build: function (container: HTMLElement): void {';
let wrapped = 0;
for (let at = src.indexOf(BUILD); at >= 0; at = src.indexOf(BUILD, at + 1)) {
  const open = at + BUILD.length - 1;
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) break;
  const indent = ' '.repeat(at - src.lastIndexOf('\n', at) - 1);
  const head = `${BUILD}\n${indent}  void loadNamespace('${id}').then(function () {\n`;
  src = src.slice(0, at) + head + src.slice(open + 1, end) + `${indent}  });\n${indent}` + src.slice(end);
  wrapped++;
  at = src.indexOf('});', end); // 감싼 만큼 뒤로 밀렸다
}

/* ── ⑥ esc / import 를 심는다 ──
 * 위젯 안에 이미 있던 `const esc` 는 **지운다.** 남겨 두면 안쪽에서 바깥 것을 가려(shadow),
 * 그 위에서 부른 `esc(t(...))` 가 「선언 전에 썼다」로 죽는다 — 실제로 그렇게 깨졌다.
 * 하는 일은 같은 글자 막기이므로 바깥 하나로 합친다. */
src = src.replace(/^[ \t]*const esc = \(s: string\): string =>[^\n]*\n(?:[ \t]+\.[^\n]*\n)*/gm, '');
// `function esc(s) { … }` 꼴도 같은 이유로 지운다 (이름만 다르고 하는 일은 같다)
src = src.replace(/^[ \t]*function esc\(s: string\): string \{\n(?:[^\n]*\n){1,2}?[ \t]*\}\n/gm, '');
if (!/const esc = /.test(src) && src.includes('esc(t(')) {
  src = src.replace(
    /^\(function \(\): void \{/m,
    `(function (): void {\n  const esc = (v: string): string =>\n    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');\n`
  );
}
/* 위젯이 `tools/` 밖에 있으면 깊이가 다르다 — `../../lib/i18n` 을 박으면 그 파일만 컴파일이 깨진다. */
const i18nSpec = (() => {
  const rel = path
    .relative(path.dirname(file), path.join(ROOT, 'src/lib/i18n'))
    .split(path.sep)
    .join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
})();
if (!src.includes(`from '${i18nSpec}'`)) {
  const line = `import { t, loadNamespace } from '${i18nSpec}';`;
  const lastImport = src.lastIndexOf('\nimport ');
  if (lastImport >= 0) {
    const eol = src.indexOf('\n', lastImport + 1);
    src = src.slice(0, eol + 1) + line + '\n' + src.slice(eol + 1);
  } else {
    src = src.replace(/^\(function \(\): void \{/m, `${line}\n\n(function (): void {`);
  }
}

/* ── ⑦ 남은 것: 자리표시가 낀 한국어. 손이 필요하다고 적어 낸다. ── */
for (const m of src.matchAll(/`[^`]*[가-힣][^`]*`/g)) {
  if (m[0].includes('${esc(t(') && !HANGUL.test(m[0].replace(/\$\{[^}]*\}/g, ''))) continue;
  if (HANGUL.test(m[0].replace(/\$\{[^}]*\}/g, ''))) leftovers.push(m[0].replace(/\s+/g, ' ').slice(0, 90));
}

/* ── ⑧ 「표가 먼저 굳는 자리」 경고 ──
 * `Toolbox.register(` 앞에서 `t(` 를 부르면, 그건 위젯이 그려지기 전(= 말 묶음이 오기 전)에
 * 값이 정해진다는 뜻이다. 그 자리는 영원히 한국어로 남는다. 기계가 고칠 수는 없지만
 * (표를 함수로 바꾸는 건 사람 판단), **있다는 사실은 반드시 알려야 한다.** */
const regAt = src.indexOf('Toolbox.register(');
const early = regAt > 0 ? (src.slice(0, regAt).match(/\bt\(/g) || []).length : 0;

/* 아무 데서도 안 부르게 된 열쇠는 턴다 (④ 에서 이름이 바뀐 것들). */
for (const key of Object.keys(catalog)) {
  if (!src.includes(`'${key}'`)) delete catalog[key];
}

const rel = path.relative(ROOT, file).replace(/\\/g, '/');
console.log(`[widgetize] ${rel} · build ${wrapped}곳 감쌈 · 열쇠 ${Object.keys(catalog).length}개`);
/* 아무것도 못 뽑았는데 화면에 나갈 법한 한국어가 남아 있으면, 그건 **자가 어긋났다는 뜻**이다.
 * 조용히 0개로 끝나는 게 제일 나쁘다 — 사람이 「이 도구는 원래 한국어가 없나 보다」로 읽는다. */
const stillKo = (src.match(/[가-힣]/g) || []).length;
if (Object.keys(catalog).length === 0 && stillKo > 20) {
  console.log(`[widgetize] ⚠ 뽑은 열쇠가 0개인데 한국어가 ${stillKo}자 남아 있다 — 훑기가 어긋났을 수 있다.`);
  console.log('   정규식 리터럴·특이한 따옴표를 의심하고, --write 없이 다시 보라.');
}
if (early) {
  console.log(`[widgetize] ⚠ 등록보다 먼저 t() 를 ${early}곳에서 부른다 — 그 표는 말 묶음이 오기 전에 굳는다.`);
  console.log('   쓸 때 만드는 함수로 바꿔야 한다 (사람 판단).');
}
if (leftovers.length) {
  console.log(`[widgetize] 손이 필요한 곳 ${leftovers.length}개 (자리표시가 낀 글) —`);
  for (const l of leftovers.slice(0, 12)) console.log('   ' + l);
}
if (!WRITE) {
  console.log('[widgetize] 미리보기다 — 고치려면 --write');
  process.exit(0);
}

/* **위젯만 고치고 말 묶음을 안 쓰면 화면에 열쇠가 그대로 나간다.** 경로로 부르면 `id` 가
 * 경로 문자열이라 `i18n/ko/src/widgets/memo.ts.json` 같은 데를 가리킨다 — 그 전에 세운다. */
if (/[/\\]/.test(id) || id.endsWith('.ts')) {
  console.error(`경로로 부를 땐 이름을 못 정한다 — 등록 이름으로 불러라 (예: 그 파일의 Toolbox.register id).`);
  process.exit(2);
}
fs.writeFileSync(file, src);
const koPath = path.join(ROOT, 'i18n/ko', `${id}.json`);
const merged = fs.existsSync(koPath) ? JSON.parse(fs.readFileSync(koPath, 'utf8')) : {};
fs.writeFileSync(koPath, JSON.stringify({ ...merged, ...catalog }, null, 2) + '\n');
console.log(`[widgetize] 썼다 → ${rel} · i18n/ko/${id}.json`);
