/** KL-246의 첫 사용, 건반 audition, 모바일 편집 계약이 소스에서 사라지지 않는지 빠르게 막는다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const shell = read('src/widgets/heung/shell.ts');
const studio = read('src/widgets/heung/heung.ts');
const piano = read('src/widgets/heung/piano-view.ts');
const styles = read('src/widgets/heung/styles.ts');
const model = read('src/widgets/heung/model.ts');
const audio = read('src/widgets/heung/audio-engine.ts');
const midiFile = read('src/widgets/heung/midi-file.ts');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(shell.includes('샘플은 연습용'), '첫 화면이 샘플의 정체를 설명하지 않는다');
expect(shell.includes('프로젝트 받기') && shell.includes('WAV로 완성하기'), '저장과 완성의 이름이 다시 모호해졌다');
expect(!/[①②③]/.test(shell), '기기에서 깨지는 원문자 번호가 돌아왔다');
expect(piano.includes('data-key-pitch="${pitch}"'), '피아노 건반 pitch 계약이 없다');
expect(piano.includes('aria-label="${noteName(pitch)} 소리 듣기"'), '건반의 접근 가능한 이름이 없다');
expect(studio.includes("closest<HTMLElement>('[data-key-pitch]')"), '건반 전용 audition 경로가 없다');
expect(studio.includes('void engine.preview(track,pitch)'), '건반이 악기 미리듣기로 이어지지 않는다');
expect(styles.includes('.hu-lane,.hu-clip,.hu-handle,.hu-note,.hu-note-handle,[data-piano]'), '편집 표면 touch-action 계약이 없다');
expect(styles.includes('touch-action:none'), '편집 제스처가 페이지 스크롤과 다시 충돌한다');
expect(styles.includes('.hu-toolbar{flex-wrap:nowrap;overflow-x:auto'), '모바일 도구줄이 다시 여러 줄로 쌓인다');
expect(styles.includes('.hu-note-handle,.hu-handle{width:16px}'), '모바일 길이 손잡이가 다시 8px로 줄었다');
expect(piano.includes('data-editor-act="play"') && piano.includes('data-editor-act="stop"'), '큰 피아노롤 transport가 없다');
expect(piano.includes('data-piano-playhead') && studio.includes('pianoHead.style.left'), '피아노롤 재생 위치선 계약이 없다');
expect(piano.includes('hu-after-end') && piano.includes('hu-clip-end'), '클립 끝과 비활성 영역 표시가 없다');
expect(studio.includes("closest<HTMLElement>('[data-piano-ruler]')"), '피아노롤 ruler seek가 없다');
expect(piano.includes('data-editor-loop-edge="start"') && piano.includes('data-editor-loop-edge="end"'), '조절 가능한 클립 반복 구간이 없다');
expect(piano.includes('data-editor-mode="clip"') && piano.includes('data-editor-mode="song"'), '클립/곡 전체 듣기 전환이 없다');
expect(studio.includes("editorListenMode==='clip'") && studio.includes('playEditor(clip)'), '클립 반복 듣기가 재생 엔진에 연결되지 않았다');
expect(studio.includes('현재 위치 유지') && studio.includes('playhead=clip.start'), '일시정지와 정지의 의미가 구분되지 않았다');
expect(studio.includes('void engine.preview(track,note.pitch,note.velocity)'), '음표 선택/편집 audition이 없다');
expect(piano.includes('zoom-time-in') && piano.includes('zoom-pitch-in') && piano.includes('fit-selection'), '시간/음높이 확대와 맞춤 보기가 없다');
expect(piano.includes('data-time-range') && piano.includes('range-copy') && piano.includes('range-right'), '시간 범위 선택, 복사, 이동 도구가 없다');
expect(piano.includes('time-insert') && piano.includes('time-delete'), '시간 삽입/당겨 삭제가 없다');
expect(piano.includes('loop-half') && piano.includes('loop-double') && piano.includes('loop-duplicate'), '루프 절반/두 배/복제가 없다');
expect(studio.includes('moveEvent.altKey?raw:snapBeat') && studio.includes('event.altKey?rawBeat:snapBeat'), 'Alt 임시 snap 해제가 없다');
expect(piano.includes('--hu-piano-grid') && piano.includes('격자 ${input.gridBeat'), '적응형 grid와 현재 격자 표시가 없다');
expect(studio.includes('lastNoteDuration=anchor.note.duration') && studio.includes('Math.min(lastNoteDuration'), '마지막 음표 길이 기억이 없다');
expect(piano.includes('data-overlap-mode') && piano.includes('is-overlap'), '겹친 음 정책/표시가 없다');
expect(model.includes('muted?: boolean') && audio.includes('note.muted===true') && piano.includes('is-muted'), '음표 mute가 모델, 엔진, 화면을 관통하지 않는다');
expect(studio.includes('MIDI NOTES, ${chosenNotes.length}개 (차이 적용)') || studio.includes('MIDI NOTE${chosenNotes.length>1'), '다중 음표 inspector가 없다');
expect(studio.includes("event.key==='Home'||event.key==='End'") && studio.includes("event.key==='Enter'"), '음표 키보드 이동/audition이 없다');
expect(styles.includes('.hu-drag-feedback') && studio.includes('feedback.textContent='), 'drag 수치 feedback이 없다');
expect(studio.includes('if(gestures.cancel())return'), 'Escape가 편집 preview만 취소하지 않는다');
expect(studio.includes('overlapCycle.index') && studio.includes('겹친 음 ${overlapCycle.index+1}'), '겹친 음 선택 순환이 없다');
expect(midiFile.includes('encodeMidi') && midiFile.includes('decodeMidi') && shell.includes('MIDI 가져오기') && shell.includes('MIDI 내보내기'), '표준 MIDI 왕복 경로가 없다');

if (failures.length) {
  console.error(`[test-heung-ux-contract] ✗\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('[test-heung-ux-contract] ✓ 첫 사용, 건반 audition, 모바일 편집, 큰 창 transport/정밀 편집/MIDI 계약 35개');
