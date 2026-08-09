/**
 * 브라우저를 띄우되, **없으면 「못 돈다」고 말하고 비킨다** (TASK-KL-203 S17)
 *
 * 2026-08-09 실측: 배포가 `smoke-pulse` 에서 죽었다 — 그 자리에는 아직 브라우저가 안 깔려 있다
 * (깔리는 단계는 훨씬 뒤, 미리 그리기 직전이다). 검사는 잘못한 게 없고 도구도 멀쩡한데
 * **사이트 전체가 안 나갔다**.
 *
 * 「실패」와 「못 돈다」는 다르다. 볼 수 없는 자리에서 빨간불을 내면 그 빨강은 아무 뜻이 없고,
 * 그런 빨강이 배포 길목에 있으면 전원이 멈춘다. 그래서 브라우저가 없으면 **건너뛴다** —
 * 그리고 건너뛴 것을 화면에 남긴다(조용히 통과하면 그건 꺼진 검사다).
 *
 * 쓰는 법:
 *   const browser = await launchOrSkip('widget-i18n');
 *   if (!browser) process.exit(0);
 */
import { chromium } from 'playwright';

export async function launchOrSkip(name, options = {}) {
  try {
    return await chromium.launch(options);
  } catch (e) {
    const msg = String(e && e.message);
    /* 브라우저 알맹이가 없을 때만 비킨다. 그 밖의 실패(권한·시스템 라이브러리)는 진짜 고장이라
       그대로 터뜨린다 — 여기서 다 삼키면 검사가 영영 안 도는 것을 아무도 모른다. */
    if (/Executable doesn't exist|please install|browserType\.launch: .*ENOENT/i.test(msg)) {
      console.log(`[${name}] 이 자리에는 브라우저가 없다 — 건너뜀 (playwright install 뒤에 도는 자리에서 확인된다)`);
      return null;
    }
    throw e;
  }
}
