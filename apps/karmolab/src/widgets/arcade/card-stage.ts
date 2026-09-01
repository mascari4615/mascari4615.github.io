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
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3
} from '/packages/3d/vendor/three.module.min.js';
import { gloop, type GardenLoop } from '../garden/gloop';
import { mountStageCore } from './stage-core';
import { buildRoom, type Room } from './rooms';
import type { SceneId } from './scenes';
import { cardBackTexture, cardFaceTexture, feltTexture } from './texture';

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
}

export interface CardHand {
  /** 이 줄이 누구 것인가. 딜러는 -1 */
  seat: number;
  cards: CardSpot[];
  /** 줄 옆에 적을 글. 합계나 이름 */
  label?: string;
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
  /** 빈 자리 테두리. 스톡, 웨이스트, 파운데이션, 빈 열 */
  setSlots(slots: Array<{ x: number; z: number }>): void;
  resize(): void;
  dispose(): void;
}

/** 값과 자리로 정해지는 무늬. 판정에 안 쓰이니 화면이 정한다 */
const suitOf = (rank: number, seat: number, i: number): number => (rank * 7 + seat * 3 + i * 5) % 4;

/** 한 줄에 카드가 몇 장이든 가운데를 맞춰 늘어놓는다. 많아지면 겹친다 */
const spread = (n: number): number[] => {
  if (n <= 0) return [];
  /* 다섯 장까지는 사이를 벌리고, 그 뒤로는 겹쳐서 줄 길이를 지킨다 */
  const gap = n <= 5 ? CARD_W * 1.24 : (CARD_W * 6.2) / n;
  const start = -((n - 1) * gap) / 2;
  return Array.from({ length: n }, (_, i) => start + i * gap);
};

export function mountCardStage(host: HTMLElement, opts: CardStageOpts = {}): CardStage {
  const TABLE_W = opts.board?.w ?? TABLE_W_DEFAULT;
  const TABLE_D = opts.board?.d ?? TABLE_D_DEFAULT;
  const core = mountStageCore(host, { shadow: 'soft', exposure: 1.05 });
  if (!core) return { ok: false, software: false, set: () => {}, setBoard: () => {}, setSlots: () => {}, resize: () => {}, dispose: () => {} };
  const { renderer } = core;

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 80);
  const sceneId: SceneId = opts.scene ?? 'tatami';
  host.classList.add('ac-scene-' + sceneId);

  const room: Room | null = buildRoom(scene, sceneId, TABLE_W);

  /* 탁자. 방이 제 바닥을 들고 오므로 여기서는 천을 씌운 상만 놓는다 */
  const feltMap = new CanvasTexture(feltTexture(23, 256));
  feltMap.colorSpace = SRGBColorSpace;
  feltMap.wrapS = feltMap.wrapT = 1000; /* RepeatWrapping */
  feltMap.repeat.set(3, 2);
  const feltMat = new MeshStandardMaterial({ map: feltMap, color: new Color(0x2f6f5e), roughness: 0.95, metalness: 0 });
  const table = new Mesh(new BoxGeometry(TABLE_W, 0.24, TABLE_D), feltMat);
  table.position.set(0, TOP_Y - 0.12, 0);
  table.receiveShadow = true;
  table.castShadow = true;
  scene.add(table);

  /* 빛. 방이 제 빛을 들고 오지만 탁자 위 카드가 읽히려면 한 줄기 더 */
  const lamp = new DirectionalLight(0xfff0dc, 1.15);
  lamp.position.set(2.2, 6.5, 3.2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  scene.add(lamp);

  /* 카드 재료. 앞면은 값마다 다르므로 만들어 두고 쓴다(52장을 미리 굽지 않는다) */
  const backMap = new CanvasTexture(cardBackTexture(256));
  backMap.colorSpace = SRGBColorSpace;
  const backMat = new MeshStandardMaterial({ map: backMap, roughness: 0.75, metalness: 0 });
  const edgeMat = new MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.9, metalness: 0 });
  const faceCache = new Map<string, MeshStandardMaterial>();
  const faceMatOf = (rank: number, suit: number): MeshStandardMaterial => {
    const k = rank + ':' + suit;
    const hit = faceCache.get(k);
    if (hit) return hit;
    const map = new CanvasTexture(cardFaceTexture(rank, suit, 256));
    map.colorSpace = SRGBColorSpace;
    const m = new MeshStandardMaterial({ map, roughness: 0.72, metalness: 0 });
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
  const shoe = new Vector3(TABLE_W / 2 - 0.9, TOP_Y + 0.4, -TABLE_D / 2 + 0.7);

  let mySeat = opts.mySeat ?? 0;
  /* 줄 자리. 딜러는 안쪽, 사람은 앞쪽.
     자리 수는 무대가 손패 목록에서 읽는다. 붙일 때는 몇 명이 앉을지 아직 모른다
     (2026-09-01 실측: 하나로 알고 세 사람 손패를 같은 자리에 겹쳐 놨다) */
  const rowZ = (seat: number): number => (seat < 0 ? -TABLE_D * 0.3 : TABLE_D * 0.24);
  /* 내 줄은 앞 가운데, 남의 줄은 그 뒤 좌우로. 내 손패가 늘 같은 자리에 있어야 눈이 안 헤맨다 */
  const rowOf = (seat: number, others: number[]): { x: number; z: number; s: number } => {
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
      /* 날아가는 동안 살짝 뜬다 */
      c.mesh.position.y += Math.sin(Math.PI * k) * 0.35;
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

    /* 앞 화면에 그 자리 카드가 이미 있었으면 그대로 놓고, 새로 온 것만 카드집에서 날아온다 */
    const had = new Map<string, boolean>();
    for (const h of shown) h.cards.forEach((_, i) => had.set(h.seat + ':' + i, true));

    let dealt = 0;
    const others = hands.map((h) => h.seat).filter((n) => n >= 0 && n !== mySeat);
    for (const h of hands) {
      const row = rowOf(h.seat, others);
      const xs = spread(h.cards.length);
      h.cards.forEach((card, i) => {
        const to = new Vector3(row.x + xs[i] * row.s, TOP_Y + 0.13 + i * 0.004, row.z);
        const old = before ? had.get(h.seat + ':' + i) : false;
        const mesh = mkCard(card.rank, suitOf(card.rank, h.seat, i), card.up);
        if (row.s !== 1) mesh.scale.setScalar(row.s);
        if (old) {
          /* 있던 카드. 그 자리에 그대로 */
          mesh.position.copy(to);
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
    }
    shown = hands.map((h) => ({ seat: h.seat, label: h.label, cards: h.cards.map((c) => ({ ...c })) }));
    need = true;
    wake();
  };

  /* ── 자리를 직접 잡는 판(솔리테어) ── */
  const slotGroup = new Group();
  scene.add(slotGroup);
  const slotGeo = new BoxGeometry(CARD_W * 1.02, 0.01, CARD_H * 1.02);
  const slotMat = new MeshStandardMaterial({ color: 0x1d4a3a, roughness: 1, metalness: 0, transparent: true, opacity: 0.55 });
  const setSlots = (slots: Array<{ x: number; z: number }>): void => {
    while (slotGroup.children.length) slotGroup.remove(slotGroup.children[0]);
    for (const sl of slots) {
      const m = new Mesh(slotGeo, slotMat);
      m.position.set(sl.x, TOP_Y + 0.005, sl.z);
      m.receiveShadow = true;
      slotGroup.add(m);
    }
    need = true;
    render();
  };

  /** 눌린 카드를 찾으려고 이름을 들고 있는다 */
  const picks = new Map<Mesh, string>();
  let boardKey = '';
  const setBoard = (spots: CardSpotAt[]): void => {
    const key = JSON.stringify(spots);
    if (key === boardKey) return;
    boardKey = key;
    while (holder.children.length) holder.remove(holder.children[0]);
    live.length = 0;
    picks.clear();
    for (const sp of spots) {
      const layer = sp.layer ?? 0;
      const mesh = mkCard(sp.rank, sp.suit ?? suitOf(sp.rank, 0, layer), sp.up);
      mesh.position.set(sp.x, TOP_Y + 0.02 + layer * 0.006 + (sp.held ? 0.18 : 0), sp.z);
      mesh.rotation.z = sp.up ? 0 : Math.PI;
      if (sp.held) mesh.rotation.y = 0.06;
      holder.add(mesh);
      picks.set(mesh, sp.id);
    }
    need = true;
    render();
  };

  /* 카드 누르기. 화면이 이름만 받으면 되고 무대는 규칙을 모른다 */
  if (opts.onPick) {
    const ray = new Raycaster();
    const ndc = new Vector2();
    core.canvas.addEventListener('pointerdown', (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const r = core.canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(holder.children, false);
      const first = hits[0]?.object as Mesh | undefined;
      const id = first ? picks.get(first) : undefined;
      if (id) opts.onPick?.(id);
    });
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
    setSlots,
    resize: fit,
    dispose(): void {
      ro.disconnect();
      loop?.stop();
      loop = null;
      room?.dispose();
      cardGeo.dispose();
      slotGeo.dispose();
      slotMat.dispose();
      feltMap.dispose();
      backMap.dispose();
      [feltMat, backMat, edgeMat].forEach((m) => m.dispose());
      faceCache.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      core.dispose();
    }
  };
}
