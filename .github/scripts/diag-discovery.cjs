// KAR-018-Y prod instrumentation (read-only, no bot restart).
// Runs the REAL discovery code path (built dist) on the laptop and dumps
// raw claude output + parseProposalEnvelope verdict, so the "parsing fail"
// root is data-driven (golden spirit: capture artifact, no hypothesis).
// ASCII-only file; Korean comes only from agent-mission.md at runtime.
'use strict';
const path = require('path');

const yb = process.env.YBDIR || process.cwd();

function tryReq(label, candidates) {
  for (const c of candidates) {
    try {
      const m = require(c);
      console.log('resolved ' + label + ' <- ' + c);
      return m;
    } catch (e) {
      // try next
    }
  }
  console.log('FAILED to resolve ' + label + ' (tried: ' + candidates.join(' | ') + ')');
  return null;
}

const ac = tryReq('agent-cadence', [
  path.join(yb, 'dist', 'src', 'bot', 'agent-cadence.js'),
]);
const pp = tryReq('proposal', [
  path.join(yb, 'dist', 'src', 'bot', 'proposal.js'),
]);
// karmolab-ai is a workspace pkg (root node_modules symlink). Resolve it
// the SAME way the bot does: createRequire anchored at a built bot module.
let kai = null;
try {
  const { createRequire } = require('module');
  const anchor = path.join(yb, 'dist', 'src', 'bot', 'agent-cadence.js');
  const botRequire = createRequire(anchor);
  kai = botRequire('karmolab-ai/node');
  console.log('resolved karmolab-ai/node <- createRequire(' + anchor + ')');
} catch (e) {
  console.log('FAILED createRequire karmolab-ai/node: ' + (e && e.message || e));
  kai = tryReq('karmolab-ai/node', ['karmolab-ai/node']);
}

(async () => {
  if (!ac || !kai) {
    console.log('ABORT: required modules unresolved (ac=' + !!ac + ' kai=' + !!kai + ')');
    return;
  }
  const env = Object.assign({}, process.env);
  // Use the REAL prod prompt: pull MEMO_REPO_PATH (+ relevant vars) from
  // the prod .env the deploy wrote, so readMissionText/gatherDiscoveryContext
  // produce exactly what the prod bot feeds claude (not the degraded fallback).
  if (!env.MEMO_REPO_PATH) {
    const fs = require('fs');
    const dotenv = path.join(yb, '.env');
    try {
      const txt = fs.readFileSync(dotenv, 'utf-8');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && (m[1] === 'MEMO_REPO_PATH' || m[1] === 'CLAUDE_CLI_TIMEOUT_MS' || m[1] === 'CLAUDE_CLI_COMMAND') && !env[m[1]]) {
          env[m[1]] = m[2].trim();
        }
      }
      console.log('prod .env loaded: MEMO_REPO_PATH=' + (env.MEMO_REPO_PATH || '(absent)'));
    } catch (e) {
      console.log('NOTE: cannot read prod .env (' + (e && e.message || e) + ') -> fallback prompt');
    }
  }
  if (!env.MEMO_REPO_PATH) {
    const guess = 'C:\\Users\\masca\\repos\\karmoddrine\\memo';
    if (require('fs').existsSync(guess)) { env.MEMO_REPO_PATH = guess; console.log('MEMO_REPO_PATH guessed -> ' + guess); }
  }
  let prompt = '';
  try {
    const mission = ac.readMissionText ? ac.readMissionText(env) : '';
    const ctx = ac.gatherDiscoveryContext ? ac.gatherDiscoveryContext(env) : '';
    prompt = ac.buildDiscoveryPrompt ? ac.buildDiscoveryPrompt(mission, ctx) : '';
    console.log('MISSION_LEN ' + mission.length + ' CTX_LEN ' + ctx.length + ' PROMPT_LEN ' + prompt.length);
  } catch (e) {
    console.log('PROMPT-BUILD-FAIL ' + (e && e.message || e));
  }
  let raw = '';
  let threw = '';
  try {
    // 300s (현실값) — 90s 는 내 artifact 였고 그 위에 오진 가설을 박았다
    // (KAR-018-Y, feedback_regression_first_not_redesign). prod 봇 실제
    // timeout 은 30min; 여기선 5min 이면 "느림 vs 형식불량" 판별 충분.
    raw = await kai.generateDiscoveryText({ prompt: prompt, timeoutMs: 300000 });
  } catch (e) {
    threw = String(e && e.message || e);
    console.log('DISCOVERY-THROW ' + threw);
  }
  raw = raw || '';
  console.log('RAW_LEN ' + raw.length);
  console.log('RAW_EXACT ' + JSON.stringify(raw.slice(0, 1800))); // 공백/펜스 정확히
  try {
    const r = pp && pp.parseProposalEnvelope ? pp.parseProposalEnvelope(raw) : null;
    console.log('PARSE_RESULT ' + (r ? ('OK kind=' + r.kind) : 'NULL (rejected -> discarded)'));
  } catch (e) {
    console.log('PARSE-THROW ' + (e && e.message || e));
  }

  // ── 프롬프트 꼬리(context+지시) — claude 가 "새것 없음→빈출력" 인지 판단 ──
  console.log('PROMPT_TAIL>>>');
  console.log(prompt.slice(-1100));
  console.log('<<<PROMPT_TAIL');

  // ── 차분 실험: context 빼고 mission-only 로 2차 호출 ──
  // 이게 유효 JSON 제안을 뱉으면 = context(누적 backlog/형식)가 범인,
  // claude-cli 자체는 정상 (회귀-차분, provider 스왑 X). 똑같이 빈출력이면
  // mission/지시 자체 문제.
  try {
    const mission2 = ac.readMissionText ? ac.readMissionText(env) : '';
    const p2 = ac.buildDiscoveryPrompt ? ac.buildDiscoveryPrompt(mission2, '') : '';
    console.log('DIFF mission-only PROMPT_LEN ' + p2.length);
    const raw2 = (await kai.generateDiscoveryText({ prompt: p2, timeoutMs: 300000 })) || '';
    console.log('DIFF RAW_LEN ' + raw2.length);
    console.log('DIFF RAW_EXACT ' + JSON.stringify(raw2.slice(0, 1200)));
    const r2 = pp && pp.parseProposalEnvelope ? pp.parseProposalEnvelope(raw2) : null;
    console.log('DIFF PARSE_RESULT ' + (r2 ? ('OK kind=' + r2.kind) : 'NULL'));
  } catch (e) {
    console.log('DIFF-THROW ' + (e && e.message || e));
  }
})();
