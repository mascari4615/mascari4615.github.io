/**
 * 「KarmoLab 도구 월드컵」 표를 굽는다 (TASK-KL-151 ⑬)
 *
 * 왜: 씨앗 표가 셋뿐이라 월드컵이 늘 같은 것만 돌았다. 그렇다고 남의 그림을 퍼다 심을 수는
 * 없다 — 저작권이 우리 것이 아닌 그림으로 채운 표는 언젠가 통째로 내려야 한다.
 *
 * 그래서 **우리가 만든 그림**만 쓴다: 도구마다 이미 구워 둔 공유 카드(`img/og/<id>.jpg`).
 * 자기 사이트의 도구로 월드컵을 돌리는 표라 우리답기도 하다.
 *
 * 산출: `data/worldcup-tools.json` (봇이 뜰 때 씨앗 표로 심는다).
 * 사용: node scripts/gen-worldcup-tools.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://blog.mascari4615.com';

const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
const metaSrc = fs.readFileSync(path.join(root, 'js/widgets-lazy-meta.js'), 'utf8');

/** 구워진 매니페스트에서 id → {title, category} 만 훑는다. 파서를 새로 쓰지 않는다. */
const widgets = new Map();
for (const m of metaSrc.matchAll(/id:\s*"([a-z0-9-]+)"[\s\S]{0,400}?title:\s*"([^"]+)"[\s\S]{0,400}?category:\s*"([^"]+)"/g)) {
  // 구워진 파일은 한글을 `글` 꼴로 적는다 — 그대로 쓰면 이름이 기호 뭉치가 된다.
  const unescape = (raw) => {
    try {
      return JSON.parse(`"${raw}"`);
    } catch {
      return raw;
    }
  };
  widgets.set(m[1], { title: unescape(m[2]), category: unescape(m[3]) });
}

/** 갈래 이름은 사람이 보는 칸이다 — 코드 이름을 그대로 내보내지 않는다. */
const KIND = { tool: '도구', play: '놀이', desktop: '데스크톱', dev: '개발' };

const items = [];
for (const id of Object.keys(seo)) {
  const img = path.join(root, 'img/og', `${id}.jpg`);
  if (!fs.existsSync(img)) continue; // 그림 없는 도구는 월드컵에 못 나온다
  const w = widgets.get(id);
  items.push({
    n: (w && w.title) || id,
    i: `${SITE}/apps/karmolab/img/og/${id}.jpg`,
    v: { cat: KIND[(w && w.category) || ''] || '도구' },
  });
}

if (items.length < 8) {
  console.error(`[gen-worldcup-tools] 그림 있는 도구가 ${items.length}개뿐이다 — 표를 안 만든다`);
  process.exit(1);
}

const pack = {
  title: 'KarmoLab 도구 월드컵',
  emoji: '🧰',
  fields: [{ key: 'cat', label: '갈래', kind: 'category' }],
  items,
};
fs.writeFileSync(path.join(root, 'data/worldcup-tools.json'), JSON.stringify(pack, null, 2) + '\n', 'utf8');
console.log(`[gen-worldcup-tools] 도구 ${items.length}개로 표를 구웠다`);
