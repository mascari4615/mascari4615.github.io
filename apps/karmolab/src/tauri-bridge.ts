/**
 * Tauri 데스크톱 셸 단일 seam (TASK-KL-062 slice 1).
 *
 * `window.__TAURI__?.core?.invoke` / `?.event?.listen` / `?.window` 와
 * `__KARMOLAB_DESKTOP__` 데스크톱 판정이 7+ 파일에 인라인 캐스팅·로컬 타입으로 산재.
 * 본 모듈이 그 캐스팅·타입·미주입 가드를 단일 정본으로 집약 (deletion test:
 * 제거 시 N caller 로 복잡도 재출현 → deep). 비-데스크톱(웹)에서는
 * isDesktop()=false, invoke=reject, listen=no-op.
 *
 * widgets 는 bundle:true(esbuild iife) 라 본 모듈 import 시 인라인 번들됨.
 * toolbox(bundle:false/esm) 합류는 후속 slice (emit 경로 별도).
 */
export type TauriInvoke = <T = unknown>(cmd: string, args?: unknown) => Promise<T>;
type TauriUnlisten = () => void;
type TauriListenRaw = (
  event: string,
  handler: (e: { payload: unknown }) => void,
) => Promise<TauriUnlisten>;

interface TauriGlobal {
  core?: { invoke?: TauriInvoke };
  event?: { listen?: TauriListenRaw };
  window?: { getCurrentWindow?: () => unknown };
}

function tauri(): TauriGlobal | undefined {
  return (globalThis as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
}

/** KarmoLab 데스크톱(Tauri) 셸에서 실행 중인가. (웹 브라우저 = false) */
export function isDesktop(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { __KARMOLAB_DESKTOP__?: unknown }).__KARMOLAB_DESKTOP__
  );
}

/** Tauri command invoke. 데스크톱 아니거나 미주입이면 reject (호출자 catch). */
export function invoke<T = unknown>(cmd: string, args?: unknown): Promise<T> {
  const fn = tauri()?.core?.invoke;
  if (typeof fn !== 'function') {
    return Promise.reject(
      new Error(`Tauri invoke 없음 (웹 브라우저 또는 withGlobalTauri 비활성): ${cmd}`),
    );
  }
  return fn<T>(cmd, args);
}

/**
 * Tauri 이벤트 listen. 미주입이면 no-op unlisten 반환 (호출자 분기 불요).
 * 핸들러는 *원본 이벤트* `{ payload }` 를 받는다 — 기존 위젯(servermonitor/terminal)이
 * `e.payload` 접근에 이미 의존하므로 언랩하지 않고 그대로 전달 (seam 이 콜러가
 * 의존하는 형태를 숨기지 X = 정직한 계약).
 */
export async function listen(
  event: string,
  handler: (e: { payload: unknown }) => void,
): Promise<TauriUnlisten> {
  const fn = tauri()?.event?.listen;
  if (typeof fn !== 'function') return () => {};
  return fn(event, handler);
}

/** Tauri current window 핸들 (window 컨트롤용). 미주입이면 null. */
export function getCurrentWindow(): unknown | null {
  const fn = tauri()?.window?.getCurrentWindow;
  return typeof fn === 'function' ? fn() : null;
}
