# 지우사랑해(jwsj) 설치·오류 가이드

성균관대 icampus 강의를 Groq로 받아쓰고 HTML로 정리하는 Chrome 확장(성대 빌드)입니다. 다른 PC에 새로 설치할 때와 오류가 났을 때 이 문서를 보세요. 오류는 **화면에 보이는 문구**로 찾을 수 있게 정리했습니다.

- 광운대 KLAS용 klasnote와 **같은 PC에 함께 설치해도 서로 덮어쓰지 않습니다**(아래 [klasnote와 함께 쓰기](#klasnote와-함께-쓰기)).
- 마지막 확인: 2026-10-14, Windows 11 · Chrome 155 · Node.js 24.

## 1. 새 PC에 설치하기 (Windows)

준비물: Chrome, [Node.js 18 이상](https://nodejs.org/), Groq Free 계정 API 키.

1. `downloads/jwsj-<버전>.zip`을 받아 **마우스 오른쪽 → 모두 압축 풀기**로 풉니다. ZIP 안에서 바로 실행하면 안 됩니다.
2. 풀린 `jwsj` 폴더의 `install.cmd`를 **파일 탐색기에서 더블클릭**합니다.
   - ⚠ Claude 데스크톱 앱, Microsoft Store 앱 등 **다른 앱 안의 터미널에서 실행하지 마세요.** 그런 앱(MSIX 패키지 앱) 안에서 실행하면 파일과 레지스트리가 그 앱 전용 가상 폴더에만 써져서 Chrome이 보지 못합니다([오류 A3](#a3-chrome-폴더-선택-창에서-jwsjextension-경로가-없다)).
   - 끝나면 `설치 완료: …\Jwsj\extension`이 보이고, 확장 폴더 경로가 클립보드에 복사됩니다.
3. Chrome 주소창에 `chrome://extensions` → 오른쪽 위 **개발자 모드** 켜기 → **압축해제된 확장 프로그램을 로드합니다**.
4. 폴더 선택 창 주소창에 붙여 넣고(Ctrl+V) Enter → **폴더 선택**.
   - 경로: `%LOCALAPPDATA%\Jwsj\extension` (보통 `C:\Users\<이름>\AppData\Local\Jwsj\extension`)
   - 반드시 `extension` 폴더 자체를 고릅니다.
5. 목록에 **지우사랑해**(하트 아이콘) 카드가 생기고 ID가 `ongnnbhdedfhijimkccikfdbkigemkfn`인지 확인합니다.
6. 처음 설정 탭에서 모드를 고르고, **Groq 받아쓰기** 칸에 키를 넣고 **저장** → **연결 테스트**가 `Groq 연결 성공`이면 끝입니다.
7. 이미 열어 둔 icampus 탭은 **F5**로 새로고침합니다.

macOS는 `install.command`를 Finder에서 실행하고, 확장 폴더는 `~/Library/Application Support/Jwsj/extension`입니다(실제 Mac에서는 아직 검증 전).

### 설치가 잘 됐는지 확인하기

압축 푼 `jwsj` 폴더에서 명령 프롬프트를 열고(탐색기 주소창에 `cmd` 입력):

```
node scripts\doctor.mjs
```

모든 줄이 `✔`이면 정상입니다. `✖`가 있으면 그 줄의 `→` 안내를 따르세요. (Groq 키를 아직 안 넣었으면 마지막 줄만 `✖ Groq 키 없음`이 정상입니다.)

## 2. 업데이트하기

1. 새 ZIP을 풀고 `install.cmd`를 다시 탐색기에서 실행합니다(받아쓰기 중이면 끝난 뒤에).
2. `chrome://extensions`에서 지우사랑해 카드의 **새로고침(↻)**.
3. 열려 있던 icampus 탭은 모두 **F5**.

저장된 받아쓰기·설정·Groq 키는 그대로 남습니다.

## 3. 사용 순서 (요약)

icampus → 과목 → 왼쪽 **강의콘텐츠** → 주차 펼치기 → 녹화 강의 제목 아래 **지금 요약** / **자동 처리**. 받아쓰기가 끝나면 **HTML 받기**(원문) 또는 **확인하고 저장**(AI 요약). 파일은 `다운로드\icampus요약\<과목>\`에 저장됩니다.

### 지원하는 강의 형식

| icampus 형식 | 영상 정보 | 받는 파일 | 상태 |
|---|---|---|---|
| 동영상(movie) | video1 | `ssmovie.mp4` | ✅ 실제 처리 확인 |
| everlec · mp4 | upf | `screen.mp4` | ✅ 실제 처리 확인 |
| 화면 강의(screenlecture) | video2 | `sub.mp4`(슬라이드 화면; `main.mp4`는 강의실 카메라) | ✅ 실제 처리 확인 |
| 화면 강의(screenlecture) | video1 | `main.mp4` | ✅ 실제 처리 확인 |
| 음성(audio) | audio | `ssaudio.m4a`(슬라이드 없이 받아쓰기) | ✅ 실제 처리 확인 |
| PDF·파일·Zoom·YouTube | — | 받아쓸 영상 없음 | 버튼이 붙지 않음(정상) |

2026-10-14 기준 수강 강의 224개(movie 제외 전 형식)의 영상 주소가 모두 실제 mp4/m4a로 열리는 것을 확인했습니다.

## 4. 오류별 해결

### A. 설치 · Chrome 등록

#### A1. `Specified native messaging host not found` 또는 `연결 프로그램이 설치되지 않았어요`
- 원인: `install.cmd`를 실행하지 않았거나, 다른 앱 안에서 실행해 등록이 Chrome에 보이지 않음.
- 해결: 탐색기에서 `install.cmd`를 다시 더블클릭 → 확장 새로고침(↻). 그래도 나면 `node scripts\doctor.mjs`로 어느 단계가 `✖`인지 확인.

#### A2. `install.cmd` 창에 `'…'은(는) 내부 또는 외부 명령… 이 아닙니다`가 줄줄이 나옴
- 원인: 배치 파일이 LF 줄바꿈이면 `chcp 65001` 뒤 cmd.exe가 한글 줄을 잘못 끊어 읽고 설치 단계를 건너뜀.
- 해결: 0.2.1 이후 ZIP은 CRLF로 고정됨. 예전 ZIP이면 새로 받거나, 폴더에서 `node scripts\setup.mjs --install-only` 실행.

#### A3. Chrome 폴더 선택 창에서 `…\Jwsj\extension` 경로가 없다
- 원인: 설치기를 Claude 데스크톱 앱 같은 **패키지 앱(MSIX) 안의 터미널**에서 실행함. 파일이 `%LOCALAPPDATA%\Packages\<앱 이름>\LocalCache\Local\Jwsj`(앱 전용 가상 폴더)에만 생기고, 레지스트리 등록도 앱 안에만 생깁니다.
- 해결: 그 가상 폴더의 `Jwsj`를 지우고, **파일 탐색기에서** `install.cmd`를 다시 실행. 실행 후 `C:\Users\<이름>\AppData\Local\Jwsj\extension`이 탐색기에서 보이면 정상입니다.

#### A4. `다른 폴더가 이미 있습니다. 기존 파일을 보존하고 설치를 중단합니다.`
- 원인: `%LOCALAPPDATA%\Jwsj`에 설치기가 만들지 않은 폴더가 있음.
- 해결: 그 폴더 이름을 바꾸거나 옮긴 뒤 다시 설치.

#### A5. `다른 네이티브 호스트가 등록되어 있습니다. 기존 등록을 보존합니다.`
- 원인: 다른 위치에 설치한 예전 지우사랑해(개발용 등)가 `com.jwsj.host`로 등록돼 있음.
- 해결: `reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.jwsj.host" /ve`로 경로를 확인하고, 예전 것이 맞으면 `reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.jwsj.host" /f` 후 다시 설치. klasnote의 등록(`com.klas_summarizer.host`)은 지우지 마세요.

#### A6. `매니페스트 파일이 없거나 읽을 수 없습니다`
- 원인: `extension` 폴더가 아닌 상위 폴더(`Jwsj`나 압축 푼 `jwsj`)를 고름.
- 해결: `…\Jwsj\extension` 폴더 자체를 선택.

#### A7. KLAS·icampus 화면에 `페이지 새로고침 필요` / `Extension context invalidated`
- 원인: 확장을 새로 설치·새로고침한 뒤, 이미 열려 있던 탭의 옛 스크립트가 끊김.
- 해결: 그 탭에서 **F5**.

### B. Groq · 연결

#### B1. 올바른 키인데 연결 테스트가 실패처럼 보임
- 0.2.1부터 입력 칸의 키를 먼저 저장한 뒤 시험합니다. 연결은 됐는데 대기열만 못 다시 시작하면 `Groq 연결은 성공했지만 로컬 대기열을 재개하지 못했어요`로 따로 알려 줍니다 → 확장 새로고침(↻) 후 다시 시도.

#### B2. `설정에서 Groq Free 계정의 API 키를 저장하세요.` / `설정에서 Groq 음성 전송 동의를 확인하세요.`
- 해결: 확장 설정 화면의 **Groq 받아쓰기**에서 키 저장 + 음성 전송 동의 체크.

#### B3. `Groq 사용 한도에 도달했습니다. 안내된 시간 이후 다시 시도하세요.`
- 원인: Groq Free 계정의 시간당 음성 한도. 긴 강의를 연달아 처리하면 걸릴 수 있습니다.
- 해결: 안내된 시간 뒤 **다시 시도**(이미 받아쓴 구간부터 이어서 처리).

### C. 영상 · 받아쓰기

#### C1. `HTTP 416 range https://vod.skku.edu/…` 또는 `영상 서버가 영상 대신 안내 페이지를 보냈어요(접근 차단)`
- 원인: icampus 영상 서버(vod.skku.edu)는 요청한 곳(Referer)이 학교 주소가 아니면 mp4 대신 1.5KB짜리 '접근 차단' 페이지를 보냅니다. 0.2.0 이하 확장은 이 처리가 없어 모든 강의가 실패했습니다(416은 그 페이지를 mp4로 잘못 읽은 결과).
- 해결: 0.2.1 이상으로 업데이트하고 확장 새로고침(↻). 0.2.1은 확장 내부 요청에만 학교 Referer를 붙입니다(`declarativeNetRequestWithHostAccess` 권한).

#### C2. `지원하지 않는 콘텐츠 형식입니다 (progressive mp4 없음).`
- 원인: 위 [지원 형식](#지원하는-강의-형식)에 없는 새 형식.
- 해결: 강의 ID(사이드패널에 표시)와 icampus의 형식 이름을 함께 알려 주세요. 0.2.0 이하에서 everlec·화면 강의에 이 오류가 났다면 업데이트로 해결됩니다.

#### C3. `지원하지 않는 AAC 음성 형식입니다.`
- 원인: 일부 영상은 음성 트랙에 디코더 설정(esds)이 빠져 있음.
- 해결: 0.2.1부터 표본 주파수·채널 수로 설정을 복원해 처리합니다(2.7초짜리 실제 강의로 확인). 그래도 나면 강의 ID를 알려 주세요.

#### C4. `Groq 전사 구간 시간이 오디오 범위를 벗어났거나 잘못되었습니다.`
- 원인: 2분 구간 경계에서 Whisper가 끝 시각을 오디오보다 길게 주던 문제(klasnote에서 발견).
- 해결: 이 저장소에는 수정이 들어 있습니다(끝 시각은 오디오 끝으로 맞춤). 그래도 나면 오류에 붙은 숫자(초)를 알려 주세요.

#### C5. `이 Chrome에 저장된 받아쓰기가 없습니다. "지금 요약"을 누르면 다시 받아씁니다.`
- 원인: 다른 Chrome 프로필이거나 브라우저 데이터가 지워짐.
- 해결: 안내대로 **지금 요약**을 다시 누릅니다.

#### C6. 처리가 느리다
- 원인: icampus 영상 서버가 느립니다(실측 연결당 약 0.2~0.6MB/s). 0.2.1부터 2분 구간마다 필요한 부분(음성 + 2초마다 슬라이드 한 장)만 받아 받는 양을 40~70% 줄였습니다.
- 참고(0.2.1 실측): 18분 동영상 강의 약 8분, 35분 화면 강의(video2) 약 19분. 강의 길이의 절반 정도이고, 1080p 화면(everlec)은 더 걸릴 수 있습니다. 처리 중 PC 부담은 거의 없습니다.

### D. 화면 · 상태

#### D1. 강의 목록에 버튼이 안 보임
- **F5**로 강의콘텐츠 탭을 새로고침. Zoom·PDF·파일·YouTube에는 원래 버튼이 없습니다.
- **지금 요약**이 회색이면, 강의를 한 번 열어 재생한 뒤 새로고침하세요(학습 완료 강의는 바로 가능).

#### D2. 사이드패널에 강의 이름 대신 `강의 68b65ab75284e` 같은 ID가 보임
- 원인: 목록에서 등록되지 않은 강의(0.2.0 이하가 건너뛴 화면 강의 등).
- 해결: 0.2.1에서는 처리 중 받은 강의 제목을 씁니다. 과목명까지 채우려면 그 과목의 강의콘텐츠 탭을 한 번 열어 두세요.

#### D3. 'HTML 받기'로 저장했는데 '확인 필요'로 남음
- 이 저장소에는 수정이 들어 있습니다. HTML 받기를 하면 `✓ HTML 저장됨`으로 바뀌고 확인 필요에서 빠집니다.

## klasnote와 함께 쓰기

두 확장은 다음 값이 모두 달라 한 PC·한 Chrome에 같이 설치할 수 있습니다.

| 항목 | klasnote(광운대) | 지우사랑해(성대) |
|---|---|---|
| 확장 ID | `klihhclhnhhmldcbnkpampimkjafmbdm` | `ongnnbhdedfhijimkccikfdbkigemkfn` |
| 연결 프로그램 등록 | `com.klas_summarizer.host` | `com.jwsj.host` |
| 설치 폴더 | `%LOCALAPPDATA%\KlasSummarizer` | `%LOCALAPPDATA%\Jwsj` |
| 다운로드 폴더 | `KLAS요약` | `icampus요약` |
| 배포 ZIP | `klasnote-<버전>.zip` | `jwsj-<버전>.zip` |

## 문의할 때 알려 줄 것

- 화면에 보인 오류 문구 그대로(가능하면 캡처)
- 사이드패널에 보이는 강의 ID(예: `68b65ab75284e`)와 icampus 형식(동영상·화면 강의 등)
- `node scripts\doctor.mjs` 결과 전체

Groq API 키, 학교 계정 비밀번호는 절대 보내지 마세요.
