/**
 * 카드 무대. 방 안 탁자 위에 카드 놓기, 돌리기, 뒤집기
 *
 * 세 번째 입체 갈래다. 밑동은 `stage-core.ts`, 방은 `rooms.ts` 의 `buildRoom`,
 * 질감은 `texture.ts` 에서 굽는다. 여기서 새로 만드는 것은 카드 물건과 손패 배치뿐
 *
 * 카드 치수는 실물을 따른다. 포커 카드 63.5x88.9mm 라 1:1.4. 폭을 1 로 잡고 높이 1.4,
 * 두께 0.02(실물 0.3mm 는 폭의 0.005. 그대로 쓰면 옆면이 안 보이고 z 다툼)
 *
 * 카드는 **앞뒤 두 면만** 질감이 다르다. 옆면 넷은 종이 단면이라 흰색 한 가지
 *
 * 무늬는 규칙이 안 든다(`blackjack.ts` 는 1~13 숫자만 쓴다). 판정에 안 쓰이니
 * 화면이 값과 자리로 **정해진 무늬**를 고른다. 같은 자리의 같은 값은 늘 같은 무늬
 */
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3
} from '/packages/3d/vendor/three.module.min.js';
import { gloop, type GardenLoop } from '../garden/gloop';
import { mountStageCore } from './stage-core';
import { buildRoom, type Room } from './rooms';
import { handNow } from './hands';
import type { SceneId } from './scenes';
import { cardBackTexture, cardEdgeTexture, cardFaceTexture, feltTexture } from './texture';
import { suitOf } from './deck';
import { buildCasinoTable, chipStack, type CasinoTable } from './card-table';

/** 카드 한 장의 3D 치수 */
const CARD_W = 0.82;
const CARD_H = 1.148;
const CARD_T = 0.02;
/** 탁자. 카드 다섯 장 줄이 폭의 6할쯤 차지하게. 방이 보이려면 상이 화면을 덮으면 안 된다 */
const TABLE_W_DEFAULT = 6.6;
const TABLE_D_DEFAULT = 4.2;
const TOP_Y = 0.9;

export interface CardSpot {
  /** 카드 값 1~13. 0 이면 뒷면만 보이는 카드(아직 안 뽑힌 것) */
  rank: number;
  /** 앞면이 위인가 */
  up: boolean;
  /** 무늬 0~3. 안 주면 값과 자리로 정함 */
  suit?: number;
}

export interface CardHand {
  /** 이 줄이 누구 것인가. 딜러는 -1 */
  seat: number;
  cards: CardSpot[];
  /** 줄 옆에 적을 글. 합계나 이름 */
  label?: string;
  /**
   * 이 줄이 지금 어떤가. 이름표 빛깔이 갈림
   * 옛 무대는 `label` 을 받고도 안 그림. 누구 줄인지, 얼마인지 상 위에 없었음
   */
  tone?: 'idle' | 'turn' | 'win' | 'lose' | 'push';
}

export interface CardStageOpts {
  scene?: SceneId;
  /** 사람이 앉은 자리. 그 줄이 화면 앞쪽에 온다 */
  mySeat?: number;
  seats?: number;
  /**
   * 자리를 손패 줄이 아니라 **직접 잡는** 판(솔리테어). 상은 넓고 카메라는 위에서 내려봄
   * 블랙잭처럼 마주 앉는 판과 달리 판 전체가 한 사람 것
   */
  board?: { w: number; d: number };
  /** 카드를 눌렀을 때. `id` 는 부르는 쪽이 스폿에 붙인 이름 */
  onPick?(id: string): void;
  /** 끌기가 시작될 때. 들고 있던 것을 물리라는 뜻 */
  onDrop?(): void;
  /**
   * 상을 어떻게 차릴까. `casino` 면 반원 상판과 가죽 레일과 베팅 서클과 슈와
   * 디스카드 트레이를 세움 (`card-table.ts`). 블랙잭이 쓰는 값
   */
  table?: 'box' | 'casino';
}

/** 자리를 직접 잡는 카드 한 장. 솔리테어처럼 줄이 아니라 판이 있는 놀이 */
export interface CardSpotAt {
  /** 부르는 쪽이 붙인 이름. 누르면 이게 돌아온다 */
  id: string;
  /** 상 위 자리. 가운데가 0, 오른쪽이 +x, 앞이 +z */
  x: number;
  z: number;
  /** 카드 값 1~13. 0 이면 뒷면만 */
  rank: number;
  up: boolean;
  /** 겹쳐 쌓을 때 몇 번째인가. 높이와 그림 순서에 쓴다 */
  layer?: number;
  /** 무늬 0~3. 안 주면 값으로 정한다 */
  suit?: number;
  /** 지금 들려 있나. 살짝 뜬다 */
  held?: boolean;
}

export interface CardStage {
  ok: boolean;
  software: boolean;
  /** 손패를 통째로 새로 놓는다. 늘어난 카드는 날아와서 앉는다 */
  set(hands: CardHand[], mySeat?: number): void;
  /** 자리를 직접 잡아 놓는다(솔리테어). 빈 자리 표시는 부르는 쪽이 `rank: 0` 으로 */
  setBoard(spots: CardSpotAt[]): void;
  /** 빈 자리 테두리. 이름을 주면 그 자리에 놓을 수 있음(빈 열에 K 놓기) */
  setSlots(slots: Array<{ x: number; z: number; id?: string }>): void;
  /** 자리마다 걸린 판돈. 베팅 서클 위에 칩으로 쌓는다 (카지노 상에서만) */
  setChips(bets: Array<{ seat: number; amount: number }>): void;
  /**
   * 몇 자리 상인가. 붙일 때는 아직 모르므로 화면이 첫 그림에서 알려 줌.
   * 베팅 서클 수가 여기서 갈림
   */
  setSeats(n: number): void;
  /** 안 되는 것. 그 자리 카드가 빨갛게 떨린다 */
  nope(id: string): void;
  resize(): void;
  dispose(): void;
}

/* 값과 자리로 정해지는 무늬는 `deck.ts` 의 `suitOf`. 평면 카드와 같은 셈법 */

/** 한 줄에 카드가 몇 장이든 가운데를 맞춰 늘어놓는다. 많아지면 겹친다 */
const spread = (n: number, tight = false): number[] => {
  if (n <= 0) return [];
  /* 카지노 상에서는 실물처럼 겹쳐 놓음. 벌려 놓으면 한 손이 상 절반을 먹음 */
  const gap = tight
    ? (n <= 4 ? CARD_W * 0.44 : (CARD_W * 1.9) / n)
    : n <= 5
      ? CARD_W * 1.24
      : (CARD_W * 6.2) / n;
  const start = -((n - 1) * gap) / 2;
  return Array.from({ length: n }, (_, i) => start + i * gap);
};

export function mountCardStage(host: HTMLElement, opts: CardStageOpts = {}): CardStage {
  const TABLE_W = opts.board?.w ?? TABLE_W_DEFAULT;
  const TABLE_D = opts.board?.d ?? TABLE_D_DEFAULT;
  /* 화소 배율 상한 2. 1.5 로 두면 200% 화면에서 native 의 75% 로만 그려 카드 글자가
     뭉갠다 (2026-09-01 실측: dpr 2 에서 표본배율 1.6). 오목이 방 없을 때 쓰는 값과 같다 */
  const core = mountStageCore(host, { shadow: 'soft', exposure: 1.05, maxPixelRatio: 2 });
  if (!core) return { ok: false, software: false, set: () => {}, setBoard: () => {}, setSlots: () => {}, setChips: () => {}, setSeats: () => {}, nope: () => {}, resize: () => {}, dispose: () => {} };
  const { renderer } = core;

  /* 이방성 거르기. 카드는 상에 눕고 카메라는 40도쯤 위에서 내려보므로 화면에서 세로가
     크게 줄어든다. 이방성이 없으면 밉맵이 그 방향을 뭉개 글자와 무늬가 흐려진다.
     오목은 4, 야추는 8 을 걸고 있었고 여기만 안 걸려 있었다 (2026-09-01 실측) */
  const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const sharp = <T extends { anisotropy: number }>(m: T): T => {
    m.anisotropy = ANISO;
    return m;
  };

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 80);
  const sceneId: SceneId = opts.scene ?? 'tatami';
  host.classList.add('ac-scene-' + sceneId);

  const room: Room | null = buildRoom(scene, sceneId, TABLE_W);

  /* 상. 카지노 상은 반원 상판과 가죽 레일과 인쇄 문구까지.
     그 밖의 판은 천 씌운 네모 상 하나 */
  const casino = opts.table === 'casino';
  let seatCount = Math.max(1, opts.seats ?? 3);
  let dressed: CasinoTable | null = null;
  let feltMap: { dispose(): void } | null = null;
  let feltMat: { dispose(): void } | null = null;
  if (casino) {
    dressed = buildCasinoTable(scene, { w: TABLE_W, d: TABLE_D, topY: TOP_Y, seats: seatCount, aniso: ANISO });
  } else {
    const fm = sharp(new CanvasTexture(feltTexture(23, 512)));
    fm.colorSpace = SRGBColorSpace;
    fm.wrapS = fm.wrapT = 1000; /* RepeatWrapping */
    fm.repeat.set(3, 2);
    const mat = new MeshStandardMaterial({ map: fm, color: new Color(0x2f6f5e), roughness: 0.95, metalness: 0 });
    const table = new Mesh(new BoxGeometry(TABLE_W, 0.24, TABLE_D), mat);
    table.position.set(0, TOP_Y - 0.12, 0);
    table.receiveShadow = true;
    table.castShadow = true;
    scene.add(table);
    feltMap = fm;
    feltMat = mat;
  }

  /* 빛. 방이 제 빛을 들고 오지만 탁자 위 카드가 읽히려면 한 줄기 더 */
  const lamp = new DirectionalLight(0xfff0dc, 1.15);
  lamp.position.set(2.2, 6.5, 3.2);
  lamp.castShadow = true;
  /* 오목과 야추가 2048. 1024 면 카드 그림자 테두리가 계단으로 보인다 */
  lamp.shadow.mapSize.set(2048, 2048);
  scene.add(lamp);

  /* 카드 재료. 앞면은 값마다 다르므로 만들어 두고 쓴다(52장을 미리 굽지 않는다) */
  const backMap = sharp(new CanvasTexture(cardBackTexture(512)));
  backMap.colorSpace = SRGBColorSpace;
  /* 질감이 모서리 밖을 지운다. 알파를 켜야 상자 모서리가 안 각져 보임 */
  const backMat = new MeshStandardMaterial({ map: backMap, roughness: 0.75, metalness: 0, transparent: true, alphaTest: 0.5 });
  /* 옆면. 모서리에서 앞뒤가 지워지므로 여기도 알파 질감으로 잘라 냄 */
  const edgeMap = sharp(new CanvasTexture(cardEdgeTexture(256)));
  const edgeMat = new MeshStandardMaterial({ map: edgeMap, color: 0xf6f1e6, roughness: 0.9, metalness: 0, transparent: true, alphaTest: 0.5 });
  const faceCache = new Map<string, MeshStandardMaterial>();
  const faceMatOf = (rank: number, suit: number): MeshStandardMaterial => {
    const k = rank + ':' + suit;
    const hit = faceCache.get(k);
    if (hit) return hit;
    const map = sharp(new CanvasTexture(cardFaceTexture(rank, suit, 512)));
    map.colorSpace = SRGBColorSpace;
    const m = new MeshStandardMaterial({ map, roughness: 0.72, metalness: 0, transparent: true, alphaTest: 0.5 });
    faceCache.set(k, m);
    return m;
  };

  /* 한 장. 앞면은 +Y, 뒷면은 -Y (탁자에 눕혀 놓는다) */
  const cardGeo = new BoxGeometry(CARD_W, CARD_T, CARD_H);
  interface Live {
    mesh: Mesh;
    /* 날아가는 중이면 어디서 어디로 */
    from: Vector3;
    to: Vector3;
    t0: number;
    ms: number;
    /* 뒤집는 중이면 어느 각에서 어느 각으로 */
    rFrom: number;
    rTo: number;
  }
  const live: Live[] = [];
  const holder = new Group();
  scene.add(holder);

  /* ── 줄 이름표 ──
     `CardHand.label` 을 받고도 안 그리던 자리. 누구 줄인지, 합계가 얼마인지 상 위에 없어
     사람이 아래 HUD 한 줄만 보고 쳤다. 상에 눕혀 놓는다. 카메라가 위에서 내려보므로 읽힌다 */
  const TONE: Record<string, string> = {
    idle: '#efe7d4',
    turn: '#ffd66b',
    win: '#8fe0a6',
    lose: '#f0938f',
    push: '#cfd6e0'
  };
  const labelGroup = new Group();
  scene.add(labelGroup);
  /* 이름표 한 장. 글자 길이에 맞춰 캔버스를 잡는다. 고정 512x128 을 늘려 쓰면 가로로
     늘어나 글자가 뭉개진다 (2026-09-01 사용자 지적: 글자 해상도가 낮다) */
  const LABEL_H = 0.26;
  /* 월드 한 단위에 몇 화소인가. 야추 점수표가 111, 오목 좌표가 그 언저리 */
  const LABEL_PPU = 620;
  const labelGeo = new BoxGeometry(1, 0.004, 1);
  const labelMats: MeshStandardMaterial[] = [];
  const mkLabel = (text: string, tone: string): Mesh | null => {
    if (!text) return null;
    const ch = Math.round(LABEL_H * LABEL_PPU);
    const font = '700 ' + Math.round(ch * 0.52) + 'px "Noto Sans KR", system-ui, sans-serif';
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) return null;
    probe.font = font;
    const pad = ch * 0.42;
    const cw = Math.max(ch * 2, Math.ceil(probe.measureText(text).width + pad * 2));
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const c = cv.getContext('2d');
    if (!c) return null;
    c.clearRect(0, 0, cw, ch);
    /* 알약 모양. 상 위에서 글자가 천에 묻히지 않게 */
    c.fillStyle = 'rgba(16,14,11,.66)';
    const r = ch * 0.44;
    const m = ch * 0.06;
    c.beginPath();
    c.moveTo(m + r, m);
    c.arcTo(cw - m, m, cw - m, ch - m, r);
    c.arcTo(cw - m, ch - m, m, ch - m, r);
    c.arcTo(m, ch - m, m, m, r);
    c.arcTo(m, m, cw - m, m, r);
    c.closePath();
    c.fill();
    c.fillStyle = TONE[tone] ?? TONE.idle;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font;
    c.fillText(text, cw / 2, ch * 0.54);
    const map = sharp(new CanvasTexture(cv));
    map.colorSpace = SRGBColorSpace;
    const mat = new MeshStandardMaterial({ map, transparent: true, roughness: 1, metalness: 0 });
    labelMats.push(mat);
    const mesh = new Mesh(labelGeo, mat);
    /* 캔버스와 같은 비를 준다. 늘리지 않으므로 글자가 안 뭉개진다 */
    mesh.scale.set((cw / ch) * LABEL_H, 1, LABEL_H);
    return mesh;
  };
  const clearLabels = (): void => {
    while (labelGroup.children.length) labelGroup.remove(labelGroup.children[0]);
    for (const m of labelMats) {
      m.map?.dispose();
      m.dispose();
    }
    labelMats.length = 0;
  };

  const mkCard = (rank: number, suit: number, faceUp: boolean): Mesh => {
    /* 상자 재료 여섯. 오른, 왼, 위, 아래, 앞, 뒤 순서 */
    const face = rank > 0 ? faceMatOf(rank, suit) : backMat;
    const m = new Mesh(cardGeo, [edgeMat, edgeMat, face, backMat, edgeMat, edgeMat]);
    m.castShadow = true;
    m.receiveShadow = true;
    m.rotation.z = faceUp ? 0 : Math.PI;
    return m;
  };

  /* 카드가 나오는 자리. 딜러 뒤 카드집 */
  const shoe = dressed ? dressed.shoe.clone() : new Vector3(TABLE_W / 2 - 0.9, TOP_Y + 0.4, -TABLE_D / 2 + 0.7);

  let mySeat = opts.mySeat ?? 0;
  /* 줄 자리. 딜러는 안쪽, 사람은 앞쪽.
     자리 수는 무대가 손패 목록에서 읽는다. 붙일 때는 몇 명이 앉을지 아직 모른다
     (2026-09-01 실측: 하나로 알고 세 사람 손패를 같은 자리에 겹쳐 놨다) */
  const rowZ = (seat: number): number => (seat < 0 ? -TABLE_D * 0.3 : TABLE_D * 0.24);
  /* 내 줄은 앞 가운데, 남의 줄은 그 뒤 좌우로. 내 손패가 늘 같은 자리에 있어야 눈이 안 헤맨다 */
  const rowOf = (seat: number, others: number[]): { x: number; z: number; s: number } => {
    if (casino && dressed) {
      /* 카지노 상. 사람은 반원 위에 나란히, 카드는 제 베팅 서클보다 딜러 쪽 */
      if (seat < 0) return { x: 0, z: dressed.dealerZ, s: 0.92 };
      const n = seatCount;
      const order = seatOrder(n);
      const sp = dressed.spot(order.indexOf(seat), n);
      return { x: sp.x * 0.9, z: sp.z - 0.86, s: seat === mySeat ? 0.86 : 0.7 };
    }
    if (seat < 0) return { x: 0, z: rowZ(-1), s: 1 };
    if (seat === mySeat) return { x: 0, z: rowZ(seat), s: 1 };
    const i = others.indexOf(seat);
    const n = Math.max(1, others.length);
    /* 남의 줄은 작게. 판이 좁아도 내 카드가 안 밀린다 */
    /* 상 위를 벗어나면 카드가 허공에 뜬 것처럼 보인다. 작은 줄 폭까지 넣어 안쪽으로 */
    const w = TABLE_W * 0.52;
    const x = n === 1 ? 0 : -w / 2 + (i * w) / (n - 1);
    return { x, z: rowZ(seat) - TABLE_D * 0.16, s: 0.58 };
  };

  /**
   * 자리를 반원 어디에 앉힐까. 내가 가운데, 나머지가 좌우로.
   * 사람이 늘 화면 앞 가운데를 봐야 눈이 안 헤맴
   */
  const seatOrder = (n: number): number[] => {
    const rest: number[] = [];
    for (let i = 0; i < n; i++) if (i !== mySeat) rest.push(i);
    const out: number[] = [];
    const mid = Math.floor(n / 2);
    for (let i = 0; i < n; i++) out.push(i === mid ? mySeat : (rest.shift() as number));
    return out;
  };

  /* 칩 무더기. 자리마다 하나 */
  const chipGroup = new Group();
  scene.add(chipGroup);
  const setChips = (bets: Array<{ seat: number; amount: number }>): void => {
    if (!casino || !dressed) return;
    const key = JSON.stringify(bets);
    if (key === chipKey) return;
    chipKey = key;
    while (chipGroup.children.length) chipGroup.remove(chipGroup.children[0]);
    const order = seatOrder(seatCount);
    for (const b of bets) {
      if (b.amount <= 0) continue;
      const sp = dressed.spot(order.indexOf(b.seat), seatCount);
      const st = chipStack(b.amount);
      st.position.set(sp.x, TOP_Y, sp.z);
      chipGroup.add(st);
    }
    need = true;
    render();
  };
  let chipKey = '';

  /* 자리 수가 바뀌면 상판 인쇄를 다시 굽는다는 뜻. 판마다 한 번뿐이라 값이 쌈 */
  const setSeats = (n: number): void => {
    const want = Math.max(1, n);
    if (!casino || want === seatCount) return;
    seatCount = want;
    dressed?.dispose();
    dressed = buildCasinoTable(scene, { w: TABLE_W, d: TABLE_D, topY: TOP_Y, seats: seatCount, aniso: ANISO });
    shoe.copy(dressed.shoe);
    shownKey = '';
    chipKey = '';
    need = true;
    render();
  };

  let shown: CardHand[] = [];
  /* 화면은 매 프레임 같은 손패를 다시 준다. 그때마다 새로 놓으면 애니메이션이 늘 처음으로
     돌아가 카드가 중간 자세로 굳는다(2026-09-01 실측: 카드가 선 채로 멈춤) */
  let shownKey = '';
  let need = true;
  let loop: GardenLoop | null = null;

  const render = (): void => {
    renderer.render(scene, camera);
  };

  const fit = (): void => {
    const { aspect } = core.fit();
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    /* 세로로 긴 창이면 뒤로 물러선다. 탁자 폭이 다 들어와야 손패가 안 잘린다 */
    const tall = aspect < 0.95;
    if (opts.board) {
      /* 판 전체가 한 사람 것이라 위에서 내려본다. 상 폭이 화면에 다 들어와야 한다 */
      /* 상 폭과 깊이가 다 들어와야 한다. 시야각 40도라 깊이 쪽이 더 멀다 */
      const need = Math.max(TABLE_W / Math.max(0.6, aspect), TABLE_D * 0.92);
      camera.position.set(0, TOP_Y + need * 1.42, need * 0.86);
      camera.lookAt(0, TOP_Y, 0.35);
    } else if (casino) {
      /* 낮게 앉아 상이 화면을 채움. 높이서 보면 상 너머 빈 바닥이 절반 */
      camera.position.set(0, tall ? 4.5 : 3.6, tall ? 5.0 : 4.3);
      camera.lookAt(0, TOP_Y, 0.25);
    } else {
      camera.position.set(0, tall ? 6.6 : 5.4, tall ? 6.2 : 5.6);
      /* 내 줄이 화면 아래로 안 잘리게 시선을 조금 앞으로 */
      camera.lookAt(0, TOP_Y, 0.5);
    }
    need = true;
    render();
  };

  const step = (): void => {
    const now = performance.now();
    let busy = false;
    for (const c of live) {
      /* 아직 차례가 안 온 카드는 카드집에 그대로. 음수로 내려가면 자리가 튄다 */
      const k = Math.max(0, Math.min(1, (now - c.t0) / c.ms));
      /* 끝에서 부드럽게 멎는다. 카드는 던지는 것이 아니라 미끄러뜨리는 것 */
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      c.mesh.position.lerpVectors(c.from, c.to, e);
      /* 날아가는 동안 살짝 뜬다. 멀리 갈수록 높이. 한 칸 옮기는데 크게 뜨면 과장스럽다 */
      /* 뜨는 높이는 거리에 비례. 다만 제자리에서 도는 카드(딜러가 감춘 것을 여는 순간)는
         거리가 0 이라 그냥 두면 상을 뚫고 도는 것처럼 보인다. 도는 값이 있으면 조금 띄운다 */
      const spin = Math.abs(c.rTo - c.rFrom) > 0.1 ? 0.16 : 0;
      const hop = Math.min(0.35, Math.max(c.from.distanceTo(c.to) * 0.11, spin));
      c.mesh.position.y += Math.sin(Math.PI * k) * hop;
      c.mesh.rotation.z = c.rFrom + (c.rTo - c.rFrom) * e;
      if (k < 1 || now < c.t0) busy = true;
    }
    if (busy || need) {
      need = false;
      render();
    }
    if (!busy && loop) {
      loop.stop();
      loop = null;
    }
  };

  const wake = (): void => {
    if (!loop) loop = gloop(step);
  };

  const set = (hands: CardHand[], seat?: number): void => {
    const now = performance.now();
    if (typeof seat === 'number' && seat !== mySeat) {
      mySeat = seat;
      shownKey = '';
    }
    const key = JSON.stringify(hands);
    if (key === shownKey) return;
    const before = shownKey;
    shownKey = key;

    /* 놓인 것을 다 걷고 다시 놓기. 한 판에 카드가 스무 장을 안 넘어 걷는 값이 쌈
       자리를 재는 인덱스를 들고 있던 판에서는 옛 카드가 남아 겹침(2026-09-01 실측) */
    /* `live` 에 없는 자식이 하나라도 남으면 영영 안 지워진다. 담는 자리를 통째로 비운다 */
    while (holder.children.length) holder.remove(holder.children[0]);
    live.length = 0;
    clearLabels();

    /* 앞 화면에 그 자리 카드가 이미 있었으면 그대로 놓고, 새로 온 것만 카드집에서 날아온다 */
    /* 한 자리가 줄을 여럿 낼 수 있다(블랙잭 스플릿). 자리 번호만으로는 같은 열쇠가 되어
       옛 카드가 남의 줄로 새므로, 그 자리에서 몇 번째 줄인지까지 열쇠에 넣는다 */
    const rowNo = new Map<number, number>();
    const keyOf = (seat: number, nth: number, i: number): string => seat + '/' + nth + ':' + i;
    const had = new Map<string, boolean>();
    {
      const seen = new Map<number, number>();
      for (const h of shown) {
        const nth = seen.get(h.seat) ?? 0;
        seen.set(h.seat, nth + 1);
        h.cards.forEach((c, i) => had.set(keyOf(h.seat, nth, i), c.up));
      }
    }

    let dealt = 0;
    const others = [...new Set(hands.map((h) => h.seat).filter((n) => n >= 0 && n !== mySeat))];
    /* 한 자리의 줄이 여럿이면 그만큼 좌우로 벌림. 안 벌리면 겹쳐서 한 줄로 보임 */
    const rows = new Map<number, number>();
    for (const h of hands) rows.set(h.seat, (rows.get(h.seat) ?? 0) + 1);
    for (const h of hands) {
      const nth = rowNo.get(h.seat) ?? 0;
      rowNo.set(h.seat, nth + 1);
      const many = rows.get(h.seat) ?? 1;
      const row = rowOf(h.seat, others);
      if (many > 1) {
        /* 줄 폭을 나눠 씀. 카드도 같이 작아짐 */
        const share = 1 / many;
        row.s *= Math.max(0.5, share + 0.2);
        row.x += (nth - (many - 1) / 2) * (TABLE_W * 0.3) * share * 2;
      }
      const xs = spread(h.cards.length, casino);
      h.cards.forEach((card, i) => {
        /* 상 윗면이 TOP_Y. 카드 두께 절반만 띄움 (2026-09-01 사용자 지적. 카드가 공중에 떠 있었음) */
        const to = new Vector3(row.x + xs[i] * row.s, TOP_Y + CARD_T / 2 + i * 0.004, row.z);
        const wasUp = before ? had.get(keyOf(h.seat, nth, i)) : undefined;
        const old = wasUp !== undefined;
        const mesh = mkCard(card.rank, card.suit ?? suitOf(card.rank, h.seat, i), card.up);
        if (row.s !== 1) mesh.scale.setScalar(row.s);
        if (old) {
          mesh.position.copy(to);
          if (wasUp !== card.up) {
            /* 그 자리에서 뒤집음. 딜러가 감춘 카드를 여는 순간
               (옛 판은 감춘 카드를 아예 안 뽑아서 뒤집는 그림이 통째로 없었다) */
            mesh.rotation.z = wasUp ? 0 : Math.PI;
            holder.add(mesh);
            live.push({
              mesh,
              from: to.clone(),
              to,
              t0: now,
              ms: 460,
              rFrom: wasUp ? 0 : Math.PI,
              rTo: card.up ? 0 : Math.PI
            });
            return;
          }
          /* 있던 카드. 그 자리에 그대로 */
          mesh.rotation.z = card.up ? 0 : Math.PI;
          holder.add(mesh);
          live.push({ mesh, from: to.clone(), to, t0: now - 1000, ms: 1, rFrom: mesh.rotation.z, rTo: mesh.rotation.z });
          return;
        }
        mesh.position.copy(shoe);
        mesh.rotation.z = Math.PI;
        holder.add(mesh);
        live.push({ mesh, from: shoe.clone(), to, t0: now + dealt * 130, ms: 460, rFrom: Math.PI, rTo: card.up ? 0 : Math.PI });
        dealt += 1;
      });
      /* 줄 이름표. 카드 줄 앞쪽에 눕힘 */
      const tag = mkLabel(h.label ?? '', h.tone ?? 'idle');
      if (tag) {
        /* 크기는 `mkLabel` 이 글자 길이로 이미 잡았다. 줄 배율만 곱한다 */
        tag.scale.multiplyScalar(row.s);
        /* 이름표 자리. 딜러는 제 카드 위(상 안쪽), 사람은 제 카드 아래.
           같은 쪽에 몰면 앞줄 카드가 뒷줄 이름표를 덮고, 딜러 것을 더 올리면 상 밖으로
           나가 잘린다 (2026-09-01 화면 실측 두 번) */
        const up = h.seat < 0 ? -1 : 1;
        tag.position.set(row.x, TOP_Y + 0.004, row.z + up * (CARD_H / 2 + 0.24) * row.s);
        labelGroup.add(tag);
      }
    }
    shown = hands.map((h) => ({ seat: h.seat, label: h.label, tone: h.tone, cards: h.cards.map((c) => ({ ...c })) }));
    need = true;
    wake();
  };

  /* ── 자리를 직접 잡는 판(솔리테어) ── */
  const slotGroup = new Group();
  scene.add(slotGroup);
  const slotGeo = new BoxGeometry(CARD_W * 1.02, 0.01, CARD_H * 1.02);
  const slotMat = new MeshStandardMaterial({ color: 0x1d4a3a, roughness: 1, metalness: 0, transparent: true, opacity: 0.55 });
  const slotNames = new Map<Mesh, string>();
  const setSlots = (slots: Array<{ x: number; z: number; id?: string }>): void => {
    while (slotGroup.children.length) slotGroup.remove(slotGroup.children[0]);
    slotNames.clear();
    for (const sl of slots) {
      const m = new Mesh(slotGeo, slotMat);
      m.position.set(sl.x, TOP_Y + 0.005, sl.z);
      m.receiveShadow = true;
      slotGroup.add(m);
      if (sl.id) slotNames.set(m, sl.id);
    }
    need = true;
    render();
  };

  /** 눌린 카드를 찾으려고 이름을 들고 있는다 */
  const picks = new Map<Mesh, string>();
  let boardKey = '';
  /**
   * 이름표로 물건을 들고 있는다. 같은 카드는 **다시 만들지 않고 옮긴다**
   * 새로 만들면 순간이동이라 손맛이 죽는다(`features/play.md` 의 손맛)
   */
  const byName = new Map<string, Mesh>();
  const setBoard = (spots: CardSpotAt[]): void => {
    const key = JSON.stringify(spots);
    if (key === boardKey) return;
    boardKey = key;
    const now = performance.now();
    const keep = new Set<string>();
    const next: Live[] = [];

    for (const sp of spots) {
      const layer = sp.layer ?? 0;
      const to = new Vector3(sp.x, TOP_Y + CARD_T / 2 + layer * 0.006 + (sp.held ? 0.2 : 0), sp.z);
      const face = sp.rank > 0;
      /* 앞뒤가 갈리면 다른 물건이라 새로 만든다. 그 밖에는 있던 것을 옮긴다 */
      const name = sp.id + '|' + (face ? sp.rank + ':' + (sp.suit ?? 0) : 'b');
      keep.add(sp.id);
      const had = byName.get(sp.id);
      const same = had && had.userData.name === name;
      const mesh = same ? (had as Mesh) : mkCard(sp.rank, sp.suit ?? suitOf(sp.rank, 0, layer), sp.up);
      mesh.userData.name = name;
      if (!same) {
        if (had) holder.remove(had);
        /* 새로 나온 카드는 있던 자리가 없다. 그 자리에서 시작한다 */
        mesh.position.copy(to);
        mesh.rotation.z = sp.up ? 0 : Math.PI;
        holder.add(mesh);
      }
      mesh.rotation.y = sp.held ? 0.06 : 0;
      byName.set(sp.id, mesh);
      picks.set(mesh, sp.id);
      next.push({
        mesh,
        from: mesh.position.clone(),
        to,
        t0: now,
        ms: same ? 240 : 1,
        rFrom: mesh.rotation.z,
        rTo: sp.up ? 0 : Math.PI
      });
    }

    /* 없어진 자리는 치운다 */
    for (const [id, mesh] of [...byName.entries()]) {
      if (keep.has(id)) continue;
      holder.remove(mesh);
      picks.delete(mesh);
      byName.delete(id);
    }

    live.length = 0;
    live.push(...next);
    need = true;
    wake();
  };

  /**
   * 안 되는 것. 그 자리 카드를 잠깐 빨갛게 물들이고 흔듦
   * 평면은 CSS 로 하지만 입체는 재료와 자리를 직접 건드림
   */
  /* 완전히 빨간 카드가 아니라 붉은 기운만. 단색 점멸은 과하다(사용자 지적) */
  const redMat = new MeshStandardMaterial({ color: 0xe8a9a5, roughness: 0.72, metalness: 0 });
  const nope = (id: string): void => {
    const mesh = byName.get(id);
    if (!mesh) return;
    const was = mesh.material;
    mesh.material = redMat;
    const x0 = mesh.position.x;
    const t0 = performance.now();
    const shake = (): void => {
      const k = (performance.now() - t0) / 380;
      if (k >= 1) {
        mesh.position.x = x0;
        mesh.material = was;
        need = true;
        render();
        return;
      }
      mesh.position.x = x0 + Math.sin(k * Math.PI * 6) * 0.09 * (1 - k);
      need = true;
      render();
      requestAnimationFrame(shake);
    };
    shake();
  };

  /**
   * 누르기와 끌기. 화면은 이름만 받고 무대는 규칙을 모름
   *
   * 끌면 그 카드가 제자리에서 떠오름. 떼는 자리의 카드나 빈 자리 이름을 냄
   * 입체가 정본이라 평면에 있는 손놀림은 여기에도 있어야 함(`features/play.md`)
   */
  if (opts.onPick) {
    const ray = new Raycaster();
    const ndc = new Vector2();
    let lift: { mesh: Mesh; id: string; home: Vector3 } | null = null;
    let downAt: { x: number; y: number } | null = null;
    /** 든 카드가 떠 있는 높이. 그 평면에서 손끝 자리를 푼다 */
    const LIFT_Y = TOP_Y + 0.45;
    const liftPlane = new Plane(new Vector3(0, 1, 0), -LIFT_Y);
    const at = new Vector3();

    const aim = (ev: PointerEvent): void => {
      const r = core.canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
    };
    /** 손끝 아래 카드 이름. 없으면 빈 자리 이름 */
    const under = (skip?: Mesh): string | undefined => {
      /* 든 카드 자신은 뺀다. 손끝 아래 있는 것은 그 카드가 아니라 놓을 자리다 */
      const cards = holder.children.filter((o) => o !== skip);
      const hit = ray.intersectObjects(cards, false)[0]?.object as Mesh | undefined;
      if (hit) return picks.get(hit);
      const slot = ray.intersectObjects(slotGroup.children, false)[0]?.object as Mesh | undefined;
      return slot ? slotNames.get(slot) : undefined;
    };

    core.canvas.addEventListener('pointerdown', (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      aim(ev);
      const hit = ray.intersectObjects(holder.children, false)[0]?.object as Mesh | undefined;
      const id = hit ? picks.get(hit) : undefined;
      downAt = { x: ev.clientX, y: ev.clientY };
      lift = hit && id ? { mesh: hit, id, home: hit.position.clone() } : null;
    });

    core.canvas.addEventListener('pointermove', (ev: PointerEvent) => {
      if (!lift || !downAt || handNow() !== 'drag') return;
      if (Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) < 5) return;
      /* 든 카드가 **손끝을 따라온다**. 인벤토리에서 물건 끄는 그 느낌(사용자 요청)
         카드가 떠 있는 높이의 평면에서 손끝이 가리키는 자리를 푼다 */
      aim(ev);
      if (!ray.ray.intersectPlane(liftPlane, at)) return;
      /* 옮기는 애니메이션이 도로 끌어내리지 않게 그 카드는 셈에서 뺀다 */
      const i = live.findIndex((c) => c.mesh === lift?.mesh);
      if (i >= 0) live.splice(i, 1);
      /* 상 밖으로는 안 나간다. 나가면 어디 갔는지 모른다 */
      const w = TABLE_W / 2 - CARD_W * 0.4;
      const d = TABLE_D / 2 - CARD_H * 0.4;
      lift.mesh.position.set(
        Math.max(-w, Math.min(w, at.x)),
        LIFT_Y,
        Math.max(-d, Math.min(d, at.z))
      );
      lift.mesh.rotation.y = 0.1;
      /* 그 카드가 맨 위에 그려지게. 다른 카드에 파묻히면 안 든 것처럼 보인다 */
      lift.mesh.renderOrder = 10;
      need = true;
      render();
    });

    const finish = (ev: PointerEvent): void => {
      const held = lift;
      const from = downAt;
      lift = null;
      downAt = null;
      if (!held || !from) return;
      const moved = handNow() === 'drag' && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) >= 5;
      aim(ev);
      if (!moved) {
        /* 그냥 누른 것 */
        opts.onPick?.(held.id);
        return;
      }
      /* 끌어서 뗀 자리. 든 카드는 셈에서 빠져 있으니 그 아래가 잡힘 */
      const to = under(held.mesh);
      held.mesh.position.copy(held.home);
      held.mesh.rotation.y = 0;
      held.mesh.renderOrder = 0;
      need = true;
      render();
      /**
       * 집고 놓는 두 걸음으로. 화면 쪽 규칙이 그대로 돎
       * `drop` 을 먼저 보내 들고 있던 것을 물림. 안 그러면 새로 잡은 카드가 놓기로 읽힘
       * (2026-09-01 사용자 실측: 먼저 든 것을 물려야 다시 끌 수 있었음)
       */
      opts.onDrop?.();
      opts.onPick?.(held.id);
      if (to && to !== held.id) opts.onPick?.(to);
    };
    core.canvas.addEventListener('pointerup', finish);
    core.canvas.addEventListener('pointercancel', finish);
  }

  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  render();

  return {
    ok: true,
    software: core.software,
    set,
    setBoard,
    setChips,
    setSeats,
    setSlots,
    nope,
    resize: fit,
    dispose(): void {
      ro.disconnect();
      clearLabels();
      labelGeo.dispose();
      loop?.stop();
      loop = null;
      room?.dispose();
      cardGeo.dispose();
      slotGeo.dispose();
      slotMat.dispose();
      redMat.dispose();
      feltMap?.dispose();
      dressed?.dispose();
      backMap.dispose();
      edgeMap.dispose();
      feltMat?.dispose();
      [backMat, edgeMat].forEach((m) => m.dispose());
      faceCache.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      core.dispose();
    }
  };
}
