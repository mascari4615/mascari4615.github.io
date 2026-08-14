import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const built = await esbuild.build({ entryPoints: [fileURLToPath(new URL('../src/search/providers/lesson-provider.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false });
const lessonModule = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const catalog = JSON.parse(await readFile(new URL('../data/lessons/search-index.ko.json', import.meta.url), 'utf8'));
const documents = lessonModule.lessonDocuments(catalog);

assert.equal(documents.length, catalog.documents.length, '생성 색인 전체가 검색 문서가 된다');
assert.ok(documents.length > 800, '모든 강의 장을 포함한다');
const password = documents.find((document) => document.value.id === 'sec-authn:2');
assert.ok(password, '인증 강의 2장을 찾는다');
assert.match(password.title, /비밀번호/, '장 제목을 검색 제목으로 쓴다');
assert.match(password.description || '', /저장/, '장 본문의 검색 요약을 포함한다');
assert.equal(lessonModule.createLessonProvider(catalog).id, 'lessons', '공급자 id 계약');

console.log(`lesson search provider: ${documents.length} documents, 6 assertions passed`);
