import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const docsDir = path.join(root, 'js', 'widgets', 'docs');
const ids = {
  'intro.md': 'docs-intro', 'roadmap.md': 'docs-roadmap', 'guide.md': 'docs-guide',
  'karmolab-ai.md': 'docs-karmolab-ai', 'discord-yawnbot.md': 'docs-discord-yawnbot',
  'project-commands-guide.md': 'docs-project-commands', 'laptop.md': 'docs-laptop',
  'local-dev-runner.md': 'docs-local-dev', 'servermonitor-deploy-log-stream.md': 'docs-servermonitor-deploy-log-design',
};
const documents = [];
for (const [file, docId] of Object.entries(ids)) {
  const markdown = fs.readFileSync(path.join(docsDir, file), 'utf8');
  const headings = [...markdown.matchAll(/^(#{1,4})\s+(.+)$/gm)];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i][2].replace(/[*_`]/g, '').trim();
    const start = (headings[i].index || 0) + headings[i][0].length;
    const end = headings[i + 1]?.index ?? markdown.length;
    const prose = markdown.slice(start, end).replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|\[\]()]/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
    documents.push({ id: `${docId}:${i}`, docId, heading, title: heading, description: prose.slice(0, 320), aliases: file.replace(/\.md$/, '').replace(/-/g, ' ') });
  }
}
fs.writeFileSync(path.join(root, 'data', 'docs-search-index.ko.json'),
  JSON.stringify({ $comment: '자동 생성 — gen-doc-search-index.mjs. 문서 위젯 통합 검색 색인.', documents }, null, 2) + '\n');
console.log(`[doc-search-index] 문서 ${Object.keys(ids).length}개 · 제목 ${documents.length}개`);
