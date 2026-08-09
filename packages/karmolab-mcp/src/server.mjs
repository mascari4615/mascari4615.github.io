#!/usr/bin/env node
/**
 * karmolab-mcp — KarmoLab 도구를 AI 에이전트가 부를 수 있게 (TASK-KL-205 / S1 P3)
 *
 * 왜 있나: LLM 은 해시를 **지어낸다**. 만나이·대체공휴일·시간대 전환처럼 규칙이 복잡한 것도
 * 자신 있게 틀린다. 우리 도구는 그걸 정확히 하는 코드를 이미 갖고 있는데, 그동안 **화면으로만**
 * 열려 있어서 에이전트가 쓸 방법이 없었다. 알맹이를 떼어 놓았으니 이제 그대로 내놓는다.
 *
 * **의존성 0.** MCP 의 stdio 전송은 줄 단위 JSON-RPC 2.0 이라 SDK 없이도 말이 통한다.
 * 남의 코드를 안 들이는 편이 우리가 지고 갈 짐이 적다 (SHA-3 을 직접 쓴 것과 같은 판단).
 *
 * 도구 목록은 **손으로 안 적는다** — `dist/manifest.json`(빌드가 찍음)을 읽고, 각 알맹이의
 * `spec` 에서 이름·설명·입력 모양을 뽑는다. 알맹이가 늘면 여기 손 안 대도 도구가 는다.
 *
 * 쓰는 법 (Claude Code 등):
 *   claude mcp add karmolab -- npx -y karmolab-mcp
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(here, 'dist');

/** 우리가 말할 줄 아는 MCP 판. 상대가 다른 판을 요청하면 그쪽을 그대로 돌려준다(관례). */
const PROTOCOL = '2025-06-18';
const VERSION = '0.1.0';

if (fs.existsSync(path.join(distDir, 'manifest.json')) === false) {
  process.stderr.write('[karmolab-mcp] dist 가 없다 — 먼저 `npm run build` 를 돌려라\n');
  process.exit(1);
}

// ── 해시 계산기 (Node 쪽 손) ────────────────────────────────────────────────
// 알맹이는 계산기를 직접 안 갖는다. 브라우저는 CryptoJS 를, 여기서는 OpenSSL 을 준다.
const NODE_HASH = { MD5: 'md5', SHA1: 'sha1', SHA256: 'sha256', SHA512: 'sha512', RIPEMD160: 'ripemd160' };
const hashBackend = (algo, text) => {
  const name = NODE_HASH[algo];
  if (name === undefined) throw new Error(`이 계산기는 ${algo} 를 모릅니다`);
  return crypto.createHash(name).update(text, 'utf8').digest('hex');
};

// ── 알맹이 올리기 ───────────────────────────────────────────────────────────
const { tools: toolFiles } = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));

/** MCP 도구 이름 = `<도구>_<연산>`. 점·슬래시는 이름 규칙에 안 맞아 밑줄로 간다. */
const registry = new Map();

for (const base of toolFiles) {
  const mod = await import(pathToFileURL(path.join(distDir, `${base}.mjs`)).href);
  if (mod.spec === undefined || typeof mod.run !== 'function') {
    process.stderr.write(`[karmolab-mcp] ${base} 에 spec 또는 run 이 없다 — 건너뛴다\n`);
    continue;
  }
  for (const [op, opSpec] of Object.entries(mod.spec.ops)) {
    registry.set(`${mod.spec.id}_${op}`, { mod, op, opSpec, id: mod.spec.id });
  }
}

if (registry.size === 0) {
  process.stderr.write('[karmolab-mcp] 올릴 도구가 하나도 없다\n');
  process.exit(1);
}

/** 우리 짧은 타입 표기(`'boolean?'`)를 JSON Schema 로 편다. */
function toJsonSchema(inSpec) {
  const properties = {};
  const required = [];
  for (const [name, type] of Object.entries(inSpec)) {
    const optional = type.endsWith('?');
    properties[name] = { type: optional ? type.slice(0, -1) : type };
    if (optional === false) required.push(name);
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

const toolList = [...registry.entries()].map(([name, t]) => ({
  name,
  description: t.opSpec.desc,
  inputSchema: toJsonSchema(t.opSpec.in)
}));

// ── JSON-RPC (줄 단위) ──────────────────────────────────────────────────────
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function callTool(name, args) {
  const t = registry.get(name);
  if (t === undefined) throw new Error(`모르는 도구입니다: ${name}`);
  /*
   * `call` = 도구가 다른 도구를 부르는 손 (chain 이 쓴다). 여기서만 줄 수 있다 —
   * 알맹이끼리 서로 import 하면 목록을 손으로 관리하게 되고, 화면 번들도 통째로 무거워진다.
   * 깊이는 chain 쪽에서 막는다(chain 은 chain 을 못 부른다).
   */
  const value = t.mod.run(t.op, args ?? {}, { hash: hashBackend, call: (toolId, op, a) => callTool(`${toolId}_${op}`, a) });
  return String(value);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  const text = line.trim();
  if (text === '') return;

  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    // id 를 모르면 답할 자리도 없다. 조용히 죽지 않게 stderr 로 남긴다.
    process.stderr.write('[karmolab-mcp] JSON 이 아닌 줄이 왔다\n');
    return;
  }

  // 알림(id 없음)은 답하지 않는다 — 답하면 규약 위반이다.
  if (msg.id === undefined) return;

  try {
    if (msg.method === 'initialize') {
      ok(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'karmolab', version: VERSION }
      });
      return;
    }
    if (msg.method === 'tools/list') {
      ok(msg.id, { tools: toolList });
      return;
    }
    if (msg.method === 'tools/call') {
      try {
        const out = callTool(msg.params?.name, msg.params?.arguments);
        ok(msg.id, { content: [{ type: 'text', text: out }] });
      } catch (e) {
        // 도구가 실패한 것은 **프로토콜 오류가 아니다** — 에이전트가 읽고 고칠 수 있게 내용으로 준다.
        ok(msg.id, { content: [{ type: 'text', text: `실패: ${e.message}` }], isError: true });
      }
      return;
    }
    if (msg.method === 'ping') {
      ok(msg.id, {});
      return;
    }
    err(msg.id, -32601, `모르는 method: ${msg.method}`);
  } catch (e) {
    err(msg.id, -32603, e.message);
  }
});

rl.on('close', () => process.exit(0));
