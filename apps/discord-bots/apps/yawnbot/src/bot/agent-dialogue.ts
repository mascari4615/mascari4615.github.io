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
