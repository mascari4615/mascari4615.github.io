---
title: "C# 'InvalidOperationException: Collection was modified; enumeration operation may not execute.'"
date: "2021-08-13T22:45:00+09:00"
last_modified_at: "2021-10-07T00:00:00+09:00"
categories: [컴퓨터, 프로그래밍]
tags: [CSharp]
image: /assets/img/background/kururu-lab.jpg
board: info
---

> [!WARNING]
> 네이버 블로그 사용 당시 썼던 글을 옮겨온 글 입니다. 일부 오류가 있을 수 있습니다. [참고](/posts/github-blog/)

---

foreach로 List를 돌다가, 그 List의 요소가 삭제되거나 추가되어 변경되면 생기는 오류  

삭제 할 경우 요소의 인덱스를 기억해서 밖에서 지우던지, 삭제 후 바로 break로 나와주던지 해야함.  

[참고](http://devkorea.co.kr/bbs/board.php?bo_table=m03_qna&wr_id=19169&page=9)
