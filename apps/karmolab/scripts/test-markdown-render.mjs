/**
 * lib/markdown 렌더러 시험 (TASK-KL-354).
 *
 * 지키는 것: **user 신뢰에서 위험한 출력이 아예 안 만들어진다** — 이 모듈은 후처리 새니타이저가
 * 없으므로, 이 시험이 빨간데 배포되면 커뮤니티에 스크립트가 실린다. 그래서 XSS 항목은 전부
 * 「없어야 한다」로 적는다. 브라우저 없이 도는 이유: 렌더러가 환경을 안 타게 지어졌기 때문이고,
 * 그 성질 자체도 여기서 깨지면 잡힌다 (Node 에서 import 만 해도 죽는 코드가 못 들어온다).
 *
 * 사용: npm run test:markdown
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** vendor marked(UMD) — 브라우저 전역용이라 Node 에선 exports 를 직접 만들어 평가한다. */
function loadMarked() {
    const code = fs.readFileSync(path.join(ROOT, 'js', 'vendor', 'marked.min.js'), 'utf8');
    const exports = {};
    new Function('exports', 'module', code)(exports, { exports });
    return exports;
}

/** 렌더러(TS)를 그 자리에서 묶어 불러온다 — 빌드 산출물 순서에 안 얽매인다. */
async function loadRenderer() {
    return loadTs('render.ts');
}

/** 앞머리(front matter) 모듈 — 블로그 글과 커뮤니티 글이 같이 쓰는 그 한 벌. */
async function loadFrontMatter() {
    return loadTs('frontmatter.ts');
}

async function loadTs(file) {
    const bundled = esbuild.buildSync({
        entryPoints: [path.join(ROOT, 'src', 'lib', 'markdown', file)],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'neutral',
        target: ['es2020'],
    });
    const url = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
    return import(url);
}

const marked = loadMarked();
const { renderMarkdown } = await loadRenderer();
const self_ = (md) => renderMarkdown(md, { trust: 'self', marked });
const user = (md) => renderMarkdown(md, { trust: 'user', marked });

let failed = 0;
function check(name, ok, got) {
    if (ok) return;
    failed += 1;
    console.error(`✘ ${name}\n  받은 것: ${String(got).slice(0, 200)}`);
}

// ── 기본기 — 표·코드·제목이 표준대로 나온다 (커뮤니티 개선점: 표가 이제 그려진다)
{
    const html = self_('# 제목\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n`code`');
    check('제목', html.includes('<h1>제목</h1>'), html);
    check('표', html.includes('<table>') && html.includes('<td>1</td>'), html);
    check('인라인 코드', html.includes('<code>code</code>'), html);
}

// ── 우리 문법 ① 유튜브 주소 한 줄 → 카드 (iframe 은 안 실린다)
{
    const html = self_('앞 문단\n\nhttps://youtu.be/8vDDJm5EewM\n\n뒤 문단');
    check('유튜브 카드', html.includes('class="md-yt"') && html.includes('data-yt="8vDDJm5EewM"'), html);
    check('유튜브 iframe 없음', !html.includes('<iframe'), html);
    const inline = self_('글 속 https://youtu.be/8vDDJm5EewM 링크는 카드가 아니다');
    check('문장 속 주소는 카드 아님', !inline.includes('md-yt'), inline);
}

// ── 우리 문법 ② mermaid → KarmoGraph 가 그릴 div (원문은 escape)
{
    const html = self_('```mermaid\ngraph TD\nA-->B\n```');
    check('mermaid div', html.includes('<div class="mermaid">'), html);
    check('mermaid escape', html.includes('A--&gt;B'), html);
}

// ── 우리 문법 ③ callout — 신뢰 무관 같은 모양
{
    for (const render of [self_, user]) {
        const html = render('> [!WARNING]\n> 조심해라');
        check('callout 클래스', html.includes('md-callout-warning'), html);
        check('callout 본문', html.includes('조심해라'), html);
        check('callout 마커 제거', !html.includes('[!WARNING]'), html);
    }
}

// ── user 신뢰 — 위험한 것이 만들어지지 않는다 (이 블록이 이 시험의 존재 이유)
{
    const script = user('안녕 <script>alert(1)</script> 세상');
    check('script 태그 무력화', !/<script/.test(script), script);
    const js = user('[누르지 마](javascript:alert(1))');
    check('javascript: 링크 제거', !/href/.test(js) && js.includes('누르지 마'), js);
    const dataImg = user('![x](data:text/html;base64,PHNjcmlwdD4)');
    check('data: 이미지 제거', !/<img/.test(dataImg), dataImg);
    const onerr = user('<img src=x onerror=alert(1)>');
    check('원문 HTML escape', !/<img/.test(onerr), onerr);
    const ext = user('[집](https://example.com)');
    check('바깥 링크 rel', ext.includes('rel="noopener noreferrer"'), ext);
    const inner = user('[도구](/t/qrgen/)');
    check('안쪽 링크 유지', inner.includes('href="/t/qrgen/"'), inner);
}

// ── self 신뢰 — 내 글은 전 기능 (원문 HTML 이 산다)
{
    const html = self_('<kbd>Ctrl</kbd> 를 눌러라');
    check('self 원문 HTML 유지', html.includes('<kbd>Ctrl</kbd>'), html);
}

// ── 앞머리(front matter) — 글 설정은 한 문법, 그리고 본문으로 새지 않는다
{
    const { splitFrontMatter, coverImage, coverAttrs } = await loadFrontMatter();

    const withHead = splitFrontMatter('---\nimage: /assets/img/a.jpg\ntitle: "따옴표"\n---\n\n본문 첫 줄\n');
    check('앞머리를 읽는다', coverImage(withHead.meta) === '/assets/img/a.jpg', JSON.stringify(withHead.meta));
    check('따옴표를 벗긴다', withHead.meta.title === '따옴표', withHead.meta.title);
    check('본문에 앞머리가 안 남는다', withHead.body.trim() === '본문 첫 줄', JSON.stringify(withHead.body));

    const plain = splitFrontMatter('그냥 글\n---\n가운데 구분선은 앞머리가 아니다');
    check('앞머리 없으면 원문 그대로', plain.body.startsWith('그냥 글') && !plain.meta.image, JSON.stringify(plain.meta));

    check('그림 없으면 속성도 없다', coverAttrs(null) === '', coverAttrs(null));
    const evil = coverImage(splitFrontMatter('---\nimage: javascript:alert(1)\n---\n').meta);
    check('수상한 주소는 표지가 아니다', evil === null, String(evil));

    // 표지 주소가 style 속성을 벗어나 다른 규칙을 심지 못한다.
    const quoteOut = coverAttrs("/a');background:url(x");
    check('주소가 style 속성을 못 벗어난다', !quoteOut.includes("');"), quoteOut);
}

if (failed) {
    console.error(`[test-markdown] ✘ ${failed}개 실패`);
    process.exit(1);
}
console.log('[test-markdown] 전부 통과 — user 신뢰에서 script/javascript:/data: 전부 무력, 표·카드·callout 정상');
