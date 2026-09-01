/**
 * 검사가 붙잡을 문 하나 (사용자 2026-09-01)
 *
 * 오락실 라우트 넷을 한 번에. 검사 서버가 이것만 부르면 진짜와 같은 것
 * 여기 없는 것(디스코드, 크론, 웹훅)은 검사에 필요 없고, 들이면 토큰이 필요해짐
 */
import type { Application } from 'express';
import { registerArcadeQueue } from './arcade-queue';
import { registerArcadeReport } from './arcade-report';
import { registerArcadeTape } from './arcade-tape';
import { registerArcadeRooms } from './arcade-rooms';
import type { WhoOf } from './arcade-who';

export function registerForE2E(app: Application, who: WhoOf): void {
  registerArcadeRooms(app);
  registerArcadeQueue(app, who);
  registerArcadeReport(app, who);
  registerArcadeTape(app, who);
}
