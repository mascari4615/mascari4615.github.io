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
  clonedSpeech,
  EpisodeStore,
  episodeNote,
  KnownStamps,
  말걸어도되나,
  자리결,
  tossBackNote,
  되물은비율,
  갓알게된것,
  InMemoryMemory,
  JsonlFileMemory,
  landingNote,
  feelingNote,
  People,
  peopleNote,
  StatedStore,
  statedNote,
  findConflicts,
  SelfImage,
  expressionNote,
  toneOf,
  Wishes,
  wishNote,
  reactionTo,
  Heart,
  findTease,
  teaseNote,
  readResume,
  readTender,
  tenderNote,
  recurringThings,
  runningGagNote,
  whileAway,
  whileAwayNote,
  resumeNote,
  milestoneNote,
  firstMetNote,
  asksAboutFirstMeeting,
  autoUse,
  isRealBargeIn,
  기본힌트,
  loadHands,
  madeUpFact,
  madeUpRetryNote,
  unbackedClaim,
  claimRetryNote,
  hollowReason,
  hollowRetryNote,
  mouthGate,
  Playing,
  Quiet,
  Tally,
  Settings,
  settingsReport,
  Troubles,
  troublesReport,
  tallyReport,
  Watching,
  watchNote,
  asksForQuiet,
  asksToResume,
  findCorrection,
  applyCorrection,
  correctionNote,
  quietNote,
  retryNote,
  TOUCH_CHANNEL,
  TouchCount,
  touchKindOf,
  touchReply,
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
  dayMark,
  avoidanceWarning,
  reasonToSpeak,
  nudgeSense,
  readRapport,
  asksAboutSelf,
  composeIngredients,
  stripExpression,
  tangentFor,
  rutWarning,
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

// 파일로 더한 손 — 코드를 안 고치고 늘린다. 정해진 갈래(읽기)만 되고 아무거나 실행 못 한다.
const { hands: 파일손, hints: 파일힌트 } = loadHands(join(home, 'hands'), { log: (m) => console.log(`[손] ${m}`) });

const hands = [
  ...파일손,
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
  brainName === 'claude' ? claudeCliBrain({ handsNote: describeHands(hands), alwaysNote: expressionNote() })
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

/* 「아는 것」의 줄마다 **언제부터 알던 것인지**를 따로 들고 있는다.
   목록 자체에 날짜를 섞어 적으면 다음에 졸일 때 그 날짜까지 재료가 되어 굳는다. */
/* 감정이 실린 순간만 따로 남긴다 — 졸인 사실 목록에서는 사건이 통째로 사라진다.
   「지난주에 발표 망했다고 속상해했다」가 「발표를 했다」로 줄거나 아예 빠진다. */
const 그때그일 = new EpisodeStore({ path: join(home, '그때-그-일.json') });

const 언제알았나 = new KnownStamps({ path: join(home, '아는-것-언제.json') });
언제알았나.sync(memory.longTerm?.() ?? null);
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
let lastTouch = null;
const playing = new Playing();
// 조용히 있기 — 「좀 있다 얘기해」라고 말할 수 있게. 밤(23~7시)도 조용한 시간이다.
// 발동 기록 — 만든 게 실제로 도는지 센다. 「도는지 모름」과 「스무 번 중 0번」은 다른 말이다.
const tally = new Tally({ path: join(home, '발동-기록.json') });
// 잘못된 것 모으기 — 로그는 아무도 안 본다. 조수님이 볼 수 있어야 고쳐진다.
const troubles = new Troubles({ path: join(home, '잘못된-것.json') });
// 손댈 수 있는 설정 — 재시작 없이 먹는다. 파일이 정본이라 손으로 열어 고쳐도 된다.
const settings = new Settings({ path: join(home, '설정.json'), log: (m) => console.log(`[설정] ${m}`) });
// 같이 보기 — 무엇을 얼마나 붙들고 있는지.
const watching = new Watching();
const quiet = new Quiet({
  // 설정이 정본이다 — 창에서 바꾸면 재시작 없이 먹는다.
  fromHour: () => Number(settings.get('조용한시간시작')),
  toHour: () => Number(settings.get('조용한시간끝')),
});
// 흔들리는 마음 — 사건이 밀고 시간이 되돌린다.
const heart = new Heart();
let 직전에한말 = null;
// 켜진 뒤 첫 turn 인가 — 끊김은 그때 한 번만 본다.
const 시작한때 = Date.now();
let 첫turn인가 = true;
// 바라는 것 — 얘 몫으로 가진 작은 바람. 조르지 않는다.
const wishes = new Wishes();
// 자기상 — 얘가 저에 대해 이미 한 말. 조수님에 대해 아는 것과 다른 자리다.
// 곁의 사람들 — 조수님이 얘기하는 다른 사람들. 두 번 나와야 인정한다.
const people = new People({
  path: join(home, '곁의-사람들.json'),
  log: (m) => console.log(`[사람] ${m}`),
});
// 직접 들은 것 — 얘가 졸여 만든 짐작보다 무겁다. 자기상의 짝이다.
const stated = new StatedStore({
  path: join(home, '직접-들은-것.json'),
  log: (m) => console.log(`[들은것] ${m}`),
});
const selfImage = new SelfImage({
  path: join(home, '나에-대해-한-말.json'),
  log: (m) => console.log(`[자기상] ${m}`),
});
const touchCount = new TouchCount();
let lastEnergy = 0.5;

// 사람이 마지막으로 말을 건 시각. 화면 보기가 그 위로 끼어들지 않게 쓰인다.
let lastSpokenToAt = 0;

const web = webBody({
  // 마음이 목소리에 닿는 자리. 처지면 느리고 낮게, 들뜨면 빠르고 높게.
  /* 밤엔 목소리도 밤답게.
     결은 지금까지 **기분에서만** 왔다. 그런데 사람은 기분과 상관없이 밤엔 낮춰 말한다.
     조용한 시간엔 마음이 어떻든 누그러진 결로 말한다 — 「조용히 있어 달라」고 부탁받은
     동안도 마찬가지다. 결 자체는 이미 있던 것을 쓴다(밤 전용 결을 새로 만들면 칸만 는다). */
  tone: () => (quiet.inQuietHours || quiet.hushed ? '누그러짐' : toneOf(heart.state)),
  // 만든 게 실제로 도는지 볼 수 있게. /tally 로 연다.
  tally: () => {
    /* 「되묻게 했다」는 만든 사람 말이고 **몇 번 중 몇 번인가**가 결과다. 재료만 얹어
       놓고 됐다고 하지 않으려고 같이 센다 — 오늘만 그런 자리를 셋 찾았다. */
    const 최근 = typeof conversationMemory?.recent === 'function' ? conversationMemory.recent(200) : [];
    const 되물음 = 되물은비율(Array.isArray(최근) ? 최근 : []);
    const 줄 = 되물음.전체 === 0
      ? '되물음 — 잰 말 없음'
      : `되물음 ${되물음.되물음}/${되물음.전체} (${Math.round((되물음.되물음 / 되물음.전체) * 100)}%)`;
    return `${줄}

${tallyReport(tally)}`;
  },
  troubles: () => troublesReport(troubles),
  settings: () => settingsReport(settings),
  putSettings: (next) => settings.put(next),
  // 얼굴 신호를 유도할 재료. 생김새는 다른 세션이 이 신호를 받아 쓴다.
  feeling: () => heart.state,
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
  speech: await (async () => {
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
    /* 흉내 낸 목소리 — 참고 음성을 바꾸면 목소리 자체가 바뀐다.
       이 컴퓨터에서 도는 별도 프로그램이 떠 있을 때만 목록에 나온다. 안 떠 있는데
       목록에만 있으면, 골랐다가 아무 소리도 안 나는 게 제일 나쁘다.
       세우는 법 = `node memo/scripts/setup-cloned-voice.mjs`, 띄우면 목록에 저절로 붙는다. */
    const 흉내 = clonedSpeech({
      refAudioPath: process.env.COMPANION_CLONE_REF
        ?? join(root, '..', '..', '..', 'memo', 'life', '.models', 'tsukuyomi', 'ref.wav'),
      refText: process.env.COMPANION_CLONE_REF_TEXT
        ?? 'また、東寺のように、五大明王と呼ばれる、主要な明王の中央に配されることも多い。',
      label: '흉내 낸 목소리',
    });
    // **떠 있으면 이걸 기본으로 쓴다.** 맨 앞이 곧 기본이다 — 인터넷 목소리보다 느리지만
    // 「원하는 목소리」가 「빠른 목소리」를 이긴다(조수님 결정). 안 떠 있으면 목록에도 안
    // 나오고, 그땐 자동으로 다음 것이 기본이 된다.
    if (await 흉내.alive()) {
      engines.unshift({ label: '흉내', speech: 흉내 });
      console.log('[목소리] 흉내 낸 목소리를 기본으로 쓴다');
    }

    engines.push({
      label: '인터넷',
      // 손으로 적어 둔 결(「밝게」·「나른하게」)은 걷어냈다. 목록만 네 배로 부풀리고
      // 고를 이유가 없었다 — 결은 그때그때 마음에서 나온다.
      speech: edgeSpeech({ rate: process.env.COMPANION_VOICE_RATE ?? '-4%' }),
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
// 닿는 것 — 감각은 웹 창이 보내 주고(몸에 손이 닿는 자리가 거기다) 입은 같은 창이다.
// 몸을 따로 두는 이유는 통로를 갈라야 「말」과 「닿음」이 안 섞이기 때문이다.
bodies.push({ name: TOUCH_CHANNEL, sense: { name: '닿음', start() {} }, voice: web.voice });

// 스스로 말 걸기 — 시간이 아니라 이유로 깨운다. 이유가 없으면 조용하다.
if (process.env.COMPANION_NUDGE !== '0') {
  bodies.push({
    name: 'nudge',
    sense: nudgeSense({
      everyMs: Number(process.env.COMPANION_NUDGE_MS ?? '300000'),
      reason: () => {
        // 조용히 있으라고 했으면 먼저 걸지 않는다. 물으면 답하는 건 그대로다.
        if (settings.on('먼저말걸기') === false) return null;
        if (quiet.maySpeakFirst === false) return null;
        /* 지금이 어떤 자리인지 보고 입을 연다. 통화 중에 끼어드는 건 그냥 사고다.
           모르는 창이면 말을 건다 — 몸을 사리면 얘는 영영 조용해진다. */
        const 자리 = 말걸어도되나(lastWindowTitle);
        if (자리.된다 === false) {
          console.log(`[먼저] 참았다 — ${자리.왜}`);
          return null;
        }
        // 하루의 매듭은 다른 어떤 이유보다 먼저다 — 오늘 처음 만난 순간은 한 번뿐이다.
        const 매듭 = dayMark(typeof conversationMemory?.recent === 'function' ? conversationMemory.recent(4000) : []);
        if (매듭 !== null) return { why: 매듭.note, key: `${매듭.kind}-${new Date().toDateString()}` };
        // 바라는 것은 **다른 이유가 없을 때만**, 하루에 한 번만 슬쩍. 조르면 잔소리가 된다.
        const 있는이유 = reasonToSpeak({
          sinceTalkedMs: lastSpokenToAt === 0 ? null : Date.now() - lastSpokenToAt,
          wondering: curiosity.next(),
          windowTitle: lastWindowTitle,
          lastWindowTitle: shownWindowTitle,
          hour: new Date().getHours(),
        });
        if (있는이유 !== null) return 있는이유;

        const 바람 = wishes.nudge(typeof conversationMemory?.recent === 'function' ? conversationMemory.recent(600) : []);
        return 바람 === null ? null : { why: `${바람} — 이 마음을 조르지 말고 한 번만 슬쩍 흘려라.`, key: `바람-${new Date().toDateString()}` };
      },
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

// 입 앞의 관문. 새면 한 번만 다시 시키고, 그래도 새면 짧게 넘긴다 —
// 새는 말을 하느니 「…」 한 글자가 낫다. 다만 입을 다물지는 않는다(침묵은 고장처럼 보인다).
// 얼굴 표(`[처짐]`)는 **기억에 남기기 전에** 지워야 한다.
//
// 창 쪽에서도 지우고 있었지만, 기억에 남기는 일은 그보다 **먼저** 일어난다. 그래서 실제로
// 「[처짐] …또 붙들었네.」가 통째로 대화에 저장됐다(실측 31회차). 저장된 표는 다음 번
// 재료가 되어 얘가 제 표를 흉내 내게 되고, 소리로도 「대괄호 처짐 대괄호」를 읽는다.
const 표떼기 = (text) => stripExpression(text).text || text;
// 이번 turn 에 실제로 쓴 손. core 가 알려 준다.
let 쓴손 = [];
// 이번에 찾아본 것 — 「안 보고 지어낸 값」을 가리는 데 쓴다.
let 찾은것 = [];

const mouth = mouthGate({
  // 텅 빈 대꾸도 다시 시킨다 — 짧은 건 인격이지만 **연달아** 알맹이가 없으면 벽이다.
  alsoRetryWhen: (text) => unbackedClaim(text, 쓴손)
    ?? madeUpFact(text, 찾은것, conversationMemory.recent(12))
    ?? hollowReason(text, conversationMemory.recent(40)),
  // 왜 다시 시키는지에 따라 시키는 말이 다르다 — 「결에서 벗어났다」와 「알맹이가 없다」는
  // 고칠 데가 다르다.
  retry: (why) => {
    const 말 = why.includes('안 하고') ? claimRetryNote(why)
      : why.includes('안 보고') ? madeUpRetryNote(why)
      : why.includes('알맹이 없는') ? hollowRetryNote(why)
      : retryNote(why);
    return brain.ask ? brain.ask(말) : Promise.resolve(null);
  },
  log: (m) => {
    console.log(`[입] ${m}`);
    if (m.startsWith('입 앞에서 걸렀다')) troubles.hit('걸림', m.replace('입 앞에서 걸렀다 ', ''));
  },
});

const companion = new Companion({
  bodies,
  brain,
  memory,
  character,
  hands,
  // 내가 말을 걸면 하던 말을 멈춘다 — 계속 떠드는 건 대화가 아니다.
  interruptChannels: ['web'],
  // 맞장구는 말을 끊으려는 게 아니다 — 「응」 한마디에 하던 말이 잘리면 안 된다.
  urgentWhen: (sensation) => isRealBargeIn(sensation.text),
  // 생각 없이 답해도 되는 말은 여기서 끝낸다 — 즉답이고 할당량도 안 먹는다.
  reflex: (sensation) => {
    // 닿은 것은 말이 아니다 — 두뇌를 부르지 않고 그 자리에서 대꾸한다.
    const 어떻게 = touchKindOf(sensation);
    if (어떻게 !== null) {
      const 몇번째 = touchCount.bump(sensation.at);
      heart.felt(어떻게 === '쓰다듬' ? '쓰다듬김' : 어떻게 === '흔듦' ? '끌려다님' : 몇번째 > 4 ? '자꾸찔림' : '쿡찔림');
      const 대꾸 = touchReply(어떻게, { times: 몇번째, last: lastTouch });
      lastTouch = 대꾸;
      return 대꾸;
    }
    if (sensation.channel !== 'web') return null;
    // 조용히 해 달라는 부탁은 그 자리에서 받는다 — 두뇌를 기다리면 그 사이에 또 떠든다.
    if (asksToResume(sensation.text) && quiet.hushed) {
      quiet.resume();
      return '…응, 다시 얘기하자.';
    }
    const 부탁 = asksForQuiet(sensation.text);
    if (부탁 !== null) {
      quiet.hushFor(부탁.ms);
      return 부탁.says;
    }
    // 노는 중에는 두뇌를 안 부른다 — 3초 뒤에 오는 「사과!」는 이미 놀이가 아니다.
    const 놀이 = playing.hear(sensation.text);
    if (놀이 !== null) {
      heart.felt(/내가 이겼다/.test(놀이.say) ? '놀이이김' : /내가 졌다/.test(놀이.say) ? '놀이짐' : '같이놂', 0.6);
      return 놀이.say;
    }
    const quick = reflexFor(sensation.text, { energy: lastEnergy, last: lastReflex });
    if (quick !== null) lastReflex = quick;
    return quick;
  },
  // 입 앞의 관문 — 새는 말은 말하기 전에 잡는다. 기억에 남기기도 전이다.
  beforeSpeak: async (text, ctx) => {
    // 안 한 걸 했다고 말하는 것 — 여기서 잡는다. 손을 실제로 썼는지는 core 만 안다.
    쓴손 = ctx.usedHands ?? [];
    찾은것 = ctx.found ?? [];
    // **손도 센다.** 재료만 세고 손은 안 세면 「손을 안 쓴다」가 관찰 두 번짜리 인상으로
    // 남는다(41회차가 그랬다). 어느 손이 죽었는지는 세어 봐야 안다.
    for (const h of hands) tally.mark(`손:${h.name}`, 쓴손.includes(h.name) ? '실림' : '꺼짐');
    return 표떼기(await mouth(표떼기(text), ctx) ?? '');
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
  // 옛 대화 찾기 **와** 손 미리 쓰기가 같은 자리에 있다.
  //
  // 두뇌더러 표를 적어 손을 부르라고 하면 인격과 부딪혀 아예 안 쓴다(42회차: 0/10).
  // 그래서 조수님 말을 보고 **우리가** 필요한 손을 미리 쓴다 — 판단을 두뇌에 안 맡긴다.
  recall: async (sensation, recent) => {
    const 옛것 = canSearch
      ? recallFrom((word, limit) => conversationMemory.search(word, limit))(sensation, recent)
      : [];
    if (sensation.channel !== 'web') return 옛것;
    // **파일로 더한 손의 힌트가 먼저다.** 사람이 「이럴 때 쓰라」고 적어 둔 것이니
    // 우리가 코드에 박아 둔 것보다 앞선다.
    const 미리쓴것 = await autoUse(sensation.text, hands, {
      hints: [...파일힌트, ...기본힌트],
      log: (m) => {
        console.log(`[손] ${m}`);
        if (m.includes('못 썼다')) troubles.hit('못함', m);
      },
    });
    for (const 줄 of 미리쓴것) tally.mark(`손:${줄.split(':')[0]}`, '실림');
    return [...옛것, ...미리쓴것];
  },
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
    // 하루의 매듭은 여기 안 넣는다. 사람이 먼저 말을 건 자리에서는 지난 얘기가 이미
    // 기억에 있어 저절로 나오고, 매듭 문구를 얹으면 오히려 답이 짧아졌다(실측 2회).
    // 매듭은 「얘가 먼저 말 거는」 자리에서만 쓴다 — 거기선 대체할 게 없다.
    const rapport = readRapport(wholeStory);
    // 얘가 저도 모르게 조수 말투로 샜으면 그걸 짚어 준다. 안 짚으면 자기 말을
    // 따라 하며 굳는다 — 기억에 남은 자기 말이 다음 재료가 되기 때문이다.
    // 무엇이 통했는지 — 인격을 고쳐 쓰지 않고 보여만 준다.
    // 재료를 **다 넣지 않는다.** 열한 줄을 늘 얹었더니 재료가 인격보다 길어졌고(실측 737자
    // vs 610자), 지시가 늘수록 얘가 몸을 사린다(15·23회차). 지금 필요한 것만 예산 안에서
    // 고르고, 중요한 둘을 앞뒤로 놓는다 — 가운데는 흐려진다.
    const 방금한말 = last?.text ?? '';
    const 아는사람 = people.known;
    // 힘들어 보이면 가벼운 재료를 **한 자리에서** 끈다. 재료마다 따로 붙이면 새것을 넣을
    // 때마다 빠뜨리고, 그게 바로 「길어질수록 안전장치가 흐려지는」 모양이다.
    const 조심 = readTender(wholeStory);
    /* 두뇌에 실제로 뭐가 들어가는지 눈으로 본다 (`COMPANION_SHOW_MATERIAL=1`).
       「대화가 되는 느낌이 아니다」가 **모델 탓인지 재료 탓인지**는 재료를 봐야 갈린다 —
       발동 기록은 무엇이 실렸는지만 알려 주지 그 글이 어떻게 생겼는지는 안 보여 준다. */
    const 보여줄까 = process.env.COMPANION_SHOW_MATERIAL === '1';
    const 만든것 = composeIngredients([
      /* 방금 알게 된 것 — 예전부터 알던 척을 막는다.
         2분 전에 처음 들은 걸 「예전부터 알았잖아」라고 하면, 사람은 그 순간 얘가
         아무것도 기억 못 한다는 걸 안다. 아는 척이 기억보다 더 크게 티가 난다. */
      // 말을 걸기로 한 뒤에도 자리에 맞게 굴어야 한다 — 만드는 중인 사람에게 긴
      // 얘기를 늘어놓으면, 말 건 것 자체는 괜찮아도 방해가 된다.
      // 이어지는 옛 일이 있으면 꺼낸다. 없으면 아무 말도 안 얹는다 — 늘 붙이면
      // 「기억하는 척」이 되고 재료만 먹는다.
      { name: '그때그일', weight: 10, text: (() => {
        그때그일.learn(recent);
        return 방금한말 === '' ? '' : episodeNote(그때그일, 방금한말, Date.now());
      })() },
      /* 공을 돌려주기 — 답만 하면 대답이지 대화가 아니다.
         무겁게 둔다. 밀리면 그냥 「대화가 식어 가는 채로」 끝난다. */
      { name: '공돌려주기', weight: 13, text: tossBackNote({ recent, 방금: 방금한말 }) },
      { name: '자리', weight: 11, text: 자리결(lastWindowTitle) },
      { name: '갓안것', weight: 12, text: (() => {
        // 매 turn 맞춘다. 새 줄이 생겼을 때만 파일에 남으므로 값이 싸다 — 갱신 시점을
        // 따로 챙기려다 빠뜨리면 날짜가 통째로 어긋난다.
        const 아는것 = memory.longTerm?.() ?? null;
        언제알았나.sync(아는것);
        return 갓알게된것(아는것, 언제알았나, Date.now());
      })() },
      // 늘 있어야 하는 것 — 지금 어떤 상태인가.
      // 틀렸다고 하면 그게 가장 먼저다 — 우기는 것보다 나쁜 게 없다.
      { name: '고침', weight: 13, text: (() => {
        // 재시작 직후엔 직전에 한 말이 비어 있다 — 그때는 기억에서 읽는다.
        // 안 그러면 창을 새로 연 뒤 첫 「아니야」가 통째로 무시된다(실측 33회차).
        const 마지막말 = 직전에한말 ?? [...recent].reverse().find((e) => e.role === 'said');
        const 고칠것 = findCorrection(방금한말, 마지막말);
        if (고칠것 === null) return '';
        const 지운것 = applyCorrection(고칠것, (key) => memory.forgetKnown?.(key) === true);
        if (지운것.length > 0) console.log(`[고침] 아는 것에서 지웠다: ${지운것.join(', ')}`);
        return correctionNote(고칠것, 지운것);
      })() },
      // 조용히 있으라는 건 무엇보다 먼저다 — 이걸 놓치면 방해가 된다.
      { name: '조용', text: quietNote(quiet), weight: 12 },
      { name: '보는것', text: watchNote(watching, Date.now()), weight: 6 },
      // 조심할 자리는 **가장 무겁다.** 예산에 밀려 빠지면 아무 소용이 없다.
      { name: '조심', text: tenderNote(조심), weight: 14 },
      // 직접 들은 것은 짐작보다 무겁다 — 어긋나면 이쪽을 따르라고 못 박는다.
      { name: '들은것', weight: 11, text: statedNote(
        stated.all,
        findConflicts(stated.all, memory.longTerm?.() ?? null),
      ) },
      { name: '기분', text: mood.note, weight: 9 },
      { name: '마음', text: feelingNote(heart.state), weight: 8 },
      // 샜을 때만 켜지는 것들. 원래 조건부라 무게가 높아도 안전하다.
      { name: '표류', text: driftWarning(recent), weight: 10 },
      { name: '회피', text: avoidanceWarning(recent), weight: 10 },
      // 얘 말 흐름을 보는 것들은 **넓은 창**을 본다. 좁은 창(최근 10개)에는 두뇌가 지은
      // 말이 서넛도 안 들어 있어, 판단이 서기도 전에 늘 「빔」이 된다(실측 36회차).
      { name: '말버릇', text: rutWarning(wholeStory), weight: 10 },
      // 자기 얘기를 물었을 때만 — 안 물었는데 「전에 이렇게 말했다」를 늘 얹을 이유가 없다.
      { name: '자기상', text: selfImage.note(), weight: 7, when: asksAboutSelf(방금한말) },
      // 그 사람 얘기가 나왔을 때만.
      { name: '곁의사람', text: peopleNote(아는사람), weight: 6,
        when: 아는사람.some((p) => 방금한말.includes(p.name.slice(0, 2))) },
      // 오늘이 이정표인 날에만. 자랑하지 말라고 못 박아 뒀다.
      { name: '이정표', text: milestoneNote(wholeStory), weight: 8, when: 조심.soft === false },
      // 처음 만난 때는 **물었을 때만** — 안 물었는데 꺼내면 그것도 자랑이다.
      { name: '처음만남', text: firstMetNote(wholeStory), weight: 7,
        when: asksAboutFirstMeeting(방금한말) },
      // 재미는 저절로 생기지 않는다 — 놀릴 거리를 준다. 쓸지 말지는 얘가 정한다.
      { name: '놀리기', text: teaseNote(findTease(방금한말, wholeStory)), weight: 5, when: 조심.soft === false && settings.on('놀리기') },
      // 끊겼다 이어지는 자리 — **첫 turn 에만** 본다. 매번 얹으면 재료 과밀이다.
      // 끊김은 **켜지기 전까지의 기억**으로 잰다.
      //
      // core 는 방금 들어온 말을 기억에 먼저 넣고 이 자리를 부른다. 그래서 통째로 넘기면
      // 「마지막 대화 = 방금」이 되어 **늘 「이어짐」**이 된다 — 실제로 그래서 안 켜졌다
      // (실측 46회차: 문턱을 1초로 낮춰도 빔이었다).
      { name: '이어짐', weight: 6, text: 첫turn인가
        ? resumeNote(readResume(
            wholeStory.filter((e) => e.at < 시작한때),
            시작한때,
            { sameBreathMs: Number(process.env.COMPANION_RESUME_MS ?? '180000') },
          ))
        : '' },
      // 자리를 비운 동안 곁에서 본 것 — 돌아온 첫 turn 에만.
      { name: '비운동안', weight: 5, text: (() => {
        if (첫turn인가 === false) return '';
        const 끊김 = readResume(wholeStory.filter((e) => e.at < 시작한때), 시작한때);
        if (끊김.gap === '처음' || 끊김.gap === '이어짐') return '';
        return whileAwayNote(whileAway(wholeStory, 시작한때 - 끊김.awayMs, 시작한때));
      })() },
      // 우리끼리 자꾸 나오는 얘기 — 농담으로 만들라고 시키지는 않는다.
      { name: '단골얘기', text: runningGagNote(recurringThings(wholeStory)), weight: 3, when: 조심.soft === false },
      { name: '사이', text: rapport.note, weight: 4 },
      /* **사람이 실제로 반응한 것.** 가중치가 최하위(3)라 194번 밀리고 13번만 실렸다
         — 발동 기록으로 확인. 그런데 이건 「무슨 말이 통했나」라는, 이 사람한테만
         해당하는 되먹임이다. 아무 데서도 못 얻는 재료가 가장 먼저 밀리고 있었다.
         내용이 있을 때가 40% 뿐이라(빔 264) 늘 자리를 먹지도 않는다. */
      { name: '통한말', text: landingNote(recent), weight: 12 },

      { name: '궁금', text: maybeAsk(curiosity), weight: 5, when: 조심.soft === false && settings.on('놀리기') },
      // 대화가 마를 때만 — 잘 굴러가면 끼어들 이유가 없다.
      { name: '화제', weight: 7, when: 조심.soft === false, text: tangentFor(wholeStory, {
        wondering: curiosity.next(),
        sawWindow: lastWindowTitle,
        quietPerson: people.whoToAskAbout(Date.now())?.name ?? null,
        wish: wishes.unmet(recent)[0]?.what ?? null,
      }) },
      /* 담을 자리. 재료가 열두 개일 때 정한 값을 스무 개가 된 지금까지 쓰고 있었다 —
         새 재료를 넣을 때마다 예전 것이 **조용히** 밀렸고, 그건 발동 기록을 봐야만
         보였다. 재료가 는 만큼만 늘린다(420자·5줄 → 520자·6줄). 더 늘리면 29회차에
         고쳤던 「재료 과밀」로 되돌아간다. */
    ], { maxChars: 520, maxLines: 6, mark: (name, fate) => tally.mark(name, fate) });
    if (보여줄까) {
      console.log('[재료]');
      for (const 줄 of 만든것.split('\n')) console.log(`  · ${줄}`);
    }
    return 만든것;
  },
  attention: tactfulAttention({
    // 닿은 것은 나한테 직접 한 짓이다 — 「지금 바쁘신 것 같아 참았다」가 말이 안 된다.
    bypassChannels: ['web', TOUCH_CHANNEL],
    cooldownMs,
    stuckAfterMs: Number(process.env.COMPANION_STUCK_MS ?? '25000'),
    awayAfterMs: Number(process.env.COMPANION_AWAY_MS ?? '900000'),
  }),
  onCycle: (report) => {
    if (report.sensation.channel === 'web') {
      lastSpokenToAt = Date.now();
      // 방금 한 말에 조수님이 어떻게 반응했나 — 웃어 준 건 마음에 남아야 한다.
      const 잰것 = 직전에한말 === null ? null : reactionTo(직전에한말, {
        role: 'sensed', channel: 'web', text: report.sensation.text, at: report.sensation.at,
      });
      if (잰것 !== null) heart.felt(잰것.landed
        ? (잰것.why === '웃었다' ? '웃어줌' : 잰것.why === '되물었다' ? '되물음' : '받아줌')
        : (잰것.why === '한 마디로 넘겼다' ? '시들함' : '무시당함'));
    }
    if (report.utterance) void Promise.resolve(conversationMemory.recent(40)).then((es) => {
      selfImage.learn(es);
      stated.learn(es);
      people.learn(es);
    }).catch(() => {});
    // **사람이 말을 건 turn 만 첫 turn 을 소모한다.**
    //
    // 처음엔 아무 turn 이나 세었더니 화면 곁눈질이 먼저 돌아 첫 turn 을 써 버렸다 —
    // 조수님이 말을 걸기도 전에 끊김 알림이 꺼졌다(실측 45회차: 12분 끊고 켰는데 「빔」).
    if (report.sensation.channel === 'web') 첫turn인가 = false;
    if (report.utterance) 직전에한말 = { role: 'said', channel: 'web', text: report.utterance.text, at: report.utterance.at };
    // 화면에서 읽은 창 제목을 기억해 둔다 — 바뀌었는지 알아야 말 걸 이유가 생긴다.
    const seen = report.sensation.meta?.windowTitle;
    if (typeof seen === 'string' && seen !== '') {
      lastWindowTitle = seen;
      watching.saw(seen, report.sensation.at);
    }
    if (report.sensation.channel === 'nudge') shownWindowTitle = lastWindowTitle;
    if (report.error) { console.error(`[에러] ${report.error.message}`); troubles.hit('죽음', report.error.message); }
    else if (report.utterance) console.log(`[말함] ${report.utterance.text.slice(0, 60)}`);
    else console.log(`[참음] ${report.decision.reason}`);
    if (process.env.COMPANION_HEART === '1') {
      const f = heart.state;
      console.log(`[마음] 좋음 ${f.valence.toFixed(2)} / 들뜸 ${f.arousal.toFixed(2)}`);
    }
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
