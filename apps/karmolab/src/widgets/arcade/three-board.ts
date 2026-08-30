/**
 * 입체 판. **진짜 3D** (Three.js). change.arcade-redesign
 *
 * 판 놀이(오목, 오델로, 체커, 따내기 바둑)가 함께 쓰는 무대다. 나무판 하나와 알 몇 개,
 * 빛 두 개. 판은 **무엇을 어디에 놓을지**만 정하고 카메라, 빛, 재질은 여기서 한 번 정한다.
 *
 * 왜 라이브러리를 들이나: 손으로 쓴 셰이더로는 반사, 그림자, 부드러운 빛이 안 나온다.
 * 그 차이가 나무판에 놓인 돌과 원을 칠한 그림을 가른다.
 *
 * 무게: three 는 **3D 로 볼 때만** 받는다(`arcade/games3d/*.js` 조각). 2D 로 노는 사람은
 * 이 파일도, three 도 안 받는다.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer
} from '/packages/3d/vendor/three.module.min.js';
import { gloop, type GardenLoop } from '../garden/gloop';
import { plankTexture, shojiTexture, stoneTexture, tatamiTexture, woodTexture } from './texture';

/** 판 위 한 알. 색은 자리 번호(1, 2...)가 정한다. */
export interface Stone {
  /** 칸 번호 (0 ~ n*n-1) */
  cell: number;
  /** 누구 것 (1, 2, 3, 4) */
  who: number;
  /** 방금 둔 자리. 붉은 표를 얹는다 */
  last?: boolean;
  /** 왕관 (체커) */
  king?: boolean;
  /** 집어 든 말. 금빛 고리 (체커) */
  pick?: boolean;
}

export interface Board3dOpts {
  /** 한 줄에 몇 칸 */
  n: number;
  /**
   * 알을 **교차점**에 두나, **칸 안**에 두나.
   *
   * 오목, 바둑은 줄이 만나는 점에 둔다. 칸 한가운데에 두면 그건 다른 놀이다(오델로, 체커).
   * 판마다 다르므로 판이 정한다. 기본은 칸 안(`false`).
   */
  onCross?: boolean;
  /** 화점 자리 (판이 정한다. 칸 수가 다르면 자리도 다르다) */
  star?: (i: number) => boolean;
  /** 어두운 칸 (체커) */
  dark?: (i: number) => boolean;
  /**
   * 판 곁에 통 둘을 놓는다 (오목, 바둑).
   *
   * 판만 덩그러니 두면 화면 네 귀가 빈다. 거기를 글자로 채우면 판을 보는 눈이 글자로 감
   * 실제 판 앞에 앉으면 통이 대각으로 놓여 있고, 그 그림자가 여백을 채움
   */
  bowls?: boolean;
  /**
   * **방 안에 판을 놓는다** (오목, 바둑).
   *
   * 판 하나만 떠 있으면 그건 물건이 아니라 도표다. 다다미 바닥, 판만 비추는 스포트,
   * 알이 떨어져 앉는 손맛, 들어올 때 카메라가 자리를 잡는 동작까지 한 벌
   * 레퍼런스(오목 가자) 실측: 다다미방, 판이 프레임 세로의 91%, 통은 프레임 밖으로 잘림
   *
   * 켜지 않으면 예전 그림 그대로다(오델로, 체커는 안 켠다).
   */
  room?: boolean;
  /** 칸을 눌렀을 때 */
  onCell: (i: number) => void;
}

export interface Board3d {
  /** 판 위의 알을 다시 놓는다. 매 수마다 부른다. */
  place(stones: Stone[], hint?: { can?: number[] }): void;
  /** 창 크기가 바뀌면 */
  resize(): void;
  /** 판을 접는다. 화면을 떠날 때 반드시 (WebGL 맥락은 저절로 안 사라진다) */
  dispose(): void;
  /**
   * 판 끝. 카메라가 한 걸음 다가서며 판을 마무리로 보여 줌
   * 다시 부르면 아무 일도 안 한다(같은 판에서 두 번 부른다).
   */
  finish(): void;
  /** WebGL 을 못 얻었으면 false. 부르는 쪽이 2D 로 물러선다 */
  ok: boolean;
  /**
   * GPU 없이 CPU 로 그리는 중 (WARP, SwiftShader, llvmpipe). 브라우저의 그래픽 가속이 꺼진 것
   * 이 상태면 알 하나에 20~40fps 다(2026-08-30 사용자 Edge 실측: Microsoft Basic Render Driver).
   * 화면이 사람에게 알릴 것. 안 그러면 사람은 판이 무거운 줄 앎
   */
  software: boolean;
}

/* 알 색. 2D 화면(`--ac-stone-*`)과 같은 눈으로 고른 값. */
const STONE: Record<number, number> = { 1: 0x22201e, 2: 0xf4efe4, 3: 0xc0392b, 4: 0x2f6fb8 };

const CELL = 1; /* 칸 한 변 (3D 단위) */

export function mountThreeBoard(host: HTMLElement, opts: Board3dOpts): Board3d {
  const { n } = opts;
  const cross = opts.onCross === true;
  const room = opts.room === true;
  /**
   * 줄이 덮는 거리. **교차점 판은 줄이 n 개**(칸은 n−1 개)고, 칸 판은 줄이 n+1 개다.
   * 여기를 한 줄로 갈라 두면 아래(줄 긋기, 알 자리, 손 짚기)가 전부 따라온다.
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
    return { place: () => {}, finish: () => {}, resize: () => {}, dispose: () => {}, ok: false, software: false };
  }
  /* GPU 이름. WARP(Basic Render Driver), SwiftShader, llvmpipe 면 CPU 로 그리는 중 */
  const gpuName = ((): string => {
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'gpu ?';
    } catch {
      return 'gpu ?';
    }
  })();
  const software = /Basic Render Driver|SwiftShader|llvmpipe|Software/i.test(gpuName);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  /* 방 표현은 PCF. PCFSoft 는 화소마다 표본이 몇 배라 1648x842 캔버스에서 프레임이 40~100ms 로 튀었다(실측) */
  renderer.shadowMap.type = room ? PCFShadowMap : PCFSoftShadowMap;
  /**
   * 톤 매핑. 이게 없으면 밝은 데가 흰색으로 뭉개지고 어두운 데는 그냥 검다 . 
   * 나무와 흰 알처럼 **밝은 면이 넓은** 그림에서 차이가 크다(레퍼런스는 흰 알의 하이라이트가
   * 타지 않고 결이 남아 있음). 노출은 1.0. 1.22 로 두니 나무가 하얗게 떴다(실측)
   */
  if (room) {
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }

  const scene = new Scene();
  /* 방 표현은 화각을 조금 넓힌다. 판 옆면과 앞줄, 뒷줄의 차이가 보여야 판이 두께를 가진다 */
  const fov = room ? 38 : 34;
  const camera = new PerspectiveCamera(fov, 1, 0.1, 100);

  /**
   * 사람이 판 앞에 앉은 눈높이. 다만 **판이 다 보이는 거리**까지 물러선다.
   * 처음엔 가까이 붙여 뒀더니 앞뒤 줄이 화면 밖으로 잘렸다(실측). 시야각(34°)과 판 크기로
   * 필요한 거리를 계산해 두면 칸 수가 달라져도 판이 늘 화면에 들어온다.
   */
  /**
   * ★ **판이 화면을 채워야 한다** (2026-08-29 실측). 여태 판이 캔버스의 54% 였다. 레퍼런스로
   * 잰 실제 오목 게임은 65~97%. 판이 작으면 줄 사이가 좁아 어디를 누르는지 헷갈림
   *
   * 그리고 **더 위에서** 봄. 눕혀 보면 원근 때문에 먼 줄 간격이 가까운 줄의 절반이 됨
   * 판놀이는 줄 간격이 고르게 보여야 읽힌다. 그렇다고 완전한 부감은 그림이 되므로
   * 비스듬함은 남긴다(알의 두께와 그림자가 보이는 각).
   */
  /**
   * 화면에 담아야 하는 반지름. 통을 놓으면 판 밖으로 그만큼 더 나감
   *
   * ★ 방 표현에서는 **통을 다 담지 않음**. 통까지 담으려니 판이 프레임의 70% 로 줄었다(실측)
   * 레퍼런스는 판이 프레임 세로의 91% 고 통 둘은 양쪽에서 잘려 있다(실측). 잘린 통은
   * 화면 밖에도 방이 이어진다는 신호. 오히려 방이 넓어 보임
   */
  /* 방 표현은 판을 비스듬히 보므로 앞줄이 가깝다. 1.06 으로 두니 앞줄이 프레임 밖으로 나갔다(실측). */
  const reach = size * 0.5 * (opts.bowls && !room ? 1.42 : room ? 1.2 : 1.06);
  const fit = reach / Math.tan((fov * Math.PI) / 180 / 2);
  /* 카메라가 앉을 자리. 판이 끝나면 여기서 한 걸음 다가선다(`finish`) */
  const seat = new Vector3(0, fit * (room ? 0.88 : 0.93), fit * (room ? 0.45 : 0.36));
  /* 지금 향해 가는 자리. 들어올 때와 끝날 때만 움직인다 */
  const goal = seat.clone();
  camera.position.copy(seat);
  camera.lookAt(0, 0, 0);

  /**
   * 빛. 넓게 깔리는 것 + 그림자를 만드는 것. 하나만 쓰면 그늘이 새까맣게 됨
   *
   * 방 표현은 **깔린 빛을 절반 이하로 내린다**. 1.45 로 사방에서 비추면 그림자가 옅어지고
   * 모든 면이 같은 밝기라 입체가 사라진다(사용자 지적: 알 말고는 입체감이 없다).
   * 대신 위아래 색이 갈리는 하늘빛과, 판만 비추는 스포트
   */
  /**
   * 방 표현의 빛은 **오후 햇살**. 따뜻한 해가 낮게 비스듬히 들고, 보조광은 차가운 하늘빛.
   * 전부 노랗게 두니 다다미, 판, 빛이 한 색으로 눌려 누렇게 떴다(사용자 지적). 해와 그늘의
   * 색이 갈려야 그림에 온도. 해는 뒤쪽(툇마루 쪽)에서 들어 그림자가 앞으로 누움
   */
  scene.add(new AmbientLight(0xffffff, room ? 0.22 : 1.45));
  if (room) scene.add(new HemisphereLight(0xcfe0f2, 0x4a3823, 0.75));
  const sun = new DirectionalLight(room ? 0xffd8a8 : 0xfff3e0, room ? 2.4 : 1.9);
  if (room) sun.position.set(size * 0.9, size * 1.05, -size * 0.75);
  else sun.position.set(-size * 0.5, size * 1.7, size * 0.55);
  sun.castShadow = true;
  /**
   * 그림자 틀을 **판에 딱 맞춘다**. 넉넉히 잡아 두면 남는 자리가 판 위에 각진 무늬로 남는다
   * (실측: 판 가운데를 가로지르는 삼각형이 보였다. 그림자가 아니라 그림자 틀의 모서리였다).
   * 알만 그림자를 지므로 틀은 판 크기면 충분하다.
   */
  sun.shadow.mapSize.set(room ? 1536 : 2048, room ? 1536 : 2048);
  /* 통을 놓으면 판 밖으로 나가므로 틀도 그만큼 넓힌다. 안 넓히면 통 그림자가 잘린다 */
  /* 낮은 해는 그림자가 길다. 방 표현은 틀을 더 넓게 */
  const shadowSpan = size * (room ? 1.4 : opts.bowls ? 0.95 : 0.62);
  sun.shadow.camera.left = -shadowSpan;
  sun.shadow.camera.right = shadowSpan;
  sun.shadow.camera.top = shadowSpan;
  sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.camera.near = size * 0.4;
  sun.shadow.camera.far = size * 3.2;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  /**
   * ── 바닥 ── 판이 놓인 자리. 없으면 판이 허공에 뜬다(그림자가 받을 면이 없다).
   * 어두운 나무. 판보다 훨씬 어두워야 판이 앞으로 나옴
   */
  /* 방 표현은 다다미. 판만 나무면 판이 어디 놓였는지 모르고, 바닥까지 나무면 한 덩이가 된다 */
  const floorMap = new CanvasTexture(room ? tatamiTexture(19, 512) : woodTexture(31, 256));
  floorMap.colorSpace = SRGBColorSpace;
  if (room) {
    floorMap.wrapS = RepeatWrapping;
    floorMap.wrapT = RepeatWrapping;
    /* 한 장이 다다미 반 장. 판 옆으로 여러 장이 이어져야 방이 된다 */
    floorMap.repeat.set(6, 3);
    floorMap.anisotropy = 4;
  }
  const floorMat = new MeshStandardMaterial({ map: floorMap, color: room ? 0xffffff : 0x2b1d10, roughness: room ? 0.94 : 0.98 });
  const floor = new Mesh(new PlaneGeometry(size * 6, size * 6), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /**
   * ── 툇마루와 바깥 ── 판 뒤쪽. 다다미가 끝나고 어두운 널마루가 한 폭, 그 너머는 해가 든 바깥.
   * 카메라 위쪽 가장자리에 걸려야 하므로 판 뒤 0.8 판 거리에 둔다. 레퍼런스도 판 옆에
   * 어두운 마루가 있음(실측). 방이 사방으로 다다미면 창고, 마루가 있어야 집
   */
  const plankMap = new CanvasTexture(plankTexture(29, 512));
  plankMap.colorSpace = SRGBColorSpace;
  plankMap.wrapS = RepeatWrapping;
  plankMap.repeat.set(5, 1);
  const plankMat = new MeshStandardMaterial({ map: plankMap, color: 0xffffff, roughness: 0.42, metalness: 0.05 });
  const outsideMat = new MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe9c8, emissiveIntensity: 0.9, roughness: 1 });
  if (room) {
    const edge = -size * 0.66;
    const plank = new Mesh(new PlaneGeometry(size * 6, size * 0.7), plankMat);
    plank.rotation.x = -Math.PI / 2;
    plank.position.set(0, 0.012, edge - size * 0.35);
    plank.receiveShadow = true;
    scene.add(plank);
    /* 마루 턱. 다다미보다 한 뼘 높다 */
    const step = new Mesh(new BoxGeometry(size * 6, 0.06, 0.05), plankMat);
    step.position.set(0, 0.03, edge);
    scene.add(step);
    /* 바깥. 빛나는 면 하나. 디테일을 그리면 눈이 거기로 간다 */
    const outside = new Mesh(new PlaneGeometry(size * 6, size * 3), outsideMat);
    outside.rotation.x = -Math.PI / 2;
    outside.position.set(0, 0.011, edge - size * 0.7 - size * 1.5);
    scene.add(outside);
  }

  /* ── 판 ── 나무 상자 한 덩이. 윗면이 두께만큼 올라와 있다.
     결은 **코드로 굽는다**(`texture.ts`). 그림 파일 0개, 매끈한 플라스틱 면을 면한다. */
  /* 판 두께. 레퍼런스 실측: 앞면 두께가 판 폭의 3% (15줄 판에서 0.45칸). 얇으면 종이가 된다 */
  const boardTop = room ? CELL * 0.46 : 0.34;
  const woodMap = new CanvasTexture(woodTexture(7));
  woodMap.colorSpace = SRGBColorSpace;
  woodMap.anisotropy = 4;
  /* 방 표현은 판을 살짝 붉게 물들인다. 레퍼런스의 판은 노란 소나무가 아니라 주황빛 도는 계수나무다(실측 색 #d9905a).
     0xf2b27c 로 두니 실제 GPU 에서 주황 줄무늬가 됐다(swiftshader 는 창백하게 속였다). 살짝만 */
  const wood = new MeshStandardMaterial({ map: woodMap, color: room ? 0xf8dcb8 : 0xffffff, roughness: 0.68, metalness: 0.02 });
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
  const side = new MeshStandardMaterial({ map: sideMap, color: room ? 0xb87a3c : 0xc98f45, roughness: 0.82 });
  const body = new Mesh(new BoxGeometry(size, boardTop, size), side);
  body.position.y = boardTop / 2 - 0.004;
  body.castShadow = true;
  scene.add(body);

  /**
   * 판만 비추는 등. 방은 어둡고 판 위에만 빛이 떨어져야 눈이 판으로 감
   * 그림자는 해 하나만 진다(등까지 그림자를 지면 알마다 그림자가 둘이라 가짜로 보인다).
   * `decay 0` 인 이유: 거리로 어두워지면 판 크기(줄 수)에 따라 밝기가 갈림. 판은 늘 같은 밝기
   */
  /**
   * ── 장지문으로 드는 빛 ── 방 표현의 핵심 한 장. 스포트에 장지문 무늬를 물려 다다미에
   * 격자 빛을 떨어뜨림. 판 뒤(툇마루 쪽) 높은 데서 앞으로 비스듬히. 그림자는 없음
   * (해가 이미 그림자를 지므로, 둘이면 알마다 그림자가 둘이라 가짜로 보임)
   */
  const shojiMap = new CanvasTexture(shojiTexture(512));
  shojiMap.colorSpace = SRGBColorSpace;
  if (room) {
    /* 세기 2.6, 각 0.58 로 두니 판 위까지 굵은 격자가 덮여 판이 지저분했다(실측). 옅게, 좁게, 판 뒤로 */
    const spot = new SpotLight(0xffe2b8, 1.2, 0, 0.4, 0.5, 0);
    spot.map = shojiMap;
    spot.position.set(size * 0.35, size * 1.7, -size * 1.7);
    spot.target.position.set(-size * 0.2, 0, -size * 0.35);
    scene.add(spot);
    scene.add(spot.target);
  }

  /* 줄. 얇은 판으로 긋는다. 선 하나가 메시 하나면 9칸에 20개, 가볍다. */
  /* 줄은 먹이다. 나무보다 조금 진한 갈색으로 그으면 결에 묻혀 판이 흐려 보인다(레퍼런스는 검정) */
  const ink = new MeshStandardMaterial({ color: room ? 0x1d1611 : 0x6b4518, roughness: 0.9 });
  const g0 = -span / 2; /* 첫 줄 자리 */
  const lineW = room ? 0.026 : 0.035;
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

  /* 알 자리. **교차점이면 줄 위**, 아니면 칸 한가운데. 화점도 같은 자리를 쓴다. */
  const cx = (i: number): number => g0 + (i % n) * CELL + (cross ? 0 : CELL / 2);
  const cz = (i: number): number => g0 + Math.floor(i / n) * CELL + (cross ? 0 : CELL / 2);

  /* 화점, 어두운 칸 */
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
  /* 지름 = 칸의 0.88 (레퍼런스 실측 0.84~0.94). 작으면 판이 헐렁해 보인다 */
  const stoneGeo = new SphereGeometry(CELL * 0.44, 24, 16);
  const mats = new Map<number, MeshStandardMaterial>();
  const matFor = (who: number): MeshStandardMaterial => {
    let m = mats.get(who);
    if (!m) {
      /* 흰 돌은 조개, 검은 돌은 슬레이트. 무늬도 코드로 굽는다(`texture.ts`). */
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

  /**
   * ── 통 둘 ── 판의 대각에 놓인다. 왼쪽 위가 흑, 오른쪽 아래가 백(레퍼런스와 같은 자리).
   *
   * 예전에는 원뿔대 하나(`CylinderGeometry`)에 알 일곱이었다. 그건 통이 아니라 화분이다 . 
   * 실제 바둑통은 **굽이 있고 배가 부르고 입이 오므라든** 물레 모양이라, 옆선을 점으로 찍어
   * 돌린다(`LatheGeometry`). 그리고 통마다 **뚜껑이 뒤집혀 옆에 놓인다** (딴 알을 담는 자리).
   * 안에는 알이 수북해야 한다. 낱알이 몇 개면 접시고, 무더기여야 통이다(레퍼런스 실측).
   */
  const bowlMats: MeshStandardMaterial[] = [];
  if (opts.bowls) {
    const r = CELL * 1.45;
    const bowlWoodMap = new CanvasTexture(woodTexture(13, 256));
    bowlWoodMap.colorSpace = SRGBColorSpace;
    /* 통 안쪽도 보인다(입이 열려 있다). 뒷면을 안 그리면 통 속이 뻥 뚫린다 */
    const bowlWood = new MeshStandardMaterial({ map: bowlWoodMap, color: 0xd8a865, roughness: 0.62, side: DoubleSide });
    bowlMats.push(bowlWood);

    /* 옆선. (반지름, 높이) 를 아래에서 위로. 굽 → 배 → 오므라든 입 */
    const profile: Array<[number, number]> = [
      [0, 0], [0.36, 0], [0.44, 0.03], [0.47, 0.09], [0.41, 0.15],
      [0.45, 0.3], [0.5, 0.5], [0.5, 0.66], [0.47, 0.78], [0.48, 0.83]
    ];
    /* 가로는 지름(=r*2), 세로는 그보다 낮게. 실측 바둑통은 높이가 반지름의 1.35배 안팎이다 */
    const wide = r * 2;
    const tall = r * 1.5;
    const bowlGeo = new LatheGeometry(profile.map(([px, py]) => new Vector2(px * wide, py * tall)), 40);
    /* 뚜껑. 얕은 접시라 같은 방식으로 낮게 굽는다. 뒤집어 놓으므로 x 축으로 돌린다 */
    const lidGeo = new LatheGeometry(
      ([[0, 0], [0.4, 0], [0.5, 0.04], [0.54, 0.12], [0.54, 0.2], [0.5, 0.24]] as Array<[number, number]>)
        .map(([px, py]) => new Vector2(px * wide, py * tall)),
      36
    );
    const away = size / 2 + r * 0.86;
    /* 통 속 알. 가운데가 볼록한 무더기. 고리마다 개수와 높이가 달라야 쌓인 것으로 보인다 */
    const heap: Array<[number, number, number]> = [];
    ([[0, 1, 1], [0.34, 6, 0.96], [0.6, 10, 0.88], [0.8, 12, 0.74]] as Array<[number, number, number]>)
      .forEach(([rad, count, high]) => {
        for (let k = 0; k < count; k += 1) {
          const a = (k / count) * Math.PI * 2 + rad * 3.1;
          heap.push([Math.cos(a) * rad, Math.sin(a) * rad, high]);
        }
      });
    const pileGeo = new SphereGeometry(CELL * 0.3, 14, 10);
    for (const who of [1, 2]) {
      const sx = who === 1 ? -away : away;
      const sz = who === 1 ? -away : away;
      const cup = new Mesh(bowlGeo, bowlWood);
      cup.position.set(sx, 0, sz);
      cup.castShadow = true;
      cup.receiveShadow = true;
      scene.add(cup);

      /* 뚜껑은 통 바깥쪽에 뒤집혀 눕는다. 판 쪽에 두면 판을 가린다 */
      const lid = new Mesh(lidGeo, bowlWood);
      lid.rotation.x = Math.PI;
      lid.position.set(sx + (who === 1 ? -r * 1.55 : r * 1.55), tall * 0.24, sz + (who === 1 ? -r * 0.3 : r * 0.3));
      lid.castShadow = true;
      lid.receiveShadow = true;
      scene.add(lid);

      const mouth = r * 0.96; /* 입 반지름 (옆선 맨 위) */
      heap.forEach(([ox, oz, high]) => {
        const bead = new Mesh(pileGeo, matFor(who));
        bead.scale.set(1, 0.46, 1);
        bead.position.set(sx + ox * mouth, tall * (0.74 * high), sz + oz * mouth);
        /* 통 속 알은 그림자를 안 진다. 통 안이라 안 보이는데 그림자 패스에 58개가 더 그려졌다 */
        bead.castShadow = !room;
        scene.add(bead);
      });
    }
  }

  const pool: Mesh[] = [];
  const stoneOf = (k: number): Mesh => {
    let m = pool[k];
    if (!m) {
      m = new Mesh(stoneGeo, matFor(1));
      /* 바둑돌은 공이 아니라 **눌린 알**이다. 세로만 납작하게. */
      m.scale.set(1, 0.46, 1);
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      pool[k] = m;
    }
    return m;
  };

  /* 마지막 수 표. 붉은 고리 하나를 옮겨 쓴다. */
  const markMat = new MeshStandardMaterial({ color: 0xe2503c, roughness: 0.5 });
  const mark = new Mesh(new CircleGeometry(CELL * 0.11, 20), markMat);
  mark.rotation.x = -Math.PI / 2;
  mark.visible = false;
  scene.add(mark);

  /* 집어 든 말. 금빛 고리 하나를 옮겨 쓴다(체커). */
  const pickMat = new MeshStandardMaterial({ color: 0xe8c15a, roughness: 0.4, metalness: 0.3 });
  const pickRing = new Mesh(new RingGeometry(CELL * 0.44, CELL * 0.52, 24), pickMat);
  pickRing.rotation.x = -Math.PI / 2;
  pickRing.visible = false;
  scene.add(pickRing);

  /* 둘 수 있는 자리. 옅은 판 조각. 눌러도 되는 곳을 판 위에서 보여 준다. */
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
  /**
   * 첫 그림 전에 셰이더를 **비동기로** 컴파일한다(three r169 `compileAsync`). 그냥 그리면 첫
   * `render` 가 컴파일까지 떠안아 1초 막힘(실측 1007ms). 끝날 때까지 안 그림
   */
  let compiled = !room;
  /* 렌더 횟수와 시간. HUD 가 읽는다 */
  let renders = 0;
  let renderMs = 0;
  const render = (): void => {
    if (!need || !compiled) return;
    need = false;
    const s0 = performance.now();
    renderer.render(scene, camera);
    renderMs += performance.now() - s0;
    renders += 1;
  };
  let resizes = 0;
  const resize = (): void => {
    resizes += 1;
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    /* 방 표현은 화소 상한 1.5. 2 로 두면 1648x842 가 3.1M 화소가 된다 */
    renderer.setPixelRatio(Math.min(room ? 1.5 : 2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    need = true;
    render();
  };

  /**
   * ── 움직임 ── (방 표현 전용)
   *
   * 판은 가만히 있어도 되는 물건이라 **상시 루프를 안 돈다**. 움직일 일이 생길 때만 루프를
   * 걸고, 다 움직이면 스스로 끈다(`gloop` 은 화면 밖에서는 셸이 멈춰 준다).
   * 그래서 판을 켜 두고 딴 일을 해도 프레임 소모 0
   *
   * 움직이는 것 셋:
   *  ① **들어올 때** 카메라가 한 걸음 물러선 자리에서 제자리로
   *  ② **알을 둘 때** 위에서 떨어져 눌렸다 펴짐. 카메라는 그쪽으로 살짝
   *  ③ **판이 끝나면** 한 걸음 다가서며 조금 더 눕힘
   */
  const STONE_Y = boardTop + CELL * 0.19;
  const DROP_MS = 260;
  const NUDGE_MS = 520;
  const ease = (t: number): number => 1 - (1 - t) ** 3;

  let shown: Stone[] = [];
  let canCells: number[] = [];
  /* 아직 떨어지는 중인 알. 칸 번호로 잡는다 — 알이 늘면 pool 자리는 밀리지만 칸은 안 밀린다 */
  const dropAt = new Map<number, number>();
  let started = false;
  let done = false;
  const look = new Vector3(0, 0, 0);
  const lookGoal = new Vector3(0, 0, 0);
  const nudge = new Vector3(0, 0, 0);
  let nudgeUntil = 0;
  let camFrom: Vector3 | null = null;
  let camT0 = 0;
  let camMs = 0;
  let loop: GardenLoop | null = null;

  /** 지금 시각의 자리에 알과 표를 놓는다. 아직 움직이는 것이 있으면 true */
  const layout = (t: number): boolean => {
    pool.forEach((m) => { m.visible = false; });
    hints.forEach((m) => { m.visible = false; });
    mark.visible = false;
    pickRing.visible = false;
    let busy = false;
    shown.forEach((st, k) => {
      const m = stoneOf(k);
      m.material = matFor(st.who);
      /* 왕은 **한 장 더 얹은 것**이라 두 배 두껍다. */
      const flat = st.king ? 0.92 : 0.46;
      const began = dropAt.get(st.cell);
      let up = 0;
      let squash = 1;
      if (began !== undefined) {
        const k2 = (t - began) / DROP_MS;
        if (k2 >= 1) dropAt.delete(st.cell);
        else {
          busy = true;
          /* 떨어지는 동안은 가속(제곱), 닿는 끝자락에 눌렸다 편다. 알이 딱 소리를 낸 것처럼 보인다 */
          up = CELL * 1.5 * (1 - Math.max(0, k2)) ** 2;
          squash = k2 > 0.82 ? 1 - Math.sin(((k2 - 0.82) / 0.18) * Math.PI) * 0.2 : 1;
        }
      }
      m.position.set(cx(st.cell), STONE_Y + up, cz(st.cell));
      m.scale.set(1 + (1 - squash) * 0.45, flat * squash, 1 + (1 - squash) * 0.45);
      m.visible = true;
      if (st.last) {
        /* 알 밑에 깔면 안 보인다(실측). 알 꼭대기 위에 얹는다 */
        mark.position.set(cx(st.cell), STONE_Y + up + CELL * 0.44 * flat + 0.006, cz(st.cell));
        mark.visible = true;
      }
      if (st.pick) {
        pickRing.position.set(cx(st.cell), boardTop + 0.005, cz(st.cell));
        pickRing.visible = true;
      }
    });
    canCells.forEach((cell, k) => {
      const m = hintOf(k);
      m.position.set(cx(cell), boardTop + 0.004, cz(cell));
      m.visible = true;
    });
    return busy;
  };

  const frame = (): void => {
    const t = performance.now();
    let busy = layout(t);
    if (camFrom) {
      const k = Math.min(1, (t - camT0) / camMs);
      camera.position.lerpVectors(camFrom, goal, ease(k));
      if (k >= 1) camFrom = null;
      else busy = true;
    }
    lookGoal.set(0, 0, 0);
    if (t < nudgeUntil) lookGoal.copy(nudge);
    look.lerp(lookGoal, 0.12);
    if (look.distanceTo(lookGoal) > 0.004) busy = true;
    else look.copy(lookGoal);
    camera.lookAt(look);
    need = true;
    render();
    if (!busy) {
      loop?.stop();
      loop = null;
    }
  };
  /* 움직일 일이 생겼다. 이미 돌고 있으면 그냥 둔다 */
  const kick = (): void => {
    if (room && !loop) loop = gloop(frame);
  };

  /**
   * ── 프레임 HUD (디버그) ── `?fps=1` 또는 localStorage `karmolab.arcade.fps=1`, 판에서 F 키
   *
   * 두 숫자를 나눠 보여 준다. **rAF** 는 브라우저가 화면을 넘기는 박자(사람이 느끼는 프레임),
   * **render** 는 이 판이 실제로 그린 횟수와 걸린 시간. 이 판은 움직일 때만 그리므로 가만히
   * 있을 때 render 0/s 는 정상이다. 그때 rAF 가 144 밑이면 판 밖(셸, 합성기, GPU)이 원인
   */
  let hud: HTMLElement | null = null;
  let hudLoop: GardenLoop | null = null;
  /* GPU 이름. SwiftShader 가 찍히면 하드웨어 가속이 꺼진 것 */
  /* 마우스 움직임 수. 움직일 때만 떨어지면 포인터 쪽(합성기, 커서 층)이 의심 */
  let moves = 0;
  const onMove = (): void => { moves += 1; };
  canvas.addEventListener('pointermove', onMove, { passive: true });
  /* Edge 강화 보안 모드는 JIT 와 WebAssembly 를 끈다. 그러면 JS 가 몇 배 느리다 */
  const jit = typeof WebAssembly !== 'undefined' ? 'jit on' : 'jit OFF (Edge 강화 보안 모드?)';
  const hudOn = (): boolean => {
    try {
      return /[?&]fps=1/.test(location.search) || localStorage.getItem('karmolab.arcade.fps') === '1';
    } catch {
      return false;
    }
  };
  const hudStop = (): void => {
    hudLoop?.stop();
    hudLoop = null;
    hud?.remove();
    hud = null;
  };
  const hudStart = (): void => {
    if (hud) return;
    hud = document.createElement('div');
    hud.className = 'ac-fps';
    hud.style.cssText = 'position:absolute;left:8px;top:8px;z-index:5;font:12px/1.4 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.6);padding:6px 8px;border-radius:var(--radius-md);pointer-events:none;white-space:pre';
    host.appendChild(hud);
    const dts: number[] = [];
    let last = 0;
    let tick = 0;
    let rendersAt = 0;
    let renderMsAt = 0;
    let lastText = performance.now();
    let beaconAt = 0;
    hudLoop = gloop(() => {
      const t = performance.now();
      if (last) dts.push(t - last);
      last = t;
      if (dts.length > 144) dts.shift();
      tick += 1;
      if (t - lastText < 250 || !hud) return;
      const span = t - lastText;
      const avg = dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length);
      const max = Math.max(...dts);
      const slow = dts.filter((d) => d > 12).length;
      const rn = renders - rendersAt;
      const rms = renderMs - renderMsAt;
      rendersAt = renders;
      renderMsAt = renderMs;
      lastText = t;
      const info = renderer.info.render;
      hud.textContent =
        `rAF ${(1000 / avg).toFixed(0)} fps  avg ${avg.toFixed(1)}ms  max ${max.toFixed(0)}ms  >12ms ${slow}/${dts.length}
` +
        `render ${((rn * 1000) / span).toFixed(0)}/s  ${rn ? (rms / rn).toFixed(1) : '-'}ms/그림  calls ${info.calls}  tris ${info.triangles}
` +
        `${canvas.width}x${canvas.height}  dpr ${(window.devicePixelRatio || 1).toFixed(2)}  ${renderer.shadowMap.type === PCFShadowMap ? 'PCF' : 'PCFSoft'} ${sun.shadow.mapSize.x}  loop ${loop ? 'on' : 'off'}  resize ${resizes}
` +
        gpuName + `
${jit}  screen ${screen.width}x${screen.height}  move ${moves * 4}/s  hidden ${document.hidden}`;
      moves = 0;
      /* 개발 서버가 있으면 숫자를 보낸다(2초마다). 사람이 HUD 를 복사할 수 없어서(pointer-events 없음) */
      beaconAt += 1;
      if (beaconAt % 8 === 0 && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
        try {
          navigator.sendBeacon('/__fps', hud.textContent || '');
        } catch {
          /* 없으면 없는 대로 */
        }
      }
      tick = 0;
    });
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'f' && ev.key !== 'F') return;
    const on = !hud;
    try {
      localStorage.setItem('karmolab.arcade.fps', on ? '1' : '0');
    } catch {
      /* 저장 못 해도 이번 판은 켠다 */
    }
    if (on) hudStart();
    else hudStop();
  };
  canvas.addEventListener('keydown', onKey);
  if (hudOn()) hudStart();

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  if (room) {
    void renderer.compileAsync(scene, camera).then(() => {
      compiled = true;
      need = true;
      render();
    }, () => {
      compiled = true;
      need = true;
      render();
    });
  }

  if (room) {
    /* ① 들어올 때. 판이 뚝 나타나는 대신 카메라가 자리를 잡는다 */
    camFrom = seat.clone().multiplyScalar(1.24);
    camFrom.y *= 1.1;
    camera.position.copy(camFrom);
    camT0 = performance.now();
    camMs = 1150;
    kick();
  }

  /**
   * 마지막으로 놓은 판의 서명. 오락실 본체는 시계 때문에 **매 프레임** 화면을 다시 부르고
   * (`arcade.ts` 의 loop), 그게 그대로 여기로 온다. 같은 판을 같은 자리에 다시 놓는 것은
   * 그림 한 장 값(실측: 가만히 있어도 초당 144번 그림). 서명이 같으면 손대지 않음
   */
  let lastKey = '';

  return {
    ok: true,
    software,
    place(stones, hint) {
      const key = stones.map((st) => `${st.cell}:${st.who}${st.last ? 'L' : ''}${st.king ? 'K' : ''}${st.pick ? 'P' : ''}`).join(',') + '|' + (hint?.can ?? []).join(',');
      if (key === lastKey) return;
      lastKey = key;
      const t = performance.now();
      if (room) {
        const before = new Set(shown.map((st) => st.cell));
        let fresh = -1;
        for (const st of stones) {
          if (!before.has(st.cell)) {
            dropAt.set(st.cell, t);
            fresh = st.cell;
          }
        }
        if (!started) {
          /* 첫 그림은 안 떨어뜨린다. 도중에 들어온 판이면 알 스무 개가 한꺼번에 쏟아진다 */
          dropAt.clear();
          started = true;
        } else if (fresh >= 0) {
          /* ② 카메라가 방금 둔 자리 쪽으로 살짝 끌렸다 돌아온다. 판이 흔들리면 안 된다 */
          nudge.set(cx(fresh) * 0.09, 0, cz(fresh) * 0.09);
          nudgeUntil = t + NUDGE_MS;
        }
      }
      shown = stones;
      canCells = hint?.can ?? [];
      layout(t);
      need = true;
      render();
      if (dropAt.size || t < nudgeUntil) kick();
    },
    finish() {
      if (!room || done) return;
      done = true;
      /* ③ 한 걸음 다가서고 조금 더 눕는다. 끝난 판을 보여 주는 자리 */
      goal.copy(seat).multiplyScalar(0.87);
      goal.y = seat.y * 0.8;
      camFrom = camera.position.clone();
      camT0 = performance.now();
      camMs = 1400;
      kick();
    },
    resize,
    dispose() {
      loop?.stop();
      loop = null;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointermove', onMove);
      hudStop();
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      [...mats.values(), ...bowlMats, wood, side, ink, dot, darkMat, markMat, hintMat, pickMat, floorMat, plankMat, outsideMat].forEach((mm) => mm.dispose());
      plankMap.dispose();
      shojiMap.dispose();
      woodMap.dispose();
      sideMap.dispose();
      floorMap.dispose();
      renderer.dispose();
      canvas.remove();
    }
  };
}
