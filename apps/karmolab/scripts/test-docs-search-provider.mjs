import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
const built = await esbuild.build({ entryPoints: [fileURLToPath(new URL('../src/search/providers/docs-provider.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false });
const docsModule = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const catalog = JSON.parse(await readFile(new URL('../data/docs-search-index.ko.json', import.meta.url), 'utf8'));
const documents = docsModule.docsDocuments(catalog);
assert.equal(documents.length, catalog.documents.length, '생성 색인 전체가 검색 문서가 된다');
assert.ok(documents.length > 90, '문서 제목을 충분히 포함한다');
const command = documents.find((document) => document.value.id === 'docs-project-commands:0');
assert.ok(command, '프로젝트 명령 문서를 찾는다');
assert.match(command.title, /통합 명령/, '제목 계약');
assert.equal(docsModule.createDocsProvider(catalog).id, 'docs', '공급자 id 계약');
console.log(`docs search provider: ${documents.length} documents, 5 assertions passed`);
