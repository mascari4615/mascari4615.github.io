/**
 * 지구의 소리 (TASK-KL-206 단위 5 · TASK-KL-248 에서 엔진 분리)
 *
 * 자취방 창문이면 소리가 있어야 한다. 다만 **지구의 실제 소리는 없다** — 우주는 조용하고,
 * 위성은 소리를 보내지 않는다. 그러니 녹음을 가져다 트는 척은 안 한다. 대신 화면에서
 * 지금 일어나는 일을 **그 자리에서 합성**한다.
 *
 * (TASK-KL-241) 지구본은 소리를 둘 낸다. **이 별의 소리**(이 파일, 합성)와
 * **사람의 소리**(`radio.ts`, 실제 방송). 둘의 관계는 배타가 아니라 층이다:
 * 방송이 울리면 이쪽은 `duck()` 으로 밑에 깔리고, 방송이 끊기면 다시 올라온다.
 * 그래서 **침묵이 생기지 않는다** — 우주가 조용한 것과 화면이 고장 난 것은 사람 귀에 똑같다.
 *
 * (TASK-KL-248) 소리를 **만드는 장치는 여기 없다.** `lib/soundscape.ts` 한 벌을
 * 「소리 풍경」 도구와 나눠 쓴다. 다른 점은 **누가 크기를 정하느냐** 하나다:
 * 거기서는 사람이 슬라이더로, 여기서는 **지금 보고 있는 자리**가 정한다.
 * 그래서 소리를 손보면 두 곳이 함께 좋아진다.
 */
import { Soundscape } from '../../lib/soundscape';

export class EarthSound {
  /* 지구본이 쓰는 겹은 여섯. 모닥불·시냇물·기계음은 이 별의 소리가 아니라 방 안의 소리다. */
  private readonly scape = new Soundscape(['drone', 'murmur', 'pad', 'wave', 'wind', 'rain']);

  get running(): boolean {
    return this.scape.running;
  }

  /** 사용자 제스처 안에서 불러야 한다. */
  start(): void {
    this.scape.start();
    // 낮은 울림은 늘 깔려 있다 — 「크고 조용한 것이 돌고 있다」
    this.scape.set('drone', 0.85);
  }

  /**
   * 지금 보고 있는 자리의 소리.
   * `ocean` 바다인 정도 · `dry` 마른 땅인 정도 · `cloud` 구름 두께 · `city` 도시 불빛 · `night` 밤인 정도.
   * 값은 전부 0~1 이고, **크기만** 바꾼다.
   */
  place(ocean: number, dry: number, cloud: number, city: number, night: number): void {
    this.scape.set('wave', ocean);
    this.scape.set('wind', dry);
    // 구름이 어느 정도 두꺼워져야 비가 된다 — 옅은 구름에서 비가 오면 그건 거짓말이다
    this.scape.set('rain', Math.max(0, cloud - 0.35) / 0.65);
    // 도시 웅성거림은 밤에 더 또렷하다 — 낮에는 다른 소리에 묻힌다
    this.scape.set('murmur', city * (0.4 + night * 0.6));
  }

  /**
   * 화면 전체 상태(오로라 세기). 웅성거림은 **자리**가 정하므로 여기서 안 건드린다 —
   * 두 곳에서 같은 손잡이를 잡으면 서로 밀어내며 소리가 흔들린다.
   */
  update(_nightCityRatio: number, auroraStrength: number): void {
    this.scape.set('pad', Math.min(1, auroraStrength));
  }

  /** 지진 — 한 번 낮게 운다. 규모가 클수록 낮고 길다. */
  quake(mag: number): void {
    const dur = Math.min(4, 1.2 + mag * 0.28);
    this.scape.impulse(Math.max(26, 78 - mag * 5), dur, 0.12 + mag * 0.05);
  }

  /**
   * 사람의 소리가 울리는 동안 **밑에 깔린다** (TASK-KL-241).
   *
   * 끄지 않는 이유: 방송은 자주 끊긴다. 그때마다 완전한 무음이 생기면 사람은 고장으로 읽는다.
   * 아주 작게 남겨 두면 끊긴 순간 이 별의 소리가 다시 차오른다 — 창문은 계속 열려 있는 것이다.
   */
  duck(on: boolean): void {
    this.scape.duck(on);
  }

  stop(): void {
    this.scape.stop();
  }
}
