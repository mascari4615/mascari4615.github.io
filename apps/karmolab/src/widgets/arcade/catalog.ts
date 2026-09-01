/**
 * 오락실 게임 명부. **단일 정본(SSOT)** (TASK-KL-264)
 *
 * 전에는 게임 하나를 넣으려면 세 파일에 세 번 적어야 했다. 규칙 명부, 화면 명부, 명패.
 * 세 곳에 같은 것을 적으면 **언젠가 갈라진다**(화면만 빠진 게임, 명패만 있는 게임).
 * 그래서 여기 한 줄로 모았다: **규칙, 화면, 그림, 갈래가 한 자리에.**
 *
 * `id` 는 여기 안 적는다. 규칙 파일의 `def.id` 가 유일한 이름이다. 이름을 두 번 적으면
 * 그 둘이 어긋나는 날이 온다.
 *
 * 게임 추가 = 파일 2개(규칙, 화면) + **이 파일 한 줄**. 다른 곳은 여기서 파생된다:
 * `index.ts`(GAMES), `view-registry.ts`(VIEWS), `meta.ts`(META) 전부 이 배열의 그림자다.
 *
 * 차례 = 화면에 보일 차례(갈래 안에서는 쉬운 것부터). 검사(`test-arcade.mjs`)가
 * 규칙 파일이 있는데 여기 없는 것과 말 묶음이 빠진 것을 막는다.
 */
import type { GameDef } from './types';
import type { GameView } from './views';
import type { Kind } from './meta';

import { reflex } from './games/reflex';
import { reflexView } from './games/reflex-view';
import { speed } from './games/speed';
import { speedView } from './games/speed-view';
import { airhockey } from './games/airhockey';
import { airhockeyView } from './games/airhockey-view';
import { pong } from './games/pong';
import { pongView } from './games/pong-view';
import { whack } from './games/whack';
import { whackView } from './games/whack-view';
import { tug } from './games/tug';
import { tugView } from './games/tug-view';
import { rps } from './games/rps';
import { rpsView } from './games/rps-view';
import { tuho } from './games/tuho';
import { tuhoView } from './games/tuho-view';
import { yut } from './games/yut';
import { yutView } from './games/yut-view';
import { fleet } from './games/fleet';
import { fleetView } from './games/fleet-view';
import { auction } from './games/auction';
import { auctionView } from './games/auction-view';
import { jegi } from './games/jegi';
import { jegiView } from './games/jegi-view';
import { nunchi } from './games/nunchi';
import { nunchiView } from './games/nunchi-view';
import { wordchain } from './games/wordchain';
import { wordchainView } from './games/wordchain-view';
import { lineup } from './games/lineup';
import { lineupView } from './games/lineup-view';
import { twenty } from './games/twenty';
import { twentyView } from './games/twenty-view';
import { snake } from './games/snake';
import { snakeView } from './games/snake-view';
import { shellgame } from './games/shell';
import { shellgameView } from './games/shell-view';
import { gomoku } from './games/gomoku';
import { gomokuView } from './games/gomoku-view';
import { four } from './games/four';
import { fourView } from './games/four-view';
import { reversi } from './games/reversi';
import { reversiView } from './games/reversi-view';
import { dots } from './games/dots';
import { dotsView } from './games/dots-view';
import { ultimate } from './games/ultimate';
import { ultimateView } from './games/ultimate-view';
import { checkers } from './games/checkers';
import { checkersView } from './games/checkers-view';
import { nim } from './games/nim';
import { nimView } from './games/nim-view';
import { minishogi } from './games/minishogi';
import { minishogiView } from './games/minishogi-view';
import { mancala } from './games/mancala';
import { mancalaView } from './games/mancala-view';
import { foxhounds } from './games/foxhounds';
import { foxhoundsView } from './games/foxhounds-view';
import { capturego } from './games/capturego';
import { capturegoView } from './games/capturego-view';
import { blackjack } from './games/blackjack';
import { solitaire } from './games/solitaire';
import { solitaireView } from './games/solitaire-view';
import { blackjackView } from './games/blackjack-view';
import { president } from './games/president';
import { presidentView } from './games/president-view';
import { dominoes } from './games/dominoes';
import { dominoesView } from './games/dominoes-view';
import { yacht } from './games/yacht';
import { yachtView } from './games/yacht-view';
import { highlow } from './games/highlow';
import { highlowView } from './games/highlow-view';
import { lanterns } from './games/lanterns';
import { lanternsView } from './games/lanterns-view';
import { liars } from './games/liars';
import { liarsView } from './games/liars-view';
import { hanafuda } from './games/hanafuda';
import { hanafudaView } from './games/hanafuda-view';
import { derby } from './games/derby';
import { derbyView } from './games/derby-view';
import { curling } from './games/curling';
import { curlingView } from './games/curling-view';
import { bowling } from './games/bowling';
import { bowlingView } from './games/bowling-view';
import { pool } from './games/pool';
import { poolView } from './games/pool-view';
import { darts } from './games/darts';
import { dartsView } from './games/darts-view';
import { fishing } from './games/fishing';
import { fishingView } from './games/fishing-view';
import { tanks } from './games/tanks';
import { tanksView } from './games/tanks-view';
import { memory } from './games/memory';
import { memoryView } from './games/memory-view';
import { hitblow } from './games/hitblow';
import { hitblowView } from './games/hitblow-view';
import { slide } from './games/slide';
import { slideView } from './games/slide-view';
import { minesweeper } from './games/minesweeper';
import { minesweeperView } from './games/minesweeper-view';
import { onestroke } from './games/onestroke';
import { onestrokeView } from './games/onestroke-view';
import { simon } from './games/simon';
import { simonView } from './games/simon-view';
import { sudoku } from './games/sudoku';
import { sudokuView } from './games/sudoku-view';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CatalogEntry {
  def: GameDef<any, any>;
  view: GameView<any, any>;
  /** 흔한 이모지만. 트럼프, 도미노 낱자는 기본 글꼴에 없어 두부로 뜬다 */
  icon: string;
  kind: Kind;
  /** 로비에서 감춘다. 규칙과 화면은 그대로 살아 있어 주소로 들어온 방과 다시보기는 돈다 */
  hidden?: true;
}

export const CATALOG: CatalogEntry[] = [
  { def: reflex, view: reflexView, icon: '⚡', kind: 'quick' , hidden: true },
  { def: speed, view: speedView, icon: '⚡', kind: 'quick' },
  { def: airhockey, view: airhockeyView, icon: '🏒', kind: 'quick' , hidden: true },
  { def: pong, view: pongView, icon: '🏓', kind: 'quick' , hidden: true },
  { def: whack, view: whackView, icon: '🐹', kind: 'quick' , hidden: true },
  { def: tug, view: tugView, icon: '🪢', kind: 'quick' , hidden: true },
  { def: rps, view: rpsView, icon: '✌️', kind: 'quick' , hidden: true },
  { def: tuho, view: tuhoView, icon: '🏹', kind: 'sport' , hidden: true },
  { def: yut, view: yutView, icon: '🏯', kind: 'board' , hidden: true },
  { def: fleet, view: fleetView, icon: '🚢', kind: 'board' , hidden: true },
  { def: auction, view: auctionView, icon: '🔨', kind: 'card' , hidden: true },
  { def: jegi, view: jegiView, icon: '🥋', kind: 'quick' , hidden: true },
  { def: nunchi, view: nunchiView, icon: '👀', kind: 'quick' , hidden: true },
  { def: wordchain, view: wordchainView, icon: '🗣️', kind: 'quick' , hidden: true },
  { def: lineup, view: lineupView, icon: '👥', kind: 'quick' , hidden: true },
  { def: twenty, view: twentyView, icon: '❓', kind: 'quick' , hidden: true },
  { def: snake, view: snakeView, icon: '🐍', kind: 'quick' , hidden: true },
  { def: shellgame, view: shellgameView, icon: '🥄', kind: 'quick' , hidden: true },
  { def: gomoku, view: gomokuView, icon: '⚫', kind: 'board' },
  { def: four, view: fourView, icon: '🔴', kind: 'board' , hidden: true },
  { def: reversi, view: reversiView, icon: '⚪', kind: 'board' , hidden: true },
  { def: dots, view: dotsView, icon: '⬜', kind: 'board' , hidden: true },
  { def: ultimate, view: ultimateView, icon: '⊞', kind: 'board' , hidden: true },
  { def: checkers, view: checkersView, icon: '🔶', kind: 'board' , hidden: true },
  { def: nim, view: nimView, icon: '⚪', kind: 'board' , hidden: true },
  { def: minishogi, view: minishogiView, icon: '将', kind: 'board' , hidden: true },
  { def: mancala, view: mancalaView, icon: '🪵', kind: 'board' , hidden: true },
  { def: foxhounds, view: foxhoundsView, icon: '🦊', kind: 'board' , hidden: true },
  { def: capturego, view: capturegoView, icon: '⚫', kind: 'board' , hidden: true },
  { def: blackjack, view: blackjackView, icon: '♠️', kind: 'card' },
  { def: solitaire, view: solitaireView, icon: '🃏', kind: 'card' },
  { def: president, view: presidentView, icon: '👑', kind: 'card' },
  { def: dominoes, view: dominoesView, icon: '🀄', kind: 'card' , hidden: true },
  { def: yacht, view: yachtView, icon: '🎲', kind: 'card' },
  { def: highlow, view: highlowView, icon: '🔺', kind: 'card' },
  { def: lanterns, view: lanternsView, icon: '🏮', kind: 'card' , hidden: true },
  { def: liars, view: liarsView, icon: '🎲', kind: 'card' , hidden: true },
  { def: hanafuda, view: hanafudaView, icon: '🌸', kind: 'card' },
  { def: derby, view: derbyView, icon: '🐎', kind: 'card' , hidden: true },
  { def: curling, view: curlingView, icon: '🥌', kind: 'sport' , hidden: true },
  { def: bowling, view: bowlingView, icon: '🎳', kind: 'sport' , hidden: true },
  { def: pool, view: poolView, icon: '🎱', kind: 'sport' , hidden: true },
  { def: darts, view: dartsView, icon: '🎯', kind: 'sport' , hidden: true },
  { def: fishing, view: fishingView, icon: '🎣', kind: 'sport' , hidden: true },
  { def: tanks, view: tanksView, icon: '💥', kind: 'sport' , hidden: true },
  { def: memory, view: memoryView, icon: '🃏', kind: 'puzzle' },
  { def: hitblow, view: hitblowView, icon: '🔢', kind: 'puzzle' , hidden: true },
  { def: slide, view: slideView, icon: '🧩', kind: 'puzzle' , hidden: true },
  { def: minesweeper, view: minesweeperView, icon: '💣', kind: 'puzzle' , hidden: true },
  { def: onestroke, view: onestrokeView, icon: '✏️', kind: 'puzzle' , hidden: true },
  { def: simon, view: simonView, icon: '🎵', kind: 'puzzle' , hidden: true },
  { def: sudoku, view: sudokuView, icon: '🔢', kind: 'puzzle' , hidden: true }
];
