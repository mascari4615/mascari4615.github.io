/**
 * 기기(폰) 실행 로그 저장소 (TASK-WM-201).
 *
 * 폰에서 도는 WM 이 배치로 밀어 넣은 로그 줄을 **세션당 NDJSON 한 파일**로 쌓고,
 * 사람(웹)·AI(tail)가 같은 파일을 읽는다. Discord 전송·HTTP 는 여기 없음 —
 * 본 모듈은 *검증·저장·조회* 만 (bot/device-log.ts 가 HTTP·알림 담당).
 *
 * 왜 NDJSON 인가: append 가 원자적이고(줄 단위), 중간이 깨져도 나머지 줄이 살고,
 * tail 이 파일 되감기만으로 끝난다. DB 는 이 규모에 과한 운영 부담.
 *
 * 신뢰 경계: 페이로드는 *외부 입력*이다. 세션 이름은 파일명이 되므로 화이트리스트
 * 검증, 줄 수·길이·파일 크기는 전부 상한을 둔다(디스크 폭주 = 노트북 prod 정지).
 */
import fs from 'fs';
import path from 'path';

/** 한 줄. 폰이 보낸 원본을 정규화한 형태. */
export interface DeviceLogLine {
  /** epoch ms (수신 서버 기준으로 보정하지 않음 — 폰 시계 그대로). */
  t: number;
  /** Unity LogType 소문자: log / warning / error / exception / assert. */
  level: string;
  /** 메시지 본문. */
  msg: string;
  /** 스택 트레이스 (있을 때만). */
  stack?: string;
}

/** 한 배치 = 폰이 한 번 POST 한 묶음. */
export interface DeviceLogBatch {
  session: string;
  device?: string;
  platform?: string;
  appVersion?: string;
  build?: string;
  lines: DeviceLogLine[];
}

export interface DeviceLogLimits {
  /** 배치 1회 최대 줄 수 (초과분은 버리고 dropped 로 보고). */
  maxLinesPerBatch: number;
  /** 한 줄 메시지 최대 길이. */
  maxMsgChars: number;
  /** 한 줄 스택 최대 길이. */
  maxStackChars: number;
  /** 세션 파일 최대 크기(byte). 넘으면 그 세션은 더 안 받는다(회전 X — 원인 줄이 앞에 있다). */
  maxSessionBytes: number;
  /** 보존 일수. 지나면 청소. */
  retentionDays: number;
  /** 폴더 전체 최대 크기(byte). 넘으면 오래된 세션부터 지운다. */
  maxTotalBytes: number;
}

export const DEFAULT_LIMITS: DeviceLogLimits = {
  maxLinesPerBatch: 500,
  maxMsgChars: 4000,
  maxStackChars: 8000,
  maxSessionBytes: 32 * 1024 * 1024,
  retentionDays: 14,
  maxTotalBytes: 512 * 1024 * 1024,
};

/** 세션 이름 = 파일명. 경로 조작·유니코드 트랩 차단 위해 좁은 화이트리스트. */
const SESSION_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

const LEVELS = new Set(['log', 'warning', 'error', 'exception', 'assert']);

/** 에러급(= 알릴 가치가 있는) 레벨. */
export function isErrorLevel(level: string): boolean {
  return level === 'error' || level === 'exception' || level === 'assert';
}

export function isValidSession(session: unknown): session is string {
  return typeof session === 'string' && SESSION_RE.test(session);
}

export interface ParseResult {
  batch: DeviceLogBatch | null;
  error: string | null;
  /** 상한 때문에 버린 줄 수 (폰에 알려줘서 폰이 자기 버퍼 정책을 조절하게). */
  dropped: number;
}

/** 외부 입력 → 정규화된 배치. 실패 사유는 문자열로 (400 응답 본문). */
export function parseBatch(body: unknown, limits: DeviceLogLimits = DEFAULT_LIMITS): ParseResult {
  if (!body || typeof body !== 'object') {
    return { batch: null, error: 'JSON object 필요', dropped: 0 };
  }
  const raw = body as Record<string, unknown>;
  if (!isValidSession(raw.session)) {
    return { batch: null, error: 'session 필수 — [A-Za-z0-9][A-Za-z0-9_.-]{0,63}', dropped: 0 };
  }
  if (!Array.isArray(raw.lines)) {
    return { batch: null, error: 'lines 배열 필수', dropped: 0 };
  }

  const incoming = raw.lines as unknown[];
  let dropped = Math.max(0, incoming.length - limits.maxLinesPerBatch);
  const lines: DeviceLogLine[] = [];
  for (const item of incoming.slice(0, limits.maxLinesPerBatch)) {
    if (!item || typeof item !== 'object') {
      dropped++;
      continue;
    }
    const entry = item as Record<string, unknown>;
    const msg = typeof entry.msg === 'string' ? entry.msg : '';
    if (!msg) {
      dropped++;
      continue;
    }
    const levelRaw = typeof entry.level === 'string' ? entry.level.toLowerCase() : 'log';
    const line: DeviceLogLine = {
      t: typeof entry.t === 'number' && Number.isFinite(entry.t) ? entry.t : Date.now(),
      level: LEVELS.has(levelRaw) ? levelRaw : 'log',
      msg: msg.slice(0, limits.maxMsgChars),
    };
    if (typeof entry.stack === 'string' && entry.stack.trim()) {
      line.stack = entry.stack.slice(0, limits.maxStackChars);
    }
    lines.push(line);
  }

  return {
    batch: {
      session: raw.session,
      device: typeof raw.device === 'string' ? raw.device.slice(0, 200) : undefined,
      platform: typeof raw.platform === 'string' ? raw.platform.slice(0, 80) : undefined,
      appVersion: typeof raw.appVersion === 'string' ? raw.appVersion.slice(0, 80) : undefined,
      build: typeof raw.build === 'string' ? raw.build.slice(0, 200) : undefined,
      lines,
    },
    error: null,
    dropped,
  };
}

export function sessionFilePath(dir: string, session: string): string {
  return path.join(dir, `${session}.ndjson`);
}

export interface AppendResult {
  written: number;
  /** 세션 파일이 상한을 넘어 거절됨. */
  full: boolean;
  bytes: number;
}

/**
 * 배치를 세션 파일에 append. 첫 배치면 헤더 줄(kind=meta)을 먼저 적어
 * 기기·빌드 정보가 파일 자체에 남게 한다(파일만 보고도 어느 기기인지 안다).
 */
export function appendBatch(
  dir: string,
  batch: DeviceLogBatch,
  limits: DeviceLogLimits = DEFAULT_LIMITS,
): AppendResult {
  fs.mkdirSync(dir, { recursive: true });
  const file = sessionFilePath(dir, batch.session);
  const existed = fs.existsSync(file);
  const sizeBefore = existed ? fs.statSync(file).size : 0;
  if (sizeBefore >= limits.maxSessionBytes) {
    return { written: 0, full: true, bytes: sizeBefore };
  }

  const chunks: string[] = [];
  if (!existed) {
    chunks.push(
      JSON.stringify({
        kind: 'meta',
        t: Date.now(),
        session: batch.session,
        device: batch.device ?? '',
        platform: batch.platform ?? '',
        appVersion: batch.appVersion ?? '',
        build: batch.build ?? '',
      }),
    );
  }
  for (const line of batch.lines) {
    chunks.push(JSON.stringify({ kind: 'log', ...line }));
  }
  if (chunks.length === 0) {
    return { written: 0, full: false, bytes: sizeBefore };
  }
  const payload = chunks.join('\n') + '\n';
  fs.appendFileSync(file, payload, 'utf-8');
  return { written: batch.lines.length, full: false, bytes: sizeBefore + Buffer.byteLength(payload) };
}

export interface SessionInfo {
  session: string;
  bytes: number;
  updatedAt: number;
  device: string;
  platform: string;
  build: string;
}

/** 최근 갱신 순 세션 목록. meta 줄이 있으면 기기 정보까지. */
export function listSessions(dir: string): SessionInfo[] {
  if (!fs.existsSync(dir)) return [];
  const out: SessionInfo[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.ndjson')) continue;
    const session = name.slice(0, -'.ndjson'.length);
    if (!isValidSession(session)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    let device = '';
    let platform = '';
    let build = '';
    try {
      const head = readFirstLine(full);
      if (head) {
        const meta = JSON.parse(head) as Record<string, unknown>;
        if (meta.kind === 'meta') {
          device = typeof meta.device === 'string' ? meta.device : '';
          platform = typeof meta.platform === 'string' ? meta.platform : '';
          build = typeof meta.build === 'string' ? meta.build : '';
        }
      }
    } catch {
      // 헤더가 깨졌어도 목록에선 빼지 않는다 — 로그 본문이 더 중요.
    }
    out.push({ session, bytes: stat.size, updatedAt: stat.mtimeMs, device, platform, build });
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

function readFirstLine(file: string): string | null {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(4096);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    const text = buf.subarray(0, read).toString('utf-8');
    const nl = text.indexOf('\n');
    return nl >= 0 ? text.slice(0, nl) : text || null;
  } finally {
    fs.closeSync(fd);
  }
}

/** 'latest' → 가장 최근 세션. 그 외는 그대로(존재 여부는 호출부 판단). */
export function resolveSession(dir: string, requested: string | undefined | null): string | null {
  if (!requested || requested === 'latest') {
    const sessions = listSessions(dir);
    return sessions.length > 0 ? sessions[0].session : null;
  }
  return isValidSession(requested) ? requested : null;
}

export interface TailOptions {
  /** 마지막 N 줄. */
  limit: number;
  /** 이 레벨들만 (빈 배열 = 전부). */
  levels?: string[];
  /** 이 문자열을 포함한 줄만 (대소문자 무시). */
  contains?: string;
}

/**
 * 세션 파일 마지막 N 줄 (필터 적용 후 기준). 파일이 커도 뒤에서부터 필요한 만큼만 읽는다.
 */
export function tailSession(dir: string, session: string, options: TailOptions): DeviceLogLine[] {
  const file = sessionFilePath(dir, session);
  if (!fs.existsSync(file)) return [];
  const levels = options.levels && options.levels.length > 0 ? new Set(options.levels) : null;
  const needle = options.contains ? options.contains.toLowerCase() : null;

  const collected: DeviceLogLine[] = [];
  for (const raw of readLinesFromEnd(file, options.limit, levels !== null || needle !== null)) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (parsed.kind !== 'log') continue;
    const level = typeof parsed.level === 'string' ? parsed.level : 'log';
    if (levels && !levels.has(level)) continue;
    const msg = typeof parsed.msg === 'string' ? parsed.msg : '';
    const stack = typeof parsed.stack === 'string' ? parsed.stack : undefined;
    if (needle && !(msg.toLowerCase().includes(needle) || (stack ?? '').toLowerCase().includes(needle))) {
      continue;
    }
    collected.push({
      t: typeof parsed.t === 'number' ? parsed.t : 0,
      level,
      msg,
      ...(stack ? { stack } : {}),
    });
    if (collected.length >= options.limit) break;
  }
  return collected.reverse();
}

/**
 * 파일 뒤에서부터 줄을 흘려준다(최신 → 과거). 필터가 있으면 원하는 줄이 드물 수 있으므로
 * 더 넉넉히 읽되, 파일 전체를 메모리에 올리지는 않는다.
 */
function* readLinesFromEnd(file: string, limit: number, filtered: boolean): Generator<string> {
  const CHUNK = 64 * 1024;
  const size = fs.statSync(file).size;
  const maxScanBytes = filtered ? size : Math.min(size, Math.max(CHUNK, limit * 2048));
  const fd = fs.openSync(file, 'r');
  try {
    let pos = size;
    let carry = '';
    let scanned = 0;
    while (pos > 0 && scanned < maxScanBytes) {
      const len = Math.min(CHUNK, pos);
      pos -= len;
      scanned += len;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, pos);
      const text = buf.toString('utf-8') + carry;
      const parts = text.split('\n');
      carry = parts.shift() ?? '';
      for (let i = parts.length - 1; i >= 0; i--) {
        const line = parts[i].trim();
        if (line) yield line;
      }
    }
    const last = carry.trim();
    if (last) yield last;
  } finally {
    fs.closeSync(fd);
  }
}

export interface PruneResult {
  removed: string[];
  bytesFreed: number;
}

/** 오래된/넘치는 세션 정리. 보존일수 우선, 그래도 총량 초과면 오래된 것부터. */
export function pruneSessions(dir: string, limits: DeviceLogLimits = DEFAULT_LIMITS, now = Date.now()): PruneResult {
  const removed: string[] = [];
  let bytesFreed = 0;
  let sessions = listSessions(dir);

  const cutoff = now - limits.retentionDays * 24 * 60 * 60 * 1000;
  for (const info of sessions) {
    if (info.updatedAt < cutoff) {
      fs.rmSync(sessionFilePath(dir, info.session), { force: true });
      removed.push(info.session);
      bytesFreed += info.bytes;
    }
  }
  if (removed.length > 0) {
    sessions = listSessions(dir);
  }

  let total = sessions.reduce((sum, s) => sum + s.bytes, 0);
  // 최근 순 정렬 → 뒤(가장 오래된)부터 제거.
  for (let i = sessions.length - 1; i >= 0 && total > limits.maxTotalBytes; i--) {
    const info = sessions[i];
    fs.rmSync(sessionFilePath(dir, info.session), { force: true });
    removed.push(info.session);
    bytesFreed += info.bytes;
    total -= info.bytes;
  }
  return { removed, bytesFreed };
}

/** 같은 에러의 반복을 접기 위한 지문 — 메시지 첫 줄 + 스택 첫 프레임. */
export function errorFingerprint(line: DeviceLogLine): string {
  const firstMsgLine = line.msg.split('\n', 1)[0].trim().slice(0, 200);
  const firstFrame = (line.stack ?? '').split('\n', 1)[0].trim().slice(0, 200);
  return `${line.level}|${firstMsgLine}|${firstFrame}`;
}
