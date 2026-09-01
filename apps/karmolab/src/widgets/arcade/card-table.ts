/**
 * 카지노 상. 반원 상판, 가죽 레일, 베팅 서클, 슈, 디스카드 트레이, 칩 (2026-09-01)
 *
 * 왜 새로 있나. 블랙잭 무대에 물건이 상판 하나뿐이었다. 야추는 나무 틀과 펠트 트레이와
 * 가죽 컵과 조리대까지 다섯인데 여기는 초록 상자 위에 카드뿐이라 화면이 비었음.
 * 사용자 판정도 그것이었다(2026-09-01, 텍스처가 아니라 세트가 없다).
 *
 * 여기서 만드는 것은 **상과 상 위 물건**뿐이다. 카드와 손패 배치는 `card-stage.ts` 몫.
 *
 * 상 모양은 실물을 따른다. 딜러가 서는 쪽이 곧은 변, 사람이 앉는 쪽이 반원.
 * 인쇄 문구와 베팅 서클은 펠트 질감에 함께 굽는다. 물건으로 만들면 z 다툼.
 */
import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  SRGBColorSpace,
  Vector3
} from '/packages/3d/vendor/three.module.min.js';
import { cardBackTexture, leatherTexture } from './texture';

export interface TableSpec {
  /** 상 폭 */
  w: number;
  /** 상 깊이 */
  d: number;
  /** 상 윗면 높이 */
  topY: number;
  /** 앉는 자리 수 */
  seats: number;
  /** 이방성 상한 */
  aniso: number;
}

export interface CasinoTable {
  /** 자리 하나의 베팅 서클 자리 (상판 좌표) */
  spot(i: number, n: number): { x: number; z: number };
  /** 카드가 나오는 자리 */
  shoe: Vector3;
  /** 딜러 카드 줄이 놓이는 z */
  dealerZ: number;
  dispose(): void;
}

/** 상판 두께 */
const TOP_T = 0.16;

/**
 * 앉는 자리 하나의 자리. 반원 위에 나란히.
 * 가운데가 화면 앞쪽이라 사람 자리
 */
export function seatSpot(i: number, n: number, w: number, d: number): { x: number; z: number } {
  const k = n <= 1 ? 0.5 : i / (n - 1);
  /* 0.80파이 에서 0.20파이 까지. 양 끝은 상 밖으로 안 나가게 안쪽으로 */
  const t = Math.PI * (0.8 - 0.6 * k);
  return { x: w * 0.4 * Math.cos(t), z: -d / 2 + d * 0.86 * Math.sin(t) };
}

/** 상판 윤곽. 딜러 쪽이 곧은 변, 사람 쪽이 반원 */
function tableShape(w: number, d: number, grow = 0): Shape {
  const sh = new Shape();
  /* 꼴의 +y 가 세계의 -z 로 감(`rotateX(-90도)`). 반원이 사람 쪽(+z)으로 부풀려면
     꼴에서는 아래로 부풀어야 함 (2026-09-01 실측. 상이 앞뒤로 뒤집혀 붙었음) */
  sh.absellipse(0, d / 2 + grow, w / 2 + grow, d + grow * 2, Math.PI, Math.PI * 2, false);
  sh.closePath();
  return sh;
}

/** 상판 질감. 펠트에 인쇄 문구와 베팅 서클을 함께 구움 */
function feltPrint(w: number, d: number, seats: number, px = 2048): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = Math.round((px * d) / w);
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  const H = cv.height;
  /* 세계 좌표를 질감 좌표로. 상판 자리 상자는 폭 w, 깊이 d */
  const X = (x: number): number => ((x + w / 2) / w) * px;
  const Z = (z: number): number => ((z + d / 2) / d) * H;
  const S = px / w;

  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1f5e4c');
  g.addColorStop(0.55, '#2a6d58');
  g.addColorStop(1, '#1b5343');
  c.fillStyle = g;
  c.fillRect(0, 0, px, H);
  /* 천 결 */
  c.globalAlpha = 0.06;
  for (let i = 0; i < px; i += 3) {
    c.fillStyle = i % 6 === 0 ? '#ffffff' : '#000000';
    c.fillRect(i, 0, 1, H);
  }
  c.globalAlpha = 1;

  c.strokeStyle = 'rgba(240,232,206,.72)';
  c.fillStyle = 'rgba(240,232,206,.86)';
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  /* 딜러 쪽 곧은 변을 따라 도는 두 줄. 실물 상의 인쇄 문구 */
  const arcText = (text: string, r: number, size: number, alpha: number): void => {
    c.save();
    c.globalAlpha = alpha;
    c.translate(X(0), Z(-d / 2));
    c.font = '600 ' + Math.round(size * S) + 'px "Noto Serif KR", Georgia, serif';
    const step = 0.055;
    const start = -((text.length - 1) * step) / 2;
    for (let i = 0; i < text.length; i++) {
      const a = start + i * step;
      c.save();
      /* 캔버스에서 +y 는 아래다. `rotate(a)` 로 돌리면 (0, r) 이 왼쪽으로 가서 글자가
         오른쪽에서 왼쪽으로 놓임. 그래서 BLACKJACK 이 KCAJKCALB 로 찍힘
         (2026-09-01 실측. 질감을 꺼내 보고 알아냄. UV 는 애초에 멀쩡) */
      c.rotate(-a);
      c.translate(0, r * S);
      c.fillText(text[i], 0, 0);
      c.restore();
    }
    c.restore();
  };
  arcText('BLACKJACK PAYS 3 TO 2', d * 0.5, 0.17, 0.8);
  arcText('DEALER MUST STAND ON 17', d * 0.34, 0.115, 0.55);

  /* 보험 띠. 딜러와 사람 사이를 가름 */
  c.save();
  c.globalAlpha = 0.5;
  c.lineWidth = 0.02 * S;
  c.beginPath();
  c.ellipse(X(0), Z(-d / 2), d * 0.26 * S, d * 0.56 * S, 0, 0, Math.PI);
  c.stroke();
  c.font = '600 ' + Math.round(0.11 * S) + 'px "Noto Serif KR", Georgia, serif';
  c.globalAlpha = 0.55;
  c.fillText('INSURANCE PAYS 2 TO 1', X(0), Z(-d / 2 + d * 0.535));
  c.restore();

  /* 베팅 서클. 자리마다 두 겹 */
  for (let i = 0; i < seats; i++) {
    const sp = seatSpot(i, seats, w, d);
    c.save();
    c.globalAlpha = 0.72;
    c.lineWidth = 0.028 * S;
    c.beginPath();
    c.arc(X(sp.x), Z(sp.z), 0.42 * S, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 0.34;
    c.lineWidth = 0.014 * S;
    c.beginPath();
    c.arc(X(sp.x), Z(sp.z), 0.36 * S, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  return cv;
}

/** 칩 한 장의 빛깔. 카지노 표준 (흰 1, 빨강 5, 초록 25, 검정 100) */
const CHIP: Array<{ v: number; face: number; edge: number }> = [
  { v: 100, face: 0x1b1b1f, edge: 0xf2f2f2 },
  { v: 25, face: 0x1f7a4a, edge: 0xf2f2f2 },
  { v: 5, face: 0xb3242c, edge: 0xf2f2f2 },
  { v: 1, face: 0xf4f1e8, edge: 0x2a2a2a }
];

const chipGeo = new CylinderGeometry(0.19, 0.19, 0.035, 24);
const chipMats = new Map<number, MeshStandardMaterial>();
const chipMat = (hex: number): MeshStandardMaterial => {
  const hit = chipMats.get(hex);
  if (hit) return hit;
  const m = new MeshStandardMaterial({ color: new Color(hex), roughness: 0.55, metalness: 0.05 });
  chipMats.set(hex, m);
  return m;
};

/**
 * 판돈만큼 칩을 쌓음. 큰 값부터.
 * 열둘을 넘으면 두 줄. 한 줄로 쌓으면 화면 밖까지 솟음
 */
export function chipStack(amount: number): Group {
  const g = new Group();
  let left = Math.max(0, Math.floor(amount));
  const list: number[] = [];
  for (const c of CHIP) {
    while (left >= c.v && list.length < 24) {
      list.push(c.face);
      left -= c.v;
    }
  }
  list.forEach((hex, i) => {
    const col = Math.floor(i / 12);
    const m = new Mesh(chipGeo, chipMat(hex));
    m.position.set(col * 0.42, 0.018 + (i % 12) * 0.036, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  });
  return g;
}

/** 상과 상 위 물건 세우기 */
export function buildCasinoTable(scene: { add(o: object): void; remove(o: object): void }, spec: TableSpec): CasinoTable {
  const { w, d, topY, seats, aniso } = spec;
  const root = new Group();
  scene.add(root);
  const kill: Array<{ dispose(): void }> = [];

  /* 상판. 반원 판을 깎아 눕힘 */
  const topGeo = new ExtrudeGeometry(tableShape(w, d), { depth: TOP_T, bevelEnabled: false });
  topGeo.rotateX(-Math.PI / 2);
  /* 깎기는 위로 자람(`rotateX(-90도)` 뒤 꼴의 +z 가 세계 +y). 윗면이 topY 에 오게 내림
     (2026-09-01 실측: 상판이 카드 위로 솟아 카드가 상 속에 묻혔다) */
  topGeo.translate(0, topY - TOP_T, 0);
  /* 자리 좌표를 그대로 질감 좌표로 쓰려면 UV 를 상자 크기로 다시 재야 함 */
  const uv = topGeo.getAttribute('uv');
  const pos = topGeo.getAttribute('position');
  for (let i = 0; i < uv.count; i++) {
    /* v 를 뒤집어 준다. 질감은 올릴 때 세로로 한 번 뒤집히므로(flipY 기본값),
       v=1 이 캔버스 첫 줄이다. 딜러 인쇄를 캔버스 위에 그렸으니 딜러 쪽이 v=1
       (2026-09-01 실측: 안 뒤집었더니 인쇄가 거울처럼 뒤집혀 나왔다) */
    /* 질감은 올릴 때 세로로 한 번 뒤집힘(flipY 기본값). 그래서 v 를 되뒤집어야
       캔버스 위쪽이 딜러 쪽(-z) */
    uv.setXY(i, (pos.getX(i) + w / 2) / w, 1 - (pos.getZ(i) + d / 2) / d);
  }
  uv.needsUpdate = true;

  const feltMap = new CanvasTexture(feltPrint(w, d, seats));
  feltMap.colorSpace = SRGBColorSpace;
  feltMap.anisotropy = aniso;
  const topMat = new MeshStandardMaterial({ map: feltMap, roughness: 0.96, metalness: 0 });
  const top = new Mesh(topGeo, topMat);
  top.receiveShadow = true;
  top.castShadow = true;
  root.add(top);
  kill.push(topGeo, feltMap, topMat);

  /* 가죽 레일. 상판 둘레를 두른 팔걸이 */
  const railShape = tableShape(w, d, 0.3);
  railShape.holes.push(new Path(tableShape(w, d, 0.02).getPoints(64)));
  const railGeo = new ExtrudeGeometry(railShape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 });
  railGeo.rotateX(-Math.PI / 2);
  /* 레일은 펠트보다 조금 솟음. 팔을 얹는 자리 */
  railGeo.translate(0, topY - 0.08, 0);
  const railMap = new CanvasTexture(leatherTexture(29, 512));
  railMap.colorSpace = SRGBColorSpace;
  railMap.anisotropy = aniso;
  const railMat = new MeshStandardMaterial({ map: railMap, color: new Color(0x6b3a22), roughness: 0.62, metalness: 0.04 });
  const rail = new Mesh(railGeo, railMat);
  rail.castShadow = true;
  rail.receiveShadow = true;
  root.add(rail);
  kill.push(railGeo, railMap, railMat);

  /* 상 다리 대신 두꺼운 몸통. 아래가 비면 상이 떠 보임 */
  const bodyGeo = new ExtrudeGeometry(tableShape(w, d, -0.25), { depth: 0.9, bevelEnabled: false });
  bodyGeo.rotateX(-Math.PI / 2);
  bodyGeo.translate(0, topY - TOP_T - 0.9, 0);
  const bodyMat = new MeshStandardMaterial({ color: new Color(0x2a2018), roughness: 0.9, metalness: 0 });
  const body = new Mesh(bodyGeo, bodyMat);
  body.receiveShadow = true;
  root.add(body);
  kill.push(bodyGeo, bodyMat);

  /* 슈. 딜러 오른쪽에 비스듬히 놓인 카드집 */
  const shoePos = new Vector3(w * 0.3, topY, -d / 2 + 0.55);
  const shoeGroup = new Group();
  const shoeMat = new MeshStandardMaterial({ color: new Color(0x23303a), roughness: 0.45, metalness: 0.25 });
  kill.push(shoeMat);
  /* 상자 둘로 만든 비탈. 옆판과 바닥 */
  const boxGeo = new ExtrudeGeometry(
    (() => {
      const sh = new Shape();
      sh.moveTo(0, 0);
      sh.lineTo(0.62, 0);
      sh.lineTo(0.62, 0.34);
      sh.lineTo(0, 0.12);
      sh.closePath();
      return sh;
    })(),
    { depth: 0.5, bevelEnabled: false }
  );
  boxGeo.translate(-0.31, 0, -0.25);
  const shoeMesh = new Mesh(boxGeo, shoeMat);
  shoeMesh.rotation.y = -0.22;
  shoeMesh.castShadow = true;
  shoeMesh.receiveShadow = true;
  shoeGroup.add(shoeMesh);
  /* 안에 든 카드 더미. 뒷면이 위로 */
  const deckMap = new CanvasTexture(cardBackTexture(256));
  deckMap.colorSpace = SRGBColorSpace;
  deckMap.anisotropy = aniso;
  const deckMat = new MeshStandardMaterial({ map: deckMap, roughness: 0.8 });
  const deckGeo = new ExtrudeGeometry(
    (() => {
      const sh = new Shape();
      sh.moveTo(0, 0);
      sh.lineTo(0.5, 0);
      sh.lineTo(0.5, 0.26);
      sh.lineTo(0, 0.1);
      sh.closePath();
      return sh;
    })(),
    { depth: 0.42, bevelEnabled: false }
  );
  deckGeo.translate(-0.25, 0.03, -0.21);
  const deck = new Mesh(deckGeo, deckMat);
  deck.rotation.y = -0.22;
  deck.castShadow = true;
  shoeGroup.add(deck);
  kill.push(deckGeo);
  shoeGroup.position.copy(shoePos);
  root.add(shoeGroup);
  kill.push(boxGeo, deckMap, deckMat);

  /* 디스카드 트레이. 딜러 왼쪽 */
  const trayMat = new MeshStandardMaterial({ color: new Color(0x1d2830), roughness: 0.5, metalness: 0.2 });
  const trayGeo = new ExtrudeGeometry(
    (() => {
      const sh = new Shape();
      sh.moveTo(0, 0);
      sh.lineTo(0.6, 0);
      sh.lineTo(0.6, 0.3);
      sh.lineTo(0.52, 0.3);
      sh.lineTo(0.52, 0.06);
      sh.lineTo(0.08, 0.06);
      sh.lineTo(0.08, 0.3);
      sh.lineTo(0, 0.3);
      sh.closePath();
      return sh;
    })(),
    { depth: 0.46, bevelEnabled: false }
  );
  trayGeo.translate(-0.3, 0, -0.23);
  const tray = new Mesh(trayGeo, trayMat);
  tray.position.set(-w * 0.3, topY, -d / 2 + 0.55);
  tray.rotation.y = 0.22;
  tray.castShadow = true;
  tray.receiveShadow = true;
  root.add(tray);
  kill.push(trayGeo, trayMat);

  return {
    spot: (i, n) => seatSpot(i, n, w, d),
    shoe: new Vector3(shoePos.x, topY + 0.34, shoePos.z),
    dealerZ: -d / 2 + 0.62,
    dispose(): void {
      scene.remove(root);
      for (const k of kill) k.dispose();
      /* 칩 재료와 꼴은 판을 넘어 같이 씀. 여기서 버리면 다음 판이 빈 칩 */
    }
  };
}
