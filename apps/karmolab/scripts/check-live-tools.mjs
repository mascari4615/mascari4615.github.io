/**
 * 도구 장 138장이 **진짜 사람 주소에 있는지** 묻는다 (TASK-KL-205 곁가지)
 *
 * `check-live-version` 은 「어느 판이 서빙되는가」 하나만 본다. 그런데 판이 새것이어도
 * **어떤 장은 없을 수 있다** — 생성기가 도중에 멈추거나, 새 도구를 넣고 카드·주소를 안 채웠거나,
 * 커밋에 파일이 안 실렸을 때가 그렇다. 그러면 검색 결과를 타고 온 사람만 404 를 보고, 우리는
 * 모른다(우리는 늘 목록에서 눌러 들어가니까).
 *
 * ★ 주소를 여기 못 박아 둔다 — `/karmolab/t/<id>/` 다. 파일은 `apps/blog/karmolab/t/…` 에
 *   있지만 Jekyll 이 permalink 로 옮긴다. 실측으로 `/apps/karmolab/t/…` 로 물었다가 「전부
 *   404」로 잘못 판단한 적이 있다(도구 장은 멀쩡했다).
 *
 * 게이트(`npm run gates`)에는 **일부러 안 넣는다.** 남의 망·배포 지연까지 우리 빨강으로
 * 세면 곧 아무도 안 본다. 배포 뒤에 사람이 부르는 검사다.
 *
 * 사용:
 *   node scripts/check-live-tools.mjs
 *   BASE=https://… ONLY=mesh3d,charconv node scripts/check-live-tools.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const AT_ONCE = Number(process.env.AT_ONCE || 8);

const seo = JSON.parse(fs.readFileSync(path.join(appRoot, 'data/tools-seo.json'), 'utf8'));
const all = Object.keys(seo.tools ?? seo);
const only = (process.env.ONLY || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s !== '');
const ids = only.length > 0 ? only : all;

const unknown = only.filter((id) => all.includes(id) === false);
if (unknown.length > 0) {
  console.error(`[live-tools] 그런 도구가 없다: ${unknown.join(' · ')}`);
  process.exit(1);
}

const urlOf = (id) => `${BASE}/karmolab/t/${id}/`;

/** 한 장을 본다. 200 만으로는 모자라다 — 그 장이 **그 도구의 장인지**까지 본다. */
async function look(id) {
  try {
    const res = await fetch(`${urlOf(id)}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok === false) return { id, why: `http ${res.status}` };
    const html = await res.text();
    /* 껍데기만 오고 알맹이가 빠진 장을 걸러 낸다(생성기가 멈추면 이렇게 된다). */
    if (html.includes(`/js/widgets/tools/${id}`) === false && html.includes(`"${id}"`) === false) {
      return { id, why: '장은 있는데 그 도구의 장이 아니다' };
    }
    return { id, ok: true, bytes: html.length };
  } catch (err) {
    return { id, net: String(err?.message ?? err) };
  }
}

const results = [];
for (let i = 0; i < ids.length; i += AT_ONCE) {
  results.push(...(await Promise.all(ids.slice(i, i + AT_ONCE).map(look))));
}

/* 망이 통째로 안 되는 것과 「장이 없다」는 다른 일이다. 섞으면 사람이 검사를 안 믿는다. */
const net = results.filter((r) => r.net !== undefined);
if (net.length === results.length) {
  console.log(`[live-tools] CANNOT-RUN — ${BASE} 에 못 닿았다: ${net[0].net}`);
  process.exit(0);
}

const bad = results.filter((r) => r.ok !== true);
if (bad.length > 0) {
  console.error(`[live-tools] ${bad.length}장이 사람 주소에 없다 (${results.length}장 중):`);
  for (const b of bad) console.error(`  - ${b.id} — ${b.why ?? b.net} → ${urlOf(b.id)}`);
  /* process.exit 로 끊으면 아직 열려 있는 연결 때문에 윈도우에서 노드가 시끄럽게 죽는다. */
  process.exitCode = 1;
} else {
  console.log(`[live-tools] 도구 장 ${results.length}장 전부 살아 있고 제 알맹이를 물고 있다 (${BASE})`);
}
