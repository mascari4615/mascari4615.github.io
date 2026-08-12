/**
 * 화면 명부 (TASK-KL-242) — 게임 명부(`index.ts`)와 짝.
 *
 * 규칙과 화면을 따로 세는 이유: 커널 검증은 화면을 안 부른다(창 없이 51개를 돌려야 한다).
 * 규칙 파일이 화면을 import 하면 그 검증이 브라우저를 필요로 하게 된다.
 */
import type { GameView } from './views';
import { reflexView } from './games/reflex-view';
import { gomokuView } from './games/gomoku-view';
import { fourView } from './games/four-view';
import { memoryView } from './games/memory-view';
import { hitblowView } from './games/hitblow-view';
import { reversiView } from './games/reversi-view';
import { dotsView } from './games/dots-view';
import { speedView } from './games/speed-view';
import { slideView } from './games/slide-view';
import { ultimateView } from './games/ultimate-view';
import { yachtView } from './games/yacht-view';
import { checkersView } from './games/checkers-view';
import { blackjackView } from './games/blackjack-view';
import { presidentView } from './games/president-view';
import { dominoesView } from './games/dominoes-view';
import { curlingView } from './games/curling-view';
import { bowlingView } from './games/bowling-view';
import { poolView } from './games/pool-view';
import { dartsView } from './games/darts-view';
import { airhockeyView } from './games/airhockey-view';
import { highlowView } from './games/highlow-view';
import { nimView } from './games/nim-view';
import { hanabiView } from './games/hanabi-view';
import { wordchainView } from './games/wordchain-view';
import { lineupView } from './games/lineup-view';
import { minesweeperView } from './games/minesweeper-view';
import { liarsView } from './games/liars-view';
import { twentyView } from './games/twenty-view';
import { snakeView } from './games/snake-view';
import { onestrokeView } from './games/onestroke-view';
import { fishingView } from './games/fishing-view';
import { minishogiView } from './games/minishogi-view';
import { hanafudaView } from './games/hanafuda-view';
import { tanksView } from './games/tanks-view';
import { mancalaView } from './games/mancala-view';
import { shellgameView } from './games/shell-view';
import { foxhoundsView } from './games/foxhounds-view';
import { pongView } from './games/pong-view';
import { derbyView } from './games/derby-view';
import { whackView } from './games/whack-view';
import { tugView } from './games/tug-view';
import { capturegoView } from './games/capturego-view';
import { rpsView } from './games/rps-view';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const VIEWS: Array<GameView<any, any>> = [reflexView, gomokuView, fourView, memoryView, hitblowView, reversiView, dotsView, speedView, slideView, ultimateView, yachtView, checkersView, blackjackView, presidentView, dominoesView, curlingView, bowlingView, poolView, dartsView, airhockeyView, highlowView, nimView, hanabiView, wordchainView, lineupView, minesweeperView, liarsView, twentyView, snakeView, onestrokeView, fishingView, minishogiView, hanafudaView, tanksView, mancalaView, shellgameView, foxhoundsView, pongView, derbyView, whackView, tugView, capturegoView, rpsView];

export const viewById = (id: string): GameView<any, any> | undefined => VIEWS.find((v) => v.id === id);
