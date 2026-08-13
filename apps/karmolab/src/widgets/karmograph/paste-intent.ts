/**
 * paste-intent.ts — **붙여넣으면 무슨 뜻인가** (TASK-KL-271 X5).
 *
 * 상관도는 얼굴이 있어야 상관도다. 그런데 얼굴을 넣으려면 카드를 고르고 → 패널을 열고 →
 * 「더 보기」를 펴고 → 🖼 를 눌러 → 파일 고르개에서 파일을 찾아야 했다. 다섯 걸음이다.
 * 사람이 실제로 하는 짓은 **어디선가 그림을 복사해서 붙여넣는 것** 하나다(Canva·PeoplePlotr 계보).
 *
 * 붙여넣기는 「어디에 붙는가」가 늘 애매해서, 그 판단만 여기 순수 함수로 뺀다 —
 * 화면에 섞이면 「글 칸에 치는 중인데 카드 얼굴이 바뀌는」 사고를 검사로 못 막는다.
 */

export type PasteIntent =
  /** 고른 카드의 얼굴로 붙인다. */
  | 'avatar'
  /** 그림은 왔는데 붙일 카드를 안 골랐다 — 「카드를 먼저 고르세요」. */
  | 'need-card'
  /** 우리가 상관할 일이 아니다(글을 치는 중이거나, 그림이 아니거나). */
  | 'ignore';

export interface PasteSituation {
  /** 붙여넣은 것에 그림이 들어 있나. */
  hasImage: boolean;
  /** 지금 고른 카드 id (없으면 null). */
  selectedId: string | null;
  /** 지금 글 칸(입력칸·여러 줄 칸·고쳐 쓰는 자리)에 커서가 있나. */
  typing: boolean;
  /** 이 위젯이 화면에 살아 있나 — 다른 도구를 보는 중이면 남의 붙여넣기다. */
  visible: boolean;
}

/**
 * ★ **글을 치는 중이면 절대 안 가로챈다.** 이름이나 설명에 글을 붙여넣는 일이 훨씬 잦고,
 *   그때 카드 얼굴이 바뀌면 「내가 뭘 눌렀지」가 된다. 되돌릴 수 있어도 놀라는 것이 먼저다.
 */
export function pasteIntent(s: PasteSituation): PasteIntent {
  if (!s.visible || s.typing || !s.hasImage) return 'ignore';
  return s.selectedId ? 'avatar' : 'need-card';
}
