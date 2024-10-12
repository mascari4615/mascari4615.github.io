---
title: "🌒 C# 'InvalidOperationException: Collection was modified; enumeration operation may not execute.'"
categories: [💫Computer, 🌒Programming]
tags: [Computer, Programming, CSharp]

date: 2021-08-13. 22:45:00
last_modified_at: 2021-10-07
---
{% include custom/old-post.html %}

foreach로 List를 돌다가, 그 List의 요소가 삭제되거나 추가되어 변경되면 생기는 오류  

삭제 할 경우 요소의 인덱스를 기억해서 밖에서 지우던지, 삭제 후 바로 break로 나와주던지 해야함.  

[참고](http://devkorea.co.kr/bbs/board.php?bo_table=m03_qna&wr_id=19169&page=9)  
