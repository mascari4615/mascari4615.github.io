import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

/** 목소리 하나. */
export interface SpeechVoice {
  id: string;
  label: string;
  gender: string;
}

/** 글을 소리로 바꾸는 자리. 다른 엔진을 쓰려면 이것만 새로 구현하면 된다. */
export interface Speech {
  readonly name: string;
  voices(): Promise<readonly SpeechVoice[]>;
  synthesize(text: string, voiceId?: string): Promise<Buffer>;
}

export interface EdgeSpeechOptions {
  /** 기본 목소리. 창에서 고른 게 있으면 그게 이긴다. */
  defaultVoice?: string;
  /** 말 빠르기. `+0%` 가 보통, `-10%` 면 느긋해진다. */
  rate?: string;
  pitch?: string;
  locale?: string;
}

/**
 * 엣지 뉴럴 음성 — 키도 계정도 없이 쓰는 자연스러운 목소리.
 *
 * 이 컴퓨터에 깔린 한국어 목소리는 옛날 방식 하나뿐이라 로봇처럼 들린다. 그래서 소리는
 * 서버에서 만들어 내려보내고, 그게 안 되면 브라우저 내장 목소리로 물러선다 — 인터넷이
 * 끊겨도 말은 하게.
 */
export function edgeSpeech(options: EdgeSpeechOptions = {}): Speech {
  const locale = options.locale ?? 'ko-KR';
  const defaultVoice = options.defaultVoice ?? 'ko-KR-SunHiNeural';
  const rate = options.rate ?? '+0%';
  const pitch = options.pitch ?? '+0Hz';

  let cachedVoices: readonly SpeechVoice[] | null = null;

  return {
    name: 'edge-tts',

    async voices(): Promise<readonly SpeechVoice[]> {
      if (cachedVoices !== null) return cachedVoices;
      const all = await new MsEdgeTTS().getVoices();
      cachedVoices = all
        .filter((v) => v.Locale === locale)
        .map((v) => ({
          id: v.ShortName,
          label: prettyName(v.ShortName),
          gender: v.Gender === 'Female' ? '여성' : '남성',
        }));
      return cachedVoices;
    },

    async synthesize(text: string, voiceId?: string): Promise<Buffer> {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voiceId || defaultVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text, { rate, pitch });
      return await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
        audioStream.on('end', () => resolve(Buffer.concat(chunks)));
        audioStream.on('error', (e: Error) => reject(e));
      });
    },
  };
}

/** `ko-KR-SunHiNeural` → `SunHi`. 기계 이름을 그대로 보여주지 않는다. */
function prettyName(shortName: string): string {
  return shortName.replace(/^[a-z]{2}-[A-Z]{2}-/, '').replace(/(Multilingual)?Neural$/, '');
}
