/**
 * 본문에 **무엇이 실렸나**를 한 줄로.
 *
 * 133회차에 「그림과 글자가 둘 다 두뇌에 가나」를 라이브로 재려다 **못 쟀다.** 계측 줄
 * (`[두뇌인자]`)은 인자와 시스템 프롬프트만 찍고 **본문은 길이만** 찍는다 — 본문은 stdin
 * 으로 가서 인자에 안 들어가기 때문이다. 그래서 재료에 뭐가 들어갔는지 밖에서 볼 방법이
 * 없었다.
 *
 * 35회차에 「도는지 모름」을 없애려고 발동 기록을 만든 것과 같은 자리다. 다른 점은 여기서
 * 보는 게 **두뇌에 실제로 간 것**이라는 것 — 재료를 만드는 쪽이 아니라 받는 쪽에서 본다.
 * (64·70회차에 「같은 값을 두 곳에서 들고 있으면 어긋난다」를 두 번 겪었다. 받는 쪽에서
 * 보면 그 어긋남이 안 생긴다.)
 *
 * 본문을 통째로 찍지 않는다 — 1500자짜리를 매 turn 찍으면 로그가 못 읽을 것이 된다.
 */
const marks: readonly { name: string; mark: RegExp }[] = [
  { name: '그림', mark: /now\.png/ },
  { name: '글자', mark: /화면을 글자로도 읽었다/ },
  { name: '찾아본 것', mark: /방금 찾아본 것:/ },
  { name: '지난 말', mark: /지금까지 오간 말:/ },
  { name: '손', mark: /\[\[[^\]]+:/ },
];

export function promptParts(prompt: string): string {
  const text = String(prompt ?? '');
  const found = marks.filter((part) => part.mark.test(text)).map((part) => part.name);
  return found.length === 0 ? '실린 조각 없음' : found.join('·');
}
