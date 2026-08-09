/**
 * samples.ts — 처음 여는 사람에게 보여줄 견본 (TASK-KL-202 격차 W).
 *
 * 빈 캔버스는 「무엇이든 할 수 있다」가 아니라 **「무엇을 해야 할지 모르겠다」** 로 읽힌다.
 * 그래서 팩마다 작은 견본을 두고, 한 번 눌러 깔아 보게 한다 — 지우고 자기 것을 그려도 되고,
 * 그 위에 고쳐 써도 된다(둘 다 맞는 길이라 강요하지 않는다).
 *
 * 견본은 **글 문법 그대로**다(`from-text.ts`). 새 팩이 생겨도 코드가 아니라 글 한 덩이가 는다.
 */

export const SAMPLES: Record<string, { title: string; outline: string }> = {
  worldview: {
    title: '작은 세계관',
    outline: [
      '마녀의 집',
      '  욘 : 살고 있음',
      '    마도서 : 연구함',
      '    링 : 만든 인형',
      '    알리사 : 만든 인형',
      '  마을 : 내려다봄',
      '    대장간 : 있음',
      '    광장 : 있음',
    ].join('\n'),
  },
  relation: {
    title: '네 사람의 관계',
    outline: [
      '주인공',
      '  소꿉친구 : ♡ 좋아함',
      '  라이벌 : ⚡ 라이벌',
      '  선배 : ★ 신뢰',
      '소꿉친구',
      '  라이벌 : ? 신경쓰임',
    ].join('\n'),
  },
  cardgame: {
    title: '한 턴 전개',
    outline: [
      '패의 카드 A',
      '  카드 B : ➲ 서치',
      '    토큰 : ☆ 소환',
      '      상대 몬스터 : ⚔ 공격',
      '  묘지의 카드 C : ✕ 버림',
      '    카드 D : ✺ 소생',
    ].join('\n'),
  },
  concept: {
    title: '주장 한 덩이',
    outline: [
      '주장',
      '  근거 1 : 뒷받침',
      '    사례 : 예시',
      '  근거 2 : 뒷받침',
      '  반론 : 반박',
      '    재반박 : 반박',
    ].join('\n'),
  },
  idea: {
    title: '구상 굴리기',
    outline: [
      '만들고 싶은 것',
      '  왜 만드나 : 질문',
      '  먼저 할 일 : 파생',
      '    막힌 곳 : 막힘',
      '  나중에 : 이어짐',
    ].join('\n'),
  },
  org: {
    title: '작은 팀',
    outline: [
      '팀',
      '  기획 : 담당',
      '    기획서 : 만듦',
      '  개발 : 담당',
      '    시제품 : 만듦',
      '  디자인 : 협업',
    ].join('\n'),
  },
};

export function sampleFor(packId: string): { title: string; outline: string } | null {
  return SAMPLES[packId] ?? null;
}
