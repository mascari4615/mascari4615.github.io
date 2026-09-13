/**
 * 개인 대시보드, **패널 등록 규약**.
 *
 * 이 파일은 엔트리가 아님. 셸과 패널이 각각 자기 묶음 안으로 import 해서 씀
 * (이 레포의 위젯 묶음은 IIFE 라 묶음끼리 모듈을 나눠 갖지 못한다. 그래서 **말을 맞추는 것**은
 * 여기 타입이고, **실제로 만나는 곳**은 아래 전역 하나다).
 *
 * 규약 한 줄: **패널은 저장소를 모름.** 토큰도, 주소도, 실패 처리도 셸의 일.
 * 패널이 내놓는 것은 셋뿐이다. 자기 이름, 자기가 읽을 저장소 경로, 그리는 함수.
 *
 * 읽기 전용과 읽기/쓰기를 **타입으로 갈라 둔다**. 읽기 패널(`access: 'read'`)에는 읽기 타입만,
 * 쓰기 패널(`access: 'write'`)에만 쓰기 타입. 셸이 그 갈래로 저장소를 건넴. 읽기 패널이
 * 실수로 쓰기를 부를 길이 타입에 없음.
 */

/** 어느 브랜치에서 읽나. 없으면 config 의 `branch`. 이벤트 브랜치를 읽을 때만 채움 */
export interface DashReadOpts {
  ref?: string;
}

/** 저장소에서 **읽기만**. 읽기 패널이 받는 전부. */
export interface DashRepoRead {
  /** 파일 하나를 글자로. 없으면 던진다. */
  readText(path: string, opts?: DashReadOpts): Promise<string>;
  /** 파일 하나를 JSON 으로. */
  readJson<T>(path: string, opts?: DashReadOpts): Promise<T>;
  /**
   * 폴더 하나의 목록. 패널이 host 폴더나 `<YYYY-MM>` 처럼 **미리 모르는 이름**을 찾을 때.
   * 없는 폴더는 던지지 않고 빈 배열. 아직 안 만든 이벤트 달을 매번 try 로 감싸지 않게.
   */
  list(path: string, opts?: DashReadOpts): Promise<DashEntry[]>;
}

export interface DashEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
}

/**
 * 읽기/쓰기.
 *
 * 쓰기 모양이 **하나뿐**. 파일 하나에 이벤트 하나, 새로 만들기만. 덮어쓰기와 지우기가 없으니
 * sha 도, 남의 변경을 밀어내는 일도 없음. 같은 경로가 이미 있으면 GitHub 이 422 로 막음.
 *
 * 쓰기는 브랜치가 읽기와 다름. 읽기는 `branch`, 쓰기는 `eventsBranch` 고정. 패널이 고를 것 없음.
 */
export interface DashRepoWrite extends DashRepoRead {
  /**
   * 새 파일 생성만 (append 전용). 이미 있으면 던짐. branch 는 config.eventsBranch. 메시지는 "dash: " 접두
   *
   * **실패 계약.** 셸이 던지는 값에는 `kind` 가 붙음. 패널이 읽는 것은
   * `(e as {kind?: string}).kind` 하나. 클래스 이름이나 `message` 글자에 기대지 말 것
   * (셸 묶음과 패널 묶음이 서로 import 를 못 해 `instanceof` 가 안 통함).
   *
   * | kind | 뜻 | 패널의 몫 |
   * | --- | --- | --- |
   * | `auth` | 토큰 없음이나 만료 | 그대로 다시 던지기. 셸이 로그인 화면으로 |
   * | `perm` | 토큰은 살아 있고 쓰기 권한만 없음 | `enqueueJson` 으로 남기기. 재로그인은 무의미 |
   * | `exists` | 같은 경로가 이미 있음 (422) | 실패가 아니라 이미 간 것. 성공으로 치기 |
   * | `ratelimit` | 요청 한도 | 잠시 뒤 다시. 토큰은 그대로 |
   * | `notfound` | 경로 없음이나 그 경로에 권한 없음 | 읽기에서만 남. 쓰기는 `perm` 으로 옴 |
   * | `config` | 설정 파일 문제 | 그대로 다시 던지기 |
   * | `net` | 못 닿음, 5xx, 그 밖 전부 | 잠시 뒤 다시 |
   *
   * `kind` 가 없거나 이 목록 밖이면 `net` 으로 취급. 셸의 오류 카드도 같은 규칙.
   */
  putNewJson(path: string, value: unknown, message: string): Promise<void>;
  /** 실패한 쓰기를 outbox 에 넣고 나중에 다시 보냄. 반환은 즉시 */
  enqueueJson(path: string, value: unknown, message: string): void;
  /** outbox 를 지금 비움. 보낸 수와 남은 수 */
  flushOutbox(): Promise<{ sent: number; left: number }>;
  eventsBranch: string;
  /** 기기마다 하나인 6자 hex. localStorage 에 남음 */
  deviceId: string;
  /**
   * **탭마다 다른 4자 hex.** 이벤트 파일 이름의 마지막 조각
   * (`<epoch-ms>-<device6>-<nonce4>.json`).
   *
   * 같은 기기에서 탭 둘이 같은 밀리초에 같은 항목을 건드려도 경로가 안 겹치게 하는 것이 전부.
   * 탭 수명 동안 고정이고 저장 안 함. 새로고침하면 새 값. 사람이나 브라우저를 식별하는 값 아님.
   */
  nonce: string;
}

/**
 * 지금 읽고 있는 저장소 위치. **원본으로 내려가는 링크 조립 전용**.
 *
 * 패널은 저장소를 모른다는 규약 유지. 여기 있는 것은 주소를 조립할 이름 셋뿐,
 * 토큰도 요청도 없음. 값은 셸이 `data/mydash-config.json` 에서 그대로 전달.
 */
export interface DashRepoInfo {
  owner: string;
  repo: string;
  /** 읽기 브랜치. 생성기가 굽는 쪽 */
  branch: string;
}

/** 그릴 때 셸이 건네는 것. 패널은 이것 말고 바깥을 안 본다. */
export interface DashPanelCtx<R extends DashRepoRead = DashRepoRead> {
  /**
   * 붙일 자리. 셸이 **이 패널만의 새 div** 를 만들어 줌. 다음 패널로 넘어가면 셸이 이 div 를
   * DOM 에서 떼므로, 늦게 끝난 render 가 여기 그려도 화면에는 안 보임. 밖으로 기어 나가지 마라.
   */
  root: HTMLElement;
  repo: R;
  /** 링크 조립용 저장소 이름 셋. 옛 셸이 안 채웠을 수도 있어 쓰는 쪽에서 없음을 견딜 것 */
  repoInfo: DashRepoInfo;
  /** 머리말 오른쪽에 한 줄. 굽는 중, 언제 구운 것인가 같은 말. 지난 패널이 부르면 셸이 무시. */
  status(text: string): void;
  /**
   * 이 패널이 아직 화면에 있나. 셸이 `root` 와 `status` 를 이미 막아 주므로 보통은 안 봐도 됨.
   * 긴 async 를 도중에 접거나, 셸이 안 막아 주는 것(전역 타이머, 바깥 저장)을 건드릴 때만.
   */
  isCurrent(): boolean;
  /** 화면을 떠날 때 치울 것 (타이머, 이벤트). 셸이 불러 준다. */
  onDispose(fn: () => void): void;
}

interface DashPanelBase {
  /** 주소와 저장에 쓰는 이름. 영소문자와 붙임표만. */
  id: string;
  /** 사람이 보는 이름. */
  title: string;
  /**
   * 이 패널이 읽는 저장소 경로. **셸이 미리 본다**. 로그인 전 화면에 무엇을 읽는지
   * 적어 두려고. 남이 열었을 때 무엇을 못 보는지가 분명해야 함.
   */
  paths: string[];
}

export interface DashReadPanel extends DashPanelBase {
  access: 'read';
  render(ctx: DashPanelCtx<DashRepoRead>): void | Promise<void>;
}

/**
 * 쓰기 패널. 셸이 쓰기 저장소를 건넴.
 *
 * `readwrite` 는 옛 이름. 셸이 둘 다 받으므로 남아 있는 패널이 안 깨짐. 새 패널은 `write`.
 */
export interface DashWritePanel extends DashPanelBase {
  access: 'write' | 'readwrite';
  render(ctx: DashPanelCtx<DashRepoWrite>): void | Promise<void>;
}

export type DashPanel = DashReadPanel | DashWritePanel;

export interface DashRegistry {
  panels: DashPanel[];
  register(panel: DashPanel): void;
}

const GLOBAL_KEY = 'KarmoDash';

/**
 * **만나는 곳은 전역 하나.** 패널 묶음과 셸 묶음은 서로를 import 하지 못함
 * (각자 IIFE 로 묶임). 그래서 먼저 실행되는 쪽이 만들고 뒤에 오는 쪽이 그대로 씀.
 *
 * 부르는 순서는 `widgets-lazy-meta.ts` 의 `lazyScriptPaths` 가 정한다. 패널을 먼저,
 * 셸을 마지막에 둠. 셸이 뜰 때 명부가 이미 차 있어야 탭을 한 번에 만듦.
 * 그래도 순서가 뒤집힌 판에서 죽지 않게, 양쪽 다 없으면 만듦.
 */
export function dashRegistry(): DashRegistry {
  const w = window as unknown as Record<string, unknown>;
  const found = w[GLOBAL_KEY] as DashRegistry | undefined;
  if (found && Array.isArray(found.panels)) return found;
  const made: DashRegistry = {
    panels: [],
    register(panel: DashPanel): void {
      /* 같은 id 가 두 번 오면 **뒤에 온 것으로 바꾼다**. 두 벌이 뜨는 것보다 낫고,
         새로고침 없이 다시 불린 판(개발 중)에서 화면이 겹치지 않는다. */
      const at = made.panels.findIndex((p) => p.id === panel.id);
      if (at >= 0) made.panels[at] = panel;
      else made.panels.push(panel);
    },
  };
  w[GLOBAL_KEY] = made;
  return made;
}

/** 숫자를 사람이 읽는 크기로. 폰 화면에서 자릿수가 길면 표가 깨진다. */
export function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(1) + '억';
  if (a >= 1e4) return (n / 1e4).toFixed(a >= 1e6 ? 0 : 1) + '만';
  if (a >= 1000) return (n / 1000).toFixed(1) + '천';
  return String(Math.round(n));
}

/** 달러. 이 장부의 값은 실제 결제액이 아니라 **환산가**다. 부르는 쪽에서 그렇게 적는다. */
export function usd(n: number): string {
  if (n >= 10000) return '$' + Math.round(n).toLocaleString('en-US');
  if (n >= 100) return '$' + n.toFixed(0);
  return '$' + n.toFixed(2);
}

/** ms 를 시간으로. */
export function hours(ms: number): string {
  return (ms / 3600000).toFixed(ms >= 36000000 ? 0 : 1) + '시간';
}

/**
 * href 에 넣어도 되는 주소인가. https 만 통과, 나머지는 null.
 * 밖에서 온 주소를 그대로 걸었을 때 javascript: 같은 것이 링크가 되는 것 방지.
 *
 * **기기 흐름의 `verification_uri` 전용.** 사람이 토큰을 넣을 자리라 http 는 안 받음.
 * 저장소에서 온 북마크 링크는 아래 `safeLinkUrl`.
 */
export function httpsUrl(s: unknown): string | null {
  return typeof s === 'string' && /^https:\/\//i.test(s) ? s : null;
}

/**
 * 저장소에서 온 링크를 href 에 걸어도 되나. **http 와 https 만** 통과, 나머지는 null.
 *
 * 북마크에는 사내 도구나 공유기 화면처럼 http 인 것이 섞임. `httpsUrl` 로 재면 그게 전부
 * 글자로만 남아 못 누름. 그렇다고 아무거나 걸 수는 없음. javascript: 는 누르는 순간 이 화면의
 * 토큰까지 닿고, data: 는 우리 주소로 남의 화면을 엶. 둘 다 여기서 막힘 (앞이 http 가 아님).
 */
export function safeLinkUrl(s: unknown): string | null {
  return typeof s === 'string' && /^https?:\/\//i.test(s) ? s : null;
}

/** 화면에 넣기 전에. 저장소에서 온 글자는 남이 쓴 것으로 친다. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}
