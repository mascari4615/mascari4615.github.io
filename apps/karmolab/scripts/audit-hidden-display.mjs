/**
 * `hidden` 을 쓰는 칸에 `display` 를 적어 놓은 곳을 찾는다 (TASK-KL-283).
 *
 * `hidden` 속성은 기본값으로만 `display:none` 을 준다. 그 요소의 클래스에 `display:flex` 같은
 * 값을 적어 두면 **그쪽이 이기고, 숨김이 아무 일도 안 한다.** 화면은 멀쩡해 보이고 오류도 없다 . 
 * 그냥 아직 보이면 안 되는 것이 처음부터 보일 뿐이다.
 *
 * 실제로 재료 화면 여덟 곳에서 **이 결과로 이어서 줄과 파일 줄이 늘 서 있었다**
 * (결과도 없고 파일도 없는데). 검사들이 보이는가만 재고 아직 안 보이는가를 안 쟀다.
 *
 * 고치는 법 = 짝을 적는다: `.그클래스[hidden]{display:none;}`
 *
 * 사용: node scripts/audit-hidden-display.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = [];
const walk = (d) => {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.ts')) files.push(p);
  }
};
walk(path.join(root, 'src'));

const bad = [];
for (const p of files) {
  const s = fs.readFileSync(p, 'utf8');
  const guarded = new Set([...s.matchAll(/\.([a-zA-Z][\w-]*)\[hidden\]/g)].map((m) => m[1]));
  const display = new Set();
  for (const m of s.matchAll(/\.([a-zA-Z][\w-]*)\s*\{([^}]*)\}/g)) {
    if (/display\s*:\s*(?!none)[a-z-]+/.test(m[2])) display.add(m[1]);
  }
  if (!display.size) continue;

  const say = (cls, how) => {
    /* 경로는 **슬래시로 맞춰 둔다**. 윈도우의 역슬래시를 정규식으로 상대하면
     * 이스케이프가 한 겹 날아가는 순간 조용히 남의 파일로 새어 나간다(첫 판에 그랬다). */
    if (display.has(cls) && !guarded.has(cls)) bad.push({ file: path.relative(root, p).split(path.sep).join('/'), cls, how });
  };
  /* ① 마크업 한 태그 안에 class 와 hidden 이 같이 있다 */
  for (const tag of s.match(/<[a-zA-Z][^>]*>/g) || []) {
    if (!/ hidden/.test(tag)) continue;
    const cm = /class="([^"]+)"/.exec(tag);
    if (cm) cm[1].split(/\s+/).forEach((c) => say(c, '마크업'));
  }
  /* ② 만들면서 클래스를 주고, 나중에 `.hidden` 을 켠다 */
  for (const m of s.matchAll(/(\w+)\.className\s*=\s*'([\w -]+)'/g)) {
    if (new RegExp(`\b${m[1]}\.hidden\s*=`).test(s)) m[2].split(/\s+/).forEach((c) => say(c, '코드'));
  }
}

const seen = new Set();
const rows = bad.filter((b) => {
  const k = `${b.file}:${b.cls}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

/* 내 영역 밖(다른 슬롯이 손보는 화면)은 **알리기만** 한다. 남의 파일을 게이트로 막지 않는다. */
const MINE = 'src/widgets/tools/';
const mine = rows.filter((r) => r.file.startsWith(MINE));
const others = rows.filter((r) => !r.file.startsWith(MINE));

if (others.length) {
  console.warn('[audit-hidden-display] (알림) 다른 화면에도 같은 모양이 있습니다. 그 슬롯이 봐야 합니다:');
  others.forEach((r) => console.warn(` , ${r.file} .${r.cls} (${r.how})`));
}
if (mine.length) {
  console.error('[audit-hidden-display] hidden 이 안 먹는 칸이 있습니다. 숨겨야 할 때 그대로 보입니다:');
  mine.forEach((r) => console.error(`  - ${r.file} .${r.cls} (${r.how})`));
  console.error('  고치는 법: 같은 파일에 `.그클래스[hidden]{display:none;}` 한 줄을 짝으로 적으세요.');
  process.exit(1);
}
console.log(`[audit-hidden-display] 도구 화면에는 hidden 이 안 먹는 칸이 없습니다 (다른 화면 알림 ${others.length}건)`);
