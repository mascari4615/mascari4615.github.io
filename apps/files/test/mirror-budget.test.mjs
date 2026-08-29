import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    budgetLine,
    budgetState,
    capFromEnv,
    makeBudget,
    measureRemote,
    monthlyUsd
} from '../src/mirror-budget.mjs';

const GB = 1024 * 1024 * 1024;

test('무료 몫 아래는 0원', () => {
    assert.equal(monthlyUsd(0), 0);
    assert.equal(monthlyUsd(9 * GB), 0);
    assert.equal(monthlyUsd(10 * GB), 0);
});

test('무료 몫 위만 값을 매긴다', () => {
    /* 백필이 끝난 규모 16.4GB 가 월 $0.10 인지 */
    assert.equal(monthlyUsd(16.4 * GB), 0.1);
    assert.equal(monthlyUsd(25 * GB), 0.22);
});

test('상한 대비 등급 셋', () => {
    assert.equal(budgetState(5 * GB, 25).level, 'ok');
    assert.equal(budgetState(20 * GB, 25).level, 'warn');
    assert.equal(budgetState(25 * GB, 25).level, 'stop');
});

test('상한을 넘는 순간 그 뒤로는 다 막는다', () => {
    /* 한 번 멈추면 그 판에서는 안 되돌린다. 작은 청크가 새어 들어가는 것 방지 */
    const b = makeBudget(24 * GB, 25);
    assert.equal(b.allow(0.5 * GB), true);
    assert.equal(b.allow(GB), false);
    assert.equal(b.allow(1), false);
    assert.equal(b.stopped, true);
});

test('env 로 상한을 바꾼다. 이상한 값은 기본으로', () => {
    assert.equal(capFromEnv({ FILES_VAULT_R2_MAX_GB: '40' }), 40);
    assert.equal(capFromEnv({ FILES_VAULT_R2_MAX_GB: '0' }), 25);
    assert.equal(capFromEnv({}), 25);
});

test('사람이 읽는 줄에 멈춤 사유가 있다', () => {
    assert.match(budgetLine(budgetState(26 * GB, 25)), /상한 넘음/);
    assert.match(budgetLine(budgetState(21 * GB, 25)), /80%/);
    assert.match(budgetLine(budgetState(GB, 25)), /1\.00 GB \/ 25\.00 GB/);
});

test('총량을 못 재면 null. 모른다고 막지는 않는다', async () => {
    const ok = await measureRemote('r2:x', async () => JSON.stringify({ bytes: 1234 }));
    assert.equal(ok, 1234);
    const bad = await measureRemote('r2:x', async () => {
        throw new Error('rclone 없음');
    });
    assert.equal(bad, null);
});
