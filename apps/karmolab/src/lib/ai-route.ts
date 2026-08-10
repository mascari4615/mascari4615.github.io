/**
 * AI 경로 고르기 — 순수 판정 (해자④ / 흡수계획 12 § 1-3)
 *
 * AI 를 쓰는 도구는 앞으로 두 갈래를 갖는다: **원격**(Gemini, 사용자 키 필요·빠름)과
 * **로컬**(브라우저 안에서 도는 작은 모델, 키 0·데이터가 기기 밖으로 안 나감·느릴 수 있음).
 *
 * 「어느 쪽으로 갈지」를 화면마다 따로 판단하면 도구 수만큼 규칙이 갈린다. 그래서 여기 한 곳에
 * 모은다. **여기는 아무 것도 실행하지 않는다** — 무엇을 할지만 정한다. 그래서 시험이 쉽고,
 * 모델·네트워크·GPU 없이도 규칙이 맞는지 확인할 수 있다.
 *
 * ★ 철칙 (12 § 1): **로컬 AI 는 「추가 기능」이지 「전제」가 아니다.**
 * 아무 것도 안 갖춘 사람에게도 도구는 그대로 열려야 한다 — AI 는 그 위에 얹히는 것이다.
 * 그래서 아래 판정의 기본값은 `off` 이고, 그건 「고장」이 아니라 「그냥 도구」다.
 */
import { t, loadNamespace } from './i18n';

/* 이 파일은 위젯이 아니라 **셸·라이브러리**다 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 이 파일을 읽으므로 document 가 있을 때만 부른다. */
if (typeof document !== 'undefined') void loadNamespace('airoute');

export type AiRoute =
  /** 사용자 키로 원격 호출. 빠르고 품질이 좋다. */
  | 'remote'
  /** 브라우저 안에서 바로 실행. 이미 받아 둔 모델이 있을 때만. */
  | 'local'
  /** 로컬로 갈 수는 있는데 **모델을 받아야 한다** — 사람에게 물어보는 자리(수십~수백 MB). */
  | 'gate'
  /** AI 없이 도구만. **이게 기본값이고, 고장이 아니다.** */
  | 'off';

export interface AiContext {
  /** 사용자가 자기 키를 넣어 뒀나. */
  hasKey: boolean;
  /** 이 브라우저가 WebGPU 를 하나 (2026 기준 약 82%). */
  webgpu: boolean;
  /** 모델을 이미 받아 뒀나 (Cache Storage). */
  modelCached: boolean;
  /** 사용자가 「키가 있어도 로컬로」를 골랐나. 기본은 원격 선호. */
  preferLocal?: boolean;
  /** 이 기기가 감당 못 할 만큼 작나 (메모리·모바일). 판정만 받고 여기서 재지 않는다. */
  tooSmall?: boolean;
}

export interface AiDecision {
  route: AiRoute;
  /** 사람에게 보여 줄 한 줄. 「왜 이 길인가」가 안 보이면 사용자는 고칠 수가 없다. */
  why: string;
}

/**
 * 규칙은 12 § 1 그대로. 순서가 곧 우선순위다.
 *
 * `preferLocal` 이 키보다 먼저 오는 이유: 키가 있어도 **기기 밖으로 내보내기 싫은 것**이
 * 있다(비밀번호·사내 문서). 그건 사용자가 이미 고른 것이니 우리가 뒤집지 않는다.
 */
export function chooseRoute(ctx: AiContext): AiDecision {
  if (ctx.tooSmall === true) {
    return { route: 'off', why: t('airoute.t01') };
  }
  /* 위에서 tooSmall 을 이미 걸렀다 — 여기서 또 보면 타입상 늘 참이라 뜻이 없다. */
  const canLocal = ctx.webgpu;

  if (ctx.preferLocal === true && canLocal) {
    return ctx.modelCached
      ? { route: 'local', why: t('airoute.t02') }
      : { route: 'gate', why: t('airoute.t03') };
  }
  if (ctx.hasKey) return { route: 'remote', why: t('airoute.t04') };
  if (canLocal && ctx.modelCached) return { route: 'local', why: t('airoute.t05') };
  if (canLocal) return { route: 'gate', why: t('airoute.t06') };

  return {
    route: 'off',
    why: ctx.webgpu
      ? t('airoute.t07')
      : t('airoute.t08')
  };
}

/**
 * 로컬 모델이 어디서 실패했나 — **단계**를 가른다.
 *
 * 왜 단계가 중요한가 (실측으로 배운 것):
 * - **적재 단계에서 죽으면 해상도·길이를 낮춰 재시도해 봐야 소용없다.** 모델이 아예 안 올라간
 *   것이라 입력을 줄이는 것과 무관하다. 그런데 흔한 대응이 「작게 해서 다시」라, 몇 번을
 *   더 실패하고 나서야 원인을 본다.
 * - **「총 VRAM 이 넉넉하다」는 근거가 안 된다.** 지금 *비어 있는* 양이 문제다.
 * - **ALLOC 실패 = 용량 부족이 아닐 수 있다.** 빈 GPU 에서도 같은 자리에서 죽으면 그건
 *   용량이 아니라 배선(드라이버·백엔드) 문제다. 용량으로 단정하면 영영 못 고친다.
 */
export type AiFailStage = 'support' | 'download' | 'load' | 'run';

export interface AiFailure {
  stage: AiFailStage;
  /** 사람에게 보여 줄 말. 기계 오류 문구를 그대로 던지지 않는다. */
  say: string;
  /** 다시 해 볼 가치가 있나. 없으면 버튼을 안 보여 준다 — 눌러도 같은 실패는 괴롭힘이다. */
  retryable: boolean;
  /** 원격으로 돌아갈 것을 권할까. */
  suggestRemote: boolean;
}

export function explainFailure(stage: AiFailStage, detail = ''): AiFailure {
  const tail = detail === '' ? '' : ` (${detail})`;
  switch (stage) {
    case 'support':
      return {
        stage,
        say: t('airoute.noLocal', { tail }),
        retryable: false,
        suggestRemote: true
      };
    case 'download':
      return {
        stage,
        say: t('airoute.downloadCut', { tail }),
        retryable: true,
        suggestRemote: true
      };
    case 'load':
      return {
        stage,
        /* 여기서 「작게 해서 다시」를 권하지 않는다 — 적재 실패는 입력 크기와 무관하다. */
        say:
          `모델을 GPU 에 올리지 못했습니다${tail} — 지금 비어 있는 그래픽 메모리가 모자라거나,` +
          t('airoute.t09'),
        retryable: true,
        suggestRemote: true
      };
    case 'run':
      return {
        stage,
        say: t('airoute.stalled', { tail }),
        retryable: true,
        suggestRemote: false
      };
  }
}

/** 받기 전에 **얼마나 걸리는지** 먼저 말한다 (12 § 2). 숫자 없이 「잠시만」은 안 된다. */
export function downloadNotice(sizeMb: number, mbps = 20): string {
  const seconds = Math.max(1, Math.round((sizeMb * 8) / mbps));
  const time = seconds < 60 ? t('airoute.sec', { n: seconds }) : t('airoute.min', { n: Math.round(seconds / 60) });
  return t('airoute.downloadNote', { mb: sizeMb, time });
}
