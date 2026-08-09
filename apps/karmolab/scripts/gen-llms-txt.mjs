/**
 * `llms.txt` 를 찍는다 — AI 에게 「여기 뭐가 있는지」 한 장으로 (TASK-KL-205 / 흡수계획 03·W0-1)
 *
 * 기대치를 낮게 잡고 만든다: Google 은 2026-05 가이드에서 AI Overviews·AI Mode 에 llms.txt 가
 * **필요 없다**고 못 박았고, 주요 AI 사 중 프로덕션에서 읽는다고 공개한 곳은 아직 없다.
 * 그래도 만드는 이유는 **비용이 0에 가깝고**, 에이전트 쪽(사람 대신 웹을 훑는 층)에서는
 * 실제로 참고하는 도구들이 있기 때문이다. 여기 걸어 두면 손해가 없다.
 *
 * 목록은 **손으로 안 적는다** — `data/tools-seo.json` 이 정본이다(도구 페이지·OG 이미지·검사가
 * 전부 그 파일을 본다). 도구가 늘면 여기도 자동으로 는다.
 *
 * 두 장을 찍는다:
 *   /llms.txt        짧은 안내 + 갈래별 대표
 *   /llms-full.txt   도구 전부 + 한 줄 설명
 *
 * 사용: node scripts/gen-llms-txt.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BLOG = path.resolve(root, '../blog');
const SITE = 'https://blog.mascari4615.com';

const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
const ids = Object.keys(seo).sort();

/** MCP 서버가 실제로 내놓는 도구 = `src/core/` 에서 `spec` 을 가진 파일. 손으로 안 적는다. */
const coreDir = path.join(root, 'src/core');
const mcpTools = fs.existsSync(coreDir)
  ? fs
      .readdirSync(coreDir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /export const spec\b/.test(fs.readFileSync(path.join(coreDir, f), 'utf8')))
      .map((f) => path.basename(f, '.ts'))
      .sort()
  : [];

const line = (id) => `- [${seo[id].description ? id : id}](${SITE}/karmolab/t/${id}/): ${seo[id].lead ?? seo[id].description ?? ''}`;

const head = `# KarmoLab

> 브라우저에서 바로 쓰는 도구 ${ids.length}개와 놀이. 설치·로그인 없이 열리고, **파일은 기기 밖으로 나가지 않습니다** (변환·계산이 전부 브라우저 안에서 끝납니다). 오픈소스.

한국어가 기본입니다. 한국 규칙(만 나이 3종·사업자등록번호 검증숫자·대체공휴일·한글 자모·한영타)을 정확히 다루는 것이 이 사이트의 강점입니다.

## AI 에이전트에게

- 도구마다 정적 설명 페이지가 있습니다: \`${SITE}/karmolab/t/<도구id>/\`
- 같은 주소 끝에 \`.md\` 를 붙이면 **HTML 이 아니라 마크다운 원문**이 옵니다:
  \`${SITE}/karmolab/t/<도구id>.md\` — 읽으려고 왔다면 이쪽이 싸고 정확합니다.
- 주소로 바로 실행할 수 있습니다: \`${SITE}/karmolab/t/<도구id>/?op=<연산>&<칸>=<값>\`
  예) \`${SITE}/karmolab/t/base64/?op=encode&text=안녕\`
- **MCP 서버**가 있습니다 — 계산을 직접 호출하려면 이쪽이 정확합니다 (해시·난수·검증숫자처럼
  지어내면 안 되는 값). 도구 ${mcpTools.length}묶음: ${mcpTools.join(' · ')}
- **도구를 이어서** 부를 수 있습니다 — 중간값을 돌려받아 다시 넣지 않아도 됩니다.
  MCP 는 \`chain_run\`, 화면·주소는 \`${SITE}/karmolab/t/chain/\`.
  예) Base64 로 바꾼 뒤 그 결과의 SHA-256 —
  \`[{"tool":"base64","op":"encode","args":{"text":"안녕"}},{"tool":"hashgen","op":"text","args":{"text":"$1","algo":"SHA256"}}]\`
  해시처럼 **지어내면 안 되는 값**은 이렇게 부르는 편이 안전합니다. 중간에 글자가 바뀔 자리가 없습니다.
`;

const short = `${head}
## 갈래

- [도구 전체 목록](${SITE}/llms-full.txt): 도구 ${ids.length}개 전부와 한 줄 설명
- [KarmoLab 첫 화면](${SITE}/karmolab/): 검색해서 찾기
- [블로그](${SITE}/): 게임 개발·기술 글
`;

const full = `${head}
## 도구 ${ids.length}개

${ids.map(line).join('\n')}
`;

const withFrontMatter = (permalink, body) => `---\npermalink: ${permalink}\n---\n\n${body}`;

fs.writeFileSync(path.join(BLOG, 'assets/llms.txt'), withFrontMatter('/llms.txt', short), 'utf8');
fs.writeFileSync(path.join(BLOG, 'assets/llms-full.txt'), withFrontMatter('/llms-full.txt', full), 'utf8');

console.log(`[gen-llms-txt] /llms.txt · /llms-full.txt — 도구 ${ids.length}개 · MCP 묶음 ${mcpTools.length}개`);
