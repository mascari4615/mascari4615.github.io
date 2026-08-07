/**
 * 끝말잇기 — 얘와 주고받는 첫 놀이.
 *
 * 레퍼런스에서 배운 것: 저쪽은 **말만 하지 않는다.** 같이 게임하고 노래하고 본다. 곁에
 * 있는 것과 대화창에 앉아 있는 것의 차이가 거기서 갈린다. 우리 얘와 조수님 사이엔 놀이가
 * 하나도 없었다 — 오직 묻고 답하기뿐.
 *
 * 왜 하필 끝말잇기인가. **판정이 기계로 딱 떨어진다.** 두뇌한테 「이거 맞아?」를 맡기면
 * 헛소리를 하고, 헛소리로 이기는 놀이는 재미가 없다. 규칙은 여기서 판정하고 두뇌는
 * 아예 부르지 않는다 — 놀이는 즉답이어야 한다. 3초 뒤에 오는 「사과!」는 놀이가 아니다.
 *
 * 그리고 **얘도 진다.** 낼 말이 떨어지면 순순히 진다. 안 지는 상대와 하는 놀이는 놀이가
 * 아니다.
 */

/** 놀이판. 바깥에서 그대로 들고 다닐 수 있게 통짜 값으로 둔다. */
export interface WordChain {
  /** 지금까지 나온 말. 순서대로. */
  used: readonly string[];
  /** 다음에 이어야 할 글자. 처음이면 null. */
  next: string | null;
  /** 누가 낼 차례인가. */
  turn: '조수님' | '나';
  /** 끝났으면 누가 이겼나. */
  winner: '조수님' | '나' | null;
}

export interface Judgement {
  ok: boolean;
  /** 안 되면 왜 안 되는지 (사람이 읽는 말). */
  why: string;
}

const 한글만 = /^[가-힣]+$/;

/**
 * 두음법칙 — 「라면」의 「라」로 이을 때 「나」로도 이을 수 있다.
 *
 * 이걸 빼면 놀이가 억지스러워진다. 사람은 실제로 이렇게 논다.
 */
const 두음: Record<string, string> = {
  라: '나', 래: '내', 로: '노', 뢰: '뇌', 루: '누', 르: '느', 리: '이',
  랴: '야', 려: '여', 례: '예', 료: '요', 류: '유',
  녀: '여', 뇨: '요', 뉴: '유', 니: '이',
};

/** 이 글자로 이을 수 있는 첫 글자들. */
export function canFollow(letter: string): readonly string[] {
  const 바뀐것 = 두음[letter];
  return 바뀐것 === undefined ? [letter] : [letter, 바뀐것];
}

/** 빈 놀이판. */
export function startWordChain(): WordChain {
  return { used: [], next: null, turn: '조수님', winner: null };
}

/** 이 말을 지금 낼 수 있나. */
export function judge(chain: WordChain, word: string): Judgement {
  const w = word.trim();
  if (한글만.test(w) === false) return { ok: false, why: '한글로만 해야지.' };
  if (w.length < 2) return { ok: false, why: '한 글자는 안 돼.' };
  if (chain.used.includes(w)) return { ok: false, why: '그건 아까 나왔잖아.' };
  if (chain.next !== null && canFollow(chain.next).includes(w[0]) === false) {
    return { ok: false, why: `「${chain.next}」로 시작해야지.` };
  }
  return { ok: true, why: '' };
}

/**
 * 한 수 둔다. 규칙에 어긋나면 판이 그대로고, 낸 쪽이 진다.
 *
 * 규칙을 어겼다고 그냥 무르지 않는 이유는, 무르는 놀이에는 긴장이 없기 때문이다.
 */
export function play(chain: WordChain, word: string, by: '조수님' | '나'): { chain: WordChain; judged: Judgement } {
  if (chain.winner !== null) return { chain, judged: { ok: false, why: '이미 끝났어.' } };

  const judged = judge(chain, word);
  if (judged.ok === false) {
    return { chain: { ...chain, winner: by === '나' ? '조수님' : '나' }, judged };
  }

  const w = word.trim();
  return {
    chain: {
      used: [...chain.used, w],
      next: w[w.length - 1],
      turn: by === '조수님' ? '나' : '조수님',
      winner: null,
    },
    judged,
  };
}

/**
 * 얘가 낼 말을 고른다. 없으면 null — 그러면 진다.
 *
 * 두뇌를 안 쓰는 이유는 놀이가 **즉답**이어야 해서다. 아는 말이 적어 자주 지는 건
 * 흠이 아니다 — 지는 상대라야 이길 맛이 난다.
 */
export function pickWord(chain: WordChain, words: readonly string[], roll: () => number = Math.random): string | null {
  const 가능 = words.filter((w) => judge(chain, w).ok);
  if (가능.length === 0) return null;
  return 가능[Math.floor(roll() * 가능.length) % 가능.length];
}

/**
 * 얘가 아는 말.
 *
 * 처음엔 일흔 개쯤이었는데 살아 있는 얘로 놀아 보니 **한두 수 만에 졌다.** 지는 게 흠은
 * 아니지만 한 수 만에 끝나면 그건 놀이가 아니라 버튼이다. 흔히 나오는 끝 글자를 메워
 * 몇 수는 주고받게 늘렸다. 여전히 끝은 있다 — 언젠가는 진다.
 */
export const 아는말: readonly string[] = [
  '사과', '과일', '일기', '기차', '차표', '표지', '지도', '도시', '시계', '계단',
  '단추', '추석', '석유', '유리', '리본', '본색', '색종이', '이불', '불꽃', '꽃길',
  '길목', '목소리', '리듬', '성냥', '이야기', '기린', '린스', '스승',
  '승강기', '기억', '억새', '새벽', '벽지', '지우개', '개나리', '나비', '비누', '누룽지',
  '마녀', '녀석', '석양', '양말', '말씀', '씀바귀', '귀신', '신발', '발자국', '국수',
  '수건', '건물', '물감', '감자', '자석', '석탄', '탄산', '산책', '책상', '상자',
  '고양이', '이름', '바다', '다리', '리무진', '진주', '주머니', '니트', '트럭',
  '컴퓨터', '터널', '널빤지', '지붕', '붕어', '어깨', '깨알', '알사탕', '탕수육', '육개장',

  // 자주 걸리는 끝 글자를 메우는 말들 — 라이브에서 한두 수 만에 지길래 보탰다.
  '무지개', '개미', '미소', '소나무', '무늬', '나무', '목련', '연필', '필통', '통조림',
  '림프', '프라이', '이슬', '슬리퍼', '퍼즐', '즐거움', '움직임', '임금', '금요일', '일요일',
  '석고', '고구마', '마늘', '보물', '물고기', '기와', '와인', '인형', '형광펜',
  '펜션', '트리', '리어카', '카메라', '라디오', '오징어', '어부', '부엌', '엌간',
  '자전거', '거미', '미역', '역사', '사탕', '탕약', '약국', '국화', '화분', '분수',
  '수박', '박수', '수첩', '첩보', '보리', '리코더', '더위', '위성', '성문', '문어',
  '어항', '항구', '구름', '새싹', '싹수', '수염', '염소', '소금', '금붕어',
  '노래', '래퍼', '퍼레이드', '드레스', '스키', '키위', '위로', '로봇', '봇짐', '짐칸',
  '칸막이', '이사', '사냥', '반지', '지팡이', '이마', '마차', '차선', '선물',
  '물통', '통나무', '무대', '대나무', '무침', '침대', '대문', '문고리', '리셋', '셋방',
  '방석', '석류', '유리창', '창문', '문서', '서점', '점심', '심장', '장미', '미술',
  '술래', '일상', '상추', '추억', '억지', '지혜', '혜성', '성탄', '탄생',
  '생일', '일출', '출구', '구두', '두부', '부엉이', '이끼', '끼니', '니은', '은하수',
];

/** 판이 어떻게 됐는지 한마디로. */
export function saySomething(chain: WordChain, judged: Judgement, played: string | null): string {
  if (chain.winner === '조수님') return `…${judged.why} 내가 졌네.`;
  if (chain.winner === '나') return `${judged.why} 내가 이겼다.`;
  return played ?? '…';
}
