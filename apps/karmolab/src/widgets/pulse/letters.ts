/**
 * 글자 방송 — 이 도구의 중심.
 *
 * 원본은 `@3letter_` (「3 random letters every 10 mins」)다. 10분마다 세 글자를 던지는 게
 * 전부인데, **가끔 진짜 단어가 튀어나온다**. `Pat`, `Sun`, `Ash`. 그 순간을 보려고 사람들이
 * 남아 있는 것이고, 그게 나오면 짤을 찍어 공유한다 — 재미의 알맹이는 거기다
 * (사용자 지적, 2026-08-09: "재밌는 글자가 나오면 그거 공유하는거에 재미가 있는건데").
 *
 * 그래서 여기서는 두 가지를 더 한다:
 *   ① 진짜 낱말이면 **표식을 단다.** 안 그러면 그 순간이 그냥 지나간다.
 *   ② 그 판을 **그림으로 만들어 공유**할 수 있게 한다 (`card.ts`).
 *
 * 갈래는 넷으로 늘렸다 — 영문/한글 × 세 글자/네 글자. 그리고 기호 하나.
 * 영문은 원본대로 26자 균등이다(그래야 진짜 단어가 5%쯤 나온다). 한글을 균등하게 뽑으면
 * `쐤퉪뷁` 같은 게 나와 읽히지도 않으므로, **실제로 자주 쓰이는 자모**에 무게를 준다.
 */
import type { Channel } from './core';
import { MINUTE, rngFor } from './core';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';

/* ── 영문 ──────────────────────────────────────────────────────
   원본의 몸통은 「Tvh」처럼 첫 자만 대문자다. 그 모양을 지킨다. */

function romanRun(rand: () => number, n: number): string {
  let out = UPPER[Math.floor(rand() * 26)];
  for (let i = 1; i < n; i++) out += LOWER[Math.floor(rand() * 26)];
  return out;
}

/* 세 글자 영단어. 스크래블 사전은 1,000개가 넘지만 그중 다수는 아무도 모르는 말이라
   표식이 떠도 「진짜?」 소리만 나온다. **읽는 사람이 아는 말**만 골라 담았다. */
const WORDS3 =
  'ace act add ado aft age ago aid ail aim air ale all amp and ant any ape apt arc are ark arm art ash ask asp ate awe axe aye ' +
  'bad bag ban bar bat bay bed bee beg bet bib bid big bin bit boa bob bog bok bond boo bop bow box boy bra bud bug bum bun bus but buy bye ' +
  'cab cad cam can cap car cat caw cob cod cog con coo cop cot cow coy cry cub cud cue cup cur cut ' +
  'dab dad dam day den dew did die dig dim din dip doe dog don dot dry dub dud due dug duo dye ' +
  'ear eat ebb eel egg ego elf elk elm emu end eon era err eve ewe eye ' +
  'fad fan far fat fax fed fee few fib fig fin fir fit fix flu fly fob foe fog for fox fry fun fur ' +
  'gag gal gap gas gel gem get gig gin gnu got gum gun gut guy gym ' +
  'had hag ham has hat hay hem hen her hew hex hey hid him hip his hit hoe hog hop hot how hub hue hug hum hut ' +
  'ice icy ill imp ink inn ion ire irk its ivy ' +
  'jab jag jam jar jaw jay jet jig job jog jot joy jug jut ' +
  'keg key kid kin kit ' +
  'lab lad lag lap law lax lay led leg let lid lie lip lit lob log lot low lug ' +
  'mad map mat maw may men met mew mid mix mob mom mop mow mud mug mum ' +
  'nab nag nap net new nib nil nip nit nod nor nose not now nun nut ' +
  'oak oar oat odd ode off oil old one opt orb ore our out owe owl own ' +
  'pad pal pan par pat paw pay pea peg pen pep per pet pew pie pig pin pit ply pod pop pot pro pry pub pug pun pup pus put ' +
  'rag ram ran rap rat raw ray red rib rid rig rim rip rob rod roe rot row rub rue rug rum run rut rye ' +
  'sac sad sag sap sat saw sax say sea see set sew she shy sin sip sir sit six ski sky sly sob sod son sow soy spa spy sty sub sue sum sun sup ' +
  'tab tad tag tan tap tar tax tea ten the thy tic tie tin tip toe ton too top tot tow toy try tub tug two ' +
  'urn use ' +
  'van vat vet vex via vie vow ' +
  'wad wag war was wax way web wed wee wet who why wig win wit woe wok won woo wow wry ' +
  'yak yam yap yaw yea yes yet yew you ' +
  'zag zap zip zoo';

/* 네 글자는 공간이 26배 넓다(456,976). 그래서 표식이 며칠에 한 번 뜬다 — 그만큼 값이 있다. */
const WORDS4 =
  'able ache achy acid acre aged ahoy ajar akin ally alms aloe also alto amen ants apex aqua arch area arid army atom aunt auto away awry axis ' +
  'baby back bail bait bake bald ball balm band bang bank bare bark barn base bash bask bath bead beak beam bean bear beat beef been beer bell belt bend bent best bike bill bind bird bite blob blot blow blue blur boar boat body boil bold bolt bomb bond bone book boom boot bore born boss both bout bowl brag bran brew brim brow buck bulb bulk bull bump bunk bunt burn bury bush bust busy butt ' +
  'cafe cage cake calf call calm came camp cane cape card care cart case cash cask cast cave cell cent chap char chat chef chew chic chin chip chop cite city clad clam clan clap claw clay clip clog clot club clue coal coat coax code coil coin cold colt comb come cone cook cool cope cord cork corn cost cosy cove crab cram crew crib crop crow cube cued cuff cult curb cure curl cute ' +
  'dame damp dare dark darn dart dash data date dawn days dead deaf deal dean dear debt deck deed deem deep deer dent deny desk dial dice diet dime dine dirt dish disk dive dock does dole doll dome done doom door dose dote dove down doze drag draw drew drip drop drum duck dude duel duke dull dumb dump dune dusk dust duty ' +
  'each earl earn ease east easy echo edge edit eels eggs else emit ends envy epic even ever evil exam exit eyes ' +
  'face fact fade fail fair fake fall fame fang fare farm fast fate fawn fear feat feed feel fell felt fern feud file fill film find fine fire firm fish fist five flag flap flat flaw flea fled flee flew flex flip flow flue foam foil fold folk fond font food fool foot ford fork form fort foul four fowl free fret frog from fuel full fume fund funk fury fuse fuss ' +
  'gain gait gale game gang gape garb gash gasp gate gave gaze gear gene gift gild gill gilt girl gist give glad glee glen glow glue goal goat gold golf gone gong good gown grab gram gray grew grid grim grin grip grit grow grub gulf gull gulp gush gust ' +
  'hack hail hair half hall halt hand hang hard hare harm harp hash hate haul have hawk haze head heal heap hear heat heed heel heir held hell helm help herb herd here hero hide high hike hill hilt hint hire hive hoax hold hole holy home hone honk hood hoof hook hoop hoot hope horn hose host hour howl huge hull hump hunt hurl hurt hush husk hymn ' +
  'icon idea idle idol inch inks into iris iron isle itch item ' +
  'jade jail jazz jeep jest jinx join joke jolt jump junk jury just ' +
  'keel keen keep kelp kept kick kiln kilt kind king kiss kite knee knew knit knob knot know ' +
  'lace lack lady laid lair lake lamb lame lamp land lane lard lark lash last late lava lawn lazy lead leaf leak lean leap left lend lens lent less lice lick lied life lift like limb lime limp line link lint lion list live load loaf loan lobe lock loft logo lone long look loom loop loot lord lore lose loss loud love luck lull lump lung lure lurk lush lute ' +
  'made maid mail main make male mall malt mane many mare mark mash mask mast mate math maze mead meal mean meat meek meet meld melt memo mend menu mere mesh mess mice mild mile milk mill mime mind mine mint miss mist mite moan moat mock mode mold mole monk mood moon moor moot more moss most moth move much mule mush must mute myth ' +
  'nail name nape navy near neat neck need neon nest news next nice nick nine node none noon norm nose note noun nova numb ' +
  'oath obey oboe odds oily omit once only onto onus onyx open opus oral orbs otter ouch ours oust oval oven over ' +
  'pace pack pact page paid pail pain pair pale palm pang pant park part pass past path pave pawn peak pear peat peck peel peer pelt perk pest pick pier pike pile pill pine pink pint pipe pity plan play plea pled plot plow ploy plug plum plus poem poet poke pole poll polo pond pony pool poor pope pore pork port pose posh post pour pray prey prim prod prom prop pros prow pull pulp pump punk pure push ' +
  'quay quid quit quiz ' +
  'race rack raft rage raid rail rain rake ramp rang rank rant rare rash rate rave read real ream reap rear reed reef reel rein rely rend rent rest ribs rice rich ride rift rile rime rind ring rink riot ripe rise risk rite road roam roar robe rock rode role roll roof room root rope rose ross rosy rout rove ruby rude ruin rule rung runt ruse rush rust ' +
  'sack safe sage said sail sake sale salt same sand sane sang sank sash save scan scar seal seam seat sect seed seek seem seen seep self sell send sent sect shed shin ship shoe shop shot show shut sick side sift sigh sign silk sill silo silt sing sink site size skew skid skin skip skit slab slam slap slat sled slew slid slim slip slit slot slow slug slum smog smug snag snap snip snow soak soap soar sock soda sofa soft soil sold sole solo some song soon soot sore sort soul soup sour sown spam span spar spat sped spin spit spot spun spur stab stag star stay stem step stew stir stop stow stub stud stun such suit sulk sung sunk sure surf swam swan swap sway swim ' +
  'tack tact tail take tale talk tall tame tank tape taps tart task teak teal team tear teem tell tend tent term test text than that thaw thee them then they thin this thud thug thus tick tide tidy tier tile till tilt time tint tiny tire toad toil told toll tomb tone tong took tool toot tore torn tort toss tour town tram trap tray tree trek trim trio trip trot true tuba tube tuck tuna tune turf turn tusk twig twin type ' +
  'ugly undo unit unto upon urge used user ' +
  'vain vale vane vase vast veal veer veil vein vent verb very vest veto vial vibe vice view vile vine visa void vole volt vote ' +
  'wade wage wail wait wake walk wall wand wane want ward ware warm warn warp wart wary wash wasp wave wavy waxy weak wean wear weed week weep weld well welt went wept were west what when whim whip whir whom wick wide wife wild will wilt wind wine wing wink wipe wire wise wish wisp with woke wolf womb wood wool word wore work worm worn wrap wren writ ' +
  'yard yarn yawn yeah year yell yoga yoke your ' +
  'zeal zero zest zinc zone zoom';

const DICT3 = new Set(WORDS3.split(' '));
const DICT4 = new Set(WORDS4.split(' '));

/* ── 한글 ──────────────────────────────────────────────────────
   음절 11,172자를 균등하게 뽑으면 `쐤퉪뷁` 이 나온다 — 읽히지도, 공유하고 싶지도 않다.
   실제로 자주 보이는 자모에 무게를 준다. 그러면 `가루맘` 처럼 **읽을 수는 있는데 뜻은 없는**
   말이 나온다. 그 어중간함이 이 갈래의 맛이다. */

const LEAD_POOL = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄱㄴㄹㅁㅂㅅㅇㅈㄲㄸㅃㅆㅉ'; // 흔한 것을 두 번 넣어 무게를 준다
const VOWEL_POOL = 'ㅏㅓㅗㅜㅡㅣㅐㅔㅑㅕㅛㅠㅘㅙㅚㅝㅞㅟㅢㅏㅓㅗㅜㅡㅣㅐㅔ';
const TAIL_POOL = '\0\0\0\0\0\0ㄱㄴㄹㅁㅂㅅㅇㄴㄹㅁㅇㄱㅆㅋㅌㅍㅎㄲㄳㄵㄶㄺㄻㄼㅄ'; // 절반 가까이는 받침 없음
const LEAD_ORDER = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const VOWEL_ORDER = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const TAIL_ORDER = '\0ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

function hangulRun(rand: () => number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const lead = LEAD_ORDER.indexOf(LEAD_POOL[Math.floor(rand() * LEAD_POOL.length)]);
    const vowel = VOWEL_ORDER.indexOf(VOWEL_POOL[Math.floor(rand() * VOWEL_POOL.length)]);
    const tail = TAIL_ORDER.indexOf(TAIL_POOL[Math.floor(rand() * TAIL_POOL.length)]);
    out += String.fromCharCode(0xac00 + (lead * 21 + vowel) * 28 + tail);
  }
  return out;
}

/* 한글 낱말은 조합 공간이 워낙 넓어(음절 하나가 11,172가지) 우연히 맞을 일이 거의 없다.
   그래도 목록을 둔다 — **언젠가 한 번** 터지라고. 그 한 번이 이 방송의 사건이다. */
const KO_WORDS = new Set(
  ('가락 가람 가지 강아 개미 거미 거울 고래 고양 구름 그늘 기린 나무 나비 노을 눈물 다리 다솜 달빛 도깨 두부 마늘 마루 마음 모래 무지 미리 바다 바람 바위 반달 밤길 별빛 보리 봄날 부엉 사슴 사탕 새벽 소금 소나 손길 수박 숲길 시내 아침 안개 여우 연꽃 오리 우물 이슬 잠자 저녁 종이 참새 초록 파도 하늘 햇살 호수 흙길 ' +
    '가랑비 개나리 고구마 고슴도 구슬비 그림자 기다림 나그네 노란색 도라지 두더지 마들렌 무당벌 물고기 바닷가 반딧불 별자리 보름달 소나기 손수건 아지랑 어린이 여울목 오솔길 자작나 저울추 초승달 코스모 토끼풀 파랑새 함박눈 해바라 호랑이 흰구름').split(' ')
);

/* ── 기호 ──────────────────────────────────────────────────────
   글자가 아닌 것도 뜻 없이 떨어질 때 똑같이 재미있다. 읽히지 않아서 오히려 더 오래 본다. */
const SIGILS = '◆◇○●□■△▽☆★✦✧❖◈⌘⌬⎔⏣✶✳❉❋⟡⟠⧫⬡⬢⌇⌁⍜⍟⌖⌾⍚⏧♁♆⚚☙❧';

/** 방송 하나를 찍어 내는 틀 — 다섯 개가 같은 뼈대를 쓴다. */
function lettersChannel(spec: {
  id: string;
  name: string;
  glyph: string;
  period: number;
  count: number;
  kind: 'roman' | 'hangul' | 'sigil';
  space: number;
  lineage: string;
}): Channel {
  const { id, name, glyph, period, count, kind, space, lineage } = spec;
  const make = (rand: () => number): string =>
    kind === 'roman'
      ? romanRun(rand, count)
      : kind === 'hangul'
        ? hangulRun(rand, count)
        : Array.from({ length: count }, () => SIGILS[Math.floor(rand() * SIGILS.length)]).join(' ');

  /** 진짜 낱말인가 — 이게 이 도구에서 유일하게 「사건」인 순간이다. */
  const realWord = (s: string): boolean => {
    if (kind === 'roman') return (count === 3 ? DICT3 : DICT4).has(s.toLowerCase());
    if (kind === 'hangul') return KO_WORDS.has(s);
    return false;
  };

  const dress = (text: string): { line: string; sub?: string; mark?: string } => {
    const hit = realWord(text);
    return {
      line: text,
      sub: hit
        ? `${space.toLocaleString()}가지 중 하나 — 그런데 진짜 낱말이 나왔다`
        : `${space.toLocaleString()}가지 중 하나`,
      mark: hit ? (kind === 'roman' ? '진짜 단어다' : '진짜 낱말이다') : undefined
    };
  };

  return {
    id,
    name,
    glyph,
    period,
    tile: 'unit',
    blurb: `${period / MINUTE}분마다 ${name}. 뜻은 없다 — 가끔 있다.`,
    lineage,
    beat(tick) {
      return dress(make(rngFor(id, tick)));
    },
    personal(seed) {
      const dressed = dress(make(rngFor(`${id}/personal`, seed)));
      return { ...dressed, sub: `${seed} 의 ${name} — 이건 안 바뀐다` };
    }
  };
}

export const roman3 = lettersChannel({
  id: 'roman3',
  name: '세 글자',
  glyph: 'Ab',
  period: 10 * MINUTE,
  count: 3,
  kind: 'roman',
  space: 26 ** 3,
  lineage: '@3letter_ — 「3 random letters every 10 mins」 (이 도구의 출발점)'
});

export const roman4 = lettersChannel({
  id: 'roman4',
  name: '네 글자',
  glyph: 'Abc',
  period: 20 * MINUTE,
  count: 4,
  kind: 'roman',
  space: 26 ** 4,
  lineage: '@3letter_ 를 한 칸 늘린 것 — 공간이 26배라 진짜 단어가 훨씬 귀하다'
});

export const hangul3 = lettersChannel({
  id: 'hangul3',
  name: '세 글자 (한글)',
  glyph: '가나',
  period: 10 * MINUTE,
  count: 3,
  kind: 'hangul',
  space: 11172 ** 3,
  lineage: '@3letter_ 의 한글판 — 읽히도록 흔한 자모에 무게를 줬다'
});

export const hangul4 = lettersChannel({
  id: 'hangul4',
  name: '네 글자 (한글)',
  glyph: '가나다',
  period: 20 * MINUTE,
  count: 4,
  kind: 'hangul',
  space: 11172 ** 4,
  lineage: '@3letter_ 의 한글판 — 네 글자쯤 되면 그럴듯한 이름처럼 읽힌다'
});

export const sigil3 = lettersChannel({
  id: 'sigil3',
  name: '기호',
  glyph: '◈',
  period: 15 * MINUTE,
  count: 3,
  kind: 'sigil',
  space: SIGILS.length ** 3,
  lineage: 'Botwiki #unicode — 읽히지 않는 것을 계속 던지는 봇들'
});

export const LETTER_CHANNELS: readonly Channel[] = [roman3, hangul3, roman4, hangul4, sigil3];
