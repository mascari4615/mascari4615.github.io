import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const built = await esbuild.build({ entryPoints: [fileURLToPath(new URL('../src/search/providers/studymap-provider.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false });
const providerModule = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const data = JSON.parse(await readFile(new URL('../data/studymap.json', import.meta.url), 'utf8'));
const documents = providerModule.studyMapDocuments(data);

assert.ok(documents.length > 100, 'StudyMap 전체 노드가 검색 문서가 된다');
assert.equal(new Set(documents.map((document) => document.id)).size, documents.length, '노드 id가 겹치지 않는다');
const mjs = documents.find((document) => document.value.nodeId === 'web-build');
assert.ok(mjs, 'web-build 학습 노드가 있다');
assert.match(mjs.title, /\.mjs/, '.mjs가 학습 제목에 드러난다');
assert.match(mjs.description, /ES 모듈/, '.mjs의 의미가 검색 설명에 들어간다');
assert.equal(providerModule.createStudyMapProvider(data).id, 'studymap', '공급자 id 계약');

console.log(`studymap search provider: ${documents.length} documents, 5 assertions passed`);
