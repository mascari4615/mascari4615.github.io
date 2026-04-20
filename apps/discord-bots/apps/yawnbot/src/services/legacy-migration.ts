/**
 * legacy-migration.ts — assistant/ → characters/<slug>/memory/ 1회성 이관
 *
 * YawnBot 첫 실행 시 (assistant/.legacy/ 가 아직 없으면) 기존 데이터를 새 스키마로 옮긴다:
 *   assistant/logs/YYYY-MM-DD.md  →  characters/<slug>/memory/logs/YYYY-MM-DD.md
 *   assistant/memory/user.md       →  characters/<slug>/memory/user.md
 *   assistant/memory/self.md       →  characters/<slug>/memory/self.md
 *   assistant/memory/daily/*       →  characters/<slug>/memory/daily/*
 *   assistant/memory/weekly/*      →  characters/<slug>/memory/weekly/*
 *
 * 원본은 assistant/.legacy/{logs,memory}/ 로 rename 되어 보존된다.
 * 이관 완료 후 memo 레포에서 git add + commit (push 없음).
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface MigrationResult {
  migrated: boolean;
  filesCopied: number;
  legacyPath: string | null;
  reason?: 'already-migrated' | 'nothing-to-migrate' | 'done';
}

/** target 이 이미 존재하는 파일은 건너뛰고(보수적), 디렉토리는 재귀 복사 */
function copyDirRecursive(src: string, dst: string): number {
  if (!fs.existsSync(src)) return 0;
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      if (!fs.existsSync(dstPath)) {
        fs.copyFileSync(srcPath, dstPath);
        count++;
      }
    }
  }
  return count;
}

export function migrateLegacyAssistant(
  memoRepoPath: string,
  targetSlug: string,
): MigrationResult {
  const assistantDir = path.join(memoRepoPath, 'assistant');
  const legacyDir = path.join(assistantDir, '.legacy');
  const legacyLogsSrc = path.join(assistantDir, 'logs');
  const legacyMemorySrc = path.join(assistantDir, 'memory');
  const targetMemoryDir = path.join(
    memoRepoPath,
    'characters',
    targetSlug,
    'memory',
  );

  if (fs.existsSync(legacyDir)) {
    return {
      migrated: false,
      filesCopied: 0,
      legacyPath: legacyDir,
      reason: 'already-migrated',
    };
  }

  const hasLogs = fs.existsSync(legacyLogsSrc);
  const hasMemory = fs.existsSync(legacyMemorySrc);
  if (!hasLogs && !hasMemory) {
    return {
      migrated: false,
      filesCopied: 0,
      legacyPath: null,
      reason: 'nothing-to-migrate',
    };
  }

  console.log(
    `[Migration] assistant/ → characters/${targetSlug}/memory/ 이관 시작...`,
  );
  fs.mkdirSync(targetMemoryDir, { recursive: true });

  let filesCopied = 0;
  if (hasLogs) {
    filesCopied += copyDirRecursive(
      legacyLogsSrc,
      path.join(targetMemoryDir, 'logs'),
    );
  }
  if (hasMemory) {
    filesCopied += copyDirRecursive(legacyMemorySrc, targetMemoryDir);
  }

  // 원본 백업(.legacy/)
  fs.mkdirSync(legacyDir, { recursive: true });
  try {
    if (hasLogs) {
      fs.renameSync(legacyLogsSrc, path.join(legacyDir, 'logs'));
    }
    if (hasMemory) {
      fs.renameSync(legacyMemorySrc, path.join(legacyDir, 'memory'));
    }
  } catch (e: unknown) {
    console.warn(
      '[Migration] 원본 백업 rename 실패:',
      e instanceof Error ? e.message : e,
    );
  }

  // git commit
  try {
    execSync(`git -C "${memoRepoPath}" add characters/ assistant/`, {
      stdio: 'pipe',
    });
    execSync(
      `git -C "${memoRepoPath}" commit -m "chore: assistant/ → characters/${targetSlug}/memory/ 자동 이관"`,
      { stdio: 'pipe' },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('nothing to commit')) {
      console.warn('[Migration] git commit 실패:', msg);
    }
  }

  console.log(
    `[Migration] 이관 완료: ${filesCopied}개 파일 → characters/${targetSlug}/memory/`,
  );

  return {
    migrated: true,
    filesCopied,
    legacyPath: legacyDir,
    reason: 'done',
  };
}
