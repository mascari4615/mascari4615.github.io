/**
 * 숨긴 것 — 계정이 찾은 목록 (TASK-KL-196 D).
 *
 * 왜 서버에도 두나: 찾는 데 걸린 시간이 브라우저 기록 한 번에 사라지면 아무도 안 찾는다.
 * 도감과 같은 성질이다 — 로그인해야 생기는 것이 아니라, 로그인하면 따라온다.
 *
 * 왜 발자국(`footprint`)에 안 얹나: 발자국은 「어느 도구를 열었나」다. 숨긴 것은 도구가
 * 아니고(코나미 코드는 열 수 있는 화면이 아니다) 개수도 다섯이라, 그 표에 섞으면 도감이
 * 세는 수가 조용히 틀어진다.
 *
 * **무엇이 있는지는 서버가 안 정한다.** 목록의 정본은 브라우저(`src/secrets.ts`)고, 여기는
 * 「이 사람이 이 이름을 찾았다」만 적는다 — 그래서 새 비밀을 심을 때 서버를 안 고쳐도 된다.
 * 대신 아무 글자나 안 받는다(모양 검사).
 *
 * 저장 = `data/karmolab-secrets-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';

const STATE_FILE = 'karmolab-secrets-state.json';

/** 한 사람이 가질 수 있는 최대 개수. 목록이 늘어도 이 정도면 넉넉하고, 쓰레기는 못 쌓는다. */
export const MAX_PER_PERSON = 64;

/** 받아들일 이름 모양. 브라우저가 정본이지만, 그렇다고 아무 글자나 적어 두지는 않는다. */
export function isValidSecretId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(raw);
}

interface SecretsState {
  version: 1;
  /** 계정 id → 찾은 이름들 (찾은 순서). */
  people: Record<string, string[]>;
}

export class KarmolabSecretStore {
  private state: SecretsState;

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): SecretsState {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<SecretsState>;
        return { version: 1, people: parsed.people ?? {} };
      }
    } catch (error) {
      console.error('[karmolab-secrets] 상태 파일을 못 읽었다 — 빈 목록으로 시작한다:', error);
    }
    return { version: 1, people: {} };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(this.state), 'utf-8');
    } catch (error) {
      console.error('[karmolab-secrets] 상태 파일을 못 썼다:', error);
    }
  }

  of(accountId: string): string[] {
    return this.state.people[accountId] ?? [];
  }

  /** 하나 찾았다. 이미 있으면 아무 일도 안 일어난다(순서도 안 바뀐다 — 처음 찾은 순서가 기록이다). */
  found(accountId: string, id: string): string[] {
    if (!isValidSecretId(id)) return this.of(accountId);
    const list = this.state.people[accountId] ?? [];
    if (list.indexOf(id) >= 0) return list;
    if (list.length >= MAX_PER_PERSON) return list;
    list.push(id);
    this.state.people[accountId] = list;
    this.save();
    return list;
  }

  /**
   * 이 이름을 몇 명이 찾았나. **아무도 못 찾은 것은 줄이 없다** — 0을 늘어놓으면
   * 「아직 아무도 못 찾은 비밀이 있다」는 사실 자체가 표에 묻힌다.
   */
  tally(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const list of Object.values(this.state.people)) {
      for (const id of list) out[id] = (out[id] ?? 0) + 1;
    }
    return out;
  }
}

let singleton: KarmolabSecretStore | null = null;

export function getKarmolabSecretStore(): KarmolabSecretStore {
  if (!singleton) singleton = new KarmolabSecretStore();
  return singleton;
}
