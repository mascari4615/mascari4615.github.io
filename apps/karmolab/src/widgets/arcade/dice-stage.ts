/**
 * 주사위 무대. **밤의 바 카운터** (Three.js). change.arcade-redesign
 *
 * `three-board.ts` 가 격자판의 무대라면 여기는 굴리는 놀이의 무대다. 나무 카운터 위에
 * 펠트 깐 쟁반, 가죽 컵, 종이 점수표 한 장. 컵을 누르면 흔들어 쏟고, 주사위를 누르면 남기고,
 * 종이를 누르면 카메라가 내려가 적는 자리로
 *
 * 물리는 **흉내**다. 결과 눈은 커널이 이미 정했으므로(`yacht.ts`), 진짜 충돌을 돌리면
 * 나온 눈을 나중에 억지로 뒤집어야 한다. 대신 튀고 구르다가 마지막 한 뼘에서 정해진 눈으로
 * 눕는다. 사람 눈은 마지막 반 바퀴를 못 쫓는다(레퍼런스 실측: 스팀 상위 두 판 모두 착지
 * 0.2초 안에 눈이 굳는다).
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
  PCFShadowMap,
  PerspectiveCamera,
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

export interface DiceStageOpts {
  /** 주사위 몇 개 */
  count: number;
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
  resize(): void;
  dispose(): void;
}

/* 주사위 한 변. 다른 치수는 전부 이것의 배수 */
const D = 1;
/* 쟁반 안쪽. 레퍼런스 실측: 쟁반 한 변이 주사위 다섯 개 반 */
const TRAY_W = 6.6;
const ROLL_Z0 = -1.15; /* 구르는 자리 (먼 쪽) */
const ROLL_Z1 = 3.25; /* 구르는 자리 (앞) */
const RAIL_Z = -2.05; /* 남긴 주사위 선반 */
const TRAY_Z0 = -2.75;
const WALL = 0.28;
const FLOOR_Y = 0.16;
const REST_Y = FLOOR_Y + D / 2;
const GRAVITY = 24;

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
  /* 날아가는 중 */
  vel: Vector3;
  ang: Vector3;
  released: number; /* ms, 0 이면 안 나는 중 */
  target: Quaternion;
  bounces: number;
  /* 남기기와 되돌리기. 두 자리 사이를 한 호로 */
  moveFrom: Vector3 | null;
  moveTo: Vector3;
  moveT0: number;
  hover: boolean;
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
      set: () => {}, rollsLeft: () => {}, canAct: () => {}, sheetMode: () => {}, sheetDirty: () => {}, finish: () => {}, resize: () => {}, dispose: () => {}
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
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 80);

  /**
   * 카메라 자리 둘. **탁자**는 쟁반을 가운데 두고 비스듬히(레퍼런스 실측: 스팀 두 판 모두
   * 45~60도 부감). 왼쪽에 종이, 오른쪽에 컵. **종이**는 종이 바로 위에서 부감
   */
  const PAPER_AT = new Vector3(-5.3, 0.02, 0.9);
  /* 레퍼런스 실측: 주사위 한 변이 화면 폭의 7~8%, 쟁반이 폭의 42%. 가까이 두니 주사위가 폭의 19% 였다 */
  const tableSeat = new Vector3(0.3, 10.6, 8.9);
  const tableLook = new Vector3(0.1, 0, 0.5);
  const sheetSeat = new Vector3(PAPER_AT.x + 0.05, 4.9, PAPER_AT.z + 1.1);
  const sheetLook = new Vector3(PAPER_AT.x, 0, PAPER_AT.z + 0.1);
  const goal = tableSeat.clone();
  const lookGoal = tableLook.clone();
  const look = tableLook.clone();
  camera.position.copy(tableSeat);
  camera.lookAt(look);

  /* ── 빛 ── 천장 등 하나가 쟁반에 떨어진다. 방은 어둡고 등 아래만 밝다 */
  scene.add(new AmbientLight(0xffffff, 0.14));
  const hemi = new HemisphereLight(0x8a6a48, 0x060403, 0.42);
  scene.add(hemi);
  const lamp = new SpotLight(0xffc98a, 3.0, 0, 0.68, 0.55, 0);
  lamp.position.set(0.4, 8.0, 1.2);
  lamp.target.position.set(0, 0, 0.6);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.radius = 3;
  lamp.shadow.camera.near = 2;
  lamp.shadow.camera.far = 16;
  lamp.shadow.bias = -0.0006;
  lamp.shadow.normalBias = 0.02;
  scene.add(lamp);
  scene.add(lamp.target);
  /* 종이가 읽혀야 한다. 왼쪽에 약한 보조광 */
  const fill = new DirectionalLight(0xffd9b0, 0.55);
  fill.position.set(-6, 6, 4);
  scene.add(fill);

  /* ── 카운터 ── 니스 칠한 널. 어둡고 조금 비친다 */
  const counterMap = new CanvasTexture(plankTexture(31, 512));
  counterMap.colorSpace = SRGBColorSpace;
  counterMap.wrapS = RepeatWrapping;
  counterMap.wrapT = RepeatWrapping;
  counterMap.repeat.set(4, 4);
  counterMap.anisotropy = 4;
  const counterMat = new MeshStandardMaterial({ map: counterMap, color: 0x7a5232, roughness: 0.38, metalness: 0.06 });
  const counter = new Mesh(new PlaneGeometry(40, 40), counterMat);
  counter.rotation.x = -Math.PI / 2;
  counter.receiveShadow = true;
  scene.add(counter);

  /* ── 뒤쪽 ── 어두운 벽과 병 선반. 병은 빛나는 상자 몇 개. 디테일을 그리면 눈이 거기로 간다 */
  const wallMat = new MeshStandardMaterial({ color: 0x120c08, roughness: 1 });
  const wall = new Mesh(new PlaneGeometry(40, 14), wallMat);
  wall.position.set(0, 7, -9);
  scene.add(wall);
  const shelfMat = new MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7 });
  const bottleMats: MeshStandardMaterial[] = [];
  for (let row = 0; row < 2; row += 1) {
    const shelf = new Mesh(new BoxGeometry(22, 0.12, 1.2), shelfMat);
    shelf.position.set(0, 2.2 + row * 2.1, -8.4);
    scene.add(shelf);
    const n = 11;
    for (let i = 0; i < n; i += 1) {
      const hue = [0xd98a2c, 0x6fa84a, 0x3c7fbf, 0xc93b3b, 0xe0c060][(i + row * 3) % 5];
      const m = new MeshStandardMaterial({ color: hue, emissive: hue, emissiveIntensity: 0.55, roughness: 0.3, transparent: true, opacity: 0.82 });
      bottleMats.push(m);
      const h = 1.1 + ((i * 7 + row * 3) % 4) * 0.18;
      const b = new Mesh(new CylinderGeometry(0.16, 0.2, h, 10), m);
      b.position.set(-10 + i * 2 + (row ? 1 : 0), 2.26 + row * 2.1 + h / 2, -8.4);
      scene.add(b);
    }
  }

  /* ── 쟁반 ── 펠트 바닥에 나무 테. 먼 쪽에 남긴 주사위 선반 */
  const feltMap = new CanvasTexture(feltTexture(11, 256));
  feltMap.colorSpace = SRGBColorSpace;
  feltMap.wrapS = RepeatWrapping;
  feltMap.wrapT = RepeatWrapping;
  feltMap.repeat.set(3, 3);
  const feltMat = new MeshStandardMaterial({ map: feltMap, color: 0x1f6b4e, roughness: 0.96 });
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
  const trayWood = new MeshStandardMaterial({ map: trayWoodMap, color: 0x3a2214, roughness: 0.55 });
  const base = new Mesh(new BoxGeometry(TRAY_W + WALL * 2, FLOOR_Y, trayDepth + WALL * 2), trayWood);
  base.position.set(0, FLOOR_Y / 2, trayCz);
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);
  const wallH = 0.62;
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
  const divider = new Mesh(new BoxGeometry(TRAY_W, 0.3, 0.12), trayWood);
  divider.position.set(0, FLOOR_Y + 0.15, (ROLL_Z0 + RAIL_Z) / 2 + 0.45);
  divider.castShadow = true;
  scene.add(divider);

  /* 남은 굴리기. 쟁반 앞턱의 놋쇠 버튼 셋 */
  const brassOff = new MeshStandardMaterial({ color: 0x5a4320, roughness: 0.45, metalness: 0.7 });
  const brassOn = new MeshStandardMaterial({ color: 0xf0c060, emissive: 0xb8781a, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.7 });
  const pips: Mesh[] = [];
  for (let i = 0; i < 3; i += 1) {
    const p = new Mesh(new CylinderGeometry(0.11, 0.11, 0.06, 14), brassOff);
    p.position.set(-0.4 + i * 0.4, wallH + 0.03, ROLL_Z1 + WALL / 2);
    scene.add(p);
    pips.push(p);
  }

  /* ── 컵 ── 가죽. 오른쪽에 서 있다가 흔들고 쏟고 돌아온다 */
  const leatherMap = new CanvasTexture(leatherTexture(47, 256));
  leatherMap.colorSpace = SRGBColorSpace;
  const leather = new MeshStandardMaterial({ map: leatherMap, color: 0xffffff, roughness: 0.72, side: DoubleSide });
  const cup = new Group();
  const CUP_R = 0.95;
  const CUP_H = 1.75;
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
  lip.position.y = CUP_H - 0.06;
  cup.add(lip);
  const CUP_REST = new Vector3(TRAY_W / 2 + WALL + 1.25, 0, 1.4);
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
  const PAPER_SIZE = 2.7;
  const paper = new Mesh(new PlaneGeometry(PAPER_SIZE, PAPER_SIZE * (SHEET_H / SHEET_W)), paperMat);
  paper.rotation.x = -Math.PI / 2;
  paper.rotation.z = 0.09;
  paper.position.copy(PAPER_AT);
  paper.receiveShadow = true;
  scene.add(paper);
  const pencilMat = new MeshStandardMaterial({ color: 0xd9a12b, roughness: 0.5 });
  const pencil = new Mesh(new CylinderGeometry(0.05, 0.05, 1.7, 8), pencilMat);
  pencil.rotation.z = Math.PI / 2;
  pencil.rotation.y = 0.35;
  pencil.position.set(PAPER_AT.x + 1.1, 0.06, PAPER_AT.z + 2.1);
  pencil.castShadow = true;
  scene.add(pencil);

  /* ── 먼지 ── 등불 아래 공중. 방이 살아 있다는 표 */
  const moteN = 90;
  const motePos = new Float32Array(moteN * 3);
  for (let i = 0; i < moteN; i += 1) {
    motePos[i * 3] = (Math.random() - 0.5) * 7;
    motePos[i * 3 + 1] = 0.4 + Math.random() * 4.5;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 6 + 0.5;
  }
  const moteGeo = new BufferGeometry();
  moteGeo.setAttribute('position', new Float32BufferAttribute(motePos, 3));
  const moteMat = new PointsMaterial({ color: 0xffdca0, size: 0.03, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const motes = new Points(moteGeo, moteMat);
  scene.add(motes);

  /* ── 주사위 ── 면마다 눈을 구운 상자. 한 벌만 굽고 다섯이 나눠 쓴다 */
  const faceMaps = FACE_ORDER.map((v) => {
    const m = new CanvasTexture(dieFaceTexture(v, 128));
    m.colorSpace = SRGBColorSpace;
    m.anisotropy = 4;
    return m;
  });
  const faceMats = faceMaps.map((map) => new MeshStandardMaterial({ map, roughness: 0.34, metalness: 0.02 }));
  const dieGeo = new BoxGeometry(D, D, D);
  const dice: Die[] = [];
  for (let i = 0; i < opts.count; i += 1) {
    const mesh = new Mesh(dieGeo, faceMats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    dice.push({
      mesh, value: 1, kept: false,
      spot: new Vector3(0, REST_Y, 1), pos: new Vector3(0, REST_Y, 1), quat: new Quaternion(),
      vel: new Vector3(), ang: new Vector3(), released: 0, target: new Quaternion(), bounces: 0,
      moveFrom: null, moveTo: new Vector3(), moveT0: 0, hover: false
    });
  }
  const slotX = (i: number): number => -TRAY_W / 2 + 0.9 + i * ((TRAY_W - 1.8) / Math.max(1, opts.count - 1));
  const railPos = (i: number): Vector3 => new Vector3(slotX(i), REST_Y, RAIL_Z);

  /* 눈 v 가 위로 오는 자세. 그 위에 아무 방향으로 한 바퀴 돌린 것 */
  const upright = (v: number, out: Quaternion): Quaternion => {
    const q = new Quaternion().setFromUnitVectors(FACE_NORMAL[v] ?? UP, UP);
    const spin = new Quaternion().setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    return out.copy(spin.multiply(q));
  };

  /* 쟁반에 흩어질 자리. 서로 한 변 넘게 떨어지게. 못 찾으면 줄로 */
  const scatter = (which: number[]): void => {
    const taken: Vector3[] = dice.filter((d, i) => !which.includes(i) && !d.kept).map((d) => d.spot);
    const x0 = -TRAY_W / 2 + D * 0.8;
    const x1 = TRAY_W / 2 - D * 0.8;
    const z0 = ROLL_Z0 + D * 0.9;
    const z1 = ROLL_Z1 - D * 0.8;
    for (const i of which) {
      let best: Vector3 | null = null;
      for (let tries = 0; tries < 80 && !best; tries += 1) {
        const p = new Vector3(x0 + Math.random() * (x1 - x0), REST_Y, z0 + Math.random() * (z1 - z0));
        if (taken.every((q) => q.distanceTo(p) > D * 1.35)) best = p;
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
  let pendingRelease: number[] = [];
  /* 컵이 도는 중에 온 다음 굴림. 봇은 컵이 돌아오기 전에 또 굴린다(0.5~0.9초). 끝나면 이어서 */
  let queued: number[] = [];
  const shake = (which: number[], t: number): void => {
    which.forEach((i) => {
      dice[i].mesh.visible = false;
      dice[i].released = 0;
      dice[i].moveFrom = null;
    });
    pendingRelease = which;
    cupT0 = t;
    opts.onSound?.('rattle', 1);
  };
  const cupAt = (t: number): boolean => {
    if (!cupT0) return false;
    const k = t - cupT0;
    if (k < SHAKE_MS) {
      const s = k / 1000;
      cup.position.set(CUP_REST.x + Math.sin(s * 95) * 0.08, CUP_REST.y + Math.abs(Math.sin(s * 47)) * 0.25, CUP_REST.z + Math.cos(s * 71) * 0.06);
      cup.rotation.set(Math.sin(s * 63) * 0.12, 0, Math.sin(s * 88) * 0.14);
      return true;
    }
    if (k < SHAKE_MS + TIP_MS) {
      const u = easeInOut((k - SHAKE_MS) / TIP_MS);
      /* 왼쪽(쟁반 쪽)으로 기울며 쟁반 위로 든다. 회전축이 굽이라 입이 안쪽으로 넘어온다 */
      cup.position.set(CUP_REST.x - 1.55 * u, CUP_REST.y + 1.5 * u, CUP_REST.z - 0.3 * u);
      cup.rotation.set(0, 0, 1.95 * u);
      if (k >= RELEASE_AT && pendingRelease.length) {
        const mouth = new Vector3(0, CUP_H, 0).applyQuaternion(cup.quaternion).add(cup.position);
        pendingRelease.forEach((i, n) => {
          const d = dice[i];
          d.released = t + n * 45;
          d.pos.copy(mouth).add(new Vector3((Math.random() - 0.5) * 0.4, -n * 0.2, (Math.random() - 0.5) * 0.4));
          d.vel.set(-4.2 - Math.random() * 2.8, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 3.2);
          d.ang.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22);
          d.bounces = 0;
          d.quat.setFromAxisAngle(new Vector3(Math.random(), Math.random(), Math.random()).normalize(), Math.random() * 6);
          upright(d.value, d.target);
          d.mesh.visible = true;
        });
        pendingRelease = [];
      }
      return true;
    }
    if (k < RETURN_AT) return true;
    if (k < RETURN_AT + RETURN_MS) {
      const u = ease((k - RETURN_AT) / RETURN_MS);
      cup.position.set(CUP_REST.x - 1.55 * (1 - u), CUP_REST.y + 1.5 * (1 - u), CUP_REST.z - 0.3 * (1 - u));
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

  /* ── 주사위 움직임 ── 날기(흉내 물리), 마지막 한 뼘의 정착, 선반 오가기 */
  const FLY_MS = 900;
  const SETTLE_MS = 300;
  const MOVE_MS = 300;
  let lastT = 0;
  const tmpQ = new Quaternion();
  const tmpV = new Vector3();
  const dieAt = (d: Die, t: number, dt: number): boolean => {
    if (d.released) {
      const k = t - d.released;
      if (k < 0) {
        d.mesh.visible = false;
        return true;
      }
      d.mesh.visible = true;
      if (k < FLY_MS) {
        /* 날고 튄다 */
        d.vel.y -= GRAVITY * dt;
        d.pos.addScaledVector(d.vel, dt);
        const half = D / 2;
        const xMax = TRAY_W / 2 - half;
        if (d.pos.x < -xMax) { d.pos.x = -xMax; d.vel.x = Math.abs(d.vel.x) * 0.5; opts.onSound?.('clatter', 0.5); }
        if (d.pos.x > xMax) { d.pos.x = xMax; d.vel.x = -Math.abs(d.vel.x) * 0.5; }
        if (d.pos.z < ROLL_Z0 + half) { d.pos.z = ROLL_Z0 + half; d.vel.z = Math.abs(d.vel.z) * 0.5; opts.onSound?.('clatter', 0.4); }
        if (d.pos.z > ROLL_Z1 - half) { d.pos.z = ROLL_Z1 - half; d.vel.z = -Math.abs(d.vel.z) * 0.5; opts.onSound?.('clatter', 0.4); }
        if (d.pos.y < REST_Y && d.vel.y < 0) {
          d.pos.y = REST_Y;
          const hit = -d.vel.y;
          d.vel.y = hit > 1.0 ? hit * 0.42 : 0;
          d.vel.x *= 0.78;
          d.vel.z *= 0.78;
          d.ang.multiplyScalar(0.62);
          d.bounces += 1;
          if (hit > 1.0) opts.onSound?.('clatter', Math.min(1, hit / 9));
        }
        if (d.pos.y <= REST_Y + 0.001) {
          /* 바닥에서 구른다. 미끄러지며 느려진다 */
          d.vel.x *= 1 - 2.8 * dt;
          d.vel.z *= 1 - 2.8 * dt;
          d.ang.multiplyScalar(1 - 3.5 * dt);
        }
        const w = d.ang.length();
        if (w > 0.0001) {
          tmpQ.setFromAxisAngle(tmpV.copy(d.ang).divideScalar(w), w * dt);
          d.quat.premultiply(tmpQ);
        }
        d.mesh.position.copy(d.pos);
        d.mesh.quaternion.copy(d.quat);
        return true;
      }
      /* 정착. 지금 자리에서 자기 자리와 정한 눈으로 */
      const u = Math.min(1, (k - FLY_MS) / SETTLE_MS);
      const e = ease(u);
      d.mesh.position.lerpVectors(d.pos, d.spot, e);
      d.mesh.position.y = Math.max(d.mesh.position.y, REST_Y);
      d.mesh.quaternion.copy(d.quat).slerp(d.target, e);
      if (u >= 1) {
        d.released = 0;
        d.pos.copy(d.spot);
        d.quat.copy(d.target);
        d.mesh.position.copy(d.pos);
        d.mesh.quaternion.copy(d.quat);
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
      return true;
    }
    if (d.moveFrom) {
      const u = Math.min(1, (t - d.moveT0) / MOVE_MS);
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
    /* 가만히. 손이 올라와 있으면 살짝 든다 */
    d.mesh.position.copy(d.pos);
    d.mesh.position.y = d.pos.y + (d.hover ? 0.12 : 0);
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
  const onDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    if (sheetOn) return;
    const p = pick(ev);
    if (p.kind === 'die') opts.onDie(p.die);
    else if (p.kind === 'cup') opts.onCup();
    else if (p.kind === 'paper') opts.onPaper();
  };
  canvas.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);

  /* ── 그리기 ── 부를 때만. 방은 30fps 로 산다 */
  let need = true;
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
    need = true;
    render();
  };

  let loop: GardenLoop | null = null;
  let camFrom: Vector3 | null = null;
  let lookFrom: Vector3 | null = null;
  let camT0 = 0;
  let camMs = 0;
  let sheetOn = false;
  let done = false;
  let lastLive = 0;
  const seed = Math.random() * 1000;
  const breathe = (t: number): void => {
    const s = t / 1000 + seed;
    /* 등불이 아주 조금 흔들린다. 눈에 띄면 고장 난 등이다 */
    lamp.intensity = 3.0 * (0.985 + 0.015 * Math.sin(s * 2.3) * Math.sin(s * 0.7 + 1));
    const arr = motes.geometry.getAttribute('position') as { array: Float32Array; needsUpdate: boolean };
    const a = arr.array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += Math.sin(s * 0.4 + i) * 0.0005;
      a[i + 1] += 0.0003 + Math.sin(s * 0.3 + i * 0.7) * 0.0003;
      if (a[i + 1] > 5) a[i + 1] = 0.4;
    }
    arr.needsUpdate = true;
  };
  const frame = (): void => {
    const t = performance.now();
    const dt = Math.min(0.04, lastT ? (t - lastT) / 1000 : 0.016);
    lastT = t;
    if (!host.isConnected) {
      loop?.stop();
      loop = null;
      return;
    }
    let busy = cupAt(t);
    for (const d of dice) if (dieAt(d, t, dt)) busy = true;
    if (camFrom && lookFrom) {
      const k = Math.min(1, (t - camT0) / camMs);
      const e = easeInOut(k);
      camera.position.lerpVectors(camFrom, goal, e);
      look.lerpVectors(lookFrom, lookGoal, e);
      camera.lookAt(look);
      if (k >= 1) { camFrom = null; lookFrom = null; } else busy = true;
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
      const rolling: number[] = [];
      dice.forEach((d, i) => {
        const v = values[i] ?? 1;
        const k = !!keep[i];
        if (!started) {
          d.value = v;
          d.kept = k;
          upright(v, d.quat);
          d.target.copy(d.quat);
          d.mesh.visible = true;
        } else {
          if (k !== d.kept) {
            d.kept = k;
            const flying = d.released !== 0 || pendingRelease.includes(i) || queued.includes(i);
            /* 나는 중이면 멎은 뒤에 옮긴다(`dieAt` 의 정착 끝). 지금 끊으면 허공에서 선반으로 미끄러진다(실측) */
            if (!flying) {
              /* 선반으로, 또는 선반에서 자기 자리로 */
              d.moveFrom = d.mesh.position.clone();
              d.moveTo.copy(k ? railPos(i) : d.spot);
              d.moveT0 = t;
              opts.onSound?.('slide', 0.6);
            }
          }
          if (roll && !k) {
            d.value = v;
            rolling.push(i);
          } else if (v !== d.value) {
            /* 굴림 없이 눈이 바뀌었다(도중에 들어옴). 그냥 놓는다 */
            d.value = v;
            upright(v, d.quat);
            d.target.copy(d.quat);
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
        scatter(rolling);
        if (cupT0) queued = [...new Set([...queued, ...rolling])];
        else shake(rolling, t);
      }
      need = true;
      kick();
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
    finish() {
      if (done) return;
      done = true;
      if (!sheetOn) moveCam(new Vector3(-2.4, 8.6, 7.0), new Vector3(-2.6, 0, 0.8), 1400);
    },
    resize,
    dispose() {
      loop?.stop();
      loop = null;
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      [...faceMats, ...bottleMats, counterMat, wallMat, shelfMat, feltMat, trayWood, brassOff, brassOn, leather, lipMat, paperMat, pencilMat, moteMat].forEach((m) => m.dispose());
      [...faceMaps, counterMap, feltMap, trayWoodMap, leatherMap, sheetMap].forEach((m) => m.dispose());
      renderer.dispose();
      canvas.remove();
    }
  };
}
