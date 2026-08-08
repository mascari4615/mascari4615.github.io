/**
 * build-wm-tasks: memo/wm/tasks/*.md → apps/karmolab/data/wm-tasks.json (TASK-KL-171)
 *
 * 왜: 「지금 뭘 만들고 있나」를 웹에 두면, 보러 온 사람이 이 게임이 어디쯤 왔는지 안다.
 * 소식(devlog)은 **끝난 것**만 보여 준다 — 이쪽은 **하는 중 / 할 것**을 보여 준다.
 * 개발 보드를 따로 쓰면 밀리므로, 이미 쓰고 있는 TASK 문서의 머리말을 그대로 읽는다.
 *
 * 무엇이 나가나: 머리말에 `web: private` 이 붙은 문서만 뺀다(문서가 정한다).
 * 본문은 아예 안 싣는다 — 제목·상태·우선순위만. 스포일러가 본문에 있어도 나갈 길이 없다.
 *
 * memo 가 없으면(다른 컴퓨터·CI) 커밋된 산출을 그대로 쓴다.
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

/** 사람이 읽는 상태 이름. 모르는 상태는 그대로 — 상태 집합은 열려 있다. */
const STATUS_LABEL = {
  in_progress: '하는 중',
  ready: '준비됨',
  seed: '씨앗',
  hold: '멈춤',
  done: '끝남',
  sealed: '닫힘',
  blocked: '막힘',
};
/** 화면에 세우는 순서 — 「하는 중」이 맨 위. */
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
    console.log(`[wm-tasks] memo 없음 — 커밋된 산출 사용 (${prev.counts?.shown ?? '?'}건)`);
    return;
  }

  const files = (await fsp.readdir(TASKS_ROOT)).filter(
    (f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md'
  );

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
    console.error(`[wm-tasks] 보여 줄 항목이 0건 — 수집이 깨진 것 아닌지 확인 (문서 ${total}개 읽음)`);
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
    console.log(`[wm-tasks] 그대로 — ${shown}건 / 무리 ${ordered.length}개`);
    return;
  }
  await fsp.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fsp.writeFile(OUT_PATH, next, 'utf8');
  console.log(`[wm-tasks] 씀: data/wm-tasks.json — ${shown}건 / 무리 ${ordered.length}개 (문서 ${total} · 숨김 ${skipped})`);
}

main().catch((err) => {
  console.error('[wm-tasks] 실패:', err);
  process.exit(1);
});
