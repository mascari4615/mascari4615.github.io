/**
 * 터미널 로그 앞에 KST(Asia/Seoul) 타임스탬프를 붙입니다.
 * 형식: `2026-05-16 18:37:51.526 KST` (코드베이스 KST idiom 정합 — proactive/
 * anniversary-service 와 동일 `Asia/Seoul` toLocaleString 사용).
 * 끄려면 환경 변수 `YAWNBOT_CONSOLE_TIMESTAMPS=0` (또는 `false` / `off`).
 */
const raw = process.env.YAWNBOT_CONSOLE_TIMESTAMPS;
const disabled =
  raw !== undefined && ['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase());

if (!disabled) {
  const stamp = () => {
    const d = new Date();
    // sv-SE = `YYYY-MM-DD HH:mm:ss` (24h), Asia/Seoul = KST 변환
    const base = d.toLocaleString('sv-SE', {
      timeZone: 'Asia/Seoul',
      hour12: false,
    });
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${base}.${ms} KST`;
  };
  const wrap = (method: 'log' | 'info' | 'warn' | 'error' | 'debug') => {
    const orig = console[method].bind(console) as (...args: unknown[]) => void;
    (console[method] as (...args: unknown[]) => void) = (...args: unknown[]) => {
      orig(`[${stamp()}]`, ...args);
    };
  };
  wrap('log');
  wrap('info');
  wrap('warn');
  wrap('error');
  if (typeof console.debug === 'function') {
    wrap('debug');
  }
}
