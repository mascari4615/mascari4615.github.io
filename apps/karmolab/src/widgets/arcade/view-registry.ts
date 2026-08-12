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

/* eslint-disable @typescript-eslint/no-explicit-any */
export const VIEWS: Array<GameView<any, any>> = [reflexView, gomokuView, fourView, memoryView, hitblowView, reversiView, dotsView, speedView, slideView, ultimateView, yachtView];

export const viewById = (id: string): GameView<any, any> | undefined => VIEWS.find((v) => v.id === id);
