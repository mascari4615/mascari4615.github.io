/**
 * 도구 흐름(Flow) 원장 (TASK-KL-181).
 *
 * 왜: 도구가 160개인데 **서로 못 만난다**. KL-133 이 이어서로 한 쌍을 통하게 했지만 그것은
 * 그 자리에서 한 번이다. 같은 일을 매주 하는 사람은 매주 같은 순서를 손으로 다시 밟는다.
 *
 * 흐름을 **물건으로** 만들면 셋이 한꺼번에 풀린다: 다시 쓰기, 남에게 주기, 자동으로 돌리기.
 *
 * 저장하는 것은 **순서뿐**이다. 파일도 결과도 서버에 안 올라온다. 우리 도구는 전부 브라우저
 * 안에서 돌고, 흐름은 그 순서를 적어 둔 종이 한 장이다.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';

export interface FlowStep {
  /** 어느 도구인가 */
  toolId: string;
  /** 이 단계에서 사람이 할 일 한 줄 (없어도 된다) */
  note?: string;
  /**
   * 이 단계를 **건너뛸 조건** (TASK-KL-183 B).
   *
   * 분기를 나무로 만들지 않는다. 줄은 하나로 두고 이 조건이면 건너뛴다만 붙인다.
   * 나무는 화면이 복잡해지는 만큼 사람이 안 쓰고, 우리가 풀려는 문제는 갈래가 아니라
   * **가끔 필요 없는 단계**다(그림이 이미 작으면 압축을 건너뛴다 같은).
   *
   * `no-result` = 앞 단계가 결과를 안 내놨으면 건너뛴다.
   * `small` = 앞 결과가 1MB 미만이면 건너뛴다.
   */
  skipWhen?: 'no-result' | 'small';
}

export interface Flow {
  id: string;
  title: string;
  /** 만든 사람의 주소. 지운 계정의 흐름은 주인 없이 남는다(남이 담아 간 것이 안 죽게). */
  ownerHandle: string | null;
  steps: FlowStep[];
  createdAt: string;
  updatedAt: string;
  /** 남의 것을 담아 온 것이면 그 원본 id */
  forkedFrom: string | null;
  /** 몇 번 돌았나. 실측만. 지어낸 수는 없다. */
  runs: number;
  /**
   * 마지막으로 돈 자국들 (TASK-KL-182 F5). 최근 20판.
   *
   * 왜 남기나: 흐름을 만들어 놓고 이거 실제로 되나를 아무도 못 봤다. 몇 번째에서 멈췄는지,
   * 얼마나 걸렸는지가 보이면 **어느 단계가 막히는지**가 드러난다. 그게 흐름을 고치는 유일한 단서다.
   * 파일도 결과도 안 남긴다. 남기는 것은 **몇 번째, 얼마나**뿐이다.
   */
  trails?: FlowTrail[];
  /** 때가 되면 알려 줄까 (TASK-KL-183 B). 서버가 대신 돌지는 않는다. 알리는 것까지다. */
  reminder?: { weekday: number; hour: number; lastFiredWeek: string | null };
  /**
   * 스스로 이어갈까 (TASK-KL-191 축1).
   *
   * 자동화라고 적어 놓고 사람이 단계마다 **다음**을 눌러야 했다. 진짜 걸림돌은 서버가
   * 아니라 그 클릭이다. 결과는 이미 나왔고, 다음 도구도 이미 그 결과를 받을 줄 안다.
   *
   * 서버가 대신 도는 것은 여전히 **불가능**하다(도구가 전부 브라우저 안에서 돈다). 그러니
   * 자동은 브라우저에서 일어난다: 결과가 나오면 잠깐 세었다가 스스로 다음 도구로 간다.
   * 세는 동안 멈출 수 있다. 못 멈추는 자동은 자동이 아니라 덫이다.
   */
  auto?: boolean;
}

export interface FlowTrail {
  at: string;
  /** 몇 단계까지 갔나 (1부터) */
  reached: number;
  /** 끝까지 갔나 */
  finished: boolean;
  /** 걸린 시간(초). 못 재면 null */
  seconds: number | null;
}

/** 자국은 스무 판까지. 그보다 오래된 것은 흐름을 고치는 데 안 쓰인다. */
export const TRAIL_KEEP = 20;

interface FlowsState {
  version: 1;
  flows: Record<string, Flow>;
}

const STATE_FILE = 'karmolab-flows-state.json';

export const TITLE_MAX = 40;
export const NOTE_MAX = 60;
export const STEP_MAX = 8;
/** 한 사람이 만들 수 있는 흐름 수. 많아지면 목록이 못 읽히고, 그때는 흐름이 아니라 창고다. */
export const FLOWS_PER_OWNER = 30;

function isToolIdLike(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);
}

/** 사람이 쓴 한 줄을 화면에 그대로 쓸 수 있는 모양으로. 자유 HTML 은 받지 않는다. */
function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\x00-\x1f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export class KarmolabFlowStore {
  private state: FlowsState;

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): FlowsState {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<FlowsState>;
        return { version: 1, flows: parsed.flows ?? {} };
      }
    } catch (error) {
      console.error('[karmolab-flows] 상태 파일을 못 읽었다. 빈 상태로 시작한다:', error);
    }
    return { version: 1, flows: {} };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const tmp = `${this.statePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
      fs.renameSync(tmp, this.statePath);
    } catch (error) {
      console.error('[karmolab-flows] 상태 저장 실패:', error);
    }
  }

  private normalizeSteps(raw: unknown): FlowStep[] {
    if (!Array.isArray(raw)) return [];
    const steps: FlowStep[] = [];
    for (const item of raw) {
      const toolId = (item ?? {}) as { toolId?: unknown; note?: unknown };
      if (!isToolIdLike(toolId.toolId)) continue;
      const note = clean(toolId.note, NOTE_MAX);
      const raw = (item ?? {}) as { skipWhen?: unknown };
      const skipWhen = raw.skipWhen === 'no-result' || raw.skipWhen === 'small' ? raw.skipWhen : undefined;
      const step: FlowStep = { toolId: toolId.toolId };
      if (note) step.note = note;
      if (skipWhen) step.skipWhen = skipWhen;
      steps.push(step);
      if (steps.length >= STEP_MAX) break;
    }
    return steps;
  }

  /** 만들기. 단계가 하나도 없으면 흐름이 아니다. 빈 흐름은 안 만든다. */
  create(ownerHandle: string | null, input: { title?: unknown; steps?: unknown; forkedFrom?: string | null }): Flow | null {
    const steps = this.normalizeSteps(input.steps);
    const title = clean(input.title, TITLE_MAX);
    if (!steps.length || !title) return null;
    if (ownerHandle && this.byOwner(ownerHandle).length >= FLOWS_PER_OWNER) return null;

    const now = new Date().toISOString();
    const flow: Flow = {
      id: crypto.randomBytes(5).toString('hex'),
      title,
      ownerHandle,
      steps,
      createdAt: now,
      updatedAt: now,
      forkedFrom: input.forkedFrom ?? null,
      runs: 0,
    };
    this.state.flows[flow.id] = flow;
    this.save();
    return flow;
  }

  /** 고치기. 주인만. 남의 흐름은 담아서 자기 것으로 만든 뒤 고친다. */
  update(id: string, ownerHandle: string, input: { title?: unknown; steps?: unknown }): Flow | null {
    const flow = this.state.flows[id];
    if (!flow || flow.ownerHandle !== ownerHandle) return null;
    const title = clean(input.title, TITLE_MAX);
    const steps = this.normalizeSteps(input.steps);
    if (title) flow.title = title;
    if (steps.length) flow.steps = steps;
    flow.updatedAt = new Date().toISOString();
    this.save();
    return flow;
  }

  remove(id: string, ownerHandle: string): boolean {
    const flow = this.state.flows[id];
    if (!flow || flow.ownerHandle !== ownerHandle) return false;
    delete this.state.flows[id];
    this.save();
    return true;
  }

  get(id: string): Flow | null {
    return this.state.flows[id] ?? null;
  }

  byOwner(ownerHandle: string): Flow[] {
    return Object.values(this.state.flows)
      .filter((flow) => flow.ownerHandle === ownerHandle)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** 공개 목록. 많이 돈 것이 앞이다. 한 번도 안 돈 흐름은 아직 아무것도 증명하지 않았다. */
  list(limit = 30): Flow[] {
    return Object.values(this.state.flows)
      .sort((a, b) => b.runs - a.runs || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  /**
   * 예약 (TASK-KL-183 B). 매주 월요일 아침에 이 흐름을 하라고 알려 줘.
   *
   * 서버가 **대신 돌지는 않는다**. 우리 도구는 전부 브라우저 안에서 도는 것이라 서버가 혼자
   * 실행할 수 있는 것이 없다. 할 수 있는 것은 **때가 되면 알리는 일**뿐이고, 그것을 정직하게
   * 그 이름으로 부른다(자동 실행이라 부르면 안 도는 것을 돈다고 말하는 셈이다).
   */
  setReminder(id: string, ownerHandle: string, input: { weekday?: unknown; hour?: unknown; on?: unknown }): Flow | null {
    const flow = this.state.flows[id];
    if (!flow || flow.ownerHandle !== ownerHandle) return null;
    if (input.on === false) {
      delete flow.reminder;
      this.save();
      return flow;
    }
    const weekday = Math.min(6, Math.max(0, Math.round(Number(input.weekday) || 0)));
    const hour = Math.min(23, Math.max(0, Math.round(Number(input.hour) || 9)));
    flow.reminder = { weekday, hour, lastFiredWeek: flow.reminder?.lastFiredWeek ?? null };
    this.save();
    return flow;
  }

  /**
   * 스스로 이어가게 할까 (TASK-KL-191 축1). 주인만 바꾼다.
   *
   * 단계가 하나뿐인 흐름에는 켤 수 없다: 이어갈 다음이 없는데 스스로 이어감이 켜져 있으면
   * 그건 켠 적 없는 기능이 켜져 있다고 말하는 것이다.
   */
  setAuto(id: string, ownerHandle: string, on: boolean): Flow | null {
    const flow = this.state.flows[id];
    if (!flow || flow.ownerHandle !== ownerHandle) return null;
    if (on && flow.steps.length < 2) return null;
    if (on) flow.auto = true;
    else delete flow.auto;
    flow.updatedAt = new Date().toISOString();
    this.save();
    return flow;
  }

  /** 지금 알릴 흐름들. 그 요일, 그 시각이 지났고 이번 주에 아직 안 알린 것. */
  dueReminders(week: string, weekday: number, hour: number): Flow[] {
    return Object.values(this.state.flows).filter((flow) => {
      const reminder = flow.reminder;
      if (!reminder || !flow.ownerHandle) return false;
      if (reminder.lastFiredWeek === week) return false;
      return reminder.weekday === weekday && hour >= reminder.hour;
    });
  }

  markReminded(id: string, week: string): void {
    const flow = this.state.flows[id];
    if (!flow?.reminder) return;
    flow.reminder.lastFiredWeek = week;
    this.save();
  }

  /** 남의 것을 담아 내 것으로 (원본은 그대로). */
  fork(id: string, ownerHandle: string): Flow | null {
    const origin = this.state.flows[id];
    if (!origin) return null;
    return this.create(ownerHandle, {
      title: origin.title,
      steps: origin.steps,
      forkedFrom: origin.id,
    });
  }

  /** 한 번 돌았다. 이 수만이 쓸모 있는 흐름을 가려낸다. */
  noteRun(id: string): number {
    const flow = this.state.flows[id];
    if (!flow) return 0;
    flow.runs += 1;
    this.save();
    return flow.runs;
  }

  /**
   * 한 판이 끝났다(또는 도중에 멈췄다). 자국 한 줄 (TASK-KL-182 F5).
   * 남기는 것은 **몇 번째까지 갔나, 얼마나 걸렸나**뿐이다. 파일도 결과도 안 남긴다.
   */
  noteTrail(id: string, input: { reached: unknown; finished: unknown; seconds?: unknown }): FlowTrail[] {
    const flow = this.state.flows[id];
    if (!flow) return [];
    const reached = Math.min(flow.steps.length, Math.max(1, Number(input.reached) || 1));
    const seconds = Number.isFinite(Number(input.seconds)) ? Math.max(0, Math.round(Number(input.seconds))) : null;
    const trails = flow.trails ?? [];
    trails.unshift({ at: new Date().toISOString(), reached, finished: input.finished === true, seconds });
    flow.trails = trails.slice(0, TRAIL_KEEP);
    this.save();
    return flow.trails;
  }

  /**
   * 이 흐름이 어디서 막히나 (TASK-KL-182 F5).
   * 끝까지 간 비율과 **가장 자주 멈추는 단계**를 준다. 지어낸 수는 없고, 자국이 없으면 null.
   */
  trailSummary(id: string): { runs: number; finished: number; stuckStep: number | null; medianSeconds: number | null } | null {
    const flow = this.state.flows[id];
    const trails = flow?.trails ?? [];
    if (!flow || trails.length === 0) return null;
    const finished = trails.filter((trail) => trail.finished).length;
    const stops = new Map<number, number>();
    for (const trail of trails) {
      if (trail.finished) continue;
      stops.set(trail.reached, (stops.get(trail.reached) ?? 0) + 1);
    }
    const stuckStep = [...stops.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const times = trails.map((trail) => trail.seconds).filter((s): s is number => s !== null).sort((a, b) => a - b);
    const medianSeconds = times.length ? times[Math.floor(times.length / 2)] : null;
    return { runs: trails.length, finished, stuckStep, medianSeconds };
  }

  /** 계정을 지울 때. 흐름은 남기고 주인만 지운다(남이 담아 간 것이 안 죽게). */
  orphanOwner(ownerHandle: string): number {
    let count = 0;
    for (const flow of Object.values(this.state.flows)) {
      if (flow.ownerHandle !== ownerHandle) continue;
      flow.ownerHandle = null;
      count += 1;
    }
    if (count) this.save();
    return count;
  }

  stats(): { flows: number; runs: number } {
    const flows = Object.values(this.state.flows);
    return { flows: flows.length, runs: flows.reduce((sum, flow) => sum + flow.runs, 0) };
  }
}

let shared: KarmolabFlowStore | null = null;

export function getKarmolabFlowStore(): KarmolabFlowStore {
  if (!shared) shared = new KarmolabFlowStore();
  return shared;
}
