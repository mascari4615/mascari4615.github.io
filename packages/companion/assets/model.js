/**
 * 3D 몸 — 큐브 자리에 진짜 모델을 세운다.
 *
 * 게임 안에 있던 메시를 그대로 읽는다. 웹용으로 변환해 두 벌로 만들면 게임 쪽이
 * 바뀔 때마다 여기가 낡는다. 파일이 없거나 못 읽으면 조용히 큐브로 남는다 —
 * 얼굴이 안 뜬다고 말까지 못 하게 되지는 않는다.
 *
 * 움직임은 네 가지다: 가만히(숨) · 듣는 중(이쪽으로) · 생각 중(살짝 흔들) · 말하는 중(고개).
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyToon } from '/toon.js';

/**
 * 빌려온 동작을 이 몸에 옮겨 붙이는 짝 표.
 *
 * 왼쪽 = 빌려온 골격의 뼈, 오른쪽 = 이 몸의 뼈. 「이름이 같으니 그냥 먹이면 된다」가
 * 세 번 실패한 이유가 여기 다 있다(실측):
 *
 * 1. 이름이 실제로는 거의 안 겹친다. 276개 대 53개 중 정확히 겹치는 건 17개뿐이고,
 *    **몸통이 통째로 빠진다** — 저쪽 허리·등은 `DEF-` 인데 이 몸의 허리·등은 `ORG-` 다.
 *    몸통이 안 잡히면 숨·상체 흔들림이 전부 죽는다.
 * 2. 이 몸의 뼈는 **같은 이름이 여섯 개씩 겹쳐 있다.** 편집 프로그램에서 팔 하나를
 *    부드럽게 휘라고 여섯 토막으로 쪼갠 것이 그대로 나왔다. 이름으로 찾으면 그중
 *    아무거나(맨 끝 토막) 잡혀서, 돌려도 손끝만 까딱했다.
 * 3. 넓적다리 이름이 이 몸에선 `tight`(오타)로 굳어 있다. 저쪽은 `thigh` 다.
 */
const BONE_PAIRS = {
  'DEF-hips': 'ORG-hips',
  'DEF-spine001': 'ORG-spine',
  'DEF-spine003': 'ORG-chest',
  'DEF-neck': 'DEF-neck',
  'DEF-head': 'DEF-head',
  'DEF-shoulderL': 'DEF-shoulderL',
  'DEF-shoulderR': 'DEF-shoulderR',
  'DEF-upper_armL': 'DEF-upper_armL',
  'DEF-upper_armR': 'DEF-upper_armR',
  'DEF-forearmL': 'DEF-forearmL',
  'DEF-forearmR': 'DEF-forearmR',
  'DEF-handL': 'DEF-handL',
  'DEF-handR': 'DEF-handR',
  'DEF-thighL': 'DEF-tightL',
  'DEF-thighR': 'DEF-tightR',
  'DEF-shinL': 'DEF-shinL',
  'DEF-shinR': 'DEF-shinR',
  'DEF-footL': 'DEF-footL',
  'DEF-footR': 'DEF-footR',
};

/**
 * 짝지은 뼈들을 찾아 「기준 자세」까지 적어 둔다.
 *
 * 같은 이름이 여러 개면 **맨 위 토막**을 쓴다. 위 토막을 돌리면 아래 토막이 따라오지만,
 * 아래 토막을 돌리면 팔은 그대로 있고 손끝만 움직인다.
 */
function pairBones(model, sourceRoot) {
  const first = (root) => {
    const map = new Map();
    root.traverse((node) => {
      if (node.isBone === true && map.has(node.name) === false) map.set(node.name, node);
    });
    return map;
  };
  const targetBones = first(model);
  const sourceBones = first(sourceRoot);

  model.updateMatrixWorld(true);
  sourceRoot.updateMatrixWorld(true);

  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const worldQuat = (node) => {
    const q = new THREE.Quaternion();
    node.matrixWorld.decompose(pos, q, scl);
    return q;
  };
  const depth = (node) => {
    let d = 0;
    for (let n = node; n.parent !== null; n = n.parent) d += 1;
    return d;
  };

  const pairs = [];
  for (const [sourceName, targetName] of Object.entries(BONE_PAIRS)) {
    const source = sourceBones.get(sourceName);
    const target = targetBones.get(targetName);
    if (source === undefined || target === undefined) continue;
    pairs.push({
      source,
      target,
      sourceRestInverse: worldQuat(source).invert(),
      targetRest: worldQuat(target),
      targetRestLocal: target.quaternion.clone(),
    });
  }
  // 위에 달린 뼈부터 계산해야 한다 — 아래 뼈는 위 뼈가 움직인 결과 위에서 자기 각을 잡는다.
  pairs.sort((a, b) => depth(a.target) - depth(b.target));
  return { pairs, targetBones };
}

/**
 * 클립 한 편을 미리 구워 둔다 — 매 판 프레임마다 이 몸의 뼈가 어떤 각이어야 하는지.
 *
 * 각도를 **세계 기준**으로 옮긴다: 저쪽 뼈가 제 기준 자세에서 얼마나 돌았는지를 세계
 * 기준으로 뽑아, 이쪽 뼈의 기준 자세 위에 그대로 얹는다. 두 골격은 뼈가 매달린 순서도
 * 개수도 다르기 때문에(저쪽은 허리가 넷, 이쪽은 셋) 뼈 자기 기준으로 옮기면 어긋난다 —
 * 세계 기준으로 옮기면 중간 뼈가 빠져 있어도 팔은 팔이 있어야 할 방향을 본다.
 *
 * 굽는 건 창을 열 때 한 번뿐이라, 매 판에는 적어 둔 각을 사이사이 이어 쓰기만 한다.
 */
function bakeClip(clip, pairs, sourceRoot, mixer, fps = 30) {
  const frames = Math.max(2, Math.round(clip.duration * fps));
  const step = clip.duration / (frames - 1);
  const values = pairs.map(() => new Float32Array(frames * 4));

  const action = mixer.clipAction(clip);
  mixer.stopAllAction();
  action.reset().play();

  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const sourceWorld = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const wanted = new THREE.Quaternion();

  for (let frame = 0; frame < frames; frame += 1) {
    mixer.setTime(frame * step);
    sourceRoot.updateMatrixWorld(true);

    for (let i = 0; i < pairs.length; i += 1) {
      const { source, target, sourceRestInverse, targetRest } = pairs[i];
      source.matrixWorld.decompose(pos, sourceWorld, scl);

      // 저쪽이 기준 자세에서 돌아간 만큼(세계 기준) → 이쪽 기준 자세 위에 얹는다
      wanted.copy(sourceWorld).multiply(sourceRestInverse).multiply(targetRest);

      // 세계 기준 각을 이 뼈가 실제로 들고 있어야 할 「제 부모 기준」 각으로 되돌린다
      if (target.parent !== null) {
        target.parent.matrixWorld.decompose(pos, parentWorld, scl);
        wanted.premultiply(parentWorld.invert());
      }

      target.quaternion.copy(wanted);
      // 아래 뼈가 이 결과 위에서 계산되도록 바로 반영한다
      target.updateMatrixWorld(true);

      values[i].set([wanted.x, wanted.y, wanted.z, wanted.w], frame * 4);
    }
  }

  mixer.stopAllAction();
  mixer.uncacheAction(clip);
  // 구우면서 뼈를 실제로 움직였으니 원래 자세로 되돌린다.
  for (const pair of pairs) pair.target.quaternion.copy(pair.targetRestLocal);

  return { name: clip.name, frames, step, duration: clip.duration, values };
}

export async function mountModel(canvas, modelName, onFail) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) {
    onFail?.(e);
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearAlpha(0); // 창이 뚫려 있으므로 배경도 비운다

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // 위에서 내려오는 빛 하나 + 아주 옅은 환경광. 방 안에 서 있는 느낌만.
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x202028, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1.4, 2.4, 1.8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6ee7ff, 0.7);
  rim.position.set(-1.6, 0.8, -1.4);
  scene.add(rim);

  let model;
  try {
    const loader = new FBXLoader();
    // 색·무늬는 모델 옆에 따로 놓인 그림 파일이다. 그 폴더를 알려주지 않으면
    // 회색 덩어리가 뜬다.
    loader.setResourcePath(`/model/${encodeURIComponent(modelName)}/`);
    model = await loader.loadAsync(`/model/${encodeURIComponent(modelName)}`);
  } catch (e) {
    onFail?.(e);
    return null;
  }

  // 빛을 안 받는 재질이면 아무리 비춰도 새까맣게 남는다 — 빛 받는 재질로 바꿔준다.
  model.traverse((node) => {
    if (node.isMesh !== true) return;
    node.frustumCulled = false;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material === undefined || material === null) continue;
      material.side = THREE.DoubleSide;
      if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
    }
  });

  // 그림처럼 칠한다 — 사실적인 음영은 조명 하나만 어긋나도 인형처럼 보인다.
  try {
    const { outlineCount } = applyToon(model, { steps: 3, outline: 0.004 });
    console.log('[3D] 만화식으로 칠했다 · 바깥선', outlineCount, '겹');
  } catch (e) {
    console.warn('[3D] 만화식 칠하기 실패 — 원래 재질로 간다:', e);
  }

  // 살을 실제로 움직이는 건 `DEF-` 뼈다. 조종용 뼈(`head` 같은 것)는 편집 프로그램
  // 안에서만 그 뼈들을 끌고 다니고, 밖으로 내보낸 파일에는 그 연결이 남지 않는다 —
  // 그래서 조종용 뼈를 돌리면 화면에서는 아무 일도 안 일어난다(그렇게 만들어 놨었다).
  const byName = new Map();
  model.traverse((node) => { if (node.isBone === true) byName.set(node.name, node); });
  const pick = (...names) => {
    for (const name of names) {
      const bone = byName.get(name);
      if (bone !== undefined) return bone;
    }
    return null;
  };
  const bones = {
    head: pick('DEF-head', 'head'),
    neck: pick('DEF-neck', 'neck'),
    spine: pick('DEF-spine.003', 'DEF-chest', 'DEF-spine', 'chest', 'spine'),
    armL: pick('DEF-upper_arm.L'),
    armR: pick('DEF-upper_arm.R'),
  };
  // 기준 자세를 적어 둔다. 매 판마다 여기서부터 다시 계산해야 흔들림이 쌓이지 않는다.
  const restPose = new Map();
  for (const bone of Object.values(bones)) {
    if (bone !== null) restPose.set(bone, bone.quaternion.clone());
  }
  const spin = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  /** 기준 자세에서 그만큼만 돌린다. */
  const turn = (bone, x, y, z) => {
    const base = restPose.get(bone);
    if (base === undefined) return;
    bone.quaternion.copy(base);
    if (x !== 0) bone.quaternion.multiply(spin.setFromAxisAngle(axis.set(1, 0, 0), x));
    if (y !== 0) bone.quaternion.multiply(spin.setFromAxisAngle(axis.set(0, 1, 0), y));
    if (z !== 0) bone.quaternion.multiply(spin.setFromAxisAngle(axis.set(0, 0, 1), z));
  };
  console.log('[3D] 잡은 뼈:', Object.entries(bones).map(([k, v]) => `${k}=${v?.name ?? '없음'}`).join(' '));

  // 화면에 맞추기 — 고정값으로 잡으면 모델이 바뀔 때마다 잘리거나 콩알만 해진다.
  // 실제 크기를 재서, 창 비율까지 보고 카메라를 물린다.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = size.y || 1;

  // 키를 1로 맞춰 두면 아래 계산이 모델과 무관해진다.
  const scale = 1 / height;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);

  // 전신을 담는다. 0 = 발바닥, 1 = 정수리 (키를 1로 맞춰 뒀다).
  // 위아래로 조금씩 여백을 둬서 정수리·발끝이 화면 끝에 닿지 않게 한다.
  const viewTop = 1.06;
  const viewBottom = -0.06;
  const viewHeight = viewTop - viewBottom;
  const viewCenterY = (viewTop + viewBottom) / 2 - 0.5; // 모델 중심 기준

  const camera2 = camera; // 이름만 짧게
  function frame() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const aspect = w / h;
    const fov = (camera2.fov * Math.PI) / 180;

    // 보고 싶은 높이가 화면에 다 들어오는 거리. 창이 좁으면 가로가 먼저 넘치므로
    // 가로 기준 거리도 같이 재서 더 먼 쪽을 쓴다 — 그래야 안 잘린다.
    const forHeight = viewHeight / 2 / Math.tan(fov / 2);
    const widthNeeded = Math.max(size.x, size.z) * scale;
    const forWidth = widthNeeded / 2 / (Math.tan(fov / 2) * aspect);
    const distance = Math.max(forHeight, forWidth) * 1.12; // 여유

    camera2.position.set(0, viewCenterY, distance);
    camera2.lookAt(0, viewCenterY, 0);
    camera2.near = Math.max(0.01, distance - 2);
    camera2.far = distance + 4;
    camera2.updateProjectionMatrix();
  }

  // ── 가져온 동작 얹기 ──────────────────────────────────────────────────
  // 클립이 붙으면 얘가 실제로 서 있고 말하는 몸짓을 한다. 못 붙으면 위의 뼈 움직임만
  // 남는다 — 그래도 숨은 쉬므로 물건처럼 보이진 않는다.
  const bonesByName = byName;

  let mixer = null;
  const actions = {};
  // 빌려온 동작은 기본으로 끈다.
  //
  // 세 번 고쳐도 목이 꺾이거나 소품이 돌았다. 두 뼈대는 이름만 같을 뿐 뼈가 감긴
  // 방향과 기본 자세가 달라서, 각도를 실행 중에 계산으로 맞추는 것으로는 안 된다 —
  // 유니티가 「휴머노이드」라는 중간 단계를 두는 이유가 이것이다.
  //
  // 제대로 하려면 한 번 구워서 넣어야 한다(Blender 에서 이 골격에 맞춰 다시 저장).
  // 그건 따로 할 일이고, 그때까지 억지로 얹어 이상하게 두지 않는다.
  // 켜 보려면 주소 뒤에 `?anim=1`.
  const useBorrowed = new URLSearchParams(location.search).get('anim') === '1';
  if (useBorrowed) try {
    const gltf = await new GLTFLoader().loadAsync('/anim/cc0-animations.glb');

    // 두 뼈대의 「가만히 있을 때 자세」를 각각 적어 둔다. 이 둘이 다르기 때문에
    // 각도를 그대로 옮기면 목이 꺾이고 소품이 돈다.
    const sourceRest = new Map();
    gltf.scene.traverse((node) => {
      if (node.isBone === true) sourceRest.set(node.name, node.quaternion.clone());
    });
    const targetRest = new Map();
    for (const [name, bone] of byName) targetRest.set(name, bone.quaternion.clone());

    mixer = new THREE.AnimationMixer(model);
    const wanted = { idle: 'Idle_Loop', talking: 'Idle_Talking_Loop' };
    for (const [key, clipName] of Object.entries(wanted)) {
      const source = gltf.animations.find((a) => a.name === clipName);
      if (source === undefined) continue;
      const fitted = fitClip(source, bonesByName, sourceRest, targetRest);
      if (fitted === null) continue;
      const action = mixer.clipAction(fitted);
      action.setLoop(THREE.LoopRepeat, Infinity);
      actions[key] = action;
    }
    if (Object.keys(actions).length === 0) {
      mixer = null;
      console.warn('[3D] 가져온 동작이 이 뼈대와 안 맞는다 — 뼈만 움직인다');
    } else {
      actions.idle?.play();
      console.log('[3D] 동작 얹음:', Object.keys(actions).join(', '));
    }
  } catch (e) {
    console.warn('[3D] 동작을 못 불렀다 — 뼈만 움직인다:', e);
  }

  /** 지금 기분에 맞는 동작으로 부드럽게 갈아탄다. */
  let playing = actions.idle ?? null;
  function switchTo(next) {
    if (next === undefined || next === null || next === playing) return;
    next.reset().play();
    if (playing !== null) playing.crossFadeTo(next, 0.35, false);
    playing = next;
  }

  const state = { mood: 'idle', look: 0 };
  const clock = new THREE.Clock();

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    frame();
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    mixer?.update(clock.getDelta());

    // 숨. 늘 있다 — 멈춰 있으면 물건처럼 보인다.
    const breath = Math.sin(t * 1.7) * 0.012;
    pivot.position.y = breath;
    pivot.scale.setScalar(1 + breath * 0.35);

    // 커서 쪽으로 아주 조금 몸을 돌린다. 크게 돌리면 인형처럼 보인다.
    const wantY = state.look * 0.28;
    let extra = 0;
    if (state.mood === 'listening') extra = 0.16;
    else if (state.mood === 'thinking') extra = Math.sin(t * 3.4) * 0.10;
    else if (state.mood === 'speaking') extra = Math.sin(t * 7.5) * 0.05;
    pivot.rotation.y += (wantY + extra - pivot.rotation.y) * 0.08;

    // 말할 때는 고개가 같이 끄덕인다.
    const nod = state.mood === 'speaking' ? Math.sin(t * 9.0) * 0.045 : 0;
    const tilt = state.mood === 'thinking' ? 0.07 : 0;
    pivot.rotation.x += (nod + tilt - pivot.rotation.x) * 0.12;

    // 빌려온 동작이 없으므로, 살아 보이게 하는 건 전부 이 몇 줄이다.
    // 매번 기준 자세에서 다시 계산한다 — 더하기만 하면 조금씩 밀려 결국 꺾인다.
    if (mixer === null) {
      const sway = Math.sin(t * 0.9) * 0.02;              // 무게중심이 아주 조금 오간다
      const breathe = Math.sin(t * 1.7);                   // 숨
      const look = state.look;

      turn(bones.spine, breathe * 0.018, sway, 0);
      turn(bones.neck, breathe * -0.01, look * 0.13, 0);
      turn(
        bones.head,
        (state.mood === 'thinking' ? 0.06 : 0) + Math.sin(t * 1.31) * 0.014
          + (state.mood === 'speaking' ? Math.sin(t * 7.4) * 0.03 : 0),
        look * 0.26 + (state.mood === 'listening' ? 0.09 : 0) + Math.sin(t * 0.53) * 0.02,
        state.mood === 'thinking' ? 0.06 : Math.sin(t * 0.71) * 0.012,
      );
      // 팔은 몸통 흔들림을 조금 늦게 따라간다 — 그래야 뻣뻣해 보이지 않는다.
      const lag = Math.sin(t * 0.9 - 0.6) * 0.03;
      turn(bones.armL, 0, 0, lag);
      turn(bones.armR, 0, 0, -lag);
    } else {
      if (bones.head !== null) bones.head.rotation.y += state.look * 0.24;
      if (bones.neck !== null) bones.neck.rotation.y += state.look * 0.10;
    }

    renderer.render(scene, camera);
  });

  return {
    setMood(mood) {
      state.mood = mood || 'idle';
      switchTo(state.mood === 'speaking' ? (actions.talking ?? actions.idle) : actions.idle);
    },
    /** -1(왼쪽) ~ 1(오른쪽). */
    lookAt(x) { state.look = Math.max(-1, Math.min(1, x)); },
  };
}
