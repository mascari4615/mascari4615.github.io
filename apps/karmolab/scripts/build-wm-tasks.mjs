/**
 * build-wm-tasks: memo/wm/tasks/*.md → apps/karmolab/data/wm-tasks.json (TASK-KL-171)
 *
 * 왜: 지금 뭘 만들고 있나를 웹에 두면, 보러 온 사람이 이 게임이 어디쯤 왔는지 안다.
 * 소식(devlog)은 **끝난 것**만 보여 준다. 이쪽은 **하는 중 / 할 것**을 보여 준다.
 * 개발 보드를 따로 쓰면 밀리므로, 이미 쓰고 있는 TASK 문서의 머리말을 그대로 읽는다.
 *
 * 무엇이 나가나: 머리말에 `web: private` 이 붙은 문서만 뺀다(문서가 정한다).
 * 본문은 아예 안 싣는다. 제목, 상태, 우선순위만. 스포일러가 본문에 있어도 나갈 길이 없다.
 *
 * memo 가 없으면(다른 컴퓨터, CI) 커밋된 산출을 그대로 쓴다.
 *
 * 사용: node scripts/build-wm-tasks.mjs
 */
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const KARMOLAB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(KARMOLAB_ROOT, '../..');
const MEMO_PATH = process.env.KARMODDRINE_MEMO_PATH || path.resolve(REPO_ROOT, '../memo');
const TASKS_ROOT = path.join(MEMO_PATH, 'wm/tasks');
const OUT_PATH = path.join(KARMOLAB_ROOT, 'data/wm-tasks.json');

/** 사람이 읽는 상태 이름. 모르는 상태는 그대로. 상태 집합은 열려 있다. */
const STATUS_LABEL = {
  in_progress: '하는 중',
  ready: '준비됨',
  seed: '씨앗',
  hold: '멈춤',
  done: '끝남',
  sealed: '닫힘',
  blocked: '막힘',
};
/** 화면에 세우는 순서. 하는 중이 맨 위. */
const ORDER = ['in_progress', 'ready', 'seed', 'hold', 'blocked', 'done', 'sealed'];
const DONE_SHOWN = 12;

function frontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '---' || t === '...') break;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(t);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/** 파일 첫 H1 = 사람이 읽는 제목. 없으면 파일명에서 만든다. */
function titleOf(text, file) {
  const m = text.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  return path.basename(file, '.md').replace(/^TASK-WM-\d+-/, '').replace(/-/g, ' ');
}

async function main() {
  if (!fs.existsSync(TASKS_ROOT)) {
    if (!fs.existsSync(OUT_PATH)) {
      console.error(`[wm-tasks] memo 도 없고 커밋된 산출도 없다: ${OUT_PATH}`);
      process.exit(1);
    }
    const prev = JSON.parse(await fsp.readFile(OUT_PATH, 'utf8'));
    /* 바닥 (2026-08-14). 아래 갈래에는 보여 줄 항목 0건이면 실패가 있는데 이 갈래엔 없었다.
     * CI 는 언제나 이 갈래로 온다(memo 는 비공개). 비면 배포는 초록, 화면은 백지다. */
    const kept = prev.counts?.shown;
    if (typeof kept !== 'number' || kept < 1) {
      console.error(`[wm-tasks] ❌ 커밋된 산출에 보여 줄 항목이 ${kept ?? '?'}건이다. memo 가 없다가 아니라 **산출이 비었다**.`);
      console.error('[wm-tasks]   memo 가 있는 기계에서 `npm run build:wm-tasks` 를 돌려 다시 커밋할 것.');
      process.exit(1);
    }
    console.log(`[wm-tasks] memo 없음. 커밋된 산출 사용 (${kept}건)`);
    return;
  }

  // ★ `done/` 아래도 읽는다 (2026-08-14).
  //   끝난 TASK 는 `wm/tasks/done/` 으로 옮겨 활성 폴더를 비우는데, 여기서 평면으로만 읽으면
  //   그 순간 사이트의 끝남, 닫힘이 통째로 사라진다. **웹이 폴더 배치에 묶여 있던 자리**다.
  //   깊이 1 만 본다(그 아래로 더 파는 구조는 없다).
  const entries = await fsp.readdir(TASKS_ROOT, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      if (e.name.startsWith('.')) continue;
      for (const sub of await fsp.readdir(path.join(TASKS_ROOT, e.name))) {
        if (sub.endsWith('.md') && sub.toLowerCase() !== 'readme.md') files.push(path.join(e.name, sub));
      }
      continue;
    }
    if (e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md') files.push(e.name);
  }

  const groups = new Map();
  let skipped = 0;
  let total = 0;
  for (const f of files) {
    const text = await fsp.readFile(path.join(TASKS_ROOT, f), 'utf8');
    const meta = frontmatter(text);
    total++;
    if (String(meta.web || '').trim() === 'private') { skipped++; continue; }
    const status = String(meta.status || 'seed').trim();
    const item = {
      id: String(meta.id || path.basename(f, '.md')),
      title: titleOf(text, f),
      status,
      statusLabel: STATUS_LABEL[status] || status,
      priority: String(meta.priority || ''),
      updated: String(meta.updated || ''),
    };
    if (!groups.has(status)) groups.set(status, []);
    groups.get(status).push(item);
  }

  const ordered = [...groups.entries()]
    .sort((a, b) => {
      const ia = ORDER.indexOf(a[0]);
      const ib = ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([status, items]) => {
      items.sort((x, y) => x.id.localeCompare(y.id));
      const shown = status === 'done' || status === 'sealed' ? items.slice(-DONE_SHOWN).reverse() : items;
      return {
        status,
        label: STATUS_LABEL[status] || status,
        count: items.length,
        items: shown,
      };
    });

  const shown = ordered.reduce((n, g) => n + g.items.length, 0);
  if (shown === 0) {
    console.error(`[wm-tasks] 보여 줄 항목이 0건. 수집이 깨진 것 아닌지 확인 (문서 ${total}개 읽음)`);
    process.exit(1);
  }

  const out = {
    source: 'memo/wm/tasks',
    counts: { docs: total, groups: ordered.length, shown, hidden: skipped },
    groups: ordered,
  };
  const next = JSON.stringify(out, null, 2) + '\n';
  const prevText = fs.existsSync(OUT_PATH) ? await fsp.readFile(OUT_PATH, 'utf8') : '';
  if (prevText === next) {
    console.log(`[wm-tasks] 그대로. ${shown}건 / 무리 ${ordered.length}개`);
    return;
  }
  await fsp.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fsp.writeFile(OUT_PATH, next, 'utf8');
  console.log(`[wm-tasks] 씀: data/wm-tasks.json. ${shown}건 / 무리 ${ordered.length}개 (문서 ${total}, 숨김 ${skipped})`);
}

main().catch((err) => {
  console.error('[wm-tasks] 실패:', err);
  process.exit(1);
});
