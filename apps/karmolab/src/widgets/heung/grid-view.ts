/**
 * 흥. 타악기 격자 뷰.
 *
 * 피아노롤은 음높이와 길이를 정하라고 요구한다. 드럼에는 둘 다 필요 없다. 실사용 시험에서
 * 기본 리듬 한 마디가 12클릭이었고 그때마다 줄을 찾아 굴려야 했다. 여기서는 칸만 켬.
 * DOM 도 프로젝트 상태도 모름. 무엇을 그릴지 받아 문자열만 반환.
 */
import { DRUM_PIECES, stepNoteAt, type StudioClip } from './model';

export const GRID_GEOMETRY = { row: 30, label: 96, cell: 34, gap: 3 } as const;

export interface GridViewInput {
  clip: StudioClip;
  step: number;
  beatsPerBar: number;
  playheadBeat?: number;
  esc: (value: unknown) => string;
}

/** 격자에 그릴 줄 목록. 한 벌을 낮은 소리부터 위로 */
export function gridRows(): { pitch: number; name: string }[] {
  return Object.keys(DRUM_PIECES)
    .map(Number)
    .sort((left, right) => right - left)
    .map((pitch) => ({ pitch, name: DRUM_PIECES[pitch] }));
}

/** 칸 개수. 클립 길이를 격자 간격으로 나눈 것 */
export function gridSteps(clip: StudioClip, step: number): number {
  return Math.max(1, Math.min(256, Math.round(clip.duration / step)));
}

export function buildGridView(input: GridViewInput): string {
  const { clip, step, beatsPerBar, esc } = input;
  const steps = gridSteps(clip, step);
  const rows = gridRows();
  const head = Array.from({ length: steps }, (unused, index) => {
    const beat = index * step;
    const strong = Math.abs(beat % beatsPerBar) < 1e-6;
    return `<span class="hu-grid-tick${strong ? ' is-strong' : ''}">${strong ? Math.floor(beat / beatsPerBar) + 1 : ''}</span>`;
  }).join('');
  const body = rows.map((row) => {
    const cells = Array.from({ length: steps }, (unused, index) => {
      const beat = index * step;
      const on = stepNoteAt(clip.notes, row.pitch, beat, step);
      const strong = Math.abs(beat % beatsPerBar) < 1e-6;
      /* 세기는 칸 밝기로. 위아래로 끌면 바뀐다 */
      const level = on ? Math.max(0.15, Math.min(1, on.velocity)) : 0;
      const style = on ? ` style="--hu-grid-level:${level.toFixed(2)}"` : '';
      const reading = on ? `, 세기 ${Math.round(on.velocity * 127)}` : '';
      return `<button type="button" class="hu-grid-cell${on ? ' is-on' : ''}${strong ? ' is-strong' : ''}" data-grid-pitch="${row.pitch}" data-grid-beat="${beat}"${style} aria-pressed="${on ? 'true' : 'false'}" aria-label="${esc(row.name)} ${Math.floor(beat / beatsPerBar) + 1}마디 ${(beat % beatsPerBar) + 1}박${reading}"></button>`;
    }).join('');
    return `<div class="hu-grid-row"><span class="hu-grid-name">${esc(row.name)}</span>${cells}</div>`;
  }).join('');
  return `<div class="hu-grid" data-grid style="--hu-grid-cell:${GRID_GEOMETRY.cell}px"><div class="hu-grid-row hu-grid-head"><span class="hu-grid-name"></span>${head}</div>${body}</div>`;
}
