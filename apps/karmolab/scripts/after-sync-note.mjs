/**
 * 도구를 더한 뒤 무엇을 커밋해야 하는지 알려 준다 (TASK-KL-089)
 *
 * `sync:tools` 가 만드는 것 중 저장소에 남겨야 하는 것은 둘뿐이다.
 *  - `img/og/` : 공유 카드. 배포 러너에는 한글 글꼴이 없어 거기서는 못 만든다.
 *  - `data/tools-seen.json` : 도구가 처음 등장한 날. 러너에서 갱신해 봐야 남지 않는다.
 * 도구 페이지 자체는 배포할 때마다 다시 찍으므로 커밋하지 않는다(무시 목록에 있다).
 *
 * 무엇이 바뀌었는지 세어서, 커밋할 게 있을 때만 말한다.
 */
import { execSync } from 'node:child_process';

function changed(pathspec) {
  try {
    const out = execSync(`git status --porcelain -- ${pathspec}`, { encoding: 'utf8' });
    return out.split('\n').filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

const cards = changed('img/og');
const seen = changed('data/tools-seen.json');

/* 아직 커밋 안 된 내 변경도 함께 짚는다.
 * 여러 세션이 같은 브랜치에 커밋하다 **내 커밋이 통째로 사라진 일이 두 번** 있었다.
 * 그때 디스크에는 최신본이 남아 있어 겉으로는 멀쩡했고, 저장소만 옛것이었다 — 검사 열 개와
 * 앱 아이콘 셋이 배포에서 빠진 채였다. 도구를 손볼 때마다 도는 이 자리에서 알리면 그날 안에 안다. */
function listChanged(pathspec) {
  try {
    return execSync(`git status --porcelain -- ${pathspec}`, { encoding: 'utf8' })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
const pending = ['scripts', 'css', 'data', 'index.html', 'manifest.json'].flatMap(listChanged);
const notCards = pending.filter((l) => !/img\/og|tools-seen\.json/.test(l));

if (!cards && !seen) {
  console.log('[after-sync] 새로 커밋할 것 없음 — 카드와 기록이 이미 맞는다');
} else {
  const parts = [];
  if (cards) parts.push(`공유 카드 ${cards}건`);
  if (seen) parts.push('처음 본 날 기록');
  console.log(`[after-sync] 커밋해야 할 것: ${parts.join(' · ')}`);
  console.log('  git add -- apps/karmolab/img/og apps/karmolab/data/tools-seen.json');
  console.log('  (도구 페이지는 배포 때 다시 찍으므로 커밋하지 않는다)');
}

if (notCards.length) {
  console.log(`[after-sync] 아직 커밋 안 된 변경 ${notCards.length}건 — 저장소에 안 들어가면 배포에도 없다`);
  notCards.slice(0, 8).forEach((l) => console.log('  ' + l));
  if (notCards.length > 8) console.log(`  … 외 ${notCards.length - 8}건`);
}
