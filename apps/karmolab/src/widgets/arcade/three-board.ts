/**
 * 입체 판 — **진짜 3D** (Three.js). change.arcade-redesign
 *
 * 판 놀이(오목·오델로·체커·따내기 바둑)가 함께 쓰는 무대다. 나무판 하나와 알 몇 개,
 * 빛 두 개. 판은 **무엇을 어디에 놓을지**만 정하고 카메라·빛·재질은 여기서 한 번 정한다.
 *
 * 왜 라이브러리를 들이나: 손으로 쓴 셰이더로는 반사·그림자·부드러운 빛이 안 나온다.
 * 그 차이가 「나무판에 놓인 돌」과 「원을 칠한 그림」을 가른다.
 *
 * 무게: three 는 **3D 로 볼 때만** 받는다(`arcade/games3d/*.js` 조각). 2D 로 노는 사람은
 * 이 파일도, three 도 안 받는다.
 */
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer
} from '/packages/3d/vendor/three.module.min.js';
import { stoneTexture, woodTexture } from './texture';

/** 판 위 한 알. 색은 자리 번호(1·2…)가 정한다. */
export interface Stone {
  /** 칸 번호 (0 ~ n*n-1) */
  cell: number;
  /** 누구 것 (1·2·3·4) */
  who: number;
  /** 방금 둔 자리 — 붉은 표를 얹는다 */
  last?: boolean;
  /** 왕관 (체커) */
  king?: boolean;
  /** 집어 든 말 — 금빛 고리 (체커) */
  pick?: boolean;
}

export interface Board3dOpts {
  /** 한 줄에 몇 칸 */
  n: number;
  /**
   * 알을 **교차점**에 두나, **칸 안**에 두나.
   *
   * 오목·바둑은 줄이 만나는 점에 둔다 — 칸 한가운데에 두면 그건 다른 놀이다(오델로·체커).
   * 판마다 다르므로 판이 정한다. 기본은 칸 안(`false`).
   */
  onCross?: boolean;
  /** 화점 자리 (판이 정한다 — 칸 수가 다르면 자리도 다르다) */
  star?: (i: number) => boolean;
  /** 어두운 칸 (체커) */
  dark?: (i: number) => boolean;
  /** 칸을 눌렀을 때 */
  onCell: (i: number) => void;
}

export interface Board3d {
  /** 판 위의 알을 다시 놓는다. 매 수마다 부른다. */
  place(stones: Stone[], hint?: { can?: number[] }): void;
  /** 창 크기가 바뀌면 */
  resize(): void;
  /** 판을 접는다 — 화면을 떠날 때 반드시 (WebGL 맥락은 저절로 안 사라진다) */
  dispose(): void;
  /** WebGL 을 못 얻었으면 false — 부르는 쪽이 2D 로 물러선다 */
  ok: boolean;
}

/* 알 색 — 2D 화면(`--ac-stone-*`)과 같은 눈으로 고른 값. */
const STONE: Record<number, number> = { 1: 0x22201e, 2: 0xf4efe4, 3: 0xc0392b, 4: 0x2f6fb8 };

const CELL = 1; /* 칸 한 변 (3D 단위) */

export function mountThreeBoard(host: HTMLElement, opts: Board3dOpts): Board3d {
  const { n } = opts;
  const cross = opts.onCross === true;
  /**
   * 줄이 덮는 거리. **교차점 판은 줄이 n 개**(칸은 n−1 개)고, 칸 판은 줄이 n+1 개다.
   * 여기를 한 줄로 갈라 두면 아래(줄 긋기·알 자리·손 짚기)가 전부 따라온다.
   */
  const span = (cross ? n - 1 : n) * CELL;
  /* 교차점 판은 가장자리 줄 밖에 나무가 조금 남아야 판처럼 보인다. */
  const margin = cross ? CELL * 0.62 : 0;
  const size = span + margin * 2;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none';
  canvas.tabIndex = 0;
  host.appendChild(canvas);

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    host.removeChild(canvas);
    return { place: () => {}, resize: () => {}, dispose: () => {}, ok: false };
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 100);

  /**
   * 사람이 판 앞에 앉은 눈높이 — 다만 **판이 다 보이는 거리**까지 물러선다.
   * 처음엔 가까이 붙여 뒀더니 앞뒤 줄이 화면 밖으로 잘렸다(실측). 시야각(34°)과 판 크기로
   * 필요한 거리를 계산해 두면 칸 수가 달라져도 판이 늘 화면에 들어온다.
   */
  const fit = (size * 0.72) / Math.tan((34 * Math.PI) / 180 / 2);
  camera.position.set(0, fit * 0.82, fit * 0.66);
  camera.lookAt(0, 0, 0);

  /* 빛 둘: 넓게 깔리는 것 + 그림자를 만드는 것. 하나만 쓰면 그늘이 새까매진다. */
  scene.add(new AmbientLight(0xffffff, 1.45));
  const sun = new DirectionalLight(0xfff3e0, 1.9);
  sun.position.set(-size * 0.5, size * 1.7, size * 0.55);
  sun.castShadow = true;
  /**
   * 그림자 틀을 **판에 딱 맞춘다**. 넉넉히 잡아 두면 남는 자리가 판 위에 각진 무늬로 남는다
   * (실측: 판 가운데를 가로지르는 삼각형이 보였다 — 그림자가 아니라 그림자 틀의 모서리였다).
   * 알만 그림자를 지므로 틀은 판 크기면 충분하다.
   */
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -size * 0.62;
  sun.shadow.camera.right = size * 0.62;
  sun.shadow.camera.top = size * 0.62;
  sun.shadow.camera.bottom = -size * 0.62;
  sun.shadow.camera.near = size * 0.4;
  sun.shadow.camera.far = size * 3.2;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  /* ── 판 ── 나무 상자 한 덩이. 윗면이 두께만큼 올라와 있다.
     결은 **코드로 굽는다**(`texture.ts`) — 그림 파일 0개, 매끈한 플라스틱 면을 면한다. */
  const boardTop = 0.34;
  const woodMap = new CanvasTexture(woodTexture(7));
  woodMap.colorSpace = SRGBColorSpace;
  woodMap.anisotropy = 4;
  const wood = new MeshStandardMaterial({ map: woodMap, color: 0xffffff, roughness: 0.68, metalness: 0.02 });
  const board = new Mesh(new PlaneGeometry(size, size), wood);
  board.rotation.x = -Math.PI / 2;
  board.position.y = boardTop;
  board.receiveShadow = true;
  scene.add(board);

  /**
   * 판 몸통 = **상자**. 처음엔 4각 실린더로 뒀는데 윗면과 옆면이 미세하게 어긋나 판 위에
   * 각진 자국(대각선 무늬)이 남았다(실측). 상자는 면이 정확히 맞아 자국이 없다.
   * 윗면(`board`)보다 아주 조금 낮게 둬서 z-싸움도 피한다.
   */
  const sideMap = new CanvasTexture(woodTexture(23, 256));
  sideMap.colorSpace = SRGBColorSpace;
  const side = new MeshStandardMaterial({ map: sideMap, color: 0xc98f45, roughness: 0.82 });
  const body = new Mesh(new BoxGeometry(size, boardTop, size), side);
  body.position.y = boardTop / 2 - 0.004;
  body.castShadow = true;
  scene.add(body);

  /* 줄 — 얇은 판으로 긋는다. 선 하나가 메시 하나면 9칸에 20개, 가볍다. */
  const ink = new MeshStandardMaterial({ color: 0x6b4518, roughness: 0.9 });
  const g0 = -span / 2; /* 첫 줄 자리 */
  const lineW = 0.035;
  const lines = cross ? n : n + 1;
  for (let i = 0; i < lines; i += 1) {
    const at = g0 + i * CELL;
    const h = new Mesh(new PlaneGeometry(span, lineW), ink);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, boardTop + 0.002, at);
    scene.add(h);
    const v = new Mesh(new PlaneGeometry(lineW, span), ink);
    v.rotation.x = -Math.PI / 2;
    v.position.set(at, boardTop + 0.002, 0);
    scene.add(v);
  }

  /* 알 자리 — **교차점이면 줄 위**, 아니면 칸 한가운데. 화점도 같은 자리를 쓴다. */
  const cx = (i: number): number => g0 + (i % n) * CELL + (cross ? 0 : CELL / 2);
  const cz = (i: number): number => g0 + Math.floor(i / n) * CELL + (cross ? 0 : CELL / 2);

  /* 화점 · 어두운 칸 */
  const dot = new MeshStandardMaterial({ color: 0x5c3d18, roughness: 0.9 });
  const darkMat = new MeshStandardMaterial({ color: 0xc08b45, roughness: 0.78 });
  for (let i = 0; i < n * n; i += 1) {
    if (opts.star?.(i)) {
      const d = new Mesh(new CircleGeometry(CELL * 0.09, 16), dot);
      d.rotation.x = -Math.PI / 2;
      d.position.set(cx(i), boardTop + 0.003, cz(i));
      scene.add(d);
    }
    if (opts.dark?.(i)) {
      const sq = new Mesh(new PlaneGeometry(CELL * 0.98, CELL * 0.98), darkMat);
      sq.rotation.x = -Math.PI / 2;
      sq.position.set(cx(i), boardTop + 0.001, cz(i));
      scene.add(sq);
    }
  }

  /* ── 알 ── 매 수마다 새로 만들지 않는다. 칸 수만큼 미리 만들어 두고 보였다 감췄다 한다. */
  const stoneGeo = new SphereGeometry(CELL * 0.4, 24, 16);
  const mats = new Map<number, MeshStandardMaterial>();
  const matFor = (who: number): MeshStandardMaterial => {
    let m = mats.get(who);
    if (!m) {
      /* 흰 돌은 조개, 검은 돌은 슬레이트 — 무늬도 코드로 굽는다(`texture.ts`). */
      const skin = who === 1 || who === 2 ? new CanvasTexture(stoneTexture(who === 1 ? 'black' : 'white', who * 5)) : null;
      if (skin) skin.colorSpace = SRGBColorSpace;
      m = new MeshStandardMaterial({
        map: skin ?? undefined,
        color: skin ? 0xffffff : new Color(STONE[who] ?? 0x888888),
        roughness: who === 2 ? 0.36 : 0.3,
        metalness: 0.04
      });
      mats.set(who, m);
    }
    return m;
  };

  const pool: Mesh[] = [];
  const stoneOf = (k: number): Mesh => {
    let m = pool[k];
    if (!m) {
      m = new Mesh(stoneGeo, matFor(1));
      /* 바둑돌은 공이 아니라 **눌린 알**이다 — 세로만 납작하게. */
      m.scale.set(1, 0.46, 1);
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      pool[k] = m;
    }
    return m;
  };

  /* 마지막 수 표 — 붉은 고리 하나를 옮겨 쓴다. */
  const markMat = new MeshStandardMaterial({ color: 0xe2503c, roughness: 0.5 });
  const mark = new Mesh(new CircleGeometry(CELL * 0.16, 20), markMat);
  mark.rotation.x = -Math.PI / 2;
  mark.visible = false;
  scene.add(mark);

  /* 집어 든 말 — 금빛 고리 하나를 옮겨 쓴다(체커). */
  const pickMat = new MeshStandardMaterial({ color: 0xe8c15a, roughness: 0.4, metalness: 0.3 });
  const pickRing = new Mesh(new RingGeometry(CELL * 0.44, CELL * 0.52, 24), pickMat);
  pickRing.rotation.x = -Math.PI / 2;
  pickRing.visible = false;
  scene.add(pickRing);

  /* 둘 수 있는 자리 — 옅은 판 조각. 눌러도 되는 곳을 판 위에서 보여 준다. */
  const hintMat = new MeshStandardMaterial({ color: 0x2a2620, roughness: 1, transparent: true, opacity: 0.22 });
  const hints: Mesh[] = [];
  const hintOf = (k: number): Mesh => {
    let m = hints[k];
    if (!m) {
      m = new Mesh(new CircleGeometry(CELL * 0.17, 16), hintMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      hints[k] = m;
    }
    return m;
  };

  /* ── 손 ── 화면의 한 점을 판의 칸으로 옮긴다(레이캐스트). */
  const ray = new Raycaster();
  const ndc = new Vector2();
  const cellAt = (ev: PointerEvent): number => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(board, false)[0];
    if (!hit) return -1;
    /* 교차점 판은 **가장 가까운 줄**을 고른다(반올림). 칸 판은 그 칸(내림). */
    const pick = cross ? Math.round : Math.floor;
    const col = pick((hit.point.x - g0) / CELL);
    const row = pick((hit.point.z - g0) / CELL);
    if (col < 0 || col >= n || row < 0 || row >= n) return -1;
    return row * n + col;
  };
  const onDown = (ev: PointerEvent): void => {
    const i = cellAt(ev);
    if (i >= 0) opts.onCell(i);
  };
  canvas.addEventListener('pointerdown', onDown);

  /* ── 그리기 ── **부를 때만** 그린다. 가만히 도는 60fps 는 배터리를 먹는다. */
  let need = true;
  const render = (): void => {
    if (!need) return;
    need = false;
    renderer.render(scene, camera);
  };
  const resize = (): void => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    need = true;
    render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  return {
    ok: true,
    place(stones, hint) {
      pool.forEach((m) => { m.visible = false; });
      hints.forEach((m) => { m.visible = false; });
      mark.visible = false;
      pickRing.visible = false;
      stones.forEach((st, k) => {
        const m = stoneOf(k);
        m.material = matFor(st.who);
        m.position.set(cx(st.cell), boardTop + CELL * 0.19, cz(st.cell));
        /* 왕은 **한 장 더 얹은 것**이라 두 배 두껍다. */
        m.scale.set(1, st.king ? 0.92 : 0.46, 1);
        m.visible = true;
        if (st.last) {
          mark.position.set(cx(st.cell), boardTop + 0.004, cz(st.cell));
          mark.visible = true;
        }
        if (st.pick) {
          pickRing.position.set(cx(st.cell), boardTop + 0.005, cz(st.cell));
          pickRing.visible = true;
        }
      });
      (hint?.can ?? []).forEach((cell, k) => {
        const m = hintOf(k);
        m.position.set(cx(cell), boardTop + 0.004, cz(cell));
        m.visible = true;
      });
      need = true;
      render();
    },
    resize,
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      [...mats.values(), wood, side, ink, dot, darkMat, markMat, hintMat, pickMat].forEach((mm) => mm.dispose());
      woodMap.dispose();
      sideMap.dispose();
      renderer.dispose();
      canvas.remove();
    }
  };
}
