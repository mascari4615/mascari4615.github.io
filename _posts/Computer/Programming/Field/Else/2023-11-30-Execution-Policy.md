---
title: "이 시스템에서 스크립트를 실행할 수 없으므로 파일을 로드할 수 없습니다."
# description: ""
categories: [💫Computer, 🌒Programming]
tags: [Computer, Programming]
image: "/assets/img/background/kururu-lab.jpg"

date: 2023-11-30. 18:42
# last_modified_at: 2023-11-30. 18:42
---

## 💫 에러

---

'이 시스템에서 스크립트를 실행할 수 없으므로 파일을 로드할 수 없습니다.'  

## 💫 해결방법

---

1. 관리자 권한으로 PowerShell 실행
2. Set-ExecutionPolicy로 권한 상태를 RemoteSigned로 설정

```console
Set-ExecutionPolicy RemoteSigned
Get-ExecutionPolicy
```
