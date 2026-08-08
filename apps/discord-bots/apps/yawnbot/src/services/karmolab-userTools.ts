/**
 * 남이 만든 도구 (TASK-KL-183 H) — 창작자 층.
 *
 * 표(KL-150)와 흐름(KL-181)까지 왔다. 다음은 **도구 자체**다.
 *
 * 위험을 어떻게 다루나 — 이건 남의 코드를 남의 브라우저에서 돌리는 일이다:
 *  ① 서버는 **글자만 보관한다**. 실행은 브라우저의 모래상자(iframe sandbox)에서만 일어난다.
 *  ② 모래상자에는 **우리 출처를 안 준다**(`allow-same-origin` 없음). 그래서 그 안의 코드는
 *     우리 쿠키·저장소·계정에 손댈 수 없다 — 남의 도구가 내 계정을 만지는 일은 구조적으로 없다.
 *  ③ 바깥으로 나가는 길도 막는다(CSP `connect-src 'none'`). 올린 사람이 남의 글을 어디로
 *     보내는 것을 애초에 못 한다.
 *  ④ 길이 상한 — 큰 것을 못 올리게. 사람이 읽을 수 있는 크기여야 검토도 가능하다.
 *
 * 「검토 후 공개」 같은 절차는 아직 없다. 대신 **기본이 비공개**다: 만든 사람과 주소를 아는
 * 사람만 연다. 목록에 올리는 것은 주인이 스스로 켠다.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';

export interface UserTool {
  id: string;
  title: string;
  ownerHandle: string;
  /** 화면 한 장 — HTML(스타일·스크립트 포함). 모래상자 안에서만 돈다. */
  source: string;
  /** 목록에 올릴까. 기본은 아니다 — 아무나 올린 것이 첫 화면에 뜨면 그건 사이트가 아니라 게시판이다. */
  listed: boolean;
  createdAt: string;
  updatedAt: string;
  runs: number;
  /**
   * 신고 (TASK-KL-191 축4) — 누가 몇 번. 같은 사람은 한 번만 센다.
   *
   * 사람 이름을 남기는 이유: 한 사람이 백 번 눌러 남의 도구를 세우는 것을 막으려면 **누가**를
   * 알아야 한다. 이유는 안 받는다 — 자유 텍스트를 받으면 그건 신고가 아니라 또 하나의 게시판이고,
   * 볼 사람이 없으면 안 보는 글이 쌓인다.
   */
  reports?: string[];
  /**
   * 세워 둠. **목록에서만 빼는 것이 아니라 소스를 안 준다** — 목록에서만 빼면 주소를 아는
   * 사람에게는 그대로 돌아간다(그러면 세운 것이 아니다).
   */
  stopped?: boolean;
  /** 왜 세웠나 — 주인에게 보일 한 줄. 없으면 신고가 쌓여서다. */
  stoppedReason?: string | null;
}

/** 이만큼 신고가 쌓이면 스스로 선다. 사람이 볼 때까지 도는 것을 막는 최소한이다. */
export const REPORTS_TO_STOP = 3;

interface State {
  version: 1;
  tools: Record<string, UserTool>;
}

const STATE_FILE = 'karmolab-user-tools-state.json';

export const TITLE_MAX = 32;
/** 사람이 읽을 수 있는 크기 — 검토할 수 없는 것은 올릴 수도 없어야 한다. */
export const SOURCE_MAX = 20000;
export const PER_OWNER = 10;

export class KarmolabUserToolStore {
  private state: State;

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): State {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<State>;
        return { version: 1, tools: parsed.tools ?? {} };
      }
    } catch (error) {
      console.error('[karmolab-user-tools] 상태 파일을 못 읽었다 — 빈 상태로 시작한다:', error);
    }
    return { version: 1, tools: {} };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const tmp = `${this.statePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
      fs.renameSync(tmp, this.statePath);
    } catch (error) {
      console.error('[karmolab-user-tools] 상태 저장 실패:', error);
    }
  }

  private clean(title: unknown): string {
    return String(title ?? '').replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
  }

  create(ownerHandle: string, input: { title?: unknown; source?: unknown }): UserTool | null {
    const title = this.clean(input.title);
    const source = String(input.source ?? '');
    if (!title || !source.trim()) return null;
    if (source.length > SOURCE_MAX) return null;
    if (this.byOwner(ownerHandle).length >= PER_OWNER) return null;

    const now = new Date().toISOString();
    const tool: UserTool = {
      id: crypto.randomBytes(5).toString('hex'),
      title,
      ownerHandle,
      source,
      listed: false, // 기본은 비공개 — 올리는 것은 주인이 스스로 켠다
      createdAt: now,
      updatedAt: now,
      runs: 0,
    };
    this.state.tools[tool.id] = tool;
    this.save();
    return tool;
  }

  update(id: string, ownerHandle: string, input: { title?: unknown; source?: unknown; listed?: unknown }): UserTool | null {
    const tool = this.state.tools[id];
    if (!tool || tool.ownerHandle !== ownerHandle) return null;
    const title = this.clean(input.title);
    if (title) tool.title = title;
    if (typeof input.source === 'string' && input.source.trim() && input.source.length <= SOURCE_MAX) {
      tool.source = input.source;
    }
    if (typeof input.listed === 'boolean') tool.listed = input.listed;
    tool.updatedAt = new Date().toISOString();
    this.save();
    return tool;
  }

  remove(id: string, ownerHandle: string): boolean {
    const tool = this.state.tools[id];
    if (!tool || tool.ownerHandle !== ownerHandle) return false;
    delete this.state.tools[id];
    this.save();
    return true;
  }

  get(id: string): UserTool | null {
    return this.state.tools[id] ?? null;
  }

  byOwner(ownerHandle: string): UserTool[] {
    return Object.values(this.state.tools)
      .filter((tool) => tool.ownerHandle === ownerHandle)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** 목록 — 주인이 스스로 켠 것만. 선 것은 안 나온다. 많이 돈 것이 앞이다. */
  listed(limit = 30): UserTool[] {
    return Object.values(this.state.tools)
      .filter((tool) => tool.listed && !tool.stopped)
      .sort((a, b) => b.runs - a.runs || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  /**
   * 신고 (TASK-KL-191 축4). 같은 사람은 한 번만 센다 — 한 사람이 백 번 눌러 남의 도구를
   * 세우는 것이 신고가 되면, 신고는 도구가 아니라 무기다.
   *
   * 주인은 자기 도구를 신고할 수 없다. 세우고 싶으면 스스로 목록에서 내리면 된다.
   */
  report(id: string, reporterHandle: string): { reports: number; stopped: boolean } | null {
    const tool = this.state.tools[id];
    if (!tool || !reporterHandle || tool.ownerHandle === reporterHandle) return null;
    const reports = tool.reports ?? [];
    if (!reports.includes(reporterHandle)) reports.push(reporterHandle);
    tool.reports = reports;
    /* 셋이 쌓이면 **스스로 선다**. 사람이 볼 때까지 도는 것을 막는 최소한이다 —
     * 「검토 대기」로 두면 그 사이에 계속 남의 브라우저에서 돈다. */
    if (reports.length >= REPORTS_TO_STOP && !tool.stopped) {
      tool.stopped = true;
      tool.stoppedReason = `신고 ${reports.length}건`;
      tool.listed = false;
    }
    this.save();
    return { reports: reports.length, stopped: tool.stopped === true };
  }

  /** 주인이 세우거나 다시 연다. 다시 열면 신고 수는 그대로 남는다 — 지운 척하지 않는다. */
  setStopped(id: string, ownerHandle: string, stopped: boolean): UserTool | null {
    const tool = this.state.tools[id];
    if (!tool || tool.ownerHandle !== ownerHandle) return null;
    if (stopped) {
      tool.stopped = true;
      tool.stoppedReason = '주인이 세움';
      tool.listed = false;
    } else {
      /* 신고로 선 것을 주인이 혼자 되돌릴 수는 없다 — 그러면 세운 것이 아니다. */
      if ((tool.reports?.length ?? 0) >= REPORTS_TO_STOP) return null;
      delete tool.stopped;
      tool.stoppedReason = null;
    }
    tool.updatedAt = new Date().toISOString();
    this.save();
    return tool;
  }

  noteRun(id: string): number {
    const tool = this.state.tools[id];
    if (!tool) return 0;
    tool.runs += 1;
    this.save();
    return tool.runs;
  }

  /**
   * 「이 도구가 뭘 하나」 (TASK-KL-191 축4).
   *
   * 사람이 올린 설명을 믿을 수는 없다 — 설명은 만든 사람이 쓰고 싶은 대로 쓴다. 그래서
   * **소스에서 읽는다**: 무엇을 부르는지가 무엇을 하는지다.
   *
   * 이 요약은 **안전 판정이 아니다**. 안전은 상자가 만든다(우리 출처 없음 · 바깥 통신 끊김).
   * 여기서 말하는 것은 「무엇을 만지려 하나」뿐이고, 그건 **읽을지 말지**를 사람이 정하는 근거다.
   * 못 읽는 것(난독화된 글자 뭉치)은 못 읽는다고 말한다 — 아는 척이 제일 나쁘다.
   */
  static summarize(source: string): { does: string[]; blocked: string[]; unreadable: boolean } {
    const text = String(source ?? '');
    const has = (re: RegExp): boolean => re.test(text);
    const does: string[] = [];
    if (has(/<canvas|getContext\(/)) does.push('그림을 그린다');
    if (has(/type=["']file|FileReader|\.files\b/)) does.push('내 파일을 읽는다 (상자 안에서만)');
    if (has(/AudioContext|<audio|new Audio\(/)) does.push('소리를 낸다');
    if (has(/setInterval|requestAnimationFrame/)) does.push('계속 움직인다');
    if (has(/navigator\.clipboard|execCommand\(['"]copy/)) does.push('클립보드를 만지려 한다');
    if (has(/<form|addEventListener\(['"]submit/)) does.push('입력을 받는다');

    /* 상자가 이미 막아 둔 것들. 「하려고 했다」는 사실 자체가 사람이 알아야 할 정보다 —
     * 막혔으니 안 보여 주면, 막힌 것이 풀리는 날 아무도 모른다. */
    const blocked: string[] = [];
    if (has(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/)) blocked.push('바깥으로 보내기 (끊겨 있음)');
    if (has(/localStorage|sessionStorage|indexedDB|document\.cookie/)) blocked.push('내 저장소·쿠키 (안 보임)');
    if (has(/geolocation|getUserMedia|Notification\b/)) blocked.push('위치·카메라·알림 (막혀 있음)');

    /* 사람이 읽을 수 없는 글자 뭉치 — 한 줄이 지나치게 길거나 공백이 거의 없다.
     * 그것 자체는 죄가 아니지만, 「요약했다」고 말하면 안 되는 신호다. */
    const longest = Math.max(0, ...text.split('\n').map((line) => line.length));
    const spaceRatio = text.length ? (text.match(/\s/g)?.length ?? 0) / text.length : 1;
    const unreadable = text.length > 400 && (longest > 2000 || spaceRatio < 0.05);

    return { does, blocked, unreadable };
  }

  stats(): { tools: number; listed: number } {
    const tools = Object.values(this.state.tools);
    return { tools: tools.length, listed: tools.filter((t) => t.listed).length };
  }
}

let shared: KarmolabUserToolStore | null = null;

export function getKarmolabUserToolStore(): KarmolabUserToolStore {
  if (!shared) shared = new KarmolabUserToolStore();
  return shared;
}
