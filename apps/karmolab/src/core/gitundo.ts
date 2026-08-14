/**
 * git 되돌리기 — 「망했다」에서 명령까지 (TASK-KL-316 / 12)
 *
 * git 은 **되돌리는 법이 상황마다 다르다**. 밀었냐 안 밀었냐, 남이 받아 갔냐에 따라
 * `reset` 이 답이기도 하고 그게 남의 저장소를 망가뜨리기도 한다. 그런데 검색하면
 * 그 조건은 빼고 명령만 복사되어 온다 — 사고는 거기서 난다.
 *
 * 그래서 여기서는 **조건을 먼저 묻고**(밀었나 · 남이 받았나 · 담았나) 그에 맞는 차례만 준다.
 * 각 걸음에는 **되돌릴 수 있나**를 붙인다. 되돌릴 수 없는 걸음은 화면이 붉게 세운다.
 *
 * 말은 여기서 안 짓는다 — id 만 돌려주고 문장은 화면(i18n)이 만든다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'gitundo',
  ops: {
    steps: {
      desc:
        'Give the git commands that undo a situation, filtered by whether the work is pushed or shared.' +
        ' id = one of the scenario ids (lastMessage, uncommit, dropCommit, wrongBranch, deletedBranch,' +
        ' lostReset, unstage, discardFile, lostStash, revertPushed, abortMerge, abortRebase, cleanUntracked).',
      in: { id: 'string', pushed: 'boolean?', shared: 'boolean?' },
      out: 'string'
    },
    list: {
      desc: 'List the scenario ids this tool knows.',
      in: {},
      out: 'string'
    }
  }
};

/** 걸음의 위험도 — 화면이 색을 고르는 데 쓴다. */
export type Risk = 'safe' | 'rewrite' | 'destructive';

export interface Step {
  cmd: string;
  /** 왜 이 걸음인지 — i18n 열쇠 (`gitundo.step.<key>`) */
  why: string;
  risk: Risk;
  /** 이 걸음 뒤에 되돌릴 길이 있나 */
  undoable: boolean;
  /** 밀었을 때만 · 안 밀었을 때만 보이는 걸음 */
  onlyIf?: 'pushed' | 'notPushed';
}

export interface Scenario {
  id: string;
  /** 되돌린 뒤 남는 것 — 화면이 「무엇이 남나」로 보여 준다 */
  keeps: 'changes' | 'nothing' | 'history';
  steps: Step[];
}

/* 명령 자체는 어느 말에서나 같다 — 그래서 여기 둔다. 설명만 화면이 만든다. */
export const SCENARIOS: Scenario[] = [
  {
    id: 'lastMessage',
    keeps: 'changes',
    steps: [
      { cmd: 'git commit --amend -m "새 메시지"', why: 'amend', risk: 'rewrite', undoable: true },
      { cmd: 'git push --force-with-lease', why: 'forceLease', risk: 'destructive', undoable: false, onlyIf: 'pushed' }
    ]
  },
  {
    id: 'uncommit',
    keeps: 'changes',
    steps: [
      { cmd: 'git reset --soft HEAD~1', why: 'softReset', risk: 'rewrite', undoable: true },
      { cmd: 'git reflog', why: 'reflogSafety', risk: 'safe', undoable: true }
    ]
  },
  {
    id: 'dropCommit',
    keeps: 'nothing',
    steps: [
      { cmd: 'git reset --hard HEAD~1', why: 'hardReset', risk: 'destructive', undoable: true },
      { cmd: 'git reflog', why: 'reflogSafety', risk: 'safe', undoable: true },
      { cmd: 'git revert <커밋>', why: 'preferRevert', risk: 'safe', undoable: true, onlyIf: 'pushed' }
    ]
  },
  {
    id: 'wrongBranch',
    keeps: 'changes',
    steps: [
      { cmd: 'git branch 새-가지', why: 'markHere', risk: 'safe', undoable: true },
      { cmd: 'git reset --hard origin/main', why: 'putBack', risk: 'destructive', undoable: true },
      { cmd: 'git switch 새-가지', why: 'goToNew', risk: 'safe', undoable: true }
    ]
  },
  {
    id: 'deletedBranch',
    keeps: 'history',
    steps: [
      { cmd: 'git reflog', why: 'findSha', risk: 'safe', undoable: true },
      { cmd: 'git branch 되살린-가지 <sha>', why: 'reBranch', risk: 'safe', undoable: true }
    ]
  },
  {
    id: 'lostReset',
    keeps: 'history',
    steps: [
      { cmd: 'git reflog', why: 'findSha', risk: 'safe', undoable: true },
      { cmd: 'git reset --hard <sha>', why: 'backToSha', risk: 'destructive', undoable: true },
      { cmd: 'git fsck --lost-found', why: 'lastResort', risk: 'safe', undoable: true }
    ]
  },
  {
    id: 'unstage',
    keeps: 'changes',
    steps: [{ cmd: 'git restore --staged <파일>', why: 'unstage', risk: 'safe', undoable: true }]
  },
  {
    id: 'discardFile',
    keeps: 'nothing',
    steps: [
      { cmd: 'git diff <파일>', why: 'lookFirst', risk: 'safe', undoable: true },
      { cmd: 'git restore <파일>', why: 'discard', risk: 'destructive', undoable: false }
    ]
  },
  {
    id: 'lostStash',
    keeps: 'history',
    steps: [
      { cmd: 'git stash list', why: 'stashList', risk: 'safe', undoable: true },
      { cmd: 'git fsck --unreachable | grep commit', why: 'fsckStash', risk: 'safe', undoable: true },
      { cmd: 'git stash apply <sha>', why: 'applyStash', risk: 'safe', undoable: true }
    ]
  },
  {
    id: 'revertPushed',
    keeps: 'history',
    steps: [
      { cmd: 'git revert <커밋>', why: 'revert', risk: 'safe', undoable: true },
      { cmd: 'git push', why: 'pushRevert', risk: 'safe', undoable: true }
    ]
  },
  {
    id: 'abortMerge',
    keeps: 'changes',
    steps: [{ cmd: 'git merge --abort', why: 'abortMerge', risk: 'rewrite', undoable: true }]
  },
  {
    id: 'abortRebase',
    keeps: 'changes',
    steps: [{ cmd: 'git rebase --abort', why: 'abortRebase', risk: 'rewrite', undoable: true }]
  },
  {
    id: 'cleanUntracked',
    keeps: 'nothing',
    steps: [
      { cmd: 'git clean -nd', why: 'dryRun', risk: 'safe', undoable: true },
      { cmd: 'git clean -fd', why: 'cleanReal', risk: 'destructive', undoable: false }
    ]
  }
];

export interface Answers {
  pushed?: boolean;
  shared?: boolean;
}

/** 조건에 맞는 걸음만 남긴다. 남이 받아 간 판이면 되돌려 쓰는 길을 앞세운다. */
export function stepsFor(id: string, answers: Answers = {}): Step[] {
  const found = SCENARIOS.find((s) => s.id === id);
  if (found === undefined) throw new Error('gitundo: 모르는 상황 ' + id);
  const pushed = answers.pushed === true || answers.shared === true;
  const kept = found.steps.filter((s) => (s.onlyIf === 'pushed' ? pushed : s.onlyIf === 'notPushed' ? !pushed : true));
  if (!pushed) return kept;
  /* 이미 나간 판이면 「역사를 다시 쓰는」 걸음보다 「되돌리는 커밋」이 먼저다 */
  return [...kept].sort((a, b) => Number(b.why === 'preferRevert' || b.why === 'revert') - Number(a.why === 'preferRevert' || a.why === 'revert'));
}

/** 이 상황에서 가장 위험한 정도 — 화면이 경고를 세울지 고른다. */
export function worstRisk(steps: Step[]): Risk {
  if (steps.some((s) => s.risk === 'destructive')) return 'destructive';
  if (steps.some((s) => s.risk === 'rewrite')) return 'rewrite';
  return 'safe';
}

export const run: ToolRunner = (op, args) => {
  if (op === 'list') return SCENARIOS.map((s) => s.id).join('\n');
  if (op === 'steps') {
    return stepsFor(String(args.id ?? ''), { pushed: args.pushed === true, shared: args.shared === true })
      .map((s) => s.cmd + '   # ' + s.why + (s.undoable ? '' : ' (되돌릴 수 없음)'))
      .join('\n');
  }
  throw new Error('gitundo: 모르는 연산 ' + op);
};
