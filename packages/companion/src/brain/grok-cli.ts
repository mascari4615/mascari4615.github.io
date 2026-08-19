import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ChatPart, MemoryEntry, ThinkInput } from '../types';
import type { SwitchableBrain } from './claude-cli';
import type { ToolMode } from './mode';

export interface GrokCliBrainOptions {
  command?: string;
  timeoutMs?: number;
  handsNote?: string;
  alwaysNote?: string;
  model?: string;
  /** talk = 말만. work = 셸·편집 살림. */
  tools?: ToolMode;
  workDir?: string;
}

/**
 * 격리된 Grok CLI 두뇌.
 *
 * 클로드 두뇌와 같은 이유: 집 설정·훅·프로젝트 지침을 물려받으면 코딩 조수가 된다.
 * 동반자는 그 사람이 아니다. 빈 폴더에서 부르고, 자격만 옮긴다.
 * 기억은 CLI 세션이 아니라 우리 Memory 가 가진다.
 *
 * 집 규칙(`~/.grok/rules`)은 GROK_HOME 을 임시 자리로 바꿔 끊는다.
 * 안 끊으면 이 기계의 다른 페르소나가 여기로 샌다.
 */
export function grokCliBrain(options: GrokCliBrainOptions = {}): SwitchableBrain {
  const command = options.command ?? process.env.GROK_CLI_COMMAND?.trim() ?? 'grok';
  const timeoutMs = options.timeoutMs ?? 120_000;
  let model = options.model ?? process.env.COMPANION_MODEL?.trim() ?? '';
  let handsNote = options.handsNote;
  const tools = options.tools ?? 'talk';
  const workDir = options.workDir?.trim() || process.cwd();
  const sandbox = mkdtempSync(join(tmpdir(), 'companion-grok-'));
  const home = mkdtempSync(join(tmpdir(), 'companion-grok-home-'));
  const cwd = tools === 'work' ? workDir : sandbox;

  const thinking = new Set<{ kill: () => void }>();
  let copiedAt = 0;
  let usable = false;

  function isolatedHome(): string | undefined {
    const stale = Date.now() - copiedAt > 10 * 60_000;
    if (stale) {
      usable = refreshIsolatedHome(home);
      copiedAt = Date.now();
    }
    return usable ? home : undefined;
  }

  return {
    get name() { return `grok-cli(${tools}${model ? `·${model}` : ''})`; },
    currentModel: () => model,
    useModel(next) { model = next; },
    setHandsNote(note) { handsNote = note; },
    abort() {
      for (const running of thinking) running.kill();
      thinking.clear();
    },
    ask(prompt: string): Promise<string | null> {
      return run({
        command, prompt, sandbox, cwd, tools, timeoutMs, model, home: isolatedHome(), thinking,
      });
    },
    think(input: ThinkInput): Promise<string | null> {
      return run({
        command,
        prompt: buildPrompt(input),
        sandbox,
        cwd,
        tools,
        timeoutMs,
        model,
        rules: buildSystem(input, handsNote, options.alwaysNote),
        home: isolatedHome(),
        thinking,
      });
    },
    thinkStream(input: ThinkInput, onDelta: (chunk: string) => void, onPart?: (part: ChatPart) => void): Promise<string | null> {
      return run({
        command,
        prompt: buildPrompt(input),
        sandbox,
        cwd,
        tools,
        timeoutMs,
        model,
        rules: buildSystem(input, handsNote, options.alwaysNote),
        home: isolatedHome(),
        onDelta,
        onPart,
        thinking,
      });
    },
  };
}

/** 그록 `streaming-json` 한 줄에서 말로 쓸 조각만 뺀다. */
export function grokStreamText(line: string): string {
  const part = grokStreamPart(line);
  return part?.kind === 'text' ? part.text : '';
}

/** 그록 한 줄을 채팅 칸(말·도구·그림)으로 푼다. */
export function grokStreamPart(line: string): ChatPart | { kind: 'text'; text: string } | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  try {
    const event = JSON.parse(trimmed) as {
      type?: string;
      data?: unknown;
      toolName?: string;
      title?: string;
      toolCallId?: string;
      status?: string;
      rawOutput?: unknown;
      rawInput?: unknown;
    };
    if (event.type === 'text' && typeof event.data === 'string') {
      return { kind: 'text', text: event.data };
    }
    if (event.type === 'tool_call') {
      const name = String(event.toolName || event.title || '도구');
      const id = String(event.toolCallId || name);
      const image = imageFromUnknown(event.rawOutput) ?? imageFromUnknown(event.rawInput);
      if (image) return { kind: 'image', src: image.src, alt: image.alt ?? name };
      return { kind: 'tool', id, name, status: 'start', detail: detailFromUnknown(event.rawInput) };
    }
    if (event.type === 'tool_call_update') {
      const name = String(event.toolName || event.title || '도구');
      const id = String(event.toolCallId || name);
      const image = imageFromUnknown(event.rawOutput);
      if (image) return { kind: 'image', src: image.src, alt: image.alt ?? name };
      const done = event.status === 'completed' || event.status === 'done';
      return { kind: 'tool', id, name, status: done ? 'done' : 'start', detail: detailFromUnknown(event.rawOutput) };
    }
  } catch {
    return null;
  }
  return null;
}

function imageFromUnknown(value: unknown): { src: string; alt?: string } | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^https?:\/\//i.test(t) && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(t)) return { src: t };
    if (t.startsWith('data:image/')) return { src: t };
    return null;
  }
  if (typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  for (const key of ['path', 'url', 'src', 'image', 'file']) {
    const got = rec[key];
    if (typeof got === 'string' && got.trim() !== '') {
      const t = got.trim();
      if (t.startsWith('data:image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(t) || /^https?:\/\//i.test(t)) {
        return { src: t };
      }
    }
  }
  return null;
}

function detailFromUnknown(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value.slice(0, 160);
  try {
    return JSON.stringify(value).slice(0, 160);
  } catch {
    return undefined;
  }
}

/** 그록 `--output-format json` 한 덩어리에서 답을 뺀다. */
export function grokJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  try {
    const body = JSON.parse(trimmed) as { text?: unknown };
    if (typeof body.text === 'string') return body.text;
  } catch {
    return trimmed;
  }
  return '';
}

function refreshIsolatedHome(dest: string): boolean {
  const src = process.env.GROK_HOME?.trim() || join(homedir(), '.grok');
  const auth = join(src, 'auth.json');
  if (existsSync(auth) === false) return false;
  try {
    copyFileSync(auth, join(dest, 'auth.json'));
    return true;
  } catch {
    return false;
  }
}

function run(opts: {
  command: string;
  prompt: string;
  sandbox: string;
  cwd: string;
  tools: ToolMode;
  timeoutMs: number;
  model: string;
  rules?: string;
  home?: string;
  onDelta?: (chunk: string) => void;
  onPart?: (part: ChatPart) => void;
  thinking?: Set<{ kill: () => void }>;
}): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const promptFile = join(opts.sandbox, 'prompt.txt');
    writeFileSync(promptFile, opts.prompt, 'utf8');

    const args = [
      '--prompt-file', promptFile,
      '--cwd', opts.cwd,
      '--no-auto-update',
      '--yolo',
      '--output-format', opts.onDelta ? 'streaming-json' : 'json',
    ];
    if (opts.tools === 'talk') {
      args.push('--max-turns', '1', '--disallowed-tools', 'Agent,run_terminal_cmd,search_replace');
    } else {
      args.push('--max-turns', '8');
    }
    if (opts.model) args.push('--model', opts.model);
    if (opts.rules) args.push('--rules', opts.rules);

    const startedAt = Date.now();
    let firstWordAt: number | null = null;

    const child = spawn(opts.command, args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        GROK_HOME: opts.home ?? opts.sandbox,
        GROK_SUBAGENTS: opts.tools === 'work' ? '1' : '0',
        GROK_WORKFLOWS: '0',
        GROK_MEMORY: '0',
      },
    });

    const handle = { kill: () => { try { child.kill(); } catch { /* 이미 죽었으면 그만 */ } } };
    opts.thinking?.add(handle);

    let stdout = '';
    let stderr = '';
    let streamed = '';
    let pending = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
      if (opts.onDelta === undefined) return;
      pending += d;
      let cut = pending.indexOf('\n');
      while (cut >= 0) {
        const line = pending.slice(0, cut);
        pending = pending.slice(cut + 1);
        cut = pending.indexOf('\n');
        const part = grokStreamPart(line);
        if (part === null) continue;
        if (part.kind === 'text') {
          if (firstWordAt === null) firstWordAt = Date.now();
          streamed += part.text;
          opts.onDelta(part.text);
          continue;
        }
        opts.onPart?.(part);
      }
    });
    child.stderr.on('data', (d: string) => { stderr += d; });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`두뇌가 ${opts.timeoutMs}ms 안에 답하지 않았다`));
    }, opts.timeoutMs);

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`두뇌를 실행하지 못했다 (${opts.command}): ${e.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const since = (at: number | null) => (at === null ? '-' : `${at - startedAt}ms`);
      process.stderr.write(
        `[두뇌] grok 첫낱말 ${since(firstWordAt)} · 끝 ${Date.now() - startedAt}ms` +
          ` · 재료 ${opts.prompt.length}자 · 답 ${(opts.onDelta ? streamed : stdout).length}자\n`,
      );
      opts.thinking?.delete(handle);
      const text = opts.onDelta ? streamed.trim() : grokJsonText(stdout).trim();
      if (code === 0) {
        resolve(text === '' ? null : text);
        return;
      }
      reject(new Error(`두뇌 종료 코드 ${code}: ${(stderr.trim() || text).slice(0, 400)}`));
    });
  });
}

function buildSystem(input: ThinkInput, handsNote?: string, alwaysNote?: string): string {
  const parts = [];
  if (input.character?.instruction.trim()) parts.push(input.character.instruction.trim());
  if (handsNote?.trim()) parts.push(handsNote.trim());
  if (alwaysNote?.trim()) parts.push(alwaysNote.trim());
  if (input.longTerm?.trim()) {
    parts.push(`이 사람에 대해 아는 것:\n${input.longTerm.trim()}`);
  }
  if (input.mood?.trim()) parts.push(input.mood.trim());
  if (input.found && input.found.length > 0) {
    parts.push(
      `방금 찾아본 것:\n${input.found.join('\n')}\n\n이걸 보고 답해라. 찾아봤다는 말은 굳이 하지 마라.`,
    );
  }
  parts.push('너는 개발 도구가 아니다. 무엇이냐고 물으면 위에 적힌 대로 답한다.');
  return parts.join('\n\n');
}

function buildPrompt(input: ThinkInput): string {
  const history = input.recent.slice(0, -1).map(renderEntry).join('\n');
  const past = history === '' ? '' : `지금까지 오간 말:\n${history}\n\n`;
  return `${past}방금 ${input.sensation.누가 ?? `[${input.sensation.channel}]`} 에게서 들어온 것:\n${input.sensation.text}\n\n여기에 이어서 한 마디만 해라. 설명이나 머리말 없이 그 한 마디만.`;
}

function renderEntry(entry: MemoryEntry): string {
  const 누구 = entry.role === 'said' ? '나' : (entry.누가 ?? `[${entry.channel}]`);
  return `${누구}: ${entry.text}`;
}
