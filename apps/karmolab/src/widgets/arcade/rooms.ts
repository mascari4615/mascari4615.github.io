/**
 * 방 넷을 짓는다. 다다미방, 밤 책상, 서재, 거실 (change.arcade-redesign, 방 스킨)
 *
 * `three-board.ts` 가 오목판 둘레에 짓는 방과 같은 그림. 주사위 무대(`dice-stage.ts`)도 같은 방에 앉아야
 * 하므로(사용자 결정: 야추도 방 스킨 4종에 합류) 여기로 옮겨 적음. 오목 쪽은 아직 제 안에 같은 코드
 * (같은 세션에 두 손이 닿으면 충돌). 다음 손질 때 오목도 이 함수를 쓰면 한 벌
 *
 * `size` 는 방 한가운데 놓이는 물건의 한 변(오목판 폭, 주사위 쟁반 폭). 소품과 빛은 그 배수 자리
 * 그림은 전부 코드로 굽는다(`texture.ts`). 파일 0
 */
import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Scene,
  SpotLight,
  SRGBColorSpace
} from '/packages/3d/vendor/three.module.min.js';
import type { SceneId } from './scenes';
import { clothTexture, cloudTexture, leatherTexture, oakTexture, parquetTexture, plankTexture, rugTexture, shaftTexture, shojiTexture, tatamiTexture, woodTexture } from './texture';

export interface Room {
  /** 물건이 놓이는 면의 높이. 거실은 탁자 위라 바닥이 아래에 있다 */
  floorY: number;
  sun: DirectionalLight;
  hemi: HemisphereLight;
  /** 살아 있는 방. 30fps 로 부른다 */
  breathe(t: number): void;
  dispose(): void;
}

export function buildRoom(scene: Scene, sceneId: SceneId, size: number): Room {
  const tatami = sceneId === 'tatami';
  const desk = sceneId === 'desk';
  const study = sceneId === 'study';
  const lounge = sceneId === 'living';
  const living: { spot: SpotLight | null; cloud: SpotLight | null; lamp: PointLight | null; motes: Points | null; shafts: Mesh[]; seed: number } = { spot: null, cloud: null, lamp: null, motes: null, shafts: [], seed: Math.random() * 1000 };
  const mats: MeshStandardMaterial[] = [];
  const maps: CanvasTexture[] = [];
  const tex = (cv: HTMLCanvasElement): CanvasTexture => {
    const m = new CanvasTexture(cv);
    m.colorSpace = SRGBColorSpace;
    maps.push(m);
    return m;
  };
  const mat = (m: MeshStandardMaterial): MeshStandardMaterial => {
    mats.push(m);
    return m;
  };

  /* 빛. 채움광은 해의 1/5 아래. 해는 방마다 자리가 다르다 */
  const ambient = new AmbientLight(0xffffff, desk ? 0.2 : lounge ? 0.18 : 0.14);
  scene.add(ambient);
  const hemi = desk ? new HemisphereLight(0x8fa3c4, 0x2a2018, 0.38) : study ? new HemisphereLight(0xe8eef5, 0x4a3a2c, 0.38) : lounge ? new HemisphereLight(0xe9f0fa, 0x6a5a48, 0.48) : new HemisphereLight(0xdfe8f4, 0x4a3823, 0.42);
  scene.add(hemi);
  const sun = new DirectionalLight(desk ? 0xfff1e0 : study ? 0xffe6cc : lounge ? 0xfff8ee : 0xfff0dc, desk ? 2.2 : study ? 2.9 : lounge ? 2.9 : 3.1);
  if (desk) sun.position.set(size * 1.0, size * 1.05, size * 0.85);
  else if (study) sun.position.set(-size * 1.25, size * 0.8, -size * 0.5);
  else if (lounge) sun.position.set(size * 1.3, size * 0.9, -size * 0.45);
  else sun.position.set(size * 1.05, size * 0.78, -size * 0.85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 2;
  const shadowSpan = size * 1.4;
  sun.shadow.camera.left = -shadowSpan;
  sun.shadow.camera.right = shadowSpan;
  sun.shadow.camera.top = shadowSpan;
  sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.camera.near = size * 0.4;
  sun.shadow.camera.far = size * (lounge ? 4.2 : 3.2);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  /* 바닥. 다다미, 널, 쪽매, 참나무 */
  const floorMap = tex(desk ? plankTexture(29, 512) : study ? parquetTexture(53, 512) : lounge ? oakTexture(71, 512) : tatamiTexture(19, 512));
  floorMap.wrapS = RepeatWrapping;
  floorMap.wrapT = RepeatWrapping;
  if (desk) floorMap.repeat.set(4, 4);
  else if (study) floorMap.repeat.set(5, 5);
  else if (lounge) floorMap.repeat.set(6, 6);
  else floorMap.repeat.set(6, 3);
  floorMap.anisotropy = 4;
  const floorMat = mat(new MeshStandardMaterial({ map: floorMap, color: desk ? 0x5a3b22 : 0xffffff, roughness: desk ? 0.5 : study ? 0.6 : lounge ? 0.55 : 0.94 }));
  const floor = new Mesh(new PlaneGeometry(size * 6, size * 6), floorMat);
  floor.rotation.x = -Math.PI / 2;
  const legH = size * 0.42;
  const floorY = lounge ? -legH - 0.1 : 0;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  scene.add(floor);

  /* 다다미방. 툇마루와 바깥, 햇살 줄기, 장지문 빛 */
  const plankMap = tex(plankTexture(29, 512));
  plankMap.wrapS = RepeatWrapping;
  plankMap.repeat.set(5, 1);
  const plankMat = mat(new MeshStandardMaterial({ map: plankMap, color: 0xffffff, roughness: 0.42, metalness: 0.05 }));
  const outsideMat = mat(new MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe9c8, emissiveIntensity: 0.9, roughness: 1 }));
  if (tatami) {
    const edge = -size * 0.66;
    const plank = new Mesh(new PlaneGeometry(size * 6, size * 0.7), plankMat);
    plank.rotation.x = -Math.PI / 2;
    plank.position.set(0, 0.012, edge - size * 0.35);
    plank.receiveShadow = true;
    scene.add(plank);
    const step = new Mesh(new BoxGeometry(size * 6, 0.06, 0.05), plankMat);
    step.position.set(0, 0.03, edge);
    scene.add(step);
    const outside = new Mesh(new PlaneGeometry(size * 6, size * 3), outsideMat);
    outside.rotation.x = -Math.PI / 2;
    outside.position.set(0, 0.011, edge - size * 0.7 - size * 1.5);
    scene.add(outside);
  }
  /* 먼지 120. 다다미방은 판 뒤 햇살 자리, 밤 책상은 등불 아래 */
  {
    const n = 120;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * size * (desk ? 0.9 : 1.6);
      pos[i * 3 + 1] = Math.random() * size * 0.5 + 0.1;
      pos[i * 3 + 2] = desk ? (Math.random() - 0.5) * size * 0.9 : -size * 0.2 - Math.random() * size * 0.9;
    }
    const moteGeo = new BufferGeometry();
    moteGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const moteMat = new PointsMaterial({ color: 0xffe9c0, size: 0.035, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const motes = new Points(moteGeo, moteMat);
    scene.add(motes);
    living.motes = motes;
  }
  const shaftMat = new MeshBasicMaterial({ map: tex(shaftTexture(256)), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  for (let k = 0; k < (tatami ? 3 : 0); k += 1) {
    const shaft = new Mesh(new PlaneGeometry(size * (0.7 + k * 0.2), size * 2.2), shaftMat);
    shaft.position.set(-size * 0.55 + k * size * 0.55, size * 0.55, -size * 0.35 + k * 0.08 * size);
    shaft.rotation.set(-0.95, 0.18 - k * 0.12, 0.25);
    scene.add(shaft);
    living.shafts.push(shaft);
  }
  if (tatami) {
    const spot = new SpotLight(0xfff4e6, 1.9, 0, 0.4, 0.5, 0);
    spot.map = tex(shojiTexture(512));
    spot.position.set(size * 0.35, size * 1.7, -size * 1.7);
    spot.target.position.set(-size * 0.2, 0, -size * 0.35);
    scene.add(spot);
    scene.add(spot.target);
    living.spot = spot;
  }
  if (tatami || study || lounge) {
    const cloud = new SpotLight(0xffffff, 0.9, 0, 0.95, 0.15, 0);
    cloud.map = tex(cloudTexture(41, 512));
    cloud.position.set(0, size * 3.2, size * 0.3);
    cloud.target.position.set(0, 0, 0);
    scene.add(cloud);
    scene.add(cloud.target);
    living.cloud = cloud;
  }

  /* 밤 책상. 가죽 수첩과 등불 */
  const leatherMat = mat(new MeshStandardMaterial({ map: tex(leatherTexture(67, 256)), color: 0xffffff, roughness: 0.75 }));
  const rugMat = mat(new MeshStandardMaterial({ map: tex(rugTexture(61, 512)), color: 0xffffff, roughness: 1 }));
  if (desk) {
    const book = new Mesh(new BoxGeometry(size * 0.4, 0.07, size * 0.58), leatherMat);
    book.position.set(-size * 0.72, 0.035, -size * 0.55);
    book.rotation.y = 0.06;
    book.castShadow = true;
    book.receiveShadow = true;
    scene.add(book);
    const strap = new Mesh(new BoxGeometry(size * 0.06, 0.09, size * 0.8), leatherMat);
    strap.position.set(-size * 0.72 + size * 0.1, 0.045, -size * 0.55);
    strap.rotation.y = 0.06;
    scene.add(strap);
    const lamp = new PointLight(0xffe2c0, 3.4, size * 4.2, 1.15);
    lamp.position.set(size * 0.15, size * 1.3, size * 0.1);
    scene.add(lamp);
    living.lamp = lamp;
  }
  /* 거실. 낮은 탁자, 융단, 소파, 찻잔 */
  if (lounge) {
    const walnut = mat(new MeshStandardMaterial({ map: tex(woodTexture(23, 256)), color: 0x6a4630, roughness: 0.45, metalness: 0.06 }));
    const top = new Mesh(new BoxGeometry(size * 2.1, 0.1, size * 1.45), walnut);
    top.position.set(0, -0.05, 0);
    top.castShadow = true;
    top.receiveShadow = true;
    scene.add(top);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new Mesh(new BoxGeometry(0.12, legH, 0.12), walnut);
      leg.position.set(lx * size * 0.95, -0.1 - legH / 2, lz * size * 0.62);
      leg.castShadow = true;
      scene.add(leg);
    }
    const rug = new Mesh(new PlaneGeometry(size * 3.4, size * 2.6), mat(new MeshStandardMaterial({ map: rugMat.map, color: 0xd8d0c4, roughness: 1 })));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, floorY + 0.008, size * 0.1);
    rug.receiveShadow = true;
    scene.add(rug);
    const clothMap = tex(clothTexture(73, 256));
    clothMap.wrapS = RepeatWrapping;
    clothMap.wrapT = RepeatWrapping;
    clothMap.repeat.set(3, 3);
    const cloth = mat(new MeshStandardMaterial({ map: clothMap, color: 0xffffff, roughness: 1 }));
    const seatH = size * 0.3;
    const sofaZ = -size * 1.35;
    const seat = new Mesh(new BoxGeometry(size * 2.8, seatH, size * 0.85), cloth);
    seat.position.set(0, floorY + seatH / 2, sofaZ);
    seat.castShadow = true;
    seat.receiveShadow = true;
    scene.add(seat);
    const back = new Mesh(new BoxGeometry(size * 2.8, size * 0.5, size * 0.22), cloth);
    back.position.set(0, floorY + seatH + size * 0.25, sofaZ - size * 0.32);
    back.castShadow = true;
    scene.add(back);
    for (const ax of [-1, 1]) {
      const arm = new Mesh(new BoxGeometry(size * 0.22, size * 0.2, size * 0.85), cloth);
      arm.position.set(ax * size * 1.29, floorY + seatH + size * 0.1, sofaZ);
      arm.castShadow = true;
      scene.add(arm);
    }
    for (const cx3 of [-0.85, 0, 0.85]) {
      const cushion = new Mesh(new BoxGeometry(size * 0.78, size * 0.08, size * 0.75), cloth);
      cushion.position.set(cx3 * size, floorY + seatH + size * 0.04, sofaZ + size * 0.02);
      cushion.castShadow = true;
      cushion.receiveShadow = true;
      scene.add(cushion);
    }
    const china = mat(new MeshStandardMaterial({ color: 0xf6f1ea, roughness: 0.35 }));
    const cup = new Mesh(new CylinderGeometry(size * 0.055, size * 0.045, size * 0.07, 24), china);
    cup.position.set(size * 0.82, size * 0.035, size * 0.5);
    cup.castShadow = true;
    scene.add(cup);
    const saucer = new Mesh(new CylinderGeometry(size * 0.095, size * 0.085, 0.012, 24), china);
    saucer.position.set(size * 0.82, 0.006, size * 0.5);
    saucer.receiveShadow = true;
    scene.add(saucer);
  }
  /* 서재. 융단과 스탠드 */
  if (study) {
    const rug = new Mesh(new PlaneGeometry(size * 1.7, size * 1.45), rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.008, size * 0.05);
    rug.receiveShadow = true;
    scene.add(rug);
    const lamp = new PointLight(0xffe8d0, 1.6, size * 3.2, 1.3);
    lamp.position.set(-size * 1.1, size * 0.9, -size * 0.45);
    scene.add(lamp);
    living.lamp = lamp;
  }

  const breathe = (t: number): void => {
    const s = t / 1000 + living.seed;
    const cloud = desk ? 1 : 0.84 + 0.16 * Math.sin(s * 0.09) * Math.cos(s * 0.043 + 1.3);
    sun.intensity = (desk ? 2.2 : study ? 2.9 : lounge ? 2.9 : 3.1) * cloud;
    hemi.intensity = (desk ? 0.38 : study ? 0.38 : lounge ? 0.48 : 0.42) * (0.8 + 0.2 * cloud);
    if (living.lamp) living.lamp.intensity = (desk ? 3.4 : 1.6) * (0.965 + 0.035 * Math.sin(s * 1.3) * Math.sin(s * 0.37 + 0.8));
    if (living.cloud) {
      living.cloud.position.x = Math.sin(s * 0.12) * size * 1.4;
      living.cloud.position.z = size * 0.3 + Math.cos(s * 0.083) * size * 1.0;
      living.cloud.intensity = 1.1;
    }
    for (const sh of living.shafts) (sh.material as MeshBasicMaterial).opacity = 0.25 + 0.6 * Math.max(0, cloud - 0.5) * 2;
    if (living.spot) {
      living.spot.intensity = 2.0 * (0.8 + 0.2 * cloud);
      living.spot.target.position.x = -size * 0.2 + Math.sin(s * 0.7) * size * 0.012 + Math.sin(s * 1.9) * size * 0.004;
    }
    if (living.motes) {
      const arr = living.motes.geometry.getAttribute('position') as { array: Float32Array; needsUpdate: boolean };
      const a = arr.array;
      for (let i = 0; i < a.length; i += 3) {
        a[i] += Math.sin(s * 0.5 + i) * 0.0006;
        a[i + 1] += 0.0004 + Math.sin(s * 0.3 + i * 0.7) * 0.0003;
        if (a[i + 1] > size * 0.55) a[i + 1] = 0.1;
      }
      arr.needsUpdate = true;
    }
  };

  return {
    floorY,
    sun,
    hemi,
    breathe,
    dispose() {
      mats.forEach((m) => m.dispose());
      maps.forEach((m) => m.dispose());
      shaftMat.dispose();
    }
  };
}
