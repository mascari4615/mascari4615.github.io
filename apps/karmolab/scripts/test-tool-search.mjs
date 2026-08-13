import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const built = await esbuild.build({
  entryPoints: [fileURLToPath(new URL('../src/search/search-system.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const source = built.outputFiles[0].text;
const search = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const aliases = JSON.parse(await readFile(new URL('../data/tool-aliases.json', import.meta.url), 'utf8')).aliases;

const tools = [
  { id: 'image', title: '이미지 도구', description: '이미지 편집과 형식 변환', aliases: String(aliases.image), initials: 'ㅇㅁㅈㄷㄱ' },
  { id: 'imgresize', title: '이미지 크기 조절', description: '가로세로 크기를 변경', aliases: String(aliases.imgresize), initials: 'ㅇㅁㅈㅋㄱㅈㅈ' },
  { id: 'pdfmerge', title: 'PDF 합치기', description: 'PDF 파일 병합', aliases: 'pdf merge 문서 합치기', initials: 'pdfㅎㅊㄱ' },
];
const system = search.createSearchSystem(tools.map((tool) => ({ ...tool, value: tool })));

function ranked(query) {
  return tools.map((tool) => ({ tool, hit: search.scoreSearchableTool(tool, query) }))
    .filter((item) => item.hit).sort((a, b) => b.hit.score - a.hit.score).map((item) => item.tool.id);
}

assert.equal(ranked('이미지 압축')[0], 'image', '자연어 의도 검색');
assert.equal(ranked('사진 용량 줄이기')[0], 'image', '여러 단어 별칭 검색');
assert.equal(ranked('사진 형식 바꾸기')[0], 'image', '사용 목적 표현 검색');
assert.equal(ranked('이미지-압축')[0], 'image', '구두점 정규화');
assert.equal(ranked('ㅇㅁㅈㄷㄱ')[0], 'image', '초성 검색');
assert.equal(ranked('PDF 합치키')[0], 'pdfmerge', '한 글자 오타');
assert.deepEqual(ranked('이미지 존재하지않는말'), [], '단어 하나만 맞는 과다 검색 방지');
assert.equal(search.englishKeysToKorean('dlalwl dkqcnr'), '이미지 압축', '영문 자판 한글 복원');
assert.equal(ranked('dlalwl dkqcnr')[0], 'image', '영문 자판으로 한글 의도 검색');
assert.equal(search.englishKeysToKorean('rhkf rkqt Rk'), '괄 값 까', '복합 모음·겹받침·쌍자음');
assert.equal(ranked('image')[0], 'image', '정상 영문 검색 보존');
assert.equal(system.size(), 3, '검색 문서 등록');
assert.equal(system.search('dlalwl dkqcnr', 1)[0].value.id, 'image', '시스템 질의와 결과 제한');
assert.equal(system.search('dlalwl dkqcnr', 1)[0].reason, 'keyboard', '매칭 사유 제공');
system.replace([{ ...tools[2], value: tools[2] }]);
assert.deepEqual(system.search('이미지'), [], '색인 전체 교체');

console.log('tool search: 15 assertions passed');
