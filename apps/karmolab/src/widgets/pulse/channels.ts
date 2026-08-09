/**
 * 박동의 방송 목록.
 *
 * 봇 아트 씬(Botwiki 가 「art bot = 봇이기 위한 봇」이라 부르는 갈래)을 다섯 갈래로 갈라
 * 한 갈래에 하나씩 세웠다. 갈래를 채우는 게 목적이라 서로 안 닮게 골랐다:
 *
 *   글자형 — 뜻 없는 글자가 흐르다 **가끔 진짜 낱말**  → `letters.ts` (이 도구의 중심)
 *   박동형 — 고정 주기로 무의미한 신호            → 종(소리)
 *   눈금형 — 세상이 얼마나 지나갔는지 계속 알려줌   → 눈금
 *   소진형 — 유한한 목록을 끝까지 다 뱉고 **끝남**  → 낱말(넉 달) · 음절(7년 8개월)
 *   말뭉치형 — 재료 + 규칙 = 무한 변주             → 한 줄
 *   주술형 — 보는 사람이 제 의미를 갖다 붙임        → 점 (+ 세 글자의 「나만의 것」)
 *   그림형 — 그리지 않으면 흉내가 안 나는 것        → `art.ts` (별밭 하나만 남음)
 *
 * 전부 `beat(tick)` 하나로 끝난다 — 저장도, 통신도, 서버도 없다.
 */
import type { Beat, Channel } from './core';
import { t } from '../../lib/i18n';
import { ART_CHANNELS, bellPaint, gaugePaint } from './art';
import { LETTER_CHANNELS } from './letters';
import { DAY, HOUR, MINUTE, dateOf, pick, rngFor, tickOf, tickStart } from './core';

/* ── 박동형 ②: 종 ──────────────────────────────────────────────
   `@big_ben_clock` 은 2009년부터 정각마다 BONG 을 시각 수만큼 쳤다. 48만 명이 그걸 본다.

   **여기서 본체는 소리다.** 「BONG」이라고 적힌 글자에는 아무 뜻이 없다 —
   트위터에서 그게 통한 건 읽는 사람 머릿속에서 소리가 났기 때문이다. 화면에서는 그게 안 된다.
   그래서 진짜로 친다(사용자 지적, 2026-08-09). 글자는 자막으로 강등. */

/** 종 한 번. 배음이 정수배가 아닌 것이 종소리의 정체다 — 정수배로 쌓으면 오르간이 된다. */
function strike(ac: AudioContext, at: number, base: number, gain: number): void {
  const partials: Array<[number, number, number]> = [
    // [배음비, 크기, 길이(초)]
    [0.5, 0.6, 5.5], // 험(hum) — 낮게 오래 남는 것
    [1.0, 1.0, 4.2],
    [1.19, 0.5, 3.0],
    [1.56, 0.4, 2.2],
    [2.0, 0.45, 1.8],
    [2.66, 0.25, 1.1],
    [3.42, 0.18, 0.7],
    [4.97, 0.12, 0.45]
  ];
  for (const [ratio, amp, life] of partials) {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = base * ratio;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain * amp, at + 0.004); // 때리는 순간
    env.gain.exponentialRampToValueAtTime(0.0001, at + life); // 길게 사라짐
    osc.connect(env);
    env.connect(ac.destination);
    osc.start(at);
    osc.stop(at + life + 0.05);
  }
}

const bell: Channel = {
  id: 'bell',
  get name() { return t('pulse.ch.bell.name'); },
  glyph: '🔔',
  period: HOUR,
  local: true,
  tile: 'unit',
  get blurb() { return t('pulse.ch.bell.blurb'); },
  get lineage() { return t('pulse.ch.bell.lineage'); },
  beat(tick) {
    const at = new Date(tickStart(bell, tick));
    const h24 = at.getHours();
    const h12 = h24 % 12 || 12;
    return {
      line: t('pulse.bell.line', { h: h24, n: h12 }),
      sub: t('pulse.bell.sub'),
      paint: bellPaint(h12),
      sound(ac, when) {
        /* 낮의 종은 높고 밤의 종은 낮다 — 같은 소리를 스물네 번 들으면 시각을 잃는다. */
        const base = 262 - (h24 / 24) * 70;
        for (let i = 0; i < h12; i++) strike(ac, when + i * 1.15, base, 0.16);
      }
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
  get name() { return t('pulse.ch.gauge.name'); },
  glyph: '📊',
  period: MINUTE,
  local: true,
  tile: 'unit',
  get blurb() { return t('pulse.ch.gauge.blurb'); },
  get lineage() { return t('pulse.ch.gauge.lineage'); },
  beat(tick) {
    const at = new Date(tickStart(gauge, tick));
    /* 막대를 블록문자(▓░)로 찍었다가 캔버스로 옮겼다 — 한글 이름표와 블록문자는 폰트마다
       칸 폭이 달라서, 어떻게 맞춰도 어느 기계에선가 어긋나 뭉갠다(사용자 지적, 2026-08-09). */
    const rows: Array<[string, 'hour' | 'day' | 'month' | 'year']> = [
      [t('pulse.gauge.hour'), 'hour'],
      [t('pulse.gauge.day'), 'day'],
      [t('pulse.gauge.month'), 'month'],
      [t('pulse.gauge.year'), 'year']
    ];
    const measured = rows.map(([label, unit]) => [label, spanRatio(at, unit)] as const);
    return {
      line: measured.map(([label, r]) => `${label} ${(r * 100).toFixed(1)}%`).join(' · '),
      sub: t('pulse.gauge.sub'),
      paint: gaugePaint(measured)
    };
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
  ['얼떨결', '뜻밖의 일에 정신이 얼떨떨한 사이'],
  ['가늠', '목표에 맞고 안 맞음을 헤아리는 것'],
  ['가리사니', '사물을 판단할 실마리'],
  ['가붓하다', '조금 가벼운 듯하다'],
  ['가슬가슬', '살결·물체가 매끄럽지 않고 조금 거친 모양'],
  ['간자미', '가오리의 새끼'],
  ['갈무리', '물건을 잘 정리해 간수함'],
  ['개호주', '범의 새끼'],
  ['건들바람', '초가을에 선들선들 부는 바람'],
  ['고삿', '마을의 좁은 골목길'],
  ['고즈넉하다', '고요하고 아늑하다'],
  ['구메구메', '남모르게 틈틈이'],
  ['굼닐다', '몸을 굽혔다 일으켰다 하다'],
  ['그루터기', '나무를 베고 남은 밑동'],
  ['금줄', '부정을 막으려 문에 걸던 새끼줄'],
  ['기지개', '몸을 쭉 펴는 짓'],
  ['깜냥', '스스로 헤아려 갖춘 능력'],
  ['꼲다', '잘잘못을 따져 평가하다'],
  ['꽃등', '맨 처음'],
  ['나부죽이', '작은 것이 좀 넓게 엎드린 모양으로'],
  ['날포', '하루가 조금 넘는 동안'],
  ['너나들이', '서로 너니 나니 하며 터놓고 지내는 사이'],
  ['넉둥', '윷놀이에서 네 번째 말'],
  ['노고지리길', '종달새가 나는 높이의 길'],
  ['노느매기', '여러 몫으로 갈라 나누는 일'],
  ['눈비음', '남의 눈에 들게 겉으로만 꾸미는 일'],
  ['늦깎이', '남보다 늦게 사리를 깨치거나 시작한 사람'],
  ['다직해야', '기껏해야'],
  ['닦아세우다', '꼼짝 못 하게 몰아붙이다'],
  ['달구비', '땅을 다지듯 굵게 내리는 비'],
  ['댕돌같다', '돌처럼 야무지고 단단하다'],
  ['더껑이', '액체 위에 굳어 생긴 껍질'],
  ['덤받이', '여자가 데리고 온 자식'],
  ['도리기', '여럿이 돈을 내어 음식을 나눠 먹는 일'],
  ['돌개바람', '회오리바람'],
  ['동아리', '뜻을 같이해 모인 무리'],
  ['된비알', '몹시 험한 비탈'],
  ['두레박', '줄을 매어 물을 긷는 그릇'],
  ['둥개다', '일을 감당하지 못하고 쩔쩔매다'],
  ['드난', '남의 집에서 임시로 붙어 지내며 일함'],
  ['들머리', '들어가는 첫머리'],
  ['따따부따', '딱딱한 말씨로 시비를 가리는 모양'],
  ['땅거미', '해가 진 뒤 어둑해질 때'],
  ['뜨악하다', '마음이 선뜻 내키지 않다'],
  ['마늘각시', '하얗고 어여쁜 색시'],
  ['마수걸이', '그날 처음으로 물건을 파는 일'],
  ['맏물', '그해 처음 나온 것'],
  ['멧부리', '산등성이의 가장 높은 꼭대기'],
  ['모지랑이', '끝이 닳아 무디어진 물건'],
  ['몽따다', '알면서 일부러 모르는 체하다'],
  ['무람없다', '스스럼없이 무례하다'],
  ['묵새기다', '별일 없이 한곳에 오래 묵다'],
  ['물마', '비가 많이 와 땅에 넘치는 물'],
  ['미쁨', '믿음성'],
  ['바지런', '놀지 않고 꾸준히 일하는 태도'],
  ['반지빠르다', '어중되어 얄밉게 약다'],
  ['발밤발밤', '한 걸음씩 천천히 걷는 모양'],
  ['배코', '상투를 앉히려 머리를 깎아 낸 자리'],
  ['버성기다', '사이가 서먹하다'],
  ['벼름벼름', '어떤 일을 자꾸 벼르는 모양'],
  ['보람줄', '읽던 곳에 끼우는 줄, 책갈피'],
  ['볼가심', '아주 적은 양의 음식으로 시장기를 면함'],
  ['부라퀴', '자기 이익에 지독히 덤비는 사람'],
  ['북새', '많은 사람이 야단스레 부산 떠는 일'],
  ['불목하니', '절에서 밥 짓고 물 긷는 사람'],
  ['비설거지', '비 맞을 물건을 치우는 일'],
  ['빌미', '재앙이나 병의 원인'],
  ['사시랑이', '가늘고 약한 사람이나 물건'],
  ['살강', '그릇을 얹어 두는 선반'],
  ['삼삼하다', '잊히지 않고 눈앞에 보이는 듯하다'],
  ['샅바', '씨름에서 다리에 매는 천'],
  ['새치미', '시치미를 떼는 태도'],
  ['서름하다', '남과 가깝지 못하고 서먹하다'],
  ['설피다', '짜임새가 성글다'],
  ['소담스럽다', '넉넉하여 탐스러운 데가 있다'],
  ['속가량', '마음속으로 대강 어림잡음'],
  ['숫눈', '아무도 밟지 않은 눈'],
  ['시나위', '즉흥으로 어우러지는 남도 기악'],
  ['실팍하다', '사람이나 물건이 야무지고 튼튼하다'],
  ['쌈지', '담배나 부시를 넣는 작은 주머니'],
  ['아귀차다', '고집이 세고 굳세다'],
  ['아람치', '자기 차지가 된 몫'],
  ['안날', '바로 전날'],
  ['알심', '보기보다 야무진 힘'],
  ['앙그러지다', '하는 짓이 잘 어울리고 짜인 맛이 있다'],
  ['애면글면', '힘에 겨운 일을 이루려 갖은 애를 쓰는 모양'],
  ['어름', '두 물건의 끝이 맞닿은 자리'],
  ['에움길', '굽은 길, 돌아서 가는 길'],
  ['여울', '물살이 세게 흐르는 얕은 곳'],
  ['오달지다', '허술한 데가 없이 야무지다'],
  ['옹골지다', '실속 있게 꽉 차 있다'],
  ['우렁잇속', '내용이 복잡해 헤아리기 어려운 일'],
  ['움트다', '싹이 나기 시작하다'],
  ['윤슬결', '반짝이는 잔물결의 결'],
  ['을씨년스럽다', '보기에 몹시 쓸쓸하다'],
  ['이내', '해 질 무렵 멀리 끼는 푸르스름한 기운'],
  ['자리끼', '잠자리 머리맡에 두는 물'],
  ['잔풍하다', '바람이 잔잔하다'],
  ['제풀에', '저 혼자 저절로'],
  ['조바심', '조마조마한 마음'],
  ['좀체', '여간해서는'],
  ['주전부리', '때를 가리지 않고 군음식을 먹는 일'],
  ['지청구', '까닭 없이 남을 탓하는 짓'],
  ['짓조르다', '몹시 조르다'],
  ['차반', '맛있게 잘 차린 음식'],
  ['첫밗', '일을 시작한 맨 처음'],
  ['추렴', '여럿이 돈이나 물건을 나누어 내는 일'],
  ['치레', '잘 손질하여 모양을 냄'],
  ['켜켜이', '여러 켜로 겹겹이'],
  ['타깝다', '남의 딱한 처지가 안타깝다'],
  ['토렴', '밥이나 국수에 뜨거운 국물을 부었다 따랐다 하는 일'],
  ['푸접', '남에게 인정 있게 대하는 태도'],
  ['하리놀다', '남을 헐뜯어 일러바치다'],
  ['해읍스름하다', '깨끗하지 못하게 조금 희다'],
  ['허방', '움푹 팬 땅, 잘못 디디는 자리'],
  ['헛헛하다', '속이 빈 듯 허전하다'],
  ['호도깝스럽다', '언행이 조급하고 경망스럽다'],
  ['후미지다', '물가나 산길이 매우 구석지다'],
  ['흠씬', '아주 꽉 차게'],
  ['희떱다', '실속은 없어도 마음이 넓다']
];

/** 이 방송이 첫 낱말을 뱉은 순간 (이곳 시각 기준). */
const WORD_EPOCH = new Date(2026, 7, 1, 0, 0, 0).getTime(); // 2026-08-01 00:00
const WORD_PERIOD = 12 * HOUR;

const word: Channel = {
  id: 'word',
  get name() { return t('pulse.ch.word.name'); },
  glyph: '📖',
  period: WORD_PERIOD,
  local: true,
  tile: 'wide',
  get blurb() { return t('pulse.ch.word.blurb', { n: WORDS.length }); },
  get lineage() { return t('pulse.ch.word.lineage'); },
  beat(tick) {
    const first = tickOf(word, WORD_EPOCH);
    const idx = tick - first;
    const endsAt = tickStart(word, first + WORDS.length);
    if (idx < 0) return { line: '…', sub: t('pulse.word.before', { date: dateOf(WORD_EPOCH) }) };
    if (idx >= WORDS.length) {
      return { line: t('pulse.word.overLine'), sub: t('pulse.word.over', { n: WORDS.length, date: dateOf(endsAt) }) };
    }
    const [w, meaning] = WORDS[idx];
    return {
      line: w,
      sub: t('pulse.word.sub', { meaning, i: idx + 1, n: WORDS.length, date: dateOf(endsAt) })
    };
  }
};

/* ── 소진형 ②: 음절 ────────────────────────────────────────────
   낱말 목록은 아무리 늘려도 사람이 손으로 적는 한 유한하고, 몇 달이면 끝난다.
   `@everyword` 의 진짜 무게는 **7년**에 있었다 — 끝이 보이지 않을 만큼 길다는 것.

   그래서 손으로 안 적는 목록을 하나 둔다: **현대 한글 음절 11,172자 전부** (가 … 힣).
   유니코드가 정해 놓은 순서 그대로, 여섯 시간에 하나씩. 다 뱉는 데 **7년 8개월**이 걸린다 —
   `@everyword` 가 실제로 걸린 7년과 같은 무게로 맞춘 것이다.

   주기를 30분으로 잡았다가 고쳤다. 그러면 233일 만에 끝나는데, 처음엔 그걸 「638년」이라고
   적어 뒀었다(산수를 틀렸다). 검사가 잡았다 — 이 방송의 값어치는 **길이**라서, 길이를
   틀리면 방송 자체가 거짓말이 된다. */

const SYLLABLE_BASE = 0xac00;
const SYLLABLE_COUNT = 11172;
const LEAD = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const VOWEL = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const TAIL = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
const SYLLABLE_EPOCH = new Date(2026, 7, 1, 0, 0, 0).getTime();
const SYLLABLE_PERIOD = 6 * HOUR;

const syllable: Channel = {
  id: 'syllable',
  get name() { return t('pulse.ch.syllable.name'); },
  glyph: '가',
  period: SYLLABLE_PERIOD,
  local: true,
  tile: 'unit',
  get blurb() { return t('pulse.ch.syllable.blurb'); },
  get lineage() { return t('pulse.ch.syllable.lineage'); },
  beat(tick) {
    const idx = tick - tickOf(syllable, SYLLABLE_EPOCH);
    if (idx < 0 || idx >= SYLLABLE_COUNT) return { line: '…', sub: t('pulse.syllable.outside') };
    const ch = String.fromCharCode(SYLLABLE_BASE + idx);
    const lead = LEAD[Math.floor(idx / (21 * 28))];
    const vowel = VOWEL[Math.floor(idx / 28) % 21];
    const tail = TAIL[idx % 28].trim();
    const yearsLeft = ((SYLLABLE_COUNT - idx) * SYLLABLE_PERIOD) / (365.2425 * 24 * HOUR);
    return {
      line: ch,
      sub: t('pulse.syllable.sub', {
        parts: `${lead} + ${vowel}${tail ? ` + ${tail}` : ''}`,
        i: (idx + 1).toLocaleString(),
        n: SYLLABLE_COUNT.toLocaleString(),
        years: yearsLeft.toFixed(0)
      })
    };
  }
};

/* ── 말뭉치형 ①: 한 줄 ─────────────────────────────────────────
   재료를 규칙에 꽂아 무한히 만든다. 뜻이 통할 때가 있는데, 그건 순전히 사고다. */

/* 말뭉치를 **말 묶음에서 받는다** — 낱말만 옮겨서는 안 되는 자리다.
   한국어는 「임자말 + 조사」로 서고, 영어는 관사가 앞에 붙고, 일본어는 「が」가 뒤에 붙는다.
   그래서 낱말 통(`|` 로 이은 한 줄)과 **문장 틀**을 언어마다 따로 둔다. */
const bag = (key: string): readonly string[] => t(key).split('|');

/* 검사용으로 낱말 통을 내보낸다 — 관형어·부사에 띄어쓰기가 있어서("아주 작은", "정확히 세 번")
   완성된 문장만 보고는 어디까지가 임자말인지 되짚을 수가 없다. 조사 규칙 자체는 검사기가
   따로 다시 구현한다(같은 함수를 나눠 쓰면 둘이 같이 틀려도 초록이 뜬다). */
export const sentenceNouns = (): readonly string[] => bag('pulse.sent.noun');

/** 받침이 있으면 「이」, 없으면 「가」. 이걸 안 하면 「트램펄린가」 같은 게 나온다. */
function subjectParticle(noun: string): string {
  const last = noun.charCodeAt(noun.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  if (!isHangul) return '가';
  return (last - 0xac00) % 28 === 0 ? '가' : '이';
}

const sentence: Channel = {
  id: 'sentence',
  get name() { return t('pulse.ch.sentence.name'); },
  glyph: '💬',
  period: HOUR,
  tile: 'wide',
  get blurb() { return t('pulse.ch.sentence.blurb'); },
  get lineage() { return t('pulse.ch.sentence.lineage'); },
  beat(tick) {
    const r = rngFor('sentence', tick);
    const adn = bag('pulse.sent.adnominal');
    const nouns = bag('pulse.sent.noun');
    const adv = bag('pulse.sent.adverb');
    const verbs = bag('pulse.sent.verb');
    const noun = pick(r, nouns);
    return {
      line: t('pulse.sent.tmpl', {
        adn: pick(r, adn),
        noun,
        p: subjectParticle(noun),
        adv: pick(r, adv),
        verb: pick(r, verbs)
      }),
      sub: t('pulse.sent.count', {
        a: adn.length,
        b: nouns.length,
        c: adv.length,
        d: verbs.length,
        total: (adn.length * nouns.length * adv.length * verbs.length).toLocaleString()
      })
    };
  }
};

/* 「무늬」(블록문자 ░▒▓ 로 접어 만든 대칭 격자)가 여기 있었다. 걷어냈다 —
   뭘 그린 건지 안 보였고, 글자 폭이 폰트마다 달라 칸이 어긋났다(사용자 지적, 2026-08-09).
   그 자리는 `art.ts` 의 진짜 그림 다섯(별밭·어항·뜰·나방·섬)이 대신한다. */

/* ── 주술형: 점 ────────────────────────────────────────────────
   15분마다 지구 표면의 한 점. 열에 일곱은 바다다 — 그게 정직한 결과다.
   보는 사람이 「거기 지금 뭐가 있을까」를 갖다 붙이는 순간 이 방송은 완성된다. */

function hemisphere(lat: number, lon: number): string {
  const ns = lat >= 0 ? t('pulse.spot.north') : t('pulse.spot.south');
  const ew = lon >= 0 ? t('pulse.spot.east') : t('pulse.spot.west');
  return t('pulse.spot.where', { ns, ew });
}

const spot: Channel = {
  id: 'spot',
  get name() { return t('pulse.ch.spot.name'); },
  glyph: '🌐',
  period: 15 * MINUTE,
  tile: 'unit',
  get blurb() { return t('pulse.ch.spot.blurb'); },
  get lineage() { return t('pulse.ch.spot.lineage'); },
  beat(tick) {
    const r = rngFor('spot', tick);
    /* 위도를 그냥 균등하게 뽑으면 극지방이 과대표집된다. 구면에서 고르려면 sin 을 균등하게. */
    const lat = (Math.asin(2 * r() - 1) * 180) / Math.PI;
    const lon = r() * 360 - 180;
    const fmt = (v: number, pos: string, neg: string): string =>
      `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;
    return {
      line: `${fmt(lat, 'N', 'S')}  ${fmt(lon, 'E', 'W')}`,
      sub: t('pulse.spot.sub', { where: hemisphere(lat, lon) })
    };
  }
};

/* 순서 = 벤토에 놓이는 순서. 그림과 신호를 번갈아 둔다 — 그림끼리 몰아 두면
   한쪽은 화보가 되고 반대쪽은 계기판이 된다. */
export const CHANNELS: readonly Channel[] = [
  ...LETTER_CHANNELS, // 세 글자(영)·세 글자(한)·네 글자(영)·네 글자(한)·기호 — 이 도구의 중심
  bell,
  gauge,
  syllable,
  word,
  sentence,
  spot,
  ...ART_CHANNELS // 별밭 하나 — 글자 사이에서 숨 돌리는 자리
];

export type { Beat, Channel };
