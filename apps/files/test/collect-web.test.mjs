import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));

test('화면이 부르는 조각을 하나도 안 흘린다', async () => {
    /* 회귀 근거(2026-08-29): 배포가 조각을 손으로 나열해 옮기다 `src/gallery.mjs` 를 빠뜨려
       액자 보기가 통째로 404 였다. 목록을 사람이 기억하는 구조는 언젠가 진다. */
    const dir = await mkdtemp(join(tmpdir(), 'collect-web-'));
    try {
        execFileSync(process.execPath, [join(APP, 'scripts', 'collect-web.mjs'), dir], { encoding: 'utf8' });
        for (const rel of ['index.html', 'app.mjs', 'src/vault.mjs', 'src/vault-base.mjs', 'src/gallery.mjs']) {
            assert.ok(existsSync(join(dir, rel)), `${rel} 이 안 옮겨졌다`);
        }
        /* 서버 전용 조각은 화면이 안 부르므로 따라오지 않는다. 나가는 것이 적을수록 좋다. */
        const src = await readdir(join(dir, 'src'));
        for (const nope of ['upload.mjs', 'store-rclone.mjs', 'env-file.mjs', 'mirror-backfill.mjs']) {
            assert.ok(!src.includes(nope), `${nope} 은 나가면 안 된다`);
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
