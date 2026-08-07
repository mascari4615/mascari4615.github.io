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
import { paintableFace } from '/face-paint.js';

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
 *
 * 값은 `[이 몸의 뼈, 빌린 각을 얼마나 먹일지]`.
 *
 * 두 번째 숫자가 필요한 이유: 빌려온 동작은 **어른 사람 몸**의 것이고 이 몸은 머리가
 * 크고 팔이 판자인 2등신이다. 어른의 「팔을 옆으로 내린다」를 100% 먹이면 판자 팔이
 * 몸통을 파고들고, 거기 붙어 있는 옷까지 딸려 들어가 치마가 찢어진 것처럼 보인다(실측).
 * 넓적다리도 같다 — 다리를 벌리면 뻣뻣한 치마가 쪼개진다.
 *
 * 그래서 어디를 얼마나 따라갈지 뼈마다 정한다. 목·머리는 그대로(표정이 사니까),
 * 팔다리는 덜 먹인다. **이 숫자들이 이 몸의 「연기 톤」이다** — 만지면 인상이 바뀐다.
 */
const BONE_PAIRS = {
  'DEF-hips': ['ORG-hips', 0.55],
  'DEF-spine001': ['ORG-spine', 0.8],
  'DEF-spine003': ['ORG-chest', 0.8],
  'DEF-neck': ['DEF-neck', 1],
  'DEF-head': ['DEF-head', 1],
  'DEF-shoulderL': ['DEF-shoulderL', 0.5],
  'DEF-shoulderR': ['DEF-shoulderR', 0.5],
  'DEF-upper_armL': ['DEF-upper_armL', 0.72],
  'DEF-upper_armR': ['DEF-upper_armR', 0.72],
  'DEF-forearmL': ['DEF-forearmL', 0.85],
  'DEF-forearmR': ['DEF-forearmR', 0.85],
  'DEF-handL': ['DEF-handL', 1],
  'DEF-handR': ['DEF-handR', 1],
  'DEF-thighL': ['DEF-tightL', 0.12],
  'DEF-thighR': ['DEF-tightR', 0.12],
  'DEF-shinL': ['DEF-shinL', 0.3],
  'DEF-shinR': ['DEF-shinR', 0.3],
  'DEF-footL': ['DEF-footL', 0.5],
  'DEF-footR': ['DEF-footR', 0.5],
};

/**
 * 기분 → 빌려온 동작 이름.
 *
 * 묶음에는 46편이 들어 있지만 여기 적은 것만 굽는다. 굽는 값이 창을 열 때 한 번씩
 * 드는 비용이라, 안 쓸 동작까지 굽지 않는다. 다른 편을 보려면 `?clip=<이름>`.
 */
const MOOD_CLIPS = {
  idle: 'Idle_Loop',
  speaking: 'Idle_Talking_Loop',
  thinking: 'Spell_Simple_Idle_Loop',
  // 「듣는 중」은 일부러 따로 두지 않는다. 남은 동작들은 죄다 뭔가를 **들고 있는**
  // 자세라, 아무것도 안 들고 하면 보이지 않는 물건을 쥔 사람이 된다(실측 —
  // 횃불 동작을 얹었더니 허공을 잡고 있었다). 듣는 티는 몸을 살짝 기울여서 낸다.
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

  // 실험용: 주소 뒤 `?skip=DEF-thighL,DEF-shinL` 로 특정 뼈를 짝에서 빼고 비교한다.
  const skipped = new Set((new URLSearchParams(location.search).get('skip') ?? '').split(',').filter(Boolean));

  const pairs = [];
  for (const [sourceName, [targetName, strength]] of Object.entries(BONE_PAIRS)) {
    const source = sourceBones.get(sourceName);
    const target = targetBones.get(targetName);
    if (source === undefined || target === undefined) continue;
    if (skipped.has(sourceName)) continue;
    pairs.push({
      source,
      target,
      strength,
      sourceRestInverse: worldQuat(source).invert(),
      targetRest: worldQuat(target),
      targetRestLocal: target.quaternion.clone(),
    });
  }
  // 위에 달린 뼈부터 계산해야 한다 — 아래 뼈는 위 뼈가 움직인 결과 위에서 자기 각을 잡는다.
  pairs.sort((a, b) => depth(a.target) - depth(b.target));
  return pairs;
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
  const eased = new THREE.Quaternion();

  for (let frame = 0; frame < frames; frame += 1) {
    mixer.setTime(frame * step);
    sourceRoot.updateMatrixWorld(true);

    for (let i = 0; i < pairs.length; i += 1) {
      const { source, target, strength, sourceRestInverse, targetRest } = pairs[i];
      source.matrixWorld.decompose(pos, sourceWorld, scl);

      // 저쪽이 기준 자세에서 돌아간 만큼(세계 기준) → 이쪽 기준 자세 위에 얹는다
      wanted.copy(sourceWorld).multiply(sourceRestInverse).multiply(targetRest);
      // 이 뼈가 남의 각을 얼마나 따라갈지. 1 이면 그대로, 0 이면 제 자세 그대로.
      // (섞을 때 따로 그릇을 쓴다 — 같은 그릇에 담으면 자기 자신 쪽으로 섞여 제자리에 남는다.)
      if (strength < 1) {
        eased.copy(targetRest).slerp(wanted, strength);
        wanted.copy(eased);
      }

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

  // 실제로 움직이는지 재 둔다. 0 이면 구운 게 정지 화면이라는 뜻 — 이 값이 없으면
  // 「붙었다」와 「붙었는데 안 움직인다」를 화면만 보고는 구분 못 한다.
  const a = new THREE.Quaternion();
  const b = new THREE.Quaternion();
  let widest = 0;
  const half = Math.floor(frames / 2) * 4;
  for (const v of values) {
    a.set(v[0], v[1], v[2], v[3]);
    b.set(v[half], v[half + 1], v[half + 2], v[half + 3]);
    widest = Math.max(widest, 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI);
  }

  return { name: clip.name, frames, step, duration: clip.duration, values, widest };
}

export async function mountModel(canvas, modelName, onFail) {
  let renderer;
  try {
    // `preserveDrawingBuffer` = 그린 그림을 한 판 뒤에도 읽을 수 있게 둔다. 창이 스스로
    // 제 모습을 찍어 낼 수 있어야 「자세가 이상하다」를 사람 눈 없이도 확인한다.
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
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
    const outlineWidth = Number(new URLSearchParams(location.search).get('outline') ?? '0.006');
    const { outlineCount } = applyToon(model, { steps: 3, outline: outlineWidth });
    console.log('[3D] 만화식으로 칠했다 · 바깥선', outlineCount, '겹');
  } catch (e) {
    console.warn('[3D] 만화식 칠하기 실패 — 원래 재질로 간다:', e);
  }

  // 얼굴 — 만화식으로 칠한 **뒤에** 손대야 한다. 앞서 하면 칠하기가 그림을 다시 물어와
  // 덧칠한 것이 통째로 사라진다.
  let face = null;
  try {
    face = await paintableFace(model, { debug: new URLSearchParams(location.search).get('facedebug') === '1' });
    console.log('[3D] 얼굴', face === null ? '못 잡음 — 표정 없이 간다' : '잡음 (깜빡임·입)');
  } catch (e) {
    console.warn('[3D] 얼굴을 못 잡았다 — 표정 없이 간다:', e);
  }

  // 살을 실제로 움직이는 건 `DEF-` 뼈다. 조종용 뼈(`head` 같은 것)는 편집 프로그램
  // 안에서만 그 뼈들을 끌고 다니고, 밖으로 내보낸 파일에는 그 연결이 남지 않는다 —
  // 그래서 조종용 뼈를 돌리면 화면에서는 아무 일도 안 일어난다(그렇게 만들어 놨었다).
  //
  // 이름이 여러 개 겹치면 **맨 위 토막**을 쓴다. 아래 토막을 돌리면 팔은 그대로 있고
  // 손끝만 까딱한다. 그리고 이 파일에는 점이 들어간 이름(`DEF-upper_arm.L`)이 없다 —
  // 불러오면서 점이 지워져 `DEF-upper_armL` 이 된다. 점을 넣어 찾으면 조용히 못 찾는다.
  const byName = new Map();
  model.traverse((node) => {
    if (node.isBone === true && byName.has(node.name) === false) byName.set(node.name, node);
  });
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
    // 이 몸의 몸통은 `DEF-` 가 아니라 `ORG-` 다.
    spine: pick('ORG-chest', 'ORG-spine', 'DEF-chest', 'chest', 'spine'),
    armL: pick('DEF-upper_armL'),
    armR: pick('DEF-upper_armR'),
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

  // 바닥 그림자 — 실제 빛 계산이 아니라 발밑에 깔아 둔 둥근 얼룩 한 장이다.
  // 이게 없으면 몸이 허공에 붕 떠 보인다. 진짜 그림자를 켜면 배경이 뚫린 창에서
  // 바닥이 없어 그림자가 맺힐 데도 없다 — 그래서 「바닥인 척하는 얼룩」이 맞다.
  const smudge = document.createElement('canvas');
  smudge.width = 128;
  smudge.height = 128;
  const smudgeInk = smudge.getContext('2d');
  const blur = smudgeInk.createRadialGradient(64, 64, 0, 64, 64, 64);
  blur.addColorStop(0, 'rgba(20, 16, 30, 0.45)');
  blur.addColorStop(0.55, 'rgba(20, 16, 30, 0.18)');
  blur.addColorStop(1, 'rgba(20, 16, 30, 0)');
  smudgeInk.fillStyle = blur;
  smudgeInk.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(smudge),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.5; // 발바닥 높이 (키를 1로 맞춰 뒀다)
  shadow.renderOrder = -1;
  scene.add(shadow);

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
  // 붙으면 얘가 실제로 서 있고 말하는 몸짓을 한다. 못 붙으면 아래의 손수 만든
  // 뼈 움직임만 남는다 — 그래도 숨은 쉬므로 물건처럼 보이진 않는다.
  // 꺼 보려면 주소 뒤에 `?anim=0`.
  let clips = null;
  let pairs = [];
  if (new URLSearchParams(location.search).get('anim') !== '0') try {
    const gltf = await new GLTFLoader().loadAsync('/anim/cc0-animations.glb');
    pairs = pairBones(model, gltf.scene);
    console.log(`[3D] 짝지은 뼈 ${pairs.length}/${Object.keys(BONE_PAIRS).length}:`,
      pairs.map((p) => `${p.source.name}→${p.target.name}`).join(' '));

    if (pairs.length >= 8) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      // 기분마다 다른 동작. 빌려온 묶음에 46편이 들어 있는데 두 편만 쓰고 있었다.
      // 서 있는 동작만 쓴다 — 앉기·엎드리기는 이 창에서 몸이 화면 밖으로 나간다.
      const wanted = { ...MOOD_CLIPS };
      // 한 편만 따로 보고 싶을 때: `?clip=Dance_Loop`
      const only = new URLSearchParams(location.search).get('clip');
      if (only !== null) wanted.idle = only;
      const baked = {};
      for (const [key, clipName] of Object.entries(wanted)) {
        const clip = gltf.animations.find((a) => a.name === clipName);
        if (clip !== undefined) baked[key] = bakeClip(clip, pairs, gltf.scene, mixer);
      }
      if (baked.idle !== undefined) {
        clips = baked;
        console.log('[3D] 동작 구움:', Object.entries(baked)
          .map(([k, c]) => `${k}(${c.frames}장, 최대 흔들림 ${c.widest.toFixed(1)}°)`).join(' '));
      }
    } else {
      console.warn('[3D] 짝지은 뼈가 너무 적다 — 손수 만든 움직임으로 간다');
    }
  } catch (e) {
    console.warn('[3D] 동작을 못 불렀다 — 손수 만든 움직임으로 간다:', e);
  }

  // ── 구워 둔 동작 되짚기 ────────────────────────────────────────────────
  // 프레임 사이는 이어서 채운다. 동작을 갈아탈 때는 두 자세를 잠깐 섞는다.
  const poseA = pairs.map(() => new THREE.Quaternion());
  const poseB = pairs.map(() => new THREE.Quaternion());
  const between = new THREE.Quaternion();

  function readPose(clip, time, into) {
    const wrapped = ((time % clip.duration) + clip.duration) % clip.duration;
    const x = wrapped / clip.step;
    const i0 = Math.min(clip.frames - 1, Math.floor(x));
    const i1 = (i0 + 1) % clip.frames;
    const blend = x - i0;
    for (let i = 0; i < into.length; i += 1) {
      const v = clip.values[i];
      into[i].set(v[i0 * 4], v[i0 * 4 + 1], v[i0 * 4 + 2], v[i0 * 4 + 3]);
      between.set(v[i1 * 4], v[i1 * 4 + 1], v[i1 * 4 + 2], v[i1 * 4 + 3]);
      into[i].slerp(between, blend);
    }
  }

  let current = clips?.idle ?? null;
  let previous = null;
  let fade = 1; // 1 = 갈아타기 끝남
  function switchTo(next) {
    if (next === undefined || next === null || next === current) return;
    previous = current;
    current = next;
    fade = 0;
  }

  const state = { mood: 'idle', look: 0, speakUntil: 0 };
  const clock = new THREE.Clock();

  // 눈 깜빡임 — 사람은 3~5초에 한 번 깜빡인다. 일정한 간격으로 깜빡이면 기계처럼
  // 보이므로 매번 다음 때를 새로 뽑는다.
  const BLINK_SHUT = 0.07; // 감는 데 걸리는 시간(초). 뜨는 것도 같은 시간.
  let blinkNext = 1.5 + Math.random() * 2;
  let blinkFrom = -1;
  // 딴생각에 잠기는 때 / 돌아올 때.
  let lastAt = 0;
  let breakNext = 35 + Math.random() * 40;
  let breakBack = 0;

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
    // 시간은 한 번만 물어본다. 흐른 시간을 따로 물어보면 **0 이 돌아온다** — 앞서
    // 물어본 그 순간에 시계가 이미 정산돼 버리기 때문이다. 그걸 모르고 쓰면 동작을
    // 갈아타는 중간값이 영원히 안 움직여, 기분이 바뀌어도 자세가 그대로다(실측).
    const t = clock.getElapsedTime();
    const dt = t - lastAt;
    lastAt = t;

    // 빈 시간 연기 — 아무 일도 없을 때 계속 같은 동작만 돌면 화면보호기처럼 보인다.
    // 가끔 잠깐 딴생각에 잠겼다가 돌아온다.
    if (clips !== null && state.mood === 'idle') {
      if (breakBack > 0 && t > breakBack) {
        breakBack = 0;
        switchTo(clips.idle);
      } else if (breakBack === 0 && t > breakNext && clips.thinking !== undefined) {
        switchTo(clips.thinking);
        breakBack = t + 4;
        breakNext = t + 40 + Math.random() * 50;
      }
    }

    // 구워 둔 동작을 이 판의 자세로 펴 놓는다.
    if (current !== null) {
      readPose(current, t, poseA);
      if (fade < 1 && previous !== null) {
        fade = Math.min(1, fade + dt / 0.35);
        readPose(previous, t, poseB);
        for (let i = 0; i < poseA.length; i += 1) poseA[i].slerp(poseB[i], 1 - fade);
      }
      for (let i = 0; i < pairs.length; i += 1) pairs[i].target.quaternion.copy(poseA[i]);
    }

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

    // 빌려온 동작이 못 붙은 경우, 살아 보이게 하는 건 전부 이 몇 줄이다.
    // 매번 기준 자세에서 다시 계산한다 — 더하기만 하면 조금씩 밀려 결국 꺾인다.
    if (current === null) {
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
      // 빌려온 동작 위에 시선만 얹는다 — 동작이 잡아 준 자세를 덮지 않고 더한다.
      if (bones.head !== null) bones.head.quaternion.multiply(spin.setFromAxisAngle(axis.set(0, 1, 0), state.look * 0.24));
      if (bones.neck !== null) bones.neck.quaternion.multiply(spin.setFromAxisAngle(axis.set(0, 1, 0), state.look * 0.10));
    }

    // ── 얼굴 ────────────────────────────────────────────────────────────
    // 몸이 아무리 잘 움직여도 눈이 안 깜빡이면 인형으로 보인다. 화면의 7할이 머리다.
    if (face !== null) {
      if (t >= blinkNext) {
        blinkFrom = t;
        // 생각 중일 때는 조금 더 자주 깜빡인다 — 눈이 바쁜 게 생각하는 티다.
        const rest = state.mood === 'thinking' ? 1.2 : 2.5;
        blinkNext = t + rest + Math.random() * 3;
      }
      let closed = 0;
      if (blinkFrom >= 0) {
        const into = t - blinkFrom;
        if (into >= BLINK_SHUT * 2) blinkFrom = -1;
        else closed = into < BLINK_SHUT ? into / BLINK_SHUT : 1 - (into - BLINK_SHUT) / BLINK_SHUT;
      }
      face.setBlink(closed);

      // 입은 말하는 동안만 움직인다. 말이 끝나는 때를 알면 그때까지, 모르면 기분으로.
      const talking = state.speakUntil > Date.now() || state.mood === 'speaking';
      face.setMouth(talking ? 0.35 + 0.45 * Math.abs(Math.sin(t * 11)) : 0);
    }

    renderer.render(scene, camera);
  });

  /**
   * 얘가 화면에서 실제로 차지하는 네모.
   *
   * 그림판은 창만큼 넓지만 얘는 그 안 일부만 채운다. 그림판 전체를 「누를 자리」로
   * 넘기면 보이지 않는 빈 곳까지 클릭을 삼킨다 — 뒤에 있는 프로그램을 못 누르게 된다.
   */
  const corner = new THREE.Vector3();
  function screenBox() {
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return null;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i += 1) {
      corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      );
      pivot.localToWorld(corner);
      corner.project(camera);
      const x = (corner.x * 0.5 + 0.5) * w;
      const y = (-corner.y * 0.5 + 0.5) * h;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const rect = canvas.getBoundingClientRect();
    // 화면 밖으로 삐져나간 부분은 잘라낸다.
    const left = Math.max(0, minX), top = Math.max(0, minY);
    const right = Math.min(w, maxX), bottom = Math.min(h, maxY);
    if (right <= left || bottom <= top) return null;
    return { x: rect.x + left, y: rect.y + top, width: right - left, height: bottom - top };
  }

  return {
    screenBox,
    setMood(mood) {
      state.mood = mood || 'idle';
      if (clips === null) return;
      switchTo(clips[state.mood] ?? clips.idle);
    },
    /** -1(왼쪽) ~ 1(오른쪽). */
    lookAt(x) { state.look = Math.max(-1, Math.min(1, x)); },
    /**
     * 이만큼 동안 입을 움직인다. 소리의 실제 길이를 알 때 쓴다 — 기분으로만 움직이면
     * 소리는 끝났는데 입이 계속 나불거리거나, 그 반대가 된다.
     */
    speakFor(ms) { state.speakUntil = Date.now() + Math.max(0, ms); },
  };
}
