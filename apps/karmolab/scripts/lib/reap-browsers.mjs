/**
 * 검사가 죽으면서 남긴 브라우저를 거둔다 (2026-09-04)
 *
 * 브라우저 검사 220여 개가 저마다 `chromium.launch()` 를 부르고 끝에서 닫는다. 그런데
 * `try/finally` 가 없어서 **도중에 죽으면 그 판이 남는다.** 그렇게 쌓인 것을 이 날 실측했다:
 * `chrome-headless-shell` 116개, 21.5GB. 물리 여유가 6.2GB 까지 떨어져 빌드가 메모리 부족으로
 * 죽었다. 사람이 컴퓨터가 느리다고 말한 뒤에야 드러남
 *
 * 220곳을 고치는 대신 **거두는 자리를 한 곳** 둔다. 검사를 다 돌린 뒤, 이 판이 시작한 뒤에
 * 생긴 헤드리스만 거둔다. 판 시작 전부터 있던 것은 남의 세션 것이라 안 건드림
 *
 * 윈도우만 본다. CI 는 판마다 새 컨테이너라 남아도 같이 사라짐
 */
import { execFileSync } from 'node:child_process';

/** 이 판이 시작한 뒤에 생긴 헤드리스를 거둔다. 돌려주는 값은 거둔 개수와 되찾은 MB */
export function reapHeadless(sinceMs) {
  if (process.platform !== 'win32') return { count: 0, mb: 0 };
  const iso = new Date(sinceMs).toISOString();
  const ps = [
    '-NoProfile', '-Command',
    `$since = [datetime]::Parse('${iso}');` +
    `$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome-headless-shell.exe' -and $_.CreationDate -gt $since };` +
    /* ★ `@()` 로 감싼다. PowerShell 5.1 은 하나짜리 결과의 `.Count` 가 비어서
       거두고도 0개라고 보고했다 (2026-09-04 실측) */
    `$n = @($p).Count;` +
    `$mb = [math]::Round((($p | Measure-Object -Property WorkingSetSize -Sum).Sum / 1MB), 0);` +
    `$p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };` +
    `Write-Output ("{0} {1}" -f $n, $mb)`
  ];
  try {
    const out = String(execFileSync('powershell', ps, { encoding: 'utf8', timeout: 20000 })).trim();
    const m = out.match(/^(\d+)\s+(\d+)/);
    if (!m) return { count: 0, mb: 0 };
    return { count: Number(m[1]), mb: Number(m[2]) };
  } catch {
    /* 못 거뒀다고 판을 세우지 않는다. 거두기는 덤이지 판정이 아니다 */
    return { count: 0, mb: 0 };
  }
}
