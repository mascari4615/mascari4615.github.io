/**
 * 캔버스로 그리는 방송들.
 *
 * 한때 여기 다섯이 있었다 — 별밭·어항·뜰·나방·섬(@EmojiAquarium·@unicode_garden·
 * mothgenerator·Uncharted Atlas 계보). 넷은 걷어냈다: **매력적이지 않다**는 판단
 * (사용자, 2026-08-09). 남긴 것은 별밭 하나다. 이 도구의 중심은 그림이 아니라 **글자**이고,
 * 별밭은 그 사이에서 숨 돌리는 자리로만 남는다.
 *
 * 눈금과 종도 여기 있다. 둘은 글자 방송인데 글자로 그리면 망가져서(블록문자는 폰트마다
 * 칸이 어긋나고, 「BONG」은 적어 봐야 소리가 안 난다) 몸통만 캔버스로 옮긴 것이다.
 *
 * 규칙 하나: `paint` 는 **순수 함수**다. 같은 난수 수열이면 같은 그림이 나와야 한다.
 * 시각·랜덤을 안에서 새로 뽑으면 되감기가 그 자리에서 거짓말이 된다.
 */
import type { Channel, Ink, Paint } from './core';
import { MINUTE, rngFor } from './core';
import { t, loadNamespace } from '../../lib/i18n';

/* ── 붓 몇 자루 ────────────────────────────────────────────── */

/** 색을 흐리게 — 테마 색을 그대로 쓰되 농도만 바꾼다(자체 hex 를 안 박기 위해). */
function fade(c: CanvasRenderingContext2D, color: string, alpha: number): string {
  c.save();
  c.fillStyle = color;
  const resolved = c.fillStyle as string;
  c.restore();
  if (resolved.startsWith('#') && resolved.length === 7) {
    const n = parseInt(resolved.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return resolved;
}

function between(rand: () => number, lo: number, hi: number): number {
  return lo + rand() * (hi - lo);
}

/* ── 별밭 — @tiny_star_field ────────────────────────────────── */

const starPaint =
  (count: number, nebula: boolean): Paint =>
  (c, w, h, rand, ink) => {
    c.fillStyle = ink.bg;
    c.fillRect(0, 0, w, h);

    if (nebula) {
      const g = c.createRadialGradient(
        between(rand, 0.2, 0.8) * w,
        between(rand, 0.2, 0.8) * h,
        0,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.6
      );
      g.addColorStop(0, fade(c, ink.accent, 0.22));
      g.addColorStop(1, fade(c, ink.accent, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }

    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = between(rand, 0.4, 1.7);
      const bright = between(rand, 0.25, 1);
      c.fillStyle = fade(c, bright > 0.85 ? ink.accent : ink.fg, bright);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      /* 밝은 별 몇 개만 십자 광채 — 다 주면 별밭이 아니라 반짝이 종이가 된다. */
      if (bright > 0.93) {
        c.strokeStyle = fade(c, ink.fg, 0.5);
        c.lineWidth = 0.6;
        const s = r * 4;
        c.beginPath();
        c.moveTo(x - s, y);
        c.lineTo(x + s, y);
        c.moveTo(x, y - s);
        c.lineTo(x, y + s);
        c.stroke();
      }
    }
  };

export const starfield: Channel = {
  id: 'starfield',
  name: t('pulse.t11', undefined, '별밭'),
  glyph: '✦',
  period: 15 * MINUTE,
  tile: 'wide',
  blurb: t('pulse.t12', undefined, '15분마다 밤하늘 한 장면. 밝은 별 몇 개만 십자 광채를 낸다.'),
  lineage: t('pulse.t13', undefined, '@tiny_star_field'),
  beat(tick) {
    const r = rngFor('starfield/spec', tick);
    const count = 30 + Math.floor(r() * 90);
    const nebula = r() < 0.35;
    return {
      line: `별 ${count}개${nebula ? t('pulse.t14') : ''}`,
      sub: nebula ? t('pulse.t15') : t('pulse.t16'),
      paint: starPaint(count, nebula)
    };
  }
};

/** 눈금 막대 — 글자 대신 진짜 사각형. 칸이 어긋날 여지가 없다. */
export const gaugePaint =
  (rows: ReadonlyArray<readonly [string, number]>): Paint =>
  (c, w, h, _rand, ink) => {
    c.fillStyle = ink.bg;
    c.fillRect(0, 0, w, h);
    const pad = 8;
    const rowH = h / rows.length;
    const labelW = Math.min(34, w * 0.22);
    const valueW = 42;
    const size = Math.max(9, Math.min(12, rowH * 0.42));
    c.font = `${size}px sans-serif`;
    c.textBaseline = 'middle';

    rows.forEach(([label, ratio], i) => {
      const y = i * rowH + rowH / 2;
      c.textAlign = 'left';
      c.fillStyle = fade(c, ink.dim, 1);
      c.fillText(label, pad, y);

      const x0 = pad + labelW;
      const barW = Math.max(10, w - x0 - valueW - pad);
      c.fillStyle = fade(c, ink.fg, 0.14);
      c.fillRect(x0, y - 4, barW, 8);
      c.fillStyle = fade(c, ink.accent, 0.95);
      c.fillRect(x0, y - 4, barW * Math.min(1, Math.max(0, ratio)), 8);

      c.textAlign = 'right';
      c.fillStyle = fade(c, ink.fg, 0.9);
      c.font = `${size}px var(--font-mono, monospace)`;
      c.fillText(`${(ratio * 100).toFixed(1)}%`, w - pad, y);
      c.font = `${size}px sans-serif`;
    });
  };

/** 종 — 시각 수만큼 파문이 퍼진다. 소리를 못 듣는 사람에게도 「몇 번」이 보이게. */
export const bellPaint =
  (times: number): Paint =>
  (c, w, h, _rand, ink) => {
    c.fillStyle = ink.bg;
    c.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.56;
    const s = Math.min(w, h) * 0.2;

    // 파문 — 친 횟수만큼
    for (let i = 0; i < times; i++) {
      const rr = s * (1.15 + i * 0.42);
      c.strokeStyle = fade(c, ink.accent, 0.55 - i * 0.035);
      c.lineWidth = 1.1;
      c.beginPath();
      c.arc(cx, cy, rr, 0, Math.PI * 2);
      c.stroke();
    }

    // 종 몸통 — 위는 좁고 아래는 벌어진다
    c.fillStyle = fade(c, ink.fg, 0.85);
    c.beginPath();
    c.moveTo(cx - s * 0.72, cy + s * 0.62);
    c.quadraticCurveTo(cx - s * 0.6, cy - s * 0.72, cx, cy - s * 0.8);
    c.quadraticCurveTo(cx + s * 0.6, cy - s * 0.72, cx + s * 0.72, cy + s * 0.62);
    c.closePath();
    c.fill();
    c.fillRect(cx - s * 0.86, cy + s * 0.62, s * 1.72, s * 0.16);
    // 추
    c.beginPath();
    c.arc(cx, cy + s * 0.9, s * 0.15, 0, Math.PI * 2);
    c.fill();
    // 손잡이
    c.strokeStyle = fade(c, ink.fg, 0.85);
    c.lineWidth = Math.max(1.5, s * 0.1);
    c.beginPath();
    c.arc(cx, cy - s * 0.86, s * 0.14, Math.PI, 0);
    c.stroke();

    c.font = `600 ${Math.max(11, s * 0.5)}px sans-serif`;
    c.textAlign = 'center';
    c.fillStyle = fade(c, ink.dim, 1);
    c.fillText(t('pulse.art.times', { n: times }), cx, h - 8);
  };

export const ART_CHANNELS: readonly Channel[] = [starfield];

export type { Ink };
