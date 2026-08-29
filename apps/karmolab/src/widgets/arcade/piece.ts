/**
 * 판 위 말 한 벌. 쇼기, 윷, 여우사냥개, 체커가 함께 쓰는 표현 부품.
 *
 * 규칙은 숫자와 자리만 안다. 이 파일은 그 값을 나무패, 말뚝, 원반 중 하나로 보일 뿐이며,
 * 어느 판의 이동 규칙도 알지 않는다. 같은 자리 색은 어느 모양을 골라도 같은 사람을 뜻한다.
 */

export type PieceShape = 'tile' | 'pawn' | 'disc';

export interface PieceOpts {
  shape: PieceShape;
  owner: number;
  /** 패 위 한 글자나 말 번호. 빈 말도 허용한다. */
  mark?: string;
  /** 작은 보관함, 범례에 넣을 때. */
  compact?: boolean;
  /** 상대편을 향한 나무패. */
  flipped?: boolean;
  /** 왕, 특별 말의 한 겹 더 높은 표현. */
  king?: boolean;
  /** 읽는 기계가 보는 이름. 없으면 장식으로 숨긴다. */
  label?: string;
}

const esc = (s: string): string => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export function pieceMarkup(o: PieceOpts): string {
  const owner = Number.isInteger(o.owner) ? Math.max(0, Math.min(3, o.owner)) : 0;
  const cls = [
    'ac-piece',
    'ac-piece-' + o.shape,
    'ac-piece-owner' + owner,
    o.compact ? 'ac-piece-compact' : '',
    o.flipped ? 'ac-piece-flip' : '',
    o.king ? 'ac-piece-king' : ''
  ].filter(Boolean).join(' ');
  const a11y = o.label
    ? ' role="img" aria-label="' + esc(o.label) + '"'
    : ' aria-hidden="true"';
  return '<i class="' + cls + '"' + a11y + '><span>' + esc(o.mark ?? '') + '</span></i>';
}
