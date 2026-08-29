#!/usr/bin/env node
/**
 * 클라우드가 조용히 썩는 것 잡기.
 *
 * 왜 필요한가 (2026-08-28 실측):
 * - R2 의 `hdr` 30바이트가 딴 것으로 덮임. 맞는 비번으로도 아무것도 안 열림
 * - hdr 은 열쇠 재료. 소금이 다르면 열쇠가 딴 값으로 유도됨
 * - 화면이 안 열려야 알아챔. 그 전까지 신호 0
 *
 * 재는 것 넷:
 * 1. Drive 와 R2 의 `hdr` 일치. 다르면 그 자리에서 실패
 * 2. 화면 앞 문이 잠겼는가. 인증 없이 열리면 실패
 * 3. 비번으로 열리는가, 색인 파일 수
 * 4. 파일 하나 복호해 sha256 대조. 조용히 썩는 것 감지
 *
 * 사용: node src/health.mjs [--quiet]
 */
import { createHash } from 'node:crypto';
import { loadFilesEnv } from './env-file.mjs';
import { rcloneStore } from './store-rclone.mjs';
import { getFile, listFiles, unlockVault } from './vault.mjs';
import { mirrorable } from './mirror-policy.mjs';
import { budgetLine, budgetState, capFromEnv, measureRemote } from './mirror-budget.mjs';

await loadFilesEnv();

const quiet = process.argv.includes('--quiet');
const say = (...a) => {
    if (!quiet) console.log(...a);
};

function need(name) {
    const v = process.env[name];
    if (!v) {
        console.error(`[health] 못 돌림. ${name} 없음`);
        process.exit(2);
    }
    return v;
}

const pass = need('FILES_VAULT_PASS');
const remote = process.env.FILES_VAULT_REMOTE || 'gdrive:karm-files-vault';
const blobBase = process.env.FILES_BLOB_BASE || 'https://files.mascari4615.com/blob/';
const sha = (b) => createHash('sha256').update(b).digest('hex');

/**
 * 화면 앞 문 상태. Access 뒤라 인증 없는 요청이 로그인으로 튕기는 것이 정상.
 *
 * `redirect: 'manual'` 이 핵심. 안 주면 fetch 가 로그인 페이지로 따라가 200 HTML 반환.
 * 그것을 hdr 로 쳐서 거짓 실패 (2026-08-29 첫 실행에서 겪음)
 */
async function gateAlive() {
    try {
        const r = await fetch(blobBase + 'hdr', { cache: 'no-store', redirect: 'manual' });
        return r.status >= 300 && r.status < 400 ? 'gated' : `open(${r.status})`;
    } catch (e) {
        return 'error';
    }
}

const fails = [];
const drive = rcloneStore(remote, { tries: 2, retryBaseMs: 3000 });

/* 1. hdr 대조. R2 는 Access 뒤라 rclone 으로 직접 */
const driveHdr = await drive.get('hdr');
const r2Remote = process.env.FILES_VAULT_R2;
if (r2Remote) {
    const r2Hdr = await rcloneStore(r2Remote, { tries: 2, retryBaseMs: 3000 }).get('hdr');
    const same = sha(driveHdr) === sha(r2Hdr);
    say('[health] hdr 대조', same ? '같음' : '다름');
    if (!same) fails.push('Drive 와 R2 의 hdr 이 다르다. 열쇠 재료가 어긋나 아무것도 안 열린다');
} else {
    say('[health] FILES_VAULT_R2 없음. hdr 대조 생략');
}

/* 값. 상한을 넘었으면 전송기가 미러링을 껐다는 뜻이라 실패로 친다 */
if (r2Remote) {
    const bytes = await measureRemote(r2Remote);
    if (bytes === null) {
        say('[health] 열람 저장 총량을 못 쟀다');
    } else {
        const state = budgetState(bytes, capFromEnv());
        say('[health] 열람 저장', budgetLine(state));
        if (state.level === 'stop') fails.push(`열람 저장이 상한을 넘었다. ${budgetLine(state)}`);
    }
}

/* 문이 열려 있으면 암호문을 누구나 받아감 */
const gate = await gateAlive();
say('[health] 화면 앞 문', gate);
if (gate.startsWith('open')) fails.push('인증 없이 /blob/ 이 열린다. Access 정책 확인 필요');

/* 2. 열림 확인 */
const session = await unlockVault(drive, pass);
const files = await listFiles(session);
say('[health] Drive 열림. 파일', files.length, '개');

/* 3. 복호 왕복. 열람 대상 중 제일 작은 것 */
const small = files
    .filter((f) => mirrorable(f.path, f.size) && f.size > 0)
    .sort((a, b) => a.size - b.size)[0];
if (!small) {
    fails.push('열람 대상이 하나도 없다');
} else {
    const got = await getFile(session, small.path);
    if (!got) fails.push('색인에 있는 파일을 못 받았다');
    else {
        const want = files.find((f) => f.path === small.path)?.sha256;
        const ok = !want || sha(got.bytes) === want;
        say('[health] 복호 왕복', ok ? '맞음' : '어긋남', `(${got.bytes.length} 바이트)`);
        if (!ok) fails.push('복호한 내용이 색인의 sha256 과 다르다');
    }
}

if (fails.length) {
    for (const f of fails) console.error('[health] X', f);
    process.exit(1);
}
say('[health] 이상 없음');
