; KarmoLab NSIS 설치 훅 — 바탕화면 바로가기 자동 생성
;
; 왜: Tauri 기본 NSIS 템플릿(installer.nsi)은 바탕화면 바로가기를 「passive/silent
; 설치」에서만 만들고, 일반 GUI 설치에서는 마무리 화면 체크박스에 맡긴다. 그래서
; 릴리스 setup.exe 를 그냥 눌러 설치하면 시작메뉴 바로가기·언인스톨 등록은 되는데
; 바탕화면만 비어, 「일반 프로그램처럼」이 아니게 된다 (0.1.58 관측).
;
; 무엇: 설치가 파일 복사·레지스트리·시작메뉴를 끝낸 뒤 바탕화면 바로가기를 찍는다.
; 자동 업데이트(updater) 경로($UpdateMode)는 건드리지 않는다 — 사용자가 지운
; 아이콘을 업데이트가 멋대로 되살리면 그게 더 이상하다.
;
; 제거 훅은 없다: 템플릿이 언인스톨 때 "$DESKTOP\${PRODUCTNAME}.lnk" 를 이미 지운다.

!macro NSIS_HOOK_POSTINSTALL
  ${If} $UpdateMode <> 1
    CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ${EndIf}
!macroend
