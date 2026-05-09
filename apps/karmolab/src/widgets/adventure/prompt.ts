/**
 * 무한 텍스트 어드벤처 prompt builder — KL-032 결정 4 (자유+선택지 N개) + 7 (티메토 narrative 통합).
 *
 * system instruction = 티메토 GM 1인칭 톤. NPC 만남 시 컨텍스트 합성.
 * 출력 형식 = narrative + ▼ 선택지 + (선택) [NPC:slug] / [SCENE:title] 토큰.
 */
import { buildCastContext, listAllCharacterSlugs } from './npc-context';

const TURN_OUTPUT_FORMAT = `
당신의 출력은 정확히 다음 구조여야 합니다:

\`\`\`
<narrative — 한국어 서술. 2-6 문단. 티메토 1인칭 GM 톤. 조수님 = 사용자 호칭, 존댓말. 사용자가 직전에 박은 행동의 결과를 묘사>

▼
1. <짧은 선택지 1>
2. <짧은 선택지 2>
3. <짧은 선택지 3>
\`\`\`

규칙:
- ▼ 줄 하나 박고 그 아래 1번부터 N번 (보통 3개, 상황에 따라 2-4개) 선택지.
- 선택지는 짧게 (한 줄). 각 선택지가 *다른 결과* 를 약속해야 함.
- 사용자가 선택지 외 자유 입력도 가능 — 그 경우 narrative 가 자유 행동을 받아주세요.
- NPC 만남 시 narrative 안에 \`[NPC:slug]\` 토큰 박음 (slug 는 등록된 캐릭터 — alisa / ling / timeto / yon / fourth).
- 새 장소 진입 시 \`[SCENE:title]\` 토큰 박음 (선택).
- 모험 종료 트리거: 사용자가 명시적으로 종료 의사 표시 (예: "여기서 일단 마무리할게요") 한 경우만. narrative 끝에 \`[END]\` 토큰 박음. 그 외엔 모험 계속.
`.trim();

const CHARACTER_TIMETO_TONE = `
당신은 KarmoLab 의 마스코트 캐릭터 "티메토" 의 페르소나로, 무한 텍스트 어드벤처의 GM 입니다.

티메토 캐릭터:
- 소녀 연구소장. 조수님 (= 사용자) 을 안내하는 마스코트.
- 호칭: 사용자 = "조수님". 1인칭 = "저".
- 존댓말. 조용하고 살짝 들뜬 톤. "...네요!", "...랍니다", "...일까요?" 같은 어미.
- 모험을 진행하면서 가끔 자기 의견을 살짝 던지기도 함.
- KarmoWorld 의 모든 캐릭터를 알고 있고, NPC 처럼 직접 등장하기보다는 GM 으로서 무대를 꾸민다.

KarmoWorld 무대:
- 같은 우주의 다른 무대들이 공존 (KarmoLab 연구소 / WitchMendokusai 마법탑 / Yon 의 집 / Mansion 저택 등).
- 모험 진행 중 배경 / NPC 는 KarmoWorld 의 기존 entity 활용.
`.trim();

export interface BuildSystemInstructionOpts {
  /** 모험 시작 시 cast 박은 NPC slug 들. 모험 도중 NPC 새로 등장할 때 prompt 갱신 가능 */
  castSlugs?: string[];
  /** 사용 가능한 NPC slug 목록 노출 — LLM 이 [NPC:slug] 토큰 박을 때 참고 */
  exposeCharacterRoster?: boolean;
}

export function buildSystemInstruction(opts: BuildSystemInstructionOpts = {}): string {
  const blocks: string[] = [CHARACTER_TIMETO_TONE];

  if (opts.exposeCharacterRoster !== false) {
    const all = listAllCharacterSlugs();
    if (all.length > 0) {
      const roster = all.map((c) => `- ${c.slug}: ${c.name}`).join('\n');
      blocks.push('등록된 KarmoWorld 캐릭터 (NPC 토큰에 사용 가능):\n' + roster);
    }
  }

  if (opts.castSlugs && opts.castSlugs.length > 0) {
    const cast = buildCastContext(opts.castSlugs);
    if (cast) {
      blocks.push('## 이번 모험의 cast (자세한 컨텍스트)\n\n' + cast);
    }
  }

  blocks.push(TURN_OUTPUT_FORMAT);
  return blocks.join('\n\n---\n\n');
}

export interface ParsedTurn {
  narrative: string;
  choices: string[];
  npcSlugs: string[];
  sceneTitles: string[];
  ended: boolean;
}

/** LLM 응답 파싱 — narrative / 선택지 / NPC / SCENE / END 토큰 추출 */
export function parseTurnResponse(text: string): ParsedTurn {
  const ended = /\[END\]/i.test(text);
  const npcSlugs = Array.from(text.matchAll(/\[NPC:([a-z0-9_-]+)\]/gi)).map((m) => m[1]);
  const sceneTitles = Array.from(text.matchAll(/\[SCENE:([^\]]+)\]/gi)).map((m) => m[1].trim());

  const triangleIndex = text.indexOf('▼');
  let narrative = '';
  const choices: string[] = [];

  if (triangleIndex >= 0) {
    narrative = text.slice(0, triangleIndex).trim();
    const choicesBlock = text.slice(triangleIndex + 1);
    const lines = choicesBlock.split(/\r?\n/);
    for (const line of lines) {
      const m = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);
      if (m) {
        choices.push(m[2].trim());
      }
    }
  } else {
    narrative = text.trim();
  }

  // tokens 정리
  narrative = narrative
    .replace(/\[NPC:[a-z0-9_-]+\]/gi, '')
    .replace(/\[SCENE:[^\]]+\]/gi, '')
    .replace(/\[END\]/gi, '')
    .trim();

  return { narrative, choices, npcSlugs, sceneTitles, ended };
}
