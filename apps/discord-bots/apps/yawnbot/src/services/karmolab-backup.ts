/**
 * KarmoLab 상태 파일 백업 (TASK-KL-098).
 *
 * 왜 있나: 계정·글·흔적이 전부 **노트북의 파일 몇 개**에 들어 있다. 그 파일이 깨지거나
 * 지워지면 사람들이 쓴 글이 통째로 사라진다 — 되돌릴 방법이 하나도 없었다.
 * 커뮤니티는 남의 글을 맡아 두는 곳이라, 잃고 나서 만들면 늦다.
 *
 * 어떻게: 주기적으로 `data/*-state.json` 을 통째로 `data/backups/` 에 시각 이름으로 복사한다.
 *  - **내용이 안 바뀌었으면 안 만든다** (같은 파일이 수백 개 쌓이면 진짜 사본을 못 찾는다).
 *  - 최근 것만 남기고 오래된 것은 지운다.
 *  - 백업 자체가 실패해도 봇은 계속 돈다 — 백업 때문에 서비스가 멈추면 본말전도다.
 *
 * 되돌리는 법 (사람이 함, 몇 초):
 *  ① 봇을 멈춘다 → ② `data/backups/<시각>/` 안의 파일을 `data/` 로 덮어쓴다 → ③ 봇을 켠다.
 *
 * 이 파일은 KarmoLab 전용이 아니다 — `data/` 의 `*-state.json` 이면 무엇이든 같이 지킨다.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';

/** 몇 벌까지 남길지. 하루 한 벌씩 바뀌면 2주치다. */
const KEEP = 14;

/** 얼마나 자주 볼지. 자주 봐도 안 바뀌었으면 아무것도 안 한다. */
const INTERVAL_MS = 60 * 60 * 1000;

function dataDir(): string {
    return path.join(PKG_ROOT, 'data');
}
function backupRoot(): string {
    return path.join(dataDir(), 'backups');
}

/** 지금 상태 파일들의 지문. 이게 그대로면 새 사본을 안 만든다. */
function fingerprint(files: string[]): string {
    const hash = crypto.createHash('sha256');
    for (const file of files) {
        hash.update(file);
        try {
            hash.update(fs.readFileSync(path.join(dataDir(), file)));
        } catch {
            hash.update('missing');
        }
    }
    return hash.digest('hex').slice(0, 16);
}

function stateFiles(): string[] {
    try {
        return fs
            .readdirSync(dataDir())
            .filter((name) => name.endsWith('-state.json'))
            .sort();
    } catch {
        return [];
    }
}

export interface BackupInfo {
    /** 마지막으로 사본을 만든 시각 (없으면 null). */
    lastAt: string | null;
    /** 지금 가지고 있는 사본 수. */
    count: number;
}

/** 지금 있는 사본들 — 이름이 곧 시각이라 이름만 보면 된다. */
function listBackups(): string[] {
    try {
        return fs
            .readdirSync(backupRoot())
            .filter((name) => /^\d{8}-\d{6}-/.test(name))
            .sort();
    } catch {
        return [];
    }
}

export function backupInfo(): BackupInfo {
    const found = listBackups();
    const last = found[found.length - 1];
    if (!last) return { lastAt: null, count: 0 };
    // 이름 형식: YYYYMMDD-HHMMSS-<지문>
    const stamp = last.slice(0, 15);
    const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
    return { lastAt: iso, count: found.length };
}

/**
 * 한 번 백업한다.
 * @returns 실제로 새 사본을 만들었으면 그 폴더 이름, 안 만들었으면 null.
 */
export function runBackup(now: Date = new Date()): string | null {
    const files = stateFiles();
    if (files.length === 0) return null;

    const mark = fingerprint(files);
    const existing = listBackups();
    // 마지막 사본과 내용이 같으면 새로 안 만든다.
    if (existing.some((name) => name.endsWith(`-${mark}`))) return null;

    const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
    const folder = path.join(backupRoot(), `${stamp}-${mark}`);
    try {
        fs.mkdirSync(folder, { recursive: true });
        for (const file of files) {
            fs.copyFileSync(path.join(dataDir(), file), path.join(folder, file));
        }
    } catch (error) {
        // 백업이 안 됐다고 서비스를 멈추지 않는다. 대신 조용히 넘어가지도 않는다.
        console.error('[karmolab-backup] 사본 만들기 실패:', error);
        return null;
    }

    // 오래된 것 치우기 — 남길 개수를 넘은 만큼 앞에서부터.
    const all = listBackups();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP))) {
        try {
            fs.rmSync(path.join(backupRoot(), old), { recursive: true, force: true });
        } catch {
            /* 못 지워도 다음에 다시 시도한다 */
        }
    }

    console.log(`[karmolab-backup] 사본 생성 ${path.basename(folder)} (파일 ${files.length}개)`);
    return path.basename(folder);
}

let timer: ReturnType<typeof setInterval> | null = null;

/** 봇이 뜰 때 한 번 부른다. 바로 한 벌 만들고, 그 뒤로는 주기적으로 본다. */
export function startBackupLoop(): void {
    if (timer) return;
    runBackup();
    timer = setInterval(() => runBackup(), INTERVAL_MS);
    timer.unref?.();
}
