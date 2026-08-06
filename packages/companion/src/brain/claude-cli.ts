import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Brain, MemoryEntry, ThinkInput } from '../types';

/** 대화 밖에서 두뇌를 한 번 쓰고 싶을 때 (예: 기억 졸이기). */
export interface PlainThinker {
  ask(prompt: string): Promise<string | null>;
}

export interface ClaudeCliBrainOptions {
  command?: string;
  timeoutMs?: number;
  /** 할 수 있는 일 목록을 알려 주는 문장 (`describeHands` 가 만든다). */
  handsNote?: string;
  /**
   * 어떤 모델로 말할까. 동반자는 깊이보다 빠르기다 — 곁에 있는 사람이 30초 뒤에
   * 대답하면 곁에 있는 게 아니다. 구독 할당량도 덜 먹는다.
   */
  model?: string;
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
export interface SwitchableBrain extends Brain, PlainThinker {
  /** 지금 어떤 모델을 쓰나. */
  currentModel(): string;
  /** 다른 모델로 갈아탄다. */
  useModel(name: string): void;
}

export function claudeCliBrain(options: ClaudeCliBrainOptions = {}): SwitchableBrain {
  const command = options.command ?? process.env.CLAUDE_CLI_COMMAND?.trim() ?? 'claude';
  const timeoutMs = options.timeoutMs ?? 120_000;
  // 실행 중에 갈아탈 수 있어야 한다 — 어떤 머리를 쓸지는 껐다 켜서 정할 일이 아니다.
  let model = options.model ?? process.env.COMPANION_MODEL?.trim() ?? 'haiku';
  // 빈 폴더 = 주워 읽을 지침 파일이 없다.
  const sandbox = mkdtempSync(join(tmpdir(), 'companion-brain-'));
  const configDir = mkdtempSync(join(tmpdir(), 'companion-config-'));

  /** 부를 때마다 자격을 새로 옮기고, 못 옮기면 이 사람 설정 그대로 쓴다(느리지만 된다). */
  function isolated(): string | undefined {
    return refreshIsolatedConfig(configDir) ? configDir : undefined;
  }

  return {
    get name() { return `claude-cli(격리·${model})`; },
    currentModel: () => model,
    useModel(next) { model = next; },
    /** 대화 맥락 없이 한 번 묻는다 — 기억을 졸일 때처럼. */
    ask(prompt: string): Promise<string | null> {
      return run(command, prompt, sandbox, timeoutMs, false, undefined, model, isolated());
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
      return run(command, buildPrompt(input, localImage, options.handsNote), sandbox, timeoutMs, localImage !== null, undefined, model, isolated(), buildSystem(input, options.handsNote));
    },
    thinkStream(input: ThinkInput, onDelta: (chunk: string) => void): Promise<string | null> {
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
      return run(command, buildPrompt(input, localImage, options.handsNote), sandbox, timeoutMs, localImage !== null, onDelta, model, isolated(), buildSystem(input, options.handsNote));
    },
  };
}

/**
 * 이 사람의 Claude Code 설정과 떼어놓은 자리를 만든다.
 *
 * 왜 필요한가 — 설정을 그대로 물려받으면 세션 시작 훅이 매 답변마다 돈다. 이 컴퓨터에선
 * 그게 12.6초였다. 곁에 있는 사람이 매번 그만큼 뜸을 들이면 곁에 있는 게 아니다.
 * 계정만 옮기고 훅·MCP·프로젝트 이력은 두고 온다 (실측 18초 → 3초).
 *
 * 자격은 갱신되므로 부를 때마다 새로 복사한다 — 낡은 사본으로 만료되는 일이 없게.
 */
function refreshIsolatedConfig(configDir: string): boolean {
  const home = process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude');
  const credentials = join(home, '.credentials.json');
  if (existsSync(credentials) === false) return false;
  try {
    copyFileSync(credentials, join(configDir, '.credentials.json'));
    const settingsPath = join(homedir(), '.claude.json');
    if (existsSync(settingsPath)) {
      const full = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
      const slim: Record<string, unknown> = {};
      for (const key of ['oauthAccount', 'userID', 'hasCompletedOnboarding', 'installMethod', 'firstStartTime']) {
        if (full[key] !== undefined) slim[key] = full[key];
      }
      writeFileSync(join(configDir, '.claude.json'), JSON.stringify(slim), 'utf8');
    }
    return true;
  } catch {
    return false;
  }
}

function run(
  command: string,
  prompt: string,
  cwd: string,
  timeoutMs: number,
  needsFileAccess: boolean,
  onDelta?: (chunk: string) => void,
  model?: string,
  configDir?: string,
  systemPrompt?: string,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    // 그림을 읽어야 할 때만 파일 접근을 연다. 그마저도 빈 임시 폴더 안이다.
    const args = ['--print', '--no-session-persistence'];
    // 인격은 **시스템 자리**에 넣는다. 대화 본문에 적어 두면 이 도구의 기본 성격
    // (「저는 코딩을 돕는 Claude입니다」)이 그대로 남아, 누구냐고 물으면 그쪽이 나온다.
    // 실측: 인격을 본문에 넣었더니 「캐릭터 롤플레이는 할 수 없다」고 답했다.
    if (systemPrompt) args.push('--system-prompt', systemPrompt);
    if (model) args.push('--model', model);
    if (needsFileAccess) args.push('--dangerously-skip-permissions');
    // 조각을 받아 갈 사람이 있을 때만 흐르는 형식으로 부른다.
    if (onDelta) args.push('--output-format', 'stream-json', '--verbose', '--include-partial-messages');

    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: configDir ? { ...process.env, CLAUDE_CONFIG_DIR: configDir } : process.env,
    });

    let stdout = '';
    let stderr = '';
    let streamed = '';
    let pending = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      stdout += d;
      if (onDelta === undefined) return;
      // 흐르는 형식은 한 줄에 하나씩 JSON 이 온다. 줄이 끊겨 도착할 수 있어 모았다 자른다.
      pending += d;
      let cut = pending.indexOf('\n');
      while (cut >= 0) {
        const line = pending.slice(0, cut).trim();
        pending = pending.slice(cut + 1);
        cut = pending.indexOf('\n');
        if (line === '') continue;
        try {
          const event = JSON.parse(line);
          const delta = event?.event?.delta;
          if (event?.type === 'stream_event' && event.event?.type === 'content_block_delta' && typeof delta?.text === 'string') {
            streamed += delta.text;
            onDelta(delta.text);
          }
        } catch {
          // 못 읽는 줄은 넘긴다 — 마지막에 모아둔 것으로 답을 만든다.
        }
      }
    });
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
      // 흐르는 형식일 땐 stdout 이 JSON 뭉치라 그대로 쓰면 안 된다 — 모아둔 조각이 답이다.
      const text = (onDelta ? streamed : stdout).trim();
      if (code === 0) {
        resolve(text === '' ? null : text);
        return;
      }
      reject(new Error(`두뇌 종료 코드 ${code}: ${(stderr.trim() || text).slice(0, 400)}`));
    });

    child.stdin.end(prompt, 'utf8');
  });
}

/** 시스템 자리에 들어갈 것 — 누구이고, 무엇을 할 수 있고, 이 사람에 대해 뭘 아는가. */
function buildSystem(input: ThinkInput, handsNote?: string): string {
  const parts = [];
  if (input.character?.instruction.trim()) parts.push(input.character.instruction.trim());
  if (handsNote?.trim()) parts.push(handsNote.trim());
  if (input.longTerm?.trim()) parts.push(`이 사람에 대해 아는 것:
${input.longTerm.trim()}`);
  parts.push('너는 개발 도구가 아니다. 무엇이냐고 물으면 위에 적힌 대로 답한다.');
  return parts.join('\n\n');
}

function buildPrompt(input: ThinkInput, imageInSandbox: string | null, handsNote?: string): string {
  // 누구인지·무엇을 할 수 있는지는 시스템 자리로 갔다. 여기엔 지금 오간 말만 담는다.
  const head = '';
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
