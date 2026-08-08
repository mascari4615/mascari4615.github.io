import type { Speech, SpeechVoice } from './edge-tts';

/**
 * 무거운 곁딸린 프로그램을 **쓸 때 켜고 안 쓰면 끈다.**
 *
 * 흉내 낸 목소리(GPT-SoVITS)는 뜨는 데 30초쯤 걸리고 메모리를 크게 문다. 그래서 여태
 * 사람이 손으로 띄워 뒀는데, 그러면 **꺼져 있는 걸 아무도 모른다** — 목록에서 조용히
 * 빠지고, 화면에는 「목소리가 사라졌다」로만 보인다(사용자 실측 2026-08-08: 「내 로컬
 * 모델 어디감?」).
 *
 * 켜는 기준은 **부팅이 아니라 씀**이다(사용자 결정): 얘가 말을 하려 할 때 켜고, 한동안
 * 말이 없으면 끈다. 컴퓨터를 켤 때마다 30초씩 무거운 걸 올려 둘 이유가 없다.
 *
 * 규칙 둘:
 * - **기다리게 하지 않는다.** 아직 안 떴으면 이번 말은 대타 목소리로 그냥 나간다. 첫
 *   소리까지 걸리는 시간이 이 프로젝트의 핵심 지표라(7·65회차), 준비를 기다리느라 조용해지면
 *   그건 개선이 아니라 회귀다.
 * - **끄는 길이 늘 있다.** 설정으로 자동 기동을 끄면 손으로 띄운 것만 쓴다.
 */
export interface 수요기동옵션 {
  /** 사람이 읽는 이름. */
  이름: string;
  /** 지금 떠 있나. */
  살았나: () => Promise<boolean>;
  /** 띄운다. 오래 걸려도 된다 — 기다리지 않는다. */
  띄우기: () => void | Promise<void>;
  /** 끈다. */
  끄기: () => void | Promise<void>;
  /** 이만큼 안 쓰면 끈다 (0 = 안 끔). */
  쉬면끄기ms?: () => number;
  /** 자동으로 켜도 되나. 거짓이면 손으로 띄운 것만 쓴다. */
  자동인가?: () => boolean;
  /** 살았나를 이 간격보다 자주 묻지 않는다 — 매 발화마다 물으면 그게 지연이 된다. */
  물어보는간격ms?: number;
  /** 띄운 뒤 이 시간 안에 안 뜨면 실패로 본다. */
  준비대기ms?: number;
  /** 뜰 때까지 물어보는 간격. */
  준비물어보는간격ms?: number;
  /** 못 띄운 뒤 이만큼은 다시 안 띄운다 — 안 그러면 실패를 무한히 되풀이한다. */
  실패후쉬기ms?: number;
  지금?: () => number;
  log?: (message: string) => void;
}

export class 수요기동 {
  private 떴나 = false;
  private 마지막확인 = 0;
  private 띄우는중 = false;
  private 마지막사용 = 0;
  private 우리가띄웠나 = false;
  private 실패한때 = 0;

  constructor(private readonly options: 수요기동옵션) {}

  private get 지금(): number {
    return this.options.지금?.() ?? Date.now();
  }

  /** 지금 쓸 수 있나 — 마지막으로 확인한 상태 그대로(묻지 않는다). */
  get 준비됐나(): boolean {
    return this.떴나;
  }

  /** 우리가 켜 둔 것인가 (진단용). */
  get 우리것인가(): boolean {
    return this.우리가띄웠나;
  }

  /**
   * 지금 필요하다 — 안 떠 있으면 **뒤에서** 띄우기 시작한다.
   *
   * 기다리지 않는다. 이번 말은 부르는 쪽이 대타로 내보내고, 다음 말부터 이걸 쓰게 된다.
   */
  async 써야한다(): Promise<void> {
    this.마지막사용 = this.지금;

    const 간격 = this.options.물어보는간격ms ?? 5_000;
    if (this.지금 - this.마지막확인 >= 간격) {
      this.마지막확인 = this.지금;
      try {
        this.떴나 = await this.options.살았나();
      } catch {
        this.떴나 = false;
      }
    }
    if (this.떴나 || this.띄우는중) return;
    if (this.options.자동인가?.() === false) return;

    if (this.지금 - this.실패한때 < (this.options.실패후쉬기ms ?? 60_000)) return;

    this.띄우는중 = true;
    this.options.log?.(`${this.options.이름} 이(가) 필요해서 띄운다 — 준비될 때까지는 다른 걸로 말한다`);
    void Promise.resolve()
      .then(() => this.options.띄우기())
      .then(() => {
        this.우리가띄웠나 = true;
        /* **뜰 때까지 기다렸다가 「띄우는 중」을 푼다.**
         *
         * 처음엔 `띄우기()` 가 반환되면 곧바로 풀었다. 그런데 그건 「프로그램을 시작시켰다」일
         * 뿐이고, 이 프로그램은 **뜨는 데 30초**가 걸린다. 그 사이 들어온 말마다 「아직 안
         * 떴네」 하고 또 띄웠다 — 실측으로 **25번 띄워 파이썬 프로세스가 38개**까지 갔다.
         * 컴퓨터가 앓는다. 준비될 때까지는 다시 안 띄운다. */
        return this.뜰때까지();
      })
      .catch((e) => {
        this.실패한때 = this.지금;
        this.options.log?.(`${this.options.이름} 을(를) 못 띄웠다: ${e instanceof Error ? e.message : String(e)}`);
      })
      .finally(() => {
        this.띄우는중 = false;
        this.마지막확인 = 0;
      });
  }

  /** 뜰 때까지 물어본다. 정해진 시간을 넘기면 실패로 본다 — 영영 「띄우는 중」은 없다. */
  private async 뜰때까지(): Promise<void> {
    const 한계 = this.options.준비대기ms ?? 180_000;
    const 간격 = this.options.준비물어보는간격ms ?? 2_000;
    const 시작 = this.지금;
    for (;;) {
      await new Promise((r) => setTimeout(r, 간격));
      let 살았나 = false;
      try {
        살았나 = await this.options.살았나();
      } catch {
        살았나 = false;
      }
      if (살았나) {
        this.떴나 = true;
        this.options.log?.(`${this.options.이름} 이(가) 준비됐다 (${Math.round((this.지금 - 시작) / 1000)}초)`);
        return;
      }
      if (this.지금 - 시작 >= 한계) {
        this.실패한때 = this.지금;
        throw new Error(`${Math.round(한계 / 1000)}초 안에 안 떴다`);
      }
    }
  }

  /**
   * 쉬는 시간이 지났으면 끈다. 주기적으로 부른다.
   *
   * **우리가 띄운 것만 끈다.** 사람이 다른 데 쓰려고 손으로 띄워 둔 걸 끄면, 그건 도와주는
   * 게 아니라 남의 것을 끄는 일이다.
   */
  async 쉬었으면끄기(): Promise<boolean> {
    const 쉬면 = this.options.쉬면끄기ms?.() ?? 0;
    if (쉬면 <= 0 || this.우리가띄웠나 === false || this.떴나 === false) return false;
    if (this.마지막사용 === 0 || this.지금 - this.마지막사용 < 쉬면) return false;

    try {
      await this.options.끄기();
      this.options.log?.(`${this.options.이름} 을(를) 껐다 — ${Math.round(쉬면 / 60_000)}분 넘게 안 썼다`);
    } catch (e) {
      this.options.log?.(`${this.options.이름} 을(를) 못 껐다: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    this.떴나 = false;
    this.우리가띄웠나 = false;
    this.마지막확인 = 0;
    return true;
  }
}

export interface 필요할때옵션 {
  /** 무거운 진짜 목소리. */
  진짜: Speech;
  /** 아직 준비 안 됐을 때 대신 말할 목소리. */
  대타: Speech;
  /** 켜고 끄는 자리. */
  기동: 수요기동;
  log?: (message: string) => void;
}

/**
 * 「필요하면 켜지는」 목소리 하나.
 *
 * 목록에는 **늘 보인다.** 꺼져 있다고 목록에서 빼면 사람은 그걸 「기능이 사라졌다」로
 * 읽는다 — 오늘 실제로 그렇게 읽혔다. 대신 준비 안 된 동안은 대타가 소리를 낸다.
 */
export function 필요할때(options: 필요할때옵션): Speech {
  const { 진짜, 대타, 기동 } = options;

  return {
    name: `${진짜.name}(필요할 때)`,
    contentType: 진짜.contentType,

    voices(): Promise<readonly SpeechVoice[]> {
      // 꺼져 있어도 목록은 진짜 쪽 것으로 보여 준다 — 고를 수 있어야 켤 이유도 생긴다.
      return Promise.resolve(진짜.voices()).catch(() => []);
    },

    async synthesize(text: string, voiceId?: string): Promise<Buffer> {
      await 기동.써야한다();
      if (기동.준비됐나) {
        try {
          return await 진짜.synthesize(text, voiceId);
        } catch (e) {
          // 떠 있다고 봤는데 실패했다 — 이번 말까지 삼키지는 않는다.
          options.log?.(`흉내 낸 목소리가 실패해서 이번엔 대타로 말한다: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      /* 진짜 쪽 목소리 이름은 대타가 모른다 — 그대로 넘기면 「그런 목소리는 없다」로
         죽는다. 대타의 기본 목소리로 말하게 둔다. 소리가 나는 게 먼저다. */
      return 대타.synthesize(text);
    },
  };
}
