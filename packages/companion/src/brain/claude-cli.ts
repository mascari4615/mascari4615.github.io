import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Brain, MemoryEntry, ThinkInput } from '../types';

/** 대화 밖에서 두뇌를 한 번 쓰고 싶을 때 (예: 기억 졸이기). */
export interface PlainThinker {
  ask(prompt: string): Promise<string | null>;
}

export interface ClaudeCliBrainOptions {
  command?: string;
  timeoutMs?: number;
}

/**
 * 격리된 claude CLI 두뇌.
 *
 * 왜 공용 provider 라우터를 안 쓰나 — 라우터의 claude 경로는 두 가지를 몰래 끌고 온다:
 *
 * 1. **작업 디렉토리의 지침 파일** — 저장소 안에서 띄우면 상위 폴더의 지침이 자동 주입돼
 *    동반자가 「개발 조수」 말투로 샌다.
 * 2. **다른 봇과 공유하는 대화 세션** — 고정 세션 이름을 쓰기 때문에 욘봇 대화가 그대로
 *    이어져 들어온다 (실측: 우리 대화에 없던 낱말이 답에 등장).
 *
 * 그래서 여기선 빈 임시 폴더에서, 세션을 남기지 않고(`--no-session-persistence`) 부른다.
 * 기억은 CLI 가 몰래 들고 있는 게 아니라 우리 `Memory` 부품이 소유한다 — 그래야 기억을
 * 파일로 옮기든 지우든 우리가 통제할 수 있다.
 */
export function claudeCliBrain(options: ClaudeCliBrainOptions = {}): Brain & PlainThinker {
  const command = options.command ?? process.env.CLAUDE_CLI_COMMAND?.trim() ?? 'claude';
  const timeoutMs = options.timeoutMs ?? 120_000;
  // 빈 폴더 = 주워 읽을 지침 파일이 없다.
  const sandbox = mkdtempSync(join(tmpdir(), 'companion-brain-'));

  return {
    name: 'claude-cli(격리)',
    /** 대화 맥락 없이 한 번 묻는다 — 기억을 졸일 때처럼. */
    ask(prompt: string): Promise<string | null> {
      return run(command, prompt, sandbox, timeoutMs, false);
    },
    think(input: ThinkInput): Promise<string | null> {
      // 그림이 딸려 왔으면 샌드박스 안으로 들여놓는다 — 두뇌가 볼 수 있는 곳은 여기뿐이다.
      let localImage: string | null = null;
      const source = typeof input.sensation.meta?.imagePath === 'string' ? input.sensation.meta.imagePath : null;
      if (source !== null) {
        try {
          localImage = join(sandbox, 'now.png');
          copyFileSync(source, localImage);
        } catch {
          localImage = null;
        }
      }
      return run(command, buildPrompt(input, localImage), sandbox, timeoutMs, localImage !== null);
    },
  };
}

function run(
  command: string,
  prompt: string,
  cwd: string,
  timeoutMs: number,
  needsFileAccess: boolean,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    // 그림을 읽어야 할 때만 파일 접근을 연다. 그마저도 빈 임시 폴더 안이다.
    const args = needsFileAccess
      ? ['--print', '--no-session-persistence', '--dangerously-skip-permissions']
      : ['--print', '--no-session-persistence'];
    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`두뇌가 ${timeoutMs}ms 안에 답하지 않았다`));
    }, timeoutMs);

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`두뇌를 실행하지 못했다 (${command}): ${e.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const text = stdout.trim();
      if (code === 0) {
        resolve(text === '' ? null : text);
        return;
      }
      reject(new Error(`두뇌 종료 코드 ${code}: ${(stderr.trim() || text).slice(0, 400)}`));
    });

    child.stdin.end(prompt, 'utf8');
  });
}

function buildPrompt(input: ThinkInput, imageInSandbox: string | null): string {
  const persona = input.character?.instruction.trim() ? `${input.character.instruction.trim()}\n\n` : '';
  const known = input.longTerm?.trim() ? `이 사람에 대해 아는 것:\n${input.longTerm.trim()}\n\n` : '';
  const head = `${persona}${known}`;
  const history = input.recent.slice(0, -1).map(renderEntry).join('\n');
  const past = history === '' ? '' : `지금까지 오간 말:\n${history}\n\n`;
  const look =
    imageInSandbox === null
      ? ''
      : `\n\n지금 이 사람 화면을 찍은 그림이 now.png 에 있다. 먼저 읽어서 보고 말해라. 화면 설명을 늘어놓지 말고, 본 것에 대해 한 마디만.`;
  return `${head}${past}방금 [${input.sensation.channel}] 에서 들어온 것:\n${input.sensation.text}${look}\n\n여기에 이어서 한 마디만 해라. 설명이나 머리말 없이 그 한 마디만.`;
}

function renderEntry(entry: MemoryEntry): string {
  return `${entry.role === 'said' ? '나' : `[${entry.channel}]`}: ${entry.text}`;
}
