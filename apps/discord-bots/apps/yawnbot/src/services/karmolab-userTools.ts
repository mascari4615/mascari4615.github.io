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
}

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

  /** 목록 — 주인이 스스로 켠 것만. 많이 돈 것이 앞이다. */
  listed(limit = 30): UserTool[] {
    return Object.values(this.state.tools)
      .filter((tool) => tool.listed)
      .sort((a, b) => b.runs - a.runs || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  noteRun(id: string): number {
    const tool = this.state.tools[id];
    if (!tool) return 0;
    tool.runs += 1;
    this.save();
    return tool.runs;
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
