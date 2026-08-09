/**
 * 그림 방송 — 캔버스에 직접 그린다.
 *
 * 이 갈래에서 오래 사랑받은 것들은 거의 다 **그림**이다:
 *   @tiny_star_field(상상 우주의 한 귀퉁이) · @EmojiAquarium(작은 어항) ·
 *   @unicode_garden(유니코드 뜰) · mothgenerator(없는 나방 도감) · Uncharted Atlas(없는 나라 지도).
 *
 * 처음엔 이걸 블록문자(░▒▓)로 흉내 냈다가 걷어냈다 — 뭘 그린 건지 안 보이고,
 * 글자 폭이 폰트마다 달라 칸이 어긋났다(사용자 지적, 2026-08-09). 그림은 그림으로 그린다.
 *
 * 규칙 하나: `paint` 는 **순수 함수**다. 같은 난수 수열이면 같은 그림이 나와야 한다.
 * 시각·랜덤을 안에서 새로 뽑으면 되감기가 그 자리에서 거짓말이 된다.
 */
import type { Channel, Ink, Paint } from './core';
import { DAY, HOUR, MINUTE, pick, rngFor } from './core';

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

/** 부드러운 1차원 값 잡음 — 해안선·언덕처럼 「자연스럽게 울퉁불퉁한 것」에 쓴다. */
function noise1(rand: () => number, count: number, octaves = 3): number[] {
  const out = new Array<number>(count).fill(0);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const steps = 3 * Math.pow(2, o);
    const knots = Array.from({ length: steps }, () => rand() * 2 - 1);
    for (let i = 0; i < count; i++) {
      const t = (i / count) * steps;
      const a = knots[Math.floor(t) % steps];
      const b = knots[(Math.floor(t) + 1) % steps];
      const f = t - Math.floor(t);
      const s = f * f * (3 - 2 * f);
      out[i] += (a + (b - a) * s) * amp;
    }
    total += amp;
    amp *= 0.5;
  }
  return out.map((v) => v / total);
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
  name: '별밭',
  glyph: '✦',
  period: 15 * MINUTE,
  tile: 'wide',
  blurb: '15분마다 상상 우주의 한 귀퉁이.',
  lineage: '@tiny_star_field (Katie Rose Pipkin) — 작은 우주 한 조각',
  beat(tick) {
    const r = rngFor('starfield/spec', tick);
    const count = 30 + Math.floor(r() * 90);
    const nebula = r() < 0.35;
    return {
      line: `별 ${count}개${nebula ? ' · 성운 하나' : ''}`,
      sub: nebula ? '멀리 성운이 걸려 있다' : '아무 일도 없는 하늘',
      paint: starPaint(count, nebula)
    };
  }
};

/* ── 어항 — @EmojiAquarium ─────────────────────────────────── */

const FISH_SHAPES = ['둥근', '납작한', '길쭉한', '작은', '커다란'] as const;

const aquariumPaint =
  (fish: number, weed: number, shell: boolean): Paint =>
  (c, w, h, rand, ink) => {
    /* 물 — 위가 밝고 아래가 어둡다. 이 한 겹이 「물속」을 만든다. */
    const water = c.createLinearGradient(0, 0, 0, h);
    water.addColorStop(0, fade(c, ink.accent, 0.2));
    water.addColorStop(1, fade(c, ink.accent, 0.05));
    c.fillStyle = ink.bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = water;
    c.fillRect(0, 0, w, h);

    const floor = h * 0.86;

    // 수초 — 바닥에서 흔들리며 올라간다
    for (let i = 0; i < weed; i++) {
      const x = between(rand, 0.05, 0.95) * w;
      const tall = between(rand, 0.25, 0.6) * h;
      const sway = between(rand, -14, 14);
      c.strokeStyle = fade(c, ink.fg, between(rand, 0.25, 0.5));
      c.lineWidth = between(rand, 1.2, 2.6);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x, floor);
      c.quadraticCurveTo(x + sway, floor - tall * 0.6, x + sway * 1.6, floor - tall);
      c.stroke();
    }

    // 물고기 — 몸통 타원 + 꼬리 삼각. 이 둘이면 물고기로 읽힌다.
    for (let i = 0; i < fish; i++) {
      const x = between(rand, 0.12, 0.88) * w;
      const y = between(rand, 0.15, 0.78) * h;
      const len = between(rand, 9, 20);
      const dir = rand() < 0.5 ? -1 : 1;
      const hue = fade(c, rand() < 0.4 ? ink.accent : ink.fg, between(rand, 0.55, 0.95));
      c.fillStyle = hue;
      c.beginPath();
      c.ellipse(x, y, len, len * between(rand, 0.4, 0.6), 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(x - dir * len, y);
      c.lineTo(x - dir * len * 1.7, y - len * 0.45);
      c.lineTo(x - dir * len * 1.7, y + len * 0.45);
      c.closePath();
      c.fill();
      c.fillStyle = ink.bg;
      c.beginPath();
      c.arc(x + dir * len * 0.45, y - len * 0.12, Math.max(1, len * 0.1), 0, Math.PI * 2);
      c.fill();
    }

    // 기포
    for (let i = 0; i < 9; i++) {
      c.strokeStyle = fade(c, ink.fg, 0.3);
      c.lineWidth = 0.8;
      c.beginPath();
      c.arc(between(rand, 0.05, 0.95) * w, between(rand, 0.05, 0.8) * h, between(rand, 1, 2.8), 0, Math.PI * 2);
      c.stroke();
    }

    // 자갈 바닥
    c.fillStyle = fade(c, ink.fg, 0.22);
    c.fillRect(0, floor, w, h - floor);
    for (let i = 0; i < 26; i++) {
      c.fillStyle = fade(c, ink.fg, between(rand, 0.1, 0.35));
      c.beginPath();
      c.arc(rand() * w, floor + rand() * (h - floor), between(rand, 1.2, 3.4), 0, Math.PI * 2);
      c.fill();
    }
    if (shell) {
      const sx = between(rand, 0.15, 0.85) * w;
      c.strokeStyle = fade(c, ink.accent, 0.85);
      c.lineWidth = 1.4;
      for (let i = 1; i <= 4; i++) {
        c.beginPath();
        c.arc(sx, floor + 2, i * 2.4, Math.PI, 0);
        c.stroke();
      }
    }
  };

export const aquarium: Channel = {
  id: 'aquarium',
  name: '어항',
  glyph: '🐟',
  period: 30 * MINUTE,
  tile: 'wide',
  blurb: '30분마다 작은 어항 하나. 같은 어항은 두 번 안 온다.',
  lineage: '@EmojiAquarium (Joe Sondow) — 무작위로 꾸며지는 작은 어항',
  beat(tick) {
    const r = rngFor('aquarium/spec', tick);
    const fish = 1 + Math.floor(r() * 5);
    const weed = 2 + Math.floor(r() * 6);
    const shell = r() < 0.4;
    const shape = pick(r, FISH_SHAPES);
    return {
      line: `${shape} 물고기 ${fish}마리 · 수초 ${weed}포기${shell ? ' · 소라 하나' : ''}`,
      sub: '아무도 안 키우는 어항',
      paint: aquariumPaint(fish, weed, shell)
    };
  }
};

/* ── 뜰 — @unicode_garden ──────────────────────────────────── */

const FLOWERS = ['수레국화', '민들레', '개양귀비', '패랭이', '금계국', '달맞이꽃', '토끼풀'] as const;

const gardenPaint =
  (blades: number, blooms: number): Paint =>
  (c, w, h, rand, ink) => {
    c.fillStyle = ink.bg;
    c.fillRect(0, 0, w, h);
    const soil = h * 0.88;

    for (let i = 0; i < blades; i++) {
      const x = rand() * w;
      const tall = between(rand, 0.2, 0.55) * h;
      const lean = between(rand, -18, 18);
      c.strokeStyle = fade(c, ink.fg, between(rand, 0.2, 0.45));
      c.lineWidth = between(rand, 0.8, 1.8);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x, soil);
      c.quadraticCurveTo(x + lean * 0.4, soil - tall * 0.6, x + lean, soil - tall);
      c.stroke();
    }

    for (let i = 0; i < blooms; i++) {
      const x = between(rand, 0.08, 0.92) * w;
      const tall = between(rand, 0.35, 0.7) * h;
      const lean = between(rand, -10, 10);
      const top = soil - tall;
      c.strokeStyle = fade(c, ink.fg, 0.55);
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(x, soil);
      c.quadraticCurveTo(x + lean, soil - tall * 0.5, x + lean, top);
      c.stroke();
      // 잎
      c.beginPath();
      c.ellipse(x + lean * 0.6 + 4, soil - tall * 0.45, 5, 2.2, -0.5, 0, Math.PI * 2);
      c.fillStyle = fade(c, ink.fg, 0.4);
      c.fill();
      // 꽃잎
      const petals = 5 + Math.floor(rand() * 3);
      const rad = between(rand, 3.5, 6);
      c.fillStyle = fade(c, rand() < 0.5 ? ink.accent : ink.fg, 0.9);
      for (let p = 0; p < petals; p++) {
        const a = (p / petals) * Math.PI * 2;
        c.beginPath();
        c.ellipse(x + lean + Math.cos(a) * rad, top + Math.sin(a) * rad, rad * 0.7, rad * 0.45, a, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = ink.bg;
      c.beginPath();
      c.arc(x + lean, top, rad * 0.42, 0, Math.PI * 2);
      c.fill();
    }

    c.fillStyle = fade(c, ink.fg, 0.18);
    c.fillRect(0, soil, w, h - soil);
  };

export const garden: Channel = {
  id: 'garden',
  name: '뜰',
  glyph: '🌱',
  period: HOUR,
  tile: 'wide',
  blurb: '한 시간마다 아무도 안 심은 뜰 한 뼘.',
  lineage: '@unicode_garden — 유니코드로 자란 작은 뜰',
  beat(tick) {
    const r = rngFor('garden/spec', tick);
    const blades = 18 + Math.floor(r() * 40);
    const blooms = 1 + Math.floor(r() * 6);
    const kind = pick(r, FLOWERS);
    return {
      line: `${kind} ${blooms}송이 · 풀 ${blades}포기`,
      sub: '아무도 안 심었는데 자랐다',
      paint: gardenPaint(blades, blooms)
    };
  }
};

/* ── 나방 — mothgenerator ─────────────────────────────────── */

const MOTH_A = ['밤', '은', '재', '먼', '흰', '검', '들', '물', '돌', '눈', '별', '숯'] as const;
const MOTH_B = ['그늘', '비늘', '가루', '무늬', '날개', '더듬', '이슬', '서리', '연기', '자락'] as const;

const mothPaint =
  (bands: number, eyespots: boolean, span: number): Paint =>
  (c, w, h, rand, ink) => {
    c.fillStyle = ink.bg;
    c.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.52;
    const s = Math.min(w, h) * span;

    /* 한쪽만 뽑고 거울로 접는다 — 나방이 나방으로 보이는 이유의 거의 전부가 좌우대칭이다. */
    const wing = (upper: boolean): Array<[number, number]> => {
      const pts: Array<[number, number]> = [];
      const steps = 7;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = (upper ? -0.15 : 0.35) + t * (upper ? 1.15 : 0.9);
        const rr = s * (upper ? 1 : 0.72) * (0.55 + 0.45 * Math.sin(t * Math.PI)) * between(rand, 0.9, 1.12);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      return pts;
    };

    for (const upper of [true, false]) {
      const pts = wing(upper);
      for (const side of [1, -1]) {
        c.beginPath();
        c.moveTo(cx, cy);
        for (const [x, y] of pts) c.lineTo(cx + side * x, cy + y);
        c.closePath();
        c.fillStyle = fade(c, ink.fg, upper ? 0.5 : 0.36);
        c.fill();
        c.strokeStyle = fade(c, ink.fg, 0.7);
        c.lineWidth = 1;
        c.stroke();

        // 날개 띠무늬
        c.save();
        c.clip();
        for (let b = 0; b < bands; b++) {
          const t = (b + 1) / (bands + 1);
          c.strokeStyle = fade(c, b % 2 ? ink.accent : ink.bg, 0.55);
          c.lineWidth = s * 0.06;
          c.beginPath();
          c.arc(cx, cy, s * t * (upper ? 1 : 0.75), 0, Math.PI * 2);
          c.stroke();
        }
        if (eyespots && upper) {
          const ex = cx + side * s * 0.55;
          const ey = cy - s * 0.18;
          c.fillStyle = fade(c, ink.accent, 0.9);
          c.beginPath();
          c.arc(ex, ey, s * 0.11, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = ink.bg;
          c.beginPath();
          c.arc(ex, ey, s * 0.05, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      }
    }

    // 몸통·더듬이
    c.fillStyle = fade(c, ink.fg, 0.92);
    c.beginPath();
    c.ellipse(cx, cy + s * 0.1, s * 0.09, s * 0.42, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = fade(c, ink.fg, 0.8);
    c.lineWidth = 1.2;
    for (const side of [1, -1]) {
      c.beginPath();
      c.moveTo(cx, cy - s * 0.3);
      c.quadraticCurveTo(cx + side * s * 0.25, cy - s * 0.62, cx + side * s * 0.42, cy - s * 0.5);
      c.stroke();
    }
  };

export const moth: Channel = {
  id: 'moth',
  name: '나방',
  glyph: '🦋',
  period: 6 * HOUR,
  tile: 'big',
  blurb: '여섯 시간마다 존재하지 않는 나방 한 마리.',
  lineage: 'mothgenerator (Katie Rose Pipkin · Loren Schmidt) — 없는 나방의 도감',
  beat(tick) {
    const r = rngFor('moth/spec', tick);
    const name = `${pick(r, MOTH_A)}${pick(r, MOTH_B)}나방`;
    const bands = 2 + Math.floor(r() * 4);
    const eyespots = r() < 0.45;
    const span = between(r, 0.3, 0.4);
    return {
      line: name,
      sub: `띠 ${bands}겹${eyespots ? ' · 눈알무늬 있음' : ''} · 아직 아무도 못 잡았다`,
      paint: mothPaint(bands, eyespots, span)
    };
  }
};

/* ── 섬 — Uncharted Atlas ─────────────────────────────────── */

const ISLE_A = ['카', '두', '미', '테', '노', '사', '브', '이', '헬', '오', '루', '진'] as const;
const ISLE_B = ['르', '반', '샤', '트', '리', '무', '카', '델', '펜', '아'] as const;
const ISLE_C = ['섬', '군도', '반도', '곶', '만'] as const;

const islePaint =
  (rough: number, name: string): Paint =>
  (c, w, h, rand, ink) => {
    c.fillStyle = fade(c, ink.accent, 0.1); // 바다
    c.fillRect(0, 0, w, h);

    // 경위선 — 이게 있어야 「그림」이 아니라 「지도」로 읽힌다
    c.strokeStyle = fade(c, ink.fg, 0.08);
    c.lineWidth = 0.6;
    for (let x = 0; x < w; x += 26) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    for (let y = 0; y < h; y += 26) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }

    const cx = w / 2;
    const cy = h * 0.5;
    const base = Math.min(w, h) * 0.34;
    const steps = 220;
    const squash = 0.78;

    /* 등고선마다 **다른** 잡음을 쓴다. 한 벌을 크기만 줄여 쓰면 완전한 동심원이 나오는데,
       그건 섬이 아니라 소용돌이로 보인다(처음에 그렇게 나왔다). 실제 지형은 안으로 갈수록
       봉우리가 한쪽으로 쏠린다 — 그래서 잡음도 갈고, 중심도 조금씩 민다. */
    const layers = [1, 0.8, 0.62, 0.45, 0.28];
    const wobs = layers.map(() => noise1(rand, steps, 4));
    const drift = layers.map(() => [between(rand, -0.12, 0.12), between(rand, -0.12, 0.12)]);

    const ring = (k: number, scale = layers[k]): Array<[number, number]> =>
      Array.from({ length: steps }, (_, i) => {
        const a = (i / steps) * Math.PI * 2;
        const rr = base * scale * (1 + wobs[k][i] * rough);
        return [
          cx + Math.cos(a) * rr + drift[k][0] * base * (1 - scale),
          cy + Math.sin(a) * rr * squash + drift[k][1] * base * (1 - scale)
        ] as [number, number];
      });

    const trace = (pts: Array<[number, number]>): void => {
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) c.lineTo(x, y);
      c.closePath();
    };

    // 얕은 여울 — 해안 바깥 한 겹
    trace(ring(0, layers[0] * 1.1));
    c.fillStyle = fade(c, ink.accent, 0.18);
    c.fill();

    // 뭍 + 안으로 갈수록 밝아지는 고도
    for (let k = 0; k < layers.length; k++) {
      trace(ring(k));
      c.fillStyle = fade(c, ink.fg, 0.1 + k * 0.05);
      c.fill();
      c.strokeStyle = fade(c, ink.fg, k === 0 ? 0.9 : 0.3);
      c.lineWidth = k === 0 ? 1.4 : 0.7;
      c.stroke();
    }

    /* 강 — 봉우리에서 바다 쪽으로 흘러 내려간다 (반대로 그리면 물이 산으로 간다).
       해안선 안으로 가둔다. 안 가두면 강이 바다 위를 가로질러 뻗는다(그렇게 나왔었다). */
    c.save();
    trace(ring(0));
    c.clip();
    const a0 = rand() * Math.PI * 2;
    c.strokeStyle = fade(c, ink.accent, 0.9);
    c.lineWidth = 1.4;
    c.lineJoin = 'round';
    c.beginPath();
    let px = cx + drift[4][0] * base;
    let py = cy + drift[4][1] * base;
    c.moveTo(px, py);
    for (let i = 1; i <= 7; i++) {
      const a = a0 + between(rand, -0.45, 0.45);
      px += Math.cos(a) * (base / 5.5);
      py += Math.sin(a) * (base / 5.5) * squash;
      c.lineTo(px, py);
    }
    c.stroke();
    c.restore();

    // 이름표 — 지도에는 이름이 붙는다
    c.font = `600 ${Math.max(10, Math.min(15, w / 16))}px sans-serif`;
    c.textAlign = 'center';
    c.fillStyle = fade(c, ink.fg, 0.95);
    c.fillText(name, cx, h - 10);
  };

export const isle: Channel = {
  id: 'isle',
  name: '섬',
  glyph: '🗺',
  period: DAY,
  local: true,
  tile: 'big',
  blurb: '하루에 하나, 없는 나라의 지도.',
  lineage: 'Uncharted Atlas (Martin O’Leary) — 존재하지 않는 땅의 지도',
  beat(tick) {
    const r = rngFor('isle/spec', tick);
    const name = `${pick(r, ISLE_A)}${pick(r, ISLE_B)}${r() < 0.4 ? pick(r, ISLE_B) : ''} ${pick(r, ISLE_C)}`;
    const rough = between(r, 0.28, 0.6);
    const people = Math.floor(between(r, 0, 40000));
    return {
      line: name,
      sub: people < 200 ? '사람은 살지 않는다' : `사는 사람 ${people.toLocaleString()}명`,
      paint: islePaint(rough, name)
    };
  }
};

/* ── 그림 방송은 아니지만 그려야 하는 둘 ───────────────────────
   눈금과 종은 「무엇을 뱉느냐」로 보면 글자 방송인데, 글자로 그리면 망가진다:
   눈금 막대를 블록문자(▓░)로 찍으면 폰트마다 칸이 어긋나 뭉개지고,
   종은 「BONG」이라고 적어 봐야 소리가 안 난다. 그래서 몸통만 캔버스로 옮긴다. */

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
    c.fillText(`${times}번`, cx, h - 8);
  };

export const ART_CHANNELS: readonly Channel[] = [starfield, aquarium, garden, moth, isle];

export type { Ink };
