/**
 * 개인 대시보드, **패널 등록 규약** (1단계).
 *
 * 이 파일은 엔트리가 아님. 셸과 패널이 각각 자기 묶음 안으로 import 해서 씀
 * (이 레포의 위젯 묶음은 IIFE 라 묶음끼리 모듈을 나눠 갖지 못한다. 그래서 **말을 맞추는 것**은
 * 여기 타입이고, **실제로 만나는 곳**은 아래 전역 하나다).
 *
 * 규약 한 줄: **패널은 저장소를 모름.** 토큰도, 주소도, 실패 처리도 셸의 일.
 * 패널이 내놓는 것은 셋뿐이다. 자기 이름, 자기가 읽을 저장소 경로, 그리는 함수.
 *
 * 읽기 전용과 읽기/쓰기를 **타입으로 갈라 둔다**. 1단계 셸은 읽기만 건네고, 쓰기를 달라는
 * 패널(`access: 'readwrite'`)이 오면 그리지 않고 아직이라고 적는다. 자리를 미리 파 두되
 * 구현은 안 한다. 나중에 쓰기를 붙일 때 이 파일의 타입만 채우면 되고, 그전까지 실수로
 * 쓰기가 새어 나갈 길이 없음.
 */

/** 저장소에서 **읽기만**. 1단계 패널이 받는 전부. */
export interface DashRepoRead {
  /** 파일 하나를 글자로. 없으면 던진다. */
  readText(path: string): Promise<string>;
  /** 파일 하나를 JSON 으로. */
  readJson<T>(path: string): Promise<T>;
  /** 폴더 하나의 목록. 패널이 host 폴더처럼 **미리 모르는 이름**을 찾을 때 쓴다. */
  list(path: string): Promise<DashEntry[]>;
}

export interface DashEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
}

/**
 * 읽기/쓰기. **2단계 자리**. 지금은 아무도 이걸 못 받음.
 *
 * 쓰기는 읽기보다 훨씬 비싸다: 커밋 메시지, sha 충돌, 남의 변경 덮어쓰기, 실패한 쓰기의
 * 되돌리기. 그걸 1단계에 섞으면 읽기가 되는지도 모르는 채로 셸이 커짐.
 */
export interface DashRepoWrite extends DashRepoRead {
  putText(path: string, text: string, message: string): Promise<void>;
}

/** 그릴 때 셸이 건네는 것. 패널은 이것 말고 바깥을 안 본다. */
export interface DashPanelCtx<R extends DashRepoRead = DashRepoRead> {
  /**
   * 붙일 자리. 셸이 **이 패널만의 새 div** 를 만들어 줌. 다음 패널로 넘어가면 셸이 이 div 를
   * DOM 에서 떼므로, 늦게 끝난 render 가 여기 그려도 화면에는 안 보임. 밖으로 기어 나가지 마라.
   */
  root: HTMLElement;
  repo: R;
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

/** 2단계. 셸이 아직 안 그린다. */
export interface DashWritePanel extends DashPanelBase {
  access: 'readwrite';
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
