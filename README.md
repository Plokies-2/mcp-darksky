# mcp-darksky

한국의 밤하늘 촬영 조건을 구조화된 점수로 반환하는 MCP 서버입니다.

이 프로젝트는 단순히 "오늘 별이 보일까?"만 답하는 용도가 아니라, 구름, 달빛, 대기질, 결로 위험, 광해, 타깃 고도와 시간대별 흐름까지 함께 계산해서 AI가 실제 출사 판단에 바로 쓸 수 있는 형태로 결과를 돌려주는 것을 목표로 합니다.

`/install` 페이지는 가벼운 사용자 안내와 GPT Apps 연결용 랜딩 페이지입니다. MCP, API, 배포, 데이터 관련 개발자 정보는 이 README와 [`docs/hosting-and-data-sources.md`](C:\Users\song7\Desktop\school\2026-1\projects\mcp_darksky\docs\hosting-and-data-sources.md)에 모아둡니다.

## 빠른 시작

### 1. 의존성 설치

```bash
npm install
```

### 2. 로컬 MCP 실행

```bash
npm start
```

### 3. HTTP 서버 실행

```bash
npm run start:railway
```

## 이 MCP로 할 수 있는 일

- 오늘 밤 출사가 갈 만한지 판단
- 몇 시부터 몇 시까지가 가장 좋은지 확인
- 광각 은하수, 광각 야경, broadband deep-sky, narrowband deep-sky, star trail 용도별로 같은 밤을 다르게 해석
- 결로 위험, 달빛 간섭, 미세먼지/에어로졸, 바람 같은 감점 요인 확인
- 장소명으로 바로 조회
- 한국 기준의 추정 Bortle-like 광해 값 확인
- 먼 날짜는 과도한 정밀도 대신 `outlook` 모드로 요약

## 누구를 위한 프로젝트인가

### 일반 사용자와 초보자

예를 들어 이런 질문에 맞습니다.

- `내일 밤 안반데기에서 은하수 찍기 괜찮아?`
- `오늘 서울 근교에서 출사 가도 돼?`
- `몇 시가 제일 좋아?`

이 경우 AI는 MCP 결과를 읽고 다음처럼 설명할 수 있습니다.

- 오늘 밤이 갈 만한 밤인지
- 가장 좋은 시간대가 언제인지
- 점수가 깎이는 주요 이유가 무엇인지
- 초보자에게도 무난한지

### 숙련자

예를 들어 이런 용도에 맞습니다.

- 광각 은하수 / 광각 야경 / broadband deep-sky / narrowband deep-sky / star trail 비교
- 타깃 고도와 moon separation 확인
- 시간대별 score curve 확인
- 밤 전체가 아니라 "언제가 제일 좋은지" 판단

## 공개 엔드포인트 정책

이 저장소에서 안내하는 공개 주소는 개인 평가와 가벼운 대화형 테스트를 위한 용도로만 생각하는 편이 안전합니다.

- 공개 엔드포인트는 rate limit, 변경, 중단이 있을 수 있습니다.
- 가용성, 처리량, 장기 호환성, 운영 지원은 보장하지 않습니다.
- 반복 호출, 자동화, 팀 공유, 제품 연동, 넓은 활용을 계획한다면 공개 주소를 그대로 쓰기보다 직접 배포하는 것을 권장합니다.

현재 maintainer가 운영하는 인프라와 비용 구조를 전제로 하는 주소가 있을 수 있으므로, 실제 활용 단계에서는 본인 인프라로 옮기는 전제를 README에 두는 편이 적절합니다.

## Self-hosting 안내

다음 중 하나에 해당하면 직접 호스팅을 권장합니다.

- 다른 사람에게 지속적으로 공유하려는 경우
- 자동화나 반복 호출 워크로드가 있는 경우
- 제품, 서비스, 내부 도구에 통합하려는 경우
- 본인 사용량과 비용을 직접 관리해야 하는 경우

직접 호스팅 시에는 본인 인프라와 본인 API 키를 사용하세요.

권장 순서는 다음과 같습니다.

1. Node HTTP 서버를 로컬에서 먼저 확인합니다.
2. 필요한 환경 변수를 직접 설정합니다.
3. 광해 추정에 필요한 runtime artifact와 로컬 데이터를 준비합니다.
4. 테스트를 통과시킨 뒤 배포합니다.

## Third-party services and data

이 프로젝트는 외부 날씨, 지오코딩, 위성 야간조도 데이터를 함께 사용할 수 있습니다.

- Open-Meteo
- Kakao Local API
- NASA Black Marble 계열 데이터

이 저장소는 외부 제공자의 정책을 대신 해석하거나 보증하지 않습니다. 사용자는 각 제공자의 약관, 할당량, 출처 표기 요구사항, 허용 사용 범위를 직접 확인하고 준수해야 합니다.

특히 다음 원칙을 권장합니다.

- 공개 데모 주소를 넓게 재배포하지 말고, 실제 활용은 직접 호스팅을 기준으로 삼기
- 본인 Kakao API 키를 직접 발급하고 보안 설정을 관리하기
- 데이터 출처는 사실 그대로 표기하되, 제3자가 이 프로젝트를 승인하거나 보증하는 것처럼 보이게 쓰지 않기

관련 정리 문서는 [`docs/hosting-and-data-sources.md`](C:\Users\song7\Desktop\school\2026-1\projects\mcp_darksky\docs\hosting-and-data-sources.md)에 따로 두었습니다.

## No endorsement

README와 코드에서 언급하는 외부 서비스나 데이터 제공자 이름은 설명을 위한 것입니다. 이는 해당 제공자가 이 프로젝트를 승인, 후원, 보증한다는 뜻이 아닙니다.

## 주요 결과 필드

### 종합 점수

- `overall_score`
- `cloud_score`
- `transparency_score`
- `darkness_score`
- `dew_risk_score`
- `stability_score`
- `mode_score`

### 시간대 흐름

- `score_curve`
- `blocker_timeline`
- `window_rankings`
- `curve_summary`

즉, 이 MCP는 밤 전체를 한 점수로만 보지 않고, 시간대별로 언제 좋아지고 언제 나빠지는지까지 함께 반환합니다.

### 파생 판단

- `best_window`
- `mode_best_window`
- `mode_ready`
- `confidence`

### 천문 관련

- 천문박명 / 천문밤 계산
- 달 고도 / 달 조도 / 달 간섭
- 은하수 중심부 가시성
- 타깃 고도 / airmass
- moon-target separation

### 광해 추정

로컬 Black Marble 데이터 기반으로 다음 값을 계산합니다.

- `estimated_bortle_center`
- `estimated_bortle_range`
- `estimated_bortle_band`
- `equivalent_zenith_brightness_mpsas`
- 한국 내 밝기 / 어두움 percentile

## 입력 방식

### 1. 좌표 입력

- `latitude`
- `longitude`

### 2. 장소명 입력

- `place_query`

예:

- `안반데기마을`
- `육백마지기`
- `구룡령`

장소명 입력은 Kakao Local API를 사용해 좌표로 변환합니다.

### 3. 선택 입력

- `site_profile.bortle_class`
- `site_profile.elevation_m`
- `site_profile.near_water`
- `mode`
- `target`

## 촬영 모드

- `general`
- `wide_field_milky_way`
- `wide_field_nightscape`
- `broadband_deep_sky`
- `narrowband_deep_sky`
- `star_trail`

즉 같은 밤이어도 `광각 은하수에는 좋지만 broadband deep-sky에는 애매하다` 같은 해석이 가능합니다.

## MCP 도구

### `score_night_sky`

가까운 날짜에 대한 상세 점수 도구입니다.

- 시간대별 점수
- 최적 시간대
- 위험 요인
- 모드별 적합성
- 타깃 천문 정보

를 함께 반환합니다.

### `score_night_sky_outlook`

먼 날짜를 위한 요약 전망 도구입니다.

`+6일 이후`에는 지나치게 정밀한 시간대별 점수를 보여주는 대신 coarse outlook를 반환합니다.

### `estimate_light_pollution`

광해와 Bortle-like 추정 결과를 반환합니다.

### `describe_light_pollution_method`

광해 추정 방법론과 가정을 설명합니다.

### `describe_scoring_model`

점수 필드와 해석 규칙을 설명합니다.

### `score_night_sky_via_link`

설치 페이지, JSON API, MCP 주소 같은 공유용 링크를 반환합니다.

## 엔드포인트

- `/mcp`: MCP 연결
- `/api/score`: 상세 점수 API
- `/api/score-outlook`: 먼 날짜용 outlook API
- `/api/light-pollution`: 광해 추정 API
- `/api/light-pollution/method`: 방법론 API
- `/prompt`: MCP 설정 없이 쓰는 프롬프트 페이지
- `/prompt.txt`: plain text 프롬프트
- `/install`: 가벼운 설치 안내 및 GPT Apps 연결 페이지
- `/health`: 헬스 체크

## 날짜 정책

이 프로젝트는 "먼 날짜일수록 더 보수적으로 보자"는 원칙을 사용합니다.

- `0~5일`: 상세 점수 사용
- `6~15일`: `outlook` 경로로 유도

이유는 시간대별 점수와 대기질, 달빛, 광해 해석까지 포함한 결과를 먼 날짜에 그대로 주면 false precision이 커지기 때문입니다.

## 외부 API 실패 처리

Open-Meteo와 Kakao Local API 호출은 `초기 1회 + 재시도 최대 3회` 정책으로 동작합니다.

즉, 일시적인 5xx 또는 429 계열 문제는 곧바로 실패 처리하지 않고 짧게 재시도한 뒤, 그래도 실패하면 명시적으로 에러를 반환합니다.

## 환경 변수

- `PORT` 또는 `MCP_PORT`: Node HTTP 포트
- `HOST`: Node HTTP bind host, 기본값 `0.0.0.0`
- `PUBLIC_BASE_URL`: 외부에서 보이는 서비스 기본 URL
- `KAKAO_REST_API_KEY`: `place_query` 사용 시 필요
- `REST_API_KEY`: 로컬 호환용 alias
- `BLACK_MARBLE_RUNTIME_ARTIFACT_PATH`: runtime artifact 경로 override
- `BLACK_MARBLE_RUNTIME_ARTIFACT_URL`: Railway 부팅 시 runtime artifact 다운로드 URL
- `ALLOWED_HOSTS`: Node HTTP 허용 호스트 목록

참고:

- Railway처럼 `PORT`가 자동으로 주어지는 환경에서는 `npm start`가 자동으로 HTTP 서버 모드로 동작합니다.

## 로컬 데이터

광해 추정을 서버에서 직접 처리하려면 다음 로컬 데이터가 필요합니다.

- `data/VNP46A4/...`
- `data/VJ146A4/...`
- `data/black-marble-korea-runtime.npz`
- `data/black-marble-korea-distribution.json`

원본 타일은 용량이 크기 때문에 보통 Git 저장소 자체에는 포함하지 않는 편이 낫습니다.

## 개발

```bash
npm install
npm test
```

## 배포 전 체크리스트

1. 환경 변수를 설정합니다.
   - `PUBLIC_BASE_URL`
   - `KAKAO_REST_API_KEY`
   - 필요 시 `ALLOWED_HOSTS`
2. 로컬 데이터 존재 여부를 확인합니다.
   - `data/black-marble-korea-runtime.npz`
   - 필요 시 raw tile 및 distribution 파일
3. 테스트를 실행합니다.
   - `npm test`
4. 기본 동작을 확인합니다.
   - `/health`
   - `/api/score`
   - `/api/score-outlook`
   - `/mcp`
5. 사용자용 링크를 확인합니다.
   - `/install`

## 권장 배포 방식

현재 구조 기준으로는 `Railway` 같은 Node 컨테이너 인스턴스를 우선 추천합니다.

이유:

- Node 서버 흐름과 잘 맞음
- Python 광해 추정과 로컬 파일 구조를 같이 다루기 쉬움
- 운영자가 구조를 이해하고 유지하기 쉬움

기여 혼선을 줄이기 위해 현재 저장소는 Railway 기반 Node HTTP 배포만 기준으로 유지합니다.
