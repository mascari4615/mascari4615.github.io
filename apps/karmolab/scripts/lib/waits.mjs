/**
 * 화면 검사가 상태를 기다리는 시간. 한 곳에서 정한다 (2026-09-03)
 *
 * 왜 있나: 10초가 검사 스물몇 개에 흩어져 있었다. 로컬에서는 넉넉한 값인데, 274 게이트가
 * 함께 도는 CI 에서는 판마다 다른 자리가 그 10초를 넘겼다. 다섯 판을 되짚으니 남은 빨강이
 * 전부 이 모양이었다 (speed, 오목 평면, 야추 굴리기, 채팅 이름표, 같이 있기 셋째 사람).
 * 로컬은 swiftshader 를 켜고 부하를 걸어도 초록이라 재현 안 됨
 *
 * 재는 것은 **되나**이지 몇 초 안에 되나가 아님. 그래서 CI 에서만 늘림
 * 로컬 검사는 그대로 빠르고, 영영 안 되는 진짜 결함은 여전히 걸림
 *
 *   import { WAIT } from './lib/waits.mjs';
 *   await page.waitForSelector('.foo', { timeout: WAIT });
 *
 * 손으로 바꾸는 자리는 환경변수 KL_WAIT (밀리초)
 */
export const WAIT = Number(process.env.KL_WAIT || (process.env.CI ? 30000 : 10000));
