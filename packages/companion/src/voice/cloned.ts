import type { Speech, SpeechVoice } from './edge-tts';
import { 기분빠르기, type Tone } from './feeling-tone';

/**
 * 흉내 낸 목소리 — 참고 음성 몇 초로 그 사람처럼 말하게 한다.
 *
 * 왜 필요한가: 쓸 수 있던 목소리는 두 갈래뿐이었다. 이 컴퓨터에 깔린 한국어 목소리는
 * 옛날 것 하나뿐이라 로봇 같고, 인터넷 목소리는 자연스럽지만 **원하는 목소리가 없다.**
 * 높낮이와 빠르기를 손으로 흔들어 「밝게」·「나른하게」를 만들어 봤지만 목록만 부풀고
 * 의미가 없어 걷어냈다 — 같은 목소리를 흔든 것이지 다른 목소리가 아니었다.
 *
 * 이쪽은 다르다. **참고 음성을 바꾸면 목소리 자체가 바뀐다.** 일본어로 녹음된 목소리로
 * 한국어를 말하게 하는 것도 된다.
 *
 * 어디서 도나: 이 컴퓨터에서 도는 별도 프로그램(GPT-SoVITS)의 HTTP 창구에 물어본다.
 * 남의 서비스로 나가지 않는다 — 내 목소리·내 대화가 밖으로 안 나가는 게 이 동반자의
 * 전제다. 안 떠 있으면 조용히 실패해서 다른 목소리로 물러선다(그 판단은 부르는 쪽 몫).
 *
 * **쓸 근거는 코드가 아니라 문서에 있다** — `memo/life/목소리-라이선스.md`. 참고 음성을
 * 바꿀 땐 거기부터 본다. 소리가 좋다는 건 허락이 아니다.
 */

export interface ClonedSpeechOptions {
  /** 흉내 내는 프로그램이 듣고 있는 자리. */
  endpoint?: string;
  /** 참고 음성 파일 (그 프로그램이 읽을 수 있는 경로). */
  refAudioPath: string;
  /** 참고 음성이 실제로 말하는 내용. 없으면 흉내가 눈에 띄게 나빠진다. */
  refText: string;
  /** 참고 음성의 말 (`ja` / `ko` / `en` …). */
  refLang?: string;
  /** 만들어 낼 말. 기본은 한국어. */
  lang?: string;
  /** 사람에게 보일 이름. */
  label?: string;
  /** 얼마나 기다려 줄까. 첫 소리가 늦으면 대화가 아니다. */
  timeoutMs?: number;
}

export function clonedSpeech(options: ClonedSpeechOptions): Speech & { alive(): Promise<boolean> } {
  const endpoint = (options.endpoint ?? 'http://127.0.0.1:9880').replace(/\/$/, '');
  const lang = options.lang ?? 'ko';
  const label = options.label ?? '흉내 낸 목소리';
  const timeoutMs = options.timeoutMs ?? 60_000;

  return {
    name: '흉내',
    contentType: 'audio/wav',

    async voices(): Promise<readonly SpeechVoice[]> {
      // 목소리는 **하나**다. 참고 음성이 곧 목소리라, 목록을 부풀릴 것이 없다.
      return [{ id: 'cloned', label, gender: '흉내' }];
    },

    async synthesize(text: string, voiceId?: string): Promise<Buffer> {
      /* **결을 빠르기로 옮긴다.**
         이 목소리는 높낮이를 못 바꾸지만 빠르기는 바꿀 수 있다. 결을 무시하면 마음이
         어떻든 늘 같은 속도로 말하고, 밤에 누그러뜨리는 것도 안 들린다 — 결을 붙여
         놓고 듣는 쪽이 안 받으면 붙인 적 없는 것과 같다.
         이름 뒤의 `@결` 을 읽는다. 없으면 늘 하던 속도. */
      const 결 = (voiceId ?? '').split('@')[1] as Tone | undefined;
      // 기분빠르기는 「늘어지는 정도」라 방향이 반대다 — 1.15 는 느리게, 여기선 나눠 준다.
      const 빠르기 = 결 !== undefined && 결 in 기분빠르기 ? 1 / 기분빠르기[결] : 1.0;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${endpoint}/tts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            text_lang: lang,
            ref_audio_path: options.refAudioPath,
            prompt_text: options.refText,
            prompt_lang: options.refLang ?? 'ja',
            media_type: 'wav',
            // 문장을 잘게 쪼개 이어 붙이면 첫 소리가 빨리 나온다.
            text_split_method: 'cut5',
            batch_size: 1,
            speed_factor: Number(빠르기.toFixed(3)),
          }),
          signal: controller.signal,
        });
        if (res.ok === false) {
          // 왜 실패했는지 그대로 올린다 — 「소리가 안 난다」만 남으면 원인을 못 찾는다.
          const why = await res.text().catch(() => '');
          throw new Error(`흉내 낸 목소리를 못 만들었다 (${res.status}): ${why.slice(0, 200)}`);
        }
        return Buffer.from(await res.arrayBuffer());
      } finally {
        clearTimeout(timer);
      }
    },

    /** 그 프로그램이 떠 있나. 안 떠 있으면 부르는 쪽이 다른 목소리로 간다. */
    async alive(): Promise<boolean> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      try {
        // 아무 명령도 아닌 요청 — 살아 있으면 뭐라도 답한다.
        const res = await fetch(`${endpoint}/control?command=ping`, { signal: controller.signal });
        return res.status < 500;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
