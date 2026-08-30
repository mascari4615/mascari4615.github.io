/**
 * 화면 명부 (TASK-KL-242, SSOT 정리 = TASK-KL-264)
 *
 * 이 파일도 `catalog.ts` 의 그림자다. 화면을 따로 적어 두면 규칙은 있는데 화면이 없는 게임이
 * 생기고, 그건 로비에서 눌러 보기 전까지 아무 검사도 안 잡는다.
 */
import type { GameView } from './views';
import { CATALOG } from './catalog';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const VIEWS: Array<GameView<any, any>> = CATALOG.map((e) => e.view);

export const viewById = (id: string): GameView<any, any> | undefined => VIEWS.find((v) => v.id === id);
