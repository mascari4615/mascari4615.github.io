/**
 * 변경 기록 만들기 (TASK-KL-098).
 *
 * 왜 있나: 「전문적인 사이트」의 표식은 색이 아니라 **책임**이다. 무엇이 언제 바뀌었는지
 * 밝히는 곳은 관리되는 서비스고, 안 밝히는 곳은 언제 조용히 망가져도 모르는 곳이다.
 *
 * 왜 손으로 안 적나: 손으로 적는 변경 기록은 예외 없이 두 달 뒤에 멈춘다. 멈춘 변경 기록은
 * 없느니만 못하다 — 「2026년 8월 이후로 아무 일도 없는 사이트」로 읽힌다. 그래서 **이미 남기고
 * 있는 것**(git 기록)에서 뽑는다. 새로 지킬 규율이 하나도 안 늘어난다.
 *
 * 무엇을 싣나: 사람이 겪는 변화만 — 새 기능(feat) · 고침(fix) · 빨라짐(perf).
 * 내부 정리(chore/refactor/docs/ci/test)는 뺀다. 사이트를 쓰는 사람에게는 안 일어난 일이다.
 *
 * git 이 없거나 기록을 못 읽으면 **있던 파일을 그대로 둔다** — 여기서 실패해도 배포는 간다.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const OUT = path.join(root, 'data/changelog.json');

/** 이 폴더들이 바뀐 커밋만 — 블로그 글이나 게임 커밋은 KarmoLab 의 변경이 아니다. */
const WATCH = ['apps/karmolab', 'apps/discord-bots/apps/yawnbot', 'packages/karmolab-ai'];

/** 몇 개까지 실을지. 넘치면 읽는 사람이 최근 것을 못 찾는다. */
const LIMIT = 80;

/** 커밋 종류 → 사람 말. 여기 없는 종류는 아예 안 싣는다. */
const KINDS = {
  feat: { label: '새로 생김', tone: 'new' },
  fix: { label: '고침', tone: 'fix' },
  perf: { label: '빨라짐', tone: 'perf' },
};

function gitLog() {
  // %x1f = 칸 구분, %x1e = 줄 구분. 제목에 무엇이 들어와도 안 깨지는 구분자다.
  const out = execFileSync(
    'git',
    ['log', '-n', '600', '--no-merges', '--date=short', '--pretty=format:%h%x1f%ad%x1f%s%x1e', '--', ...WATCH],
    { cwd: path.resolve(root, '../..'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  return out.split('\x1e').map((line) => line.trim()).filter(Boolean);
}

/**
 * 제목에서 사람이 읽을 한 줄을 뽑는다.
 * `fix(karmolab): 새로고침 안내를 폰에서 못 닫던 것 (KL-129)` → `새로고침 안내를 폰에서 못 닫던 것`
 * 뒤에 붙은 작업 번호는 우리 사정이라 뗀다 — 밖에서는 아무 뜻이 없다.
 */
function parse(subject) {
  const match = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(subject);
  if (!match) return null;
  const kind = KINDS[match[1]];
  if (!kind) return null;
  const text = match[2]
    .replace(/\s*\((?:TASK-)?[A-Z]{2,5}-\d+[^)]*\)\s*$/, '')
    .trim();
  if (!text) return null;
  return { kind: match[1], label: kind.label, tone: kind.tone, text };
}

let lines;
try {
  lines = gitLog();
} catch (error) {
  console.warn('[gen-changelog] git 기록을 못 읽었다 — 있던 파일을 그대로 둔다:', error.message);
  process.exit(0);
}

const entries = [];
const seen = new Set();
for (const line of lines) {
  const [sha, date, subject] = line.split('\x1f');
  if (!subject) continue;
  const parsed = parse(subject);
  if (!parsed) continue;
  // 같은 날 같은 문장이 두 번 = 되돌렸다 다시 넣은 것. 읽는 사람에게는 한 번 일어난 일이다.
  const key = `${date}|${parsed.text}`;
  if (seen.has(key)) continue;
  seen.add(key);
  entries.push({ sha, date, ...parsed });
  if (entries.length >= LIMIT) break;
}

if (entries.length === 0) {
  console.warn('[gen-changelog] 실을 변경이 하나도 없다 — 있던 파일을 그대로 둔다');
  process.exit(0);
}

// git 은 사는 곳 시각으로 날짜를 적는다 — 만든 날짜만 UTC 로 적으면 하루 어긋나 보인다.
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const payload = { generatedAt: today, entries };
const next = `${JSON.stringify(payload, null, 2)}\n`;
const prevRaw = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

// 만든 날짜만 다른 것으로는 안 쓴다 — 배포마다 파일이 바뀌면 diff 가 쓸모없어진다.
const stripDate = (raw) => raw.replace(/"generatedAt":\s*"[^"]*",?\s*/, '');
if (stripDate(prevRaw) === stripDate(next)) {
  console.log(`[gen-changelog] 변경 없음 (${entries.length}건)`);
  process.exit(0);
}

fs.writeFileSync(OUT, next);
console.log(`[gen-changelog] ${entries.length}건 · 가장 최근 ${entries[0].date}`);
