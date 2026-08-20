#!/usr/bin/env node
/**
 * 시험 서버가 **배포와 같은 모양**의 HTML 을 내는가 (2026-08-16)
 *
 * 이 저장소 화면 284장이 Jekyll 앞머리(`--- … ---`)로 시작한다. 배포에서는 Jekyll 이 떼고
 * 내보내지만, 시험 서버가 날것으로 내면 브라우저가 그 줄들을 **본문 글자**로 읽고
 * 그 순간 `<head>` 가 닫힌 것으로 친다 — head 안의 것이 전부 body 로 밀린다.
 *
 * 여태 「글자로 보일 뿐 동작에는 지장 없다」고 넘어갔는데, head 에 보안 meta 를 하나 넣자마자
 * 「head 밖이라 무시한다」로 배포가 빨개졌다. **배포에서는 멀쩡한데 시험만 빨간** 상태 =
 * 시험이 없는 문제를 잡고 있는 문제를 놓치는 상태다.
 *
 * 그래서: HTML 을 내는 시험 서버는 `lib/serve-html.mjs` 의 `stripFrontMatter` 를 써야 한다.
 * 기준선(래칫) — 지금 안 쓰는 것이 여럿이라 「늘면 빨강」으로 켠다. 줄면 다시 적으라고 말한다.
 *
 * exit 0 = 안 늘었다 · 1 = 늘었다 · 2 = 못 쟀다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPTS = path.join(root, 'scripts');
const BASELINE = path.join(root, 'data', 'serve-frontmatter-baseline.json');

const files = fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs'));
if (files.length === 0) {
  console.error('[serve-frontmatter] 못 쟀다 — scripts/*.mjs 가 없다.');
  process.exit(2);
}

const offenders = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
  if (src.includes('http.createServer') === false) continue;
  if (/\.html/.test(src) === false) continue;             // HTML 을 안 내면 상관없다
  if (src.includes('stripFrontMatter')) continue;
  offenders.push(f);
}
offenders.sort();

if (process.argv.includes('--bless')) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(offenders, null, 1) + '\n', 'utf8');
  console.log(`[serve-frontmatter] 기준선을 다시 적었다 — ${offenders.length}개`);
  process.exit(0);
}

let base;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
catch {
  console.error(`[serve-frontmatter] 못 쟀다 — 기준선이 없다 (${path.relative(root, BASELINE)}). 처음이면 --bless.`);
  process.exit(2);
}

const fresh = offenders.filter((f) => base.includes(f) === false);
if (fresh.length > 0) {
  console.error(`[serve-frontmatter] 앞머리를 안 떼는 시험 서버가 **늘었다** ${fresh.length}개:`);
  for (const f of fresh) console.error(`  - scripts/${f}`);
  console.error("  고치기: import { stripFrontMatter } from './lib/serve-html.mjs' 후 .html 을 낼 때 통과시켜라.");
  process.exit(1);
}
const fixed = base.filter((f) => offenders.includes(f) === false);
if (fixed.length > 0) {
  console.log(`[serve-frontmatter] 줄었다 ${base.length} → ${offenders.length}개 — 기준선을 다시 적어라: npm run audit:serve-fm -- --bless`);
  process.exit(0);
}
console.log(`[serve-frontmatter] 안 늘었다 (남은 빚 ${offenders.length}개)`);
