/**
 * 카드 앞면의 생김새. 핍 배치와 그림 카드 (2026-09-01)
 *
 * 왜 새로 있나. 앞면이 **가운데 무늬 하나 + 귀퉁이 글자**뿐이었다. 7 도 하트 하나, 9 도 하트
 * 하나라서 끗수를 글자로만 읽어야 했고, J, Q, K 는 큰 글자에 흐린 무늬를 겹친 것.
 * 실물 카드는 끗수만큼 핍을 놓고, 그림 카드는 위아래가 맞물린 그림.
 *
 * 여기서 정하는 것은 **자리와 모양뿐**이다. 색과 무늬 글자는 `deck.ts` 의 `DeckSkin` 이 정하고,
 * 실제로 그리는 것은 둘이다. 평면은 `card.ts` 가 SVG 로, 입체는 `texture.ts` 가 캔버스로.
 * 자리를 여기 한 곳에 두어야 평면과 입체가 같은 카드.
 *
 * 좌표는 카드 앞면 안쪽을 0~1 로 놓은 값이다. x 0.5 가 가운데, y 0 이 위.
 */

/** 핍 하나. `flip` 이면 180도 돌려 놓는다(카드 아래 절반) */
export interface Pip {
  x: number;
  y: number;
  /** 크기 배수. 에이스만 큼 */
  s: number;
  flip: boolean;
}

/* 실물 카드의 세로 자리 다섯. 위에서부터 */
const Y1 = 0.115;
const Y2 = 0.305;
const Y3 = 0.5;
const Y4 = 0.695;
const Y5 = 0.885;
/* 두 줄로 놓을 때의 가로 자리 */
const XL = 0.255;
const XR = 0.745;
/* 9, 10 이 쓰는 촘촘한 네 줄 */
const N1 = 0.115;
const N2 = 0.3733;
const N3 = 0.6267;
const N4 = 0.885;

const p = (x: number, y: number, s = 1): Pip => ({ x, y, s, flip: y > 0.5 + 1e-6 });

/** 두 줄에 같은 높이로 둘 */
const pair = (y: number): Pip[] => [p(XL, y), p(XR, y)];

/**
 * 끗수만큼의 핍 자리. 앵글로아메리칸 한 벌의 표준 배치.
 * A 는 가운데 하나를 크게, 2~10 은 아래 표대로, 그림 카드는 빈 배열(따로 그림)
 */
export function pips(rank: number): Pip[] {
  switch (rank) {
    case 1:
      return [p(0.5, Y3, 2.35)];
    case 2:
      return [p(0.5, Y1), p(0.5, Y5)];
    case 3:
      return [p(0.5, Y1), p(0.5, Y3), p(0.5, Y5)];
    case 4:
      return [...pair(Y1), ...pair(Y5)];
    case 5:
      return [...pair(Y1), p(0.5, Y3), ...pair(Y5)];
    case 6:
      return [...pair(Y1), ...pair(Y3), ...pair(Y5)];
    case 7:
      return [...pair(Y1), p(0.5, Y2), ...pair(Y3), ...pair(Y5)];
    case 8:
      return [...pair(Y1), p(0.5, Y2), ...pair(Y3), p(0.5, Y4), ...pair(Y5)];
    case 9:
      return [...pair(N1), ...pair(N2), p(0.5, Y3), ...pair(N3), ...pair(N4)];
    case 10:
      return [...pair(N1), p(0.5, (N1 + N2) / 2), ...pair(N2), ...pair(N3), p(0.5, (N3 + N4) / 2), ...pair(N4)];
    default:
      return [];
  }
}

/** 그림 카드의 안쪽 판. 위아래가 맞물리게 가운데를 가름. 귀퉁이 글자는 안 건드림 */
export const COURT_BOX = { x: 0.185, y: 0.105, w: 0.63, h: 0.79 };

/**
 * 그림 카드 반쪽. 0~1 안쪽 판 기준. 아래 절반은 부르는 쪽이 180도 돌려 한 번 더.
 * 실물처럼 반쪽만 그려 맞물리면 위아래 어느 쪽으로 들어도 읽힘.
 *
 * 선이 주고 칠은 거든다. 칠을 크게 하면 멀리서 붉은 얼룩으로 보인다(2026-09-01 실측).
 * 돌려주는 것은 SVG 길 문자열. 평면과 입체가 같은 그림
 */
export function courtPaths(rank: number): { fill: string[]; line: string[] } {
  /* 셋이 같이 쓰는 몸. 어깨 두 줄과 목, 그리고 가슴 가운데 선 */
  const shoulders = 'M.06.52 C.10.40 .26.35 .40.33 L.60.33 C.74.35 .90.40 .94.52';
  const neck = 'M.44.30 L.44.335 M.56.30 L.56.335';
  const collar = 'M.40.33 L.46.40 L.50.34 L.54.40 L.60.33';
  const chest = 'M.5.42 L.5.52';
  const head = 'M.5.115 C.585.115 .60.175 .60.215 C.60.27 .555.305 .5.305 C.445.305 .40.27 .40.215 C.40.175 .415.115 .5.115 Z';
  const eyes = 'M.455.205 L.472.205 M.528.205 L.545.205';

  if (rank === 13) {
    /* 왕. 뾰족한 관, 넓은 어깨, 수염 */
    return {
      fill: ['M.335.115 L.375.05 L.435.10 L.5.025 L.565.10 L.625.05 L.665.115 Z'],
      line: [
        head,
        eyes,
        'M.34.115 L.66.115',
        'M.335.115 L.375.05 L.435.10 L.5.025 L.565.10 L.625.05 L.665.115 Z',
        'M.44.255 C.47.30 .53.30 .56.255',
        shoulders,
        neck,
        collar,
        chest,
        'M.20.52 L.26.40',
        'M.80.52 L.74.40'
      ]
    };
  }
  if (rank === 12) {
    /* 왕비. 둥근 관, 목걸이, 가는 어깨 */
    return {
      fill: ['M.355.115 C.365.05 .635.05 .645.115 Z'],
      line: [
        head,
        eyes,
        'M.355.115 C.365.05 .635.05 .645.115 Z',
        'M.5.02 L.5.052',
        'M.42.345 C.46.395 .54.395 .58.345',
        shoulders,
        neck,
        chest,
        'M.26.46 C.34.40 .40.375 .44.365',
        'M.74.46 C.66.40 .60.375 .56.365'
      ]
    };
  }
  /* 시종. 깃 달린 모자와 옷깃 */
  return {
    fill: ['M.365.12 C.385.055 .615.055 .635.12 Z'],
    line: [
      head,
      eyes,
      'M.365.12 C.385.055 .615.055 .635.12 Z',
      'M.635.085 C.72.05 .77.11 .70.165',
      shoulders,
      neck,
      collar,
      chest,
      'M.30.52 L.36.41',
      'M.70.52 L.64.41'
    ]
  };
}
