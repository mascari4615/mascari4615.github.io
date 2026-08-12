/**
 * 「본」 — 9-slice(나인패치) (TASK-KL-254 · 4단계)
 *
 * 게임 UI 가 일반 그림 도구와 갈리는 자리다. 버튼 한 장을 아무 크기로나 늘리면 모서리가 같이
 * 늘어나 뭉개진다. 9-slice 는 그림을 아홉 칸으로 나눠 **네 모서리는 그대로 두고** 가장자리와
 * 가운데만 늘린다. 그래서 한 장으로 모든 크기를 감당한다 — 크기마다 그림을 따로 만들 필요가 없다.
 *
 * 놀랍게도 이걸 벡터 편집기에서 정해 주는 곳이 거의 없다(Figma·Boxy 둘 다 없다). 게임 쪽에서는
 * 필수인데도. 여기서는 경계선 넷을 직접 잡아 옮기고, 내보낼 때 함께 적어 준다.
 *
 * 브라우저를 모른다 — 화면 없이 검사한다.
 */

/** 판 가장자리에서 안쪽으로 얼마나 들어온 자리에 선이 있나(px). */
export interface Slice {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const defaultSlice = (w: number, h: number): Slice => ({
  left: Math.round(w * 0.25), right: Math.round(w * 0.25),
  top: Math.round(h * 0.25), bottom: Math.round(h * 0.25)
});

/**
 * 성한 값으로 맞춘다. **마주 보는 두 선이 서로를 지나칠 수 없다** — 지나치면 가운데 칸이 음수가
 * 되고, 그 그림을 게임 엔진에 넣으면 늘릴 때 뒤집혀 그려진다(원인을 찾기 어려운 종류의 고장이다).
 * 넘으면 둘 사이를 반씩 나눠 붙인다.
 */
export function clampSlice(slice: Slice, w: number, h: number): Slice {
  const fix = (a: number, b: number, size: number): [number, number] => {
    let x = Math.max(0, Math.min(a, size));
    let y = Math.max(0, Math.min(b, size));
    if (x + y > size) {
      const scale = size / (x + y);
      x = Math.floor(x * scale);
      y = Math.floor(y * scale);
    }
    return [x, y];
  };
  const [left, right] = fix(slice.left, slice.right, w);
  const [top, bottom] = fix(slice.top, slice.bottom, h);
  return { left, right, top, bottom };
}

/** 아홉 칸의 크기. 검사와 미리보기가 같은 셈을 쓴다. */
export function slicePieces(slice: Slice, w: number, h: number): { cols: [number, number, number]; rows: [number, number, number] } {
  const s = clampSlice(slice, w, h);
  return {
    cols: [s.left, Math.max(0, w - s.left - s.right), s.right],
    rows: [s.top, Math.max(0, h - s.top - s.bottom), s.bottom]
  };
}

/**
 * 늘렸을 때 어떻게 보이나 — 아홉 칸이 각각 어디서 어디로 가는지.
 * 미리보기가 이걸로 그리고, 검사가 이걸로 「모서리가 안 늘어났나」를 본다.
 */
export interface Piece { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

export function stretch(slice: Slice, w: number, h: number, toW: number, toH: number): Piece[] {
  const { cols, rows } = slicePieces(slice, w, h);
  // 늘어난 판에서도 모서리는 원래 크기 그대로다. 가운데만 남는 자리를 가져간다.
  const dCols: [number, number, number] = [cols[0], Math.max(0, toW - cols[0] - cols[2]), cols[2]];
  const dRows: [number, number, number] = [rows[0], Math.max(0, toH - rows[0] - rows[2]), rows[2]];
  const pieces: Piece[] = [];
  let sy = 0;
  let dy = 0;
  for (let r = 0; r < 3; r += 1) {
    let sx = 0;
    let dx = 0;
    for (let c = 0; c < 3; c += 1) {
      if (cols[c] > 0 && rows[r] > 0) {
        pieces.push({ sx, sy, sw: cols[c], sh: rows[r], dx, dy, dw: dCols[c], dh: dRows[r] });
      }
      sx += cols[c];
      dx += dCols[c];
    }
    sy += rows[r];
    dy += dRows[r];
  }
  return pieces;
}

/**
 * 유니티가 읽는 이름으로 적는다 — 그쪽은 「가장자리에서 안으로 들어온 거리」를
 * 왼·아래·오른·위 순서(`border = (L, B, R, T)`)로 든다. 순서를 틀리면 위아래가 바뀌어
 * 늘어난다. 사람이 읽을 이름도 같이 담는다.
 */
export function sliceMeta(slice: Slice, w: number, h: number): Record<string, unknown> {
  const s = clampSlice(slice, w, h);
  return {
    kind: '9-slice',
    size: { w, h },
    border: { left: s.left, bottom: s.bottom, right: s.right, top: s.top },
    unityBorder: [s.left, s.bottom, s.right, s.top],
    note: '네 모서리는 늘어나지 않는다. 가장자리와 가운데만 늘어난다.'
  };
}
