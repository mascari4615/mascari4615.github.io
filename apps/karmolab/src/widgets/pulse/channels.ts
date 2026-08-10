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

/* 낱말은 여기 남고, **뜻풀이는 말 묶음으로 나갔다**(`pulse.w.1` …).
   낱말 자체가 이 방송의 알맹이라 옮길 것이 아니고, 뜻풀이는 읽는 사람의 말이어야 한다 —
   영어로 보는 사람에게 「미리내 :: 은하수」는 아무것도 아니고 「미리내 :: the Milky Way」는 뜻이 선다. */
const WORDS: readonly string[] = [
  '가람', '가온누리', '가시버시', '그루잠', '그린내', '그느르다', '곰비임비', '구슬비',
  '나비잠', '나린', '노고지리', '노루잠', '높새바람', '늘품', '늦사리', '다솜',
  '단미', '달무리', '닻별', '도담도담', '돋을볕', '두남두다', '두레', '둔치',
  '드레', '들마', '마루', '마중물', '마파람', '매지구름', '머드러기', '모도리',
  '모람모람', '모롱이', '목물', '무녀리', '물비늘', '미르', '미리내', '미쁘다',
  '미투리', '바람꽃', '바림', '반디', '밤마을', '버금', '벼리', '별하',
  '볕뉘', '보늬', '볼우물', '봄맞이', '부아', '붉새', '비나리', '비마중',
  '비바리', '사부자기', '산돌림', '살밑', '상고대', '새녘', '새벽동자', '서리꽃',
  '서리서리', '설레발', '소담하다', '소소리바람', '손사래', '시나브로', '시울', '아띠',
  '아람', '아우름', '안다미로', '알천', '애오라지', '어스름', '얼레빗', '여우비',
  '오롯이', '온새미로', '옹달샘', '우수리', '움딸', '웃비', '이든', '자맥질',
  '자우룩', '잔별', '잠포록하다', '재넘이', '지새다', '짜장', '찔레꽃머리', '칼바람',
  '큰기침', '타래', '터알', '톺아보다', '푸나무', '하늬바람', '한울', '함초롬',
  '해거름', '해넘이', '햇귀', '헤윰', '호젓하다', '흐노니', '희나리', '가시버시길',
  '꽃가람', '꽃샘추위', '나르샤', '남새밭', '너울', '노루막이', '눈꽃', '도래샘',
  '마음자리', '맞갖다', '메밀꽃', '민들레', '보드기', '산마루', '살푸슴', '실비',
  '심마니', '아라', '아리아리', '윤슬', '이슬떨이', '해미', '가랑비', '겨우내',
  '길라잡이', '우레', '소맷귀', '달보드레하다', '새록새록', '얼떨결', '가늠', '가리사니',
  '가붓하다', '가슬가슬', '간자미', '갈무리', '개호주', '건들바람', '고삿', '고즈넉하다',
  '구메구메', '굼닐다', '그루터기', '금줄', '기지개', '깜냥', '꼲다', '꽃등',
  '나부죽이', '날포', '너나들이', '넉둥', '노고지리길', '노느매기', '눈비음', '늦깎이',
  '다직해야', '닦아세우다', '달구비', '댕돌같다', '더껑이', '덤받이', '도리기', '돌개바람',
  '동아리', '된비알', '두레박', '둥개다', '드난', '들머리', '따따부따', '땅거미',
  '뜨악하다', '마늘각시', '마수걸이', '맏물', '멧부리', '모지랑이', '몽따다', '무람없다',
  '묵새기다', '물마', '미쁨', '바지런', '반지빠르다', '발밤발밤', '배코', '버성기다',
  '벼름벼름', '보람줄', '볼가심', '부라퀴', '북새', '불목하니', '비설거지', '빌미',
  '사시랑이', '살강', '삼삼하다', '샅바', '새치미', '서름하다', '설피다', '소담스럽다',
  '속가량', '숫눈', '시나위', '실팍하다', '쌈지', '아귀차다', '아람치', '안날',
  '알심', '앙그러지다', '애면글면', '어름', '에움길', '여울', '오달지다', '옹골지다',
  '우렁잇속', '움트다', '윤슬결', '을씨년스럽다', '이내', '자리끼', '잔풍하다', '제풀에',
  '조바심', '좀체', '주전부리', '지청구', '짓조르다', '차반', '첫밗', '추렴',
  '치레', '켜켜이', '타깝다', '토렴', '푸접', '하리놀다', '해읍스름하다', '허방',
  '헛헛하다', '호도깝스럽다', '후미지다', '흠씬', '희떱다'
] as const;

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
    return {
      line: WORDS[idx],
      sub: t('pulse.word.sub', {
        meaning: t(`pulse.w.${idx + 1}`),
        i: idx + 1,
        n: WORDS.length,
        date: dateOf(endsAt)
      })
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
