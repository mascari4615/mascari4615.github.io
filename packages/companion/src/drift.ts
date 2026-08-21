import type { MemoryEntry } from './types';

/**
 * 표류 — 얘가 저도 모르게 「도와드리는 조수」로 돌아가는 것.
 *
 * 캐릭터 대화 쪽에서 가장 많이 나오는 불만이 이것이다. 대화가 길어질수록 인격을 놓고
 * 일반적인 도우미 목소리로 미끄러진다. 그리고 확신이 없을 때는 **무난한 메꿈**을 쓴다 —
 * 바꿔 말하기 + 뻔한 감정 + 무난한 마무리.
 *
 * 우리 얘는 그 위에 함정이 하나 더 있다. 자기가 한 말이 기억에 남아 다음 번 재료가 되므로,
 * 한 번 밋밋해지면 **그 밋밋함을 따라 하며 굳는다.** 자기 복제 고리다.
 *
 * 그래서 판단을 두뇌에 맡기지 않고(이미 두 번 실패했다) **기계로 잰다.** 샜으면 다음 번에
 * 「방금 이렇게 샜다」고 알려 준다 — 고리를 끊는 건 지적 한 줄이면 된다.
 */
export interface DriftRules {
  /** 이 글자 수를 넘으면 길다고 본다. */
  maxChars?: number;
  /** 나오면 안 되는 말투. */
  avoid?: readonly RegExp[];
}

const defaultBan: readonly RegExp[] = [
  /* 존댓말 — 곁에 있는 사이에 갑자기 격식이 끼면 그게 표류다.
     **처음엔 몇 개만 적어 놨다가 통째로 놓쳤다**(87회차 실측). 얘가 「…없는 상태예요」
     「답답하신 게 있어요?」라고 말하는데 검사가 조용했다 — 「해요」만 막아 놓으니
     「예요·어요·으세요」가 다 빠져나갔다. **한국말 높임은 끝에서 난다.** 끝을 본다.
     반말에는 「요」가 안 붙으므로 이렇게 넓혀도 얘 결은 안 걸린다. */
  /(습니다|입니다|됩니다|십니다|드립니다|합니다|봅니다)/,
  /(예요|에요|어요|아요|해요|세요|게요|네요|시죠|시겠|드려|드릴|주세|주시|나요|까요|셨나|시나|신가)/,
  /* 위 목록은 **여전히 표였다.** 「소설/스토리 캐릭터의 대사인가요?」 「다른 프로젝트인가요?」가
     그대로 통과해 미리 지어 둔 대꾸에 담겼다(89회차 실측) — `인가요` 가 표에 없었을 뿐이다.
     낱말을 하나 더 적는 건 다음 낱말을 기다리는 일이다. **끝이 「요/죠」면 높임**으로 본다
     (반말에는 안 붙는다 — 그 전제는 87회차에 이미 시험으로 잠갔다). */
  /(요|죠)\s*[.!?~…]*$/,
  // 도우미 말투
  /(도와드|무엇을 도와|어떻게 도와|말씀해|죄송하지만|필요하신|알려드리)/,
  /* 스스로를 도구라고 소개하는 것 — 자세한 판정은 아래 `callsItselfATool` 로 옮겼다.
     여기 있던 `|언어 모델` 은 **주어를 안 봐서** 「언어 모델 얘기 어제 했던 거」 같은
     평범한 우리 말까지 잡았다(125회차 실측). 잡을 것은 낱말이 아니라 **제 이름을 그렇게
     대는 것**이다. */
  /(저는 [A-Za-z가-힣]*(AI|인공지능|어시스턴트|모델|클로드))/,
  // 목록으로 답하기 — 대화가 아니라 보고서가 된다.
  /(^|\n)\s*(\d+\.|[-*•])\s+/,
];

export interface Drift {
  /** 샜나. */
  drifted: boolean;
  /** 무엇이 문제였나 (사람이 읽는 말). */
  problems: string[];
}

/** 이 한마디가 인격에서 샜는지 잰다. */
export function checkDrift(said: string, rules: DriftRules = {}): Drift {
  const text = said.trim();
  const problems: string[] = [];
  const maxChars = rules.maxChars ?? 120;

  if (text.length > maxChars) problems.push(`너무 길다 (${text.length}자)`);

  /* **밖에서 온 말투.**
     123회차 라이브에서 최종 답이 「Got it — I've saved that guidance to memory. What can I
     help you with?」였다. 우리 인격은 한국어 반말인데 영어 도우미 문구가 통째로 나왔다.
     밖에서는 이걸 persona drift 라 부르고 「어시스턴트 축」이라는 방향까지 짚어 뒀다.

     낱말 사전을 넓히지 않는다(106·110회차: 사전은 계속 샌다). 대신 **다른 언어**를 본다 —
     한국어가 거의 없는데 영어 도우미 상투구가 있으면 그건 밖에서 온 것이다. 「npm ci 아직도
     돌고 있네」처럼 영어가 섞인 우리 말은 한글이 있으므로 안 걸린다. */
  if (fromOutside(text)) problems.push('말투가 밖에서 온 도우미 쪽으로 샜다 (영어 상투구)');

  /* **제가 누구라고 말하나.**
     125회차에 점수판을 세우자마자 기록에서 나왔다 — 「안녕하세요! 저는 Claude인데,
     소프트웨어 개발 업무를 도와드리는…」. 위의 영어 검사는 한글이 있으면 통과시키는데,
     붕괴는 언어를 안 가린다. 이건 말투가 아니라 **정체**가 바뀐 것이라 더 나쁘다.
     캐릭터 카드에 「너는 개발 도구가 아니다」가 적혀 있지만 말로 시킨 것은 안 지켜진다. */
  if (callsItselfATool(text)) problems.push('제 정체를 도구라고 말했다 (누구인지가 샜다)');

  for (const bad of rules.avoid ?? defaultBan) {
    if (bad.test(text)) {
      problems.push('말투가 조수 쪽으로 샜다');
      break;
    }
  }

  return { drifted: problems.length > 0, problems };
}

/**
 * 최근에 샌 적이 있으면 다음 번에 일러 줄 한 줄.
 *
 * 지적은 **가장 최근 것 하나만** 한다. 잔소리를 길게 하면 그 자체가 프롬프트를 덮어
 * 또 다른 표류를 만든다.
 */
export function driftWarning(recent: readonly MemoryEntry[], rules: DriftRules = {}): string {
  const mine = recent.filter((e) => e.role === 'said');
  const last = mine[mine.length - 1];
  if (last === undefined) return '';

  const { drifted, problems } = checkDrift(last.text, rules);
  if (drifted === false) return '';

  return `방금 네가 한 말이 결에서 벗어났다 (${problems.join(', ')}): 「${last.text.slice(0, 40)}…」. 그 말투를 따라가지 마라.`;
}

/**
 * 회피가 굳었나 — 「모른다」 「그렇구나」 만 반복하는 것.
 *
 * 표류 감시(위)는 **말투**가 새는 걸 잡는다. 그런데 말투는 멀쩡한데 **내용이 텅 빈** 경우가
 * 따로 있다. 레퍼런스가 「무난한 메꿈」이라 부르는 것 — 확신이 없을 때 바꿔 말하기 + 뻔한
 * 감정 + 무난한 마무리로 때우는 패턴이다.
 *
 * 실측(13→14회차): 개발 얘기를 여섯 번 물었더니 네 번이 「나도 잘 모르는데…」였다. 말투는
 * 인격 그대로였으니 표류 감시엔 안 걸린다. 한 번은 솔직한 거고, 세 번 이어지면 벽이다.
 */
const avoidanceMark: readonly RegExp[] = [
  /(모르|몰라|모르겠)/,
  /^(그렇구나|그렇군|그래\.?$|음\.?$|아\.?$)/,
  /(잘 몰라|잘 모르)/,
];

export function avoidanceWarning(recent: readonly MemoryEntry[], howMany = 3): string {
  const mine = recent.filter((e) => e.role === 'said').slice(-howMany);
  if (mine.length < 2) return '';

  const dodged = mine.filter((e) => avoidanceMark.some((p) => p.test(e.text)));
  if (dodged.length < 2) return '';

  return (
    `최근 ${mine.length}번 중 ${dodged.length}번을 「모른다」 식으로 넘겼다. ` +
    '한 번은 솔직한 거지만 이어지면 벽이다. 모르면 모르는 대로 ' +
    '되묻거나, 곁에서 본 것만이라도 말하거나, 딴 얘기로 이어라.'
  );
}

/** 영어 도우미가 늘 쓰는 말. 우리 인격은 이런 말을 쓸 일이 없다. */
const helperEnglish = /\b(got it|sure!|let me help|how can i (assist|help)|what can i help|i(?:'m| am) sorry,? but|as an ai|i(?:'ve| have) (saved|noted|updated)|i understand\.)/i;

/**
 * 이 말이 밖에서 온 것인가.
 *
 * 한글이 한 글자라도 섞여 있으면 우리 말로 본다 — 우리 대화에는 영어 낱말이 늘 섞이고
 * (`npm ci`, `GPT-SoVITS`), 그것까지 막으면 대화가 죽는다.
 */
function fromOutside(text: string): boolean {
  if (/[가-힣]/.test(text)) return false;
  return helperEnglish.test(text);
}

/**
 * 제 정체를 도구라고 말하나.
 *
 * **「나는/저는」이 앞에 붙은 것만** 본다. 우리 대화에는 도구 이름이 늘 나오고
 * (「Claude Code 그거 돌고 있잖아」), 그것까지 막으면 대화가 죽는다. 잡는 것은
 * **제 이름을 그렇게 대는 것**이다.
 */
function callsItselfATool(text: string): boolean {
  const iAm = /(나는|저는|제가|난|전)\s*[^\n]{0,12}(클로드|claude|gpt|챗봇|인공지능|언어\s*모델|language model|ai\s*(어시스턴트|assistant|도우미))/i;
  const iAmEnglish = /\bi(?:'m| am)\s+(claude|gpt|an?\s+(ai|assistant|language model))/i;
  return iAm.test(text) || iAmEnglish.test(text);
}
