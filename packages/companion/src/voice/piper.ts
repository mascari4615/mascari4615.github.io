import { execFile } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Speech, SpeechVoice } from './edge-tts';

export interface PiperSpeechOptions {
  /** 목소리를 만드는 실행 파일. */
  exePath: string;
  /** `{ 보여줄 이름: 모델 파일 }`. */
  voices: Readonly<Record<string, string>>;
  /** 기본 목소리 이름. */
  defaultVoice?: string;
  /** 말 길이 배수. 1보다 크면 느긋해진다. */
  lengthScale?: number;
  /** 목소리마다 다른 말 길이 — 같은 모델을 결이 다른 여럿으로 갈라 쓴다. */
  lengthScaleFor?: Readonly<Record<string, number>>;
  log?: (message: string) => void;
}

/**
 * 내 컴퓨터에서 도는 목소리.
 *
 * 여태 쓰던 것은 인터넷 건너편의 남의 목소리였다. 이건 파일 하나로 여기서 돈다 —
 * 인터넷이 끊겨도 말하고, 무슨 말을 했는지 밖으로 나가지 않는다.
 * 실측: 6초 분량을 0.45초에 만든다.
 *
 * 만든 소리는 wav 다. mp3 보다 크지만 우리 창은 바로 옆에 있으므로 상관없고,
 * 변환기를 하나 더 끼우지 않는 쪽이 고장 날 자리가 적다.
 */
export function piperSpeech(options: PiperSpeechOptions): Speech {
  const log = options.log ?? (() => {});
  const names = Object.keys(options.voices);
  const fallback = options.defaultVoice ?? names[0] ?? '';
  const scratch = mkdtempSync(join(tmpdir(), 'companion-voice-'));

  function modelFor(voiceId?: string): string | null {
    const wanted = voiceId && options.voices[voiceId] ? voiceId : fallback;
    const model = options.voices[wanted];
    return model !== undefined && existsSync(model) ? model : null;
  }

  const speech: Speech & { warmUp(): Promise<void> } = {
    name: 'piper(내 컴퓨터)',
    /**
     * 미리 한 번 돌려 둔다.
     *
     * 첫 호출은 모델을 올리느라 느리다 — 그 느림이 하필 **처음 말 걸었을 때** 온다.
     * 첫인상이 제일 중요한 자리에서 제일 느린 셈이라, 창이 뜰 때 미리 데운다.
     */
    async warmUp(): Promise<void> {
      try {
        await this.synthesize('음', undefined);
      } catch {
        // 못 데워도 말은 한다 — 조금 느릴 뿐이다.
      }
    },
    // wav 다. 형식을 틀리게 알려주면 브라우저가 소리를 아예 안 낸다.
    contentType: 'audio/wav',

    async voices(): Promise<readonly SpeechVoice[]> {
      return names
        .filter((name) => existsSync(options.voices[name] as string))
        .map((name) => ({ id: name, label: name, gender: '내 컴퓨터' }));
    },

    synthesize(text: string, voiceId?: string): Promise<Buffer> {
      const model = modelFor(voiceId);
      if (model === null) return Promise.reject(new Error('쓸 수 있는 목소리 모델이 없다'));

      const out = join(scratch, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`);
      const args = ['--model', model, '--output_file', out];
      const scale = (voiceId ? options.lengthScaleFor?.[voiceId] : undefined) ?? options.lengthScale;
      if (scale !== undefined) args.push('--length_scale', String(scale));

      return new Promise<Buffer>((resolve, reject) => {
        const child = execFile(
          options.exePath,
          args,
          { timeout: 60_000, windowsHide: true, maxBuffer: 1 << 20 },
          (error) => {
            if (error) {
              log(`목소리를 못 만들었다: ${error.message.slice(0, 200)}`);
              reject(error);
              return;
            }
            try {
              const audio = readFileSync(out);
              resolve(audio);
            } catch (e) {
              reject(e instanceof Error ? e : new Error(String(e)));
            } finally {
              // 만든 소리는 바로 지운다 — 한 말이 디스크에 쌓이지 않게.
              try { unlinkSync(out); } catch { /* 이미 없으면 그만 */ }
            }
          },
        );
        child.stdin?.end(text, 'utf8');
      });
    },
  };
  return speech;
}

/** 목소리 파일이 자리에 있나. */
export function piperReady(options: PiperSpeechOptions): boolean {
  return existsSync(options.exePath) && Object.values(options.voices).some((m) => existsSync(m));
}
