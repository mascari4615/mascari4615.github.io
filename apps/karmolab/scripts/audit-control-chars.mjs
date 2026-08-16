/**
 * 소스에 **보이지 않는 글자**가 박혔는지 (2026-08-10)
 *
 * 오늘 하루에 **네 번** 같은 사고를 냈다. 스크립트로 파일을 고칠 때 정규식의 `\b` 가
 * **진짜 백스페이스 문자(0x08)** 로 박혔다. 눈으로는 `/export const spec\b/` 와 똑같이 보이는데,
 * 실제로는 `spec` 다음에 제어문자가 붙은 다른 정규식이라 **아무 것도 매칭되지 않는다.**
 * 그 결과: 새로 넣은 검사가 「전부 통과」라고 말하면서 실은 하나도 안 보고 있었다.
 *
 * 이런 글자는 **어떤 소스에도 있을 이유가 없다.** 있으면 사고다. 그래서 여기서 센다.
 * 눈으로는 절대 못 잡으므로, 이건 사람이 아니라 기계가 볼 일이다.
 *
 * 사용: node scripts/audit-control-chars.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* 소스만 본다. 만들어진 것·남의 것은 우리가 고칠 자리가 아니다. */
/* 볼 폴더는 인자로 늘릴 수 있다 — 같은 저장소의 packages/ 도 같은 사고를 겪었는데
   이 검사가 karmolab 안만 보고 있었다(companion 의 정규식 한 갈래가 죽어 있었다). */
const DIRS = process.argv.length > 2 ? process.argv.slice(2) : ['src', 'scripts', '../../packages'];
const EXT = new Set(['.ts', '.mjs', '.js', '.json']);
/* dist 는 지어진 것이라 원본을 고치면 따라 바뀐다 — 여기서 잡으면 원본이 아니라 산출물을 고치게 된다. */
const SKIP = /node_modules|[\\/]vendor[\\/]|[\\/]dist[\\/]|\.generated\./;

/**
 * **절대 정상일 수 없는 것만** 본다.
 *
 * 처음엔 C0 전부를 잡았다가 되돌렸다 —  은 `git log --format=…%x01…` 의 칸 구분자로
 * 일부러 쓰이고 있었다(build-devlog·gen-tool-pages). 멀쩡한 것을 빨갛게 만들면 그 검사는
 * 곧 무시되고, 무시되는 검사는 없는 검사다.
 *
 * NUL 도 뺐다 — community-markdown 이 코드블록 자리표시자로 쓰고 있었다. 같은 이유다.
 * 남긴 것: 백스페이스 · 수직탭 · 폼피드 · ESC · DEL. **어디에도 쓸 자리가 없는 것들만.**
 */
/* 별 **NUL(0x00) 도 센다** (2026-08-17 실측). 여태 빠져 있었고, 그 틈으로 src 에 진짜 NUL 이
   열 군데 박혀 있었다 — 전부 「사람 글에 안 나올 표식」으로 일부러 쓴 것이라 돌기는 했지만
   눈에 안 보였다. 뜻이 같은 이스케이프(역슬래시+0)로 적으면 보인다. 그래서 진짜 글자는 막는다.
   같은 날 memo 쪽에서 이 부류가 검사 하나를 통째로 죽여 놨다 — 정규식이 14건을 0건으로 읽었다. */
const BAD = new RegExp('[\u0000\u0008\u000B\u000C\u001B\u007F]');

const names = {
  8: '백스페이스(\\b 를 글자로 박은 것)',
  0: 'NUL',
  0: 'NUL(널 문자 — 뜻이 같은 이스케이프로 적어라)',
  12: '폼피드',
  27: 'ESC'
};

const hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP.test(full)) continue;
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (EXT.has(path.extname(entry.name)) === false) continue;
    const body = fs.readFileSync(full, 'utf8');
    if (BAD.test(body) === false) continue;
    body.split('\n').forEach((line, i) => {
      const m = BAD.exec(line);
      if (m === null) return;
      const code = m[0].charCodeAt(0);
      hits.push(
        `${path.relative(root, full)}:${i + 1} — ${names[code] ?? `제어문자 0x${code.toString(16)}`}` +
          `  …${line.slice(Math.max(0, m.index - 24), m.index + 12).replace(BAD, '?')}…`
      );
    });
  }
}

for (const d of DIRS) {
  const full = path.join(root, d);
  if (fs.existsSync(full)) walk(full);
}

if (hits.length > 0) {
  console.error(`[control-chars] 소스에 보이지 않는 글자가 ${hits.length}군데 박혀 있다:`);
  for (const h of hits) console.error('  - ' + h);
  console.error('  대개 스크립트로 파일을 고치다 `\\b`·`\\n` 이 진짜 글자로 박힌 것이다 — 그 자리는 조용히 안 돈다.');
  process.exit(1);
}

console.log('[control-chars] src·scripts 에 보이지 않는 글자 없음');
