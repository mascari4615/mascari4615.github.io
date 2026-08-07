/**
 * 얼굴 — 눈 깜빡임과 입.
 *
 * 이 몸의 얼굴은 뼈가 아니라 **그림 한 장**이다. 눈·코·입이 몸 전체 그림(1024×1024)
 * 한구석에 그려져 있고, 표정용 뼈도 모프도 없다. 그래서 표정을 만들려면 그림을
 * 고쳐 그리는 수밖에 없다 — 사람이 새로 그리는 게 아니라, 원본을 복사해 두고
 * **눈·입 자리만 코드로 덧칠한다.** 색도 원본에서 뽑으므로 화풍이 안 어긋난다.
 *
 * 덧칠하는 칸은 아래 세 개뿐이라, 매 판 다시 칠해도 비용이 거의 없다.
 */
import * as THREE from 'three';

/**
 * 그림 속 얼굴 칸 (1024 기준 픽셀).
 *
 * 이 그림에서 얼굴은 옆으로 누워 있다 — 눈이 위아래로 나란한 게 아니라 좌우로 나란하다.
 * 그래서 「눈을 감는다」는 칸을 **가로로** 가늘게 덮는 것이 된다.
 */
const FACE = {
  eyes: [
    { x: 598, y: 340, w: 28, h: 44 },
    { x: 597, y: 412, w: 28, h: 52 },
  ],
  mouth: { x: 556, y: 392, w: 20, h: 20 },
};

/** 그림에서 색 하나를 뽑는다 — 새로 칠할 색을 손으로 정하지 않기 위해서. */
function pickColor(ink, x, y) {
  const [r, g, b] = ink.getImageData(x, y, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 눈 칸 둘레에서 **살색**을 찾는다.
 *
 * 한 점만 찍어 쓰면 그게 머리카락일 수도 있다 — 실제로 눈 옆이 머리카락인 자리가 있다.
 * 둘레를 여러 군데 찍어 그중 가장 밝은 것을 고른다. 이 그림에서 살은 창백하고 머리는
 * 진한 주황이라, 밝기만으로 갈린다.
 */
function skinAround(ink, box) {
  const spots = [
    [box.x - 10, box.y + box.h / 2], [box.x + box.w + 10, box.y + box.h / 2],
    [box.x + box.w / 2, box.y - 10], [box.x + box.w / 2, box.y + box.h + 10],
  ];
  let best = null;
  let brightest = -1;
  for (const [x, y] of spots) {
    const [r, g, b, a] = ink.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    if (a < 200) continue;
    const light = r * 0.299 + g * 0.587 + b * 0.114;
    if (light > brightest) { brightest = light; best = `rgb(${r}, ${g}, ${b})`; }
  }
  return best ?? '#f2d8bf';
}

/**
 * 모델의 얼굴 그림을 「고쳐 그릴 수 있는 그림」으로 바꿔 끼운다.
 *
 * @returns {{ setBlink(closed: number): void, setMouth(open: number): void } | null}
 *   못 찾으면 `null` — 얼굴이 안 움직일 뿐 나머지는 그대로 돈다.
 */
export async function paintableFace(model, options = {}) {
  const debug = options.debug === true;

  // 얼굴이 그려진 그림을 쓰는 재질들을 모은다. 이 모델은 몸 전체가 그림 한 장을
  // 나눠 쓰므로, 그 한 장만 갈아 끼우면 얼굴도 같이 갈린다.
  const maps = [];
  model.traverse((node) => {
    if (node.isMesh !== true && node.isSkinnedMesh !== true) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material?.map != null) maps.push(material);
    }
  });
  if (maps.length === 0) return null;

  // 모델을 다 읽었다고 **그림까지 다 온 건 아니다.** 그림은 따로 받아 오므로, 여기서
  // 안 기다리면 아직 빈 그림을 보고 「얼굴 없음」이라고 판정해 버린다(실측).
  const arrived = async (texture) => {
    for (let waited = 0; waited < 60; waited += 1) {
      if (texture.image?.width > 0) return true;
      await new Promise((next) => setTimeout(next, 50));
    }
    return false;
  };
  if (await arrived(maps[0].map) === false) return null;

  const source = maps[0].map.image;
  const users = maps.filter((material) => material.map.image === source);

  const board = document.createElement('canvas');
  board.width = source.width;
  board.height = source.height;
  const ink = board.getContext('2d', { willReadFrequently: true });
  ink.drawImage(source, 0, 0);

  // 덧칠에 쓸 색을 원본에서 뽑는다: 살색(칸 둘레)과 눈색(칸 한가운데).
  const skin = skinAround(ink, FACE.eyes[0]);
  const lash = pickColor(ink, FACE.eyes[0].x + 12, FACE.eyes[0].y + 20);
  const inside = pickColor(ink, FACE.mouth.x + 10, FACE.mouth.y + 10);

  // 원본 눈·입 칸을 따로 떠 둔다 — 되돌릴 때 다시 그리기 위해서.
  const saved = [...FACE.eyes, FACE.mouth].map((box) => ink.getImageData(box.x, box.y, box.w, box.h));

  // 원본 **텍스처**의 설정을 그대로 물려받는다. 특히 위아래 뒤집기 —
  // 이걸 빼먹으면 온몸의 색이 뒤바뀐다(머리가 옷 색을 뒤집어쓴다, 실측).
  const origin = maps[0].map;
  const texture = new THREE.CanvasTexture(board);
  texture.colorSpace = origin.colorSpace;
  texture.flipY = origin.flipY;
  texture.wrapS = origin.wrapS;
  texture.wrapT = origin.wrapT;
  texture.offset.copy(origin.offset);
  texture.repeat.copy(origin.repeat);
  for (const material of users) {
    material.map = texture;
    material.needsUpdate = true;
  }

  const restore = (index, box) => ink.putImageData(saved[index], box.x, box.y);

  if (debug) {
    // 자리가 맞는지 눈으로 보는 판. 형광색으로 칠해 화면에서 어디인지 찾는다.
    ink.fillStyle = '#00ff00';
    for (const box of FACE.eyes) ink.fillRect(box.x, box.y, box.w, box.h);
    ink.fillStyle = '#ff00ff';
    ink.fillRect(FACE.mouth.x, FACE.mouth.y, FACE.mouth.w, FACE.mouth.h);
    texture.needsUpdate = true;
    return { setBlink() {}, setMouth() {} };
  }

  let lastBlink = -1;
  let lastMouth = -1;

  return {
    /** 0 = 뜬 그대로, 1 = 완전히 감음. */
    setBlink(closed) {
      const step = Math.round(Math.max(0, Math.min(1, closed)) * 4) / 4; // 4단계면 충분하다
      if (step === lastBlink) return;
      lastBlink = step;
      FACE.eyes.forEach((box, index) => {
        restore(index, box);
        if (step > 0) {
          // 눈꺼풀이 내려온다 = 살색으로 덮어 내려온다. 덮는 방향은 **그림의 가로**다 —
          // 이 그림에서 얼굴이 누워 있어서, 화면의 위아래가 그림에서는 좌우다(실측:
          // 세로로 덮었더니 눈이 옆에서부터 지워졌다).
          const lid = Math.round(box.w * step);
          ink.fillStyle = skin;
          ink.fillRect(box.x + box.w - lid, box.y, lid, box.h);
          // 감긴 자리에는 속눈썹 한 줄이 남는다 — 이게 없으면 눈이 지워진 것처럼 보인다.
          if (step > 0.5) {
            ink.fillStyle = lash;
            ink.fillRect(box.x + box.w - lid, box.y + 2, 3, box.h - 4);
          }
        }
      });
      texture.needsUpdate = true;
    },
    /** 0 = 다문 그대로, 1 = 크게 벌림. */
    setMouth(open) {
      const step = Math.round(Math.max(0, Math.min(1, open)) * 3) / 3;
      if (step === lastMouth) return;
      lastMouth = step;
      const box = FACE.mouth;
      restore(FACE.eyes.length, box);
      if (step > 0) {
        const height = Math.round(box.h * 0.55 * step);
        ink.fillStyle = inside;
        ink.beginPath();
        ink.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w * 0.3, Math.max(1, height / 2), 0, 0, Math.PI * 2);
        ink.fill();
      }
      texture.needsUpdate = true;
    },
  };
}
