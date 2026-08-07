/**
 * 글꼴이 실제로 실려 나가는지 본다 (TASK-KL-128)
 *
 * 왜 있나: 글꼴을 우리 서버에서 주기로 하면서 실패하는 방식이 달라졌다. 예전엔 남의 서버가
 * 늘 답을 줬으므로 「안 온다」가 없었는데, 이제는 **파일 하나가 빠지면 그 글꼴이 통째로 안 온다**.
 * 화면은 컴퓨터 글꼴로 멀쩡히 보이므로 아무도 모른다 — 그래서 코드로 잡는다.
 *
 * 보는 것:
 *   ① `css/fonts.css` 가 가리키는 woff2 가 전부 실제로 있고, 빈 파일이 아니다
 *   ② 우리 화면이 다시 남의 글꼴 서버를 부르지 않는다 (되돌아감 방지)
 *   ③ 스타일의 글꼴 변수가 우리가 구운 이름을 가리킨다
 *
 * 사용: node scripts/audit-fonts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bad = [];

const cssPath = path.join(root, 'css/fonts.css');
if (!fs.existsSync(cssPath)) {
  bad.push('css/fonts.css 가 없다 — `npm run gen:fonts` 를 돌려라');
} else {
  const css = fs.readFileSync(cssPath, 'utf8');
  const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
  if (!urls.length) bad.push('css/fonts.css 에 글꼴 파일이 한 개도 안 적혀 있다');
  for (const u of urls) {
    const rel = u.replace('/apps/karmolab/', '');
    const f = path.join(root, rel);
    if (!fs.existsSync(f)) bad.push(`적혀 있는데 파일이 없다 — ${rel}`);
    else if (fs.statSync(f).size < 5000) bad.push(`파일이 너무 작다(잘못 구워짐) — ${rel}`);
  }
}

// 되돌아감 방지 — 셸과 도구 페이지 생성기가 다시 남의 글꼴 서버를 부르면 잡는다.
for (const rel of ['index.html', 'scripts/gen-tool-pages.mjs']) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  // 이 파일 자신의 설명글에 주소가 적힌 것은 부르는 것이 아니다 — 실제로 거는 줄만 본다.
  const calls = text.split('\n').filter((l) => /(?:href|src)=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com/.test(l));
  if (calls.length) bad.push(`${rel} 이 다시 남의 글꼴 서버를 부른다 (${calls.length}줄)`);
  // 부르는 줄이 통째로 사라지면 화면은 멀쩡하고(컴퓨터 글꼴) 글꼴만 조용히 안 온다 — 그것도 잡는다.
  // 단, **자기 머리말을 직접 짜는 파일에만** 묻는다. 도구 페이지 생성기는 셸(index.html)을
  // 그대로 물려받는 쪽으로 바뀔 수 있고(TASK-KL-129), 그때는 여기에 글꼴 줄이 없는 게 맞다.
  const ownsHead = /<link rel="stylesheet" href="\/apps\/karmolab\/css\/toolbox\.css">/.test(text);
  if (ownsHead && !text.includes('css/fonts.css')) {
    bad.push(`${rel} 이 자기 머리말을 짜면서 글꼴 목록(css/fonts.css)은 안 부른다`);
  }
}

const toolbox = path.join(root, 'css/toolbox.css');
if (fs.existsSync(toolbox)) {
  const text = fs.readFileSync(toolbox, 'utf8');
  for (const [v, want] of [['--font-sans', 'KarmoSans'], ['--font-serif', 'KarmoSerif'], ['--font-mono', 'KarmoMono']]) {
    const m = text.match(new RegExp(`${v}:([^;]+);`));
    if (!m) bad.push(`css/toolbox.css 에 ${v} 가 없다`);
    else if (!m[1].includes(want)) bad.push(`css/toolbox.css 의 ${v} 가 ${want} 를 안 가리킨다`);
  }
}

if (bad.length) {
  console.error('[audit-fonts] 문제 ' + bad.length + '건');
  for (const b of bad) console.error('  - ' + b);
  process.exit(1);
}
console.log('[audit-fonts] 글꼴 배선 정상');
