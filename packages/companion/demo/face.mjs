/**
 * 얼굴 데모 — 브라우저 창에 큐브로 나타난다.
 *
 *   node demo/face.mjs                        기본 두뇌 claude
 *   COMPANION_BRAIN=grok COMPANION_TOOLS=talk …
 *   COMPANION_BRAIN=echo …                    가짜 두뇌
 *
 *   COMPANION_PORT=4620            주소 (4615 는 yawnbot dev 웹훅이 쓴다)
 *   COMPANION_CLOCK_MS=60000       이 간격으로 스스로 깨어나 혼잣말 (0 = 끔)
 *   COMPANION_COOLDOWN_MS=45000    혼잣말 참는 간격
 *   COMPANION_MEMORY_FILE=<경로>   기억을 파일로
 */
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  Companion,
  DistillingMemory,
  clonedSpeech,
  EpisodeStore,
  episodeNote,
  reflection,
  reflectionNote,
  askReflection,
  askEnergy,
  KnownStamps,
  maySpeak,
  bySlotTone,
  whichSlot,
  learnSlot,
  askSlot,
  tossBackNote,
  tossBackRetryNote,
  skipReason,
  notReturned,
  isQuestion,
  repliedToInstruction,
  acceptLength,
  topicFirst,
  topicSkipReason,
  whichHead,
  attachHead,
  wasShort,
  followUpRatio,
  justLearned,
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
  defaultHint,
  loadHands,
  madeUpFact,
  madeUpRetryNote,
  unbackedClaim,
  promisedButSkipped,
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
  demandBoot,
  onDemand,
  sibling,
  repoCopies,
  lineStore,
  touchKind,
  touchStage,
  touchKindOf,
  touchReply,
  brainDistiller,
  pickBrain,
  parseBrainName,
  parseToolMode,
  listGrokLanes,
  workLane,
  talkLane,
  clockBody,
  describeHands,
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
  findFileHand,
  openHand,
  pressHand,
  windowsHand,
  clockHand,
  readNotesHand,
  fileInfoHand,
  remindHand,
  tactfulAttention,
  loadCharacter,
  loadCharacters,
  resolveCharacterDir,
  parseSurfaceName,
  readMood,
  pickFiller,
  reflexFor,
  reflexKind,
  reflexKinds,
  driftWarning,
  selfScore,
  severeDrift,
  dayMark,
  avoidanceWarning,
  reasonToSpeak,
  nudgeSense,
  readRapport,
  asksAboutSelf,
  composeIngredients,
  applyRarity,
  pendingThoughts,
  stripExpression,
  tangentFor,
  rutWarning,
  recallFrom,
  meaningMemory,
  measureWithSmallModel,
  openPinnedWindow,
  screenSense,
  webBody,
  discordBody,
  discordJs,
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

// 파일로 더한 손 — 코드를 안 고치고 늘린다. 정해진 kind(읽기)만 되고 아무거나 실행 못 한다.
const { hands: fileHand, hints: fileHint } = loadHands(join(home, 'hands'), { log: (m) => console.log(`[손] ${m}`) });

const hands = [
  ...fileHand,
  noteHand(notePath),
  wonderHand(curiosity),
  readNotesHand(notePath),
  clockHand(),
  findFileHand(),
  windowsHand(),
  fileInfoHand(),
  openHand(),
  /* 화면에서 본 것을 실제로 누른다 (121회차). 되돌릴 수 없는 손이라 사람 확인을 지난다 —
     번호는 화면 목록의 [번호] 그대로다. */
  pressHand(),
  remindHand((afterMs, what) => {
    setTimeout(() => {
      companion.feed({ channel: 'web', kind: 'text', text: `(알림) 아까 알려달라고 한 것: ${what}`, at: Date.now() });
    }, afterMs).unref?.();
  }),
];

let liveRoom = parseToolMode(process.env.COMPANION_TOOLS) === 'work' ? 'work' : 'talk';
function makeBrain(tools) {
  return pickBrain(parseBrainName(process.env.COMPANION_BRAIN), {
    tools,
    workDir: process.env.COMPANION_WORK_DIR,
    handsNote: describeHands(hands),
    alwaysNote: expressionNote(),
  });
}
let liveBrain = makeBrain(liveRoom === 'work' ? 'work' : 'talk');
const brain = {
  get name() { return liveBrain.name; },
  currentModel: () => liveBrain.currentModel ? liveBrain.currentModel() : '',
  useModel: (n) => liveBrain.useModel?.(n),
  setHandsNote: (n) => liveBrain.setHandsNote?.(n),
  abort: () => liveBrain.abort?.(),
  ask: (p) => (liveBrain.ask ? liveBrain.ask(p) : Promise.resolve(null)),
  think: (i) => liveBrain.think(i),
  thinkStream: (i, d, p) => (liveBrain.thinkStream ? liveBrain.thinkStream(i, d, p) : liveBrain.think(i)),
};
function enterRoom(id) {
  if (id !== 'work' && id !== 'talk') return false;
  if (id === liveRoom) return true;
  liveBrain.abort?.();
  liveRoom = id;
  liveBrain = makeBrain(id === 'work' ? 'work' : 'talk');
  console.log(`[방] ${id === 'work' ? '일 (코딩 CLI)' : '말 (곁에)'} 으로 들어왔다`);
  return true;
}
const port = Number(process.env.COMPANION_PORT ?? '4620');
const clockMs = Number(process.env.COMPANION_CLOCK_MS ?? '0');
const screenMs = Number(process.env.COMPANION_SCREEN_MS ?? '120000');
const cooldownMs = Number(process.env.COMPANION_COOLDOWN_MS ?? '90000');
const memoryFile = process.env.COMPANION_MEMORY_FILE?.trim();

// 인격 = 폴더. 이 저장소 밖 경로를 꽂아도 코어는 본문을 해석하지 않는다.
const charactersDir = resolveCharacterDir(root, process.env.COMPANION_CHARACTER_DIR);
const roster = loadCharacters(charactersDir);
const surface = parseSurfaceName(process.env.COMPANION_SURFACE);
const wanted = process.env.COMPANION_CHARACTER ?? '욘';
let character = wanted === 'none' ? undefined : (roster.find((c) => c.name === wanted) ?? roster[0]);

// 기억은 기본으로 남는다 — 껐다 켤 때마다 초면이면 인격체가 아니라 도구다.
const conversationPath = memoryFile ?? join(home, 'conversation.jsonl');
const knownPath = join(home, '아는-것.md');

const pageWorkMem = surface === 'page'
  ? new JsonlFileMemory(join(home, 'page-work.jsonl'))
  : null;
const pageTalkMem = surface === 'page'
  ? new JsonlFileMemory(join(home, 'page-talk.jsonl'))
  : null;
const memory =
  conversationPath === 'none'
    ? new InMemoryMemory()
    : surface === 'page'
    ? {
        remember(entry) { return (liveRoom === 'work' ? pageWorkMem : pageTalkMem).remember(entry); },
        recent(limit) { return (liveRoom === 'work' ? pageWorkMem : pageTalkMem).recent(limit); },
        search(word, limit) { return (liveRoom === 'work' ? pageWorkMem : pageTalkMem).search(word, limit); },
        forget(word) { return (liveRoom === 'work' ? pageWorkMem : pageTalkMem).forget(word); },
      }
    : new DistillingMemory({
        inner: new JsonlFileMemory(conversationPath),
        // 졸이는 일도 같은 두뇌가 한다. 두뇌가 못 하면(가짜 두뇌) 아는 것은 안 쌓인다.
        distill: brainDistiller((prompt) => (brain.ask ? brain.ask(prompt) : Promise.resolve(null))),
        every: Number(process.env.COMPANION_DISTILL_EVERY ?? '24'),
        notePath: knownPath,
        /* 조수님이 「이건 잊어」 한 줄들. 안 적어 두면 다음 번 졸이기가 그대로 되살린다 —
           그 얘기는 대화 기록에 남아 있으니까(114회차). */
        forgottenPath: join(home, '잊은-것.md'),
        log: (m) => console.log(`[기억] ${m}`),
      });

/* 「아는 것」의 줄마다 **언제부터 알던 것인지**를 따로 들고 있는다.
   목록 자체에 날짜를 섞어 적으면 다음에 졸일 때 그 날짜까지 재료가 되어 굳는다. */
/* 감정이 실린 순간만 따로 남긴다 — 졸인 사실 목록에서는 사건이 통째로 사라진다.
   「지난주에 발표 망했다고 속상해했다」가 「발표를 했다」로 줄거나 아예 빠진다. */
/* 낱말 표로는 사건을 못 줍는다는 걸 재서 알았다 — 사람 말 197개에 담긴 사건이 **둘**이었다.
   표가 놓친 말은 두뇌에게 물어본다. 다만 **말하는 길에서는 안 부른다**(답이 늦어진다) —
   한 turn 끝나고 따로 부른다. */
const episode = new EpisodeStore({
  path: join(home, '그때-그-일.json'),
  ask: askEnergy((prompt) => (brain.ask ? brain.ask(prompt) : Promise.resolve(null))),
  log: (m) => { console.log(`[그때] ${m}`); web?.noticed?.(`기억에 담았다 — ${m}`); },
});

const learnedAt = new KnownStamps({ path: join(home, '아는-것-언제.json') });
learnedAt.sync(memory.longTerm?.() ?? null);
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
/* 밀린 재료는 증발하지 않고 쌓인다 — 다음 turn 에 더 세게 겨룬다 (72회차).
   재료 만드는 자리가 쉰 곳인데 한 turn 에 실리는 건 여섯 줄뿐이라, 무게가 어중간한
   재료는 매 turn 독립 추첨에서 **영영** 안 실렸다. 만들어 놓고 안 붙인 것과 같았다. */
const queued = new pendingThoughts();
/** 되묻기를 입 앞에서 강제할까. 재 보려고 꺼 둘 수 있다. */
const forceFollowUp = process.env.COMPANION_TOSSBACK_RETRY !== '0';
/* 자리를 배운다 — 표가 모르는 창은 두뇌에게 물어 적어 둔다(78회차).
   지금 떠 있는 창을 세어 보니 아홉 중 여섯이 「모름」이었다. 표를 늘리는 건 답이 아니다 —
   사람이 쓰는 프로그램은 사람마다 다르다. 같은 창은 한 번만 물어보므로 값이 곧 0 에 준다. */
/* 되새김 — 오간 말에서 **바로 안 보이는 것**을 스스로 짚는다(79회차).
   여태 기억은 셋 다 「일어난 일」이었다. 그 위에 얹히는 것, 「그래서 뭐가 보이나」가 없었다.
   근거를 못 대는 것은 버린다 — 되새김은 헛것이 가장 잘 나오는 자리다. */
const reflected = new reflection({
  path: join(home, '보아-온-것.json'),
  ask: askReflection((prompt) => (brain.ask ? brain.ask(prompt) : Promise.resolve(null))),
  log: (m) => { console.log(`[되새김] ${m}`); web?.noticed?.(`되새겼다 — ${m}`); },
});
const slotKnowledge = new learnSlot({
  path: join(home, '무슨-자리.json'),
  ask: askSlot((prompt) => (brain.ask ? brain.ask(prompt) : Promise.resolve(null))),
  log: (m) => { console.log(`[자리] ${m}`); web?.noticed?.(m); },
});
// 잘못된 것 모으기 — 로그는 아무도 안 본다. 조수님이 볼 수 있어야 고쳐진다.
const troubles = new Troubles({ path: join(home, '잘못된-것.json') });
// 손댈 수 있는 설정 — 재시작 없이 먹는다. 파일이 정본이라 손으로 열어 고쳐도 된다.
const settings = new Settings({ path: join(home, '설정.json'), log: (m) => console.log(`[설정] ${m}`) });
// 같이 보기 — 무엇을 얼마나 붙들고 있는지.
const watching = new Watching();
const quiet = new Quiet({
  // 설정이 정본이다 — 창에서 바꾸면 재시작 없이 먹는다.
  fromHour: () => Number(settings.get('quietHourStart')),
  toHour: () => Number(settings.get('quietHourEnd')),
});
// 흔들리는 마음 — 사건이 밀고 시간이 되돌린다.
const heart = new Heart();
let previousUtterance = null;
/** 큰 머리를 끼웠으면 되돌릴 손. 안 되돌리면 한 turn 이 그 뒤 전부를 느리게 만든다. */
let headToRestore = null;
/** 지금이 공을 돌려줄 자리인가 — 재료 쪽과 관문 쪽이 **같은 자리에서** 판단하게. */
function shouldTossBack() {
  const recent2 = conversationMemory.recent(12);
  const list2 = Array.isArray(recent2) ? recent2 : [];
  const justNow = [...list2].reverse().find((e) => e.role === 'sensed' && e.channel === 'web')?.text ?? '';
  const reason2 = skipReason({ recent: list2, justNow: justNow });
  // **왜 안 하는지 남긴다.** 「빔」만 보이면 네 kind 중 어디서 빠졌는지 몰라 실험을
  // 다시 돌려야 한다 — 오늘 하루 같은 벽에 세 번 부딪혔다.
  if (reason2 !== null) (console.log(`[공] 안 돌려준다 — ${reason2}`), web.noticed(`공은 안 돌려준다 — ${reason2}`));
  return reason2 === null;
}
/** 지금이 받아 줄 자리인가 — 재료 쪽과 관문 쪽이 **같은 자리에서** 판단하게. */
function shouldAccept() {
  const recent3 = conversationMemory.recent(40);
  const list3 = Array.isArray(recent3) ? recent3 : [];
  const justNow2 = [...list3].reverse().find((e) => e.role === 'sensed' && e.channel === 'web')?.text ?? '';
  return acceptLength({ justNow: justNow2, recent: list3 }) !== '';
}
// 켜진 뒤 첫 turn 인가 — 끊김은 그때 한 번만 본다.
const startedAt = Date.now();
let isFirstTurn = true;
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
/* sibling 저장소에서 오는 것들 — 없으면 **없다고 말한다.** 조용히 빠지면 화면에서는
   「몸이 큐브로 바뀌고 로컬 목소리가 사라진」 것으로만 보이고, 그건 회귀로 읽힌다. */
function yonMesh() {
  const game = sibling('WitchMendokusai', 'Assets');
  if (game === null) {
    console.log('[몸] 게임 저장소를 이웃에서 못 찾았다 — 3D 몸 없이 큐브로 지낸다');
    return null;
  }
  return join(game, 'Assets', '_WitchMendokusai', 'Domain', 'NPC', 'Human', 'Yawn', 'Mesh', 'Ver2', 'Yawn2.fbx');
}

function sttBinary() {
  for (const root2 of [join(root, '..', '..'), ...repoCopies(join('apps', 'karmolab-tauri'))]) {
    for (const slot of ['release', 'debug']) {
      const exe = join(root2, 'apps', 'karmolab-tauri', 'target', slot, 'karmolab-life-ml.exe');
      if (existsSync(exe)) return exe;
    }
  }
  console.log('[귀] 받아쓰기 실행 파일을 못 찾았다 — 창 안 받아쓰기로 물러선다');
  return null;
}

/** 흉내 낸 목소리 서버(GPT-SoVITS)를 띄운다. 뜨는 데 30초쯤 걸린다 — 기다리지 않는다. */
let stubProcess = null;
let stubStopping = false;
const stubLog = join(home, '흉내-목소리.log');
function startStubServer() {
  const memo = sibling('memo', join('life', '.models'));
  if (memo === null) throw new Error('memo 저장소를 이웃에서 못 찾았다');
  const slot2 = join(memo, 'life', '.models', 'gpt-sovits');
  const python = join(slot2, '.venv', 'Scripts', 'python.exe');
  if (existsSync(python) === false) throw new Error(`파이썬을 못 찾았다 (${python})`);
  /* **나가는 말을 로그로 받는다.**
   *
   * 여태 `stdio: 'ignore'` 였다. 그래서 이게 죽어도 남는 게 하나도 없었다 — 화면에는
   * 「목소리가 안 나온다」로만 보이고 이유는 아무 데도 안 적혔다(2026-08-19 실측:
   * 부팅 한 시간 뒤 9880 도 안 떠 있고 파이썬 프로세스도 0개인데, 같은 명령을 손으로
   * 치니 멀쩡히 떴다 — 왜 죽었는지 알 방법이 없었다).
   *
   * 무음 실패는 없는 기능보다 나쁘다. 나가는 말을 파일에 받아 두고, 죽으면 마지막 몇
   * 줄을 그 자리에서 보여 준다 — 로그가 있어도 어디 있는지 모르면 없는 것과 같다. */
  mkdirSync(home, { recursive: true });
  const receiver = openSync(stubLog, 'w');
  stubProcess = spawn(python, ['api_v2.py', '-a', '127.0.0.1', '-p', '9880'], {
    cwd: slot2,
    detached: false,
    stdio: ['ignore', receiver, receiver],
    // 안 주면 검은 창이 하나 뜬다.
    windowsHide: true,
  });
  stubProcess.on('error', (e) => {
    stubProcess = null;
    console.log(`[목소리] 흉내 서버를 못 띄웠다: ${e.message}`);
  });
  stubProcess.on('exit', (code) => {
    stubProcess = null;
    // 우리가 끈 것은 사고가 아니다.
    if (stubStopping) { stubStopping = false; return; }
    console.log(`[목소리] 흉내 서버가 저 혼자 죽었다 (코드 ${code}) — 남긴 말: ${stubLog}`);
    for (const line of logTail(stubLog, 8)) console.log(`[목소리]   ${line}`);
  });
}

/** 로그 마지막 몇 줄. 죽은 이유는 대개 끝에 있다. */
function logTail(filePath, lineCount) {
  try {
    return readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line2) => line2.trim() !== '').slice(-lineCount);
  } catch {
    return [];
  }
}

function stopStubServer() {
  if (stubProcess === null) return;
  stubStopping = true;
  stubProcess.kill();
  stubProcess = null;
}

function stubReferenceAudio() {
  const memo = sibling('memo', join('life', '.models'));
  if (memo === null) return null;
  return join(memo, 'life', '.models', 'tsukuyomi', 'ref.wav');
}

function sttModel() {
  const memo = sibling('memo', join('life', '.models'));
  if (memo === null) return null;
  return join(memo, 'life', '.models', 'whisper-small');
}

/* 뜻으로 찾는 기억 — 낱말이 하나도 안 겹쳐도 옛 말을 부른다.
   모델은 처음 뜰 때 수십 초 걸리므로 **기다리지 않는다**: 준비될 때까지는 낱말 회상만
   나가고, 준비되면 그때부터 뜻 회상이 얹힌다. */
const meaning = surface === 'page'
  ? { find: async () => [], store: async () => {} }
  : new meaningMemory({
    path: join(home, '뜻-색인.json'),
    measure: measureWithSmallModel({ log: (m) => console.log(`[뜻] ${m}`) }),
    log: (m) => console.log(`[뜻] ${m}`),
  });

const touchCount = new TouchCount();
/* 미리 지어 둔 대꾸 창고 (89회차). 손으로 적은 표는 후보가 셋뿐이라 스무 번이면 또 돈다 —
   실측으로 얘가 한 말 320개 중 145개가 글자 그대로 반복이었다. 한가할 때 두뇌가 채워 두고,
   닿았을 때는 꺼내 쓴다(꺼내는 데 걸리는 시간 0). 비면 손으로 적은 표로 그냥 물러선다. */
/** 빈 자리가 남았을 때 다음 것을 잇는 간격. 첫 판에 스물한 자리를 채우는 속도를 정한다. */
const refillInterval = Number(process.env.COMPANION_STOCK_NEXT_MS ?? '20000');
const line3 = new lineStore({
  path: join(home, '지어-둔-대꾸.json'),
  whom: () => character?.name ?? null,
  personaText: () => character?.instruction ?? null,
  fetchBuilt: (prompt) => (brain.ask ? brain.ask(prompt) : Promise.resolve(null)),
  log: (m) => console.log(m),
});
/** 목소리 상태를 곁눈질하는 화면이 읽어 갈 수 있게 밖에 둔다. */
let stubBoot = null;
let voiceList = [];

const touchTone = { '쿡': '쿡 찔렸을 때', '흔듦': '붙잡혀 끌려다닐 때', '쓰다듬': '쓰다듬어질 때' };
const stageTone = ['처음 그랬을 때 — 조금 놀란 tone', '몇 번째라 익숙해진 tone', '계속 그래서 시들해진 tone'];
const reflexSituation = {
  '인사': '조수님이 인사를 건넸을 때 받는 인사',
  '작별': '조수님이 자러 가거나 나갈 때 하는 인사',
  '고마움': '조수님이 고맙다고 했을 때 하는 대꾸',
  '호응': '조수님 말에 짧게 맞장구치는 대꾸',
};
const energyTone = { droop: '축 처져서 나른한 tone', normal: '평소 tone', vivid: '기운이 도는 tone' };

/** 미리 채워 둘 자리 전부 — 어디에 무슨 말을 지어야 하는지. */
function slotsToFill() {
  const slot3 = [];
  for (const [kind, whatHappened] of Object.entries(touchTone)) {
    for (let stage = 0; stage < 3; stage += 1) {
      slot3.push({ key: touchKind(kind, stage), request: `너를 조수님이 ${whatHappened}, 너답게 툭 던지는 짧은 혼잣말. ${stageTone[stage]}.` });
    }
  }
  for (const kind2 of reflexKinds()) {
    for (const [tone, whichTone] of Object.entries(energyTone)) {
      slot3.push({ key: reflexKind(kind2, tone), request: `${reflexSituation[kind2]}. 너답게 짧게. ${whichTone}.` });
    }
  }
  return slot3;
}

/**
 * 한가할 때 대꾸를 지어 둔다. 못 지어도 그냥 넘어간다 — 기본 표가 있다.
 *
 * **한 번에 한 자리만.** 느린 두뇌를 스무 번 부르면 진짜 대답이 그 뒤에서 기다린다(8회차).
 * 대신 아직 빈 자리가 남아 있으면 다음 것을 곧 잇는다 — 스물한 자리를 긴 간격으로만
 * 돌면 정작 자주 쓰는 자리가 한참 동안 옛 표 그대로다.
 */
function prefillReply() {
  const empty = slotsToFill().filter((slot4) => line3.remaining(slot4.key) < 4);
  const thisOne = empty[0];
  if (thisOne === undefined) return;
  void line3.fill(thisOne.key, thisOne.request, 6).catch(() => {});
  if (empty.length > 1) setTimeout(prefillReply, refillInterval).unref();
}
let lastEnergy = 0.5;

// 사람이 마지막으로 말을 건 시각. 화면 보기가 그 위로 끼어들지 않게 쓰인다.
let lastSpokenToAt = 0;

const web = webBody({
  // 안 받은 소리도 센다 — 창에 띄우기만 하면 창을 안 볼 때 사라진다 (35회차).
  mark: (name, fate, why) => tally.mark(name, fate, why),
  // 마음이 목소리에 닿는 자리. 처지면 느리고 낮게, 들뜨면 빠르고 높게.
  /* 밤엔 목소리도 밤답게.
     결은 지금까지 **기분에서만** 왔다. 그런데 사람은 기분과 상관없이 밤엔 낮춰 말한다.
     조용한 시간엔 마음이 어떻든 누그러진 결로 말한다 — 「조용히 있어 달라」고 부탁받은
     동안도 마찬가지다. tone 자체는 이미 있던 것을 쓴다(밤 전용 결을 새로 만들면 칸만 는다). */
  tone: () => (quiet.inQuietHours || quiet.hushed ? '누그러짐' : toneOf(heart.state)),
  // 만든 게 실제로 도는지 볼 수 있게. /tally 로 연다.
  tally: () => {
    /* 「되묻게 했다」는 만든 사람 말이고 **몇 번 중 몇 번인가**가 결과다. 재료만 얹어
       놓고 됐다고 하지 않으려고 같이 센다 — 오늘만 그런 자리를 셋 찾았다. */
    const recent4 = typeof conversationMemory?.recent === 'function' ? conversationMemory.recent(200) : [];
    const followUp = followUpRatio(Array.isArray(recent4) ? recent4 : []);
    const line4 = followUp.all === 0
      ? '되물음 — 잰 말 없음'
      : `되물음 ${followUp.followUp}/${followUp.all} (${Math.round((followUp.followUp / followUp.all) * 100)}%)`;
    return `${line4}

${tallyReport(tally)}`;
  },
  troubles: () => troublesReport(troubles),
  /* 곁눈질하는 화면(KarmoLab 위젯)이 읽어 갈 것들. 오늘 사고 셋이 전부 「조용히 빠짐」
     이었다 — 기록에만 남는 상태는 아무도 안 본다. */
  state: () => ({
    persona: character?.name ?? null,
    head: brain.currentModel ? brain.currentModel() : brain.name,
    voices: voiceList,
    stubPrepare: stubBoot === null ? null : stubBoot.isReady,
    stubAuto: settings.on('애니목소리자동'),
  }),
  desk: () => ({
    brain: brain.name,
    tools: liveRoom === 'work' ? 'work' : 'talk',
    workDir: process.env.COMPANION_WORK_DIR?.trim() || process.cwd(),
    character: companion.character?.name ?? character?.name ?? null,
    room: liveRoom,
    lanes: [
      workLane('코딩 CLI · 손 있음'),
      talkLane('곁에 있기 · 손 없음'),
      ...listGrokLanes({ sessionId: process.env.GROK_SESSION_ID }),
    ],
  }),
  enterRoom,
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
    if (surface === 'page') {
      voiceList = ['인터넷'];
      console.log('[목소리] page 는 채팅이 먼저라 인터넷 목소리만 쓴다');
      return edgeSpeech({ rate: process.env.COMPANION_VOICE_RATE ?? '-4%' });
    }
    /* 로컬 목소리는 메모 저장소 안에 있다. 「여기서 세 겹 위」로 박아 두면 워크트리에서
       띄웠을 때 통째로 사라진다 — 실제로 목록에서 로컬 목소리가 없어졌다(실측). */
    const memoRoot = sibling('memo', join('life', '.models'));
    const piperRoot = process.env.COMPANION_PIPER_DIR
      ?? (memoRoot === null ? null : join(memoRoot, 'life', '.models', 'piper'));
    if (piperRoot === null) console.log('[목소리] 로컬 목소리 자리를 못 찾았다 (memo 저장소가 이웃에 없다) — 인터넷 목소리만 쓴다');
    const local = piperRoot === null ? null : {
      exePath: join(piperRoot, 'piper', 'piper.exe'),
      // 같은 모델이라도 말 속도가 다르면 다른 사람처럼 들린다. 로컬 한국어 목소리가
      // 하나뿐이라 고를 게 없던 것을, 결이 다른 셋으로 갈라 둔다.
      voices: {
        '느긋한': join(piperRoot, 'ko-espeak.onnx'),
        'normal': join(piperRoot, 'ko-espeak.onnx'),
        '또렷한': join(piperRoot, 'ko-espeak.onnx'),
      },
      lengthScaleFor: { '느긋한': 1.22, 'normal': 1.05, '또렷한': 0.92 },
      log: (m) => console.log(`[목소리] ${m}`),
    };
    const engines = [];
    if (local !== null && piperReady(local)) {
      const localSpeech = piperSpeech(local);
      // 첫 호출이 느린 게 하필 처음 말 걸었을 때 온다 — 미리 데워 둔다.
      localSpeech.warmUp?.().then(() => console.log('[목소리] 미리 데워 뒀다'));
      engines.push({ label: '내 컴퓨터', speech: localSpeech });
    }
    /* 흉내 낸 목소리 — 참고 음성을 바꾸면 목소리 자체가 바뀐다.
       이 컴퓨터에서 도는 별도 프로그램이 떠 있을 때만 목록에 나온다. 안 떠 있는데
       목록에만 있으면, 골랐다가 아무 소리도 안 나는 게 제일 나쁘다.
       세우는 법 = `node memo/scripts/setup-cloned-voice.mjs`, 띄우면 목록에 저절로 붙는다. */
    const stub = clonedSpeech({
      // 참고 음성도 메모 저장소 안에 있다 — 로컬 목소리·몸과 같은 병을 여기서도 끊는다.
      refAudioPath: process.env.COMPANION_CLONE_REF ?? stubReferenceAudio() ?? '',
      refText: process.env.COMPANION_CLONE_REF_TEXT
        ?? 'また、東寺のように、五大明王と呼ばれる、主要な明王の中央に配されることも多い。',
      label: '흉내 낸 목소리',
    });
    // **떠 있으면 이걸 기본으로 쓴다.** 맨 앞이 곧 기본이다 — 인터넷 목소리보다 느리지만
    // 「원하는 목소리」가 「빠른 목소리」를 이긴다(조수님 결정). 안 떠 있으면 목록에도 안
    // 나오고, 그땐 자동으로 다음 것이 기본이 된다.
    /* **쓸 때 켜고 안 쓰면 끈다** (사용자 결정 2026-08-08: 「부팅 기준이 아니라 쓸 때/안
       쓸 때 기준」). 뜨는 데 30초쯤 걸리므로 기다리지 않는다 — 준비될 때까지는 대타가
       말한다. 목록에는 늘 보인다: 꺼졌다고 목록에서 빼면 그게 「사라졌다」로 읽힌다. */
    stubBoot = new demandBoot({
      name: '흉내 낸 목소리',
      isAlive: () => stub.alive(),
      show: () => startStubServer(),
      stop: () => stopStubServer(),
      stopIfIdleMs: () => Number(settings.get('애니목소리쉬는분')) * 60_000,
      isAuto: () => settings.on('애니목소리자동'),
      log: (m) => console.log(`[목소리] ${m}`),
    });
    // 쉬는지 살피는 자리. 값이 0 이면 아무 일도 안 한다.
    setInterval(() => void stubBoot.stopIfIdle().catch(() => {}), 60_000).unref();

    if (stubReferenceAudio() !== null || process.env.COMPANION_CLONE_REF) {
      engines.unshift({
        label: '흉내',
        // 고른 목소리로만 말한다 — 준비될 때까지 기다린다(조수님 결정: 대타 금지).
        speech: onDemand({ real: stub, boot: stubBoot, log: (m) => console.log(`[목소리] ${m}`) }),
      });
      console.log(
        (await stub.alive())
          ? '[목소리] 흉내 낸 목소리를 기본으로 쓴다 (이미 떠 있다)'
          : '[목소리] 흉내 낸 목소리를 기본으로 쓴다 — 아직 안 떠 있어 첫 마디는 뜰 때까지 기다린다',
      );
    } else {
      /* **없어진 걸 없어졌다고 말한다.** 여태 안 떠 있으면 목록에서 조용히 빠졌고, 그건
         화면에서 「목소리가 회귀했다」로만 보였다(실측 2026-08-08). 오늘 사고 셋(로컬
         목소리·3D 몸·창)이 전부 이 모양이었다 — 조용한 소실. */
      console.log('[목소리] 흉내 낼 참고 음성을 못 찾았다 (memo 저장소가 이웃에 없다) — 인터넷/내 컴퓨터 목소리로 간다');
    }

    engines.push({
      label: '인터넷',
      // 손으로 적어 둔 tone(「밝게」·「나른하게」)은 걷어냈다. 목록만 네 배로 부풀리고
      // 고를 이유가 없었다 — 결은 그때그때 마음에서 나온다.
      speech: edgeSpeech({ rate: process.env.COMPANION_VOICE_RATE ?? '-4%' }),
    });
    voiceList = engines.map((e) => e.label);
    console.log(`[목소리] ${voiceList.join(' + ')}`);
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
    // 몸은 게임 저장소 안에 있다 — 사본을 만들지 않고 그 자리에서 읽는다.
    '욘': process.env.COMPANION_MODEL_YON ?? yonMesh() ?? '',
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
    exePath: process.env.COMPANION_EARS_EXE ?? sttBinary() ?? '',
    modelDir: process.env.COMPANION_WHISPER_MODEL ?? sttModel() ?? '',
    log: (m) => console.log(`[귀] ${m}`),
  }),
});

const bodies = [web];

/* 관객이 있는 자리 — 토큰을 주면 디스코드에도 몸이 선다(코어는 그대로다).
   **토큰이 없으면 그렇다고 말한다.** 조용히 안 붙으면 「왜 디스코드에서 아무 말도 없지」가
   되고, 오늘 사고 셋이 전부 그 모양이었다. */
const discordToken = process.env.COMPANION_DISCORD_TOKEN?.trim();
if (discordToken) {
  try {
    const attach = await discordJs({ token: discordToken, log: (m) => console.log(`[디코] ${m}`) });
    bodies.push(
      discordBody({
        attach: attach,
        // 여기서만 듣는다. 안 정하면 들어오는 모든 방 — 남의 방에 끼어들지 않게 정해 두는 편이 낫다.
        channels: process.env.COMPANION_DISCORD_CHANNELS?.split(',').map((x) => x.trim()).filter(Boolean),
        log: (m) => console.log(`[디코] ${m}`),
      }),
    );
  } catch (e) {
    console.log(`[디코] 못 붙었다 — 디스코드 몸 없이 간다: ${e?.message ?? e}`);
  }
} else {
  console.log('[디코] 토큰이 없어 디스코드 몸은 안 선다 (COMPANION_DISCORD_TOKEN)');
}
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
        if (settings.on('speakFirst') === false) return null;
        if (quiet.maySpeakFirst === false) return null;
        /* 지금이 어떤 자리인지 보고 입을 연다. 통화 중에 끼어드는 건 그냥 사고다.
           모르는 창이면 말을 건다 — 몸을 사리면 얘는 영영 조용해진다. */
        const slot5 = maySpeak(lastWindowTitle);
        if (slot5.ok === false) {
          console.log(`[먼저] 참았다 — ${slot5.why}`);
          return null;
        }
        // 하루의 매듭은 다른 어떤 이유보다 먼저다 — 오늘 처음 만난 순간은 한 번뿐이다.
        const knot = dayMark(typeof conversationMemory?.recent === 'function' ? conversationMemory.recent(4000) : []);
        if (knot !== null) return { why: knot.note, key: `${knot.kind}-${new Date().toDateString()}` };
        // 바라는 것은 **다른 이유가 없을 때만**, 하루에 한 번만 슬쩍. 조르면 잔소리가 된다.
        const presentReason = reasonToSpeak({
          sinceTalkedMs: lastSpokenToAt === 0 ? null : Date.now() - lastSpokenToAt,
          wondering: curiosity.next(),
          windowTitle: lastWindowTitle,
          lastWindowTitle: shownWindowTitle,
          hour: new Date().getHours(),
        });
        if (presentReason !== null) return presentReason;

        const wish2 = wishes.nudge(typeof conversationMemory?.recent === 'function' ? conversationMemory.recent(600) : []);
        return wish2 === null ? null : { why: `${wish2} — 이 마음을 조르지 말고 한 번만 슬쩍 흘려라.`, key: `바람-${new Date().toDateString()}` };
      },
      log: (m) => console.log(`[먼저] ${m}`),
    }),
    voice: web.voice,
  });
}

// 눈. 스스로 보기도 하고(감각), 물으면 지금 보이는 것을 내주기도 한다(99회차 이후).
let eye = null;
if (screenMs > 0) {
  // 화면을 보는 눈도 같은 방식으로 붙는다 — 눈은 여기, 입은 웹 창.
  eye = screenSense({
    everyMs: screenMs,
    // 사람이 방금 말을 걸었으면 이번 차례는 건너뛴다 — 화면 보기가 대답을 늦춘다.
    okToLook: () => Date.now() - lastSpokenToAt > 30_000,
    freshMs: Number(process.env.COMPANION_SEEING_FRESH_MS ?? '20000'),
    log: (m) => console.log(m),
  });
  bodies.push({ name: 'screen', sense: eye, voice: web.voice });
}

// 입 앞의 관문. 새면 한 번만 다시 시키고, 그래도 새면 짧게 넘긴다 —
// 새는 말을 하느니 「…」 한 글자가 낫다. 다만 입을 다물지는 않는다(침묵은 고장처럼 보인다).
// 얼굴 표(`[droop]`)는 **기억에 남기기 전에** 지워야 한다.
//
// 창 쪽에서도 지우고 있었지만, 기억에 남기는 일은 그보다 **먼저** 일어난다. 그래서 실제로
// 「[droop] …또 붙들었네.」가 통째로 대화에 저장됐다(실측 31회차). 저장된 표는 다음 번
// 재료가 되어 얘가 제 표를 흉내 내게 되고, 소리로도 「대괄호 droop 대괄호」를 읽는다.
const stripMarks = (text) => stripExpression(text).text || text;
// 이번 turn 에 실제로 쓴 손. core 가 알려 준다.
let writer = [];
// 이번에 찾아본 것 — 「안 보고 지어낸 값」을 가리는 데 쓴다.
let found2 = [];

const mouth = mouthGate({
  // 텅 빈 대꾸도 다시 시킨다 — 짧은 건 인격이지만 **연달아** 알맹이가 없으면 벽이다.
  alsoRetryWhen: (text) => severeDrift(text)
    /* **심하게 샌 말은 나가기 전에 막는다** (127회차). 표류 감시는 원래 「다음 번에 일러
       주기」라 말투 미세 표류에는 그게 맞지만, 「저는 Claude인데…」 같은 건 다음 번엔 늦다 —
       그 말이 이미 조수님한테 간 뒤다. 여기서 막는 건 누구인지·어느 세계 말인지 둘뿐이다. */
    ?? unbackedClaim(text, writer)
    /* 「누를게」라고 말만 하고 안 누른 것도 여기서 잡는다 — 122회차 라이브에서 실제로
       그랬다(「이거 누를게… 누르고 올게…」 그리고 아무것도 안 눌렀다). */
    ?? promisedButSkipped(text, writer)
    ?? madeUpFact(text, found2, conversationMemory.recent(12))
    ?? hollowReason(text, conversationMemory.recent(40))
    /* 공을 안 돌려준 것도 여기서 잡는다. **재료로는 안 밀렸다** — 큰 머리로 바꿔도,
       인격을 빼도 0/3 이었다(실측). 여섯 줄 중 한 줄로는 안 되고, 여기서는 그 한 가지만
       말하므로 묻히지 않는다.
       **자리 판단은 여기서 다시 한다.** 재료 만들 때 정한 값을 모듈 변수로 넘겨 뒀더니
       그 사이 다른 바퀴(화면 곁눈질 등)가 덮어써서 관문이 한 번도 안 걸렸다(실측: 재료는
       7번 실렸는데 관문은 0번). 같은 값을 두 곳에서 들고 있으면 반드시 어긋난다. */
    /* 지시문한테 대꾸한 말은 사람한테 하는 말이 아니다. **다시 시킬수록 잘 나온다** —
       다시 시킨다는 게 지시문을 하나 더 얹는 일이기 때문이다. 그래서 여기서 잡는다. */
    ?? repliedToInstruction(text)
    /* 되묻기 강제를 껐다 켤 수 있게 둔다 — **이게 얘를 낫게 하는지 재려면 꺼 봐야 한다.**
       87회차에 강제 재시도가 원래 멀쩡하던 답을 무대 뒤 얘기로 바꿔 놓는 걸 두 번 봤다. */
    ?? (forceFollowUp ? notReturned(text, shouldTossBack()) : null)
    /* 길게 털어놨는데 한마디로 끊은 것도 여기서 잡는다. **시켜 놓고 안 세면 재료만 얹고
       끝난다** — 실측으로 얘 답은 사람이 1자를 쓰든 50자를 쓰든 가운데값 6~7자였다. */
    ?? wasShort(text, shouldAccept()),
  /* 아쉬울 뿐인 것과 해로운 것을 가른다. 지어낸 사실·조수 말투는 버리는 게 맞지만,
     짧거나 안 되물은 말은 얼버무림보다 낫다 — 막는 자리가 답을 더 나쁘게 만들면 안 된다. */
  isMerelyRegret: (why) => /한마디로 끊었다|되묻지 않았다/.test(why),
  // 왜 다시 시키는지에 따라 시키는 말이 다르다 — 「결에서 벗어났다」와 「알맹이가 없다」는
  // 고칠 데가 다르다.
  retry: (why) => {
    // **다시 시켰다는 것 자체가 안 보였다.** 걸러진 것만 기록에 남아서, 「다시 시켰는데
    // 또 안 됐다」와 「애초에 안 걸렸다」를 구분할 수가 없었다.
    console.log(`[입] 다시 시킨다 — ${why}`);
    const text2 = why.includes('무대 뒤') || why.includes('자료처럼')
        ? '방금 하려던 말은 **조수님이 아니라 내가 받은 지시문한테 하는 말**이었다. 그 말은 버려라. 무대 뒤 얘기(대화 기록·맥락·뭘 원하는지)는 절대 꺼내지 말고, 조수님한테 사람으로서 한마디 해라. 짧아도 된다.'
      : why.includes('한마디로 끊었다')
        ? '조수님이 길게 털어놨거나 감정을 실어 말했다. **한마디로 끊지 마라** — 되받아 주고 하나는 되물어라. 두세 마디면 된다.'
      : why.includes('식어 가는데') ? tossBackRetryNote()
      : why.includes('안 하고') ? claimRetryNote(why)
      : why.includes('안 보고') ? madeUpRetryNote(why)
      : why.includes('알맹이 없는') ? hollowRetryNote(why)
      : retryNote(why);
    return brain.ask ? brain.ask(text2) : Promise.resolve(null);
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
    const how2 = touchKindOf(sensation);
    if (how2 !== null) {
      const index = touchCount.bump(sensation.at);
      heart.felt(how2 === '쓰다듬' ? '쓰다듬김' : how2 === '흔듦' ? '끌려다님' : index > 4 ? '자꾸찔림' : '쿡찔림');
      const reply = touchReply(how2, { times: index, last: lastTouch, store: line3 });
      lastTouch = reply;
      return reply;
    }
    if (sensation.channel !== 'web') return null;
    // 조용히 해 달라는 부탁은 그 자리에서 받는다 — 두뇌를 기다리면 그 사이에 또 떠든다.
    if (asksToResume(sensation.text) && quiet.hushed) {
      quiet.resume();
      return '…응, 다시 얘기하자.';
    }
    const request = asksForQuiet(sensation.text);
    if (request !== null) {
      quiet.hushFor(request.ms);
      return request.says;
    }
    // 노는 중에는 두뇌를 안 부른다 — 3초 뒤에 오는 「사과!」는 이미 놀이가 아니다.
    const game2 = playing.hear(sensation.text);
    if (game2 !== null) {
      heart.felt(/내가 이겼다/.test(game2.say) ? '놀이이김' : /내가 졌다/.test(game2.say) ? '놀이짐' : '같이놂', 0.6);
      return game2.say;
    }
    const quick = reflexFor(sensation.text, { energy: lastEnergy, last: lastReflex, store: line3 });
    if (quick !== null) lastReflex = quick;
    return quick;
  },
  // 입 앞의 관문 — 새는 말은 말하기 전에 잡는다. 기억에 남기기도 전이다.
  beforeSpeak: async (text, ctx) => {
    if (surface === 'page') return stripMarks(text);
    // 안 한 걸 했다고 말하는 것 — 여기서 잡는다. 손을 실제로 썼는지는 core 만 안다.
    writer = ctx.usedHands ?? [];
    found2 = ctx.found ?? [];
    // **손도 센다.** 재료만 세고 손은 안 세면 「손을 안 쓴다」가 관찰 두 번짜리 인상으로
    // 남는다(41회차가 그랬다). 어느 손이 죽었는지는 세어 봐야 안다.
    for (const h of hands) tally.mark(`손:${h.name}`, writer.includes(h.name) ? 'loaded' : 'off');
    return stripMarks(await mouth(stripMarks(text), ctx) ?? '');
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
  /* 되돌릴 수 없는 손은 여기서 묻는다 — 손마다 감싸지 않고 한 자리에서.
     30초 안에 대답이 없으면 「아니오」다(askFirst 가 그렇게 만들어져 있다). */
  askBeforeRisky: {
    allow: (hand, request) => askFirst.confirm(`${hand.name}: ${request.argument}`),
  },
  // 눈은 매 turn 뜬다 — 「화면에 뭐 보여?」에 창 제목으로 답하던 자리(99회차 라이브).
  // 묵었으면 눈이 알아서 다시 찍는다.
  seeing: eye === null ? undefined : () => eye.seeing(),
  recall: async (sensation, recent) => {
    const old = canSearch
      ? recallFrom((word, limit) => conversationMemory.search(word, limit))(sensation, recent)
      : [];
    /* 낱말로 못 찾은 것을 뜻으로 한 번 더 — 「매운 거 싫어」와 「마라탕은 못 먹어」는
       낱말이 하나도 안 겹친다. 둘을 합치되 같은 말은 한 번만. */
    try {
      const byMeaning = await meaning.find(sensation.text, {
        count: 2,
        toDrop: new Set([...recent.map((e) => e.text), ...old]),
      });
      for (const r of byMeaning) {
        old.push(r.text);
        console.log(`[뜻] 닮은 옛말 (${r.similar.toFixed(2)}): ${r.text.slice(0, 40)}`);
      }
    } catch (e) {
      console.error(`[뜻] 찾다 죽었다 — ${e?.message ?? e}`);
    }
    if (sensation.channel !== 'web') return old;
    // **파일로 더한 손의 힌트가 먼저다.** 사람이 「이럴 때 쓰라」고 적어 둔 것이니
    // 우리가 코드에 박아 둔 것보다 앞선다.
    const prewritten = await autoUse(sensation.text, hands, {
      hints: [...fileHint, ...defaultHint],
      log: (m) => {
        console.log(`[손] ${m}`);
        if (m.includes('못 썼다')) troubles.hit('못함', m);
      },
    });
    for (const line5 of prewritten) tally.mark(`손:${line5.split(':')[0]}`, 'loaded');
    return [...old, ...prewritten];
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
    const justSaid = last?.text ?? '';
    const knownPerson = people.known;
    // 힘들어 보이면 가벼운 재료를 **한 자리에서** 끈다. 재료마다 따로 붙이면 새것을 넣을
    // 때마다 빠뜨리고, 그게 바로 「길어질수록 안전장치가 흐려지는」 모양이다.
    const caution = readTender(wholeStory);
    /* **무거운 자리에서만 큰 머리를 쓴다**(84회차). 같은 말에 작은 머리는 14자, 큰 머리는
       33자에 되묻기까지 나왔다 — 인격 탓도 재료 탓도 아니고 작은 머리가 못 따르는 것이었다.
       그렇다고 늘 큰 머리를 쓰면 첫 소리까지의 시간을 되돌리는 셈이다.
       **먼저 지난 turn 의 것을 되돌린다** — 어디선가 터져서 못 되돌렸어도 여기서 낫는다. */
    headToRestore?.();
    headToRestore = null;
    const pickedHead = whichHead({
      acceptSlot: acceptLength({ justNow: justSaid, recent: wholeStory }) !== '',
      tossSlot: shouldTossBack(),
      selfTalk: asksAboutSelf(justSaid),
      hasPastEvent: episode.related(justSaid, 2, Date.now()) !== null,
    }, { largeHead: settings.get('큰머리') ?? 'sonnet' });
    if (pickedHead.why !== '') {
      headToRestore = attachHead(brain, pickedHead.head, (m) => console.log(`[머리] ${m}`));
      console.log(`[머리] ${pickedHead.head} 로 바꾼다 — ${pickedHead.why}`);
      web.noticed(`머리를 크게 쓴다 — ${pickedHead.why}`);
    }
    /* 두뇌에 실제로 뭐가 들어가는지 눈으로 본다 (`COMPANION_SHOW_MATERIAL=1`).
       「대화가 되는 느낌이 아니다」가 **모델 탓인지 재료 탓인지**는 재료를 봐야 갈린다 —
       발동 기록은 무엇이 실렸는지만 알려 주지 그 글이 어떻게 생겼는지는 안 보여 준다. */
    const shouldShow = process.env.COMPANION_SHOW_MATERIAL === '1';
    /* 드물게 켜지는 재료는 켜졌을 때 이겨야 한다(82회차). 얼마나 드문지는 우리가 정하지
       않고 **발동 기록이 이미 센 값**을 쓴다. 밀린 것(72회차)과 겹쳐 얹는다 — 하나는
       「참은 만큼」, 하나는 「드문 만큼」이라 서로 다른 것을 잰다. */
    const materials = [
      /* 방금 알게 된 것 — 예전부터 알던 척을 막는다.
         2분 전에 처음 들은 걸 「예전부터 알았잖아」라고 하면, 사람은 그 순간 얘가
         아무것도 기억 못 한다는 걸 안다. 아는 척이 기억보다 더 크게 티가 난다. */
      // 말을 걸기로 한 뒤에도 자리에 맞게 굴어야 한다 — 만드는 중인 사람에게 긴
      // 얘기를 늘어놓으면, 말 건 것 자체는 괜찮아도 방해가 된다.
      // 이어지는 옛 일이 있으면 꺼낸다. 없으면 아무 말도 안 얹는다 — 늘 붙이면
      // 「기억하는 척」이 되고 재료만 먹는다.
      // 여러 마디에 걸쳐야 보이는 것. 지금 얘기와 이어질 때만 나온다.
      { name: '보아온것', weight: 11, text: reflectionNote(reflected, justSaid) },
      // 짧은 건 인격이지만 **안 변하는 건 고장이다**(83회차 실측: 사람이 뭘 쓰든 가운데값 7자).
      { name: '받는길이', weight: 14, text: acceptLength({ justNow: justSaid, recent: wholeStory }) },
      { name: '그때그일', weight: 10, text: (() => {
        episode.learn(recent);
        return justSaid === '' ? '' : episodeNote(episode, justSaid, Date.now());
      })() },
      /* 공을 돌려주기 — 답만 하면 대답이지 대화가 아니다.
         무겁게 둔다. 밀리면 그냥 「대화가 식어 가는 채로」 끝난다. */
      { name: '공돌려주기', weight: 13, text: tossBackNote({ recent, justNow: justSaid }) },
      { name: '자리', weight: 11, text: bySlotTone(slotKnowledge.read(lastWindowTitle)) },
      { name: '갓안것', weight: 12, text: (() => {
        // 매 turn 맞춘다. 새 줄이 생겼을 때만 파일에 남으므로 값이 싸다 — 갱신 시점을
        // 따로 챙기려다 빠뜨리면 날짜가 통째로 어긋난다.
        const known2 = memory.longTerm?.() ?? null;
        learnedAt.sync(known2);
        return justLearned(known2, learnedAt, Date.now());
      })() },
      // 늘 있어야 하는 것 — 지금 어떤 상태인가.
      // 틀렸다고 하면 그게 가장 먼저다 — 우기는 것보다 나쁜 게 없다.
      { name: '고침', weight: 13, text: (() => {
        // 재시작 직후엔 직전에 한 말이 비어 있다 — 그때는 기억에서 읽는다.
        // 안 그러면 창을 새로 연 뒤 첫 「아니야」가 통째로 무시된다(실측 33회차).
        const lastText = previousUtterance ?? [...recent].reverse().find((e) => e.role === 'said');
        const toFix = findCorrection(justSaid, lastText);
        if (toFix === null) return '';
        const removed = applyCorrection(toFix, (key) => memory.forgetKnown?.(key) === true);
        if (removed.length > 0) console.log(`[고침] 아는 것에서 지웠다: ${removed.join(', ')}`);
        return correctionNote(toFix, removed);
      })() },
      // 조용히 있으라는 건 무엇보다 먼저다 — 이걸 놓치면 방해가 된다.
      { name: '조용', text: quietNote(quiet), weight: 12 },
      { name: '보는것', text: watchNote(watching, Date.now()), weight: 6 },
      // 조심할 자리는 **가장 무겁다.** 예산에 밀려 빠지면 아무 소용이 없다.
      { name: '조심', text: tenderNote(caution), weight: 14 },
      // 직접 들은 것은 짐작보다 무겁다 — 어긋나면 이쪽을 따르라고 못 박는다.
      { name: '들은것', weight: 11, text: statedNote(
        stated.all,
        findConflicts(stated.all, memory.longTerm?.() ?? null),
      ) },
      { name: '기분', text: mood.note, weight: 9 },
      { name: '마음', text: feelingNote(heart.state), weight: 8 },
      // 샜을 때만 켜지는 것들. 원래 조건부라 무게가 높아도 안전하다.
      { name: '표류', text: driftWarning(recent), weight: 10 },
      /* **제 성적을 얘가 본다** (130회차). 점수판을 셋이나 지었는데 전부 우리가 재는
         것이었다 — 얘 자신은 제가 어떤지 모른다. 밖에서 「아는 것과 하는 것의 틈」이라
         부르는 자리다. 말할 게 없으면 빈 글이라 평소엔 안 실린다. */
      { name: '내성적', text: selfScore(recent), weight: 10 },
      { name: '회피', text: avoidanceWarning(recent), weight: 10 },
      // 얘 말 흐름을 보는 것들은 **넓은 창**을 본다. 좁은 창(최근 10개)에는 두뇌가 지은
      // 말이 서넛도 안 들어 있어, 판단이 서기도 전에 늘 「빔」이 된다(실측 36회차).
      { name: '말버릇', text: rutWarning(wholeStory), weight: 10 },
      // 자기 얘기를 물었을 때만 — 안 물었는데 「전에 이렇게 말했다」를 늘 얹을 이유가 없다.
      { name: '자기상', text: selfImage.note(), weight: 7, when: asksAboutSelf(justSaid) },
      // 그 사람 얘기가 나왔을 때만.
      { name: '곁의사람', text: peopleNote(knownPerson), weight: 6,
        when: knownPerson.some((p) => justSaid.includes(p.name.slice(0, 2))) },
      // 오늘이 이정표인 날에만. 자랑하지 말라고 못 박아 뒀다.
      { name: '이정표', text: milestoneNote(wholeStory), weight: 8, when: caution.soft === false },
      // 처음 만난 때는 **물었을 때만** — 안 물었는데 꺼내면 그것도 자랑이다.
      { name: '처음만남', text: firstMetNote(wholeStory), weight: 7,
        when: asksAboutFirstMeeting(justSaid) },
      // 재미는 저절로 생기지 않는다 — 놀릴 거리를 준다. 쓸지 말지는 얘가 정한다.
      { name: '놀리기', text: teaseNote(findTease(justSaid, wholeStory)), weight: 5, when: caution.soft === false && settings.on('놀리기') },
      // 끊겼다 이어지는 자리 — **첫 turn 에만** 본다. 매번 얹으면 재료 과밀이다.
      // 끊김은 **켜지기 전까지의 기억**으로 잰다.
      //
      // core 는 방금 들어온 말을 기억에 먼저 넣고 이 자리를 부른다. 그래서 통째로 넘기면
      // 「마지막 대화 = 방금」이 되어 **늘 「이어짐」**이 된다 — 실제로 그래서 안 켜졌다
      // (실측 46회차: 문턱을 1초로 낮춰도 빔이었다).
      { name: '이어짐', weight: 6, text: isFirstTurn
        ? resumeNote(readResume(
            wholeStory.filter((e) => e.at < startedAt),
            startedAt,
            { sameBreathMs: Number(process.env.COMPANION_RESUME_MS ?? '180000') },
          ))
        : '' },
      // 자리를 비운 동안 곁에서 본 것 — 돌아온 첫 turn 에만.
      { name: '비운동안', weight: 5, text: (() => {
        if (isFirstTurn === false) return '';
        const cut = readResume(wholeStory.filter((e) => e.at < startedAt), startedAt);
        if (cut.gap === '처음' || cut.gap === '이어짐') return '';
        return whileAwayNote(whileAway(wholeStory, startedAt - cut.awayMs, startedAt));
      })() },
      // 우리끼리 자꾸 나오는 얘기 — 농담으로 만들라고 시키지는 않는다.
      { name: '단골얘기', text: runningGagNote(recurringThings(wholeStory)), weight: 3, when: caution.soft === false },
      { name: '사이', text: rapport.note, weight: 4 },
      /* **사람이 실제로 반응한 것.** 가중치가 최하위(3)라 194번 밀리고 13번만 실렸다
         — 발동 기록으로 확인. 그런데 이건 「무슨 말이 통했나」라는, 이 사람한테만
         해당하는 되먹임이다. 아무 데서도 못 얻는 재료가 가장 먼저 밀리고 있었다.
         내용이 있을 때가 40% 뿐이라(빔 264) 늘 자리를 먹지도 않는다. */
      { name: '통한말', text: landingNote(recent), weight: 12 },

      { name: '궁금', text: maybeAsk(curiosity), weight: 5, when: caution.soft === false && settings.on('놀리기') },
      // 대화가 마를 때만 — 잘 굴러가면 끼어들 이유가 없다.
      { name: '화제', weight: 7, when: caution.soft === false, text: tangentFor(wholeStory, {
        wondering: curiosity.next(),
        sawWindow: lastWindowTitle,
        quietPerson: people.whoToAskAbout(Date.now())?.name ?? null,
        wish: wishes.unmet(recent)[0]?.what ?? null,
      }) },
      /* 담을 자리. 재료가 열두 개일 때 정한 값을 스무 개가 된 지금까지 쓰고 있었다 —
         새 재료를 넣을 때마다 예전 것이 **조용히** 밀렸고, 그건 발동 기록을 봐야만
         보였다. 재료가 는 만큼만 늘린다(420자·5줄 → 520자·6줄). 더 늘리면 29회차에
         고쳤던 「재료 과밀」로 되돌아간다. */
    ];
    /* **참기만 하다 끝나면 그건 생각이 아니다**(87회차). 오래 눌린 재료가 있고 대화가
       식어 가면, 곁가지로 얹는 대신 **그걸 화제로 꺼내라**고 시킨다. 좁게 연다 —
       한창일 때 끼어들면 방해고, 물어본 turn 에 딴 얘기를 꺼내면 회피다. */
    const topic = {
      material: materials,
      heldFor: (n) => queued.heldFor(n),
      cooling: shouldTossBack(),
      askedTurn: isQuestion(justSaid),
    };
    const first = topicFirst(topic);
    if (first !== null) {
      console.log(`[먼저꺼냄] ${first.name} (${first.heldCount}번 참았다)`);
      web.noticed(`먼저 꺼낸다 — ${first.name} (${first.heldCount}번 참았다)`);
      // 다른 무엇보다 앞이다. 곁가지가 아니라 이번 turn 의 화제다.
      materials.push({ name: '먼저꺼냄', text: first.text, weight: 40 });
    } else {
      const why2 = topicSkipReason(topic);
      if (why2 !== null && process.env.COMPANION_SHOW_MATERIAL === '1') console.log(`[먼저꺼냄] 안 꺼낸다 — ${why2}`);
    }
    const made = composeIngredients(applyRarity(queued.overlay(materials), (name) => tally.get(name)), { maxChars: 520, maxLines: 6, slot: `「${justSaid.slice(0, 24)}」`, mark: (name, fate, why3) => { tally.mark(name, fate, why3); queued.write(name, fate); } });
    /* 이 turn 의 겨룸이 끝났다. 밀린 것은 다음 turn 에 더 세게 나온다.
       참는 게 있으면 눈에 보이게 찍는다 — 안 보이면 이 자리가 도는지도 모른다. */
    queued.nextTurn();
    const held = queued.summary();
    if (held !== '') { console.log(`[밀림] ${held}`); web.noticed(`하고 싶었는데 못 한 말 — ${held}`); }
    if (shouldShow) {
      console.log('[재료]');
      for (const line6 of made.split('\n')) console.log(`  · ${line6}`);
    }
    return made;
  },
  attention: tactfulAttention({
    // 닿은 것은 나한테 직접 한 짓이다 — 「지금 바쁘신 것 같아 참았다」가 말이 안 된다.
    bypassChannels: ['web', TOUCH_CHANNEL],
    cooldownMs,
    stuckAfterMs: Number(process.env.COMPANION_STUCK_MS ?? '25000'),
    awayAfterMs: Number(process.env.COMPANION_AWAY_MS ?? '900000'),
  }),
  onCycle: (report) => {
    /* **두뇌가 터진 turn 을 사람 눈앞에 띄운다.**
       사연은 원래도 남고 있었다 — 아래쪽에서 `[에러]` 로 찍고 잘못된 것 원장에도 담는다.
       그런데 그 둘 다 **사람이 안 보는 자리**다. `COMPANION_BRAIN=assistant` 로 띄우면 얘는
       매번 침묵했고, 창에는 아무 것도 안 떴다 — 밖에서는 그냥 「가끔 말을 안 한다」였다.
       실제 사연은 「.env 에 GEMINI_API_KEY 가 필요합니다」였다(103회차 실측).
       못 하는 건 못 한다고 해야 곁에 있는 것이다. */
    if (report.error) {
      web?.noticed?.(`말을 못 만들었다 — ${(report.error.message ?? String(report.error)).slice(0, 200).trim()}`);
    }
    if (report.sensation.channel === 'web') {
      lastSpokenToAt = Date.now();
      // 방금 한 말에 조수님이 어떻게 반응했나 — 웃어 준 건 마음에 남아야 한다.
      const measured = previousUtterance === null ? null : reactionTo(previousUtterance, {
        role: 'sensed', channel: 'web', text: report.sensation.text, at: report.sensation.at,
      });
      if (measured !== null) heart.felt(measured.landed
        ? (measured.why === '웃었다' ? '웃어줌' : measured.why === '되물었다' ? '되물음' : '받아줌')
        : (measured.why === '한 마디로 넘겼다' ? '시들함' : '무시당함'));
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
    if (report.sensation.channel === 'web') isFirstTurn = false;
    if (report.utterance) previousUtterance = { role: 'said', channel: 'web', text: report.utterance.text, at: report.utterance.at };
    // 화면에서 읽은 창 제목을 기억해 둔다 — 바뀌었는지 알아야 말 걸 이유가 생긴다.
    const seen = report.sensation.meta?.windowTitle;
    if (typeof seen === 'string' && seen !== '') {
      /* 창이 바뀐 걸 알아챈 것도 인식이다 — 여태 아무 데도 안 보였다.
         **바뀐 때만** 알린다. 같은 창을 보고 있는 동안 매번 알리면 대화가 덮인다. */
      if (seen !== lastWindowTitle) {
        const slot6 = slotKnowledge.read(seen);
        web.noticed(`창이 바뀌었다 — 「${seen.slice(0, 50)}」${slot6 === null ? ' (무슨 자리인지 모르겠다)' : ` (${slot6})`}`);
      }
      lastWindowTitle = seen;
      watching.saw(seen, report.sensation.at);
    }
    // 큰 머리를 끼웠으면 여기서 되돌린다 — 다음 turn 이 이유 없이 느려지면 안 된다.
    headToRestore?.();
    headToRestore = null;
    if (report.sensation.channel === 'nudge') shownWindowTitle = lastWindowTitle;
    /* page 채팅은 두뇌를 일·말에만 쓴다. 되새김·자리 배우기는 다음 답을 훔친다. */
    if (surface === 'page') {
      if (report.error) { console.error(`[에러] ${report.error.message}`); troubles.hit('죽음', report.error.message); }
      else if (report.utterance) console.log(`[말함] ${report.utterance.text.slice(0, 60)}`);
      else console.log(`[참음] ${report.decision.reason}`);
      return;
    }
    /* 낱말 표가 놓친 말을 두뇌에게 물어 사건으로 담는다. **여기서 기다리지 않는다** —
       이 자리는 이미 말이 나간 뒤라 늦어져도 대화가 안 밀린다. */
    void episode.reflect().catch((e) => console.error(`[그때] 되새기다 죽었다 — ${e?.message ?? e}`));
    /* 오간 말을 뜻 색인에 담는다 — **말이 나간 뒤라** 늦어져도 대화가 안 밀린다.
       이미 담긴 것은 건너뛰므로 몇 번을 불러도 값이 거의 안 든다. */
    void Promise.resolve(conversationMemory.recent(40))
      .then((es) => meaning.store(es))
      .catch((e) => console.error(`[뜻] 담다 죽었다 — ${e?.message ?? e}`));
    void slotKnowledge.reflect().catch((e) => console.error(`[자리] 되새기다 죽었다 — ${e?.message ?? e}`));
    /* 말이 얼마쯤 쌓이면 한 번 되새긴다. 매 turn 하면 그게 값이고, 안 하면 얘는
       영영 「일어난 일」만 안다. 여기는 이미 말이 나간 뒤라 늦어져도 대화가 안 밀린다. */
    void Promise.resolve(conversationMemory.recent(60)).then((es) => {
      if (reflected.calc(es) === false) return undefined;
      return reflected.reflect(es);
    }).catch((e) => console.error(`[되새김] 되새기다 죽었다 — ${e?.message ?? e}`));
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
/* 창이 뜨자마자 한 번, 그 뒤로는 이 간격으로 한 갈래씩. 아홉 갈래가 다 차면 그때부터는
   두뇌를 아예 안 부른다(담긴 수만 세고 돌아간다) — 그래서 간격이 짧아도 값이 안 든다.
   너무 길게 잡으면 정작 가장 많이 닿는 자리(계속 찌를 때)가 한참 동안 옛 표 그대로다. */
if (surface !== 'page') {
  const lineInterval = Number(process.env.COMPANION_STOCK_MS ?? '90000');
  prefillReply();
  setInterval(prefillReply, lineInterval).unref();
}
if (desktop) {
  openPinnedWindow(`http://localhost:${port}/?surface=${surface}`, {
    width: Number(process.env.COMPANION_WIDTH ?? (surface === 'page' ? '920' : '420')),
    height: Number(process.env.COMPANION_HEIGHT ?? (surface === 'page' ? '780' : '640')),
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
