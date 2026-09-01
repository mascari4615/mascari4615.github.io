/**
 * 흥. 피아노롤 뷰 (TASK-KL-220 분리 2단).
 *
 * DOM 도 프로젝트 상태도 모른다. 무엇을 그릴지만 받아 문자열과 **화면이 알아야 할 수치**를
 * 돌려준다. 위젯 본체가 하던 상태 변이(`pianoPxPerBeat`, 클립이 바뀔 때의 스크롤 기준)는
 * 결과값으로 나가고, 그 값을 어디에 넣을지는 본체가 정한다.
 */

import { DRUM_PIECES, pitchInScale, type StudioClip, type StudioNote } from './model';

/** 화면 좌표 규칙. 뷰와 제스처가 같은 숫자를 봐야 해서 여기서 단일 출처로 낸다. */
export const PIANO_GEOMETRY = {
  /* C7 부터 C1 까지. 84-36 이던 시절엔 베이스 음을 마우스로 못 찍었다 */
  high: 96,
  low: 24,
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

/**
 * 새 클립을 열 때 세로 스크롤을 어디에 둘지. 가장 높은 음이 위쪽에 걸리게.
 *
 * 타악기 트랙은 예외. 한 벌이 36-49 사이라 넓힌 음역에서는 화면 밖.
 * 드럼이면 한 벌의 가운데로.
 */
export function initialScrollTop(clip: StudioClip, drum = false): number {
  if (drum) {
    const pieces = Object.keys(DRUM_PIECES).map(Number);
    const middle = (Math.min(...pieces) + Math.max(...pieces)) / 2;
    return Math.max(0, (PIANO_GEOMETRY.high - middle) * PIANO_GEOMETRY.row - 120);
  }
  const topPitch = clip.notes.length ? Math.max(...clip.notes.map((note) => note.pitch)) : 72;
  return Math.max(0, (PIANO_GEOMETRY.high - topPitch) * PIANO_GEOMETRY.row - 64);
}

export interface PianoViewInput {
  /** 자판 건반 모드가 켜져 있나. 도구 단축키와 겹쳐서 모드로 가른다. */
  step?: boolean;
  /** 타악기 트랙인가. 건반 이름이 음이름 대신 악기 이름이 된다. */
  drum?: boolean;
  /** 음계 표시. 밖의 줄은 어둡게 깔린다 */
  scale?: { root: number; id: string };
  /** 다른 클립의 음. 흐리게 겹쳐 보이기만 하고 만질 수 없다 */
  ghosts?: StudioNote[];
  /** MIDI 건반이 붙어 있나 + 무엇이 붙었는지. */
  midi?: boolean;
  midiLabel?: string;
  clip: StudioClip;
  beatsPerBar: number;
  expanded: boolean;
  pxPerBeat: number;
  viewportWidth: number;
  playheadBeat?: number;
  playing?: boolean;
  metronome?: boolean;
  listenMode?: 'clip' | 'song';
  loopStartBeat?: number;
  loopEndBeat?: number;
  rowHeight?: number;
  rangeStartBeat?: number | null;
  rangeEndBeat?: number | null;
  gridBeat?: number;
  manualScale?: boolean;
  overlapMode?: 'merge' | 'replace' | 'allow';
  /** 음이 지금 골라져 있나. 묶음이든 focus 든 본체가 판단한다. */
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
  const drum = input.drum === true;
  const { high, low, keyWidth, rulerHeight } = PIANO_GEOMETRY;
  const row = input.rowHeight ?? PIANO_GEOMETRY.row;
  const pianoPxPerBeat = input.manualScale ? Math.max(24, Math.min(260, input.pxPerBeat)) : pianoScale(clip, input.pxPerBeat, expanded, input.viewportWidth);
  const width = Math.max(640, clip.duration * pianoPxPerBeat);

  let keys = '';
  let offScale = '';
  const scale = input.scale && input.scale.id !== 'off' ? input.scale : undefined;
  for (let pitch = high; pitch >= low; pitch--) {
    const black = [1, 3, 6, 8, 10].includes(pitch % 12);
    /* 타악기 트랙은 음이름 대신 악기 이름. 한 벌에 없는 줄은 그대로 음이름 */
    const piece = drum ? DRUM_PIECES[pitch] : undefined;
    const label = piece ?? noteName(pitch);
    keys += `<button type="button" class="hu-key${black ? ' is-black' : ''}${piece ? ' is-piece' : ''}" data-key-pitch="${pitch}" aria-label="${label} 소리 듣기" style="top:${rulerHeight + (high - pitch) * row}px">${label}</button>`;
    /* 음계 밖 줄은 어둡게. 이론을 몰라도 틀린 음을 안 찍게 */
    if (scale && !pitchInScale(pitch, scale.root, scale.id)) {
      offScale += `<span class="hu-off-scale" style="top:${rulerHeight + (high - pitch) * row}px;height:${row}px"></span>`;
    }
  }

  let bars = '';
  for (let beat = 0; beat <= clip.duration; beat += beatsPerBar) {
    bars += `<span class="hu-piano-bar" style="left:${beat * pianoPxPerBeat}px">${beat / beatsPerBar + 1}</span>`;
  }

  const overlaps = new Set(clip.notes.filter((note,index)=>clip.notes.some((other,otherIndex)=>otherIndex!==index&&other.pitch===note.pitch&&other.beat<note.beat+note.duration&&note.beat<other.beat+other.duration)).map((note)=>note.id));
  /* 다른 클립의 음. 보이기만 하고 못 만진다. 겹쳐 보면서 찍으라고 */
  const ghostNotes = (input.ghosts ?? []).slice(0, 600).map((note) =>
    `<i class="hu-ghost-note" aria-hidden="true" style="left:${keyWidth + note.beat * pianoPxPerBeat}px;top:${rulerHeight + (high - note.pitch) * row}px;width:${Math.max(3, note.duration * pianoPxPerBeat)}px;height:${row - 2}px"></i>`).join('');
  const notes = clip.notes.map((note) => `<i class="hu-note${isSelected(note.id) ? ' is-selected' : ''}${note.muted ? ' is-muted' : ''}${overlaps.has(note.id) ? ' is-overlap' : ''}" title="${noteName(note.pitch)}, velocity ${Math.round(note.velocity * 127)}${note.muted?', 소리 꺼짐':''}${overlaps.has(note.id)?', 겹침':''}" data-note="${note.id}" style="left:${keyWidth + note.beat * pianoPxPerBeat}px;top:${rulerHeight + (high - note.pitch) * row + Math.max(1, Math.round((1 - note.velocity) * 5))}px;width:${note.duration * pianoPxPerBeat}px;height:${Math.round(7 + note.velocity * 7)}px;opacity:${0.5 + note.velocity * 0.5}"><b class="hu-note-handle" data-note-resize="1"></b></i>`).join('');

  const velocityBars = clip.notes.map((note) => `<i class="hu-vel${isSelected(note.id) ? ' is-selected' : ''}" data-vel="${note.id}" title="velocity ${Math.round(note.velocity * 127)}" style="left:${keyWidth + note.beat * pianoPxPerBeat}px;width:${Math.max(4, Math.min(10, note.duration * pianoPxPerBeat))}px;height:${Math.max(3, Math.round(note.velocity * 50))}px"></i>`).join('');

  const velocitySeed = (clip.notes.find((note) => isSelected(note.id)) || clip.notes[0])?.velocity ?? 0.8;
  const tools = `<div class="hu-piano-tools">
        <button class="btn btn-tool" data-note-act="quantize" title="선택한 음(없으면 전부)을 격자에 붙인다">QUANTIZE</button>
        <button class="btn btn-tool" data-note-act="quantize-half" title="격자까지 절반만 당긴다. 사람 느낌 보존">Q 50%</button>
        <button class="btn btn-tool" data-note-act="legato" title="앞 음의 끝을 다음 음 시작까지 늘린다">LEGATO</button>
        <button class="btn btn-tool${step ? ' is-on' : ''}" data-note-act="step" title="자판을 건반으로. Z~M 아랫줄, Q~I 윗줄. 켜면 도구 단축키는 쉰다">⌨ STEP</button>
        <button class="btn btn-tool${input.midi ? ' is-on' : ''}" data-note-act="midi" title="${esc(input.midiLabel || 'MIDI 건반 연결')}">🎹 MIDI</button>
        <button class="btn btn-tool" data-note-act="mute" title="고른 음의 소리를 끄거나 켠다">음 끄기</button><label>겹친 음 <select class="hu-number" data-overlap-mode><option value="merge"${input.overlapMode==='merge'?' selected':''}>합치기</option><option value="replace"${input.overlapMode==='replace'?' selected':''}>교체</option><option value="allow"${input.overlapMode==='allow'?' selected':''}>허용</option></select></label>
        ${expanded ? `<span class="hu-tool-separator"></span><button class="btn btn-tool" data-editor-edit="zoom-time-out" aria-label="시간 축소">시간 −</button><button class="btn btn-tool" data-editor-edit="zoom-time-in" aria-label="시간 확대">시간 +</button><button class="btn btn-tool" data-editor-edit="zoom-pitch-out" aria-label="음높이 행 축소">음높이 −</button><button class="btn btn-tool" data-editor-edit="zoom-pitch-in" aria-label="음높이 행 확대">음높이 +</button><button class="btn btn-tool" data-editor-edit="fit-clip">클립 전체</button><button class="btn btn-tool" data-editor-edit="fit-selection">선택 보기</button><span class="hu-grid-label">격자 ${input.gridBeat ?? 1}박, Alt=자유</span>` : ''}
        <span class="hu-spacer"></span>
        <button class="btn btn-tool" data-note-act="octave-down" title="한 옥타브 내림">−12</button>
        <button class="btn btn-tool" data-note-act="down" title="반음 내림">−1</button>
        <button class="btn btn-tool" data-note-act="up" title="반음 올림">+1</button>
        <button class="btn btn-tool" data-note-act="octave-up" title="한 옥타브 올림">+12</button>
        <label>VELOCITY <input class="hu-number" type="range" min="0.05" max="1" step="0.01" value="${velocitySeed}" data-note-velocity aria-label="선택한 음의 세기"></label>
      </div>`;

  const relativePlayhead = Math.max(0, Math.min(clip.duration, input.playheadBeat ?? 0));
  const activeWidth = clip.duration * pianoPxPerBeat;
  const listenMode = input.listenMode ?? 'clip';
  const loopStart = Math.max(0, Math.min(clip.duration, input.loopStartBeat ?? 0));
  const loopEnd = Math.max(loopStart, Math.min(clip.duration, input.loopEndBeat ?? clip.duration));
  const loopBrace = expanded ? `<div class="hu-editor-loop" data-editor-loop style="left:${keyWidth + loopStart * pianoPxPerBeat}px;width:${Math.max(2, (loopEnd - loopStart) * pianoPxPerBeat)}px" aria-label="클립 반복 구간"><button type="button" data-editor-loop-edge="start" aria-label="반복 시작점"></button><span>${Math.floor(loopStart / beatsPerBar) + 1}마디 → ${Math.floor(Math.max(loopStart, loopEnd - 0.001) / beatsPerBar) + 1}마디</span><button type="button" data-editor-loop-edge="end" aria-label="반복 끝점"></button></div>` : '';
  const rangeStart = input.rangeStartBeat ?? null;
  const rangeEnd = input.rangeEndBeat ?? null;
  const timeRange = expanded && rangeStart !== null && rangeEnd !== null && rangeEnd > rangeStart ? `<div class="hu-time-range" data-time-range style="left:${keyWidth + rangeStart * pianoPxPerBeat}px;width:${(rangeEnd - rangeStart) * pianoPxPerBeat}px"><span>${rangeStart.toFixed(2)} → ${rangeEnd.toFixed(2)}박</span></div>` : '';
  const rangeTools = expanded && rangeStart !== null && rangeEnd !== null ? `<div class="hu-range-tools" aria-label="시간 범위 편집"><button class="btn btn-tool" data-editor-edit="range-loop">범위 반복</button><button class="btn btn-tool" data-editor-edit="range-copy">범위 복사</button><button class="btn btn-tool" data-editor-edit="range-left">← 범위 이동</button><button class="btn btn-tool" data-editor-edit="range-right">범위 이동 →</button><button class="btn btn-tool" data-editor-edit="range-delete">음 삭제</button><button class="btn btn-tool" data-editor-edit="time-insert">시간 삽입</button><button class="btn btn-tool" data-editor-edit="time-delete">시간 당겨 삭제</button><button class="btn btn-tool" data-editor-edit="loop-half">루프 ½</button><button class="btn btn-tool" data-editor-edit="loop-double">루프 ×2</button><button class="btn btn-tool" data-editor-edit="loop-duplicate">루프 복제</button></div>` : '';
  const transport = expanded ? `<div class="hu-editor-transport" aria-label="피아노롤 재생"><button class="btn btn-tool${listenMode === 'clip' ? ' is-on' : ''}" data-editor-mode="clip">클립 듣기</button><button class="btn btn-tool${listenMode === 'song' ? ' is-on' : ''}" data-editor-mode="song">곡 전체</button><button class="btn btn-tool" data-editor-act="back" aria-label="클립 처음으로">|◀</button><button class="btn btn-tool${input.playing ? ' is-on' : ''}" data-editor-act="play" aria-label="재생 또는 일시정지">${input.playing ? 'Ⅱ' : '▶'}</button><button class="btn btn-tool" data-editor-act="stop" aria-label="정지하고 클립 처음으로">■</button><button class="btn btn-tool${input.metronome ? ' is-on' : ''}" data-editor-act="metronome">박자 소리</button><span data-piano-time>${Math.floor(relativePlayhead / beatsPerBar) + 1}마디</span></div>` : '';
  const html = `<div class="hu-editor-head"><strong>피아노롤, ${esc(clip.name)}</strong><span>${clip.duration / beatsPerBar}마디, 건반=듣기, 빈칸=음 찍기</span><span class="hu-spacer"></span>${transport}${drum ? '<button class="btn btn-tool" data-act="grid-on">격자로</button>' : ''}<button class="btn btn-tool" data-act="toggle-editor">${expanded ? '작게' : '크게 열기'}</button></div>${tools}${rangeTools}<div class="hu-piano" data-piano="1" style="--hu-piano-grid:${Math.max(4, (input.gridBeat ?? 1) * pianoPxPerBeat)}px;--hu-piano-row:${row}px"><div style="position:relative;width:${keyWidth + width}px;height:${rulerHeight + (high - low + 1) * row}px"><div class="hu-piano-ruler" data-piano-ruler style="width:${activeWidth}px">${bars}</div>${loopBrace}${timeRange}<div class="hu-after-end" style="left:${keyWidth + activeWidth}px;width:${Math.max(0, width - activeWidth)}px" aria-hidden="true"><span>클립 끝</span></div><i class="hu-clip-end" style="left:${keyWidth + activeWidth}px"></i>${offScale}${ghostNotes}${keys}${notes}<i class="hu-piano-playhead" data-piano-playhead style="left:${keyWidth + relativePlayhead * pianoPxPerBeat}px"></i><div class="hu-band" data-role="piano-band" hidden></div></div></div><div class="hu-velocity" data-velocity><div style="position:relative;width:${keyWidth + width}px;height:100%">${velocityBars}</div><div class="hu-velocity-scale">세기</div></div>`;

  return { html, pianoPxPerBeat };
}
