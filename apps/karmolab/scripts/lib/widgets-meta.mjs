/**
 * 위젯 이름·한 줄 설명을 등록 파일에서 뽑는다 (TASK-KL-203 S5-b)
 *
 * 정본은 `src/widgets-lazy-meta.ts` 다 — 도구를 새로 만들면 거기 등록한다. 같은 이름을
 * `i18n/ko/widgets.json` 에 한 벌 더 적어 두면 그날부터 갈라지므로, **적지 않고 뽑는다**
 * (도구 설명 때와 같은 규칙).
 *
 * 왜 실행하지 않고 읽어서 뽑나: 그 파일은 브라우저용 TypeScript 라 여기서 그대로 못 돈다.
 * 빌드된 `js/` 를 읽는 방법도 있지만, 그러면 **빌드 전에는 검사가 못 돈다** — 그건 게이트로 쓸 수
 * 없다(순서가 뒤집히면 영원히 빨갛다). 우리가 필요한 건 세 줄뿐이라 줄 단위로 읽는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT } from './locales.mjs';

const SRC = path.join(APP_ROOT, 'src/widgets-lazy-meta.ts');

/** 따옴표 안의 글에서 이스케이프를 되돌린다 (`\'` → `'`). */
const unesc = (s) => s.replace(/\\(['\\])/g, '$1');

/**
 * `{ id, title, desc }` 목록. 등록 파일의 모양이 바뀌면 뽑히는 수가 줄어드는데,
 * 그건 `build-i18n.mjs` 가 「갑자기 확 줄었다」로 잡는다(조용히 비는 것이 제일 나쁘다).
 */
export function widgetMeta() {
  if (!fs.existsSync(SRC)) return {};
  const out = {};
  let cur = null;
  for (const line of fs.readFileSync(SRC, 'utf8').split('\n')) {
    /* **한 줄짜리 등록도 있다.** 처음에는 줄마다 `id:` / `title:` 을 따로 찾았는데, 놀이 위젯 20개는
       `{ id: 'x', title: '…', … }` 로 한 줄에 적혀 있어 통째로 빠졌다 — 영어 화면에서 그 20개
       이름만 한국어로 남았다(실측). 한 줄 형태를 먼저 본다. */
    const one = /\bid:\s*'([^']+)'[^\n]*?\btitle:\s*'((?:[^'\\]|\\.)*)'/.exec(line);
    if (one) {
      cur = one[1];
      out[cur] = { title: unesc(one[2]) };
      const d = /\bdesc:\s*'((?:[^'\\]|\\.)*)'/.exec(line);
      if (d) out[cur].desc = unesc(d[1]);
      continue;
    }
    let m = /^\s*id:\s*'([^']+)',/.exec(line);
    if (m) {
      cur = m[1];
      out[cur] = {};
      continue;
    }
    if (!cur) continue;
    m = /^\s*title:\s*'((?:[^'\\]|\\.)*)',/.exec(line);
    if (m) {
      out[cur].title = unesc(m[1]);
      continue;
    }
    m = /^\s*desc:\s*'((?:[^'\\]|\\.)*)',/.exec(line);
    if (m) out[cur].desc = unesc(m[1]);
  }
  /* 이름이 없는 항목은 위젯이 아니다 (id 만 있는 다른 구조가 섞여 들어온 것). */
  for (const [id, v] of Object.entries(out)) if (!v.title) delete out[id];
  return out;
}

/** 평평한 열쇠로 (`widgets.<id>.title`). */
export function widgetCatalog() {
  const flat = {};
  for (const [id, v] of Object.entries(widgetMeta())) {
    flat[`widgets.${id}.title`] = v.title;
    if (v.desc) flat[`widgets.${id}.desc`] = v.desc;
  }
  return flat;
}
