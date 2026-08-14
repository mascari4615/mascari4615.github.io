import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const built = await esbuild.build({
  entryPoints: [fileURLToPath(new URL('../src/search/index.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const moduleSource = built.outputFiles[0].text;
const search = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
const quality = JSON.parse(await readFile(new URL('../data/search-quality.json', import.meta.url), 'utf8'));
const aliases = JSON.parse(await readFile(new URL('../data/tool-aliases.json', import.meta.url), 'utf8')).aliases;
const documents = quality.documents.map((document) => ({
  ...document,
  aliases: [document.aliases || '', String(aliases[document.aliasKey] || '')].join(' '),
  value: { id: document.id, title: document.title },
}));
const studyMap = JSON.parse(await readFile(new URL('../data/studymap.json', import.meta.url), 'utf8'));
const lessons = JSON.parse(await readFile(new URL('../data/lessons/search-index.ko.json', import.meta.url), 'utf8'));
const docs = JSON.parse(await readFile(new URL('../data/docs-search-index.ko.json', import.meta.url), 'utf8'));
const system = search.createSearchSystem();
system.register({ id: 'tools', documents: () => documents });
system.register(search.createStudyMapProvider(studyMap));
system.register(search.createLessonProvider(lessons));
system.register(search.createDocsProvider(docs));

for (const testCase of quality.cases) {
  const maxRank = testCase.maxRank || quality.defaultMaxRank || 1;
  const results = system.search(testCase.query, maxRank);
  const rank = results.findIndex((result) => result.value.id === testCase.first);
  assert.ok(rank >= 0, `${maxRank}위 안에 기대 결과 없음: ${testCase.query} → ${testCase.first}`);
  const result = results[rank];
  if (testCase.reason) assert.equal(result.reason, testCase.reason, `매칭 사유: ${testCase.query}`);
  assert.equal(result.providerId, testCase.provider, `공급자 출처: ${testCase.query}`);
}
for (const testCase of quality.reject) assert.deepEqual(system.search(testCase.query), [], `나오면 안 되는 결과: ${testCase.query}`);
console.log(`search quality: ${quality.cases.length + quality.reject.length} cases passed`);
