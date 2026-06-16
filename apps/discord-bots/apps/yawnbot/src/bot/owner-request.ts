// TASK-YB-031: 사장 요청이 채팅에 묻혀 사라지는 것 잡기.
//
// 근본 진단: owner 가 일반 채널에 쓴 요청은 agent-bus 의 channel-msg 로 들어가지만
// agent-daemon 의 "침묵 우선" 프롬프트가 모호한 요청을 SKIP → status board 는
// INIT seeded TASK 만 표시 → owner 요청이 어디에도 안 올라가고 사라진다.
//
// 이 모듈 = owner 의 *멘션 또는 키워드* 요청을 채널 무관하게 포착 → owner-requests.jsonl
// (pending) 저장. agent-status-board 가 "사장 요청 대기" 라인으로 노출 (YB-032 board 재사용).
// 멘션/키워드 = 명시적 신호라 오탐 0 (사용자 선택, 2026-06-07).

import fs from 'fs';
import path from 'path';

export interface OwnerRequest {
  id: string;
  ts: string;
  text: string;
  author: string;
  channelId: string;
  messageId: string;
  status: 'pending' | 'addressed';
  addressedTs?: string;
}

/** 키워드 prefix — 공백·콜론 변형 관대. 봇 멘션은 호출부에서 별도 판정. */
const REQUEST_PREFIXES = ['요청:', '요청 :', '부탁:', '부탁 :', '해줘:', 'todo:', 'TODO:'];

/**
 * owner 메시지가 "요청"인가 — 봇 멘션 OR 키워드 prefix.
 * mentionedBot = 호출부에서 message.mentions 로 판정해 전달.
 */
export function isOwnerRequest(content: string, mentionedBot: boolean): boolean {
  if (mentionedBot) return true;
  const trimmed = (content || '').trimStart();
  return REQUEST_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/** 멘션·키워드 신호를 제거한 순수 요청 본문 (board 표시·중복 방지용). */
export function stripRequestSignal(content: string, botMentionRaw?: string): string {
  let text = (content || '').trim();
  if (botMentionRaw) {
    text = text.split(botMentionRaw).join('').trim();
  }
  // <@123>, <@!123> 형태 멘션 토큰 제거
  text = text.replace(/<@!?\d+>/g, '').trim();
  for (const prefix of REQUEST_PREFIXES) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  return text;
}

export function ownerRequestsPath(memoRoot: string): string {
  return path.join(memoRoot, '.claude', 'owner-requests.jsonl');
}

export interface CaptureInput {
  text: string;
  author: string;
  channelId: string;
  messageId: string;
  ts?: string;
}

/** owner 요청 1건 포착 → jsonl append (pending). 반환 = 저장된 레코드. */
export function captureOwnerRequest(memoRoot: string, input: CaptureInput): OwnerRequest {
  const ts = input.ts || new Date().toISOString();
  const id = `oreq-${ts.replace(/[^0-9]/g, '').slice(0, 14)}-${input.messageId.slice(-6)}`;
  const record: OwnerRequest = {
    id,
    ts,
    text: input.text,
    author: input.author,
    channelId: input.channelId,
    messageId: input.messageId,
    status: 'pending',
  };
  const filePath = ownerRequestsPath(memoRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  return record;
}

/** 전체 요청 — 같은 id 는 최신 레코드가 이김 (status 갱신 = append-wins). */
export function readOwnerRequests(memoRoot: string): OwnerRequest[] {
  const filePath = ownerRequestsPath(memoRoot);
  if (!fs.existsSync(filePath)) return [];
  const latestById = new Map<string, OwnerRequest>();
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as OwnerRequest;
      if (record && record.id) latestById.set(record.id, record);
    } catch {
      // 깨진 줄 skip
    }
  }
  return [...latestById.values()];
}

/** pending 요청만, 최신순. */
export function pendingOwnerRequests(memoRoot: string): OwnerRequest[] {
  return readOwnerRequests(memoRoot)
    .filter((record) => record.status === 'pending')
    .sort((a, b) => b.ts.localeCompare(a.ts));
}

// ── 요청 판정 + 도메인 분류 (멘션/키워드 fast path + LLM) ────────────────────
// 멘션/키워드 = fast path(요청 여부 즉시). 도메인은 LLM 이 판정 → 그 도메인 에이전트가
// 자기 스킨으로 응답 (욘 봇 기본 보이스 X, 세계관 정합). LLM 은 generate fn 주입 = 순수.

export type RequestDomain = 'WM' | 'KL' | 'KAR' | 'YB' | 'general';

/** 도메인 → 응답 에이전트 coreId. owner 요청을 그 도메인 담당이 자기 캐릭터로 응대. */
export const DOMAIN_AGENT: Record<RequestDomain, string> = {
  WM: 'wm-scout', // 🧙 게임 발굴·경험
  KL: 'kl-worker', // 🤖 KarmoLab 앱·웹
  YB: 'echo', // 📣 yawnbot·디스코드
  KAR: 'atlas', // 🛰 팀 인프라·조율
  general: 'atlas', // 모호 = 조율자 디폴트
};

const ALL_DOMAINS: RequestDomain[] = ['WM', 'KL', 'KAR', 'YB', 'general'];

export interface OwnerRequestClass {
  isRequest: boolean;
  domain: RequestDomain;
}

export type RequestClassifier = (text: string) => Promise<OwnerRequestClass>;

/** generate(prompt)→텍스트 LLM 을 {요청여부 + 도메인} 분류기로 래핑. JSON 응답 파싱. */
export function makeRequestClassifier(
  generate: (prompt: string) => Promise<string>,
): RequestClassifier {
  return async (text: string): Promise<OwnerRequestClass> => {
    const prompt = [
      '디스코드에서 사장(owner)이 보낸 메시지다. 두 가지를 판정해 JSON 으로만 답하라.',
      '1) request: 봇/팀에게 뭔가 해달라는 요청·부탁·작업지시인가? (잡담·인사·정보질문=false)',
      '2) domain: 요청 대상 — WM(게임) / KL(KarmoLab 앱·웹) / YB(디스코드 봇) / KAR(팀 인프라·자동화) / general(모호).',
      '출력 예: {"request": true, "domain": "WM"}',
      '',
      `메시지: "${text.slice(0, 500)}"`,
    ].join('\n');
    try {
      const raw = await generate(prompt);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return { isRequest: false, domain: 'general' };
      const parsed = JSON.parse(match[0]) as { request?: unknown; domain?: unknown };
      const domain = ALL_DOMAINS.includes(parsed.domain as RequestDomain)
        ? (parsed.domain as RequestDomain)
        : 'general';
      return { isRequest: parsed.request === true, domain };
    } catch {
      return { isRequest: false, domain: 'general' };
    }
  };
}

/**
 * owner 메시지 분류 — fast path(멘션/키워드)면 요청 확정, 도메인은 LLM.
 * classifier 없거나 너무 짧으면(<4) LLM skip → fast path 결과 + domain=general.
 */
export async function classifyOwnerRequest(
  content: string,
  mentionedBot: boolean,
  classifier?: RequestClassifier,
): Promise<OwnerRequestClass> {
  const fast = isOwnerRequest(content, mentionedBot);
  const trimmed = (content || '').trim();
  if (!classifier || trimmed.length < 4) {
    return { isRequest: fast, domain: 'general' };
  }
  try {
    const result = await classifier(trimmed);
    // fast path 매칭이면 요청은 확정(true 보강), 도메인은 LLM 판정 사용.
    return { isRequest: fast || result.isRequest, domain: result.domain };
  } catch {
    return { isRequest: fast, domain: 'general' };
  }
}

/** 요청 처리완료 마킹 — 같은 id 로 addressed 레코드 append (append-wins). */
export function markAddressed(memoRoot: string, id: string): boolean {
  const current = readOwnerRequests(memoRoot).find((record) => record.id === id);
  if (!current || current.status === 'addressed') return false;
  const updated: OwnerRequest = {
    ...current,
    status: 'addressed',
    addressedTs: new Date().toISOString(),
  };
  fs.appendFileSync(ownerRequestsPath(memoRoot), JSON.stringify(updated) + '\n', 'utf-8');
  return true;
}
