/**
 * 채팅 창을 한 줄로 켠다.
 *
 *   npm run page           일 방 (코딩 CLI)
 *   npm run page:talk      말 방 (곁에)
 *   npm run page:preview   가짜 미리보기
 *   npm run page:grok      그록 강제 + 일
 */
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** io 저장소. 우산 뿌리로 두면 memo/private 까지 손이 간다. */
const ioRoot = join(here, '..', '..', '..');

/** 자격 있는 진짜 두뇌. 미리보기는 사람이 고를 때만. */
export function readyBrain(env = process.env) {
  const home = env.GROK_HOME?.trim() || join(homedir(), '.grok');
  if (existsSync(join(home, 'auth.json'))) return 'grok';
  return 'claude';
}

export function launchEnv(argv, env = process.env) {
  const preview = argv.includes('preview');
  const grok = argv.includes('grok');
  const talk = argv.includes('talk');
  const brain = preview
    ? 'preview'
    : grok
      ? 'grok'
      : (env.COMPANION_BRAIN?.trim() || readyBrain(env));
  const tools = preview || talk
    ? 'talk'
    : (env.COMPANION_TOOLS?.trim() || (brain === 'preview' ? 'talk' : 'work'));
  return {
    ...env,
    COMPANION_SURFACE: 'page',
    COMPANION_BRAIN: brain,
    COMPANION_TOOLS: tools,
    COMPANION_WORK_DIR: env.COMPANION_WORK_DIR?.trim() || ioRoot,
    COMPANION_MEMORY_FILE: env.COMPANION_MEMORY_FILE?.trim() || join(homedir(), '.companion', 'page.jsonl'),
    COMPANION_DESKTOP: env.COMPANION_DESKTOP ?? '0',
    COMPANION_NUDGE: env.COMPANION_NUDGE ?? '0',
    COMPANION_SCREEN_MS: env.COMPANION_SCREEN_MS ?? '0',
    COMPANION_OPEN: env.COMPANION_OPEN ?? '1',
  };
}

const argv = process.argv.slice(2);
if (argv.includes('--print-env')) {
  const e = launchEnv(argv);
  process.stdout.write(JSON.stringify({
    COMPANION_SURFACE: e.COMPANION_SURFACE,
    COMPANION_BRAIN: e.COMPANION_BRAIN,
    COMPANION_TOOLS: e.COMPANION_TOOLS,
    COMPANION_MEMORY_FILE: e.COMPANION_MEMORY_FILE,
    COMPANION_WORK_DIR: e.COMPANION_WORK_DIR,
  }) + '\n');
  process.exit(0);
}

const child = spawn(process.execPath, [join(here, 'face.mjs')], {
  cwd: join(here, '..'),
  env: launchEnv(argv),
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => process.exit(code ?? 1));
