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
    model = await new FBXLoader().loadAsync(`/model/${encodeURIComponent(modelName)}`);
  } catch (e) {
    onFail?.(e);
    return null;
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

    renderer.render(scene, camera);
  });

  return {
    setMood(mood) { state.mood = mood || 'idle'; },
    /** -1(왼쪽) ~ 1(오른쪽). */
    lookAt(x) { state.look = Math.max(-1, Math.min(1, x)); },
  };
}
