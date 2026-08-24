---
title: Chirpy 포크를 독립 저장소로 만들고 main으로 이사한 기록
description: "GitHub Support로 fork network를 분리하고, 남아 있던 Contributor 이력을 정리한 뒤 master를 main으로 안전하게 옮긴 과정"
date: "2026-08-24T20:19:00+09:00"
categories: [컴퓨터, 인터넷]
tags: [Git, GitHub, Chirpy]
image: /assets/img/background/kururu-lab.jpg
---

이 블로그 저장소는 처음부터 독립 프로젝트가 아니었다. [Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy)를 fork해서 시작했다.

그 위에 글을 쓰고, 설정을 바꾸고, 기능을 붙였다. 시간이 지나며 KarmoLab과 데스크톱 앱, Discord 봇까지 한 저장소에 모였다. 마침내 Jekyll과 Chirpy 코드도 모두 걷어냈다. 이제 내용으로 보나 구조로 보나 별개의 프로젝트였지만, GitHub에는 여전히 **fork**라고 표시되어 있었다.

이번에 그 연결을 끊었다. 이어서 Git 이력에 남은 Contributor를 정리하고, 옛 기본 브랜치 이름인 `master`도 `main`으로 바꿨다.

이 글은 그 과정의 기록이다.

## Chirpy로 시작했다

먼저 분명히 적어 두고 싶다. Chirpy가 싫어져서 독립한 것이 아니다.

처음 GitHub Pages 블로그를 만들 때 Chirpy는 정말 좋은 출발점이었다. 보기 좋은 화면, 모바일 대응, 검색, 목차, 댓글, 다크 모드처럼 혼자 처음부터 만들기 버거운 것들이 이미 잘 갖춰져 있었다. 덕분에 블로그의 껍데기보다 **무엇을 기록할지**에 더 빨리 집중할 수 있었다.

아주 작지만 나도 Chirpy에 한 번 기여했다. 2024년, 댓글 설정 이름이 `active`에서 `provider`로 바뀌었는데 comment switcher의 참조 한 곳이 따라가지 못한 문제를 고친 [PR #1629](https://github.com/cotes2020/jekyll-theme-chirpy/pull/1629)가 병합됐다. 그래서 지금도 Chirpy 저장소 Contributor 목록에 내 이름이 있다.

Chirpy와의 기록이 좋은 것만 있는 건 아니다. 2026년 5월에는 AI와 작업하다가 **내 저장소에 열어야 할 PR 세 개를 Chirpy upstream에 만들어 버리는 사고**도 있었다.

`gh pr create`가 가리키는 대상 저장소를 확인하지 않은 채 자동화가 실행됐다. 내 KarmoLab 작업 브랜치가 전혀 관계없는 Chirpy 저장소에 draft PR로 올라갔다. 하나도 아니고 5월 6일, 7일, 9일에 각각 [#2736](https://github.com/cotes2020/jekyll-theme-chirpy/pull/2736), [#2737](https://github.com/cotes2020/jekyll-theme-chirpy/pull/2737), [#2738](https://github.com/cotes2020/jekyll-theme-chirpy/pull/2738) 세 개였다.

발견하자마자 놀라서 닫고, 제목을 `[Mistakenly opened — please ignore]`로 바꾸고, downstream 프로젝트의 브랜치를 잘못 올렸다는 사과문으로 내용을 고쳤다. AI가 명령을 실행했어도 최종 책임은 저장소 주인인 내게 있다. 이후에는 PR을 만들기 전에 owner/repository와 base branch를 명시적으로 확인하도록 작업 규칙을 강화했다.

![Chirpy 저장소에 남은 정상 기여 PR 하나와 실수로 열었다 닫은 PR 세 개](/assets/img/post/2026-08-24-github-fork-independence/chirpy-pull-requests.png)

목록만 보면 작아 보이니, 제가 실제로 기여한 PR의 상세 화면도 남겨 둡니다. `#1629`는 리뷰를 거쳐 머지되었고, Cotes님이 “Thank you for the fix!”라고 남겨 주셨습니다.

![Chirpy 기여 PR #1629 상세 화면](/assets/img/post/2026-08-24-github-fork-independence/chirpy-pr-1629-detail.png)

지금 보면 맨 아래에는 병합된 작은 기여가, 그 위에는 급히 닫은 실수 세 건이 나란히 있다. 네 항목 모두 내 이름 옆에 `Contributor` 표시가 붙어 있다. 고마움과 민망함이 한 화면에 같이 남은 셈이다.

Chirpy를 fork해 출발했고, 잘 사용했고, 작은 수정 하나를 돌려드릴 수도 있었다. 이번 독립은 그 관계를 지우려는 일이 아니다. 도움받은 기반은 인정하되, 이제 완전히 달라진 프로젝트의 이력과 운영을 내가 책임지려는 일이다.

Chirpy와 유지보수자·기여자분들께 감사드린다.

## 버튼 하나로 끝나지 않았던 fork 해제

GitHub에는 저장소의 **Settings → Danger Zone → Leave fork network** 기능이 있다. 보통은 여기서 독립 저장소로 바꿀 수 있다.

그런데 내 저장소에서는 다음 이유로 막혔다.

> Can't leave the fork network because this fork has child forks.

누군가 내 블로그 저장소를 다시 fork해 둔 상태였다. 내 계정의 저장소가 아니므로 내가 그 child fork를 지울 수도 없었다. 내가 만든 적 없는 fork 하나 때문에 내 저장소의 fork 해제가 막힌 셈이다.

결국 2026년 8월 23일 GitHub Support에 티켓을 보냈다. 요청 내용은 대략 이랬다.

- 원래 `cotes2020/jekyll-theme-chirpy`의 fork로 만들었다.
- 이후 테마 코드는 완전히 제거했고, 지금은 개인 사이트와 앱을 담은 독립 모노레포다.
- 내 소유가 아닌 child fork 때문에 직접 fork network를 떠날 수 없다.
- stars, watchers, issues, Actions 설정과 secret, GitHub Pages는 유지한 채 독립 저장소로 분리해 달라.

GitHub Support는 같은 날 저장소를 upstream network에서 분리했다고 답하고 티켓을 닫았다. 실제 저장소 정보에서도 `isFork: false`가 확인됐다. 생각보다 빠르고 깔끔하게 끝났다.

![GitHub Support가 저장소를 upstream fork network에서 분리했다고 답한 화면](/assets/img/post/2026-08-24-github-fork-independence/github-support-detached.png)

## fork 표시는 사라졌지만 Contributor는 남았다

여기서 하나를 새로 알았다.

**fork network와 Git commit history는 별개다.**

GitHub Support가 fork 관계를 끊어 주는 것은 저장소의 네트워크 소속을 바꾸는 일이다. 기존 커밋의 author까지 바꾸거나, 원본 프로젝트의 수천 개 커밋을 지워 주는 일은 아니다.

그래서 저장소는 독립됐지만 Contributor 목록에는 여전히 예전 Chirpy 기여자들이 보였다. GitHub는 기본 브랜치의 커밋 author를 바탕으로 Contributor를 계산하므로 당연한 결과였다.

`.mailmap`으로 이름을 합치는 정도로는 해결되지 않는다. Contributor 집계에서 빼려면 결국 **기본 브랜치의 이력을 다시 써야 했다.**

## 무엇을 남기고 무엇을 합칠까

이력을 무턱대고 새 커밋 하나로 만들고 싶지는 않았다. 지금까지 내가 쌓아 온 커밋과 자동화 봇의 기록은 여전히 의미가 있었다.

정한 기준은 다음과 같다.

- 내가 프로젝트를 시작하기 전 Chirpy 이력은 하나의 baseline 커밋으로 압축한다.
- 그 이후 내 커밋은 유지한다.
- GitHub Actions, Dependabot, semantic-release 같은 봇 커밋도 유지한다.
- 중간중간 upstream에서 받아 온 다른 사람의 커밋은 변경 내용만 현재 트리에 남기고, 별도의 정리 커밋으로 합친다.
- Chirpy의 MIT `LICENSE`와 원 프로젝트 링크, 감사 표시는 남긴다.
- 이력 정리 전후의 최종 파일 트리는 같아야 한다.

내 첫 커밋은 `Create Test.txt`였다. 그 앞에는 Chirpy에서 물려받은 커밋이 1,057개 있었다. 이 구간을 `chore: import Chirpy baseline`이라는 하나의 root commit으로 바꿨다.

그 뒤 이력에는 내 여러 계정 표기와 봇 author만 남기고, 다른 사람 author의 커밋은 첫 부모 쪽으로 접었다. merge commit이 품고 있던 변경을 놓치지 않도록 마지막에는 원래 브랜치의 최종 트리와 새 이력의 트리를 직접 비교했다.

```bash
git rev-parse old-master^{tree}
git rev-parse rewritten-main^{tree}
```

두 tree hash가 같아야 했다. 파일 내용은 그대로인데, 그 파일들에 도달하는 역사만 달라진 상태다.

결과적으로 기본 브랜치 이력은 7,079개에서 5,606개 커밋으로 줄었다. GitHub Contributor API에는 이제 내 계정과 허용한 봇만 보인다.

## 이력 재작성에서 가장 먼저 한 것

당연하지만 **백업**이었다.

이력 재작성은 되돌리기 어려운 작업이다. SHA가 전부 바뀌고, 오래된 커밋 링크도 끊어진다. 이미 이 저장소를 clone한 사람이 있다면 기존 브랜치와 새 브랜치를 평범하게 pull해서 합칠 수도 없다.

그래서 원격을 건드리기 전에 기존 `master` 끝을 로컬 보관 브랜치로 남겼다.

```bash
git branch archive/pre-main-history-20260824 origin/master
```

그다음 별도의 bare clone과 worktree에서 `git-filter-repo`로 작업했다. 평소 쓰는 작업 폴더에서 바로 이력을 갈아엎지 않았다. 새 이력에 문제가 생겨도 기존 작업 공간과 원격 `master`는 그대로 남아 있도록 했다.

그리고 다음을 검사했다.

- 최종 tree hash가 기존 `master`와 같은가
- author email 목록에 나와 봇 외의 사람이 남아 있지 않은가
- 첫 root commit에 당시 Chirpy 파일과 `LICENSE`가 온전히 들어 있는가
- 최신 사용자 커밋까지 빠짐없이 반영됐는가
- 빌드와 브라우저 테스트가 도는가

이 단계가 끝날 때까지 원격에는 아무것도 덮어쓰지 않았다.

## force push 대신 새 main을 만들었다

처음에는 `master`를 강제로 덮어쓸 생각도 했다. 하지만 이번에는 더 안전한 길이 있었다. 어차피 기본 브랜치 이름도 `main`으로 바꿀 예정이었다.

새 이력을 로컬 `main`에 만든 뒤, 원격에 존재하지 않던 새 브랜치로 올렸다.

```bash
git push -u origin main
```

이 푸시는 기존 ref를 덮어쓰지 않는다. 이 시점에는 원격에 다음 두 갈래가 동시에 있었다.

```text
master  ── 기존 전체 이력, 기존 서비스
main    ── 정리한 새 이력, 전환 후보
```

따라서 `main`에서 문제가 발견되면 기본 브랜치를 바꾸지 않고 그냥 버릴 수 있었다. 같은 이름의 브랜치를 force push하는 것보다 훨씬 마음이 편했다.

## master에서 main으로 옮길 때 같이 바꾼 것

GitHub에서 기본 브랜치 이름만 바꾸면 끝날 줄 알았지만, 저장소 안에는 `master`를 직접 가리키는 곳이 꽤 많았다.

- GitHub Actions의 `branches: [master]`
- 배포 스크립트의 `origin/master`
- GitHub API의 `/commits/master`
- raw.githubusercontent.com의 `/master/` URL
- 문서 속 `blob/master` 링크
- 로컬 lane/worktree 도구의 기본 브랜치 표

이들을 모두 `main`으로 맞춘 뒤 기본 브랜치를 변경했다.

```bash
gh repo edit OWNER/REPO --default-branch main
```

여기서 또 하나의 함정이 있었다. **GitHub Pages의 source branch는 자동으로 따라오지 않았다.** 저장소 기본 브랜치는 `main`이 됐지만 Pages API에는 여전히 `master`가 남아 있었다.

그래서 Pages 설정도 별도로 바꿨다.

```bash
gh api --method PUT repos/OWNER/REPO/pages \
  -f build_type=workflow \
  -F 'source[branch]=main' \
  -F 'source[path]=/'
```

Actions의 push trigger도 새 브랜치 생성 순간에는 자동 실행되지 않아, `main`을 기본 브랜치로 바꾼 뒤 Pages 배포와 전체 검증 workflow를 수동으로 한 번 실행했다.

Pages가 `main`에서 정상 빌드·배포되고 실제 블로그가 HTTP 200으로 열리는 것까지 확인한 뒤에야 구 브랜치를 삭제했다.

```bash
gh api --method DELETE repos/OWNER/REPO/git/refs/heads/master
```

최종적으로 원격 브랜치는 `main` 하나, GitHub 기본 브랜치도 `main`, Pages source도 `main`이 됐다.

## 실제로 겪은 주의점

### Contributor를 지우는 일은 곧 이력을 바꾸는 일이다

fork 표시만 없애는 것과 Contributor를 정리하는 것은 전혀 다른 작업이었다. 전자는 GitHub 저장소 설정이고, 후자는 Git 데이터 자체를 바꾼다.

Contributor 이름이 보기 싫다는 이유만으로 공유 저장소에서 쉽게 할 일은 아니다. 기존 clone, 열린 PR, 커밋 링크, release와 tag까지 영향을 확인해야 한다. 이번 저장소는 사실상 혼자 관리하고 있었고, 로컬에 구 이력을 보관했기 때문에 진행할 수 있었다.

### author와 committer는 다르다

GitHub Contributor 집계에서는 commit author가 중요하다. 커밋을 내가 cherry-pick했다고 해서 원래 author가 자동으로 내가 되는 것은 아니다. 반대로 다른 사람의 작업을 내 이름으로 무작정 바꾸는 것도 좋은 태도는 아니다.

이번에는 원본 테마 코드가 이미 사라졌고, 프로젝트 사이에 섞여 들어온 작은 upstream 변경을 독립 프로젝트의 한 정리 커밋으로 합쳤다. 대신 baseline commit과 `LICENSE`, 이 글에 Chirpy 출처를 분명히 남겼다.

### 기본 브랜치 밖도 살펴봐야 한다

Contributor 화면은 기본 브랜치를 중심으로 계산되지만, 다른 branch나 tag가 구 이력을 계속 가리킬 수 있다. 브랜치 목록, tag, release, Pages source, Actions 설정을 따로 확인해야 한다.

### 모든 자동화가 branch rename을 따라오지는 않는다

GitHub가 일부 링크와 설정은 알아서 옮겨 주지만, workflow 파일 안에 직접 쓴 문자열과 외부 서비스 설정까지 고쳐 주지는 않는다. `master` 문자열을 검색한 뒤 각각이 내 저장소를 가리키는지, 외부 프로젝트의 실제 branch 이름인지 구분해야 했다.

## 끝

이제 이 저장소는 GitHub에서도, Git 이력에서도, 배포 설정에서도 독립 프로젝트다.

하지만 독립했다고 해서 출발점까지 없어지는 것은 아니다. Chirpy가 없었다면 이 블로그를 이렇게 오래 운영하지 못했을 것이다. 잘 만든 테마를 공개하고 계속 돌봐 준 [Cotes Chung](https://github.com/cotes2020)님과 모든 Chirpy Contributor에게 다시 한 번 감사드린다.

나는 Chirpy의 작은 Contributor로 남아 있고, Chirpy는 이 프로젝트의 baseline과 기억 속에 남아 있다. 이제 그 위에서 배운 것을 가지고 내 프로젝트의 다음 이력을 `main`에 쌓아 간다.

- Chirpy: <https://github.com/cotes2020/jekyll-theme-chirpy>
- 내가 기여한 작은 수정: <https://github.com/cotes2020/jekyll-theme-chirpy/pull/1629>
- GitHub Docs — Detaching a fork: <https://docs.github.com/en/pull-requests/how-tos/work-with-forks/detaching-a-fork>
- GitHub Docs — Renaming a branch: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch>

---

**메모** · 독립은 과거를 지우는 일이 아니었다. 어디서 시작했는지 남겨 둔 채, 지금의 프로젝트에 맞는 역사를 다시 세우는 일이었다.
