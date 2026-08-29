/**
 * 새 판이 사람에게 닿는 길이 살아 있는가 (2026-08-29).
 *
 * 그날 있었던 일: 데스크톱 앱이 옛 화면을 계속 그렸다. 코드도 배포도 멀쩡했고, 앱만 옛
 * 사본을 붙들고 있었다. 원인 둘. 앱에서는 갱신 흐름이 통째로 꺼져 있었고, 브라우저에서는
 * 배너 글자를 되받을 글 없이 불러, 번역 파일이 늦으면 t() 가 던지고 그 오류는 등록 실패로 삼켜짐
 *
 * 브라우저 없이 소스로 확인. 막는 것은 그 두 자리의 재발
 *
 * 사용: node scripts/test-pwa-update.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = await readFile(fileURLToPath(new URL('../src/pwa-update.ts', import.meta.url)), 'utf8');

// 앱이라고 갱신 흐름을 통째로 끄면 옛 판 고착
assert.ok(
    !/__KARMOLAB_DESKTOP__\)\s*return;/.test(source),
    '데스크톱에서 갱신 흐름이 통째로 꺼졌다. 앱은 새 판을 영영 못 받는다',
);
assert.ok(/const silent = !!window\.__KARMOLAB_DESKTOP__/.test(source), '앱과 브라우저를 가르는 표시가 없다');

// 앱에서는 묻지 않고 바로 적용
const silentBlock = source.slice(source.indexOf('if (silent)'), source.indexOf('showBanner(apply)'));
assert.ok(silentBlock.includes('apply()'), '앱 갈래가 새 판을 적용하지 않는다');
assert.ok(!silentBlock.includes('showBanner'), '앱 갈래가 배너를 띄운다. 앱에는 누를 자리를 못 찾는다');

// 갈아 끼운 뒤 화면도 새로. 단 최초 설치는 제외
assert.ok(source.includes("addEventListener('controllerchange'"), '새 SW 가 자리 잡아도 화면을 다시 안 그린다');
assert.ok(/if \(!hadController \|\| reloading\) return;/.test(source), '최초 설치에서도 새로고침한다. 처음 온 사람 화면이 깜빡인다');

/* 이 파일의 말은 전부 되받을 글을 들어야 한다. 셸이라 아무도 묶음을 챙겨 주지 않고,
   묶음이 늦은 판에서 t() 가 던지면 배너가 통째로 사라진다 (그날의 두 번째 원인) */
const bare = [...source.matchAll(/\bt\('([^']+)'\s*\)/g)].map((m) => m[1]);
assert.deepEqual(bare, [], `되받을 글 없는 말: ${bare.join(', ')}`);

console.log('[pwa-update] 앱은 조용히 갈아 끼우고, 브라우저는 묻고, 말은 묶음 없이도 뜬다');
