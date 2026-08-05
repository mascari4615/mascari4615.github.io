/**
 * git 명령어 모음 (TASK-KL-088)
 *
 * git 은 「무엇을 하고 싶은가」 와 명령 이름이 안 맞아서 검색으로 나가게 된다.
 * 그래서 항목의 **이름을 상황으로** 적는다 — "reset --hard" 가 아니라 "고친 걸 전부 버리고 싶다".
 * 되돌릴 수 없는 명령은 위험 분류로 따로 묶었다.
 */
(function (): void {
  /** [명령, 상황(=이름), 설명] */
  const G: Record<string, Array<[string, string, string]>> = {
    '상태 보기': [
      ['git status', '지금 뭐가 바뀌었나', '수정·스테이징·추적 안 되는 파일을 한눈에'],
      ['git diff', '아직 안 담은 변경 보기', '스테이징하지 않은 수정 내용'],
      ['git diff --staged', '담아 둔 변경 보기', '커밋 직전 내용 확인'],
      ['git log --oneline -10', '최근 커밋 훑기', '한 줄씩 10개'],
      ['git log --oneline --graph --all', '브랜치 갈래 보기', '그래프로 합쳐진 흐름 확인'],
      ['git log -p <파일>', '이 파일이 어떻게 변해왔나', '파일별 변경 내역 전체'],
      ['git blame <파일>', '이 줄 누가 썼나', '줄마다 마지막 커밋·작성자'],
      ['git show <커밋>', '그 커밋 내용 보기', '메시지 + 변경 전체']
    ],
    '커밋하기': [
      ['git add <파일>', '변경을 담기', '경로를 적어 필요한 것만 담는 게 안전'],
      ['git add -p', '한 덩이씩 골라 담기', '같은 파일의 일부만 커밋할 때'],
      ['git commit -m "메시지"', '커밋 만들기', ''],
      ['git commit --amend', '방금 커밋 고치기', '메시지·내용 수정 · 이미 push 했으면 쓰지 말 것'],
      ['git restore --staged <파일>', '담은 것만 빼기', '수정 내용은 그대로 두고 스테이징만 해제']
    ],
    '브랜치': [
      ['git switch -c <이름>', '새 브랜치 만들고 옮기기', 'checkout -b 의 요즘 표기'],
      ['git switch <이름>', '브랜치 갈아타기', ''],
      ['git branch -a', '브랜치 목록', '원격 것까지'],
      ['git branch -d <이름>', '브랜치 지우기', '머지 안 됐으면 거부됨 (-D 는 강제)'],
      ['git merge <브랜치>', '가져와 합치기', '충돌 나면 해결 후 커밋'],
      ['git rebase <브랜치>', '내 커밋을 그 위로 옮기기', '히스토리가 깔끔해지지만 커밋 해시가 바뀐다'],
      ['git cherry-pick <커밋>', '그 커밋 하나만 가져오기', '']
    ],
    '원격': [
      ['git fetch', '원격 소식만 받기', '내 파일은 안 건드림'],
      ['git pull', '받아서 합치기', 'fetch + merge'],
      ['git pull --rebase', '받아서 내 커밋을 위로', '불필요한 머지 커밋을 안 만든다'],
      ['git push', '올리기', ''],
      ['git push -u origin <브랜치>', '새 브랜치 처음 올리기', '이후엔 git push 만으로'],
      ['git remote -v', '원격 주소 확인', '']
    ],
    '되돌리기': [
      ['git restore <파일>', '이 파일 수정을 버리기', '마지막 커밋 상태로 · 되돌릴 수 없음'],
      ['git revert <커밋>', '그 커밋을 무르는 커밋 만들기', '히스토리를 지우지 않아 공유 브랜치에서 안전'],
      ['git reset --soft HEAD~1', '커밋만 풀기', '변경 내용은 담긴 채로 남는다'],
      ['git reset --mixed HEAD~1', '커밋과 스테이징 풀기', '파일 수정은 그대로'],
      ['git reflog', '잃어버린 커밋 찾기', 'reset 후 "아 아까 그거" 를 되찾는 마지막 수단']
    ],
    '잠깐 치워두기': [
      ['git stash', '지금 작업을 잠깐 치우기', '깨끗한 상태로 되돌아간다'],
      ['git stash pop', '치운 것 되돌리기', '꺼내면서 목록에서 지움'],
      ['git stash list', '치워둔 목록', ''],
      ['git worktree add ../dir <브랜치>', '다른 브랜치를 옆에 펼치기', '지금 작업을 건드리지 않고 병행 · stash 보다 안전']
    ],
    '⚠ 되돌릴 수 없음': [
      ['git reset --hard', '고친 걸 전부 버리기', '커밋 안 한 변경이 사라진다 · 복구 불가'],
      ['git clean -fd', '추적 안 되는 파일 지우기', '새로 만든 파일이 통째로 사라진다'],
      ['git push --force', '원격을 내 것으로 덮기', '남의 커밋을 날릴 수 있다 · --force-with-lease 가 그나마 안전'],
      ['git branch -D <이름>', '브랜치 강제 삭제', '머지 안 된 커밋이 사라진다']
    ],
    '설정': [
      ['git config --global user.name "이름"', '이름 설정', ''],
      ['git config --global user.email "메일"', '메일 설정', ''],
      ['git config --global init.defaultBranch main', '기본 브랜치 이름', ''],
      ['git config --list', '설정 전부 보기', '']
    ]
  };

  Toolbox.register({
    id: 'gitcmd',
    title: 'git 명령어 모음',
    category: 'ref',
    desc: '하려는 일로 git 명령어를 찾습니다. 되돌릴 수 없는 명령은 따로 표시',
    layout: 'wide',
    icon: '<circle cx="6" cy="6" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="6" cy="18" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="18" cy="12" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 8.5v7M8.5 6h5a4 4 0 0 1 4 4v0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '명령어',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: 'reset --hard 는 두 번 생각하세요.' });
          const items = Object.keys(G).flatMap((group) =>
            G[group].map(([cmd, label, desc]) => ({
              copy: cmd,
              glyph: cmd,
              label,
              sub: desc,
              keywords: `${cmd} ${label} ${desc}`,
              group
            }))
          );
          window.RefTable?.build(container, {
            items,
            placeholder: '하려는 일을 적어 보세요 (예: 되돌리기, 브랜치, 충돌, 치워두기)',
            copyNoun: '명령어',
            layout: 'list',
            note: '누르면 명령어가 복사됩니다.'
          });
        }
      }
    ]
  });
})();
