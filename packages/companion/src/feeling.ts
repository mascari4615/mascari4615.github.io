/**
 * 흔들리는 마음 — 방금 있었던 일이 다음 순간에 남는다.
 *
 * 지금 기분(`readMood`)은 **시계 함수**다. 몇 시인지, 얼마나 혼자 있었는지, 최근에 몇 마디
 * 했는지로 매번 새로 계산한다. 그래서 조수님이 웃어 줘도, 놀이에서 이겨도, 열 번을 쿡쿡
 * 찔러도 **기분이 하나도 안 변한다.** 방금 있었던 일이 다음 순간에 남지 않는다.
 *
 * 감정 모델 쪽에서 오래 쓰는 그림은 두 축이다 — **좋음/나쁨**과 **들뜸/처짐**. 이 그림의
 * 쓸모는 감정 이름을 붙이는 게 아니라 **연속적으로 움직인다**는 데 있다. 사건이 밀고,
 * 아무 일 없으면 서서히 제자리로 돌아온다.
 *
 * 되돌아오는 게 핵심이다. 되돌아오지 않으면 한 번 삐친 얘는 영영 삐쳐 있고, 한 번 신난
 * 얘는 영영 들떠 있다. 그건 기분이 아니라 **고장**이다.
 *
 * 시계 기분을 **밀어내지 않고 얹는다.** 밤이 깊으면 여전히 처지고, 그 위에서 오늘 있었던
 * 일이 얼마쯤 밀어 준다.
 */
export interface Feeling {
  /** 좋음(+1) ↔ 나쁨(−1). */
  valence: number;
  /** 들뜸(+1) ↔ 처짐(−1). */
  arousal: number;
}

/** 아무 일도 없을 때의 자리. 살짝 처진 쪽이 이 얘의 평소다. */
export const 평소: Feeling = { valence: 0.05, arousal: -0.1 };

/** 무슨 일이 마음을 얼마나 미는가. */
export const 일들 = {
  웃어줌: { valence: 0.35, arousal: 0.3 },
  받아줌: { valence: 0.2, arousal: 0.15 },
  되물음: { valence: 0.15, arousal: 0.2 },
  시들함: { valence: -0.2, arousal: -0.15 },
  무시당함: { valence: -0.25, arousal: -0.2 },
  쿡찔림: { valence: -0.05, arousal: 0.25 },
  자꾸찔림: { valence: -0.2, arousal: 0.15 },
  쓰다듬김: { valence: 0.3, arousal: -0.1 },
  끌려다님: { valence: -0.1, arousal: 0.3 },
  놀이이김: { valence: 0.4, arousal: 0.35 },
  놀이짐: { valence: -0.15, arousal: 0.1 },
  같이놂: { valence: 0.25, arousal: 0.25 },
  오래혼자: { valence: -0.1, arousal: -0.25 },
} as const satisfies Record<string, Feeling>;

export type 일 = keyof typeof 일들;

const 묶기 = (x: number): number => Math.max(-1, Math.min(1, x));

export interface FeelingOptions {
  /** 이만큼 지나면 절반쯤 제자리로 돌아온다. */
  halfLifeMs?: number;
  now?: () => number;
}

/**
 * 마음이 어디쯤 있나. 사건이 밀고 시간이 되돌린다.
 *
 * 되돌아오는 셈은 **반감기**로 한다 — 한 번에 뚝 떨어지지 않고 완만하게 스민다. 언제
 * 물어보든 답이 같아야 하므로, 지난 시간만으로 계산하고 안에서 따로 재지 않는다.
 */
export class Heart {
  private feeling: Feeling = { ...평소 };
  private at: number;
  private readonly halfLife: number;
  private readonly now: () => number;

  constructor(options: FeelingOptions = {}) {
    this.halfLife = options.halfLifeMs ?? 12 * 60_000;
    this.now = options.now ?? (() => Date.now());
    this.at = this.now();
  }

  /** 무슨 일이 있었다. */
  felt(what: 일, 세기 = 1): Feeling {
    const 지금 = this.settle();
    const 민다 = 일들[what];
    this.feeling = {
      valence: 묶기(지금.valence + 민다.valence * 세기),
      arousal: 묶기(지금.arousal + 민다.arousal * 세기),
    };
    return { ...this.feeling };
  }

  /** 지금 마음. 물어보는 것만으로 달라지지 않는다. */
  get state(): Feeling {
    return this.settle();
  }

  /**
   * 시계 기분 위에 오늘 있었던 일을 얹는다. 밀어내지 않고 더한다.
   *
   * 얹는 것은 **평소 자리에서 얼마나 벗어났나**지 지금 값 자체가 아니다. 지금 값을 그대로
   * 더하면 아무 일이 없어도 시계 기분이 깎인다(평소가 살짝 처진 쪽이니까) — 시험이 잡았다.
   */
  colour(mood: { energy: number; warmth: number }): { energy: number; warmth: number } {
    const 지금 = this.settle();
    return {
      energy: Math.max(0, Math.min(1, mood.energy + (지금.arousal - 평소.arousal) * 0.25)),
      warmth: Math.max(0, Math.min(1, mood.warmth + (지금.valence - 평소.valence) * 0.25)),
    };
  }

  /** 지난 시간만큼 제자리로 되돌린다. */
  private settle(): Feeling {
    const 지금 = this.now();
    const 지난 = Math.max(0, 지금 - this.at);
    this.at = 지금;
    if (지난 === 0) return { ...this.feeling };

    const 남는비율 = Math.pow(0.5, 지난 / this.halfLife);
    this.feeling = {
      valence: 평소.valence + (this.feeling.valence - 평소.valence) * 남는비율,
      arousal: 평소.arousal + (this.feeling.arousal - 평소.arousal) * 남는비율,
    };
    return { ...this.feeling };
  }
}

/**
 * 두뇌에 넘길 한 줄. **감정 이름을 붙이지 않는다.**
 *
 * 「너는 지금 기쁨 상태다」라고 적으면 얘는 기쁨을 연기한다. 무슨 일이 있었는지만 말하고
 * 어떻게 말할지는 얘가 정하게 둔다.
 */
export function feelingNote(feeling: Feeling): string {
  const 셈 = Math.abs(feeling.valence) + Math.abs(feeling.arousal);
  if (셈 < 0.25) return '';

  const 좋고나쁨 = feeling.valence > 0.2 ? '조금 전 일이 나쁘지 않았다'
    : feeling.valence < -0.2 ? '조금 전 일이 좀 언짢았다'
    : null;
  const 들뜸처짐 = feeling.arousal > 0.2 ? '아직 좀 들떠 있다'
    : feeling.arousal < -0.35 ? '가라앉아 있다'
    : null;

  const 말 = [좋고나쁨, 들뜸처짐].filter((x) => x !== null).join('. ');
  return 말 === '' ? '' : `${말}. 그 결이 말투에 묻어나도 된다 — 다만 감정을 설명하지는 마라.`;
}
