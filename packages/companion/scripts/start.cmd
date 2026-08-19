@echo off
rem 동반자 시작 — 소스 없이 받은 꾸러미에서 이걸 두 번 누른다 (TASK-KAR-227).
rem
rem Node 런타임은 꾸러미에 없다. 게임의 「필수 구성 요소」와 같은 자리다 — 넣으면 87MB 가
rem 붙는데 그건 이 꾸러미(4.7MB)의 열여덟 배다. 대신 **없으면 어디서 받는지 말한다**.
rem 말없이 죽으면 사람은 「고장」으로 읽는다.
rem
rem 판 검사는 `check-node.mjs` 가 한다 — 배치 안에서 따옴표를 다루다 한 번 죽었다.
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node 가 없다 - 동반자는 Node 위에서 돈다.
  echo.
  echo   받는 곳: https://nodejs.org  (LTS 를 고르면 된다^)
  echo   깔고 나서 이 파일을 다시 누르면 된다.
  echo.
  pause
  exit /b 1
)

node scripts\check-node.mjs
if errorlevel 1 (
  pause
  exit /b 1
)

echo 동반자를 띄운다. 끝내려면 이 창에서 Ctrl+C.
node demo\face.mjs
if errorlevel 1 pause
