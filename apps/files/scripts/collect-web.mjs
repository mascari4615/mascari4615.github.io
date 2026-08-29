#!/usr/bin/env node
/**
 * 화면이 **실제로 부르는 조각만** 배포 자리로 옮긴다.
 *
 * 왜 만들었나: 배포 스크립트가 파일을 손으로 나열해 복사했다(`cp app.mjs`, `cp src/vault.mjs`, ...).
 * 그래서 새 모듈(`src/gallery.mjs`)을 더한 날, 화면은 그것을 부르는데 배포에는 없어서
 * **액자 보기가 통째로 404** 였다(2026-08-29). 목록을 사람이 기억해야 하는 구조는 언젠가 진다.
 *
 * 하는 일 = `index.html` 과 `app.mjs` 에서 시작해 **import 를 따라가며** 옮기는 것뿐이다.
 * 서버 전용 조각(전송기, rclone, env)은 화면이 안 부르므로 저절로 안 실린다.
 *
 * 사용: node scripts/collect-web.mjs <나갈 자리>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2];
if (!out) {
    console.error('[collect-web] 나갈 자리를 적어라: node scripts/collect-web.mjs apps/blog/files');
    process.exit(2);
}

/** 상대 import 만 따라간다. 바깥 주소는 브라우저가 알아서 받는다. */
function importsOf(code) {
    const found = [];
    for (const m of code.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*from\s*['"](\.[^'"]+)['"]/g)) found.push(m[1]);
    for (const m of code.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) found.push(m[1]);
    return found;
}

const copied = new Set();
function take(rel) {
    if (copied.has(rel)) return;
    const from = path.join(HERE, rel);
    if (!fs.existsSync(from)) {
        console.error(`[collect-web] ✗ 부르는데 없는 조각: ${rel}`);
        process.exit(1);
    }
    copied.add(rel);
    const to = path.join(out, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    if (!rel.endsWith('.mjs') && !rel.endsWith('.js')) return;
    const code = fs.readFileSync(from, 'utf8');
    for (const spec of importsOf(code)) {
        take(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
    }
}

/* 화면의 입구 둘. 여기서부터 딸린 것은 전부 따라간다. */
take('index.html');
const shell = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
for (const m of shell.matchAll(/<script[^>]+src="\.\/([^"]+)"/g)) take(m[1]);
take('app.mjs');

console.log(`[collect-web] ${copied.size}개 옮김 → ${out}`);
for (const rel of [...copied].sort()) console.log(`  ${rel}`);
