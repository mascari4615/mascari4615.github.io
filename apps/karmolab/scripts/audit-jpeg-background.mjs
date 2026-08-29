/**
 * JPG 로 내보내는데 **바탕을 안 까는 곳**을 찾는다 (TASK-KL-272).
 *
 * JPG 는 투명을 못 담는다. 캔버스를 그대로 JPG 로 내보내면 **투명하던 자리가 새까맣게** 나온다.
 * 오류도 안 뜨고 미리보기를 대충 보면 넘어가는, 조용한 고장이다.
 * 실제로 사진 크기 맞추기가 이 상태였고, 공용 함수로 모으다가 **세어 보고** 찾았다.
 *
 * 그 세어 보기를 손이 아니라 여기에 둔다. 룰을 글로만 적어 두면 다음 도구가 또 어긴다.
 * (정본: `memo/rules/quality.md § 자동화 가능 룰은 코드로`)
 *
 * ## 무엇을 빨갛다고 하나
 *
 * 캔버스를 **JPG/WebP 로 내보내면서**(`toBlob(..., 'image/jpeg')` 또는 형식을 변수로 넘기며)
 *   - 공용 `encode()` 를 안 쓰고
 *   - 스스로 바탕도 안 까는(`fillRect` 없음)
 * 파일. 셋 중 하나라도 하면 초록이다. **막는 게 목적이 아니라 검은 그림을 막는 게 목적**이다.
 *
 * 사용: node scripts/audit-jpeg-background.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'src', 'widgets', 'tools');

/** 이 줄들은 내보내기가 아니라 받는 형식이다. accept, input 선언은 세지 않는다. */
const INTAKE = /accept|accepts:|input |f\.type|file\.type|blob\.type|\.type ===/;

const bad = [];
const walk = (d) => {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    if (fs.statSync(p).isDirectory()) {
      if (name !== 'shared') walk(p);
      continue;
    }
    if (!name.endsWith('.ts')) continue;

    const src = fs.readFileSync(p, 'utf8');
    if (!/\.toBlob\(/.test(src)) continue;

    /* 내보내는 자리에서 JPG/WebP 를 말하는가. 받는 형식 줄은 뺀다 */
    const saysLossy = src
      .split('\n')
      .some((l) => /image\/(jpeg|webp)/.test(l) && !INTAKE.test(l));
    /* 형식을 변수로 넘기는 경우도 위험하다. 그 변수에 jpeg 가 들어올 수 있다 */
    const passesVar = /\.toBlob\([^)]*,\s*(type|format|fmt|mime)\b/.test(src);
    if (!saysLossy && !passesVar) continue;

    const usesShared = /\bencode\(/.test(src) && /from '\.\/shared\/image'/.test(src);
    const fillsBackground = /fillRect\(/.test(src);
    if (!usesShared && !fillsBackground) bad.push(name);
  }
};
walk(dir);

if (bad.length) {
  console.error('[audit-jpeg-background] JPG 로 내보내는데 흰 바탕을 안 깝니다. 투명한 데가 검게 나옵니다:');
  bad.forEach((f) => console.error(`  - ${f}`));
  console.error("  고치는 법: `shared/image` 의 encode(canvas, 'jpeg', q) 를 쓰세요 (바탕을 먼저 깔아 줍니다).");
  process.exit(1);
}
console.log('[audit-jpeg-background] JPG 로 내보내는 곳은 전부 바탕을 깝니다');
