/**
 * agent-worker-pr-exclude 순수 코어 전수검증 (gh·FS 무관, 결정적).
 * 회귀 잠금: open Draft PR 가 열려있는 TASK 는 워커가 재선택하지 않는다
 * (TASK-KAR-018-X prod 선결, KL-053 재선택 사고 재발 방지).
 */
import { describe, it, expect } from 'vitest';
import {
  parseTaskIdsFromText,
  extractTaskIds,
  fetchOpenPRTaskIds,
  type GhResult,
  type PrSummary,
} from './agent-worker-pr-exclude';

describe('parseTaskIdsFromText (순수)', () => {
  it('PR 제목에서 TASK id 1건', () => {
    expect(parseTaskIdsFromText('feat: TASK-WM-119 신경전 보스 안전 가드'))
      .toEqual(['TASK-WM-119']);
  });

  it('워커 브랜치 slug(소문자) → 대문자 normalize', () => {
    expect(parseTaskIdsFromText('feature/autopilot-task-kl-053-2605171306'))
      .toEqual(['TASK-KL-053']);
  });

  it('suffix (TASK-KL-055-B) 포함', () => {
    expect(parseTaskIdsFromText('refactor: TASK-KL-055-B 분리'))
      .toEqual(['TASK-KL-055-B']);
  });

  it('한 문자열 다중 매치 dedupe', () => {
    expect(parseTaskIdsFromText('TASK-WM-1 와 TASK-WM-1 그리고 TASK-WM-2'))
      .toEqual(['TASK-WM-1', 'TASK-WM-2']);
  });

  it('매치 없음 / null / 빈문자 = 빈 배열', () => {
    expect(parseTaskIdsFromText('hotfix without id')).toEqual([]);
    expect(parseTaskIdsFromText('')).toEqual([]);
    expect(parseTaskIdsFromText(undefined)).toEqual([]);
    expect(parseTaskIdsFromText(null)).toEqual([]);
  });

  it('가짜 패턴 (TASK-123 = prefix 누락) 매치 X', () => {
    // 단문자 prefix(`TASK-x-...`) 도 위양성 차단 — PREFIX 최소 2자 강제.
    expect(parseTaskIdsFromText('TASK-123 와 TASK-x-1')).toEqual([]);
  });

  it('워드 형식 TASK-KAR-MEMOSYNC (번호 없음)', () => {
    expect(parseTaskIdsFromText('docs: TASK-KAR-MEMOSYNC part4'))
      .toEqual(['TASK-KAR-MEMOSYNC']);
  });

  it('ts 가 letter+digit 으로 시작해도 흡수 X (TASK-KL-055-B 만, ts 미흡수)', () => {
    // 워커 브랜치 ts 는 10자리 숫자이지만 방어적으로 lett-start 만 suffix 인정.
    expect(parseTaskIdsFromText('feature/autopilot-task-kl-055-b-2605171306'))
      .toEqual(['TASK-KL-055-B']);
  });
});

describe('extractTaskIds (순수)', () => {
  it('title + headRefName 모두 스캔, 합쳐서 dedupe (ts 접미 흡수 X)', () => {
    const prs: PrSummary[] = [
      // 동일 TASK 가 title·headRef 양쪽에 — set 1건으로 dedupe.
      // ts 접미(`-2605171306`) 는 *숫자만* 이라 TASK suffix 슬롯에 안 잡힘.
      { title: 'feat: TASK-KL-053 …', headRefName: 'feature/autopilot-task-kl-053-2605171306' },
      { title: 'refactor: TASK-WM-119', headRefName: 'feature/wm-119' },
      { title: 'docs only', headRefName: 'docs/readme' },
    ];
    const ids = extractTaskIds(prs);
    expect(ids.has('TASK-KL-053')).toBe(true);
    expect(ids.has('TASK-WM-119')).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('빈 입력 = 빈 set', () => {
    expect(extractTaskIds([]).size).toBe(0);
  });

  it('title 누락 시 headRefName 만으로도 추출', () => {
    const ids = extractTaskIds([{ headRefName: 'feature/autopilot-task-kar-018-x-2605200147' }]);
    expect([...ids]).toEqual(['TASK-KAR-018-X']);
  });

  it('headRefName 누락 시 title 만으로도 추출', () => {
    const ids = extractTaskIds([{ title: 'fix: TASK-KL-061 ledger' }]);
    expect([...ids]).toEqual(['TASK-KL-061']);
  });
});

describe('fetchOpenPRTaskIds (best-effort IO 셸)', () => {
  const fakeGh = (byRepo: Record<string, GhResult>) =>
    (repoRoot: string): GhResult =>
      byRepo[repoRoot] ?? { out: '', fail: true };

  it('다중 repo 합집합 dedupe', () => {
    const wm = JSON.stringify([
      { title: 'TASK-WM-119', headRefName: 'feature/wm-119' },
    ]);
    const io = JSON.stringify([
      // 워커 브랜치 정식 형식: feature/autopilot-<task-slug>-<ts10>.
      { title: 'feat: TASK-KL-053', headRefName: 'feature/autopilot-task-kl-053-2605171306' },
      { title: 'feat: TASK-KL-053 (dup)', headRefName: 'other-branch' },
    ]);
    const ids = fetchOpenPRTaskIds(
      ['/u/WM', '/u/io'],
      fakeGh({
        '/u/WM': { out: wm, fail: false },
        '/u/io': { out: io, fail: false },
      }),
    );
    expect([...ids].sort()).toEqual(['TASK-KL-053', 'TASK-WM-119']);
  });

  it('한 repo 실패 → 다른 repo 결과로 계속 (best-effort)', () => {
    const io = JSON.stringify([{ title: 'TASK-KL-053' }]);
    const ids = fetchOpenPRTaskIds(
      ['/u/WM', '/u/io'],
      fakeGh({
        '/u/WM': { out: '', fail: true }, // 비-repo / gh 미설치
        '/u/io': { out: io, fail: false },
      }),
    );
    expect([...ids]).toEqual(['TASK-KL-053']);
  });

  it('모든 repo 실패 → 빈 set (워커 tick 비차단)', () => {
    const ids = fetchOpenPRTaskIds(['/u/WM', '/u/io'], () => ({ out: '', fail: true }));
    expect(ids.size).toBe(0);
  });

  it('gh 비정상 출력 (JSON parse 실패) → 해당 repo 무시', () => {
    const ids = fetchOpenPRTaskIds(
      ['/u/WM'],
      fakeGh({ '/u/WM': { out: 'not json', fail: false } }),
    );
    expect(ids.size).toBe(0);
  });

  it('gh 출력 = 객체(배열 아님) → 해당 repo 무시 (방어)', () => {
    const ids = fetchOpenPRTaskIds(
      ['/u/WM'],
      fakeGh({ '/u/WM': { out: JSON.stringify({ error: 'auth' }), fail: false } }),
    );
    expect(ids.size).toBe(0);
  });

  it('빈 repo 목록 = 빈 set', () => {
    expect(fetchOpenPRTaskIds([], () => ({ out: '', fail: true })).size).toBe(0);
  });

  it('빈 문자열 repo 항목은 skip (방어)', () => {
    const ids = fetchOpenPRTaskIds(['', '/u/io'], (root) =>
      root === '/u/io'
        ? { out: JSON.stringify([{ title: 'TASK-WM-1' }]), fail: false }
        : { out: '', fail: true },
    );
    expect([...ids]).toEqual(['TASK-WM-1']);
  });
});
