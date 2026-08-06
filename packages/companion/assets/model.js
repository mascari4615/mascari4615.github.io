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
/**
 * 남의 동작을 이 몸에 맞게 고쳐 넣는다.
 *
 * 이름이 같다고 그대로 먹이면 안 된다. 두 뼈대는 **가만히 서 있을 때의 자세**가
 * 서로 다르기 때문이다 — 같은 「고개 숙임」이라도 기준이 다르면 목이 꺾이고 소품이
 * 팽이처럼 돈다(실측). 유니티가 이 모델을 「휴머노이드」로 두고 쓰는 이유도 같다.
 *
 * 그래서 클립의 각도를 그대로 쓰지 않고, **저쪽 기본 자세로부터 얼마나 움직였는지**만
 * 뽑아서 이쪽 기본 자세 위에 얹는다.
 */
function retargetTrack(track, sourceRest, targetRest) {
  const boneName = track.name.slice(0, track.name.lastIndexOf('.'));
  const src = sourceRest.get(boneName);
  const dst = targetRest.get(boneName);
  if (src === undefined || dst === undefined) return track;

  const srcInverse = src.clone().invert();
  const out = track.clone();
  const q = new THREE.Quaternion();
  for (let i = 0; i < out.values.length; i += 4) {
    q.set(out.values[i], out.values[i + 1], out.values[i + 2], out.values[i + 3]);
    // 저쪽 기본 자세 기준의 「움직인 만큼」
    q.premultiply(srcInverse);
    // 그 움직임을 이쪽 기본 자세 위에 얹는다
    q.premultiply(dst);
    out.values[i] = q.x;
    out.values[i + 1] = q.y;
    out.values[i + 2] = q.z;
    out.values[i + 3] = q.w;
  }
  return out;
}

function fitClip(clip, bonesByName, sourceRest, targetRest) {
  const kept = clip.tracks.filter((track) => {
    const dot = track.name.lastIndexOf('.');
    const boneName = track.name.slice(0, dot);
    const what = track.name.slice(dot + 1);

    if (bonesByName.has(boneName) === false) return false;

    // `root` 는 몸 전체가 어느 쪽을 보고 서는지를 정하는 자리다. 남의 클립에서
    // 그걸 그대로 가져오면, 이미 제 방향으로 서 있는 몸이 한 번 더 돌아가 하늘을
    // 보고 눕는다(실측). 방향은 우리 모델 것을 쓰고, 동작만 빌린다.
    if (boneName === 'root') return false;

    // 위치·크기 트랙도 버린다. 두 골격은 팔다리 길이가 달라서, 남의 뼈 위치를
    // 그대로 먹이면 사지가 늘어나거나 몸에서 떨어져 나온다. 회전만 빌린다.
    return what === 'quaternion';
  });

  if (kept.length === 0) return null;
  const fitted = clip.clone();
  fitted.tracks = kept.map((track) => retargetTrack(track, sourceRest, targetRest));
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
