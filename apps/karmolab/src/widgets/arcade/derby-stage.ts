/**
 * 경마 무대 (2026-09-03, D1)
 *
 * 방(`rooms.ts`) 안에 경주로 판 하나. 줄마다 말 하나가 서 있고(실루엣을 세운 판), 자리(`at`)가
 * 바뀌면 그리로 미끄러져 간다. 달리는 동안은 위아래로 들썩임. 결승선은 흑백 격자
 * 밑동은 `stage-core.ts`. 누를 것은 없음(고르기는 HUD)
 */
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3
} from '/packages/3d/vendor/three.module.min.js';
import { gloop, type GardenLoop } from '../garden/gloop';
import { mountStageCore } from './stage-core';
import { buildRoom, type Room } from './rooms';
import { feltTexture } from './texture';
import { horseTexture } from './horse';
import type { SceneId } from './scenes';

export interface DerbyStageOpts {
  scene?: SceneId;
  lanes: number;
}

export interface DerbyStage {
  ok: boolean;
  software: boolean;
  /** 말마다 어디까지 왔나(0~track). 달리는 중이면 들썩임 */
  set(at: number[], track: number, running: boolean): void;
  /** 이긴 말. -1 이면 아직 */
  finish(winner: number): void;
  resize(): void;
  dispose(): void;
}

const TRACK_W = 14;
const LANE_D = 1.15;
const PAD = 0.9;
const BOARD_T = 0.12;
const HORSE_W = 1.6;
const HORSE_H = HORSE_W * 0.625;

export function mountDerbyStage(host: HTMLElement, opts: DerbyStageOpts): DerbyStage {
  const core = mountStageCore(host, { shadow: 'soft', exposure: 1.1, tone: 'neutral' });
  if (!core) return { ok: false, software: false, set: () => {}, finish: () => {}, resize: () => {}, dispose: () => {} };
  const { renderer, software } = core;
  const lanes = Math.max(1, opts.lanes);
  const boardD = lanes * LANE_D + PAD * 2;
  const sceneId: SceneId = opts.scene ?? 'tatami';
  host.classList.add('ac-scene-' + sceneId);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 120);
  /* 앞쪽 위에서 비스듬히. 경주로 폭이 가로에, 줄 전부가 세로에 들어오는 거리 중 먼 쪽 */
  const look = new Vector3(0, 0, -boardD * 0.05);
  const dir = new Vector3(0, 1.05, 1).normalize();
  const fit = (): void => {
    const half = Math.tan((camera.fov * Math.PI) / 360);
    /* 가로 여유 1.8. 앞쪽 변이 원근으로 넓어져 0.6 으로는 결승선이 잘렸다 (실측) */
    const d = Math.max((TRACK_W / 2 + 1.8) / (half * camera.aspect), (boardD * 0.75) / half);
    camera.position.copy(look).addScaledVector(dir, d);
    camera.lookAt(look);
  };

  const room: Room = buildRoom(scene, sceneId, TRACK_W);

  /* ── 경주로 ── 잔디빛 펠트 판. 줄 사이 흰 선, 오른쪽 끝 결승선 */
  const grassMap = new CanvasTexture(feltTexture(110, 512));
  grassMap.colorSpace = SRGBColorSpace;
  grassMap.wrapS = RepeatWrapping;
  grassMap.wrapT = RepeatWrapping;
  grassMap.repeat.set(4, 2);
  const grassMat = new MeshStandardMaterial({ map: grassMap, color: 0x9fd68a, roughness: 0.95, metalness: 0 });
  const rimMat = new MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8, metalness: 0 });
  const board = new Mesh(new BoxGeometry(TRACK_W, BOARD_T, boardD), [rimMat, rimMat, grassMat, rimMat, rimMat, rimMat]);
  board.position.y = BOARD_T / 2;
  board.receiveShadow = true;
  scene.add(board);
  const TOP = BOARD_T + 0.004;
  const lineMat = new MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.9, metalness: 0 });
  const laneZ = (i: number): number => -boardD / 2 + PAD + LANE_D * (i + 0.5);
  for (let i = 0; i <= lanes; i += 1) {
    const line = new Mesh(new PlaneGeometry(TRACK_W - PAD * 1.2, 0.03), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, TOP, laneZ(i) - LANE_D / 2);
    scene.add(line);
  }
  const checker = ((): HTMLCanvasElement => {
    const cv = document.createElement('canvas');
    cv.width = 32;
    cv.height = 256;
    const c = cv.getContext('2d') as CanvasRenderingContext2D;
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 2; x += 1) {
      c.fillStyle = (x + y) % 2 ? '#141414' : '#f6f6f6';
      c.fillRect(x * 16, y * 16, 16, 16);
    }
    return cv;
  })();
  const checkerMap = new CanvasTexture(checker);
  checkerMap.colorSpace = SRGBColorSpace;
  const goalMat = new MeshStandardMaterial({ map: checkerMap, roughness: 0.9, metalness: 0 });
  const goalX = TRACK_W / 2 - PAD;
  const goal = new Mesh(new PlaneGeometry(0.22, boardD - PAD * 0.8), goalMat);
  /* 눕히기만. z 로 한 번 더 돌리면 결승선이 가로로 누워 판 밖까지 뻗음 (실측) */
  goal.rotation.x = -Math.PI / 2;
  goal.position.set(goalX, TOP + 0.002, 0);
  scene.add(goal);
  const startX = -TRACK_W / 2 + PAD;

  /* ── 말 ── 실루엣 판. 양면이라 어느 쪽에서 봐도 그림 */
  const horseGeo = new PlaneGeometry(HORSE_W, HORSE_H);
  const horseMaps: CanvasTexture[] = [];
  const horseMats: MeshStandardMaterial[] = [];
  const horses: Mesh[] = [];
  const cur: number[] = [];
  const want: number[] = [];
  for (let i = 0; i < lanes; i += 1) {
    const map = new CanvasTexture(horseTexture(i, 256));
    map.colorSpace = SRGBColorSpace;
    horseMaps.push(map);
    const mat = new MeshStandardMaterial({ map, transparent: true, alphaTest: 0.5, side: DoubleSide, roughness: 0.8, metalness: 0 });
    horseMats.push(mat);
    const m = new Mesh(horseGeo, mat);
    m.castShadow = true;
    m.position.set(startX, TOP + HORSE_H / 2, laneZ(i));
    /* 카메라를 마주 보게 눕힘. 똑바로 세우면 부감에서 납작하게 찌부러져 보임 (실측) */
    m.rotation.x = -Math.atan2(dir.y, dir.z);
    scene.add(m);
    horses.push(m);
    cur.push(0);
    want.push(0);
  }

  let trackLen = 16;
  let running = false;
  let winner = -1;
  let need = true;
  let loop: GardenLoop | null = null;
  let last = 0;
  const xOf = (at: number): number => startX + (Math.min(1, Math.max(0, at / trackLen))) * (goalX - startX);

  const frame = (): void => {
    const now = performance.now();
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    let moving = false;
    for (let i = 0; i < lanes; i += 1) {
      const d = want[i] - cur[i];
      if (Math.abs(d) > 0.002) {
        cur[i] += d * Math.min(1, dt * 7);
        moving = true;
      } else cur[i] = want[i];
      const h = horses[i];
      h.position.x = xOf(cur[i]);
      /* 달리는 말은 들썩이고, 이긴 말은 결승선에서 껑충 */
      const bob = running ? Math.abs(Math.sin(now / 90 + i * 1.7)) * 0.12 : winner === i ? Math.abs(Math.sin(now / 240)) * 0.3 : 0;
      h.position.y = TOP + HORSE_H / 2 + bob;
      h.rotation.z = running ? Math.sin(now / 90 + i * 1.7) * 0.08 : 0;
    }
    room.breathe(now);
    if (moving || running || winner >= 0 || need) {
      need = false;
      renderer.render(scene, camera);
    }
  };

  const resize = (): void => {
    const { aspect } = core.fit();
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    fit();
    need = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  loop = gloop(frame);

  return {
    ok: true,
    software,
    set(at, track, run) {
      trackLen = Math.max(1, track);
      running = run;
      for (let i = 0; i < lanes; i += 1) {
        const v = at[i] ?? 0;
        /* 새 판(0 으로 돌아감)은 미끄러지지 않고 출발선으로 */
        if (v === 0 && want[i] > 0) cur[i] = 0;
        want[i] = v;
      }
      if (!run) winner = winner >= 0 ? winner : -1;
      need = true;
    },
    finish(w) {
      winner = w;
      need = true;
    },
    resize,
    dispose() {
      loop?.stop();
      loop = null;
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      [...horseMats, grassMat, rimMat, lineMat, goalMat].forEach((m) => m.dispose());
      [...horseMaps, grassMap, checkerMap].forEach((m) => m.dispose());
      room.dispose();
      core.dispose();
    }
  };
}
