/**
 * KarmoLab 도구 월드컵 표를 굽는다 (TASK-KL-151 ⑬)
 *
 * 왜: 씨앗 표가 셋뿐이라 월드컵이 늘 같은 것만 돌았다. 그렇다고 남의 그림을 퍼다 심을 수는
 * 없다. 저작권이 우리 것이 아닌 그림으로 채운 표는 언젠가 통째로 내려야 한다.
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
/* ★ **구운 파일이 아니라 손으로 적는 곳을 읽는다** (2026-08-14).
   전에는 `js/widgets-lazy-meta.js`(빌드 산출물)를 정규식으로 훑었다. 그런데 그 파일은
   커밋되지 않는다. 그래서 **밤에 스스로 굽는 워크플로가 첫 판부터 ENOENT 로 죽어 있었다**
   (2026-08-13 19:29, 그 워크플로가 돈 유일한 판). 감사기는 밤에 굽는다고 약속하고,
   굽는 놈은 한 번도 안 돌았다. 모름이 괜찮음으로 읽히던 자리다.
   손으로 적는 곳(`src/widgets-lazy-meta.ts`)은 커밋되어 있고, 사람이 쓴 한국어 이름이
   그대로 들어 있다. 짓지 않아도 읽힌다(그래서 밤 워크플로에 설치, 빌드가 필요 없다). */
/* 줄 끝을 먼저 고른다. 윈도우 체크아웃은 CRLF 라 덩이 나누기가 한 개도 안 맞는다
   (2026-08-31 실측: 이 생성기가 목록을 0개 읽어 죽은 것으로 잡혔다) */
const metaSrc = fs.readFileSync(path.join(root, 'src/widgets-lazy-meta.ts'), 'utf8').replace(/\r\n/g, '\n');

/** 손으로 적는 목록에서 id → {title, category} 만 훑는다. 파서를 새로 쓰지 않는다. */
const widgets = new Map();
for (const block of metaSrc.split('\n  {\n').slice(1)) {
  const id = block.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)?id:\s*'([a-z0-9-]+)'/m)?.[1];
  /* 이름은 `get title() { return t('...', undefined, "한국어"); }` 꼴. 그 마지막 칸이 정본이다. */
  const title = block.match(/title\(\)[^}]*?undefined, "([^"]*)"/)?.[1];
  const category = block.match(/category:\s*'([^']+)'/)?.[1];
  if (!id || !title || !category) continue;
  widgets.set(id, { title: JSON.parse(`"${title}"`), category });
}
if (widgets.size < 100) {
  console.error(`[gen-worldcup-tools] 목록을 ${widgets.size}개밖에 못 읽었다. 적는 꼴이 바뀌었나 보다`);
  process.exit(1);
}

/** 갈래 이름은 사람이 보는 칸이다. 코드 이름을 그대로 내보내지 않는다. */
const KIND = { tool: '도구', play: '놀이', desktop: '데스크톱', dev: '개발' };

const items = [];
/* 후보에서 빼는 일은 **표를 다시 구워 커밋**해야 성립한다. 생성기만 바꾸면 커밋된 표와
   갈라져 `audit:generated` 가 선다(2026-08-13 실측). 표를 구우려면 빌드 산출물이 필요한데
   그건 깨끗한 자리에서 해야 남의 미완성이 안 섞인다. 그때까지 옛 도구도 후보에 남는다 . 
   눌러도 작업대로 가므로 길이 끊기지는 않는다. */
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
  console.error(`[gen-worldcup-tools] 그림 있는 도구가 ${items.length}개뿐이다. 표를 안 만든다`);
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
