/**
 * 맞장구 — 상대가 아직 말하는 중일 때 짧게 받아 주는 것.
 *
 * 대화 타이밍 쪽 연구가 한결같이 세는 것이 셋이다: 쉼을 다룰 줄 아는가, **맞장구를 치는가**,
 * 매끄럽게 차례를 주고받는가. 사람은 상대가 길게 말하는 동안 가만히 있지 않는다 — 「응」
 * 「그래서?」 하고 짧게 받는다. 그게 없으면 말하는 쪽은 **벽에 대고 말하는 기분**이 된다.
 *
 * 실측(26회차): 조수님이 「오늘 회의가 있었는데」 / 「진짜 길었어」 / 「세 시간이나 했다니까」를
 * 0.9초 간격으로 이어 쳤더니, 얘는 **22초 동안 아무 소리도 안 내다가** 마지막에 한 번
 * 답했다. 답 자체는 맞았지만 그 22초가 대화가 아니었다.
 *
 * 뜸(「음…」)과 다른 것이다. 뜸은 **내 답이 늦을 때** 내는 소리고, 맞장구는 **상대가 아직
 * 말하는 중일 때** 내는 소리다. 뜸은 「나 생각 중」이고 맞장구는 「듣고 있어」다.
 *
 * 다만 **한 뭉치에는 소리 하나**다. 처음에 이 둘을 따로 뒀더니 실제로 「음. 응? 그게… 어…」
 * 가 연달아 나갔다(실측) — 각자 보면 맞는 소리인데 겹치면 혼잣말하는 사람이 된다. 그래서
 * 뜸도 맞장구도 같은 하나를 나눠 쓴다.
 *
 * 성가시지 않게 하는 것이 전부다:
 * - **두 번째 마디부터.** 첫 마디에 맞장구를 치면 그건 듣는 게 아니라 흘리는 것이다.
 * - **한 번만.** 마디마다 「응」 「응」 「응」 하면 그건 맞장구가 아니라 소음이다.
 * - **답이 나오면 끝.** 답한 뒤의 맞장구는 뒷북이다.
 * - 대화 기록에 안 쌓는다. 맞장구는 말이 아니다.
 */
export interface BackchannelOptions {
  /** 이보다 빨리 다음 마디가 오면 「아직 말하는 중」으로 본다. */
  withinMs?: number;
  /** 고르는 손. */
  roll?: () => number;
}

const 받는소리: readonly string[] = ['응.', '어…', '응?', '그래서?', '…음.'];

/**
 * 이어 치는 말을 지켜보다가 맞장구를 낸다.
 *
 * 한 뭉치(사람이 쉬지 않고 이어 친 덩어리) 안에서 한 번만 낸다. 답이 나가면 뭉치가 끝난
 * 것으로 보고 다음 뭉치를 새로 센다.
 */
export class Backchannel {
  private 마지막들음 = 0;
  private 이번뭉치 = 0;
  private 냈나 = false;
  private 마지막소리: string | null = null;

  constructor(private readonly options: BackchannelOptions = {}) {}

  /**
   * 사람이 한 마디 했다. 맞장구를 칠 자리면 낼 소리를, 아니면 null.
   */
  heard(at: number): string | null {
    const within = this.options.withinMs ?? 2500;
    const 이어짐 = at - this.마지막들음 <= within;
    this.마지막들음 = at;

    if (이어짐 === false) {
      // 새 뭉치가 시작됐다.
      this.이번뭉치 = 1;
      this.냈나 = false;
      return null;
    }

    this.이번뭉치 += 1;
    // 두 번째 마디부터, 그리고 뭉치당 한 번만.
    if (this.이번뭉치 < 2 || this.냈나) return null;

    this.냈나 = true;
    const roll = this.options.roll ?? Math.random;
    const 후보 = 받는소리.filter((s) => s !== this.마지막소리);
    const 고른것 = 후보[Math.floor(roll() * 후보.length) % 후보.length];
    this.마지막소리 = 고른것;
    return 고른것;
  }

  /**
   * 뜸이 나가도 되나. 이미 이 뭉치에서 소리를 냈으면 안 된다.
   *
   * 낼 수 있으면 낸 것으로 표시하고 true — 물어보는 것이 곧 쓰는 것이라, 부르는 쪽이
   * 따로 표시할 일을 잊지 않는다.
   */
  mayFiller(): boolean {
    if (this.냈나) return false;
    this.냈나 = true;
    return true;
  }

  /** 얘가 답했다 — 뭉치가 끝났다. */
  answered(): void {
    this.이번뭉치 = 0;
    this.냈나 = false;
    this.마지막들음 = 0;
  }

  /** 지금 뭉치에서 맞장구를 이미 냈나 (진단용). */
  get used(): boolean {
    return this.냈나;
  }
}
