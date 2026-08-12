/**
 * 한 번 읽으면 사라지는 쪽지 — 곳간 (TASK-KL-251)
 *
 * 여기 있는 것은 **알아볼 수 없는 덩어리**뿐이다. 브라우저가 먼저 잠그고 올리며, 여는 열쇠는
 * 주소의 `#` 뒤에 있어 서버까지 오지 않는다(브라우저가 `#` 뒤를 안 보낸다). 그래서 이 파일은
 * 「무엇을 맡고 있는지」 모른 채 맡는다.
 *
 * 규칙 셋:
 *   ① **읽기가 곧 지우기다.** 내주는 그 순간 지운다 — 「내주고 나서 지우기」로 만들면
 *      그 사이에 끊긴 요청 하나가 쪽지를 영영 남긴다.
 *   ② **아무도 안 읽어도 7일 뒤 사라진다.** 잊힌 비밀이 쌓이는 곳간은 유출 대기열이다.
 *   ③ **크기를 막는다.** 여기는 파일 보관소가 아니다.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';

const STATE_FILE = 'karmolab-burn-notes.json';

/** 아무도 안 읽어도 이만큼 지나면 사라진다. */
export const TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 잠긴 덩어리의 최대 크기(글자). 대략 원문 24KB 쯤 — 쪽지지 첨부 파일이 아니다. */
export const MAX_BODY = 64 * 1024;

export interface StoredNote {
  /** 브라우저가 잠근 덩어리 (base64). 서버는 이걸 못 읽는다. */
  body: string;
  at: number;
}

interface State {
  notes: Record<string, StoredNote>;
}

export class BurnNoteStore {
  private state: State = { notes: {} };

  constructor(
    private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE),
    private readonly now: () => number = Date.now,
  ) {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<State>;
        if (parsed && parsed.notes) this.state = { notes: parsed.notes };
      }
    } catch {
      /* 깨졌으면 빈 곳간으로 시작한다 — 쪽지는 원래 사라지는 것이라 복구할 것이 없다 */
      this.state = { notes: {} };
    }
    this.sweep();
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(this.state), 'utf-8');
    } catch {
      /* 못 적으면 이번 판은 기억에만 — 다음 재시작 때 사라진다(그게 이 도구의 기본값이다) */
    }
  }

  /** 만료된 것을 치운다. 지운 개수를 돌려준다. */
  sweep(): number {
    const cut = this.now() - TTL_MS;
    let gone = 0;
    for (const [id, n] of Object.entries(this.state.notes)) {
      if (n.at < cut) {
        delete this.state.notes[id];
        gone += 1;
      }
    }
    if (gone) this.save();
    return gone;
  }

  get count(): number {
    return Object.keys(this.state.notes).length;
  }

  /**
   * 맡긴다. 돌려주는 것은 주소에 쓸 이름 하나.
   *
   * 이름은 **길고 무작위**여야 한다 — 짧으면 남의 쪽지를 찍어 맞힐 수 있고, 그건 이 도구에서
   * 곧 남의 비밀을 여는 일이다(게다가 열면 원래 주인은 영영 못 본다).
   */
  put(body: string): { id: string } | { error: string } {
    if (typeof body !== 'string' || !body) return { error: 'empty' };
    if (body.length > MAX_BODY) return { error: 'too-large' };
    this.sweep();
    const id = crypto.randomBytes(16).toString('base64url');
    this.state.notes[id] = { body, at: this.now() };
    this.save();
    return { id };
  }

  /**
   * 꺼내면서 **동시에 지운다**. 없으면 null — 「이미 읽혔다」와 「그런 쪽지 없다」를
   * 구분하지 않는다: 구분하면 「이 주소에 쪽지가 있었다」는 사실이 남에게 새어 나간다.
   */
  take(id: string): StoredNote | null {
    this.sweep();
    const got = this.state.notes[id];
    if (!got) return null;
    delete this.state.notes[id];
    this.save();
    return got;
  }

  /** 있는지만 본다(검사용). 읽기와 달리 지우지 않는다. */
  peek(id: string): boolean {
    return !!this.state.notes[id];
  }
}

let shared: BurnNoteStore | null = null;
export function getBurnNoteStore(): BurnNoteStore {
  if (!shared) shared = new BurnNoteStore();
  return shared;
}
