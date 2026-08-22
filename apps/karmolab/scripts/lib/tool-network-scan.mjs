/**
 * 도구가 **입력을 밖으로 보내는가** 를 코드에서 읽어 낸다 (TASK-KL-352).
 *
 * 왜 있나: 도구 장 164 장 바닥에 「입력한 내용은 브라우저 안에서만 처리되며 어디에도
 * 저장·전송되지 않습니다」 가 **조건 없이** 찍히고 있었다. 그런데 그중에는 그림을 Google
 * Gemini 로 보내는 것(`imageedit`), 사람이 적은 주소로 요청을 실제로 쏘는 것(`apitest`),
 * 점수를 우리 서버에 남기는 것(`arcade`) 이 섞여 있었다. 글로 적은 약속은 아무도 안 재므로
 * 코드가 바뀌면 그 자리에서 거짓말이 된다.
 *
 * 그래서 명부(`src/widgets-lazy-meta.ts`)를 기준으로 도구마다 실제 바깥 호출을 긁고,
 * 사람이 적어 둔 판정(`data/tool-privacy.json`)과 맞춰 본다. 안 맞으면 배포가 막힌다.
 *
 * 판정은 자동으로 안 짓는다 — 같은 `fetch` 라도 우리 정적 파일을 받는 것과 사용자의 그림을
 * 남의 서버로 보내는 것은 뜻이 정반대다. 기계는 **빠진 곳**만 잡고, 뜻은 사람이 적는다.
 */
import fs from 'node:fs';
import path from 'node:path';

const NETCALL = /\bfetch\s*\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon/;

/* `fetch(` 만 보면 놓친다 — `lib/pwned.ts` 는 **넘겨받은** `fetchImpl(` 로 부르고 있었고,
 * 그게 비밀번호 해시 앞 다섯 글자를 실제로 밖에 보내는 자리였다.
 *
 * 그렇다고 이름에 fetch 가 들어간 것을 다 세면 안 된다 — `lib/i18n.ts` 의 `fetchOnce(` 는
 * 우리 말 묶음을 받는 안쪽 함수인데, 그걸 세는 순간 **228개 도구 전부가 「바깥을 부른다」**로
 * 나왔다(실측). 전부가 빨강이면 아무것도 안 잡는 것과 같다.
 *
 * 그래서 「fetch 를 받아 둔 자리」만 별명으로 인정한다 — `x: typeof fetch` 로 선언된 것. */
const FETCH_ALIAS_DECL = /(\w+)\s*:\s*typeof fetch\b/g;
const AI_IMPORT = /from '[^']*lib\/(ai-route|ai-engine|ai-cutout|ai-transcribe)'|\bGemini\.|\bKarmoAI\b/;

/** 바깥이라 부르지 않는 곳 — 글꼴·표준 문서·우리 저장소 링크 (호출이 아니라 글에 박힌 주소). */
const NOT_A_DESTINATION = /fonts\.(googleapis|gstatic)\.com|w3\.org|schema\.org|example\.com|localhost|github\.com\/Mascari/;

/** 명부에서 도구 목록을 읽는다 — 손으로 적은 목록을 따로 두지 않는다. */
export function readRoster(root) {
  const body = fs.readFileSync(path.join(root, 'src/widgets-lazy-meta.ts'), 'utf8');
  const out = [];
  for (const block of body.split(/\n  \{\n/).slice(1)) {
    const id = block.match(/\bid:\s*'([^']+)'/)?.[1];
    if (!id) continue;
    const paths = block.match(/lazyScriptPaths:\s*\[([^\]]*)\]/s)?.[1] || '';
    out.push({
      id,
      noPage: /noPage:\s*true/.test(block),
      scripts: [...paths.matchAll(/'([^']+)'/g)].map((m) => m[1])
    });
  }
  return out;
}

function resolveWidget(root, rel) {
  for (const c of [`src/widgets/${rel}.ts`, `src/widgets/${rel}/index.ts`]) {
    const full = path.join(root, c);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** 주석은 뺀다 — 「예전에는 XMLHttpRequest 를 썼다」 는 설명이 호출로 세어지면 안 된다. */
function stripComments(src) {
  return src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
}

function walk(file, depth, seen, acc, maxDepth) {
  if (!file || seen.has(file) || depth > maxDepth) return;
  seen.add(file);
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return; }
  const code = stripComments(src);
  const aliases = [...code.matchAll(FETCH_ALIAS_DECL)].map((m) => m[1]);
  const aliasCall = aliases.length
    ? new RegExp(`\\b(?:${aliases.join('|')})\\s*\\(`)
    : null;
  for (const line of code.split('\n')) {
    if (NETCALL.test(line) || (aliasCall && aliasCall.test(line))) acc.calls++;
    if (AI_IMPORT.test(line)) acc.ai++;
  }
  for (const m of code.matchAll(/https?:\/\/[a-zA-Z0-9._-]+/g)) {
    if (!NOT_A_DESTINATION.test(m[0])) acc.hosts.add(m[0]);
  }
  for (const m of code.matchAll(/from\s+'(\.[^']+)'/g)) {
    const base = path.join(path.dirname(file), m[1]);
    for (const c of [`${base}.ts`, `${base}/index.ts`]) {
      if (fs.existsSync(c)) walk(c, depth + 1, seen, acc, maxDepth);
    }
  }
}

/** 도구 하나가 건드리는 바깥 — 호출 수·AI 경유 수·주소 목록. */
export function scanTool(root, tool, maxDepth = 3) {
  const acc = { calls: 0, ai: 0, hosts: new Set() };
  const seen = new Set();
  for (const s of tool.scripts) walk(resolveWidget(root, s), 0, seen, acc, maxDepth);
  return { id: tool.id, calls: acc.calls, ai: acc.ai, hosts: [...acc.hosts].sort() };
}

export function readVerdicts(root) {
  const file = path.join(root, 'data/tool-privacy.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
