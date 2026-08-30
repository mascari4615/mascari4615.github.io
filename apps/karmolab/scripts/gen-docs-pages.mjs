/**
 * 문서의 정적 장 찍기 (change.post-model 03).
 *
 * 왜 있나: 문서 게시판은 화면이 스크립트로 그린다. 검색엔진은 그 화면을 못 읽어 문서 15편이
 * 하나도 색인되지 않던 자리. 커뮤니티 글의 `/c/<글id>/` 와 같은 규약
 *
 * 주소는 `/c/docs/<문서id>/`. 사람이 오면 문서 게시판으로 이어 주기,
 * 크롤러에게는 본문 그대로
 *
 * 원본 둘:
 *  - `data/docs/*.md` 앱 문서
 *  - `world/wiki/manifest.json` 세계관 (`sync-wiki.mjs` 산출)
 *
 * 저장소 README(GitHub raw)는 제외. 남의 자리 글을 우리 주소로 복제 금지
 *
 * 사용: node scripts/gen-docs-pages.mjs [--out ../blog/c/docs]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMarked, loadMarkdownLib } from './lib/markdown-node.mjs';
import { CSP_META } from './lib/head-security.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://blog.mascari4615.com';

const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(root, '..', 'blog', 'c', 'docs');

/** 앱 문서. id 는 화면(`community-docs.ts`)이 쓰는 것과 같아야 이어 주기가 산다 */
const APP_DOCS = [
    { id: 'docs-intro', file: 'intro.md', label: '소개' },
    { id: 'docs-roadmap', file: 'roadmap.md', label: '로드맵' },
    { id: 'docs-guide', file: 'guide.md', label: '가이드' },
    { id: 'docs-karmo-ai', file: 'karmo-ai.md', label: 'KarmoLabAI' },
    { id: 'docs-discord-yawnbot', file: 'discord-yawnbot.md', label: 'Discord, 욘봇' },
    { id: 'docs-project-commands', file: 'project-commands-guide.md', label: '프로젝트 명령' },
    { id: 'docs-laptop', file: 'laptop.md', label: '노트북' },
    { id: 'docs-local-dev', file: 'local-dev-runner.md', label: '데스크톱, 로컬' },
    { id: 'docs-servermonitor-deploy-log-design', file: 'servermonitor-deploy-log-stream.md', label: '로컬, deploy 로그' },
];

const escapeHtml = (value) =>
    String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 본문에서 설명 한 줄. 앞머리와 서식 기호는 걷어낸다 */
function summarize(markdown, max = 150) {
    const text = markdown
        .replace(/^---\n[\s\S]*?\n---\n/, '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[*_`>|[\]()#]/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

function page({ id, title, description, bodyHtml, group }) {
    const appUrl = `/?board=docs&d=${encodeURIComponent(id)}#community`;
    const canonical = `${SITE}/c/docs/${id}/`;
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${CSP_META}
<title>${escapeHtml(title)} | KarmoLab 문서</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<style>
  body { background:#171821; color:#e8e8ea; font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
    line-height:1.75; margin:0; padding:40px 20px; }
  main { max-width:760px; margin:0 auto; }
  a { color:#b9a2ff; }
  h1 { font-size:24px; line-height:1.4; margin:0 0 8px; }
  h2 { font-size:19px; margin:28px 0 10px; color:#b9a2ff; }
  h3 { font-size:16px; margin:22px 0 8px; }
  .meta { font-size:13px; color:#a0a4b4; margin-bottom:22px; }
  pre { background:#22232e; padding:14px; border-radius:8px; overflow-x:auto; }
  code { background:#22232e; padding:2px 5px; border-radius:4px; }
  pre code { background:none; padding:0; }
  table { border-collapse:collapse; width:100%; }
  th, td { border:1px solid #33343f; padding:7px 10px; text-align:left; }
  blockquote { border-left:3px solid #b9a2ff; margin:0; padding:8px 14px; background:rgba(185,162,255,.08); }
  img { max-width:100%; }
  .go { display:inline-block; margin-top:26px; padding:9px 16px; border:1px solid #b9a2ff;
    border-radius:8px; color:#b9a2ff; text-decoration:none; }
</style>
</head>
<body>
  <main>
    <p class="meta"><a href="/">KarmoLab</a>, <a href="/?board=docs#community">문서</a>, ${escapeHtml(group)}</p>
    <h1>${escapeHtml(title)}</h1>
    <div class="body">${bodyHtml}</div>
    <a class="go" href="${appUrl}">앱에서 이어서 보기</a>
  </main>
  <!-- 사람이 오면 실제 화면으로 보낸다. 크롤러는 위 본문을 이미 읽었다.
       바로 안 보내는 이유: 뒤로 가기가 무한 반복되지 않게. -->
  <script>
    if (!location.hash && document.referrer.indexOf(location.host) === -1) {
      setTimeout(function () { location.replace(${JSON.stringify(appUrl)}); }, 1200);
    }
  </script>
</body>
</html>
`;
}

async function main() {
    const marked = loadMarked();
    const { renderMarkdown } = await loadMarkdownLib();
    fs.mkdirSync(OUT, { recursive: true });

    const written = [];

    for (const doc of APP_DOCS) {
        const file = path.join(root, 'data', 'docs', doc.file);
        if (!fs.existsSync(file)) {
            console.log(`[gen-docs-pages] 없는 문서 건너뜀: ${doc.file}`);
            continue;
        }
        const markdown = fs.readFileSync(file, 'utf8');
        const html = renderMarkdown(markdown, { trust: 'self', marked, breaks: true });
        const dir = path.join(OUT, doc.id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'index.html'),
            page({ id: doc.id, title: doc.label, description: summarize(markdown), bodyHtml: html, group: 'KarmoLab' }),
        );
        written.push(doc.id);
    }

    // 세계관은 manifest 를 걸어서. 갈래가 늘어도 이 스크립트는 그대로
    const manifestPath = path.join(root, 'world', 'wiki', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        for (const [key, items] of Object.entries(manifest)) {
            if (!Array.isArray(items)) continue;
            for (const item of items) {
                const file = path.join(root, 'world', 'wiki', 'entities', key, `${item.slug}.md`);
                if (!fs.existsSync(file)) continue;
                const markdown = fs.readFileSync(file, 'utf8');
                const html = renderMarkdown(markdown, { trust: 'self', marked, breaks: true });
                const id = `wiki-${key}-${item.slug}`;
                const dir = path.join(OUT, id);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(
                    path.join(dir, 'index.html'),
                    page({
                        id,
                        title: item.title || item.slug,
                        description: item.oneLine || summarize(markdown),
                        bodyHtml: html,
                        group: key,
                    }),
                );
                written.push(id);
            }
        }
    }

    console.log(`[gen-docs-pages] ${written.length}장 찍음 -> ${path.relative(root, OUT)}`);
    if (written.length === 0) process.exitCode = 1;
}

await main();
