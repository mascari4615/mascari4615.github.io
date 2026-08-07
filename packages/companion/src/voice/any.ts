import { splitTone } from './feeling-tone';
import type { Speech, SpeechVoice } from './edge-tts';

/**
 * 여러 목소리 엔진을 한 목록으로 묶는다.
 *
 * 내 컴퓨터에서 도는 것과 인터넷 건너편 것은 성격이 다르다 — 하나는 끊겨도 되고,
 * 하나는 더 자연스럽다. 어느 쪽이 취향인지는 써 보고 정하는 것이므로, 코드가 하나를
 * 고르지 않고 **한 자리에 다 늘어놓는다**.
 *
 * 소리 형식이 엔진마다 다르므로(wav/mp3), 고른 목소리에 맞는 형식을 같이 알려준다.
 */
export function anySpeech(engines: readonly { label: string; speech: Speech }[]): Speech & {
  contentTypeFor(voiceId?: string): string;
} {
  // 어느 목소리가 어느 엔진 것인지 — 화면은 이름 하나만 돌려주므로 여기서 되짚는다.
  const owner = new Map<string, Speech>();
  let cached: SpeechVoice[] | null = null;

  async function roster(): Promise<SpeechVoice[]> {
    if (cached !== null) return cached;
    const all: SpeechVoice[] = [];
    for (const { label, speech } of engines) {
      let list: readonly SpeechVoice[] = [];
      try {
        list = await speech.voices();
      } catch {
        continue; // 한 엔진이 죽어도 나머지는 고를 수 있어야 한다
      }
      for (const voice of list) {
        const id = `${label}:${voice.id}`;
        owner.set(id, speech);
        all.push({ id, label: `${voice.label}`, gender: `${label} · ${voice.gender}` });
      }
    }
    cached = all;
    return all;
  }

  function split(voiceId?: string): { speech: Speech; inner?: string } | null {
    if (voiceId === undefined || voiceId === '') {
      const first = engines[0];
      return first === undefined ? null : { speech: first.speech };
    }
    // 결(`@들뜸`)은 어느 엔진 것인지와 무관하다 — 떼고 찾아서, 안쪽에 다시 붙여 준다.
    const { name, tone } = splitTone(voiceId);
    const speech = owner.get(name);
    if (speech === undefined) return null;
    const inner = name.slice(name.indexOf(':') + 1);
    return { speech, inner: tone === null ? inner : `${inner}@${tone}` };
  }

  return {
    name: engines.map((e) => e.label).join(' + '),
    contentType: engines[0]?.speech.contentType ?? 'audio/mpeg',

    contentTypeFor(voiceId?: string): string {
      return split(voiceId)?.speech.contentType ?? 'audio/mpeg';
    },

    voices(): Promise<readonly SpeechVoice[]> {
      return roster();
    },

    async synthesize(text: string, voiceId?: string): Promise<Buffer> {
      await roster(); // 목록을 한 번은 읽어야 어느 엔진 것인지 안다
      const found = split(voiceId);
      if (found === null) throw new Error('그런 목소리는 없다');
      return found.speech.synthesize(text, found.inner);
    },
  };
}
