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
const kai = tryReq('karmolab-ai/node', [
  path.join(yb, 'node_modules', 'karmolab-ai', 'node.js'),
  path.join(yb, 'node_modules', 'karmolab-ai', 'dist', 'node.js'),
  path.join(yb, 'node_modules', 'karmolab-ai'),
  'karmolab-ai/node',
]);

(async () => {
  if (!ac || !kai) {
    console.log('ABORT: required modules unresolved (ac=' + !!ac + ' kai=' + !!kai + ')');
    return;
  }
  const env = Object.assign({}, process.env);
  if (!env.MEMO_REPO_PATH) {
    console.log('NOTE: MEMO_REPO_PATH unset -> readMissionText/gather use fallback');
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
    raw = await kai.generateDiscoveryText({ prompt: prompt, timeoutMs: 90000 });
  } catch (e) {
    threw = String(e && e.message || e);
    console.log('DISCOVERY-THROW ' + threw);
  }
  raw = raw || '';
  console.log('RAW_LEN ' + raw.length);
  console.log('RAW_BEGIN>>>');
  console.log(raw.slice(0, 1800));
  console.log('<<<RAW_END');
  try {
    const r = pp && pp.parseProposalEnvelope ? pp.parseProposalEnvelope(raw) : null;
    console.log('PARSE_RESULT ' + (r ? ('OK kind=' + r.kind) : 'NULL (rejected -> discarded)'));
  } catch (e) {
    console.log('PARSE-THROW ' + (e && e.message || e));
  }
})();
