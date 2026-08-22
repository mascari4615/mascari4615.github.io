/**
 * 자들이 볼 지도 파일을 고른다 — 진짜가 없으면 **가짜 지도**로 (TASK-KAR-233).
 *
 * 왜: 지도 데이터는 글 제목·경로가 다 들어 있어 레포에 못 담는다(비공개). 그래서 CI 에는
 * 그 파일이 없고, 자 스물 중 **열아홉이 「지도가 없다」며 건너뛰었다** — 초록인데 아무것도
 * 안 재는 상태였다. 이 프로젝트가 이미 한 번 죽은 방식이다
 * (「검사기가 있다고 검사가 도는 건 아니다」).
 *
 * 고치는 법은 자를 고치는 게 아니라 **재료를 주는 것**이다. 진짜 글은 한 줄도 안 든
 * 가짜 지도를 레포에 담아 두고, 진짜가 없을 때 그걸 본다. 자는 그대로 돌고,
 * 자기가 가짜를 보고 있다는 것만 알면 된다.
 */
import fs from 'node:fs';
import path from 'node:path';

let said = false;

/** 진짜 지도가 있으면 그것, 없으면 가짜. 둘 다 없으면 null. */
export function atlasPath(here) {
  /* **밖에서 지도를 갈아 끼울 수 있게 한다** (`ATLAS_FILE`). 망가뜨림 검사가 판마다
     제 사본을 보게 하려는 것 — 한 파일을 여럿이 돌려 쓰면 **동시에 못 돌리고**,
     한 판이 죽으면 남의 자료가 망가진 채 남는다(실제로 두 번 겪었다). */
  const from = process.env.ATLAS_FILE;
  if (from && fs.existsSync(from)) return from;
  const data = path.resolve(here, '..', 'data');
  const real = path.join(data, 'memo-atlas.json');
  if (fs.existsSync(real)) return real;
  const fake = path.join(data, 'memo-atlas-fake.json');
  if (!fs.existsSync(fake)) return real;      // 없으면 진짜 이름을 돌려준다(자가 「없다」고 말하게)
  /* **가짜를 본다는 걸 대놓고 말한다.** 모르고 재면 「초록이니 괜찮다」로 읽힌다. */
  if (!said) { said = true; console.log('[atlas-file] 진짜 지도가 없어 **가짜 지도**로 잰다 (CI 에서 이렇게 돈다)'); }
  return fake;
}

/** 벡터 곳간도 같은 규칙. */
export function cachePath(here) {
  const data = path.resolve(here, '..', 'data');
  const real = path.join(data, '.memo-atlas-cache.json');
  if (fs.existsSync(real)) return real;
  const fake = path.join(data, 'memo-atlas-fake-cache.json');
  return fs.existsSync(fake) ? fake : real;
}

/** 지금 보고 있는 게 가짜인가 — 자가 알리게 한다. 모르고 재면 그게 더 나쁘다. */
export function isFake(p) {
  return path.basename(p).startsWith('memo-atlas-fake');
}
