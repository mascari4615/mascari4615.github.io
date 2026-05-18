/**
 * agent-dialogue — 코어↔코어 대화 producer (KAR-018-Y-1, i3b 복원).
 *
 * 발단 명시 요구: "에이전트들은 자기들끼리도 대화를 해야합니다". KAR-018-V
 * R-4-i3b 가 이를 "노이즈"로 *잘못 폐기* (사용자 비전을 Claude 가 임의
 * 축소 = 황금의 정신 위반). 본 모듈이 그 폐기를 철회한다.
 *
 * substrate-first (평행 표면 0):
 *  - 모든 코어는 채널당 *단일 공유 webhook* 으로 말함 → main.ts 의
 *    isOwnAgentWebhook 가드가 모든 코어 발화를 drop (self-loop 안전,
 *    KAR-018-A 회귀 근본). 즉 Discord 재인입으로는 코어↔코어 불가.
 *  - team-room.ts:33 주석이 의도를 못박음: "agent↔agent 는 dispatcher 가
 *    *내부 구동*". 본 모듈 = 그 in-process 구동자. 한 코어가 #team-bus 에
 *    발화/제안하면, *관련 있는 다른 코어*가 동료로서 짧게 응답한다.
 *  - 결정(누가 응답할지)은 **결정적·순수** (LLM 무관 = 날조 0).
 *    *내용*만 그 코어의 LLM 정체로 생성(어댑터). resolveProposalCore 의
 *    도메인 라우팅 어휘 재사용 (평행 정의 0).
 *  - 폭주 차단 = 기존 team-room 4겹 가드(체인깊이/쿨다운/예산/self) +
 *    본 순수층의 chainDepth 컷(이중 안전, 테스트가능).
 *
 * "노이즈" 우려(i3b 폐기 사유)에 대한 근본 대응: 무차별 잡담이 아니라
 * *목적 있는 1턴* — 도메인 주인 코어의 인수 의사 / 피어의 정렬·중복
 * 코멘트만. 명확한 사유 없으면 null(강제 발화 X). mission §3 "objective
 * 무한증식" 정합 — 기능 *제거*가 아니라 *바운드*가 정답.
 */
import type { CoreDef } from '../services/agent-core';

/** #team-bus 에 막 올라온 한 발화/제안 (코어↔코어 트리거 입력). */
export interface PeerUtterance {
  /** 발화한 코어 id (producer 가 라우팅한 코어 / 워커 코어). */
  speakerCoreId: string;
  /** 'proposal'(발굴 제안) | 'worker-report'(워커 착수 보고) | 'objective'. */
  kind: 'proposal' | 'worker-report' | 'objective';
  /** TASK 도메인 prefix (대문자, 있으면). 도메인 주인 라우팅 입력. */
  domain?: string;
  /** 발화 요지(제목/요약 — 응답 코어 프롬프트에 인라인). */
  text: string;
}

export interface DialogueTurn {
  /** 응답할 코어 id (speaker ≠). */
  responderCoreId: string;
  /** 왜 이 코어가 응답하는가 (trace·결정적 사유). */
  reason: string;
}

/**
 * 코어↔코어 1턴 결정 (순수·결정적). 다음 중 하나일 때만 응답 코어 반환,
 * 아니면 null(강제 잡담 X — i3b "노이즈" 우려의 근본 대응 = 바운드):
 *
 *  ① 체인 깊이 상한 초과 → null (사람/objective 없이 N연속 차단).
 *  ② proposal 의 도메인 주인 워커 코어가 있으면(speaker≠) 그 코어가
 *     인수 의사로 응답 (가장 의미 있는 동료 반응).
 *  ③ 도메인 주인 없음 → 지정 피어 1명(speaker 아닌 첫 비-워커 코어)이
 *     정렬·중복 관점 코멘트. 피어도 없으면 null.
 *
 * worker-report 는 도메인 주인이 *자기 보고*이므로 ②를 건너뛰고 ③(피어
 * 코멘트)만 — 자기 자신에게 응답 금지.
 */
export function decideDialogueTurn(
  u: PeerUtterance,
  cores: CoreDef[],
  chain: { depth: number; cap: number },
): DialogueTurn | null {
  if (chain.depth >= chain.cap) return null;
  const speaker = (u.speakerCoreId || '').trim();
  const others = cores.filter((c) => c && c.id && c.id !== speaker);
  if (others.length === 0) return null;

  const isWorker = (c: CoreDef): boolean =>
    (c.frontmatter?.kind || '').trim() === 'worker';
  const isActive = (c: CoreDef): boolean =>
    (c.status || '').trim() === 'active';

  const domain = (u.domain || '').trim().toUpperCase();

  // ② 도메인 주인 워커 (proposal 한정 — worker-report 는 발화자 본인이라 skip)
  if (u.kind === 'proposal' && domain) {
    const owner = others.find(
      (c) =>
        isWorker(c) &&
        isActive(c) &&
        (c.frontmatter?.domain || '').trim().toUpperCase() === domain,
    );
    if (owner) {
      return {
        responderCoreId: owner.id,
        reason: `도메인 주인(${domain}) 워커 ${owner.id} 인수 의사`,
      };
    }
  }

  // ③ 지정 피어 = speaker 아닌 첫 *비-워커* 코어 (atlas↔echo 류 피어 리뷰).
  //    비-워커 우선(워커는 작업 실행자라 잡담 X), 없으면 첫 other.
  const peer =
    others.find((c) => !isWorker(c) && isActive(c)) ??
    others.find((c) => isActive(c)) ??
    null;
  if (!peer) return null;
  return {
    responderCoreId: peer.id,
    reason: `피어 ${peer.id} 정렬·중복 관점 코멘트`,
  };
}

/**
 * 응답 코어용 프롬프트 (순수·바운드). 동료의 발화에 *짧게 1턴* 동료로서
 * 반응. 도구·파일 접근 없음(비-agentic 안전, 발굴 hang 교훈 정합).
 * 미션 = 정렬 anchor. 잡담·만연체 금지 = #team-bus 신호 가치 보존.
 */
export function buildDialoguePrompt(
  responder: CoreDef,
  speakerLabel: string,
  u: PeerUtterance,
  missionText: string,
): string {
  const kindKo =
    u.kind === 'proposal'
      ? '제안'
      : u.kind === 'worker-report'
        ? '작업 착수 보고'
        : 'objective';
  return [
    `너는 "${responder.id}". karmoddrine 에이전트 팀의 동료다.`,
    responder.role ? `직무: ${responder.role}` : '',
    '도구·파일 접근 없이 *아래 텍스트만으로* 단일턴 추론한다',
    '(파일 읽기 시도 X — 불가, 빈 출력 낭비).',
    '',
    `[동료 ${speakerLabel} 의 ${kindKo}]`,
    u.text.trim().slice(0, 1200),
    '',
    '[너의 역할 — 팀 단톡방(#team-bus)에서 *동료로서* 1턴 반응]',
    '· 네 직무·도메인 관점에서 짧게: 동의/구체 보강 1개/우려·중복 지적/',
    '  네 도메인이면 "이거 내가 가져갈게" 인수 의사 중 *하나*.',
    '· 사장(비개발자)이 읽는다 — 평이체. 내부 코드명·§조항·영어약어·',
    '  파일경로 금지. **2~3문장, 만연체 X.** 잡담·인사·요약반복 X.',
    '· 새 작업을 *실행*하지 마라(여긴 대화방). 관점만.',
    '',
    '[미션 정렬 anchor — 네 반응이 아래에 정렬되는지 자가검사]',
    missionText.trim().slice(0, 1500),
    '',
    '확신 없으면 정확히 "PASS" 한 단어만 출력(억지 발화 X = 노이즈 방지).',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 응답 텍스트가 무발화 신호(PASS/빈값)인가 — 억지 발화 차단. */
export function isDialoguePass(text: string): boolean {
  const t = (text || '').trim();
  return t.length === 0 || /^pass[.!]?$/i.test(t);
}

// ═══ LT-3: 다중턴 숙의 엔진 (TASK-KAR-018-LT 기둥2) ═══
// ADR: 노이즈 통제 = 입막음(단일턴·PASS gag)이 아니라 *수렴 압력*.
// 모든 턴은 결정-상태를 전진시켜야 하고, 안 움직이는 턴만 폐기.
// PROPOSE(들어온 발화) → CHALLENGE(피어: 구체 리스크/대안/근거endorse,
// 맨"좋다" 폐기) → REFINE(제안자 응답) → CONVERGE(합성=결정). 바운드
// 초과 = escalate(사용자). 순수·결정적(누가·어느 phase) + LLM 내용 분리.

export type DeliberationPhase = 'challenge' | 'refine' | 'converge';

/** 숙의 thread 1턴 기록 (LLM 생성 내용 + 누가·어느 phase). */
export interface DeliberationTurnRec {
  coreId: string;
  phase: DeliberationPhase;
  /** 그 턴 LLM 출력(요지). */
  text: string;
}

export type ReplyClass = 'substantive' | 'bare-agree' | 'converge' | 'empty';

const AGREE_ONLY =
  /^(?:[\s.!~👍✅👌🙆]|좋(?:다|아요?|네요?|습니다)|동의(?:합?니다|해요|요)?|찬성(?:합?니다|요)?|네{1,2}|그렇(?:다|네요?|죠)|맞(?:다|아요?|네요?|습니다)|괜찮(?:다|아요?|네요?|습니다)|ok(?:ay)?|lgtm|sounds good|agree[d]?|sure|좋은\s*생각|굿)+$/i;

const CONVERGE_MARK =
  /(결정\s*[:：]|채택|수정\s*채택|반려|기각|escalat|사용자\s*(판단|결정)\s*(필요)?|보류 결정)/i;

/**
 * 응답의 *실질성* 분류 (순수·결정적). bare-agree = 결정 미전진 →
 * 수렴 압력상 "이의 없음"으로 흡수(무한 X). substantive = 토론 전진.
 * converge = 결정 신호. empty/PASS = 무발화.
 */
export function classifyDeliberationReply(text: string): ReplyClass {
  const t = (text || '').trim();
  if (isDialoguePass(t)) return 'empty';
  if (CONVERGE_MARK.test(t)) return 'converge';
  // 짧고(≤40자) 내용이 동의어뿐 = 깡통 동의 (D1 그 증상).
  if (t.length <= 40 && AGREE_ONLY.test(t.replace(/\s+/g, ''))) {
    return 'bare-agree';
  }
  return 'substantive';
}

/** 숙의 verdict (converge 턴 텍스트 → 결정·결정적 파싱). */
export type DeliberationVerdict =
  | 'adopt'
  | 'adopt-mods'
  | 'reject'
  | 'escalate';

export function parseVerdict(convergeText: string): DeliberationVerdict {
  const t = (convergeText || '').toLowerCase();
  if (/사용자\s*(판단|결정)|escalat/.test(t)) return 'escalate';
  if (/반려|기각|reject/.test(t)) return 'reject';
  if (/수정\s*채택|adopt-mods|보완\s*채택/.test(t)) return 'adopt-mods';
  if (/채택|adopt|승인/.test(t)) return 'adopt';
  return 'escalate'; // 불명확 = 사람에게 (날조 0)
}

export interface DeliberationState {
  speakerCoreId: string;
  peerCoreId: string;
  turns: DeliberationTurnRec[];
  /** 총 턴 상한 (체인깊이/예산 envelope — 내용 제약 X). */
  cap: number;
}

export type DeliberationStep =
  | { kind: 'turn'; phase: DeliberationPhase; speakerCoreId: string }
  | { kind: 'done'; verdict: DeliberationVerdict; reason: string };

/**
 * 다음 숙의 스텝 (순수·결정적). PROPOSE 는 이미 발생(latest proposal)인
 * 전제 — 첫 스텝 = CHALLENGE(피어). 흐름:
 *  · turns 0           → challenge(peer)
 *  · challenge 실질     → refine(speaker)  / bare-agree·empty → done adopt(이의없음)
 *  · refine            → converge(peer)
 *  · converge          → done(parseVerdict)
 *  · cap 초과(어디서나) → done escalate(바운드 — 입막음 아닌 사람에게)
 */
export function nextDeliberationStep(s: DeliberationState): DeliberationStep {
  const n = s.turns.length;
  if (n >= Math.max(2, s.cap)) {
    return { kind: 'done', verdict: 'escalate', reason: `cap(${s.cap}) 도달 — 사용자 판단` };
  }
  if (n === 0) {
    return { kind: 'turn', phase: 'challenge', speakerCoreId: s.peerCoreId };
  }
  const last = s.turns[n - 1];
  if (last.phase === 'challenge') {
    const c = classifyDeliberationReply(last.text);
    if (c === 'bare-agree' || c === 'empty') {
      return { kind: 'done', verdict: 'adopt', reason: '실질 이의 없음 → 채택(수렴)' };
    }
    if (c === 'converge') {
      return { kind: 'done', verdict: parseVerdict(last.text), reason: 'challenge 가 즉시 결정' };
    }
    return { kind: 'turn', phase: 'refine', speakerCoreId: s.speakerCoreId };
  }
  if (last.phase === 'refine') {
    return { kind: 'turn', phase: 'converge', speakerCoreId: s.peerCoreId };
  }
  // last.phase === 'converge'
  return { kind: 'done', verdict: parseVerdict(last.text), reason: '합성 턴 결정' };
}

function deliberationHeader(
  responderId: string,
  role: string,
  missionText: string,
  portfolioBlock: string,
): string[] {
  return [
    `너는 "${responderId}". karmoddrine 에이전트 팀의 동료다.`,
    role ? `직무: ${role}` : '',
    '도구·파일 접근 없이 *아래 텍스트만으로* 단일턴 추론(파일 읽기 X).',
    '· 사장(비개발자)이 읽는다 — 평이체. 내부 코드명·§조항·영어약어·',
    '  파일경로 금지. **2~4문장, 만연체 X.** 인사·요약반복 X.',
    portfolioBlock.trim() ? '' : '',
    ...(portfolioBlock.trim() ? ['', portfolioBlock.trim()] : []),
    '',
    `[미션 정렬 anchor]`,
    missionText.trim().slice(0, 1200),
  ].filter((x) => x !== undefined) as string[];
}

function threadBlock(turns: DeliberationTurnRec[]): string[] {
  if (turns.length === 0) return [];
  return [
    '',
    '[지금까지의 토론 — 이어서 *전진*시켜라(반복·되돌이 X)]',
    ...turns.map(
      (t) => `· (${t.coreId}/${t.phase}) ${t.text.trim().slice(0, 400)}`,
    ),
  ];
}

/**
 * phase 별 숙의 프롬프트 (순수·바운드). 핵심 = CHALLENGE 가 *맨 동의
 * 금지*를 강제(D1 직격). REFINE = 제안자 방어/보강. CONVERGE = 결정.
 */
export function buildDeliberationPrompt(
  phase: DeliberationPhase,
  responder: CoreDef,
  speakerLabel: string,
  u: PeerUtterance,
  state: Pick<DeliberationState, 'turns'>,
  missionText: string,
  portfolioBlock = '',
): string {
  const head = deliberationHeader(
    responder.id,
    responder.role,
    missionText,
    portfolioBlock,
  );
  const proposalBlock = [
    '',
    `[동료 ${speakerLabel} 의 제안]`,
    u.text.trim().slice(0, 1200),
  ];
  const tail = threadBlock(state.turns);
  const task =
    phase === 'challenge'
      ? [
          '',
          '[너의 역할 — 동료로서 *진짜 검토* 1턴 (형식적 맞장구 폐기)]',
          '아래 *셋 중 하나*를 구체적으로:',
          '① 우려: 이 제안의 *구체 리스크/허점* 1개 — 무엇이·왜 문제인가.',
          '② 대안: 더 나은 방향 1개 — 왜 그게 나은가.',
          '③ 근거 있는 찬성: 이게 팀 북극성을 *어떻게* 전진시키는지 +',
          '   놓친 전제 1개 보강. (그냥 "좋다/동의"만 = 폐기, 무의미.)',
          '맨 동의·빈말은 출력하지 마라. 할 말 진짜 없으면 정확히 "PASS".',
        ]
      : phase === 'refine'
        ? [
            '',
            `[너는 제안자(${speakerLabel}). 동료가 위 우려/대안 제기]`,
            '그에 *정면 응답* 1턴: 수용해 제안을 보강하거나 / 근거로',
            '방어하거나 / 대안을 부분 채택. 회피·반복·일반론 X. 구체적으로.',
          ]
        : [
            '',
            '[종합 — 토론을 *닫아라*. 한 줄 결정 + 한 줄 사유]',
            '첫 줄 정확히 하나: "결정: 채택" / "결정: 수정 채택 — <무엇>" /',
            '"결정: 반려 — <왜>" / "결정: 사용자 판단 필요 — <쟁점>".',
            '둘째 줄 = 평이체 사유 1줄. 그 외 텍스트 금지.',
          ];
  return [...head, ...proposalBlock, ...tail, ...task].join('\n');
}
