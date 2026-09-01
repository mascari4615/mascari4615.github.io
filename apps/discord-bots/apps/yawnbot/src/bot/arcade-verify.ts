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
import {
  normalizeOutcome,
  outcomeFromScores,
  outcomeKey,
  type RankedOutcome
} from '@karmo/arcade';
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
    /* 자리를 밖에서 줄 수 있게. 묶여 돌 때는 PKG_ROOT 가 어긋난다(검사 서버에서 실측) */
    const at = process.env.ARCADE_VERIFIER_FILE?.trim() || path.join(PKG_ROOT, 'data', 'arcade-verifier.cjs');
    const mod = req(at) as { verifyTape?: VerifyFn };
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
 * @param outcome 브라우저가 보고한 공동 순위
 */
export function agreesWithTape(
  tape: unknown,
  seatOf: string[],
  outcome: RankedOutcome
): { checked: boolean; agrees: boolean; why?: string; served?: RankedOutcome } {
  const v = verifier();
  if (!v) return { checked: false, agrees: true, why: '묶음이 없다' };
  if (!tape) return { checked: false, agrees: true, why: '패보가 없다' };

  const out = v(tape);
  if (!out.ok) return { checked: false, agrees: true, why: out.why ?? '못 셌다' };
  if (out.finished === false) return { checked: false, agrees: true, why: '안 끝난 판' };
  const reported = normalizeOutcome(outcome, seatOf);
  if (!reported) return { checked: true, agrees: false };

  let served: RankedOutcome | null = null;
  if (out.scores?.length === seatOf.length) served = outcomeFromScores(seatOf, out.scores);
  else if (out.ranks?.length === seatOf.length) {
    served = normalizeOutcome({ placements: out.ranks.map((seat) => [seatOf[seat]]) }, seatOf);
  }
  if (!served) return { checked: false, agrees: true, why: '자리 수가 다르다' };
  return { checked: true, agrees: outcomeKey(reported) === outcomeKey(served), served };
}
