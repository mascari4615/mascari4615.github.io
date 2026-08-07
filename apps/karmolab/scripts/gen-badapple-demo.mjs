/**
 * 기본 클립을 만든다 (TASK-KL-131).
 *
 * 남의 영상을 저장소에 담지 않는다. 그래서 기본으로 보여 줄 것은 **우리가 그린 도형**이다.
 * 아무것도 안 구운 사람도 이게 뭔지 바로 알 수 있을 만큼만: 파도치는 실루엣 위로 원 하나가
 * 지나간다 — 실루엣 영상이 어떤 모양인지 보여 주는 게 목적이다.
 *
 * 구운 것이 있으면 홈은 그쪽을 먼저 쓴다. 이건 어디까지나 처음 보는 사람용 자리채움이다.
 */
import { encode } from 'badapple';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/badapple/demo.bab');
const WIDTH = 64;
const HEIGHT = 48;
const FPS = 15;
const SECONDS = 6;

const frames = [];
for (let f = 0; f < FPS * SECONDS; f++) {
  const t = f / (FPS * SECONDS);
  const cells = new Uint8Array(WIDTH * HEIGHT);

  // 아래쪽 파도 — 두 파장을 겹쳐 단조롭지 않게.
  for (let x = 0; x < WIDTH; x++) {
    const wave =
      Math.sin((x / WIDTH) * Math.PI * 2 + t * Math.PI * 2) * 5 +
      Math.sin((x / WIDTH) * Math.PI * 6 - t * Math.PI * 4) * 2.5;
    const top = Math.round(HEIGHT * 0.62 + wave);
    for (let y = Math.max(0, top); y < HEIGHT; y++) cells[y * WIDTH + x] = 1;
  }

  // 가로지르는 원 — 파도 위를 스쳐 지나간다.
  const cx = -8 + (WIDTH + 16) * t;
  const cy = HEIGHT * 0.3 + Math.sin(t * Math.PI * 4) * 6;
  const radius = 7;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) cells[y * WIDTH + x] = 1;
    }
  }

  frames.push(cells);
}

const bytes = encode(frames, { width: WIDTH, height: HEIGHT, fps: FPS });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, bytes);
console.log(`기본 클립: ${frames.length}장 · ${(bytes.length / 1024).toFixed(1)}KB → ${path.relative(process.cwd(), OUT)}`);
