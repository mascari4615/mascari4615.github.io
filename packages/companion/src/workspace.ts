import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 작업공간 이웃 찾기 — **자산을 「이 저장소 기준 상대 경로」로 박지 않는다.**
 *
 * 얘가 쓰는 무거운 것들은 이 저장소 안에 없다. 3D 몸은 게임 저장소에, 로컬 목소리와
 * 받아쓰기 모델은 메모 저장소에, 창 프로그램은 구운 자리에 있다. 여태 그 자리를
 * 「여기서 세 겹 위의 <name>」으로 박아 뒀는데, 세션이 자기 작업 폴더(워크트리)에서
 * 얘를 띄우면 그 위엔 이웃이 없다.
 *
 * 그래서 실제로 이런 일이 났다(사용자 실측 2026-08-08): **로컬 목소리가 목록에서 통째로
 * 사라지고**(인터넷 목소리만 남음), **3D 몸이 큐브로 바뀌고**, **창이 옛 방식으로 떠서
 * 형광 분홍 바탕에 창틀이 붙었다.** 셋 다 같은 병이고, 셋 다 조용했다 — 「코드가 회귀된
 * 것 같다」로 보이는 게 당연하다.
 *
 * 이웃은 **어느 사본이든 같은 물건**이다(게임 에셋·모델 파일·구운 실행 파일). 그러니
 * 위로 몇 겹 훑어 찾는다. 못 찾으면 `null` — 부르는 쪽이 **그 사실을 말해야 한다.**
 */

const here = dirname(__filename);

/** 이 패키지가 든 저장소의 뿌리 (`packages/companion` 위 두 겹). */
export function thisRepo(): string {
  return join(here, '..', '..', '..');
}

/**
 * 작업공간에서 이 이름의 이웃 폴더를 찾는다.
 *
 * @param name 찾을 폴더 name (`memo` / `WitchMendokusai` 등)
 * @param expected 그 안에 반드시 있어야 하는 것 — 이름만 같은 빈 폴더를 집지 않으려고
 */
export function sibling(name: string, expected?: string): string | null {
  let above = thisRepo();
  for (let layer = 0; layer < 4; layer += 1) {
    above = join(above, '..');
    const slot = join(above, name);
    if (existsSync(slot) && (expected === undefined || existsSync(join(slot, expected)))) return slot;
  }
  return null;
}

/**
 * 이 저장소와 같은 것(같은 프로젝트의 다른 사본)들.
 *
 * 워크트리는 `<작업공간>/.lanes/<슬롯>/<저장소>` 처럼 몇 겹 안에 있으므로 위로 훑는다.
 * 구운 실행 파일처럼 **한 벌만 있어도 되는 것**을 찾을 때 쓴다.
 */
export function repoCopies(mark: string): string[] {
  const produced: string[] = [];
  const self = thisRepo();
  let above2 = self;
  for (let layer2 = 0; layer2 < 4; layer2 += 1) {
    above2 = join(above2, '..');
    let list: string[];
    try {
      list = readdirSync(above2);
    } catch {
      continue;
    }
    for (const name2 of list) {
      const slot2 = join(above2, name2);
      if (slot2 !== self && existsSync(join(slot2, mark)) && produced.includes(slot2) === false) produced.push(slot2);
    }
  }
  return produced;
}
