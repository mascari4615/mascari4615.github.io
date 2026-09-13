/**
 * 현재 검사 프로세스의 자손인 헤드리스만 정리.
 * 생성 시각만으로 소유권 추정 금지. 부모가 이미 사라져 확인 불가하면 보존.
 */
import { execFileSync } from 'node:child_process';

export function ownedHeadless(processes, ownerPid, sinceMs) {
  const byId = new Map(processes.map((p) => [p.pid, p]));
  return processes.filter((p) => {
    if (p.name !== 'chrome-headless-shell.exe' || p.created < sinceMs) return false;
    let child = p; const visited = new Set();
    while (!visited.has(child.pid)) {
      visited.add(child.pid);
      const parent = byId.get(child.parent);
      // 재사용된 PID는 해당 자식의 부모가 아님
      if (!parent || parent.created > child.created) return false;
      if (parent.pid === ownerPid) return true;
      child = parent;
    }
    return false;
  });
}

export function reapHeadless(sinceMs) {
  if (process.platform !== 'win32') return { count: 0, mb: 0 };
  try {
    const scan = 'Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid=$_.ProcessId; parent=$_.ParentProcessId; name=$_.Name; created=([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds(); bytes=$_.WorkingSetSize } } | ConvertTo-Json -Compress';
    const rows = JSON.parse(String(execFileSync('powershell', ['-NoProfile', '-Command', scan], { encoding: 'utf8', timeout: 20000 })));
    const targets = ownedHeadless(Array.isArray(rows) ? rows : [rows], process.pid, sinceMs);
    if (!targets.length) return { count: 0, mb: 0 };
    const literal = JSON.stringify(targets.map(({ pid, created }) => ({ pid, created }))).replaceAll("'", "''");
    // 종료 직전 PID와 생성 시각 재확인
    const stop = "$targets = '" + literal + "' | ConvertFrom-Json; $n=0; $bytes=0; foreach ($target in $targets) { "
      + '$p=Get-CimInstance Win32_Process -Filter ("ProcessId="+$target.pid); '
      + 'if ($p -and ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() -eq $target.created) { '
      + 'Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; $n++; $bytes+=$p.WorkingSetSize } }; '
      + 'Write-Output ("{0} {1}" -f $n,[math]::Round($bytes/1MB))';
    const out = String(execFileSync('powershell', ['-NoProfile', '-Command', stop], { encoding: 'utf8', timeout: 20000 })).trim();
    const match = out.match(/^(\d+)\s+(\d+)/);
    return match ? { count: Number(match[1]), mb: Number(match[2]) } : { count: 0, mb: 0 };
  } catch {
    return { count: 0, mb: 0 };
  }
}
