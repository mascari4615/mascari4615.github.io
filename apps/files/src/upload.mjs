#!/usr/bin/env node
/**
 * 열람 트리 → 클라우드 암호문 → rclone 원격.
 * 원본 경로는 env 만. 기본 로그는 개수. 이름 나열은 --verbose.
 *
 * FILES_VAULT_ROOT  FILES_VAULT_PASS  FILES_VAULT_REMOTE
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createVault, flushIndex, listFiles, putThumb, unlockVault } from './vault.mjs';
import { putFileFromPath, sha256File } from './vault-node.mjs';
import { rcloneStore, startRcloneDaemon } from './store-rclone.mjs';
import { teeStore } from './store-tee.mjs';
import { walkFiles } from './walk.mjs';
import { mirrorable } from './mirror-policy.mjs';
import { hasFfmpeg, makeThumb } from './thumb-node.mjs';
import { budgetLine, capFromEnv, makeBudget, measureRemote } from './mirror-budget.mjs';
import { loadFilesEnv } from './env-file.mjs';

await loadFilesEnv();

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`없음: ${name}`);
    process.exit(2);
  }
  return v;
}

const root = need('FILES_VAULT_ROOT');
const pass = need('FILES_VAULT_PASS');
const remote = process.env.FILES_VAULT_REMOTE || 'gdrive:karm-files-vault';
const extraRemote = process.env.FILES_VAULT_R2 || '';
const dry = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt === -1 ? '' : process.argv[onlyAt + 1];
if (onlyAt !== -1 && (!only || only.split(/[\\/]/).some((part) => !part || part === '.' || part === '..'))) {
  throw new Error('--only 는 원본 뿌리 아래의 상대 폴더 하나여야 함');
}

// 우선 올릴 폴더도 원격에서는 원래 상대 경로를 지킨다.
const scanRoot = only ? join(root, ...only.split(/[\\/]/)) : root;
const scanned = await walkFiles(scanRoot);
const files = only
  ? scanned.map((file) => ({ ...file, rel: only.replaceAll('\\\\', '/') + '/' + file.rel }))
  : scanned;
console.log(`파일 ${files.length}개`);
if (dry) {
  if (verbose) for (const f of files) console.log(f.rel);
  process.exit(0);
}

/* 데몬은 remote 를 안 가린다. rc 한 판에 여러 원격을 태운다.
   예전엔 열람 저장이 켜지면 데몬을 아예 안 띄웠는데, 그러면 청크마다 rclone 프로세스를
   새로 띄워 몇 배로 느려진다. 열람 저장을 켠 값을 속도로 치를 이유가 없다. */
const daemon = await startRcloneDaemon();
const rcUrl = daemon?.url;
const primary = rcloneStore(remote, { rcUrl, delayMs: rcUrl ? 0 : 400 });
const extra = extraRemote ? rcloneStore(extraRemote, { rcUrl, delayMs: rcUrl ? 0 : 400 }) : null;

/* 값 상한. 시작 총량을 한 번 재고 보내는 바이트를 더해 간다.
   못 재면 막지 않는다. 모른다는 이유로 정본 전송을 세우지 않는다.
   `hdr`, `idx` 는 상한 밖이다. 그게 R2 에 없으면 화면이 클라우드 자체를 못 연다. */
const capGb = capFromEnv();
const startBytes = extra ? await measureRemote(extraRemote) : null;
const budget = startBytes === null ? null : makeBudget(startBytes, capGb);
if (budget) console.log('열람 저장', budgetLine(budget.state()));
else if (extra) console.log('열람 저장 총량을 못 쟀다. 상한 검사 생략');
let budgetTold = false;
function allowExtra(key, bytes) {
  if (key === 'hdr' || key === 'idx') return true;
  if (!budget) return true;
  const ok = budget.allow(bytes);
  if (!ok && !budgetTold) {
    budgetTold = true;
    console.log(`열람 저장 ${budgetLine(budget.state())}. 이후 정본만 올린다`);
  }
  return ok;
}

const mirrored = extra ? teeStore(primary, extra, { allowExtra }) : primary;
const store = mirrored;
let session;
const hdr = await store.get('hdr');
if (hdr) session = await unlockVault(store, pass);
else session = await createVault(store, pass);
session.deferIndex = true;
console.log('클라우드 염');

/* 진행 상태를 **정해진 자리**에 적는다.
   왜: 터미널에서 띄우면 로그 자리는 띄운 쪽이 정한다. 그러면 데스크톱 앱이 그 로그를 못 찾아
   진행 수치는 안 보입니다가 된다(2026-08-27 조수님이 그 화면을 봤다). 누가 띄우든
   같은 자리에 적으면 앱이 읽는다. 여기 적는 것은 **집계 수치뿐**. 경로, 파일 이름은 안 적는다. */
const progressPath = new URL('../.upload-progress.json', import.meta.url);
/** 열람 저장(R2)에 보낸 수. writeProgress 가 첫 호출부터 읽으므로 그 위에 선다. */
let mirroredCount = 0;
async function writeProgress(stage, total, done, uploaded, skipped) {
  const body = JSON.stringify({
    stage,
    total,
    done,
    uploaded,
    skipped,
    // 열람 저장(R2)에 보낸 수. R2 로 가긴 하나를 눈으로 셀 수 있어야 한다 . 
    // 안 그러면 안 가는 건지 지금 올리는 게 영상뿐인 건지 구분이 안 된다.
    mirrored: mirroredCount,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  });
  try {
    await writeFile(progressPath, body);
  } catch {
    /* 상태를 못 적는다고 올리기를 멈출 이유는 없다 */
  }
}
await writeProgress('index', files.length, 0, 0, 0);

const have = new Map((await listFiles(session)).map((f) => [f.path, f.sha256]));
/* ffmpeg 이 없으면 미리보기만 건너뛴다. 그것 때문에 올리기를 멈출 이유는 없다 */
const thumbsOn = await hasFfmpeg();
if (!thumbsOn) console.log('ffmpeg 없음. 미리보기는 안 굽는다');
let thumbCount = 0;
let n = 0;
let skipped = 0;
try {
  for (const f of files) {
    const rel = f.rel.replaceAll('\\', '/');
    const known = have.get(rel);
    if (known) {
      const digest = await sha256File(f.abs);
      if (known === digest) {
        skipped += 1;
        continue;
      }
    }
    // 청크를 쓰는 자리는 session.store 다. 파일마다 갈아끼워 R2 로 갈 것만 보낸다.
    // 영상은 크기까지 봐야 판단된다 (mirror-policy: 큰 영상은 화면이 못 연다)
    const toMirror = mirrorable(rel, f.size);
    if (toMirror) mirroredCount += 1;
    session.store = toMirror ? mirrored : primary;
    await putFileFromPath(session, rel, f.abs, { chunkSize: 8 * 1024 * 1024 });
    /* 미리보기는 **늘 열람 저장까지** 간다. 원본을 안 올리는 큰 영상도 칸은 보여야 하고,
       한 장이 수십 KB 라 값이 거의 안 든다 */
    session.store = mirrored;
    const thumb = thumbsOn ? await makeThumb(f.abs, rel, f.size) : null;
    if (thumb) {
      await putThumb(session, rel, thumb);
      thumbCount += 1;
    }
    n += 1;
    if ((n + skipped) % 10 === 0) await flushIndex(session);
    if (verbose) console.log(rel);
    else if ((n + skipped) % 10 === 0 || n + skipped === files.length) {
      console.log(`${n + skipped}/${files.length} 올림 ${n} 건너뜀 ${skipped}`);
    }
    if ((n + skipped) % 10 === 0 || n + skipped === files.length) {
      await writeProgress('upload', files.length, n + skipped, n, skipped);
    }
  }
  await flushIndex(session);
  await writeProgress('done', files.length, n + skipped, n, skipped);
} finally {
  await flushIndex(session);
  daemon?.stop();
}
console.log(`올림 ${n} 건너뜀 ${skipped} 미리보기 ${thumbCount}`);
