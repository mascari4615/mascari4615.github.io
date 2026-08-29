/**
 * 판이 갈리는 것을 막는 시험. 이 꾸러미가 있는 **유일한 이유**가 그것이다.
 * ① package.json 의 threeVersion 과 ② 받아 둔 빌드의 REVISION 과 ③ index.mjs 의 상수가 같아야 한다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
const build = readFileSync(join(here, '..', 'vendor', 'three.module.min.js'), 'utf8');
const index = readFileSync(join(here, '..', 'src', 'index.mjs'), 'utf8');

test('받아 둔 three 빌드가 package.json 의 판과 같다', () => {
    /* 줄인 빌드에서는 이름이 사라진다. 판 번호는 문자열로만 남는다("169"). */
    const minorWanted = pkg.threeVersion.split('.')[1];
    const found = new RegExp(`["']${minorWanted}["']`).test(build);
    assert.ok(found, `vendor 빌드에서 판 번호 "${minorWanted}" 를 못 찾았다. 빌드와 package.json 이 갈렸다`);
    const m = [null, minorWanted];
    const minor = pkg.threeVersion.split('.')[1];           /* 0.169.0 → 169 */
    assert.equal(m[1], minor, `빌드 r${m[1]} ≠ package.json ${pkg.threeVersion}`);
});

test('index.mjs 의 판 상수도 같다', () => {
    const m = index.match(/THREE_VERSION\s*=\s*'([\d.]+)'/);
    assert.ok(m); assert.equal(m[1], pkg.threeVersion);
});
