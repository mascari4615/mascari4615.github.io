/**
 * 오락실. 실험실 안의 놀이터 (TASK-KL-242)
 *
 * 사용자: "미니게임을 엄청엄청", "멀티가 일단 되어야 하고, 싱글도", "시뮬레이션 컨셉"
 *
 * 이 파일이 하는 일은 넷뿐이다:
 *  ① 어떤 게임을 할지 고르게 하고
 *  ② 커널에 시계를 밀어 주고
 *  ③ 상태가 바뀌면 그 게임의 화면에게 그리라고 시키고
 *  ④ 여럿이면 주인이 판을 흘려보낸다
 *
 * **게임을 하나도 모른다.** 명부(`index.ts`, `view-registry.ts`) 둘만 읽는다. 51개가 되어도
 * 이 파일은 안 커진다.
 *
 * 세 갈래가 아니라 한 갈래다:
 *  - **혼자** = 그물망 없는 방. 빈 자리는 봇.
 *  - **주인** = 같은 커널 + 사람이 들어오면 그 자리를 봇에서 사람으로 바꾼 채 다시 시작.
 *  - **손님** = 커널이 없다. 주인이 보낸 판을 그대로 그리고, 손은 주인에게 보낸다.
 *
 * 커널을 각자 돌리지 않는 이유: 봇의 주사위도 제한시간의 끝도 창마다 달라져 승부가 안 갈린다
 * (번개 대결에서 겪었다). 판정은 한 곳에서만.
 */
import arcadeCss from './arcade.css';
import { t, loadNamespace } from '../../lib/i18n';
import { CARDS, cardById } from './catalog-meta.generated';
import { SETUPS, optsFor, chooseOpt } from './setups';
import { ensureGame, gameById } from './loader';
import { Match, type MatchView, type SeatSpec } from './kernel';
import type { GameDef } from './types';
import { seedFrom } from './rng';
import { iconOf, kindOf } from './meta';
import { viewById, view3dById, ensureView3d } from './loader';
import { makeCode, inviteLink } from '../../lib/room-code';
import { blip, setBlipVoice } from '../../lib/blip';
import { sceneOf, setScene, nextScene, specOf } from './scenes';
import { handMode, handNow, nextHandMode } from './hands';
import { buzz } from '../../lib/haptic';
import { pickBots, withBotLevel, type BotLevel, type BotPersona } from './bots';
import { CAST, EMOTES, castByName, castOfLevel, faceSvg, lineOf } from './cast';
import { mountMdd } from './mdd';
import { mountChrome } from './chrome';
import { DECK_SKINS, deckSkin, setDeckSkin } from './deck';
import { LESSONS, TUTOR_SIZE, cellOf, isAnswer } from './tutor';
import { todayPicks, dailyState, markPlayed, PICKS } from './daily';
import { soloPlays, inAppTool, type SoloPlay } from './solo';
import { loadPacks } from '../pack-store';
import { courseSteps, courseRun } from '../play-course';
import { lengthOf, secondsOf } from './length';
import { notePlay, noteBest, bestOf } from './plays';
import { withGhost, GHOST_NAME } from './ghost';
import { fold, deal, turnOf, letterLink, letterFromUrl, type Letter } from './mail';
import { split, isTeamy, teamScores, TEAM_NAMES, type Plan } from './teams';
import { listRooms, holdRoom, type Held, type OpenRoom } from './open-rooms';
import {
  enterQueue,
  gradeOf,
  findTape,
  loadTape,
  myRating,
  myTapes,
  queueCount,
  reportResult,
  saveTape,
  tapeFromUrl,
  tapeLink,
  RankedRoster,
  supportsRanked,
  type Ranked,
  type RankedMatch,
  type RankRoom
} from './ranked';
import { matches } from './pick6';
import { ranks } from './rank';
import { intervalWhileVisible } from '../../lib/tick';
import { record, scenes, matchAt, type Tape } from './replay';
import { forWatcher } from './spectate';
import { pickGames, award, isOver, ROUNDS, type TourState } from './tour';
import { PARTY, partySize } from './seating';
import type { Render } from './views';
import type { Net, Peer, Json } from './net';
import { ensureNet } from './net-loader';

declare const Toolbox: {
  register: (w: unknown) => void;
  onDispose?: (fn: () => void) => void;
  trackUse?: (s: string) => void;
  copyText?: (s: string, o?: { message?: string }) => Promise<void>;
  /** 앱 안 도구로 화면만 바꾼다 (혼자 놀이로 건너갈 때. TASK-KL-313). */
  switchPage?: (id: string) => void;
};
declare const Mdd: { linePreset?: (k: string, o?: { msg?: string }) => void } | undefined;

/** 방금 판을 같은 규칙, 자리, 씨앗으로 되살릴 재료. */
interface MatchRecipe {
  seed: number;
  seats: SeatSpec[];
  personas: Record<number, BotPersona>;
  level: BotLevel;
  def: GameDef<unknown, unknown> | null;
}

/** 판 시작부터 결과 화면까지 함께 움직이는 상태. */
interface Session {
  recipe: MatchRecipe;
  lastBest: number | null;
  seenMoves: number;
  hurriedAt: number;
  ended: boolean;
  soundedRound: number;
  resultMeta: { moves: number; ms: number } | null;
}

(function (): void {
  if (typeof Toolbox === 'undefined') return;

  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function storedName(): string {
    try {
      return (localStorage.getItem('karmolab.arcade.name') || '').trim();
    } catch {
      return '';
    }
  }

  Toolbox.register({
    id: 'arcade',
    title: t('widgets.arcade.title', undefined, '오락실'),
    category: 'play',
    desc: t(
      'widgets-desc.arcade.desc',
      undefined,
      '여러 미니게임을 혼자서도 여럿이서도 합니다. 사람이 모자란 자리는 봇이 앉습니다'
    ),
    layout: 'wide',
    noHero: true,
    icon: '<rect x="3" y="7" width="18" height="12" rx="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 11v4M6 13h4M15 12.5h.01M17.5 15h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('arcade.tab', undefined, '오락실'),
        build: (container: HTMLElement): void => {
          void loadNamespace('arcade').then(() => draw(container));
        }
      }
    ]
  });

  function injectStyles(): void {
    if (document.getElementById('ac-style')) return;
    const el = document.createElement('style');
    el.id = 'ac-style';
    el.textContent = arcadeCss;
    document.head.appendChild(el);
  }

  /** 방 이름. 짧고, 헷갈리는 글자(0/O, 1/I)는 뺀다. */

  function draw(container: HTMLElement): void {
    injectStyles();
    /* 판 세대. 나가기와 새 판 시작이 올림. 늦게 오는 타이머와 조각 로딩은 제 세대가 아니면 손 뗌.
       없던 때의 사고 둘: 배우기 끝 타이머가 나간 뒤 로비에서 판을 엶, 조각을 받는 사이 다른 판을
       고르면 먼저 고른 판이 나중에 덮어씀 (2026-09-02 감사) */
    let epoch = 0;
    let tutorDoneTimer = 0;
    const nextEpoch = (): number => {
      epoch += 1;
      if (tutorDoneTimer) window.clearTimeout(tutorDoneTimer);
      tutorDoneTimer = 0;
      return epoch;
    };
    /* 문서와 창에 건 리스너는 위젯이 내려갈 때 한 번에 끊는다. 핫리로드마다 쌓이던 것 */
    const gone = new AbortController();
    const dying = { signal: gone.signal };
    /* 오락실 전용 스킨의 뿌리. 이 클래스 아래에서만 토큰이 바뀐다(다른 위젯 불변). */
    container.classList.add('ac-root');
    if (typeof Mdd !== 'undefined') Mdd?.linePreset?.('tool_run', { msg: t('arcade.mdd') });

    /* 로비 = **진열장**. 카드도 테두리도 없다. 따뜻한 상아색 탁자 위에 게임이 물건처럼
       놓이고, 올리면 이름표가 서고, 누르면 그 물건이 가운데로 온다(#acDetail). */
    container.innerHTML =
      '<div id="acLobby">' +
      '<div class="ac-top">' +
      '<span class="ac-brand">' + esc(t('widgets.arcade.title', undefined, '오락실')) + '</span>' +
      '<span class="ac-sub">' + esc(t('arcade.lobby.hint')) + '</span>' +
      '<input type="search" id="acFind" class="ac-find" placeholder="' + esc(t('arcade.find.hint')) +
      '" aria-label="' + esc(t('arcade.find.hint')) + '">' +
      '<label class="ac-namechip">' + esc(t('arcade.label.name')) +
      '<input type="text" id="acName" maxlength="12" placeholder="' + esc(t('arcade.name.default')) +
      '" aria-label="' + esc(t('arcade.aria.name')) + '"></label>' +
      '</div>' +
      /* 진열장과 그 딸린 것들. 물건을 집으면(#acDetail) 통째로 접힌다. */
      '<div id="acShelfAll">' +
      '<div class="ac-room" id="acRoom" style="display:none"></div>' +
      '<div id="acOpen"></div>' +
      /* 방금 논 것으로 돌아가는 줄. 오늘의 세 판보다 위에 둔다. 이미 마음먹고 온 사람이 먼저다 */
      '<div class="ac-recent" id="acRecent"></div>' +
      '<div class="ac-today" id="acToday"></div>' +
      '<div id="acPicks"></div>' +
      '<div id="acGames" class="ac-shelf"></div>' +
      /* 혼자 놀이. 오락실이 놀이의 **유일한 문**이 되는 자리 (TASK-KL-313).
         방 게임 뒤에 둔다: 여기는 오락실이고, 혼자 놀이는 각자 제 페이지로 나가는 손님이다. */
      '<div id="acSolo"></div>' +
      /* 놀이의 재료 = 표. 만드는 문이 놀이터에만 있어서, 오락실로 들어온 사람은 우물을
         파 놓고도 못 들어갔다 (TASK-KL-313. 놀이터에서 옮겨 온 자리). */
      '<div id="acPacks"></div>' +
      '<div class="ac-foot">' +
      '<div class="ac-level" id="acLevel" role="group" aria-label="' + esc(t('arcade.level.aria')) + '">' +
      ['mild', 'normal', 'spicy']
        .map((v) => '<button data-level="' + v + '">' + esc(t('arcade.level.' + v)) + '</button>')
        .join('') +
      '<small>' + esc(t('arcade.level.note')) + '</small></div>' +
      '</div>' +
      '</div>' +
      '<div id="acDetail" style="display:none"></div>' +
      '</div>' +
      '<div id="acWait" style="display:none">' +
      '<div class="ac-code" id="acCode"></div>' +
      '<div class="ac-share"><input type="text" id="acUrl" readonly aria-label="' + esc(t('arcade.aria.url')) +
      '"><button class="btn btn-primary" id="acCopy">' + esc(t('arcade.btn.copy')) + '</button></div>' +
      '<div class="ac-seats" id="acWaitSeats"></div>' +
      '<div class="tool-status" id="acWaitStatus"></div>' +
      '<div style="display:flex;gap:6px;margin-top:var(--space-lg)">' +
      '<button class="btn btn-primary" id="acStart">' + esc(t('arcade.btn.start')) + '</button>' +
      '<button class="btn btn-ghost" id="acWaitQuit">' + esc(t('arcade.btn.quit')) + '</button>' +
      '</div></div>' +
      '<div id="acPlay" style="display:none">' +
      '<div class="ac-seats" id="acSeats"></div>' +
      '<div class="ac-stage" id="acStage" tabindex="0">' +
      '<div class="ac-intro" id="acIntro" style="display:none">' +
      '<div class="ac-introicon" id="acIntroIcon"></div>' +
      '<div class="ac-introname" id="acIntroName"></div>' +
      '<div class="ac-introdesc" id="acIntroDesc"></div>' +
      '<div class="ac-introcount" id="acIntroNum"></div>' +
      '<div class="ac-introskip" id="acIntroSkip"></div>' +
      '</div>' +
      '<div id="acView"></div>' +
      '<div class="ac-over" id="acOver" style="display:none">' +
      '<div class="ac-overhead" id="acOverHead"></div>' +
      '<ol class="ac-overlist" id="acOverList"></ol>' +
      '<div class="ac-overnote" id="acOverNote"></div>' +
      /* 등급전 패보 링크. 판이 서버에 올라간 뒤에만 뜬다 */
      '<div class="ac-overtape" id="acOverTape" hidden></div>' +
      '<div class="ac-overacts" id="acOverActs"></div>' +
      /* 전신 자리. 지금은 도형, 그림이 오면 여기만 갈아 끼운다(`rules/mdd.md` 그림 규격) */
      '<div class="ac-overbody" id="acOverBody" hidden></div>' +
      '</div>' +
      '</div>' +
      '<div class="ac-letter" id="acLetter" style="display:none">' +
      '<div id="acLetterSay"></div>' +
      '<div style="display:flex;gap:6px;margin-top:6px">' +
      '<input type="text" id="acLetterUrl" readonly aria-label="' + esc(t('arcade.letter.link')) + '" style="flex:1;min-width:0">' +
      '<button class="btn btn-primary" id="acLetterCopy">' + esc(t('arcade.btn.copy')) + '</button>' +
      '</div></div>' +
      /* 제안 상자. 무승부, 색 바꿔 한 판 더. 상대가 수락하거나 거절할 때까지 판 위에 뜬다 */
      '<div class="ac-offer" id="acOffer" style="display:none"><span id="acOfferSay"></span>' +
      '<button class="btn btn-primary" id="acOfferYes">' + esc(t('arcade.btn.accept')) + '</button>' +
      '<button class="btn btn-ghost" id="acOfferNo">' + esc(t('arcade.btn.decline')) + '</button></div>' +
      '<div class="tool-status" id="acStatus"></div>' +
      /* 판 도중의 굵은 알림. 상대가 나감 같은 것. 매 프레임 다시 적는 자리와 따로 */
      '<div class="ac-gonebar" id="acGoneBar" hidden></div>' +
      /* 방의 버튼은 하나(메뉴). 나머지는 메뉴 종이 안에 줄로. 레퍼런스(오목 가자) 실측: 대국 중 우상단 버튼은 일시정지 하나 */
      '<button class="ac-menubtn" id="acMenu" aria-expanded="false" title="' + esc(t('arcade.btn.menu')) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
      '<div class="ac-controls" id="acControls" style="display:flex;gap:6px;margin-top:var(--space-lg)">' +
      /* 무르기. 혼자 노는 판(봇 상대)에서만. 남과 두는 판은 합의가 필요해 아직 없다 */
      '<button class="btn btn-ghost" id="acUndo" style="display:none">' + esc(t('arcade.btn.undo')) + '</button>' +
      /* 힌트(레퍼런스의 연습 모드 분석). 혼자 판과 복기에서만. 온라인은 약속상 없음 */
      '<button class="btn btn-ghost" id="acHint" style="display:none">' + esc(t('arcade.btn.hint')) + '</button>' +
      /* 남과 두는 판의 예의. 무승부 제안과 기권. 둘이 둘 때만 */
      '<button class="btn btn-ghost" id="acDraw" style="display:none">' + esc(t('arcade.btn.draw')) + '</button>' +
      '<button class="btn btn-ghost" id="acResign" style="display:none">' + esc(t('arcade.btn.resign')) + '</button>' +
      '<i class="ac-sep"></i>' +
      '<button class="btn btn-ghost" id="acSound" aria-pressed="true" title="' + esc(t('arcade.btn.sound')) + '"><span class="ac-emoji">🔊</span><span class="ac-lbl">' + esc(t('arcade.btn.sound')) + '</span></button>' +
      '<button class="btn btn-ghost" id="acFull" title="' + esc(t('arcade.btn.full')) + '"><span class="ac-emoji">⛶</span><span class="ac-lbl">' + esc(t('arcade.btn.full')) + '</span></button>' +
      /* 표현 고르기. 규칙은 그대로, 보는 법만 바뀐다. 입체 화면이 있는 판에서만 뜬다. */
      '<button class="btn btn-ghost" id="acDim" style="display:none" aria-pressed="false" title="' +
      esc(t('arcade.btn.dim', undefined, '2D / 3D 로 보기')) + '">2D</button>' +
      /* 방 갈아 끼우기. 입체 방이 있는 판에서만. 누를 때마다 다음 방 */
      '<button class="btn btn-ghost" id="acScene" style="display:none" title="' + esc(t('arcade.btn.scene')) + '"></button>' +
      '<button class="btn btn-ghost" id="acDeck" style="display:none" title="' + esc(t('arcade.btn.deck')) + '"></button>' +
      /* 좌표와 수 번호(레퍼런스의 접근성 설정). 브라우저에 남고, 화면이 매 그림마다 읽는다 */
      /* 손놀림. 누르기와 끌기가 섞이면 오동작이라 사람이 고름(`arcade/hands.ts`) */
      '<button class="btn btn-ghost" id="acHand" title="' + esc(t('arcade.btn.hand')) + '"></button>' +
      '<button class="btn btn-ghost" id="acCoords" style="display:none" aria-pressed="false">' + esc(t('arcade.btn.coords')) + '</button>' +
      '<button class="btn btn-ghost" id="acNums" style="display:none" aria-pressed="false">' + esc(t('arcade.btn.numbers')) + '</button>' +
      '<i class="ac-sep"></i>' +
      /* MDD 는 확장. 끄면 이름 있는 봇, 얼굴과 말풍선과 컷인 없음. 기본 켬 (사용자 결정 2026-09-02. 저택 사람이 오락실의 얼굴) */
      '<button class="btn btn-ghost" id="acMdd" aria-pressed="true" title="' + esc(t('arcade.btn.mdd')) + '">' + esc(t('arcade.btn.mdd')) + '</button>' +
      '<button class="btn btn-ghost" id="acEmote" style="display:none">' + esc(t('arcade.btn.emote')) + '</button>' +
      '<button class="btn btn-ghost" id="acSwap" style="display:none">' + esc(t('arcade.btn.swap')) + '</button>' +
      '<button class="btn btn-ghost" id="acQuit">' + esc(t('arcade.btn.quit')) + '</button>' +
      /* 끝난 판의 행동 셋. 방에서는 결과 종이 아래로 옮겨 간다(`placeEndButtons`) */
      '<button class="btn btn-primary" id="acAgain" style="display:none">' + esc(t('arcade.btn.again')) + '</button>' +
      /* 끝나면 색을 바꿔 한 판 더. 레퍼런스의 결과 화면 첫 버튼 */
      '<button class="btn btn-ghost" id="acSwapColor" style="display:none">' + esc(t('arcade.btn.swapcolor')) + '</button>' +
      '<button class="btn btn-ghost" id="acReplay" style="display:none">' + esc(t('arcade.btn.replay')) + '</button>' +
      '</div>' +
      /* 복기 타임라인. 결과의 다시 보기가 켠다. 방에서는 판 아래 가운데 한 줄 */
      /* 반응 판. 내 자리 카드 위에 여섯. 누르면 내 카드에 말풍선, 온라인이면 상대에게도 */
      '<div class="ac-emotes" id="acEmotes" hidden>' + EMOTES.map((e, i) => '<button class="ac-emotebtn" data-emote="' + i + '">' + esc(e) + '</button>').join('') + '</div>' +
      '<div class="ac-cutin" id="acCutin" hidden></div>' +
      /* 배우기 안내. 상태줄은 매 프레임 판 수로 덮이므로 따로 둔다 */
      '<div class="ac-lesson" id="acLesson" hidden><b id="acLessonNo"></b><p id="acLessonSay"></p><button class="btn btn-ghost" id="acLessonQuit"></button></div>' +
      '<div class="ac-timeline" id="acTimeline" hidden>' +
      '<button class="ac-tlbtn" id="acTlFirst" title="' + esc(t('arcade.tl.first')) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 6l-8 6 8 6z"/></svg></button>' +
      '<button class="ac-tlbtn" id="acTlPrev" title="' + esc(t('arcade.tl.prev')) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 6l-8 6 8 6z"/></svg></button>' +
      '<button class="ac-tlbtn ac-tlplay" id="acTlPlay" title="' + esc(t('arcade.tl.play')) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path class="ac-ico-play" d="M8 5l12 7-12 7z"/><path class="ac-ico-pause" d="M7 5v14M17 5v14"/></svg></button>' +
      '<button class="ac-tlbtn" id="acTlNext" title="' + esc(t('arcade.tl.next')) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6l8 6-8 6z"/></svg></button>' +
      '<button class="ac-tlbtn" id="acTlLast" title="' + esc(t('arcade.tl.last')) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5v14M6 6l8 6-8 6z"/></svg></button>' +
      '<input type="range" class="ac-tlbar" id="acTlBar" min="0" max="0" value="0" aria-label="' + esc(t('arcade.tl.bar')) + '">' +
      '<span class="ac-tlnum" id="acTlNum"></span>' +
      '<button class="ac-tlbtn ac-tlspeed" id="acTlSpeed" title="' + esc(t('arcade.tl.speed')) + '">1x</button>' +
      '<span class="ac-tlbranch" id="acTlBranch" hidden></span>' +
      '<button class="ac-tlbtn ac-tltext" id="acTlBack" hidden>' + esc(t('arcade.tl.back')) + '</button>' +
      '<button class="ac-tlbtn ac-tltext" id="acTlExit">' + esc(t('arcade.tl.exit')) + '</button>' +
      '</div>' +
      '</div>';

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const lobby = $<HTMLElement>('#acLobby');
    const wait = $<HTMLElement>('#acWait');
    const play = $<HTMLElement>('#acPlay');
    const seatsEl = $<HTMLElement>('#acSeats');
    const viewEl = $<HTMLElement>('#acView');
    const statusEl = $<HTMLElement>('#acStatus');
    const againBtn = $<HTMLButtonElement>('#acAgain');
    const swapBtn = $<HTMLButtonElement>('#acSwap');
    const replayBtn = $<HTMLButtonElement>('#acReplay');
    const startBtn = $<HTMLButtonElement>('#acStart');
    const nameInput = $<HTMLInputElement>('#acName');
    nameInput.value = storedName();

    const say = (m: string, kind = ''): void => {
      statusEl.textContent = m;
      statusEl.className = 'tool-status' + (kind ? ' ' + kind : '');
    };
    const myName = (): string => nameInput.value.trim() || t('arcade.name.default');
    /**
     * **콘텐츠 창을 다 쓴다** (사용자 요구. 여백이 있다).
     * 셸은 도구 둘레에 64px 24px 48px 여백을 두고 사이드바 옆에 세운다. 방은 그 여백까지 방이어야
     * 한다. 판 영역(`#acPlay`)을 헤더 아래, 사이드바 오른쪽에 고정으로 붙인다. 헤더와 사이드바는
     * 그대로 남아 나가는 길. 크기는 실측해 CSS 변수로(사이드바는 접히기도 함)
     */
    const fillVars = (): void => {
      const head = document.getElementById('headerBar')?.getBoundingClientRect();
      const main = document.querySelector('.main-content')?.getBoundingClientRect();
      /* 사이드바가 본문 위로 겹치는 폭이 있다. 본문 왼쪽만 보면 판이 사이드바 밑으로 들어가
         거기 있는 버튼이 사이드바로 눌린다 (2026-09-01 실측: 1280 폭에서 본문 143, 사이드바 179) */
      const side = document.getElementById('sidebar')?.getBoundingClientRect();
      const left = Math.max(main?.left ?? 0, side && side.width > 0 ? side.right : 0);
      /* 셸이 좁은 창에서 통째로 축소된다. 잰 값은 화면 자, 넣는 값은 축소 전 자라 그대로 넣으면
         그 배율만큼 왼쪽으로 밀린다 (2026-09-01 실측: 1280 폭 배율 0.8, 사이드바 179 인데 판이 143) */
      const scale = play.offsetWidth > 0 ? play.getBoundingClientRect().width / play.offsetWidth : 1;
      const k = scale > 0.05 ? scale : 1;
      play.style.setProperty('--ac-roomfill-y', `${Math.round((head?.bottom ?? 0) / k)}px`);
      play.style.setProperty('--ac-roomfill-x', `${Math.round(left / k)}px`);
    };
    const fill = (on: boolean): void => {
      if (on) fillVars();
      play.classList.toggle('ac-roomfill', on);
    };
    const onFillResize = (): void => {
      if (play.classList.contains('ac-roomfill')) fillVars();
    };
    window.addEventListener('resize', onFillResize, dying);

    const show = (which: 'lobby' | 'wait' | 'play'): void => {
      lobby.style.display = which === 'lobby' ? '' : 'none';
      wait.style.display = which === 'wait' ? '' : 'none';
      play.style.display = which === 'play' ? '' : 'none';
      /* 판에서 로비로 돌아오면 진열장부터. 집었던 물건 화면에 걸려 있으면 길을 잃는다. */
      if (which === 'lobby') {
        closeDetail();
        fill(false);
        setBlipVoice('default');
      }
      /* 판이 도는 동안임을 뿌리에 남긴다. 좁게 눕힌 화면에서 셸 메뉴 띠를 접는 데 쓴다.
         (아래 `--ac-playing` 규칙, 그 이유는 거기 적어 뒀다) */
      document.documentElement.classList.toggle('ac-playing', which === 'play');
    };

    /* ── 로비 ──────────────────────────────────────────────────────
     *
     * **진열장의 물건 하나.** 카드가 아니라 물건이다. 이름은 올렸을 때만 이름표로 선다.
     * 크기는 id 에서 결정적으로 뽑는다: 진열장이 자를 대고 그린 듯 균일하면 물건이 아니라
     * 아이콘 표가 된다. 이름표의 번호 = 명부 순서 (사람이 몇 번으로 부를 수 있게). */
    const objOf = (g: (typeof CARDS)[number]): string => {
      const sizes = [40, 46, 52, 58];
      const size = sizes[(g.id.charCodeAt(0) + g.id.length) % sizes.length];
      /* 이름은 **상시** 보인다. 그림만으로는 무슨 놀이인지 모른다(사용자 실측 피드백).
         물건 밑의 작은 값표처럼, 진열장 감은 지키고 접근성만 얹는다. */
      return (
        '<button class="ac-obj" data-obj="' + g.id + '">' +
        '<span class="ac-objface" style="font-size:' + size + 'px">' + iconOf(g.id) + '</span>' +
        '<b class="ac-objname">' + esc(t('arcade.game.' + g.id + '.name')) + '</b>' +
        '</button>'
      );
    };

    /**
     * 물건을 집으면. 진열장이 접히고 그 물건이 탁자 가운데로 온다.
     * 시작 단추의 data-* 는 카드 시절 그대로다(`wireCards`, 화면 검사가 같은 이름을 본다).
     */
    function openDetail(id: string): void {
      /* 감춘 놀이도 주소로 들어오면 열린다. 그래서 로비 목록이 아니라 전체 명패에서 찾는다 */
      const g = cardById(id);
      if (!g) return;
      /* 번호는 로비에 보이는 차례. 감춘 놀이는 번호가 없다 */
      const no = CARDS.indexOf(g) + 1;
      const [min, max] = g.seats;
      /* **차례 놀이만** 편지로 둘 수 있다. 실시간 놀이를 편지로 두면 상대가 링크를 여는
         순간에 이미 판이 끝나 있다. 그건 놀이가 아니라 결과 통보다.
         **넷부터 편이 선다.** 둘, 셋은 나눠 봐야 한 편에 하나씩이라 개인전과 같다. */
      const more =
        (!g.realtime && g.seats[0] === 2
          ? '<button data-letter="' + g.id + '">' + esc(t('arcade.btn.letter')) + '</button>'
          : '') +
        (isTeamy(g.seats[1])
          ? '<button data-team="' + g.id + '">' + esc(t('arcade.btn.team')) + '</button>'
          : '') +
        '<button data-find="' + g.id + '">' + esc(t('arcade.btn.find')) + '</button>';
      const d = $<HTMLElement>('#acDetail');
      d.innerHTML =
        '<button class="ac-back" id="acBack">‹ ' + esc(t('widgets.arcade.title', undefined, '오락실')) + '</button>' +
        '<div class="ac-dwrap">' +
        '<div class="ac-dface">' + iconOf(g.id) + '</div>' +
        '<div class="ac-dinfo">' +
        '<h3>' + (no > 0 ? '<i>' + no + '</i>' : '') + esc(t('arcade.game.' + g.id + '.name')) + '</h3>' +
        '<p>' + esc(t('arcade.game.' + g.id + '.desc')) + '</p>' +
        '<div class="ac-dmeta">' +
        '<span>' + esc(t('arcade.seats', { min: String(min), max: String(max) })) + '</span>' +
        /* 길이는 손으로 안 적는다. 저울이 잰 수에서 나온다(`length.ts`). */
        '<span title="' +
        esc(secondsOf(g.id) === null ? '' : t('arcade.len.secs', { n: String(Math.round(secondsOf(g.id) as number)) })) +
        '">' + esc(t('arcade.len.' + lengthOf(g.id))) + '</span>' +
        (bestOf(g.id) ? '<span>🏅 ' + esc(t('arcade.best.card', { n: String(bestOf(g.id)?.score ?? 0) })) + '</span>' : '') +
        '</div>' +
        setupRow(g.id) +
        '<div class="ac-go">' +
        '<button data-solo="' + g.id + '">' + esc(t('arcade.btn.solo')) + '</button>' +
        '<button data-host="' + g.id + '">' + esc(t('arcade.btn.together')) + '</button>' +
        (supportsRanked(g.id, g.seats)
          ? '<button data-rank="' + g.id + '">' + esc(t('arcade.btn.rank')) + '</button>'
          : '') +
        /* 배우기(`tutor.ts`)는 처음 온 사람의 길이라 밑줄 글자가 아니라 버튼으로. 지금은 오목만 */
        (g.id === 'gomoku' ? '<button data-tutor="' + g.id + '">' + esc(t('arcade.btn.tutor')) + '</button>' : '') +
        '</div>' +
        (supportsRanked(g.id, g.seats) ? '<div class="ac-grade" id="acGrade"></div>' : '') +
        '<div class="ac-past" id="acPast" hidden></div>' +
        '<div class="ac-more">' + more + '</div>' +
        '</div></div>';
      $<HTMLElement>('#acShelfAll').style.display = 'none';
      d.style.display = '';
      wireCards();
      wireSetup(g.id);
      void paintGrade(g.id);
      void paintPast(g.id);
      const back = container.querySelector<HTMLButtonElement>('#acBack');
      if (back) back.onclick = closeDetail;
    }

    /**
     * 시작 전에 고르는 줄. **껍데기는 무엇을 고르는지 모른다** (`setups.ts` 가 정본).
     * 고를 게 없는 놀이는 빈 글자라 아무 자리도 안 차지함
     */
    function setupRow(id: string): string {
      const choices = SETUPS[id];
      if (!choices) return '';
      const now = optsFor(id);
      return (
        '<div class="ac-setup">' +
        choices
          .map(
            (c) =>
              '<div class="ac-setrow"><b>' + esc(t(c.label)) + '</b><div class="ac-setpick">' +
              c.options
                .map(
                  (o) =>
                    '<button data-set="' + esc(id) + '" data-setkey="' + esc(c.key) + '"' +
                    ' data-setval="' + esc(String(o.value)) + '"' +
                    ' aria-pressed="' + String(now[c.key] === o.value) + '">' +
                    esc(t(o.label)) + '</button>'
                )
                .join('') +
              '</div></div>'
          )
          .join('') +
        '</div>'
      );
    }

    /** 고른 값을 적고 그 줄만 다시 그린다. 판을 다시 열면 사람이 어디였는지 잊는다 */
    function wireSetup(id: string): void {
      container.querySelectorAll<HTMLButtonElement>('#acDetail button[data-set]').forEach((b) => {
        b.onclick = () => {
          const key = b.dataset.setkey as string;
          const raw = b.dataset.setval as string;
          const value: number | boolean = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
          chooseOpt(id, key, value);
          const box = container.querySelector<HTMLElement>('#acDetail .ac-setup');
          if (box) box.outerHTML = setupRow(id);
          wireSetup(id);
        };
      });
    }

    function closeDetail(): void {
      const d = $<HTMLElement>('#acDetail');
      d.style.display = 'none';
      d.innerHTML = '';
      $<HTMLElement>('#acShelfAll').style.display = '';
    }

    /* 오늘의 세 판. 51개 앞에서 뭘 하지를 대신 정해 준다 (TASK-KL-264). */
    paintRecent();
    const picks = todayPicks(CARDS.map((g) => ({ id: g.id, kind: kindOf(g.id) })));
    const paintToday = (): void => {
      const st = dailyState();
      $<HTMLElement>('#acToday').innerHTML =
        '<h3 class="ac-kind">' + esc(t('arcade.today.title')) +
        ' <i>' + st.done.length + '/' + PICKS + '</i>' +
        (st.streak > 0 ? '<b class="ac-streak">🔥 ' + esc(t('arcade.today.streak', { n: String(st.streak) })) + '</b>' : '') +
        '</h3>' +
        '<div class="ac-todaystrip">' +
        picks
          .map((id) =>
            /* 표를 따로 쓴다. `data-solo` 를 쓰면 게임 몇 종인가를 세는 자리가 셋만큼 샌다(실측 54종). */
            '<button class="ac-todaycard' + (st.done.includes(id) ? ' ac-done' : '') + '" data-today="' + id + '">' +
            '<span>' + iconOf(id) + '</span>' + esc(t('arcade.game.' + id + '.name')) +
            (st.done.includes(id) ? ' ✓' : '') + '</button>')
          .join('') +
        '<button class="btn btn-primary ac-tourbtn" id="acTour">' + esc(t('arcade.tour.start', { n: String(ROUNDS) })) + '</button>' +
        '</div>';
      container.querySelectorAll<HTMLButtonElement>('.ac-todaycard').forEach((b) => {
        b.onclick = (): void => {
          remember();
          startSolo(String(b.dataset.today));
        };
      });
      const tourBtn = container.querySelector<HTMLButtonElement>('#acTour');
      if (tourBtn) tourBtn.onclick = startTour;
    };
    paintToday();

    /* ── 추천 여섯 칸 + 찾기 (TASK-KL-264 F4) ──────────────────────
     *
     * 51개를 갈래로 묶어 늘어놓는 것만으로는 부족했다. 묶어도 51개는 51개다. 그래서 위에
     * **여섯 칸**을 두고(내가 안 해 본 것 먼저), 그래도 특정 판을 찾는 사람을 위해 **찾기**를 둔다.
     * 찾는 중에는 갈래 제목도 추천도 걷어 낸다. 찾는 사람에게 그건 전부 방해다. */
    const findEl = $<HTMLInputElement>('#acFind');

    function remember(): void {
      try {
        localStorage.setItem('karmolab.arcade.name', nameInput.value.trim());
      } catch {
        /* 못 적어도 그만 */
      }
    }

    /**
     * 방금 논 놀이 (2026-09-01, 레퍼런스 대조)
     *
     * - 진열장에 쉰한 개. 어제 놀던 것을 다시 찾으려면 눈으로 훑거나 검색해야 했음
     * - CrazyGames 는 옆줄 맨 위에 최근 플레이를 둔다(홈, 최근, 새것, 인기 순. 게임 4,500개)
     * - 오늘의 세 판보다 **위**에 둔다. 오늘의 세 판은 뭘 할지 모르는 사람을 위한 것이고,
     *   최근은 이미 마음먹고 온 사람의 것
     */
    const RECENT_KEY = 'karmolab.arcade.recent';
    const RECENT_MAX = 5;

    function recentList(): string[] {
      try {
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as unknown;
        return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
      } catch {
        return [];
      }
    }

    /** 논 놀이를 맨 앞으로. 같은 것을 두 번 안 담는다 */
    function noteRecent(id: string): void {
      if (!id || !cardById(id)) return;
      try {
        const next = [id, ...recentList().filter((x) => x !== id)].slice(0, RECENT_MAX);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* 못 적어도 그만 */
      }
      paintRecent();
    }

    /** 최근 줄. 없으면 아예 안 그린다 */
    function paintRecent(): void {
      const box = container.querySelector<HTMLElement>('#acRecent');
      if (!box) return;
      const list = recentList().filter((id) => cardById(id));
      if (!list.length) {
        box.innerHTML = '';
        return;
      }
      box.innerHTML =
        '<h3 class="ac-kind">' + esc(t('arcade.recent.title')) + '</h3>' +
        '<div class="ac-recentstrip">' +
        list
          .map(
            (id) =>
              '<button class="ac-recentcard" data-recent="' + esc(id) + '">' +
              '<span>' + iconOf(id) + '</span>' +
              esc(t('arcade.game.' + id + '.name')) +
              '</button>'
          )
          .join('') +
        '</div>';
      container.querySelectorAll<HTMLButtonElement>('[data-recent]').forEach((b) => {
        b.onclick = (): void => {
          remember();
          openDetail(String(b.dataset.recent));
        };
      });
    }

    /** 카드는 찾을 때마다 다시 그려지므로 배선도 그때마다 다시 한다. */
    function wireCards(): void {
      const on = (attr: string, key: string, go: (id: string) => void): void => {
        container.querySelectorAll<HTMLButtonElement>('[' + attr + ']').forEach((b) => {
          b.onclick = (): void => {
            remember();
            go(String(b.dataset[key]));
          };
        });
      };
      on('data-obj', 'obj', openDetail);
      on('data-solo', 'solo', startSolo);
      on('data-pick', 'pick', startSolo);
      on('data-host', 'host', openRoom);
      on('data-pickhost', 'pickhost', openRoom);
      on('data-letter', 'letter', startLetter);
      on('data-pickletter', 'pickletter', startLetter);
      on('data-team', 'team', startTeam);
      on('data-pickteam', 'pickteam', startTeam);
      on('data-find', 'find', (id) => openRoom(id, true));
      on('data-tutor', 'tutor', startTutor);
      on('data-pickfind', 'pickfind', (id) => openRoom(id, true));
      on('data-rank', 'rank', startRanked);
    }

    /** 이 게임이 검색어에 걸리나. 이름, 설명, 갈래, 길이 어디든. */
    const hayOf = (id: string): string[] => [
      id,
      t('arcade.game.' + id + '.name'),
      t('arcade.game.' + id + '.desc'),
      t('arcade.kind.' + kindOf(id)),
      t('arcade.len.' + lengthOf(id))
    ];

    /**
     * 지금 열린 방. 혼자 연 사람이 남을 만나는 유일한 길 (arcade-next ★2).
     *
     * 못 물어보면(봇이 죽었거나 회선이 끊겼거나) **그냥 안 그린다.** 불러올 수 없음을
     * 띄우면 로비가 고장 난 것처럼 보이는데, 이건 있으면 좋은 것이지 없으면 안 되는 것이 아니다.
     */
    const paintOpen = async (): Promise<void> => {
      const box = $<HTMLElement>('#acOpen');
      const rooms = await listRooms();
      /* 내 방은 빼고 보여 준다. 내가 연 방에 내가 들어가는 단추는 뜻이 없다. */
      const mine = new Set(net ? [$<HTMLElement>('#acCode').textContent ?? ''] : []);
      const list = rooms.filter((r) => !mine.has(r.code));
      if (!list.length) { box.innerHTML = ''; return; }
      box.innerHTML =
        '<h3 class="ac-kind">' + esc(t('arcade.open.title')) + ' <i>' + list.length + '</i></h3>' +
        '<div class="ac-openstrip">' +
        list
          .map((r: OpenRoom) =>
            /* 판이 이미 돌면 들어가도 구경이다. 그걸 누르기 전에 말해 준다 */
            '<button class="ac-opencard" data-join="' + esc(r.code) + '">' +
            '<span>' + iconOf(r.game) + '</span>' +
            esc(t(r.playing ? 'arcade.open.watch' : 'arcade.open.card', {
              game: gameById(r.game) ? t('arcade.game.' + r.game + '.name') : r.game,
              host: r.host
            })) + '</button>')
          .join('') +
        '</div>';
      container.querySelectorAll<HTMLButtonElement>('[data-join]').forEach((b) => {
        b.onclick = (): void => {
          remember();
          joinRoomAs(String(b.dataset.join));
        };
      });
    };

    /* 추천 칸은 접었다. 진열장은 전부를 한눈에 놓으므로 여섯 개 골라 주기가 할 일이 없다. */
    const paintPicks = (): void => {
      $<HTMLElement>('#acPicks').innerHTML = '';
    };

    /* 진열장. 갈래 제목 없이 전부 한 탁자에. 찾는 중에는 걸리는 물건만 남긴다. */
    const paintGames = (): void => {
      const q = findEl.value;
      const box = $<HTMLElement>('#acGames');
      const mine = q.trim() ? CARDS.filter((g) => matches(hayOf(g.id), q)) : CARDS;
      box.innerHTML = mine.length
        ? mine.map((g) => objOf(g)).join('')
        : '<p class="ac-none">' + esc(t('arcade.find.none')) + '</p>';
      wireCards();
    };

    /* ── 혼자 놀이 (TASK-KL-313) ─────────────────────────────────
     *
     * 오락실 밖에 놀이터라는 두 번째 문이 있었다. 문이 둘이면 어느 문으로 들어왔느냐가
     * 무엇을 아는지를 정한다. 오락실만 본 사람은 하나 맞히기를 영영 몰랐다. 그래서 그 문의
     * 알맹이(오늘의 코스 줄, 놀이 카드)를 여기로 옮기고 저쪽 문은 닫는다.
     *
     * 명부는 여기 다시 안 적는다. `apps/play/games.json` 하나가 정본이다(`solo.ts`).
     */
    let solo: SoloPlay[] = [];

    const soloCard = (g: SoloPlay): string =>
      /* `data-obj` 를 같이 쓰지 않는다. 그 이름이 곧 방 게임 몇 종인가를 세는 자리다
         (추천 여섯에서 이미 겪었다: 51종이 54종이 됐다). 생김새만 진열장 물건과 같다 . 
         혼자 놀이를 따로 분류할 이유가 없다는 피드백대로 같은 선반에 이어 놓는다. */
      '<a class="ac-solocard" href="' + esc(g.url) + '" data-solo-go="' + esc(g.id) + '">' +
      '<span class="ac-objface" style="font-size:44px">' + esc(g.emoji || '🎲') + '</span>' +
      '<b class="ac-objname">' + esc(g.title) + '</b>' +
      '</a>';

    const paintSolo = (): void => {
      const box = $<HTMLElement>('#acSolo');
      if (!solo.length) { box.innerHTML = ''; return; }
      const q = findEl.value;
      const mine = q.trim()
        ? solo.filter((g) => matches([g.id, g.title, g.lead], q))
        : solo;
      if (!mine.length) { box.innerHTML = ''; return; }

      /* 오늘의 코스. 셈은 놀이들과 **같은 한 벌**(`play-course`)을 쓴다. 여기서 따로 세면
         하나 남았다가 놀이 안과 오락실에서 서로 다른 말을 한다. */
      const steps = courseSteps(solo);
      const left = steps.filter((x) => !x.done).length;
      const head = q.trim()
        ? ''
        : '<p class="ac-solocourse">' +
          (left
            ? esc(t('arcade.solo.left', { n: String(left) }))
            : esc(t('arcade.solo.allDone', { n: String(courseRun(true)) }))) +
          '</p>';

      /* 갈래 제목 없이 같은 진열장이 이어진다. 방 게임과 혼자 놀이를 사람이 구분할 이유가 없다.
         코스 줄은 선반 뒤에. 두 선반 사이에 끼면 끊어 읽힌다. */
      box.innerHTML =
        '<div class="ac-shelf">' + mine.map(soloCard).join('') + '</div>' +
        head;

      /* 앱 안의 놀이는 새 페이지를 받을 이유가 없다. 그 자리에서 화면만 바꾼다.
         밖에 있는 것(`/daily/`)은 진짜 링크 그대로 둔다(새 창, 복사가 살아 있어야 한다). */
      box.querySelectorAll<HTMLAnchorElement>('a[data-solo-go]').forEach((a) => {
        const tool = inAppTool(a.getAttribute('href') || '');
        if (!tool) return;
        a.onclick = (e): void => {
          e.preventDefault();
          Toolbox.switchPage?.(tool);
        };
      });
    };

    /* ── 놀이의 재료: 표 (TASK-KL-313. 놀이터에서 옮김) ────────
     *
     * 표를 만들면 높은 쪽 고르기, 스무고개, 이상형 월드컵이 한꺼번에 켜진다. 그런데 그 문이
     * 놀이터 화면에만 있었다. 오락실로 들어온 사람에게는 없는 기능이었다.
     *
     * fail-open: 오늘의 표(우물)에 못 닿으면 그 줄만 없다. 오락실은 그대로 선다.
     */
    const paintPacks = (): void => {
      const box = $<HTMLElement>('#acPacks');
      if (findEl.value.trim()) { box.innerHTML = ''; return; }
      const packs = loadPacks();
      box.innerHTML =
        '<h3 class="ac-kind">' + esc(t('arcade.packs.title')) + '</h3>' +
        '<p class="ac-solocourse">' +
        esc(packs.length ? t('arcade.packs.mine', { n: String(packs.length) }) : t('arcade.packs.none')) +
        '</p>' +
        '<div class="ac-packrow">' +
        '<button type="button" class="btn btn-ghost" id="acPackNew">' +
        esc(packs.length ? t('arcade.packs.more') : t('arcade.packs.new')) + '</button>' +
        '<button type="button" class="btn btn-ghost" id="acPackWell" hidden></button>' +
        '</div>';
      $<HTMLButtonElement>('#acPackNew').onclick = (): void => Toolbox.switchPage?.('packs');

      /* 오늘의 표 = 서버가 날짜(KST)로 고른 한 벌. 누구에게나 같아야 겨룰 수 있다. */
      void fetch('https://yawnbot.mascari4615.com/kl/wells')
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { wells?: Array<{ id: string; title: string; emoji: string }>; today?: string } | null) => {
          const today = (body?.wells || []).filter((w) => w.id === body?.today)[0];
          const btn = container.querySelector<HTMLButtonElement>('#acPackWell');
          if (!today || !btn || !container.isConnected) return;
          btn.hidden = false;
          btn.textContent = t('arcade.packs.well', { table: `${today.emoji} ${today.title}` });
          btn.onclick = (): void => Toolbox.switchPage?.('packwell');
        })
        .catch(() => {
          /* 우물에 못 닿으면 이 단추만 없다 */
        });
    };

    void soloPlays().then((rows) => {
      if (!container.isConnected) return;
      solo = rows;
      paintSolo();
    });

    paintPicks();
    paintGames();
    void paintOpen();
    /* 목록은 살아 있는 것이라 가끔 다시 본다. 로비에 있을 때만. */
    // 보이는 동안만 다시 본다 (`lib/tick`). 덮어 둔 탭에서 방 목록을 받아 올 이유가 없다.
    Toolbox.onDispose?.(intervalWhileVisible(() => {
      if (lobby.style.display !== 'none') void paintOpen();
    }, 20000));
    paintPacks();

    /* 찾는 중에는 오늘의 셋도 접는다. 찾는 사람은 이미 무엇을 할지 정했다. */
    findEl.oninput = (): void => {
      $<HTMLElement>('#acToday').style.display = findEl.value.trim() ? 'none' : '';
      paintPicks();
      paintGames();
      void paintOpen();
      paintSolo();
      paintPacks();
    };

    /* ── 판 ──────────────────────────────────────────────────────── */
    let match: Match<unknown, unknown> | null = null;
    /** 판을 만든 규칙 정의 그대로(봇 세기, 고스트까지). 복기와 곁가지는 이걸로 다시 굴려야 같은 판(2026-08-30 실측: 고스트를 빼고 굴려 딴 판이 됐다) */
    const session: Session = {
      recipe: { seed: 0, seats: [], personas: {}, level: 'normal', def: null },
      lastBest: null,
      seenMoves: 0,
      hurriedAt: -1,
      ended: false,
      soundedRound: -1,
      resultMeta: null
    };
    const resetMatchSignals = (): void => {
      session.seenMoves = match?.moves ?? 0;
      session.hurriedAt = -1;
      session.ended = false;
      session.soundedRound = -1;
      session.resultMeta = null;
    };
    let tape: Tape<unknown> | null = null;
    /** 편을 갈랐으면 자리→편 표. 개인전이면 null. */
    let plan: Plan | null = null;
    /** 지금 화면에 도는 것이 **다시 보기**인가. 그렇다면 손이 안 먹는다. */
    let replaying = false;
    /**
     * 복기. 판을 씨앗으로 다시 굴려 **수마다 장면**을 잡아 두고 타임라인으로 넘김
     * `branch` 는 Try Play. 그 수까지 굴린 살아 있는 판에서 다른 수를 이어 두는 것
     */
    let review: {
      frames: Array<{ at: number; v: MatchView<unknown> }>;
      order: number[];
      at: number;
      playing: boolean;
      speed: number;
      /** 자동 넘김을 멈추는 손. 숨은 탭에서는 스스로 쉰다 */
      timer: (() => void) | null;
      branch: boolean;
    } | null = null;
    let render: Render<unknown> | null = null;
    let net: Net | null = null;
    /* 저택 사람의 얼굴, 말풍선, 컷인. 판의 그림은 물어서 씀 (`mdd.ts`) */
    const mdd = mountMdd({ container, view: () => match?.view() ?? shadow?.v ?? null, mySeat: () => mySeat });
    /** 힌트. 규칙이 고른 수와 언제까지 보일지. 복기에서는 그 장면 동안 */
    let hintAt: { action: unknown; until: number } | null = null;
    function canHint(): boolean {
      const g = gameById(gameId);
      return !!g?.hint && !net && !letter && !tour && !watching && tutorAt === null && (review !== null || (!!match && !match.view().finished));
    }
    function paintHint(): void {
      const b = container.querySelector<HTMLButtonElement>('#acHint');
      if (b) b.style.display = canHint() ? '' : 'none';
    }
    function askHint(): void {
      const g = gameById(gameId);
      if (!g?.hint || !canHint()) return;
      const v = review && !review.branch ? review.frames[review.at].v : match?.view();
      if (!v) return;
      const turn = (v.state as { turn?: number } | null)?.turn;
      const seat = review && !review.branch && typeof turn === 'number' ? turn : mySeat;
      const action = g.hint(v.state as never, seat);
      if (action === null || action === undefined) return;
      hintAt = { action, until: performance.now() + (review && !review.branch ? 60000 : 3500) };
      if (review && !review.branch) seek(review.at);
    }
    let raf = 0;
    let t0 = 0;
    let gameId = '';
    let mySeat = 0;
    let peers: Peer[] = [];
    /** 주인이 정한 자리 지도. 손님은 여기서 제 자리를 찾는다. */
    let seatOf: Record<string, number> = {};
    /** 봇 세기. 고른 것은 이 브라우저에만 남는다. */
    const LEVEL_KEY = 'karmolab.arcade.level';
    const levelNow = (): BotLevel => {
      try {
        const v = localStorage.getItem(LEVEL_KEY);
        if (v === 'mild' || v === 'spicy' || v === 'normal') return v;
      } catch {
        /* 못 읽으면 보통 */
      }
      return 'normal';
    };

    /** 자리를 못 받아 **구경만** 하는 중인가 (TASK-KL-264 D2). */
    let watching = false;
    /** 손님 쪽엔 커널이 없다. 주인이 보낸 판을 들고 그린다. */
    let shadow: { v: MatchView<unknown>; now: number; at: number } | null = null;

    /**
     * 끝난 판의 결과를 **판 위에 덮어** 보여 준다 (TASK-KL-264 C2).
     *
     * 전에는 판 아래 한 줄이 전부였다. 이슬이 이겼다. 몇 점이었는지, 내가 몇 등인지는
     * 자리 줄을 눈으로 훑어야 알았고, 게임마다 제 나름의 결과를 그리기도 했다. 이걸 껍데기
     * 한 곳으로 모은다: **51개가 한꺼번에 같은 결과 화면을 얻는다.**
     *
     * 등수는 `rank.ts` 가 센다. 대회 점수와 같은 셈이라 화면과 점수표가 안 갈린다.
     */
    function showResult(v: MatchView<unknown>, draw: boolean, top: number, note: string): void {
      /* 편을 갈랐으면 **편 점수로** 줄을 세운다. 개인 등수를 보여 주면 편이 아니라 개인전이다. */
      if (plan) {
        const ts = teamScores(plan, v.seats.map((x) => x.score));
        const best = Math.max(...ts);
        const myTeam = plan[mySeat] ?? -1;
        $<HTMLElement>('#acOverHead').textContent = ts[0] === ts[1]
          ? '🤝 ' + t('arcade.team.draw')
          : (ts[myTeam] === best ? '🏆 ' : '🏁 ') + t('arcade.team.win', { who: TEAM_NAMES[ts.indexOf(best)] ?? '' });
        $<HTMLElement>('#acOverList').innerHTML = ts
          .map((sc, ti) =>
            '<li class="ac-overrow' + (ti === myTeam ? ' ac-me' : '') + '">' +
            '<span class="ac-overrank">' + esc(TEAM_NAMES[ti] ?? '') + '</span>' +
            '<span class="ac-overname">' +
            v.seats.filter((_, i) => plan?.[i] === ti).map((x) => esc(x.name)).join(', ') +
            '</span><span class="ac-overscore">' + sc + '</span></li>')
          .join('');
        $<HTMLElement>('#acOverNote').textContent = note;
        $<HTMLElement>('#acOver').style.display = '';
        placeEndButtons(true);
        return;
      }
      const order = ranks(v.seats.map((x) => x.score));
      /* 구경꾼에게는 내가 이겼다가 없다. 자리가 -1 이라 점수가 0 인데, 아무도 점수를
         못 낸 판(0:0)에서는 그 0 이 1등과 같아져 구경꾼이 이긴 것으로 뜬다. */
      const mine = watching ? NaN : (v.seats[mySeat]?.score ?? 0);
      $<HTMLElement>('#acOverHead').textContent = draw
        ? '🤝 ' + t('arcade.result.draw')
        : mine === top
          ? '🏆 ' + t('arcade.over.mine')
          : '🏁 ' + t('arcade.result.win', { who: v.seats.filter((x) => x.score === top).map((x) => x.name).join(', ') });
      $<HTMLElement>('#acOverList').innerHTML = v.seats
        .map((sq, i) => ({ sq, i, r: order[i] }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map(
          ({ sq, i, r }) =>
            '<li class="ac-overrow' + (i === mySeat ? ' ac-me' : '') + '">' +
            '<span class="ac-overrank">' + (r + 1) + '</span>' +
            '<span class="ac-overname">' + esc(sq.name) + (sq.bot && !castByName(sq.name) ? ' 🤖' : '') + '</span>' +
            '<span class="ac-overscore">' + sq.score + '</span></li>'
        )
        .join('');
      /* 어제 N. 기록이 있고 혼자 논 판일 때만. 남과 논 판의 점수는 내 기록과 견줄 것이 아니다. */
      const mineNow = v.seats[mySeat]?.score ?? 0;
      const record = session.lastBest !== null && !net && !watching
        ? (mineNow > session.lastBest
            ? t('arcade.best.new', { n: String(mineNow), was: String(session.lastBest) })
            : t('arcade.best.was', { n: String(session.lastBest) }))
        : '';
      /* 몇 수에 얼마나 걸렸나. 주인과 혼자 판은 커널에서, 손님은 주인이 보낸 것에서 */
      const meta = match ? { moves: match.moves, ms: match.clock() } : session.resultMeta;
      const count = meta && meta.moves > 0 ? t('arcade.result.moves', { n: String(meta.moves), t: clockText(meta.ms) }) : '';
      $<HTMLElement>('#acOverNote').textContent = [note, count, record].filter(Boolean).join(', ');
      $<HTMLElement>('#acOver').style.display = '';
      placeEndButtons(true);
      paintOverBody(v, top);
    }

    /** 결과 종이 옆의 전신. 이긴 사람(비기면 상대). MDD 가 꺼져 있으면 없음 */
    function paintOverBody(v: MatchView<unknown>, top: number): void {
      const el = $<HTMLElement>('#acOverBody');
      const room = !!play.querySelector('.ac-t3room');
      if (!room || !mdd.on()) {
        el.hidden = true;
        return;
      }
      const win = v.seats.find((sq, i) => i !== mySeat && sq.score === top) ?? v.seats.find((_, i) => i !== mySeat);
      const c = win ? castByName(win.name) : null;
      if (!c) {
        el.hidden = true;
        return;
      }
      el.innerHTML = faceSvg(c, win && win.score === top ? 'glad' : 'sad');
      el.hidden = false;
    }

    /** 1:03 꼴. 한 시간 넘는 판은 없다고 본다 */
    function clockText(ms: number): string {
      const s = Math.max(0, Math.round(ms / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    /** 다음 판, 나가기 전에 걷는다. 안 걷으면 다음 판이 지난 결과 뒤에서 돈다. */
    function hideResult(): void {
      $<HTMLElement>('#acOver').style.display = 'none';
      $<HTMLElement>('#acOverBody').hidden = true;
      placeEndButtons(false);
    }

    /** 끝난 판의 버튼 셋(한 판 더, 색 바꿔, 다시 보기). 방에서는 결과 종이 아래로, 아니면 원래 줄로 */
    function placeEndButtons(inOver: boolean): void {
      const acts = $<HTMLElement>('#acOverActs');
      const room = inOver && !!play.querySelector('.ac-t3room');
      const btns = ['#acAgain', '#acSwapColor', '#acReplay'].map((q) => $<HTMLButtonElement>(q));
      if (room) acts.append(...btns);
      else $<HTMLElement>('#acControls').append(...btns);
    }

    /** 얼굴 한 장. 내 자리는 조수, 봇 자리는 그 사람. 표정은 차례와 결과에서 */
    function paint(v: MatchView<unknown>, now: number): void {
      /* 지금 이 창이 **들고 있는 판**을 밖에서 볼 수 있게 둔다 (TASK-KL-264).
         감추기가 새는지는 화면으로 못 잡는다. 화면은 남의 배를 애초에 안 그리므로,
         새어도 그림은 똑같다(일부러 새게 해 보고 검사가 안 빨개지는 것을 확인했다).
         새는 자리는 보낸 값이라 받은 값을 직접 읽어야 한다. 이 창이 이미 가진 것이므로
         내보낸다고 더 알려지는 것은 없다. */
      /* 이 판이 **언제 저절로 끝나나**(`endsAt`)도 같이 내놓는다. 놀이마다 제한이 25초에서 300초까지 다르다.
         밖에서 기다리는 검사가 그걸 모르면 제 맘대로 잡은 참을성으로 안 끝났다고 적는다(2026-08-17 실측:
         참을성 60초인데 지뢰찾기 제한이 180초라, 그 놀이가 뽑히면 무조건 빨강이었다). */
      (window as unknown as { __arcade?: unknown }).__arcade = { game: gameId, mySeat, state: v.state, finished: v.finished, endsAt: (v.state as { endsAt?: number } | undefined)?.endsAt ?? null, realtime: cardById(gameId)?.realtime === true, hint: (v as { hint?: unknown }).hint ?? null, tap: (a: unknown) => sendAct(a), tour: tour ? { at: tour.at, games: tour.games, points: tour.points } : null };
      paintSeats(v, now);
      render?.(v, mySeat, now);
      if (match && match.moves !== session.seenMoves && tutorAt === null) {
        hintAt = null;
        const turn = (v.state as { turn?: number } | null)?.turn;
        /* 봇이 둔 뒤 한마디. 아래 좋은 수와 겹치면 그쪽이 이긴다(덮어쓰기라 마지막이 남는다) */
        if (match.moves > session.seenMoves && turn === mySeat && !v.finished) mdd.castSay(1 - mySeat, 'move', 0.3);
        /* 방금 둔 수가 넷이면 컷인. 사람이 만들면 리치, 내가 만들면 사람의 위기 */
        if (match.moves > session.seenMoves && !v.finished && v.seats.length === 2 && typeof turn === 'number') {
          const mover = 1 - turn;
          const cue = gameById(gameId)?.cue?.(v.state, mover) ?? null;
          if (cue === 'four') mdd.cutIn(mover === mySeat ? 1 - mySeat : mover, mover === mySeat ? 'danger' : 'four');
          /* 내가 좋은 수를 두면 상대가 한마디. 컷인까지는 아니고 말풍선. 봇의 둔 뒤 한마디보다 이것이 먼저 */
          else if (cue === 'open3' && mover === mySeat) mdd.castSay(1 - mySeat, 'good', 1);
        }
        session.seenMoves = match.moves;
      }
      /* 내 시계가 10초 아래면 상대가 재촉한다. 한 차례에 한 번 */
      if (match && !v.finished && tutorAt === null) {
        const st = v.state as { limit?: number; turnEndsAt?: number; turn?: number } | null;
        if (st?.limit && st.turn === mySeat && st.turnEndsAt && st.turnEndsAt - now <= 10000) {
          if (session.hurriedAt !== match.moves) {
            session.hurriedAt = match.moves;
            mdd.castSay(1 - mySeat, 'hurry', 0.8);
          }
        }
      }
      /* 복기 장면. 결과와 알림과 기록은 안 건드린다. 곁가지(살아 있는 판)는 보통 판처럼 간다 */
      if (review && !review.branch) {
        paintTimeline();
        return;
      }
      /* 화면이 판을 다시 그리면 **짚은 자리 표시가 같이 지워진다** (2026-08-16 실측).
         매 프레임 `innerHTML` 을 새로 쓰는 놀이에서는 화살표를 눌러도 테두리가 0.4초 안에
         사라져, 키로는 못 논다고 느낀다(체커, 미니장기, 여우와사냥개, 대통령, 도미노 다섯이 그랬다).
         표시는 그림의 일부라 그림을 다시 그리면 다시 얹어야 한다. 여기가 그 자리다. */
      markKeyCursor();
      paintUndo();
      paintRitual(v);

      /* 배우기 정답은 판의 승리가 아니라 다음 장으로 넘기는 손짓 */
      if (v.finished && tutorAt !== null) {
        hideResult();
        return;
      }
      if (v.finished) {
        const top = Math.max(...v.seats.map((s) => s.score));
        const win = v.seats.filter((s) => s.score === top);
        againBtn.style.display = net && !net.host ? 'none' : '';
        /* 방을 든 주인에게는 다른 게임이 하나 더 뜬다. 방을 닫지 않고 갈아탄다. */
        swapBtn.style.display = net?.host ? '' : 'none';
        /* 끝난 판의 말은 **한 번만** 적는다. 매 프레임 다시 적으면 대회 점수판을 적어 놔도
           다음 프레임에 이겼다/졌다로 덮인다(실측. 점수판이 안 보였다). */
        if (!session.ended) {
          session.ended = true;
          if (net?.host && match) net.say({ kind: 'result', moves: match.moves, ms: match.clock() });
          v.seats.forEach((sq, i) => { if (i !== mySeat) mdd.cutIn(i, sq.score === top ? 'win' : 'lose'); });
          const draw = win.length === v.seats.length;
          const mine = watching ? NaN : (v.seats[mySeat]?.score ?? 0);
          say(
            draw ? t('arcade.result.draw') : t('arcade.result.win', { who: win.map((s) => s.name).join(', ') }),
            'ok'
          );
          /* 이긴 판만 세지 않는다. 이겨야 세면 봇 세기를 순한맛으로 낮추는 놀이가 된다. */
          markPlayed(gameId, picks);
          paintToday();
          /* 구경꾼에게는 이기고 지는 소리가 없다. 남의 승부다. */
          blip(watching ? 'good' : draw ? 'good' : mine === top ? 'win' : 'lose');
          buzz(watching ? 'tap' : draw ? 'tap' : mine === top ? 'win' : 'lose');
          let note = '';
          if (tour) {
            tour = award(tour, v.seats.map((x) => x.score));
            const board = v.seats.map((x, i) => x.name + ' ' + (tour?.points[i] ?? 0)).join(', ');
            note = t('arcade.tour.standing', {
              n: String(Math.min(tour.at, ROUNDS)),
              of: String(tour.games.length),
              board
            });
            say(note, 'ok');
            againBtn.textContent = isOver(tour) ? t('arcade.tour.done') : t('arcade.tour.next');
            againBtn.style.display = '';
          }
          /* 끝난 순간의 기록을 챙긴다. 다음 판을 시작하면 커널이 새로 만들어져 사라진다. */
          /* 곁가지(Try Play)의 끝은 원래 판의 기록을 덮어쓰지 않는다 */
          if (match && !replaying && !review) {
            const g0 = gameById(gameId);
            if (g0) tape = record(g0, match as never, session.recipe.seats, session.recipe.seed) as Tape<unknown>;
          }
          /* 여태 가장 잘한 판이면 남긴다. 다음 판에 이 사람이 옆자리에 앉는다 (`ghost.ts`).
             혼자 둔 판만 남긴다: 여럿이 둔 판의 내 수는 남의 수에 기대어 나온 것이라
             혼자 하는 판에 옮겨 놓으면 어제의 나가 아니라 딴사람이 된다. */
          if (tape && !net && !replaying && !review && mySeat >= 0) {
            const mine = tape.moves.filter((mv) => mv.seat === mySeat).map((mv) => ({ at: mv.at, action: mv.action }));
            if (mine.length) noteBest(gameId, v.seats[mySeat]?.score ?? 0, mine);
          }
          /* 다시 보기는 **내 커널이 있을 때만**. 손님은 판을 받아 그리기만 해서 되살릴 것이 없다. */
          replayBtn.style.display = tape && tape.moves.length >= 0 && !replaying && !review ? '' : 'none';
          showResult(v, draw, top, note);
          /**
           * 등급전이면 점수에 반영. 양쪽이 각자 보내고 서버가 둘을 맞춰 봄
           *
           * **패보를 먼저 올림.** 서버는 그 패보로 판을 다시 굴려 승자를 제 손으로 셈
           * (`arcade-verify.ts`). 둘을 나란히 보내면 보고가 먼저 닿는 판이 생기고,
           * 그때는 셀 것이 없어 그냥 통과한다. 그러면 재검증이 있으나 마나가 됨
           */
          if (rankedMatch && !replaying && !review) {
            void (async () => {
              await keepTape();
              await tellRanked(v, draw);
            })();
          }
        }
      } else if (v.note) {
        /* ★ **한 줄 알림이 판을 죽이면 안 된다** (2026-08-17, 진짜로 죽였다).
           i18n 은 없는 열쇠를 **던진다**. 열쇠 이름이 화면에 뜨는 것보다 낫다는 판단이고 옳다.
           그런데 그 던짐이 그리기 고리 한가운데서 나면 판이 거기서 멎는다: 지뢰를 밟는 순간
           `arcade.mine.boom` 이 없어서 대회 한 판이 통째로 안 끝났다(빠진 열쇠 17개를 찾아 채웠다).
           알림은 **그 순간의 곁말**이라 없어도 놀이는 굴러가야 한다. 못 옮기면 조용히 건너뛴다 . 
           대신 창 기록에 한 번 남긴다(감사 `audit:i18n-keys` 가 push 전에 잡으므로 여기는 마지막 그물이다). */
        try {
          say(t(v.note.key, v.note.params));
        } catch (err) {
          console.warn('[arcade] 알림 글을 못 옮겼다. 판은 그대로 간다:', v.note.key, err);
        }
      } else {
        if (v.round !== session.soundedRound) {
          session.soundedRound = v.round;
          blip('start');
        }
        say(t('arcade.status.round', { n: String(v.round + 1), of: String(v.rounds) }));
      }
    }

    /**
     * 자리 카드. **바뀐 자리만** 고쳐 씀
     *
     * 전에는 매 프레임 `innerHTML` 통째 교체. CSS 전환(.2s, .3s)과 얼굴 애니메이션이 매번
     * 처음부터라 아무것도 안 움직임, 말풍선은 그래서 상태로 들고 얹는 우회 (2026-09-02 감사).
     * 자리마다 그린 글자를 `data-k` 에 남기고 같으면 손대지 않음.
     * 화면이 얹는 `ac-turn` 은 그대로 (매 프레임 화면이 다시 판정)
     */
    function paintSeats(v: MatchView<unknown>, now: number): void {
      const items: { cls: string; bot: boolean; html: string }[] = [];
      if (watching) items.push({ cls: 'ac-seat ac-watch', bot: false, html: '👀 ' + esc(t('arcade.watch.now')) });
      v.seats.forEach((s, i) =>
        items.push({
          cls: 'ac-seat' + (i === mySeat ? ' ac-me' : '') + (plan ? ' ac-team' + plan[i] : ''),
          /* 봇 자리에는 표를 단다. 이름이 사람 이름(캐릭터)이라 글자로는 못 가른다 */
          bot: !!s.bot,
          html:
            (plan ? esc(TEAM_NAMES[plan[i]] ?? '') + ' ' : '') +
            mdd.faceOf(v, i) +
            '<span class="ac-seatname">' + esc(s.name) + (s.bot && !castByName(s.name) ? ' 🤖' : '') + '</span> <b>' + s.score + '</b>' +
            mdd.bubbleOf(i)
        })
      );
      while (seatsEl.children.length > items.length) seatsEl.lastElementChild?.remove();
      /* 상대 자리 수. 공용 상이 위 줄을 고르게 나눌 때 씀 */
      seatsEl.style.setProperty('--ac-rows', String(items.filter((it) => !it.cls.includes('ac-me') && !it.cls.includes('ac-watch')).length));
      let row = 0;
      items.forEach((it, i) => {
        let el = seatsEl.children[i] as HTMLElement | undefined;
        if (!el) {
          el = document.createElement('span');
          seatsEl.append(el);
        }
        /* 상대 자리의 줄 번호. 방 표현이 위에서부터 한 장씩 내려 놓는다 */
        const mine = it.cls.includes('ac-me') || it.cls.includes('ac-watch');
        el.style.setProperty('--ac-row', String(mine ? 0 : row));
        if (!mine) row += 1;
        const key = it.cls + '|' + (it.bot ? 1 : 0) + '|' + it.html;
        if (el.dataset.k === key) return;
        el.dataset.k = key;
        const turn = el.classList.contains('ac-turn');
        el.className = it.cls + (turn ? ' ac-turn' : '');
        if (it.bot) el.dataset.bot = '1';
        else delete el.dataset.bot;
        el.innerHTML = it.html;
      });
    }

    function loop(): void {
      raf = requestAnimationFrame(loop);
      if (match) {
        const now = performance.now() - t0;
        match.step(now);
        const v0 = match.view();
        if (hintAt && performance.now() > hintAt.until) hintAt = null;
        const v = hintAt ? { ...v0, hint: hintAt.action } : v0;
        paint(v, now);
        /* 다시 보기는 이 창 안의 일이다. 남에게 흘리면 손님 화면이 지난 판으로 되돌아간다. */
        if (replaying) return;
        /* 주인은 판을 통째로 흘려보낸다. 손님이 커널을 안 돌려야 판정이 하나로 남는다. */
        sendBoard(v, now);
      } else if (shadow) {
        /* 손님 시계는 주인이 보낸 시각에서 이어 간다. 소식이 30ms 마다 와도 막대는 부드럽다. */
        paint(shadow.v, shadow.now + (performance.now() - shadow.at));
      }
    }

    /**
     * 판을 손님들에게 보낸다.
     *
     * 감출 것이 있는 게임이면 **자리마다 다른 판**을 만들어 각자에게 따로 보낸다 . 
     * 통째로 뿌리면 화면이 안 그려도 값은 이미 건너간 뒤다(개발자 도구로 다 보인다).
     */
    function sendBoard(v: MatchView<unknown>, now: number): void {
      if (!net?.host) return;
      const g = gameById(gameId);
      const base = { game: gameId, now, seatOf, rankRoster: rankedRoster?.sync() ?? [] };
      if (!g?.redact) {
        net.sync({ ...base, v: v as unknown as Json });
        return;
      }
      for (const [peerId, seat] of Object.entries(seatOf)) {
        const safe = { ...v, state: g.redact(v.state, seat) };
        net.sync({ ...base, v: safe as unknown as Json }, peerId);
      }
      /* 자리를 못 받은 사람 = 구경꾼. **빼먹으면 빈 화면 앞에 앉아 있게 된다**. 위 고리는
         자리 있는 사람에게만 보내기 때문이다. 구경꾼 몫은 자리마다 겹쳐 지운 판이다. */
      const watchers = peers.filter((p) => seatOf[p.id] === undefined);
      if (!watchers.length) return;
      const shown = { ...v, state: forWatcher(g, v.state, v.seats.length) };
      for (const w of watchers) net.sync({ ...base, v: shown as unknown as Json }, w.id);
    }

    /* ── 키로 논다 (TASK-KL-314 다음, arcade-next ★1) ───────────────
     *
     * **규약을 51개에 나눠 주지 않는다.** 화면들은 이미 `<button>` 으로 판을 그린다. 오목의 칸,
     * 반응 측정의 고르기, 카드 한 장. 그러면 껍데기가 할 일은 하나뿐이다:
     * **그 단추들 위를 화살표로 옮기고 엔터로 누른다.** 게임 화면은 이 사실을 몰라도 된다.
     *
     * 열리는 것 셋: 마우스 없는 데스크톱, 화면낭독기, **검사가 좌표 대신 키로 두는 것**
     * (지금은 좌표를 눌러야 해서 놀이마다 다르게 짠다).
     *
     * 판이 격자면 2차원으로 움직인다. 칸 수를 CSS 에서 읽는다(`grid-template-columns`).
     * 격자가 아니면 한 줄로 본다. 그림판(canvas)만 쓰는 놀이 10개는 손이 그대로 마우스다 . 
     * 거기까지 키로 하려면 게임마다 뜻이 달라 규약이 깨진다.
     */
    let keyAt = -1;

    /** 지금 화면에서 누를 수 있는 단추들. 화면이 다시 그려지면 이 목록도 새로 만든다. */
    const keyable = (): HTMLElement[] =>
      [...viewEl.querySelectorAll<HTMLElement>('button:not([disabled]),[role="button"]:not([aria-disabled="true"])')]
        .filter((e) => e.offsetParent !== null);

    const paintKey = (list: HTMLElement[]): void => {
      list.forEach((e, i) => e.classList.toggle('ac-key', i === keyAt));
    };

    /** 그림을 다시 그린 뒤 짚은 자리를 도로 얹는다. 아직 아무 데도 안 짚었으면 아무것도 안 한다. */
    const markKeyCursor = (): void => {
      if (keyAt < 0) return;
      const list = keyable();
      if (!list.length) return;
      // 단추 수가 줄었으면(카드를 냈다) 끝으로 당긴다. 안 그러면 짚은 자리가 사라진다.
      keyAt = Math.min(keyAt, list.length - 1);
      paintKey(list);
    };

    /** 격자면 한 줄에 몇 칸인가. 아니면 0. */
    const cols = (el: HTMLElement): number => {
      const box = el.parentElement;
      if (!box) return 0;
      const t = getComputedStyle(box).gridTemplateColumns;
      return t && t !== 'none' ? t.split(' ').filter(Boolean).length : 0;
    };

    $<HTMLElement>('#acStage').addEventListener('keydown', (ev: KeyboardEvent) => {
      const list = keyable();
      if (!list.length) return;
      const key = ev.key;
      if (key === 'Enter' || key === ' ') {
        if (keyAt < 0) keyAt = 0;
        list[Math.min(keyAt, list.length - 1)]?.click();
        ev.preventDefault();
        return;
      }
      const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
      let move = step[key];
      if (move === undefined && (key === 'ArrowDown' || key === 'ArrowUp')) {
        const n = cols(list[Math.max(0, keyAt)] ?? list[0]);
        move = (key === 'ArrowDown' ? 1 : -1) * (n || 1);
      }
      if (move === undefined) return;
      /* 처음 누르는 화살표는 고르기 시작이다. 그때 0번으로 들어간다. */
      keyAt = keyAt < 0 ? 0 : Math.min(list.length - 1, Math.max(0, keyAt + move));
      paintKey(list);
      list[keyAt]?.scrollIntoView({ block: 'nearest' });
      ev.preventDefault();
    });

    /**
     * 그리는 법을 고른다. **규칙은 그대로, 표현만 바뀐다** (`views.ts` 의 좁은 구멍).
     *
     * 입체 화면이 있는 판에서 3D 를 골랐고 그 조각이 이미 와 있으면 그것으로, 아니면 2D 로.
     * 아직 안 왔다는 조용히 2D 다. 표현 하나 못 받았다고 판이 안 서면 안 된다.
     */
    function viewFor(id: string): ReturnType<typeof viewById> {
      if (dim() === '3d' && cardById(id)?.d3) {
        const v3 = view3dById(id);
        if (v3) return v3;
      }
      return viewById(id);
    }

    function mountView(id: string): void {
      const gv = viewFor(id);
      /* 입체로 보기로 했는데 조각이 아직이면 **평면을 먼저 세우지 않는다**. 잠깐 보이는 2D 가 거슬린다(사용자 지적).
         빈 무대(어두운 방)로 두고 조각이 오면 붙인다. 인트로 3초 동안 미리 받으므로 대개 안 기다린다 */
      const wait3d = dim() === '3d' && !!cardById(id)?.d3 && !view3dById(id);
      viewEl.innerHTML = '';
      render = gv && !wait3d ? (gv.mount(viewEl, (a: unknown) => sendAct(a)) as Render<unknown>) : null;
      /* 껍데기를 걷을지는 표현이 정한다(`views.ts` 의 `bare`). 판 하나가 다 말하는 놀이가 있다 */
      play.classList.toggle('ac-bare', gv?.bare === true || wait3d);
      /* 방인가는 소리와 바탕만 가름. 화면 채움은 평면이든 입체든 늘 켬
         (2026-09-01 사용자 확정: 모든 놀이가 콘텐츠 칸을 다 씀) */
      const roomNow = dim() === '3d' && !!cardById(id)?.d3;
      /* 2D 공용 상. 표현이 켜면 자리 카드가 상 둘레로 (C1, 사용자 결정 B) */
      play.classList.toggle('ac-table', gv?.table === true && !roomNow && !wait3d);
      fill(true);
      setBlipVoice(roomNow ? 'room' : 'default');
      /* 조각이 아직 안 왔으면 받아서 **그때 다시 붙인다** (TASK-KL-242 쪼개기).
         그 사이 `render` 는 null 이고 `paint` 는 그걸 이미 견딘다. 판은 커널이 들고 있어서
         화면이 늦게 와도 놓치는 수가 없다. 그 사이 딴 게임으로 넘어갔으면 안 붙인다. */
      if (!gv) void ensureGame(id).then(() => { if (gameId === id && !render) mountView(id); });
      /* 3D 로 보기로 했는데 그 표현이 아직 없으면 받아 두고 **그때 갈아 끼운다**.
         지금은 2D 가 이미 서 있으므로 사람은 끊김을 안 본다. */
      else if (dim() === '3d' && cardById(id)?.d3 && !view3dById(id)) {
        /* 다시 그리라고 부르지 않는다. 시계가 매 tick 그린다(`paint`). 붙이기만 하면 다음 칸에 찬다. */
        void ensureView3d(id).then((ok) => {
          if (ok && gameId === id && dim() === '3d') mountView(id);
        });
      }
      paintDim(id);
      paintScene(id);
    }

    /** 지금 표현. 사람이 고른 것이 브라우저에 남는다. */
    /**
     * 지금 표현. **입체가 정본이고 평면은 물러설 자리다** (사용자 확정).
     *
     * 그래서 안 고른 사람은 입체로 본다. 평면으로 내려오는 길은 셋뿐이다: 사람이 골랐거나,
     * 그 판에 입체 화면이 없거나, WebGL 을 못 얻었거나. 앞의 둘은 여기서, 마지막은
     * `three-board.ts` 가 `ok:false` 를 내면 부르는 쪽이 조용히 내려옴
     */
    function dim(): '2d' | '3d' {
      try {
        return localStorage.getItem('karmolab.arcade.dim') === '2d' ? '2d' : '3d';
      } catch {
        return '3d';
      }
    }

    /** 이 판에 입체 화면이 있을 때만 단추가 선다. 없는 판에 죽은 단추를 두지 않는다. */
    /* ── 끝의 의식 (레퍼런스: 색 바꿔 재대국, 무승부 제안, 수와 시간) ─────────── */
    /** 지금 뜬 제안. 상대 답을 기다리는 동안 두 번 안 보낸다 */
    let offerOpen: 'draw' | 'again' | null = null;
    /** 둘이 두는 판인가(사람 둘). 무승부와 기권은 여기서만 뜻이 있다 */
    function twoHumans(): boolean {
      const v = match?.view() ?? shadow?.v;
      return !!v && v.seats.length === 2 && v.seats.every((s) => !s.bot) && !!net && mySeat >= 0;
    }

    function paintRitual(v: MatchView<unknown>): void {
      const live = !v.finished && !replaying && !letter;
      $<HTMLButtonElement>('#acDraw').style.display = live && twoHumans() ? '' : 'none';
      $<HTMLButtonElement>('#acResign').style.display = live && twoHumans() ? '' : 'none';
      /* 색 바꿔 한 판 더: 끝난 판, 두 자리 판, 혼자거나 주인. 대회와 편지는 아님 */
      const canSwap = v.finished && v.seats.length === 2 && !tour && !letter && !replaying && (!net || net.host);
      $<HTMLButtonElement>('#acSwapColor').style.display = canSwap ? '' : 'none';
    }

    /** 제안 상자를 띄운다. 수락과 거절은 아래 단추가 답한다 */
    function showOffer(what: 'draw' | 'again', from: string): void {
      offerOpen = what;
      $<HTMLElement>('#acOfferSay').textContent = t(what === 'draw' ? 'arcade.offer.draw' : 'arcade.offer.again', { who: from });
      $<HTMLElement>('#acOffer').style.display = '';
      blip('start');
    }
    function hideOffer(): void {
      offerOpen = null;
      $<HTMLElement>('#acOffer').style.display = 'none';
    }

    /** 주인이 받는 판 밖의 손. 손님이 보낸 것도, 주인 자신의 것도 여기로 */
    function onMeta(seat: number, meta: string): void {
      if (!match) return;
      const v = match.view();
      const who = v.seats[seat]?.name ?? '';
      const other = 1 - seat;
      switch (meta) {
        case 'draw':
          /* 상대에게 묻는다. 상대가 주인이면 상자를, 손님이면 소식을 */
          if (other === 0) showOffer('draw', who);
          else net?.say({ kind: 'offer', what: 'draw', from: who });
          break;
        case 'accept-draw':
          hideOffer();
          match.end(v.seats.map(() => 0), { key: 'arcade.result.agreed' });
          break;
        case 'decline-draw':
        case 'decline-again':
          hideOffer();
          if (seat === 0) net?.say({ kind: 'declined' });
          else say(t('arcade.offer.declined'), 'warn');
          break;
        case 'resign':
          match.end(v.seats.map((_, i) => (i === seat ? 0 : 1)), { key: 'arcade.result.resign', params: { who } });
          break;
        case 'again':
          if (other === 0) showOffer('again', who);
          else net?.say({ kind: 'offer', what: 'again', from: who });
          break;
        case 'accept-again':
          hideOffer();
          startTogether(undefined, true);
          break;
        default:
          if (meta.startsWith('emote:')) {
            const text = meta.slice(6);
            mdd.sayAs(seat, text);
            net?.say({ kind: 'emote', seat, text });
          }
          break;
      }
    }

    /** 내 손. 주인이면 바로 처리, 손님이면 주인에게 보낸다 */
    function meta(what: string): void {
      if (!net) return;
      if (net.host) onMeta(mySeat, what);
      else net.act({ meta: what });
    }

    $<HTMLButtonElement>('#acDraw').onclick = (): void => {
      if (offerOpen) return;
      offerOpen = 'draw';
      say(t('arcade.offer.sent'), 'ok');
      meta('draw');
    };
    $<HTMLButtonElement>('#acResign').onclick = (): void => meta('resign');
    $<HTMLButtonElement>('#acSwapColor').onclick = (): void => {
      if (!gameId) return;
      if (!net) {
        startSolo(gameId, true);
        return;
      }
      if (offerOpen) return;
      offerOpen = 'again';
      say(t('arcade.offer.sent'), 'ok');
      meta('again');
    };
    $<HTMLButtonElement>('#acOfferYes').onclick = (): void => {
      const what = offerOpen;
      hideOffer();
      if (what === 'draw') meta('accept-draw');
      else if (what === 'again') meta('accept-again');
    };
    $<HTMLButtonElement>('#acOfferNo').onclick = (): void => {
      const what = offerOpen;
      hideOffer();
      if (what === 'draw') meta('decline-draw');
      else if (what === 'again') meta('decline-again');
    };

    /** 무를 수 있는 판인가. 혼자, 봇 상대, 다시보기 아님, 편지 아님, 판 놀이 */
    function canUndo(): boolean {
      /* 판류와 혼자 하는 놀이. 솔리테어는 레퍼런스(solitr.com)도 Undo 를 머리 줄에 둠
         남과 붙는 판에서는 상대 수까지 되감기므로 안 엶 */
      const card = cardById(gameId);
      const solo = card?.seats?.[1] === 1;
      return !!match && !net && !letter && !replaying && !tour && tutorAt === null && (card?.kind === 'board' || solo) && match.tape.length > 0 && !match.view().finished;
    }
    function paintUndo(): void {
      const btn = container.querySelector<HTMLButtonElement>('#acUndo');
      if (btn) btn.style.display = canUndo() ? '' : 'none';
      paintHint();
    }
    function undo(): void {
      if (!canUndo() || !match) return;
      match.rewind(1);
      blip('tap');
      paintUndo();
      mdd.castSay(1 - mySeat, 'undo');
    }

    function paintScene(id: string): void {
      /* 카드 무늬 고르기 (감사 D4). 값과 저장은 deck.ts 에 다 있었고 고르는 자리만 없었다. 카드 갈래에서만 */
      const deckBtn = container.querySelector<HTMLButtonElement>('#acDeck');
      if (deckBtn) {
        const cardGame = cardById(id)?.kind === 'card';
        deckBtn.style.display = cardGame ? '' : 'none';
        if (cardGame) deckBtn.textContent = t('arcade.btn.deck') + '. ' + t(deckSkin().nameKey);
      }
      const btn = container.querySelector<HTMLButtonElement>('#acScene');
      if (!btn) return;
      const on = dim() === '3d' && !!cardById(id)?.d3;
      btn.style.display = on ? '' : 'none';
      const em = container.querySelector<HTMLButtonElement>('#acEmote');
      if (em) em.style.display = on && mdd.on() ? '' : 'none';
      if (!on) $<HTMLElement>('#acEmotes').hidden = true;
      mdd.paint();
      for (const [sel, key] of [['#acCoords', 'karmolab.arcade.coords'], ['#acNums', 'karmolab.arcade.numbers']] as const) {
        const b = container.querySelector<HTMLButtonElement>(sel);
        if (!b) continue;
        /* 좌표와 수 번호는 평면에도 있다(2026-08-31). 판놀이면 표현과 무관하게 */
        b.style.display = cardById(id)?.kind === 'board' ? '' : 'none';
        let v = false;
        try {
          v = localStorage.getItem(key) === 'on';
        } catch {
          /* 못 읽으면 꺼짐 */
        }
        b.setAttribute('aria-pressed', v ? 'true' : 'false');
      }
      btn.textContent = t(specOf(sceneOf(id)).label);
    }

    function paintDim(id: string): void {
      const btn = container.querySelector<HTMLButtonElement>('#acDim');
      if (!btn) return;
      const has = !!cardById(id)?.d3;
      btn.style.display = has ? '' : 'none';
      const on3d = dim() === '3d';
      btn.textContent = on3d ? '3D' : '2D';
      btn.setAttribute('aria-pressed', String(on3d));
    }

    function sendAct(a: unknown): void {
      /* 구경꾼의 손은 여기서 멈춘다. 주인도 자리 없는 사람의 수는 흘리지만, **화면이 반응하면
         사람은 자기가 두고 있다고 믿는다**. 막는 자리는 손이 나가기 전이어야 한다. */
      if (watching) return;
      /* 배우는 중이면 정답 자리만 먹는다 */
      if (tutorAt !== null) {
        const cell = (a as { cell?: number } | null)?.cell;
        if (typeof cell === 'number') tutorPlay(cell);
        return;
      }
      /* 복기 중 판을 누르면 Try Play. 그 수까지 굴린 살아 있는 판에서 이어 둔다 */
      if (review && !review.branch) {
        if (!branchFrom(review.at)) return;
      } else if (replaying) return;
      /* 편지 판이면 **내 차례에 한 수만** 둔다. 두고 나면 링크가 새로 나온다. */
      if (letter) {
        if (turnOf(letter) !== mySeat || match?.view().finished) return;
        const before = JSON.stringify(match?.view().state);
        match?.dispatch(mySeat, a);
        if (JSON.stringify(match?.view().state) === before) return; /* 못 두는 수는 안 적는다 */
        letter = { ...letter, moves: [...letter.moves, a] };
        blip('tap');
        buzz('tap');
        paintLetter();
        return;
      }
      /* 놀이마다 소리를 붙이지 않는다. **손이 지나가는 자리가 여기 하나**라, 여기서 울리면
         51개가 한꺼번에 소리를 얻는다(게임 파일은 소리를 몰라도 된다). */
      blip('tap');
      if (match) match.dispatch(mySeat, a);
      else net?.act({ a: a as Json });
    }

    /** 대회가 돌고 있으면 여기 있다 (혼자 하는 대회. 여럿 대회는 다음 걸음). */
    let tour: TourState | null = null;

    function beginMatch(id: string, seats: SeatSpec[], seed: number, want?: number, mine = 0, run = nextEpoch()): void {
      const g = gameById(id);
      /* 조각이 아직이면 **받아서 다시 들어온다** (TASK-KL-242 쪼개기). 부르는 자리가 예닐곱인데
         저마다 기다리게 하면 언젠가 한 곳을 빠뜨린다. 문을 하나로 두고 여기서만 기다린다. */
      if (!g) {
        void ensureGame(id).then(() => {
          if (run === epoch && gameById(id)) beginMatch(id, seats, seed, want, mine, run);
        });
        return;
      }
      gameId = id;
      mySeat = mine;
      offerOpen = null;
      $<HTMLElement>('#acOffer').style.display = 'none';
      watching = false;
      /* 빈 자리를 **이름 있는 사람**으로 채운다 (TASK-KL-264). 커널이 채우면 봇 1이 되는데,
         그건 자리를 채운 것이지 같이 논 것이 아니다. 손버릇도 여기서 정해 판 내내 지킨다. */
      /* 인원은 **판이 아니라 오락실이** 정한다 (`seating.ts`). 최솟값으로 채우면 1명부터인
         판 17개가 혼자 열었을 때 봇 없이 혼자 돈다. 경주에 상대가 없었다(F1 실측). */
      /* 편을 가른 판은 인원을 편이 정한다(넷). 그 밖에는 오락실이 정한다(`seating.ts`). */
      const need = Math.max(0, (want ?? partySize(g)) - seats.length);
      /* 대회 중이면 다섯 판 내내 **같은 사람들**과 논다. 또 깜냥한테 졌다가 되려면 그래야 한다. */
      const crew = tour ? tour.crew.slice(0, need) : pickBots(need);
      /* 판놀이는 저택 사람이 앉는다(MDD). 단계가 사람을 고른다(임시 대응, `cast.ts`) */
      /* 단계(`ai`)가 있는 놀이 전부(오목, 야추). 봇이 여럿이면 남은 사람도 차례로 앉는다(야추는 넷까지). MDD 스위치를 따른다 */
      if (mdd.on() && !tour && crew.length && (cardById(id)?.kind === 'board' || SETUPS[id]?.some((c) => c.key === 'ai'))) {
        const first = castOfLevel(Number(optsFor(id).ai) || 3);
        const rest = Object.values(CAST).filter((c) => c.slug !== first.slug);
        crew[0] = { ...crew[0], name: first.name };
        for (let i = 1; i < crew.length && i - 1 < rest.length; i += 1) crew[i] = { ...crew[i], name: rest[i - 1].name };
      }
      const personas: Record<number, BotPersona> = {};
      crew.forEach((b, i) => {
        personas[seats.length + i] = b;
      });
      const withCrew: SeatSpec[] = [...seats, ...crew.map((b) => ({ name: b.name, bot: true }))];

      /* **어제의 나**를 마지막 자리에 앉힌다 (TASK-KL-264 A3). 고스트는 봇의 한 종류라
         여기 한 줄이면 끝난다. 자리도 점수도 결과 화면도 이미 있는 것을 쓴다.
         혼자 놀 때만. 여럿이 있는 방에 내 지난 판을 끼워 넣으면 자리가 하나 줄어든다. */
      /* 판놀이(오목처럼 둘이 번갈아 두는 것)에는 안 앉힌다. 고스트는 남의 판 수를 시각대로 흉내 낼 뿐이라
         판놀이에서는 엉뚱한 자리를 찌르다 수가 떨어지면 가만히 있고, 판이 안 끝난다(2026-08-30 실측) */
      const past = !net && !tour && cardById(id)?.kind !== 'board' ? bestOf(id) : null;
      /* 끝나면 `noteBest` 가 덮으므로 **시작할 때** 챙겨 둔다. 결과에 어제 N을 적으려면 필요하다. */
      session.lastBest = bestOf(id)?.score ?? null;
      const level = levelNow();
      let def = withBotLevel(g, level, personas);
      if (past && withCrew.length > seats.length) {
        const gseat = withCrew.length - 1;
        withCrew[gseat] = { name: GHOST_NAME, bot: true };
        def = withGhost(def, gseat, past as never) as typeof def;
      }
      noteRecent(id);
      match = new Match(def, seed, withCrew, matchOpts(id)) as Match<unknown, unknown>;
      resetMatchSignals();
      /* 되살릴 재료. 씨앗과 자리. 이 둘과 누른 것이면 판이 다시 만들어진다(`replay.ts`). */
      session.recipe = { seed, seats: withCrew, personas, level, def: def as GameDef<unknown, unknown> };
      mdd.clearBubbles();
      withCrew.forEach((sq, i) => { if (sq.bot && castByName(sq.name)) window.setTimeout(() => { if (match) mdd.sayAs(i, lineOf(castByName(sq.name) as NonNullable<ReturnType<typeof castByName>>, 'hello', withCrew[mine]?.name ?? '')); }, 900); });
      tape = null;
      endReview(false);
      replaying = false;
      shadow = null;
      mountView(id);
      againBtn.style.display = 'none';
      show('play');
      t0 = performance.now();
      cancelAnimationFrame(raf);
      loop();
      /* 판이 서면 무대에 초점을 준다. 키를 누를 곳이 어디인지 화면이 말해 줘야 한다.
         `preventScroll` 없이 부르면 폰에서 화면이 무대로 튄다. */
      keyAt = -1;
      $<HTMLElement>('#acStage').focus({ preventScroll: true });
      Toolbox.trackUse?.(id);
      /* 안 해 본 것 먼저가 성립하려면 해 본 것을 적어야 한다 (`plays.ts`). */
      notePlay(id);
    }

    /**
     * 판 시작 3초 (TASK-KL-264).
     *
     * **51개가 한꺼번에 얻는다**. 껍데기에서 하니 게임 파일은 이걸 모른다. 규칙 한 줄은
     * 로비에 이미 적혀 있는 그 문장을 그대로 쓴다(두 벌 적으면 갈라진다).
     *
     * 왜 3초인가: 처음 여는 놀이는 규칙을 읽을 틈이 있어야 하고, 두 번째부터는 그 3초가
     * 이제 시작한다는 신호가 된다. 커널은 이 시간 동안 아예 안 돈다. 덮개를 씌운 채로
     * 시계를 돌리면 반응 측정 같은 놀이는 시작하자마자 지고 있다.
     */
    /** 세는 중에 나가면 물린다. 안 그러면 로비로 돌아간 뒤에 판이 저 혼자 시작한다(실측). */
    let dropIntro: (() => void) | null = null;

    function withIntro(id: string, go: () => void): void {
      /* **세는 동안 받는다** (TASK-KL-242 쪼개기). 셋, 둘, 하나 3초가 그대로 조각 받는 시간이
         되어, 사람 눈에는 기다림이 하나도 안 는다. 못 받아도 `beginMatch` 가 한 번 더 기다린다. */
      void ensureGame(id);
      const introEl = $<HTMLElement>('#acIntro');
      const numEl = $<HTMLElement>('#acIntroNum');
      $<HTMLElement>('#acIntroIcon').textContent = iconOf(id);
      $<HTMLElement>('#acIntroName').textContent = t('arcade.game.' + id + '.name');
      $<HTMLElement>('#acIntroDesc').textContent = t('arcade.game.' + id + '.desc');
      /* 입체 방으로 들어가는 판이면 인트로도 그 방의 종이 한 장. 보라 숫자와 이모지는 그 방에 없다(사용자 지적) */
      const roomBound = dim() === '3d' && !!cardById(id)?.d3;
      introEl.classList.toggle('ac-intro-room', roomBound);
      /* 방으로 가는 판이면 소리도 방 것(나무, 풍경). 인트로 셋, 둘, 하나부터 */
      setBlipVoice(roomBound ? 'room' : 'default');
      /* 판은 평면이든 입체든 콘텐츠 칸을 다 씀(2026-09-01 사용자 확정). 방 표현만 폈더니
         나머지 마흔여섯 판이 가운데 좁은 상자에 갇혀 있었음 */
      fill(true);
      /* 입체 조각도 셋둘하나 동안 미리 받는다. 안 받으면 판이 서고 나서 기다린다 */
      if (roomBound) void ensureView3d(id);
      introEl.style.display = '';
      /* 지난 판의 결과와 한 판 더를 치운다. 안 치우면 다음 판을 세는 동안 지난 판이
         아직 안 끝난 것처럼 보인다(대회에서 다음 판이 안 넘어가는 것처럼 보였다). */
      againBtn.style.display = 'none';
      swapBtn.style.display = 'none';
      replayBtn.style.display = 'none';
      hideResult();
      say('');
      $<HTMLElement>('#acIntroSkip').textContent = t('arcade.intro.skip');
      let left = 3;
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        stopTick();
        introEl.style.display = 'none';
        introEl.onclick = null;
        go();
      };
      /* 두 번째부터는 규칙을 이미 안다. 누르면 바로 시작한다. */
      introEl.onclick = finish;
      dropIntro = (): void => {
        done = true;
        stopTick();
        introEl.style.display = 'none';
        introEl.onclick = null;
      };
      numEl.textContent = String(left);
      blip('start');
      // 시작 카운트다운도 보이는 동안만. 안 보는 사이에 판이 시작돼 있으면 지고 들어간다.
      const stopTick = intervalWhileVisible(() => {
        left -= 1;
        if (left > 0) {
          numEl.textContent = String(left);
          blip('tap');
          return;
        }
        finish();
      }, 900);
      Toolbox.onDispose?.(stopTick);
    }

    /** 대회. 다섯 판을 이어서. 점수는 판마다 등수로 매긴다(점수의 뜻이 판마다 달라서다). */
    function startTour(): void {
      net?.leave();
      net = null;
      tour = {
        games: pickGames(CARDS.map((g) => ({ id: g.id, kind: kindOf(g.id), seats: g.seats }))),
        at: 0,
        points: new Array(PARTY).fill(0) as number[],
        crew: pickBots(PARTY - 1)
      };
      nextTourGame();
    }

    function nextTourGame(): void {
      if (!tour || isOver(tour)) return;
      const id = tour.games[tour.at];
      const run = nextEpoch();
      show('play');
      withIntro(id, () =>
        beginMatch(id, [{ name: myName(), bot: false }], seedFrom(id + String(Date.now())), undefined, 0, run));
    }

    /* ── 편지로 두기 (TASK-KL-264 D5) ─────────────────────────────
     *
     * 방을 안 연다. 판 전체가 링크 안에 있고, **한 수 두면 새 링크가 나온다.**
     * 그래서 이 자리에는 그물망도 봇도 없다. 사람 둘이 번갈아 둘 뿐이다.
     */
    let letter: Letter | null = null;
    /** 배우기. 몇 장째인가. null 이면 안 배우는 중 */
    let tutorAt: number | null = null;

    /**
     * 배우기 시작. 봇이 안 두는 판을 세우고 첫 장을 깖
     * 씨앗은 아무거나. 장면은 `dispatch` 로 심으므로 난수가 판을 안 바꿈
     */
    function startTutor(id: string, run = nextEpoch()): void {
      const g = gameById(id);
      if (!g) {
        void ensureGame(id).then(() => { if (run === epoch && gameById(id)) startTutor(id, run); });
        return;
      }
      net?.leave();
      net = null;
      plan = null;
      letter = null;
      tour = null;
      watching = false;
      endReview(false);
      tutorAt = 0;
      gameId = id;
      mySeat = 0;
      show('play');
      mountView(id);
      layTutor();
    }

    /** 그 장의 장면을 깐다. 커널을 새로 세우고 돌을 심는다 */
    function layTutor(): void {
      const g = gameById(gameId);
      if (!g || tutorAt === null) return;
      const lesson = LESSONS[tutorAt];
      if (!lesson) {
        /* 다 배웠으면 곧바로 한 판. 로비로 돌려보내면 처음부터 다시 고른다 */
        $<HTMLElement>('#acLesson').hidden = true;
        const id = gameId;
        tutorAt = null;
        cancelAnimationFrame(raf);
        match = null;
        say(t('arcade.tutor.done'), 'ok');
        const run = epoch;
        tutorDoneTimer = window.setTimeout(() => {
          tutorDoneTimer = 0;
          if (run === epoch && tutorAt === null) startSolo(id);
        }, 900);
        return;
      }
      /* 봇이 없는 판. 배우는 동안은 상대가 두지 않는다 */
      const def = { ...g, bot: () => null } as typeof g;
      /* 가르치는 자리. MDD 를 끄면 캐릭터 이름 대신 중립 이름 */
      const seats: SeatSpec[] = [{ name: myName(), bot: false }, { name: t(mdd.on() ? 'arcade.tutor.teacher' : 'arcade.tutor.teacher.plain'), bot: true }];
      cancelAnimationFrame(raf);
      match = new Match(def, 1, seats, { size: TUTOR_SIZE, renju: true, limit: 0, ai: 1 }) as Match<unknown, unknown>;
      resetMatchSignals();
      session.recipe = { seed: 1, seats, personas: {}, level: 'normal', def: def as GameDef<unknown, unknown> };
      mdd.clearBubbles();
      hintAt = null;
      /* 돌 심기. 차례를 번갈아 맞추려고 빈 곳을 채우는 대신 **그 색 차례일 때만** 둔다 */
      const want = lesson.board.slice();
      for (let guard = 0; guard < 200 && want.length; guard += 1) {
        const turn = (match.view().state as { turn?: number }).turn ?? 0;
        const k = want.findIndex((b) => b.who === turn + 1);
        const pick = k >= 0 ? k : 0;
        const b = want.splice(pick, 1)[0];
        match.dispatch(b.who - 1, { cell: cellOf(b.x, b.y) });
      }
      /* 내 차례(흑)가 아니면 한 수 더 심어 맞춘다. 장면 표가 흑 차례로 끝나게 짜 두는 것이 먼저 */
      /* 장면 심기는 사람이 둔 것이 아니다. 알림과 컷인을 안 깨운다 */
      session.seenMoves = match.moves;
      mdd.clearBubbles();
      $<HTMLElement>('#acCutin').hidden = true;
      const box = $<HTMLElement>('#acLesson');
      box.hidden = false;
      $<HTMLElement>('#acLessonNo').textContent = `${tutorAt + 1} / ${LESSONS.length}`;
      $<HTMLElement>('#acLessonSay').textContent = t(lesson.say);
      $<HTMLElement>('#acLessonQuit').textContent = t('arcade.btn.quit');
      t0 = performance.now() - match.clock();
      loop();
      paintHint();
    }

    /** 배우는 중의 한 수. 맞으면 다음 장, 틀리면 물린다 */
    function tutorPlay(cell: number): void {
      if (tutorAt === null || !match) return;
      const lesson = LESSONS[tutorAt];
      if (isAnswer(lesson, cell)) {
        match.dispatch(mySeat, { cell });
        blip('good');
        const e = epoch;
        window.setTimeout(() => {
          if (e !== epoch || tutorAt === null) return;
          tutorAt += 1;
          layTutor();
        }, 1100);
        return;
      }
      $<HTMLElement>('#acLessonSay').textContent = t(lesson.miss);
      blip('bad');
    }

    function paintLetter(): void {
      const box = $<HTMLElement>('#acLetter');
      if (!letter) { box.style.display = 'none'; return; }
      box.style.display = '';
      const mine = turnOf(letter) === mySeat;
      const done = match?.view().finished;
      const packed = fold(letter);
      $<HTMLInputElement>('#acLetterUrl').value = packed ? letterLink('arcade', packed) : '';
      $<HTMLElement>('#acLetterSay').textContent = done
        ? t('arcade.letter.over')
        : !packed
          ? t('arcade.letter.toobig')
          : mine
            ? t('arcade.letter.your')
            : t('arcade.letter.sent');
    }

    /** 링크로 들어왔다. 적힌 수를 다 두고, 다음 차례면 내가 둘 수 있게 연다. */
    function openLetter(post: Letter, run = nextEpoch()): void {
      const g = gameById(post.game);
      if (!g) {
        void ensureGame(post.game).then(() => {
          if (run === epoch && gameById(post.game)) openLetter(post, run);
        });
        return;
      }
      net?.leave();
      net = null;
      tour = null;
      letter = post;
      gameId = post.game;
      /* **내 자리는 다음에 둘 자리다.** 링크를 받은 사람이 지금 둘 사람이므로. */
      mySeat = turnOf(post);
      watching = false;
      replaying = false;
      match = deal(g, post) as Match<unknown, unknown>;
      resetMatchSignals();
      session.lastBest = null;
      shadow = null;
      mountView(post.game);
      show('play');
      t0 = performance.now() - match.clock();
      cancelAnimationFrame(raf);
      loop();
      paintLetter();
    }

    /** 편지 판을 새로 시작한다. 아직 아무도 안 둔 판. */
    function startLetter(id: string): void {
      /* 조각은 아직 없어도 된다. 새 편지 판은 이름과 씨앗만 있으면 접힌다.
         받아 오는 것은 `openLetter` 한 곳에서만 기다린다(문을 둘로 만들지 않는다). */
      if (!cardById(id)) return;
      /* 편지 판은 제한시간을 안 싣는다. 며칠 뒤 여는 판에 수당 30초는 뜻이 없다 */
      openLetter({ game: id, seed: seedFrom(id + String(Date.now())), who: [myName(), t('arcade.letter.friend')], moves: [], opts: { ...optsFor(id), limit: 0 } });
    }

    /**
     * 편 갈라. 넷이 앉아 둘씩 나눈다 (TASK-KL-264 E1).
     *
     * 커널에는 아무 말도 안 한다. 자리는 그대로 각자 점수를 내고 **합치는 것만 여기서** 한다 . 
     * 그래서 게임 파일은 편이 있다는 것을 모르고, 같은 규칙이 우리가 잘하기로 달리 놀린다.
     */
    function startTeam(id: string): void {
      const card = cardById(id);
      if (!card) return;
      net?.leave();
      net = null;
      letter = null;
      const n = Math.min(4, card.seats[1]);
      plan = split(n);
      const run = nextEpoch();
      show('play');
      withIntro(id, () =>
        beginMatch(id, [{ name: myName(), bot: false }], seedFrom(id + String(Date.now())), n, 0, run));
    }

    /** 혼자. 그물망 없이 커널만. 빈 자리는 봇이 앉는다. */
    function startSolo(id: string, swap = false): void {
      net?.leave();
      net = null;
      plan = null;
      show('play');
      /* 색을 바꾸면 봇이 먼저 앉는다(0 번 = 흑). 나는 1 번 */
      const seats: SeatSpec[] = swap
        ? [{ name: pickBots(1)[0]?.name ?? '봇', bot: true }, { name: myName(), bot: false }]
        : [{ name: myName(), bot: false }];
      const run = nextEpoch();
      withIntro(id, () => beginMatch(id, seats, seedFrom(id + String(Date.now())), undefined, swap ? 1 : 0, run));
    }

    /* ── 여럿 ────────────────────────────────────────────────────── */
    function paintWait(code: string, host: boolean): void {
      $<HTMLElement>('#acCode').textContent = code;
      $<HTMLElement>('#acWaitSeats').innerHTML = [
        '<span class="ac-seat ac-me">' + esc(myName()) + '</span>',
        ...peers.map((p) => '<span class="ac-seat">' + esc(p.name) + '</span>')
      ].join('');
      /* 자리가 몇이고 지금 몇이 넘치는지를 **기다리는 동안** 말해 준다. 시작하고 나서
         나는 왜 못 두지를 겪게 하면 그건 관전이 아니라 고장으로 느껴진다. */
      const cap = cardById(gameId)?.seats[1] ?? 0;
      const over = Math.max(0, peers.length + 1 - cap);
      $<HTMLElement>('#acWaitStatus').textContent =
        (host ? t('arcade.wait.host', { n: String(peers.length + 1) }) : t('arcade.wait.guest')) +
        (over > 0 ? ', ' + t('arcade.watch.over', { n: String(over) }) : '');
      /* 등급전 방은 시작 버튼도 링크도 없음. 상대는 서버가 정함, 오면 바로 판 */
      startBtn.style.display = host && !autoStart ? '' : 'none';
      $<HTMLElement>('.ac-share').style.display = host && !autoStart ? '' : 'none';
    }

    /** 목록에 올린 방. 내리는 손과, 지금 알리는 손 */
    let held: Held | null = null;

    /**
     * 로그인 창을 연다. 등급전은 로그인 필수 (사용자 결정 2026-08-31)
     * - 셸의 account 묶음이 늦게 실리므로 없으면 내 정보 화면으로 보냄
     */
    function askSignIn(): void {
      const account = (window as unknown as { KarmoAccount?: { signIn?: () => void } }).KarmoAccount;
      if (account?.signIn) {
        account.signIn();
        return;
      }
      Toolbox.switchPage?.('user');
    }

    /**
     * 지난 판 몇 개. 끝의 링크를 놓쳐도 여기서 다시 엶
     * - 로그인 안 했거나 판이 없으면 아예 안 그림
     * - 시각은 상대 시간으로. 어제 몇 시였나보다 얼마 전인가가 먼저 읽힘
     */
    async function paintPast(id: string): Promise<void> {
      const box = container.querySelector<HTMLElement>('#acPast');
      if (!box) return;
      const past = await myTapes(id, 3);
      if (!past.length || container.querySelector('#acPast') !== box) return;
      box.hidden = false;
      box.innerHTML =
        '<b>' + esc(t('arcade.past.title')) + '</b>' +
        past
          .map(
            (x) =>
              '<button type="button" data-tape="' + esc(x.id) + '">' +
              esc(t('arcade.past.row', { who: x.who.join(', '), ago: agoText(x.at) })) +
              '</button>'
          )
          .join('');
      container.querySelectorAll<HTMLButtonElement>('#acPast button[data-tape]').forEach((b) => {
        b.onclick = (): void => void openTape(String(b.dataset.tape));
      });
    }

    /** 얼마 전인가. 분, 시간, 날 셋이면 충분 */
    function agoText(at: number): string {
      const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
      if (secs < 3600) return t('arcade.past.min', { n: String(Math.max(1, Math.round(secs / 60))) });
      if (secs < 86400) return t('arcade.past.hour', { n: String(Math.round(secs / 3600)) });
      return t('arcade.past.day', { n: String(Math.round(secs / 86400)) });
    }

    /**
     * 내 단위와 점수 한 줄. 상세 화면을 연 뒤 물어서 채움
     * - 못 물어보면 아무 것도 안 그림. 등급전은 있으면 좋은 것이지 없으면 안 되는 것이 아님
     * - 한 판도 안 둔 사람에게는 첫 판 문구. 1500 이라는 숫자만 보여 주면 뜻이 없음
     */
    async function paintGrade(id: string): Promise<void> {
      const box = container.querySelector<HTMLElement>('#acGrade');
      if (!box) return;
      const [rec, count] = await Promise.all([myRating(id), queueCount(id)]);
      /* 그 사이에 사람이 다른 물건을 집었으면 남의 자리에 적지 않음 */
      if (!rec || container.querySelector('#acGrade') !== box) return;
      /* 줄에 선 사람이 있으면 그 수부터. 아무도 없는 문을 누르게 두면 안 됨 */
      const waiting = count ? count.beginner + count.upper : 0;
      const line = waiting > 0 ? ' ' + t('arcade.rank.queued', { n: String(waiting) }) : '';
      /* 로그인 안 했으면 점수 대신 로그인 문. 누르면 그 자리에서 로그인 */
      if (!rec.signedIn) {
        box.innerHTML =
          esc(t('arcade.rank.signin.why')) + ' <button type="button" id="acSignIn">' + esc(t('arcade.rank.signin.go')) + '</button>' +
          (line ? '<b class="ac-queued">' + esc(line.trim()) + '</b>' : '');
        const btn = container.querySelector<HTMLButtonElement>('#acSignIn');
        if (btn) btn.onclick = askSignIn;
        return;
      }
      if (rec.games === 0) {
        box.textContent = t('arcade.rank.first') + line;
        return;
      }
      const g = gradeOf(rec.rating);
      const name = t('arcade.rank.tier.' + g.tier) + (g.level ? ' ' + g.level : '');
      /**
       * 아직 자리를 찾는 중 (2026-09-01, 레퍼런스 대조)
       *
       * - 판이 적으면 점수가 크게 흔들림. 우리 K값이 20판 미만 40, 그 뒤 32
       * - 체스판들도 같은 자리에 임시(provisional)를 붙인다. lichess 는 대개 15에서 20판,
       *   그동안 점수가 큰 걸음으로 움직여 제자리를 빨리 찾게 함
       * - 안 적으면 다섯 판 둔 사람이 그 단위를 제 실력으로 읽음. 그건 거짓말
       */
      const settling = rec.settleGames !== null && rec.games < rec.settleGames;
      box.innerHTML =
        '<b>' + esc(name) + '</b> ' +
        esc(t('arcade.rank.record', { n: String(rec.rating), games: String(rec.games), wins: String(rec.wins) })) +
        (settling
          ? ', ' + esc(t('arcade.rank.settling', { n: String(rec.games), of: String(rec.settleGames) }))
          : g.toNext !== null
            ? ', ' + esc(t('arcade.rank.tonext', { n: String(g.toNext) }))
            : '') +
        (line ? '<b class="ac-queued">' + esc(line.trim()) + '</b>' : '');
    }

    /**
     * 끝난 등급전 판을 서버에 두고 복기 링크를 보여 줌
     * - 양쪽이 각자 보냄. 서버가 한 판에 하나만 적고 같은 id 를 돌려줌
     * - 못 올리면 링크 자리를 아예 안 그림. 링크는 있으면 좋은 것
     */
    async function keepTape(): Promise<void> {
      const m = rankedMatch;
      const box = container.querySelector<HTMLElement>('#acOverTape');
      if (!m || !box) return;
      /* 손님에게는 되살릴 것이 없음. 주인이 올린 뒤 코드로 링크만 물음 */
      const id = tape ? await saveTape(m.code, tape) : await findTape(m.code);
      if (!id || rankedMatch !== m) return;
      box.hidden = false;
      box.innerHTML = '<button type="button" id="acTapeCopy">' + esc(t('arcade.tape.copy')) + '</button>';
      const btn = container.querySelector<HTMLButtonElement>('#acTapeCopy');
      if (btn) btn.onclick = (): void => {
        void Toolbox.copyText?.(tapeLink(id), { message: t('arcade.copy.done') });
      };
    }

    /**
     * 링크에 실린 패보를 편다. 판을 되살려 복기 화면으로
     * - 자리와 옵션까지 서버가 들고 있어 그때 그 판이 그대로 펴짐
     * - 없는 패보면 조용히 로비. 남의 주소를 잘못 눌렀을 뿐
     */
    async function openTape(id: string): Promise<void> {
      const raw = (await loadTape(id)) as Tape<unknown> | null;
      if (!raw || !raw.game) return;
      /* 규칙 파일을 먼저 받아야 함. 안 받으면  가 아직 없음을 돌려줌(실측: 빈 화면) */
      await ensureGame(raw.game);
      if (!gameById(raw.game)) return;
      gameId = raw.game;
      mountView(raw.game);
      session.recipe = { seed: raw.seed, seats: raw.seats, personas: {}, level: 'normal', def: null };
      tape = raw;
      mySeat = -1;
      watching = true;
      show('play');
      startReview();
    }

    /* 등급전 한 수 제한과 임시 경계는 **서버 규칙이 내려 줌** (감사 B6). 전에는 60 과 20 을 여기 적어
       서버 K 경계와 어긋날 자리였음. 짝이 나면 그 답의 값(`moveLimitSec`), 점수를 물으면 그 답의 값(`settleGames`).
       초과하면 커널이 상대 승으로 끝냄(`gomoku.ts` 의 `tick`). 친선전과 혼자 판은 사람이 고름 */
    let rankedLimit: number | null = null;

    /** 이 판에 쓸 옵션. 등급전이면 시간 제한을 덮어씀 */
    function matchOpts(id: string): ReturnType<typeof optsFor> {
      const base = optsFor(id);
      return (rankedMatch || autoStart) && rankedLimit ? { ...base, limit: rankedLimit } : base;
    }

    /** 지금 도는 등급전 판. 없으면 친선전이거나 혼자 판 */
    let rankedMatch: RankedMatch | null = null;
    let rankedRoster: RankedRoster | null = null;

    /**
     * 짝이 났는데 못 붙는 경우 (2026-09-01, 레퍼런스 대조)
     *
     * 판은 브라우저끼리(nostr 중계로 짝짓고 WebRTC 로) 돈다. 그런데 **누구나 붙는 것이 아니다**:
     * 제작사들 실측으로 10에서 30%가 직접 연결에 실패해 릴레이(TURN)로 넘어간다. 대칭 NAT 뒤가
     * 11%, ICE 실패의 85%가 NAT 와 방화벽 탓. 우리는 TURN 이 없으니 그만큼은 못 붙음.
     * 서버가 짝을 지어 줬는데 못 붙으면 사람은 빈 판 앞에서 영영 기다림. 그 자리에 말을 줌
     */
    const LINK_WAIT_MS = 25000;
    let linkTimer = 0;

    function stopLinkWatch(): void {
      window.clearTimeout(linkTimer);
      linkTimer = 0;
    }

    /** 짝이 난 뒤부터 센다. 상대가 방에 들어오면 멈춘다 */
    function watchLink(): void {
      stopLinkWatch();
      linkTimer = window.setTimeout(() => {
        linkTimer = 0;
        if (!rankedMatch || match || peers.length) return;
        const word = t('arcade.rank.nolink');
        /* 아직 판이 안 떴으면 대기 화면에 적는다. 판 위의 띠는 그때 안 보인다 */
        const waiting = $<HTMLElement>('#acWait').style.display !== 'none';
        if (waiting) {
          $<HTMLElement>('#acWaitStatus').textContent = word;
        } else {
          const bar = container.querySelector<HTMLElement>('#acGoneBar');
          if (bar) {
            bar.textContent = word;
            bar.hidden = false;
          }
        }
        say(word, 'warn');
      }, LINK_WAIT_MS);
    }

    /**
     * 등급전 결과를 서버에 보고
     * - 점수 높은 자리 순서로 적고 동점자는 한 자리에 묶음
     * - 양쪽이 각자 보냄. 한쪽 말만으로는 점수가 안 움직임
     * - 못 보내도 판은 이미 끝났음. 조용히 넘어감
     */
    async function tellRanked(v: MatchView<unknown>, draw: boolean): Promise<void> {
      const m = rankedMatch;
      const outcome = rankedRoster?.outcomeFor(v.seats.map((seat) => seat.score));
      if (!m || mySeat < 0 || !outcome) return;
      /* 먼저 보고한 쪽은 그 자리에서 답을 못 받음. 상대가 아직 안 보냈기 때문
         - 같은 보고를 다시 던져 확인. 서버는 같은 판을 두 번 안 적고 결과만 돌려줌
         - 세 번(약 12초)까지. 그 안에 상대가 안 보내면 점수는 그대로 대기 */
      for (let tries = 0; tries < 4; tries++) {
        if (tries > 0) await new Promise((r) => setTimeout(r, 4000));
        if (rankedMatch !== m) return;
        const said = await reportResult(m, outcome);
        if (!said) return;
        if (said.disagreed) {
          say(t('arcade.rank.disagreed'), 'warn');
          return;
        }
        /* 서버가 패보로 다시 세어 보고 어긋난 판. 점수가 안 움직였다는 것을 사람이 알아야 함 */
        if (said.forged) {
          say(t('arcade.rank.forged'), 'warn');
          return;
        }
        if (said.applied) {
          const d = said.delta ?? 0;
          /* 왜 이 점수인가를 같이 적는다. 폭이 깎였는데 말이 없으면 셈이 틀린 것으로 읽힘 */
          const why =
            (said.damped ? ' ' + t('arcade.rank.damped') : '') +
            (said.verified ? ' ' + t('arcade.rank.verified') : '');
          say(
            t('arcade.rank.applied', { d: (d > 0 ? '+' : '') + String(d), n: String(said.rating ?? 0) }) + why,
            d >= 0 ? 'ok' : 'warn'
          );
          return;
        }
        if (tries === 0) say(t('arcade.rank.waiting.other'));
      }
      /* 여기까지 왔으면 상대 보고가 끝내 안 옴. 조용히 두면 점수가 붙은 줄 앎 */
      if (rankedMatch === m) say(t('arcade.rank.nopoint'), 'warn');
    }

    /** 등급전 줄. 서 있는 동안만 */

    let ranked: Ranked | null = null;
    /** 등급전 방은 상대 도착 순간 시작. 시작 버튼을 누를 사람이 없음 */
    let autoStart = false;

    function maybeAutoStart(): void {
      if (!autoStart || match || !rankedRoster || peers.length < rankedRoster.seats - 1 || !rankedRoster.ready) return;
      autoStart = false;
      startTogether();
    }

    function openRoom(id: string, publicly = false, fixed?: string): void {
      /* 이미 방을 들고 있으면 새로 파지 않는다. 그게 방 유지의 전부다. */
      if (net?.host) {
        startTogether(id);
        return;
      }
      const code = fixed ?? makeCode();
      /* 같이 찾기로 연 방만 목록에 올린다. 같이는 그대로 링크 아는 사람만이다. */
      held?.stop();
      /* 값이 아니라 **부를 것**을 준다. 사람이 들어오고 판이 시작된 것이 그대로 올라가게 */
      held = publicly
        ? holdRoom(() => ({
            code,
            game: id,
            host: myName(),
            /* 나까지 세어야 사람 수다. peers 는 나 말고 */
            seats: peers.length + 1,
            playing: !!match
          }))
        : null;
      gameId = id;
      peers = [];
      show('wait');
      $<HTMLInputElement>('#acUrl').value = inviteLink('arcade', code);
      paintWait(code, true);
      /* P2P 조각은 여기서 처음 받는다. 받는 사이 나갔으면(세대가 바뀜) 방을 안 연다 */
      const e = epoch;
      void ensureNet().then((connect) => {
      if (e !== epoch || net) return;
      net = connect(code, true, myName(), {
        onPeers: (list) => {
          const was = peers.length;
          peers = list;
          paintWait(code, true);
          paintRoom();
          if (was > 0 && !list.length) rivalGone();
          if (list.length) stopLinkWatch();
          /* 사람이 드나든 그 순간에 알린다. 주기를 기다리면 초대 카드가 한동안 거짓말을 함 */
          if (was !== list.length) held?.poke();
          /* 등급전: 서버가 붙여 준 상대 도착 시 즉시 시작. 둘째 사람 대기 없음 */
          maybeAutoStart();
        },
        onAct: (peerId, data) => {
          const meta = (data as { meta?: string }).meta;
          if (rankedRoster?.acceptPeerMeta(peerId, meta)) { maybeAutoStart(); return; }
          const seat = seatOf[peerId];
          if (seat === undefined) return;
          if (meta) {
            onMeta(seat, meta);
            return;
          }
          match?.dispatch(seat, (data as { a?: unknown }).a);
        },
        onSync: () => {
          /* 주인은 남의 판을 안 받는다 */
        },
        onSay: () => {
          /* 주인은 제 소식을 안 받는다 */
        }
      });
      }, () => say(t('arcade.room.nonet'), 'warn'));
    }

    /* ── 등급전 ────────────────────────────────────────────────────
     *
     * - 줄서기 -> 서버(욘봇)가 같은 점수 방의 둘을 붙여 방 코드 하나
     * - 먼저 선 쪽이 주인. 그 코드로 방을 열고 상대 도착 시 시작 버튼 없이 바로 판
     * - 서버가 죽으면 여기만 멈춤. 같이, 같이 찾기는 그대로 */
    const roomLabel = (room: RankRoom): string => t('arcade.rank.room.' + room);

    /**
     * 등급전 상대가 창을 닫음
     * - 사실만 알림. 이겼다 졌다는 안 정함. 한쪽 말로 점수를 안 매기는 규칙과 같은 자리
     * - 점수는 양쪽 보고가 맞아야 움직임. 상대가 안 돌아오면 그 판은 점수 없이 끝
     * - 방치(자기 차례에 안 두는 것) 처리는 아직 사용자 결정 대기. 여기서 안 정함
     */
    function rivalGone(): void {
      if (!rankedMatch) return;
      const bar = container.querySelector<HTMLElement>('#acGoneBar');
      if (!bar) return;
      bar.textContent = t('arcade.rank.gone');
      bar.hidden = false;
    }

    /** 알림 띠 접기. 새 판을 열 때 */
    function hideGoneBar(): void {
      const bar = container.querySelector<HTMLElement>('#acGoneBar');
      if (bar) bar.hidden = true;
    }

    /** 줄에 선 때. 기다린 시간을 세는 자리 */
    let rankedSince = 0;
    let rankedTick: (() => void) | null = null;
    /** 지금 줄에 선 방과 그 방의 나 말고 몇. 시계가 이 값을 다시 그림 */
    let rankedRoom: RankRoom = 'beginner';
    let rankedOthers = 0;

    /** 기다리는 동안 한 줄. 방, 같은 방 인원, 기다린 시간 */
    function paintRankWait(): void {
      const secs = Math.max(0, Math.round((Date.now() - rankedSince) / 1000));
      $<HTMLElement>('#acCode').textContent = roomLabel(rankedRoom);
      $<HTMLElement>('#acWaitStatus').textContent =
        t('arcade.rank.waiting', { n: String(rankedOthers) }) +
        ', ' + t('arcade.rank.waited', { t: clockText(secs * 1000) }) +
        (rankedLimit ? ', ' + t('arcade.rank.limit', { n: String(rankedLimit) }) : '');
    }

    function startRanked(id: string): void {
      if (net) quit();
      hideGoneBar();
      gameId = id;
      peers = [];
      show('wait');
      rankedSince = Date.now();
      rankedRoom = 'beginner';
      rankedOthers = 0;
      $<HTMLElement>('#acWaitSeats').innerHTML = '<span class="ac-seat ac-me">' + esc(myName()) + '</span>';
      paintRankWait();
      /* 나가기가 로비로 가는 문이 아니라 줄에서 빠지는 문임을 글자로 */
      $<HTMLElement>('#acWaitQuit').textContent = t('arcade.rank.leave');
      rankedTick?.();
      rankedTick = intervalWhileVisible(paintRankWait, 1000);
      startBtn.style.display = 'none';
      $<HTMLElement>('.ac-share').style.display = 'none';
      ranked?.cancel();
      ranked = enterQueue(id, myName(), {
        onWaiting: (room, others, limitSec) => {
          rankedLimit = limitSec;
          rankedRoom = room;
          rankedOthers = others;
          paintRankWait();
        },
        onMatched: (m) => {
          ranked = null;
          rankedTick?.();
          rankedTick = null;
          rankedMatch = { code: m.code, you: m.you, ids: m.ids, seat: m.seat };
          rankedLimit = m.moveLimitSec;
          rankedRoster = new RankedRoster(rankedMatch, m.host);
          watchLink();
          if (m.host) {
            /* 등급전 방은 링크 안 나눔. 셋째가 들어오면 판이 아니라 구경 */
            autoStart = true;
            openRoom(id, false, m.code);
          } else {
            /* 손님 화면 올리기는 지금 놀이와 다를 때만 열림. 미리 채운 이름 비우기
               (실측: 안 비우면 손님 창에 판이 영영 안 뜸) */
            gameId = '';
            joinRoomAs(m.code);
          }
          $<HTMLElement>('#acWaitStatus').textContent = t('arcade.rank.matched', { name: m.opponent });
        },
        onDown: () => {
          ranked = null;
          say(t('arcade.rank.down'), 'warn');
          quit();
        },
        onNeedSignIn: () => {
          ranked = null;
          quit();
          say(t('arcade.rank.signin.why'), 'warn');
          askSignIn();
        }
      });
    }

    function joinRoomAs(code: string): void {
      peers = [];
      show('wait');
      paintWait(code, false);
      const e = epoch;
      void ensureNet().then((connect) => {
      if (e !== epoch || net) return;
      net = connect(code, false, myName(), {
        onPeers: (list) => {
          const was = peers.length;
          peers = list;
          paintWait(code, false);
          if (list.length) stopLinkWatch();
          /* act 는 연결 전 메시지를 보관하지 않는다. 처음 joinRoomAs 에서 보낸 등급전 자리표가
             유실될 수 있으므로 peer 발견 뒤 다시 보내 주인이 명단을 확정하게 한다. */
          if (rankedRoster && list.length) net?.act({ meta: rankedRoster.joinMeta() });
          if (was > 0 && !list.length) rivalGone();
        },
        onAct: () => {
          /* 손님은 남의 손을 안 받는다 */
        },
        onSay: (data) => {
          /* 판 밖의 소식. 지금은 하나뿐. 주인이 다음 판을 고르는 중이다.
             `sync` 로는 못 알린다: 그 순간 보낼 판이 아예 없다. */
          const kind = (data as { kind?: string })?.kind;
          if (kind === 'offer') {
            const d = data as { what?: string; from?: string };
            showOffer(d.what === 'again' ? 'again' : 'draw', d.from ?? '');
            return;
          }
          if (kind === 'declined') {
            say(t('arcade.offer.declined'), 'warn');
            return;
          }
          if (kind === 'emote') {
            const d = data as { seat?: number; text?: string };
            if (typeof d.seat === 'number' && d.seat !== mySeat) mdd.sayAs(d.seat, String(d.text ?? ''));
            return;
          }
          if (kind === 'result') {
            const d = data as { moves?: number; ms?: number };
            session.resultMeta = { moves: d.moves ?? 0, ms: d.ms ?? 0 };
            return;
          }
          if (kind !== 'picking') return;
          $<HTMLElement>('#acOverHead').textContent = '⏳ ' + t('arcade.room.picking');
          $<HTMLElement>('#acOverList').innerHTML = '';
          $<HTMLElement>('#acOverNote').textContent = '';
          $<HTMLElement>('#acOver').style.display = '';
        },
        onSync: (data) => {
          const p = data as unknown as { game: string; now: number; seatOf: Record<string, number>; rankRoster?: string[]; v: MatchView<unknown> };
          if (!p?.v) return;
          if (gameId !== p.game) {
            gameId = p.game;
            mountView(p.game);
            show('play');
            cancelAnimationFrame(raf);
            match = null;
            loop();
          }
          seatOf = p.seatOf || {};
          rankedRoster?.applySync(p.rankRoster);
          /* **자리가 없으면 -1.** 0 으로 두면 구경꾼이 제가 1번 자리인 줄 알고 수를 두려 든다
             (주인이 흘리므로 판은 안 깨지지만, 화면은 내 차례라고 말한다). */
          mySeat = seatOf[net?.selfId ?? ''] ?? -1;
          watching = mySeat < 0;
          shadow = { v: p.v, now: p.now, at: performance.now() };
        }
      });
      if (rankedRoster) net.act({ meta: rankedRoster.joinMeta() });
      }, () => say(t('arcade.room.nonet'), 'warn'));
    }

    /** 주인이 판을 연다. 자리를 정하는 것은 주인 하나뿐이다. */
    /**
     * 방에 있는 사람들과 시작한다. **판이 끝나도 방은 안 닫는다** (TASK-KL-264 D3).
     *
     * 전에는 한 판 더가 **같은 게임**만 다시 열었다. 다른 것을 하려면 방을 닫고, 링크를
     * 다시 보내고, 다시 모여야 했다. 모으는 비용이 노는 비용보다 커서 실제로는 한 판 하고 끝났다.
     * 그래서 주인은 로비로 **방을 든 채** 돌아가 아무 게임이나 고를 수 있다. 손님 쪽은 이미
     * 받은 판의 게임이 바뀌면 갈아 끼운다로 되어 있어서 따라오는 데 새 코드가 필요 없었다.
     */
    function startTogether(id?: string, swap = false): void {
      if (id) gameId = id;
      const card = cardById(gameId);
      if (!card) return;
      /* 자리를 정하는 것은 주인 하나다. 0 번은 주인, 그다음은 들어온 차례대로.
         색을 바꾸면 손님들이 앞에, 주인이 맨 뒤(둘이면 손님이 흑) */
      const take = (rankedRoster ? rankedRoster.orderPeers(peers) : peers).slice(0, card.seats[1] - 1);
      seatOf = {};
      take.forEach((p, i) => {
        seatOf[p.id] = swap ? i : i + 1;
      });
      const me: SeatSpec = { name: myName(), bot: false };
      const others = take.map((p) => ({ name: p.name, bot: false }));
      const seats: SeatSpec[] = swap ? [...others, me] : [me, ...others];
      show('play');
      withIntro(gameId, () => {
        /* 등급전 명단이 있으면 그 수가 정본. 일반 파티 기본값(셋)으로 봇을 더 앉히면
           서버 명단과 판의 인원이 달라져 결과 합의가 불가능해짐 */
        beginMatch(gameId, seats, seedFrom(gameId + String(Date.now())), rankedRoster?.seats, swap ? others.length : 0);
        /* 판이 시작된 것을 그 자리에서 알린다. 들어오는 사람이 구경이라는 것을 미리 알게 */
        held?.poke();
      });
    }

    /* 단추는 마우스 사건을 넘긴다. 그게 게임 이름 자리에 들어가면 안 된다. */
    startBtn.onclick = (): void => startTogether();

    /* 링크로 들어온 사람은 곧장 손님이 된다.
     *
     * **주소의 `#` 뒤는 셸의 것이다.** 셸이 어느 화면을 열었는지를 거기 적기 때문에, 방 이름을
     * `#r=...` 로 달면 화면이 열리는 순간 `#arcade` 로 덮여 사라진다(실측: `#r=CRL99` → `#home`
     * → `#arcade`). 그래서 방 이름은 **물음표 뒤**에 단다. 그쪽은 셸이 안 건드린다. */
    const joined = location.search.match(/[?&]r=([A-Za-z0-9]{4,12})/);
    if (joined) joinRoomAs(joined[1]);

    /* 패보가 실려 있으면 복기로 연다. 방(`?r=`), 편지(`?m=`)와 다른 자리(`?g=`) */
    const taped = tapeFromUrl();
    if (taped) void openTape(taped);

    /* 편지가 실려 있으면 그 판을 편다. 방과 다른 자리(`?m=`)를 쓴다 (TASK-KL-264 D5). */
    const posted = letterFromUrl();
    if (posted) openLetter(posted);

    /* 판 장(`/t/arcade/<game>/`)으로 들어왔으면 그 판의 상세를 연다 (감사 E1). 주소 `?play=<id>` 도 같음.
       방, 패보, 편지가 먼저면 그쪽이 이김 */
    const entryGame = (window as unknown as { KARMOLAB_ARCADE_GAME?: string }).KARMOLAB_ARCADE_GAME
      || location.search.match(/[?&]play=([a-z0-9-]+)/)?.[1] || '';
    if (entryGame && !joined && !taped && !posted && cardById(entryGame)) openDetail(entryGame);

    $<HTMLButtonElement>('#acLetterCopy').onclick = (): void => {
      void Toolbox.copyText?.($<HTMLInputElement>('#acLetterUrl').value, { message: t('arcade.copy.done') });
    };

    $<HTMLButtonElement>('#acCopy').onclick = (): void => {
      void Toolbox.copyText?.($<HTMLInputElement>('#acUrl').value, { message: t('arcade.copy.done') });
    };

    /**
     * 로비 머리의 방 유지 중 띠. 방을 든 채 로비에 서 있다는 것을 **화면이 말해야 한다** . 
     * 안 그러면 게임을 고르는 순간 방이 닫혔는지 이어지는지 아무도 모른다.
     */
    function paintRoom(): void {
      const box = $<HTMLElement>('#acRoom');
      if (!net?.host) {
        box.style.display = 'none';
        return;
      }
      box.style.display = '';
      box.innerHTML =
        '<b>🔗 ' + esc(t('arcade.room.kept', { n: String(peers.length + 1) })) + '</b>' +
        '<span style="flex:1"></span>' +
        '<button class="btn btn-ghost" id="acRoomClose">' + esc(t('arcade.room.close')) + '</button>';
      const close = container.querySelector<HTMLButtonElement>('#acRoomClose');
      if (close) {
        close.onclick = (): void => {
          net?.leave();
          net = null;
          peers = [];
          paintRoom();
        };
      }
    }

    /**
     * 다시 보기. 방금 그 판을 처음부터 다시 굴린다 (TASK-KL-264).
     *
     * 판을 저장해 두고 되감는 것이 **아니다.** 씨앗과 누가 언제 무엇을 눌렀나로 커널을
     * 다시 굴린다. 그래서 51개가 한꺼번에 얻는다. 게임 파일은 이걸 모른다.
     */
    replayBtn.onclick = (): void => startReview();

    /**
     * 복기 시작. 판을 씨앗으로 처음부터 굴리며 **수가 먹힐 때마다 장면**을 잡음
     * 장면 0 은 빈 판. 한 판이 서른 수면 서른한 장. 상태는 규칙이 매번 새 객체를 내므로 그대로, 자리 점수만 복사
     */
    function startReview(): void {
      const g = gameById(gameId);
      if (!g || !tape) return;
      /* 판을 만든 정의(고스트 등)로 굴린다. 맨 정의로 굴리면 딴 판이 된다 (2026-08-30 사고) */
      const { frames, order } = scenes(session.recipe.def ?? withBotLevel(g, session.recipe.level, session.recipe.personas), tape);
      cancelAnimationFrame(raf);
      match = null;
      replaying = true;
      review = { frames, order, at: frames.length - 1, playing: false, speed: 1, timer: null, branch: false };
      session.ended = false;
      hideResult();
      againBtn.style.display = 'none';
      swapBtn.style.display = 'none';
      replayBtn.style.display = 'none';
      $<HTMLElement>('#acTimeline').hidden = false;
      /* 화면을 새로 세운다. 끝 장면에서 다가선 카메라가 남아 있으면 복기 판 위가 잘린다(실측) */
      mountView(gameId);
      say(t('arcade.replay.now'), 'ok');
      seek(0);
    }

    /** 그 수의 장면으로. 자리 카드의 시계도 그때 값 */
    function seek(k: number): void {
      if (!review || review.branch) return;
      const n = review.frames.length - 1;
      const next = Math.max(0, Math.min(n, k));
      if (next !== review.at) hintAt = null;
      review.at = next;
      const f = review.frames[review.at];
      const v: MatchView<unknown> = { ...f.v, review: { order: review.order, at: review.at, total: n }, hint: hintAt?.action };
      paint(v, f.at);
    }

    function paintTimeline(): void {
      const tlEl = $<HTMLElement>('#acTimeline');
      if (!review) {
        tlEl.hidden = true;
        return;
      }
      tlEl.hidden = false;
      tlEl.classList.toggle('ac-branch', review.branch);
      const n = review.frames.length - 1;
      const bar = $<HTMLInputElement>('#acTlBar');
      if (bar.max !== String(n)) bar.max = String(n);
      if (bar.value !== String(review.at)) bar.value = String(review.at);
      $<HTMLElement>('#acTlNum').textContent = `${review.at} / ${n}`;
      $<HTMLElement>('#acTlPlay').classList.toggle('ac-on', review.playing);
      $<HTMLElement>('#acTlSpeed').textContent = `${review.speed}x`;
      $<HTMLElement>('#acTlBack').hidden = !review.branch;
      const br = $<HTMLElement>('#acTlBranch');
      br.hidden = !review.branch;
      if (review.branch) br.textContent = t('arcade.tl.branch', { n: String(review.at) });
    }

    function tlPlay(on: boolean): void {
      if (!review) return;
      review.timer?.();
      review.timer = null;
      review.playing = on;
      if (on) {
        if (review.at >= review.frames.length - 1) review.at = 0;
        review.timer = intervalWhileVisible(() => {
          if (!review || review.branch) return;
          if (review.at >= review.frames.length - 1) {
            tlPlay(false);
            return;
          }
          seek(review.at + 1);
        }, 900 / review.speed);
      }
      paintTimeline();
    }

    /**
     * Try Play. 복기 중 판을 누르면 **그 수까지 굴린 살아 있는 판**에서 이어 두기
     * 봇이 상대면 봇이 답한다. 되돌아가기는 복기 장면으로
     */
    function branchFrom(k: number): boolean {
      const g = gameById(gameId);
      if (!g || !tape || !review) return false;
      const m = matchAt(session.recipe.def ?? withBotLevel(g, session.recipe.level, session.recipe.personas), tape, k) as Match<unknown, unknown>;
      if (m.view().finished) return false;
      /* 내 차례인 수에서만. 봇 차례에서 갈라지면 봇이 먼저 두어 무엇이 내 수인지 헷갈린다(실측) */
      if (g.canAct && !g.canAct(m.view().state as never, mySeat)) return false;
      tlPlay(false);
      review.branch = true;
      replaying = false;
      match = m;
      resetMatchSignals();
      t0 = performance.now() - m.clock();
      cancelAnimationFrame(raf);
      loop();
      paintTimeline();
      return true;
    }

    /** 곁가지에서 복기 장면으로 */
    function backToReview(): void {
      if (!review) return;
      cancelAnimationFrame(raf);
      match = null;
      replaying = true;
      review.branch = false;
      hideResult();
      seek(review.at);
    }

    /** 복기를 접는다. 결과 종이로 돌아간다 */
    function endReview(showOver = true): void {
      if (!review) return;
      tlPlay(false);
      const last = review.frames[review.frames.length - 1];
      session.resultMeta = { moves: review.frames.length - 1, ms: last.at };
      review = null;
      replaying = false;
      cancelAnimationFrame(raf);
      match = null;
      $<HTMLElement>('#acTimeline').hidden = true;
      if (showOver) {
        session.ended = false;
        paint(last.v, last.at);
      }
    }

    /* 반응. 메뉴의 한 줄이 판을 열고, 여섯 중 하나를 누르면 내 카드에 말풍선. 온라인이면 상대에게도 */
    for (const [sel, key] of [['#acCoords', 'karmolab.arcade.coords'], ['#acNums', 'karmolab.arcade.numbers']] as const) {
      $<HTMLButtonElement>(sel).onclick = () => {
        let v = false;
        try {
          v = localStorage.getItem(key) === 'on';
          localStorage.setItem(key, v ? 'off' : 'on');
        } catch {
          /* 못 적어도 이 판에서는 바뀐다 */
        }
        if (gameId) paintScene(gameId);
      };
    }
    /* 손놀림. 누르기와 끌기를 사람이 고름. 셋을 돌림(자동, 누르기, 끌기) */
    function paintHand(): void {
      const b = container.querySelector<HTMLButtonElement>('#acHand');
      if (!b) return;
      const m = handMode();
      const now = handNow();
      b.textContent = t('arcade.hand.' + m) + (m === 'auto' ? ' (' + t('arcade.hand.' + now) + ')' : '');
      b.title = t('arcade.btn.hand');
    }
    $<HTMLButtonElement>('#acHand').onclick = () => {
      nextHandMode();
      paintHand();
      blip('tap');
    };
    paintHand();

    $<HTMLButtonElement>('#acMdd').onclick = () => {
      try {
        localStorage.setItem('karmolab.arcade.mdd', mdd.on() ? 'off' : 'on');
      } catch {
        /* 못 적어도 이 판에서는 바뀐다 */
      }
      mdd.paint();
      if (gameId) paintScene(gameId);
      say(t(mdd.on() ? 'arcade.mdd.on' : 'arcade.mdd.off'), 'ok');
    };
    const emotesEl = $<HTMLElement>('#acEmotes');
    $<HTMLButtonElement>('#acEmote').onclick = () => { emotesEl.hidden = !emotesEl.hidden; };
    emotesEl.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-emote]');
      if (!b) return;
      const text = EMOTES[Number(b.dataset.emote)] ?? '';
      emotesEl.hidden = true;
      mdd.sayAs(mySeat, text);
      if (!net) return;
      if (net.host) net.say({ kind: 'emote', seat: mySeat, text });
      else net.act({ meta: 'emote:' + text });
    });
    $<HTMLButtonElement>('#acLessonQuit').onclick = () => {
      tutorAt = null;
      $<HTMLElement>('#acLesson').hidden = true;
      quit();
    };
    $<HTMLButtonElement>('#acHint').onclick = askHint;
    $<HTMLButtonElement>('#acTlFirst').onclick = () => { tlPlay(false); seek(0); };
    $<HTMLButtonElement>('#acTlPrev').onclick = () => { tlPlay(false); if (review) seek(review.at - 1); };
    $<HTMLButtonElement>('#acTlNext').onclick = () => { tlPlay(false); if (review) seek(review.at + 1); };
    $<HTMLButtonElement>('#acTlLast').onclick = () => { tlPlay(false); if (review) seek(review.frames.length - 1); };
    $<HTMLButtonElement>('#acTlPlay').onclick = () => tlPlay(!review?.playing);
    $<HTMLButtonElement>('#acTlSpeed').onclick = () => {
      if (!review) return;
      review.speed = review.speed === 1 ? 2 : review.speed === 2 ? 0.5 : 1;
      if (review.playing) tlPlay(true);
      else paintTimeline();
    };
    $<HTMLInputElement>('#acTlBar').oninput = (ev) => { tlPlay(false); seek(Number((ev.target as HTMLInputElement).value)); };
    $<HTMLButtonElement>('#acTlBack').onclick = backToReview;
    $<HTMLButtonElement>('#acTlExit').onclick = () => endReview(true);
    /* 휠과 화살표. 오목 가자는 휠, lichess 는 화살표 */
    play.addEventListener('wheel', (ev) => {
      if (!review || review.branch) return;
      ev.preventDefault();
      tlPlay(false);
      seek(review.at + (ev.deltaY > 0 ? 1 : -1));
    }, { passive: false });
    const onReviewKeydown = (ev: KeyboardEvent): void => {
      if (!review || review.branch) return;
      const tag = (ev.target as HTMLElement).tagName;
      if (tag === 'INPUT' && (ev.target as HTMLInputElement).type !== 'range') return;
      if (ev.key === 'ArrowLeft') { tlPlay(false); seek(review.at - 1); }
      else if (ev.key === 'ArrowRight') { tlPlay(false); seek(review.at + 1); }
      else if (ev.key === 'Home') { tlPlay(false); seek(0); }
      else if (ev.key === 'End') { tlPlay(false); seek(review.frames.length - 1); }
      else if (ev.key === ' ') { tlPlay(!review.playing); }
      else return;
      ev.preventDefault();
    };
    document.addEventListener('keydown', onReviewKeydown, dying);

    /** 다른 게임. 방을 든 채 로비로. 손님에게는 고르는 중이라고 알린다. */
    swapBtn.onclick = (): void => {
      if (!net?.host) return;
      net.say({ kind: 'picking' });
      dropPlay();
      replayBtn.style.display = 'none';
      hideResult();
      paintRoom();
      paintPicks();
      show('lobby');
    };

    /**
     * 판 내려놓기. 나가기와 다른 게임이 같이 씀
     *
     * 전에는 나가기가 `match` 만 비우고 복기 타이머, 배우기 장, 편지, 팀 편성, 컷인, 말풍선은
     * 그대로. 복기 중에 나가면 그 타이머가 로비에서도 돌며 자리 카드를 덮어씀, 팀전 뒤 개인전에
     * 편 색이 샐 자리 (2026-09-02 감사). 세대(`epoch`)를 올려 늦게 오는 타이머도 손 뗌
     */
    function dropPlay(): void {
      nextEpoch();
      endReview(false);
      cancelAnimationFrame(raf);
      match = null;
      shadow = null;
      render = null;
      replaying = false;
      tape = null;
      tutorAt = null;
      $<HTMLElement>('#acLesson').hidden = true;
      plan = null;
      tour = null;
      letter = null;
      $<HTMLElement>('#acLetter').style.display = 'none';
      watching = false;
      hintAt = null;
      offerOpen = null;
      $<HTMLElement>('#acOffer').style.display = 'none';
      session.resultMeta = null;
      session.ended = false;
      session.soundedRound = -1;
      gameId = '';
      mySeat = 0;
      $<HTMLElement>('#acTimeline').hidden = true;
      mdd.clearBubbles();
      mdd.stop();
      againBtn.style.display = 'none';
      swapBtn.style.display = 'none';
    }

    const quit = (): void => {
      dropIntro?.();
      dropIntro = null;
      /* 줄에 서 있었으면 제외. 안 빠지면 15초간 유령과 짝 */
      ranked?.cancel();
      ranked = null;
      rankedMatch = null;
      rankedRoster = null;
      rankedLimit = null;
      autoStart = false;
      rankedTick?.();
      rankedTick = null;
      stopLinkWatch();
      hideGoneBar();
      $<HTMLElement>('#acWaitQuit').textContent = t('arcade.btn.quit');
      /* 방을 닫으면 목록에서도 내린다. 안 내리면 10분 동안 눌렀는데 아무도 없네가 된다. */
      held?.stop();
      held = null;
      net?.leave();
      net = null;
      dropPlay();
      hideResult();
      paintRoom();
      /* 방금 논 것이 **로비 전체**에 바로 반영돼야 한다. 추천 여섯의 차례뿐 아니라
         카드의 🏅 최고 N도 그렇다. 추천만 다시 그렸더니 기록을 세우고 나와도 뱃지가
         안 붙어 있었다(실측). 로비를 반만 갱신하면 반은 옛 화면이다. */
      paintPicks();
      paintGames();
      show('lobby');
    };
    $<HTMLButtonElement>('#acQuit').onclick = quit;

    /* 무대 크기, 메뉴, 전체화면, 소리 버튼 (`chrome.ts`) */
    const chrome = mountChrome({ container, play, dying });

    /* 표현 갈아 끼우기. 판은 커널이 들고 있으므로 그리는 법만 바꿔 다시 붙이면 그대로 이어진다. */
    $<HTMLButtonElement>('#acUndo').onclick = undo;
    /* 우클릭도 무르기(레퍼런스와 같은 손). 무를 수 없는 판이면 브라우저 메뉴 그대로 */
    viewEl.addEventListener('contextmenu', (ev) => {
      if (!canUndo()) return;
      ev.preventDefault();
      undo();
    });

    $<HTMLButtonElement>('#acDeck').onclick = (): void => {
      const all = DECK_SKINS;
      const at = all.findIndex((k) => k.id === deckSkin().id);
      setDeckSkin(all[(at + 1) % all.length].id);
      /* 판은 커널이 들고 있다. 화면만 새로 세우면 같은 판이 다른 무늬로 */
      if (gameId) mountView(gameId);
    };
    $<HTMLButtonElement>('#acScene').onclick = (): void => {
      setScene(nextScene(sceneOf(gameId), gameId));
      /* 판은 커널이 들고 있다. 화면만 새로 세우면 같은 판이 다른 방에 놓인다 */
      if (gameId) mountView(gameId);
    };

    $<HTMLButtonElement>('#acDim').onclick = (): void => {
      const next = dim() === '3d' ? '2d' : '3d';
      try {
        localStorage.setItem('karmolab.arcade.dim', next);
      } catch {
        /* 못 적어도 이 판에서는 바뀐다 */
      }
      if (gameId) mountView(gameId);
    };

    /* 봇 세기 고르기. 판을 시작할 때 규칙 겉에 씌운다. */
    const paintLevel = (): void => {
      const now = levelNow();
      container.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.level === now ? 'true' : 'false');
        b.className = b.dataset.level === now ? 'ac-on' : '';
      });
    };
    container.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => {
      b.onclick = () => {
        try {
          localStorage.setItem(LEVEL_KEY, String(b.dataset.level));
        } catch {
          /* 못 적어도 이 판에는 적용된다 */
        }
        paintLevel();
        blip('tap');
      };
    });
    paintLevel();

    $<HTMLButtonElement>('#acWaitQuit').onclick = quit;

    againBtn.onclick = (): void => {
      if (tour) {
        /* 대회 중이면 한 판 더가 다음 판이 된다. 다 돌았으면 대회를 닫고 로비로. */
        if (isOver(tour)) {
          tour = null;
          againBtn.textContent = t('arcade.btn.again');
          quit();
          return;
        }
        nextTourGame();
        return;
      }
      if (!gameId) return;
      if (net?.host) startTogether();
      else startSolo(gameId);
    };

    Toolbox.onDispose?.(() => {
      nextEpoch();
      cancelAnimationFrame(raf);
      net?.leave();
      /* 문서와 창의 리스너, 무대 관찰자, 복기와 등급전 타이머까지. 남기면 핫리로드마다 쌓인다 */
      gone.abort();
      chrome.dispose();
      review?.timer?.();
      rankedTick?.();
      stopLinkWatch();
      mdd.stop();
    });
  }
})();
