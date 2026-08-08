/**
 * 자랑 카드가 사람을 데려왔나 (TASK-KL-195).
 *
 * 왜 따로 세나: 방문 원장(`karmolab-traces`)은 「누가 왔나」를 세지만 **어디서 왔는지**는 안
 * 적는다. 그게 없으면 카드를 아무리 고쳐도 그것이 사람을 데려왔는지 영영 모른다 —
 * 고칠 근거가 없는 것은 고쳐도 나아지는지 알 수 없다.
 *
 * 두 수만 센다: **펼쳐 본 수**(자랑 한 장이 열림)와 **넘어온 수**(거기서 사이트로 들어옴).
 * 둘의 차이가 카드의 힘이다. 사람을 식별하지 않는다 — 날짜별 숫자 두 칸뿐이고,
 * 누구인지·어디서인지는 안 적는다(자랑을 본 사람을 우리가 알 이유가 없다).
 *
 * 저장 = `data/karmolab-brag-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';

const STATE_FILE = 'karmolab-brag-state.json';

/** 며칠치 들고 있나. 이보다 오래된 날은 버린다 — 이 수는 추세용이지 회계가 아니다. */
export const KEEP_DAYS = 90;

export interface BragDay {
  /** 자랑 한 장이 펼쳐진 수. */
  views: number;
  /** 거기서 사이트로 넘어온 수. */
  clicks: number;
}

interface BragState {
  version: 1;
  days: Record<string, BragDay>;
}

export function kstDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

export class KarmolabBragStore {
  private state: BragState;

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): BragState {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<BragState>;
        return { version: 1, days: parsed.days ?? {} };
      }
    } catch (error) {
      console.error('[karmolab-brag] 상태 파일을 못 읽었다 — 0 에서 시작한다:', error);
    }
    return { version: 1, days: {} };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(this.state), 'utf-8');
    } catch (error) {
      console.error('[karmolab-brag] 상태 파일을 못 썼다:', error);
    }
  }

  /** 오래된 날을 버린다. 세는 자리에서 같이 부른다 — 청소를 따로 예약하면 그것이 안 도는 날이 온다. */
  private trim(): void {
    const days = Object.keys(this.state.days).sort();
    for (const day of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete this.state.days[day];
  }

  private bump(field: keyof BragDay, at: Date): BragDay {
    const day = kstDay(at);
    const row = this.state.days[day] ?? { views: 0, clicks: 0 };
    row[field] += 1;
    this.state.days[day] = row;
    this.trim();
    this.save();
    return row;
  }

  view(at: Date = new Date()): BragDay {
    return this.bump('views', at);
  }

  click(at: Date = new Date()): BragDay {
    return this.bump('clicks', at);
  }

  /** 최근 며칠. 아무 일도 없던 날은 **줄 자체가 없다**(0 을 늘어놓으면 표가 0 으로 덮인다). */
  recent(days = 14, at: Date = new Date()): Array<{ day: string } & BragDay> {
    const today = kstDay(at);
    return Object.entries(this.state.days)
      .filter(([day]) => day <= today)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, days)
      .map(([day, row]) => ({ day, ...row }));
  }

  total(): BragDay {
    let views = 0;
    let clicks = 0;
    for (const row of Object.values(this.state.days)) {
      views += row.views;
      clicks += row.clicks;
    }
    return { views, clicks };
  }
}

let singleton: KarmolabBragStore | null = null;

export function getKarmolabBragStore(): KarmolabBragStore {
  if (!singleton) singleton = new KarmolabBragStore();
  return singleton;
}
