/**
 * 놀이끼리 오가는 줄 (TASK-KL-089)
 *
 * 놀이가 셋이 되면서 서로 오갈 길이 없었다 — 하나를 끝내면 거기서 끊긴다.
 * 모든 놀이 페이지의 같은 자리에 같은 줄을 박아, 어디서든 다른 놀이로 바로 건너가게 한다.
 *
 * 목록은 `apps/play/games.json` 하나뿐이다. 페이지마다 손으로 적으면 곧 갈라진다 —
 * 그래서 각 놀이의 빌드가 이 함수를 불러 **찍어 넣는다**(실행 시 받아오지 않는다: 스크립트를
 * 안 돌리는 크롤러와 사람에게도 길이 보여야 한다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function games() {
  return JSON.parse(fs.readFileSync(path.join(here, 'games.json'), 'utf8')).games;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `current` 는 지금 페이지의 놀이 id — 그 칸은 링크가 아니라 표시로 둔다. */
export function stripHtml(current) {
  const items = games()
    .map((g) =>
      g.id === current
        ? `<span class="play-strip-now" aria-current="page">${esc(g.emoji)} ${esc(g.title)}</span>`
        : `<a href="${esc(g.url)}">${esc(g.emoji)} ${esc(g.title)}</a>`,
    )
    .join('');
  return `<nav class="play-strip" aria-label="놀이 바꾸기">${items}<a class="play-strip-all" href="/karmolab/play/">놀이터</a></nav>`;
}

/** 페이지 HTML 안의 표식 자리에 줄을 박는다. 표식이 없으면 알려 준다(조용히 넘기지 않는다). */
export function stampStrip(html, current) {
  const re = /<!-- PLAY_STRIP -->[\s\S]*?<!-- \/PLAY_STRIP -->/;
  if (!re.test(html)) return { html, ok: false };
  return { html: html.replace(re, `<!-- PLAY_STRIP -->${stripHtml(current)}<!-- /PLAY_STRIP -->`), ok: true };
}

export const STRIP_CSS = `
.play-strip { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0 0 1rem; font-size: 0.82rem; }
.play-strip a, .play-strip-now {
  display: inline-flex; align-items: center; min-height: 34px; padding: 0 0.7rem;
  border: 1px solid #33333d; border-radius: 999px; text-decoration: none; color: #b9b9b2;
}
.play-strip a:hover, .play-strip a:focus-visible { color: #f2f2ee; border-color: #8b8b85; }
.play-strip-now { background: #d4a849; color: #17171c; border-color: #d4a849; font-weight: 700; }
.play-strip-all { color: #8b8b85; }
`;
