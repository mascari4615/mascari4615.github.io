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
export type 자리 = '통화' | '보는중' | '만드는중' | '읽는중' | '노는중' | null;

interface 짚기 {
  자리: Exclude<자리, null>;
  /** 제목에 이게 있으면 그 자리다. */
  낱말: readonly string[];
}

/**
 * 무엇으로 가르나.
 *
 * 위에서부터 본다 — **끼어들면 안 되는 것이 먼저**다. 통화 중에 게임 창이 같이 떠 있다고
 * 게임으로 세면 그대로 사고다.
 */
const 갈래표: readonly 짚기[] = [
  { 자리: '통화', 낱말: ['zoom', 'meet.google', 'microsoft teams', 'webex', '통화 중', 'discord - ', 'gather'] },
  { 자리: '보는중', 낱말: ['youtube', 'netflix', 'twitch', 'laftel', 'watcha', 'tving', '- vlc', 'mpv'] },
  { 자리: '노는중', 낱말: ['steam', 'unity', 'godot', 'league of legends', 'minecraft'] },
  { 자리: '만드는중', 낱말: ['visual studio code', 'vscode', 'intellij', 'rider', 'blender', 'photoshop', 'aseprite', 'obsidian', 'figma'] },
  { 자리: '읽는중', 낱말: ['- chrome', '- edge', '- whale', '- firefox', 'notion', 'stack overflow', 'github'] },
];

/** 이 창 제목이 어떤 자리인가. 모르면 null. */
export function 어떤자리(title: string | null | undefined): 자리 {
  const 제목 = (title ?? '').toLowerCase().trim();
  if (제목 === '') return null;
  for (const { 자리: 갈래, 낱말 } of 갈래표) {
    if (낱말.some((n) => 제목.includes(n))) return 갈래;
  }
  return null;
}

/**
 * 지금 먼저 말 걸어도 되나.
 *
 * **모르면 말 건다.** 여기서 몸을 사리면 얘는 영영 조용해진다 — 알 수 없는 창이 대부분이고,
 * 조용한 동반자는 없는 동반자다. 확실히 아닐 때만 막는다.
 */
export function 말걸어도되나(title: string | null | undefined): { 된다: boolean; 왜: string } {
  const 자리 = 어떤자리(title);
  if (자리 === '통화') return { 된다: false, 왜: '통화 중이다' };
  if (자리 === '보는중') return { 된다: false, 왜: '뭔가 보는 중이다' };
  return { 된다: true, 왜: 자리 === null ? '무슨 자리인지 모르겠다' : `${자리}이라 괜찮다` };
}

/**
 * 두뇌에 얹을 한 줄. **말을 걸기로 한 뒤에도** 자리에 맞게 굴어야 한다.
 *
 * 만드는 중인 사람에게 긴 얘기를 늘어놓으면, 말 건 것 자체는 괜찮아도 방해가 된다.
 */
export function 자리결(title: string | null | undefined): string {
  switch (어떤자리(title)) {
    case '만드는중':
      return '지금 뭔가 만드는 중이다. 짧게, 흐름을 끊지 마라.';
    case '노는중':
      return '지금 노는 중이다. 가볍게 굴어도 된다.';
    case '읽는중':
      return '지금 뭔가 읽는 중이다. 길게 말하면 놓친다.';
    // 통화·보는중은 애초에 말을 안 건다. 그래도 물어보면 답해야 하므로 조용히 짧게.
    case '통화':
      return '지금 통화 중이다. 묻는 말에만, 아주 짧게.';
    case '보는중':
      return '지금 뭔가 보는 중이다. 묻는 말에만, 아주 짧게.';
    default:
      return '';
  }
}
