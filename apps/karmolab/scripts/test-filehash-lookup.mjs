/**
 * 검사값 넘겨주기 — **파일도 이름도 안 실리는가** (TASK-KL-238 / 24 virustotal).
 *
 * 이 자리의 값어치는 「올리지 않고 물어본다」 하나다. 그래서 여기서 지키는 것은 링크가
 * 열리느냐가 아니라 **주소에 무엇이 실리는가**다: 64자리 검사값 말고는 아무것도 실리면 안 되고,
 * 반쪽 값이면 아예 안 열려야 한다(빈 목록으로 찾으면 「깨끗하다」로 오해한다).
 *
 * 사용: node scripts/test-filehash-lookup.mjs   (npm run test:fhlookup)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

async function load() {
  const stamp = Date.now();
  const entry = path.join(os.tmpdir(), `fh-lookup-${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/core/filehash.ts'))};\n`);
  const out = path.join(os.tmpdir(), `fh-lookup-${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const F = await load();
const SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const links = F.hashLookups(SHA);
check(links.length === 2, `자리 두 곳이 나와야 한다 (나온 것 ${links.length})`);
check(links.map((l) => l.id).join(',') === 'virustotal,bazaar', '열쇠는 virustotal·bazaar');

for (const l of links) {
  check(l.url.startsWith('https://'), `${l.id}: https 로만 넘긴다`);
  check(l.url.includes(SHA), `${l.id}: 검사값이 주소에 있어야 조회가 된다`);
  // ★ 이 도구의 약속. 주소에 실리는 것은 검사값뿐 — 파일 이름·크기·그 밖 무엇도 아니다.
  const rest = l.url.replace(SHA, '');
  check(!/name|file=|upload|size/i.test(rest), `${l.id}: 검사값 말고 아무것도 실리면 안 된다 (${rest})`);
}

// 대문자로 줘도 같은 자리를 연다 — 배포처는 대문자로 적어 두는 곳이 많다.
check(F.hashLookups(SHA.toUpperCase())[0].url === links[0].url, '대문자 검사값도 같은 자리');

// 반쪽·빈 값·SHA-1(40자리)은 열지 않는다.
for (const bad of ['', '   ', 'abc', SHA.slice(0, 63), SHA.slice(0, 40), `${SHA}00`, 'z'.repeat(64)]) {
  check(F.hashLookups(bad).length === 0, `반쪽 값으로 열면 안 된다: 「${bad.slice(0, 12)}…」`);
}
check(F.hashLookups(undefined).length === 0, '값이 아예 없어도 안 터진다');

process.stdout.write('\n');
if (failures.length) {
  console.error(`\n검사값 넘겨주기 — ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('검사값 넘겨주기 — 전부 통과');
