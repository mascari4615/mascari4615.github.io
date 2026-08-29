/**
 * 먹 이모트 규격 검사
 *
 * 규격이 틀리면 사람은 업로드가 거절된 뒤에야 안다. 그 거리를 여기서 없앰.
 * 값의 출처는 `memo/projects/karmolab/reference/그림도구-시장-해체.md` (2026-08-29 확인).
 * 사용: node scripts/test-meok-emote.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const dir = path.resolve('src/widgets/meok');
const source = fs.readFileSync(path.join(dir, 'emote.ts'), 'utf8');
assert.ok(!/\bdocument\.|\bwindow\./.test(source), 'emote.ts 가 document 나 window 를 쓴다');

const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const module = { exports: {} };
vm.runInNewContext('(function(exports,module,require){' + compiled + '\n})(module.exports,module,require);',
  { module, require: () => ({}), console, Math, Array, Object, String, Number, Boolean, Error });
const { EMOTE_PRESETS, findPreset, fitBox, emoteName, limitRatio, overBudgetHint } = module.exports;

/* vm 안에서 만들어진 값은 프로토타입이 여기 것과 다르다. 값만 본다. */
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

/* ① 실제 규격. 하나라도 틀리면 올리기가 막힌다. */
const twitch = findPreset('twitch');
same(twitch.sizes, [112, 56, 28], 'Twitch 크기 세 가지');
assert.equal(twitch.limitAnimated, 1000 * 1024, 'Twitch 1MB');
assert.equal(twitch.animated, 'gif');

const emoji = findPreset('discord-emoji');
same(emoji.sizes, [128]);
assert.equal(emoji.limitAnimated, 256 * 1024, 'Discord 이모지 애니 256KB');

const sticker = findPreset('discord-sticker');
same(sticker.sizes, [320]);
assert.equal(sticker.limitAnimated, 512 * 1024, 'Discord 스티커 512KB');
assert.equal(sticker.animated, 'apng', '스티커는 APNG 만 받는다');

const seventv = findPreset('seventv');
same(seventv.sizes, [256, 128]);
assert.equal(seventv.limitAnimated, 2500 * 1024, '7TV 2.5MB');

/* ② 없는 이름은 첫 규격으로 떨어진다. 화면이 빈 손을 쥐지 않게. */
assert.equal(findPreset('없는것').id, EMOTE_PRESETS[0].id);

/* ③ 크기 맞추기. 긴 변을 맞추고 짧은 쪽은 비율대로. 잘라 내지 않는다. */
same(fitBox(1024, 1024, 112), { w: 112, h: 112 }, '정사각');
same(fitBox(1000, 500, 100), { w: 100, h: 50 }, '가로가 긴 그림');
same(fitBox(500, 1000, 100), { w: 50, h: 100 }, '세로가 긴 그림');
same(fitBox(3, 1, 128), { w: 128, h: 43 }, '납작해도 한 픽셀은 남는다');
same(fitBox(0, 0, 64), { w: 1, h: 1 }, '빈 그림도 안 죽는다');

/* ④ 이름. 크기가 여럿이면 크기를 붙이고 하나면 안 붙인다. APNG 는 확장자가 png. */
assert.equal(emoteName('웃음', 112, 'gif', 3), '웃음-112.gif');
assert.equal(emoteName('웃음', 128, 'png', 1), '웃음.png');
assert.equal(emoteName('웃음', 320, 'apng', 1), '웃음.png', 'APNG 의 확장자는 png');

/* ⑤ 한도. 넘었나 아닌가와, 넘었으면 무엇을 줄이나. */
assert.ok(limitRatio(200 * 1024, emoji, true) < 1, '200KB 는 이모지 한도 안');
assert.ok(limitRatio(300 * 1024, emoji, true) > 1, '300KB 는 이모지 한도 밖');
assert.equal(overBudgetHint(200 * 1024, 12, emoji, true), '', '한도 안이면 말이 없다');

const hint = overBudgetHint(512 * 1024, 12, emoji, true);
assert.match(hint, /장을 12에서 6 로 줄여/, '두 배 넘으면 장수도 절반 (' + hint + ')');
assert.match(overBudgetHint(512 * 1024, 3, emoji, true), /장을 3에서 2 로/, '적은 장수는 둘까지만 내린다');
assert.match(overBudgetHint(512 * 1024, 1, emoji, false), /색을 줄여/, '멈춘 그림은 색 이야기');

console.log('[test-meok-emote] ✓ 규격 네 가지(크기, 한도, 형식), 크기 맞추기, 파일 이름, 한도 넘음 안내');
