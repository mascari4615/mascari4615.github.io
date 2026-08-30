/**
 * 앱 뿌리 값이 **두 벌로 갈라지지 않는지** 본다.
 *
 * 주소를 만드는 자리는 앱(`src/lib/site-base.ts`)과 생성기(`scripts/lib/site-base.mjs`)
 * 둘로 나뉜다. 값이 어긋나면 앱은 새 주소를 부르는데 장은 옛 주소로 찍혀 404 가 된다 . 
 * 그 어긋남은 배포 뒤에야 보인다. 그래서 여기서 먼저 세운다 (change.karmolab-at-root ①).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_BASE, NON_APP_PREFIXES, appPath, toolPage, appHash, appUrl, isAppPath } from './lib/site-base.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tsSrc = fs.readFileSync(path.join(HERE, '..', 'src', 'lib', 'site-base.ts'), 'utf8');
const tsBase = /export const APP_BASE = '([^']+)'/.exec(tsSrc)?.[1];

assert.equal(tsBase, APP_BASE, `앱(${tsBase}) 과 생성기(${APP_BASE}) 의 뿌리가 다르다`);
assert.ok(APP_BASE.startsWith('/') && APP_BASE.endsWith('/'), '뿌리는 / 로 시작하고 / 로 끝난다');

assert.equal(appPath(), APP_BASE);
assert.equal(appPath('t/qr/'), `${APP_BASE}t/qr/`);
assert.equal(appPath('/t/qr/'), `${APP_BASE}t/qr/`, '앞의 / 는 겹치지 않는다');
assert.equal(toolPage('qr'), `${APP_BASE}t/qr/`);
assert.equal(appHash('higher'), `${APP_BASE}#higher`);
assert.equal(appUrl('t/qr/'), `https://blog.mascari4615.com${APP_BASE}t/qr/`);

/* toolbox.ts 는 묶지 않고 나가므로 import 를 못 쓴다. 값은 빌드가 박고(`__KARMOLAB_APP_BASE__`),
   소스에는 되돌림 값만 있다. 그 되돌림이 낡으면 로컬에서만 옛 주소로 도는 유령이 된다. */
const toolboxSrc = fs.readFileSync(path.join(HERE, '..', 'src', 'toolbox.ts'), 'utf8');
const fallback = /__KARMOLAB_APP_BASE__ === 'string' \? __KARMOLAB_APP_BASE__ : '([^']+)'/.exec(toolboxSrc)?.[1];
assert.equal(fallback, APP_BASE, `toolbox.ts 되돌림(${fallback}) 이 정본(${APP_BASE}) 과 다르다`);

/* 빌드가 그 값을 실제로 박는지. define 이 빠지면 되돌림만 남아 조용히 옛 주소로 돈다. */
const buildSrc = fs.readFileSync(path.join(HERE, '..', 'build.mjs'), 'utf8');
assert.ok(buildSrc.includes('__KARMOLAB_APP_BASE__: JSON.stringify(APP_BASE)'), 'build.mjs 가 앱 뿌리를 안 박는다');

/* 앱 아닌 자리 목록도 두 벌이다. 갈라지면 뿌리 이관 뒤 글 장이 앱 껍데기로 덮인다. */
const tsList = /export const NON_APP_PREFIXES = \[([\s\S]*?)\];/.exec(tsSrc)?.[1] ?? '';
const tsPrefixes = [...tsList.matchAll(/'([^']+)'/g)].map((m) => m[1]);
assert.deepEqual(tsPrefixes, NON_APP_PREFIXES, '앱 아닌 자리 목록이 앱/생성기에서 다르다');

assert.ok(isAppPath(`${APP_BASE}t/qr/`), '도구 장은 앱 것이다');
for (const p of NON_APP_PREFIXES) {
    assert.equal(isAppPath(p), false, `${p} 는 앱이 아니다`);
}

console.log(`[test-site-base] ok. 뿌리 ${APP_BASE}, 앱/생성기/toolbox 일치, 앱 아닌 자리 ${NON_APP_PREFIXES.length}`);
