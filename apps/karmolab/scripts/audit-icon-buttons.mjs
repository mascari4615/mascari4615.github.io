/**
 * **그림만 있는 단추에 이름이 있는가** (TASK-KL-292).
 *
 * `⟳`, `✕` 처럼 글자가 아닌 단추는 화면낭독기에 단추로만 읽힌다. 무엇을 하는 단추인지
 * 알 방법이 없다. `title` 은 마우스를 올려야 뜨는 것이라 대신이 못 된다. **`aria-label` 이 이름**이다.
 *
 * 숫자, 글자가 든 단추(`640`, `25%`)는 그대로 읽히므로 세지 않는다. 막는 게 목적이 아니라
 * **이름 없는 단추**를 막는 게 목적이다.
 *
 * 사용: node scripts/audit-icon-buttons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dirs = [path.join(root, 'src', 'widgets', 'tools'), path.join(root, 'src', 'widgets', 'tools', 'shared')];

/** 글자도 숫자도 아닌 것만 (기호, 그림) */
const symbolOnly = (s) => !!s && s.length <= 3 && !/[\p{L}\p{N}]/u.test(s);

const bad = [];
for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(dir, name), 'utf8');

    /* ① 마크업 단추 */
    for (const m of src.matchAll(/<button([^>]*)>([^<]{0,6})<\/button>/g)) {
      if (/aria-label/.test(m[1])) continue;
      const txt = m[2].trim();
      if (symbolOnly(txt)) bad.push({ file: name, txt, how: '마크업' });
    }
    /* ② 코드로 만든 단추 */
    for (const m of src.matchAll(/(\w+)\.textContent = '([^']{1,3})';/g)) {
      const [, v, txt] = m;
      if (!symbolOnly(txt)) continue;
      const near = src.slice(Math.max(0, m.index - 500), m.index + 500);
      if (!near.includes(`${v} = document.createElement('button')`) && !near.includes(`${v}.type = 'button'`)) continue;
      if (near.includes(`${v}.setAttribute('aria-label'`) || near.includes(`${v}.ariaLabel`)) continue;
      bad.push({ file: name, txt, how: '코드' });
    }
  }
}

if (bad.length) {
  console.error(`[audit-icon-buttons] 이름 없는 그림 단추 ${bad.length}개. 낭독기엔 단추로만 읽힙니다:`);
  bad.forEach((b) => console.error(`  - ${b.file} ${b.txt} (${b.how})`));
  console.error('  고치는 법: `aria-label="무엇을 하는지"` 를 붙이세요 (title 은 대신이 안 됩니다).');
  process.exit(1);
}
console.log('[audit-icon-buttons] 그림만 있는 단추에 전부 이름이 있습니다');
