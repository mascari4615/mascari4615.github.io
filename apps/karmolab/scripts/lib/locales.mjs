/**
 * 언어 등록부 읽기 — 생성기·검사가 공유하는 한 벌 (TASK-KL-203)
 *
 * 정본은 `data/locales.json` 하나다. 여기에 없는 언어는 어디에도 없다.
 * 「언어 목록」을 두 군데 적어 두면 반드시 갈라진다 — 실제로 그랬던 파일이 이 레포에 여럿 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const raw = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'data/locales.json'), 'utf8'));

/** 등록된 전부 (아직 안 켠 것 포함). */
export const ALL_LOCALES = raw.locales;
/** 실제로 화면에 나가는 것 — 페이지를 찍는 쪽은 이것만 돈다. */
export const LOCALES = raw.locales.filter((l) => l.enabled);
export const DEFAULT_LOCALE = raw.default;
/** 글의 원본이 되는 언어 (번역이 비면 여기로 떨어진다). */
export const SOURCE_LOCALE = (raw.locales.find((l) => l.source) || { code: raw.default }).code;

export function meta(code) {
  const hit = raw.locales.find((l) => l.code === code);
  if (!hit) throw new Error(`[locales] 등록에 없는 언어: ${code} — data/locales.json 확인`);
  return hit;
}

/** 언어 앞머리를 붙인 주소. 기본 언어는 앞머리가 없다(기존 주소를 안 깬다). */
export function localizedPath(bare, code) {
  const p = meta(code).prefix;
  return p ? p + bare : bare;
}

/** 한 화면의 모든 언어 주소 — hreflang·사이트맵이 쓴다. */
export function alternates(bare) {
  return LOCALES.map((l) => ({ code: l.code, hreflang: l.htmlLang, path: localizedPath(bare, l.code) }));
}

/**
 * head 에 넣을 hreflang 줄들.
 *
 * `x-default` 를 반드시 같이 넣는다 — 어느 언어도 안 맞는 사람에게 무엇을 보여 줄지 정하는
 * 줄이고, 이게 빠지면 검색엔진이 임의로 고른다. 그리고 **모든 언어 판이 서로를 다 가리켜야**
 * 한다(왕복 표시). 한쪽만 가리키면 통째로 무시된다 — 다국어 사이트가 제일 흔하게 틀리는 곳이다.
 */
export function hreflangTags(bare, site) {
  const rows = alternates(bare).map(
    (a) => `    <link rel="alternate" hreflang="${a.hreflang}" href="${site}${a.path}">`
  );
  rows.push(`    <link rel="alternate" hreflang="x-default" href="${site}${localizedPath(bare, DEFAULT_LOCALE)}">`);
  return rows.join('\n');
}
