/**
 * 커뮤니티 글 서식 시험 (TASK-KL-098).
 *
 * 왜 있나: 이 코드는 **남이 쓴 글을 화면에 꽂는다.** 한 군데만 새면 남의 브라우저에서
 * 내 스크립트가 돈다. 그래서 「서식이 예쁘게 나오나」보다 **「위험한 것이 그대로 나가지 않나」**
 * 를 먼저 본다.
 *
 * 사용: node scripts/test-community-markdown.mjs
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'os';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// TS 를 그 자리에서 한 번 굽는다 — 위젯 번들은 iife 라 밖에서 못 부른다.
const tmp = path.join(os.tmpdir(), `kl-md-${Date.now()}.mjs`);
await esbuild.build({
  entryPoints: [path.join(root, 'src/widgets/community-markdown.ts')],
  outfile: tmp,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: ['es2020'],
  logLevel: 'silent',
});
const { renderMarkdown, plainPreview, escapeHtml } = await import(pathToFileURL(tmp).href);
fs.rmSync(tmp, { force: true });

let failed = 0;
function check(name, condition, detail = '') {
  if (condition) return;
  failed += 1;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

/* ── 위험한 것이 안 나가는가 (제일 중요) ───────────────────── */

const attack = '<script>alert(1)</script>';
check('스크립트 태그가 태그로 안 나간다', !renderMarkdown(attack).includes('<script'), renderMarkdown(attack));
check('꺾쇠가 글자로 나간다', renderMarkdown(attack).includes('&lt;script&gt;'));

const imgAttack = '<img src=x onerror=alert(1)>';
check('그림 태그도 글자로', !renderMarkdown(imgAttack).includes('<img'), renderMarkdown(imgAttack));

const jsLink = '[누르지 마](javascript:alert(1))';
check('javascript 주소는 링크가 안 된다', !renderMarkdown(jsLink).includes('<a href'), renderMarkdown(jsLink));

const dataLink = '[누르지 마](data:text/html,<script>alert(1)</script>)';
check('data 주소도 링크가 안 된다', !renderMarkdown(dataLink).includes('<a href'));

check('따옴표가 속성을 안 깬다', escapeHtml('a" onmouseover="x').includes('&quot;'));

/* ── 서식이 제대로 나오는가 ────────────────────────────────── */

check('굵게', renderMarkdown('**굵게**').includes('<strong>굵게</strong>'));
check('기울임', renderMarkdown('보통 *기울임*').includes('<em>기울임</em>'));
check('코드', renderMarkdown('`code`').includes('<code>code</code>'));
check('코드 안의 별표는 굵게가 아니다', renderMarkdown('`**x**`').includes('<code>**x**</code>'));
check('바깥 링크는 새 창', renderMarkdown('[집](https://example.com)').includes('rel="noopener noreferrer"'));
check('우리 주소는 같은 창', !renderMarkdown('[도구](/karmolab/t/qrgen/)').includes('target="_blank"'));
check('제목', renderMarkdown('## 제목').includes('<h4>제목</h4>'));
check('인용', renderMarkdown('> 인용문').includes('<blockquote>인용문</blockquote>'));
check('목록', renderMarkdown('- 하나\n- 둘').includes('<ul><li>하나</li><li>둘</li></ul>'));
check('번호 목록', renderMarkdown('1. 하나\n2. 둘').includes('<ol><li>하나</li>'));
check('가로줄', renderMarkdown('---').includes('<hr>'));
check('묶음 코드', renderMarkdown('```\nline\n```').includes('<pre><code>line</code></pre>'));
check('묶음 코드 안은 서식 안 먹는다', renderMarkdown('```\n**x**\n```').includes('**x**'));
check('빈 줄이 문단을 가른다', (renderMarkdown('가\n\n나').match(/<p>/g) || []).length === 2);
check('한 줄 바꿈은 줄바꿈', renderMarkdown('가\n나').includes('가<br>나'));

/* ── 목록 미리보기 ────────────────────────────────────────── */

check('미리보기는 기호를 걷어낸다', !plainPreview('**굵게** `코드`').includes('*'));
check('미리보기는 링크 글자만 남긴다', plainPreview('[이름](https://x.com)') === '이름');
check('미리보기는 길면 자른다', plainPreview('가'.repeat(200), 10).endsWith('…'));
check('빈 글도 안 터진다', plainPreview('') === '' && renderMarkdown('') === '');

if (failed) {
  console.error(`[test-community-markdown] 실패 ${failed}건`);
  process.exit(1);
}
console.log('[test-community-markdown] 서식·안전 검사 통과 (위험한 입력이 태그로 안 나간다)');

/* ── 그림 ─────────────────────────────────────────────── */

check('그림이 나온다', renderMarkdown('![고양이](https://x.com/a.png)').includes('<img src="https://x.com/a.png"'));
check('그림에 늦은 로딩', renderMarkdown('![a](https://x.com/a.png)').includes('loading="lazy"'));
check(
  '그림이 링크보다 먼저 잡힌다',
  !renderMarkdown('![a](https://x.com/a.png)').includes('<a href'),
  renderMarkdown('![a](https://x.com/a.png)'),
);
check('javascript 그림은 안 나온다', !renderMarkdown('![a](javascript:alert(1))').includes('<img'));
check('data 그림도 안 나온다', !renderMarkdown('![a](data:text/html,<script>x</script>)').includes('<img'));
check(
  '그림 설명에 따옴표가 들어가도 속성이 안 깨진다',
  !renderMarkdown('![a" onerror="alert(1)](https://x.com/a.png)').includes('onerror="alert'),
  renderMarkdown('![a" onerror="alert(1)](https://x.com/a.png)'),
);

if (failed) {
  console.error(`[test-community-markdown] 그림 검사 실패 ${failed}건`);
  process.exit(1);
}
console.log('[test-community-markdown] 그림 검사도 통과');
