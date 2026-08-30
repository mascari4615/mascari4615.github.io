/**
 * 주사위 강체 시뮬레이션. **굴리기 전에 다 굴려 본다** (change.arcade-redesign)
 *
 * 흉내 물리(튀다가 마지막에 정해진 눈으로 슬러프)는 셋이 틀렸다(사용자 지적). 정착 때 다른 면이
 * 뒤집혀 올라오고, 정착 구간이 뚝 끊기고, 기울어진 주사위가 바닥에 안 닿은 채 멈춤
 *
 * 여기서는 정육면체 여덟 모서리를 바닥과 벽에 부딪히며 굴린다. 마찰과 반발로 스스로 한 면이
 * 위로 오며 멎는다. **어느 면이 위로 오나는 시뮬레이션이 정한다.** 커널이 정한 눈은 그 면에
 * 붙인다(면 배치 회전. 마주 보는 면의 합 7 은 그대로). 굴리는 순간 끝까지 계산해 두고
 * 화면은 녹화본 재생. 끊김 없음
 *
 * 단위: 주사위 한 변 1, 질량 1. 정육면체 관성은 등방(6분의 1)이라 회전 계산이 단순
 */
import { Quaternion, Vector3 } from '/packages/3d/vendor/three.module.min.js';

export interface RollInput {
  /** 시작 시각 (초). 컵에서 시차를 두고 나온다 */
  t0: number;
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
  /** 각속도 (라디안/초, 월드) */
  ang: Vector3;
}

export interface RollBounds {
  floorY: number;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export interface Frame {
  t: number;
  pos: Vector3;
  quat: Quaternion;
}

export interface Track {
  frames: Frame[];
  /** 부딪힌 순간들. 재생하며 소리를 낸다 */
  hits: Array<{ t: number; force: number }>;
  /** 멎은 뒤 위로 온 면의 법선 (주사위 로컬) */
  upLocal: Vector3;
  /** 끝나는 시각 (초) */
  end: number;
}

const H = 0.5;
const INV_I = 6; /* 1 / (1/6) */
const CORNERS: Vector3[] = [];
for (const sx of [-H, H]) for (const sy of [-H, H]) for (const sz of [-H, H]) CORNERS.push(new Vector3(sx, sy, sz));
const AXES: Vector3[] = [
  new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 1, 0),
  new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)
];

const G = 26;
const RESTITUTION = 0.3;
const FRICTION = 0.5;
const DT = 1 / 240;
const FPS = 60;
const MAX_T = 2.6;

interface Body {
  live: boolean;
  done: boolean;
  t0: number;
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
  ang: Vector3;
  still: number;
}

const tmp = new Vector3();
const tmp2 = new Vector3();
const tmp3 = new Vector3();
const tq = new Quaternion();

/** 한 점(모서리)이 평면을 뚫었을 때의 충격. 반발과 마찰. 뚫은 깊이는 몸통을 밀어 올려 없앤다 */
function contact(b: Body, corner: Vector3, n: Vector3, depth: number, hits: Track['hits'], t: number): void {
  const r = tmp.subVectors(corner, b.pos);
  /* 접점 속도 = 선속도 + 각속도 × r */
  const vp = tmp2.crossVectors(b.ang, r).add(b.vel);
  const vn = vp.dot(n);
  b.pos.addScaledVector(n, depth);
  if (vn >= 0) return;
  /* 충격량. 분모의 회전 항: ((r × n) × r) · n / I */
  const rn = tmp3.crossVectors(r, n);
  const angTerm = tmp3.copy(rn).cross(r).dot(n) * INV_I;
  const j = (-(1 + RESTITUTION) * vn) / (1 + angTerm);
  b.vel.addScaledVector(n, j);
  const imp = tmp3.copy(n).multiplyScalar(j);
  b.ang.add(tmp3.crossVectors(r, imp).multiplyScalar(INV_I));
  if (-vn > 1.2) hits.push({ t, force: Math.min(1, -vn / 10) });
  /* 마찰. 접선 속도를 줄인다. 쿨롱 상한 mu*j */
  const vp2 = tmp2.crossVectors(b.ang, r).add(b.vel);
  const vt = vp2.addScaledVector(n, -vp2.dot(n));
  const speed = vt.length();
  if (speed < 1e-4) return;
  const jt = Math.min(FRICTION * j, speed * 0.5);
  const dir = vt.divideScalar(speed);
  b.vel.addScaledVector(dir, -jt);
  const fimp = tmp3.copy(dir).multiplyScalar(-jt);
  b.ang.add(tmp3.crossVectors(r, fimp).multiplyScalar(INV_I));
}

/** 회전 상태에서 위를 향하는 면의 로컬 법선 */
export function upFace(q: Quaternion): Vector3 {
  const inv = tq.copy(q).invert();
  const upLocal = tmp.set(0, 1, 0).applyQuaternion(inv);
  let best = AXES[0];
  let bd = -2;
  for (const a of AXES) {
    const d = a.dot(upLocal);
    if (d > bd) {
      bd = d;
      best = a;
    }
  }
  return best.clone();
}

/** 지금 자세에 제일 가까운 **축 정렬** 자세 (어느 면이든 위, 어느 면이든 앞) */
function snapAxis(q: Quaternion): Quaternion {
  const inv = tq.copy(q).invert();
  const pick = (world: Vector3): Vector3 => {
    const local = tmp.copy(world).applyQuaternion(inv);
    let best = AXES[0];
    let bd = -2;
    for (const a of AXES) {
      const d = a.dot(local);
      if (d > bd) {
        bd = d;
        best = a;
      }
    }
    return best.clone();
  };
  const upL = pick(new Vector3(0, 1, 0));
  let fwdL = pick(new Vector3(0, 0, 1));
  if (Math.abs(fwdL.dot(upL)) > 0.5) fwdL = pick(new Vector3(1, 0, 0));
  /* 로컬 (upL, fwdL) 가 월드 (Y, Z) 로 가는 회전 */
  const rightL = new Vector3().crossVectors(fwdL, upL);
  /* 열이 로컬 축인 행렬의 역 = 전치. 쿼터니언은 두 단계로: 먼저 upL -> Y */
  const q1 = new Quaternion().setFromUnitVectors(upL, new Vector3(0, 1, 0));
  const fwdW = fwdL.clone().applyQuaternion(q1);
  const q2 = new Quaternion().setFromUnitVectors(fwdW, new Vector3(0, 0, 1));
  void rightL;
  return q2.multiply(q1);
}

/**
 * 굴린다. 입력마다 녹화본 하나. 시각은 초, 0 이 컵이 첫 주사위를 놓는 순간
 */
export function simulateRoll(inputs: RollInput[], bounds: RollBounds): Track[] {
  const bodies: Body[] = inputs.map((i) => ({
    live: false, done: false, t0: i.t0, pos: i.pos.clone(), vel: i.vel.clone(), quat: i.quat.clone(), ang: i.ang.clone(), still: 0
  }));
  const tracks: Track[] = inputs.map(() => ({ frames: [], hits: [], upLocal: new Vector3(0, 1, 0), end: 0 }));
  const corner = new Vector3();
  const n = new Vector3();
  let t = 0;
  let nextFrame = 0;
  const record = (): void => {
    bodies.forEach((b, i) => {
      if (!b.live && !b.done) return;
      tracks[i].frames.push({ t, pos: b.pos.clone(), quat: b.quat.clone() });
    });
  };
  while (t < MAX_T) {
    /* 시차를 두고 살아난다 */
    bodies.forEach((b) => {
      if (!b.live && !b.done && t >= b.t0) b.live = true;
    });
    for (const b of bodies) {
      if (!b.live) continue;
      b.vel.y -= G * DT;
      /* 공기 저항 비슷한 감쇠. 없으면 각속도가 안 죽어 영영 안 멎는다 */
      b.vel.multiplyScalar(1 - 0.15 * DT);
      b.ang.multiplyScalar(1 - 0.6 * DT);
      b.pos.addScaledVector(b.vel, DT);
      const w = b.ang.length();
      if (w > 1e-6) {
        tq.setFromAxisAngle(tmp.copy(b.ang).divideScalar(w), w * DT);
        b.quat.premultiply(tq).normalize();
      }
      /* 모서리 여덟 개를 바닥과 네 벽에 */
      for (let pass = 0; pass < 2; pass += 1) {
        for (const c of CORNERS) {
          corner.copy(c).applyQuaternion(b.quat).add(b.pos);
          if (corner.y < bounds.floorY) contact(b, corner, n.set(0, 1, 0), bounds.floorY - corner.y, tracks[bodies.indexOf(b)].hits, t);
          corner.copy(c).applyQuaternion(b.quat).add(b.pos);
          if (corner.x < bounds.xMin) contact(b, corner, n.set(1, 0, 0), bounds.xMin - corner.x, tracks[bodies.indexOf(b)].hits, t);
          corner.copy(c).applyQuaternion(b.quat).add(b.pos);
          if (corner.x > bounds.xMax) contact(b, corner, n.set(-1, 0, 0), corner.x - bounds.xMax, tracks[bodies.indexOf(b)].hits, t);
          corner.copy(c).applyQuaternion(b.quat).add(b.pos);
          if (corner.z < bounds.zMin) contact(b, corner, n.set(0, 0, 1), bounds.zMin - corner.z, tracks[bodies.indexOf(b)].hits, t);
          corner.copy(c).applyQuaternion(b.quat).add(b.pos);
          if (corner.z > bounds.zMax) contact(b, corner, n.set(0, 0, -1), corner.z - bounds.zMax, tracks[bodies.indexOf(b)].hits, t);
        }
      }
    }
    /* 주사위끼리. 공으로 본다(반지름 0.6). 모서리끼리 정확히 재는 것보다 싸고, 멎은 뒤 겹침은 없다 */
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i];
      if (!a.live) continue;
      for (let j = i + 1; j < bodies.length; j += 1) {
        const c = bodies[j];
        if (!c.live) continue;
        tmp.subVectors(c.pos, a.pos);
        const dist = tmp.length();
        const min = 1.2;
        if (dist >= min || dist < 1e-6) continue;
        tmp.divideScalar(dist);
        const push = (min - dist) / 2;
        a.pos.addScaledVector(tmp, -push);
        c.pos.addScaledVector(tmp, push);
        const va = a.vel.dot(tmp);
        const vc = c.vel.dot(tmp);
        if (va - vc > 0) {
          const jn = (va - vc) * 0.7;
          a.vel.addScaledVector(tmp, -jn);
          c.vel.addScaledVector(tmp, jn);
          /* 부딪히면 돈다. 접점이 중심 밖이라 */
          a.ang.add(tmp2.set(tmp.z, 0, -tmp.x).multiplyScalar(jn * 2));
          c.ang.add(tmp2.set(-tmp.z, 0, tmp.x).multiplyScalar(jn * 2));
          if (va - vc > 1.5) tracks[i].hits.push({ t, force: Math.min(1, (va - vc) / 8) });
        }
      }
    }
    /* 멎었나. 느리면 조금 더 눌러 앉힌다(각속도를 더 죽여 한 면으로) */
    for (let i = 0; i < bodies.length; i += 1) {
      const b = bodies[i];
      if (!b.live) continue;
      const slow = b.vel.length() < 0.35 && b.ang.length() < 1.2;
      if (slow) {
        b.ang.multiplyScalar(1 - 4 * DT);
        b.vel.multiplyScalar(1 - 4 * DT);
      }
      const still = b.vel.length() < 0.06 && b.ang.length() < 0.15 && t - b.t0 > 0.5;
      b.still = still ? b.still + DT : 0;
      if (b.still > 0.12) {
        b.live = false;
        b.done = true;
        /* 축에 맞춰 눕힌다. 여기까지 오면 어긋남은 몇 도라 눈에 안 띈다 */
        b.quat.copy(snapAxis(b.quat));
        b.pos.y = bounds.floorY + H;
        tracks[i].frames.push({ t, pos: b.pos.clone(), quat: b.quat.clone() });
        tracks[i].end = t;
        tracks[i].upLocal = upFace(b.quat);
      }
    }
    t += DT;
    if (t >= nextFrame) {
      record();
      nextFrame += 1 / FPS;
    }
    if (bodies.every((b) => b.done)) break;
  }
  /* 시간이 다 됐는데 아직 도는 것은 그 자리에서 눕힌다 */
  bodies.forEach((b, i) => {
    if (b.done) return;
    b.quat.copy(snapAxis(b.quat));
    b.pos.y = bounds.floorY + H;
    tracks[i].frames.push({ t: t + 0.15, pos: b.pos.clone(), quat: b.quat.clone() });
    tracks[i].end = t + 0.15;
    tracks[i].upLocal = upFace(b.quat);
  });
  return tracks;
}

/**
 * 재생. 시각 t(초)의 자세. 두 프레임 사이는 보간
 */
export function sample(track: Track, t: number, outPos: Vector3, outQuat: Quaternion): boolean {
  const f = track.frames;
  if (!f.length) return false;
  if (t <= f[0].t) {
    outPos.copy(f[0].pos);
    outQuat.copy(f[0].quat);
    return true;
  }
  const last = f[f.length - 1];
  if (t >= last.t) {
    outPos.copy(last.pos);
    outQuat.copy(last.quat);
    return false;
  }
  /* 프레임은 등간격이라 바로 찾는다 */
  let lo = 0;
  let hi = f.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (f[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = f[lo];
  const b = f[hi];
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  outPos.lerpVectors(a.pos, b.pos, k);
  outQuat.copy(a.quat).slerp(b.quat, k);
  return true;
}
