/**
 * Karmo Studio — 피아노롤 뷰 (TASK-KL-220 분리 2단).
 *
 * DOM 도 프로젝트 상태도 모른다. 「무엇을 그릴지」만 받아 문자열과 **화면이 알아야 할 수치**를
 * 돌려준다. 위젯 본체가 하던 상태 변이(`pianoPxPerBeat`·클립이 바뀔 때의 스크롤 기준)는
 * 결과값으로 나가고, 그 값을 어디에 넣을지는 본체가 정한다.
 */

import type { StudioClip } from './model';

/** 화면 좌표 규칙 — 뷰와 제스처가 같은 숫자를 봐야 해서 여기서 단일 출처로 낸다. */
export const PIANO_GEOMETRY = {
  high: 84,
  low: 36,
  row: 16,
  keyWidth: 68,
  rulerHeight: 24
} as const;

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function noteName(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

/** 접힌 상태는 타임라인 배율 그대로. 크게 열면 짧은 클립을 화면 폭에 맞춰 늘린다. */
export function pianoScale(clip: StudioClip, pxPerBeat: number, expanded: boolean, viewportWidth: number): number {
  if (!expanded) return pxPerBeat;
  return Math.max(pxPerBeat, Math.min(160, (viewportWidth - 180) / Math.max(clip.duration, 8)));
}

/** 새 클립을 열 때 세로 스크롤을 어디에 둘지 — 가장 높은 음이 위쪽에 걸리게. */
export function initialScrollTop(clip: StudioClip): number {
  const topPitch = clip.notes.length ? Math.max(...clip.notes.map((note) => note.pitch)) : 72;
  return Math.max(0, (PIANO_GEOMETRY.high - topPitch) * PIANO_GEOMETRY.row - 64);
}

export interface PianoViewInput {
  /** 자판 건반 모드가 켜져 있나 — 도구 단축키와 겹쳐서 모드로 가른다. */
  step?: boolean;
  /** MIDI 건반이 붙어 있나 + 무엇이 붙었는지. */
  midi?: boolean;
  midiLabel?: string;
  clip: StudioClip;
  beatsPerBar: number;
  expanded: boolean;
  pxPerBeat: number;
  viewportWidth: number;
  /** 음이 지금 골라져 있나 — 묶음이든 focus 든 본체가 판단한다. */
  isSelected: (noteId: string) => boolean;
  esc: (value: unknown) => string;
}

export interface PianoView {
  html: string;
  /** 본체가 제스처 계산에 쓰는 배율. 뷰가 정하고 본체가 받아 둔다. */
  pianoPxPerBeat: number;
}

export function buildPianoView(input: PianoViewInput): PianoView {
  const { clip, beatsPerBar, expanded, isSelected, esc } = input;
  const step = input.step === true;
  const { high, low, row, keyWidth, rulerHeight } = PIANO_GEOMETRY;
  const pianoPxPerBeat = pianoScale(clip, input.pxPerBeat, expanded, input.viewportWidth);
  const width = Math.max(640, clip.duration * pianoPxPerBeat);

  let keys = '';
  for (let pitch = high; pitch >= low; pitch--) {
    const black = [1, 3, 6, 8, 10].includes(pitch % 12);
    keys += `<span class="ks-key${black ? ' is-black' : ''}" style="top:${rulerHeight + (high - pitch) * row}px">${noteName(pitch)}</span>`;
  }

  let bars = '';
  for (let beat = 0; beat <= clip.duration; beat += beatsPerBar) {
    bars += `<span class="ks-piano-bar" style="left:${beat * pianoPxPerBeat}px">${beat / beatsPerBar + 1}</span>`;
  }

  const notes = clip.notes.map((note) => `<i class="ks-note${isSelected(note.id) ? ' is-selected' : ''}" title="${noteName(note.pitch)} · velocity ${Math.round(note.velocity * 127)}" data-note="${note.id}" style="left:${keyWidth + note.beat * pianoPxPerBeat}px;top:${rulerHeight + (high - note.pitch) * row + Math.max(1, Math.round((1 - note.velocity) * 5))}px;width:${note.duration * pianoPxPerBeat}px;height:${Math.round(7 + note.velocity * 7)}px;opacity:${0.5 + note.velocity * 0.5}"><b class="ks-note-handle" data-note-resize="1"></b></i>`).join('');

  const velocityBars = clip.notes.map((note) => `<i class="ks-vel${isSelected(note.id) ? ' is-selected' : ''}" data-vel="${note.id}" title="velocity ${Math.round(note.velocity * 127)}" style="left:${keyWidth + note.beat * pianoPxPerBeat}px;width:${Math.max(4, Math.min(10, note.duration * pianoPxPerBeat))}px;height:${Math.max(3, Math.round(note.velocity * 50))}px"></i>`).join('');

  const velocitySeed = (clip.notes.find((note) => isSelected(note.id)) || clip.notes[0])?.velocity ?? 0.8;
  const tools = `<div class="ks-piano-tools">
        <button class="ks-btn" data-note-act="quantize" title="선택한 음(없으면 전부)을 격자에 붙인다">QUANTIZE</button>
        <button class="ks-btn" data-note-act="quantize-half" title="격자까지 절반만 당긴다 — 사람 느낌 보존">Q 50%</button>
        <button class="ks-btn" data-note-act="legato" title="앞 음의 끝을 다음 음 시작까지 늘린다">LEGATO</button>
        <button class="ks-btn${step ? ' is-on' : ''}" data-note-act="step" title="자판을 건반으로 — Z~M 아랫줄, Q~I 윗줄. 켜면 도구 단축키는 쉰다">⌨ STEP</button>
        <button class="ks-btn${input.midi ? ' is-on' : ''}" data-note-act="midi" title="${esc(input.midiLabel || 'MIDI 건반 연결')}">🎹 MIDI</button>
        <span class="ks-spacer"></span>
        <button class="ks-btn" data-note-act="octave-down" title="한 옥타브 내림">−12</button>
        <button class="ks-btn" data-note-act="down" title="반음 내림">−1</button>
        <button class="ks-btn" data-note-act="up" title="반음 올림">+1</button>
        <button class="ks-btn" data-note-act="octave-up" title="한 옥타브 올림">+12</button>
        <label>VELOCITY <input class="ks-number" type="range" min="0.05" max="1" step="0.01" value="${velocitySeed}" data-note-velocity aria-label="선택한 음의 세기"></label>
      </div>`;

  const html = `<div class="ks-editor-head"><strong>PIANO ROLL · ${esc(clip.name)}</strong><span>세로=음높이 · 가로=시간 · 밝기=세기</span><span class="ks-spacer"></span><span>DRAW: 빈 칸 좌클릭으로 음 추가 · SELECT(E): 빈 칸 드래그로 여러 음 묶기 · Shift/Ctrl 클릭으로 더하기·빼기 · 드래그: 묶음 이동 · Delete: 묶음 삭제 · Ctrl+B: 묶음 복제</span><button class="ks-btn" data-act="toggle-editor">${expanded ? '작게' : '크게 열기'}</button></div>${tools}<div class="ks-piano" data-piano="1"><div style="position:relative;width:${keyWidth + width}px;height:${rulerHeight + (high - low + 1) * row}px"><div class="ks-piano-ruler" style="width:${width}px">${bars}</div>${keys}${notes}<div class="ks-band" data-role="piano-band" hidden></div></div></div><div class="ks-velocity" data-velocity><div style="position:relative;width:${keyWidth + width}px;height:100%">${velocityBars}</div><div class="ks-velocity-scale">VEL</div></div>`;

  return { html, pianoPxPerBeat };
}
