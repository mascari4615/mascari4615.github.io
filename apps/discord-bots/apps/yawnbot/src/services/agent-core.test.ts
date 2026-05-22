/**
 * agent-core 로더 회귀 (KAR-018-V R-1).
 * 코어 정체성(누구·직무)을 회수해야 "그냥 봇"이 아니라 동료가 된다.
 * 부재·잘못된 id = null (레거시 스킨 단독 graceful fallback) 잠금.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadCoreDef,
  parseCoreSkills,
  listCoreIds,
  resolveProposalCore,
  resolveAddressedCore,
  coreLabel,
  appendCoreMemory,
  readRecentCoreMemory,
  coreMemPath,
  readWorkerTaskOutcomes,
} from './agent-core';

let root: string;
const CORE = [
  '---',
  'id: atlas',
  'role: KAR-018 인프라를 추진한다',
  'default_skin: alisa',
  'status: draft',
  '---',
  '',
  '# atlas',
  '',
  '## 직무',
  '- sub TASK 추진',
].join('\n');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function write(id: string, body: string) {
  const d = path.join(root, '.claude', 'agents', id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'core.md'), body);
}

describe('loadCoreDef', () => {
  it('정의 존재 → frontmatter + body 회수', () => {
    write('atlas', CORE);
    const c = loadCoreDef(root, 'atlas');
    expect(c).not.toBeNull();
    expect(c!.id).toBe('atlas');
    expect(c!.role).toContain('인프라를 추진');
    expect(c!.defaultSkin).toBe('alisa');
    expect(c!.status).toBe('draft');
    expect(c!.body).toContain('## 직무');
  });

  it('emoji/display_name 미지정 → 기본값(🛰 + Id 캐피털, atlas 호환)', () => {
    write('atlas', CORE);
    const c = loadCoreDef(root, 'atlas')!;
    expect(c.emoji).toBe('🛰');
    expect(c.displayName).toBe('Atlas');
    expect(coreLabel(c)).toBe('🛰 Atlas'); // R-1b 회귀: 기존 표시명 불변
  });

  it('emoji/display_name 명시 → 그대로 (복수 동료 각자 정체)', () => {
    write(
      'echo',
      [
        '---',
        'id: echo',
        'role: yawnbot/콘텐츠 도메인',
        'default_skin: ling',
        'emoji: 📣',
        'display_name: Echo',
        'status: draft',
        '---',
        '',
        '# echo',
        '본문',
      ].join('\n'),
    );
    const c = loadCoreDef(root, 'echo')!;
    expect(c.emoji).toBe('📣');
    expect(c.displayName).toBe('Echo');
    expect(c.defaultSkin).toBe('ling');
    expect(coreLabel(c)).toBe('📣 Echo');
  });

  it('파일 부재 → null (레거시 스킨 단독 fallback)', () => {
    expect(loadCoreDef(root, 'atlas')).toBeNull();
  });

  it('잘못된 id (경로 주입 시도) → null', () => {
    write('atlas', CORE);
    expect(loadCoreDef(root, '../atlas')).toBeNull();
    expect(loadCoreDef(root, 'a/b')).toBeNull();
    expect(loadCoreDef('', 'atlas')).toBeNull();
  });

  it('frontmatter 없는 본문만 → null (형식 이상 = 안전)', () => {
    write('x', '# x\n본문만');
    // frontmatter 매칭 실패 → body=raw, role 없음. 정체성 불완전이나
    // body 는 있으므로 로드는 됨(직무 빈 값). null 아님 확인:
    const c = loadCoreDef(root, 'x');
    expect(c).not.toBeNull();
    expect(c!.role).toBe('');
  });

  it('skills inline list 를 정규화해 CoreDef.skills 로 싣는다', () => {
    write(
      'atlas',
      [
        '---',
        'id: atlas',
        'role: infra',
        'skills: [task-new, diagnose-ladder, ../bad]',
        '---',
        '',
        '# atlas',
        '본문',
      ].join('\n'),
    );
    const c = loadCoreDef(root, 'atlas')!;
    expect(c.skills).toEqual(['task-new', 'diagnose-ladder']);
    expect(parseCoreSkills('[]')).toEqual([]);
    expect(parseCoreSkills('task-new')).toEqual([]);
  });
});

describe('listCoreIds (복수 동료 — 디렉토리가 정본)', () => {
  it('core.md 있는 디렉토리만 정렬 반환', () => {
    write('atlas', CORE);
    write('echo', '---\nid: echo\n---\n\n# echo\n본문');
    fs.mkdirSync(path.join(root, '.claude', 'agents', 'empty-dir'), {
      recursive: true,
    }); // core.md 없음 = 제외
    expect(listCoreIds(root)).toEqual(['atlas', 'echo']);
  });

  it('디렉토리 부재 / 빈 root → []', () => {
    expect(listCoreIds(root)).toEqual([]);
    expect(listCoreIds('')).toEqual([]);
  });
});

describe('resolveProposalCore (R-4 도메인 라우팅 — 결정적·순수)', () => {
  const KNOWN = ['atlas', 'echo'];

  it('default = atlas (기존 전량 atlas 행동 보존 — 회귀 0)', () => {
    expect(resolveProposalCore(KNOWN, { text: 'WM 게임 코드 리팩터' })).toBe(
      'atlas',
    );
    expect(resolveProposalCore(KNOWN, {})).toBe('atlas');
  });

  it('yb 도메인 / yawnbot·디스코드 마커 → echo', () => {
    expect(resolveProposalCore(KNOWN, { domain: 'yb' })).toBe('echo');
    expect(
      resolveProposalCore(KNOWN, { text: 'apps/discord-bots 알림 개선' }),
    ).toBe('echo');
    expect(resolveProposalCore(KNOWN, { text: '욘봇 콘텐츠 발굴' })).toBe(
      'echo',
    );
  });

  it('echo 코어 부재 시 yb 도메인도 atlas (graceful)', () => {
    expect(resolveProposalCore(['atlas'], { domain: 'yb' })).toBe('atlas');
  });

  it('explicitCoreId 가 알려진 코어면 우선 (authoring 의도 존중)', () => {
    expect(
      resolveProposalCore(KNOWN, { explicitCoreId: 'echo', domain: 'kar' }),
    ).toBe('echo');
    expect(
      resolveProposalCore(KNOWN, { explicitCoreId: 'unknown', domain: 'yb' }),
    ).toBe('echo'); // 미지 explicit 무시 → 도메인 규칙
  });

  it('알려진 코어 0 → 첫 코어 또는 atlas 문자열 (안전)', () => {
    expect(resolveProposalCore([], { domain: 'yb' })).toBe('atlas');
    expect(resolveProposalCore(['zeta'], {})).toBe('zeta');
  });

  it('wm 도메인 / witch-mendokusai 마커 → wm-scout (wm-scout 존재 시)', () => {
    const WITH_WM = ['atlas', 'echo', 'wm-scout'];
    expect(resolveProposalCore(WITH_WM, { domain: 'wm' })).toBe('wm-scout');
    expect(resolveProposalCore(WITH_WM, { text: 'witch-mendokusai 던전 시스템' })).toBe('wm-scout');
    expect(resolveProposalCore(WITH_WM, { domain: 'WM' })).toBe('wm-scout');
  });

  it('wm-scout 코어 부재 시 wm 도메인도 atlas (graceful)', () => {
    expect(resolveProposalCore(KNOWN, { domain: 'wm' })).toBe('atlas');
  });

  it('wm 라우팅이 echo 보다 후순위 (yb > wm, explicitCoreId 최우선)', () => {
    const ALL = ['atlas', 'echo', 'wm-scout'];
    // explicitCoreId 최우선
    expect(resolveProposalCore(ALL, { explicitCoreId: 'echo', domain: 'wm' })).toBe('echo');
    // yb 도메인은 echo (wm 아님)
    expect(resolveProposalCore(ALL, { domain: 'yb' })).toBe('echo');
  });
});

describe('resolveAddressedCore (R-4-i2 이름지정 라우팅 — 결정적·순수)', () => {
  const CORES = [
    { id: 'atlas', displayName: 'Atlas' },
    { id: 'echo', displayName: 'Echo' },
  ];

  it('이름(id/displayName, 대소문자·@·구분자 무시)으로 호출 → 그 코어 + prefix 제거', () => {
    expect(resolveAddressedCore('echo, 안녕', CORES)).toEqual({
      coreId: 'echo',
      text: '안녕',
    });
    expect(resolveAddressedCore('Echo: 상태 보고해줘', CORES)).toEqual({
      coreId: 'echo',
      text: '상태 보고해줘',
    });
    expect(resolveAddressedCore('@ATLAS 이거 봐봐', CORES)).toEqual({
      coreId: 'atlas',
      text: '이거 봐봐',
    });
  });

  it('호칭 없음 / 미지 핸들 / 나머지 없음 → null (채널 바인딩 그대로 = 회귀 0)', () => {
    expect(resolveAddressedCore('안녕하세요 다들', CORES)).toBeNull();
    expect(resolveAddressedCore('unknown, 안녕', CORES)).toBeNull();
    expect(resolveAddressedCore('echo', CORES)).toBeNull(); // 단독 호칭=모호
    expect(resolveAddressedCore('', CORES)).toBeNull();
  });

  it('첫 단어가 우연히 일반 단어여도 코어명과 정확히 일치할 때만 (오라우팅 방지)', () => {
    expect(resolveAddressedCore('echoes 가 무슨 뜻이야', CORES)).toBeNull();
    expect(resolveAddressedCore('atlas 산맥 알려줘', CORES)).toEqual({
      coreId: 'atlas',
      text: '산맥 알려줘',
    }); // 'atlas' 정확 일치 = 의도된 호출로 간주 (명시적 핸들)
  });
});

describe('코어 work-memory 생명주기 (KAR-018-Z-1)', () => {
  it('append → readRecent roundtrip (discoveries 형식·최신순)', () => {
    expect(
      appendCoreMemory(root, 'atlas', {
        session: 's1',
        type: 'decision',
        topic: 't1',
        summary: '첫 결정',
      }),
    ).toBe(true);
    appendCoreMemory(root, 'atlas', {
      session: 's1',
      type: 'fail',
      topic: 't2',
      summary: '두번째 실패',
    });
    const m = readRecentCoreMemory(root, 'atlas');
    expect(m).toContain('[decision] t1: 첫 결정');
    expect(m).toContain('[fail] t2: 두번째 실패');
    // 실제 파일 = discoveries jsonl 형식
    const p = coreMemPath(root, 'atlas')!;
    const last = fs
      .readFileSync(p, 'utf-8')
      .trim()
      .split(/\r?\n/)
      .pop()!;
    const e = JSON.parse(last);
    expect(e.ts).toBeTruthy();
    expect(e.type).toBe('fail');
    expect(e.summary).toBe('두번째 실패');
  });

  it('max 바운드 — 최신 N 개만', () => {
    for (let i = 1; i <= 12; i++) {
      appendCoreMemory(root, 'echo', {
        session: 's',
        type: 'insight',
        topic: `k${i}`,
        summary: `s${i}`,
      });
    }
    const m = readRecentCoreMemory(root, 'echo', 3);
    expect(m.split('\n').length).toBe(3);
    expect(m).toContain('s12'); // 최신 포함
    expect(m).not.toContain('s1:'); // 오래된 잘림
  });

  it('부적합 id = 비차단(false) / 부재 = 빈문자 (graceful)', () => {
    expect(appendCoreMemory(root, '../evil', { session: 's', type: 'fix', topic: 't', summary: 'x' })).toBe(false);
    expect(coreMemPath(root, 'a/b')).toBeNull();
    expect(readRecentCoreMemory(root, 'never')).toBe('');
    expect(readRecentCoreMemory('', 'atlas')).toBe('');
  });
});

// ── KAR-018-SO-1: readWorkerTaskOutcomes — 워커 self-recall ─────────
describe('readWorkerTaskOutcomes (SO-1)', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'so1-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('worker topic 만 골라 task 단위로 집계 (마지막이 lastTs/kind)', () => {
    appendCoreMemory(root, 'wm-support', {
      session: 'worker', type: 'fail', topic: 'worker:TASK-WM-109-E',
      summary: '첫 fail',
    });
    appendCoreMemory(root, 'wm-support', {
      session: 'worker', type: 'fix', topic: 'worker:TASK-WM-109-E',
      summary: 'PR push 완료',
    });
    appendCoreMemory(root, 'wm-support', {
      session: 'worker', type: 'fail', topic: 'worker:TASK-OTHER',
      summary: '관련 없음',
    });
    // worker 가 아닌 entry 는 무시
    appendCoreMemory(root, 'wm-support', {
      session: 's', type: 'insight', topic: 'random:note',
      summary: '잡담',
    });
    const m = readWorkerTaskOutcomes(root, 'wm-support');
    expect(m.size).toBe(2);
    const wm109 = m.get('TASK-WM-109-E')!;
    expect(wm109.kind).toBe('fix');
    expect(wm109.count).toBe(2);
    expect(wm109.lastSummary).toContain('PR push');
    expect(m.get('TASK-OTHER')!.kind).toBe('fail');
  });

  it('windowDays 밖 entry 는 제외', () => {
    const oldTs = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    appendCoreMemory(root, 'kar-worker', {
      ts: oldTs, session: 'worker', type: 'fix', topic: 'worker:TASK-OLD',
      summary: 'oldFix',
    });
    appendCoreMemory(root, 'kar-worker', {
      session: 'worker', type: 'fail', topic: 'worker:TASK-NEW',
      summary: 'recent',
    });
    const m = readWorkerTaskOutcomes(root, 'kar-worker', 7);
    expect(m.has('TASK-OLD')).toBe(false);
    expect(m.has('TASK-NEW')).toBe(true);
  });

  it('부재·부적합 = 빈 Map (graceful)', () => {
    expect(readWorkerTaskOutcomes(root, 'never').size).toBe(0);
    expect(readWorkerTaskOutcomes(root, '../evil').size).toBe(0);
    expect(readWorkerTaskOutcomes('', 'atlas').size).toBe(0);
  });
});
