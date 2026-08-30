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
import { t, loadNamespace } from '../../lib/i18n';
import { CARDS, cardById } from './catalog-meta.generated';
import { SETUPS, optsFor, chooseOpt } from './setups';
import { ensureGame, gameById } from './loader';
import { Match, type MatchView, type SeatSpec } from './kernel';
import type { GameDef } from './types';
import { seedFrom } from './rng';
import { iconOf, kindOf } from './meta';
import { viewById, view3dById, ensureView3d } from './loader';
import { makeCode, inviteLink } from '../../lib/room';
import { blip, soundOn, setSoundOn, setBlipVoice } from '../../lib/blip';
import { sceneOf, setScene, nextScene, specOf } from './scenes';
import { buzz } from '../../lib/haptic';
import { pickBots, withBotLevel, type BotLevel, type BotPersona } from './bots';
import { CAST, EMOTES, castByName, castOfLevel, faceSvg, lineOf, type Mood } from './cast';
import { todayPicks, dailyState, markPlayed, PICKS } from './daily';
import { soloPlays, inAppTool, type SoloPlay } from './solo';
import { loadPacks } from '../pack-store';
import { courseSteps, courseRun } from '../play-course';
import { lengthOf, secondsOf } from './length';
import { readPlays, notePlay, noteBest, bestOf } from './plays';
import { withGhost, GHOST_NAME } from './ghost';
import { fold, deal, turnOf, letterLink, letterFromUrl, type Letter } from './mail';
import { split, isTeamy, teamScores, TEAM_NAMES, type Plan } from './teams';
import { listRooms, holdRoom, type OpenRoom } from './open-rooms';
import { matches } from './pick6';
import { ranks } from './rank';
import { intervalWhileVisible } from '../../lib/tick';
import { record, type Tape } from './replay';
import { forWatcher } from './spectate';
import { pickGames, award, isOver, ROUNDS, type TourState } from './tour';
import { PARTY, partySize } from './seating';
import type { Render } from './views';
import { connect, type Net, type Peer, type Json } from './net';

declare const Toolbox: {
  register: (w: unknown) => void;
  onDispose?: (fn: () => void) => void;
  trackUse?: (s: string) => void;
  copyText?: (s: string, o?: { message?: string }) => Promise<void>;
  /** 앱 안 도구로 화면만 바꾼다 (혼자 놀이로 건너갈 때. TASK-KL-313). */
  switchPage?: (id: string) => void;
};
declare const Mdd: { linePreset?: (k: string, o?: { msg?: string }) => void } | undefined;

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
    el.textContent = [
      /**
       * ── 오락실 로비 = 진열장 (change.arcade-redesign) ──
       *
       * 로비만 테마와 무관하게 **따뜻한 상아색 탁자**다. 어두운 방에서도 진열장에는 불이
       * 켜져 있는 것. 그게 이 방의 정체성이다. 판(무대) 화면은 테마를 그대로 따른다.
       *
       * 안쪽 요소(찾기, 오늘의 세 판, 혼자 놀이, 표)는 전부 토큰을 쓰므로, 여기서 토큰만
       * 상아 팔레트로 덮으면 로비 전체가 한 번에 따라온다. 다크에서 밝은 글자가 상아 위에
       * 얹히는 사고를 토큰 층에서 막는다.
       */
      /**
       * ── 무대 어휘 (단계 3). 판은 재질로 만든다 ──
       * 51판이 각자 색을 정하는 대신 여기 있는 재질, 그림자만 조립한다.
       * 나무 = 판놀이, 펠트 = 카드, 당구, 종이 = 점수표. 조각(돌, 공)은 좌상단 하이라이트
       * + 바닥 그림자 한 규칙.
       */
      '.ac-root{' +
      '--ac-wood:repeating-linear-gradient(93deg,rgba(150,105,55,.13) 0 2px,rgba(150,105,55,0) 2px 9px),repeating-linear-gradient(88deg,rgba(110,72,32,.09) 0 1px,rgba(110,72,32,0) 1px 23px),linear-gradient(160deg,#e8bd7f 0%,#dfae6c 45%,#cf9a55 100%);' +
      '--ac-wood-line:rgba(92,61,24,.5);' +
      '--ac-felt:repeating-linear-gradient(74deg,rgba(0,0,0,.045) 0 2px,rgba(0,0,0,0) 2px 5px),linear-gradient(180deg,#17694f 0%,#125540 55%,#0d422f 100%);' +
      '--ac-paper:linear-gradient(168deg,#ffffff 0%,#fbf8f2 62%,#f0ebe0 100%);' +
      '--ac-sh-rest:0 3px 5px rgba(60,40,16,.4);' +
      '--ac-sh-lift:0 14px 22px rgba(20,24,20,.35);' +
      '--ac-stone-b:radial-gradient(circle at 34% 28%,#6e6a66 0%,#262422 42%,#100f0e 100%);' +
      '--ac-stone-w:radial-gradient(circle at 34% 28%,#ffffff 0%,#f3efe6 45%,#cfc7b8 100%);' +
      /* 카드 한 벌. 같은 카드가 판마다 7가지 치수였다(64×88, 64×90, 52×72, 44×62, 38×52, 34×48, 34×46).
         종이는 한 종류다: 치수, 모서리, 뒷면을 여기서 한 번 정하고 열여섯 판이 같이 쓴다. */
      '--ac-card-w:64px;--ac-card-h:90px;--ac-card-r:9px;' +
      '--ac-card-face:linear-gradient(168deg,#ffffff 0%,#fbf8f2 62%,#f0ebe0 100%);' +
      '--ac-card-back:repeating-linear-gradient(45deg,rgba(255,255,255,.14) 0 4px,rgba(255,255,255,0) 4px 8px),linear-gradient(150deg,#2f6f5e 0%,#245647 100%);' +
      '--ac-card-sh:0 6px 12px rgba(10,40,30,.3),inset 0 0 0 1px rgba(20,40,32,.1);' +
      '--ac-red:#c62f36;--ac-black:#23201c;' +
      /**
       * ── 오목판 한 벌 ──
       * 판놀이 공용 나무(`--ac-wood`)와 갈라 둔다. 저 나무는 여러 판이 같이 쓰는 밝은 결이고,
       * 이쪽은 실제 비자나무 판의 채도 낮은 살구빛. 결은 옅게 두 겹만
       * 무늬가 뚜렷하면 줄과 겨루고, 그러면 사람이 줄을 못 읽음
       */
      '--ac-goban-wood:repeating-linear-gradient(91deg,rgba(150,104,48,.05) 0 1px,rgba(150,104,48,0) 1px 14px),' +
      'repeating-linear-gradient(89deg,rgba(122,80,32,.04) 0 1px,rgba(122,80,32,0) 1px 37px),' +
      'linear-gradient(168deg,#e7ab6d 0%,#e2a263 52%,#d5924f 100%);' +
      '--ac-goban-side:#b8783c;' +
      '--ac-goban-line:rgba(38,30,22,.82);' +
      '--ac-line-w:1.5px;' +
      /* 알 그림자는 오른쪽 아래로 짧게. 길면 알이 판에서 뜬다 */
      '--ac-stone-sh:0 2px 3px rgba(40,24,8,.45);' +
      '--ac-stone-ghost:radial-gradient(circle at 34% 28%,rgba(60,54,48,.3) 0%,rgba(40,34,28,.18) 100%);' +
      '--ac-bowl-wood:radial-gradient(circle at 36% 30%,#c89a5e 0%,#a9773f 100%);' +
      '--ac-bowl-fill:#3a2c1a;' +
      '--ac-bowl-b:radial-gradient(circle at 30% 26%,#5d5955 0 22%,#211f1d 23%,#141312 46%,transparent 47%),' +
      'radial-gradient(circle at 66% 38%,#514d49 0 20%,#1d1b1a 21%,#111010 42%,transparent 43%),' +
      'radial-gradient(circle at 44% 68%,#4a4643 0 24%,#1b1918 25%,#0e0d0c 48%,transparent 49%),' +
      'radial-gradient(circle at 50% 50%,#221f1d 0%,#0c0b0a 100%);' +
      '--ac-bowl-w:radial-gradient(circle at 30% 26%,#fbf7ee 0 22%,#d8d1c2 23%,#bcb4a4 46%,transparent 47%),' +
      'radial-gradient(circle at 66% 38%,#f6f1e6 0 20%,#d2cabb 21%,#b4ab9b 42%,transparent 43%),' +
      'radial-gradient(circle at 44% 68%,#f3eee2 0 24%,#cec6b6 25%,#aea595 48%,transparent 49%),' +
      'radial-gradient(circle at 50% 50%,#cbc3b4 0%,#9a9182 100%)' +
      '}',
      /**
       * ── 껍데기를 걷은 판 (`views.ts` 의 `bare`) ──
       * 자리표와 상태 줄을 지우고 판만 남김. 아래 버튼은 손이 갈 때만 나타남
       * 판을 보는 동안 화면에 글자가 한 자도 없음
       */
      '#acPlay.ac-bare{grid-template-columns:minmax(0,1fr);position:relative}',
      /* 어두운 방. 판 뒤의 위젯 배경(꽃, 마름모)이 판과 겨루면 판이 물건으로 안 보임
         가운데만 따뜻하게 남겨 판 위로 빛이 떨어지는 자리를 만든다 */
      '#acPlay.ac-bare::before{content:"";position:fixed;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 46%,rgba(30,22,14,.62) 0%,rgba(9,7,5,.95) 72%);pointer-events:none;z-index:0}',
      '#acPlay.ac-bare>*{position:relative;z-index:1}',
      '#acPlay.ac-bare #acSeats,#acPlay.ac-bare #acStatus{display:none}',
      /* 판 뒤의 카드도 걷는다. 물건 뒤에 또 판때기가 있으면 물건으로 안 보인다 */
      '#acPlay.ac-bare .ac-stage{grid-column:1;background:none;border:0;box-shadow:none;padding:0}',
      '#acPlay.ac-bare #acControls{grid-column:1;justify-content:center}',
      /* ── 시작 전에 고르는 줄 (`setups.ts`) ── */
      '.ac-setup{display:flex;flex-direction:column;gap:8px;margin:var(--space-md) 0}',
      '.ac-setrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.ac-setrow>b{font-size:var(--font-size-xs);opacity:.72;min-width:64px}',
      '.ac-setpick{display:inline-flex;border:1px solid rgba(60,58,48,.28);border-radius:var(--radius-pill);overflow:hidden}',
      '.ac-setpick button{border:0;background:none;color:inherit;font:inherit;font-size:var(--font-size-xs);padding:5px 12px;cursor:pointer}',
      '.ac-setpick button+button{border-left:1px solid rgba(60,58,48,.18)}',
      '.ac-setpick button[aria-pressed="true"]{background:#3c3a30;color:#fdfcf7;font-weight:700}',
      '#acPlay.ac-bare #acControls{opacity:0;transition:opacity .18s ease}',
      '#acPlay.ac-bare:hover #acControls,#acPlay.ac-bare:focus-within #acControls{opacity:1}',
      /* ── 캔버스 판의 곁것들 (점수줄, 조작 막대) ──
       * 판 안에 글자를 그리면 판마다 제 글꼴이 되고 무대가 커져도 안 따라 커진다.
       * 글자는 전부 판 **밖**에서, 여기 한 벌로. */
      '.ac-root .ac-plscore{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:var(--space-sm)}',
      '.ac-root .ac-plc{display:inline-flex;align-items:center;gap:6px;font-size:var(--font-size-xs);font-weight:700;color:var(--text-secondary);background:var(--bg-secondary);border-radius:var(--radius-pill);padding:5px 12px}',
      '.ac-root .ac-plc::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--c)}',
      '.ac-root .ac-plc.ac-me{color:var(--text-primary);box-shadow:inset 0 0 0 1px var(--border-hover)}',
      '.ac-root .ac-plc b{color:var(--text-primary)}',
      /* 조작 막대. 셸의 라벤더 대신 판의 색(당구=천의 금빛). 미끄럼 손잡이도 같이. */
      '.ac-root .ac-clbar input[type=range]{accent-color:#e8c15a}',
      '.ac-root .ac-pl .btn-primary,.ac-root .ac-cl .btn-primary,.ac-root .ac-tk .btn-primary,.ac-root .ac-sn .btn-primary,.ac-root .ac-dt .btn-primary,.ac-root .ac-fi .btn-primary{background:#e8c15a;background-image:none;color:#2b2721;border-color:transparent;font-weight:900}',
      /* 주사위. 눈을 **점으로** 찍는다. `⚀⚁` 글자는 우리 글꼴에 없어 두부(□)로 나왔다(실측). */
      /* 크기는 **한 곳에서** 정한다(`--ac-die`). vw 로 뒀더니 무대가 아니라 창을 기준으로
         커져 눈이 잘리고 판을 넘쳤다(실측: 2552px 창에서 주사위 하나가 350px). */
      '.ac-root{--ac-die:52px}',
      /* ★ **안쪽 여백을 %로 주면 안 된다**. 백분율 padding 은 제 크기가 아니라 **부모 폭**을
         기준으로 푼다. 부모가 684px 이라 `padding:14%` 가 한쪽 95px 이 되어, 52px 로 못 박은
         주사위가 191px 로 부풀었다(실측). 제 크기에 맞추려면 `calc(var(--ac-die) * ...)`. */
      '.ac-root .ac-die{display:inline-grid;grid-template-columns:repeat(3,1fr);' +
      'gap:calc(var(--ac-die) * .1);' +
      'width:var(--ac-die);min-width:var(--ac-die);max-width:var(--ac-die);' +
      'height:var(--ac-die);min-height:var(--ac-die);max-height:var(--ac-die);' +
      'flex:0 0 auto;padding:calc(var(--ac-die) * .14);box-sizing:border-box;border:0;border-radius:calc(var(--ac-die) * .22);background:linear-gradient(160deg,#fffdf8,#e6dfd0);box-shadow:0 4px 8px rgba(84,56,22,.28),inset 0 -3px 5px rgba(140,124,98,.3);cursor:default}',
      '.ac-root .ac-die i{display:block;border-radius:50%;background:transparent;aspect-ratio:1}',
      '.ac-root .ac-die i.ac-on{background:#2b2721}',
      '.ac-root .ac-die.ac-can{cursor:pointer}',
      /* 남겨 둔 주사위 = 옆으로 빼 둔 것. 금테로 이건 안 굴린다를 말한다. */
      '.ac-root .ac-die.ac-keep{box-shadow:0 2px 4px rgba(84,56,22,.3),inset 0 0 0 3px #e8c15a;transform:translateY(4px)}',
      '.ac-root .ac-die.ac-mini{--ac-die:20px;vertical-align:-4px;box-shadow:0 1px 2px rgba(84,56,22,.3)}',
      /* 판 위 말. 원반, 말뚝, 나무패가 같은 자리 색과 같은 빛을 쓴다. 모양은 규칙이 아니라 표현이다. */
      '.ac-root .ac-piece{--ac-piece-face:#c43f46;--ac-piece-edge:#7f1d28;--ac-piece-ink:#fff8ec;position:relative;display:inline-grid;place-items:center;flex:0 0 auto;box-sizing:border-box;pointer-events:none;filter:drop-shadow(0 3px 2px rgba(44,28,17,.3));transition:transform var(--transition-fast),filter var(--transition-fast)}',
      '.ac-root .ac-piece-owner1{--ac-piece-face:#3978b9;--ac-piece-edge:#1e4778;--ac-piece-ink:#f6fbff}',
      '.ac-root .ac-piece-owner2{--ac-piece-face:#398562;--ac-piece-edge:#1c573e;--ac-piece-ink:#f5fff9}',
      '.ac-root .ac-piece-owner3{--ac-piece-face:#d0962d;--ac-piece-edge:#835b15;--ac-piece-ink:#2f2513}',
      '.ac-root .ac-piece>span{position:relative;z-index:2;color:var(--ac-piece-ink);font-style:normal;font-weight:900;line-height:1;text-shadow:0 1px rgba(0,0,0,.22)}',
      /* 체커 원반. 가장자리 홈과 가운데 빛으로 납작한 색점이 아니라 실제 말처럼 선다. */
      '.ac-root .ac-piece-disc{width:72%;aspect-ratio:1;border:2px solid var(--ac-piece-edge);border-radius:50%;background:radial-gradient(circle at 34% 28%,color-mix(in srgb,var(--ac-piece-face) 72%,white) 0 9%,var(--ac-piece-face) 38%,var(--ac-piece-edge) 100%);box-shadow:inset 0 0 0 3px color-mix(in srgb,var(--ac-piece-face) 76%,white),0 2px 0 var(--ac-piece-edge)}',
      '.ac-root .ac-piece-disc>span{font-size:min(2.5vw,12px)}',
      '.ac-root .ac-piece-disc.ac-piece-king{box-shadow:inset 0 0 0 3px #f4cf69,inset 0 0 0 6px var(--ac-piece-face),0 3px 0 var(--ac-piece-edge)}',
      /* 윷, 여우사냥개 말뚝. 머리와 넓은 밑동을 CSS로 굽는다. */
      '.ac-root .ac-piece-pawn{width:58%;aspect-ratio:3/4;filter:drop-shadow(0 3px 2px rgba(44,28,17,.34))}',
      '.ac-root .ac-piece-pawn::before{content:"";position:absolute;z-index:1;left:25%;top:2%;width:50%;aspect-ratio:1;border:2px solid var(--ac-piece-edge);border-radius:50%;background:radial-gradient(circle at 34% 28%,color-mix(in srgb,var(--ac-piece-face) 70%,white) 0 12%,var(--ac-piece-face) 48%,var(--ac-piece-edge) 100%)}',
      '.ac-root .ac-piece-pawn::after{content:"";position:absolute;left:9%;right:9%;bottom:0;height:60%;clip-path:polygon(30% 0,70% 0,100% 100%,0 100%);border-radius:var(--radius-sm);background:linear-gradient(90deg,var(--ac-piece-edge),var(--ac-piece-face) 28% 66%,color-mix(in srgb,var(--ac-piece-face) 65%,white));box-shadow:inset 0 -3px rgba(0,0,0,.18)}',
      '.ac-root .ac-piece-pawn>span{align-self:end;margin-bottom:16%;font-size:min(2.4vw,11px)}',
      /* 쇼기 나무패. 같은 나뭇결, 상대편은 패 자체만 돌아간다. */
      '.ac-root .ac-piece-tile{width:76%;aspect-ratio:4/5;clip-path:polygon(50% 0,96% 18%,88% 100%,12% 100%,4% 18%);background:repeating-linear-gradient(92deg,rgba(111,70,25,.12) 0 1px,transparent 1px 7px),linear-gradient(155deg,#f4d394,#d7a45d 62%,#bb7d38);filter:drop-shadow(0 3px 1px rgba(66,40,14,.4));transform-origin:center}',
      '.ac-root .ac-piece-tile::after{content:"";position:absolute;inset:8%;clip-path:inherit;border:1px solid rgba(91,52,15,.48)}',
      '.ac-root .ac-piece-tile>span{color:#3b2612;font-size:min(4.4vw,20px);text-shadow:0 1px rgba(255,255,255,.42)}',
      '.ac-root .ac-piece-tile.ac-piece-owner1>span{color:#8d2428}',
      '.ac-root .ac-piece-flip{transform:rotate(180deg)}',
      '.ac-root .ac-piece-compact{width:16px;height:20px;filter:drop-shadow(0 1px 1px rgba(44,28,17,.28))}',
      '.ac-root .ac-piece-compact>span{font-size:var(--font-size-4xs)}',
      /* 펠트 판 위의 단추. 셸의 라벤더 그라데이션이 초록 위에 그대로 뜨면 남의 옷이다.
         금빛 하나로 통일한다(카드 놀이의 칩 색). */
      '.ac-root .ac-pr .btn-primary,.ac-root .ac-bj .btn-primary,.ac-root .ac-sp .btn-primary{background:#ffd66b;background-image:none;color:#23201c;border-color:transparent;font-weight:900}',
      '.ac-root .ac-pr .btn-ghost,.ac-root .ac-bj .btn-ghost,.ac-root .ac-sp .btn-ghost{color:#eaf2ee;border-color:rgba(234,242,238,.4)}',
      /* 카드 부품. 앞면/뒷면/낼 수 있음/집은 것. 판마다 `.ac-card2`(짝 맞추기)처럼 제 이름이
         있던 것을 이 한 벌로 모은다. 크기가 다를 이유가 있는 판만 --ac-card-w 를 덮어쓴다. */
      '.ac-root .ac-pc{position:relative;width:var(--ac-card-w);height:var(--ac-card-h);border:0;border-radius:var(--ac-card-r);background:var(--ac-card-face);box-shadow:var(--ac-card-sh);color:var(--ac-black);font-weight:700;padding:0;cursor:default;transition:transform var(--transition-fast)}',
      '.ac-root .ac-pc.ac-red{color:var(--ac-red)}',
      '.ac-root .ac-pc.ac-back{background:var(--ac-card-back);color:transparent}',
      '.ac-root .ac-pc.ac-can{cursor:pointer}',
      '.ac-root .ac-pc.ac-can:hover{transform:translateY(-6px)}',
      '.ac-root .ac-pc.ac-pick{transform:translateY(-10px);box-shadow:0 14px 22px rgba(10,40,30,.38),inset 0 0 0 2px #ffd66b}',
      /* 못 내는 카드도 **종이는 종이다**. 투명하게 만들면 펠트가 비쳐 카드가 사라진다(실측).
         흐린 것은 글자다: 종이는 그대로 두고 잉크만 옅게. */
      '.ac-root .ac-pc:disabled{cursor:default}',
      '.ac-root .ac-pc.ac-dim{color:#9a958c}',
      '.ac-root .ac-pc.ac-dim .ac-pcm{opacity:.55}',
      /* 모서리 두 곳 + 가운데 큰 무늬. 진짜 카드의 읽는 법이다. */
      '.ac-root .ac-pc .ac-pcc{position:absolute;left:7px;top:5px;font-size:var(--font-size-xs);line-height:1.05;text-align:center}',
      '.ac-root .ac-pc .ac-pcc.ac-br{left:auto;top:auto;right:7px;bottom:5px;transform:rotate(180deg)}',
      '.ac-root .ac-pc .ac-pcs{display:block;font-size:var(--font-size-2xs)}',
      '.ac-root .ac-pc .ac-pcm{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:36px;line-height:1}',
      /* 곁말. 화투의 달 수, 몇 장 겹쳐 들었나. 가운데 글자 밑 제 줄에 작게. */
      '.ac-root .ac-pc .ac-pcn{position:absolute;left:0;right:0;bottom:6px;font-size:var(--font-size-3xs);font-weight:600;opacity:.72}',
      /* 패 고유의 색. 글자가 물들고 안쪽에 그 색 테가 한 겹 돈다(종이는 흰 채로). */
      '.ac-root .ac-pc[style*="--hue"]{color:var(--hue);box-shadow:var(--ac-card-sh),inset 0 0 0 2px var(--hue)}',
      /* 집은 패의 금테는 제 색 테보다 위다. 안 그러면 지금 고른 것이 안 보인다. */
      '.ac-root .ac-pc.ac-pick[style*="--hue"]{box-shadow:0 14px 22px rgba(10,40,30,.38),inset 0 0 0 2px #ffd66b}',
      '.ac-root #acLobby{background:radial-gradient(ellipse 120% 90% at 50% 18%,#f2f1e8 0%,#e9e8de 60%,#dedcd0 100%);border-radius:18px;padding:20px 28px 28px;color:#3c3a30;' +
      '--text-primary:#3c3a30;--text-secondary:#8b897b;--text-tertiary:#a5a396;--bg-primary:#fdfcf7;--bg-secondary:#f4f3ea;--bg-tertiary:#e4e2d6;--bg-hover:#efeee4;--border:rgba(60,58,48,.16);--border-hover:rgba(60,58,48,.3);' +
      '--accent:#3c3a30;--accent-fg:#fdfcf7;--accent-hover:#55523f;--accent-dim:rgba(60,58,48,.08);--accent-subtle:rgba(60,58,48,.05);--accent-glow:rgba(60,58,48,.18)}',
      '.ac-root #acLobby .btn-primary{background:#3c3a30;background-image:none;color:#fdfcf7;border-color:transparent}',
      '.ac-root #acLobby .btn-primary:hover{background:#55523f;background-image:none}',
      '.ac-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 var(--space-md)}',
      '.ac-brand{font-size:var(--font-size-xs);font-weight:900;letter-spacing:3px;color:#8b897b}',
      '.ac-sub{font-size:var(--font-size-2xs);color:#a5a396}',
      '.ac-top .ac-find{flex:1;min-width:180px;margin:0}',
      '.ac-namechip{display:flex;align-items:center;gap:6px;font-size:var(--font-size-xs);color:var(--text-secondary);white-space:nowrap}',
      '.ac-namechip input{width:110px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-pill);background:var(--bg-primary);color:var(--text-primary)}',
      /* ── 진열장. 물건은 끝을 맞춰(align-items:end) 같은 바닥에 선다. */
      '.ac-shelf{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:22px 8px;align-items:end;justify-items:center;margin:26px auto var(--space-md);max-width:1060px;min-height:180px}',
      '.ac-obj{position:relative;display:flex;flex-direction:column;align-items:center;background:none;border:0;padding:0;line-height:1;cursor:pointer;transition:transform var(--transition-fast)}',
      '.ac-obj:hover,.ac-obj:focus-visible{transform:translateY(-3px);z-index:2}',
      '.ac-obj:focus-visible{outline:none}',
      /* 바닥 반사는 얼굴에만. 이름까지 물에 비치면 안 된다. 이름은 반사 아래 값표처럼. */
      '.ac-objface{display:block;filter:drop-shadow(0 3px 4px rgba(60,58,48,.18));-webkit-box-reflect:below -8px linear-gradient(transparent 58%,rgba(0,0,0,.16))}',
      '.ac-objname{margin-top:16px;font-size:var(--font-size-3xs);font-weight:700;color:#8b897b;font-family:var(--font-sans);line-height:1.3;text-align:center;max-width:96px;word-break:keep-all}',
      '.ac-obj:hover .ac-objname,.ac-obj:focus-visible .ac-objname{color:#3c3a30}',
      /* ── 집은 물건. 탁자 가운데로. */
      '#acDetail{position:relative;padding:6px 0 20px}',
      '.ac-back{background:none;border:0;padding:4px 0;font-size:var(--font-size-xs);font-weight:700;color:#8b897b;cursor:pointer}',
      '.ac-back:hover{color:#3c3a30}',
      '.ac-dwrap{display:flex;align-items:center;justify-content:center;gap:64px;padding:34px 10px;flex-wrap:wrap}',
      '.ac-dface{font-size:140px;line-height:1;filter:drop-shadow(0 10px 14px rgba(60,58,48,.25));-webkit-box-reflect:below -16px linear-gradient(transparent 60%,rgba(0,0,0,.14))}',
      '.ac-dinfo{max-width:400px}',
      '.ac-dinfo h3{display:flex;align-items:center;gap:10px;font-size:32px;font-weight:900;margin:0}',
      '.ac-dinfo h3 i{font-style:normal;background:#3c3a30;color:#fdfcf7;font-size:var(--font-size-2xs);font-weight:900;padding:5px 9px;border-radius:var(--radius-md)}',
      '.ac-dinfo p{font-size:var(--font-size-sm);color:#6d6b5d;line-height:1.7;margin:10px 0 0}',
      '.ac-dmeta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}',
      '.ac-dmeta span{background:#fdfcf7;border-radius:var(--radius-pill);padding:5px 14px;font-size:var(--font-size-2xs);font-weight:700;color:#5b5949;box-shadow:0 1px 3px rgba(60,58,48,.12)}',
      '#acDetail .ac-go{display:flex;gap:10px;margin-top:24px;flex-wrap:wrap}',
      '#acDetail .ac-go button{border:0;border-radius:var(--radius-pill);padding:13px 30px;font-size:var(--font-size-xs);font-weight:900;cursor:pointer;white-space:nowrap}',
      '#acDetail .ac-go button[data-solo]{background:#3c3a30;color:#fdfcf7;box-shadow:0 4px 10px rgba(60,58,48,.28)}',
      '#acDetail .ac-go button[data-host]{background:#fdfcf7;color:#3c3a30;box-shadow:0 2px 6px rgba(60,58,48,.15)}',
      '#acDetail .ac-go button:hover{filter:brightness(1.06);transform:translateY(-1px)}',
      '#acDetail .ac-more{display:flex;gap:16px;margin-top:14px}',
      '#acDetail .ac-more button{background:none;border:0;padding:0;font-size:var(--font-size-2xs);color:#8b897b;text-decoration:underline;cursor:pointer}',
      '#acDetail .ac-more button:hover{color:#3c3a30}',
      /* ── 진열장 아래 딸린 것들(혼자 놀이, 표)은 낮은 흰 받침으로. */
      '.ac-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin:var(--space-md) 0 var(--space-lg)}',
      '.ac-emoji{font-size:26px;line-height:1}',
      '.ac-foot{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:var(--space-lg);flex-wrap:wrap}',
      '@media (prefers-reduced-motion:reduce){.ac-obj,.ac-todaycard,.ac-solocard{transition:none}.ac-introicon{animation:none}}',
      /**
       * 무대 크기. **이 한 줄이 51개 화면의 크기를 정한다** (TASK-KL-314).
       *
       * 셋 중 제일 작은 값을 쓴다: 가로 여유, **세로 여유**, 상한.
       * 세로를 안 넣었더니 노트북, 와이드에서 무대가 폰에서 온 460px 에 갇혀 세로의 절반만
       * 쓰고 있었다(실측. 1920 화면에서도 오목 칸이 폰과 같은 49px). 큰 화면에서 판이
       * 작은 것은 화면이 남는다가 아니라 그냥 안 보이는 것이다.
       *
       * 세로 몫이 58vh 인 이유: 72vh 로 뒀더니 노트북(1280×900)에서 **나가기 단추가 화면
       * 밖으로 밀렸다**(단추 끝 977 > 900). 판이 큰 대가로 판을 못 나가는 것은 남는 장사가
       * 아니다. 58vh 면 41px 여유로 들어가고 칸은 49px → 56px 로 는다(실측).
       * 더 키우고 싶으면 풀스크린이 그 자리다. 거기서는 단추가 아예 없다.
       */
      ':root{--ac-stage:min(94vw,58vh,640px)}',
      /* 무대에 옅은 판때기. 게임이 노는 자리가 로비와 구별된다 (크기 계약은 아래 § 그대로). */
      '.ac-stage{text-align:center;padding:var(--space-lg) 0;background:color-mix(in srgb,var(--accent) 4%,var(--bg-primary));border-radius:20px}',
      /* ★ 세로로 긴 캔버스 판의 **세로 상한** (실측: 컬링 1900px, 당구 1393px 가 1274px
         화면을 뚫었다). 캔버스에 직접 걸면 안 된다. 그리기 코드가 래퍼의 clientWidth 로
         해상도를 정하므로(위 view 들), **래퍼 폭**을 판 비율(W/H)만큼 좁혀 준다.
         62vh × (W/H) = 세로가 62vh 를 넘지 않는 폭. 눕힘, 전체화면에서도 vh 라 같이 준다. */
      '.ac-root .ac-cl{max-width:min(100%,calc(62vh*.385))}' /* 컬링 100:260 */,
      '.ac-root .ac-pl{max-width:min(100%,calc(62vh*.556))}' /* 당구 100:180 */,
      '.ac-root .ac-ah{max-width:min(100%,calc(62vh*.572))}' /* 에어하키 80:140 */,
      '.ac-root .ac-pg{max-width:min(100%,calc(62vh*.667))}' /* 핑퐁 80:120 */,
      '.ac-order{font-size:clamp(22px,5vw,34px);font-weight:700;min-height:1.4em}',
      '.ac-choices{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-width:100%;margin:var(--space-lg) auto 0}',
      '.ac-choice{padding:16px 8px;font-size:var(--font-size-lg);font-weight:700;border-radius:var(--radius-xl);border:1px solid var(--border);background:var(--bg-primary);color:inherit;cursor:pointer}',
      '.ac-choice:disabled{cursor:default;opacity:.75}',
      '.ac-choice.ac-right{border-color:#22c55e;box-shadow:inset 0 0 0 1px #22c55e}',
      '.ac-choice.ac-wrong{border-color:#ef4444;opacity:.5}',
      '.ac-bar{height:5px;border-radius:var(--radius-sm);background:var(--border);margin:var(--space-lg) auto 0;max-width:100%;overflow:hidden}',
      '.ac-roomfill{height:100%;background:var(--accent);width:100%}',
      /**
       * 오목판 = 나무. 글자 돌(●○)은 판정, 읽기용으로 두고 투명 처리. 보이는 돌은 ::after 가 그린다.
       *
       * ★ **알은 줄이 만나는 점에 놓인다.** 칸 안에 두면 그건 오목이 아니다(사용자 지적).
       * 칸을 그리는 격자는 그대로 두되, 칸의 **테두리를 줄로** 삼고 돌을 칸의 **좌상단 모서리**로
       * 옮긴다(`::after` 의 자리). 마지막 줄, 열의 점을 위해 판에 한 칸만큼 여백을 준다.
       */
      /**
       * 판은 **한 판 안에서만** 사는 물건이다. 나무 상자 위에 격자가 얹히고, 그 대각으로
       * 바둑통 둘이 놓임. 오른쪽에 이름표를 세우는 대신 여백을 물건으로 채움
       */
      '.ac-goban{position:relative;width:100%;max-width:min(var(--ac-goban-cap,78vh),100%);margin:0 auto;padding:6%;box-sizing:border-box}',
      /**
       * ★ **알은 줄이 만나는 점 위**. 그래서 칸의 **한가운데**가 곧 점
       * 예전에는 칸의 테두리를 줄로 삼고 알을 좌상단 모서리로 옮겼는데, 그러면 손이 올라간
       * 칸과 알이 놓일 점이 반 칸 어긋나고(사용자 실측), 마지막 줄과 열이 아예 안 그려짐
       * 지금은 칸마다 제 십자를 그리고 바깥쪽 반 토막만 지움. 줄 수가 몇이든 맞음
       */
      '.ac-board{position:relative;display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;width:100%;aspect-ratio:1;box-sizing:border-box;background:var(--ac-goban-wood);border-radius:var(--radius-sm);box-shadow:0 1px 0 rgba(255,244,224,.55) inset,0 -2px 0 rgba(120,78,30,.22) inset,0 10px 0 -2px var(--ac-goban-side),0 26px 40px rgba(20,12,4,.42)}',
      '.ac-board.ac-waiting{filter:saturate(.96)}',
      '.ac-cell{aspect-ratio:1;border:0;background:transparent;color:transparent;border-radius:0;font-size:0;line-height:0;padding:0;cursor:pointer;position:relative}',
      '.ac-cell:disabled{cursor:default}',
      /* 십자 한 벌. 세로는 i::before, 가로는 i::after. 알과 화점은 칸이 직접 그린다 */
      '.ac-cell i{position:absolute;inset:0;display:block;pointer-events:none}',
      /* 글자 돌은 판정과 읽기용. 눈에는 안 보이고 스크린 리더와 화면 검사만 읽는다 */
      '.ac-cell .ac-mk{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);font-size:0;color:transparent}',
      '.ac-cell i::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:var(--ac-line-w);margin-left:calc(var(--ac-line-w) / -2);background:var(--ac-goban-line)}',
      '.ac-cell i::after{content:"";position:absolute;top:50%;left:0;right:0;height:var(--ac-line-w);margin-top:calc(var(--ac-line-w) / -2);background:var(--ac-goban-line)}',
      /* 판 밖으로 새는 반 토막을 지운다. 가장자리 칸에만 붙는다(화면이 붙여 준다) */
      '.ac-cell.ac-e-t i::before{top:50%}',
      '.ac-cell.ac-e-b i::before{bottom:50%}',
      '.ac-cell.ac-e-l i::after{left:50%}',
      '.ac-cell.ac-e-r i::after{right:50%}',
      /* 화점. 자리는 화면이 정한다(판 크기마다 다르다). 칸 번호를 CSS 에 박지 않는다 */
      '.ac-cell.ac-star::before{content:"";position:absolute;left:50%;top:50%;width:22%;height:22%;transform:translate(-50%,-50%);border-radius:50%;background:var(--ac-goban-line)}',
      /* 알. 칸 한가운데 = 줄이 만나는 점. 지름은 칸의 92% (실측 레퍼런스 0.84~0.94) */
      '.ac-cell.ac-s1::after,.ac-cell.ac-s2::after{content:"";position:absolute;left:50%;top:50%;width:92%;height:92%;transform:translate(-50%,-50%);border-radius:50%}',
      '.ac-cell.ac-s1::after{background:var(--ac-stone-b);box-shadow:var(--ac-stone-sh)}',
      '.ac-cell.ac-s2::after{background:var(--ac-stone-w);box-shadow:var(--ac-stone-sh)}',
      /* 마지막 수. 알 위에 작은 점 하나. 테를 두르면 그 알만 다른 물건으로 보인다 */
      '.ac-cell.ac-last::before{content:"";position:absolute;left:50%;top:50%;width:20%;height:20%;transform:translate(-50%,-50%);border-radius:50%;background:rgba(220,72,54,.95);z-index:1}',
      /* 손이 올라간 점. 놓일 알을 옅게 미리 보여 준다. 칸을 칠하면 반 칸 어긋나 보인다 */
      '.ac-cell:not(:disabled):hover::after{content:"";position:absolute;left:50%;top:50%;width:92%;height:92%;transform:translate(-50%,-50%);border-radius:50%;background:var(--ac-stone-ghost)}',
      /* 금수. 흑이 못 두는 자리 (렌주 삼삼, 사사, 장목) */
      '.ac-cell.ac-ban::after{content:"";position:absolute;left:50%;top:50%;width:44%;height:44%;transform:translate(-50%,-50%);border-radius:var(--radius-sm);background:none;border:2px solid rgba(198,58,44,.72);rotate:45deg}',
      /* 바둑통 둘. 대각으로 놓인다(레퍼런스와 같은 자리). 그림자가 판 바깥을 채운다 */
      '.ac-bowl{position:absolute;width:12%;aspect-ratio:1;border-radius:50%;background:var(--ac-bowl-wood);box-shadow:0 10px 20px rgba(12,8,3,.6),inset 0 -7px 12px rgba(88,54,18,.55),inset 0 4px 6px rgba(255,226,186,.35);pointer-events:none}',
      /* 통 안. 어두운 바닥 위에 알이 무더기로 담긴다. 알 하나를 크게 두면 접시가 된다 */
      '.ac-bowl::after{content:"";position:absolute;inset:13%;border-radius:50%;background:var(--ac-bowl-fill);box-shadow:inset 0 4px 10px rgba(0,0,0,.7)}',
      '.ac-bowl.ac-bowl-b{left:0;top:0;transform:translate(-52%,-52%)}',
      '.ac-bowl.ac-bowl-b::after{background:var(--ac-bowl-b)}',
      '.ac-bowl.ac-bowl-w{right:0;bottom:0;transform:translate(52%,52%)}',
      '.ac-bowl.ac-bowl-w::after{background:var(--ac-bowl-w)}',
      /**
       * ── 입체 판 (표현 = 3D) ──
       * 무대는 `three-board.ts` 가 짓는다(받아 둔 three). 여기서는 **자리만** 내준다 . 
       * 판때기를 걷고, 정사각 한 칸을 준다. 크기는 무대 계약(`--ac-stage`)이 정한다.
       *
       * CSS 원근으로 세우던 판(`board3d.ts`)은 폐기했다: 돌이 눕고, 두께가 가짜였고,
       * 무늬를 입힐 수 없었다. 같은 구멍(`views.ts`)이라 규칙은 한 줄도 안 바뀌었다.
       */
      '.ac-stage:has(.ac-t3){background:none}',
      '.ac-t3{width:100%;aspect-ratio:1;max-width:100%;margin:0 auto;border-radius:var(--radius-xl);overflow:hidden}',
      '.ac-t3.ac-waiting{opacity:.92}',
      /* 방 표현의 비네팅. 네 귀를 어둡게 눌러야 판 위의 빛이 등에서 온 빛으로 읽힌다(레퍼런스 실측: 귀가 가운데보다 40% 어둡다) */
      /* 이름이 `ac-t3room` 인 이유: `ac-room` 은 온라인 방 패널이 이미 쓴다. 같은 이름을 쓰니 캔버스에 테두리와 flex 가 붙었다(실측) */
      '.ac-t3.ac-t3room{position:relative;border-radius:0}',
      /**
       * ── 방 표현 위의 UI ── 레퍼런스 실측: 좌하단 내 카드(아바타, 이름, 등급, 룰), 우상단 일시정지 하나.
       * `bare` 가 자리줄과 상태줄을 숨겼는데 그러면 누구 차례인지, 누가 누군지 모른다(사용자 지적).
       * 같은 DOM 을 판 위 카드로 다시 놓는다. 글자는 판 밖 귀퉁이에만
       */
      /* 화면 채움(`ac-roomfill`)이 fixed 를 걸므로 여기서는 비켜 준다. 특이도가 이쪽이 높아 안 비키면 fixed 가 진다(실측: 높이 0) */
      '#acPlay.ac-bare:has(.ac-t3room):not(.ac-roomfill){position:relative}',
      /* 그리드 안의 absolute 는 **제 칸**이 기준이다(실측: 단추가 top -66px 로 튀었다). 전체 칸으로 펴서 #acPlay 를 기준으로 */
      '#acPlay.ac-bare:has(.ac-t3room) #acSeats,#acPlay.ac-bare:has(.ac-t3room) #acStatus,#acPlay.ac-bare:has(.ac-t3room) #acControls,#acPlay.ac-bare:has(.ac-t3room) .ac-menubtn{grid-column:1/-1;grid-row:1/-1;align-self:auto;justify-self:auto}',
      /**
       * ── 자리 카드 ── (사용자: 좌하단이 작고 답답. 레퍼런스 더). Chess Ultra 실측(1920x1080): 카드 330x110(폭 17%, 높이 10%),
       * 아바타 80px, 이름 26px 명조, 등급 줄, 금테 1~2px, 반투명 검정. 둘이 화면 위 양 귀퉁이, 차례인 쪽 귀퉁이에 금색 삼각. lichess 와
       * chess.com 은 상대 위, 나 아래. 여기서는 상대는 왼쪽 위, 나는 왼쪽 아래(판을 사이에 두고 마주 앉음). 폭 300, 아바타 56, 이름 20
       */
      '#acPlay.ac-bare:has(.ac-t3room) #acSeats{display:block;position:absolute;inset:0;margin:0;padding:0;background:none;border:0;box-shadow:none;pointer-events:none;z-index:3}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat{position:absolute;left:18px;display:grid;grid-template-columns:56px 1fr auto;grid-template-rows:auto auto;column-gap:12px;row-gap:1px;align-items:center;width:300px;max-width:calc(100% - 36px);padding:10px 14px 10px 12px;border-radius:10px;background:linear-gradient(180deg,rgba(30,19,10,.8),rgba(16,10,6,.84));border:1px solid rgba(217,168,90,.38);color:#f6ecdc;backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,.42);font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-weight:400;pointer-events:auto;opacity:.78;transition:opacity .2s,border-color .2s,box-shadow .2s}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat.ac-me{bottom:18px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat:not(.ac-me):not(.ac-watch){top:14px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat.ac-watch{top:auto;bottom:130px;width:auto;display:inline-flex;gap:6px;padding:6px 12px;font-size:12px;border-radius:999px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat.ac-turn{opacity:1;border-color:#e6bd7a;box-shadow:0 0 0 1px rgba(230,189,122,.45),0 10px 28px rgba(0,0,0,.5)}',
      /* 차례인 카드의 귀퉁이 금색 삼각(Chess Ultra). 글자 화살표보다 멀리서 보인다 */
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat.ac-turn::after{content:"";position:absolute;right:0;top:0;width:0;height:0;border-style:solid;border-width:0 20px 20px 0;border-color:transparent #e6bd7a transparent transparent;border-top-right-radius:9px}',
      /* 아바타 자리. 알 색 원. 두 자리뿐이라 뒤에서 세면 구경꾼 줄이 앞에 끼어도 맞는다 */
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat:not(.ac-watch)::before{content:"";grid-column:1;grid-row:1/3;width:56px;height:56px;border-radius:50%;box-shadow:0 3px 8px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.08)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat:nth-last-child(2)::before{background:radial-gradient(circle at 35% 30%,#6a6560,#141210 70%)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat:nth-last-child(1)::before{background:radial-gradient(circle at 35% 30%,#fff,#cfc6b4 75%)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-seatname{grid-column:2;grid-row:1;font-size:20px;letter-spacing:.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat>b{grid-column:3;grid-row:1;font-size:22px;font-weight:600;color:#ffd696;font-variant-numeric:tabular-nums;line-height:1.2}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-rule{grid-column:2;grid-row:2;font-size:12px;letter-spacing:.06em;color:rgba(240,225,200,.68);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-rule:empty{display:none}',
      /* 남은 시간. 카드 오른쪽 아래, 남은 비율만큼 금색 호 */
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-clock{grid-column:3;grid-row:2;justify-self:end;position:relative;display:inline-grid;place-items:center;width:38px;height:38px;margin-top:2px;font-size:14px;font-variant-numeric:tabular-nums;color:#f7e9cf}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-clock::before{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(#d9a85a calc(var(--ac-left,1) * 360deg),rgba(255,255,255,.12) 0);-webkit-mask:radial-gradient(circle,transparent 15px,#000 16px);mask:radial-gradient(circle,transparent 15px,#000 16px)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-clock:empty{display:none}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-clock.ac-hurry{color:#ffb4a0}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-clock.ac-hurry::before{background:conic-gradient(#e0553c calc(var(--ac-left,1) * 360deg),rgba(255,255,255,.12) 0)}',
      /* 제안 상자. 판 위 가운데 종이 한 장 */
      '.ac-offer{display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--accent);border-radius:12px;background:var(--bg-secondary);margin:var(--space-md) 0;font-size:var(--font-size-sm)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-offer{position:absolute;left:50%;top:60px;transform:translateX(-50%);z-index:6;margin:0;background:linear-gradient(180deg,rgba(250,240,222,.97),rgba(236,222,196,.97));color:#3a2a18;border:0;box-shadow:0 14px 30px rgba(0,0,0,.45);font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-offer .btn{height:32px;line-height:30px;padding:0 14px;border-radius:999px;font-family:inherit}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-offer .btn-ghost{color:#5a4028;border:1px solid rgba(120,80,40,.4);background:none}',
      '#acPlay.ac-bare:has(.ac-t3room) #acStatus{display:block;position:absolute;left:50%;top:14px;right:auto;bottom:auto;width:max-content;max-width:60%;transform:translateX(-50%);margin:0;padding:6px 14px;border-radius:var(--radius-pill);background:rgba(18,12,8,.62);color:#f6ecdc;border:1px solid rgba(255,230,190,.16);font-size:var(--font-size-sm);z-index:3;backdrop-filter:blur(6px)}',
      '#acPlay.ac-bare:has(.ac-t3room) #acStatus:empty{display:none}',
      /**
       * ── 방의 버튼은 하나 ── (사용자: 알약 6개 다 마음에 안 듦, UI/UX 문제). 레퍼런스 실측: 대국 중 우상단 버튼 하나
       * 우상단 둥근 메뉴 하나. 누르면 종이 한 장이 내려오고 그 안에 줄로. 판 위에 늘 떠 있는 글자 없음
       */
      '.ac-menubtn,.ac-sep,.ac-lbl{display:none}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-menubtn{display:grid;place-items:center;position:absolute;right:16px;top:14px;left:auto;bottom:auto;width:42px;height:42px;padding:0;border-radius:50%;border:1px solid rgba(217,168,90,.45);background:rgba(24,15,8,.66);color:#f1e3c8;backdrop-filter:blur(8px);box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;z-index:7;opacity:.8;transition:opacity .15s,border-color .15s,background .15s}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-menubtn svg{width:20px;height:20px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-menubtn:hover,#acPlay.ac-bare:has(.ac-t3room) .ac-menubtn[aria-expanded="true"]{opacity:1;border-color:#e6bd7a;background:rgba(46,30,14,.85)}',
      '#acPlay.ac-bare:has(.ac-t3room) #acControls{display:none!important;position:absolute;right:16px;top:66px;left:auto;bottom:auto;margin:0;z-index:7;flex-direction:column;align-items:stretch;gap:2px;width:236px;padding:8px;border-radius:8px;background:linear-gradient(180deg,rgba(250,240,222,.97),rgba(236,222,196,.97));box-shadow:0 18px 40px rgba(0,0,0,.5),inset 0 0 0 1px rgba(120,80,40,.25);opacity:1;transform:none}',
      '#acPlay.ac-bare.ac-menu-open:has(.ac-t3room) #acControls{display:flex!important}',
      '#acPlay.ac-bare:has(.ac-t3room) #acControls .btn{display:flex;align-items:center;justify-content:flex-start;gap:10px;width:100%;height:auto;flex:0 0 auto;padding:9px 12px;border:0;border-radius:6px;background:none;color:#3a2a18;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-size:15px;letter-spacing:.04em;line-height:1.3;text-align:left;box-shadow:none;backdrop-filter:none;transform:none;transition:background .12s}',
      '#acPlay.ac-bare:has(.ac-t3room) #acControls .btn:hover{background:rgba(120,80,40,.12);transform:none}',
      '#acPlay.ac-bare:has(.ac-t3room) #acControls .btn-primary{color:#8f4f1c;font-weight:600}',
      '#acPlay.ac-bare:has(.ac-t3room) #acControls .ac-sep{display:block;height:1px;margin:6px 4px;background:rgba(120,80,40,.22)}',
      /* 소리와 전체화면은 선으로 그린 그림 + 글자. 이모지는 방의 물건이 아니다 */
      '#acPlay.ac-bare:has(.ac-t3room) #acControls .ac-emoji{display:none}',
      '#acPlay.ac-bare:has(.ac-t3room) #acControls .ac-lbl{display:inline}',
      '#acPlay.ac-bare:has(.ac-t3room) #acSound::before,#acPlay.ac-bare:has(.ac-t3room) #acFull::before{content:"";width:18px;height:18px;flex:0 0 auto;background:#5a4028;-webkit-mask:var(--ac-ico) center/contain no-repeat;mask:var(--ac-ico) center/contain no-repeat}',
      '#acPlay.ac-bare:has(.ac-t3room) #acSound{--ac-ico:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27black%27 stroke-width=%271.8%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27><path d=%27M4 9v6h4l5 4V5L8 9H4z%27/><path d=%27M16 9a4 4 0 0 1 0 6%27/><path d=%27M18.5 6.5a8 8 0 0 1 0 11%27/></svg>")}',
      '#acPlay.ac-bare:has(.ac-t3room) #acSound[aria-pressed="false"]{--ac-ico:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27black%27 stroke-width=%271.8%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27><path d=%27M4 9v6h4l5 4V5L8 9H4z%27/><path d=%27M16 9l5 6M21 9l-5 6%27/></svg>")}',
      '#acPlay.ac-bare:has(.ac-t3room) #acSound[aria-pressed="false"] .ac-lbl{opacity:.55}',
      '#acPlay.ac-bare:has(.ac-t3room) #acFull{--ac-ico:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27black%27 stroke-width=%271.8%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27><path d=%27M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5%27/></svg>")}',
      /* 결과 종이 아래 행동 셋. 한 판 더는 옻칠에 금박, 나머지는 금테 알약 */
      '.ac-overacts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}',
      '.ac-overacts:empty{display:none}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overacts{margin-top:14px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overacts .btn{height:40px;padding:0 22px;border-radius:999px;background:rgba(24,15,8,.66);border:1px solid rgba(217,168,90,.42);color:#f1e3c8;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-size:14px;letter-spacing:.08em;line-height:38px;backdrop-filter:blur(8px);box-shadow:0 4px 14px rgba(0,0,0,.35);transition:border-color .15s,background .15s,transform .15s}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overacts .btn:hover{border-color:#e6bd7a;background:rgba(46,30,14,.8);transform:translateY(-1px)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overacts .btn-primary{background:linear-gradient(180deg,#c9863d,#8f4f1c);border-color:#f0c98a;color:#fff6e4;font-weight:600;box-shadow:0 6px 18px rgba(120,60,10,.45)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overacts .btn-primary:hover{background:linear-gradient(180deg,#d8954a,#9d5a22)}',
      /**
       * ── 복기 타임라인 ── (레퍼런스: 오목 가자 복기는 휠로 수 이동과 Try Play. lichess 는 수 목록, 화살표 키, 속도)
       * 처음, 한 수 앞, 재생, 한 수 뒤, 끝, 막대, N / M, 속도. 곁가지(Try Play)면 막대 대신 돌아가기
       */
      '.ac-timeline{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;margin:var(--space-md) 0 0}',
      '.ac-timeline[hidden]{display:none}',
      '.ac-tlbtn{display:inline-grid;place-items:center;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid var(--border);background:var(--bg-secondary);color:inherit;cursor:pointer}',
      '.ac-tlbtn svg{width:18px;height:18px}',
      '.ac-tlbtn.ac-tltext,.ac-tlbtn.ac-tlspeed{width:auto;padding:0 12px;border-radius:var(--radius-pill);font-size:var(--font-size-xs)}',
      '.ac-tlbar{width:200px;accent-color:var(--accent)}',
      '.ac-tlnum{min-width:64px;text-align:center;font-variant-numeric:tabular-nums;font-size:var(--font-size-sm)}',
      '.ac-tlbranch{font-size:var(--font-size-xs);color:var(--accent)}',
      '.ac-tlbranch[hidden],.ac-tlbtn[hidden]{display:none}',
      '.ac-tlplay .ac-ico-pause{display:none}',
      '.ac-tlplay.ac-on .ac-ico-pause{display:block}',
      '.ac-tlplay.ac-on .ac-ico-play{display:none}',
      '.ac-timeline.ac-branch .ac-tlbar,.ac-timeline.ac-branch #acTlFirst,.ac-timeline.ac-branch #acTlPrev,.ac-timeline.ac-branch #acTlPlay,.ac-timeline.ac-branch #acTlNext,.ac-timeline.ac-branch #acTlLast,.ac-timeline.ac-branch #acTlSpeed,.ac-timeline.ac-branch .ac-tlnum{display:none}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-timeline{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:5;margin:0;flex-wrap:nowrap;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(24,15,8,.72);border:1px solid rgba(217,168,90,.42);color:#f1e3c8;backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,.42);font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-timeline{grid-column:1/-1;grid-row:1/-1;align-self:auto;justify-self:auto}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-tlbtn{background:none;border-color:rgba(217,168,90,.35);color:#f1e3c8;transition:background .12s,border-color .12s}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-tlbtn:hover{background:rgba(217,168,90,.18);border-color:#e6bd7a}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-tlbtn.ac-tltext{font-family:inherit;letter-spacing:.06em;font-size:13px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-tlbar{width:240px;accent-color:#d9a85a}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-tlnum{color:#ffd696;font-size:15px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-tlbranch{color:#ffd696;letter-spacing:.04em}',
      /**
       * ── 사람 (MDD, memo/rules/mdd.md) ── 자리 카드의 얼굴은 기하 도형(임시), 표정은 눈만, 말은 카드에 붙는 말풍선
       */
      '.ac-face,.ac-bubble,.ac-emotes{display:none}',
      '#acPlay.ac-bare:has(.ac-t3room) #acControls #acMdd[aria-pressed="false"]{opacity:.55}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-face{display:block;grid-column:1;grid-row:1/3;width:56px;height:56px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-face svg{display:block;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5));transition:transform .3s}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-face svg[data-mood="think"]{transform:rotate(-6deg)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-face svg[data-mood="glad"]{transform:scale(1.08)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-face svg[data-mood="sad"]{transform:rotate(8deg) translateY(3px);opacity:.85}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat:has(.ac-face)::before{display:none}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat .ac-bubble{display:block;position:absolute;left:14px;max-width:280px;padding:8px 14px;border-radius:12px;background:linear-gradient(180deg,rgba(250,240,222,.97),rgba(236,222,196,.97));color:#3a2a18;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-size:15px;line-height:1.4;box-shadow:0 8px 20px rgba(0,0,0,.4);white-space:nowrap}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat.ac-me .ac-bubble{bottom:calc(100% + 10px)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat:not(.ac-me) .ac-bubble{top:calc(100% + 10px)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat.ac-me .ac-bubble::after{content:"";position:absolute;left:22px;top:100%;border:8px solid transparent;border-top-color:rgba(238,225,200,.97);border-bottom:0}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-seat:not(.ac-me) .ac-bubble::after{content:"";position:absolute;left:22px;bottom:100%;border:8px solid transparent;border-bottom-color:rgba(250,240,222,.97);border-top:0}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-emotes{display:flex;flex-wrap:wrap;gap:6px;position:absolute;left:18px;bottom:130px;width:300px;z-index:6}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-emotes[hidden]{display:none}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-emotebtn{height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(217,168,90,.42);background:rgba(24,15,8,.72);color:#f1e3c8;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-size:14px;cursor:pointer;backdrop-filter:blur(8px)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-emotebtn:hover{border-color:#e6bd7a;background:rgba(46,30,14,.85)}',
      /**
       * ── 컷인 (MDD) ── 작혼의 리치, 론 연출과 같은 자리. 넷을 만들면(리치), 내가 넷을 만들면(위기), 판이 끝나면(론)
       * 오른쪽에서 큰 얼굴과 한 줄이 미끄러져 들어와 1.7초 머물고 나간다. 그림이 오면 얼굴만 갈아 끼움
       */
      '.ac-cutin{display:none}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-cutin{display:flex;align-items:center;gap:22px;position:absolute;right:0;top:24%;width:min(460px,60%);padding:18px 28px 18px 22px;z-index:9;pointer-events:none;background:linear-gradient(90deg,rgba(24,15,8,0),rgba(24,15,8,.88) 18%,rgba(24,15,8,.92));border-top:1px solid rgba(217,168,90,.55);border-bottom:1px solid rgba(217,168,90,.55);color:#f6ecdc;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;transform:translateX(110%);opacity:0;transition:transform .32s cubic-bezier(.2,.8,.2,1),opacity .25s}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-cutin[hidden]{display:none}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-cutin.ac-on{transform:none;opacity:1}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-cutin .ac-cutface svg{width:150px;height:150px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.6))}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-cutin b{display:block;font-size:17px;letter-spacing:.12em;color:#ffd696;font-weight:600;margin-bottom:6px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-cutin p{margin:0;font-size:22px;line-height:1.35;text-shadow:0 2px 10px rgba(0,0,0,.6)}',
      /* ── 콘텐츠 창 채우기 (위 `fill`) ── 헤더 아래, 사이드바 오른쪽을 전부 방으로 */
      '#acPlay.ac-roomfill{position:fixed;left:var(--ac-roomfill-x,0px);top:var(--ac-roomfill-y,0px);right:0;bottom:0;width:auto;height:auto;z-index:30;margin:0;padding:0;display:block;background:#0d0906}',
      '#acPlay.ac-roomfill .ac-stage{position:absolute;left:0;top:0;width:100%;height:100%;max-width:none;min-height:0;margin:0;padding:0;display:block;border-radius:0}',
      '#acPlay.ac-roomfill #acView{position:absolute;left:0;top:0;width:100%;height:100%;max-width:none}',
      '#acPlay.ac-roomfill #acView>*{margin:0}',
      '#acPlay.ac-roomfill .ac-t3.ac-t3room{position:absolute;left:0;top:0;width:100%;height:100%;aspect-ratio:auto}',
      '#acPlay.ac-roomfill .ac-intro{border-radius:0}',
      '#acPlay.ac-roomfill .ac-over{border-radius:0}',
      /* ── 바 카운터(주사위) ── 자리 카드의 흑백 알 대신 놋쇠 점. 종이 점수표는 카메라가 내려온 뒤 종이 위에 겹친다 */
      '#acPlay.ac-bare:has(.ac-t3bar) .ac-seat:not(.ac-watch)::before{background:radial-gradient(circle at 35% 30%,#f5d58a,#8a5a1a 75%)}',
      '#acPlay.ac-bare:has(.ac-t3bar) .ac-seat .ac-rule{padding-left:26px;font-variant-numeric:tabular-nums}',
      '.ac-ycpaper{position:absolute;inset:0;z-index:4;display:grid;place-items:center;background:rgba(6,4,2,.22);opacity:0;transition:opacity .28s ease}',
      '.ac-ycpaper.ac-show{opacity:1}',
      /* 보이기 전에는 손이 안 닿는다. 투명한 채 깔린 0.38초에 주사위 자리를 누르면 안 보이는 칸에 적혔다(사용자 지적: 적지도 않았는데 차례가 넘어감) */
      '.ac-ycpaper:not(.ac-show){pointer-events:none}',
      '.ac-ycpaper.ac-arm .ac-yccell{pointer-events:none;opacity:.55}',
      /* 작성자 display 가 hidden 의 UA display:none 을 이긴다. 안 적으면 투명한 채 캔버스를 덮어 클릭을 전부 먹는다(실측) */
      '.ac-ycpaper[hidden]{display:none}',
      /* 두 칸 나란히(정본). 점수표는 왼쪽 340px 종이 기둥, 무대는 나머지. 해체 분석 §4 */
      /* 종이 한 장. 화면 끝에 붙은 기둥이 아니라 여백을 두고 살짝 기운 종이(사용자 지적). 결은 가로 줄 무늬 */
      '.ac-ycpaper.ac-pin{inset:24px auto 24px 24px;width:400px;padding:50px 18px 16px;border-radius:3px;transform:rotate(-.7deg);transform-origin:50% 0;background:linear-gradient(172deg,#f9f2e1 0%,#f1e6cf 60%,#e9dcc0 100%),repeating-linear-gradient(180deg,transparent 0 31px,rgba(120,80,40,.05) 31px 32px);background-blend-mode:multiply;box-shadow:0 22px 50px rgba(0,0,0,.55),0 2px 0 rgba(255,255,255,.35) inset,0 0 0 1px rgba(120,80,40,.22);pointer-events:auto;display:block;opacity:1;overflow:auto}',
      '.ac-ycpaper.ac-pin::before{content:"";position:absolute;left:14px;right:14px;top:6px;height:10px;background:radial-gradient(ellipse at 50% 0,rgba(120,80,40,.18),transparent 70%);pointer-events:none}',
      '.ac-ycpaper.ac-pin .ac-ycpaperin{width:100%;max-height:none;padding:0;transform:none;background:none;box-shadow:none;font-size:var(--font-size-md);opacity:1}',
      '.ac-ycpaper.ac-pin .ac-ycclose{display:none}',
      '.ac-ycpaper.ac-pin .ac-ychead{flex-wrap:wrap;margin-bottom:10px}',
      '.ac-ycpaper.ac-pin .ac-ychead .ac-ycdice .ac-die{width:36px;height:36px;padding:5px}',
      /* 종이 안 배치는 고정. 안내 글이 한 줄이든 두 줄이든 표가 안 움직인다(사용자 지적) */
      '.ac-ycpaper.ac-pin .ac-ychead .ac-ycleft{flex-basis:100%;margin-top:4px;font-size:var(--font-size-sm);line-height:1.3;height:2.6em;overflow:hidden}',
      '.ac-ycpaper.ac-pin .ac-yctable{table-layout:fixed}',
      '.ac-ycpaper.ac-pin .ac-yctable tr{height:38px}',
      '.ac-ycpaper.ac-pin .ac-yctable td button{vertical-align:middle}',
      '.ac-ycpaper.ac-pin .ac-yctable thead tr{height:32px}',
      /* 행은 언제나 38px. 열린 칸(버튼)과 닫힌 칸(글자)과 빈 칸이 같은 높이(사용자 지적: 글자 유무로 배치가 달라짐) */
      '.ac-ycpaper.ac-pin .ac-yctable th,.ac-ycpaper.ac-pin .ac-yctable td{padding:0 6px;height:38px;box-sizing:border-box;font-size:var(--font-size-md);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1}',
      /* table-layout fixed 는 첫 행의 폭을 쓴다. 머리 행 첫 칸에도 폭을 줘야 이름 열이 넓다(실측: 25% 로 갈려 이름이 잘렸다) */
      '.ac-ycpaper.ac-pin .ac-yctable thead th:first-child{width:42%}',
      '.ac-ycpaper.ac-pin .ac-yctable tbody th{width:42%;font-size:var(--font-size-sm)}',
      '.ac-ycpaper.ac-pin .ac-yctable .ac-yctot th,.ac-ycpaper.ac-pin .ac-yctable .ac-yctot td{font-size:var(--font-size-sm);height:32px}',
      '.ac-ycpaper.ac-pin .ac-yctable td{font-size:var(--font-size-lg)}',
      '.ac-ycpaper.ac-pin .ac-yccell{min-height:0;height:30px;line-height:28px;padding:0;font-size:var(--font-size-lg)}',
      /* 무대는 화면 전부. 종이가 왼쪽을 덮는다(사용자: 3D 종이는 장식, 가려도 된다) */
      '.ac-ycsplit .ac-ychud,.ac-ycsplit .ac-yctoast{left:calc(50% + 120px)}',
      '.ac-ycpin{position:absolute;left:38px;top:36px;z-index:5;height:34px;padding:0 14px;border-radius:var(--radius-pill);background:rgba(24,15,8,.66);border:1px solid rgba(217,168,90,.42);color:#f1e3c8;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-size:var(--font-size-xs);letter-spacing:.06em;cursor:pointer;opacity:.7;backdrop-filter:blur(8px)}',
      '.ac-ycpin:hover,.ac-ycpin[aria-pressed="true"]{opacity:1;border-color:#e6bd7a}',
      '.ac-ycpin[aria-pressed="true"]{background:linear-gradient(180deg,#c9863d,#8f4f1c);color:#fff6e4}',
      '.ac-ycpin[hidden]{display:none}',
      '.ac-yctoast{position:absolute;left:50%;top:18%;transform:translate(-50%,-50%) translateY(8px);z-index:4;pointer-events:none;padding:10px 24px;border-radius:var(--radius-pill);background:rgba(24,15,8,.74);border:1px solid rgba(217,168,90,.5);color:#f7e9cf;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-size:var(--font-size-lg);letter-spacing:.08em;white-space:nowrap;opacity:0;transition:opacity .25s ease,transform .25s ease;backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,.4)}',
      '.ac-yctoast.ac-show{opacity:1;transform:translate(-50%,-50%)}',
      '.ac-yctoast.ac-deny{border-color:rgba(224,110,90,.75);color:#ffd6cc;background:rgba(40,12,8,.8)}',
      /* 상황판. 자리 카드 대신 화면 아래 한 줄(사용자 구상). 차례 순서대로 카드, 지금 차례는 금테 */
      '#acPlay.ac-bare:has(.ac-t3bar) #acSeats{display:none}',
      '.ac-ychud{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:3;display:flex;align-items:flex-end;gap:10px;max-width:calc(100% - 40px);font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif}',
      '.ac-ychudround{align-self:center;padding:6px 12px;border-radius:var(--radius-pill);background:rgba(24,15,8,.66);border:1px solid rgba(217,168,90,.42);color:#e8d8bd;font-size:var(--font-size-xs);letter-spacing:.06em;white-space:nowrap;backdrop-filter:blur(8px)}',
      '.ac-ychudcard{position:relative;min-width:150px;padding:10px 14px 9px;border-radius:var(--radius-md);background:linear-gradient(172deg,rgba(247,239,220,.96),rgba(230,216,186,.96));box-shadow:0 10px 26px rgba(0,0,0,.45),inset 0 0 0 1px rgba(120,80,40,.25);color:#3a2a18;display:flex;flex-direction:column;gap:2px;opacity:.68;transition:opacity .2s,transform .2s,box-shadow .2s}',
      '.ac-ychudcard.ac-cur{opacity:1;transform:translateY(-6px);box-shadow:0 0 0 2px #d9a85a,0 14px 30px rgba(0,0,0,.5),inset 0 0 0 1px rgba(120,80,40,.25)}',
      '.ac-ychudcard.ac-cur::before{content:"";position:absolute;left:50%;top:-9px;transform:translateX(-50%);border:6px solid transparent;border-bottom:7px solid #d9a85a;border-top:0}',
      '.ac-ychudname{font-size:var(--font-size-sm);white-space:nowrap}',
      '.ac-ychudcard.ac-me .ac-ychudname{font-weight:700}',
      '.ac-ychudname small{font-size:var(--font-size-4xs);color:#8a7050;letter-spacing:.08em;margin-left:3px}',
      '.ac-ychudscore{font-size:var(--font-size-xl);font-variant-numeric:tabular-nums;line-height:1.1}',
      '.ac-ychudsub{margin-top:4px;padding-top:4px;border-top:1px dashed rgba(80,55,30,.35);font-size:var(--font-size-xs);color:#8a5a1a;white-space:nowrap}',
      '.ac-ychudsub i{display:inline-block;width:1px;height:10px;background:rgba(80,55,30,.4);vertical-align:middle;margin:0 4px}',
      /* 카드의 얼굴과 말풍선(MDD). 얼굴은 카드 왼쪽 위 도형, 말풍선은 카드 위 종이쪽 */
      '.ac-ychudcard.ac-cast{padding-left:66px;min-width:190px}',
      '.ac-ychudface{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:44px;height:44px}',
      '.ac-ychudface svg{width:44px;height:44px;display:block}',
      '.ac-ychudbubble{position:absolute;left:8px;bottom:calc(100% + 12px);max-width:260px;padding:7px 12px;border-radius:10px;background:linear-gradient(180deg,rgba(250,240,222,.97),rgba(236,222,196,.97));color:#3a2a18;font-size:var(--font-size-sm);line-height:1.35;white-space:nowrap;box-shadow:0 8px 20px rgba(0,0,0,.4);z-index:2}',
      '.ac-ychudbubble::after{content:"";position:absolute;left:20px;top:100%;border:7px solid transparent;border-top-color:rgba(238,225,200,.97);border-bottom:0}',
      /* 끝의 의식. 카드 순위 배지, 승자 카드 금빛, 결과창 내역 줄 */
      '.ac-ychudrank{position:absolute;right:10px;top:-10px;padding:2px 8px;border-radius:var(--radius-pill);background:#5c4630;color:#f7e9cf;font-size:var(--font-size-4xs);letter-spacing:.08em}',
      '.ac-ychudrank.ac-first{background:linear-gradient(180deg,#e6bd7a,#b8781a);color:#2a1a08}',
      '.ac-ychudcard.ac-winner{opacity:1;box-shadow:0 0 0 2px #e6bd7a,0 0 24px rgba(230,189,122,.45),0 14px 30px rgba(0,0,0,.5)}',
      '.ac-ycresult{display:flex;flex-direction:column;gap:4px;min-width:320px;max-width:440px;margin-top:8px;padding:10px 14px;border-radius:var(--radius-sm);background:linear-gradient(180deg,rgba(250,240,222,.96),rgba(236,222,196,.96));color:#3a2a18;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;box-shadow:0 18px 40px rgba(0,0,0,.5)}',
      '.ac-ycresrow{display:grid;grid-template-columns:44px 1fr auto;column-gap:10px;align-items:baseline;padding:4px 2px;border-bottom:1px solid rgba(120,80,40,.18)}',
      '.ac-ycresrow:last-child{border-bottom:0}',
      '.ac-ycresrow b{font-size:var(--font-size-xs);color:#8a5a1a}',
      '.ac-ycresrow.ac-win b{color:#b8781a}',
      '.ac-ycresrow span{font-size:var(--font-size-md)}',
      '.ac-ycresrow.ac-me span{font-weight:700}',
      '.ac-ycresrow em{font-style:normal;font-size:var(--font-size-lg);font-variant-numeric:tabular-nums}',
      '.ac-ycresrow small{grid-column:2/4;font-size:var(--font-size-xs);color:#6b5236}',
      '.ac-ycresrow small i{display:inline-block;width:1px;height:9px;background:rgba(80,55,30,.4);margin:0 6px;vertical-align:middle}',
      '.ac-yctable thead th[data-win]::after{content:"\\2605";font-size:var(--font-size-4xs);margin-left:4px;color:#b8781a}',
      '.ac-ycpaperin{width:min(440px,92%);max-height:92%;overflow:auto;padding:16px 18px 18px;border-radius:var(--radius-sm);background:linear-gradient(172deg,#f7efdc 0%,#efe4cb 70%,#e6d8ba 100%);box-shadow:0 24px 60px rgba(0,0,0,.6),inset 0 0 0 1px rgba(120,80,40,.22);color:#3a2a18;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;transform:rotate(-.6deg)}',
      '.ac-ychead{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
      '.ac-ychead .ac-ycdice{display:flex;gap:6px;--ac-die:30px}',
      '.ac-ychead .ac-ycdice .ac-die{width:30px;height:30px;padding:4px;background:#fbf6ea;border:1px solid rgba(60,40,20,.35);border-radius:var(--radius-md);box-shadow:none;cursor:default}',
      '.ac-ychead .ac-ycdice .ac-die.ac-keep{outline:2px solid #b8781a;outline-offset:1px}',
      '.ac-ychead .ac-ycdice .ac-die i.ac-on{background:#17120f}',
      '.ac-ychead .ac-ycleft{flex:1;font-size:var(--font-size-sm);color:#6b5236;letter-spacing:.04em}',
      '.ac-ycclose{width:30px;height:30px;border:0;border-radius:50%;background:rgba(80,55,30,.1);color:#5c4630;font-size:var(--font-size-lg);line-height:30px;cursor:pointer}',
      '.ac-ycclose:hover{background:rgba(80,55,30,.2)}',
      '.ac-yctable{width:100%;border-collapse:collapse;font-size:var(--font-size-sm)}',
      '.ac-yctable th,.ac-yctable td{padding:4px 6px;border-bottom:1px solid rgba(80,55,30,.22);text-align:center;font-weight:400}',
      '.ac-yctable tbody th{text-align:left;padding-left:2px;color:#4a3826}',
      '.ac-yctable thead th{font-weight:600;color:#3a2a18;border-bottom:2px solid rgba(80,55,30,.5)}',
      '.ac-yctable thead th.ac-me{text-decoration:underline;text-underline-offset:3px}',
      '.ac-yctable thead th[data-turn]::after{content:"\\25C0";font-size:var(--font-size-4xs);margin-left:4px;color:#b8781a}',
      '.ac-yctable td{font-variant-numeric:tabular-nums;font-size:var(--font-size-md)}',
      '.ac-yctable .ac-ycdone{color:#2f2a2a;font-weight:600}',
      '.ac-yctable .ac-yctot th,.ac-yctable .ac-yctot td{background:rgba(80,55,30,.06);color:#5c4630;font-size:var(--font-size-xs)}',
      '.ac-yctable .ac-ycsum th,.ac-yctable .ac-ycsum td{font-weight:700;color:#3a2a18;font-size:var(--font-size-md);border-bottom:0}',
      '.ac-yccell{width:100%;min-height:30px;border:1px dashed rgba(184,120,26,.7);border-radius:var(--radius-sm);background:rgba(245,213,138,.28);color:#8a5a1a;font:inherit;font-weight:700;font-variant-numeric:tabular-nums;cursor:pointer;transition:background .12s,transform .12s}',
      '.ac-yccell:hover{background:rgba(245,213,138,.7);transform:scale(1.04)}',
      '.ac-yccell.ac-zero{color:#9a8a72;border-color:rgba(120,100,70,.4);background:none}',
      '.ac-yccell.ac-zero:hover{background:rgba(120,100,70,.12)}',
      /**
       * 결과창. 셸의 카드가 아니라 **종이 한 장**. 어두운 방에 등불처럼
       * 글꼴은 명조. 방이 명조를 부른다(레퍼런스 결과창도 붓글씨 계열)
       */
      '#acPlay.ac-bare:has(.ac-t3room) .ac-over{background:radial-gradient(ellipse at 50% 45%,rgba(40,28,16,.55),rgba(10,7,4,.82) 75%);backdrop-filter:blur(3px);border-radius:0;gap:14px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overhead{font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-size:clamp(28px,4vw,44px);font-weight:600;color:#f7e9cf;letter-spacing:.06em;text-shadow:0 2px 18px rgba(0,0,0,.7)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overlist{min-width:260px;max-width:360px;padding:14px;border-radius:6px;background:linear-gradient(180deg,rgba(250,240,222,.96),rgba(236,222,196,.96));box-shadow:0 18px 40px rgba(0,0,0,.5),inset 0 0 0 1px rgba(120,80,40,.25)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overrow{background:none;border-bottom:1px solid rgba(120,80,40,.18);border-radius:0;color:#3a2a18;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-size:var(--font-size-md);padding:8px 6px}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overrow:last-child{border-bottom:0}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overrow.ac-me{outline:0;background:rgba(190,120,50,.14)}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overrank{color:#8f5a2a}',
      '#acPlay.ac-bare:has(.ac-t3room) .ac-overnote{color:#e8d8bd;font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif}',
      /* 상태 알림(차례, 금수, 판 수)도 같은 종이 톤 */
      '#acPlay.ac-bare:has(.ac-t3room) #acStatus{font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;letter-spacing:.04em}',
      /* CPU 렌더링 경고. 판 위에 한 줄. 글자와 단추 하나 */
      '.ac-t3warn{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:8px 14px;margin:0 0 8px;border-radius:var(--radius-xl);background:rgba(200,120,40,.16);border:1px solid rgba(200,120,40,.5);font-size:var(--font-size-sm)}',
      '.ac-t3.ac-t3room::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 78% 72% at 50% 48%,transparent 50%,rgba(8,5,3,.55) 100%)}',
      /* 밤 책상은 등불 밖이 곧 밤. 가장자리를 훨씬 어둡게 */
      '.ac-t3.ac-t3room.ac-scene-desk::after{background:radial-gradient(ellipse 72% 66% at 50% 46%,transparent 45%,rgba(4,2,1,.6) 100%)}',
      '.ac-t3.ac-t3room.ac-scene-study::after{background:radial-gradient(ellipse 80% 74% at 48% 50%,transparent 50%,rgba(20,10,4,.6) 100%)}',
      /* 거실은 낮. 가장자리를 살짝만 */
      '.ac-t3.ac-t3room.ac-scene-living::after{background:radial-gradient(ellipse 84% 78% at 50% 50%,transparent 58%,rgba(30,22,14,.38) 100%)}',
      /* 방은 정사각이 아니다. 무대 폭을 다 쓰고 세로는 화면에 맞춘다. 카메라가 세로 화각을 지키므로 옆이 넓어지면 통과 다다미가 더 보인다(레퍼런스는 16:9) */
      '#acPlay.ac-bare .ac-stage:has(.ac-t3room){max-width:none;width:100%}',
      '.ac-t3.ac-t3room{aspect-ratio:auto;height:min(78vh,calc(100vh - 140px));max-width:none}',
      /* 화점. **자리는 판이 정한다**. 여기 칸 번호를 박으면 칸 수가 다른 판에 엉뚱한 점이
         찍힌다(9칸 번호가 15칸 판에 그대로 찍혀 있었다. 2026-08-29 실측).
         2D 오목판은 화면이 `ac-star` 를 붙이고(`gomoku-view.ts`), 입체 판은 `three-board.ts` 가 그린다. */
      '.ac-c3::before{content:"";position:absolute;left:50%;top:50%;width:0;height:0}',
      '.ac-c3.ac-star::before{width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:rgba(92,61,24,.8)}',
      '.ac-seats{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:var(--space-lg) 0}',
      '.ac-seat{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--radius-pill);border:1px solid var(--border);background:var(--bg-secondary);font-size:var(--font-size-xs);font-weight:600}',
      '.ac-seat.ac-me{border-color:var(--accent);background:var(--accent-dim)}',
      '.ac-seat b{font-size:var(--font-size-md)}',
      '.ac-four{position:relative;max-width:100%;margin:var(--space-lg) auto}',
      '.ac-four .ac-col{position:absolute;top:0;bottom:0;width:calc(100%/var(--w));border:0;background:none;cursor:pointer;z-index:2;border-radius:var(--radius-lg)}',
      '.ac-four .ac-col:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 12%,transparent)}',
      '.ac-four .ac-col:disabled{cursor:default}',
      '.ac-four .ac-col:nth-child(1){left:0}.ac-four .ac-col:nth-child(2){left:calc(100%/var(--w)*1)}.ac-four .ac-col:nth-child(3){left:calc(100%/var(--w)*2)}.ac-four .ac-col:nth-child(4){left:calc(100%/var(--w)*3)}.ac-four .ac-col:nth-child(5){left:calc(100%/var(--w)*4)}.ac-four .ac-col:nth-child(6){left:calc(100%/var(--w)*5)}.ac-four .ac-col:nth-child(7){left:calc(100%/var(--w)*6)}',
      '.ac-fgrid{display:grid;grid-template-columns:repeat(var(--w),1fr);gap:4px}',
      '.ac-disc{aspect-ratio:1;border-radius:50%;background:var(--bg-primary);border:1px solid var(--border)}',
      '.ac-disc.ac-p1{background:#ef4444;border-color:#ef4444}',
      '.ac-disc.ac-p2{background:#eab308;border-color:#eab308}',
      '.ac-disc.ac-last{box-shadow:0 0 0 2px var(--accent)}',
      '.ac-four.ac-waiting{opacity:.75}',
      /* 열여섯 장이 **한눈에** 들어와야 하는 판이다. 폭 상한이 없으면 무대가 넓어질수록
         카드가 커져 세로로 화면을 뚫는다(실측: 4행 900px+). */
      '.ac-mem{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:min(100%,calc(58vh * .75));margin:var(--space-lg) auto}',
      '.ac-mem.ac-waiting{opacity:.75}',
      /* 격자에 맞춰 늘어나는 종이. 여기서는 칸이 폭을 정한다(고정 치수를 덮는다). */
      '.ac-root .ac-mem .ac-pc{width:100%;height:auto;aspect-ratio:3/4}',
      '.ac-root .ac-mem .ac-pc .ac-pcm{font-size:min(7vw,30px)}',
      /* 짝지어 걷어낸 것. 자리는 남기되 물러난다. */
      '.ac-root .ac-mem .ac-pc.ac-gone{opacity:.32;box-shadow:none}',
      '.ac-hb{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-hblist{list-style:none;padding:0;margin:0 0 10px;max-height:230px;overflow:auto;display:flex;flex-direction:column;gap:4px}',
      '.ac-hblist li{display:flex;justify-content:space-between;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-lg);font-variant-numeric:tabular-nums}',
      '.ac-hblist b{letter-spacing:.2em;font-size:var(--font-size-md)}',
      '.ac-hblist span{color:var(--text-secondary);font-size:var(--font-size-xs)}',
      '.ac-hbrow{display:flex;gap:6px}',
      '.ac-hbrow input{flex:1;min-width:0;letter-spacing:.3em;text-align:center;font-size:var(--font-size-lg)}',
      '.ac-rv{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px;max-width:100%;margin:var(--space-lg) auto;aspect-ratio:1;background:var(--border);padding:2px;border-radius:var(--radius-md)}',
      '.ac-rv.ac-waiting{opacity:.8}',
      '.ac-rvcell{aspect-ratio:1;border:0;background:color-mix(in srgb,var(--accent) 8%,var(--bg-primary));padding:0;display:grid;place-items:center;cursor:default}',
      '.ac-rvcell i{width:74%;aspect-ratio:1;border-radius:50%;display:block}',
      '.ac-rvcell.ac-p1 i{background:#111827;box-shadow:inset 0 0 0 1px #374151}',
      '.ac-rvcell.ac-p2 i{background:#f9fafb;box-shadow:inset 0 0 0 1px #d1d5db}',
      '.ac-rvcell.ac-can{cursor:pointer}',
      '.ac-rvcell.ac-can i{width:26%;background:var(--accent);opacity:.55}',
      '.ac-rvcell.ac-last{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-dots{display:grid;gap:0;margin:var(--space-lg) auto;max-width:100%;grid-template-columns:repeat(calc(var(--c)*2+1),auto);justify-content:center}',
      '.ac-dots{grid-auto-rows:auto}',
      '.ac-dot{width:9px;height:9px;border-radius:50%;background:var(--text-secondary);align-self:center;justify-self:center}',
      '.ac-h{width:56px;height:14px;border:0;background:none;padding:0;cursor:pointer;align-self:center;position:relative}',
      '.ac-v{width:14px;height:56px;border:0;background:none;padding:0;cursor:pointer;justify-self:center;position:relative}',
      '.ac-h::after{content:"";position:absolute;left:2px;right:2px;top:6px;height:2px;background:var(--border);border-radius:var(--radius-sm)}',
      '.ac-v::after{content:"";position:absolute;top:2px;bottom:2px;left:6px;width:2px;background:var(--border);border-radius:var(--radius-sm)}',
      '.ac-h.ac-on::after,.ac-v.ac-on::after{background:var(--text-primary)}',
      '.ac-h.ac-last::after,.ac-v.ac-last::after{background:var(--accent)}',
      '.ac-h:disabled,.ac-v:disabled{cursor:default}',
      '.ac-box{align-self:stretch;justify-self:stretch;margin:1px;border-radius:var(--radius-sm)}',
      '.ac-box.ac-p1{background:color-mix(in srgb,#ef4444 40%,transparent)}',
      '.ac-box.ac-p2{background:color-mix(in srgb,#3b82f6 40%,transparent)}',
      '.ac-box.ac-p3{background:color-mix(in srgb,#22c55e 40%,transparent)}',
      '.ac-box.ac-p4{background:color-mix(in srgb,#eab308 40%,transparent)}',
      '.ac-dots.ac-waiting{opacity:.8}',
      /* 스피드도 펠트 위. 가운데 두 자리는 크게, 남의 패는 작게 겹쳐. */
      '.ac-root .ac-sp{max-width:100%;margin:var(--space-lg) auto;text-align:center;background:var(--ac-felt);border-radius:18px;padding:var(--space-lg) var(--space-md);box-shadow:inset 0 6px 18px rgba(0,0,0,.34);color:#eaf2ee}',
      '.ac-root .ac-spfoe{display:flex;gap:0;justify-content:center;align-items:center;--ac-card-w:34px;--ac-card-h:48px;--ac-card-r:5px}',
      '.ac-root .ac-spfoe .ac-pc{margin-left:-18px}',
      '.ac-root .ac-spfoe .ac-pc:first-child{margin-left:0}',
      '.ac-root .ac-spfoe b{margin-left:10px;font-size:var(--font-size-sm)}',
      '.ac-root .ac-sphand{display:flex;gap:0;justify-content:center;flex-wrap:wrap;padding-top:12px}',
      '.ac-root .ac-sphand .ac-pc{margin-left:calc(var(--ac-card-w) / -6)}',
      '.ac-root .ac-sphand .ac-pc:first-child{margin-left:0}',
      '.ac-sp{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-spfoe{color:var(--text-secondary);font-size:var(--font-size-sm);letter-spacing:2px;min-height:1.4em}',
      '.ac-spcenter{display:flex;gap:14px;justify-content:center;margin:var(--space-lg) 0}',
      '.ac-spc{width:64px;height:88px;border-radius:var(--radius-xl);border:2px solid var(--border);background:var(--bg-primary);color:inherit;font-size:26px;font-weight:700;cursor:default}',
      '.ac-spc.ac-can{border-color:var(--accent);cursor:pointer}',
      '.ac-sphand{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-spcard{width:52px;height:72px;border-radius:var(--radius-lg);border:1px solid var(--border);background:var(--bg-primary);color:var(--text-secondary);font-size:var(--font-size-title);font-weight:700;cursor:default;opacity:.5}',
      '.ac-spcard.ac-can{opacity:1;color:inherit;border-color:var(--accent);cursor:pointer}',
      '.ac-spcard.ac-pick{outline:2px solid var(--accent);outline-offset:2px}',
      '.ac-sl{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:4px;max-width:100%;margin:var(--space-lg) auto;aspect-ratio:1}',
      '.ac-slt{aspect-ratio:1;border-radius:var(--radius-lg);border:1px solid var(--border);background:var(--bg-primary);color:var(--text-secondary);font-size:min(6vw,22px);font-weight:700;padding:0;cursor:default}',
      '.ac-slt.ac-hole{border-color:transparent;background:none}',
      '.ac-slt.ac-home{color:var(--text-primary)}',
      '.ac-slt.ac-can{cursor:pointer;border-color:var(--accent);color:inherit}',
      '.ac-ut{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:100%;margin:var(--space-lg) auto;aspect-ratio:1}',
      '.ac-ut.ac-waiting{opacity:.8}',
      '.ac-utsmall{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;padding:3px;border:1px solid var(--border);border-radius:var(--radius-md)}',
      '.ac-utsmall.ac-open{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}',
      '.ac-utcell{aspect-ratio:1;border:0;background:color-mix(in srgb,var(--accent) 6%,var(--bg-primary));color:inherit;font-size:min(2.6vw,13px);line-height:1;padding:0;border-radius:var(--radius-sm);cursor:pointer}',
      '.ac-utcell:disabled{cursor:default}',
      '.ac-utcell.ac-last{outline:1px solid var(--accent)}',
      '.ac-utown{position:absolute;inset:0;display:grid;place-items:center;font-size:min(9vw,44px);pointer-events:none}',
      '.ac-utsmall.ac-took .ac-utcell{opacity:.25}',
      '.ac-yc{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-ycdice{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-ycd{width:52px;height:52px;font-size:34px;line-height:1;border-radius:var(--radius-xl);border:2px solid var(--border);background:var(--bg-primary);color:inherit;padding:0;cursor:pointer}',
      '.ac-ycd.ac-keep{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--bg-primary))}',
      '.ac-ycd:disabled{cursor:default;opacity:.7}',
      '.ac-ycbar{display:flex;gap:10px;align-items:center;justify-content:center;margin:var(--space-lg) 0;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-ycsheet{display:grid;grid-template-columns:repeat(2,1fr);gap:4px}',
      '.ac-yccat{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-primary);color:inherit;font-size:var(--font-size-xs);cursor:pointer}',
      '.ac-yccat b{font-variant-numeric:tabular-nums;font-size:var(--font-size-md)}',
      '.ac-yccat.ac-zero{opacity:.5}',
      '.ac-yccat.ac-done{background:color-mix(in srgb,var(--accent) 10%,var(--bg-primary));border-color:var(--accent);cursor:default}',
      '.ac-yccat:disabled{cursor:default}',
      '.ac-yctotal{grid-column:1/-1;margin-top:6px;font-weight:700}',
      '.ac-ck{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;max-width:100%;margin:var(--space-lg) auto;aspect-ratio:1;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden}',
      '.ac-ck.ac-waiting{opacity:.8}',
      '.ac-ckc{aspect-ratio:1;border:0;padding:0;background:color-mix(in srgb,var(--accent) 5%,var(--bg-primary));display:grid;place-items:center;cursor:default}',
      '.ac-ckc.ac-dark{background:color-mix(in srgb,var(--accent) 16%,var(--bg-primary))}',
      '.ac-ckc.ac-pick{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-ckc.ac-can{cursor:pointer}',
      '.ac-ckc.ac-can:empty::after{content:"";width:24%;aspect-ratio:1;border-radius:50%;background:var(--accent);opacity:.68}',
      '.ac-ckc.ac-last{outline:1px dashed var(--accent);outline-offset:-3px}',
      '.ac-ckc:not(:disabled){cursor:pointer}',
      /* 블랙잭도 펠트 위. 카드 판은 한 방을 쓴다. */
      '.ac-root .ac-bj{max-width:100%;margin:var(--space-lg) auto;text-align:center;background:var(--ac-felt);border-radius:18px;padding:var(--space-lg) var(--space-md);box-shadow:inset 0 6px 18px rgba(0,0,0,.34);color:#eaf2ee}',
      '.ac-root .ac-bj small{color:rgba(234,242,238,.72)}',
      '.ac-root .ac-bjrow>div{gap:0}',
      '.ac-root .ac-bjrow .ac-pc{margin-left:calc(var(--ac-card-w) / -5)}',
      '.ac-root .ac-bjrow .ac-pc:first-child{margin-left:0}',
      '.ac-bjrow{margin:var(--space-lg) 0}',
      '.ac-bjrow small{display:block;color:var(--text-secondary);font-size:var(--font-size-xs);margin-bottom:6px}',
      '.ac-bjrow>div{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-bjc{width:44px;height:62px;border-radius:var(--radius-lg);border:1px solid var(--border);background:var(--bg-primary);display:grid;place-items:center;font-size:var(--font-size-title);font-weight:700}',
      '.ac-bjc.ac-back{background:color-mix(in srgb,var(--accent) 22%,var(--bg-primary));color:var(--text-secondary)}',
      '.ac-bjbar{display:flex;gap:8px;justify-content:center}',
      /* 카드 판은 **펠트 위**에서 논다. 판마다 다른 바닥을 쓰면 열여섯 판이 열여섯 방이 된다. */
      '.ac-root .ac-pr{max-width:100%;margin:var(--space-lg) auto;text-align:center;background:var(--ac-felt);border-radius:18px;padding:var(--space-lg) var(--space-md);box-shadow:inset 0 6px 18px rgba(0,0,0,.34);color:#eaf2ee}',
      '.ac-root .ac-pr small{color:rgba(234,242,238,.7)}',
      /* 바닥에 깔린 짝. 살짝 겹쳐 던져 놓은 모양(카드마다 tilt). */
      '.ac-prpile{min-height:104px;display:flex;gap:0;justify-content:center;align-items:center}',
      '.ac-prpile .ac-pc{margin-left:-22px}',
      '.ac-prpile .ac-pc:first-child{margin-left:0}',
      /* 내 손패. 겹쳐 쥔다. 낼 수 있는 것만 떠오른다(`.ac-can:hover`). */
      '.ac-prhand{display:flex;gap:0;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0;padding-top:12px}',
      /* 겹침은 카드 폭의 1/6 만. 절반을 겹치면 끗수가 가려져 무엇을 드는지 안 보인다(실측). */
      '.ac-prhand .ac-pc{margin-left:calc(var(--ac-card-w) / -6)}',
      '.ac-prhand .ac-pc:first-child{margin-left:0}',
      /* 손패의 몇 장은 카드 아래쪽에 작게. 가운데 큰 글자와 겹치면 둘 다 안 읽힌다. */
      '.ac-prhand .ac-pcm{font-size:30px;top:42%}',
      '.ac-prhand .ac-pcn{position:absolute;left:0;right:0;bottom:8px;font-size:var(--font-size-2xs);color:#7d776d}',
      '.ac-prc{position:relative;width:44px;height:62px;border-radius:var(--radius-lg);border:1px solid var(--border);background:var(--bg-primary);color:var(--text-secondary);display:inline-grid;place-items:center;font-size:var(--font-size-md);font-weight:700;padding:0}',
      '.ac-prc.ac-can{color:inherit;border-color:var(--accent);cursor:pointer}',
      '.ac-prc:disabled{opacity:.45;cursor:default}',
      '.ac-prc.ac-pick{outline:2px solid var(--accent);outline-offset:2px}',
      '.ac-prc i{position:absolute;right:3px;bottom:2px;font-size:var(--font-size-4xs);font-style:normal;color:var(--text-secondary)}',
      '.ac-prpick{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:var(--space-lg);min-height:1px}',
      '.ac-dmwrap{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-dmline{display:flex;gap:3px;overflow-x:auto;padding:8px 4px;min-height:52px;align-items:center;justify-content:flex-start;border:1px solid var(--border);border-radius:var(--radius-lg);color:var(--text-secondary)}',
      /* 타일. 상아 한 조각에 홈이 하나. 눈은 주사위와 같은 점 부품이라 제 배경을 버린다. */
      '.ac-root .ac-dm{display:inline-flex;flex-direction:column;align-items:center;gap:4px;padding:5px 4px;border-radius:var(--radius-md);' +
      'background:linear-gradient(160deg,#fffdf8,#e9e2d2);box-shadow:0 3px 6px rgba(84,56,22,.26),inset 0 -2px 4px rgba(140,124,98,.26)}',
      '.ac-root .ac-dm i{display:block;width:100%;height:2px;border-radius:var(--radius-sm);background:rgba(84,56,22,.26)}',
      '.ac-root .ac-dm .ac-die{--ac-die:24px;background:none;box-shadow:none;padding:0}',
      '.ac-dmhand{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      /* 못 내는 타일도 타일이다. 흐려지는 것은 눈(잉크)뿐. */
      '.ac-root .ac-dmt{padding:0;border:0;border-radius:var(--radius-lg);background:none;cursor:default}',
      '.ac-root .ac-dmt:disabled .ac-die i.ac-on{background:#8a8071}',
      '.ac-root .ac-dmt.ac-can{cursor:pointer}',
      '.ac-root .ac-dmt.ac-can:hover{transform:translateY(-4px)}',
      '.ac-root .ac-dmt.ac-pick .ac-dm{box-shadow:0 8px 14px rgba(84,56,22,.34),inset 0 0 0 2px #e8c15a}',
      '.ac-dmbar{display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap}',
      '.ac-cl{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-cl canvas{width:100%;display:block;border:1px solid var(--border);border-radius:var(--radius-lg);background:#eef4fb}',
      '.ac-clbar{display:flex;flex-direction:column;gap:8px;margin-top:var(--space-lg)}',
      '.ac-clbar label{display:flex;align-items:center;gap:8px;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-clbar label span{min-width:52px}',
      '.ac-clbar input[type=range]{flex:1}',
      '.ac-bw{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-bw canvas{width:100%;height:300px;display:block;border:1px solid var(--border);border-radius:var(--radius-lg);background:linear-gradient(#0f172a,#1e293b)}',
      '.ac-bwscore{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-bws{padding:4px 10px;border:1px solid var(--border);border-radius:var(--radius-pill);font-size:var(--font-size-xs)}',
      '.ac-bws.ac-me{border-color:var(--accent)}',
      '.ac-pl{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-pl canvas{width:100%;display:block;border-radius:var(--radius-lg)}',
      '.ac-dt{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      /* 과녁은 **동그라미**다. 폭만 늘어나면 타원이 되고 바깥 숫자가 화면 밖으로 밀린다. */
      '.ac-dt canvas{width:100%;max-width:min(100%,62vh);aspect-ratio:1;height:auto;display:block;margin:0 auto}',
      '.ac-dtleft{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-dts{padding:4px 10px;border:1px solid var(--border);border-radius:var(--radius-pill);font-size:var(--font-size-xs)}',
      '.ac-dts.ac-me{border-color:var(--accent)}',
      '.ac-ah{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-ah canvas{width:100%;display:block;border-radius:var(--radius-lg);touch-action:none;cursor:none}',
      '.ac-kind{margin:var(--space-xl) 0 10px;font-size:var(--font-size-md);color:var(--text-primary);font-weight:800;display:flex;align-items:center;gap:8px}',
      '.ac-kind i{font-style:normal;font-size:var(--font-size-2xs);font-weight:700;color:var(--accent);background:var(--accent-dim);border-radius:var(--radius-pill);padding:2px 8px}',
      /* 하이로우도 펠트 위. 맞았나 틀렸나는 **카드 테두리**로. 판을 물들이면 다음 장이 안 보인다. */
      '.ac-root .ac-hl{max-width:100%;margin:var(--space-lg) auto;text-align:center;background:var(--ac-felt);border-radius:18px;padding:var(--space-lg) var(--space-md);box-shadow:inset 0 6px 18px rgba(0,0,0,.34);color:#eaf2ee}',
      '.ac-root .ac-hlnext.ac-ok .ac-pc{box-shadow:var(--ac-card-sh),0 0 0 3px #6fd08a}',
      '.ac-root .ac-hlnext.ac-no .ac-pc{box-shadow:var(--ac-card-sh),0 0 0 3px #e2503c}',
      '.ac-root .ac-hlpot{color:#ffd66b}',
      '.ac-root .ac-hl .btn-primary{background:#ffd66b;background-image:none;color:#23201c;border-color:transparent;font-weight:900}',
      '.ac-root .ac-hl .btn-ghost{color:#eaf2ee;border-color:rgba(234,242,238,.4)}',
      '.ac-hl{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-hlcards{display:flex;gap:12px;justify-content:center}',
      '.ac-hlc{width:64px;height:90px;border-radius:var(--radius-xl);border:1px solid var(--border);background:var(--bg-primary);display:grid;place-items:center;font-size:30px;font-weight:700}',
      '.ac-hlnext{color:var(--text-secondary)}',
      '.ac-hlnext.ac-ok{border-color:#22c55e;color:inherit}',
      '.ac-hlnext.ac-no{border-color:#ef4444;color:inherit;opacity:.7}',
      '.ac-hlpot{margin:var(--space-lg) 0;font-size:var(--font-size-lg);font-weight:700}',
      '.ac-hlbar{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-hlleft{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-nim{display:flex;flex-direction:column;gap:12px;align-items:center;margin:var(--space-lg) auto}',
      '.ac-nimrow{display:flex;gap:7px}',
      '.ac-nims{width:22px;height:22px;border-radius:50%;border:1px solid var(--border);background:var(--bg-primary);padding:0;cursor:pointer}',
      '.ac-nims:disabled{cursor:default;opacity:.7}',
      '.ac-nims.ac-take{background:#ef4444;border-color:#ef4444}',
      '.ac-hb2{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-hbpiles{display:flex;gap:8px;justify-content:center}',
      '.ac-hbp{width:38px;height:52px;border:2px solid var(--border);border-radius:var(--radius-lg);display:grid;place-items:center;font-size:var(--font-size-lg);font-weight:700}',
      '.ac-hbmeta{margin:8px 0 var(--space-lg);font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-hbrow,.ac-hbmine{margin-bottom:var(--space-lg)}',
      '.ac-hbrow small,.ac-hbmine small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:4px}',
      /* 손패가 여럿 늘어서는 판이라 종이를 작게 쓴다. 종이 자체는 공용 부품(.ac-pc). */
      '.ac-hbrow>div,.ac-hbmine>div{display:flex;gap:5px;justify-content:center;--ac-card-w:44px;--ac-card-h:62px;--ac-card-r:6px}',
      '.ac-root .ac-hb2 .ac-pc .ac-pcm{font-size:var(--font-size-md)}',
      '.ac-hbact{display:flex;gap:6px;justify-content:center;min-height:32px;align-items:center}',
      '.ac-wc{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-wcchain{display:flex;gap:6px;align-items:center;justify-content:flex-start;overflow-x:auto;padding:8px;border:1px solid var(--border);border-radius:var(--radius-lg);min-height:42px;font-size:var(--font-size-md)}',
      '.ac-wcchain b{color:var(--text-secondary);font-weight:400}',
      '.ac-wclast{font-weight:700;color:var(--accent)}',
      '.ac-wcrow{display:flex;gap:6px;margin-top:var(--space-lg)}',
      '.ac-wcrow input{flex:1;min-width:0;text-align:center;font-size:var(--font-size-md)}',
      '.ac-wcwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-dts.ac-dead{opacity:.4;text-decoration:line-through}',
      '.ac-lu{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-luq{font-size:var(--font-size-lg);font-weight:700;min-height:2.4em;display:grid;place-items:center}',
      '.ac-lubig{font-size:44px;font-weight:800;margin:8px 0}',
      '.ac-lu input[type=range]{width:100%}',
      '.ac-lurow{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-lup{padding:8px 14px;border:1px solid var(--border);border-radius:var(--radius-pill);background:var(--bg-primary);color:inherit;cursor:pointer}',
      '.ac-luline{display:flex;flex-direction:column;gap:4px;align-items:center;margin:var(--space-lg) 0}',
      '.ac-luline span{padding:4px 12px;border:1px solid var(--border);border-radius:var(--radius-lg);font-size:var(--font-size-sm)}',
      '.ac-ms{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-msgrid{display:grid;grid-template-columns:repeat(var(--w),1fr);gap:2px}',
      '.ac-mc{aspect-ratio:1;border:1px solid var(--border);border-radius:var(--radius-sm);background:color-mix(in srgb,var(--accent) 14%,var(--bg-primary));font-size:min(3.6vw,15px);font-weight:700;padding:0;cursor:pointer;touch-action:none}',
      '.ac-mc.ac-open{background:var(--bg-primary);cursor:default}',
      '.ac-mc.ac-flag{color:#ef4444}',
      '.ac-msbar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-li{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-libid{font-size:var(--font-size-lg);font-weight:700;min-height:1.8em}',
      '.ac-lidice small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary);margin:8px 0 4px}',
      '.ac-lidice>div{display:flex;gap:6px;justify-content:center}',
      '.ac-lid{font-size:34px;line-height:1}',
      '.ac-liwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0}',
      '.ac-liopts{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-bottom:8px}',
      '.ac-liopt{padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-primary);color:inherit;cursor:pointer;font-size:var(--font-size-sm)}',
      '.ac-liopt:hover{border-color:var(--accent)}',
      '.ac-tw{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-twhead small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-twhead b{font-size:32px}',
      '.ac-twlog{max-height:160px;overflow:auto;margin:var(--space-lg) 0;display:flex;flex-direction:column;gap:3px}',
      '.ac-twl{padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius-md);font-size:var(--font-size-xs);text-align:left}',
      '.ac-twl.ac-no{opacity:.6}',
      '.ac-twqs{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-bottom:8px}',
      '.ac-twq,.ac-twg{padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-primary);color:inherit;cursor:pointer;font-size:var(--font-size-xs)}',
      '.ac-twg{border-style:dashed}',
      '.ac-twq:hover,.ac-twg:hover{border-color:var(--accent)}',
      '.ac-sn{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-sn canvas{width:100%;display:block;border-radius:var(--radius-lg);touch-action:none}',
      '.ac-os{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-os svg{width:100%;display:block}',
      '.ac-osl{stroke:var(--border);stroke-width:.09;cursor:pointer}',
      '.ac-osl.ac-near{stroke:var(--accent);stroke-width:.13}',
      '.ac-osl.ac-done{stroke:#22c55e;stroke-width:.14;cursor:default}',
      '.ac-osp{fill:var(--text-secondary)}',
      '.ac-osp.ac-at{fill:var(--accent)}',
      '.ac-osbar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-fi{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-fi canvas{width:100%;display:block;border-radius:var(--radius-lg)}',
      '.ac-fibtn{width:100%;margin-top:var(--space-lg);font-size:var(--font-size-md)}',
      '.ac-fibtn.ac-bite{animation:acBite .28s infinite alternate}',
      '@keyframes acBite{from{transform:scale(1)}to{transform:scale(1.04)}}',
      '.ac-fibag{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-lg) 0;min-height:1.4em;font-size:var(--font-size-xs)}',
      '.ac-fibag span{padding:3px 8px;border:1px solid var(--border);border-radius:var(--radius-pill)}',
      '.ac-fiwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-sg{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-sgboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px;aspect-ratio:1;margin:8px 0}',
      '.ac-sgc{aspect-ratio:1;border:1px solid var(--ac-wood-line);border-radius:var(--radius-sm);background:var(--ac-wood);display:grid;place-items:center;padding:0;color:inherit;cursor:pointer}',
      '.ac-sgc.ac-pick{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-sgc.ac-can{background:color-mix(in srgb,var(--accent) 26%,var(--bg-primary))}',
      '.ac-sgc.ac-last{border-color:var(--accent)}',
      '.ac-sghand{display:flex;gap:4px;justify-content:center;min-height:30px;flex-wrap:wrap}',
      '.ac-sgh{width:30px;height:34px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-primary);display:grid;place-items:center;color:inherit;padding:0;cursor:pointer}',
      '.ac-sgh.ac-pick{outline:2px solid var(--accent)}',
      '.ac-hf{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-hfrow{margin-bottom:var(--space-lg)}',
      '.ac-hfrow small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:4px}',
      '.ac-hfrow>div{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;min-height:52px}',
      '.ac-hfc{position:relative;width:34px;height:48px;border:2px solid var(--border);border-radius:var(--radius-md);background:var(--bg-primary);font-size:var(--font-size-sm);font-weight:700;padding:0;cursor:pointer}',
      '.ac-hfc:disabled{cursor:default;opacity:.55}',
      '.ac-hfc.ac-can{opacity:1;box-shadow:0 0 0 2px var(--accent)}',
      '.ac-hfc.ac-pick{outline:2px solid var(--accent);outline-offset:2px;opacity:1}',
      '.ac-hfc i{position:absolute;right:2px;bottom:1px;font-size:var(--font-size-4xs);font-style:normal;opacity:.7}',
      '.ac-hfbar{min-height:32px;display:flex;justify-content:center;align-items:center}',
      '.ac-hfwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-tk{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-tk canvas{width:100%;display:block;border-radius:var(--radius-lg)}',
      '.ac-mn{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-mnrow{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}',
      '.ac-mnp{aspect-ratio:1;border:1px solid var(--border);border-radius:50%;background:color-mix(in srgb,#a16207 16%,var(--bg-primary));color:inherit;font-size:var(--font-size-md);padding:0;cursor:pointer}',
      '.ac-mnp:disabled{cursor:default;opacity:.6}',
      '.ac-mnp.ac-land{box-shadow:0 0 0 2px var(--accent)}',
      '.ac-mnp.ac-last{border-color:var(--accent)}',
      '.ac-mnmid{display:flex;align-items:center;gap:8px;margin:8px 0}',
      '.ac-mnstore{flex:0 0 60px;text-align:center;padding:6px;border:1px solid var(--border);border-radius:var(--radius-xl)}',
      '.ac-mnstore small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-mnstore b{font-size:var(--font-size-lg)}',
      '.ac-mnhint{flex:1;font-size:var(--font-size-xs);color:var(--text-secondary);text-align:center}',
      '.ac-sh{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-shstage{display:flex;gap:10px;justify-content:center;min-height:96px;align-items:flex-end}',
      '.ac-shc{width:74px;height:86px;border:0;background:none;padding:0;cursor:pointer;position:relative;transition:transform .18s}',
      '.ac-shc::before{content:"";position:absolute;inset:0;border-radius:38px 38px var(--radius-lg) var(--radius-lg);background:linear-gradient(#b45309,#78350f)}',
      '.ac-shc.ac-move::before{transform:translateY(-6px)}',
      '.ac-shc.ac-pick::before{box-shadow:0 0 0 3px var(--accent)}',
      '.ac-shc span{position:absolute;left:50%;bottom:6px;width:22px;height:22px;margin-left:-11px;border-radius:50%;background:#facc15;opacity:0}',
      '.ac-shc.ac-ball span{opacity:1}',
      '.ac-shc.ac-ball::before{opacity:.25}',
      '.ac-shmsg{margin:var(--space-lg) 0;font-size:var(--font-size-md);font-weight:600;min-height:1.5em}',
      '.ac-shwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-fx{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-fxrole{font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:8px}',
      '.ac-fxboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;aspect-ratio:1;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden}',
      '.ac-fxc{aspect-ratio:1;border:0;padding:0;background:color-mix(in srgb,var(--accent) 5%,var(--bg-primary));display:grid;place-items:center;cursor:default}',
      '.ac-fxc.ac-dark{background:color-mix(in srgb,var(--accent) 18%,var(--bg-primary))}',
      '.ac-fxc.ac-pick{outline:2px solid var(--accent);outline-offset:-2px}',
      '.ac-fxc.ac-can{background:color-mix(in srgb,var(--accent) 40%,var(--bg-primary));cursor:pointer}',
      '.ac-fxc:not(:disabled){cursor:pointer}',
      '.ac-pg{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-pg canvas{width:100%;display:block;border-radius:var(--radius-lg);touch-action:none;cursor:none}',
      '.ac-db{max-width:100%;margin:var(--space-lg) auto}',
      '.ac-dbrow{display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:var(--font-size-xs)}',
      '.ac-dbrow.ac-mine .ac-dblane{box-shadow:inset 0 0 0 1px var(--accent)}',
      '.ac-dbrow.ac-won .ac-dblane{background:color-mix(in srgb,#22c55e 25%,var(--bg-primary))}',
      '.ac-dblane{position:relative;flex:1;height:20px;border-radius:var(--radius-xl);background:color-mix(in srgb,#a16207 12%,var(--bg-primary));overflow:hidden}',
      '.ac-dblane i{position:absolute;top:1px;font-style:normal;transition:left .2s linear}',
      '.ac-dbodds{min-width:34px;text-align:right;color:var(--text-secondary)}',
      '.ac-dbbar{margin:var(--space-lg) 0;text-align:center;min-height:40px}',
      '.ac-dbamt{display:flex;align-items:center;gap:8px;justify-content:center;font-size:var(--font-size-xs);margin-bottom:8px}',
      '.ac-dbpick{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}',
      '.ac-dbp{padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-primary);color:inherit;cursor:pointer;font-size:var(--font-size-xs)}',
      '.ac-dbp:hover{border-color:var(--accent)}',
      '.ac-dbwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-wk{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-wkgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:var(--space-lg) 0}',
      '.ac-wkh{aspect-ratio:1;border:2px solid var(--border);border-radius:50%;background:color-mix(in srgb,#78350f 22%,var(--bg-primary));font-size:min(9vw,34px);padding:0;cursor:pointer;display:grid;place-items:center}',
      '.ac-wkh.ac-up{border-color:#22c55e}',
      '.ac-wkh.ac-bad{border-color:#ef4444}',
      '.ac-wkh span{line-height:1}',
      '.ac-wkwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-tg{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-tgline{position:relative;height:34px;border-radius:17px;background:color-mix(in srgb,#a16207 18%,var(--bg-primary));margin:var(--space-lg) 0}',
      '.ac-tgline i{position:absolute;top:5px;width:24px;height:24px;margin-left:-12px;border-radius:50%;background:var(--accent);transition:left .12s}',
      '.ac-tgmsg{min-height:1.5em;font-size:var(--font-size-sm);color:var(--text-secondary)}',
      '.ac-tgmsg.ac-warn{color:#ef4444;font-weight:700}',
      '.ac-tgbtn{width:100%;margin-top:var(--space-lg);font-size:var(--font-size-lg);padding:14px}',
      '.ac-go{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-goscore{display:flex;gap:10px;justify-content:center;margin-bottom:8px;font-size:var(--font-size-sm)}',
      '.ac-gos b{font-size:var(--font-size-lg)}',
      '.ac-gos.ac-me{color:var(--accent)}',
      '.ac-goboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;aspect-ratio:1;background:color-mix(in srgb,#a16207 22%,var(--bg-primary));border-radius:var(--radius-md);padding:4px}',
      '.ac-goc{aspect-ratio:1;border:0;background:none;padding:0;display:grid;place-items:center;position:relative;cursor:default}',
      '.ac-goc::after{content:"";position:absolute;inset:0;background:linear-gradient(var(--border),var(--border)) center/100% 1px no-repeat,linear-gradient(var(--border),var(--border)) center/1px 100% no-repeat;opacity:.5}',
      '.ac-goc i{position:relative;z-index:1;width:82%;aspect-ratio:1;border-radius:50%;display:block}',
      '.ac-goc.ac-p1 i{background:#111827}',
      '.ac-goc.ac-p2 i{background:#f8fafc;box-shadow:inset 0 0 0 1px #94a3b8}',
      '.ac-goc.ac-can{cursor:pointer}',
      '.ac-goc.ac-can:hover i{background:color-mix(in srgb,var(--accent) 45%,transparent)}',
      '.ac-goc.ac-last i{box-shadow:0 0 0 2px var(--accent)}',
      '.ac-rp{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-rpfoe small{display:block;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-rplock{font-size:var(--font-size-sm)}',
      '.ac-rpvs{display:flex;gap:12px;justify-content:center;align-items:center;margin:var(--space-lg) 0;font-size:44px}',
      '.ac-rpvs i{font-size:var(--font-size-sm);font-style:normal;color:var(--text-secondary)}',
      '.ac-rphands{display:flex;gap:10px;justify-content:center}',
      '.ac-rph{width:70px;height:70px;font-size:34px;border:2px solid var(--border);border-radius:var(--radius-xl);background:var(--bg-primary);padding:0;cursor:pointer}',
      '.ac-rph.ac-lock{opacity:.3;cursor:default}',
      '.ac-rph.ac-pick{border-color:var(--accent)}',
      '.ac-rpwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-si{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-simsg{min-height:1.6em;font-size:var(--font-size-md);font-weight:600;margin-bottom:var(--space-lg)}',
      '.ac-sipads{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.ac-sip{aspect-ratio:1;border:0;border-radius:var(--radius-xl);opacity:.45;transition:opacity .08s,transform .08s;cursor:pointer}',
      '.ac-sip.ac-lit{opacity:1;transform:scale(1.04)}',
      '.ac-sip:disabled{cursor:default}',
      '.ac-sip:not(:disabled):active{opacity:1}',
      '.ac-sidots{display:flex;gap:4px;justify-content:center;margin:var(--space-lg) 0;flex-wrap:wrap}',
      '.ac-sidots i{width:7px;height:7px;border-radius:50%;background:var(--border)}',
      '.ac-sidots i.ac-on{background:var(--accent)}',
      '.ac-siwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-su{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-suboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0;aspect-ratio:1;border:2px solid var(--text-secondary);border-radius:var(--radius-sm);overflow:hidden}',
      '.ac-suc{aspect-ratio:1;border:1px solid var(--border);background:var(--bg-primary);color:var(--accent);font-size:min(6vw,22px);font-weight:600;padding:0;cursor:pointer}',
      '.ac-suc.ac-bl{border-left:2px solid var(--text-secondary)}',
      '.ac-suc.ac-bt{border-top:2px solid var(--text-secondary)}',
      '.ac-suc.ac-given{color:var(--text-primary);background:color-mix(in srgb,var(--accent) 8%,var(--bg-primary));cursor:default}',
      '.ac-suc.ac-pick{background:color-mix(in srgb,var(--accent) 22%,var(--bg-primary))}',
      '.ac-suc.ac-clash{color:#ef4444}',
      '.ac-supad{display:flex;gap:5px;justify-content:center;margin:var(--space-lg) 0;flex-wrap:wrap}',
      '.ac-sun{width:38px;height:38px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-primary);color:inherit;font-size:var(--font-size-md);cursor:pointer}',
      '.ac-sun:disabled{opacity:.45;cursor:default}',
      '.ac-suwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ac-th{max-width:100%;margin:0 auto;text-align:center}',
      '.ac-th canvas{width:100%;aspect-ratio:100/150;border-radius:var(--radius-lg);background:#3d3327}',
      '.ac-thscore{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:var(--space-md) 0}',
      '.ac-thscore i{display:inline-block;width:8px;height:8px;border-radius:50%}',
      '.ac-thscore .ac-now{outline:1px solid var(--accent)}',
      '.ac-au{max-width:100%;margin:0 auto;text-align:center}',
      '.ac-aulot{display:flex;flex-direction:column;gap:4px;margin:var(--space-lg) 0}',
      '.ac-aulot span{font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-aulot b{font-size:clamp(44px,14vw,76px);line-height:1;color:var(--accent)}',
      '.ac-aumsg{min-height:38px;font-size:var(--font-size-sm)}',
      '.ac-aubid{display:flex;flex-direction:column;gap:8px;align-items:center;margin:var(--space-lg) 0}',
      '.ac-aubid input[type=range]{width:100%}',
      '.ac-aunum{font-size:var(--font-size-lg);font-weight:700}',
      '.ac-auwho{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.ac-auwho i{font-style:normal;color:var(--accent)}',
      '.ac-jg{max-width:100%;margin:0 auto;text-align:center}',
      '.ac-jglanes{display:flex;gap:10px;justify-content:center;align-items:flex-end}',
      '.ac-jglane{position:relative;flex:1 1 0;max-width:100%;height:min(46vh,240px);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--bg-secondary);overflow:hidden}',
      '.ac-jglane.ac-me{border-color:var(--accent);border-width:2px}',
      '.ac-jglane.ac-dead{opacity:.35}',
      '.ac-jgband{position:absolute;left:0;right:0;bottom:0;background:var(--accent);opacity:.16}',
      '.ac-jgball{position:absolute;left:50%;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--accent)}',
      '.ac-jgtag{position:absolute;left:0;right:0;bottom:2px;font-size:var(--font-size-4xs);color:var(--text-secondary)}',
      '.ac-jgkick{width:min(100%,320px);margin:var(--space-lg) 0;padding:18px;font-size:var(--font-size-lg)}',
      '.ac-jgmsg{font-size:var(--font-size-xs);color:var(--text-secondary);min-height:18px}',
      '.ac-yu{max-width:100%;margin:0 auto;text-align:center}',
      '.ac-yuboard{position:relative;width:min(80vw,340px);aspect-ratio:1;margin:24px auto}',
      '.ac-yuboard::before,.ac-yuboard::after{content:"";position:absolute;inset:0;border:2px solid var(--border)}',
      '.ac-yuboard::after{border:0;background:linear-gradient(to bottom right,transparent calc(50% - 1px),var(--border) 50%,transparent calc(50% + 1px)),linear-gradient(to bottom left,transparent calc(50% - 1px),var(--border) 50%,transparent calc(50% + 1px))}',
      '.ac-yun{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid var(--border);background:var(--bg-primary);display:flex;align-items:center;justify-content:center;gap:1px}',
      '.ac-yun.ac-big{width:30px;height:30px;margin:-15px 0 0 -15px;border-color:var(--accent)}',
      '.ac-yun .ac-piece{width:16px;height:21px;margin:-4px}',
      '.ac-yun .ac-piece>span{font-size:var(--font-size-4xs)}',
      '.ac-yumsg{min-height:24px;font-size:var(--font-size-sm)}',
      '.ac-yuctl{display:flex;gap:8px;justify-content:center;margin:var(--space-md) 0}',
      '.ac-yuwho .ac-piece{vertical-align:-4px;margin-right:2px}',
      '.ac-yuwho .ac-now{outline:1px solid var(--accent)}',
      '.ac-today{margin:var(--space-md) 0}',
      '.ac-todaystrip{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      /* 오늘의 세 판 = 빨강 초대장. 로비에서 제일 먼저 눈이 가는 자리. */
      '.ac-todaycard{display:flex;align-items:center;gap:8px;padding:10px 16px;border:1px solid var(--border);border-radius:var(--radius-pill);background:var(--bg-primary);font-size:var(--font-size-sm);font-weight:700;color:inherit;cursor:pointer;box-shadow:0 1px 3px rgba(60,58,48,.1);transition:transform var(--transition-fast),box-shadow var(--transition-fast)}',
      '.ac-todaycard:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(0,0,0,.08)}',
      '.ac-todaycard span{font-size:24px}',
      '.ac-todaycard.ac-done{opacity:.5;border-color:var(--border);font-weight:400}',
      '.ac-tourbtn{align-self:center;width:auto;flex:0 0 auto;border-radius:var(--radius-pill);padding:10px 22px;font-weight:900}',
      '.ac-seat.ac-watch{border-color:var(--accent);color:var(--accent)}',
      '.ac-seat.ac-team0{border-color:#6aa9ff}',
      '.ac-seat.ac-team1{border-color:#ff7a7a}',
      '.ac-letter{margin-top:var(--space-md);padding:10px 12px;border:1px solid var(--accent);border-radius:var(--radius-xl);background:var(--bg-secondary);font-size:var(--font-size-sm)}',
      '.ac-room{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;border:1px solid var(--accent);border-radius:var(--radius-xl);background:var(--bg-secondary);margin:var(--space-md) 0;font-size:var(--font-size-sm)}',
      '.ac-over{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:color-mix(in srgb, var(--bg-primary) 88%, transparent);backdrop-filter:blur(2px);border-radius:var(--radius-xl);z-index:3;padding:var(--space-lg)}',
      '.ac-overhead{font-size:var(--font-size-lg);font-weight:700;text-align:center}',
      '.ac-overlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;min-width:200px;max-width:100%;width:100%}',
      '.ac-overrow{display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:var(--radius-lg);background:var(--bg-secondary);font-size:var(--font-size-sm)}',
      '.ac-overrow.ac-me{outline:1px solid var(--accent)}',
      '.ac-overrank{width:1.6em;text-align:center;font-weight:700;color:var(--text-secondary)}',
      '.ac-overname{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ac-overscore{font-variant-numeric:tabular-nums;font-weight:600}',
      '.ac-overnote{font-size:var(--font-size-sm);color:var(--text-secondary);text-align:center}',
      '.ac-find{width:100%;max-width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-pill);background:var(--bg-secondary);color:var(--text-primary);margin:var(--space-md) 0}',
      '.ac-openstrip{display:flex;gap:8px;flex-wrap:wrap;margin:var(--space-md) 0}',
      '.ac-opencard{display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--accent);border-radius:var(--radius-xl);background:var(--bg-secondary);font-size:var(--font-size-sm)}',
      '.ac-opencard span{font-size:var(--font-size-md)}',
      '.ac-best{font-size:var(--font-size-xs);color:var(--accent);align-self:flex-start}',
      '.ac-len{font-size:var(--font-size-xs);color:var(--text-secondary);border:1px solid var(--border);border-radius:var(--radius-pill);padding:1px 7px;align-self:flex-start}',
      '.ac-len.ac-short{color:var(--accent);border-color:var(--accent)}',
      '.ac-none{color:var(--text-secondary);font-size:var(--font-size-sm);margin:var(--space-lg) 0}',
      '.ac-streak{margin-left:8px;font-size:var(--font-size-xs);color:var(--accent)}',
      /* 봇 세기 = 이어붙은 세 칸 한 덩어리 (segmented control). */
      '.ac-level{display:flex;gap:0;align-items:center;flex-wrap:wrap;margin:var(--space-md) 0}',
      '.ac-level button{padding:6px 14px;font-size:var(--font-size-xs);font-weight:700;border:1px solid var(--border);background:var(--bg-secondary);cursor:pointer;margin-left:-1px}',
      '.ac-level button:first-child{border-radius:var(--radius-pill) 0 0 var(--radius-pill);margin-left:0}',
      '.ac-level button:nth-child(3){border-radius:0 var(--radius-pill) var(--radius-pill) 0}',
      '.ac-level button.ac-on{background:var(--accent);color:var(--accent-fg);border-color:var(--accent);position:relative;z-index:1}',
      '.ac-level small{color:var(--text-secondary);font-size:var(--font-size-3xs);margin-left:10px}',
      '.ac-intro{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:var(--bg-primary);text-align:center;padding:var(--space-lg)}',
      /* 판이 열리는 순간의 짠. 아이콘 하나만 튀어 오른다 (reduced-motion 이면 정지). */
      '.ac-introicon{font-size:56px;animation:acPop .45s cubic-bezier(.34,1.56,.64,1)}',
      '@keyframes acPop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}',
      '.ac-introname{font-size:var(--font-size-lg);font-weight:800}',
      '.ac-introdesc{font-size:var(--font-size-sm);color:var(--text-secondary);max-width:22em}',
      '.ac-introcount{font-size:clamp(48px,16vw,84px);font-weight:800;color:var(--accent);line-height:1}',
      /**
       * 방으로 들어가는 인트로. 어두운 방에 종이 한 장. 이모지 없음, 명조, 숫자는 작은 금색.
       * 셸의 보라와 이모지 팝은 그 방과 딴 세계다(사용자 지적)
       */
      '.ac-intro.ac-intro-room{background:radial-gradient(ellipse at 50% 40%,#3a2a18 0%,#1a120b 60%,#0d0906 100%);gap:14px}',
      '.ac-intro.ac-intro-room .ac-introicon{display:none}',
      /* 인트로 때는 아직 방이 안 섰다. 그래도 무대는 방과 같은 틀이어야 3초 뒤 화면이 안 출렁인다 */
      '#acPlay .ac-stage:has(.ac-intro-room:not([style*="none"])){max-width:none;width:100%;min-height:min(78vh,calc(100vh - 140px))}',
      '.ac-intro.ac-intro-room .ac-introname{font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-size:clamp(36px,5vw,56px);font-weight:600;color:#f7e9cf;letter-spacing:.18em;text-shadow:0 2px 20px rgba(0,0,0,.7)}',
      '.ac-intro.ac-intro-room .ac-introdesc{font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;color:#cdb896;font-size:var(--font-size-md);letter-spacing:.06em}',
      '.ac-intro.ac-intro-room .ac-introcount{font-family:"Noto Serif KR","Nanum Myeongjo","Yu Mincho",Georgia,serif;font-size:clamp(28px,4vw,40px);font-weight:400;color:#d9a85a;margin-top:10px}',
      '.ac-intro.ac-intro-room .ac-introskip{color:rgba(230,210,180,.5);font-size:var(--font-size-xs);letter-spacing:.1em}',
      /* 종이 밑에 가는 금줄 한 가닥. 세로 중앙의 이름 아래 */
      '.ac-intro.ac-intro-room .ac-introname::after{content:"";display:block;width:64px;height:1px;margin:14px auto 0;background:linear-gradient(90deg,transparent,#d9a85a,transparent)}',
      /**
       * **무대**. 51개 화면이 여기 안에서만 산다 (TASK-KL-314).
       *
       * 전에는 놀이마다 제 최대폭을 들고 있었다(300, 320, 340, 360, 380, 420 여섯 가지). 그래서
       * 판을 갈아탈 때마다 화면이 출렁였고, 대회로 다섯 판을 이으면 매 판 크기가 바뀌었다.
       * 크기를 정하는 자리는 **여기 하나**다.
       *
       * 비율은 안 박는다. 풀스크린이 요구인데 16:9 로 못 박으면 폰에서 위아래 검은 띠가 남고,
       * 정사각 판의 칸이 22px(손가락 최소권장의 절반)이 된다. 재 보고 정했다.
       * 대신 WM 웹판과 같은 원리를 쓴다: **화면을 다 쓰고 콘텐츠가 비율을 흡수한다.**
       */
      /* `place-items:center` 를 쓰면 안 된다. 자식이 shrink-to-fit 이 되어 `width:100%` 인 판이
         **폭 0 으로 무너진다**(실측: 오목 칸이 2px 이 됐다. 51종 화면검사는 떴다만 보므로
         초록이었다. 크기를 안 재는 검사는 이런 것을 못 잡는다). 세로만 가운데, 가로는 채운다. */
      '.ac-stage{position:relative;width:100%;max-width:var(--ac-stage);margin:0 auto;min-height:min(62vh,var(--ac-stage));display:grid;align-items:center;justify-items:stretch}',
      /**
       * ── 넓은 화면: 판을 키우고 곁을 옆에 세운다 (사용자 요구. 화면 전체, 반응형) ──
       *
       * 640px 상한은 폰 기준으로 정해진 수였다. 데스크톱에서는 판이 화면의 3분의 1만 쓰고
       * 나머지가 빈 벽이 된다(실측: 1920 화면에서 무대 640, 좌우 여백 각 640).
       * 눕힌 폰에 쓰던 2열 배치를 **넓은 화면 전체**로 올린다. 세로가 넉넉할 때만 걸어
       * 노트북 짧은 세로에서 판이 밀리는 일은 없게 한다.
       *
       * `--ac-stage` 는 여기서만 커진다: 세로 몫(72vh), 가로 몫(56vw), 상한(900px) 중 최솟값.
       * 곁줄(자리, 상태, 단추)은 오른쪽 한 칸에 세로로 쌓는다.
       */
      '@media (min-width:1000px) and (min-height:700px){',
      '  #acPlay{display:grid;grid-template-columns:minmax(0,1fr) minmax(210px,290px);grid-template-rows:auto auto 1fr auto;gap:var(--space-sm) var(--space-xl);align-items:start}',
      '  #acStage{grid-column:1;grid-row:1/5;--ac-stage:min(56vw,72vh);align-self:center}',
      /* 곁줄은 **한 장의 종이**로 묶는다. 넓은 화면에서 흩어 놓으면 허공에 뜬 글자가 된다. */
      '  #acSeats{grid-column:2;grid-row:1;flex-direction:column;align-items:stretch;gap:6px;justify-content:flex-start;margin:0;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-xl);padding:14px}',
      '  #acSeats .ac-seat{justify-content:flex-start;background:none;border:0;padding:2px 0}',
      '  #acSeats .ac-seat.ac-me{background:none;border:0;font-weight:900}',
      '  #acStatus{grid-column:2;grid-row:2;text-align:left;padding:0 14px}',
      '  .ac-controls{grid-column:2;grid-row:4;flex-wrap:wrap;align-self:end;margin:0}',
      '  .ac-letter{grid-column:2;grid-row:3;align-self:start}',
      '}',
      /* 아주 넓은 화면(와이드, 4K)은 세로가 먼저 동난다. 가로 몫을 더 열어 세로를 다 쓴다. */
      '@media (min-width:1600px) and (min-height:900px){',
      '  #acStage{--ac-stage:min(62vw,78vh)}',
      '}',
      /* 풀스크린이면 무대가 화면이 된다. 안에 있는 51개가 그대로 커진다. */
      /**
       * **폰을 눕히면 판을 옆으로 세운다** (TASK-KL-314).
       *
       * 세로로 쌓는 배치(자리줄 / 무대 / 상태 / 단추)는 화면이 누우면 무너진다. 세로가 390px 인데
       * 그걸 넷이 나눠 가지니 무대에 226px 밖에 안 남고 오목 칸이 23px 이 됐다(실측). 게다가
       * 단추가 22px 밀려 화면 밖으로 나갔다. 눕힌 화면에서 남는 것은 **가로**이므로 그쪽을 쓴다:
       * 왼쪽에 판, 오른쪽에 자리줄, 상태, 단추를 세로로 쌓는다.
       *
       * `max-height` 로 거는 이유: 가로다만으로 걸면 노트북(1280×900)도 가로라 걸린다.
       * 좁은 것은 방향이 아니라 **세로 길이**다.
       *
       * 세로 몫이 78vh 인 이유: 90 → 84 → 78 로 내려 보며 쟀다. 90, 84 에서는 판이 화면 밖으로
       * 37px, 14px 밀렸다. 무대만 보면 들어가는데 **셸 머리띠가 세로를 먼저 먹기** 때문이다.
       * 78vh 면 두 폰 모두 한 화면에 들어간다. 눕힌 채로도 오목 칸이 32px(세로일 때 38px)이라
       * 손가락이 닿는다. 고치기 전에는 23px 이었다.
       */
      '@media (orientation:landscape) and (max-height:560px){',
      '  #acPlay{display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,26vw);grid-template-rows:auto 1fr auto;gap:0 var(--space-md);align-items:center}',
      /* 눕힌 화면에서는 **무대가 곧 틀**이라 여백이 사치다. 무대 padding 48 + 판 바깥여백 48 이
         세로 96px 을 먹어 판이 화면 밖으로 밀렸다(실측). 둘 다 걷고 세로를 판에 준다. */
      '  #acStage{grid-column:1;grid-row:1/4;--ac-stage:min(62vw,78vh,640px);padding:0;min-height:0}',
      /* ★ **좁게 눕히면 셸 메뉴 띠가 판 몫을 먹는다** (2026-08-15 실측).
         폭이 좁아지면 메뉴가 상단 바에서 빠져나와 **바 아래 가로 띠**(`.mobile-nav`)가 된다:
           844 폭 → 메뉴가 바 안, 판 위 공간 76px  → 오목 칸 33px
           740 폭 → 띠가 따로 생김(55px), 판 위 공간 123px → 오목 칸 24px (손가락 최소 28px 미달)
         판을 줄이면 화면엔 들어가지만 칸이 눌리지 않고, 판을 키우면 화면 밖으로 밀린다 . 
         **둘 다 만족시킬 세로가 애초에 없다.** 모자란 31px 이 이 띠 안에 있다.
         그래서 **판이 도는 동안만** 접는다. 나가는 길(상단 바 52px)은 그대로 남고,
         판을 끝내면 곧바로 돌아온다. 세운 폰, 넓은 화면은 아무것도 안 바뀐다. */
      /* 셸이 이 띠를 display:flex 로 강제(!important) 박아 뒀다(css/shell-critical.css) . 
         같은 세기로 말해야 접힌다. 접는 조건이 좁고(눕힘+판 도는 중) 판이 끝나면 풀린다. */
      '  html.ac-playing .mobile-nav{display:none!important}',
      '  #acStage #acView>*{margin-top:0;margin-bottom:0}',
      '  #acSeats{grid-column:2;grid-row:1;justify-content:flex-start}',
      '  #acStatus{grid-column:2;grid-row:2}',
      '  .ac-controls{grid-column:2;grid-row:3;flex-wrap:wrap;margin-top:0}',
      '}',
      '.ac-stage:focus{outline:none}',
      /* 키로 짚고 있는 자리. 눌린 것과 구별되게 테두리만. */
      '.ac-key{outline:3px solid var(--accent);outline-offset:1px;border-radius:var(--radius-sm)}',
      '.ac-stage:fullscreen{max-width:none;width:100vw;height:100vh;min-height:0;background:var(--bg-primary);padding:var(--space-lg)}',
      /* 풀스크린은 판이 화면이다. 통 자리(6% 여백)를 반으로 줄이고 세로를 다 쓴다(실측: 1280x900 에서 칸 38 -> 54px) */
      '.ac-stage:fullscreen{--ac-goban-cap:96vh}',
      '.ac-stage:fullscreen .ac-goban{padding:3%}',
      /* 방 표현은 풀스크린에서 **화면이 곧 방**이다. 정사각을 버리고 화면 비율을 그대로 쓴다(카메라가 세로 화각을 지키므로 옆으로 넓어지면 통과 다다미가 더 보인다) */
      '.ac-stage:fullscreen:has(.ac-t3room){padding:0}',
      '.ac-stage:fullscreen #acView:has(.ac-t3room){max-width:none;height:100vh}',
      '.ac-stage:fullscreen #acView:has(.ac-t3room)>*{margin:0}',
      '.ac-stage:fullscreen .ac-t3.ac-t3room{height:100vh}',
      '.ac-stage:fullscreen #acView{width:100%;max-width:min(92vmin,100%);margin:0 auto}',
      /* 풀스크린이면 단추 줄이 무대 **안으로 들어온다**. 아래 § 참고. 판 위에 뜨되 가리지 않게. */
      '.ac-stage:fullscreen .ac-controls{position:absolute;left:0;right:0;bottom:var(--space-lg);justify-content:center;margin:0;z-index:4}',
      '.ac-fl{max-width:100%;margin:0 auto}',
      '.ac-flmsg{text-align:center;font-size:var(--font-size-sm);min-height:22px}',
      '.ac-flgrids{display:flex;flex-wrap:wrap;gap:var(--space-lg);justify-content:center}',
      '.ac-flone{flex:0 0 auto}',
      '.ac-flone.ac-dead{opacity:.45}',
      '.ac-flname{font-size:var(--font-size-xs);text-align:center;margin-bottom:4px}',
      '.ac-flone.ac-me .ac-flname{color:var(--accent)}',
      '.ac-flboard{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:1px;width:min(46vw,220px)}',
      '.ac-flc{aspect-ratio:1;padding:0;border:1px solid var(--border);background:var(--bg-secondary);border-radius:var(--radius-sm)}',
      '.ac-flc.ac-ship{background:var(--text-secondary)}',
      '.ac-flc.ac-miss{background:var(--bg-tertiary);opacity:.6}',
      '.ac-flc.ac-hit{background:#ef4444}',
      '.ac-flc.ac-lastshot{outline:2px solid var(--accent)}',
      '.ac-nu{max-width:100%;margin:var(--space-lg) auto;text-align:center}',
      '.ac-nunum{font-size:clamp(60px,20vw,110px);font-weight:800;line-height:1}',
      '.ac-nubtn{width:100%;margin:var(--space-lg) 0;font-size:var(--font-size-lg);padding:16px}',
      '.ac-nulog{min-height:70px;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-nul{padding:2px 0}',
      '.ac-nul.ac-clash{color:#ef4444}',
      '.ac-nuwho{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:var(--space-lg)}',
      '.ac-code{font-size:clamp(28px,8vw,48px);font-weight:800;letter-spacing:.18em;text-align:center;margin:var(--space-lg) 0}',
      '.ac-share{display:flex;gap:6px;margin:var(--space-lg) 0}',
      '.ac-share input{flex:1;min-width:0}',
      /* 혼자 놀이 카드 (TASK-KL-313). 방 게임과 같은 틀을 쓰되 **링크**라 밑줄을 지운다. */
      /* 생김새는 방 게임 카드와 같게. 세는 이름만 다르다. */
      /* 혼자 놀이 = 같은 진열장의 물건. 링크라는 것만 다르다. */
      '.ac-solocard{display:flex;flex-direction:column;align-items:center;background:none;border:0;padding:0;color:inherit;text-decoration:none;transition:transform var(--transition-fast)}',
      '.ac-solocard:hover{transform:translateY(-3px)}',
      '.ac-solocard:hover .ac-objname{color:#3c3a30}',
      '.ac-solocourse{margin:0 0 6px;font-size:var(--font-size-xs);color:var(--text-secondary)}',
      '.ac-packrow{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:var(--space-lg)}'
    ].join('\n');
    document.head.appendChild(el);
  }

  /** 방 이름. 짧고, 헷갈리는 글자(0/O, 1/I)는 뺀다. */

  function draw(container: HTMLElement): void {
    injectStyles();
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
      '<div class="ac-overacts" id="acOverActs"></div>' +
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
      /* 방의 버튼은 하나(메뉴). 나머지는 메뉴 종이 안에 줄로. 레퍼런스(오목 가자) 실측: 대국 중 우상단 버튼은 일시정지 하나 */
      '<button class="ac-menubtn" id="acMenu" aria-expanded="false" title="' + esc(t('arcade.btn.menu')) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
      '<div class="ac-controls" id="acControls" style="display:flex;gap:6px;margin-top:var(--space-lg)">' +
      /* 무르기. 혼자 노는 판(봇 상대)에서만. 남과 두는 판은 합의가 필요해 아직 없다 */
      '<button class="btn btn-ghost" id="acUndo" style="display:none">' + esc(t('arcade.btn.undo')) + '</button>' +
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
      '<i class="ac-sep"></i>' +
      /* MDD 는 확장. 끄면 이름 있는 봇, 얼굴과 말풍선과 컷인 없음. 지금은 켬이 기본(개발 편의), 출시 기본은 끔 */
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
      play.style.setProperty('--ac-roomfill-y', `${Math.round(head?.bottom ?? 0)}px`);
      play.style.setProperty('--ac-roomfill-x', `${Math.round(main?.left ?? 0)}px`);
    };
    const fill = (on: boolean): void => {
      if (on) fillVars();
      play.classList.toggle('ac-roomfill', on);
    };
    window.addEventListener('resize', () => {
      if (play.classList.contains('ac-roomfill')) fillVars();
    });

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
        '</div>' +
        '<div class="ac-more">' + more + '</div>' +
        '</div></div>';
      $<HTMLElement>('#acShelfAll').style.display = 'none';
      d.style.display = '';
      wireCards();
      wireSetup(g.id);
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
      on('data-pickfind', 'pickfind', (id) => openRoom(id, true));
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
            '<button class="ac-opencard" data-join="' + esc(r.code) + '">' +
            '<span>' + iconOf(r.game) + '</span>' +
            esc(t('arcade.open.card', {
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
    /** 방금 끝난 판을 되살릴 재료 (TASK-KL-264 다시 보기). */
    let lastSeed = 0;
    let lastSeats: SeatSpec[] = [];
    /* 봇의 손버릇, 세기까지 같아야 같은 판이 나온다. 뜸 들이는 시간이 곧 수의 시각이다. */
    let lastPersonas: Record<number, BotPersona> = {};
    let lastLevel: BotLevel = 'normal';
    /** 판을 만든 규칙 정의 그대로(봇 세기, 고스트까지). 복기와 곁가지는 이걸로 다시 굴려야 같은 판(2026-08-30 실측: 고스트를 빼고 굴려 딴 판이 됐다) */
    let lastDef: GameDef<unknown, unknown> | null = null;
    /** 이 판을 시작할 때의 내 최고 기록. 결과에 어제 N으로 적는다. */
    let lastBest: number | null = null;
    let tape: Tape<unknown> | null = null;
    /** 편을 갈랐으면 자리→편 표. 개인전이면 null. */
    let plan: Plan | null = null;
    /** 지금 화면에 도는 것이 **다시 보기**인가. 그렇다면 손이 안 먹는다. */
    let replaying = false;
    /** 되살리는 중 아직 안 넣은 수의 자리 */
    let tapeAt = 0;
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
      timer: number;
      branch: boolean;
    } | null = null;
    let render: Render<unknown> | null = null;
    let net: Net | null = null;
    /** MDD 켜짐. 사람이 고른 것이 브라우저에 남는다. 기본 켬(개발 편의, 사용자 결정 2026-08-30) */
    function mddOn(): boolean {
      try {
        return localStorage.getItem('karmolab.arcade.mdd') !== 'off';
      } catch {
        return true;
      }
    }
    function paintMdd(): void {
      const b = container.querySelector<HTMLButtonElement>('#acMdd');
      if (b) b.setAttribute('aria-pressed', mddOn() ? 'true' : 'false');
      const em = container.querySelector<HTMLButtonElement>('#acEmote');
      if (em && !mddOn()) em.style.display = 'none';
      if (!mddOn()) {
        bubbles.clear();
        $<HTMLElement>('#acEmotes').hidden = true;
        $<HTMLElement>('#acCutin').hidden = true;
      }
    }
    /** 자리마다 지금 떠 있는 말. 카드는 매 프레임 다시 그려지므로 여기 들고 있다가 얹는다 */
    const bubbles = new Map<number, { text: string; until: number }>();
    /** 그 사람이 한마디. 카드가 있는 판에서만 보인다 */
    function sayAs(seat: number, text: string, ms = 2600): void {
      if (!text) return;
      bubbles.set(seat, { text, until: performance.now() + ms });
    }
    /** 봇 자리의 사람이 그 상황의 말을 한다. 사람이 아니면 조용 */
    function castSay(seat: number, key: Parameters<typeof lineOf>[1], chance = 1): void {
      const v = match?.view() ?? shadow?.v;
      const c = v && mddOn() ? castByName(v.seats[seat]?.name ?? '') : null;
      if (!c || Math.random() > chance) return;
      sayAs(seat, lineOf(c, key, v?.seats[mySeat]?.name ?? ''));
    }
    /** 봇이 방금 두었나 보려고. 수가 늘고 내 차례가 됐으면 봇이 둔 것 */
    let seenMoves = 0;
    /** 컷인. 그 자리의 사람이 큰 얼굴로 한 줄. 1.7초 뒤 나간다 */
    let cutTimer = 0;
    function cutIn(seat: number, key: Parameters<typeof lineOf>[1]): void {
      const v = match?.view() ?? shadow?.v;
      const c = v && mddOn() ? castByName(v.seats[seat]?.name ?? '') : null;
      if (!c || !v) return;
      const text = lineOf(c, key, v.seats[mySeat]?.name ?? '');
      if (!text) return;
      const mood: Mood = key === 'win' ? 'glad' : key === 'lose' ? 'sad' : key === 'four' ? 'tease' : key === 'danger' ? 'think' : 'calm';
      const el = $<HTMLElement>('#acCutin');
      el.innerHTML = '<span class="ac-cutface">' + faceSvg(c, mood) + '</span><div><b>' + esc(c.name) + '</b><p>' + esc(text) + '</p></div>';
      el.hidden = false;
      el.classList.remove('ac-on');
      if (cutTimer) window.clearTimeout(cutTimer);
      window.requestAnimationFrame(() => el.classList.add('ac-on'));
      cutTimer = window.setTimeout(() => {
        el.classList.remove('ac-on');
        cutTimer = window.setTimeout(() => { el.hidden = true; cutTimer = 0; }, 350);
      }, 1700);
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
    /** 이번 판의 끝소리를 이미 울렸나. 매 프레임 울리면 소리가 아니라 경적이 된다. */
    let ended = false;
    /** 마지막으로 소리를 낸 판 번호 */
    let soundedRound = -1;

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
      const record = lastBest !== null && !net && !watching
        ? (mineNow > lastBest
            ? t('arcade.best.new', { n: String(mineNow), was: String(lastBest) })
            : t('arcade.best.was', { n: String(lastBest) }))
        : '';
      /* 몇 수에 얼마나 걸렸나. 주인과 혼자 판은 커널에서, 손님은 주인이 보낸 것에서 */
      const meta = match ? { moves: match.moves, ms: match.clock() } : resultMeta;
      const count = meta && meta.moves > 0 ? t('arcade.result.moves', { n: String(meta.moves), t: clockText(meta.ms) }) : '';
      $<HTMLElement>('#acOverNote').textContent = [note, count, record].filter(Boolean).join(', ');
      $<HTMLElement>('#acOver').style.display = '';
      placeEndButtons(true);
    }

    /** 1:03 꼴. 한 시간 넘는 판은 없다고 본다 */
    function clockText(ms: number): string {
      const s = Math.max(0, Math.round(ms / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    /** 다음 판, 나가기 전에 걷는다. 안 걷으면 다음 판이 지난 결과 뒤에서 돈다. */
    function hideResult(): void {
      $<HTMLElement>('#acOver').style.display = 'none';
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
    function faceOf(v: MatchView<unknown>, i: number): string {
      const seat = v.seats[i];
      /* 플레이어는 캐릭터가 아니다. 얼굴은 저택 사람만. MDD 가 꺼져 있으면 아무도 */
      const c = i === mySeat || !mddOn() ? null : castByName(seat?.name ?? '');
      if (!c) return '';
      const turn = (v.state as { turn?: number } | null)?.turn;
      let mood: Mood = 'calm';
      if (v.finished) {
        const top = Math.max(...v.seats.map((x) => x.score));
        mood = seat.score === top ? 'glad' : 'sad';
      } else if (turn === i) mood = 'think';
      return '<span class="ac-face">' + faceSvg(c, mood) + '</span>';
    }
    function bubbleOf(i: number, now: number): string {
      const b = bubbles.get(i);
      if (!b) return '';
      if (performance.now() > b.until) {
        bubbles.delete(i);
        return '';
      }
      return '<span class="ac-bubble">' + esc(b.text) + '</span>';
    }

    function paint(v: MatchView<unknown>, now: number): void {
      /* 지금 이 창이 **들고 있는 판**을 밖에서 볼 수 있게 둔다 (TASK-KL-264).
         감추기가 새는지는 화면으로 못 잡는다. 화면은 남의 배를 애초에 안 그리므로,
         새어도 그림은 똑같다(일부러 새게 해 보고 검사가 안 빨개지는 것을 확인했다).
         새는 자리는 보낸 값이라 받은 값을 직접 읽어야 한다. 이 창이 이미 가진 것이므로
         내보낸다고 더 알려지는 것은 없다. */
      /* 이 판이 **언제 저절로 끝나나**(`endsAt`)도 같이 내놓는다. 놀이마다 제한이 25초에서 300초까지 다르다.
         밖에서 기다리는 검사가 그걸 모르면 제 맘대로 잡은 참을성으로 안 끝났다고 적는다(2026-08-17 실측:
         참을성 60초인데 지뢰찾기 제한이 180초라, 그 놀이가 뽑히면 무조건 빨강이었다). */
      (window as unknown as { __arcade?: unknown }).__arcade = { game: gameId, mySeat, state: v.state, finished: v.finished, endsAt: (v.state as { endsAt?: number } | undefined)?.endsAt ?? null, realtime: cardById(gameId)?.realtime === true, tour: tour ? { at: tour.at, games: tour.games, points: tour.points } : null };
      seatsEl.innerHTML =
        (watching ? '<span class="ac-seat ac-watch">👀 ' + esc(t('arcade.watch.now')) + '</span>' : '') +
        v.seats
          .map(
            (s, i) =>
              '<span class="ac-seat' + (i === mySeat ? ' ac-me' : '') +
              (plan ? ' ac-team' + plan[i] : '') + '">' +
              (plan ? esc(TEAM_NAMES[plan[i]] ?? '') + ' ' : '') +
              faceOf(v, i) +
              '<span class="ac-seatname">' + esc(s.name) + (s.bot && !castByName(s.name) ? ' 🤖' : '') + '</span> <b>' + s.score + '</b>' +
              bubbleOf(i, now) + '</span>'
          )
          .join('');
      render?.(v, mySeat, now);
      if (match && match.moves !== seenMoves) {
        const turn = (v.state as { turn?: number } | null)?.turn;
        if (match.moves > seenMoves && turn === mySeat && !v.finished) castSay(1 - mySeat, 'move', 0.3);
        /* 방금 둔 수가 넷이면 컷인. 사람이 만들면 리치, 내가 만들면 사람의 위기 */
        if (match.moves > seenMoves && !v.finished && v.seats.length === 2 && typeof turn === 'number') {
          const mover = 1 - turn;
          const cue = gameById(gameId)?.cue?.(v.state, mover) ?? null;
          if (cue === 'four') cutIn(mover === mySeat ? 1 - mySeat : mover, mover === mySeat ? 'danger' : 'four');
        }
        seenMoves = match.moves;
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

      if (v.finished) {
        const top = Math.max(...v.seats.map((s) => s.score));
        const win = v.seats.filter((s) => s.score === top);
        againBtn.style.display = net && !net.host ? 'none' : '';
        /* 방을 든 주인에게는 다른 게임이 하나 더 뜬다. 방을 닫지 않고 갈아탄다. */
        swapBtn.style.display = net?.host ? '' : 'none';
        /* 끝난 판의 말은 **한 번만** 적는다. 매 프레임 다시 적으면 대회 점수판을 적어 놔도
           다음 프레임에 이겼다/졌다로 덮인다(실측. 점수판이 안 보였다). */
        if (!ended) {
          ended = true;
          if (net?.host && match) net.say({ kind: 'result', moves: match.moves, ms: match.clock() });
          v.seats.forEach((sq, i) => { if (i !== mySeat) cutIn(i, sq.score === top ? 'win' : 'lose'); });
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
            if (g0) tape = record(g0, match as never, lastSeats, lastSeed) as Tape<unknown>;
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
        if (v.round !== soundedRound) {
          soundedRound = v.round;
          blip('start');
        }
        say(t('arcade.status.round', { n: String(v.round + 1), of: String(v.rounds) }));
      }
    }

    function loop(): void {
      raf = requestAnimationFrame(loop);
      if (match) {
        const now = performance.now() - t0;
        /* 다시 보기 중이면 **적어 둔 수를 그때가 되면 다시 넣는다.** 봇의 수는 안 넣는다 . 
           커널이 같은 씨앗에서 똑같이 만들어 내기 때문이다(`replay.ts` 와 같은 규율). */
        if (replaying && tape) {
          while (tapeAt < tape.moves.length && tape.moves[tapeAt].at <= match.clock()) {
            const mv = tape.moves[tapeAt++];
            match.dispatch(mv.seat, mv.action);
          }
        }
        match.step(now);
        const v = match.view();
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
      const base = { game: gameId, now, seatOf };
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
      /* 2D 로 갈아타면 방이 아니다. 화면 채움과 목소리를 되돌린다 */
      const roomNow = dim() === '3d' && !!cardById(id)?.d3;
      fill(roomNow);
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
    /** 손님이 주인에게서 받은 결과 숫자(수, 시간). 손님에게는 커널이 없다 */
    let resultMeta: { moves: number; ms: number } | null = null;

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
            sayAs(seat, text);
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
      return !!match && !net && !letter && !replaying && !tour && cardById(gameId)?.kind === 'board' && match.tape.length > 0 && !match.view().finished;
    }
    function paintUndo(): void {
      const btn = container.querySelector<HTMLButtonElement>('#acUndo');
      if (btn) btn.style.display = canUndo() ? '' : 'none';
    }
    function undo(): void {
      if (!canUndo() || !match) return;
      match.rewind(1);
      blip('tap');
      paintUndo();
      castSay(1 - mySeat, 'undo');
    }

    function paintScene(id: string): void {
      const btn = container.querySelector<HTMLButtonElement>('#acScene');
      if (!btn) return;
      const on = dim() === '3d' && !!cardById(id)?.d3;
      btn.style.display = on ? '' : 'none';
      const em = container.querySelector<HTMLButtonElement>('#acEmote');
      if (em) em.style.display = on && mddOn() ? '' : 'none';
      if (!on) $<HTMLElement>('#acEmotes').hidden = true;
      paintMdd();
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

    function beginMatch(id: string, seats: SeatSpec[], seed: number, want?: number, mine = 0): void {
      const g = gameById(id);
      /* 조각이 아직이면 **받아서 다시 들어온다** (TASK-KL-242 쪼개기). 부르는 자리가 예닐곱인데
         저마다 기다리게 하면 언젠가 한 곳을 빠뜨린다. 문을 하나로 두고 여기서만 기다린다. */
      if (!g) {
        void ensureGame(id).then(() => {
          if (gameById(id)) beginMatch(id, seats, seed, want, mine);
        });
        return;
      }
      gameId = id;
      mySeat = mine;
      offerOpen = null;
      $<HTMLElement>('#acOffer').style.display = 'none';
      watching = false;
      ended = false;
      soundedRound = -1;
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
      if (mddOn() && !tour && crew.length && (cardById(id)?.kind === 'board' || SETUPS[id]?.some((c) => c.key === 'ai'))) {
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
      lastBest = bestOf(id)?.score ?? null;
      let def = withBotLevel(g, levelNow(), personas);
      if (past && withCrew.length > seats.length) {
        const gseat = withCrew.length - 1;
        withCrew[gseat] = { name: GHOST_NAME, bot: true };
        def = withGhost(def, gseat, past as never) as typeof def;
      }
      match = new Match(def, seed, withCrew, optsFor(id)) as Match<unknown, unknown>;
      /* 되살릴 재료. 씨앗과 자리. 이 둘과 누른 것이면 판이 다시 만들어진다(`replay.ts`). */
      lastSeed = seed;
      lastSeats = withCrew;
      lastPersonas = personas;
      lastLevel = levelNow();
      lastDef = def as GameDef<unknown, unknown>;
      bubbles.clear();
      seenMoves = 0;
      withCrew.forEach((sq, i) => { if (sq.bot && castByName(sq.name)) window.setTimeout(() => { if (match) sayAs(i, lineOf(castByName(sq.name) as NonNullable<ReturnType<typeof castByName>>, 'hello', withCrew[mine]?.name ?? '')); }, 900); });
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
      fill(roomBound);
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
      show('play');
      withIntro(id, () =>
        beginMatch(id, [{ name: myName(), bot: false }], seedFrom(id + String(Date.now()))));
    }

    /* ── 편지로 두기 (TASK-KL-264 D5) ─────────────────────────────
     *
     * 방을 안 연다. 판 전체가 링크 안에 있고, **한 수 두면 새 링크가 나온다.**
     * 그래서 이 자리에는 그물망도 봇도 없다. 사람 둘이 번갈아 둘 뿐이다.
     */
    let letter: Letter | null = null;

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
    function openLetter(post: Letter): void {
      const g = gameById(post.game);
      if (!g) {
        void ensureGame(post.game).then(() => {
          if (gameById(post.game)) openLetter(post);
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
      ended = false;
      soundedRound = -1;
      match = deal(g, post) as Match<unknown, unknown>;
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
      show('play');
      withIntro(id, () =>
        beginMatch(id, [{ name: myName(), bot: false }], seedFrom(id + String(Date.now())), n));
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
      withIntro(id, () => beginMatch(id, seats, seedFrom(id + String(Date.now())), undefined, swap ? 1 : 0));
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
      startBtn.style.display = host ? '' : 'none';
      $<HTMLElement>('.ac-share').style.display = host ? '' : 'none';
    }

    /** 목록에 올린 방을 내리는 손. 방을 닫을 때 부른다. */
    let dropOpen: (() => void) | null = null;

    function openRoom(id: string, publicly = false): void {
      /* 이미 방을 들고 있으면 새로 파지 않는다. 그게 방 유지의 전부다. */
      if (net?.host) {
        startTogether(id);
        return;
      }
      const code = makeCode();
      /* 같이 찾기로 연 방만 목록에 올린다. 같이는 그대로 링크 아는 사람만이다. */
      dropOpen?.();
      dropOpen = publicly ? holdRoom({ code, game: id, host: myName() }) : null;
      gameId = id;
      peers = [];
      show('wait');
      $<HTMLInputElement>('#acUrl').value = inviteLink('arcade', code);
      paintWait(code, true);
      net = connect(code, true, myName(), {
        onPeers: (list) => {
          peers = list;
          paintWait(code, true);
          paintRoom();
        },
        onAct: (peerId, data) => {
          const seat = seatOf[peerId];
          if (seat === undefined) return;
          const meta = (data as { meta?: string }).meta;
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
    }

    function joinRoomAs(code: string): void {
      peers = [];
      show('wait');
      paintWait(code, false);
      net = connect(code, false, myName(), {
        onPeers: (list) => {
          peers = list;
          paintWait(code, false);
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
            if (typeof d.seat === 'number' && d.seat !== mySeat) sayAs(d.seat, String(d.text ?? ''));
            return;
          }
          if (kind === 'result') {
            const d = data as { moves?: number; ms?: number };
            resultMeta = { moves: d.moves ?? 0, ms: d.ms ?? 0 };
            return;
          }
          if (kind !== 'picking') return;
          $<HTMLElement>('#acOverHead').textContent = '⏳ ' + t('arcade.room.picking');
          $<HTMLElement>('#acOverList').innerHTML = '';
          $<HTMLElement>('#acOverNote').textContent = '';
          $<HTMLElement>('#acOver').style.display = '';
        },
        onSync: (data) => {
          const p = data as unknown as { game: string; now: number; seatOf: Record<string, number>; v: MatchView<unknown> };
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
          /* **자리가 없으면 -1.** 0 으로 두면 구경꾼이 제가 1번 자리인 줄 알고 수를 두려 든다
             (주인이 흘리므로 판은 안 깨지지만, 화면은 내 차례라고 말한다). */
          mySeat = seatOf[net?.selfId ?? ''] ?? -1;
          watching = mySeat < 0;
          shadow = { v: p.v, now: p.now, at: performance.now() };
        }
      });
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
      const take = peers.slice(0, card.seats[1] - 1);
      seatOf = {};
      take.forEach((p, i) => {
        seatOf[p.id] = swap ? i : i + 1;
      });
      const me: SeatSpec = { name: myName(), bot: false };
      const others = take.map((p) => ({ name: p.name, bot: false }));
      const seats: SeatSpec[] = swap ? [...others, me] : [me, ...others];
      show('play');
      withIntro(gameId, () => beginMatch(gameId, seats, seedFrom(gameId + String(Date.now())), undefined, swap ? others.length : 0));
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

    /* 편지가 실려 있으면 그 판을 편다. 방과 다른 자리(`?m=`)를 쓴다 (TASK-KL-264 D5). */
    const posted = letterFromUrl();
    if (posted) openLetter(posted);

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
      const tp = tape;
      const m = new Match(lastDef ?? withBotLevel(g, lastLevel, lastPersonas), tp.seed, tp.seats, tp.opts ?? {}) as Match<unknown, unknown>;
      const snap = (): MatchView<unknown> => {
        const v = m.view();
        return { ...v, seats: v.seats.map((s) => ({ ...s })) };
      };
      const frames: Array<{ at: number; v: MatchView<unknown> }> = [{ at: 0, v: snap() }];
      const order: number[] = [];
      const boardOf = (v: MatchView<unknown>): number[] | null => {
        const b = (v.state as { board?: unknown } | null)?.board;
        return Array.isArray(b) ? (b as number[]) : null;
      };
      const take = (): void => {
        while (frames.length - 1 < m.moves) {
          const v = snap();
          const prev = boardOf(frames[frames.length - 1].v);
          const next = boardOf(v);
          if (prev && next) {
            let cell = -1;
            for (let i = 0; i < next.length; i += 1) if (next[i] !== prev[i] && next[i]) { cell = i; break; }
            order.push(cell);
          }
          frames.push({ at: m.clock(), v });
        }
      };
      let i = 0;
      for (let guard = 0; guard < 200000; guard += 1) {
        while (i < tp.moves.length && tp.moves[i].at <= m.clock()) {
          const mv = tp.moves[i++];
          m.dispatch(mv.seat, mv.action);
          take();
        }
        m.step(m.clock() + 16);
        take();
        if (m.view().finished) break;
        if (m.clock() > tp.end + 16 && i >= tp.moves.length) break;
      }
      /* 끝 장면은 마지막 수 뒤의 판정(끝났다)까지 담는다 */
      const last = frames[frames.length - 1];
      last.v = snap();
      last.at = m.clock();
      cancelAnimationFrame(raf);
      match = null;
      replaying = true;
      review = { frames, order, at: frames.length - 1, playing: false, speed: 1, timer: 0, branch: false };
      ended = false;
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
      review.at = Math.max(0, Math.min(n, k));
      const f = review.frames[review.at];
      const v: MatchView<unknown> = { ...f.v, review: { order: review.order, at: review.at, total: n } };
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
      if (review.timer) window.clearInterval(review.timer);
      review.timer = 0;
      review.playing = on;
      if (on) {
        if (review.at >= review.frames.length - 1) review.at = 0;
        review.timer = window.setInterval(() => {
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
      const tp = tape;
      const m = new Match(lastDef ?? withBotLevel(g, lastLevel, lastPersonas), tp.seed, tp.seats, tp.opts ?? {}) as Match<unknown, unknown>;
      let i = 0;
      for (let guard = 0; guard < 200000 && m.moves < k; guard += 1) {
        while (i < tp.moves.length && tp.moves[i].at <= m.clock() && m.moves < k) {
          const mv = tp.moves[i++];
          m.dispatch(mv.seat, mv.action);
        }
        if (m.moves >= k) break;
        m.step(m.clock() + 16);
      }
      if (m.view().finished) return false;
      /* 내 차례인 수에서만. 봇 차례에서 갈라지면 봇이 먼저 두어 무엇이 내 수인지 헷갈린다(실측) */
      if (g.canAct && !g.canAct(m.view().state as never, mySeat)) return false;
      tlPlay(false);
      review.branch = true;
      replaying = false;
      match = m;
      ended = false;
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
      resultMeta = { moves: review.frames.length - 1, ms: last.at };
      review = null;
      replaying = false;
      cancelAnimationFrame(raf);
      match = null;
      $<HTMLElement>('#acTimeline').hidden = true;
      if (showOver) {
        ended = false;
        paint(last.v, last.at);
      }
    }

    /* 반응. 메뉴의 한 줄이 판을 열고, 여섯 중 하나를 누르면 내 카드에 말풍선. 온라인이면 상대에게도 */
    $<HTMLButtonElement>('#acMdd').onclick = () => {
      try {
        localStorage.setItem('karmolab.arcade.mdd', mddOn() ? 'off' : 'on');
      } catch {
        /* 못 적어도 이 판에서는 바뀐다 */
      }
      paintMdd();
      if (gameId) paintScene(gameId);
      say(t(mddOn() ? 'arcade.mdd.on' : 'arcade.mdd.off'), 'ok');
    };
    const emotesEl = $<HTMLElement>('#acEmotes');
    $<HTMLButtonElement>('#acEmote').onclick = () => { emotesEl.hidden = !emotesEl.hidden; };
    emotesEl.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-emote]');
      if (!b) return;
      const text = EMOTES[Number(b.dataset.emote)] ?? '';
      emotesEl.hidden = true;
      sayAs(mySeat, text);
      if (!net) return;
      if (net.host) net.say({ kind: 'emote', seat: mySeat, text });
      else net.act({ meta: 'emote:' + text });
    });
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
    document.addEventListener('keydown', (ev) => {
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
    });

    /** 다른 게임. 방을 든 채 로비로. 손님에게는 고르는 중이라고 알린다. */
    swapBtn.onclick = (): void => {
      if (!net?.host) return;
      net.say({ kind: 'picking' });
      cancelAnimationFrame(raf);
      match = null;
      render = null;
      againBtn.style.display = 'none';
      swapBtn.style.display = 'none';
      replayBtn.style.display = 'none';
      endReview(false);
      replaying = false;
      plan = null;
      letter = null;
      $<HTMLElement>('#acLetter').style.display = 'none';
      hideResult();
      paintRoom();
      paintPicks();
      show('lobby');
    };

    const quit = (): void => {
      dropIntro?.();
      dropIntro = null;
      /* 방을 닫으면 목록에서도 내린다. 안 내리면 10분 동안 눌렀는데 아무도 없네가 된다. */
      dropOpen?.();
      dropOpen = null;
      cancelAnimationFrame(raf);
      net?.leave();
      net = null;
      match = null;
      shadow = null;
      render = null;
      againBtn.style.display = 'none';
      swapBtn.style.display = 'none';
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

    /**
     * 풀스크린. **무대만** 키운다 (TASK-KL-314).
     *
     * 창 전체가 아니라 `.ac-stage` 하나를 키우는 이유: 자리줄, 상태글, 단추가 같이 커지면
     * 판이 오히려 작아진다. 무대만 키우면 그 안의 51개가 그대로 커진다. 게임 화면은 이걸 모른다.
     *
     * 안 되는 곳(iOS 사파리의 일부)에서는 조용히 아무 일도 안 일어난다. 단추를 숨기지는 않는다 . 
     * 눌러 보고 안 되는 것과 아예 없는 것 중, 없는 쪽이 더 오래 헷갈린다.
     */
    /**
     * 풀스크린이면 단추 줄을 **무대 안으로 옮긴다** (TASK-KL-314).
     *
     * 브라우저는 풀스크린 대상 **밖을 아예 안 그린다.** 그래서 무대만 키웠더니 나가기, 한 판
     * 더, 소리가 통째로 사라졌다. 판이 끝나도 아무것도 못 하고, 나가려면 ESC 를 알아야 했다
     * (실측: 그 자리를 눌러 보면 무대가 잡힌다). 화면에 안 보이는 단추는 없는 단추다.
     *
     * 옮기는 것으로 푼다. 복제가 아니라 이동이라 붙여 둔 손잡이(onclick)가 그대로 따라온다.
     * ESC 로 나가는 길도 있으므로 되돌리는 것은 `fullscreenchange` 가 맡는다(단추만 보면 샌다).
     */
    /* ── 눕힌 좁은 화면: 무대 크기를 **남은 자리에서** 정한다 (2026-08-15 실측) ──────
     *
     * 여태 `78vh` 라는 **손으로 맞춘 상수**였다. 그 값은 폰 둘(390×844, 844×390)에서 재서
     * 고른 것인데, 셸 머리띠가 세로를 먼저 먹는 양이 **화면 너비마다 다르다**:
     *   844 폭 → 머리띠 76px, 남는 세로 314 (=80vh)
     *   740 폭 → 머리띠 **123px**, 남는 세로 237 (=66vh)   ← 머리띠가 한 줄 더 접힌다
     * 한 개의 vh 상수로는 둘을 동시에 만족시킬 수 없다. 740×360 에서 판이 **44px** 밀렸다.
     * 상수를 더 내리면 큰 폰에서 판이 쓸데없이 작아진다.
     *
     * 그래서 몇 vh를 맞히려 들지 않고, **무대 위가 실제로 얼마를 먹었는지 그 자리에서
     * 재서** 남은 만큼만 준다.
     *
     * ★ **안 보일 때 재면 안 된다** (첫 판에 이걸로 데었다): 화면이 숨어 있으면 무대의 위치가
     *   0 으로 잡혀 남은 세로 = 화면 전체가 되고, 그러면 판이 머리띠 높이만큼 **더** 밀린다
     *   (44px → 121px 로 악화). 그래서 ⓐ 보이는지 먼저 확인하고 ⓑ 판이 실제로 그려지는
     *   순간에 다시 잰다.
     */
    const stageEl = $<HTMLElement>('#acStage');
    const landscapeNarrow = (): boolean => window.matchMedia('(orientation:landscape) and (max-height:560px)').matches;
    const fitStage = (): void => {
      if (!stageEl.isConnected) return;
      if (!landscapeNarrow() || document.fullscreenElement) {
        stageEl.style.removeProperty('--ac-stage');
        return;
      }
      const box = stageEl.getBoundingClientRect();
      /* 안 보이면 재지 않는다. 0 을 진짜 위치로 읽으면 위 주석의 그 사고가 난다. */
      if (stageEl.offsetParent === null || box.height === 0) return;
      /* 무대 위가 먹은 세로 = 무대의 화면상 위치. 아래로는 2px 만 남긴다(경계선 반올림 몫). */
      const remainingHeight = Math.max(120, Math.round(window.innerHeight - box.top - 2));
      stageEl.style.setProperty('--ac-stage', `min(62vw, ${remainingHeight}px, 640px)`);
    };
    /* 판이 그려질 때마다 다시 잰다. 그때가 무대가 확실히 보이는 시점이다. */
    new MutationObserver(() => requestAnimationFrame(fitStage))
      .observe($<HTMLElement>('#acView'), { childList: true, subtree: false });
    window.addEventListener('resize', () => requestAnimationFrame(fitStage));
    window.addEventListener('orientationchange', () => requestAnimationFrame(fitStage));
    document.addEventListener('fullscreenchange', () => requestAnimationFrame(fitStage));

    const controls = $<HTMLElement>('#acControls');
    const menuBtn = $<HTMLButtonElement>('#acMenu');
    const controlsHome = controls.parentElement;
    document.addEventListener('fullscreenchange', () => {
      const stage = $<HTMLElement>('#acStage');
      if (document.fullscreenElement === stage) stage.append(menuBtn, controls);
      else controlsHome?.append(menuBtn, controls);
    });
    /* 방의 메뉴. 버튼 하나가 종이를 내리고 올린다. 줄 하나를 고르면 닫힘(소리 켜고 끄기는 열린 채) */
    const setMenu = (open: boolean): void => {
      if (open) tidySeps();
      play.classList.toggle('ac-menu-open', open);
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    /* 구분선은 양쪽에 보이는 줄이 있을 때만. 숨은 버튼만 낀 무리 뒤의 선은 빈 선 */
    const tidySeps = (): void => {
      let seen = false;
      let lastSep: HTMLElement | null = null;
      for (const el of Array.from(controls.children) as HTMLElement[]) {
        if (el.classList.contains('ac-sep')) {
          el.hidden = !seen || !!lastSep;
          if (!el.hidden) lastSep = el;
          continue;
        }
        if (el.style.display !== 'none') {
          seen = true;
          lastSep = null;
        }
      }
      if (lastSep) lastSep.hidden = true;
    };
    menuBtn.onclick = () => setMenu(!play.classList.contains('ac-menu-open'));
    controls.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('button');
      if (b && b.id !== 'acSound' && b.id !== 'acMdd') setMenu(false);
    });
    document.addEventListener('pointerdown', (ev) => {
      if (!play.classList.contains('ac-menu-open')) return;
      const el = ev.target as HTMLElement;
      if (!controls.contains(el) && !menuBtn.contains(el)) setMenu(false);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && play.classList.contains('ac-menu-open')) setMenu(false);
    });

    /* 표현 갈아 끼우기. 판은 커널이 들고 있으므로 그리는 법만 바꿔 다시 붙이면 그대로 이어진다. */
    $<HTMLButtonElement>('#acUndo').onclick = undo;
    /* 우클릭도 무르기(레퍼런스와 같은 손). 무를 수 없는 판이면 브라우저 메뉴 그대로 */
    viewEl.addEventListener('contextmenu', (ev) => {
      if (!canUndo()) return;
      ev.preventDefault();
      undo();
    });

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

    $<HTMLButtonElement>('#acFull').onclick = (): void => {
      /* 방(화면 채움)이면 판 영역 통째로. 무대만 키우면 자리 카드와 버튼이 무대 밖이라 안 보인다(사용자 실측) */
      const stage = play.classList.contains('ac-roomfill') ? play : $<HTMLElement>('#acStage');
      try {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void stage.requestFullscreen?.();
      } catch {
        /* 못 키워도 판은 돈다 */
      }
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

    /* 소리 끄기. 껐다 켠 것은 이 브라우저에만 남는다. */
    const soundBtn = $<HTMLButtonElement>('#acSound');
    const paintSound = (): void => {
      const emoji = soundBtn.querySelector('.ac-emoji');
      if (emoji) emoji.textContent = soundOn() ? '🔊' : '🔇';
      soundBtn.setAttribute('aria-pressed', soundOn() ? 'true' : 'false');
    };
    paintSound();
    soundBtn.onclick = () => {
      setSoundOn(!soundOn());
      paintSound();
      if (soundOn()) blip('good');
    };
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
      cancelAnimationFrame(raf);
      net?.leave();
    });
  }
})();
