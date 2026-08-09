/**
 * MCP 서버가 **진짜로 대답하는지** 확인한다 (TASK-KL-205 / S1 P3)
 *
 * 「만들었다」로 끝내면 안 되는 자리다. 서버를 진짜 띄우고, 에이전트가 하는 것과 같은 순서로
 * 말을 걸어(initialize → tools/list → tools/call) **돌아온 값이 맞는지** 본다.
 * 값은 OpenSSL 과 대 본다 — 서버가 그럴듯한 문자열을 지어내는 경우까지 잡는다.
 *
 * 사용: node scripts/smoke-mcp.mjs
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverPath = path.resolve(root, '../../packages/karmolab-mcp/src/server.mjs');

const failures = [];
const check = (okv, why) => {
  process.stdout.write(okv ? '.' : 'x');
  if (okv === false) failures.push(why);
};
const eq = (got, want, label) => check(got === want, `${label}: 「${got}」 (기대 「${want}」)`);

const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let stderr = '';
child.stderr.on('data', (d) => (stderr += d.toString()));

const pending = new Map();
let buffer = '';
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (line === '') continue;
    const msg = JSON.parse(line);
    const resolve = pending.get(msg.id);
    if (resolve) {
      pending.delete(msg.id);
      resolve(msg);
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => reject(new Error(`${method} 이 10초 안에 답하지 않았다. stderr: ${stderr}`)), 10000);
  });
}
const callTool = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;

// ── 에이전트가 하는 순서 그대로 ─────────────────────────────────────────────
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
eq(init.result?.serverInfo?.name, 'karmolab', 'initialize 가 서버 이름을 준다');
check(init.result?.capabilities?.tools !== undefined, 'tools 능력을 알린다');

// 알림에는 답하지 않아야 한다 (답하면 규약 위반) — 보내 보고 다음 요청이 멀쩡한지로 확인한다.
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const list = (await rpc('tools/list')).result;
const names = list.tools.map((t) => t.name).sort();
check(names.length >= 4, `도구가 4개 이상이어야 하는데 ${names.length}개: ${names.join(', ')}`);
for (const want of ['base64_encode', 'base64_decode', 'epoch_toDate', 'epoch_toStamp', 'hashgen_text']) {
  check(names.includes(want), `${want} 가 목록에 없다 (있는 것: ${names.join(', ')})`);
}
const b64enc = list.tools.find((t) => t.name === 'base64_encode');
check(typeof b64enc.description === 'string' && b64enc.description.length > 10, '설명이 붙어 있다');
eq(b64enc.inputSchema.required.join(','), 'text', '필수 칸이 스키마에 나온다');
check(b64enc.inputSchema.properties.urlSafe?.type === 'boolean', '선택 칸 타입이 나온다');

// ── 값이 진짜 맞는가 ────────────────────────────────────────────────────────
const enc = await callTool('base64_encode', { text: '안녕하세요' });
eq(enc.content[0].text, '7JWI64WV7ZWY7IS47JqU', 'base64_encode 한글');
eq((await callTool('base64_decode', { code: '7JWI64WV7ZWY7IS47JqU' })).content[0].text, '안녕하세요', 'base64_decode');
const safe = await callTool('base64_encode', { text: '~~~???', urlSafe: true });
check(/[+/=]/.test(safe.content[0].text) === false, `urlSafe 가 먹어야 한다: ${safe.content[0].text}`);

// LLM 이 지어내는 대표 항목 — OpenSSL 과 글자 단위로 같아야 한다.
const sha256 = await callTool('hashgen_text', { text: 'KarmoLab', algo: 'SHA256' });
eq(sha256.content[0].text, crypto.createHash('sha256').update('KarmoLab').digest('hex'), 'hashgen SHA-256');
const sha3 = await callTool('hashgen_text', { text: 'KarmoLab', algo: 'SHA3-512' });
eq(sha3.content[0].text, crypto.createHash('sha3-512').update('KarmoLab').digest('hex'), 'hashgen SHA3-512 (우리가 직접 쓴 것)');
const all = await callTool('hashgen_text', { text: 'KarmoLab' });
eq(all.content[0].text.split('\n').length, 7, 'algo 를 안 주면 7종 전부');

// 시간대·자릿수 — 여기도 LLM 이 자주 틀린다.
const toDate = await callTool('epoch_toDate', { ts: '1750000000000000000' });
check(toDate.content[0].text.startsWith('나노초'), `자릿수를 나노초로 읽어야 한다: ${toDate.content[0].text.split('\n')[0]}`);
check(toDate.content[0].text.includes('2025-06-15'), `2025-06-15 가 나와야 한다 (5만 년 X): ${toDate.content[0].text}`);
eq((await callTool('epoch_toStamp', { date: '2025-06-15T15:06:40.000Z' })).content[0].text, '1750000000', 'epoch_toStamp');

// ── 틀린 호출은 조용히 넘어가지 않는다 ──────────────────────────────────────
const bad = await callTool('hashgen_text', { text: 'a', algo: '없는알고' });
check(bad.isError === true, '모르는 알고리즘이면 isError 를 세워야 한다');
check(bad.content[0].text.includes('모르는 알고리즘'), `이유를 말해야 한다: ${bad.content[0].text}`);
const missing = await callTool('epoch_toDate', { ts: 'abc' });
check(missing.isError === true, '못 읽는 값이면 isError');

const unknown = await rpc('tools/call', { name: '없는도구', arguments: {} });
check(unknown.result?.isError === true, '없는 도구도 오류로 답한다(죽지 않는다)');

const unknownMethod = await rpc('그런거없음');
check(unknownMethod.error?.code === -32601, '모르는 method 는 -32601');

child.stdin.end();
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[smoke-mcp] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  if (stderr) console.error('서버 stderr:\n' + stderr);
  process.exit(1);
}
console.log(`[smoke-mcp] MCP 서버 — 도구 ${names.length}개, 실제 호출·값 대조 전부 통과`);
