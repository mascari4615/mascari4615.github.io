/**
 * 흥 — MIDI 건반 입력 (TASK-KL-220).
 *
 * 브라우저 Web MIDI 는 기기·권한이 있어야 돌아가서 자동 검사가 못 닿는다.
 * 그래서 **바이트 해석만 순수 함수로 떼어** 단위 테스트로 닫고, 나머지(권한·연결)는 얇게 둔다.
 */

export type MidiEventKind = 'on' | 'off' | 'other';

export interface MidiEvent {
  kind: MidiEventKind;
  pitch: number;
  /** 0~1. note-off 는 0. */
  velocity: number;
  channel: number;
}

/**
 * 한 메시지를 읽는다. 상태 바이트가 없거나 길이가 모자라면 `other`.
 * **세기 0 인 note-on 은 note-off** 다 — 많은 건반이 그렇게 보낸다(안 걸러 내면 음이 안 끊긴다).
 */
export function parseMidiMessage(data: ArrayLike<number> | null | undefined): MidiEvent {
  const none: MidiEvent = { kind: 'other', pitch: -1, velocity: 0, channel: 0 };
  if (!data || data.length < 3) return none;
  const status = data[0];
  if (typeof status !== 'number') return none;
  const type = status & 0xf0;
  const channel = status & 0x0f;
  const pitch = data[1] & 0x7f;
  const raw = data[2] & 0x7f;
  if (type === 0x90) {
    return raw > 0
      ? { kind: 'on', pitch, velocity: raw / 127, channel }
      : { kind: 'off', pitch, velocity: 0, channel };
  }
  if (type === 0x80) return { kind: 'off', pitch, velocity: 0, channel };
  return { ...none, channel };
}

/** 화면에 쓸 장치 목록 요약 — 이름이 없는 기기도 자리를 잃지 않는다. */
export function describeInputs(names: (string | null | undefined)[]): string {
  const clean = names.map((name, index) => (String(name ?? '').trim() || `건반 ${index + 1}`));
  if (!clean.length) return '연결된 건반 없음';
  if (clean.length === 1) return clean[0];
  return `${clean[0]} 외 ${clean.length - 1}대`;
}
