/**
 * 지금 말 걸어도 되는 자리인가 — 화면을 보고 눈치 보기.
 *
 * 동반자 앱을 지우는 이유 1위로 꼽히는 게 **엉뚱한 때 말 거는 것**이다. 곁에 있는 존재의
 * 값어치는 「무슨 말을 하나」보다 「언제 입을 여나」에서 먼저 갈린다.
 *
 * 우리 얘는 화면을 곁눈질하고(12회차), 같은 걸 오래 붙들고 있는지도 읽는다(watching).
 * 그런데 **지금이 어떤 자리인지**는 못 읽었다. 통화 중이든 영화를 보든 코드를 짜든
 * 똑같이 말을 걸었다. 통화 중에 끼어드는 건 그냥 사고다.
 *
 * 창 제목만 보고 정한다. 화면을 뜯어보지 않는 게 중요하다 — 남의 화면 내용을 읽어 두면
 * 그게 어딘가에 남고, 그건 곁에 두고 싶은 존재가 아니다. 제목은 이미 「무슨 창이 떠 있나」
 * 를 보는 데 쓰고 있던 것뿐이다.
 *
 * **모르면 「모른다」고 한다.** 억지로 갈래를 붙이면 엉뚱한 자리에서 입을 다물거나 연다.
 */

/** 지금 뭘 하는 중인가. */
export type slot = '통화' | '보는중' | '만드는중' | '읽는중' | '노는중' | '나를보는중' | null;

interface point {
  slot: Exclude<slot, null>;
  /** 제목에 이게 있으면 그 자리다. */
  word: readonly string[];
}

/**
 * 무엇으로 가르나.
 *
 * 위에서부터 본다 — **끼어들면 안 되는 것이 먼저**다. 통화 중에 게임 창이 같이 떠 있다고
 * 게임으로 세면 그대로 사고다.
 */
const kindTable: readonly point[] = [
  /* **우리 창.** 78회차에 떠 있는 창을 세어 보니 얘는 자기 창조차 「모름」이었다. 그런데
     사람이 얘를 보고 있는 건 아무 자리도 아닌 게 아니라 **말 걸기 가장 좋은 때**다.
     우리가 지은 제목이라 여기는 표가 맞다 — 두뇌한테 물어볼 일이 아니다. */
  { slot: '나를보는중', word: ['동반자'] },
  // 디스코드는 제목이 「#방이름 | 서버이름 - Discord」로 온다(실측). 앞에 붙임표를
  // 요구하면 안 걸린다. 다만 디스코드는 통화만 하는 게 아니라 글도 읽는 자리라,
  // **통화 중일 때만** 막고 싶은데 제목으로는 그걸 못 가른다 — 지금은 통화로 본다.
  // 잘못 막는 쪽이 잘못 끼어드는 쪽보다 낫다.
  { slot: '통화', word: ['zoom', 'meet.google', 'microsoft teams', 'webex', '통화 중', 'discord', 'gather'] },
  { slot: '보는중', word: ['youtube', 'netflix', 'twitch', 'laftel', 'watcha', 'tving', 'vlc', 'mpv', '- pot'] },
  { slot: '노는중', word: ['steam', 'league of legends', 'minecraft', 'valorant', '로스트아크'] },
  {
    slot: '만드는중',
    // **터미널도 만드는 중이다.** 처음엔 편집기 이름만 넣었는데, 실제로 오는 제목은
    // 「claude · resume」 같은 터미널 창이 태반이었다 — 33번 재는 동안 한 번도 안
    // 걸렸다(실측). 이름을 늘리는 게 아니라 *실제로 오는 title*을 봐야 했다.
    word: [
      'visual studio code', 'vscode', 'intellij', 'rider', 'unity', 'godot', 'blender',
      'photoshop', 'aseprite', 'obsidian', 'figma',
      'claude', 'powershell', 'cmd.exe', 'terminal', 'wsl', 'git bash', 'nvim', 'vim',
    ],
  },
  {
    slot: '읽는중',
    // 브라우저 제목은 「… - 개인 - Microsoft Edge」처럼 사이에 뭐가 낀다. 앞에 붙임표를
    // 요구하면 거의 안 걸린다 — 이름만 본다.
    word: ['chrome', 'edge', 'whale', 'firefox', 'notion', 'stack overflow', 'github'],
  },
];

/** 이 창 제목이 어떤 자리인가. 모르면 null. */
export function whichSlot(title: string | null | undefined): slot {
  const title2 = (title ?? '').toLowerCase().trim();
  if (title2 === '') return null;
  for (const { slot: kind, word: word } of kindTable) {
    if (word.some((n) => title2.includes(n))) return kind;
  }
  return null;
}

/**
 * 지금 먼저 말 걸어도 되나.
 *
 * **모르면 말 건다.** 여기서 몸을 사리면 얘는 영영 조용해진다 — 알 수 없는 창이 대부분이고,
 * 조용한 동반자는 없는 동반자다. 확실히 아닐 때만 막는다.
 */
export function maySpeak(title: string | null | undefined): { ok: boolean; why: string } {
  const slot = whichSlot(title);
  if (slot === '통화') return { ok: false, why: '통화 중이다' };
  if (slot === '보는중') return { ok: false, why: '뭔가 보는 중이다' };
  return { ok: true, why: slot === null ? '무슨 자리인지 모르겠다' : `${slot}이라 괜찮다` };
}

/**
 * 두뇌에 얹을 한 줄. **말을 걸기로 한 뒤에도** 자리에 맞게 굴어야 한다.
 *
 * 만드는 중인 사람에게 긴 얘기를 늘어놓으면, 말 건 것 자체는 괜찮아도 방해가 된다.
 */
export function slotTone(title: string | null | undefined): string {
  return bySlotTone(whichSlot(title));
}

/**
 * **이미 아는 slot**에 대한 한 줄. 제목을 다시 풀지 않는다.
 *
 * 배운 slot(78회차)를 쓰려면 이 자리가 있어야 한다 — 배운 값을 다시 제목인 척 넘기면
 * 표에서 못 찾고 조용히 빈 말이 된다.
 */
export function bySlotTone(slot2: slot): string {
  switch (slot2) {
    case '만드는중':
      return '지금 뭔가 만드는 중이다. 짧게, 흐름을 끊지 마라.';
    case '노는중':
      return '지금 노는 중이다. 가볍게 굴어도 된다.';
    case '읽는중':
      return '지금 뭔가 읽는 중이다. 길게 말하면 놓친다.';
    case '나를보는중':
      return '조수님이 지금 나를 보고 있다. 눈이 마주친 자리다 — 말 걸기 가장 좋은 때다.';
    // 통화·보는중은 애초에 말을 안 건다. 그래도 물어보면 답해야 하므로 조용히 짧게.
    case '통화':
      return '지금 통화 중이다. 묻는 말에만, 아주 짧게.';
    case '보는중':
      return '지금 뭔가 보는 중이다. 묻는 말에만, 아주 짧게.';
    default:
      return '';
  }
}
