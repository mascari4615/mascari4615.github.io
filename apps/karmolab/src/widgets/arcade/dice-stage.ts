/**
 * 주사위 무대. **밤의 바 카운터** (Three.js). change.arcade-redesign
 *
 * `three-board.ts` 가 격자판의 무대라면 여기는 굴리는 놀이의 무대다. 나무 카운터 위에
 * 펠트 깐 쟁반, 가죽 컵, 종이 점수표 한 장. 컵을 누르면 흔들어 쏟고, 주사위를 누르면 남기고,
 * 종이를 누르면 카메라가 내려가 적는 자리로
 *
 * 물리는 **진짜**(`dice-physics.ts`). 굴리는 순간 끝까지 계산해 두고 녹화본 재생.
 * 어느 면이 위로 오나는 시뮬레이션이 정하고, 커널이 정한 눈(`yacht.ts`)은 그 면에 **붙인다**
 * (면 배치를 돌린다. 마주 보는 면의 합 7 은 그대로). 흉내 물리(마지막에 정해진 눈으로 슬러프)는
 * 면이 뒤집히고 끊기고 바닥에 안 닿았다(사용자 지적 3건).
 *
 * 규칙은 이 파일을 모름. 상태를 받아 놓고, 손을 밖으로
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PointLight,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer
} from '/packages/3d/vendor/three.module.min.js';
import { gloop, type GardenLoop } from '../garden/gloop';
import { dieFaceTexture, feltTexture, leatherTexture, paperTexture, plankTexture, woodTexture } from './texture';
import { simulateRoll, simulateInCup, sample, type Track } from './dice-physics';
import { buildRoom, type Room } from './rooms';
import type { SceneId } from './scenes';

export interface DiceStageOpts {
  /** 주사위 몇 개 */
  count: number;
  /** 방. 바 카운터는 이 파일이 짓고, 나머지 넷은 `rooms.ts`(오목과 같은 방) */
  scene?: SceneId;
  /** 주사위를 눌렀다 (남기기) */
  onDie: (i: number) => void;
  /** 컵을 눌렀다 (굴리기) */
  onCup: () => void;
  /** 종이를 눌렀다 (적기) */
  onPaper: () => void;
  /** 소리. 무대는 소리를 안 만들고 언제인지만 알린다 */
  onSound?: (kind: 'rattle' | 'clatter' | 'slide', force: number) => void;
  /** 종이 위 그림. 점수표는 부르는 쪽이 안다 */
  drawSheet: (c: CanvasRenderingContext2D, w: number, h: number) => void;
}

export interface DiceStage {
  ok: boolean;
  software: boolean;
  /**
   * 눈과 남긴 자리 배치. `roll` 이면 남기지 않은 것이 컵에서 쏟아짐.
   * 아니면 남김이 바뀐 것만 쟁반과 선반 사이 이동
   */
  set(dice: number[], keep: boolean[], roll: boolean): void;
  /** 연출 배속. 남의 차례는 빠르게(한 봇 차례가 15초였다. 실측) */
  speed(mul: number): void;
  /** 남은 굴리기 수. 쟁반 앞 놋쇠 버튼이 그만큼 켜짐 */
  rollsLeft(n: number): void;
  /** 손이 닿는 것이 있나. 아니면 커서와 들림이 꺼진다 */
  canAct(v: boolean): void;
  /** 종이 앞으로 카메라를 내리거나 되돌린다 */
  sheetMode(on: boolean): void;
  /** 종이 위 그림을 다시 그린다 */
  sheetDirty(): void;
  /** 판이 끝났다. 카메라가 종이 쪽으로 */
  finish(): void;
  /** 적는다. 연필이 종이 위를 긋고 돌아온다 */
  write(): void;
  resize(): void;
  dispose(): void;
}

/* 주사위 한 변. 다른 치수는 전부 이것의 배수 */
const D = 1;
/* 쟁반 안쪽. 레퍼런스는 주사위 다섯 개 반이었으나 다른 물건에 비해 주사위가 커 보였다(사용자 지적).
   실물 비율에 가깝게. 16mm 주사위에 쟁반 18cm, 컵 지름 5.5cm, 종이 엽서 */
const TRAY_W = 11;
const ROLL_Z0 = -1.9; /* 구르는 자리 (먼 쪽) */
const ROLL_Z1 = 5.4; /* 구르는 자리 (앞) */
const RAIL_Z = -3.3; /* 남긴 주사위 선반 */
const TRAY_Z0 = -4.5;
const WALL = 0.4;
const FLOOR_Y = 0.16;
const REST_Y = FLOOR_Y + D / 2;

/* 눈마다 상자의 어느 면인가. 마주 보는 면의 합은 7 */
const FACE_NORMAL: Record<number, Vector3> = {
  1: new Vector3(1, 0, 0),
  6: new Vector3(-1, 0, 0),
  2: new Vector3(0, 1, 0),
  5: new Vector3(0, -1, 0),
  3: new Vector3(0, 0, 1),
  4: new Vector3(0, 0, -1)
};
/* BoxGeometry 재질 순서: +x, -x, +y, -y, +z, -z */
const FACE_ORDER = [1, 6, 2, 5, 3, 4];
const UP = new Vector3(0, 1, 0);

const ease = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Die {
  mesh: Mesh;
  value: number;
  kept: boolean;
  /* 쟁반 위 자기 자리 */
  spot: Vector3;
  /* 지금 있는 자리와 눈. 움직임이 없으면 이것이 곧 mesh */
  pos: Vector3;
  quat: Quaternion;
  /* 날아가는 중. 녹화본과 그 시작 시각(ms). 0 이면 안 나는 중 */
  track: Track | null;
  released: number;
  hitIdx: number;
  /* 이 주사위의 면 배치. 굴릴 때마다 위로 온 면에 눈을 붙이느라 돌린다 */
  faces: MeshStandardMaterial[];
  /* 남기기와 되돌리기, 컵으로 들어가기. 두 자리 사이를 한 호로 */
  moveFrom: Vector3 | null;
  /* 이 이동이 끝나면 컵 안 */
  gather: boolean;
  /* 컵 안에 있다. 컵 좌표계 녹화본을 컵을 따라 재생한다 */
  inCup: boolean;
  cupTrack: Track | null;
  cupT0: number;
  moveTo: Vector3;
  moveT0: number;
  hover: boolean;
  /* 손으로 끌리는 중. 자리 계산을 건너뛴다 */
  dragging: boolean;
}

export function mountDiceStage(host: HTMLElement, opts: DiceStageOpts): DiceStage {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none';
  canvas.tabIndex = 0;
  host.appendChild(canvas);

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    host.removeChild(canvas);
    return {
      ok: false, software: false,
      set: () => {}, speed: () => {}, rollsLeft: () => {}, canAct: () => {}, sheetMode: () => {}, sheetDirty: () => {}, finish: () => {}, write: () => {}, resize: () => {}, dispose: () => {}
    };
  }
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
  /* 주사위 다섯이라 부드러운 그림자를 감당한다(오목은 알 200개라 PCF) */
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  /* 1.0 은 컵이 어둠에 묻혀 있는지도 몰랐다(사용자 지적). 등불 아래만 밝되 물건은 다 보이게 */
  renderer.toneMappingExposure = 1.15;

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 80);
  const sceneId: SceneId = opts.scene ?? 'bar';
  const bar = sceneId === 'bar';
  host.classList.add('ac-scene-' + sceneId);

  /**
   * 카메라 자리 둘. **탁자**는 쟁반을 가운데 두고 비스듬히(레퍼런스 실측: 스팀 두 판 모두
   * 45~60도 부감). 왼쪽에 종이, 오른쪽에 컵. **종이**는 종이 바로 위에서 부감
   */
  const PAPER_AT = new Vector3(-8.8, 0.02, 1.6);
  /**
   * 레퍼런스 실측: 주사위 한 변이 화면 폭의 7~8%, 쟁반이 폭의 42%. 가까이 두면 폭의 19% (실측)
   * 거리는 **창 비율로 결정**. 세로 화각만 고정하면 좁은 창에서 가로가 잘려 주사위가 큼
   * (실측: 1280 폭에서 14%, 1920 폭에서 10%). 종이 왼끝부터 컵 오른끝까지(30) 가 가로에,
   * 쟁반 앞뒤(17) 가 세로에 들어오는 거리 중 먼 쪽
   */
  const tableLook = new Vector3(0.1, 0, 0.5);
  const tableDir = new Vector3(0.2, 10.6, 8.4).normalize();
  const tableSeat = new Vector3();
  const fitTable = (): Vector3 => {
    const half = Math.tan((camera.fov * Math.PI) / 360);
    /* 세로 화면(폰)은 종이와 컵을 안 담는다. 종이는 HTML 이 위에 있고 굴리기는 카드의 버튼이 한다(실측: 담으니 쟁반이 화면의 8%) */
    const tall = camera.aspect < 0.9;
    const d = tall
      ? Math.max(7.5 / (half * camera.aspect), 7 / half)
      : Math.max(15 / (half * camera.aspect), 8.5 / half);
    return tableSeat.copy(tableLook).addScaledVector(tableDir, d);
  };
  fitTable();
  const sheetSeat = new Vector3(PAPER_AT.x + 0.05, 8.0, PAPER_AT.z + 1.8);
  const sheetLook = new Vector3(PAPER_AT.x, 0, PAPER_AT.z + 0.1);
  const goal = tableSeat.clone();
  const lookGoal = tableLook.clone();
  const look = tableLook.clone();
  camera.position.copy(tableSeat);
  camera.lookAt(look);

  /* ── 방 ── 바 카운터는 여기서. 나머지 넷은 오목과 같은 방(`rooms.ts`). 방이 빛과 바닥을 다 놓는다 */
  const room: Room | null = bar ? null : buildRoom(scene, sceneId, TRAY_W);
  /* ── 빛(바) ── 천장 등 하나가 쟁반에 떨어진다. 방은 어둡고 등 아래만 밝다 */
  const lamp = new SpotLight(0xffc98a, 3.2, 0, 0.85, 0.6, 0);
  if (bar) {
    scene.add(new AmbientLight(0xffffff, 0.3));
    scene.add(new HemisphereLight(0x8a6a48, 0x0a0705, 0.7));
    lamp.position.set(0.6, 12.5, 2.0);
    lamp.target.position.set(0, 0, 0.6);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.radius = 4;
    lamp.shadow.camera.near = 3;
    lamp.shadow.camera.far = 26;
    lamp.shadow.bias = -0.0003;
    lamp.shadow.normalBias = 0.035;
    scene.add(lamp);
    scene.add(lamp.target);
    /* 종이가 읽혀야 한다. 왼쪽에 약한 보조광 */
    const fill = new DirectionalLight(0xffd9b0, 0.55);
    fill.position.set(-10, 9, 6);
    scene.add(fill);
    /* 컵 쪽 촛불. 컵이 등불 가장자리라 어둠에 묻혔다(사용자 지적). 거리 감쇠 없이 낮게 */
    const candle = new PointLight(0xffb070, 1.1, 0, 0);
    candle.position.set(12, 3.5, 5.5);
    scene.add(candle);
  }

  /* ── 카운터 ── 니스 칠한 널. 어둡고 조금 비친다 */
  const counterMap = new CanvasTexture(plankTexture(31, 512));
  counterMap.colorSpace = SRGBColorSpace;
  counterMap.wrapS = RepeatWrapping;
  counterMap.wrapT = RepeatWrapping;
  counterMap.repeat.set(2.5, 2.5);
  counterMap.anisotropy = 8;
  /* 결을 범프로도 쓴다. 색만 있으면 매끈한 유리판 위 그림(사용자 지적: 스펙큘러만 세고 질감이 없다) */
  const counterMat = new MeshStandardMaterial({ map: counterMap, bumpMap: counterMap, bumpScale: 0.06, color: 0x8a5e3a, roughness: 0.64, metalness: 0 });
  const counter = new Mesh(new PlaneGeometry(40, 40), counterMat);
  counter.rotation.x = -Math.PI / 2;
  counter.receiveShadow = true;
  if (bar) scene.add(counter);

  /* ── 뒤쪽 ── 어두운 벽과 병 선반. 병은 빛나는 상자 몇 개. 디테일을 그리면 눈이 거기로 간다 */
  const wallMat = new MeshStandardMaterial({ color: 0x120c08, roughness: 1 });
  const wall = new Mesh(new PlaneGeometry(60, 24), wallMat);
  wall.position.set(0, 12, -17);
  if (bar) scene.add(wall);
  const shelfMat = new MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7 });
  const bottleMats: MeshStandardMaterial[] = [];
  for (let row = 0; row < (bar ? 2 : 0); row += 1) {
    const shelf = new Mesh(new BoxGeometry(40, 0.2, 2), shelfMat);
    shelf.position.set(0, 3.2 + row * 3.6, -16);
    scene.add(shelf);
    /* 병은 어둡게. 빛나는 막대로 두니 카메라를 물리자 천장에 색 막대가 떠 있었다(실측) */
    const n = 13;
    for (let i = 0; i < n; i += 1) {
      const hue = [0x8a4a12, 0x3c6a2a, 0x24507f, 0x7a2424, 0x8a7030][(i + row * 3) % 5];
      const m = new MeshStandardMaterial({ color: hue, emissive: hue, emissiveIntensity: 0.16, roughness: 0.22, transparent: true, opacity: 0.9 });
      bottleMats.push(m);
      const h = 2.0 + ((i * 7 + row * 3) % 4) * 0.3;
      const b = new Mesh(new CylinderGeometry(0.3, 0.36, h, 10), m);
      b.position.set(-18 + i * 3 + (row ? 1.5 : 0), 3.3 + row * 3.6 + h / 2, -16);
      scene.add(b);
    }
  }

  /* ── 쟁반 ── 펠트 바닥에 나무 테. 먼 쪽에 남긴 주사위 선반 */
  const feltMap = new CanvasTexture(feltTexture(11, 256));
  feltMap.colorSpace = SRGBColorSpace;
  feltMap.wrapS = RepeatWrapping;
  feltMap.wrapT = RepeatWrapping;
  feltMap.repeat.set(5, 5);
  const feltMat = new MeshStandardMaterial({ map: feltMap, bumpMap: feltMap, bumpScale: 0.025, color: 0x2a7a58, roughness: 0.98 });
  const trayDepth = ROLL_Z1 - TRAY_Z0;
  const trayCz = (ROLL_Z1 + TRAY_Z0) / 2;
  const felt = new Mesh(new PlaneGeometry(TRAY_W, trayDepth), feltMat);
  felt.rotation.x = -Math.PI / 2;
  /* 상자 윗면과 같은 높이면 z-싸움으로 나무가 이긴다(실측: 펠트가 갈색으로 보였다). 한 겹 위 */
  felt.position.set(0, FLOOR_Y + 0.004, trayCz);
  felt.receiveShadow = true;
  scene.add(felt);
  const trayWoodMap = new CanvasTexture(woodTexture(23, 256));
  trayWoodMap.colorSpace = SRGBColorSpace;
  const trayWood = new MeshStandardMaterial({ map: trayWoodMap, bumpMap: trayWoodMap, bumpScale: 0.03, color: 0x4a2c1a, roughness: 0.6 });
  const base = new Mesh(new BoxGeometry(TRAY_W + WALL * 2, FLOOR_Y, trayDepth + WALL * 2), trayWood);
  base.position.set(0, FLOOR_Y / 2, trayCz);
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);
  const wallH = 0.9;
  const mkWall = (w: number, d: number, x: number, z: number): void => {
    const m = new Mesh(new BoxGeometry(w, wallH, d), trayWood);
    m.position.set(x, wallH / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  mkWall(TRAY_W + WALL * 2, WALL, 0, TRAY_Z0 - WALL / 2);
  mkWall(TRAY_W + WALL * 2, WALL, 0, ROLL_Z1 + WALL / 2);
  mkWall(WALL, trayDepth, -TRAY_W / 2 - WALL / 2, trayCz);
  mkWall(WALL, trayDepth, TRAY_W / 2 + WALL / 2, trayCz);
  /* 선반 칸막이. 낮은 나무 턱 */
  /* 선반 홈 5칸. 남긴 주사위가 놓일 자리가 보여야 다섯을 확정한다는 것을 안다(사용자 지적. 클럽하우스 51 실화면도 홈 5칸) */
  const slotMat = new MeshStandardMaterial({ color: 0x0c2a1c, roughness: 1 });
  const slotN = opts.count;
  for (let i = 0; i < slotN; i += 1) {
    const sx = -TRAY_W / 2 + 1.6 + i * ((TRAY_W - 3.2) / Math.max(1, slotN - 1));
    const hole = new Mesh(new PlaneGeometry(1.5, 1.5), slotMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(sx, FLOOR_Y + 0.006, RAIL_Z);
    hole.receiveShadow = true;
    scene.add(hole);
    const rim = new Mesh(new BoxGeometry(1.62, 0.1, 1.62), trayWood);
    rim.position.set(sx, FLOOR_Y + 0.05, RAIL_Z);
    scene.add(rim);
    const rimHole = new Mesh(new BoxGeometry(1.5, 0.12, 1.5), slotMat);
    rimHole.position.set(sx, FLOOR_Y + 0.05, RAIL_Z);
    scene.add(rimHole);
  }
  const divider = new Mesh(new BoxGeometry(TRAY_W, 0.34, 0.16), trayWood);
  divider.position.set(0, FLOOR_Y + 0.17, (ROLL_Z0 + RAIL_Z) / 2 + 0.7);
  divider.castShadow = true;
  scene.add(divider);

  /* 남은 굴리기. 쟁반 앞턱의 놋쇠 버튼 셋 */
  const brassOff = new MeshStandardMaterial({ color: 0x5a4320, roughness: 0.45, metalness: 0.7 });
  const brassOn = new MeshStandardMaterial({ color: 0xf0c060, emissive: 0xb8781a, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.7 });
  const pips: Mesh[] = [];
  for (let i = 0; i < 3; i += 1) {
    const p = new Mesh(new CylinderGeometry(0.14, 0.14, 0.06, 14), brassOff);
    p.position.set(-0.55 + i * 0.55, wallH + 0.03, ROLL_Z1 + WALL / 2);
    scene.add(p);
    pips.push(p);
  }

  /* ── 컵 ── 가죽. 오른쪽에 서 있다가 흔들고 쏟고 돌아온다 */
  const leatherMap = new CanvasTexture(leatherTexture(47, 256));
  leatherMap.colorSpace = SRGBColorSpace;
  const leather = new MeshStandardMaterial({ map: leatherMap, bumpMap: leatherMap, bumpScale: 0.05, color: 0xffffff, roughness: 0.7, side: DoubleSide });
  const cup = new Group();
  const CUP_R = 1.7;
  const CUP_H = 3.1;
  const cupProfile: Array<[number, number]> = [
    [0, 0], [0.86, 0], [0.92, 0.04], [0.95, 0.12], [0.9, 0.45], [0.88, 0.75], [0.93, 0.92], [1, 1]
  ];
  const cupGeo = new LatheGeometry(cupProfile.map(([x, y]) => new Vector2(x * CUP_R, y * CUP_H)), 36);
  const cupMesh = new Mesh(cupGeo, leather);
  cupMesh.castShadow = true;
  cupMesh.receiveShadow = true;
  cup.add(cupMesh);
  /* 입에 두른 띠. 실제 컵은 입이 한 겹 더 두껍다 */
  const lipMat = new MeshStandardMaterial({ color: 0x2a140b, roughness: 0.6 });
  const lip = new Mesh(new CylinderGeometry(CUP_R * 1.03, CUP_R * 1.0, 0.14, 36, 1, true), lipMat);
  lip.material.side = DoubleSide;
  lip.position.y = CUP_H - 0.1;
  cup.add(lip);
  const CUP_REST = new Vector3(TRAY_W / 2 + WALL + 2.2, 0, 2.2);
  cup.position.copy(CUP_REST);
  scene.add(cup);

  /* ── 종이 ── 점수표. 카운터 왼쪽에 살짝 비스듬히. 연필 하나 */
  const SHEET_W = 512;
  const SHEET_H = 704;
  const sheetCv = document.createElement('canvas');
  sheetCv.width = SHEET_W;
  sheetCv.height = SHEET_H;
  const sheetCtx = sheetCv.getContext('2d') as CanvasRenderingContext2D;
  const paperGrain = paperTexture(53, 256);
  const drawPaper = (): void => {
    sheetCtx.clearRect(0, 0, SHEET_W, SHEET_H);
    const pat = sheetCtx.createPattern(paperGrain, 'repeat');
    sheetCtx.fillStyle = pat ?? '#f4ecd8';
    sheetCtx.fillRect(0, 0, SHEET_W, SHEET_H);
    opts.drawSheet(sheetCtx, SHEET_W, SHEET_H);
  };
  drawPaper();
  const sheetMap = new CanvasTexture(sheetCv);
  sheetMap.colorSpace = SRGBColorSpace;
  sheetMap.anisotropy = 8;
  const paperMat = new MeshStandardMaterial({ map: sheetMap, roughness: 0.92 });
  const PAPER_SIZE = 4.6;
  const paper = new Mesh(new PlaneGeometry(PAPER_SIZE, PAPER_SIZE * (SHEET_H / SHEET_W)), paperMat);
  paper.rotation.x = -Math.PI / 2;
  paper.rotation.z = 0.09;
  paper.position.copy(PAPER_AT);
  paper.receiveShadow = true;
  scene.add(paper);
  const pencilMat = new MeshStandardMaterial({ color: 0xd9a12b, roughness: 0.5 });
  const pencil = new Mesh(new CylinderGeometry(0.07, 0.07, 3.2, 8), pencilMat);
  pencil.rotation.z = Math.PI / 2;
  pencil.rotation.y = 0.35;
  pencil.position.set(PAPER_AT.x + 1.8, 0.08, PAPER_AT.z + 3.6);
  pencil.castShadow = true;
  scene.add(pencil);

  /* ── 먼지 ── 등불 아래 공중. 방이 살아 있다는 표 */
  const moteN = 90;
  const motePos = new Float32Array(moteN * 3);
  for (let i = 0; i < moteN; i += 1) {
    motePos[i * 3] = (Math.random() - 0.5) * 12;
    motePos[i * 3 + 1] = 0.4 + Math.random() * 7;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 10 + 0.5;
  }
  const moteGeo = new BufferGeometry();
  moteGeo.setAttribute('position', new Float32BufferAttribute(motePos, 3));
  const moteMat = new PointsMaterial({ color: 0xffdca0, size: 0.03, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const motes = new Points(moteGeo, moteMat);
  if (bar) scene.add(motes);

  /* ── 주사위 ── 면마다 눈을 구운 상자. 한 벌만 굽고 다섯이 나눠 쓴다 */
  const faceMaps = FACE_ORDER.map((v) => {
    const m = new CanvasTexture(dieFaceTexture(v, 128));
    m.colorSpace = SRGBColorSpace;
    m.anisotropy = 4;
    return m;
  });
  const faceMats = faceMaps.map((map) => new MeshStandardMaterial({ map, roughness: 0.34, metalness: 0.02 }));
  /**
   * 둥근 주사위. 상자를 잘게 나눈 뒤 꼭짓점을 **안쪽 작은 상자에서 반지름만큼 밀어낸 자리**로 옮김
   * (사용자 지적: 직각 정육면체는 도형이지 주사위가 아님). three 의 RoundedBoxGeometry 는
   * 예제 모듈이라 받아 둔 것에 없음. 면 그룹은 그대로라 눈 재질 여섯 장이 그대로 붙음
   */
  const roundedBox = (size: number, radius: number, segs: number): BoxGeometry => {
    const g = new BoxGeometry(size, size, size, segs, segs, segs);
    const pos = g.getAttribute('position') as { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number; setXYZ(i: number, x: number, y: number, z: number): void; needsUpdate: boolean };
    const nor = g.getAttribute('normal') as { setXYZ(i: number, x: number, y: number, z: number): void; needsUpdate: boolean };
    const inner = size / 2 - radius;
    const v = new Vector3();
    const c = new Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      c.set(Math.max(-inner, Math.min(inner, v.x)), Math.max(-inner, Math.min(inner, v.y)), Math.max(-inner, Math.min(inner, v.z)));
      v.sub(c);
      /* 법선은 안쪽 상자에서 밖으로 향하는 방향. 면마다 따로 계산하면 이음새에 각이 남는다(사용자 지적: 면이 뚝뚝 끊긴다) */
      if (v.lengthSq() > 1e-9) {
        v.normalize();
        nor.setXYZ(i, v.x, v.y, v.z);
        v.multiplyScalar(radius);
      }
      v.add(c);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    return g;
  };
  const dieGeo = roundedBox(D, D * 0.16, 12);
  const dice: Die[] = [];
  for (let i = 0; i < opts.count; i += 1) {
    const faces = faceMats.slice();
    const mesh = new Mesh(dieGeo, faces);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    dice.push({
      mesh, value: 1, kept: false,
      spot: new Vector3(0, REST_Y, 1), pos: new Vector3(0, REST_Y, 1), quat: new Quaternion(),
      track: null, released: 0, hitIdx: 0, faces,
      moveFrom: null, gather: false, inCup: false, cupTrack: null, cupT0: 0, moveTo: new Vector3(), moveT0: 0, hover: false, dragging: false
    });
  }
  const slotX = (k: number): number => -TRAY_W / 2 + 1.6 + k * ((TRAY_W - 3.2) / Math.max(1, opts.count - 1));
  /* 주사위 i 가 앉는 홈. 홈에서 끌어 순서를 바꿀 수 있다(사용자 요청). 규칙에는 순서가 없으니 화면만 */
  const slotOf: number[] = dice.map((_, i) => i);
  const railPos = (i: number): Vector3 => new Vector3(slotX(slotOf[i]), REST_Y, RAIL_Z);
  /**
   * 면마다 눈 그림의 **위쪽**이 몸체 어느 축인가(BoxGeometry 의 UV). 옆면 넷은 +y, 윗면은 -z, 아랫면은 +z.
   * 멎을 때 그림 위쪽이 화면 위(월드 -z)를 보도록 네 방향 중 하나를 고르면 6 이 늘 세로 두 줄, 2 와 3 은 늘 같은 대각
   * (사용자 지적. 6 이 가로세로 제각각, 숫자 6 과 9 처럼 정방향이 있어야 함)
   */
  const texUpFor = (n: Vector3): Vector3 => (Math.abs(n.y) > 0.5 ? new Vector3(0, 0, n.y > 0 ? -1 : 1) : new Vector3(0, 1, 0));
  const SCREEN_UP = new Vector3(0, 0, -1);

  /* 기하 면 순서(+x, -x, +y, -y, +z, -z)의 법선 */
  const GEOM_NORMALS = [
    new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 1, 0),
    new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)
  ];
  /* 표준 배치. 기하 면 i 에 FACE_ORDER[i] 눈 */
  const standardFaces = (d: Die): void => {
    FACE_ORDER.forEach((v, gi) => { d.faces[gi] = faceMats[gi]; void v; });
    d.mesh.material = d.faces;
  };
  /**
   * 위로 온 면(로컬 법선 `upLocal`)에 눈 v 가 오도록 **녹화본 전체를 몸체 대칭으로 돌린다**.
   * 정육면체는 90도 대칭이라 움직임은 그대로, 어느 면이 어디를 보나만 변경.
   * 재질을 면 사이에서 옮기면 2, 3, 6 의 대각 점 방향이 이웃 면과 어긋나 주사위마다 다른
   * 물건처럼 보였다(사용자 지적). 재질은 표준 배치에 고정
   */
  const bodyTurn = (tr: Track, upLocal: Vector3, v: number): void => {
    const r = new Quaternion().setFromUnitVectors(FACE_NORMAL[v] ?? UP, upLocal);
    const endQ = tr.frames[tr.frames.length - 1].quat;
    const texUp = texUpFor(FACE_NORMAL[v] ?? UP);
    /* 네 방향 중 그림 위쪽이 화면 위를 보는 것 */
    let bodyR = new Quaternion();
    let bestDot = -2;
    for (let k = 0; k < 4; k += 1) {
      const cand = new Quaternion().setFromAxisAngle(upLocal, k * (Math.PI / 2)).multiply(r);
      const world = texUp.clone().applyQuaternion(endQ.clone().multiply(cand));
      const dd = world.dot(SCREEN_UP);
      if (dd > bestDot) { bestDot = dd; bodyR = cand; }
    }
    for (const f of tr.frames) f.quat.multiply(bodyR);
    /* 불변식. 마지막 자세에서 위를 보는 몸체 면이 v 여야 한다. 아니면 눈이 틀린 것 */
    const end = tr.frames[tr.frames.length - 1];
    const upBody = new Vector3(0, 1, 0).applyQuaternion(end.quat.clone().invert());
    let shown = 0;
    let bd = -2;
    for (let val = 1; val <= 6; val += 1) {
      const dd = FACE_NORMAL[val].dot(upBody);
      if (dd > bd) { bd = dd; shown = val; }
    }
    if (shown !== v) console.warn('[dice-stage] 눈이 어긋났다. 정한 눈', v, '보이는 눈', shown);
  };
  void GEOM_NORMALS;
  /* 눈 v 가 위로 오는 자세(표준 배치에서). 그 위에 아무 방향으로 한 바퀴 돌린 것. 안 굴리고 놓을 때 */
  const upright = (d: Die, v: number): void => {
    standardFaces(d);
    const q = new Quaternion().setFromUnitVectors(FACE_NORMAL[v] ?? UP, UP);
    const texUp = texUpFor(FACE_NORMAL[v] ?? UP);
    let best = q;
    let bd = -2;
    for (let k = 0; k < 4; k += 1) {
      const cand = new Quaternion().setFromAxisAngle(UP, k * (Math.PI / 2)).multiply(q);
      const dd = texUp.clone().applyQuaternion(cand).dot(SCREEN_UP);
      if (dd > bd) { bd = dd; best = cand; }
    }
    d.quat.copy(best);
  };

  /* 쟁반에 흩어질 자리. 서로 한 변 넘게 떨어지게. 못 찾으면 줄로 */
  const scatter = (which: number[]): void => {
    const taken: Vector3[] = dice.filter((d, i) => !which.includes(i) && !d.kept && d.mesh.visible).map((d) => d.spot);
    const x0 = -TRAY_W / 2 + D * 0.8;
    const x1 = TRAY_W / 2 - D * 0.8;
    const z0 = ROLL_Z0 + D * 0.9;
    const z1 = ROLL_Z1 - D * 0.8;
    for (const i of which) {
      let best: Vector3 | null = null;
      for (let tries = 0; tries < 80 && !best; tries += 1) {
        const p = new Vector3(x0 + Math.random() * (x1 - x0), REST_Y, z0 + Math.random() * (z1 - z0));
        if (taken.every((q) => q.distanceTo(p) > D * 1.5)) best = p;
      }
      if (!best) best = new Vector3(x0 + ((i + 0.5) / opts.count) * (x1 - x0), REST_Y, (z0 + z1) / 2);
      taken.push(best);
      dice[i].spot.copy(best);
    }
  };

  /* ── 컵 움직임 ── 흔들기 → 기울여 쏟기 → 되돌아오기. 시각은 ms */
  const SHAKE_MS = 420;
  const TIP_MS = 260;
  const RELEASE_AT = SHAKE_MS + TIP_MS * 0.75;
  const RETURN_AT = SHAKE_MS + TIP_MS + 420;
  const RETURN_MS = 520;
  let cupT0 = 0;
  /* 연출 배속. 1 이 내 차례, 남의 차례는 더 빠르다. 흔들기와 쏟기와 재생에 다 걸린다 */
  let speedMul = 1;
  let pendingRelease: number[] = [];
  /* 컵이 도는 중에 온 다음 굴림. 봇은 컵이 돌아오기 전에 또 굴린다(0.5~0.9초). 끝나면 이어서 */
  let queued: number[] = [];
  const TIP_U = easeInOut(0.75);
  /* 모으기 0.3초 뒤 컵 바닥까지 떨어질 시간까지. 짧으면 입에 얹힌 채 흔든다(실측) */
  const GATHER_MS = 720;
  /** 흔들기 시작부터 k ms 뒤 컵의 자리와 z 기울기. `cupAt` 도 이것을 그린다 */
  const cupPose = (k: number, out: Vector3): number => {
    if (k < 0) {
      out.copy(CUP_REST);
      return 0;
    }
    if (k < SHAKE_MS) {
      const sh = k / 1000;
      out.set(CUP_REST.x + Math.sin(sh * 95) * 0.14, CUP_REST.y + Math.abs(Math.sin(sh * 47)) * 0.4, CUP_REST.z + Math.cos(sh * 71) * 0.1);
      return Math.sin(sh * 88) * 0.14;
    }
    const u = easeInOut(Math.min(1, (k - SHAKE_MS) / TIP_MS));
    out.set(CUP_REST.x - 2.8 * u, CUP_REST.y + 2.6 * u, CUP_REST.z - 0.5 * u);
    return 1.95 * u;
  };
  const G_SIM = 26;
  const Z_AXIS = new Vector3(0, 0, 1);
  const shake = (which: number[], t: number): void => {
    /* 컵이 놓는 자리. `cupAt` 의 기울기 식과 같은 값 */
    const tilt = 1.95 * TIP_U;
    const mouth = new Vector3(
      CUP_REST.x - 2.8 * TIP_U - Math.sin(tilt) * CUP_H,
      CUP_REST.y + 2.6 * TIP_U + Math.cos(tilt) * CUP_H,
      CUP_REST.z - 0.5 * TIP_U
    );
    const inputs = which.map((i, n) => ({
      t0: n * 0.07,
      pos: mouth.clone().add(new Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)),
      /* 세기와 방향을 넓게 벌린다. 비슷하면 왼쪽 벽에 한 줄로 늘어선다(실측) */
      vel: new Vector3(-3.5 - Math.random() * 7, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 8),
      quat: new Quaternion().setFromAxisAngle(new Vector3(Math.random(), Math.random(), Math.random()).normalize(), Math.random() * 6),
      ang: new Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22)
    }));
    const tracks = simulateRoll(inputs, { floorY: FLOOR_Y, xMin: -TRAY_W / 2, xMax: TRAY_W / 2, zMin: ROLL_Z0, zMax: ROLL_Z1 });
    /* 먼저 쟁반에서 컵으로 모은다. 빈 컵을 흔들면 어색하다(사용자 지적). 모인 뒤에 흔든다 */
    const mouthTop = new Vector3(CUP_REST.x, CUP_H + 0.7, CUP_REST.z);
    which.forEach((i, n) => {
      const d = dice[i];
      const tr = tracks[n];
      d.track = tr;
      d.released = t + (GATHER_MS + RELEASE_AT) / speedMul;
      d.hitIdx = 0;
      d.moveFrom = d.mesh.visible ? d.mesh.position.clone() : null;
      d.gather = d.moveFrom !== null;
      d.moveTo.copy(mouthTop).add(new Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6));
      d.moveT0 = t + (n * 40) / speedMul;
      d.inCup = d.moveFrom === null;
      d.cupT0 = t;
      /* 멎은 자세에서 위로 온 면에 정해진 눈 */
      standardFaces(d);
      bodyTurn(tr, tr.upLocal, d.value);
      const end = tr.frames[tr.frames.length - 1];
      d.spot.copy(end.pos);
      d.quat.copy(end.quat);
    });
    /* 컵 안. 입에서 떨어져 쌓이고, 컵이 흔들리면 관성으로 튀고, 기울면 입 쪽으로 미끄러진다 */
    const pa = new Vector3();
    const pb = new Vector3();
    const pc = new Vector3();
    const cupInputs = which.map((i, n) => {
      const d = dice[i];
      return {
        t0: (n * 40 + MOVE_MS) / 1000,
        pos: new Vector3(d.moveTo.x - CUP_REST.x, CUP_H + 0.7, d.moveTo.z - CUP_REST.z),
        vel: new Vector3(0, -5, 0),
        quat: d.quat.clone(),
        ang: new Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6)
      };
    });
    const cupTracks = simulateInCup(cupInputs, {
      radius: CUP_R * 0.86,
      height: CUP_H,
      duration: (GATHER_MS + RELEASE_AT + 150) / 1000,
      /* 손바닥. 기울기 시작하고 한 뼘 돌 때까지 입을 막는다 */
      lidUntil: (GATHER_MS + SHAKE_MS + TIP_MS * 0.35) / 1000,
      gAt: (ts, out) => {
        const k = ts * 1000 - GATHER_MS;
        /* 컵의 가속을 수치 미분. 관성력은 그 반대 방향. 흔드는 진폭이 실물보다 커서 0.06 배 */
        const dk = 8;
        cupPose(k - dk, pa);
        const rz = cupPose(k, pb);
        cupPose(k + dk, pc);
        out.copy(pa).add(pc).addScaledVector(pb, -2).multiplyScalar(1e6 / (dk * dk));
        out.multiplyScalar(-0.06);
        const len = out.length();
        if (len > 70) out.multiplyScalar(70 / len);
        /* 중력은 컵 좌표계로. 컵이 기울면 바닥 쪽이 아니라 입 쪽으로 */
        pa.set(0, -G_SIM, 0).applyAxisAngle(Z_AXIS, -rz);
        out.add(pa);
      }
    });
    which.forEach((i, n) => { dice[i].cupTrack = cupTracks[n]; });
    pendingRelease = which;
    cupT0 = t + GATHER_MS / speedMul;
    window.setTimeout(() => opts.onSound?.('rattle', 1), GATHER_MS / speedMul);
  };
  const cupAt = (t: number): boolean => {
    if (!cupT0) return false;
    const k = (t - cupT0) * speedMul;
    if (k < 0) return true;
    if (k < SHAKE_MS) {
      const s = k / 1000;
      cup.position.set(CUP_REST.x + Math.sin(s * 95) * 0.14, CUP_REST.y + Math.abs(Math.sin(s * 47)) * 0.4, CUP_REST.z + Math.cos(s * 71) * 0.1);
      cup.rotation.set(Math.sin(s * 63) * 0.12, 0, Math.sin(s * 88) * 0.14);
      return true;
    }
    if (k < SHAKE_MS + TIP_MS) {
      const u = easeInOut((k - SHAKE_MS) / TIP_MS);
      /* 왼쪽(쟁반 쪽)으로 기울며 쟁반 위로 든다. 회전축이 굽이라 입이 안쪽으로 넘어온다 */
      cup.position.set(CUP_REST.x - 2.8 * u, CUP_REST.y + 2.6 * u, CUP_REST.z - 0.5 * u);
      cup.rotation.set(0, 0, 1.95 * u);
      if (k >= RELEASE_AT && pendingRelease.length) pendingRelease = [];
      return true;
    }
    if (k < RETURN_AT) return true;
    if (k < RETURN_AT + RETURN_MS) {
      const u = ease((k - RETURN_AT) / RETURN_MS);
      cup.position.set(CUP_REST.x - 2.8 * (1 - u), CUP_REST.y + 2.6 * (1 - u), CUP_REST.z - 0.5 * (1 - u));
      cup.rotation.set(0, 0, 1.95 * (1 - u));
      return true;
    }
    cup.position.copy(CUP_REST);
    cup.rotation.set(0, 0, 0);
    cupT0 = 0;
    if (queued.length) {
      const next = queued;
      queued = [];
      shake(next, t);
      return true;
    }
    return false;
  };

  /* ── 주사위 움직임 ── 녹화본 재생, 선반 오가기 */
  const MOVE_MS = 300;
  const tmpV = new Vector3();
  const tmpQ = new Quaternion();
  const dieAt = (d: Die, t: number): boolean => {
    /* 손이 올라오면 살짝 키운다. 들어 올리면 같은 픽셀의 광선이 빗나가 내려오고 다시 올라오는 떨림(실측: 포인터 구간이 6조각) */
    d.mesh.scale.setScalar(d.hover && !d.released && !d.moveFrom && !d.dragging ? 1.08 : 1);
    if (d.dragging) return true;
    if (d.moveFrom && d.gather) {
      /* 컵으로. 호를 그리며 입 위로, 끝나면 컵 안 */
      const u = Math.min(1, Math.max(0, ((t - d.moveT0) * speedMul) / MOVE_MS));
      const e = easeInOut(u);
      d.mesh.position.lerpVectors(d.moveFrom, d.moveTo, e);
      d.mesh.position.y += Math.sin(u * Math.PI) * 1.6;
      d.mesh.quaternion.copy(d.quat);
      if (u >= 1) {
        d.moveFrom = null;
        d.gather = false;
        d.inCup = true;
      }
      return true;
    }
    if (d.track && d.released) {
      const k = ((t - d.released) * speedMul) / 1000;
      if (k < d.track.frames[0].t) {
        /* 아직 컵 안. 컵 좌표계 녹화본을 컵을 따라 재생한다(빈 컵을 흔들면 어색하다. 사용자 지적) */
        if (d.inCup && d.cupTrack && d.cupTrack.frames.length) {
          sample(d.cupTrack, (t - d.cupT0) / 1000, tmpV, tmpQ);
          cup.localToWorld(tmpV);
          d.mesh.position.copy(tmpV);
          d.mesh.quaternion.copy(cup.quaternion).multiply(tmpQ);
          d.mesh.visible = true;
        } else {
          d.mesh.visible = false;
        }
        return true;
      }
      d.inCup = false;
      d.mesh.visible = true;
      const going = sample(d.track, k, d.mesh.position, d.mesh.quaternion);
      /* 부딪힌 소리. 지나간 것은 이번 프레임에 한 번씩 */
      while (d.hitIdx < d.track.hits.length && d.track.hits[d.hitIdx].t <= k) {
        const force = d.track.hits[d.hitIdx].force;
        opts.onSound?.('clatter', force);
        /* 첫 착지에 카메라가 살짝 흔들린다. 무거운 것이 떨어진 느낌. 세기는 낙하 세기, 길이 0.18초 */
        if (d.hitIdx === 0 && force > 0.3) { shakeUntil = Math.max(shakeUntil, t + 180); shakeAmp = Math.max(shakeAmp, 0.05 + force * 0.08); }
        d.hitIdx += 1;
      }
      if (going) return true;
      /* 다 굴렀다 */
      d.pos.copy(d.mesh.position);
      d.quat.copy(d.mesh.quaternion);
      d.spot.copy(d.pos);
      d.track = null;
      d.released = 0;
      /* 나는 동안 남기기가 왔으면(봇은 0.25초 만에 고른다) 멎은 뒤에 선반으로 */
      if (d.kept) {
        d.moveFrom = d.pos.clone();
        d.moveTo.copy(railPos(dice.indexOf(d)));
        d.moveT0 = t;
        opts.onSound?.('slide', 0.6);
        return true;
      }
      return false;
    }
    if (d.moveFrom) {
      const u = Math.min(1, ((t - d.moveT0) * speedMul) / MOVE_MS);
      const e = easeInOut(u);
      d.mesh.position.lerpVectors(d.moveFrom, d.moveTo, e);
      d.mesh.position.y = REST_Y + Math.sin(u * Math.PI) * 0.7;
      d.mesh.quaternion.copy(d.quat);
      if (u >= 1) {
        d.moveFrom = null;
        d.pos.copy(d.moveTo);
        d.mesh.position.copy(d.pos);
        return false;
      }
      return true;
    }
    /* 가만히 */
    d.mesh.position.copy(d.pos);
    d.mesh.quaternion.copy(d.quat);
    return false;
  };

  /* ── 손 ── 주사위, 컵, 종이 */
  const ray = new Raycaster();
  const ndc = new Vector2();
  let actable = true;
  let hoverKind: 'die' | 'cup' | 'paper' | '' = '';
  let hoverDie = -1;
  const pick = (ev: PointerEvent): { kind: 'die' | 'cup' | 'paper' | ''; die: number } => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const targets = [...dice.map((d) => d.mesh), cupMesh, paper];
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit) return { kind: '', die: -1 };
    if (hit.object === cupMesh) return { kind: 'cup', die: -1 };
    if (hit.object === paper) return { kind: 'paper', die: -1 };
    const i = dice.findIndex((d) => d.mesh === hit.object);
    return { kind: i >= 0 ? 'die' : '', die: i };
  };
  const setHover = (kind: typeof hoverKind, die: number): void => {
    if (kind === hoverKind && die === hoverDie) return;
    hoverKind = kind;
    hoverDie = die;
    dice.forEach((d, i) => { d.hover = kind === 'die' && i === die && actable; });
    canvas.style.cursor = kind && (actable || kind === 'paper') ? 'pointer' : '';
    need = true;
    kick();
  };
  const onMove = (ev: PointerEvent): void => {
    if (sheetOn) { setHover('', -1); return; }
    const p = pick(ev);
    setHover(p.kind, p.die);
  };
  const onLeave = (): void => setHover('', -1);
  /* ── 홈에서 끌기 ── 남긴 주사위를 홈 사이에서 끌어 순서를 바꾼다. 6px 안 움직이면 누른 것 */
  let drag: { i: number; x0: number; y0: number; moved: boolean; id: number } | null = null;
  const railPlane = new Plane(new Vector3(0, 1, 0), -REST_Y);
  const railHit = new Vector3();
  const railXAt = (ev: PointerEvent): number | null => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(railPlane, railHit)) return null;
    return Math.max(-TRAY_W / 2 + 0.8, Math.min(TRAY_W / 2 - 0.8, railHit.x));
  };
  const onDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    if (sheetOn) return;
    const p = pick(ev);
    if (p.kind === 'die') {
      const d = dice[p.die];
      if (d.kept && actable && !d.released && !d.moveFrom) {
        drag = { i: p.die, x0: ev.clientX, y0: ev.clientY, moved: false, id: ev.pointerId };
        return;
      }
      opts.onDie(p.die);
    } else if (p.kind === 'cup') opts.onCup();
    else if (p.kind === 'paper') opts.onPaper();
  };
  const onDragMove = (ev: PointerEvent): void => {
    if (!drag) return;
    const d = dice[drag.i];
    if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 6) return;
    drag.moved = true;
    d.dragging = true;
    const x = railXAt(ev);
    if (x === null) return;
    d.mesh.position.set(x, REST_Y + 0.5, RAIL_Z);
    d.mesh.quaternion.copy(d.quat);
    canvas.style.cursor = 'grabbing';
    need = true;
    kick();
  };
  const onUp = (ev: PointerEvent): void => {
    if (!drag) return;
    const { i, moved } = drag;
    drag = null;
    void ev;
    const d = dice[i];
    d.dragging = false;
    canvas.style.cursor = '';
    if (!moved) {
      opts.onDie(i);
      return;
    }
    /* 제일 가까운 홈. 누가 앉아 있으면 자리를 바꾼다 */
    let slot = 0;
    let bd = Infinity;
    for (let k = 0; k < opts.count; k += 1) {
      const dd = Math.abs(slotX(k) - d.mesh.position.x);
      if (dd < bd) { bd = dd; slot = k; }
    }
    const t = performance.now();
    /* 홈 번호는 늘 서로 달라야 한다. 쟁반에 내려간 주사위의 홈이라도 바꿔 준다. 안 바꾸면 둘이 한 홈에 겹친다(실측) */
    const other = slotOf.findIndex((sl, j) => sl === slot && j !== i);
    if (other >= 0) {
      slotOf[other] = slotOf[i];
      const o = dice[other];
      if (o.kept) {
        o.moveFrom = o.mesh.position.clone();
        o.moveTo.copy(railPos(other));
        o.moveT0 = t;
      }
    }
    slotOf[i] = slot;
    d.moveFrom = d.mesh.position.clone();
    d.moveTo.copy(railPos(i));
    d.moveT0 = t;
    opts.onSound?.('slide', 0.5);
    need = true;
    kick();
  };
  canvas.addEventListener('pointermove', onMove, { passive: true });
  /* 끌기는 창 전체에서 듣는다. 캔버스 밖에서 놓아도 끝나야 하고, 포인터 캡처는 셸과 엉켰다(실측: 놓음이 안 왔다) */
  window.addEventListener('pointermove', onDragMove, { passive: true });
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);

  /* ── 그리기 ── 부를 때만. 방은 30fps 로 산다 */
  let need = true;
  let camFrom: Vector3 | null = null;
  let sheetOn = false;
  let done = false;
  let compiled = false;
  const render = (): void => {
    if (!need || !compiled) return;
    need = false;
    renderer.render(scene, camera);
  };
  const resize = (): void => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    /* 창이 바뀌면 탁자 자리도 바뀐다. 탁자를 보고 있고 움직이는 중이 아니면 바로 옮긴다 */
    fitTable();
    if (!sheetOn && !camFrom && !done) {
      goal.copy(tableSeat);
      camera.position.copy(tableSeat);
      camera.lookAt(look);
    }
    need = true;
    render();
  };

  let loop: GardenLoop | null = null;
  let lookFrom: Vector3 | null = null;
  let shakeUntil = 0;
  let shakeAmp = 0;
  /* 연필. 적을 때 종이 위로 갔다 돌아온다 */
  const pencilHome = new Vector3();
  let pencilT0 = 0;
  const PENCIL_MS = 520;
  let camT0 = 0;
  let camMs = 0;
  let lastLive = 0;
  const seed = Math.random() * 1000;
  const breathe = (t: number): void => {
    const s = t / 1000 + seed;
    if (room) {
      room.breathe(t);
      return;
    }
    /* 등불이 아주 조금 흔들린다. 눈에 띄면 고장 난 등이다 */
    lamp.intensity = 3.0 * (0.985 + 0.015 * Math.sin(s * 2.3) * Math.sin(s * 0.7 + 1));
    const arr = motes.geometry.getAttribute('position') as { array: Float32Array; needsUpdate: boolean };
    const a = arr.array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += Math.sin(s * 0.4 + i) * 0.0005;
      a[i + 1] += 0.0003 + Math.sin(s * 0.3 + i * 0.7) * 0.0003;
      if (a[i + 1] > 7.5) a[i + 1] = 0.4;
    }
    arr.needsUpdate = true;
  };
  const frame = (): void => {
    const t = performance.now();
    if (!host.isConnected) {
      loop?.stop();
      loop = null;
      return;
    }
    let busy = cupAt(t);
    for (const d of dice) if (dieAt(d, t)) busy = true;
    if (camFrom && lookFrom) {
      const k = Math.min(1, (t - camT0) / camMs);
      const e = easeInOut(k);
      camera.position.lerpVectors(camFrom, goal, e);
      look.lerpVectors(lookFrom, lookGoal, e);
      camera.lookAt(look);
      if (k >= 1) { camFrom = null; lookFrom = null; } else busy = true;
    } else if (shakeUntil) {
      if (t < shakeUntil) {
        const left = (shakeUntil - t) / 180;
        camera.position.copy(goal).add(new Vector3((Math.random() - 0.5) * shakeAmp * left, (Math.random() - 0.5) * shakeAmp * 0.6 * left, 0));
      } else {
        camera.position.copy(goal);
        shakeUntil = 0;
        shakeAmp = 0;
      }
      camera.lookAt(look);
      busy = true;
    }
    if (pencilT0) {
      const u = Math.min(1, (t - pencilT0) / PENCIL_MS);
      const e = Math.sin(u * Math.PI);
      pencil.position.set(pencilHome.x - 1.2 * e, pencilHome.y + 0.5 * e, pencilHome.z - 1.6 * e);
      pencil.rotation.y = 0.35 + 0.5 * e;
      if (u >= 1) { pencilT0 = 0; pencil.position.copy(pencilHome); pencil.rotation.y = 0.35; }
      busy = true;
    }
    if (t - lastLive >= 33) {
      lastLive = t;
      breathe(t);
      need = true;
      render();
    } else if (busy) {
      need = true;
      render();
    }
  };
  const kick = (): void => {
    if (!loop) loop = gloop(frame);
  };
  const moveCam = (to: Vector3, at: Vector3, ms: number): void => {
    camFrom = camera.position.clone();
    lookFrom = look.clone();
    goal.copy(to);
    lookGoal.copy(at);
    camT0 = performance.now();
    camMs = ms;
    kick();
  };

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  void renderer.compileAsync(scene, camera).then(() => {
    compiled = true;
    need = true;
    render();
  }, () => {
    compiled = true;
    need = true;
    render();
  });
  /* 들어올 때. 한 걸음 뒤에서 자리로 */
  camera.position.copy(tableSeat).multiplyScalar(1.22);
  camera.position.y *= 1.08;
  moveCam(tableSeat, tableLook, 1150);

  let started = false;
  return {
    ok: true,
    software,
    set(values, keep, roll) {
      const t = performance.now();
      /* 굴릴 것은 **전 상태에서 내려 둔 것**. 굴린 뒤에는 전부 손(남김)이라 새 keep 으로는 못 가른다 */
      const rolling: number[] = started && roll ? dice.map((_, i) => i).filter((i) => !dice[i].kept) : [];
      dice.forEach((d, i) => {
        const v = values[i] ?? 1;
        const k = !!keep[i];
        if (!started) {
          d.value = v;
          d.kept = k;
          upright(d, v);
          d.mesh.visible = true;
        } else {
          const willRoll = rolling.includes(i);
          if (k !== d.kept) {
            d.kept = k;
            const flying = willRoll || d.released !== 0 || pendingRelease.includes(i) || queued.includes(i);
            /* 나는 중이면 멎은 뒤에 옮긴다(`dieAt` 의 끝). 지금 끊으면 허공에서 선반으로 미끄러진다(실측) */
            if (!flying) {
              /* 선반으로, 또는 선반에서 빈 자리로(전 자리는 그새 다른 주사위가 차지했을 수 있다) */
              if (!k) scatter([i]);
              d.moveFrom = d.mesh.position.clone();
              d.moveTo.copy(k ? railPos(i) : d.spot);
              d.moveT0 = t;
              opts.onSound?.('slide', 0.6);
            }
          }
          if (willRoll) {
            d.value = v;
          } else if (v !== d.value) {
            /* 굴림 없이 눈이 바뀌었다(도중에 들어옴). 그냥 놓는다 */
            d.value = v;
            upright(d, v);
          }
        }
      });
      if (!started) {
        started = true;
        scatter(dice.map((_, i) => i).filter((i) => !dice[i].kept));
        dice.forEach((d, i) => {
          d.pos.copy(d.kept ? railPos(i) : d.spot);
          d.mesh.position.copy(d.pos);
          d.mesh.quaternion.copy(d.quat);
        });
      } else if (rolling.length) {
        if (cupT0) queued = [...new Set([...queued, ...rolling])];
        else shake(rolling, t);
      }
      need = true;
      kick();
    },
    speed(mul) {
      speedMul = Math.max(0.5, Math.min(3, mul));
    },
    rollsLeft(n) {
      pips.forEach((p, i) => { p.material = i < n ? brassOn : brassOff; });
      need = true;
      kick();
    },
    canAct(v) {
      actable = v;
      if (!v) dice.forEach((d) => { d.hover = false; });
      canvas.style.cursor = hoverKind && (v || hoverKind === 'paper') ? 'pointer' : '';
      need = true;
      kick();
    },
    sheetMode(on) {
      if (on === sheetOn) return;
      sheetOn = on;
      setHover('', -1);
      if (on) moveCam(sheetSeat, sheetLook, 720);
      else moveCam(done ? tableSeat.clone().multiplyScalar(0.9) : tableSeat, tableLook, 720);
    },
    sheetDirty() {
      drawPaper();
      sheetMap.needsUpdate = true;
      need = true;
      kick();
    },
    write() {
      pencilHome.copy(pencil.position);
      if (!pencilT0) pencilT0 = performance.now();
      kick();
    },
    finish() {
      if (done) return;
      done = true;
      if (!sheetOn) moveCam(new Vector3(-4, 14, 11.5), new Vector3(-4.2, 0, 1.2), 1400);
    },
    resize,
    dispose() {
      loop?.stop();
      loop = null;
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointermove', onDragMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      [...faceMats, ...bottleMats, counterMat, wallMat, shelfMat, feltMat, trayWood, slotMat, brassOff, brassOn, leather, lipMat, paperMat, pencilMat, moteMat].forEach((m) => m.dispose());
      [...faceMaps, counterMap, feltMap, trayWoodMap, leatherMap, sheetMap].forEach((m) => m.dispose());
      room?.dispose();
      renderer.dispose();
      canvas.remove();
    }
  };
}
