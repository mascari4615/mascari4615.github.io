/**
 * 글자 카드 — **공유될 그림 그대로**.
 *
 * 이 도구의 재미는 「재밌는 글자가 나오면 그걸 공유하는 것」이다(사용자, 2026-08-09).
 * 그러니 화면에 보이는 판과 남에게 나가는 그림이 **달라선 안 된다** — 화면의 무대가 곧 이 카드고,
 * 누르면 그 판이 그대로 1200×630 그림이 된다.
 *
 * 화풍 = 「여백의 판」(사용자 컨펌). 거의 빈 판에 글자만 거대하게, 아래 한 줄만 작게.
 * 남의 피드에서 튀는 건 정보가 아니라 여백이다 — 촘촘한 글 사이의 텅 빈 한 장이 그 자리다.
 *
 * 그림을 내보내는 길은 `brag-card.ts` 와 같은 순서다: 공유 창에 그림 얹기 → 안 되면 내려받기
 * → 그것도 막히면 글자만 복사. 없는 기능을 있는 척하지 않는다.
 */
const WIDTH = 1200;
const HEIGHT = 630;

export interface CardFacts {
  /** 큰 글씨 몸통 */
  text: string;
  /** 왼쪽 아래 — 방송 이름·주기 */
  channel: string;
  /** 오른쪽 아래 — 나온 시각 */
  stamp: string;
  /** 사건일 때만 (「진짜 단어다」) */
  mark?: string;
}

/** 글꼴이 **오기 전에** 그리면 폴백으로 찍힌다 — 그림은 되돌릴 수 없으므로 기다린다. */
async function readyFonts(): Promise<void> {
  try {
    const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    await Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
  } catch {
    /* 글꼴 없이 그린다 — 여기서 멈추면 공유 자체가 사라진다 */
  }
}

/**
 * 판 하나를 그린다. 화면의 무대와 이 그림은 **같은 함수**를 쓴다(`scale` 만 다르다) —
 * 두 벌로 나뉘면 언젠가 한쪽만 고쳐지고, 그때 「보던 것과 다른 게 나갔다」가 된다.
 */
export function paintCard(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  facts: CardFacts,
  ink: { bg: string; fg: string; dim: string; accent: string }
): void {
  c.fillStyle = ink.bg;
  c.fillRect(0, 0, w, h);

  const pad = Math.round(w * 0.055);
  const small = Math.max(11, Math.round(w * 0.018));

  /* 몸통 — 판에 꽉 차되 절대 넘치지 않게. 글자 수가 셋이든 넷이든 같은 무게로 보여야 하므로
     「글자 크기」가 아니라 **재 본 폭**으로 맞춘다(한글은 로마자보다 넓다). */
  const limit = w - pad * 4;
  let size = Math.round(h * 0.34);
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  for (let i = 0; i < 24; i++) {
    c.font = `600 ${size}px KarmoSerif, Georgia, serif`;
    if (c.measureText(facts.text).width <= limit) break;
    size = Math.round(size * 0.92);
  }
  const midY = h * (facts.mark ? 0.48 : 0.545);
  c.fillStyle = ink.fg;
  c.fillText(facts.text, w / 2, midY + size * 0.34);

  // 사건 표식 — 몸통 아래 한 줄. 이것 하나로 「그냥 지나간 것」과 「공유할 것」이 갈린다.
  if (facts.mark) {
    c.font = `600 ${Math.round(small * 1.5)}px KarmoSans, sans-serif`;
    c.fillStyle = ink.accent;
    c.fillText(`◆  ${facts.mark}`, w / 2, midY + size * 0.34 + small * 3.4);
  }

  // 아래 한 줄 — 어느 방송인지, 언제 것인지. 이게 없으면 나중에 아무도 모른다.
  c.font = `${small}px KarmoSans, sans-serif`;
  c.fillStyle = ink.dim;
  c.textAlign = 'left';
  c.fillText(facts.channel, pad, h - pad);
  c.textAlign = 'right';
  c.fillText(facts.stamp, w - pad, h - pad);
}

/**
 * 무대에 보이는 것을 그대로 큰 그림으로. **그리는 함수를 받아서** 쓴다 —
 * 화면과 그림이 같은 붓을 쓰게 하려는 것이다(두 벌로 나뉘면 언젠가 한쪽만 고쳐진다).
 */
export async function drawShareable(
  render: (c: CanvasRenderingContext2D, w: number, h: number) => void
): Promise<Blob | null> {
  await readyFonts();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const c = canvas.getContext('2d');
  if (!c) return null;
  render(c, WIDTH, HEIGHT);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/** 결과 = 사용자에게 그대로 보여 줄 한마디. 무슨 일이 일어났는지 숨기지 않는다. */
export async function shareCard(
  render: (c: CanvasRenderingContext2D, w: number, h: number) => void,
  facts: { text: string; channel: string }
): Promise<string> {
  const blob = await drawShareable(render);
  if (!blob) return '그림을 못 만들었어요';

  const file = new File([blob], `pulse-${facts.text}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: `${facts.text} — ${facts.channel}` });
      return '공유했어요';
    } catch (err) {
      /* 사용자가 창을 닫은 것도 여기로 온다 — 실패로 떠들지 않는다 */
      if ((err as Error)?.name === 'AbortError') return '';
    }
  }

  // 공유 창이 없으면 클립보드에 **그림 자체**를 얹는다 (붙여넣기 한 번이면 끝)
  try {
    const ClipItem = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (ClipItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipItem({ 'image/png': blob })]);
      return '그림을 클립보드에 담았어요';
    }
  } catch {
    /* 다음 수단으로 */
  }

  // 마지막 — 내려받기
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pulse-${facts.text}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return '그림으로 내려받았어요';
}
