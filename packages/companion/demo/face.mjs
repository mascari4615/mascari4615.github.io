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
  anySpeech,
  edgeSpeech,
  piperReady,
  piperSpeech,
  noteHand,
  recallHand,
  fileCuriosity,
  wonderHand,
  maybeAsk,
  noticeCuriosity,
  needsPermission,
  findFileHand,
  openHand,
  windowsHand,
  clockHand,
  readNotesHand,
  fileInfoHand,
  remindHand,
  tactfulAttention,
  loadCharacter,
  loadCharacters,
  readMood,
  pickFiller,
  reflexFor,
  driftWarning,
  reasonToSpeak,
  nudgeSense,
  readRapport,
  avoidRepeats,
  recallFrom,
  openPinnedWindow,
  screenSense,
  webBody,
  whisperEars,
} from '../dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 손 — 말 말고 실제로 할 수 있는 일.
//
// 되돌릴 수 있거나 보기만 하는 일은 그냥 하고, 화면을 가로채는 일(열기)은 먼저 묻는다.
// 아무거나 실행하게 열어두지 않고 할 수 있는 일을 하나씩 쥐여주는 방식은 그대로다.
const home = join(homedir(), '.companion');
const notePath = join(home, '적어둔-것.md');

// 물어보고 기다리는 자리. 화면이 대답을 줄 때까지 붙잡아 둔다.
const waiting = new Map();
let asking = null;
const askFirst = {
  confirm(what) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      asking = { id, what };
      waiting.set(id, resolve);
      // 아무도 대답 안 하면 30초 뒤 「아니오」로 본다 — 영원히 매달려 있지 않게.
      setTimeout(() => {
        if (waiting.delete(id)) {
          if (asking?.id === id) asking = null;
          resolve(false);
        }
      }, 30_000).unref?.();
    });
  },
};

// 궁금한 것 — 지금 묻기엔 눈치 없는 것을 담아 뒀다가 조용할 때 하나씩 꺼낸다.
const curiosity = fileCuriosity(join(home, '궁금한-것.md'));

const hands = [
  noteHand(notePath),
  wonderHand(curiosity),
  readNotesHand(notePath),
  clockHand(),
  findFileHand(),
  windowsHand(),
  fileInfoHand(),
  needsPermission(openHand(), askFirst),
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

// 인격 = 폴더 안의 파일들. 고정이 아니라 창에서 갈아끼운다.
const charactersDir = join(root, 'characters');
const roster = loadCharacters(charactersDir);
const wanted = process.env.COMPANION_CHARACTER ?? '욘';
let character = wanted === 'none' ? undefined : (roster.find((c) => c.name === wanted) ?? roster[0]);

// 기억은 기본으로 남는다 — 껐다 켤 때마다 초면이면 인격체가 아니라 도구다.
const conversationPath = memoryFile ?? join(home, 'conversation.jsonl');
const knownPath = join(home, '아는-것.md');

const memory =
  conversationPath === 'none'
    ? new InMemoryMemory()
    : new DistillingMemory({
        inner: new JsonlFileMemory(conversationPath),
        // 졸이는 일도 같은 두뇌가 한다. 두뇌가 못 하면(가짜 두뇌) 아는 것은 안 쌓인다.
        distill: brainDistiller((prompt) => (brain.ask ? brain.ask(prompt) : Promise.resolve(null))),
        every: Number(process.env.COMPANION_DISTILL_EVERY ?? '24'),
        notePath: knownPath,
        log: (m) => console.log(`[기억] ${m}`),
      });
// 옛 대화를 뒤지는 손은 기억이 선 뒤에야 붙일 수 있다 — 뒤질 대상이 기억이기 때문이다.
// 두뇌에 넘어가는 건 최근 몇 마디뿐이라, 이게 없으면 「저번에 그거」를 영영 모른다.
const conversationMemory = memory instanceof DistillingMemory ? memory.inner : memory;
const canSearch = typeof conversationMemory?.search === 'function';

// 상주 창으로 띄울 때는 여기서 브라우저를 열지 않는다 — 아래에서 창째로 띄운다.
const desktop = process.env.COMPANION_DESKTOP !== '0';
// 지킴이가 창을 따로 띄우는 경우처럼, 브라우저를 아예 열면 안 되는 자리도 있다.
// (이 구분이 없으면 되살아날 때마다 브라우저 창이 하나씩 쌓인다.)
const openBrowserToo = process.env.COMPANION_OPEN !== '0' && desktop === false;

// 화면에서 본 창 제목 — 바뀌면 말 걸 이유가 된다.
let lastWindowTitle = null;
let shownWindowTitle = null;

// 마지막으로 낸 뜸과 그때의 기운 — 같은 뜸을 연달아 내지 않게.
let lastHum = null;
let lastReflex = null;
let lastEnergy = 0.5;

// 사람이 마지막으로 말을 건 시각. 화면 보기가 그 위로 끼어들지 않게 쓰인다.
let lastSpokenToAt = 0;

const web = webBody({
  port,
  open: openBrowserToo,
  log: (m) => console.log(m),
  // 창을 새로 열면 지난 대화를 그대로 되찾는다 — 화면은 기억을 따로 안 들고 있는다.
  history: () => memory.recent(80),
  longTerm: () => memory.longTerm?.() ?? null,
  // 잘못 알았거나 남기고 싶지 않은 것을 지운다. 깊게 지우면 대화 흔적까지 없앤다.
  forget: (what, alsoConversation) => {
    const known = memory.forgetKnown?.(what) === true;
    const conversation = alsoConversation && typeof conversationMemory?.forget === 'function'
      ? conversationMemory.forget(what)
      : 0;
    return { known, conversation };
  },
  // 목소리는 서버에서 만든다 — 이 컴퓨터에 깔린 한국어 목소리는 옛날 것 하나뿐이다.
  // 목소리 — 내 컴퓨터 것과 인터넷 것을 한 목록에 같이 올린다. 어느 쪽이 취향인지는
  // 코드가 아니라 사람이 정한다.
  speech: (() => {
    const piperRoot = process.env.COMPANION_PIPER_DIR
      ?? join(root, '..', '..', '..', 'memo', 'life', '.models', 'piper');
    const local = {
      exePath: join(piperRoot, 'piper', 'piper.exe'),
      // 같은 모델이라도 말 속도가 다르면 다른 사람처럼 들린다. 로컬 한국어 목소리가
      // 하나뿐이라 고를 게 없던 것을, 결이 다른 셋으로 갈라 둔다.
      voices: {
        '느긋한': join(piperRoot, 'ko-espeak.onnx'),
        '보통': join(piperRoot, 'ko-espeak.onnx'),
        '또렷한': join(piperRoot, 'ko-espeak.onnx'),
      },
      lengthScaleFor: { '느긋한': 1.22, '보통': 1.05, '또렷한': 0.92 },
      log: (m) => console.log(`[목소리] ${m}`),
    };
    const engines = [];
    if (piperReady(local)) {
      const localSpeech = piperSpeech(local);
      // 첫 호출이 느린 게 하필 처음 말 걸었을 때 온다 — 미리 데워 둔다.
      localSpeech.warmUp?.().then(() => console.log('[목소리] 미리 데워 뒀다'));
      engines.push({ label: '내 컴퓨터', speech: localSpeech });
    }
    engines.push({
      label: '인터넷',
      speech: edgeSpeech({
        rate: process.env.COMPANION_VOICE_RATE ?? '-4%',
        // 밝고 높은 결 = 애니 쪽. 낮고 느린 결 = 나른한 쪽. 취향은 골라 쓰라고 둘 다 둔다.
        tones: {
          '밝게': { rate: '+8%', pitch: '+22Hz' },
          '아주 밝게': { rate: '+16%', pitch: '+45Hz' },
          '나른하게': { rate: '-14%', pitch: '-12Hz' },
        },
      }),
    });
    console.log(`[목소리] ${engines.map((e) => e.label).join(' + ')}`);
    return anySpeech(engines);
  })(),

  // 오프라인 받아쓰기 — KarmoLab 이 이미 갖고 있던 것을 그대로 빌려 쓴다.
  characters: {
    list: () => roster,
    current: () => companion.character?.name ?? null,
    switchTo: (name) => {
      const found = roster.find((c) => c.name === name);
      if (found === undefined) return false;
      companion.setCharacter(found);
      console.log(`[인격] ${found.name} 이(가) 됐다`);
      return true;
    },
  },
  // 3D 몸 — 게임 저장소 안의 메시를 그 자리에서 읽는다 (복사본 X).
  models: {
    '욘': process.env.COMPANION_MODEL_YON
      ?? join(root, '..', '..', '..', 'WitchMendokusai', 'Assets', '_WitchMendokusai',
              'Domain', 'NPC', 'Human', 'Yawn', 'Mesh', 'Ver2', 'Yawn2.fbx'),
  },
  // 어떤 머리를 쓸지도 창에서 고른다. 빠른 쪽·깊은 쪽이 필요한 때가 다르다.
  permission: {
    pending: () => asking,
    answer: (id, yes) => {
      const resolve = waiting.get(id);
      if (resolve === undefined) return false;
      waiting.delete(id);
      if (asking?.id === id) asking = null;
      resolve(yes);
      return true;
    },
  },
  brains: {
    list: () => ['haiku', 'sonnet', 'opus'],
    current: () => (brain.currentModel ? brain.currentModel() : '(고정)'),
    switchTo: (name) => {
      if (brain.useModel === undefined) return false;
      if (['haiku', 'sonnet', 'opus'].includes(name) === false) return false;
      brain.useModel(name);
      console.log(`[머리] ${name} 로 바꿨다`);
      return true;
    },
  },
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
// 스스로 말 걸기 — 시간이 아니라 이유로 깨운다. 이유가 없으면 조용하다.
if (process.env.COMPANION_NUDGE !== '0') {
  bodies.push({
    name: 'nudge',
    sense: nudgeSense({
      everyMs: Number(process.env.COMPANION_NUDGE_MS ?? '300000'),
      reason: () => reasonToSpeak({
        sinceTalkedMs: lastSpokenToAt === 0 ? null : Date.now() - lastSpokenToAt,
        wondering: curiosity.next(),
        windowTitle: lastWindowTitle,
        lastWindowTitle: shownWindowTitle,
        hour: new Date().getHours(),
      }),
      log: (m) => console.log(`[먼저] ${m}`),
    }),
    voice: web.voice,
  });
}

if (screenMs > 0) {
  // 화면을 보는 눈도 같은 방식으로 붙는다 — 눈은 여기, 입은 웹 창.
  bodies.push({
    name: 'screen',
    sense: screenSense({
      everyMs: screenMs,
      // 사람이 방금 말을 걸었으면 이번 차례는 건너뛴다 — 화면 보기가 대답을 늦춘다.
      okToLook: () => Date.now() - lastSpokenToAt > 30_000,
      log: (m) => console.log(m),
    }),
    voice: web.voice,
  });
}

const companion = new Companion({
  bodies,
  brain,
  memory,
  character,
  hands,
  // 내가 말을 걸면 하던 말을 멈춘다 — 계속 떠드는 건 대화가 아니다.
  interruptChannels: ['web'],
  // 생각 없이 답해도 되는 말은 여기서 끝낸다 — 즉답이고 할당량도 안 먹는다.
  reflex: (sensation) => {
    if (sensation.channel !== 'web') return null;
    const quick = reflexFor(sensation.text, { energy: lastEnergy, last: lastReflex });
    if (quick !== null) lastReflex = quick;
    return quick;
  },
  // 답이 늦으면 먼저 뜸을 낸다. 같은 지연도 뜸이 있으면 절반쯤으로 느껴진다.
  filler: () => {
    const hum = pickFiller({ energy: lastEnergy, last: lastHum });
    lastHum = hum;
    return hum;
  },
  fillerAfterMs: Number(process.env.COMPANION_FILLER_MS ?? '700'),
  // 옛 대화는 **매번 자동으로** 찾아 붙인다. 두뇌더러 필요하면 찾으라고 하는 방식은
  // 안내를 조여도, 인격을 빼도 안 썼다(실측 2회). 판단에 안 맡긴다.
  recall: canSearch ? recallFrom((word, limit) => conversationMemory.search(word, limit)) : undefined,
  // 기분 — 시간대·혼자 있던 시간·최근 대화량으로 흐른다. 매번 같은 결로 말하지 않게.
  mood: (recent) => {
    const lastTalk = [...recent].reverse().find((e) => e.role === 'sensed' && e.channel === 'web');
    const hourAgo = Date.now() - 60 * 60_000;
    const turns = recent.filter((e) => e.role === 'sensed' && e.channel === 'web' && e.at > hourAgo).length;
    const mood = readMood({
      hour: new Date().getHours(),
      sinceTalkedMs: lastTalk ? Date.now() - lastTalk.at : null,
      recentTurns: turns,
    });
    // 이 사람이 꺼낸 얘기 중 아직 모르는 것을 자동으로 담아 둔다.
    // 두뇌더러 궁금해하라고 시키는 방식은 안 먹혔다(실측) — 판단에 안 맡긴다.
    const last = [...recent].reverse().find((e) => e.role === 'sensed' && e.channel === 'web');
    if (last) noticeCuriosity(last.text, memory.longTerm?.() ?? null, curiosity);
    // 가끔 담아 둔 궁금증을 하나 꺼낸다 — 매번 꺼내면 취조가 된다.
    // 사이가 얼마나 가까워졌는지도 함께 넘긴다 — 첫날과 백일째가 같으면 관계가 아니다.
    // 며칠에 걸쳐 얼마나 만났는지를 봐야 하므로 대화를 넉넉히 읽는다.
    const wholeStory = typeof conversationMemory?.recent === 'function'
      ? conversationMemory.recent(4000)
      : recent;
    lastEnergy = mood.energy;
    const rapport = readRapport(wholeStory);
    // 얘가 저도 모르게 조수 말투로 샜으면 그걸 짚어 준다. 안 짚으면 자기 말을
    // 따라 하며 굳는다 — 기억에 남은 자기 말이 다음 재료가 되기 때문이다.
    return [rapport.note, mood.note, driftWarning(recent), avoidRepeats(recent), maybeAsk(curiosity)]
      .filter(Boolean)
      .join('\n');
  },
  attention: tactfulAttention({
    bypassChannels: ['web'],
    cooldownMs,
    stuckAfterMs: Number(process.env.COMPANION_STUCK_MS ?? '25000'),
    awayAfterMs: Number(process.env.COMPANION_AWAY_MS ?? '900000'),
  }),
  onCycle: (report) => {
    if (report.sensation.channel === 'web') lastSpokenToAt = Date.now();
    // 화면에서 읽은 창 제목을 기억해 둔다 — 바뀌었는지 알아야 말 걸 이유가 생긴다.
    const seen = report.sensation.meta?.windowTitle;
    if (typeof seen === 'string' && seen !== '') lastWindowTitle = seen;
    if (report.sensation.channel === 'nudge') shownWindowTitle = lastWindowTitle;
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
