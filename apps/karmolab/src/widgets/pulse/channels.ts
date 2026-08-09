/**
 * 박동의 방송 목록.
 *
 * 봇 아트 씬(Botwiki 가 「art bot = 봇이기 위한 봇」이라 부르는 갈래)을 다섯 갈래로 갈라
 * 한 갈래에 하나씩 세웠다. 갈래를 채우는 게 목적이라 서로 안 닮게 골랐다:
 *
 *   박동형 — 고정 주기로 무의미한 신호            → 세 글자 · 종
 *   눈금형 — 세상이 얼마나 지나갔는지 계속 알려줌   → 눈금
 *   소진형 — 유한한 목록을 끝까지 다 뱉고 **끝남**  → 낱말
 *   말뭉치형 — 재료 + 규칙 = 무한 변주             → 한 줄 · 무늬
 *   주술형 — 보는 사람이 제 의미를 갖다 붙임        → 점 (+ 세 글자의 「나만의 것」)
 *
 * 전부 `beat(tick)` 하나로 끝난다 — 저장도, 통신도, 서버도 없다.
 */
import type { Beat, Channel } from './core';
import { DAY, HOUR, MINUTE, bar, dateOf, pick, rngFor, tickOf, tickStart } from './core';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';

/* ── 박동형 ①: 세 글자 ─────────────────────────────────────────
   원본 `@3letter_` 의 몸통은 「Tvh」「Pat」처럼 첫 자만 대문자다. 그 모양을 지킨다.
   가끔 진짜 단어가 튀어나오는데(Pat, Sun), 그 우연이 이 봇의 전부다. */

function threeLetters(rand: () => number): string {
  return (
    UPPER[Math.floor(rand() * 26)] +
    LOWER[Math.floor(rand() * 26)] +
    LOWER[Math.floor(rand() * 26)]
  );
}

const letters: Channel = {
  id: 'letters',
  name: '세 글자',
  glyph: '🔤',
  period: 10 * MINUTE,
  blurb: '10분마다 세 글자. 뜻은 없다.',
  lineage: '@3letter_ — 「3 random letters every 10 mins」',
  beat(tick) {
    return { text: threeLetters(rngFor('letters', tick)), sub: '지금 이걸 보고 있는 모두가 같은 세 글자를 본다' };
  },
  personal(seed) {
    return {
      text: threeLetters(rngFor('letters/personal', seed)),
      sub: `${seed} 의 세 글자 — 이건 안 바뀐다`
    };
  }
};

/* ── 박동형 ②: 종 ──────────────────────────────────────────────
   `@big_ben_clock` 은 2009년부터 정각마다 BONG 을 시각 수만큼 쳤다. 48만 명이 그걸 본다. */

const bell: Channel = {
  id: 'bell',
  name: '종',
  glyph: '🔔',
  period: HOUR,
  local: true,
  blurb: '정각마다 시각 수만큼 종을 친다.',
  lineage: '@big_ben_clock — 2009년부터 정각마다 BONG',
  beat(tick) {
    const at = new Date(tickStart(bell, tick));
    const h24 = at.getHours();
    const h12 = h24 % 12 || 12;
    return {
      text: Array(h12).fill('BONG').join(' '),
      sub: `${h24}시 — ${h12}번`
    };
  }
};

/* ── 눈금형: 눈금 ──────────────────────────────────────────────
   `@year_progress` 는 한 해가 1% 갈 때마다 막대 하나를 올린다. 그것만 한다.
   여기서는 시·일·달·해를 한 번에 본다 — 지금이 어디쯤인지가 통째로 보인다. */

function spanRatio(now: Date, unit: 'hour' | 'day' | 'month' | 'year'): number {
  const t = now.getTime();
  if (unit === 'hour') return (now.getMinutes() * 60 + now.getSeconds()) / 3600;
  if (unit === 'day') {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return (t - midnight) / DAY;
  }
  if (unit === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    return (t - from) / (to - from);
  }
  const from = new Date(now.getFullYear(), 0, 1).getTime();
  const to = new Date(now.getFullYear() + 1, 0, 1).getTime();
  return (t - from) / (to - from);
}

const gauge: Channel = {
  id: 'gauge',
  name: '눈금',
  glyph: '📊',
  period: MINUTE,
  local: true,
  blurb: '이 시각·하루·이달·올해가 얼마나 지나갔나.',
  lineage: '@year_progress — 한 해가 1% 갈 때마다 막대 하나',
  beat(tick) {
    const at = new Date(tickStart(gauge, tick));
    /* 이름표는 전부 한글 두 자로 맞춘다 — 고정폭에서 한글은 두 칸이라, 글자 수가 다르면
       막대가 어긋난다(칸 수로 맞추려 해도 폰트마다 다르게 어긋난다). 같은 폭이면 안 어긋난다. */
    const rows: Array<[string, 'hour' | 'day' | 'month' | 'year']> = [
      ['시간', 'hour'],
      ['하루', 'day'],
      ['이달', 'month'],
      ['올해', 'year']
    ];
    const text = rows
      .map(([label, unit]) => {
        const r = spanRatio(at, unit);
        return `${label} ${bar(r)} ${(r * 100).toFixed(1).padStart(5, ' ')}%`;
      })
      .join('\n');
    return { text, sub: '돌이킬 수 없는 것들', mono: true };
  }
};

/* ── 소진형: 낱말 ──────────────────────────────────────────────
   `@everyword` 는 영어 사전을 7년에 걸쳐 한 단어씩 다 뱉고 **끝났다**. 끝난 것이 사건이었다.
   여기서 도는 것은 순우리말이다. 하루 두 번, 목록이 떨어지면 이 방송도 끝난다.
   끝나는 날짜가 지금 계산된다 — 그게 이 갈래의 전부다. */

const WORDS: ReadonlyArray<readonly [string, string]> = [
  ['가람', '강'],
  ['가온누리', '세상의 중심'],
  ['가시버시', '부부를 낮춰 이르는 말'],
  ['그루잠', '깨었다가 다시 든 잠'],
  ['그린내', '연인'],
  ['그느르다', '보살펴 돌보다'],
  ['곰비임비', '거듭거듭 쌓이는 모양'],
  ['구슬비', '풀잎에 맺힌 구슬 같은 비'],
  ['나비잠', '갓난아기가 두 팔을 벌리고 자는 잠'],
  ['나린', '하늘이 내린'],
  ['노고지리', '종달새'],
  ['노루잠', '자주 깨는 얕은 잠'],
  ['높새바람', '북동풍'],
  ['늘품', '앞으로 좋아질 품성'],
  ['늦사리', '제철보다 늦게 거두는 농작물'],
  ['다솜', '애틋한 사랑'],
  ['단미', '달콤한 여자, 사랑스러운 여인'],
  ['달무리', '달 언저리의 둥근 테'],
  ['닻별', '카시오페이아자리'],
  ['도담도담', '탈 없이 잘 자라는 모양'],
  ['돋을볕', '아침에 처음 솟아오르는 햇볕'],
  ['두남두다', '편들어 감싸 주다'],
  ['두레', '함께 일하려 모인 마을 조직'],
  ['둔치', '물가의 넓은 터'],
  ['드레', '인격적으로 점잖은 무게'],
  ['들마', '가게 문을 닫을 무렵'],
  ['마루', '하늘, 꼭대기'],
  ['마중물', '펌프에서 물을 끌어올리려 붓는 물'],
  ['마파람', '남풍'],
  ['매지구름', '비를 머금은 검은 조각구름'],
  ['머드러기', '과일·생선 중 크고 좋은 것'],
  ['모도리', '빈틈없이 아주 여무진 사람'],
  ['모람모람', '이따금씩 한데 몰아서'],
  ['모롱이', '산모퉁이의 휘어 둘린 곳'],
  ['목물', '허리 위를 물로 씻는 일'],
  ['무녀리', '한 배에서 처음 나온 새끼'],
  ['물비늘', '잔물결이 햇살에 반짝이는 모양'],
  ['미르', '용'],
  ['미리내', '은하수'],
  ['미쁘다', '믿음성이 있다'],
  ['미투리', '삼으로 삼은 신'],
  ['바람꽃', '큰 바람이 일 때 먼 산에 끼는 뽀얀 기운'],
  ['바림', '색을 점점 엷게 번지도록 칠하는 일'],
  ['반디', '반딧불이'],
  ['밤마을', '밤에 이웃으로 놀러 가는 일'],
  ['버금', '으뜸의 바로 아래'],
  ['벼리', '그물의 위쪽 코를 꿰어 잡아당기는 줄'],
  ['별하', '별을 사랑하는 사람'],
  ['볕뉘', '작은 틈으로 잠깐 비치는 볕'],
  ['보늬', '밤·도토리의 속껍질'],
  ['볼우물', '보조개'],
  ['봄맞이', '봄을 맞는 일'],
  ['부아', '분하고 노여운 마음'],
  ['붉새', '동틀 무렵의 붉은 하늘빛'],
  ['비나리', '앞길의 행복을 비는 말'],
  ['비마중', '비 오는 것을 나가서 맞이함'],
  ['비바리', '바다에서 해산물을 캐는 처녀'],
  ['사부자기', '별로 힘들이지 않고 가볍게'],
  ['산돌림', '이리저리 돌아다니며 오는 소나기'],
  ['살밑', '화살촉'],
  ['상고대', '나무나 풀에 내려 눈처럼 된 서리'],
  ['새녘', '동쪽'],
  ['새벽동자', '새벽에 밥을 짓는 일'],
  ['서리꽃', '유리창에 서린 김이 얼어붙은 무늬'],
  ['서리서리', '국수·실 등을 헝클지 않게 포개어 감는 모양'],
  ['설레발', '몹시 서두르며 부산하게 구는 짓'],
  ['소담하다', '생김새가 탐스럽다'],
  ['소소리바람', '이른 봄의 맵고 스산한 바람'],
  ['손사래', '거절하며 손을 펴서 내젓는 짓'],
  ['시나브로', '모르는 사이에 조금씩'],
  ['시울', '약간 굽은 곳의 가장자리'],
  ['아띠', '사랑'],
  ['아람', '저절로 충분히 익은 밤이나 상수리'],
  ['아우름', '여럿을 하나로 모음'],
  ['안다미로', '그릇에 넘치도록 가득'],
  ['알천', '재산 중 가장 값나가는 물건'],
  ['애오라지', '겨우, 오로지'],
  ['어스름', '조금 어둑한 상태'],
  ['얼레빗', '살이 굵고 성긴 큰 빗'],
  ['여우비', '볕이 난 날 잠깐 오는 비'],
  ['오롯이', '모자람 없이 온전하게'],
  ['온새미로', '가르지 않고 생긴 그대로'],
  ['옹달샘', '작고 오목한 샘'],
  ['우수리', '거스름돈, 나머지'],
  ['움딸', '죽은 딸의 남편이 새로 얻은 아내'],
  ['웃비', '한창 내리다가 잠시 그친 비'],
  ['이든', '착한, 어진'],
  ['자맥질', '물속에서 팔다리를 놀리며 오르내리는 짓'],
  ['자우룩', '연기·안개가 잔뜩 끼어 흐릿한 모양'],
  ['잔별', '작게 보이는 별'],
  ['잠포록하다', '날이 흐리고 바람이 없다'],
  ['재넘이', '밤에 산에서 골짜기로 부는 바람'],
  ['지새다', '달이 서쪽으로 넘어가며 밤이 새다'],
  ['짜장', '과연, 정말로'],
  ['찔레꽃머리', '찔레꽃이 필 무렵, 초여름'],
  ['칼바람', '매섭고 독한 바람'],
  ['큰기침', '위엄을 부리려 크게 하는 기침'],
  ['타래', '실·새끼를 사려 뭉친 것'],
  ['터알', '집의 울안에 있는 작은 밭'],
  ['톺아보다', '샅샅이 더듬어 살피다'],
  ['푸나무', '풀과 나무'],
  ['하늬바람', '서풍'],
  ['한울', '온 세상, 하늘'],
  ['함초롬', '가지런하고 곱게 젖은 모양'],
  ['해거름', '해가 서쪽으로 넘어가는 무렵'],
  ['해넘이', '해가 지는 일'],
  ['햇귀', '해가 처음 솟을 때의 빛'],
  ['헤윰', '생각'],
  ['호젓하다', '무서울 만큼 고요하고 쓸쓸하다'],
  ['흐노니', '누군가를 몹시 그리워하니'],
  ['희나리', '덜 마른 장작'],
  ['가시버시길', '부부가 함께 걷는 길'],
  ['꽃가람', '꽃이 있는 강'],
  ['꽃샘추위', '꽃 필 무렵의 갑작스러운 추위'],
  ['나르샤', '날아오르다'],
  ['남새밭', '채소밭'],
  ['너울', '바다의 크고 사나운 물결'],
  ['노루막이', '산의 막다른 꼭대기'],
  ['눈꽃', '나뭇가지에 꽃처럼 붙은 눈'],
  ['도래샘', '빙 돌아서 흐르는 샘물'],
  ['마음자리', '마음의 바탕'],
  ['맞갖다', '마음에 꼭 맞다'],
  ['메밀꽃', '물결의 하얀 거품을 이르는 말'],
  ['민들레', '홀씨로 멀리 가는 풀'],
  ['보드기', '크게 자라지 못한 나무'],
  ['산마루', '산등성이의 가장 높은 곳'],
  ['살푸슴', '소리 없이 빙긋 웃는 웃음'],
  ['실비', '가늘게 내리는 비'],
  ['심마니', '산삼 캐는 것을 업으로 하는 사람'],
  ['아라', '바다'],
  ['아리아리', '길을 헤쳐 나갈 때 외치는 소리'],
  ['윤슬', '햇빛·달빛에 비쳐 반짝이는 잔물결'],
  ['이슬떨이', '이슬 맺힌 풀숲을 먼저 헤치고 가는 사람'],
  ['해미', '바다 위에 낀 짙은 안개'],
  ['가랑비', '가늘게 내리는 비'],
  ['겨우내', '한겨울 동안 계속해서'],
  ['길라잡이', '앞에서 길을 인도하는 사람'],
  ['우레', '천둥'],
  ['소맷귀', '소맷부리의 구석'],
  ['달보드레하다', '연하고 달콤하다'],
  ['새록새록', '새로운 것이 자꾸 생기는 모양'],
  ['얼떨결', '뜻밖의 일에 정신이 얼떨떨한 사이']
];

/** 이 방송이 첫 낱말을 뱉은 순간 (이곳 시각 기준). */
const WORD_EPOCH = new Date(2026, 7, 1, 0, 0, 0).getTime(); // 2026-08-01 00:00
const WORD_PERIOD = 12 * HOUR;

const word: Channel = {
  id: 'word',
  name: '낱말',
  glyph: '📖',
  period: WORD_PERIOD,
  local: true,
  blurb: `순우리말 ${WORDS.length}개를 하루 두 번씩. 다 뱉으면 이 방송은 끝난다.`,
  lineage: '@everyword — 영어 사전을 7년에 걸쳐 다 소진하고 끝냄',
  beat(tick) {
    const first = tickOf(word, WORD_EPOCH);
    const idx = tick - first;
    const endsAt = tickStart(word, first + WORDS.length);
    if (idx < 0) return { text: '…', sub: `${dateOf(WORD_EPOCH)} 에 시작한다` };
    if (idx >= WORDS.length) {
      return { text: '— 끝 —', sub: `${WORDS.length}개를 다 뱉었다. ${dateOf(endsAt)} 에 끝났다.` };
    }
    const [w, meaning] = WORDS[idx];
    return {
      text: w,
      sub: `${meaning} · ${idx + 1} / ${WORDS.length} · ${dateOf(endsAt)} 에 끝난다`
    };
  }
};

/* ── 말뭉치형 ①: 한 줄 ─────────────────────────────────────────
   재료를 규칙에 꽂아 무한히 만든다. 뜻이 통할 때가 있는데, 그건 순전히 사고다. */

const ADNOMINAL = [
  '잊혀진', '축축한', '아주 작은', '이름 없는', '고장난', '너무 늦은', '조용한',
  '반쯤 지워진', '길 잃은', '수요일의', '값싼', '거대한', '눅눅한', '마지막',
  '두 번째로 슬픈', '아무도 안 쓰는', '오래된', '반짝이는'
] as const;
const NOUN = [
  '우체통', '고양이', '자판기', '엘리베이터', '해파리', '주차장', '냉장고',
  '등대', '복사기', '북극곰', '지하철', '문어', '가로등', '세탁기', '달팽이',
  '전화번호부', '옥상', '나침반', '트램펄린', '수족관'
] as const;
const ADVERB = [
  '천천히', '아주 진지하게', '몰래', '결국', '어쩔 수 없이', '거꾸로', '정확히 세 번',
  '아무 이유 없이', '영원히', '오늘만', '잘못', '너무 크게', '조심스럽게'
] as const;
const VERB = [
  '기다린다', '사과한다', '잠든다', '흩어진다', '노래한다', '도망친다', '녹는다',
  '되돌아온다', '깜빡인다', '가라앉는다', '고백한다', '자란다', '멈춘다', '넘어진다'
] as const;

/** 받침이 있으면 「이」, 없으면 「가」. 이걸 안 하면 「트램펄린가」 같은 게 나온다. */
function subjectParticle(noun: string): string {
  const last = noun.charCodeAt(noun.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  if (!isHangul) return '가';
  return (last - 0xac00) % 28 === 0 ? '가' : '이';
}

const sentence: Channel = {
  id: 'sentence',
  name: '한 줄',
  glyph: '💬',
  period: HOUR,
  blurb: '한 시간에 한 문장. 문법은 맞고 뜻은 없다.',
  lineage: 'Darius Kazemi / NaNoGenMo — 말뭉치 + 규칙으로 짓는 봇 시(詩)',
  beat(tick) {
    const r = rngFor('sentence', tick);
    const noun = pick(r, NOUN);
    return {
      text: `${pick(r, ADNOMINAL)} ${noun}${subjectParticle(noun)} ${pick(r, ADVERB)} ${pick(r, VERB)}.`,
      sub: `${ADNOMINAL.length}×${NOUN.length}×${ADVERB.length}×${VERB.length} = ${(
        ADNOMINAL.length * NOUN.length * ADVERB.length * VERB.length
      ).toLocaleString()}가지 중 하나`
    };
  }
};

/* ── 말뭉치형 ②: 무늬 ──────────────────────────────────────────
   하루에 하나. 오늘 것은 오늘만 나오고, 어제 것은 되감으면 다시 나온다. */

const SHADES = [' ', '░', '▒', '▓', '█'] as const;

const pattern: Channel = {
  id: 'pattern',
  name: '무늬',
  glyph: '🔳',
  period: DAY,
  local: true,
  blurb: '오늘의 무늬 한 장. 내일이면 사라진다(되감으면 다시 나온다).',
  lineage: 'Botwiki #generative-art — 매일 한 장 뱉는 그림 봇들',
  beat(tick) {
    const r = rngFor('pattern', tick);
    const size = 9;
    /* 왼쪽 절반만 뽑고 거울로 접는다 — 그냥 난수는 지저분한데, 접으면 무늬가 된다. */
    const half = Math.ceil(size / 2);
    const rows: string[] = [];
    for (let y = 0; y < size; y++) {
      const left: string[] = [];
      for (let x = 0; x < half; x++) {
        const weight = r();
        const level = weight < 0.34 ? 0 : weight < 0.55 ? 1 : weight < 0.75 ? 2 : weight < 0.92 ? 3 : 4;
        left.push(SHADES[level]);
      }
      const right = left.slice(0, size - half).reverse();
      rows.push([...left, ...right].map((c) => c + c).join(''));
    }
    return { text: rows.join('\n'), sub: `${dateOf(tickStart(pattern, tick))} 의 무늬`, mono: true };
  }
};

/* ── 주술형: 점 ────────────────────────────────────────────────
   15분마다 지구 표면의 한 점. 열에 일곱은 바다다 — 그게 정직한 결과다.
   보는 사람이 「거기 지금 뭐가 있을까」를 갖다 붙이는 순간 이 방송은 완성된다. */

function hemisphere(lat: number, lon: number): string {
  const ns = lat >= 0 ? '북' : '남';
  const ew = lon >= 0 ? '동' : '서';
  return `${ns}반구 · ${ew}경 쪽`;
}

const spot: Channel = {
  id: 'spot',
  name: '점',
  glyph: '🌐',
  period: 15 * MINUTE,
  blurb: '15분마다 지구 위의 한 점. 대개는 바다다.',
  lineage: '@earthgeobot 류 — 뜻 없는 좌표를 계속 던지는 지리 봇',
  beat(tick) {
    const r = rngFor('spot', tick);
    /* 위도를 그냥 균등하게 뽑으면 극지방이 과대표집된다. 구면에서 고르려면 sin 을 균등하게. */
    const lat = (Math.asin(2 * r() - 1) * 180) / Math.PI;
    const lon = r() * 360 - 180;
    const fmt = (v: number, pos: string, neg: string): string =>
      `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;
    return {
      text: `${fmt(lat, 'N', 'S')}  ${fmt(lon, 'E', 'W')}`,
      sub: `${hemisphere(lat, lon)} · 구면에서 고르게 뽑은 한 점`
    };
  }
};

export const CHANNELS: readonly Channel[] = [letters, bell, gauge, word, sentence, pattern, spot];

export type { Beat, Channel };
