/**
 * 동반자 데모 — 터미널에서 직접 말을 걸어본다.
 *
 * 부품은 전부 환경변수로 갈아끼운다. **코어 코드는 한 줄도 안 바뀐다.**
 *
 *   COMPANION_BRAIN=echo|assistant   두뇌 (기본 echo — 키 없이 도는지 먼저 확인)
 *   COMPANION_CLOCK_MS=<숫자>        시계 몸을 붙인다 (스스로 혼잣말)
 *   COMPANION_COOLDOWN_MS=<숫자>     혼잣말 쿨다운 (기본 30000)
 *   COMPANION_MEMORY_FILE=<경로>     기억을 파일로 (끄면 프로세스 메모리)
 *   ASSISTANT_AI_PROVIDER=...        어느 LLM 인지는 karmolab-ai 가 정한다
 */
import {
  Companion,
  InMemoryMemory,
  JsonlFileMemory,
  assistantBrain,
  clockBody,
  cooldownAttention,
  echoBrain,
  terminalBody,
} from '../dist/index.js';

const brainName = process.env.COMPANION_BRAIN ?? 'echo';
const brain = brainName === 'assistant' ? assistantBrain() : echoBrain;

const memoryFile = process.env.COMPANION_MEMORY_FILE?.trim();
const memory = memoryFile ? new JsonlFileMemory(memoryFile) : new InMemoryMemory();

const clockMs = Number(process.env.COMPANION_CLOCK_MS ?? '0');
const cooldownMs = Number(process.env.COMPANION_COOLDOWN_MS ?? '30000');

const bodies = [terminalBody({ onClose: () => shutdown() })];
if (clockMs > 0) bodies.push(clockBody({ everyMs: clockMs }));

const companion = new Companion({
  bodies,
  brain,
  memory,
  attention: cooldownAttention({ cooldownMs, bypassChannels: ['terminal'] }),
  onCycle: (report) => {
    if (report.error) process.stderr.write(`\n[에러] ${report.error.message}\n`);
    else if (report.utterance === null && process.env.COMPANION_VERBOSE === '1') {
      process.stderr.write(`\n[참음] ${report.decision.reason}\n`);
    }
  },
});

console.log('─'.repeat(60));
console.log(`동반자 켜짐 — 두뇌=${brain.name} · 몸=${bodies.map((b) => b.name).join(', ')}`);
console.log(`기억=${memoryFile ? `파일(${memoryFile})` : '메모리'} · 혼잣말 쿨다운=${cooldownMs}ms`);
console.log('인격은 아직 없다. 끝내려면 Ctrl+C.');
console.log('─'.repeat(60));

await companion.start();

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await companion.stop();
  console.log('\n동반자 꺼짐.');
  process.exit(0);
}
process.on('SIGINT', shutdown);
