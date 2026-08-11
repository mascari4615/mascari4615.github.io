/**
 * samples.ts — 처음 여는 사람에게 보여줄 견본 (TASK-KL-202 격차 W).
 *
 * 빈 캔버스는 「무엇이든 할 수 있다」가 아니라 **「무엇을 해야 할지 모르겠다」** 로 읽힌다.
 * 그래서 팩마다 작은 견본을 두고, 한 번 눌러 깔아 보게 한다 — 지우고 자기 것을 그려도 되고,
 * 그 위에 고쳐 써도 된다(둘 다 맞는 길이라 강요하지 않는다).
 *
 * 견본은 **글 문법 그대로**다(`from-text.ts`). 새 팩이 생겨도 코드가 아니라 글 한 덩이가 는다.
 */
import { t } from '../../lib/i18n';


/* 견본은 **한 덩이 글**이라 통째로 한 열쇠에 담는다 — 줄마다 쪼개면 들여쓰기가 뜻인 문법이 깨진다.
   읽는 순간에 정해지도록 getter 로 둔다. */
export const SAMPLES: Record<string, { title: string; outline: string }> = {
  worldview: {
    get title() { return t('karmograph.sample.worldview.title'); },
    get outline() { return t('karmograph.sample.worldview.outline'); },
  },
  relation: {
    get title() { return t('karmograph.sample.relation.title'); },
    get outline() { return t('karmograph.sample.relation.outline'); },
  },
  cardgame: {
    get title() { return t('karmograph.sample.cardgame.title'); },
    get outline() { return t('karmograph.sample.cardgame.outline'); },
  },
  concept: {
    get title() { return t('karmograph.sample.concept.title'); },
    get outline() { return t('karmograph.sample.concept.outline'); },
  },
  idea: {
    get title() { return t('karmograph.sample.idea.title'); },
    get outline() { return t('karmograph.sample.idea.outline'); },
  },
  org: {
    get title() { return t('karmograph.sample.org.title'); },
    get outline() { return t('karmograph.sample.org.outline'); },
  },
};

export function sampleFor(packId: string): { title: string; outline: string } | null {
  return SAMPLES[packId] ?? null;
}


/**
 * 첫 화면의 **들어오는 문** (TASK-KL-202 방향②).
 *
 * 빈 판 + 기능 60개는 「무엇이든 된다」가 아니라 「무엇부터 할지 모르겠다」로 읽힌다.
 * 그래서 이 도구가 실제로 쓰이는 세 자리를 먼저 묻는다 — 고르면 그 갈래의 **견본 + 종류 + 칸 틀**이
 * 한꺼번에 깔린다(갈래는 고정이 아니다. 언제든 다른 종류를 섞어 쓸 수 있다).
 */
export const INTENTS: { packId: string; icon: string; title: string; sub: string }[] = [
  {
    packId: 'relation',
    icon: '🫂',
    get title() { return t('karmograph.intent.relation.title'); },
    get sub() { return t('karmograph.intent.relation.sub'); },
  },
  {
    packId: 'worldview',
    icon: '🌍',
    get title() { return t('karmograph.intent.worldview.title'); },
    get sub() { return t('karmograph.intent.worldview.sub'); },
  },
  {
    packId: 'concept',
    icon: '💭',
    get title() { return t('karmograph.intent.concept.title'); },
    get sub() { return t('karmograph.intent.concept.sub'); },
  },
];
