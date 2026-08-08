/**
 * 같이 쓴 글이 **방을 나가도 남는다** (TASK-KL-191 축2).
 *
 * KL-183 C 가 같이 편집을 만들었지만 첫 사이클은 「방에 있는 동안만」이었다 — 서버가 글을
 * 아예 안 들고 있어서, 마지막 사람이 나가면 같이 쓴 것이 사라졌다. 그러면 같이 쓸 이유가
 * 절반 없어진다: 남는 것이 없으면 그건 대화지 문서가 아니다.
 *
 * **연산 기록(로그)이 아니라 글 한 장(스냅숏)만** 들고 있는다. 왜:
 *  ① 로그는 끝없이 자란다. 한 글자마다 한 줄이라, 한 사람이 하루 쓰면 수만 줄이다.
 *  ② 다시 열 때 필요한 것은 **지금 글**뿐이다 — 어떤 순서로 그렇게 됐는지는 아무도 안 본다.
 *  ③ 되돌리기(undo)는 이 층의 일이 아니다. 필요해지면 그때 판본을 따로 만든다.
 *
 * 갈라짐은 어떻게 막나: 다시 들어온 사람들이 **같은 글에서 같은 이름표**로 시작한다
 * (브라우저 쪽 `CoText.seed`). 서버는 글자만 주고, 이름 붙이는 규칙은 한 군데(브라우저)에 있다.
 */
import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';

export interface CoDoc {
  /** 방 id + 칸 이름 — 같은 화면의 칸이 여럿일 수 있다 */
  id: string;
  text: string;
  updatedAt: string;
  /** 몇 번 저장됐나 — 낡은 저장이 새 글을 덮는지 보려면 이 수가 필요하다 */
  version: number;
}

interface State {
  version: 1;
  docs: Record<string, CoDoc>;
}

const STATE_FILE = 'karmolab-codocs-state.json';

/** 한 문서의 길이 상한. 이건 메모지, 원고지가 아니다. */
export const TEXT_MAX = 40000;
/** 들고 있을 문서 수. 넘으면 **가장 오래 안 만진 것**부터 버린다. */
export const DOCS_MAX = 500;

export class KarmolabCoDocStore {
  private state: State;

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): State {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<State>;
        return { version: 1, docs: parsed.docs ?? {} };
      }
    } catch (error) {
      console.error('[karmolab-codocs] 상태 파일을 못 읽었다 — 빈 상태로 시작한다:', error);
    }
    return { version: 1, docs: {} };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const tmp = `${this.statePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
      fs.renameSync(tmp, this.statePath);
    } catch (error) {
      console.error('[karmolab-codocs] 상태 저장 실패:', error);
    }
  }

  /** 문서 이름 — 주소에 그대로 들어가니 좁게 잡는다. */
  static idOf(room: unknown, key: unknown): string | null {
    const r = String(room ?? '');
    const k = String(key ?? '');
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(r)) return null;
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(k)) return null;
    return `${r}:${k}`;
  }

  get(id: string): CoDoc | null {
    return this.state.docs[id] ?? null;
  }

  /**
   * 저장. **낡은 판이 새 판을 못 덮는다** — 늦게 도착한 저장이 앞선 글을 되돌리면
   * 같이 쓰던 사람 눈에는 「방금 쓴 게 사라졌다」로 보인다.
   *
   * 빈 글로 덮는 것도 막는다: 창을 잘못 닫거나 칸이 아직 안 채워진 채 저장이 나가면
   * 문서 하나가 통째로 지워진다. 지우려면 **지운다고 말해야** 한다(`clear`).
   */
  put(id: string, text: unknown, basedOn?: unknown): CoDoc | null {
    const next = String(text ?? '');
    if (next.length > TEXT_MAX) return null;
    const current = this.state.docs[id];
    if (current) {
      const base = Number(basedOn);
      if (Number.isFinite(base) && base < current.version) return current; // 낡은 저장 — 조용히 무시
      if (!next.trim() && current.text.trim()) return current; // 빈 글로 안 덮는다
    }
    const doc: CoDoc = {
      id,
      text: next,
      updatedAt: new Date().toISOString(),
      version: (current?.version ?? 0) + 1,
    };
    this.state.docs[id] = doc;
    this.evict();
    this.save();
    return doc;
  }

  clear(id: string): boolean {
    if (!this.state.docs[id]) return false;
    delete this.state.docs[id];
    this.save();
    return true;
  }

  /** 넘치면 가장 오래 안 만진 것부터 버린다. */
  private evict(): void {
    const ids = Object.keys(this.state.docs);
    if (ids.length <= DOCS_MAX) return;
    const sorted = ids
      .map((id) => this.state.docs[id])
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    for (const doc of sorted.slice(0, ids.length - DOCS_MAX)) delete this.state.docs[doc.id];
  }

  stats(): { docs: number; letters: number } {
    const docs = Object.values(this.state.docs);
    return { docs: docs.length, letters: docs.reduce((sum, doc) => sum + doc.text.length, 0) };
  }
}

let shared: KarmolabCoDocStore | null = null;

export function getKarmolabCoDocStore(): KarmolabCoDocStore {
  if (!shared) shared = new KarmolabCoDocStore();
  return shared;
}
