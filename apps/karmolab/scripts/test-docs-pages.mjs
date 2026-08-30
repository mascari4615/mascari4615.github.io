/**
 * 문서 정적 장이 실제로 찍히고, 크롤러가 읽을 본문이 그 안에 있는가 (change.post-model 03).
 *
 * 막는 것: 생성기가 조용히 0장을 내고 지나가는 것. 그러면 문서는 다시 검색에서 사라짐
 * 껍데기만 찍히는 것도 같은 고장이라 본문 글자까지 확인
 *
 * 사용: node scripts/test-docs-pages.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'karmolab-docs-pages-'));

try {
    execFileSync(process.execPath, [path.join(root, 'scripts', 'gen-docs-pages.mjs'), '--out', out], { stdio: 'pipe' });

    const ids = fs.readdirSync(out);
    assert.ok(ids.length >= 9, `문서 장이 너무 적다: ${ids.length}장`);
    assert.ok(ids.includes('docs-intro'), '소개 문서 장이 없다');
    assert.ok(ids.some((id) => id.startsWith('wiki-')), '세계관 장이 하나도 없다');

    const intro = fs.readFileSync(path.join(out, 'docs-intro', 'index.html'), 'utf8');
    assert.ok(intro.includes('<link rel="canonical"'), 'canonical 이 없다');
    assert.ok(intro.includes('board=docs&d=docs-intro'), '앱으로 이어 주는 주소가 없다');
    assert.ok(/<p>|<ul>|<h2/.test(intro), '본문이 안 그려졌다. 껍데기만 찍혔다');
    assert.ok(!intro.includes('<script>alert'), '본문에 스크립트가 샜다');

    console.log(`[docs-pages] ${ids.length}장, 본문과 canonical 과 이어 주기 확인`);
} finally {
    fs.rmSync(out, { recursive: true, force: true });
}
