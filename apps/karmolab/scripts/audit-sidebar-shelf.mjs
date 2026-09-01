#!/usr/bin/env node
/**
 * 옆줄 진열이 조용히 불어나나 (2026-08-31)
 *
 * 왜 있나. 사람이 옆줄에 남길 도구를 29개로 골랐다(그날 42개를 `hidden` 으로 내렸다).
 * 그런데 새 도구를 만들 때 `hidden` 을 안 적으면 그냥 진열대에 올라간다. 며칠 지나면
 * 고른 적 없는 것이 옆줄에 서 있고, 아무도 언제 늘었는지 모른다. 진열은 결정이지 기본값이 아니다.
 *
 * 재는 것. 등록 명부에서 `hidden` 도 아니고 `app` 갈래도 아닌 도구 수.
 *   그 수가 기준선보다 크면 빨강. 줄면 기준선을 조이라고 말한다.
 *   `app` 갈래는 옆줄에 안 서고 머리띠와 첫 화면에 있으므로 안 센다.
 *
 * 새 도구를 진열하려는 것이면 기준선을 올려라(사람 결정). 그냥 만든 것이면 `hidden: true`.
 *
 * 끝값 0 안 늘음, 1 늘음, 2 못 잼
 *   --bless: 지금 수를 기준선으로
 *   --list: 지금 진열된 것 목록
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const META = path.join(root, 'src/widgets-lazy-meta.ts');
const BASELINE = path.join(root, 'data/sidebar-shelf-baseline.json');

if (!fs.existsSync(META)) {
  console.error('[sidebar-shelf] 못 쟀다. 등록 명부가 없다.');
  process.exit(2);
}

/* 줄 끝을 먼저 고른다. 윈도우 체크아웃은 CRLF 라 덩이 나누기가 안 맞는다 */
const src = fs.readFileSync(META, 'utf8').replace(/\r\n/g, '\n');

/** 진열된 도구 id. 한 줄로 적힌 덩이(숨긴 놀이들)도 같이 본다 */
function shelf() {
  const out = [];
  const parts = src.split('\n  {');
  for (let i = 1; i < parts.length; i += 1) {
    const end = parts[i].indexOf('\n  },');
    const block = end < 0 ? parts[i] : parts[i].slice(0, end);
    const lines = block.split('\n');
    /* 한 줄에 통째로 적힌 것들 */
    for (const line of lines) {
      if (!/id: '[a-z0-9-]+'/.test(line) || !line.includes('}')) continue;
      if (/hidden:\s*true/.test(line)) continue;
      const cat = line.match(/category:\s*'([^']*)'/)?.[1];
      if (cat === 'app') continue;
      out.push(line.match(/id: '([a-z0-9-]+)'/)[1]);
    }
    /* 여러 줄로 적힌 것 */
    const own = lines.find((l) => /^\s*id: '[a-z0-9-]+',\s*$/.test(l));
    if (!own) continue;
    if (/hidden:\s*true/.test(block)) continue;
    const cat = block.match(/category:\s*'([^']*)'/)?.[1];
    if (cat === 'app' || cat === undefined) continue;
    out.push(own.match(/id: '([a-z0-9-]+)'/)[1]);
  }
  return [...new Set(out)].sort();
}

const now = shelf();

if (process.argv.includes('--list')) {
  console.log(now.join('\n'));
  console.log(`[sidebar-shelf] 진열 ${now.length}개`);
  process.exit(0);
}

if (process.argv.includes('--bless')) {
  fs.writeFileSync(BASELINE, JSON.stringify({ count: now.length, ids: now }, null, 1) + '\n', 'utf8');
  console.log(`[sidebar-shelf] 기준선을 다시 적었다. 진열 ${now.length}개`);
  process.exit(0);
}

let base;
try {
  base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
} catch {
  console.error(`[sidebar-shelf] 못 쟀다. 기준선이 없다 (${path.relative(root, BASELINE)}). 처음이면 --bless.`);
  process.exit(2);
}

const added = now.filter((id) => !base.ids.includes(id));
if (added.length) {
  console.error(`[sidebar-shelf] **옆줄 진열이 늘었다** ${base.count} -> ${now.length}개. 새로 선 것: ${added.join(', ')}`);
  console.error('  진열은 사람이 고르는 것이다. 그냥 만든 도구면 `hidden: true` 를 넣어라.');
  console.error('  정말 진열할 것이면 `npm run audit:sidebar-shelf -- --bless` 로 기준선을 올려라.');
  process.exit(1);
}
const gone = base.ids.filter((id) => !now.includes(id));
if (gone.length) {
  console.log(`[sidebar-shelf] 줄었다 ${base.count} -> ${now.length}개 (내린 것: ${gone.join(', ')}). 기준선을 조여라: npm run audit:sidebar-shelf -- --bless`);
  process.exit(0);
}
console.log(`[sidebar-shelf] 안 늘었다 (진열 ${now.length}개)`);
