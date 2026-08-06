/**
 * 얼굴 데모 — 브라우저 창에 큐브로 나타난다.
 *
 *   node demo/face.mjs                        격리된 claude CLI (기본)
 *   COMPANION_BRAIN=echo node demo/face.mjs   가짜 두뇌 (움직임만 확인)
 *   COMPANION_BRAIN=assistant …               공용 provider 라우터 (세션·지침 공유 주의)
 *
 *   COMPANION_PORT=4615            주소
 *   COMPANION_CLOCK_MS=60000       이 간격으로 스스로 깨어나 혼잣말 (0 = 끔)
 *   COMPANION_COOLDOWN_MS=45000    혼잣말 참는 간격
 *   COMPANION_MEMORY_FILE=<경로>   기억을 파일로
 */
import {
  Companion,
  InMemoryMemory,
  JsonlFileMemory,
  assistantBrain,
  claudeCliBrain,
  clockBody,
  cooldownAttention,
  echoBrain,
  webBody,
} from '../dist/index.js';

const brainName = process.env.COMPANION_BRAIN ?? 'claude';
const brain =
  brainName === 'claude' ? claudeCliBrain()
  : brainName === 'assistant' ? assistantBrain()
  : echoBrain;
const port = Number(process.env.COMPANION_PORT ?? '4615');
const clockMs = Number(process.env.COMPANION_CLOCK_MS ?? '60000');
const cooldownMs = Number(process.env.COMPANION_COOLDOWN_MS ?? '45000');
const memoryFile = process.env.COMPANION_MEMORY_FILE?.trim();

const memory = memoryFile ? new JsonlFileMemory(memoryFile) : new InMemoryMemory();
const web = webBody({ port, open: true, log: (m) => console.log(m) });

const bodies = [web];
if (clockMs > 0) {
  // 몸은 감각 + 표현 한 쌍일 뿐이라, 이렇게 섞어 쓸 수 있다:
  // 시계로 느끼고, 웹 화면으로 말한다. 코어는 이 조합을 몰라도 된다.
  const clock = clockBody({ everyMs: clockMs });
  bodies.push({ name: clock.name, sense: clock.sense, voice: web.voice });
}

const companion = new Companion({
  bodies,
  brain,
  memory,
  attention: cooldownAttention({ cooldownMs, bypassChannels: ['web'] }),
  onCycle: (report) => {
    if (report.error) console.error(`[에러] ${report.error.message}`);
    else if (report.utterance) console.log(`[말함] ${report.utterance.text.slice(0, 60)}`);
    else console.log(`[참음] ${report.decision.reason}`);
  },
});

await companion.start();
console.log(`두뇌=${brain.name} · 혼잣말=${clockMs > 0 ? `${clockMs / 1000}초마다` : '끔'} · 끝내려면 Ctrl+C`);

process.on('SIGINT', async () => {
  await companion.stop();
  console.log('\n동반자 꺼짐.');
  process.exit(0);
});
