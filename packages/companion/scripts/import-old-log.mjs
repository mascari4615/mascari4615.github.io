/**
 * 잠들어 있던 Rust 동반자의 기억을 이쪽으로 옮긴다.
 *
 * 저쪽은 사람이 읽는 일기 형식(.md)이고 이쪽은 한 줄 한 기억이다. 같은 대화이므로
 * 새로 시작하지 않고 이어 붙인다 — 정본이 옮겨졌다고 해서 지난 기억까지 버릴 이유는 없다.
 *
 *   node scripts/import-old-log.mjs [<옛 log 폴더>] [<옮겨 담을 파일>]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const from = process.argv[2] ?? join(process.cwd(), '..', '..', '..', 'memo', 'life', 'companion', 'log');
const into = process.argv[3] ?? join(homedir(), '.companion', 'conversation.jsonl');

if (existsSync(from) === false) {
  console.error(`옛 기억 폴더가 없다: ${from}`);
  process.exit(1);
}

// 한 항목 = "## <시각> [<누구>]" 머리 + 본문 + 마지막 <small> 부가줄.
const entryHead = /^##\s+(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s*\[([^\]]+)\]\s*$/;

const already = existsSync(into)
  ? new Set(
      readFileSync(into, 'utf8')
        .split('\n')
        .filter((l) => l.trim() !== '')
        .map((l) => l),
    )
  : new Set();

const rows = [];
for (const name of readdirSync(from).filter((f) => f.endsWith('.md')).sort()) {
  const lines = readFileSync(join(from, name), 'utf8').split('\n');
  let at = null;
  let said = [];

  const flush = () => {
    if (at === null) return;
    const text = said.join('\n').trim();
    if (text !== '') rows.push({ role: 'said', channel: 'screen', text, at });
    at = null;
    said = [];
  };

  for (const line of lines) {
    const head = entryHead.exec(line.trim());
    if (head !== null) {
      flush();
      at = new Date(head[1].replace(' ', 'T')).getTime();
      continue;
    }
    if (at === null) continue;
    if (line.trim().startsWith('<small>')) continue; // 화면 파일 이름 등 곁가지
    said.push(line);
  }
  flush();
}

mkdirSync(dirname(into), { recursive: true });
let added = 0;
for (const row of rows.sort((a, b) => a.at - b.at)) {
  const line = JSON.stringify(row);
  if (already.has(line)) continue; // 두 번 돌려도 두 배로 쌓이지 않게
  appendFileSync(into, `${line}\n`, 'utf8');
  already.add(line);
  added += 1;
}

console.log(`옛 기억 ${rows.length}개 중 ${added}개를 옮겼다 → ${into}`);
