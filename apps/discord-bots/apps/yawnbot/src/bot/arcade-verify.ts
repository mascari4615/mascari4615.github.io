/**
 * 서버가 판을 다시 셈한다 (change.arcade-online)
 *
 * 여태 점수는 브라우저 말만 믿고 움직였다. 전원이 같은 순서를 보내야 반영되니 혼자 하는
 * 거짓말은 막혔지만, 판을 굴리는 주인이 커널을 손대면 막을 길이 없었음. 주인이 곧 심판
 *
 * 커널이 결정적이라 서버가 같은 판을 다시 굴릴 수 있다. 그 묶음은 사이트 쪽에서 구운
 * `data/arcade-verifier.cjs` (`karmolab/scripts/build-arcade-verifier.mjs`).
 *
 * 규율 둘
 *  ① **없으면 조용히 물러선다.** 묶음이 안 구워진 배포에서 점수가 통째로 멈추면 그게 더 나쁨
 *  ② **못 셌다와 다르다를 가른다.** 모르는 놀이나 깨진 패보는 못 셌다다. 그건 거짓말이 아님
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { PKG_ROOT } from '../paths';

/* 이 패키지는 CommonJS 로 굽는다. 그래서 자리는 PKG_ROOT 에서 잡는다 */
const req = createRequire(path.join(PKG_ROOT, 'package.json'));

export interface Verdict {
  ok: boolean;
  why?: string;
  ranks?: number[];
  scores?: number[];
  finished?: boolean;
}

type VerifyFn = (tape: unknown) => Verdict;

let fn: VerifyFn | null = null;
let looked = false;

/** 검사용 뒷문. 진짜 묶음 없이도 이 자리를 잴 수 있게 */
export function setVerifier(f: VerifyFn | null): void {
  fn = f;
  looked = true;
}

function verifier(): VerifyFn | null {
  if (looked) return fn;
  looked = true;
  try {
    const mod = req(path.join(PKG_ROOT, 'data', 'arcade-verifier.cjs')) as { verifyTape?: VerifyFn };
    fn = typeof mod.verifyTape === 'function' ? mod.verifyTape : null;
  } catch {
    /* 안 구워진 배포. 물러선다 */
    fn = null;
  }
  return fn;
}

export function verifierReady(): boolean {
  return verifier() !== null;
}

/**
 * 보고된 순서가 패보와 맞나
 *
 * @param tape 그 판의 패보. 없으면 못 셈
 * @param seatOf 자리 번호를 사람 id 로. 서버가 든 roster 순서
 * @param ranks 브라우저가 보고한 순서 (사람 id)
 */
export function agreesWithTape(
  tape: unknown,
  seatOf: string[],
  ranks: string[]
): { checked: boolean; agrees: boolean; why?: string; served?: string[] } {
  const v = verifier();
  if (!v) return { checked: false, agrees: true, why: '묶음이 없다' };
  if (!tape) return { checked: false, agrees: true, why: '패보가 없다' };

  const out = v(tape);
  if (!out.ok || !out.ranks) return { checked: false, agrees: true, why: out.why ?? '못 셌다' };
  if (out.finished === false) return { checked: false, agrees: true, why: '안 끝난 판' };
  if (out.ranks.length !== seatOf.length) return { checked: false, agrees: true, why: '자리 수가 다르다' };

  const served = out.ranks.map((seat) => seatOf[seat]);
  const score = new Map(seatOf.map((id, i) => [id, out.scores?.[i] ?? 0]));

  /* 보고에 그 판 사람이 빠짐없이, 한 번씩 있어야 함 */
  if (ranks.length !== seatOf.length || new Set(ranks).size !== ranks.length) {
    return { checked: true, agrees: false, served };
  }
  if (ranks.some((id) => !score.has(id))) return { checked: true, agrees: false, served };

  /**
   * **보고된 순서를 따라가며 점수가 안 오르면 맞다.**
   *
   * 서버가 센 순서와 글자 그대로 같아야 한다고 하면 안 된다. 같은 점수는 같은 등수라
   * 무승부의 순서는 아무래도 좋고, 그걸 거짓말로 몰면 비긴 판마다 점수가 멈춤
   */
  let agrees = true;
  for (let i = 1; i < ranks.length; i++) {
    if ((score.get(ranks[i - 1]) ?? 0) < (score.get(ranks[i]) ?? 0)) agrees = false;
  }
  return { checked: true, agrees, served };
}
