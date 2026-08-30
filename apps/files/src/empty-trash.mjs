#!/usr/bin/env node
/**
 * 휴지통 비우기. **되돌릴 수 없다.**
 *
 * 왜 PC 에서만 하나: 화면은 표시만 한다. 청크를 지우는 손은 열쇠와 rclone 이 있는 기계에만
 * 둔다. 세션 하나가 털려도 원본이 사라지지 않는다.
 *
 * 지우는 것: 청크(`c/<id>/<n>`), 미리보기(`t/<id>`), 색인의 그 줄, 휴지통의 그 줄.
 * Drive 와 R2 양쪽에서 지운다.
 *
 * 쓰기: node src/empty-trash.mjs --yes [--older-days N] [--dry-run]
 *   `--yes` 없이는 무엇을 지울지 보여 주기만 한다.
 */
import { loadFilesEnv } from './env-file.mjs';
import { rcloneStore, startRcloneDaemon } from './store-rclone.mjs';
import { flushIndex, listFiles, readTrash, unlockVault, writeTrash } from './vault.mjs';
import { inTrash, takeTrash } from './trash.mjs';

await loadFilesEnv();

function need(name) {
    const v = process.env[name];
    if (!v) {
        console.error(`없음: ${name}`);
        process.exit(2);
    }
    return v;
}

const pass = need('FILES_VAULT_PASS');
const remote = process.env.FILES_VAULT_REMOTE || 'gdrive:karm-files-vault';
const extraRemote = process.env.FILES_VAULT_R2 || '';
const go = process.argv.includes('--yes');
const dry = process.argv.includes('--dry-run') || !go;
const olderAt = process.argv.indexOf('--older-days');
const olderDays = olderAt === -1 ? 0 : Number(process.argv[olderAt + 1]) || 0;
const cutoff = olderDays > 0 ? Date.now() - olderDays * 86400000 : Infinity;

const daemon = await startRcloneDaemon();
const rcUrl = daemon?.url;
const primary = rcloneStore(remote, { rcUrl, delayMs: rcUrl ? 0 : 400 });
const extra = extraRemote ? rcloneStore(extraRemote, { rcUrl, delayMs: rcUrl ? 0 : 400 }) : null;

const session = await unlockVault(primary, pass);
session.deferIndex = true;
const trash = await readTrash(session);
const files = await listFiles(session);

/* 색인의 id 가 있어야 청크 자리를 안다. listFiles 는 id 를 안 주므로 색인을 직접 본다 */
const index = session.index;
const targets = index.files.filter((f) => inTrash(trash, f.path) && trash.items[f.path] <= cutoff);
const bytes = targets.reduce((n, f) => n + (f.size || 0), 0);
console.log(
    `휴지통 ${Object.keys(trash.items).length}개 중 지울 것 ${targets.length}개 ` +
    `(${(bytes / 1024 / 1024).toFixed(1)} MB) / 전체 ${files.length}개`,
);
if (olderDays > 0) console.log(`${olderDays}일 넘게 둔 것만`);
if (!go) {
    console.log('연습입니다. 정말 지우려면 --yes');
    for (const f of targets.slice(0, 20)) console.log('  ' + f.path);
    if (targets.length > 20) console.log(`  ... 그리고 ${targets.length - 20}개`);
    await daemon?.stop?.();
    process.exit(0);
}

async function drop(key) {
    for (const store of [primary, extra]) {
        if (!store?.del) continue;
        try {
            await store.del(key);
        } catch {
            /* 이미 없으면 그만이다 */
        }
    }
}

let gone = 0;
for (const f of targets) {
    for (let i = 0; i < f.chunks; i++) await drop(`c/${f.id}/${i}`);
    if (f.thumb) await drop(`t/${f.id}`);
    gone += 1;
    if (gone % 20 === 0) console.log(`지움 ${gone} / ${targets.length}`);
}

/* 청크를 지운 뒤에 색인에서 뺀다. 순서가 반대면 지울 자리를 잃는다 */
const drops = new Set(targets.map((f) => f.path));
index.files = index.files.filter((f) => !drops.has(f.path));
session.indexDirty = true;
await flushIndex(session);
await writeTrash(session, takeTrash(trash, [...drops]));

console.log(`끝. 지움 ${gone}개${dry ? ' (연습)' : ''}`);
await daemon?.stop?.();
