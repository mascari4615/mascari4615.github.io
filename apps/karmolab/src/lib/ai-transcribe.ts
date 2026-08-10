/**
 * 로컬 전사(음성 → 글자) 이음새 (해자④ 파일럿 / 흡수계획 12 § 4)
 *
 * 12 문서의 ★추천 파일럿 = `voicerec` → `subtitle`. **모델 하나로 도구 둘**이고, 효과가
 * 눈에 바로 보이며, 결과물(자막)이 공유 가능한 재료다.
 *
 * 이 파일에는 화면이 없다. 「어떤 모델을 · 어떤 모양의 소리로 · 어떻게 부르나」만 담는다.
 * 엔진(`ai-engine`)과 마찬가지로 **실제 계산은 밖에서 받는다** — 그래야 모델 없이 규칙을 잰다.
 *
 * ★ 소리를 넘기는 모양이 이 자리의 유일한 함정이다.
 * 브라우저 녹음은 `webm/opus` 같은 압축본으로 나오는데, 전사 모델이 받는 것은 **16kHz 단일
 * 채널의 날 샘플**이다. 그걸 안 맞추면 「모델은 도는데 결과가 빈 글자」가 된다 — 오류가 없어서
 * 어디가 틀렸는지 안 보이는 종류다. 그래서 변환을 여기 한 곳에 두고 시험으로 잠근다.
 */
import type { EngineModule } from './ai-engine';
import { t, loadNamespace } from './i18n';

/* 위젯이 아니라 셸·라이브러리 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 읽으므로 document 가 있을 때만. */
if (typeof document !== 'undefined') void loadNamespace('aitranscribe');

/**
 * 판을 박은 모델. 작은 것부터 — 큰 모델은 「받다 지쳐 떠나는」 쪽이 더 크다.
 * 다국어판이라 한국어도 받는다(영어 전용판이 더 작지만 우리 사용자에게는 쓸모가 없다).
 */
export const TRANSCRIBE_MODEL = 'onnx-community/whisper-tiny';

/** 이 모델이 받는 표본율. Whisper 계열은 16kHz 고정이다. */
export const TARGET_HZ = 16000;

/** 대략 받는 크기 — 「AI 켜기」가 사람에게 먼저 보여 줄 숫자. */
export const MODEL_SIZE_MB = 40;

export interface Transcript {
  text: string;
  /** 자막으로 넘길 때 쓰는 토막. 모델이 안 주면 빈 배열 — 없는 것을 지어내지 않는다. */
  chunks: Array<{ start: number; end: number; text: string }>;
}

/**
 * 녹음본을 모델이 아는 모양으로. **여기서 두 가지가 일어난다** — 단일 채널로 합치고,
 * 16kHz 로 다시 샘플링한다. 브라우저가 둘 다 해 줄 수 있으므로 우리가 손으로 안 센다.
 *
 * `decode` 를 밖에서 받는 이유: `AudioContext` 는 브라우저에만 있다. 밖에서 받으면 이 규칙을
 * Node 에서도 잴 수 있고, 「16kHz 로 안 맞춰서 빈 글자가 나오는」 사고를 시험으로 막을 수 있다.
 */
export async function toModelAudio(
  bytes: ArrayBuffer,
  decode: (buf: ArrayBuffer) => Promise<{ sampleRate: number; numberOfChannels: number; getChannelData: (i: number) => Float32Array }>
): Promise<Float32Array> {
  const audio = await decode(bytes);

  /* 여러 채널이면 평균 낸다 — 한쪽만 쓰면 반대쪽에만 담긴 말이 사라진다. */
  let mono: Float32Array;
  if (audio.numberOfChannels <= 1) {
    mono = audio.getChannelData(0);
  } else {
    const first = audio.getChannelData(0);
    mono = new Float32Array(first.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / audio.numberOfChannels;
    }
  }

  if (audio.sampleRate === TARGET_HZ) return mono;
  return resampleTo16k(mono, audio.sampleRate);
}

/**
 * 아주 단순한 선형 보간 재표본. 음악용으로는 거칠지만 **말소리에는 충분**하다 —
 * 전사 정확도를 좌우하는 것은 여기가 아니라 모델이다. 더 좋은 필터를 넣으려면 그때
 * 필요해서 넣는 것이고, 지금 넣으면 읽을 코드만 는다.
 */
export function resampleTo16k(input: Float32Array, fromHz: number): Float32Array {
  if (fromHz === TARGET_HZ) return input;
  if (fromHz <= 0) throw new Error(t('aitranscribe.err.01'));
  const ratio = fromHz / TARGET_HZ;
  const out = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
  for (let i = 0; i < out.length; i++) {
    const at = i * ratio;
    const left = Math.floor(at);
    const right = Math.min(left + 1, input.length - 1);
    const frac = at - left;
    out[i] = input[left] * (1 - frac) + input[right] * frac;
  }
  return out;
}

export interface TranscribeOptions {
  /** 한국어를 미리 알려 주면 언어 추정을 건너뛴다 — 짧은 녹음에서 특히 자주 틀린다. */
  language?: string;
  /** 0~100. 모델 받기·처리 진행률. */
  onProgress?: (pct: number) => void;
}

/**
 * 전사. 엔진과 소리를 받아 글자를 낸다.
 *
 * 결과 모양은 판마다 조금씩 다르다(`text` 만 오거나 `chunks` 가 붙거나). 그래서 **받은 것을
 * 그대로 믿지 않고** 우리 모양으로 정리한다 — 화면 세 곳이 각자 뜯으면 한 곳이 반드시 틀린다.
 */
export async function transcribe(
  engine: EngineModule,
  audio: Float32Array,
  opts: TranscribeOptions = {}
): Promise<Transcript> {
  if (audio.length === 0) throw new Error(t('aitranscribe.err.02'));

  const pipe = (await engine.pipeline('automatic-speech-recognition', TRANSCRIBE_MODEL, {
    progress_callback: (p: { progress?: number }) => {
      if (typeof p?.progress === 'number') opts.onProgress?.(Math.round(p.progress));
    }
  })) as (input: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

  const raw = await pipe(audio, {
    language: opts.language,
    return_timestamps: true,
    chunk_length_s: 30
  });

  return normalize(raw);
}

/** 모델이 준 것을 우리 모양으로. 없는 것은 **지어내지 않고 빈 값**으로 둔다. */
export function normalize(raw: unknown): Transcript {
  const r = raw as { text?: unknown; chunks?: unknown } | undefined;
  const text = typeof r?.text === 'string' ? r.text.trim() : '';
  const chunks = Array.isArray(r?.chunks)
    ? r.chunks
        .map((c) => {
          const item = c as { timestamp?: unknown; text?: unknown };
          const ts = Array.isArray(item?.timestamp) ? item.timestamp : [];
          const start = typeof ts[0] === 'number' ? ts[0] : null;
          const end = typeof ts[1] === 'number' ? ts[1] : null;
          const line = typeof item?.text === 'string' ? item.text.trim() : '';
          /* 시각을 모르는 토막은 자막으로 못 쓴다 — 0 으로 채우면 전부 첫 줄에 겹친다. */
          return start === null || end === null || line === '' ? null : { start, end, text: line };
        })
        .filter((c): c is { start: number; end: number; text: string } => c !== null)
    : [];
  return { text, chunks };
}

/** 자막 도구로 넘기는 모양 (SRT). 해자① 묶어 쓰기와 붙는 자리다. */
export function toSrt(t: Transcript): string {
  if (t.chunks.length === 0) return '';
  return t.chunks
    .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`)
    .join('\n');
}

function stamp(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const rest = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${rest}`;
}
