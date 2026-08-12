/**
 * 분열 — 하나가 갈라져 여럿이 되고, 그 여럿이 같은 모양을 이룬다 (TASK-KL-247)
 *
 * 사용자: "하나만 있다가 자가복제 해서 (분열) 늘어나서 구성하는 걸 원했다",
 *         "화면이 점점 축소되면서 그 모양이 자기 증식하다가 또 큰 모양이 되고",
 *         "모양은 그냥 네모네모로. 점이나."
 *
 * 그래서 셋을 지킨다:
 *   ① **물러난다**(축소)가 기본. 처음엔 반대로 박아 뒀다 — 내 실수였다.
 *   ② **분열이 눈에 보인다.** 칸마다 놓인 도형이 처음엔 부모 한가운데 겹쳐 있어 *하나*로
 *      보이고, 거기서 갈라져 제자리로 퍼지며 부모와 같은 모양을 이룬다.
 *   ③ 그리는 것은 **맨 도형**(네모·점·십자). 로고는 획이 얇아 잘아지면 뭉개졌고, 한 장에
 *      수천 번 그리느라 무겁기까지 했다.
 *
 * ── 어떻게 이음매가 없나 ──────────────────────────────────────────────
 * 도형을 k×k 칸에 대고 잉크가 닿는 칸만 남긴다(`mask`). 그 칸마다 도형 전체를 1/k 로 넣는다
 * = 도형으로 지은 도형. 무한히 반복한 도형 S 는 「어떤 칸 f 안의 S 를 k 배 확대한 것」과 같다.
 * 그래서 칸 f 로 파고드는 확대의 고정점 p* 를 화면 한가운데 두고 배율만 k 배로 밀면, 한 주기
 * 뒤 그림이 시작과 **픽셀 단위로 같다**. p* = f.origin·k/(k−1) — 한 줄로 나온다.
 *
 * ── 분열도 「지금 몇 픽셀인가」의 함수다 ──────────────────────────────
 * 갈라지는 정도를 시간이나 깊이의 함수로 두면 거기서 이음매가 생긴다(깊이는 한 주기마다 한
 * 칸씩 밀린다). 그래서 **칸이 화면에서 차지하는 픽셀 크기**로만 정한다. 물러나는 동안 칸은
 * 계속 잘아지므로, 「잘아질수록 퍼진다」로 두면 저절로 분열로 보인다. 파고드는 쪽을 고르면
 * 반대로 「커질수록 퍼진다」가 분열이다 — 그래서 방향에 따라 자를 뒤집는다.
 *
 * ── 비용 ──────────────────────────────────────────────────────────────
 * 화면 밖은 가지째 자르고, 칸이 `minCell` 픽셀보다 잘아지면 더 안 파고든다. 낱장도 `fillRect`
 * 몇 번이라 싸다(로고 시절엔 획 다섯 + save/restore 였다).
 */
import { smooth01, hash01, type Piece, type Stage, type ParamValues } from './pieces';

const TAU = Math.PI * 2;
/** 도형을 재는 자 — 24 칸 상자 안에 그린다. */
const VB = 24;

/**
 * 바탕은 단색이 아니라 **두 톤**이다 — 가운데가 조금 트여 있고 가장자리로 갈수록 짙어진다.
 * 단색 검정 위에 낟알만 있으면 「스크린세이버」가 아니라 「디버그 화면」처럼 보인다.
 * `bg` 는 가장자리(위젯 바탕과 이어지는 색), `glow` 는 한가운데다.
 */
const PALETTES: Record<string, { bg: string; glow: string; ink: string }> = {
  gold: { bg: '#07080c', glow: '#171a26', ink: '#e0b45a' },
  mono: { bg: '#070707', glow: '#1b1b1b', ink: '#efefef' },
  deep: { bg: '#020a10', glow: '#0b2430', ink: '#63dbcf' },
  dusk: { bg: '#0f060f', glow: '#2a1028', ink: '#ea86ab' }
};

/**
 * 낟알 한 개를 그리는 법.
 *
 * 예전엔 도형의 실루엣에서 칸을 뽑았다(네모 테두리 → 테두리 칸들). 그건 반듯해서 금방
 * 지루하고, 무엇보다 **자로 잰 듯 대칭**이라 「자란 것」으로 안 보였다. 이제 실루엣은
 * 씨앗에서 자란 덩어리가 정하고, 낟알은 단순할수록 좋다 — 낟알이 복잡하면 덩어리 모양이
 * 안 읽힌다.
 */
interface Shape {
  /** (x,y) = 칸의 왼쪽 위, size = 칸 한 변 */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, gap: number): void;
}

/**
 * 낟알 사이 틈은 **0 이다.** 조금이라도 벌려 두면 「다 자란 것 = 통짜 네모」가 깨져서, 낟알
 * 하나로 갈아 끼우는 자리에서 그림이 튄다. 낟알이 갈라져 보이는 것은 틈이 아니라 **아직 안
 * 찬 자리** 덕분이다 — 다 차면 한 덩이가 되는 게 맞다.
 */
/** 링 낟알의 테두리 두께 (낟알 크기 대비) */
const RING = 0.26;

const SHAPES: Record<string, Shape> = {
  /** 네모 (각지게 — 모서리를 굴리면 물러났을 때 죄다 동글동글해서 흐리멍덩하다) */
  square: {
    draw(ctx, x, y, size, gap) {
      const o = (size * gap) / 2;
      ctx.fillRect(x + o, y + o, size - o * 2, size - o * 2);
    }
  },

  /** 점 */
  dot: {
    draw(ctx, x, y, size, gap) {
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, (size * (1 - gap)) / 2, 0, TAU);
      ctx.fill();
    }
  },

  /** 링 — 속이 빈 동그라미 */
  ring: {
    draw(ctx, x, y, size, gap) {
      const g = size * (1 - gap);
      ctx.lineWidth = g * RING;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, (g - g * RING) / 2, 0, TAU);
      ctx.stroke();
    }
  }
};

interface Cell {
  col: number;
  row: number;
}

interface Mask {
  cells: Cell[];
  /** 확대가 파고드는 칸 */
  f: Cell;
  /** 그 칸이 `cells` 의 몇 번째인가 */
  fi: number;
  /** 칸마다: 몇 번째로 자랐나 (씨앗 = 0). 번지는 차례가 곧 자란 차례다 */
  seq: Int16Array;
  /** 칸마다: 나를 틔운 이웃 칸의 번호 (씨앗은 자기 자신) */
  via: Int16Array;
  /** 그 칸의 왼쪽 위 (0..1) */
  fx: number;
  fy: number;
}

const maskCache = new Map<string, Mask>();

/**
 * 칸을 채우는 **순서**를 만든다 — 가운데 한 칸에서 이웃으로 아무렇게나 번져 나가는 차례다.
 *
 * 이 순서가 두 몫으로 갈린다:
 *   ① 앞의 `blobSize(k)` 개 = **작품이 보여 주는 불규칙한 덩어리**. 거의 모든 시간 동안
 *      화면에 보이는 건 여기까지다. 곰팡이처럼 들쭉날쭉하고 매번 다르다.
 *   ② 나머지 = **마지막에만 채워지는 자리**. 칸이 아주 잘아져 곧 낟알 하나로 갈릴 참에만
 *      스르르 메워져 통짜 네모가 된다.
 *
 * ②가 왜 필요한가: 갈아 끼우는 순간의 그림이 같아야 하기 때문이다. 덩어리인 채로 갈리면
 * 「복잡한 덩어리 → 통짜 네모」로 뚝 바뀐다(그게 눈에 걸리던 그 점프다). 그렇다고 처음부터
 * 네모로 두면 불규칙함이 사라진다. 그래서 **평소엔 덩어리, 사라지기 직전에만 네모**다.
 */
function maskFor(k: number, gen: number, seed: number): Mask {
  const key = k + ':' + gen + ':' + Math.round(seed * 100000);
  const hit = maskCache.get(key);
  if (hit) return hit;

  const mid = (k - 1) / 2;
  const taken = new Set<number>();
  const cells: Cell[] = [];
  const via: number[] = [];
  const push = (col: number, row: number, from: number): void => {
    taken.add(row * k + col);
    via.push(from);
    cells.push({ col, row });
  };
  push(mid, mid, 0);

  /* 이웃은 상하좌우만 — 대각선까지 열면 부스러기처럼 흩어져 번지는 맛이 없다. */
  const N4 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  let pick = 0;
  const want = blobSize(k);
  while (cells.length < want) {
    const edge: Array<{ col: number; row: number; from: number }> = [];
    for (let ci = 0; ci < cells.length; ci++) {
      const c = cells[ci];
      for (const [dx, dy] of N4) {
        const col = c.col + dx;
        const row = c.row + dy;
        if (col < 0 || row < 0 || col >= k || row >= k) continue;
        if (taken.has(row * k + col)) continue;
        edge.push({ col, row, from: ci });
      }
    }
    if (!edge.length) break;
    const e = edge[Math.floor(hash01(pick++ + 1 + gen * 977, seed * 613 + 7) * edge.length) % edge.length];
    push(e.col, e.row, e.from);
  }

  const seq = new Int16Array(cells.length);
  const viaArr = new Int16Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    seq[i] = i;
    viaArr[i] = via[i];
  }

  const best = cells[0];
  const mask: Mask = { cells, f: best, fi: 0, seq, via: viaArr, fx: best.col / k, fy: best.row / k };
  if (maskCache.size > 240) {
    for (const old of maskCache.keys()) {
      maskCache.delete(old);
      if (maskCache.size <= 160) break;
    }
  }
  maskCache.set(key, mask);
  return mask;
}

/**
 * 덩어리가 차지하는 칸 수. 판(k×k)의 3 할만 쓴다 — 많이 채울수록 실루엣이 네모에 가까워져
 * 「네모가 자란다」로 보인다. 성기게 두고 판을 키워야 울퉁불퉁한 모양이 나온다.
 */
function blobSize(k: number): number {
  return Math.max(4, Math.round(k * k * 0.3));
}

/** 칸 하나가 미끄러져 자리 잡는 데 걸리는 폭 (겹칠수록 꼬리가 길다) */
const RAMP = 0.16;
/** 층과 층을 겹쳐 넘기는 구간 — 낟알 하나 ↔ 덩어리를 이 폭에서 **크로스페이드** 한다. */
const CROSS = 1.1;

/** 「도형 한 개가 화면에 딱 들어오는」 위상 (0..1) — 카메라를 거기서 늦추려고 안다. */
function fitPhaseOf(base: number, k: number, w: number, h: number): number {
  const u = Math.log((Math.min(w, h) * FIT) / base) / Math.log(k);
  return ((u % 1) + 1) % 1;
}

const EASE_AMOUNT = 0.72;

/**
 * u = w + (A/2π)·sin(2π(w − fit + 0.5)). 미분이 1 + A·cos(…) 이라 A<1 이면 늘 증가하고,
 * w 가 1 늘면 u 도 정확히 1 늘어난다 — 이음매(픽셀 동일)는 그대로인데 볼 것은 오래 본다.
 */
function fitPhase(w0: number, fit: number): number {
  return w0 + (EASE_AMOUNT / TAU) * Math.sin(TAU * (w0 - fit + 0.5));
}

/** 화면에 꽉 차는 층이 짧은 변의 몇 배인가 */
const FIT = 0.6;
const BASE_MULT = 3;
/**
 * 동시에 갈라지고 있는 낟알 수 (꼬리 길이).
 * 1 이면 한 칸씩 딱딱 끊겨 기계 같다 — 여럿이 겹쳐 나와야 번식처럼 이어진다.
 */
const OVER = 6;

export const droste: Piece = {
  id: 'droste',

  /** 첫 화면을 벽지 구간에서 열지 않으려고 — 껍데기가 이 시각부터 시작한다. */
  startTime(w: number, h: number, params: ParamValues): number {
    const k = Number(params.grid) || 5;
    const fit = fitPhaseOf(Math.hypot(w, h) * BASE_MULT, k, w, h);
    const speed = Number(params.speed) || 0.11;
    return (String(params.dir) === 'in' ? fit : 1 - fit) / speed;
  },

  params: [
    { key: 'shape', kind: 'choice', choices: ['square', 'dot', 'ring'], def: 'square' },
    { key: 'speed', kind: 'range', min: 0.02, max: 0.5, step: 0.01, def: 0.1 },
    { key: 'grid', kind: 'choice', choices: ['9', '13', '17', '21'], def: '13' },
    { key: 'palette', kind: 'choice', choices: ['gold', 'mono', 'deep', 'dusk'], def: 'gold' },
    { key: 'dir', kind: 'choice', choices: ['out', 'in'], def: 'out' }
  ],

  bg(p: ParamValues): string {
    return (PALETTES[String(p.palette)] ?? PALETTES.gold).bg;
  },

  frame(s: Stage): void {
    const { ctx, w, h } = s;
    const pal = PALETTES[String(s.params.palette)] ?? PALETTES.gold;
    const shape = SHAPES[String(s.params.shape)] ?? SHAPES.square;
    const k = Number(s.params.grid) || 5;
    const speed = Number(s.params.speed);
    const outward = String(s.params.dir) !== 'in';

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);
    {
      const halo = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.52);
      halo.addColorStop(0, pal.glow);
      halo.addColorStop(1, pal.bg);
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
    }

    const diag = Math.hypot(w, h);
    const base = diag * BASE_MULT;

    /* 더 파고들지 않는 크기. 이 하나가 한 장의 비용을 정한다 — 화면이 커지면 같이 키워
       개수가 폭발하지 않게 한다(테두리 도형은 로고보다 칸이 훨씬 촘촘하다). */
    /* 낟알이 이보다 잘아지면 더 안 쪼갠다. **아주 작게** 잡는 것이 중요하다 — 층이 바뀌는
       자리에서 낟알이 사라지는데, 그게 2~3 px 에서 일어나면 눈에 안 띈다(크게 잡으면 화면
       전체 낟알이 한꺼번에 k 배로 튄다). */
    const minCell = Math.max(3.5, diag * 0.0035);


    /* 한 주기 = 배율이 k 배 되는 동안. 그 끝이 시작과 같은 그림이라 이어 붙일 자리가 없다. */
    let w0 = (s.time * speed) % 1;
    if (w0 < 0) w0 += 1;
    // 기본은 물러나기 — 도형이 불어나 큰 도형이 되고, 화면이 뒤로 빠져 그게 다시 낟알이 된다.
    if (outward) w0 = 1 - w0;
    /* **세대 번호** — 층마다 다른 덩어리를 쓰되, 시간이 흘러 한 주기가 넘어가도 *같은 노드는
       같은 모양*이어야 한다. 주기가 넘어가면 뿌리가 한 칸 위로 올라가 깊이가 1 늘어나므로,
       `깊이 − 지나온 주기 수` 를 세대로 삼으면 그 값이 보존된다. 이러면 모양은 영원히 새것이
       나오는데(같은 그림으로 안 돌아온다) 이음매는 안 생긴다. 「매번 다른 모양」과 「한 주기 뒤
       픽셀 동일」은 같이 못 가진다 — 뒤엣것은 모든 층이 한 모양일 때만 성립한다. */
    const genBase = Math.floor(s.time * speed);

    const u = fitPhase(w0, fitPhaseOf(base, k, w, h));
    const root = base * Math.pow(k, u);
    /* 확대의 축. 덩어리는 언제나 정중앙 칸을 씨앗으로 가지므로 f.origin = ((k−1)/2)/k 이고,
       p* = f.origin·k/(k−1) = 0.5 — 정확히 도형 한가운데다. 그래서 배율이 오르내려도 모든
       층의 한가운데가 화면의 같은 점에 머문다(흔들림 0). */
    const px = 0.5;
    const py = 0.5;
    const ax = w / 2;
    const ay = h / 2;
    const ox = ax - px * root;
    const oy = ay - py * root;

    /**
     * 갈라진 정도 (0 = 씨앗 칸에 겹쳐 있어 아직 하나, 1 = 칸을 다 채움).
     *
     * **잘아질수록 퍼진다.** 카메라가 물러나면 칸은 계속 잘아지므로, 이게 곧 「물러나는 동안
     * 계속 갈라진다」가 된다. (한때 반대로 뒤집어 뒀다가 축소가 합체로 보였다 — 그건 틀렸다.)
     *
     * 뒤집을 필요가 없는 이유: 다 자란 모습이 **꽉 찬 네모**라, 가장 많이 퍼진 상태가 곧
     * 통짜 네모다. 그래서 더 못 쪼개 낟알 하나로 그리는 자리와 그림이 정확히 같다 — 옛날의
     * 「복잡한 덩어리 → 통짜 네모」 점프가 구조적으로 없다.
     */
    const split01 = (cs: number): number => 1 - smooth01((cs - minCell) / (minCell * (k - 1)));

    ctx.fillStyle = pal.ink;
    ctx.strokeStyle = pal.ink;

    const draw = (x: number, y: number, size: number, depth: number, alpha: number): void => {
      if (alpha < 0.01) return;
      if (depth > 14) return;
      if (x > w || y > h || x + size < 0 || y + size < 0) return;

      const cs = size / k;

      /* **층을 겹쳐 넘긴다.** 잘면 통짜 낟알 하나, 커지면 덩어리 — 그 사이를 알파로
         크로스페이드 한다. 기하로만 맞추려다 몇 번을 헛짚었는데, 이건 페이드가 맞다.
         `mix` 0 = 통짜 낟알만, 1 = 덩어리만. */
      const mix = smooth01((cs - minCell) / (minCell * CROSS));
      if (mix < 1) {
        ctx.globalAlpha = alpha * (1 - mix);
        shape.draw(ctx, x, y, size, 0);
      }
      if (mix <= 0.004) return;

      const mask = maskFor(k, depth - genBase, s.seed);
      const n = mask.cells.length;
      const a = split01(cs);
      /* 칸마다 「언제 자리 잡기 시작하나」 — 자란 차례대로 고루 흩는다. */
      /* 앞 6 할 안에 다 자리 잡고, 나머지는 **다 자란 모양 그대로 머문다** — 주기 내내
         찔끔찔끔 늘어나면 「모양」이 안 보이고 계속 공사판이다. */
      const due = (i: number): number => (i / n) * 0.6;

      for (let i = 0; i < n; i++) {
        /* 갈라진 정도. 씨앗 칸은 자기가 부모 자리를 물려받으므로 늘 다 자란 값이다. */
        /* 씨앗 칸은 늘 제자리다. 이 칸이 층과 층을 잇는 **사다리**라, 여기까지 부모에
           붙여 두면 크기가 안 줄어 재귀가 한 발짝도 못 나간다(화면이 통째로 검었다). */
        const t = i === mask.fi ? 1 : smooth01((a - due(i)) / RAMP);
        /* 아직 안 갈라진 칸은 부모와 **위치도 크기도 정확히 같다** — 겹쳐 그려 봐야 그림은
           그대로고 비용만 n 배다(그 판이 한 장 640ms 였다). 씨앗 하나만 그린다. */
        if (t < 0.004 && i !== mask.fi) continue;

        /* **미끄러지기만 한다.** 낟알 크기는 이 애니메이션이 절대 안 건드린다 — 크기를
           바꾸는 것은 카메라뿐이다. 예전엔 부모 크기에서 칸 크기로 줄이며 갈라지게 했는데,
           그게 「확대·축소」로 보여서 지저분했다. 칸은 자기를 틔운 이웃 칸에서 **같은 크기
           그대로** 옆으로 밀려 나온다. 그래서 카메라가 물러나는 동안 낟알은 크기를 지키고,
           수만 불어나 더 큰 모양이 된다. */
        const c = mask.cells[i];
        const from = mask.cells[mask.via[i]];
        draw(
          x + (from.col + (c.col - from.col) * t) * cs,
          y + (from.row + (c.row - from.row) * t) * cs,
          cs,
          depth + 1,
          /* 뚝 나타나면 눈에 걸린다 — 미끄러지기 시작할 때만 살짝 배어 나온다.
             절반쯤 가면 이미 다 진해서, 「투명한 게 배경에 비치는」 느낌은 안 난다. */
          alpha * mix * smooth01(t / 0.55)
        );
      }
    };

    draw(ox, oy, root, 0, 1);
    ctx.globalAlpha = 1;

    /* 가장자리를 한 번 더 눌러 준다 — 낟알이 화면 끝에서 잘리는 게 덜 보이고, 눈이
       한가운데로 모인다. 바탕과 같은 색이라 「덧칠」이 아니라 「어두워짐」으로 읽힌다. */
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.26, w / 2, h / 2, Math.hypot(w, h) * 0.56);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
};
