/**
 * 옮기다 만 자리표가 남아 있나 (TASK-KL-338).
 *
 * ## 왜 생겼나 (2026-08-20 실측)
 *
 * `new:tool` 이 en·ja 말 묶음을 **`[EN] 실행` 같은 자리표**로 채운다. 「나중에 옮기면 되지」
 * 인데, 재 보니 **아무도 안 잡는다**: `test:i18n` 은 *열쇠가 있나*를 세지 *뜻이 있나*를 안
 * 센다. 자리표를 채운 순간 「en 14533/14533 (100%)」 로 초록이 된다.
 *
 * 그러면 자리표가 그대로 배포되어 **영어 사용자 화면에 `[EN] 실행` 이 뜬다.**
 * 「없는 것」은 게이트가 잡지만 「채운 척한 것」은 아무도 안 잡는다 — 그게 더 나쁘다.
 *
 * 그래서 자리표를 **기계가 볼 수 있는 표식**으로 두고 여기서 센다. 생성 직후에는 빨갛다.
 * 그게 맞다 — 그 도구는 아직 안 끝난 것이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const I18N = path.join(APP, 'i18n');

/** 생성기가 남기는 표식. 사람이 손으로 쓸 일이 없는 모양이라야 한다. */
const STUB = /^\[(EN|JA)\]\s/;

const found = [];
for (const loc of ['en', 'ja']) {
  const dir = path.join(I18N, loc);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json') || file.startsWith('.')) continue;
    let bag;
    try {
      bag = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch {
      continue; // 깨진 파일은 다른 검사가 잡는다
    }
    for (const [k, v] of Object.entries(bag)) {
      if (typeof v === 'string' && STUB.test(v)) found.push(`${loc}/${file}  ${k}`);
    }
  }
}

if (found.length > 0) {
  console.error(`[i18n-stub] 옮기다 만 자리표가 ${found.length}개 남아 있다:`);
  for (const f of found.slice(0, 20)) console.error(`  - ${f}`);
  if (found.length > 20) console.error(`  … 그 외 ${found.length - 20}개`);
  console.error('  이대로 배포하면 그 화면에 「[EN] 실행」 이 그대로 뜬다.');
  console.error('  `test:i18n` 은 열쇠가 있나만 세므로 여기 말고는 아무도 안 잡는다.');
  process.exit(1);
}
console.log('[i18n-stub] OK — 옮기다 만 자리표 없음');
