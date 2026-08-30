import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

/**
 * 레인. 벤더 앱의 세션을 한 단 위에서 본다.
 *
 * 클로드, 그록, 커서 각각이 자기 세션 목록을 가진다. 이 방은 그 목록을 또 만들지 않는다.
 * 이미 떠 있는 세션을 내려다보는 자리만 가진다.
 */
export type LaneKind = 'room' | 'session';
export type LaneVendor = 'companion' | 'grok' | 'claude';

export interface Lane {
  id: string;
  kind: LaneKind;
  vendor: LaneVendor;
  title: string;
  detail: string;
  live: boolean;
  /** 지금 이 프로세스를 띄운 그록 창인가. */
  here: boolean;
  at: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function roomLane(detail: string, at = Date.now()): Lane {
  return {
    id: 'room',
    kind: 'room',
    vendor: 'companion',
    title: '방',
    detail,
    live: true,
    here: false,
    at,
  };
}

/** 코딩 CLI 를 모에화한 방. */
export function workLane(detail = '코딩 CLI, 손 있음', at = Date.now()): Lane {
  return {
    id: 'work',
    kind: 'room',
    vendor: 'companion',
    title: '일',
    detail,
    live: true,
    here: false,
    at,
  };
}

/** 일 없이 곁에 있는 방. */
export function talkLane(detail = '곁에 있기, 손 없음', at = Date.now()): Lane {
  return {
    id: 'talk',
    kind: 'room',
    vendor: 'companion',
    title: '말',
    detail,
    live: true,
    here: false,
    at,
  };
}

export function listGrokLanes(opts: {
  home?: string;
  sessionId?: string;
  limit?: number;
} = {}): Lane[] {
  const root = join(opts.home ?? join(homedir(), '.grok'), 'sessions');
  if (existsSync(root) === false) return [];
  const found: Lane[] = [];
  walkSessions(root, '', found, 0);
  found.sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  const unique: Lane[] = [];
  for (const lane of found) {
    if (seen.has(lane.id)) continue;
    seen.add(lane.id);
    unique.push(lane);
  }
  const here = opts.sessionId?.trim() ?? '';
  if (here !== '') {
    for (const lane of unique) {
      if (lane.id === here) lane.here = true;
    }
  }
  return unique.slice(0, opts.limit ?? 12);
}

function walkSessions(dir: string, encodedParent: string, out: Lane[], depth: number): void {
  if (depth > 5) return;
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(dir, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory() === false) continue;
    if (UUID.test(name)) {
      out.push({
        id: name,
        kind: 'session',
        vendor: 'grok',
        title: folderTitle(encodedParent) || '그록',
        detail: `Grok, ${name.slice(0, 8)}`,
        live: false,
        here: false,
        at: st.mtimeMs,
      });
      continue;
    }
    walkSessions(path, name, out, depth + 1);
  }
}

/** URL 인코딩된 작업 폴더에서 사람이 읽는 짧은 이름만. */
export function folderTitle(encoded: string): string {
  if (encoded.trim() === '') return '';
  try {
    const decoded = decodeURIComponent(encoded).replace(/\\/g, '/');
    return basename(decoded) || '';
  } catch {
    return '';
  }
}
