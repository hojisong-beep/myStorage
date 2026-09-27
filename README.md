# Cosmic Voyager — 3D 우주 여행 & 전투 시뮬레이터

실제 우주 규모(태양계 → 은하 → 은하간)를 비행하며 적을 자동 조준 레이저로 격추하는 네이티브(C++ / OpenGL 3.3) 게임입니다.
그래픽·사운드는 모두 코드로 절차적 생성되므로 별도 리소스 파일이 없습니다.

## 주요 기능

- **실제 스케일의 우주**
  - 태양계: 태양 + 8개 행성 + 달 + 명왕성. 실제 반지름·궤도·오늘 날짜 기준 위치.
  - 실제 별 21개: 프록시마, 시리우스, 베가, 베텔게우스, 리겔, TRAPPIST-1 등. 실제 은하 좌표·거리 사용.
  - 궁수자리 A* 블랙홀: 강착원반 포함, 은하 중심에 위치.
  - 절차적 별 수백만 개: 은하 밀도 모델을 따르며, 접근하면 행성계가 생성됨.
  - 우리은하: 18만 입자, 나선팔·막대·먼지대 표현. 안에서는 은하수 띠, 밖에서는 나선은하로 보임.
  - 실제 은하 12개(안드로메다, 마젤란운, M51, M104, M87 등) + 절차적 은하 약 3,000개(처녀자리 은하단 포함).
- **초광속 비행**: 3 km/s ~ 광속의 10¹⁴배(초당 약 300만 광년). 워프 중 별이 선으로 늘어나는 효과 포함.
- **안전 장치**: 행성·항성에 가까워지면 워프 속도를 자동 제한하고, 충돌 직전 비상 이탈.
- **전투**
  - 3.5 km 안에 들어온 적을 자동으로 락온.
  - 레이저가 리드(예측) 사격으로 조준됨(짐벌 ±32°).
  - 적 3종(드론·레이더·워든), 실드·선체, 폭발 효과.
- **AUTO 모드 (P 키)**: 입력 없이 자동 진행.
  - 달 → 화성 → 목성 → 토성 → 해왕성 → 알파 센타우리 → 시리우스 → … → 블랙홀 → 우리은하 밖 → 안드로메다 → M87 → 귀환 순서로 여행.
  - 도착 후 관광하다가 적이 나타나면 자동으로 교전.
- **그래픽**: HDR 렌더링, 블룸, ACES 톤매핑, 절차적 행성 셰이더(대기·구름·도시 불빛·고리 그림자), 시네마틱 카메라.

## 실행 파일 받기 (가장 쉬운 방법)

GitHub 저장소 → **Actions** 탭 → 최신 "Build Cosmic Voyager" 실행 → **Artifacts**에서 사용 중인 OS용 파일을 받습니다.

- Windows: `CosmicVoyager.exe`
- macOS: `CosmicVoyager`
  - 처음 실행할 때 우클릭 → 열기.
  - 필요하면 `chmod +x CosmicVoyager`를 먼저 실행.

## 로컬에서 빌드하고 실행하기

### 1. 필요한 도구 설치

필요 도구는 2개(C++ 컴파일러, CMake)입니다. 그래픽 라이브러리 raylib은 CMake가 자동으로 내려받습니다.

| OS | 설치할 것 |
|---|---|
| Windows | Visual Studio 2022 Community ("C++를 사용한 데스크톱 개발" 선택, CMake 포함) |
| macOS | Xcode Command Line Tools (`xcode-select --install`), CMake (`brew install cmake`) |
| Linux | `build-essential cmake libx11-dev libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev libgl1-mesa-dev libasound2-dev` |

설치를 확인하려면 다음을 실행합니다.

```bash
cmake --version
```

### 2. 빌드

저장소 루트 폴더(`CMakeLists.txt`가 있는 곳)에서 실행합니다.

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

- 첫 빌드에서는 raylib을 내려받으므로 인터넷 연결이 필요하고 몇 분 걸릴 수 있습니다.
- 이후에는 코드를 수정하고 두 번째 명령(`cmake --build ...`)만 다시 실행하면 됩니다.

### 3. 실행

```bash
./build/CosmicVoyager            # macOS / Linux
build\Release\CosmicVoyager.exe  # Windows
```

실행 옵션을 붙여 시작할 수도 있습니다(아래 "실행 옵션" 참고).

```bash
./build/CosmicVoyager --auto              # AUTO 모드로 시작
./build/CosmicVoyager --goto "Saturn"     # 토성 근처에서 시작
```

### 문제 해결

- **`cmake: command not found`**: CMake가 설치되지 않았습니다. macOS는 `brew install cmake`로 설치합니다.
- **raylib 다운로드 실패**: 인터넷 연결을 확인하고 `build` 폴더를 지운 뒤 다시 빌드합니다.
- **적이 나타나지 않음**: 적은 워프 중이 아닐 때만 나타납니다. AUTO 모드를 끄고 X로 정지한 뒤, 워프 없이 약 40초 기다리면 첫 번째 적 무리가 나타납니다.

## 조작법

| 키 | 기능 |
|---|---|
| 마우스 이동 | 기수 방향 조종(가상 조이스틱). Z 또는 휠 클릭으로 중앙 복귀 |
| 방향키 / A D | 피치 / 요 |
| Q / E | 롤 |
| W / S, 휠 | 스로틀. 워프 중에는 워프 배율 |
| Shift | 애프터버너 |
| X | 정지 |
| J 또는 Tab | 워프 드라이브 가동 / 해제 |
| Space / 좌클릭 | 레이저 발사(락온 대상 자동 조준) |
| T | 다음 표적 |
| N / B | 목적지 선택 |
| G | 선택한 목적지로 자동 항법 |
| **P** | **AUTO 모드 켜기/끄기** |
| C | 카메라 전환(추적 / 조종석 / 시네마틱) |
| 우클릭 드래그 | 주변 둘러보기 |
| L / O | 이름표 / 궤도선 |
| F2 | 일시정지 |
| F11 | 전체화면 |
| H | 도움말 |
| Esc 두 번 | 종료 |

실행 옵션:
- `--auto`: AUTO 모드로 시작.
- `--fullscreen`: 전체화면으로 시작.
- `--goto "Saturn"`: 해당 천체 근처에서 시작.

## 코드 구조

| 파일 | 내용 |
|---|---|
| `src/core.h` | 단위, 배정밀 벡터, 우주 좌표(광년+미터 2단 좌표로 정밀도 유지) |
| `src/universe.*` | 태양계·실제 별·은하 데이터, 절차적 별/행성계/은하 생성 |
| `src/game.*` | 비행 모델, 워프, 자동 조준, 적 AI, 자동 항법, AUTO 투어 |
| `src/render.*` | 카메라 기준 다중 레이어 렌더링(은하 → 별 → 행성 → 근거리 전투) |
| `src/shaders.h` | GLSL 셰이더 전체 |
| `src/gfx.*` | 쿼드 배치, 메시 빌더, HDR 블룸 |
| `src/hud.cpp`, `src/audio.*` | HUD / 합성 사운드 |
