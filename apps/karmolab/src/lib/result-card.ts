/**
 * 결과 카드 (TASK-KL-151 ②) — 한 판의 결과를 **그림 한 장**으로.
 *
 * 왜 있나: 놀이 결과를 「글」로만 복사하면 아무도 안 붙여넣는다. 사람이 자랑하는 자리는
 * 대부분 그림이 먼저 보이는 곳이다(디스코드·카톡·트위터). Wordle 이 퍼진 이유도 놀이가
 * 대단해서가 아니라 **결과가 한 덩어리로 붙여넣어졌기** 때문이다.
 *
 * 왜 canvas 인가: 라이브러리를 안 들인다(이 사이트는 도구 129개가 전부 자기 힘으로 돈다).
 * 글자·네모·그림 몇 개면 되는 일에 200KB 를 받아 오지 않는다.
 *
 * 그림(우승자 얼굴 등)은 **남의 서버 것**일 수 있다. 그러면 canvas 가 오염되어 그림으로 뽑는
 * 순간 막힌다 — 그래서 그림은 「되면 얹고, 안 되면 없이」 간다(자랑이 통째로 막히는 것보다 낫다).
 */
import { t, loadNamespace } from './i18n';

/* 위젯이 아니라 셸·라이브러리 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 읽으므로 document 가 있을 때만. */
if (typeof document !== 'undefined') void loadNamespace('resultcard');
export interface ResultCard {
  /** 위에 작게 — 어느 놀이인가. */
  kicker: string;
  /** 큰 글씨 한 줄 — 결과 그 자체. */
  headline: string;
  /** 아래 한 줄씩 — 순위·기록 같은 것. 최대 3줄. */
  lines?: string[];
  /** 얹을 그림 주소(우승자 얼굴 등). 못 받으면 그냥 없이 그린다. */
  imageUrl?: string;
}

const WIDTH = 800;
const HEIGHT = 418; /* 1.91:1 — 대부분의 미리보기가 이 비율로 자른다 */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 남의 서버 그림은 못 받을 수 있다 — 못 받으면 null 이고, 카드는 글자만으로 선다. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 이게 없으면 그린 뒤 **뽑는 순간** 막힌다
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(null), 4000);
  });
}

/** 지금 테마의 색을 그대로 쓴다 — 카드만 딴 사이트처럼 보이면 그게 더 이상하다. */
function themeColor(name: string, fallback: string): string {
  const got = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return got || fallback;
}

export async function drawResultCard(card: ResultCard): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;

  const bg = themeColor('--bg-primary', '#14121c');
  const fg = themeColor('--text-primary', '#f4f1ff');
  const dim = themeColor('--text-tertiary', '#9b93b5');
  const accent = themeColor('--accent', '#b39ddb');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  roundRect(ctx, 10, 10, WIDTH - 20, HEIGHT - 20, 18);
  ctx.stroke();

  const image = card.imageUrl ? await loadImage(card.imageUrl) : null;
  const textLeft = image ? 300 : 56;

  if (image) {
    // 그림은 잘라서 정사각으로 — 세로로 긴 그림이 카드를 통째로 밀어내지 않게.
    const box = 210;
    const side = Math.min(image.width, image.height);
    ctx.save();
    roundRect(ctx, 56, (HEIGHT - box) / 2, box, box, 14);
    ctx.clip();
    ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 56, (HEIGHT - box) / 2, box, box);
    ctx.restore();
  }

  ctx.textBaseline = 'top';
  ctx.fillStyle = dim;
  ctx.font = '600 22px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(card.kicker, textLeft, 84);

  ctx.fillStyle = fg;
  ctx.font = '800 46px system-ui, -apple-system, "Segoe UI", sans-serif';
  // 긴 이름은 잘라서 한 줄로 — 두 줄이 되면 아래 줄들을 밀어낸다.
  let headline = card.headline;
  while (ctx.measureText(headline).width > WIDTH - textLeft - 56 && headline.length > 4) {
    headline = headline.slice(0, -2) + '…';
  }
  ctx.fillText(headline, textLeft, 124);

  ctx.font = '500 24px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = dim;
  (card.lines ?? []).slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, textLeft, 196 + i * 36);
  });

  ctx.fillStyle = accent;
  ctx.font = '700 20px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText('KarmoLab · blog.mascari4615.com/karmolab', textLeft, HEIGHT - 76);

  return canvas;
}

/**
 * 카드를 클립보드에 그림으로 넣는다. 못 넣으면 **파일로 내려받는다** —
 * 「복사됐습니다」라고 해 놓고 아무것도 안 붙는 것이 제일 나쁘다.
 *
 * @returns 사람에게 보여 줄 한 줄.
 */
export async function copyResultCard(card: ResultCard, fileName = 'karmolab.png'): Promise<string> {
  const canvas = await drawResultCard(card);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return t('resultcard.t01');

  try {
    // 사파리는 사용자 동작 안에서만 허용한다 — 그래서 부르는 쪽은 클릭 처리 안에서 부른다.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return t('resultcard.t02');
  } catch {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return t('resultcard.t03');
  }
}
