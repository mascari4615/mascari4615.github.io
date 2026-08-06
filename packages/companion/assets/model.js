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
 * 남한테서 가져온 동작을 이 몸에 얹는다.
 *
 * 보통은 뼈 이름이 달라 다시 짜 맞춰야 하는데, 이 둘은 같은 계열 골격이라 이름이
 * `DEF-*` 로 그대로 겹친다(실측). 그래서 이 몸에 없는 뼈를 가리키는 줄만 버리면 된다.
 * 그 정리를 안 하면 없는 뼈를 찾다가 동작 전체가 조용히 안 돈다.
 */
function fitClip(clip, bonesByName) {
  const kept = clip.tracks.filter((track) => bonesByName.has(track.name.split('.')[0]));
  if (kept.length === 0) return null;
  const fitted = clip.clone();
  fitted.tracks = kept;
  return fitted;
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

  // 클립이 하나도 없는 모델이다(실측). 대신 뼈를 직접 움직인다 — 남의 동작을
  // 억지로 씌우면 이 골격과 안 맞아 어긋나 보인다.
  // 이 골격은 진짜 뼈 옆에 `ORG-`·`MCH-`·`DEF-` 같은 보조 사본을 함께 들고 있다(실측).
  // 이름에 들어있다고 아무거나 잡으면 화면에 아무 변화가 없는 사본을 돌리게 된다.
  const helper = /^(org|mch|def|vis|tweak)[-_.]/i;
  const found = new Map();
  model.traverse((node) => {
    if (node.isBone !== true) return;
    const n = node.name.toLowerCase();
    if (helper.test(n)) return;
    if (found.has(n) === false) found.set(n, node);
  });
  const pick = (...names) => {
    for (const name of names) {
      const bone = found.get(name);
      if (bone !== undefined) return bone;
    }
    return null;
  };
  const bones = {
    head: pick('head'),
    neck: pick('neck'),
    spine: pick('chest', 'spine', 'torso'),
  };
  console.log('[3D] 잡은 뼈:', Object.entries(bones).map(([k, v]) => `${k}=${v?.name ?? '없음'}`).join(' '));
  const rest = new Map();
  for (const bone of Object.values(bones)) {
    if (bone !== null) rest.set(bone, bone.rotation.clone());
  }

  // 모델마다 크기·중심이 제각각이라, 실제 크기를 재서 화면에 맞춘다.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const tallest = Math.max(size.x, size.y, size.z) || 1;
  const scale = 1.6 / tallest;
  model.scale.setScalar(scale);
  model.position.sub(center.multiplyScalar(scale));
  // 얼굴이 보이게 위쪽을 잡는다 — 전신을 다 보여주면 좁은 창에서 얼굴이 콩알만 해진다.
  model.position.y -= 0.35;

  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);

  camera.position.set(0, 0.35, 3.1);
  camera.lookAt(0, 0.15, 0);

  // ── 가져온 동작 얹기 ──────────────────────────────────────────────────
  // 클립이 붙으면 얘가 실제로 서 있고 말하는 몸짓을 한다. 못 붙으면 위의 뼈 움직임만
  // 남는다 — 그래도 숨은 쉬므로 물건처럼 보이진 않는다.
  const bonesByName = new Map();
  model.traverse((node) => { if (node.isBone === true) bonesByName.set(node.name, node); });

  let mixer = null;
  const actions = {};
  try {
    const gltf = await new GLTFLoader().loadAsync('/anim/cc0-animations.glb');
    mixer = new THREE.AnimationMixer(model);
    const wanted = { idle: 'Idle_Loop', talking: 'Idle_Talking_Loop' };
    for (const [key, clipName] of Object.entries(wanted)) {
      const source = gltf.animations.find((a) => a.name === clipName);
      if (source === undefined) continue;
      const fitted = fitClip(source, bonesByName);
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
    camera.updateProjectionMatrix();
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

    // 뼈를 직접 움직인다. 몸통 전체를 돌리는 것과 달리 사람처럼 보이는 건 이쪽이다.
    // 폭을 좁게 잡는다 — 크게 돌리면 목이 꺾인 인형이 된다.
    if (bones.head !== null && (mixer === null || state.look !== 0 || state.mood !== 'idle')) {
      const base = rest.get(bones.head);
      bones.head.rotation.y = base.y + state.look * 0.34 + (state.mood === 'listening' ? 0.12 : 0);
      bones.head.rotation.x = base.x
        + (state.mood === 'speaking' ? Math.sin(t * 8.2) * 0.06 : 0)
        + (state.mood === 'thinking' ? 0.10 : 0)
        + Math.sin(t * 1.3) * 0.015; // 가만히 있을 때도 아주 조금 움직인다
      bones.head.rotation.z = base.z + (state.mood === 'thinking' ? Math.sin(t * 1.9) * 0.05 : 0);
    }
    if (bones.neck !== null && mixer === null) {
      const base = rest.get(bones.neck);
      bones.neck.rotation.y = base.y + state.look * 0.14;
    }
    if (bones.spine !== null && mixer === null) {
      const base = rest.get(bones.spine);
      bones.spine.rotation.x = base.x + Math.sin(t * 1.7) * 0.02; // 숨
      bones.spine.rotation.y = base.y + state.look * 0.08;
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
