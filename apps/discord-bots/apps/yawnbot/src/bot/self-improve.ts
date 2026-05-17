/**
 * self-improve — 자가개선 환경 트랙 검증 코어 (KAR-018-C slice-1, parent ②).
 *
 * 그릴-락:
 *  C-2 토폴로지 = substrate-순수 (governance.ts 형제, Discord/git/karmolab-ai 0).
 *  C-3 게이트   = compile∧test∧hook PASS ∧ 베이스라인 무악화만 accept (DGM).
 *  C-5 reject 도 archive (감사·재발방지).
 *
 * DGM(Sakana 2505.22954) 핵심: *검증 게이트 없으면 지표 날조*. 본 함수는
 * 입력 results 의 모든 게이트 boolean ∧ 베이스라인 delta ≤ 0 일 때만 accept —
 * 부분 통과·미상은 전부 reject. PASS 를 위조할 경로가 없다 (황금의 정신).
 * 실 compile/test/hook 실행·git Draft PR·jsonl write = 어댑터(slice-2 DI).
 */

export interface ProposalMeta {
  id: string;
  summary: string;
  /** 변경 대상 (hook/script/룰 파일). */
  targetFiles: string[];
  /** 도출 근거 (self-task / objective / user). */
  source: string;
}

export interface VerificationResults {
  compile: boolean;
  test: boolean;
  hook: boolean;
  /**
   * KAR-003 repo-metrics 베이스라인 대비 *악화* delta (재사용, 평행정의0).
   * 부정 지표(revert/fixup/drift 등) 합의 증가분: >0 = 회귀, ≤0 = 무악화.
   */
  baselineRegressionDelta: number;
}

export interface ArchiveEntry {
  ts: string;
  proposalId: string;
  summary: string;
  targetFiles: string[];
  source: string;
  verdict: 'accept' | 'reject';
  gates: { compile: boolean; test: boolean; hook: boolean };
  baselineRegressionDelta: number;
  reason: string;
}

export type ProposalVerdict =
  | { accept: true; entry: ArchiveEntry }
  | { accept: false; reason: string; entry: ArchiveEntry };

/**
 * 자가개선 propose 판정 (parent ②, DGM).
 *  accept ⟺ compile ∧ test ∧ hook ∧ (baselineRegressionDelta ≤ 0).
 *  그 외 전부 reject (부분 통과·미상 = 진행 X — 날조 0).
 * accept/reject 무관 ArchiveEntry 항상 생성 (C-5 감사).
 */
export function evaluateProposal(
  meta: ProposalMeta,
  results: VerificationResults,
): ProposalVerdict {
  const gatesPass = results.compile && results.test && results.hook;
  const noRegression = results.baselineRegressionDelta <= 0;
  const accept = gatesPass && noRegression;

  const reason = accept
    ? '전 게이트 PASS ∧ 베이스라인 무악화 (DGM accept)'
    : !gatesPass
      ? `게이트 fail (compile=${results.compile} test=${results.test} hook=${results.hook}) — 폐기`
      : `회귀 베이스라인 악화 (delta=${results.baselineRegressionDelta}) — 폐기`;

  const entry: ArchiveEntry = {
    ts: new Date().toISOString(),
    proposalId: meta.id,
    summary: meta.summary,
    targetFiles: meta.targetFiles,
    source: meta.source,
    verdict: accept ? 'accept' : 'reject',
    gates: {
      compile: results.compile,
      test: results.test,
      hook: results.hook,
    },
    baselineRegressionDelta: results.baselineRegressionDelta,
    reason,
  };

  return accept ? { accept: true, entry } : { accept: false, reason, entry };
}

/** ArchiveEntry → jsonl 한 줄 (discoveries 형식 동형 — 평행정의0). */
export function toArchiveLine(entry: ArchiveEntry): string {
  return JSON.stringify(entry) + '\n';
}
