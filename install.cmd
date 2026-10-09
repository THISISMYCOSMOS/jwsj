@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 평소 쓰는 Chrome용 설치: AI 연결 프로그램을 등록하고 확장 폴더를 준비한다. 별도 Chrome 창은 띄우지 않는다.
rem ZIP 안에서 바로 실행하면 이 파일만 임시 폴더로 풀려 나머지 파일이 없다.
if not exist "scripts\setup.mjs" (
  echo 압축을 풀지 않은 상태에서 실행했습니다.
  echo 받은 ZIP을 마우스 오른쪽 버튼 - [모두 압축 풀기]로 푼 뒤, 풀린 폴더의 install.cmd를 실행하세요.
  pause
  exit /b 1
)
rem Node.js를 막 설치해 탐색기의 PATH가 아직 갱신되지 않았으면 기본 설치 위치를 직접 쓴다.
where node.exe >nul 2>&1
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js LTS가 필요합니다: https://nodejs.org/
  pause
  exit /b 1
)
node scripts\setup.mjs --install-only
if errorlevel 1 (
  echo 설치하지 못했습니다. 위 오류를 확인하세요.
  pause
  exit /b 1
)
set "EXT=%LOCALAPPDATA%\KlasSummarizer\extension"
<nul set /p="%EXT%"| clip
echo.
echo ============================================================
echo  설치 완료. 확장 폴더 경로를 클립보드에 복사했습니다.
echo    %EXT%
echo.
echo  평소 Chrome에서 한 번만:
echo   1. 주소창에 chrome://extensions 입력
echo   2. 오른쪽 위 [개발자 모드] 켜기
echo   3. [압축해제된 확장 프로그램을 로드합니다] 클릭
echo   4. 폴더 선택 창 위쪽 주소칸에 Ctrl+V 로 붙여넣고 Enter, [폴더 선택]
echo ============================================================
explorer "%EXT%"
pause
