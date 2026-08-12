/**
 * 스터디 맵 내용 번역이 얼마나 덮였는지 본다 (TASK-KL-233).
 *
 * 한국어 정본(`studymap.json`) 위에 언어별 덧씌우기 표(`studymap.<언어>.json`)를 얹는 구조라,
 * 빠진 칸은 **화면에 한국어가 그대로 나간다** — 조용히. 그래서 여기서 센다.
 *
 * 안 옮긴 칸이 있으면 실패로 세운다(그 언어 판이 반쪽인 채 상세 페이지로 나가는 걸 막는다).
 * 덧씌우기 표 자체에 한글이 남아 있는 것도 잡는다 — 옮긴 척한 자리.
 *
 * 사용: node scripts/check-studymap-i18n.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'data');
const base = JSON.parse(fs.readFileSync(path.join(dataDir, 'studymap.json'), 'utf8'));

const trackIds = base.tracks.map((t) => t.id);
const stageIds = base.tracks.flatMap((t) => t.stages.map((s) => s.id));
const nodes = base.tracks.flatMap((t) => t.stages.flatMap((s) => s.nodes));
const HANGUL = /[가-힣]/;

let bad = 0;
for (const code of ['en', 'ja']) {
  const file = path.join(dataDir, `studymap.${code}.json`);
  if (!fs.existsSync(file)) {
    console.log(`[studymap-i18n] ${code}: 표 없음 — 그 언어 화면은 전부 한국어로 나간다`);
    bad += 1;
    continue;
  }
  const over = JSON.parse(fs.readFileSync(file, 'utf8'));
  const missing = [];
  for (const id of trackIds) if (!over.tracks?.[id]?.title || !over.tracks?.[id]?.lead) missing.push(`track:${id}`);
  for (const id of stageIds) if (!over.stages?.[id]) missing.push(`stage:${id}`);
  for (const node of nodes) {
    const o = over.nodes?.[node.id];
    if (!o?.title || !o?.why) missing.push(`node:${node.id}`);
    else if (node.check && !o.check) missing.push(`node:${node.id}.check`);
    else if (node.tool && !o.tool) missing.push(`node:${node.id}.tool`);
    else if ((node.links || []).length !== (o.links || []).length) missing.push(`node:${node.id}.links`);
  }
  const strays = [];
  const walk = (value, at) => {
    if (typeof value === 'string') {
      if (HANGUL.test(value) && at !== '$comment') strays.push(`${at}: ${value.slice(0, 30)}`);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, at ? `${at}.${k}` : k);
    }
  };
  walk(over, '');

  if (missing.length === 0 && strays.length === 0) {
    console.log(`[studymap-i18n] ${code}: 갈래 ${trackIds.length} · 단계 ${stageIds.length} · 칸 ${nodes.length} 전부 옮겼다`);
    continue;
  }
  bad += 1;
  if (missing.length) console.log(`[studymap-i18n] ${code}: 안 옮긴 자리 ${missing.length}개 — ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`);
  if (strays.length) console.log(`[studymap-i18n] ${code}: 표 안에 한국어가 남았다 ${strays.length}개 — ${strays.slice(0, 4).join(' | ')}`);
}

process.exit(bad ? 1 : 0);
