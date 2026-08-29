/**
 * 받아쓴 글을 그대로 두뇌에 넘길까.
 *
 * **늘 듣기(75회차)의 진짜 값은 여기서 갈린다.** 버튼을 눌러 말할 때는 사람이 지금부터
 * 말한다고 알려 준 것이라 뭐가 들어와도 그 사람 뜻이었다. 귀를 늘 열어 두면 그게 없다 . 
 * 문이 열렸다고 들어온 게 다 말은 아니다.
 *
 * 받아쓰기는 **아무 소리에나 그럴듯한 글을 붙인다.** 조용한 구간, 잡음 구간에 음 아
 * 시청해주셔서 감사합니다 같은 게 흔히 나온다(자막 데이터로 배운 흔적이다). 이걸 그대로
 * 넘기면 아무도 말 안 걸었는데 얘가 혼자 대꾸한다. 늘 듣기를 곧바로 못 쓰게 만드는 사고다.
 *
 * **거르는 자리는 서버다.** 창에서 걸러도 소용없다. 글을 두뇌에 넘기는 건 서버고, 창이
 * 알기 전에 이미 넘어간다. 열쇠가 두 곳에 있으면 조용히 어긋난다(오늘만 세 번 밟았다).
 */

/** 받아쓰기가 조용한 데다 자주 붙이는 말들. */
const phantom = [
  '감사합니다', '시청해주셔서감사합니다', '구독과좋아요', '구독좋아요',
  '음', '아', '어', '으', '네', '예',
  'thankyou', 'thanksforwatching', 'you', 'bye', 'okay', 'ok',
];

const pushedText = (content: string): string => content.replace(/[\s.,!?~…。、·"'’”]/g, '').toLowerCase();

/**
 * 이 받아쓴 글을 사람이 한 말로 볼까.
 *
 * 좁게 막는다. 진짜 한 말을 막으면 불러도 대답을 안 한다가 되고, 그게 헛것보다 나쁘다.
 */
export function looksLikeSpeech(content2: string | null | undefined): boolean {
  const text = String(content2 ?? '').trim();
  if (text === '') return false;
  const pushed = pushedText(text);
  // 글자 둘 미만은 헛것일 확률이 훨씬 높다. 응 네 한 마디는 아쉽지만, 아무도
  // 말 안 걸었는데 대꾸하는 쪽이 훨씬 이상하다.
  if (pushed.length < 2) return false;
  if (phantom.includes(pushed)) return false;
  // 같은 글자만 늘어선 것(ㅋㅋㅋ이 아니라 아아아아류)도 소리지 말이 아니다.
  if (/^(.)\1*$/u.test(pushed)) return false;
  /* **지어낸 글은 같은 구절을 되풀이한다.**
     기억에 남아 있던 자막 제공 및 **자막 제공 및** 광고를 포함하고 있습니다.가 그 모양이다
     (107회차 실측 5건). 목록에 그 문장을 더할 수도 있지만 74회차에 이미 배웠다 . 
     목록에 하나를 더하면 다음엔 다른 게 나온다. 그래서 낱말이 아니라 **모양**을 본다. */
  if (repeatsItself(text)) return false;
  return true;
}

/** 옛 이름. 뜻이 거꾸로 읽혀서 바꿨다. `shouldSkip` 인데 true 가 받는다였다. */
export const shouldSkipText = looksLikeSpeech;

/**
 * 같은 조각이 되풀이되나.
 *
 * 낱말 하나가 아니라 **이어진 조각**(1~4낱말)을 본다. 지어낸 글은 대개 구절째 반복된다.
 * 낱말 하나가 되풀이되는 건 사람도 한다(진짜 진짜 아니 아니). 그래서 한 낱말은
 * **세 번**부터, 이어진 구절은 **두 번**부터 잡는다. 사람이 같은 구절을 통째로 두 번
 * 말하는 일은 드물고, 지어낸 글은 그게 특징이다.
 */
function repeatsItself(text: string): boolean {
  const words = text.split(/\s+/).filter((w) => w !== '');
  /* 아주 짧은 말은 그냥 둔다. 진짜 진짜 힘들었어까지 막으면 사람 말이 사라진다. */
  if (words.length < 4) return false;
  for (let size = 1; size <= 4; size += 1) {
    const enough = size === 1 ? 3 : 2;
    const seen = new Map<string, number>();
    for (let i = 0; i + size <= words.length; i += 1) {
      const chunk = words.slice(i, i + size).join(' ');
      const next = (seen.get(chunk) ?? 0) + 1;
      if (next >= enough) return true;
      seen.set(chunk, next);
    }
  }
  return false;
}


/**
 * 이 듣기 구간이 애초에 **말이 있던 구간**인가.
 *
 * **낱말로 막는 데는 바닥이 있다.** 조용한 3초를 듣게 하고 받아쓴 결과가 안녕하세요.였다
 * (실측). 헛것 목록에 없는 멀쩡한 인사말이라 그대로 통과했고, 아무도 말 안 걸었는데 얘가
 * 뭐, 조수님?이라고 대꾸했다. 목록에 안녕하세요를 더하면 다음엔 다른 게 나온다 . 
 * 74회차에 낱말 표로 사건을 줍다가 똑같이 당했다.
 *
 * 그래서 **글이 아니라 소리로 막는다.** 창은 소리 크기를 재서 문을 열고 닫으므로, 그 구간에
 * 말소리가 실제로 얼마나 있었는지 안다. 그 값이 너무 작으면 **무슨 글이 오든 안 넘긴다.**
 * 받아쓰기가 무엇을 지어내든 상관없는 자리다.
 *
 * 창이 안 알려 주면(버튼으로 누른 경우 등) 막지 않는다. 그때는 사람이 지금 말한다고
 * 알려 준 것이라 지어낼 여지가 훨씬 적다.
 */
export function hadSpeech(spokenMs: number | null | undefined): boolean {
  if (spokenMs === null || spokenMs === undefined || Number.isFinite(spokenMs) === false) return true;
  return spokenMs >= 400;
}

/** 왜 안 넘겼는지. 조용히 버리면 왜 대답을 안 하지가 된다. */
export function keepReason(content3: string | null | undefined, spokenMs2?: number | null): string | null {
  const text2 = String(content3 ?? '').trim();
  if (text2 === '') return '아무 말도 안 들렸다';
  if (hadSpeech(spokenMs2) === false) {
    return `말소리가 거의 없던 구간이다 (${Math.round(spokenMs2 as number)}ms). 받아쓰기가 지어낸 ${text2.slice(0, 20)}`;
  }
  if (looksLikeSpeech(text2)) return null;
  return `말로 안 봤다. ${text2.slice(0, 30)}`;
}
