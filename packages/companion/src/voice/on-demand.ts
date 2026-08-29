import type { Speech, SpeechVoice } from './edge-tts';

/**
 * 무거운 곁딸린 프로그램을 **쓸 때 켜고 안 쓰면 끈다.**
 *
 * 흉내 낸 목소리(GPT-SoVITS)는 뜨는 데 30초쯤 걸리고 메모리를 크게 문다. 그래서 여태
 * 사람이 손으로 띄워 뒀는데, 그러면 **꺼져 있는 걸 아무도 모른다**. 목록에서 조용히
 * 빠지고, 화면에는 목소리가 사라졌다로만 보인다(사용자 실측 2026-08-08: 내 로컬
 * 모델 어디감?).
 *
 * 켜는 기준은 **부팅이 아니라 씀**이다(사용자 결정): 얘가 말을 하려 할 때 켜고, 한동안
 * 말이 없으면 끈다. 컴퓨터를 켤 때마다 30초씩 무거운 걸 올려 둘 이유가 없다.
 *
 * 규칙 둘:
 * - **고른 목소리로만 말한다.** 아직 안 떴으면 **뜰 때까지 기다린다.**
 *
 *   처음엔 준비될 때까지 대타(인터넷 목소리)로 말하게 했는데, 조수님이 오류라고 못 박았다
 *   (2026-08-08): 음성 설정한 거 fallback 금지. 음성 설정하면 그 음성 사용 가능할 때까지
 *   대기하는 게 맞지, 다른 목소리가 나오는 건 오류입니다. 곁에 있는 존재의 목소리가
 *   그때그때 딴 사람으로 바뀌는 건 빠른 것보다 나쁘다. 그건 같은 존재가 아니게 된다.
 *
 * - **끄는 길이 늘 있다.** 설정으로 자동 기동을 끄면 손으로 띄운 것만 쓴다.
 */
export interface DemandBootOptions {
  /** 사람이 읽는 name. */
  name: string;
  /** now 떠 있나. */
  isAlive: () => Promise<boolean>;
  /** 띄운다. 오래 걸려도 된다. 기다리지 않는다. */
  show: () => void | Promise<void>;
  /** 끈다. */
  stop: () => void | Promise<void>;
  /** 이만큼 안 쓰면 끈다 (0 = 안 끔). */
  stopIfIdleMs?: () => number;
  /** 자동으로 켜도 되나. 거짓이면 손으로 띄운 것만 쓴다. */
  isAuto?: () => boolean;
  /** 살았나를 이 간격보다 자주 묻지 않는다. 매 발화마다 물으면 그게 지연이 된다. */
  askIntervalMs?: number;
  /** 띄운 뒤 이 시간 안에 안 뜨면 실패로 본다. */
  prepareWaitMs?: number;
  /** 뜰 때까지 물어보는 간격. */
  prepareAskIntervalMs?: number;
  /** 못 띄운 뒤 이만큼은 다시 안 띄운다. 안 그러면 실패를 무한히 되풀이한다. */
  restAfterFailMs?: number;
  now?: () => number;
  log?: (message: string) => void;
}

export class demandBoot {
  private appeared = false;
  private lastCheck = 0;
  private showing = false;
  private lastUsed = 0;
  private weOpenedIt = false;
  private failedAt = 0;

  constructor(private readonly options: DemandBootOptions) {}

  private get now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** now 쓸 수 있나. 마지막으로 확인한 상태 그대로(묻지 않는다). */
  get isReady(): boolean {
    return this.appeared;
  }

  /** 우리가 켜 둔 것인가 (진단용). */
  get isOurs(): boolean {
    return this.weOpenedIt;
  }

  /**
   * now 필요하다. 안 떠 있으면 **뒤에서** 띄우기 시작한다.
   *
   * 이 함수는 안 기다린다(띄우기만 건다). 기다리는 건 말하는 쪽이다. 고른 목소리가 뜰
   * 때까지 기다렸다 그 목소리로 말한다.
   */
  async mustWrite(): Promise<void> {
    this.lastUsed = this.now;

    const interval = this.options.askIntervalMs ?? 5_000;
    if (this.now - this.lastCheck >= interval) {
      this.lastCheck = this.now;
      try {
        this.appeared = await this.options.isAlive();
      } catch {
        this.appeared = false;
      }
    }
    if (this.appeared || this.showing) return;
    if (this.options.isAuto?.() === false) return;

    if (this.now - this.failedAt < (this.options.restAfterFailMs ?? 60_000)) return;

    this.showing = true;
    this.options.log?.(`${this.options.name} 이(가) 필요해서 띄운다. 준비될 때까지 말이 기다린다`);
    void Promise.resolve()
      .then(() => this.options.show())
      .then(() => {
        this.weOpenedIt = true;
        /* **뜰 때까지 기다렸다가 띄우는 중을 푼다.**
         *
         * 처음엔 `띄우기()` 가 반환되면 곧바로 풀었다. 그런데 그건 프로그램을 시작시켰다일
         * 뿐이고, 이 프로그램은 **뜨는 데 30초**가 걸린다. 그 사이 들어온 말마다 아직 안
         * 떴네 하고 또 띄웠다. 실측으로 **25번 띄워 파이썬 프로세스가 38개**까지 갔다.
         * 컴퓨터가 앓는다. 준비될 때까지는 다시 안 띄운다. */
        return this.untilAppear();
      })
      .catch((e) => {
        this.failedAt = this.now;
        this.options.log?.(`${this.options.name} 을(를) 못 띄웠다: ${e instanceof Error ? e.message : String(e)}`);
      })
      .finally(() => {
        this.showing = false;
        this.lastCheck = 0;
      });
  }

  /** 뜰 때까지 물어본다. 정해진 시간을 넘기면 실패로 본다. 영영 띄우는 중은 없다. */
  private async untilAppear(): Promise<void> {
    const limit = this.options.prepareWaitMs ?? 180_000;
    const interval2 = this.options.prepareAskIntervalMs ?? 2_000;
    const start = this.now;
    for (;;) {
      await new Promise((r) => setTimeout(r, interval2));
      let isAlive = false;
      try {
        isAlive = await this.options.isAlive();
      } catch {
        isAlive = false;
      }
      if (isAlive) {
        this.appeared = true;
        this.options.log?.(`${this.options.name} 이(가) 준비됐다 (${Math.round((this.now - start) / 1000)}초)`);
        return;
      }
      if (this.now - start >= limit) {
        this.failedAt = this.now;
        throw new Error(`${Math.round(limit / 1000)}초 안에 안 떴다`);
      }
    }
  }

  /**
   * 쉬는 시간이 지났으면 끈다. 주기적으로 부른다.
   *
   * **우리가 띄운 것만 끈다.** 사람이 다른 데 쓰려고 손으로 띄워 둔 걸 끄면, 그건 도와주는
   * 게 아니라 남의 것을 끄는 일이다.
   */
  async stopIfIdle(): Promise<boolean> {
    const whenIdle = this.options.stopIfIdleMs?.() ?? 0;
    if (whenIdle <= 0 || this.weOpenedIt === false || this.appeared === false) return false;
    if (this.lastUsed === 0 || this.now - this.lastUsed < whenIdle) return false;

    try {
      await this.options.stop();
      this.options.log?.(`${this.options.name} 을(를) 껐다. ${Math.round(whenIdle / 60_000)}분 넘게 안 썼다`);
    } catch (e) {
      this.options.log?.(`${this.options.name} 을(를) 못 껐다: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    this.appeared = false;
    this.weOpenedIt = false;
    this.lastCheck = 0;
    return true;
  }
}

export interface OnDemandOptions {
  /** 무거운 진짜 목소리. */
  real: Speech;
  /** 켜고 끄는 자리. */
  boot: demandBoot;
  /** 이만큼 기다려도 안 뜨면 포기한다(그때는 소리가 없다. 딴 목소리로 바꾸지 않는다). */
  waitLimitMs?: number;
  log?: (message: string) => void;
}

/**
 * 필요하면 켜지는 목소리 하나.
 *
 * 목록에는 **늘 보인다.** 꺼져 있다고 목록에서 빼면 사람은 그걸 기능이 사라졌다로
 * 읽는다. 실제로 그렇게 읽혔다. 준비 안 된 동안은 **기다린다**. 딴 목소리로 바꾸지 않는다.
 */
export function onDemand(options: OnDemandOptions): Speech {
  const { real: real, boot: boot } = options;
  const waitLimit = options.waitLimitMs ?? 180_000;

  return {
    name: `${real.name}(필요할 때)`,
    contentType: real.contentType,

    voices(): Promise<readonly SpeechVoice[]> {
      // 꺼져 있어도 목록은 진짜 쪽 것으로 보여 준다. 고를 수 있어야 켤 이유도 생긴다.
      return Promise.resolve(real.voices()).catch(() => []);
    },

    async synthesize(text: string, voiceId?: string): Promise<Buffer> {
      await boot.mustWrite();

      /* **뜰 때까지 기다린다.** 딴 목소리로 바꾸지 않는다. 그건 같은 존재가 아니게 된다.
         무한히 기다리지는 않는다: 정해진 시간을 넘기면 포기하고, 그때는 **소리가 없다**
         (조용한 게 딴 사람 목소리보다 낫다). */
      const start2 = Date.now();
      let notified = false;
      while (boot.isReady === false) {
        if (Date.now() - start2 >= waitLimit) {
          throw new Error(`고른 목소리가 ${Math.round(waitLimit / 1000)}초 안에 준비 안 됐다`);
        }
        if (notified === false) {
          options.log?.('고른 목소리가 아직 안 떴다. 뜰 때까지 기다린다 (딴 목소리로 안 바꾼다)');
          notified = true;
        }
        await new Promise((r) => setTimeout(r, 500));
        await boot.mustWrite();
      }
      if (notified) options.log?.(`고른 목소리로 말한다 (${Math.round((Date.now() - start2) / 1000)}초 기다림)`);
      return real.synthesize(text, voiceId);
    },
  };
}
