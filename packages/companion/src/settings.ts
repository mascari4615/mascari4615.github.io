import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 손댈 수 있는 설정 — 재시작 없이 바꾸는 것들.
 *
 * 레퍼런스 쪽은 「먼저 말하기」 같은 걸 **설정에서 켜고 끈다.** 우리도 인격·목소리·두뇌는
 * 창에서 갈아끼울 수 있게 해 뒀는데, **조용한 시간·먼저 말 거는 간격·화면 보기 간격은
 * 환경변수뿐**이었다. 바꾸려면 껐다 켜야 한다 — 곁에 있는 것을 껐다 켜는 건 이상한 일이다.
 *
 * 몇 가지 원칙을 뒀다.
 * - **아는 항목만 받는다.** 모르는 걸 그대로 받아 두면 오타가 조용히 쌓인다.
 * - **값의 범위를 지킨다.** 화면 보기 간격을 0.1초로 두면 컴퓨터가 앓는다.
 * - **파일이 정본이다.** 창을 새로 열어도 그대로고, 사람이 손으로 열어 고쳐도 된다.
 * - **끄는 것이 늘 가능해야 한다.** 어떤 항목이든 0/거짓으로 꺼지는 길을 남긴다.
 */
export interface SettingSpec {
  /** 무엇인지 (사람이 읽는 말). */
  what: string;
  /** 기본값. */
  value: number | boolean;
  /** 숫자면 범위. */
  min?: number;
  max?: number;
}

/** 손댈 수 있는 것들. 여기 없는 건 설정으로 안 받는다. */
export const 설정할것: Readonly<Record<string, SettingSpec>> = {
  먼저말걸기: { what: '얘가 먼저 말을 걸어도 되나', value: true },
  먼저말걸기간격초: { what: '먼저 말 걸지 살펴보는 간격', value: 300, min: 60, max: 3600 },
  화면보기간격초: { what: '화면을 곁눈질하는 간격 (0 = 안 봄)', value: 120, min: 0, max: 1800 },
  조용한시간시작: { what: '이 시각부터 조용 (시)', value: 23, min: 0, max: 23 },
  조용한시간끝: { what: '이 시각까지 조용 (시)', value: 7, min: 0, max: 23 },
  놀리기: { what: '가끔 놀려도 되나', value: true },
};

export type SettingValues = Record<string, number | boolean>;

export interface SettingsOptions {
  path?: string;
  log?: (message: string) => void;
}

/** 설정을 들고 있는 것. */
export class Settings {
  private values: SettingValues = {};

  constructor(private readonly options: SettingsOptions = {}) {
    for (const [k, spec] of Object.entries(설정할것)) this.values[k] = spec.value;

    const path = options.path;
    if (path !== undefined && existsSync(path)) {
      try {
        this.put(JSON.parse(readFileSync(path, 'utf8')), { quiet: true });
      } catch (e) {
        options.log?.(`설정을 못 읽었다 (기본값으로 간다): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** 하나 본다. */
  get(name: string): number | boolean | undefined {
    return this.values[name];
  }

  /** 숫자로 본다 — 밀리초가 필요한 자리가 많다. */
  ms(name: string): number {
    const v = this.values[name];
    return typeof v === 'number' ? v * 1000 : 0;
  }

  /** 참/거짓으로 본다. */
  on(name: string): boolean {
    return this.values[name] === true;
  }

  /** 다 본다. */
  get all(): Readonly<SettingValues> {
    return { ...this.values };
  }

  /**
   * 바꾼다. **아는 항목만, 범위 안에서만** 받는다.
   *
   * 무엇이 왜 안 받아들여졌는지 돌려준다 — 조용히 무시하면 왜 안 바뀌는지 모른다.
   */
  put(next: unknown, options: { quiet?: boolean } = {}): string[] {
    if (typeof next !== 'object' || next === null) return ['설정 꼴이 아니다'];

    const 안된것: string[] = [];
    for (const [k, raw] of Object.entries(next as Record<string, unknown>)) {
      const spec = 설정할것[k];
      if (spec === undefined) {
        안된것.push(`「${k}」 는 모르는 항목이다`);
        continue;
      }
      if (typeof spec.value === 'boolean') {
        if (typeof raw !== 'boolean') { 안된것.push(`「${k}」 는 참/거짓이어야 한다`); continue; }
        this.values[k] = raw;
        continue;
      }
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(n) === false) { 안된것.push(`「${k}」 는 숫자여야 한다`); continue; }
      const 묶은것 = Math.min(spec.max ?? n, Math.max(spec.min ?? n, Math.round(n)));
      if (묶은것 !== n) 안된것.push(`「${k}」 는 ${spec.min}~${spec.max} 안이어야 해서 ${묶은것} 로 뒀다`);
      this.values[k] = 묶은것;
    }

    this.save();
    if (options.quiet !== true) this.options.log?.(`설정을 바꿨다: ${JSON.stringify(this.values)}`);
    return 안된것;
  }

  private save(): void {
    const path = this.options.path;
    if (path === undefined) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.values, null, 2), 'utf8');
  }
}

/** 사람이 읽는 표 — 무엇을 바꿀 수 있는지 그대로 보여 준다. */
export function settingsReport(settings: Settings): string {
  return Object.entries(설정할것)
    .map(([k, spec]) => {
      const 값 = settings.get(k);
      const 범위 = typeof spec.value === 'number' ? ` (${spec.min}~${spec.max})` : '';
      return `${k.padEnd(16)} ${String(값).padEnd(6)} — ${spec.what}${범위}`;
    })
    .join('\n');
}
