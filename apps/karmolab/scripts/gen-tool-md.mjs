/**
 * 도구마다 **마크다운 쌍둥이**를 찍는다 — `/karmolab/t/<id>.md` (TASK-KL-205 / 흡수계획 01 Batch4)
 *
 * 왜: 사람이 읽는 화면은 HTML 이 맞지만, **글로 읽는 쪽**(AI 에이전트·요약 도구)은 HTML 을
 * 마크다운으로 되돌리는 단계를 한 번 더 거친다. 그 과정에서 차림표·꼬리말·스크립트가 섞여
 * 정작 필요한 설명이 묻힌다. 같은 내용을 **처음부터 마크다운으로도** 내놓으면 그 단계가 없어진다.
 *
 * 이게 요즘 쓰이는 방식이다 — `r.jina.ai/<주소>` 는 아무 페이지나 마크다운으로 바꿔 주고,
 * Cloudflare 는 `Accept: text/markdown` 이면 마크다운을 돌려준다. 우리는 **정적 호스팅(GitHub
 * Pages)이라 헤더로 갈라 줄 수 없다** — 그래서 `.md` 를 따로 찍는 쪽을 골랐다. 결과는 같다.
 *
 * 목록·문안은 손으로 안 적는다. `data/tools-seo.json` 이 정본이고 도구 페이지·OG 이미지·검사가
 * 전부 그 파일을 본다 — 그러니 여기만 어긋날 수가 없다.
 *
 * 사용: node scripts/gen-tool-md.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/*
 * ★ 원본을 `.md` 로 두면 **Jekyll 이 HTML 로 바꿔 버린다** (2026-08-09 로컬 빌드로 발각).
 *
 * 주소는 `/karmolab/t/<id>.md` 인데 내려오는 내용이 `<h1>…</h1>` 이었다. 마크다운을 달라고
 * 그 주소로 온 쪽(에이전트)에게 HTML 을 주면 이 파일들이 있는 이유가 없어진다.
 * Jekyll 은 **원본 확장자**로 변환 여부를 정하므로, 원본을 `.txt` 로 두고 주소만 `.md` 로 준다.
 *
 * 겸사겸사 폴더도 갈랐다 — `karmolab/t` 는 `gen-tool-pages` 가 정리하는 자리다.
 * 남의 정리 규칙에 얹혀 사는 것보다, 안 겹치는 자리에 두는 편이 낫다.
 */
const outDir = path.resolve(root, '../blog/karmolab/tmd');
const SITE = 'https://blog.mascari4615.com';

const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
const ids = Object.keys(seo);

/**
 * 도구 이름의 단일 정본 = 위젯 매니페스트의 `title` (`gen-tool-pages.mjs` 와 같은 자리를 본다).
 * 여기서 따로 이름을 지으면 HTML 쪽 제목과 갈라진다.
 * 빌드 산출물이라 없을 수도 있다 — 그때는 id 로 두고 넘어간다(찍는 것 자체가 막히면 더 나쁘다).
 */
const titleById = (() => {
  const p = path.join(root, 'js/widgets-lazy-meta.js');
  if (fs.existsSync(p) === false) return {};
  try {
    const fake = {};
    new Function('window', fs.readFileSync(p, 'utf8'))(fake);
    return Object.fromEntries((fake.KARMOLAB_LAZY_META ?? []).map((w) => [w.id, w.title]));
  } catch {
    return {};
  }
})();

/** 알맹이가 있는 도구는 **주소로 부를 수 있다** — 그 사실을 문서에 적어 준다. */
const coreDir = path.join(root, 'src/core');
const withCore = new Map();
if (fs.existsSync(coreDir)) {
  for (const f of fs.readdirSync(coreDir).filter((n) => n.endsWith('.ts'))) {
    const body = fs.readFileSync(path.join(coreDir, f), 'utf8');
    if (/export const spec\b/.test(body) === false) continue;
    // spec.ops 의 열쇠만 뽑는다 (실행하지 않는다 — 빌드 전이라 js 가 없을 수 있다).
    const ops = [...body.matchAll(/^\s{4}(\w+):\s*\{$/gm)].map((m) => m[1]);
    withCore.set(path.basename(f, '.ts'), ops);
  }
}

fs.mkdirSync(outDir, { recursive: true });

let n = 0;
for (const id of ids) {
  const t = seo[id];
  const title = titleById[id] ?? id;
  const lines = [`# ${title}`, '', `> ${t.description ?? t.lead ?? ''}`, '', `열기: ${SITE}/karmolab/t/${id}/`];

  if (Array.isArray(t.howto) && t.howto.length > 0) {
    lines.push('', '## 쓰는 법', '', ...t.howto.map((h, i) => `${i + 1}. ${h}`));
  }
  if (Array.isArray(t.faq) && t.faq.length > 0) {
    lines.push('', '## 자주 묻는 것', '');
    for (const f of t.faq) lines.push(`**${f.q ?? f.question ?? ''}**`, '', `${f.a ?? f.answer ?? ''}`, '');
  }

  const ops = withCore.get(id);
  if (ops !== undefined && ops.length > 0) {
    lines.push(
      '',
      '## 주소로 부르기',
      '',
      `\`${SITE}/karmolab/t/${id}/?op=<연산>&<칸>=<값>\``,
      '',
      `연산: ${ops.join(' · ')}`,
      '',
      'AI 에이전트라면 MCP 서버(`karmolab-mcp`)로 직접 부르는 편이 정확합니다 — 값이 그대로 돌아옵니다.'
    );
  }

  lines.push('', '---', '', '브라우저 안에서 계산합니다. 파일은 기기 밖으로 나가지 않습니다.', '');

  /*
   * 앞머리(front matter)가 있어야 Jekyll 이 이 파일을 내보낸다. 다만 그 순간 **Liquid** 도
   * 같이 돈다 — 본문에 `{{` 나 `{%` 가 섞이면 그 자리가 조용히 사라지거나 빌드가 깨진다.
   * 지금 도구 설명에는 없지만 언젠가 하나 들어가면 그날 알게 된다. `raw` 로 감싸면 그만이다
   * (감싼 표시 자체는 출력에 안 남는다).
   */
  const body =
    `---\npermalink: /karmolab/t/${id}.md\n---\n` +
    `{% raw %}\n${lines.join('\n')}\n{% endraw %}\n`;
  fs.writeFileSync(path.join(outDir, `${id}.txt`), body, 'utf8');
  n++;
}

console.log(`[gen-tool-md] 마크다운 쌍둥이 ${n}장 (그중 주소 호출 가능 ${withCore.size}개)`);
