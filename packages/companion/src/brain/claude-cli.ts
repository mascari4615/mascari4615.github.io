import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Brain, MemoryEntry, ThinkInput } from '../types';

export interface ClaudeCliBrainOptions {
  command?: string;
  timeoutMs?: number;
  /** 이 문장이 대화 앞에 붙는다. 인격을 꽂는 자리 — 기본은 비어 있다. */
  instruction?: string;
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
export function claudeCliBrain(options: ClaudeCliBrainOptions = {}): Brain {
  const command = options.command ?? process.env.CLAUDE_CLI_COMMAND?.trim() ?? 'claude';
  const timeoutMs = options.timeoutMs ?? 120_000;
  // 빈 폴더 = 주워 읽을 지침 파일이 없다.
  const sandbox = mkdtempSync(join(tmpdir(), 'companion-brain-'));

  return {
    name: 'claude-cli(격리)',
    think(input: ThinkInput): Promise<string | null> {
      return run(command, buildPrompt(input, options.instruction), sandbox, timeoutMs);
    },
  };
}

function run(command: string, prompt: string, cwd: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['--print', '--no-session-persistence'], {
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

function buildPrompt(input: ThinkInput, instruction?: string): string {
  const head = instruction?.trim() ? `${instruction.trim()}\n\n` : '';
  const history = input.recent.slice(0, -1).map(renderEntry).join('\n');
  const past = history === '' ? '' : `지금까지 오간 말:\n${history}\n\n`;
  return `${head}${past}방금 [${input.sensation.channel}] 에서 들어온 것:\n${input.sensation.text}\n\n여기에 이어서 한 마디만 해라. 설명이나 머리말 없이 그 한 마디만.`;
}

function renderEntry(entry: MemoryEntry): string {
  return `${entry.role === 'said' ? '나' : `[${entry.channel}]`}: ${entry.text}`;
}
