/**
 * 입력칸에 이름이 붙어 있는지 **소스에서** 본다 (TASK-KL-088)
 *
 * 이미 라이브를 재는 검사가 있다(`audit-input-labels.mjs`). 그런데 그건 배포된 뒤에야 알려 준다 —
 * 실제로 오늘 도구 7개에 이름 없는 칸 17개를 만들고도 배포 전에는 아무 신호가 없었다.
 * 배포가 막힌 날이라 우연히 손으로 발견했을 뿐이다.
 *
 * 그래서 같은 것을 소스에서 미리 본다. 라이브 검사를 대신하는 게 아니라 **더 일찍** 잡는 자리다.
 * 눈에 보이는 설명이 옆에 적혀 있어도 화면낭독기는 이어 준 것만 읽는다 —
 * `aria-label` 이나 `<label for>` 로 이어 줘야 한다.
 *
 * 사용: node scripts/check-input-names.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'src/widgets/tools');

// 이름이 필요한 것: 값을 고르거나 적는 칸. 체크박스·라디오는 대개 <label> 로 감싸므로 뺀다
// (감싼 경우 화면낭독기가 그 글을 읽어 준다). 파일 선택은 감싸는 영역이 설명을 갖는다.
const NEEDS_NAME = /<(input|select|textarea)\b[^>]*>/g;
const SKIP_TYPES = /type="(hidden|checkbox|radio|file|button|submit)"/;

const offenders = [];
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.ts')) continue;
  const src = fs.readFileSync(path.join(dir, name), 'utf8');
  for (const m of src.matchAll(NEEDS_NAME)) {
    const tag = m[0];
    if (SKIP_TYPES.test(tag)) continue;
    if (/aria-label=|aria-labelledby=|title="/.test(tag)) continue;
    // placeholder 는 브라우저가 이름이 없을 때 대신 읽어 준다 — 완벽하진 않지만 「편집란」보다는 낫다.
    // 이 검사는 **이름이 될 만한 것이 하나도 없는** 칸만 잡는다 (라이브 검사가 0 이라고 한 것을
    // 여기서 77개라 우기면 아무도 안 믿는다 — 실제로 처음엔 그렇게 잘못 짰다).
    if (/placeholder="/.test(tag)) continue;
    const id = (tag.match(/id="([^"]+)"/) || [])[1];
    if (id && new RegExp(`<label[^>]*for="${id}"`).test(src)) continue;
    // <label> … <input> … </label> 처럼 감싼 경우도 이름이 붙는다
    const before = src.slice(0, m.index);
    const openLabel = before.lastIndexOf('<label');
    if (openLabel >= 0 && before.indexOf('</label>', openLabel) < 0) continue;
    offenders.push(`${name}: ${id ? '#' + id : tag.slice(0, 48)}`);
  }
}

if (offenders.length) {
  console.error(`[check-input-names] 이름 없는 입력칸 ${offenders.length}개 — 화면낭독기는 「편집란」으로만 읽습니다`);
  offenders.forEach((o) => console.error('  - ' + o));
  console.error('  고치는 법: 그 칸에 aria-label="눈에 보이는 그 설명" 을 붙이거나 <label for> 로 이어 주세요.');
  process.exit(1);
}
console.log('[check-input-names] 도구의 입력칸이 모두 이름을 갖고 있다');
