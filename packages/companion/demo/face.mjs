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
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  Companion,
  DistillingMemory,
  InMemoryMemory,
  JsonlFileMemory,
  brainDistiller,
  assistantBrain,
  claudeCliBrain,
  clockBody,
  describeHands,
  echoBrain,
  edgeSpeech,
  noteHand,
  remindHand,
  tactfulAttention,
  loadCharacter,
  openPinnedWindow,
  screenSense,
  webBody,
  whisperEars,
} from '../dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 손 — 말 말고 실제로 할 수 있는 일. 둘 다 되돌릴 수 있거나 흔적만 남기는 일이다.
const home = join(homedir(), '.companion');
const hands = [
  noteHand(join(home, '적어둔-것.md')),
  remindHand((afterMs, what) => {
    setTimeout(() => {
      companion.feed({ channel: 'web', kind: 'text', text: `(알림) 아까 알려달라고 한 것: ${what}`, at: Date.now() });
    }, afterMs).unref?.();
  }),
];

const brainName = process.env.COMPANION_BRAIN ?? 'claude';
const brain =
  brainName === 'claude' ? claudeCliBrain({ handsNote: describeHands(hands) })
  : brainName === 'assistant' ? assistantBrain()
  : echoBrain;
const port = Number(process.env.COMPANION_PORT ?? '4615');
const clockMs = Number(process.env.COMPANION_CLOCK_MS ?? '0');
const screenMs = Number(process.env.COMPANION_SCREEN_MS ?? '120000');
const cooldownMs = Number(process.env.COMPANION_COOLDOWN_MS ?? '90000');
const memoryFile = process.env.COMPANION_MEMORY_FILE?.trim();

// 인격 = 파일 하나. 비우면(COMPANION_CHARACTER=none) 아무도 아닌 채로 답한다.
const characterName = process.env.COMPANION_CHARACTER ?? '무명';
const character = characterName === 'none' ? undefined : loadCharacter(join(root, 'characters', `${characterName}.md`));

// 기억은 기본으로 남는다 — 껐다 켤 때마다 초면이면 인격체가 아니라 도구다.
const conversationPath = memoryFile ?? join(home, 'conversation.jsonl');
const notePath = join(home, '아는-것.md');

const memory =
  conversationPath === 'none'
    ? new InMemoryMemory()
    : new DistillingMemory({
        inner: new JsonlFileMemory(conversationPath),
        // 졸이는 일도 같은 두뇌가 한다. 두뇌가 못 하면(가짜 두뇌) 아는 것은 안 쌓인다.
        distill: brainDistiller((prompt) => (brain.ask ? brain.ask(prompt) : Promise.resolve(null))),
        every: Number(process.env.COMPANION_DISTILL_EVERY ?? '24'),
        notePath,
        log: (m) => console.log(`[기억] ${m}`),
      });
// 상주 창으로 띄울 때는 여기서 브라우저를 열지 않는다 — 아래에서 창째로 띄운다.
const desktop = process.env.COMPANION_DESKTOP !== '0';
// 지킴이가 창을 따로 띄우는 경우처럼, 브라우저를 아예 열면 안 되는 자리도 있다.
// (이 구분이 없으면 되살아날 때마다 브라우저 창이 하나씩 쌓인다.)
const openBrowserToo = process.env.COMPANION_OPEN !== '0' && desktop === false;

const web = webBody({
  port,
  open: openBrowserToo,
  log: (m) => console.log(m),
  // 창을 새로 열면 지난 대화를 그대로 되찾는다 — 화면은 기억을 따로 안 들고 있는다.
  history: () => memory.recent(80),
  longTerm: () => memory.longTerm?.() ?? null,
  // 목소리는 서버에서 만든다 — 이 컴퓨터에 깔린 한국어 목소리는 옛날 것 하나뿐이다.
  speech: edgeSpeech({ rate: process.env.COMPANION_VOICE_RATE ?? '-4%' }),
  // 오프라인 받아쓰기 — KarmoLab 이 이미 갖고 있던 것을 그대로 빌려 쓴다.
  ears: whisperEars({
    exePath: process.env.COMPANION_EARS_EXE
      ?? join(root, '..', '..', 'apps', 'karmolab-tauri', 'target', 'release', 'karmolab-life-ml.exe'),
    modelDir: process.env.COMPANION_WHISPER_MODEL
      ?? join(root, '..', '..', '..', 'memo', 'life', '.models', 'whisper-small'),
    log: (m) => console.log(`[귀] ${m}`),
  }),
});

const bodies = [web];
if (clockMs > 0) {
  // 몸은 감각 + 표현 한 쌍일 뿐이라, 이렇게 섞어 쓸 수 있다:
  // 시계로 느끼고, 웹 화면으로 말한다. 코어는 이 조합을 몰라도 된다.
  const clock = clockBody({ everyMs: clockMs });
  bodies.push({ name: clock.name, sense: clock.sense, voice: web.voice });
}
if (screenMs > 0) {
  // 화면을 보는 눈도 같은 방식으로 붙는다 — 눈은 여기, 입은 웹 창.
  bodies.push({
    name: 'screen',
    sense: screenSense({ everyMs: screenMs, log: (m) => console.log(m) }),
    voice: web.voice,
  });
}

const companion = new Companion({
  bodies,
  brain,
  memory,
  character,
  hands,
  attention: tactfulAttention({
    bypassChannels: ['web'],
    cooldownMs,
    stuckAfterMs: Number(process.env.COMPANION_STUCK_MS ?? '25000'),
    awayAfterMs: Number(process.env.COMPANION_AWAY_MS ?? '900000'),
  }),
  onCycle: (report) => {
    if (report.error) console.error(`[에러] ${report.error.message}`);
    else if (report.utterance) console.log(`[말함] ${report.utterance.text.slice(0, 60)}`);
    else console.log(`[참음] ${report.decision.reason}`);
  },
});

await companion.start();
if (desktop) {
  openPinnedWindow(`http://localhost:${port}`, {
    width: Number(process.env.COMPANION_WIDTH ?? '420'),
    height: Number(process.env.COMPANION_HEIGHT ?? '640'),
    transparent: process.env.COMPANION_TRANSPARENT !== '0',
  }).then((how) => console.log(`[창] ${how}`));
}
console.log(
  `두뇌=${brain.name} · 인격=${character?.name ?? '없음'} · ` +
    `화면보기=${screenMs > 0 ? `${screenMs / 1000}초마다` : '끔'} · ` +
    `혼잣말=${clockMs > 0 ? `${clockMs / 1000}초마다` : '끔'} · 끝내려면 Ctrl+C`,
);

process.on('SIGINT', async () => {
  await companion.stop();
  // 끄기 전에 한 번 접는다 — 방금 나눈 말이 「아는 것」에 안 남고 사라지지 않게.
  if (memory instanceof DistillingMemory) {
    console.log('[기억] 접는 중…');
    await memory.condense();
  }
  console.log('\n동반자 꺼짐.');
  process.exit(0);
});
