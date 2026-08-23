/**
 * **손 소스** — 카메라에서 본 손을 같은 그릇(frame)에 담는다.
 *
 * ⚠ **기본이 아니다.** 무게가 실측으로 크다(통짜 36MB · 골라도 wasm 12MB). 그래서 이 파일은
 * 아무것도 자동으로 안 받아온다 — **연장을 부른 쪽이 건넨다**(`createLandmarker`).
 * 안 켜면 카메라도 무게도 0 이다.
 *
 * ⚠ **자세**: 허공에 손을 든 채로는 짧은 시간에도 팔·손목이 지친다(고릴라 팔). 영상 속 그
 * 자세가 멋있는 것은 24초짜리라서다. 그래서 셈은 **책상에 팔을 얹고 손가락만** 쓰는 폭을
 * 기준으로 잡고, 무동작이 이어지면 부른 쪽이 꺼 준다.
 *
 * 랜드마크 번호(MediaPipe 손 21점): 0 손목 · 4 엄지끝 · 8 검지끝 · 5 검지밑 · 17 새끼밑
 */

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_TIP = 8;
export const INDEX_MCP = 5;
export const PINKY_MCP = 17;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

/**
 * 손 한 벌(21점) → 판 하나. **순수 셈**이라 카메라 없이 잰다.
 *
 * - `point` = 검지 끝. **거울**로 뒤집는다(카메라는 좌우가 반대라 안 뒤집으면 손을 오른쪽으로
 *   움직였는데 점이 왼쪽으로 간다)
 * - `grip` = 엄지-검지 거리를 **손 크기로 나눠** 잰다 — 손이 멀어져도 같은 뜻이 되게.
 *   붙으면 1, 벌리면 0
 * - `depth` = 손 크기 자체. 가까울수록 크다 → 0~1 로 편다
 */
export function handToFrame(landmarks, { t = 0, mirror = true, pinchOpen = 0.9, pinchClosed = 0.25 } = {}) {
  if (!landmarks || landmarks.length < 21) return { t, ok: false, kind: 'hand', point: null, depth: 0.5, grip: 0, buttons: 0, raw: null };
  const tip = landmarks[INDEX_TIP];
  /* 손 크기 = 검지밑 ↔ 새끼밑 (손가락을 굽혀도 거의 안 변하는 자리). */
  const span = Math.max(1e-6, dist(landmarks[INDEX_MCP], landmarks[PINKY_MCP]));
  const pinch = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / span;
  /* 벌림(=1)과 붙임(=0) 사이를 0~1 로. 문턱 밖은 자른다. */
  const grip = Math.min(1, Math.max(0, (pinchOpen - pinch) / (pinchOpen - pinchClosed)));
  return {
    t,
    ok: true,
    kind: 'hand',
    point: [mirror ? 1 - tip.x : tip.x, tip.y],
    depth: Math.min(1, Math.max(0, span * 3)),
    grip,
    buttons: 0,
    raw: landmarks,
  };
}

/**
 * 카메라를 켜고 판을 흘려보낸다.
 *
 * `createLandmarker` 는 **부른 쪽이 건넨다** — `{ detectForVideo(video, t) -> { landmarks } }`
 * 모양이면 무엇이든 된다(MediaPipe Tasks 가 그 모양이다). 이 꾸러미는 그 이름을 모른다.
 */
export function createHandSource({
  video,
  createLandmarker,
  now = () => performance.now(),
  mirror = true,
} = {}) {
  const listeners = new Set();
  let alive = false;
  let landmarker = null;
  let stream = null;

  async function loop() {
    while (alive) {
      let frame = { t: now(), ok: false, kind: 'hand', point: null, depth: 0.5, grip: 0, buttons: 0, raw: null };
      try {
        const got = await landmarker.detectForVideo(video, now());
        const hands = got?.landmarks || got?.handLandmarks || [];
        if (hands.length) frame = handToFrame(hands[0], { t: now(), mirror });
      } catch { /* 한 판 놓친 것은 사고가 아니다 — 다음 판에서 다시 본다 */ }
      for (const fn of listeners) fn(frame);
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
  }

  return {
    kind: 'hand',
    onFrame(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async start() {
      if (alive) return;
      if (!createLandmarker) throw new Error('손 인식 연장을 안 건넸다 — createLandmarker 를 넘겨라');
      landmarker = await createLandmarker();
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      video.srcObject = stream;
      await video.play();
      alive = true;
      loop();
    },
    stop() {
      alive = false;
      for (const track of stream?.getTracks() || []) track.stop();
      stream = null;
    },
  };
}
