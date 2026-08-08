/**
 * build-devlog: WitchMendokusai 저장소의 커밋 → apps/karmolab/data/devlog.json (TASK-KL-164)
 *
 * 왜: 「지금 뭘 만들고 있나」가 웹에 없으면, 보러 온 사람은 이 게임이 살아 있는지 알 수 없다.
 * 그런데 개발 소식을 사람이 따로 쓰면 반드시 밀린다 — 그래서 **이미 쓰고 있는 것**(커밋 메시지)을
 * 쓴다. 이 저장소의 커밋은 원래 사람말로 쓰여 있다("선택지에 「무슨 질문이었나」가 딸려 간다").
 *
 * 무엇을 싣나: 사람이 보는 변화(feat · fix)만 앞에 세운다. 나머지(test · chore · ci · docs)는
 * 그날의 「손질 N건」으로 접는다 — 목록이 잡일로 덮이면 아무도 안 읽는다.
 *
 * 못 찾으면(다른 컴퓨터·CI) 커밋된 산출을 그대로 쓴다 — 게임 저장소는 여기 없을 수 있다.
 *
 * 사용: node scripts/build-devlog.mjs
 */
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KARMOLAB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(KARMOLAB_ROOT, '../..');
const OUT_PATH = path.join(KARMOLAB_ROOT, 'data/devlog.json');
const DAYS = 120;
const MAX_ENTRIES = 60;
/** 하루에 몇 줄까지 — 몰아친 하루가 목록 전체를 먹으면 「살아 있다」가 안 보인다. */
const MAX_PER_DAY = 6;

/** 게임 저장소 자리 — 환경변수가 1순위, 그다음 이웃 폴더들. */
function findWmRepo() {
  const candidates = [
    process.env.KARMODDRINE_WM_PATH,
    path.resolve(REPO_ROOT, '../WitchMendokusai'),
    path.resolve(REPO_ROOT, '../../WitchMendokusai'),
    path.resolve(REPO_ROOT, '../../../WitchMendokusai'),   // 세션 작업 폴더(.lanes/<슬롯>/) 안에서 돌 때
    path.resolve(REPO_ROOT, '../Witch-Mendokusai'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(path.join(p, '.git'))) || null;
}

/** conventional commit 앞머리를 사람이 읽는 꼬리표로. 모르는 종류는 그대로 둔다(열린 집합). */
const TYPE_LABEL = {
  feat: '새로 생긴 것',
  fix: '고친 것',
  perf: '빨라진 것',
  refactor: '속을 정리한 것',
  test: '검사',
  chore: '손질',
  ci: '자동화',
  docs: '문서',
  style: '모양',
  build: '빌드',
  revert: '되돌림',
};
/** 앞에 세우는 종류 — 나머지는 그날의 「손질 N건」으로 접는다. */
const HEADLINE = new Set(['feat', 'fix', 'perf', 'revert']);

function parseSubject(subject) {
  const m = /^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/.exec(subject);
  if (!m) return { type: '', scope: '', text: subject.trim() };
  return { type: m[1], scope: m[2] || '', text: m[3].trim() };
}

async function main() {
  const wm = findWmRepo();
  if (!wm) {
    if (!fs.existsSync(OUT_PATH)) {
      console.error('[devlog] 게임 저장소도 없고 커밋된 산출도 없다 — data/devlog.json');
      process.exit(1);
    }
    const prev = JSON.parse(await fsp.readFile(OUT_PATH, 'utf8'));
    console.log(`[devlog] 게임 저장소 없음 — 커밋된 산출 사용 (${prev.entries?.length ?? '?'}건)`);
    return;
  }

  const raw = execFileSync(
    'git',
    ['-C', wm, 'log', `--since=${DAYS}.days`, '--no-merges', '--date=short', '--pretty=format:%h%ad%s'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );

  const days = new Map();
  let total = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const [sha, date, subject] = line.split('');
    if (!sha || !date || !subject) continue;
    total++;
    const { type, scope, text } = parseSubject(subject);
    if (!days.has(date)) days.set(date, { date, entries: [], quiet: 0 });
    const day = days.get(date);
    if (HEADLINE.has(type) || type === '') {
      day.entries.push({ sha, type, typeLabel: TYPE_LABEL[type] || type, scope, text });
    } else {
      day.quiet++;
    }
  }

  // 앞에 세울 게 하나도 없는 날은 접는다 — 「손질 3건」만 있는 날짜 줄은 읽을 게 없다.
  const list = [...days.values()]
    .filter((d) => d.entries.length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  let kept = 0;
  const trimmed = [];
  for (const day of list) {
    if (kept >= MAX_ENTRIES) break;
    const room = MAX_ENTRIES - kept;
    const take = Math.min(room, MAX_PER_DAY);
    trimmed.push({ ...day, entries: day.entries.slice(0, take), more: Math.max(0, day.entries.length - take) });
    kept += Math.min(day.entries.length, take);
  }

  if (trimmed.length === 0) {
    console.error(`[devlog] 최근 ${DAYS}일 동안 보여 줄 변화가 0건 — 수집이 깨진 것 아닌지 확인 (커밋 ${total}개 읽음)`);
    process.exit(1);
  }

  const out = {
    source: 'Mascari4615/Witch-Mendokusai',
    windowDays: DAYS,
    counts: { commits: total, days: trimmed.length, shown: kept },
    days: trimmed,
  };

  // 내용이 같으면 파일을 안 건드린다 (빌드마다 dirty 방지).
  const next = JSON.stringify(out, null, 2) + '\n';
  const prevText = fs.existsSync(OUT_PATH) ? await fsp.readFile(OUT_PATH, 'utf8') : '';
  if (prevText === next) {
    console.log(`[devlog] 그대로 — 변화 ${kept}건 / ${trimmed.length}일`);
    return;
  }
  await fsp.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fsp.writeFile(OUT_PATH, next, 'utf8');
  console.log(`[devlog] 씀: data/devlog.json — 변화 ${kept}건 / ${trimmed.length}일 (커밋 ${total}개 중)`);
}

main().catch((err) => {
  console.error('[devlog] 실패:', err);
  process.exit(1);
});
