/**
 * 「AI 켜기」 게이트 — 상태만 (해자④ / 흡수계획 12 § 2)
 *
 * 모델은 수십~수백 MB 다. **도구를 열자마자 받으면 안 된다** — 오늘 이 도구를 쓰러 온 사람은
 * 대개 AI 를 원해서 온 게 아니고, 남의 데이터 요금으로 실험하면 안 된다.
 * 그래서 「받겠다」를 한 번 누르게 하고, 누르기 **전에 크기와 걸리는 시간을 숫자로** 보여 준다.
 *
 * 여기에는 화면이 없다. 상태와 규칙만 담는다 — 화면은 이 상태를 그리기만 하면 되고,
 * 규칙(취소하면 어떻게 되나·실패하면 다시 누를 수 있나)은 **한 곳에서만** 정해진다.
 *
 * ★ 이 게이트에서 가장 중요한 것은 **취소한 뒤에도 도구가 멀쩡해야 한다**는 것이다 (12 § 6).
 * 받다 만 상태가 도구를 망가뜨리면, 사람들은 「AI 켜기」를 다시는 안 누른다.
 */
import { downloadNotice, explainFailure, type AiFailure } from './ai-route';

export type GateState =
  /** 아직 아무 것도 안 했다. 도구는 그냥 도구다. */
  | 'idle'
  /** 「이만큼 받습니다」를 보여 주고 답을 기다리는 중. */
  | 'asking'
  /** 받는 중. 진행률이 있고, 취소할 수 있다. */
  | 'loading'
  /** 켜졌다. */
  | 'ready'
  /** 실패. 왜인지와 다시 해 볼 수 있는지를 함께 들고 있다. */
  | 'failed';

export interface GateView {
  state: GateState;
  /** 0~100. `loading` 일 때만 뜻이 있다. */
  percent: number;
  /** 사람에게 보여 줄 한 줄. 상태마다 반드시 있다 — 빈 화면은 고장처럼 보인다. */
  say: string;
  /** 실패했을 때만. */
  failure?: AiFailure;
  /** 지금 취소할 수 있나. */
  cancellable: boolean;
}

export interface GateOptions {
  sizeMb: number;
  /** 이 정도 속도로 어림한다. 화면이 실제 속도를 알면 바꿔 줘도 된다. */
  mbps?: number;
  /** 실제로 받는 일. 진행률을 알려 주고, `signal` 이 끊기면 멈춰야 한다. */
  fetch: (onProgress: (pct: number) => void, signal: AbortSignal) => Promise<void>;
  /** 상태가 바뀔 때마다 부른다 (화면 다시 그리기). */
  onChange?: (view: GateView) => void;
}

export class AiGate {
  private state: GateState = 'idle';
  private percent = 0;
  private failure: AiFailure | undefined;
  private controller: AbortController | null = null;

  constructor(private readonly opts: GateOptions) {}

  view(): GateView {
    return {
      state: this.state,
      percent: this.percent,
      say: this.say(),
      failure: this.failure,
      cancellable: this.state === 'loading'
    };
  }

  private say(): string {
    switch (this.state) {
      case 'idle':
        return 'AI 기능은 꺼져 있습니다 — 도구는 그대로 쓸 수 있습니다';
      case 'asking':
        return downloadNotice(this.opts.sizeMb, this.opts.mbps);
      case 'loading':
        return `받는 중… ${this.percent}%  (취소해도 도구는 그대로 씁니다)`;
      case 'ready':
        return 'AI 기능이 켜졌습니다';
      case 'failed':
        return this.failure?.say ?? '알 수 없는 이유로 실패했습니다';
    }
  }

  private emit(): void {
    this.opts.onChange?.(this.view());
  }

  /** 「AI 켜기」를 눌렀다 — 아직 안 받는다. 먼저 얼마나 받는지 보여 준다. */
  ask(): void {
    if (this.state === 'ready' || this.state === 'loading') return;
    this.state = 'asking';
    this.failure = undefined;
    this.emit();
  }

  /** 「받겠다」를 눌렀다. 여기서부터 실제로 받는다. */
  async accept(): Promise<boolean> {
    if (this.state === 'ready') return true;
    if (this.state === 'loading') return false;

    this.state = 'loading';
    this.percent = 0;
    this.failure = undefined;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.emit();

    try {
      await this.opts.fetch((pct) => {
        /* 취소한 뒤에 늦게 온 진행률로 화면을 되살리지 않는다. */
        if (signal.aborted || this.state !== 'loading') return;
        this.percent = Math.max(0, Math.min(100, Math.round(pct)));
        this.emit();
      }, signal);
    } catch (e) {
      if (signal.aborted) return false; // 취소는 실패가 아니다 — 아래 cancel() 이 상태를 이미 정했다
      this.state = 'failed';
      this.failure = e instanceof Error && 'info' in e ? (e as { info: AiFailure }).info : explainFailure('download', short(e));
      this.controller = null;
      this.emit();
      return false;
    }

    if (signal.aborted) return false;
    this.state = 'ready';
    this.percent = 100;
    this.controller = null;
    this.emit();
    return true;
  }

  /**
   * 취소. **받다 만 것은 버리고 처음 상태로 돌아간다.**
   * 「반쯤 켜진」 상태를 남기면 다음에 무엇이 될지 아무도 모른다 — 그게 도구를 망가뜨린다.
   */
  cancel(): void {
    if (this.state !== 'loading') return;
    this.controller?.abort();
    this.controller = null;
    this.state = 'idle';
    this.percent = 0;
    this.failure = undefined;
    this.emit();
  }

  /** 실패한 뒤 다시. 「다시 해도 같은 것」이면 부르는 쪽이 버튼을 안 보여 준다. */
  retry(): Promise<boolean> {
    if (this.state === 'failed' && this.failure?.retryable === false) return Promise.resolve(false);
    this.state = 'asking';
    this.emit();
    return this.accept();
  }
}

const short = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 60);
